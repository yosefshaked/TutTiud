import { MissingRuntimeConfigError } from './error-utils.js';

const IS_DEV = Boolean(import.meta?.env?.DEV);

if (IS_DEV) {
  console.debug('[org-runtime] module evaluated');
}

let currentOrg = null;
let readyResolve = () => {};
let readyPromise = createReadyPromise();

function createReadyPromise() {
  return new Promise((resolve) => {
    readyResolve = resolve;
  });
}

function normalizeOrgConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const orgId = typeof raw.orgId === 'string' ? raw.orgId.trim() : '';
  const supabaseUrl = typeof raw.supabaseUrl === 'string' ? raw.supabaseUrl.trim() : '';
  const supabaseAnonKey = typeof raw.supabaseAnonKey === 'string' ? raw.supabaseAnonKey.trim() : '';

  if (!orgId || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { orgId, supabaseUrl, supabaseAnonKey };
}

export function activateOrg(config) {
  const normalized = normalizeOrgConfig(config);

  if (!normalized) {
    throw new MissingRuntimeConfigError('supabase_url ו-anon_key נדרשים להפעלת החיבור.');
  }

  currentOrg = normalized;
  readyResolve();
  return currentOrg;
}

export function clearOrg() {
  currentOrg = null;
  readyPromise = createReadyPromise();
}

export async function waitOrgReady() {
  return readyPromise;
}

export function getOrgOrThrow() {
  if (!currentOrg) {
    throw new MissingRuntimeConfigError('לא נבחר ארגון פעיל או שהחיבור שלו טרם הוגדר.');
  }
  return currentOrg;
}

export function getCurrentOrg() {
  return currentOrg;
}
