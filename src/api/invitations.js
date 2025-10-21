import { authenticatedFetch } from '@/lib/api-client.js';

function ensureSession(session) {
  if (!session) {
    throw new Error('נדרשת התחברות כדי לנהל הזמנות לארגון.');
  }
  return session;
}

function normalizeUuid(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : '';
}

function normalizeOrgId(orgId) {
  const normalized = normalizeUuid(orgId);
  if (!normalized) {
    throw new Error('יש לבחור ארגון תקין לפני שליחת הזמנה.');
  }
  return normalized;
}

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new Error('יש להזין כתובת אימייל לשליחת הזמנה.');
  }
  const normalized = email.trim().toLowerCase();
  const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailPattern.test(normalized)) {
    throw new Error('כתובת האימייל שסופקה אינה תקינה.');
  }
  return normalized;
}

function normalizeInvitationRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  return {
    id: record.id || null,
    orgId: record.orgId || record.org_id || null,
    email,
    status: record.status || 'pending',
    invitedBy: record.invitedBy || record.invited_by || null,
    createdAt: record.createdAt || record.created_at || null,
    expiresAt: record.expiresAt || record.expires_at || null,
  };
}

function normalizeToken(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export async function createInvitation(orgId, email, { session, expiresAt, redirectTo, emailData, signal } = {}) {
  const activeSession = ensureSession(session);
  const normalizedOrgId = normalizeOrgId(orgId);
  const normalizedEmail = normalizeEmail(email);

  const payload = {
    orgId: normalizedOrgId,
    email: normalizedEmail,
  };

  if (expiresAt) {
    payload.expiresAt = expiresAt;
  }
  if (redirectTo) {
    payload.redirectTo = redirectTo;
  }
  if (emailData && typeof emailData === 'object') {
    payload.emailData = emailData;
  }

  try {
    const response = await authenticatedFetch('invitations', {
      method: 'POST',
      session: activeSession,
      signal,
      body: payload,
    });
    const normalized = normalizeInvitationRecord(response?.invitation);
    if (!normalized) {
      throw new Error('השרת לא החזיר נתוני הזמנה תקינים.');
    }
    return normalized;
  } catch (error) {
    if (!error?.message) {
      error.message = 'שליחת ההזמנה נכשלה. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export async function getInvitationByToken(token, { signal } = {}) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    throw new Error('קישור ההזמנה חסר אסימון תקין.');
  }

  const response = await fetch(`/api/invitations/token/${encodeURIComponent(normalizedToken)}`, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  });

  let payload = null;
  const contentType = response.headers?.get?.('content-type') || response.headers?.get?.('Content-Type') || '';
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message
      || (response.status === 404
        ? 'ההזמנה לא נמצאה. ודא שהקישור שלך מעודכן.'
        : response.status === 410
          ? 'תוקף ההזמנה פג. בקש ממנהל הארגון לשלוח קישור חדש.'
          : 'טעינת פרטי ההזמנה נכשלה. נסה שוב מאוחר יותר.');
    const error = new Error(message);
    error.status = response.status;
    if (payload) {
      error.data = payload;
    }
    throw error;
  }

  const normalized = normalizeInvitationRecord(payload?.invitation);
  if (!normalized) {
    throw new Error('השרת החזיר נתוני הזמנה חסרים.');
  }
  return normalized;
}

export async function listPendingInvitations(orgId, { session, signal } = {}) {
  const activeSession = ensureSession(session);
  const normalizedOrgId = normalizeOrgId(orgId);
  const searchParams = new URLSearchParams({ orgId: normalizedOrgId });

  try {
    const response = await authenticatedFetch(`invitations?${searchParams.toString()}`, {
      method: 'GET',
      session: activeSession,
      signal,
    });
    const invitations = Array.isArray(response?.invitations) ? response.invitations : [];
    return invitations
      .map(normalizeInvitationRecord)
      .filter(Boolean);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    if (!error?.message) {
      error.message = 'טעינת ההזמנות נכשלה. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export async function revokeInvitation(invitationId, { session, signal } = {}) {
  const activeSession = ensureSession(session);
  const normalizedId = normalizeUuid(invitationId);
  if (!normalizedId) {
    throw new Error('חסר מזהה הזמנה תקין לביטול.');
  }

  try {
    await authenticatedFetch(`invitations/${normalizedId}`, {
      method: 'DELETE',
      session: activeSession,
      signal,
    });
  } catch (error) {
    if (!error?.message) {
      error.message = 'ביטול ההזמנה נכשל. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export async function acceptInvitation(invitationId, { session, signal } = {}) {
  const activeSession = ensureSession(session);
  const normalizedId = normalizeUuid(invitationId);
  if (!normalizedId) {
    throw new Error('ההזמנה שחצה אתך אינה תקינה לאישור.');
  }

  try {
    await authenticatedFetch(`invitations/${normalizedId}/accept`, {
      method: 'POST',
      session: activeSession,
      signal,
    });
  } catch (error) {
    if (error?.status === 403) {
      error.message = 'כתובת האימייל של החשבון אינה תואמת להזמנה.';
    } else if (error?.status === 409) {
      error.message = 'ההזמנה כבר עובדה. רענן את הדף לבדיקה.';
    } else if (error?.status === 410) {
      error.message = 'תוקף ההזמנה פג. בקש מאתנו קישור חדש.';
    } else if (!error?.message) {
      error.message = 'אישור ההזמנה נכשל. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export async function declineInvitation(invitationId, { session, signal } = {}) {
  const activeSession = ensureSession(session);
  const normalizedId = normalizeUuid(invitationId);
  if (!normalizedId) {
    throw new Error('ההזמנה שחצה אתך אינה תקינה לדחייה.');
  }

  try {
    await authenticatedFetch(`invitations/${normalizedId}/decline`, {
      method: 'POST',
      session: activeSession,
      signal,
    });
  } catch (error) {
    if (error?.status === 403) {
      error.message = 'כתובת האימייל של החשבון אינה תואמת להזמנה.';
    } else if (error?.status === 409) {
      error.message = 'ההזמנה כבר עובדה. רענן את הדף לבדיקה.';
    } else if (!error?.message) {
      error.message = 'דחיית ההזמנה נכשלה. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}
