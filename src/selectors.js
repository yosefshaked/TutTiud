import { sumHourlyHours } from './lib/payroll.js';
import { sanitizeEmploymentScopeFilter, getEmploymentScopeValue } from '@/constants/employment-scope.js';
import {
  DEFAULT_LEAVE_POLICY,
  DEFAULT_LEAVE_PAY_POLICY,
  LEAVE_PAY_METHOD_OPTIONS,
  findHolidayForDate,
  computeEmployeeLeaveSummary,
  normalizeLeavePolicy,
  normalizeLeavePayPolicy,
} from './lib/leave.js';

const VALID_LEAVE_PAY_METHODS = new Set(LEAVE_PAY_METHOD_OPTIONS.map(option => option.value));
const WORK_ENTRY_TYPES = new Set(['hours', 'session']);

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function coerceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function resolveDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function subtractMonths(date, months) {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  next.setMonth(next.getMonth() - months);
  return next;
}

function getLookbackRange(target, months) {
  const end = new Date(target.getTime());
  end.setHours(23, 59, 59, 999);
  const start = subtractMonths(end, months);
  return { start, end };
}

function buildServicesMap(services = []) {
  return new Map(Array.isArray(services) ? services.filter(s => s && s.id).map(service => [service.id, service]) : []);
}

function resolveHoursForRow(row, servicesById) {
  const rawHours = coerceNumber(row?.hours);
  if (!Number.isNaN(rawHours) && rawHours > 0) {
    return rawHours;
  }
  if ((row?.entry_type || '') !== 'session') {
    return 0;
  }
  const service = servicesById.get(row?.service_id);
  if (!service || !service.duration_minutes) return 0;
  const sessions = coerceNumber(row?.sessions_count);
  if (Number.isNaN(sessions) || sessions <= 0) return 0;
  return (service.duration_minutes / 60) * sessions;
}

function aggregateEmployeeHistory({
  employeeId,
  workSessions = [],
  services = [],
  start,
  end,
}) {
  const servicesById = buildServicesMap(services);
  const result = {
    totalEarnings: 0,
    totalHours: 0,
    workedDays: new Set(),
  };

  if (!employeeId || !Array.isArray(workSessions)) {
    return result;
  }

  for (const row of workSessions) {
    if (!row || row.deleted) continue;
    if (row.employee_id !== employeeId) continue;
    const entryDate = toDate(row.date);
    if (!entryDate) continue;
    if (entryDate < start || entryDate > end) continue;
    if (row.payable === false) continue;
    const entryType = row.entry_type || '';
    if (!WORK_ENTRY_TYPES.has(entryType)) continue;

    const amount = coerceNumber(row.total_payment);
    if (!Number.isNaN(amount)) {
      result.totalEarnings += amount;
    }

    const hours = resolveHoursForRow(row, servicesById);
    if (hours > 0) {
      result.totalHours += hours;
    }

    if (hours > 0 || (!Number.isNaN(amount) && amount !== 0)) {
      result.workedDays.add(resolveDateKey(entryDate));
    }
  }

  return result;
}

function sanitizeMethod(method, fallback) {
  if (typeof method === 'string' && VALID_LEAVE_PAY_METHODS.has(method)) {
    return method;
  }
  return fallback;
}

function parsePositiveNumber(value) {
  const parsed = coerceNumber(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

function resolveLeavePayPolicy({ leavePayPolicy, settings } = {}) {
  if (leavePayPolicy) {
    return normalizeLeavePayPolicy(leavePayPolicy);
  }
  if (settings) {
    if (settings.leave_pay_policy) {
      return normalizeLeavePayPolicy(settings.leave_pay_policy);
    }
    if (Array.isArray(settings)) {
      const record = settings.find(item => item && item.key === 'leave_pay_policy');
      if (record) {
        const candidate = record.settings_value ?? record.value ?? record.leave_pay_policy;
        return normalizeLeavePayPolicy(candidate);
      }
    }
  }
  return DEFAULT_LEAVE_PAY_POLICY;
}

function computeDailyValue({
  method,
  months,
  employeeId,
  targetDate,
  workSessions,
  services,
}) {
  const safeMonths = Math.max(1, Math.round(months || 0));
  const { start, end } = getLookbackRange(targetDate, safeMonths);
  const history = aggregateEmployeeHistory({ employeeId, workSessions, services, start, end });
  const workedDaysCount = history.workedDays.size;
  if (!workedDaysCount || history.totalEarnings <= 0) {
    return { value: 0, totals: history };
  }
  if (method === 'avg_hourly_x_avg_day_hours') {
    if (!history.totalHours || history.totalHours <= 0) {
      return { value: 0, totals: history };
    }
    const avgHourly = history.totalEarnings / history.totalHours;
    const avgDayHours = history.totalHours / workedDaysCount;
    return { value: avgHourly * avgDayHours, totals: history };
  }
  return { value: history.totalEarnings / workedDaysCount, totals: history };
}

function logInsufficientData(method, employeeId, details) {
  const env = typeof globalThis !== 'undefined' && globalThis.process
    ? globalThis.process.env?.NODE_ENV
    : undefined;
  if (env === 'production') {
    return;
  }
  const workedDaysCount = details?.workedDays instanceof Set
    ? details.workedDays.size
    : details?.workedDaysCount || details?.workedDays || 0;
  const payload = {
    method,
    employeeId,
    totalEarnings: details?.totalEarnings || 0,
    totalHours: details?.totalHours || 0,
    workedDays: workedDaysCount,
  };
  if (typeof console !== 'undefined') {
    if (typeof console.debug === 'function') {
      console.debug('selectLeaveDayValue: insufficient data', payload);
    } else if (typeof console.log === 'function') {
      console.log('selectLeaveDayValue: insufficient data', payload);
    }
  }
}

function entryMatchesFilters(row, emp, filters = {}) {
  if (!row || row.deleted) return false;
  const {
    dateFrom,
    dateTo,
    selectedEmployee,
    employeeType = 'all',
    serviceId = 'all',
    employmentScopes = [],
  } = filters;
  if (dateFrom && new Date(row.date) < new Date(dateFrom)) return false;
  if (dateTo && new Date(row.date) > new Date(dateTo)) return false;
  if (selectedEmployee && row.employee_id !== selectedEmployee) return false;
  if (employeeType !== 'all' && emp.employee_type !== employeeType) return false;
  if (serviceId !== 'all' && row.service_id !== serviceId) return false;
  const normalizedScopes = sanitizeEmploymentScopeFilter(employmentScopes);
  if (normalizedScopes.length > 0) {
    const scopeValue = getEmploymentScopeValue(emp);
    if (!normalizedScopes.includes(scopeValue)) return false;
  }
  return true;
}

export function selectHourlyHours(entries = [], employees = [], filters = {}) {
  return sumHourlyHours(entries, employees, filters);
}

export function selectMeetingHours(entries = [], services = [], employees = [], filters = {}) {
  const byId = Object.fromEntries(employees.map(e => [e.id, e]));
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s]));
  return entries.reduce((sum, row) => {
    if (!row || row.deleted) return sum;
    const emp = byId[row.employee_id];
    if (!emp || emp.employee_type !== 'instructor') return sum;
    if (!entryMatchesFilters(row, emp, filters)) return sum;
    if (row.entry_type !== 'session') return sum;
    if (row.hours != null) return sum + (parseFloat(row.hours) || 0);
    const service = serviceMap[row.service_id];
    if (service && service.duration_minutes) {
      return sum + (service.duration_minutes / 60) * (row.sessions_count || 0);
    }
    switch (row.session_type) {
      case 'session_30':
        return sum + 0.5 * (row.sessions_count || 0);
      case 'session_45':
        return sum + 0.75 * (row.sessions_count || 0);
      case 'session_150':
        return sum + 2.5 * (row.sessions_count || 0);
      default:
        return sum;
    }
  }, 0);
}

export function selectGlobalHours(entries = [], employees = [], filters = {}) {
  const byId = Object.fromEntries(employees.map(e => [e.id, e]));
  return entries.reduce((sum, row) => {
    if (!row || row.deleted) return sum;
    const emp = byId[row.employee_id];
    if (!emp || emp.employee_type !== 'global') return sum;
    if (!entryMatchesFilters(row, emp, filters)) return sum;
    if (row.entry_type !== 'hours') return sum;
    return sum + (parseFloat(row.hours) || 0);
  }, 0);
}

export function selectTotalHours(entries = [], services = [], employees = [], filters = {}) {
  return (
    selectHourlyHours(entries, employees, filters) +
    selectMeetingHours(entries, services, employees, filters) +
    selectGlobalHours(entries, employees, filters)
  );
}

export function selectHolidayForDate(policy = DEFAULT_LEAVE_POLICY, date = new Date()) {
  return findHolidayForDate(normalizeLeavePolicy(policy), date);
}

export function selectLeaveRemaining(
  employeeId,
  date = new Date(),
  {
    employees = [],
    leaveBalances = [],
    policy = DEFAULT_LEAVE_POLICY,
  } = {},
) {
  const employee = employees.find(emp => emp.id === employeeId);
  if (!employee) {
    return {
      remaining: 0,
      used: 0,
      quota: 0,
      carryIn: 0,
      allocations: 0,
      adjustments: 0,
      year: new Date(date).getFullYear(),
    };
  }
  return computeEmployeeLeaveSummary({
    employee,
    leaveBalances,
    policy,
    date,
  });
}

export function selectLeaveDayValue(
  employeeId,
  date = new Date(),
  {
    employees = [],
    workSessions = [],
    services = [],
    leavePayPolicy = null,
    settings = null,
    collectDiagnostics = false,
  } = {},
) {
  const targetDate = toDate(date) || new Date();
  const employee = employees.find(emp => emp && emp.id === employeeId) || null;
  const policy = resolveLeavePayPolicy({ leavePayPolicy, settings });
  const fallbackMethod = policy.default_method || DEFAULT_LEAVE_PAY_POLICY.default_method;
  const method = sanitizeMethod(employee?.leave_pay_method, fallbackMethod);
  const emptyDiagnostics = { totalEarnings: 0, totalHours: 0, workedDays: new Set() };

  const normalizeDiagnostics = (raw) => ({
    totalEarnings: raw?.totalEarnings || 0,
    totalHours: raw?.totalHours || 0,
    workedDaysCount: raw?.workedDays instanceof Set
      ? raw.workedDays.size
      : raw?.workedDaysCount || raw?.workedDays || 0,
  });

  const buildResult = (value, { diagnostics = null, insufficient = false, preStartDate = false } = {}) => {
    if (collectDiagnostics) {
      return {
        value,
        insufficientData: Boolean(insufficient),
        method,
        diagnostics: normalizeDiagnostics(diagnostics),
        preStartDate: Boolean(preStartDate),
      };
    }
    return value;
  };

  const startDateStr = typeof employee?.start_date === 'string' && employee.start_date.length >= 10
    ? employee.start_date.slice(0, 10)
    : null;
  const targetKey = resolveDateKey(targetDate);
  if (startDateStr && targetKey < startDateStr) {
    return buildResult(0, { diagnostics: emptyDiagnostics, preStartDate: true });
  }

  if (method === 'fixed_rate') {
    const employeeRate = parsePositiveNumber(
      employee?.leave_fixed_day_rate ?? employee?.fixed_day_rate,
    );
    if (employeeRate !== null) {
      return buildResult(employeeRate, { diagnostics: emptyDiagnostics });
    }
    const policyRate = parsePositiveNumber(policy.fixed_rate_default);
    if (policyRate !== null) {
      return buildResult(policyRate, { diagnostics: emptyDiagnostics });
    }
    logInsufficientData(method, employeeId, emptyDiagnostics);
    return buildResult(0, { diagnostics: emptyDiagnostics, insufficient: true });
  }

  const sessions = Array.isArray(workSessions) ? workSessions : (Array.isArray(settings?.workSessions) ? settings.workSessions : []);
  const activeSessions = sessions.filter(item => item && !item.deleted);
  const months = policy.lookback_months || DEFAULT_LEAVE_PAY_POLICY.lookback_months;
  const base = computeDailyValue({
    method,
    months,
    employeeId,
    targetDate,
    workSessions: activeSessions,
    services,
  });

  let bestValue = base.value;
  let diagnostics = base.totals;

  if (method === 'legal' && policy.legal_allow_12m_if_better) {
    const twelveMonth = computeDailyValue({
      method,
      months: 12,
      employeeId,
      targetDate,
      workSessions: sessions,
      services,
    });
    if (twelveMonth.value > bestValue) {
      bestValue = twelveMonth.value;
      diagnostics = twelveMonth.totals;
    }
  }

  if (!bestValue || bestValue <= 0) {
    logInsufficientData(method, employeeId, diagnostics);
    return buildResult(0, { diagnostics, insufficient: true });
  }

  return buildResult(bestValue, { diagnostics });
}

