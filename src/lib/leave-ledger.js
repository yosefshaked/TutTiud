import {
  TIME_ENTRY_LEAVE_PREFIX,
  getLeaveBaseKind,
  getLeaveLedgerDelta,
  inferLeaveType,
  isLeaveEntryType,
} from './leave.js';

function normalizeBalance(delta) {
  if (typeof delta === 'number' && Number.isFinite(delta)) {
    return delta;
  }
  const parsed = Number(delta);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildLedgerEntryFromSession(session) {
  if (!session || typeof session !== 'object') {
    return null;
  }
  if (!isLeaveEntryType(session.entry_type)) {
    return null;
  }
  const employeeId = session.employee_id;
  const sessionDate = session.date;
  if (!employeeId || !sessionDate) {
    return null;
  }
  const inferredType = inferLeaveType(session);
  const baseKind = getLeaveBaseKind(inferredType) || inferredType;
  if (!baseKind) {
    return null;
  }
  const delta = normalizeBalance(getLeaveLedgerDelta(baseKind));

  return {
    employee_id: employeeId,
    effective_date: sessionDate,
    balance: delta,
    leave_type: `${TIME_ENTRY_LEAVE_PREFIX}_${baseKind}`,
    notes: session.notes || null,
    work_session_id: session.id || null,
  };
}

export function isLeaveLedgerEntry(entry) {
  return Boolean(entry && entry.work_session_id && entry.leave_type?.startsWith?.(TIME_ENTRY_LEAVE_PREFIX));
}
