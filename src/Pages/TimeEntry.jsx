import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from 'react-router-dom';
import RecentActivity from "../components/dashboard/RecentActivity";
import TimeEntryTable from '../components/time-entry/TimeEntryTable';
import TrashTab from '../components/time-entry/TrashTab.jsx';
import { toast } from "sonner";
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLeavePolicySettings, fetchLeavePayPolicySettings } from '@/lib/settings-client.js';
import { fetchEmployeesList } from '@/api/employees.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  fetchWorkSessions,
} from '@/api/work-sessions.js';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import {
  DEFAULT_LEAVE_POLICY,
  DEFAULT_LEAVE_PAY_POLICY,
  normalizeLeavePolicy,
  normalizeLeavePayPolicy,
  isLeaveEntryType,
  TIME_ENTRY_LEAVE_PREFIX,
} from '@/lib/leave.js';
import { useTimeEntry } from '@/components/time-entry/useTimeEntry.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';
const TIME_ENTRY_TABS = [
  { value: 'all', label: 'הכול' },
  { value: 'work', label: 'שעות/שיעורים' },
  { value: 'leave', label: 'חופשות' },
  { value: 'adjustments', label: 'התאמות' },
  { value: 'trash', label: 'סל אשפה' },
];

const DEFAULT_TAB = 'all';
const VALID_TAB_VALUES = new Set(TIME_ENTRY_TABS.map(tab => tab.value));

const getTabFromSearch = (search) => {
  try {
    const params = new URLSearchParams(search || '');
    const requested = params.get('tab');
    return (requested && VALID_TAB_VALUES.has(requested)) ? requested : DEFAULT_TAB;
  } catch (error) {
    console.warn('Failed to parse tab from search params', error);
    return DEFAULT_TAB;
  }
};

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

export default function TimeEntry() {
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [rateHistories, setRateHistories] = useState([]);
  const [workSessions, setWorkSessions] = useState([]);
  const [trashSessions, setTrashSessions] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState(DEFAULT_LEAVE_POLICY);
  const [leavePayPolicy, setLeavePayPolicy] = useState(DEFAULT_LEAVE_PAY_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => getTabFromSearch(location.search));
  const { tenantClientReady, activeOrgHasConnection, activeOrgId } = useOrg();
  const { dataClient, authClient, user, loading, session } = useSupabase();

  const ensureSessionAndOrg = useCallback(() => {
    if (!session) {
      throw new Error('נדרש להתחבר כדי לבצע את הפעולה.');
    }
    if (!activeOrgId) {
      throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
    }
  }, [session, activeOrgId]);
  const loadInitialData = useCallback(async ({ silent = false } = {}) => {
    if (!tenantClientReady || !activeOrgHasConnection || !dataClient || !session || !activeOrgId) {
      if (!silent) {
        setIsLoading(false);
      }
      return;
    }

    if (!silent) setIsLoading(true);
    try {
      const bundle = await fetchEmployeesList({ session, orgId: activeOrgId });
      const employeeRecords = Array.isArray(bundle?.employees) ? bundle.employees : [];
      setEmployees(employeeRecords.filter((emp) => emp?.is_active !== false));

      const [sessionsResponse, leavePolicySettings, leavePayPolicySettings] = await Promise.all([
        fetchWorkSessions({ session, orgId: activeOrgId }),
        fetchLeavePolicySettings({ session, orgId: activeOrgId }),
        fetchLeavePayPolicySettings({ session, orgId: activeOrgId }),
      ]);

      const allSessions = Array.isArray(sessionsResponse?.sessions) ? sessionsResponse.sessions : [];
      const activeSessions = allSessions
        .filter((session) => !session?.deleted)
        .sort((a, b) => {
          const dateA = new Date(a.date || 0).getTime();
          const dateB = new Date(b.date || 0).getTime();
          if (dateA !== dateB) {
            return dateB - dateA;
          }
          const createdA = new Date(a.created_at || 0).getTime();
          const createdB = new Date(b.created_at || 0).getTime();
          return createdB - createdA;
        });
      const trashedSessions = allSessions
        .filter((session) => session?.deleted)
        .sort((a, b) => {
          const deletedA = new Date(a.deleted_at || 0).getTime();
          const deletedB = new Date(b.deleted_at || 0).getTime();
          return deletedB - deletedA;
        });

      setWorkSessions(activeSessions);
      setTrashSessions(trashedSessions);

      const rateHistoryRecords = Array.isArray(bundle?.rateHistory) ? bundle.rateHistory : [];
      setRateHistories(rateHistoryRecords);

      const serviceRecords = Array.isArray(bundle?.services) ? bundle.services : [];
      const filteredServices = serviceRecords.filter(service => service.id !== GENERIC_RATE_SERVICE_ID);
      setServices(filteredServices);

      const leaveLedgerRecords = Array.isArray(bundle?.leaveBalances) ? bundle.leaveBalances : [];
      setLeaveBalances(sortLeaveLedger(leaveLedgerRecords));

      setLeavePolicy(
        bundle?.leavePolicy
          ? normalizeLeavePolicy(bundle.leavePolicy)
          : (leavePolicySettings.value
            ? normalizeLeavePolicy(leavePolicySettings.value)
            : DEFAULT_LEAVE_POLICY),
      );

      setLeavePayPolicy(
        bundle?.leavePayPolicy
          ? normalizeLeavePayPolicy(bundle.leavePayPolicy)
          : (leavePayPolicySettings.value
            ? normalizeLeavePayPolicy(leavePayPolicySettings.value)
            : DEFAULT_LEAVE_PAY_POLICY),
      );
    } catch (error) {
      console.error('Error loading time entry data:', error);
      toast.error('שגיאה בטעינת נתוני רישום הזמנים');
    } finally {
      setIsLoading(false);
    }
  }, [tenantClientReady, activeOrgHasConnection, dataClient, session, activeOrgId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const normalized = getTabFromSearch(location.search);
    setActiveTab(prev => (prev === normalized ? prev : normalized));
  }, [location.search]);

  const handleTabChange = useCallback((value) => {
    const normalized = VALID_TAB_VALUES.has(value) ? value : DEFAULT_TAB;
    setActiveTab(normalized);
    const params = new URLSearchParams(location.search || '');
    if (normalized === DEFAULT_TAB) {
      params.delete('tab');
    } else {
      params.set('tab', normalized);
    }
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const getRateForDate = (employeeId, date, serviceId = null) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return { rate: 0, reason: 'אין עובד כזה' };

    const targetServiceId = (employee.employee_type === 'hourly' || employee.employee_type === 'global')
      ? GENERIC_RATE_SERVICE_ID
      : serviceId;

    const dateStr = format(new Date(date), 'yyyy-MM-dd');

    // Check if the employee's start date is after the requested date
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

  const { saveWorkDay, saveLeaveDay, saveAdjustments } = useTimeEntry({
    employees,
    services,
    getRateForDate,
    metadataClient: dataClient,
    workSessions,
    leavePayPolicy,
    leavePolicy,
    leaveBalances,
    session,
    orgId: activeOrgId,
  });


  const handleTableSubmit = async ({
    employee,
    day,
    dayType,
    updatedRows,
    paidLeaveId,
    paidLeaveNotes,
    leaveType,
    mixedPaid,
    mixedSubtype,
    mixedHalfDay,
    adjustments = [],
    overrideDailyValue = null,
    halfDaySecondHalfMode = null,
    halfDayWorkSegments = [],
    halfDaySecondLeaveType = null,
    includeHalfDaySecondHalf = false,
    halfDayRemovedWorkIds = [],
    halfDayPrimaryLeaveType = null,
  }) => {
    setIsLoading(true);
    try {
      const dateStr = format(day, 'yyyy-MM-dd');

      if (dayType === 'adjustment') {
        await saveAdjustments({
          employee,
          date: dateStr,
          adjustments: Array.isArray(adjustments) ? adjustments : [],
          source: 'table',
        });
        toast.success('התאמות נשמרו בהצלחה.');
        await loadInitialData({ silent: true });
        return { success: true };
      }

      if (dayType === 'paid_leave') {
        const result = await saveLeaveDay({
          employee,
          day,
          date: dateStr,
          leaveType,
          paidLeaveId,
          paidLeaveNotes,
          mixedPaid,
          mixedSubtype,
          mixedHalfDay,
          source: 'table',
          overrideDailyValue,
          halfDaySecondHalfMode,
          halfDayWorkSegments: Array.isArray(halfDayWorkSegments) ? halfDayWorkSegments : [],
          halfDaySecondLeaveType,
          includeHalfDaySecondHalf,
          halfDayRemovedWorkIds: Array.isArray(halfDayRemovedWorkIds) ? halfDayRemovedWorkIds : [],
          halfDayPrimaryLeaveType,
        });
        if (result?.needsConfirmation) {
          return result;
        }
        toast.success('חופשה נשמרה בהצלחה.');
        if (result?.usedFallbackRate) {
          toast.info('הערה: שווי יום החופשה חושב לפי תעריף נוכחי עקב חוסר בנתוני עבר.');
        } else if (result?.overrideApplied) {
          toast.info('הערה: שווי יום החופשה אושר ידנית על ידי המשתמש.');
        }
        await loadInitialData({ silent: true });
        return result || { success: true };
      } else {
        await saveWorkDay({
          employee,
          day,
          date: dateStr,
          dayType,
          segments: Array.isArray(updatedRows) ? updatedRows : [],
          paidLeaveId,
          source: 'table',
        });
        toast.success('הרישומים נשמרו בהצלחה.');
        await loadInitialData({ silent: true });
        return { success: true };
      }
    } catch (error) {
      console.error('Error submitting from table:', error);
      const message = error?.message || 'שגיאה בעדכון הרישומים';
      toast.error(message, { duration: 15000 });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionsDeleted = async (ids = [], rows = []) => {
    const idsSet = new Set((ids || []).map(String));
    if (idsSet.size > 0) {
      setWorkSessions(prev => prev.filter(ws => !idsSet.has(String(ws.id))));
      if (Array.isArray(rows) && rows.length > 0) {
        setTrashSessions(prev => {
          const filtered = prev.filter(item => !idsSet.has(String(item.id)));
          return [...rows, ...filtered];
        });
      }
    }
    try {
      await loadInitialData({ silent: true });
    } catch (error) {
      console.error('Error refreshing after delete:', error);
    }
  };

  const tabbedSessions = useMemo(() => {
    const base = Array.isArray(workSessions)
      ? workSessions.filter(session => session && !session.deleted)
      : [];
    const work = base.filter(row => row && (row.entry_type === 'hours' || row.entry_type === 'session'));
    const leave = base.filter(row => row && isLeaveEntryType(row.entry_type));
    const adjustments = base.filter(row => row && row.entry_type === 'adjustment');
    return {
      all: base,
      work,
      leave,
      adjustments,
    };
  }, [workSessions]);

  const nonTrashTabs = useMemo(
    () => TIME_ENTRY_TABS.filter(tab => tab.value !== 'trash'),
    [],
  );

  const handleTrashRestore = async (ids) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    const normalized = Array.from(new Set(idsArray.map(String)));
    if (!normalized.length) return;

    try {
      ensureSessionAndOrg();

      setTrashSessions(prev => prev.filter(item => !normalized.includes(String(item.id))));
      await loadInitialData({ silent: true });
    } catch (error) {
      console.error('Error finalizing restore:', error);
      toast.error('שחזור נכשל בעת עיבוד נתונים נוספים.');
      throw error;
    }
  };

  const handlePermanentDelete = async (ids) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    const normalized = Array.from(new Set(idsArray.map(String)));
    if (!normalized.length) return;

    try {
      setTrashSessions(prev => prev.filter(item => !normalized.includes(String(item.id))));
      await loadInitialData({ silent: true });
    } catch (error) {
      console.error('Error refreshing after permanent delete:', error);
    }
  };

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
        יש להתחבר כדי לעבוד עם רישומי הזמנים.
      </div>
    );
  }

  if (!dataClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        בחרו ארגון עם חיבור פעיל כדי להציג את רישומי הזמנים.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">רישום זמנים</h1>
          <p className="text-slate-600">ניהול רישומי שעות, חופשות והתאמות במקום אחד</p>
        </div>

        {/* Storage Usage widget temporarily disabled; flip features.storageUsage=true to re-enable (requires RPCs). */}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex flex-wrap justify-center gap-2 rounded-lg bg-white/70 p-1 shadow-sm">
            {TIME_ENTRY_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {nonTrashTabs.map(tab => (
            <TabsContent key={tab.value} value={tab.value} className="mt-6 space-y-6">
              <TimeEntryTable
                activeTab={tab.value}
                employees={employees}
                workSessions={tabbedSessions[tab.value] || []}
                allWorkSessions={workSessions}
                services={services}
                rateHistories={rateHistories}
                getRateForDate={getRateForDate}
                onTableSubmit={handleTableSubmit}
                onImported={() => loadInitialData()}
                onDeleted={handleSessionsDeleted}
                leavePolicy={leavePolicy}
                leavePayPolicy={leavePayPolicy}
              />
              <RecentActivity
                title="רישומים אחרונים"
                sessions={(tabbedSessions[tab.value] || []).slice(0, 5)}
                employees={employees}
                services={services}
                isLoading={isLoading}
                showViewAllButton={true}
              />
            </TabsContent>
          ))}

          <TabsContent value="trash" className="mt-6">
            <TrashTab
              sessions={trashSessions}
              employees={employees}
              services={services}
              onRestore={handleTrashRestore}
              onPermanentDelete={handlePermanentDelete}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}