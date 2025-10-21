import { differenceInCalendarDays, isAfter, isBefore } from 'date-fns';

export const DEFAULT_LEGAL_INFO_URL =
  'https://www.kolzchut.org.il/he/%D7%97%D7%99%D7%A9%D7%95%D7%91_%D7%9E%D7%A1%D7%A4%D7%A8_%D7%99%D7%9E%D7%99_%D7%94%D7%97%D7%95%D7%A4%D7%A9%D7%94_%D7%94%D7%A9%D7%A0%D7%AA%D7%99%D7%AA';

export const DEFAULT_LEAVE_POLICY = {
  allow_half_day: false,
  allow_negative_balance: false,
  negative_floor_days: 0,
  carryover_enabled: false,
  carryover_max_days: 0,
  holiday_rules: [],
};

export const DEFAULT_LEAVE_PAY_POLICY = {
  default_method: 'legal',
  lookback_months: 3,
  legal_allow_12m_if_better: false,
  fixed_rate_default: null,
  legal_info_url: DEFAULT_LEGAL_INFO_URL,
};

export const TIME_ENTRY_LEAVE_PREFIX = 'time_entry_leave';

export const LEAVE_PAY_METHOD_OPTIONS = [
  {
    value: 'legal',
    title: 'חישוב חוקי (מומלץ)',
    description: 'שווי יום חופש לפי ממוצע שכר יומי בתקופת בדיקה',
  },
  {
    value: 'avg_hourly_x_avg_day_hours',
    title: 'ממוצע שכר שעתי × שעות ליום',
    description: 'מכפיל את ממוצע השכר השעתי במספר שעות העבודה היומיות הממוצעות בתקופה',
  },
  {
    value: 'fixed_rate',
    title: 'תעריף יומי קבוע',
    description: 'שווי יום חופשה לפי סכום קבוע במדיניות',
  },
];

export const LEAVE_PAY_METHOD_LABELS = LEAVE_PAY_METHOD_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.title;
  return acc;
}, {});

export const LEAVE_PAY_METHOD_DESCRIPTIONS = LEAVE_PAY_METHOD_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.description;
  return acc;
}, {});

const LEAVE_PAY_METHOD_VALUES = new Set(LEAVE_PAY_METHOD_OPTIONS.map(option => option.value));

const UNPAID_SUBTYPE_SET = new Set(['holiday_unpaid', 'vacation_unpaid']);
const MIXED_SUBTYPE_SET = new Set(['holiday', 'vacation']);

export const PAID_LEAVE_LABEL = 'חופשה בתשלום';
export const UNPAID_LEAVE_LABEL = 'חופשה ללא תשלום';
export const HALF_DAY_LEAVE_LABEL = 'חצי יום חופשה';
export const SYSTEM_PAID_LABEL_SUFFIX = ' (על חשבון המערכת)';

const LEAVE_HISTORY_TYPE_LABELS = {
  allocation: 'הקצאה',
  policy_allocation: 'הקצאה',
  manual_allocation: 'הקצאה',
  carryover: 'יתרת פתיחה',
  carry_in: 'יתרת פתיחה',
  carryforward: 'יתרת פתיחה',
  carry_forward: 'יתרת פתיחה',
  rollover: 'יתרת פתיחה',
  reinstatement: 'החזרת יתרה',
  accrual: 'צבירה',
  accrual_manual: 'צבירה',
  grant: 'הטבה',
  adjustment: 'התאמה ידנית',
  manual_adjustment: 'התאמה ידנית',
  adjustment_positive: 'התאמה ידנית',
  adjustment_negative: 'התאמה ידנית',
  correction: 'תיקון',
  correction_positive: 'תיקון',
  correction_negative: 'תיקון',
  deduction: 'ניכוי חופשה',
  usage: 'ניצול חופשה',
  usage_manual: 'ניצול חופשה',
  leave: 'ניצול חופשה',
  payout: 'פדיון חופשה',
  redemption: 'פדיון חופשה',
  cashout: 'פדיון חופשה',
  employee_paid: PAID_LEAVE_LABEL,
  system_paid: `${PAID_LEAVE_LABEL}${SYSTEM_PAID_LABEL_SUFFIX}`,
  holiday: 'חג',
  holiday_unpaid: UNPAID_LEAVE_LABEL,
  vacation_unpaid: UNPAID_LEAVE_LABEL,
  unpaid: UNPAID_LEAVE_LABEL,
  mixed: 'חופשה מעורבת',
  half_day: 'חצי יום חופשה',
};

const LEAVE_HISTORY_FALLBACK_LABEL = 'רישום לא מסווג';

export function formatLeaveTypeLabel(value, label) {
  if (value !== 'system_paid') {
    return label;
  }

  const safeLabel = typeof label === 'string' ? label.trim() : '';
  if (!safeLabel) {
    return `${PAID_LEAVE_LABEL}${SYSTEM_PAID_LABEL_SUFFIX}`;
  }

  if (safeLabel.includes('מערכת')) {
    return safeLabel;
  }

  return `${safeLabel}${SYSTEM_PAID_LABEL_SUFFIX}`;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'paid'].includes(normalized)) return true;
    if (['false', '0', 'no', 'unpaid'].includes(normalized)) return false;
  }
  return null;
}

function normalizeLeaveToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const prefixes = ['time_entry_leave_', 'usage_', 'leave_', 'policy_'];
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return trimmed;
}

export const LEAVE_TYPE_OPTIONS = [
  { value: 'employee_paid', label: PAID_LEAVE_LABEL },
  { value: 'system_paid', label: formatLeaveTypeLabel('system_paid', PAID_LEAVE_LABEL) },
  { value: 'holiday_unpaid', label: UNPAID_LEAVE_LABEL },
  { value: 'vacation_unpaid', label: UNPAID_LEAVE_LABEL },
  { value: 'mixed', label: 'מעורב' },
  { value: 'half_day', label: HALF_DAY_LEAVE_LABEL },
];

export const SYSTEM_PAID_ALERT_TEXT =
  'שימו לב: יום חופשה זה יירשם כחג ולא ינוכה ממכסת החופשה של העובד.';

export const HOLIDAY_TYPE_LABELS = LEAVE_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export const MIXED_SUBTYPE_OPTIONS = [
  { value: 'holiday', label: formatLeaveTypeLabel('system_paid', PAID_LEAVE_LABEL) },
  { value: 'vacation', label: PAID_LEAVE_LABEL },
];

export const MIXED_SUBTYPE_LABELS = MIXED_SUBTYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export const DEFAULT_MIXED_SUBTYPE = MIXED_SUBTYPE_OPTIONS[0]?.value || 'holiday';

export function normalizeMixedSubtype(value) {
  const normalized = normalizeLeaveToken(value);
  if (!normalized) return null;
  if (normalized.startsWith('holiday')) return 'holiday';
  if (normalized.startsWith('vacation')) return 'vacation';
  return MIXED_SUBTYPE_SET.has(normalized) ? normalized : null;
}

export function getLeaveSubtypeFromValue(value) {
  const normalized = normalizeLeaveToken(value);
  if (!normalized) return null;
  return UNPAID_SUBTYPE_SET.has(normalized) ? normalized : null;
}

export function getLeaveBaseKind(value) {
  const normalized = normalizeLeaveToken(value);
  if (!normalized) return null;
  if (UNPAID_SUBTYPE_SET.has(normalized)) {
    return 'unpaid';
  }
  return normalized;
}

export const LEAVE_ENTRY_TYPES = {
  system_paid: 'leave_system_paid',
  employee_paid: 'leave_employee_paid',
  unpaid: 'leave_unpaid',
  half_day: 'leave_half_day',
};

const ENTRY_TYPE_TO_KIND = {
  paid_leave: 'system_paid',
  leave_system_paid: 'system_paid',
  leave_employee_paid: 'employee_paid',
  leave_unpaid: 'vacation_unpaid',
  leave: 'vacation_unpaid',
  leave_half_day: 'half_day',
};

export function getLeaveKindFromEntryType(entryType) {
  if (Object.prototype.hasOwnProperty.call(ENTRY_TYPE_TO_KIND, entryType)) {
    return ENTRY_TYPE_TO_KIND[entryType];
  }

  return null;
}

export function getEntryTypeForLeaveKind(kind) {
  const base = getLeaveBaseKind(kind);
  return base ? (LEAVE_ENTRY_TYPES[base] || null) : null;
}

export function isLeaveEntryType(entryType) {
  return Boolean(getLeaveKindFromEntryType(entryType));
}

export function isPayableLeaveKind(kind) {
  const base = getLeaveBaseKind(kind);
  return base === 'system_paid' || base === 'employee_paid' || base === 'half_day';
}

export function getLeaveLedgerDelta(kind) {
  const base = getLeaveBaseKind(kind);
  if (base === 'employee_paid') return -1;
  if (base === 'half_day') return -0.5;
  return 0;
}

function extractSubtypeFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidates = [
    metadata?.leave?.subtype,
    metadata?.leave_subtype,
    metadata?.leaveSubtype,
    metadata?.leave?.type,
    metadata?.leave_type,
    metadata?.leaveType,
  ];
  for (const candidate of candidates) {
    const subtype = getLeaveSubtypeFromValue(candidate);
    if (subtype) return subtype;
  }
  return null;
}

export function inferLeaveSubtype(details = {}) {
  const direct = [
    details.leave_subtype,
    details.leaveSubtype,
    details.subtype,
  ];
  for (const candidate of direct) {
    const subtype = getLeaveSubtypeFromValue(candidate);
    if (subtype) return subtype;
  }
  const metadata = parseLeaveMetadata(details.metadata);
  const metaSubtype = extractSubtypeFromMetadata(metadata);
  if (metaSubtype) return metaSubtype;
  const typeCandidates = [
    details.leave_type,
    details.leaveType,
    details.leave_kind,
    details.leaveKind,
    metadata?.leave?.kind,
    metadata?.leave_kind,
    metadata?.leaveKind,
    metadata?.leave?.type,
    metadata?.leave_type,
  ];
  for (const candidate of typeCandidates) {
    const subtype = getLeaveSubtypeFromValue(candidate);
    if (subtype) return subtype;
  }
  return null;
}

export function inferLeaveKind(details = {}) {
  const directEntryKind = getLeaveKindFromEntryType(details.entry_type || details.entryType);
  if (directEntryKind) {
    return directEntryKind;
  }
  const subtype = inferLeaveSubtype(details);
  if (subtype) return 'unpaid';
  const metadata = parseLeaveMetadata(details.metadata);
  const candidates = [
    details.leave_kind,
    details.leaveKind,
    details.leave_type,
    details.leaveType,
    metadata?.leave?.kind,
    metadata?.leave_kind,
    metadata?.leaveKind,
    metadata?.leave?.type,
    metadata?.leave_type,
  ];
  for (const candidate of candidates) {
    const base = getLeaveBaseKind(candidate);
    if (base) return base;
  }
  return null;
}

export function inferLeaveType(details = {}) {
  const subtype = inferLeaveSubtype(details);
  if (subtype) return subtype;
  const base = inferLeaveKind(details);
  if (base === 'unpaid') {
    return 'vacation_unpaid';
  }
  return base;
}

export function parseMixedLeaveDetails(details = {}) {
  const metadata = parseLeaveMetadata(details.metadata);
  const entryKind = getLeaveKindFromEntryType(details.entry_type || details.entryType);
  const subtypeCandidates = [
    details.mixed_subtype,
    details.mixedSubtype,
    details.leave_subtype,
    details.leaveSubtype,
    metadata?.leave?.subtype,
    metadata?.leave_subtype,
    metadata?.leaveSubtype,
  ];
  let subtype = null;
  for (const candidate of subtypeCandidates) {
    const normalized = normalizeMixedSubtype(candidate);
    if (normalized) {
      subtype = normalized;
      break;
    }
  }
  const paidCandidates = [
    details.mixed_paid,
    details.mixedPaid,
    details.paid,
    details.payable,
    metadata?.leave?.mixed_paid,
    metadata?.leave?.paid,
    metadata?.leave?.payable,
  ];
  let paid = null;
  for (const candidate of paidCandidates) {
    const coerced = coerceBoolean(candidate);
    if (coerced !== null) {
      paid = coerced;
      break;
    }
  }
  const halfDayCandidates = [
    details.mixed_half_day,
    details.mixedHalfDay,
    details.half_day,
    details.halfDay,
    metadata?.leave?.half_day,
    metadata?.leave_half_day,
    metadata?.leaveHalfDay,
  ];
  let halfDay = entryKind === 'half_day' ? true : null;
  for (const candidate of halfDayCandidates) {
    const coerced = coerceBoolean(candidate);
    if (coerced !== null) {
      halfDay = coerced;
      break;
    }
  }
  if (paid === false) {
    halfDay = false;
  }
  return {
    subtype: subtype || null,
    paid: paid === null ? null : paid,
    halfDay: halfDay === null ? false : halfDay,
  };
}

function parseLeaveMetadata(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse leave metadata JSON', error);
    }
  }
  return null;
}

function coerceFiniteNumber(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

export function getLeaveValueMultiplier(details = {}) {
  const metadata = parseLeaveMetadata(details.metadata);
  const candidates = [
    details.leave_fraction,
    details.leaveFraction,
    details.fraction,
    metadata?.leave_fraction,
    metadata?.leaveFraction,
    metadata?.fraction,
  ];
  for (const candidate of candidates) {
    const num = coerceFiniteNumber(candidate);
    if (num !== null && num > 0) {
      return num;
    }
  }
  const kind = details.leave_kind ||
    details.leaveKind ||
    details.leave_type ||
    details.leaveType ||
    getLeaveKindFromEntryType(details.entry_type || details.entryType);
  if (kind === 'half_day') return 0.5;
  return 1;
}

export function getNegativeBalanceFloor(policy = {}) {
  const raw = Number(policy?.negative_floor_days ?? 0);
  if (Number.isNaN(raw)) return 0;
  return raw <= 0 ? raw : -Math.abs(raw);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfYear(year) {
  return new Date(year, 0, 1);
}

function endOfYear(year) {
  return new Date(year, 11, 31);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseMaybeNumber(value) {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function resolveDelta(entry = {}) {
  const candidates = [
    entry.balance,
    entry.days_delta,
    entry.delta_days,
    entry.delta,
    entry.amount,
    entry.days,
  ];
  for (const candidate of candidates) {
    const parsed = parseMaybeNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return 0;
}

function resolveDate(entry = {}) {
  return entry.date || entry.entry_date || entry.effective_date || entry.change_date || entry.created_at;
}

function normalizeDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    if (value.length >= 10) {
      return value.slice(0, 10);
    }
    const parsed = toDate(value);
    return parsed ? parsed.toISOString().slice(0, 10) : null;
  }
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

export function normalizeHolidayRule(rule) {
  if (!rule) return null;
  const id = rule.id || crypto.randomUUID?.() || `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const start = toDate(rule.start_date || rule.date || null);
  const end = toDate(rule.end_date || rule.date || null);
  const type = rule.type || 'employee_paid';
  return {
    id,
    name: rule.name || '',
    type,
    start_date: start ? start.toISOString().slice(0, 10) : null,
    end_date: end ? end.toISOString().slice(0, 10) : (start ? start.toISOString().slice(0, 10) : null),
    recurrence: rule.recurrence || null,
    half_day: rule.half_day || type === 'half_day',
    metadata: rule.metadata || null,
  };
}

export function normalizeLeavePolicy(value) {
  let policy = value;
  if (!policy) {
    policy = {};
  } else if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (error) {
      console.warn('Failed to parse leave policy JSON', error);
      policy = {};
    }
  }
  return {
    allow_half_day: Boolean(policy.allow_half_day),
    allow_negative_balance: Boolean(policy.allow_negative_balance),
    negative_floor_days: Number(policy.negative_floor_days || 0),
    carryover_enabled: Boolean(policy.carryover_enabled),
    carryover_max_days: Number(policy.carryover_max_days || 0),
    holiday_rules: Array.isArray(policy.holiday_rules)
      ? policy.holiday_rules.map(normalizeHolidayRule)
      : [],
  };
}

function sanitizeLeavePayMethod(value) {
  if (typeof value !== 'string') return DEFAULT_LEAVE_PAY_POLICY.default_method;
  const match = LEAVE_PAY_METHOD_OPTIONS.find(option => option.value === value);
  return match ? match.value : DEFAULT_LEAVE_PAY_POLICY.default_method;
}

export function normalizeLeavePayPolicy(value) {
  let policy = value;
  if (!policy) {
    policy = {};
  } else if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (error) {
      console.warn('Failed to parse leave pay policy JSON', error);
      policy = {};
    }
  }

  const lookbackCandidate = parseMaybeNumber(policy.lookback_months);
  const fixedRateCandidate = parseMaybeNumber(policy.fixed_rate_default);
  const legalInfoUrl = typeof policy.legal_info_url === 'string' ? policy.legal_info_url.trim() : '';

  return {
    default_method: sanitizeLeavePayMethod(policy.default_method),
    lookback_months:
      typeof lookbackCandidate === 'number' && lookbackCandidate > 0
        ? Math.round(lookbackCandidate)
        : DEFAULT_LEAVE_PAY_POLICY.lookback_months,
    legal_allow_12m_if_better: Boolean(policy.legal_allow_12m_if_better),
    fixed_rate_default:
      typeof fixedRateCandidate === 'number' && fixedRateCandidate >= 0
        ? fixedRateCandidate
        : DEFAULT_LEAVE_PAY_POLICY.fixed_rate_default,
    legal_info_url: legalInfoUrl || DEFAULT_LEGAL_INFO_URL,
  };
}

export function resolveLeavePayMethodContext(employee = null, policy = DEFAULT_LEAVE_PAY_POLICY) {
  const normalizedPolicy = normalizeLeavePayPolicy(policy);
  const defaultMethod = normalizedPolicy.default_method || DEFAULT_LEAVE_PAY_POLICY.default_method;
  const candidate = typeof employee?.leave_pay_method === 'string' ? employee.leave_pay_method : null;
  const hasOverride = Boolean(candidate && LEAVE_PAY_METHOD_VALUES.has(candidate));
  const method = hasOverride ? candidate : defaultMethod;
  return {
    method,
    lookback_months: normalizedPolicy.lookback_months,
    legal_allow_12m_if_better: Boolean(normalizedPolicy.legal_allow_12m_if_better),
    override_applied: Boolean(hasOverride && candidate !== defaultMethod),
  };
}

function ruleMatchesDate(rule, date) {
  if (!rule || !date) return false;
  const target = toDate(date);
  if (!target) return false;
  if (rule.recurrence === 'yearly') {
    const ruleStart = toDate(`${target.getFullYear()}-${rule.start_date.slice(5)}`);
    const ruleEnd = toDate(`${target.getFullYear()}-${rule.end_date.slice(5)}`);
    if (!ruleStart || !ruleEnd) return false;
    return !isBefore(target, ruleStart) && !isAfter(target, ruleEnd);
  }
  const start = toDate(rule.start_date);
  const end = toDate(rule.end_date);
  if (!start || !end) return false;
  return !isBefore(target, start) && !isAfter(target, end);
}

export function findHolidayForDate(policy = DEFAULT_LEAVE_POLICY, date = new Date()) {
  const normalized = normalizeLeavePolicy(policy);
  const rules = normalized.holiday_rules || [];
  for (const rule of rules) {
    if (ruleMatchesDate(rule, date)) {
      return {
        ...rule,
        label: HOLIDAY_TYPE_LABELS[rule.type] || rule.name,
      };
    }
  }
  return null;
}

function computeBaseQuotaForYear(employee, year) {
  const annual = Number(employee?.annual_leave_days || 0);
  if (!annual) return 0;
  const startDate = toDate(employee?.start_date);
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);
  if (startDate && startDate > yearEnd) return 0;
  if (!startDate || startDate < yearStart || startDate.getFullYear() < year) return annual;
  if (startDate.getFullYear() > year) return 0;
  const totalDays = isLeapYear(year) ? 366 : 365;
  const effectiveStart = startDate > yearStart ? startDate : yearStart;
  const remainingDays = differenceInCalendarDays(yearEnd, effectiveStart) + 1;
  if (remainingDays <= 0) return 0;
  const prorated = (annual * remainingDays) / totalDays;
  return Math.max(0, prorated);
}

function sumUsage(entries = []) {
  return entries.reduce((acc, entry) => {
    const delta = resolveDelta(entry);
    return delta < 0 ? acc + Math.abs(delta) : acc;
  }, 0);
}

function sumPositive(entries = []) {
  return entries.reduce((acc, entry) => {
    const delta = resolveDelta(entry);
    return delta > 0 ? acc + delta : acc;
  }, 0);
}

function collectEntriesForYear(employeeId, year, leaveBalances = [], options = {}) {
  const { upToDate = null } = options;
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);
  return leaveBalances.filter(entry => {
    if (entry.employee_id !== employeeId) return false;
    const rawDate = resolveDate(entry);
    const entryDate = toDate(rawDate);
    if (!entryDate) return false;
    if (entryDate < yearStart || entryDate > yearEnd) return false;
    if (upToDate && entryDate > upToDate) return false;
    return true;
  });
}

export function computeEmployeeLeaveSummary({
  employee,
  leaveBalances = [],
  policy = DEFAULT_LEAVE_POLICY,
  date = new Date(),
}) {
  const targetDate = toDate(date) || new Date();
  const normalizedPolicy = normalizeLeavePolicy(policy);
  if (!employee) {
    return {
      remaining: 0,
      used: 0,
      quota: 0,
      carryIn: 0,
      allocations: 0,
      adjustments: 0,
      year: targetDate.getFullYear(),
    };
  }
  const employeeStart = toDate(employee.start_date);
  if (employeeStart && targetDate < employeeStart) {
    return {
      remaining: 0,
      used: 0,
      quota: 0,
      carryIn: 0,
      allocations: 0,
      adjustments: 0,
      year: targetDate.getFullYear(),
    };
  }
  const year = targetDate.getFullYear();
  const startYear = employeeStart ? employeeStart.getFullYear() : year;
  let carry = 0;
  let lastSummary = {
    remaining: 0,
    used: 0,
    quota: 0,
    carryIn: 0,
    allocations: 0,
    adjustments: 0,
    year,
  };
  for (let currentYear = startYear; currentYear <= year; currentYear += 1) {
    const entries = collectEntriesForYear(employee.id, currentYear, leaveBalances, {
      upToDate: currentYear === year ? targetDate : null,
    });
    const baseQuota = computeBaseQuotaForYear(employee, currentYear);
    const usage = sumUsage(entries);
    const positiveAdjustments = sumPositive(entries);
    const totalDelta = entries.reduce((acc, entry) => acc + resolveDelta(entry), 0);
    const quotaWithCarry = baseQuota + carry;
    const balance = quotaWithCarry + totalDelta;
    if (currentYear === year) {
      lastSummary = {
        remaining: Number(balance.toFixed(3)),
        used: Number(usage.toFixed(3)),
        quota: Number(quotaWithCarry.toFixed(3)),
        carryIn: Number(carry.toFixed(3)),
        allocations: Number((baseQuota + positiveAdjustments).toFixed(3)),
        adjustments: Number(totalDelta.toFixed(3)),
        year,
      };
    } else if (normalizedPolicy.carryover_enabled) {
      const nextCarry = Math.max(0, Math.min(balance, normalizedPolicy.carryover_max_days || 0));
      carry = nextCarry;
    } else {
      carry = 0;
    }
  }
  return lastSummary;
}

export function projectBalanceAfterChange({
  employee,
  leaveBalances = [],
  policy = DEFAULT_LEAVE_POLICY,
  date = new Date(),
  delta,
}) {
  const summary = computeEmployeeLeaveSummary({ employee, leaveBalances, policy, date });
  const updated = summary.remaining + delta;
  return {
    ...summary,
    projectedRemaining: Number(updated.toFixed(3)),
  };
}

export function getLeaveLedgerEntryDelta(entry = {}) {
  return resolveDelta(entry);
}

export function getLeaveLedgerEntryDate(entry = {}) {
  return normalizeDateString(resolveDate(entry));
}

export function getLeaveLedgerEntryType(entry = {}) {
  const raw = entry.leave_type || entry.source || entry.type || entry.reason || null;
  return typeof raw === 'string' ? raw : null;
}

export function formatLeaveHistoryEntryType(entry = {}) {
  const rawType = getLeaveLedgerEntryType(entry);
  if (!rawType) {
    return LEAVE_HISTORY_FALLBACK_LABEL;
  }

  const normalizedToken = normalizeLeaveToken(rawType);
  const lookupToken = typeof normalizedToken === 'string' ? normalizedToken.toLowerCase() : null;

  if (lookupToken && LEAVE_HISTORY_TYPE_LABELS[lookupToken]) {
    return LEAVE_HISTORY_TYPE_LABELS[lookupToken];
  }

  if (lookupToken) {
    if (lookupToken.includes('half_day')) {
      return LEAVE_HISTORY_TYPE_LABELS.half_day;
    }
    if (lookupToken.includes('system_paid')) {
      return LEAVE_HISTORY_TYPE_LABELS.system_paid;
    }
    if (lookupToken.includes('employee_paid')) {
      return LEAVE_HISTORY_TYPE_LABELS.employee_paid;
    }
    if (lookupToken.includes('holiday_unpaid')) {
      return LEAVE_HISTORY_TYPE_LABELS.holiday_unpaid;
    }
    if (lookupToken.includes('holiday')) {
      return LEAVE_HISTORY_TYPE_LABELS.holiday;
    }
    if (lookupToken.includes('vacation_unpaid')) {
      return LEAVE_HISTORY_TYPE_LABELS.vacation_unpaid;
    }
    if (lookupToken.includes('vacation') || lookupToken.includes('unpaid')) {
      return LEAVE_HISTORY_TYPE_LABELS.vacation_unpaid;
    }
    if (lookupToken.startsWith('carry')) {
      return LEAVE_HISTORY_TYPE_LABELS.carryover;
    }
    if (lookupToken.includes('allocation')) {
      return LEAVE_HISTORY_TYPE_LABELS.allocation;
    }
    if (lookupToken.includes('adjustment') || lookupToken.includes('correction')) {
      return LEAVE_HISTORY_TYPE_LABELS.adjustment;
    }
    if (lookupToken.includes('payout') || lookupToken.includes('redemption') || lookupToken.includes('cashout')) {
      return LEAVE_HISTORY_TYPE_LABELS.payout;
    }
    if (lookupToken.includes('usage') || lookupToken.includes('deduction') || lookupToken === 'leave') {
      return LEAVE_HISTORY_TYPE_LABELS.usage;
    }
    if (lookupToken.includes('mixed')) {
      return LEAVE_HISTORY_TYPE_LABELS.mixed;
    }
  }

  const baseKind = getLeaveBaseKind(lookupToken || rawType);
  if (baseKind) {
    const normalizedBase = baseKind.toLowerCase();
    if (LEAVE_HISTORY_TYPE_LABELS[normalizedBase]) {
      return LEAVE_HISTORY_TYPE_LABELS[normalizedBase];
    }
    if (normalizedBase.includes('half_day')) {
      return LEAVE_HISTORY_TYPE_LABELS.half_day;
    }
    if (normalizedBase.includes('system_paid')) {
      return LEAVE_HISTORY_TYPE_LABELS.system_paid;
    }
    if (normalizedBase.includes('employee_paid')) {
      return LEAVE_HISTORY_TYPE_LABELS.employee_paid;
    }
  }

  return typeof rawType === 'string' ? rawType : LEAVE_HISTORY_FALLBACK_LABEL;
}
