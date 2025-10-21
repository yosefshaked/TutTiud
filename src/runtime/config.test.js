import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig } from './config.js';

describe('loadRuntimeConfig', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests org keys from the dedicated API with bearer token', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type' ? 'application/json' : null;
          },
        },
        async json() {
          return {
            supabase_url: 'https://example-org.supabase.co',
            anon_key: 'anon-key-123',
          };
        },
      };
    };

    const result = await loadRuntimeConfig({ accessToken: 'token-123', orgId: 'org-456', force: true });

    assert.equal(calls.length, 1);
    const request = calls[0];
    assert.equal(request.url, '/api/org/org-456/keys');
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.headers.authorization, 'Bearer token-123');
    assert.equal(request.options.headers.Authorization, 'Bearer token-123');
    assert.equal(request.options.headers['x-supabase-authorization'], 'Bearer token-123');
    assert.equal(request.options.headers['X-Supabase-Authorization'], 'Bearer token-123');
    assert.equal('x-org-id' in request.options.headers, false);
    assert.equal(result.supabaseUrl, 'https://example-org.supabase.co');
    assert.equal(result.supabaseAnonKey, 'anon-key-123');
  });
});
