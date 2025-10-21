import { authenticatedFetch } from '@/lib/api-client.js';

function normalizeOrgId(orgId) {
  if (typeof orgId !== 'string') {
    return '';
  }
  return orgId.trim();
}

function ensureSession(session) {
  if (!session) {
    throw new Error('נדרשת התחברות כדי לגשת להגדרות.');
  }
  return session;
}

function ensureSettingsObject(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('יש לספק אובייקט הגדרות תקין.');
  }
  return settings;
}

async function requestSettings(method, { session, orgId, body, signal } = {}) {
  const validatedSession = ensureSession(session);
  const normalizedOrgId = normalizeOrgId(orgId);

  if (!normalizedOrgId) {
    throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
  }

  const hasBody = typeof body !== 'undefined';
  const payload = hasBody && body && typeof body === 'object' && !(body instanceof FormData)
    ? { ...body, org_id: normalizedOrgId }
    : body;

  const options = {
    session: validatedSession,
    method,
    signal,
  };

  if (typeof payload !== 'undefined') {
    options.body = payload;
  }

  const search = method === 'GET' ? `?org_id=${encodeURIComponent(normalizedOrgId)}` : '';
  return authenticatedFetch(`settings${search}`, options);
}

export async function fetchSettings({ session, orgId, signal } = {}) {
  const response = await requestSettings('GET', { session, orgId, signal });
  const map = response?.settings && typeof response.settings === 'object'
    ? response.settings
    : {};
  return map;
}

export async function fetchSettingsValue({ session, orgId, signal, key } = {}) {
  if (!key) {
    throw new Error('נדרש מפתח הגדרה לקריאה.');
  }
  const settings = await fetchSettings({ session, orgId, signal });
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    return { exists: true, value: settings[key] };
  }
  return { exists: false, value: null };
}

export async function upsertSettings({ session, orgId, settings, signal } = {}) {
  const payload = ensureSettingsObject(settings);
  return requestSettings('POST', {
    session,
    orgId,
    signal,
    body: { settings: payload },
  });
}

export async function upsertSetting({ session, orgId, key, value, signal } = {}) {
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey) {
    throw new Error('נדרש מפתח הגדרה תקף לעדכון.');
  }
  return upsertSettings({
    session,
    orgId,
    signal,
    settings: { [normalizedKey]: value },
  });
}
