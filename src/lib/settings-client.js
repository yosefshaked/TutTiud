import { fetchSettingsValue as fetchSettingsValueApi } from '@/api/settings.js';

function normalizeOrgId(options) {
  if (!options) {
    return '';
  }
  const candidate = options.orgId
    ?? options.organizationId
    ?? options.org_id
    ?? options.organization_id
    ?? null;
  if (typeof candidate !== 'string') {
    return '';
  }
  return candidate.trim();
}

function normalizeOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('נדרש להעביר פרטי Session וזיהוי ארגון לקריאת הגדרות.');
  }

  const session = options.session ?? options.accessToken ?? options.token ?? null;
  if (!session) {
    throw new Error('נדרשת התחברות פעילה כדי לקרוא הגדרות ארגון.');
  }

  const orgId = normalizeOrgId(options);
  if (!orgId) {
    throw new Error('נדרש מזהה ארגון תקף לקריאת הגדרות.');
  }

  const signal = options.signal ?? null;

  return { session, orgId, signal };
}

export async function fetchSettingsValue(options, key) {
  if (!key) {
    throw new Error('נדרש מפתח הגדרה לקריאה.');
  }
  const normalized = normalizeOptions(options);
  return fetchSettingsValueApi({ ...normalized, key });
}

export async function fetchLeavePolicySettings(options) {
  return fetchSettingsValue(options, 'leave_policy');
}

export async function fetchLeavePayPolicySettings(options) {
  return fetchSettingsValue(options, 'leave_pay_policy');
}

export async function fetchEmploymentScopePolicySettings(options) {
  return fetchSettingsValue(options, 'employment_scope_policy');
}
