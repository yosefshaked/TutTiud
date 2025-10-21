import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeAuthClient,
  getAuthClient,
  createDataClient,
  isAuthClientInitialized,
  resetAuthClient,
} from '../src/lib/supabase-manager.js';
import { verifyOrgConnection } from '../src/runtime/verification.js';

const env = globalThis.process?.env ?? {};
if (!env.VITE_APP_SUPABASE_URL) {
  env.VITE_APP_SUPABASE_URL = 'https://example.supabase.co';
}
if (!env.VITE_APP_SUPABASE_ANON_KEY) {
  env.VITE_APP_SUPABASE_ANON_KEY = 'test-anon-key';
}
if (!env.NODE_ENV) {
  env.NODE_ENV = 'test';
}

beforeEach(() => {
  if (isAuthClientInitialized()) {
    resetAuthClient();
  }
});

describe('shared Supabase client module', () => {
  it('throws when requesting the auth client before initialization', () => {
    assert.throws(() => getAuthClient(), /has not been initialized/);
  });

  it('initializes the auth singleton and returns cached clients', () => {
    const first = initializeAuthClient({
      supabaseUrl: env.VITE_APP_SUPABASE_URL,
      supabaseAnonKey: env.VITE_APP_SUPABASE_ANON_KEY,
    });

    const again = getAuthClient();
    assert.strictEqual(again, first);

    const dataClient = createDataClient({
      id: 'tenant-1',
      supabaseUrl: 'https://tenant.supabase.co',
      supabaseAnonKey: 'tenant-anon-key',
    });
    assert.ok(dataClient);
  });

  it('accepts snake_case credentials during initialization', () => {
    initializeAuthClient({
      supabase_url: env.VITE_APP_SUPABASE_URL,
      supabase_anon_key: env.VITE_APP_SUPABASE_ANON_KEY,
    });

    assert.ok(getAuthClient());
  });
});

describe('verifyOrgConnection', () => {
  it('requires a session/orgId options object', async () => {
    await assert.rejects(() => verifyOrgConnection(), /session/);
  });

  it('returns ok when leave policy settings can be fetched', async () => {
    const calls = [];
    const stubFetch = async (options) => {
      calls.push(options);
      return { exists: true, value: { enabled: true } };
    };

    const options = {
      session: { access_token: 'control-token' },
      orgId: 'org-1234',
    };

    const result = await verifyOrgConnection(options, { fetchSettings: stubFetch });

    assert.strictEqual(calls.length, 1);
    assert.deepEqual(calls[0], options);
    assert.deepEqual(result, { ok: true, settingsValue: { enabled: true } });
  });
});
