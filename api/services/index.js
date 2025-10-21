/* eslint-env node */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash, createDecipheriv } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { json, resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readEnv(context) {
  if (context?.env && typeof context.env === 'object') {
    return context.env;
  }
  return process.env ?? {};
}

function respond(context, status, body, extraHeaders) {
  const response = json(status, body, extraHeaders);
  context.res = response;
  return response;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function resolveEncryptionSecret(env) {
  const candidates = [
    env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY,
    env.ORG_CREDENTIALS_ENCRYPTION_KEY,
    env.APP_SECRET_ENCRYPTION_KEY,
    env.APP_ENCRYPTION_KEY,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function decodeKeyMaterial(secret) {
  const attempts = [
    () => Buffer.from(secret, 'base64'),
    () => Buffer.from(secret, 'hex'),
  ];

  for (const attempt of attempts) {
    try {
      const buffer = attempt();
      if (buffer.length) {
        return buffer;
      }
    } catch {
      // ignore and try next format
    }
  }

  return Buffer.from(secret, 'utf8');
}

function deriveEncryptionKey(secret) {
  const normalized = normalizeString(secret);
  if (!normalized) {
    return null;
  }

  let keyBuffer = decodeKeyMaterial(normalized);

  if (keyBuffer.length < 32) {
    keyBuffer = createHash('sha256').update(keyBuffer).digest();
  }

  if (keyBuffer.length > 32) {
    keyBuffer = keyBuffer.subarray(0, 32);
  }

  if (keyBuffer.length < 32) {
    return null;
  }

  return keyBuffer;
}

function decryptDedicatedKey(payload, keyBuffer) {
  const normalized = normalizeString(payload);
  if (!normalized || !keyBuffer) {
    return null;
  }

  const segments = normalized.split(':');
  if (segments.length !== 5) {
    return null;
  }

  const [, mode, ivPart, authTagPart, cipherPart] = segments;
  if (mode !== 'gcm') {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, 'base64');
    const authTag = Buffer.from(authTagPart, 'base64');
    const cipherText = Buffer.from(cipherPart, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function parseRequestBody(req) {
  if (req?.body && typeof req.body === 'object') {
    return req.body;
  }

  const rawBody = typeof req?.body === 'string'
    ? req.body
    : typeof req?.rawBody === 'string'
      ? req.rawBody
      : null;

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function isValidOrgId(value) {
  return UUID_PATTERN.test(value);
}

function isAdminRole(role) {
  if (!role) {
    return false;
  }
  const normalized = String(role).trim().toLowerCase();
  return normalized === 'admin' || normalized === 'owner';
}

function createTenantClient({ supabaseUrl, anonKey, dedicatedKey }) {
  if (!supabaseUrl || !anonKey || !dedicatedKey) {
    throw new Error('Missing tenant connection parameters.');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${dedicatedKey}`,
      },
    },
  });
}

async function fetchOrgConnection(supabase, orgId) {
  const [{ data: settings, error: settingsError }, { data: organization, error: orgError }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('supabase_url, anon_key')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('dedicated_key_encrypted')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  if (settingsError) {
    return { error: settingsError };
  }

  if (orgError) {
    return { error: orgError };
  }

  if (!settings || !settings.supabase_url || !settings.anon_key) {
    return { error: new Error('missing_connection_settings') };
  }

  if (!organization || !organization.dedicated_key_encrypted) {
    return { error: new Error('missing_dedicated_key') };
  }

  return {
    supabaseUrl: settings.supabase_url,
    anonKey: settings.anon_key,
    encryptedKey: organization.dedicated_key_encrypted,
  };
}

async function ensureMembership(supabase, orgId, userId) {
  const { data, error } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data.role || 'member';
}

function normalizeServicePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = { ...raw };
  if ('id' in payload) {
    delete payload.id;
  }
  return payload;
}

function normalizeServiceUpdates(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return { ...raw };
}

function resolveServiceId(context, body) {
  const candidate = context.bindingData?.serviceId || body.service_id || body.serviceId || body.id;
  const normalized = normalizeString(candidate);
  if (normalized) {
    return normalized;
  }
  const numericId = Number(candidate);
  if (!Number.isNaN(numericId) && numericId > 0) {
    return numericId;
  }
  return null;
}

export default async function (context, req) {
  context.log?.info?.('services API invoked');

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('services missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  const { supabaseUrl, serviceRoleKey } = adminConfig;

  if (!supabaseUrl || !serviceRoleKey) {
    context.log?.error?.('services missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('services failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('services token did not resolve to user');
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const method = String(req.method || 'GET').toUpperCase();
  const body = method === 'GET' ? {} : parseRequestBody(req);
  const query = req?.query ?? {};
  const orgCandidate = body.org_id || body.orgId || query.org_id || query.orgId;
  const orgId = normalizeString(orgCandidate);

  if (!orgId || !isValidOrgId(orgId)) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
    if (!role) {
      return respond(context, 403, { message: 'forbidden' });
    }

    if ((method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') && !isAdminRole(role)) {
      return respond(context, 403, { message: 'forbidden' });
    }
  } catch (membershipError) {
    context.log?.error?.('services failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  const connectionResult = await fetchOrgConnection(supabase, orgId);
  if (connectionResult.error) {
    const message = connectionResult.error.message || 'failed_to_load_connection';
    const status = message === 'missing_connection_settings' ? 412 : message === 'missing_dedicated_key' ? 428 : 500;
    return respond(context, status, { message });
  }

  const encryptionSecret = resolveEncryptionSecret(env);
  const encryptionKey = deriveEncryptionKey(encryptionSecret);

  if (!encryptionKey) {
    context.log?.error?.('services missing encryption secret');
    return respond(context, 500, { message: 'encryption_not_configured' });
  }

  const dedicatedKey = decryptDedicatedKey(connectionResult.encryptedKey, encryptionKey);
  if (!dedicatedKey) {
    return respond(context, 500, { message: 'failed_to_decrypt_key' });
  }

  let tenantClient;
  try {
    tenantClient = createTenantClient({
      supabaseUrl: connectionResult.supabaseUrl,
      anonKey: connectionResult.anonKey,
      dedicatedKey,
    });
  } catch (clientError) {
    context.log?.error?.('services failed to create tenant client', { message: clientError?.message });
    return respond(context, 500, { message: 'failed_to_connect_tenant' });
  }

  if (method === 'GET') {
    const { data, error } = await tenantClient
      .from('Services')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      context.log?.error?.('services fetch failed', { message: error?.message });
      return respond(context, 500, { message: 'failed_to_fetch_services' });
    }

    return respond(context, 200, { services: data ?? [] });
  }

  if (method === 'POST') {
    const payload = normalizeServicePayload(body.service || body.data || body);
    if (!payload) {
      return respond(context, 400, { message: 'invalid service payload' });
    }

    const { data, error } = await tenantClient
      .from('Services')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      context.log?.error?.('services insert failed', { message: error.message });
      return respond(context, 500, { message: 'failed_to_create_service' });
    }

    return respond(context, 201, { service_id: data?.id ?? null });
  }

  if (method === 'PATCH' || method === 'PUT') {
    const serviceId = resolveServiceId(context, body);
    if (!serviceId) {
      return respond(context, 400, { message: 'invalid service id' });
    }

    const updates = normalizeServiceUpdates(body.updates || body.service || body.data);
    if (!updates) {
      return respond(context, 400, { message: 'invalid service payload' });
    }

    if ('org_id' in updates) {
      delete updates.org_id;
    }
    if ('orgId' in updates) {
      delete updates.orgId;
    }

    const { error } = await tenantClient
      .from('Services')
      .update(updates)
      .eq('id', serviceId);

    if (error) {
      context.log?.error?.('services update failed', { message: error.message, serviceId });
      return respond(context, 500, { message: 'failed_to_update_service' });
    }

    return respond(context, 200, { updated: true });
  }

  if (method === 'DELETE') {
    const serviceId = resolveServiceId(context, body);
    if (!serviceId) {
      return respond(context, 400, { message: 'invalid service id' });
    }

    const { error, count } = await tenantClient
      .from('Services')
      .delete({ count: 'exact' })
      .eq('id', serviceId);

    if (error) {
      context.log?.error?.('services delete failed', { message: error.message, serviceId });
      return respond(context, 500, { message: 'failed_to_delete_service' });
    }

    if (!count) {
      return respond(context, 404, { message: 'service_not_found' });
    }

    return respond(context, 200, { deleted: true });
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PATCH,PUT,DELETE' });
}
