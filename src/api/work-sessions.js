import { authenticatedFetch } from '@/lib/api-client.js';

function normalizeOrgId(orgId) {
  if (typeof orgId !== 'string') {
    return '';
  }
  return orgId.trim();
}

function buildSearchParams(orgId, query = {}) {
  const params = new URLSearchParams();
  if (orgId) {
    params.set('org_id', orgId);
  }
  if (query && typeof query === 'object') {
    if (query.start_date) {
      params.set('start_date', query.start_date);
    }
    if (query.end_date) {
      params.set('end_date', query.end_date);
    }
    Object.entries(query).forEach(([key, value]) => {
      if (value == null) return;
      if (key === 'start_date' || key === 'end_date') return;
      params.set(key, String(value));
    });
  }
  return params.toString();
}

async function workSessionsRequest(method, {
  session,
  orgId,
  body,
  signal,
  sessionId,
  query,
} = {}) {
  if (!session) {
    throw new Error('נדרשת התחברות כדי לגשת לרישומי שעות.');
  }

  const normalizedOrgId = normalizeOrgId(orgId);
  if (!normalizedOrgId) {
    throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
  }

  const path = sessionId ? `work-sessions/${sessionId}` : 'work-sessions';
  const search = buildSearchParams(normalizedOrgId, query);

  const hasObjectBody = body && typeof body === 'object' && !(body instanceof FormData);
  const payload = method === 'GET'
    ? undefined
    : hasObjectBody
      ? { ...body }
      : body;

  const requestOptions = {
    session,
    method,
    signal,
  };

  if (typeof payload !== 'undefined') {
    requestOptions.body = payload;
  }

  const url = search ? `${path}?${search}` : path;

  try {
    return await authenticatedFetch(url, requestOptions);
  } catch (error) {
    if (!error?.message) {
      error.message = 'הפעולה נכשלה. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export function fetchWorkSessions(options = {}) {
  return workSessionsRequest('GET', options);
}

export function createWorkSessions(options = {}) {
  const sessions = Array.isArray(options.sessions)
    ? options.sessions
    : options.body?.sessions;
  if (!sessions || sessions.length === 0) {
    throw new Error('נדרשות רשומות עבודה לשמירה.');
  }
  const payload = { sessions };
  return workSessionsRequest('POST', { ...options, body: payload });
}

export function updateWorkSession(options = {}) {
  if (!options.sessionId && !options?.body?.session_id && !options?.body?.id) {
    throw new Error('נדרש מזהה רישום לעדכון.');
  }
  return workSessionsRequest('PATCH', options);
}

export function softDeleteWorkSession(options = {}) {
  if (!options.sessionId && !options?.body?.session_id && !options?.body?.id) {
    throw new Error('נדרש מזהה רישום למחיקה.');
  }
  return workSessionsRequest('DELETE', options);
}

export function permanentlyDeleteWorkSession(options = {}) {
  if (!options.sessionId && !options?.body?.session_id && !options?.body?.id) {
    throw new Error('נדרש מזהה רישום למחיקה.');
  }
  const normalizedOptions = {
    ...options,
    query: {
      ...(options.query || {}),
      permanent: 'true',
    },
  };
  return workSessionsRequest('DELETE', normalizedOptions);
}

export function restoreWorkSession(options = {}) {
  if (!options.sessionId && !options?.body?.session_id && !options?.body?.id) {
    throw new Error('נדרש מזהה רישום לשחזור.');
  }
  const normalizedOptions = {
    ...options,
    body: { restore: true },
  };
  return workSessionsRequest('PATCH', normalizedOptions);
}
