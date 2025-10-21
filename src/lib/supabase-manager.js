// src/lib/supabase-manager.js
/**
 * Centralized Supabase client manager.
 *
 * The auth client is initialized lazily via {@link initializeAuthClient} once
 * runtime configuration has been fetched. Call {@link getAuthClient} to access
 * the singleton after initialization. Avoid calling {@link initializeAuthClient}
 * again with different credentials unless you explicitly reset the client in a
 * controlled environment (tests may use {@link resetAuthClient}).
 */
import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'app-main-auth-session';

let authClient = null;
let lastCredentials = null;

function normalizeCredentials(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { supabaseUrl: null, supabaseAnonKey: null };
  }

  const supabaseUrl = rawConfig.supabaseUrl ?? rawConfig.supabase_url ?? null;
  const supabaseAnonKey =
    rawConfig.supabaseAnonKey ?? rawConfig.supabase_anon_key ?? rawConfig.anon_key ?? null;

  return { supabaseUrl, supabaseAnonKey };
}

function credentialsMatch(current, next) {
  if (!current || !next) {
    return false;
  }
  return current.supabaseUrl === next.supabaseUrl && current.supabaseAnonKey === next.supabaseAnonKey;
}

function isTestEnvironment() {
  const env = typeof globalThis !== 'undefined' ? globalThis.process?.env ?? {} : {};
  return env.NODE_ENV === 'test';
}

export function initializeAuthClient(config) {
  const { supabaseUrl, supabaseAnonKey } = normalizeCredentials(config);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Initialization failed: Received invalid Supabase credentials.');
  }

  if (authClient) {
    if (credentialsMatch(lastCredentials, { supabaseUrl, supabaseAnonKey })) {
      return authClient;
    }
    throw new Error(
      'Auth client has already been initialized with different credentials. Reset it before reinitializing.'
    );
  }

  authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  lastCredentials = { supabaseUrl, supabaseAnonKey };
  return authClient;
}

export function getAuthClient() {
  if (!authClient) {
    throw new Error('Auth client has not been initialized yet. Call initializeAuthClient first.');
  }
  return authClient;
}

export function isAuthClientInitialized() {
  return authClient !== null;
}

export function resetAuthClient() {
  if (!isTestEnvironment()) {
    throw new Error('resetAuthClient is only available when NODE_ENV is "test".');
  }
  authClient = null;
  lastCredentials = null;
}

// --- Data Client Factory ---
// This function will create isolated data clients on demand.

export function createDataClient(orgConfig) {
  const { supabaseUrl, supabaseAnonKey } = normalizeCredentials(orgConfig);
  const orgId =
    orgConfig?.id ?? orgConfig?.orgId ?? orgConfig?.organization_id ?? orgConfig?.organizationId ?? null;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[DataClient] Cannot create data client without URL and Key for org:', orgId);
    return null;
  }

  console.log(`[DataClient] Creating new data client for org: ${orgId ?? 'unknown'}`);

  return createClient(supabaseUrl, supabaseAnonKey, {
    // Absolute isolation settings
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
