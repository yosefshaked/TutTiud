/* eslint-env node */
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { json, resolveBearerAuthorization } from '../_shared/http.js';

function readEnv(context) {
  return context?.env ?? process.env ?? {};
}

async function parseJsonResponse(response) {
  const contentType = response.headers?.get?.('content-type') ?? response.headers?.get?.('Content-Type') ?? '';
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  try {
    const text = await response.text();
    if (!text) {
      return {};
    }
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toStringOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function readHeaderValue(request, name) {
  const headers = request?.headers;
  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    const value = headers.get(name) ?? headers.get(name.toLowerCase());
    if (value) {
      return value;
    }
  }

  const lowerName = name.toLowerCase();
  if (typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (String(key).toLowerCase() === lowerName) {
        return headers[key];
      }
    }
  }

  return null;
}

function resolveTraceId(request) {
  const headerTrace =
    readHeaderValue(request, 'x-debug-trace') ??
    readHeaderValue(request, 'x-request-id') ??
    readHeaderValue(request, 'traceparent');

  if (headerTrace) {
    return String(headerTrace);
  }

  if (typeof randomUUID === 'function') {
    try {
      return randomUUID();
    } catch {
      // ignore and fall back
    }
  }

  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function isDebugEnabled(request) {
  const fromHeader =
    readHeaderValue(request, 'x-debug') ??
    readHeaderValue(request, 'x-org-keys-debug') ??
    readHeaderValue(request, 'x-functions-debug');

  const fromQuery = request?.query ?? {};
  const queryFlag =
    toStringOrNull(fromQuery.debug) ??
    toStringOrNull(fromQuery.diagnostics) ??
    toStringOrNull(fromQuery.trace);

  const source = toStringOrNull(fromHeader) ?? queryFlag;
  if (!source) {
    return false;
  }

  const normalized = source.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'debug';
}

function createDiagnostics(context, request) {
  const traceId = resolveTraceId(request);
  const enabled = isDebugEnabled(request);
  const events = [];

  function record(step, details) {
    if (!enabled) {
      return;
    }

    const payload = { step };
    if (details && typeof details === 'object') {
      for (const [key, value] of Object.entries(details)) {
        if (value === undefined) {
          continue;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
          payload[key] = value;
          continue;
        }
        if (value instanceof Error) {
          payload[key] = value.message;
          continue;
        }
        try {
          payload[key] = JSON.parse(JSON.stringify(value));
        } catch {
          payload[key] = String(value);
        }
      }
    }

    events.push(payload);
    context.log?.info?.('org-keys debug', { traceId, ...payload });
  }

  function attach(body) {
    if (!enabled) {
      return body;
    }

    const safeBody = Array.isArray(body)
      ? [...body]
      : (body && typeof body === 'object' ? { ...body } : { value: body });

    safeBody.debug = {
      traceId,
      events,
    };
    return safeBody;
  }

  function headers(extra = {}) {
    return {
      'x-debug-trace': traceId,
      ...(enabled ? { 'x-debug-enabled': '1' } : {}),
      ...extra,
    };
  }

  return { enabled, traceId, record, attach, headers };
}

export default async function (context, req) {
  const env = readEnv(context);
  const orgId = context.bindingData?.orgId;
  const diagnostics = createDiagnostics(context, req);

  function respond(status, body, extraHeaders) {
    const response = json(status, diagnostics.attach(body), diagnostics.headers(extraHeaders));
    context.res = response;
    return response;
  }

  diagnostics.record('request.received', { orgIdPresent: Boolean(orgId) });

  if (!orgId) {
    context.log?.warn?.('org-keys missing orgId', { traceId: diagnostics.traceId });
    return respond(400, { message: 'missing org id' });
  }

  const authorization = resolveBearerAuthorization(req);
  const hasBearer = Boolean(authorization?.token);

  diagnostics.record('authorization.checked', { hasBearer });

  if (!hasBearer) {
    context.log?.warn?.('org-keys missing bearer', { orgId, traceId: diagnostics.traceId });
    return respond(401, { message: 'missing bearer' });
  }

  const supabaseUrl = env.APP_SUPABASE_URL;
  const anonKey = env.APP_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    context.log?.error?.('org-keys missing Supabase environment values', { traceId: diagnostics.traceId });
    diagnostics.record('environment.missing', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
    });
    return respond(500, { message: 'server_misconfigured' });
  }

  const rpcUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_org_public_keys`;
  let rpcResponse;

  try {
    rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anonKey,
        authorization: authorization.header,
      },
      body: JSON.stringify({ p_org_id: orgId }),
    });
  } catch (error) {
    context.log?.error?.('org-keys rpc request failed', {
      orgId,
      hasBearer,
      traceId: diagnostics.traceId,
      message: error?.message,
    });
    diagnostics.record('rpc.error', {
      stage: 'network',
      message: error?.message ?? null,
    });
    return respond(502, { message: 'failed to reach control database' });
  }

  const payload = await parseJsonResponse(rpcResponse);

  diagnostics.record('rpc.response', {
    status: rpcResponse.status,
    ok: rpcResponse.ok,
    payloadType: Array.isArray(payload) ? 'array' : typeof payload,
  });

  if (!rpcResponse.ok) {
    context.log?.info?.('org-keys rpc error', {
      orgId,
      hasBearer,
      traceId: diagnostics.traceId,
      status: rpcResponse.status,
    });
    diagnostics.record('rpc.errorResponse', {
      status: rpcResponse.status,
    });
    return respond(rpcResponse.status, payload && typeof payload === 'object' ? payload : {});
  }

  const record = Array.isArray(payload)
    ? payload.find((entry) => entry && typeof entry === 'object' && entry.supabase_url && entry.anon_key)
    : (payload && typeof payload === 'object' ? payload : null);

  if (!record || typeof record.supabase_url !== 'string' || typeof record.anon_key !== 'string') {
    context.log?.info?.('org-keys missing configuration', {
      orgId,
      hasBearer,
      traceId: diagnostics.traceId,
      status: 404,
    });
    diagnostics.record('rpc.noConfiguration', {});
    return respond(404, { message: 'org not found or no access' });
  }

  context.log?.info?.('org-keys success', {
    orgId,
    hasBearer,
    traceId: diagnostics.traceId,
    status: 200,
  });

  diagnostics.record('rpc.success', { orgHasConfig: true });

  const supabaseUrlValue = record.supabase_url;
  const anonKeyValue = record.anon_key;

  return respond(200, {
    orgId,
    source: 'org-api',
    supabaseUrl: supabaseUrlValue,
    supabase_url: supabaseUrlValue,
    supabaseAnonKey: anonKeyValue,
    supabase_anon_key: anonKeyValue,
    anonKey: anonKeyValue,
    anon_key: anonKeyValue,
  });
}
