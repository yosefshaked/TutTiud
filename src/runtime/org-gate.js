import {
  activateOrg,
  clearOrg,
  waitOrgReady,
  getOrgOrThrow,
  getCurrentOrg,
} from '@/lib/org-runtime.js';
import { createDataClient } from '@/lib/supabase-manager.js';

const dataClientCache = new Map();

export function activateRuntimeOrg(config) {
  return activateOrg(config);
}

export function clearRuntimeOrg() {
  clearOrg();
  dataClientCache.clear();
}

export function waitRuntimeOrgReady() {
  return waitOrgReady();
}

export function getRuntimeOrgOrThrow() {
  return getOrgOrThrow();
}

export function getRuntimeOrg() {
  return getCurrentOrg();
}

export function getRuntimeSupabase() {
  const config = getOrgOrThrow();
  const orgId = config?.orgId || config?.id;
  if (!orgId) {
    throw new Error('MissingRuntimeConfigError');
  }
  const cached = dataClientCache.get(orgId);
  if (cached) {
    return cached;
  }
  const client = createDataClient({
    supabase_url: config.supabaseUrl || config.supabase_url,
    supabase_anon_key: config.supabaseAnonKey || config.supabase_anon_key,
    id: orgId,
  });
  if (!client) {
    throw new Error('Failed to create Supabase client for runtime org.');
  }
  dataClientCache.set(orgId, client);
  return client;
}

export function getCachedRuntimeSupabase(orgId) {
  if (!orgId) return null;
  return dataClientCache.get(orgId) || null;
}

export function resetRuntimeSupabase(orgId) {
  if (!orgId) {
    dataClientCache.clear();
    return;
  }
  dataClientCache.delete(orgId);
}
