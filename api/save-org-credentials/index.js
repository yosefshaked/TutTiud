/* eslint-env node */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
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

function encryptDedicatedKey(plainText, keyBuffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:gcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
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

export default async function (context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  const { supabaseUrl, serviceRoleKey } = adminConfig;

  if (!supabaseUrl || !serviceRoleKey) {
    context.log?.error?.('save-org-credentials missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const encryptionSecret = resolveEncryptionSecret(env);
  const encryptionKey = deriveEncryptionKey(encryptionSecret);

  if (!encryptionKey) {
    context.log?.error?.('save-org-credentials missing encryption secret');
    return respond(context, 500, { message: 'encryption_not_configured' });
  }

  const authorization = resolveBearerAuthorization(req);
  const hasBearer = Boolean(authorization?.token);

  if (!hasBearer) {
    context.log?.warn?.('save-org-credentials missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('save-org-credentials failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('save-org-credentials token did not resolve to user');
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseRequestBody(req);
  const orgId = normalizeString(body.org_id || body.orgId);
  const dedicatedKey = normalizeString(body.dedicated_key || body.dedicatedKey);

  if (!orgId || !isValidOrgId(orgId)) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  if (!dedicatedKey) {
    return respond(context, 400, { message: 'missing dedicated key' });
  }

  const membershipResult = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipResult.error) {
    context.log?.error?.('save-org-credentials failed to load membership', {
      orgId,
      userId,
      message: membershipResult.error.message,
    });
    return respond(context, 500, { message: 'failed to verify membership' });
  }

  if (!membershipResult.data || !isAdminRole(membershipResult.data.role)) {
    context.log?.warn?.('save-org-credentials forbidden', {
      orgId,
      userId,
      hasMembership: Boolean(membershipResult.data),
    });
    return respond(context, 403, { message: 'forbidden' });
  }

  const encryptedKey = encryptDedicatedKey(dedicatedKey, encryptionKey);
  const savedAt = new Date().toISOString();

  const baseUpdates = {
    dedicated_key_encrypted: encryptedKey,
    updated_at: savedAt,
  };

  let updateError = null;
  const { error: primaryError } = await supabase
    .from('organizations')
    .update({
      ...baseUpdates,
      dedicated_key_saved_at: savedAt,
    })
    .eq('id', orgId);

  if (primaryError?.code === '42703') {
    const { error: fallbackError } = await supabase
      .from('organizations')
      .update(baseUpdates)
      .eq('id', orgId);
    updateError = fallbackError;
  } else {
    updateError = primaryError;
  }

  if (updateError) {
    context.log?.error?.('save-org-credentials update failed', {
      orgId,
      userId,
      message: updateError.message,
      code: updateError.code,
    });
    return respond(context, 500, { message: 'failed to store dedicated key' });
  }

  context.log?.info?.('save-org-credentials success', { orgId, userId });
  return respond(context, 200, { saved: true, saved_at: savedAt });
}
