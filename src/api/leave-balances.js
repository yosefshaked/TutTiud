import { authenticatedFetch } from '@/lib/api-client.js';

function normalizeOrgId(orgId) {
  if (typeof orgId !== 'string') {
    return '';
  }
  return orgId.trim();
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({ ...entry }));
}

async function leaveBalancesRequest(method, { session, orgId, body, signal, leaveBalanceId } = {}) {
  if (!session) {
    throw new Error('נדרש להתחבר מחדש כדי לעדכן יתרות חופשה.');
  }

  const normalizedOrgId = normalizeOrgId(orgId);
  if (!normalizedOrgId) {
    throw new Error('יש לבחור ארגון פעיל לפני שמירת הרישום.');
  }

  const path = leaveBalanceId ? `leave-balances/${leaveBalanceId}` : 'leave-balances';
  const search = method === 'GET' ? `?org_id=${encodeURIComponent(normalizedOrgId)}` : '';
  const hasObjectBody = body && typeof body === 'object' && !(body instanceof FormData);
  const payload = method === 'GET'
    ? undefined
    : hasObjectBody
      ? { ...body, org_id: normalizedOrgId }
      : body;

  const requestOptions = {
    session,
    method,
    signal,
  };

  if (typeof payload !== 'undefined') {
    requestOptions.body = payload;
  }

  try {
    return await authenticatedFetch(`${path}${search}`, requestOptions);
  } catch (error) {
    if (!error?.message) {
      error.message = 'שמירת רישום החופשה נכשלה. נסו שוב מאוחר יותר.';
    }
    throw error;
  }
}

export function createLeaveBalanceEntry({ body, entries, ...options } = {}) {
  const normalizedEntries = normalizeEntries(entries);

  if (normalizedEntries.length > 0) {
    return leaveBalancesRequest('POST', {
      ...options,
      body: { entries: normalizedEntries },
    });
  }

  if (!body || typeof body !== 'object') {
    throw new Error('חסר מידע רישום לשמירת החופשה.');
  }

  return leaveBalancesRequest('POST', {
    ...options,
    body: { entry: body },
  });
}

export function deleteLeaveBalanceEntries({ ids, ...options } = {}) {
  const normalized = Array.isArray(ids)
    ? ids.map(id => (typeof id === 'string' || typeof id === 'number') ? String(id) : null).filter(Boolean)
    : [];

  if (!normalized.length) {
    throw new Error('אין רשומות חופשה למחיקה.');
  }

  return leaveBalancesRequest('DELETE', {
    ...options,
    body: { ids: normalized },
  });
}
