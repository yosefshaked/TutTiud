import { format } from 'date-fns';
import {
  fetchWorkSessions,
  createWorkSessions,
  updateWorkSession,
  softDeleteWorkSession,
} from '@/api/work-sessions.js';
import { createLeaveBalanceEntry, deleteLeaveBalanceEntries } from '@/api/leave-balances.js';
import { calculateGlobalDailyRate } from '../../lib/payroll.js';
import {
  getEntryTypeForLeaveKind,
  getLeaveKindFromEntryType,
  getLeaveBaseKind,
  getLeaveSubtypeFromValue,
  inferLeaveKind,
  inferLeaveType,
  getLeaveValueMultiplier,
  isLeaveEntryType,
  isPayableLeaveKind,
  getLeaveLedgerDelta,
  getNegativeBalanceFloor,
  getLeaveLedgerEntryDelta,
  getLeaveLedgerEntryDate,
  getLeaveLedgerEntryType,
  resolveLeavePayMethodContext,
  normalizeMixedSubtype,
  DEFAULT_MIXED_SUBTYPE,
  TIME_ENTRY_LEAVE_PREFIX,
} from '../../lib/leave.js';
import {
  buildLeaveMetadata,
  buildSourceMetadata,
  canUseWorkSessionMetadata,
} from '../../lib/workSessionsMetadata.js';
import { selectLeaveDayValue, selectLeaveRemaining } from '../../selectors.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

const generateLocalId = () => {
  try {
    const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
      return globalCrypto.randomUUID();
    }
  } catch {
    // ignore and fall back to manual generation
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const parseMetadataCandidate = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed };
      }
    } catch {
      return null;
    }
  }
  return null;
};

const attachLocalIdMailbox = (payload, localId) => {
  if (!payload || !localId) {
    return { ...payload };
  }
  const metadataBase = parseMetadataCandidate(payload.metadata) || {};
  const metadata = { ...metadataBase, _localId: localId };
  return {
    ...payload,
    metadata,
    _localId: localId,
  };
};

export function useTimeEntry({
  employees,
  services,
  getRateForDate,
  metadataClient = null,
  session = null,
  orgId = null,
  workSessions = [],
  leavePayPolicy = null,
  leavePolicy = null,
  leaveBalances = [],
}) {
  const baseRegularSessions = new Set();
  const baseLeaveSessions = new Set();
  if (Array.isArray(workSessions)) {
    workSessions.forEach(session => {
      if (!session) return;
      if (!session.employee_id || !session.date) return;
      if (session.entry_type === 'adjustment') return;
      if (isLeaveEntryType(session.entry_type)) {
        baseLeaveSessions.add(`${session.employee_id}-${session.date}`);
        return;
      }
      baseRegularSessions.add(`${session.employee_id}-${session.date}`);
    });
  }

  const resolveLeaveValue = (employeeId, date, multiplier = 1) => {
    const base = selectLeaveDayValue(employeeId, date, {
      employees,
      workSessions,
      services,
      leavePayPolicy,
    });
    const safeBase = typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : 0;
    const scale = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    return safeBase * scale;
  };

  const effectiveMetadataClient = metadataClient || null;

  const resolveCanWriteMetadata = async () => {
    if (!effectiveMetadataClient) {
      return false;
    }
    try {
      return await canUseWorkSessionMetadata(effectiveMetadataClient);
    } catch (error) {
      console.warn('Failed to verify WorkSessions metadata support', error);
      return false;
    }
  };

  const ensureApiPrerequisites = () => {
    if (!session) {
      const error = new Error('נדרשת התחברות כדי לשמור רישומי שעות.');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    if (!orgId) {
      const error = new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
      error.code = 'ORG_REQUIRED';
      throw error;
    }
  };

  const isHalfDayLeaveSession = (session) => {
    if (!session) return false;
    const entryKind = getLeaveKindFromEntryType(session.entry_type);
    if (entryKind === 'half_day') {
      return true;
    }
    const inferredKind = inferLeaveKind(session);
    if (inferredKind === 'half_day') {
      return true;
    }
    const rawMetadata = session.metadata;
    let metadata = null;
    if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
      metadata = rawMetadata;
    } else if (typeof rawMetadata === 'string') {
      try {
        const parsed = JSON.parse(rawMetadata);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = parsed;
        }
      } catch (error) {
        console.warn('Failed to parse work session metadata when detecting half-day leave', error);
      }
    }
    if (!metadata) {
      return false;
    }
    const halfDayFlags = [
      metadata?.leave?.half_day,
      metadata?.leave?.halfDay,
      metadata?.leave_half_day,
      metadata?.leaveHalfDay,
    ];
    if (halfDayFlags.some(flag => flag === true)) {
      return true;
    }
    const fractionCandidates = [
      metadata?.leave?.fraction,
      metadata?.leave_fraction,
      metadata?.fraction,
    ].map(value => (typeof value === 'string' ? Number(value) : value));
    return fractionCandidates.some(value => Number.isFinite(value) && Math.abs(value - 0.5) < 1e-6);
  };

  const saveRows = async (rows, dayTypeMap = {}) => {
    ensureApiPrerequisites();
    const canWriteMetadata = await resolveCanWriteMetadata();
    const inserts = [];
    const leaveConflicts = [];
    const leaveOccupied = new Set(baseLeaveSessions);
    for (const row of rows) {
      const employee = employees.find(e => e.id === row.employee_id);
      if (!employee) continue;
      const isHourlyOrGlobal = employee.employee_type === 'hourly' || employee.employee_type === 'global';
      const { rate: rateUsed, reason } = getRateForDate(employee.id, row.date, isHourlyOrGlobal ? null : row.service_id);
      if (!rateUsed) throw new Error(reason || 'missing rate');
      let totalPayment = 0;
      const empDayType = dayTypeMap ? dayTypeMap[row.employee_id] : undefined;
      const originalType = row.entry_type;
      let entryType;
      if (employee.employee_type === 'global') {
        if (empDayType === 'paid_leave') {
          entryType = getEntryTypeForLeaveKind('system_paid');
        } else {
          entryType = 'hours';
        }
      } else {
        entryType = employee.employee_type === 'instructor' ? 'session' : 'hours';
        if (originalType && isLeaveEntryType(originalType)) {
          row.notes = row.notes ? `${row.notes} (סומן בעבר כחופשה)` : 'סומן בעבר כחופשה';
        }
      }

      const key = `${employee.id}-${row.date}`;
      if (!isLeaveEntryType(entryType) && leaveOccupied.has(key)) {
        leaveConflicts.push({
          employeeId: employee.id,
          employeeName: employee.name || '',
          date: row.date,
        });
        continue;
      }

      if (entryType === 'session') {
        const service = services.find(s => s.id === row.service_id);
        if (!service) throw new Error('service required');
        if (service.payment_model === 'per_student') {
          totalPayment = (parseInt(row.sessions_count, 10) || 0) * (parseInt(row.students_count, 10) || 0) * rateUsed;
        } else {
          totalPayment = (parseInt(row.sessions_count, 10) || 0) * rateUsed;
        }
      } else if (entryType && entryType.startsWith('leave_')) {
        const leaveKind = getLeaveKindFromEntryType(entryType);
        const multiplier = getLeaveValueMultiplier({ entry_type: entryType, leave_kind: leaveKind });
        let value = resolveLeaveValue(employee.id, row.date, multiplier || 1);
        if (employee.employee_type === 'global') {
          if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
            try {
              const fallback = calculateGlobalDailyRate(employee, row.date, rateUsed);
              value = (typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0)
                * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
            } catch {
              value = 0;
            }
          }
          totalPayment = value;
        }
      } else if (entryType === 'leave_unpaid') {
        totalPayment = 0;
      } else if (employee.employee_type === 'hourly') {
        totalPayment = (parseFloat(row.hours) || 0) * rateUsed;
      } else if (employee.employee_type === 'global') {
        const dailyRate = calculateGlobalDailyRate(employee, row.date, rateUsed);
        totalPayment = dailyRate;
      }
      const payload = {
        employee_id: employee.id,
        date: row.date,
        entry_type: entryType,
        service_id: row.service_id || null,
        hours: entryType === 'hours' ? (parseFloat(row.hours) || null) : null,
        sessions_count: entryType === 'session' ? (parseInt(row.sessions_count, 10) || null) : null,
        students_count: entryType === 'session' ? (parseInt(row.students_count, 10) || null) : null,
        notes: row.notes ? row.notes : null,
        rate_used: rateUsed,
        total_payment: totalPayment,
      };
      if (entryType && entryType.startsWith('leave_')) {
        payload.payable = true;
        payload.hours = 0;
        leaveOccupied.add(key);
        if (canWriteMetadata) {
          const payContext = resolveLeavePayMethodContext(employee, leavePayPolicy);
          const metadata = buildLeaveMetadata({
            source: 'multi_date',
            method: payContext.method,
            lookbackMonths: payContext.lookback_months,
            legalAllow12mIfBetter: payContext.legal_allow_12m_if_better,
            overrideApplied: payContext.override_applied,
          });
          if (metadata) {
            payload.metadata = metadata;
          }
        }
      } else if (entryType === 'leave_unpaid') {
        payload.payable = false;
        payload.hours = 0;
        payload.total_payment = 0;
        payload.rate_used = null;
        leaveOccupied.add(key);
        if (canWriteMetadata) {
          const inferred = inferLeaveType(row) || 'unpaid';
          const subtype = getLeaveSubtypeFromValue(inferred) || getLeaveSubtypeFromValue(row.leave_type || row.leaveType);
          const metadata = buildLeaveMetadata({
            source: 'multi_date',
            subtype,
          });
          if (metadata) {
            payload.metadata = metadata;
          }
        }
      } else if (canWriteMetadata) {
        const metadata = buildSourceMetadata('multi_date');
        if (metadata) {
          payload.metadata = metadata;
        }
      }
      const payloadWithMailbox = attachLocalIdMailbox(payload, generateLocalId());
      inserts.push(payloadWithMailbox);
    }
    if (!inserts.length) {
      if (leaveConflicts.length > 0) {
        const error = new Error('regular_conflicts');
        error.code = 'TIME_ENTRY_REGULAR_CONFLICT';
        error.conflicts = leaveConflicts;
        throw error;
      }
      throw new Error('no valid rows');
    }
    await createWorkSessions({ session, orgId, sessions: inserts });
    return { inserted: inserts, conflicts: leaveConflicts };
  };

  const saveWorkDay = async (input = {}) => {
    ensureApiPrerequisites();

    const {
      employee = null,
      segments = [],
      day = null,
      date = null,
      dayType = null,
      paidLeaveId = null,
      source = 'table',
    } = input || {};

    if (!employee || !employee.id) {
      throw new Error('נדרש לבחור עובד לשמירת היום.');
    }

    const normalizedDate = typeof date === 'string' && date
      ? date
      : (day instanceof Date && !Number.isNaN(day.getTime())
        ? format(day, 'yyyy-MM-dd')
        : null);

    if (!normalizedDate) {
      throw new Error('נדרש תאריך תקין לשמירת היום.');
    }

    const dayReference = day instanceof Date && !Number.isNaN(day.getTime())
      ? day
      : new Date(`${normalizedDate}T00:00:00`);

    if (Number.isNaN(dayReference.getTime())) {
      throw new Error('נדרש תאריך תקין לשמירת היום.');
    }

    const segmentList = Array.isArray(segments) ? segments.map(item => ({ ...item })) : [];

    if (!segmentList.length) {
      throw new Error('אין רישומי עבודה לשמירה.');
    }

    if (paidLeaveId && segmentList.length > 0 && !segmentList[0].id) {
      segmentList[0].id = paidLeaveId;
    }

    const conflictingLeaveSessions = Array.isArray(workSessions)
      ? workSessions.filter(ws => {
        if (!ws || ws.employee_id !== employee.id || ws.date !== normalizedDate) {
          return false;
        }
        if (!isLeaveEntryType(ws.entry_type)) {
          return false;
        }
        if (segmentList.some(segment => segment.id && segment.id === ws.id)) {
          return false;
        }
        return !isHalfDayLeaveSession(ws);
      })
      : [];

    if (conflictingLeaveSessions.length > 0) {
      const error = new Error('לא ניתן להזין שעות בתאריך זה כי קיימת חופשה. יש למחוק אותה תחילה.');
      error.code = 'TIME_ENTRY_LEAVE_CONFLICT';
      error.conflicts = conflictingLeaveSessions;
      throw error;
    }

    const canWriteMetadata = await resolveCanWriteMetadata();

    const submittedSegmentIds = new Set(
      segmentList
        .filter(segment => segment && segment.id)
        .map(segment => String(segment.id)),
    );

    let hasPaidGlobalSegment = false;
    let preferExistingGlobalSegments = false;
    let remainingGlobalDailyPortion = 1;
    const pendingPaidGlobalSegmentIds = new Set();

    /*
     * Authoritative payment calculation for global employees.
     * This block ensures that a global employee is paid exactly once per day,
     * correctly handling mixed leave/work days and segmented work entries.
     * - `hasPaidGlobalSegment`: Checks if a work segment has already been paid for this day in the database.
     * - `pendingPaidGlobalSegmentIds`: Tracks work segments paid within the current batch to handle segmented days.
     * - `remainingGlobalDailyPortion`: Calculates the payable portion of a workday
     *   that has not already been covered by paid leave.
     */
    if (employee.employee_type === 'global') {
      let existingSessionsResponse;
      try {
        existingSessionsResponse = await fetchWorkSessions({
          session,
          orgId,
          query: {
            start_date: normalizedDate,
            end_date: normalizedDate,
            employee_id: employee.id,
          },
        });
      } catch (error) {
        const fetchError = new Error('נכשל באימות רישומי העבודה הקיימים ליום זה. נסה שוב.');
        fetchError.code = error?.code || 'TIME_ENTRY_EXISTING_FETCH_FAILED';
        throw fetchError;
      }

      const existingSessions = Array.isArray(existingSessionsResponse?.sessions)
        ? existingSessionsResponse.sessions
        : [];

      const existingPaidLeaveSessions = existingSessions.filter(session => (
        session
        && session.employee_id === employee.id
        && isLeaveEntryType(session.entry_type)
        && session.entry_type !== 'adjustment'
        && session.payable !== false
      ));

      const existingLeavePortion = existingPaidLeaveSessions.reduce((sum, leaveSession) => {
        if (!leaveSession) {
          return sum;
        }
        if (isHalfDayLeaveSession(leaveSession)) {
          return sum + 0.5;
        }
        const multiplierValue = typeof leaveSession.multiplier === 'number'
          ? leaveSession.multiplier
          : Number.parseFloat(leaveSession.multiplier);
        if (Number.isFinite(multiplierValue) && multiplierValue > 0) {
          return sum + multiplierValue;
        }
        return sum + 1;
      }, 0);

      remainingGlobalDailyPortion = Math.max(0, 1 - existingLeavePortion);
      if (remainingGlobalDailyPortion <= 0) {
        hasPaidGlobalSegment = true;
      }

      const existingWorkSegments = existingSessions.filter(session => (
        session
        && session.employee_id === employee.id
        && !isLeaveEntryType(session.entry_type)
        && session.entry_type !== 'adjustment'
      ));

      existingWorkSegments.forEach(session => {
        const sessionId = session?.id ? String(session.id) : null;
        if (!sessionId) {
          return;
        }
        const paymentValue = typeof session?.total_payment === 'number'
          ? session.total_payment
          : Number.parseFloat(session?.total_payment);
        if (Number.isFinite(paymentValue) && paymentValue > 0 && submittedSegmentIds.has(sessionId)) {
          pendingPaidGlobalSegmentIds.add(sessionId);
        }
      });

      const persistedOtherSegments = existingWorkSegments.filter(session => {
        const sessionId = session?.id ? String(session.id) : null;
        if (!sessionId) {
          return true;
        }
        return !submittedSegmentIds.has(sessionId);
      });

      const hasPersistedPaidSegment = persistedOtherSegments.some(session => {
        const paymentValue = typeof session?.total_payment === 'number'
          ? session.total_payment
          : Number.parseFloat(session?.total_payment);
        return Number.isFinite(paymentValue) && paymentValue > 0;
      });

      if (hasPersistedPaidSegment) {
        hasPaidGlobalSegment = true;
        preferExistingGlobalSegments = true;
        remainingGlobalDailyPortion = 0;
      }
    }

    const toInsert = [];
    const toUpdate = [];

    for (const segment of segmentList) {
      const hoursValue = segment.hours !== undefined && segment.hours !== null
        ? parseFloat(segment.hours)
        : NaN;
      const isHourly = employee.employee_type === 'hourly';
      const isGlobal = employee.employee_type === 'global';
      const isHourlyOrGlobal = isHourly || isGlobal;

      if (isHourly) {
        if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
          throw new Error('יש להזין מספר שעות גדול מ-0.');
        }
      }

      if (isGlobal) {
        if (!dayType) {
          throw new Error('יש לבחור סוג יום.');
        }
        if ((segment._status === 'new' || !segment.id) && (!Number.isFinite(hoursValue) || hoursValue <= 0)) {
          throw new Error('יש להזין מספר שעות גדול מ-0.');
        }
      }

      if (isHourlyOrGlobal && Number.isFinite(hoursValue) && hoursValue > 0) {
        const scaledHundredths = Math.round(hoursValue * 100);
        if (scaledHundredths % 25 !== 0) {
          throw new Error('כמות השעות חייבת להיות בכפולות של רבע שעה.');
        }
      }

      const serviceId = isHourlyOrGlobal ? GENERIC_RATE_SERVICE_ID : segment.service_id;
      const { rate: rateUsed, reason } = getRateForDate(
        employee.id,
        dayReference,
        serviceId,
      );
      if (!rateUsed) {
        const error = new Error(reason || 'לא הוגדר תעריף עבור תאריך זה.');
        error.code = 'TIME_ENTRY_RATE_MISSING';
        throw error;
      }

      const legacyPaidLeave = segment.entry_type === 'paid_leave' && !isGlobal;
      const notes = legacyPaidLeave
        ? (segment.notes ? `${segment.notes} (סומן בעבר כחופשה)` : 'סומן בעבר כחופשה')
        : (segment.notes || null);

      let totalPayment = 0;

      if (isHourly) {
        totalPayment = (Number.isFinite(hoursValue) ? hoursValue : 0) * rateUsed;
      } else if (isGlobal) {
        const segmentId = segment?.id ? String(segment.id) : null;
        const segmentWasPaidBefore = segmentId ? pendingPaidGlobalSegmentIds.has(segmentId) : false;
        let shouldAssignFullDailyRate = false;

        if (!hasPaidGlobalSegment) {
          if (segmentWasPaidBefore) {
            shouldAssignFullDailyRate = true;
            pendingPaidGlobalSegmentIds.delete(segmentId);
          } else if (pendingPaidGlobalSegmentIds.size === 0) {
            const isExistingSegment = Boolean(segmentId);
            if (!preferExistingGlobalSegments || isExistingSegment) {
              shouldAssignFullDailyRate = true;
            }
          }
        }

        if (shouldAssignFullDailyRate) {
          try {
            const dailyRate = calculateGlobalDailyRate(employee, dayReference, rateUsed);
            const payablePortion = Math.max(0, Math.min(1, remainingGlobalDailyPortion));
            totalPayment = dailyRate * payablePortion;
            hasPaidGlobalSegment = true;
            preferExistingGlobalSegments = true;
            remainingGlobalDailyPortion = Math.max(0, remainingGlobalDailyPortion - payablePortion);
          } catch (error) {
            error.code = error.code || 'TIME_ENTRY_GLOBAL_RATE_FAILED';
            throw error;
          }
        } else {
          totalPayment = 0;
          if (!preferExistingGlobalSegments && segmentId) {
            preferExistingGlobalSegments = true;
          }
        }
      } else {
        const service = services.find(svc => svc.id === segment.service_id);
        if (!service) {
          const error = new Error('נדרש לבחור שירות עבור מדריך.');
          error.code = 'TIME_ENTRY_SERVICE_REQUIRED';
          throw error;
        }
        const sessionsCount = parseInt(segment.sessions_count, 10) || 1;
        const studentsCount = parseInt(segment.students_count, 10) || 0;
        if (service.payment_model === 'per_student') {
          totalPayment = sessionsCount * studentsCount * rateUsed;
        } else {
          totalPayment = sessionsCount * rateUsed;
        }
      }

      const payloadBase = {
        employee_id: employee.id,
        date: normalizedDate,
        notes,
        rate_used: rateUsed,
        total_payment: totalPayment,
      };

      if (isHourly) {
        payloadBase.entry_type = 'hours';
        payloadBase.hours = Number.isFinite(hoursValue) ? hoursValue : 0;
        payloadBase.service_id = GENERIC_RATE_SERVICE_ID;
        payloadBase.sessions_count = null;
        payloadBase.students_count = null;
      } else if (isGlobal) {
        payloadBase.entry_type = 'hours';
        payloadBase.hours = Number.isFinite(hoursValue) ? hoursValue : null;
        payloadBase.service_id = null;
        payloadBase.sessions_count = null;
        payloadBase.students_count = null;
      } else {
        payloadBase.entry_type = 'session';
        payloadBase.service_id = segment.service_id;
        payloadBase.sessions_count = parseInt(segment.sessions_count, 10) || 1;
        payloadBase.students_count = parseInt(segment.students_count, 10) || null;
      }

      if (canWriteMetadata) {
        const metadata = buildSourceMetadata(source);
        if (metadata) {
          payloadBase.metadata = metadata;
        }
      }

      if (segment.id) {
        toUpdate.push({ id: segment.id, updates: payloadBase });
      } else {
        const payloadForInsert = attachLocalIdMailbox(payloadBase, generateLocalId());
        toInsert.push(payloadForInsert);
      }
    }

    if (!toInsert.length && !toUpdate.length) {
      throw new Error('אין שינויים לשמירה.');
    }

    if (toInsert.length) {
      await createWorkSessions({
        session,
        orgId,
        sessions: toInsert,
      });
    }

    if (toUpdate.length) {
      await Promise.all(
        toUpdate.map(({ id, updates }) => updateWorkSession({
          session,
          orgId,
          sessionId: id,
          body: { updates },
        })),
      );
    }

    return {
      insertedCount: toInsert.length,
      updatedCount: toUpdate.length,
      inserted: toInsert,
      updated: toUpdate,
    };
  };

  const saveLeaveDay = async (input = {}) => {
    ensureApiPrerequisites();

    const {
      employee = null,
      day = null,
      date = null,
      leaveType = null,
      paidLeaveId = null,
      paidLeaveNotes = null,
      mixedPaid = null,
      mixedSubtype = null,
      mixedHalfDay = null,
      source = 'table',
      overrideDailyValue = null,
      halfDaySecondHalfMode = null,
      halfDayWorkSegments = [],
      halfDaySecondLeaveType = null,
      includeHalfDaySecondHalf = false,
      halfDayRemovedWorkIds = [],
      halfDayPrimaryLeaveType = null,
    } = input || {};

    if (!employee || !employee.id) {
      throw new Error('נדרש לבחור עובד לשמירת חופשה.');
    }

    const normalizedDate = typeof date === 'string' && date
      ? date
      : (day instanceof Date && !Number.isNaN(day.getTime())
        ? format(day, 'yyyy-MM-dd')
        : null);

    if (!normalizedDate) {
      throw new Error('נדרש תאריך תקין לשמירת חופשה.');
    }

    const dayReference = day instanceof Date && !Number.isNaN(day.getTime())
      ? day
      : new Date(`${normalizedDate}T00:00:00`);

    if (Number.isNaN(dayReference.getTime())) {
      throw new Error('נדרש תאריך תקין לשמירת חופשה.');
    }

    if (!leaveType) {
      const error = new Error('יש לבחור סוג חופשה.');
      error.code = 'TIME_ENTRY_LEAVE_TYPE_REQUIRED';
      throw error;
    }

    if (employee.start_date && employee.start_date > normalizedDate) {
      const error = new Error('לא ניתן לשמור חופשה לפני תחילת העבודה.');
      error.code = 'TIME_ENTRY_LEAVE_BEFORE_START';
      error.details = {
        requestedDate: normalizedDate,
        startDate: employee.start_date,
      };
      throw error;
    }

    const effectivePolicy = leavePolicy && typeof leavePolicy === 'object'
      ? leavePolicy
      : {};

    if (leaveType === 'half_day' && !effectivePolicy.allow_half_day) {
      const error = new Error('חצי יום אינו מאושר במדיניות הנוכחית.');
      error.code = 'TIME_ENTRY_HALF_DAY_DISABLED';
      throw error;
    }

    const duplicateReference = Array.isArray(workSessions) ? workSessions.slice() : [];
    let reusedSecondLeave = null;

    const baseLeaveKind = getLeaveBaseKind(leaveType) || leaveType;

    const normalizedSecondHalfMode = typeof halfDaySecondHalfMode === 'string'
      ? halfDaySecondHalfMode.trim().toLowerCase()
      : null;
    const resolvedSecondHalfMode = baseLeaveKind === 'half_day'
      ? (normalizedSecondHalfMode || (includeHalfDaySecondHalf ? 'work' : null))
      : null;
    const shouldSaveWorkHalf = resolvedSecondHalfMode === 'work';
    const shouldSaveLeaveHalf = resolvedSecondHalfMode === 'leave';
    const workSegmentsInput = Array.isArray(halfDayWorkSegments) ? halfDayWorkSegments : [];

    const baseHistoricalDailyValueRaw = resolveLeaveValue(employee.id, normalizedDate);
    const baseHistoricalDailyValue = typeof baseHistoricalDailyValueRaw === 'number'
      && Number.isFinite(baseHistoricalDailyValueRaw)
      && baseHistoricalDailyValueRaw > 0
      ? baseHistoricalDailyValueRaw
      : 0;

    const normalizedPrimaryHalfKind = baseLeaveKind === 'half_day'
      ? (getLeaveBaseKind(halfDayPrimaryLeaveType) || halfDayPrimaryLeaveType || 'employee_paid')
      : baseLeaveKind;

    const normalizedSecondLeaveInput = typeof halfDaySecondLeaveType === 'string'
      && halfDaySecondLeaveType
      ? halfDaySecondLeaveType
      : 'employee_paid';
    const normalizedSecondaryHalfKind = shouldSaveLeaveHalf
      ? (getLeaveBaseKind(normalizedSecondLeaveInput) || normalizedSecondLeaveInput)
      : null;
    const secondHalfEntryType = shouldSaveLeaveHalf
      ? (getEntryTypeForLeaveKind(normalizedSecondaryHalfKind)
        || getEntryTypeForLeaveKind('employee_paid')
        || null)
      : null;
    const secondHalfPayableCandidate = normalizedSecondaryHalfKind
      ? isPayableLeaveKind(normalizedSecondaryHalfKind)
      : false;

    const removedWorkIdsInput = Array.isArray(halfDayRemovedWorkIds)
      ? halfDayRemovedWorkIds.filter(Boolean).map(id => String(id))
      : [];
    const workRemovalSet = new Set(removedWorkIdsInput);

    const existingWorkSessions = duplicateReference.filter(session =>
      session
      && session.employee_id === employee.id
      && session.date === normalizedDate
      && !isLeaveEntryType(session.entry_type)
      && session.entry_type !== 'adjustment',
    );
    const allowedWorkIds = shouldSaveWorkHalf
      ? new Set(workSegmentsInput.filter(segment => segment && segment.id).map(segment => String(segment.id)))
      : new Set();
    allowedWorkIds.forEach(id => workRemovalSet.delete(id));

    if (workRemovalSet.size > 0) {
      for (let idx = duplicateReference.length - 1; idx >= 0; idx -= 1) {
        const session = duplicateReference[idx];
        if (session?.id && workRemovalSet.has(String(session.id))) {
          duplicateReference.splice(idx, 1);
        }
      }
    }

    const workConflicts = existingWorkSessions.filter(session => {
      const sessionId = session?.id ? String(session.id) : '';
      if (shouldSaveWorkHalf) {
        return !allowedWorkIds.has(sessionId);
      }
      return !workRemovalSet.has(sessionId);
    });

    const skipWorkConflictValidation = baseLeaveKind === 'half_day'
      && !shouldSaveWorkHalf
      && !shouldSaveLeaveHalf;

    const filteredWorkConflicts = skipWorkConflictValidation ? [] : workConflicts;

    if (filteredWorkConflicts.length > 0) {
      const error = new Error('לא ניתן להזין חופשה בתאריך זה כי קיימים בו רישומי עבודה. יש למחוק אותם תחילה.');
      error.code = 'TIME_ENTRY_WORK_CONFLICT';
      error.conflicts = filteredWorkConflicts;
      throw error;
    }

    const existingLedgerEntries = Array.isArray(leaveBalances)
      ? leaveBalances.filter(entry => {
        if (!entry || entry.employee_id !== employee.id) return false;
        const entryDate = getLeaveLedgerEntryDate(entry);
        if (entryDate !== normalizedDate) return false;
        const ledgerType = getLeaveLedgerEntryType(entry) || '';
        return ledgerType.startsWith(TIME_ENTRY_LEAVE_PREFIX);
      })
      : [];

    const ledgerDeleteIds = existingLedgerEntries
      .map(entry => entry?.id)
      .filter(Boolean);

    const existingLedgerDelta = existingLedgerEntries.reduce(
      (sum, entry) => sum + (getLeaveLedgerEntryDelta(entry) || 0),
      0,
    );

    const existingSecondLeaveSessions = duplicateReference.filter(session =>
      session
      && session.employee_id === employee.id
      && session.date === normalizedDate
      && isLeaveEntryType(session.entry_type)
      && session.id !== paidLeaveId,
    );

    const secondaryLeaveRemovalSet = new Set(
      existingSecondLeaveSessions
        .filter(session => session?.id)
        .map(session => String(session.id)),
    );

    if (secondaryLeaveRemovalSet.size > 0) {
      for (let idx = duplicateReference.length - 1; idx >= 0; idx -= 1) {
        const session = duplicateReference[idx];
        if (session?.id && secondaryLeaveRemovalSet.has(String(session.id))) {
          duplicateReference.splice(idx, 1);
        }
      }
    }

    if (shouldSaveLeaveHalf) {
      reusedSecondLeave = secondHalfEntryType
        ? existingSecondLeaveSessions.find(session => session?.entry_type === secondHalfEntryType)
        : null;
      if (!reusedSecondLeave) {
        reusedSecondLeave = existingSecondLeaveSessions.find(session => session?.id);
      }
    }

    const isMixed = baseLeaveKind === 'mixed';
    const resolvedMixedSubtype = isMixed
      ? (normalizeMixedSubtype(mixedSubtype) || DEFAULT_MIXED_SUBTYPE)
      : null;
    const leaveSubtype = isMixed ? null : getLeaveSubtypeFromValue(leaveType);
    const entryType = getEntryTypeForLeaveKind(baseLeaveKind)
      || getEntryTypeForLeaveKind('system_paid')
      || 'leave_unpaid';
    if (!entryType) {
      const error = new Error('סוג חופשה לא נתמך.');
      error.code = 'TIME_ENTRY_LEAVE_UNSUPPORTED';
      throw error;
    }

    const allowHalfDay = Boolean(effectivePolicy.allow_half_day);
    const mixedIsPaid = isMixed ? (mixedPaid !== false) : false;
    const mixedHalfDayRequested = isMixed && mixedIsPaid && mixedHalfDay === true;
    const mixedHalfDayEnabled = mixedHalfDayRequested && allowHalfDay;
    if (baseLeaveKind === 'half_day' && !allowHalfDay) {
      const error = new Error('חצי יום אינו מאושר במדיניות הנוכחית.');
      error.code = 'TIME_ENTRY_HALF_DAY_DISABLED';
      throw error;
    }

    const isPayable = isMixed
      ? mixedIsPaid
      : (baseLeaveKind === 'half_day'
        ? isPayableLeaveKind(normalizedPrimaryHalfKind)
        : isPayableLeaveKind(baseLeaveKind));
    const leaveFraction = baseLeaveKind === 'half_day'
      ? 0.5
      : (isMixed ? (mixedHalfDayEnabled ? 0.5 : 1) : 1);
    const normalizedLeaveFraction = Number.isFinite(leaveFraction) && leaveFraction > 0
      ? leaveFraction
      : 1;
    const primaryLeavePortion = isPayable ? normalizedLeaveFraction : 0;
    const secondHalfPortion = shouldSaveLeaveHalf && secondHalfPayableCandidate ? 0.5 : 0;

    let existingLeaveSessionsResponse;
    try {
      existingLeaveSessionsResponse = await fetchWorkSessions({
        session,
        orgId,
        query: {
          start_date: normalizedDate,
          end_date: normalizedDate,
          employee_id: employee.id,
        },
      });
    } catch (error) {
      const fetchError = new Error('נכשל באימות החופשות הקיימות ליום זה. נסו שוב.');
      fetchError.code = error?.code || 'TIME_ENTRY_LEAVE_EXISTING_FETCH_FAILED';
      throw fetchError;
    }

    const existingLeaveSessions = Array.isArray(existingLeaveSessionsResponse?.sessions)
      ? existingLeaveSessionsResponse.sessions
      : [];

    const excludedLeaveIds = new Set();
    if (paidLeaveId) {
      excludedLeaveIds.add(String(paidLeaveId));
    }
    secondaryLeaveRemovalSet.forEach(id => {
      excludedLeaveIds.add(String(id));
    });
    if (reusedSecondLeave?.id) {
      excludedLeaveIds.add(String(reusedSecondLeave.id));
    }

    const existingLeavePortion = existingLeaveSessions.reduce((sum, session) => {
      if (!session || session.employee_id !== employee.id) {
        return sum;
      }
      if (!isLeaveEntryType(session.entry_type) || session.payable === false) {
        return sum;
      }
      const sessionId = session?.id ? String(session.id) : null;
      if (sessionId && excludedLeaveIds.has(sessionId)) {
        return sum;
      }
      if (isHalfDayLeaveSession(session)) {
        return sum + 0.5;
      }
      const multiplierValue = typeof session?.multiplier === 'number'
        ? session.multiplier
        : Number.parseFloat(session?.multiplier);
      if (Number.isFinite(multiplierValue) && multiplierValue > 0) {
        return sum + multiplierValue;
      }
      return sum + 1;
    }, 0);

    const proposedLeavePortion = primaryLeavePortion + secondHalfPortion;
    if ((existingLeavePortion + proposedLeavePortion) > 1.000001) {
      const error = new Error('לא ניתן לרשום יותר מיום חופשה אחד לאותו תאריך.');
      error.code = 'LEAVE_CAPACITY_EXCEEDED';
      error.details = { existingLeavePortion, proposedLeavePortion };
      throw error;
    }

    const ledgerDelta = baseLeaveKind === 'half_day'
      ? (isPayableLeaveKind(normalizedPrimaryHalfKind) ? -0.5 : 0)
      : (getLeaveLedgerDelta(baseLeaveKind) || 0);

    const summary = selectLeaveRemaining(employee.id, normalizedDate, {
      employees,
      leaveBalances,
      policy: effectivePolicy,
    }) || {};

    const remaining = typeof summary.remaining === 'number' ? summary.remaining : 0;
    const baselineRemaining = remaining - existingLedgerDelta;
    let totalLedgerDelta = ledgerDelta;
    let secondLedgerDelta = 0;

    const canWriteMetadata = await resolveCanWriteMetadata();

    const rawOverrideDailyValue = overrideDailyValue;
    const hasOverrideDailyValue = rawOverrideDailyValue !== null && rawOverrideDailyValue !== undefined
      && rawOverrideDailyValue !== '';
    let overrideDailyValueNumber = null;
    if (hasOverrideDailyValue) {
      overrideDailyValueNumber = Number(rawOverrideDailyValue);
      if (!Number.isFinite(overrideDailyValueNumber) || overrideDailyValueNumber <= 0) {
        const error = new Error('שווי יום החופשה חייב להיות גדול מ-0.');
        error.code = 'TIME_ENTRY_LEAVE_INVALID_OVERRIDE';
        throw error;
      }
    }

    let resolvedRateForDate = 0;
    let resolvedLeaveValue = 0;
    let fallbackWasRequired = false;

    const needsDailyValue = isPayable || secondHalfPayableCandidate || shouldSaveWorkHalf;

    if (needsDailyValue) {
      if (hasOverrideDailyValue) {
        resolvedLeaveValue = overrideDailyValueNumber;
      } else if (baseHistoricalDailyValue > 0) {
        resolvedLeaveValue = baseHistoricalDailyValue;
      } else {
        const { rate, reason } = getRateForDate(
          employee.id,
          dayReference,
          GENERIC_RATE_SERVICE_ID,
        );
        resolvedRateForDate = rate || 0;
        if (!resolvedRateForDate) {
          const fallbackRate = parseFloat(employee?.current_rate);
          if (Number.isFinite(fallbackRate) && fallbackRate > 0) {
            resolvedRateForDate = fallbackRate;
          }
        }
        if (!resolvedRateForDate && employee.employee_type === 'global') {
          const error = new Error(reason || 'לא הוגדר תעריף עבור תאריך זה.');
          error.code = 'TIME_ENTRY_RATE_MISSING';
          throw error;
        }

        if (employee.employee_type === 'global') {
          try {
            resolvedLeaveValue = calculateGlobalDailyRate(employee, dayReference, resolvedRateForDate);
            fallbackWasRequired = true;
          } catch (error) {
            error.code = error.code || 'TIME_ENTRY_GLOBAL_RATE_FAILED';
            throw error;
          }
        } else if (resolvedRateForDate > 0) {
          resolvedLeaveValue = resolvedRateForDate;
          fallbackWasRequired = true;
        }

        if (!(resolvedLeaveValue > 0)) {
          return {
            needsConfirmation: true,
            fallbackValue: 0,
            fraction: normalizedLeaveFraction,
            payable: true,
          };
        }
      }
    }

    const effectiveFullDayValue = resolvedLeaveValue > 0 ? resolvedLeaveValue : baseHistoricalDailyValue;
    const fallbackDailyValue = Number.isFinite(effectiveFullDayValue) && effectiveFullDayValue > 0
      ? effectiveFullDayValue
      : 0;

    if (fallbackWasRequired && !hasOverrideDailyValue) {
      if (!(fallbackDailyValue > 0)) {
        const error = new Error('לא ניתן לחשב שווי יום חופשה תקין.');
        error.code = 'TIME_ENTRY_LEAVE_FALLBACK_INVALID';
        throw error;
      }
      const fallbackValueForConfirmation = fallbackDailyValue;
      return {
        needsConfirmation: true,
        fallbackValue: fallbackValueForConfirmation,
        fraction: normalizedLeaveFraction,
        payable: true,
      };
    }

    const totalPaymentValue = isPayable ? fallbackDailyValue * normalizedLeaveFraction : 0;

    const leaveRow = {
      employee_id: employee.id,
      date: normalizedDate,
      notes: paidLeaveNotes ? paidLeaveNotes : null,
      rate_used: isPayable && effectiveFullDayValue > 0 ? effectiveFullDayValue : null,
      total_payment: totalPaymentValue,
      entry_type: entryType,
      hours: 0,
      service_id: null,
      sessions_count: null,
      students_count: null,
      payable: Boolean(isPayable),
    };

    if (canWriteMetadata) {
      const payContext = resolveLeavePayMethodContext(employee, leavePayPolicy);
      const metadata = buildLeaveMetadata({
        source,
        mixedPaid: isMixed ? mixedIsPaid : null,
        subtype: isMixed ? resolvedMixedSubtype : leaveSubtype,
        method: payContext.method,
        lookbackMonths: payContext.lookback_months,
        legalAllow12mIfBetter: payContext.legal_allow_12m_if_better,
        overrideApplied: payContext.override_applied,
        extra: baseLeaveKind === 'half_day'
          ? {
            half_day_second_half: resolvedSecondHalfMode || undefined,
            half_day_primary_kind: normalizedPrimaryHalfKind,
          }
          : undefined,
      });
      if (metadata) {
        leaveRow.metadata = metadata;
      }
    }
    duplicateReference.push({ ...leaveRow, id: paidLeaveId || null });

    const workInserts = [];
    const workUpdates = [];
    const leaveSessionInserts = [];
    const leaveSessionUpdates = [];
    const ledgerEntries = [];

    const addLedgerEntry = ({ key, balance, leaveTypeValue, workSessionId = null, localId = null }) => {
      const normalizedBalance = typeof balance === 'number' && Number.isFinite(balance)
        ? balance
        : (Number(balance) || 0);
      ledgerEntries.push({
        key: key || null,
        localId: localId || null,
        payload: {
          employee_id: employee.id,
          effective_date: normalizedDate,
          balance: normalizedBalance,
          leave_type: `${TIME_ENTRY_LEAVE_PREFIX}_${leaveTypeValue}`,
          notes: paidLeaveNotes ? paidLeaveNotes : null,
          work_session_id: workSessionId,
        },
      });
    };

    const primaryLedgerType = baseLeaveKind === 'half_day'
      ? (normalizedPrimaryHalfKind === 'system_paid' ? 'system_paid' : 'half_day')
      : leaveType;

    if (shouldSaveWorkHalf) {
      if (!workSegmentsInput.length) {
        const error = new Error('נדרש להזין לפחות רישום עבודה לחצי היום השני.');
        error.code = 'TIME_ENTRY_HALF_DAY_WORK_MISSING';
        throw error;
      }
      for (const segment of workSegmentsInput) {
        if (!segment) continue;
        const hoursValue = segment.hours !== undefined && segment.hours !== null
          ? parseFloat(segment.hours)
          : NaN;
        const isHourly = employee.employee_type === 'hourly';
        const isGlobal = employee.employee_type === 'global';
        const isHourlyOrGlobal = isHourly || isGlobal;

        if (isHourly) {
          if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
            const error = new Error('יש להזין מספר שעות גדול מ-0.');
            error.code = 'TIME_ENTRY_INVALID_HOURS';
            throw error;
          }
        }

        if (isGlobal) {
          if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
            const error = new Error('יש להזין מספר שעות גדול מ-0.');
            error.code = 'TIME_ENTRY_INVALID_HOURS';
            throw error;
          }
        }

        if (isHourlyOrGlobal && Number.isFinite(hoursValue) && hoursValue > 0) {
          const scaledHundredths = Math.round(hoursValue * 100);
          if (scaledHundredths % 25 !== 0) {
            const error = new Error('כמות השעות חייבת להיות בכפולות של רבע שעה.');
            error.code = 'TIME_ENTRY_INVALID_INCREMENT';
            throw error;
          }
        }

        const serviceId = isHourlyOrGlobal ? GENERIC_RATE_SERVICE_ID : segment.service_id;
        const { rate: rateUsed, reason } = getRateForDate(
          employee.id,
          dayReference,
          serviceId,
        );
        if (!rateUsed) {
          const error = new Error(reason || 'לא הוגדר תעריף עבור תאריך זה.');
          error.code = 'TIME_ENTRY_RATE_MISSING';
          throw error;
        }

        const notesValue = typeof segment.notes === 'string' && segment.notes.trim().length > 0
          ? segment.notes.trim()
          : null;

        let totalPayment = 0;
        if (isHourly) {
          totalPayment = (Number.isFinite(hoursValue) ? hoursValue : 0) * rateUsed;
        } else if (isGlobal) {
          try {
            const dailyRate = calculateGlobalDailyRate(employee, dayReference, rateUsed);
            totalPayment = shouldSaveWorkHalf ? dailyRate * 0.5 : dailyRate;
          } catch (error) {
            error.code = error.code || 'TIME_ENTRY_GLOBAL_RATE_FAILED';
            throw error;
          }
        } else {
          const service = services.find(svc => svc.id === segment.service_id);
          if (!service) {
            const error = new Error('נדרש לבחור שירות עבור מדריך.');
            error.code = 'TIME_ENTRY_SERVICE_REQUIRED';
            throw error;
          }
          const sessionsCount = parseInt(segment.sessions_count, 10) || 1;
          const studentsCount = parseInt(segment.students_count, 10) || 0;
          if (service.payment_model === 'per_student') {
            totalPayment = sessionsCount * studentsCount * rateUsed;
          } else {
            totalPayment = sessionsCount * rateUsed;
          }
        }

        const payloadBase = {
          employee_id: employee.id,
          date: normalizedDate,
          notes: notesValue,
          rate_used: rateUsed,
          total_payment: totalPayment,
          entry_type: 'hours',
        };

        if (isHourlyOrGlobal) {
          payloadBase.hours = Number.isFinite(hoursValue) ? hoursValue : 0;
          payloadBase.service_id = isHourly ? GENERIC_RATE_SERVICE_ID : null;
          payloadBase.sessions_count = null;
          payloadBase.students_count = null;
        } else {
          payloadBase.entry_type = 'session';
          payloadBase.service_id = segment.service_id;
          payloadBase.sessions_count = parseInt(segment.sessions_count, 10) || 1;
          payloadBase.students_count = parseInt(segment.students_count, 10) || null;
        }

        if (canWriteMetadata) {
          const metadata = buildSourceMetadata(source, { half_day_second_half: 'work' });
          if (metadata) {
            payloadBase.metadata = metadata;
          }
        }

        if (segment.id) {
          workUpdates.push({ id: segment.id, updates: payloadBase });
        } else {
          workInserts.push(payloadBase);
        }
        duplicateReference.push({ ...payloadBase, id: segment.id || null });
      }
    }

    let secondLeaveRow = null;
    let normalizedSecondLeaveType = halfDaySecondLeaveType;
    if (shouldSaveLeaveHalf) {
      normalizedSecondLeaveType = typeof halfDaySecondLeaveType === 'string' && halfDaySecondLeaveType
        ? halfDaySecondLeaveType
        : 'employee_paid';
      const secondLeaveKind = getLeaveBaseKind(normalizedSecondLeaveType) || normalizedSecondLeaveType || 'employee_paid';
      const secondEntryType = getEntryTypeForLeaveKind(secondLeaveKind) || getEntryTypeForLeaveKind('employee_paid');
      if (!secondEntryType) {
        const error = new Error('סוג חופשה לא נתמך.');
        error.code = 'TIME_ENTRY_SECOND_HALF_UNSUPPORTED';
        throw error;
      }
      const secondLeavePayable = isPayableLeaveKind(secondLeaveKind);
      const secondFraction = 0.5;
      const secondTotalPayment = secondLeavePayable ? fallbackDailyValue * secondFraction : 0;
      secondLedgerDelta = secondLeaveKind === 'employee_paid' ? -0.5 : 0;
      secondLeaveRow = {
        employee_id: employee.id,
        date: normalizedDate,
        notes: paidLeaveNotes ? paidLeaveNotes : null,
        rate_used: secondLeavePayable && effectiveFullDayValue > 0 ? effectiveFullDayValue : null,
        total_payment: secondTotalPayment,
        entry_type: secondEntryType,
        service_id: null,
        hours: 0,
        sessions_count: null,
        students_count: null,
        payable: Boolean(secondLeavePayable),
      };
      if (reusedSecondLeave?.id) {
        secondLeaveRow.id = reusedSecondLeave.id;
        secondaryLeaveRemovalSet.delete(String(reusedSecondLeave.id));
      }
      if (secondaryLeaveRemovalSet.size > 0) {
        for (let idx = duplicateReference.length - 1; idx >= 0; idx -= 1) {
          const session = duplicateReference[idx];
          if (session?.id && secondaryLeaveRemovalSet.has(String(session.id))) {
            duplicateReference.splice(idx, 1);
          }
        }
      }
      if (canWriteMetadata) {
        const payContext = resolveLeavePayMethodContext(employee, leavePayPolicy);
        const secondaryMetadata = buildLeaveMetadata({
          source,
          leaveType: secondLeaveKind,
          leaveKind: secondLeaveKind,
          payable: secondLeavePayable,
          fraction: secondFraction,
          method: payContext.method,
          lookbackMonths: payContext.lookback_months,
          legalAllow12mIfBetter: payContext.legal_allow_12m_if_better,
          overrideApplied: payContext.override_applied,
          extra: {
            half_day_second_half: 'leave',
            half_day_secondary_kind: secondLeaveKind,
          },
        });
        if (secondaryMetadata) {
          secondLeaveRow.metadata = secondaryMetadata;
        }
      }
      duplicateReference.push({ ...secondLeaveRow });
    }

    totalLedgerDelta += secondLedgerDelta;

    const projected = baselineRemaining + totalLedgerDelta;

    if (totalLedgerDelta < 0) {
      if (!effectivePolicy.allow_negative_balance) {
        if (baselineRemaining <= 0 || projected < 0) {
          const error = new Error('חריגה ממכסה ימי החופשה המותרים.');
          error.code = 'TIME_ENTRY_LEAVE_BALANCE_EXCEEDED';
          error.details = { baselineRemaining, projected };
          throw error;
        }
      } else {
        const floorLimit = getNegativeBalanceFloor(effectivePolicy);
        if (projected < floorLimit) {
          const error = new Error('חריגה ממכסה ימי החופשה המותרים.');
          error.code = 'TIME_ENTRY_LEAVE_BALANCE_EXCEEDED';
          error.details = { baselineRemaining, projected, floorLimit };
          throw error;
        }
      }
    }

    if (paidLeaveId) {
      leaveSessionUpdates.push({ id: paidLeaveId, updates: { ...leaveRow } });
      addLedgerEntry({
        key: 'primary',
        balance: ledgerDelta,
        leaveTypeValue: primaryLedgerType,
        workSessionId: paidLeaveId,
      });
    } else {
      leaveSessionInserts.push({ key: 'primary', payload: { ...leaveRow } });
      addLedgerEntry({
        key: 'primary',
        balance: ledgerDelta,
        leaveTypeValue: primaryLedgerType,
      });
    }

    if (secondLeaveRow) {
      const { id: secondId, ...secondRest } = secondLeaveRow;
      const secondKey = 'secondary';
      if (secondId) {
        leaveSessionUpdates.push({ id: secondId, updates: secondRest });
        addLedgerEntry({
          key: secondKey,
          balance: secondLedgerDelta,
          leaveTypeValue: normalizedSecondLeaveType || leaveType,
          workSessionId: secondId,
        });
      } else {
        leaveSessionInserts.push({ key: secondKey, payload: { ...secondLeaveRow } });
        addLedgerEntry({
          key: secondKey,
          balance: secondLedgerDelta,
          leaveTypeValue: normalizedSecondLeaveType || leaveType,
        });
      }
    }

    const totalPlannedInserts = leaveSessionInserts.length + workInserts.length;
    const totalPlannedUpdates = leaveSessionUpdates.length + workUpdates.length;

    if (totalPlannedInserts === 0 && totalPlannedUpdates === 0 && !workRemovalSet.size && !secondaryLeaveRemovalSet.size && !ledgerDeleteIds.length) {
      throw new Error('אין שינויים לשמירה.');
    }

    const insertedSessions = [];
    const pendingSessionInserts = [];

    const ledgerEntryByKey = new Map();
    ledgerEntries.forEach(entry => {
      if (!entry) return;
      const entryKey = entry.key || null;
      if (!ledgerEntryByKey.has(entryKey)) {
        ledgerEntryByKey.set(entryKey, entry);
      }
    });

    if (leaveSessionInserts.length) {
      leaveSessionInserts.forEach(item => {
        if (!item || !item.payload) return;
        const localId = generateLocalId();
        const payloadWithId = attachLocalIdMailbox(item.payload, localId);
        pendingSessionInserts.push({
          type: 'leave',
          key: item.key || null,
          payload: payloadWithId,
          localId,
        });
        const ledgerEntry = ledgerEntryByKey.get(item.key || null);
        if (ledgerEntry) {
          ledgerEntry.localId = localId;
        }
      });
    }

    if (workInserts.length) {
      workInserts.forEach(payload => {
        if (!payload) return;
        const localId = generateLocalId();
        const payloadWithId = attachLocalIdMailbox(payload, localId);
        pendingSessionInserts.push({
          type: 'work',
          key: null,
          payload: payloadWithId,
          localId,
        });
      });
    }

    if (pendingSessionInserts.length) {
      const insertResponse = await createWorkSessions({
        session,
        orgId,
        sessions: pendingSessionInserts.map(item => item.payload),
      });
      const createdSessions = Array.isArray(insertResponse?.created) ? insertResponse.created : [];
      if (createdSessions.length !== pendingSessionInserts.length) {
        const error = new Error(
          leaveSessionInserts.length > 0
            ? 'שמירת רישום החופשה נכשלה.'
            : 'שמירת רישומי העבודה נכשלה.',
        );
        throw error;
      }
      const createdSessionMap = new Map();
      createdSessions.forEach((createdSession) => {
        insertedSessions.push(createdSession);
        if (createdSession && typeof createdSession._localId === 'string' && createdSession._localId) {
          createdSessionMap.set(createdSession._localId, createdSession);
        }
      });

      const ledgerEntryByLocalId = new Map();
      ledgerEntries.forEach(entry => {
        if (entry?.localId) {
          ledgerEntryByLocalId.set(entry.localId, entry);
        }
      });

      for (const descriptor of pendingSessionInserts) {
        const { localId, type, key } = descriptor;
        const mappedSession = localId ? createdSessionMap.get(localId) : null;
        if (!mappedSession) {
          const error = new Error(
            leaveSessionInserts.length > 0
              ? 'שמירת רישום החופשה נכשלה.'
              : 'שמירת רישומי העבודה נכשלה.',
          );
          throw error;
        }
        if (type === 'leave') {
          const ledgerEntry = ledgerEntryByLocalId.get(localId) || ledgerEntryByKey.get(key || null);
          if (ledgerEntry) {
            ledgerEntry.payload.work_session_id = mappedSession.id || null;
            if (mappedSession.employee_id) {
              ledgerEntry.payload.employee_id = mappedSession.employee_id;
            }
            if (mappedSession.date) {
              ledgerEntry.payload.effective_date = mappedSession.date;
            }
          }
        }
      }
    }

    const sessionUpdates = [...leaveSessionUpdates, ...workUpdates];
    if (sessionUpdates.length) {
      await Promise.all(
        sessionUpdates.map(({ id, updates: payload }) => updateWorkSession({
          session,
          orgId,
          sessionId: id,
          body: { updates: payload },
        })),
      );
    }

    const workDeleteIds = Array.from(workRemovalSet);
    const secondaryLeaveDeleteIds = Array.from(secondaryLeaveRemovalSet);

    if (workDeleteIds.length || secondaryLeaveDeleteIds.length) {
      await Promise.all([
        ...workDeleteIds.map(id => softDeleteWorkSession({
          session,
          orgId,
          sessionId: id,
        })),
        ...secondaryLeaveDeleteIds.map(id => softDeleteWorkSession({
          session,
          orgId,
          sessionId: id,
        })),
      ]);
    }

    if (ledgerDeleteIds.length) {
      await deleteLeaveBalanceEntries({
        session,
        orgId,
        ids: ledgerDeleteIds,
      });
    }

    const ledgerInsertPayloads = ledgerEntries
      .map(entry => entry?.payload)
      .filter(payload => payload && payload.leave_type);

    if (ledgerInsertPayloads.some(payload => !payload.work_session_id)) {
      throw new Error('שגיאה בקישור רישום החופשה ליתרה.');
    }

    if (ledgerInsertPayloads.length) {
      await createLeaveBalanceEntry({
        session,
        orgId,
        entries: ledgerInsertPayloads,
      });
    }

    const usedFallbackRate = isPayable && fallbackWasRequired && !hasOverrideDailyValue;

    return {
      inserted: insertedSessions,
      updated: sessionUpdates,
      ledgerDeletedIds: ledgerDeleteIds,
      ledgerInserted: ledgerInsertPayloads,
      usedFallbackRate,
      overrideApplied: Boolean(hasOverrideDailyValue),
      fallbackWasRequired: Boolean(fallbackWasRequired),
    };
  };

  const saveMixedLeave = async (entries = [], options = {}) => {
    ensureApiPrerequisites();
    const { leaveType = 'mixed' } = options;
    const bulkMode = leaveType === 'mixed';
    if (!bulkMode && !getEntryTypeForLeaveKind(leaveType)) {
      throw new Error('סוג חופשה לא נתמך');
    }
    const canWriteMetadata = await resolveCanWriteMetadata();
    const inserts = [];
    const conflicts = [];
    const invalidStartDates = [];
    const occupied = new Set(baseRegularSessions);
    for (const item of entries) {
      const employee = employees.find(e => e.id === item.employee_id);
      if (!employee) continue;
      const dateStr = item.date;
      if (!dateStr) continue;
      const key = `${employee.id}-${dateStr}`;
      if (employee.start_date && dateStr < employee.start_date) {
        invalidStartDates.push({
          employeeId: employee.id,
          employeeName: employee.name || '',
          date: dateStr,
          startDate: employee.start_date,
        });
        continue;
      }
      if (occupied.has(key)) {
        conflicts.push({
          employeeId: employee.id,
          employeeName: employee.name || '',
          date: dateStr,
        });
        continue;
      }
      const mixedSubtype = bulkMode
        ? (normalizeMixedSubtype(item.subtype) || DEFAULT_MIXED_SUBTYPE)
        : null;
      const requestedKind = bulkMode
        ? mixedSubtype
        : getLeaveBaseKind(leaveType) || leaveType;

      const isPaid = bulkMode
        ? item.paid !== false
        : isPayableLeaveKind(requestedKind);

      const halfDay = bulkMode
        ? Boolean(isPaid && item.half_day === true)
        : requestedKind === 'half_day';

      let resolvedKind;
      if (halfDay) {
        resolvedKind = 'half_day';
      } else if (!isPaid) {
        if (bulkMode) {
          resolvedKind = mixedSubtype === 'holiday' ? 'holiday_unpaid' : 'vacation_unpaid';
        } else {
          resolvedKind = getLeaveBaseKind(leaveType) || 'unpaid';
        }
      } else {
        if (bulkMode) {
          resolvedKind = mixedSubtype === 'holiday' ? 'system_paid' : 'employee_paid';
        } else {
          resolvedKind = getLeaveBaseKind(leaveType) || 'employee_paid';
        }
      }

      const entryType = getEntryTypeForLeaveKind(resolvedKind);
      if (!entryType) {
        throw new Error('סוג חופשה לא נתמך');
      }

      const normalizedLeaveFraction = halfDay ? 0.5 : 1;
      let fullDayValue = 0;
      if (isPaid) {
        const { rate, reason } = getRateForDate(employee.id, dateStr, GENERIC_RATE_SERVICE_ID);
        let resolvedRate = rate || 0;
        if (!resolvedRate) {
          const fallbackRate = parseFloat(employee?.current_rate);
          if (Number.isFinite(fallbackRate) && fallbackRate > 0) {
            resolvedRate = fallbackRate;
          }
        }
        if (!resolvedRate && employee.employee_type === 'global') {
          throw new Error(reason || 'missing rate');
        }

        const selectorValue = resolveLeaveValue(employee.id, dateStr);
        if (typeof selectorValue === 'number' && Number.isFinite(selectorValue) && selectorValue > 0) {
          fullDayValue = selectorValue;
        }

        if (employee.employee_type === 'global') {
          if (!(fullDayValue > 0)) {
            try {
              fullDayValue = calculateGlobalDailyRate(employee, dateStr, resolvedRate);
            } catch {
              fullDayValue = 0;
            }
          }
        } else {
          if (!(fullDayValue > 0) && resolvedRate > 0) {
            fullDayValue = resolvedRate;
          }
        }
      }
      const totalPayment = isPaid ? fullDayValue * normalizedLeaveFraction : 0;
      inserts.push({
        employee_id: employee.id,
        date: dateStr,
        entry_type: entryType,
        service_id: null,
        hours: 0,
        sessions_count: null,
        students_count: null,
        notes: item.notes || null,
        rate_used: isPaid && fullDayValue > 0 ? fullDayValue : null,
        total_payment: totalPayment,
        payable: isPaid,
      });
      const payload = inserts[inserts.length - 1];
      if (canWriteMetadata) {
        const payContext = resolveLeavePayMethodContext(employee, leavePayPolicy);
        const metadata = buildLeaveMetadata({
          source: 'multi_date_leave',
          subtype: bulkMode ? mixedSubtype : getLeaveSubtypeFromValue(resolvedKind),
          mixedPaid: bulkMode ? Boolean(isPaid) : null,
          method: payContext.method,
          lookbackMonths: payContext.lookback_months,
          legalAllow12mIfBetter: payContext.legal_allow_12m_if_better,
          overrideApplied: payContext.override_applied,
          extra: bulkMode ? { source_context: 'multi_date_mixed' } : {},
        });
        if (metadata) {
          payload.metadata = metadata;
        }
      }
      occupied.add(key);
    }
    if (!inserts.length) {
      if (conflicts.length > 0 || invalidStartDates.length > 0) {
        const error = new Error('leave_conflicts');
        error.code = 'TIME_ENTRY_LEAVE_CONFLICT';
        error.conflicts = conflicts;
        error.invalidStartDates = invalidStartDates;
        throw error;
      }
      throw new Error('no valid rows');
    }
    await createWorkSessions({ session, orgId, sessions: inserts });
    return { inserted: inserts, conflicts, invalidStartDates };
  };

  const saveAdjustments = async (input = {}) => {
    ensureApiPrerequisites();

    const isLegacyArrayInput = Array.isArray(input);
    const source = isLegacyArrayInput
      ? 'multi_date'
      : (input?.source || 'table');

    const adjustments = isLegacyArrayInput
      ? input
      : (Array.isArray(input?.adjustments) ? input.adjustments : []);

    if (!adjustments.length) {
      throw new Error('אין התאמות לשמירה.');
    }

    const canWriteMetadata = await resolveCanWriteMetadata();

    const newEntries = [];
    const updates = [];

    for (const item of adjustments) {
      const employeeId = item?.employee_id || input?.employee?.id;
      if (!employeeId) {
        throw new Error('נדרש עובד לשמירת ההתאמות.');
      }
      const employeeRecord = employees.find(emp => emp.id === employeeId) || input?.employee;
      if (!employeeRecord) {
        throw new Error('העובד המבוקש לא נמצא.');
      }

      const dateValue = item?.date || input?.date;
      if (!dateValue) {
        throw new Error('יש לבחור תאריך לכל התאמה.');
      }

      const amountRaw = typeof item?.amount === 'number'
        ? item.amount
        : parseFloat(item?.amount);
      if (!amountRaw || Number.isNaN(amountRaw) || amountRaw <= 0) {
        throw new Error('נא להזין סכום גדול מ-0 עבור כל התאמה.');
      }

      const notesValue = typeof item?.notes === 'string' ? item.notes.trim() : '';
      if (!notesValue) {
        throw new Error('נא למלא סכום והערה עבור כל התאמה.');
      }

      const normalizedAmount = item?.type === 'debit'
        ? -Math.abs(amountRaw)
        : Math.abs(amountRaw);

      const basePayload = {
        employee_id: employeeId,
        date: dateValue,
        entry_type: 'adjustment',
        notes: notesValue,
        total_payment: normalizedAmount,
        rate_used: normalizedAmount,
        hours: null,
        service_id: null,
        sessions_count: null,
        students_count: null,
      };

      if (canWriteMetadata) {
        const metadata = buildSourceMetadata(source);
        if (metadata) {
          basePayload.metadata = metadata;
        }
      }

      if (item?.id) {
        updates.push({ id: item.id, updates: basePayload });
      } else {
        const payloadWithMailbox = attachLocalIdMailbox(basePayload, generateLocalId());
        newEntries.push(payloadWithMailbox);
      }
    }

    if (!newEntries.length && !updates.length) {
      throw new Error('אין התאמות לשמירה.');
    }

    if (newEntries.length) {
      await createWorkSessions({ session, orgId, sessions: newEntries });
    }

    if (updates.length) {
      await Promise.all(
        updates.map(({ id, updates: payload }) => {
          const updateValues = { ...payload };
          return updateWorkSession({
            session,
            orgId,
            sessionId: id,
            body: { updates: updateValues },
          });
        }),
      );
    }

    return {
      createdCount: newEntries.length,
      updatedCount: updates.length,
    };
  };

  return {
    saveRows,
    saveWorkDay,
    saveLeaveDay,
    saveMixedLeave,
    saveAdjustments,
  };
}
