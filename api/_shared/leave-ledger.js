/* eslint-env node */
export const TIME_ENTRY_LEAVE_PREFIX = 'time_entry_leave';

const UNPAID_SUBTYPE_SET = new Set(['holiday_unpaid', 'vacation_unpaid']);
const ENTRY_TYPE_TO_KIND = {
  paid_leave: 'system_paid',
  leave_system_paid: 'system_paid',
  leave_employee_paid: 'employee_paid',
  leave_unpaid: 'unpaid',
  leave: 'unpaid',
  leave_half_day: 'half_day',
};

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

function getLeaveSubtypeFromValue(value) {
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

export function getLeaveKindFromEntryType(entryType) {
  return ENTRY_TYPE_TO_KIND[entryType] || null;
}

export function isLeaveEntryType(entryType) {
  return Boolean(getLeaveKindFromEntryType(entryType));
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

export function getLeaveLedgerDelta(kind) {
  const base = getLeaveBaseKind(kind);
  if (base === 'employee_paid') return -1;
  if (base === 'half_day') return -0.5;
  return 0;
}

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
