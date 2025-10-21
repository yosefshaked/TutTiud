import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "../components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { BarChart3, Download, TrendingUp } from "lucide-react";
import CombinedHoursCard from "@/components/dashboard/CombinedHoursCard.jsx";
import { selectHourlyHours, selectMeetingHours, selectGlobalHours, selectLeaveDayValue } from "@/selectors.js";
import { format, startOfMonth, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabase } from '@/context/SupabaseContext.jsx';

import ReportsFilters from "../components/reports/ReportsFilters";
import { parseDateStrict, toISODateString, isValidRange, isFullMonthRange } from '@/lib/date.js';
import { toast } from 'sonner';
import DetailedEntriesReport from "../components/reports/DetailedEntriesReport";
import MonthlyReport from "../components/reports/MonthlyReport";
import PayrollSummary from "../components/reports/PayrollSummary";
import ChartsOverview from "../components/reports/ChartsOverview";
import { computePeriodTotals, createLeaveDayValueResolver, resolveLeaveSessionValue } from '@/lib/payroll.js';
import {
  DEFAULT_LEAVE_POLICY,
  DEFAULT_LEAVE_PAY_POLICY,
  normalizeLeavePolicy,
  normalizeLeavePayPolicy,
  isLeaveEntryType,
  getLeaveKindFromEntryType,
  HOLIDAY_TYPE_LABELS,
} from '@/lib/leave.js';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLeavePolicySettings, fetchLeavePayPolicySettings, fetchEmploymentScopePolicySettings } from '@/lib/settings-client.js';
import {
  EMPLOYMENT_SCOPE_OPTIONS,
  EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES,
  normalizeEmploymentScopePolicy,
  sanitizeEmploymentScopeFilter,
  getEmploymentScopeValue,
} from '@/constants/employment-scope.js';
import { getEmploymentScopeLabel } from '@/lib/translations.js';
import { fetchEmployeesList } from '@/api/employees.js';
import { fetchWorkSessions } from '@/api/work-sessions.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

const EMPLOYEE_TYPE_LABELS = Object.freeze({
  hourly: 'שעתי',
  global: 'גלובלי',
  instructor: 'מדריך',
});

const ENTRY_TYPE_LABELS = Object.freeze({
  hours: 'שעות',
  session: 'מפגש',
  adjustment: 'התאמה',
});

const CSV_HEADERS = [
  'שם העובד',
  'מספר עובד',
  'סוג עובד',
  'היקף משרה',
  'תאריך',
  'יום בשבוע',
  'סוג רישום',
  'תיאור / שירות',
  'שעות',
  'מספר מפגשים',
  'מספר תלמידים',
  'תעריף',
  'סה"כ לתשלום',
  'הערות',
];

function parseSessionDate(value) {
  if (!value) {
    return null;
  }
  const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatNumeric(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }
  return numericValue.toFixed(2);
}

function formatHoursValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }
  return numericValue % 1 === 0 ? String(numericValue) : numericValue.toFixed(2);
}

function escapeCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildCsvRows({ sessions, employees, services }) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const employeeMap = new Map(Array.isArray(employees) ? employees.map(employee => [employee.id, employee]) : []);
  const serviceMap = new Map(Array.isArray(services) ? services.map(service => [service.id, service]) : []);

  return [...sessions]
    .sort((a, b) => {
      const first = parseSessionDate(a?.date)?.getTime() || 0;
      const second = parseSessionDate(b?.date)?.getTime() || 0;
      return first - second;
    })
    .map((session) => {
      const employee = employeeMap.get(session.employee_id) || null;
      const employeeName = employee?.name || 'לא ידוע';
      const employeeNumber = employee?.employee_id || '';
      const employeeType = employee?.employee_type || '';
      const employeeTypeLabel = employeeType
        ? (EMPLOYEE_TYPE_LABELS[employeeType] || 'לא ידוע')
        : '';

      const employmentScopeValue = getEmploymentScopeValue(employee);
      const employmentScopeLabel = employmentScopeValue
        ? getEmploymentScopeLabel(employmentScopeValue)
        : '';

      const parsedDate = parseSessionDate(session.date);
      const formattedDate = parsedDate
        ? format(parsedDate, 'dd/MM/yyyy')
        : '';
      const dayOfWeek = parsedDate
        ? format(parsedDate, 'EEEE', { locale: he })
        : '';

      const entryType = session?.entry_type || '';
      const isLeave = isLeaveEntryType(entryType);
      const leaveKind = isLeave ? getLeaveKindFromEntryType(entryType) : null;
      const leaveLabel = leaveKind ? (HOLIDAY_TYPE_LABELS[leaveKind] || 'חופשה') : '';

      const entryTypeLabel = isLeave
        ? leaveLabel
        : (ENTRY_TYPE_LABELS[entryType] || (entryType ? 'רישום אחר' : ''));

      let description = 'עבודה שעתית';
      if (isLeave) {
        description = leaveLabel;
      } else if (entryType === 'session') {
        const serviceName = serviceMap.get(session.service_id)?.name || 'שירות לא ידוע';
        description = serviceName;
      }

      const isHourlyOrGlobal = employeeType === 'hourly' || employeeType === 'global';
      const hours = isHourlyOrGlobal && entryType === 'hours'
        ? formatHoursValue(session.hours)
        : '';

      const sessionsCount = entryType === 'session'
        ? (session.sessions_count ?? '')
        : '';

      const studentsCount = entryType === 'session'
        ? (session.students_count ?? '')
        : '';

      const rate = formatNumeric(session.rate_used);
      const totalPayment = formatNumeric(session.total_payment);

      const notes = session?.notes || '';

      return {
        'שם העובד': employeeName,
        'מספר עובד': employeeNumber,
        'סוג עובד': employeeTypeLabel,
        'היקף משרה': employmentScopeLabel,
        'תאריך': formattedDate,
        'יום בשבוע': dayOfWeek,
        'סוג רישום': entryTypeLabel,
        'תיאור / שירות': description,
        'שעות': hours,
        'מספר מפגשים': sessionsCount,
        'מספר תלמידים': studentsCount,
        'תעריף': rate,
        'סה"כ לתשלום': totalPayment,
        'הערות': notes,
      };
    });
}

function shouldDisplayEmploymentScope({ employeeTypeFilter, enabledTypes, isLoading }) {
  if (isLoading) {
    return false;
  }
  const normalizedTypes = Array.isArray(enabledTypes) ? enabledTypes : [];
  if (normalizedTypes.length === 0) {
    return false;
  }
  if (!employeeTypeFilter || employeeTypeFilter === 'all') {
    return true;
  }
  return normalizedTypes.includes(employeeTypeFilter);
}

const getLedgerTimestamp = (entry = {}) => {
  const raw = entry.date || entry.entry_date || entry.effective_date || entry.change_date || entry.created_at;
  if (!raw) return 0;
  const parsed = new Date(raw);
  const value = parsed.getTime();
  return Number.isNaN(value) ? 0 : value;
};

const sortLeaveLedger = (entries = []) => {
  return [...entries].sort((a, b) => getLedgerTimestamp(a) - getLedgerTimestamp(b));
};

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [workSessions, setWorkSessions] = useState([]);
  const [services, setServices] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [totals, setTotals] = useState({
    totalPay: 0,
    totalHours: 0,
    totalSessions: 0,
    totalsByEmployee: [],
    diagnostics: { uniquePaidDays: 0, paidLeaveDays: 0, adjustmentsSum: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation(); // מאפשר לנו לגשת למידע על הכתובת הנוכחית
  const [activeTab, setActiveTab] = useState(location.state?.openTab || "overview");
  const [rateHistories, setRateHistories] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState(DEFAULT_LEAVE_POLICY);
  const [leavePayPolicy, setLeavePayPolicy] = useState(DEFAULT_LEAVE_PAY_POLICY);
  const [employmentScopeEnabledTypes, setEmploymentScopeEnabledTypes] = useState(() => [...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
  const [isEmploymentScopePolicyLoading, setIsEmploymentScopePolicyLoading] = useState(false);
  const [employmentScopePolicyError, setEmploymentScopePolicyError] = useState('');
  const { tenantClientReady, activeOrgHasConnection, activeOrgId } = useOrg();
  const { authClient, user, loading, session } = useSupabase();

  const getRateForDate = (employeeId, date, serviceId = null) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return { rate: 0, reason: 'אין עובד כזה' };

    const targetServiceId = (employee.employee_type === 'hourly' || employee.employee_type === 'global')
      ? GENERIC_RATE_SERVICE_ID
      : serviceId;

    const dateStr = format(new Date(date), 'yyyy-MM-dd');

    if (employee.start_date && employee.start_date > dateStr) {
      return { rate: 0, reason: 'לא התחילו לעבוד עדיין' };
    }

    const relevantRates = rateHistories
      .filter(r =>
        r.employee_id === employeeId &&
        r.service_id === targetServiceId &&
        r.effective_date <= dateStr
      )
      .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));

    if (relevantRates.length > 0) {
      return {
        rate: relevantRates[0].rate,
        effectiveDate: relevantRates[0].effective_date
      };
    }

    return { rate: 0, reason: 'לא הוגדר תעריף' };
  };

  const [filters, setFilters] = useState({
    selectedEmployee: '',
    dateFrom: format(startOfMonth(new Date()), 'dd/MM/yyyy'),
    dateTo: format(new Date(), 'dd/MM/yyyy'),
    employeeType: 'all',
    serviceId: 'all',
    employmentScopes: [],
  });
  const lastValid = useRef({ dateFrom: format(startOfMonth(new Date()), 'dd/MM/yyyy'), dateTo: format(new Date(), 'dd/MM/yyyy') });

  const sanitizedEmploymentScopes = useMemo(
    () => sanitizeEmploymentScopeFilter(filters.employmentScopes),
    [filters.employmentScopes],
  );

  const showEmploymentScopeUi = shouldDisplayEmploymentScope({
    employeeTypeFilter: filters.employeeType,
    enabledTypes: employmentScopeEnabledTypes,
    isLoading: isEmploymentScopePolicyLoading,
  });

  const effectiveEmploymentScopeFilter = useMemo(
    () => (showEmploymentScopeUi ? sanitizedEmploymentScopes : []),
    [showEmploymentScopeUi, sanitizedEmploymentScopes],
  );

  const handleDateBlur = (key, value) => {
    const res = parseDateStrict(value);
    if (res.ok) {
      lastValid.current[key] = value;
    } else {
      toast('תאריך לא תקין. השתמש/י בפורמט DD/MM/YYYY.');
      setFilters(prev => ({ ...prev, [key]: lastValid.current[key] }));
    }
  };

  const applyFilters = useCallback(() => {
    const fromRes = parseDateStrict(filters.dateFrom);
    const toRes = parseDateStrict(filters.dateTo);
    if (!fromRes.ok || !toRes.ok) {
      setFilteredSessions([]);
      setTotals({
        totalPay: 0,
        totalHours: 0,
        totalSessions: 0,
        totalsByEmployee: [],
        diagnostics: { uniquePaidDays: 0, paidLeaveDays: 0, adjustmentsSum: 0 }
      });
      return;
    }
    if (!isValidRange(fromRes.date, toRes.date)) {
      toast("טווח תאריכים לא תקין (תאריך 'עד' לפני 'מ')");
      setFilteredSessions([]);
      setTotals({
        totalPay: 0,
        totalHours: 0,
        totalSessions: 0,
        totalsByEmployee: [],
        diagnostics: { uniquePaidDays: 0, paidLeaveDays: 0, adjustmentsSum: 0 }
      });
      return;
    }
    const res = computePeriodTotals({
      workSessions,
      employees,
      services,
      startDate: toISODateString(fromRes.date),
      endDate: toISODateString(toRes.date),
      serviceFilter: filters.serviceId,
      employeeFilter: filters.selectedEmployee,
      employeeTypeFilter: filters.employeeType,
      employmentScopeFilter: effectiveEmploymentScopeFilter,
      leavePayPolicy,
      leaveDayValueSelector: selectLeaveDayValue,
    });
    const sourceSessions = Array.isArray(res.filteredSessions) ? res.filteredSessions : [];
    const resolveLeaveValue = createLeaveDayValueResolver({
      employees,
      workSessions,
      services,
      leavePayPolicy,
      leaveDayValueSelector: selectLeaveDayValue,
    });
    const adjustedSessions = sourceSessions.map(session => {
      if (!session || session.payable === false) return session;
      const employee = employees.find(emp => emp.id === session.employee_id);
      if (!employee || employee.employee_type === 'global') return session;
      if (!isLeaveEntryType(session.entry_type)) return session;
      const { amount, preStartDate } = resolveLeaveSessionValue(session, resolveLeaveValue, { employee });
      if (preStartDate) {
        return { ...session, total_payment: 0 };
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return session;
      return { ...session, total_payment: amount };
    });
    const toNumber = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    const adjustmentsAccumulator = adjustedSessions.reduce((acc, session) => {
      if (!session || session.entry_type !== 'adjustment') return acc;
      const value = toNumber(session.total_payment);
      acc.total += value;
      const previous = acc.byEmployee.get(session.employee_id) || 0;
      acc.byEmployee.set(session.employee_id, previous + value);
      return acc;
    }, { total: 0, byEmployee: new Map() });

    const adjustmentsTotal = adjustmentsAccumulator.total;
    const adjustmentsByEmployee = adjustmentsAccumulator.byEmployee;

    const correctedTotalPay = adjustedSessions.reduce((sum, session) => {
      if (!session) return sum;
      return sum + toNumber(session.total_payment);
    }, 0);

    const updatedTotalsByEmployee = Array.isArray(res.totalsByEmployee)
      ? res.totalsByEmployee.map(entry => {
        if (!entry) return entry;
        const safePay = toNumber(entry.pay);
        const previousAdjustment = toNumber(entry.adjustments);
        if (!adjustmentsByEmployee.has(entry.employee_id)) {
          if (safePay === entry.pay && previousAdjustment === entry.adjustments) {
            return entry;
          }
          return {
            ...entry,
            pay: safePay,
            adjustments: previousAdjustment
          };
        }
        const nextAdjustment = adjustmentsByEmployee.get(entry.employee_id);
        return {
          ...entry,
          pay: safePay - previousAdjustment + nextAdjustment,
          adjustments: nextAdjustment
        };
      })
      : [];

    const updatedDiagnostics = {
      ...(res.diagnostics || {}),
      adjustmentsSum: adjustmentsTotal
    };

    setFilteredSessions(adjustedSessions);
    setTotals({
      totalPay: correctedTotalPay,
      totalHours: toNumber(res.totalHours),
      totalSessions: toNumber(res.totalSessions),
      totalsByEmployee: updatedTotalsByEmployee,
      diagnostics: updatedDiagnostics
    });
  }, [workSessions, employees, services, filters, leavePayPolicy, effectiveEmploymentScopeFilter]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    if (!session || !activeOrgId || !activeOrgHasConnection) {
      setEmploymentScopeEnabledTypes([...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
      setEmploymentScopePolicyError('');
      setIsEmploymentScopePolicyLoading(false);
      return;
    }

    const abortController = new AbortController();
    let isMounted = true;

    const loadEmploymentScopePolicy = async () => {
      setIsEmploymentScopePolicyLoading(true);
      setEmploymentScopePolicyError('');
      try {
        const response = await fetchEmploymentScopePolicySettings({
          session,
          orgId: activeOrgId,
          signal: abortController.signal,
        });
        if (!isMounted) {
          return;
        }
        const normalized = normalizeEmploymentScopePolicy(response?.value);
        setEmploymentScopeEnabledTypes(normalized.enabledTypes);
      } catch (policyError) {
        if (abortController.signal.aborted) {
          return;
        }
        console.error('Failed to fetch employment scope policy', policyError);
        setEmploymentScopeEnabledTypes([...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
        setEmploymentScopePolicyError('טעינת הגדרת היקף המשרה נכשלה. נעשה שימוש בערך ברירת המחדל.');
      } finally {
        if (isMounted) {
          setIsEmploymentScopePolicyLoading(false);
        }
      }
    };

    loadEmploymentScopePolicy();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [session, activeOrgId, activeOrgHasConnection]);

  const loadInitialData = useCallback(async () => {
    if (!tenantClientReady || !activeOrgHasConnection || !session || !activeOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [bundle, sessionsResponse, leavePolicySettings, leavePayPolicySettings] = await Promise.all([
        fetchEmployeesList({ session, orgId: activeOrgId }),
        fetchWorkSessions({ session, orgId: activeOrgId }),
        fetchLeavePolicySettings({ session, orgId: activeOrgId }),
        fetchLeavePayPolicySettings({ session, orgId: activeOrgId }),
      ]);

      const employeeList = Array.isArray(bundle?.employees) ? bundle.employees : [];
      setEmployees(employeeList);

      const rateHistoryList = Array.isArray(bundle?.rateHistory) ? bundle.rateHistory : [];
      setRateHistories(rateHistoryList);

      const serviceList = Array.isArray(bundle?.services) ? bundle.services : [];
      const filteredServices = serviceList.filter(service => service.id !== GENERIC_RATE_SERVICE_ID);
      setServices(filteredServices);

      const ledgerEntries = Array.isArray(bundle?.leaveBalances) ? bundle.leaveBalances : [];
      setLeaveBalances(sortLeaveLedger(ledgerEntries));

      const safeSessions = Array.isArray(sessionsResponse?.sessions)
        ? sessionsResponse.sessions.filter(session => !session?.deleted)
        : [];
      setWorkSessions(safeSessions);

      const resolvedLeavePolicy = leavePolicySettings?.value ?? bundle?.leavePolicy ?? null;
      setLeavePolicy(
        resolvedLeavePolicy
          ? normalizeLeavePolicy(resolvedLeavePolicy)
          : DEFAULT_LEAVE_POLICY,
      );

      const resolvedLeavePayPolicy = leavePayPolicySettings?.value ?? bundle?.leavePayPolicy ?? null;
      setLeavePayPolicy(
        resolvedLeavePayPolicy
          ? normalizeLeavePayPolicy(resolvedLeavePayPolicy)
          : DEFAULT_LEAVE_PAY_POLICY,
      );
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantClientReady, activeOrgHasConnection, session, activeOrgId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!showEmploymentScopeUi && sanitizedEmploymentScopes.length > 0) {
      setFilters(prev => ({ ...prev, employmentScopes: [] }));
      return;
    }
    if (showEmploymentScopeUi) {
      const current = Array.isArray(filters.employmentScopes) ? filters.employmentScopes : [];
      if (
        current.length !== sanitizedEmploymentScopes.length ||
        !sanitizedEmploymentScopes.every((value, index) => value === current[index])
      ) {
        setFilters(prev => ({ ...prev, employmentScopes: sanitizedEmploymentScopes }));
      }
    }
  }, [showEmploymentScopeUi, sanitizedEmploymentScopes, filters.employmentScopes, setFilters]);

  const handleEmploymentScopeChange = useCallback((nextScopes) => {
    const sanitized = sanitizeEmploymentScopeFilter(nextScopes);
    setFilters(prev => ({ ...prev, employmentScopes: sanitized }));
  }, [setFilters]);

  const exportToExcel = () => {
    const rows = buildCsvRows({
      sessions: filteredSessions,
      employees,
      services,
    });

    if (rows.length === 0) {
      return;
    }

    const csvContent = [
      CSV_HEADERS.join(','),
      ...rows.map(row => CSV_HEADERS.map(header => escapeCsvValue(row[header])).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `דוח_שכר_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Show a warning when the selected range is a partial month
  const fromParsed = parseDateStrict(filters.dateFrom);
  const toParsed = parseDateStrict(filters.dateTo);
  const isPartialRange = !(fromParsed.ok && toParsed.ok && isFullMonthRange(fromParsed.date, toParsed.date));

  const baseFilters = {
    dateFrom: fromParsed.ok ? toISODateString(fromParsed.date) : null,
    dateTo: toParsed.ok ? toISODateString(toParsed.date) : null,
    employeeType: filters.employeeType,
    selectedEmployee: filters.selectedEmployee || null,
    serviceId: filters.serviceId,
    employmentScopes: effectiveEmploymentScopeFilter,
  };

  const hourlyHours = selectHourlyHours(workSessions, employees, baseFilters);
  const meetingHours = selectMeetingHours(workSessions, services, employees, baseFilters);
  const globalHours = selectGlobalHours(workSessions, employees, baseFilters);

  if (loading || !authClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        טוען חיבור Supabase...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500">
        יש להתחבר כדי להציג את הדוחות.
      </div>
    );
  }

  if (!activeOrgHasConnection) {
    return (
      <div className="p-6 text-center text-slate-500">
        בחרו ארגון עם חיבור פעיל כדי להפיק דוחות.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">דוחות ונתונים</h1>
            <p className="text-slate-600">צפה בדוחות מפורטים על עבודת העובדים והתשלומים</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={exportToExcel} disabled={filteredSessions.length === 0}>
              <Download className="w-4 h-4 ml-2" />
              יצוא לאקסל
            </Button>
          </div>
        </div>

        {isPartialRange && (
          <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            שים לב: נבחר טווח חלקי של חודש. הסיכומים מתבססים רק על הרישומים שבטווח שנבחר.
          </div>
        )}
        {employmentScopePolicyError ? (
          <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm" role="alert">
            {employmentScopePolicyError}
          </div>
        ) : null}
        <ReportsFilters
          filters={filters}
          setFilters={setFilters}
          employees={employees}
          services={services}
          onDateBlur={handleDateBlur}
          showEmploymentScopeFilter={showEmploymentScopeUi}
          employmentScopeOptions={EMPLOYMENT_SCOPE_OPTIONS}
          employmentScopes={sanitizedEmploymentScopes}
          onEmploymentScopeChange={handleEmploymentScopeChange}
          employmentScopeLoading={isEmploymentScopePolicyLoading}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-6 flex items-center gap-4 relative">
              <div className="absolute left-4 top-4"><InfoTooltip text={"סה\"כ תשלום הוא הסכום הכולל שישולם לכל העובדים בתקופת הדוח.\nהסכום כולל תשלומים עבור שעות עבודה, מפגשים, וגם התאמות (זיכויים או ניכויים)."} /></div>
              <div className="p-3 bg-green-100 rounded-lg"><BarChart3 className="w-6 h-6 text-green-600" /></div>
              <div><p className="text-sm text-slate-600">סה״כ תשלום</p><p className="text-2xl font-bold text-slate-900">₪{totals.totalPay.toLocaleString()}</p></div>
            </CardContent>
          </Card>
          <CombinedHoursCard hourly={hourlyHours} meeting={meetingHours} global={globalHours} isLoading={isLoading} />
          <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-6 flex items-center gap-4 relative">
              <div className="absolute left-4 top-4"><InfoTooltip text={"סה\"כ מפגשים הוא מספר כל המפגשים שנערכו בתקופת הדוח.\nלעובדים שעתיים - לא נספרים מפגשים.\nלמדריכים - נספרים כל המפגשים שבוצעו בפועל."} /></div>
              <div className="p-3 bg-purple-100 rounded-lg"><TrendingUp className="w-6 h-6 text-purple-600" /></div>
              <div><p className="text-sm text-slate-600">סה״כ מפגשים</p><p className="text-2xl font-bold text-slate-900">{totals.totalSessions}</p></div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="p-6 border-b">
            <CardTitle className="text-xl font-bold text-slate-900">דוחות מפורטים</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
                <TabsTrigger value="employee">פירוט הרישומים</TabsTrigger>
                <TabsTrigger value="monthly">דוח חודשי</TabsTrigger>
                <TabsTrigger value="payroll">דוח שכר</TabsTrigger>
              </TabsList>
              <TabsContent value="overview"><ChartsOverview sessions={filteredSessions} employees={employees} services={services} workSessions={workSessions} leavePayPolicy={leavePayPolicy} isLoading={isLoading} /></TabsContent>
              <TabsContent value="employee">
                <DetailedEntriesReport
                  sessions={filteredSessions}
                  employees={employees}
                  services={services}
                  leavePayPolicy={leavePayPolicy}
                  workSessions={workSessions}
                  rateHistories={rateHistories}
                  isLoading={isLoading}
                  showEmploymentScopeColumn={showEmploymentScopeUi}
                />
              </TabsContent>
              <TabsContent value="monthly"><MonthlyReport sessions={filteredSessions} employees={employees} services={services} workSessions={workSessions} leavePayPolicy={leavePayPolicy} isLoading={isLoading} /></TabsContent>
              <TabsContent value="payroll">
                <PayrollSummary
                  sessions={filteredSessions}
                  employees={employees}
                  services={services}
                  getRateForDate={getRateForDate}
                  isLoading={isLoading}
                  employeeTotals={totals.totalsByEmployee}
                  leaveBalances={leaveBalances}
                  leavePolicy={leavePolicy}
                  showEmploymentScopeColumn={showEmploymentScopeUi}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
