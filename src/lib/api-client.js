import { getAuthClient } from '@/lib/supabase-manager.js';

async function resolveBearerToken() {
  const authClient = getAuthClient();
  const { data, error } = await authClient.auth.getSession();

  if (error) {
    throw new Error('Authentication token not found.');
  }

  const token = data?.session?.access_token || null;

  if (!token) {
    throw new Error('Authentication token not found.');
  }

  return token;
}

export async function authenticatedFetch(path, { session: _session, accessToken: _accessToken, ...options } = {}) {
  const token = await resolveBearerToken();
  const bearer = `Bearer ${token}`;

  const { headers: customHeaders = {}, body, ...rest } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  headers.Authorization = bearer;
  headers.authorization = bearer;
  headers['X-Supabase-Authorization'] = bearer;
  headers['x-supabase-authorization'] = bearer;
  headers['x-supabase-auth'] = bearer;

  let requestBody = body;
  if (requestBody && typeof requestBody === 'object' && !(requestBody instanceof FormData)) {
    requestBody = JSON.stringify(requestBody);
  }

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const response = await fetch(`/api/${normalizedPath}`, {
    ...rest,
    headers,
    body: requestBody,
  });

  let payload = null;
  const contentType = response.headers?.get?.('content-type') || response.headers?.get?.('Content-Type') || '';
  const isJson = typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message || 'An API error occurred';
    const error = new Error(message);
    error.status = response.status;
    if (payload) {
      error.data = payload;
    }
    throw error;
  }

  return payload;
}
