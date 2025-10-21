/* eslint-env node */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash, createDecipheriv } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { json, resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import { buildLedgerEntryFromSession } from '../_shared/leave-ledger.js';

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

function normalizeDateFilter(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }
  return normalized;
}

function normalizeSessionPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = { ...raw };
  if ('id' in payload) {
    delete payload.id;
  }
  if ('org_id' in payload) {
    delete payload.org_id;
  }
  if ('_localId' in payload) {
    delete payload._localId;
  }
  Object.keys(payload).forEach((key) => {
    if (typeof payload[key] === 'undefined') {
      delete payload[key];
    }
  });
  return payload;
}

function parseMetadataObject(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractLocalIdFromMetadata(metadata) {
  const parsed = parseMetadataObject(metadata);
  if (!parsed) {
    return null;
  }
  const candidate = parsed._localId;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function sanitizeMetadataMailbox(metadata) {
  const parsed = parseMetadataObject(metadata);
  if (!parsed) {
    return { metadata: null, changed: false };
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, '_localId')) {
    return { metadata: parsed, changed: false };
  }
  const { _localId, ...rest } = parsed;
  const cleaned = {};
  Object.keys(rest).forEach((key) => {
    if (typeof rest[key] !== 'undefined') {
      cleaned[key] = rest[key];
    }
  });
  if (Object.keys(cleaned).length === 0) {
    return { metadata: null, changed: true };
  }
  return { metadata: cleaned, changed: true };
}

function normalizeSessionUpdates(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const updates = { ...raw };
  if ('id' in updates) {
    delete updates.id;
  }
  if ('org_id' in updates) {
    delete updates.org_id;
  }
  return Object.keys(updates).length > 0 ? updates : null;
}

function resolveSessionId(context, body) {
  const candidate = context.bindingData?.sessionId || body.session_id || body.sessionId || body.id;
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

async function fetchWorkSessions(tenantClient, filters = {}) {
  let queryBuilder = tenantClient
    .from('WorkSessions')
    .select('*');

  if (filters.startDate) {
    queryBuilder = queryBuilder.gte('date', filters.startDate);
  }

  if (filters.endDate) {
    queryBuilder = queryBuilder.lte('date', filters.endDate);
  }

  const { data, error } = await queryBuilder.order('date', { ascending: true });
  if (error) {
    return { error };
  }

  return { data: data || [] };
}

async function deleteLedgerForSession(tenantClient, sessionId) {
  if (!sessionId) {
    return { count: 0 };
  }
  const result = await tenantClient
    .from('LeaveBalances')
    .delete({ count: 'exact' })
    .eq('work_session_id', sessionId);
  if (result.error) {
    return { error: result.error };
  }
  return { count: result.count || 0 };
}

async function insertLedgerForSession(tenantClient, session) {
  const ledgerEntry = buildLedgerEntryFromSession(session);
  if (!ledgerEntry) {
    return { inserted: null };
  }
  if (!ledgerEntry.work_session_id && session?.id) {
    ledgerEntry.work_session_id = session.id;
  }
  const insertResult = await tenantClient
    .from('LeaveBalances')
    .insert(ledgerEntry)
    .select('*')
    .maybeSingle();
  if (insertResult.error) {
    return { error: insertResult.error };
  }
  return { inserted: insertResult.data || ledgerEntry };
}

export default async function (context, req) {
  context.log?.info?.('work-sessions API invoked');

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('work-sessions missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  const { supabaseUrl, serviceRoleKey } = adminConfig;

  if (!supabaseUrl || !serviceRoleKey) {
    context.log?.error?.('work-sessions missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('work-sessions failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('work-sessions token did not resolve to user');
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
    context.log?.error?.('work-sessions failed to verify membership', {
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
    context.log?.error?.('work-sessions missing encryption secret');
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
    context.log?.error?.('work-sessions failed to create tenant client', { message: clientError?.message });
    return respond(context, 500, { message: 'failed_to_connect_tenant' });
  }

  if (method === 'GET') {
    const startDate = normalizeDateFilter(query.start_date || query.startDate);
    const endDate = normalizeDateFilter(query.end_date || query.endDate);

    const sessionsResult = await fetchWorkSessions(tenantClient, {
      startDate,
      endDate,
    });

    if (sessionsResult.error) {
      context.log?.error?.('work-sessions fetch failed', { message: sessionsResult.error.message });
      return respond(context, 500, { message: 'failed_to_fetch_sessions' });
    }

    return respond(context, 200, { sessions: sessionsResult.data });
  }

  if (method === 'POST') {
    const sessions = Array.isArray(body.sessions)
      ? body.sessions
      : Array.isArray(body.workSessions)
        ? body.workSessions
        : Array.isArray(body.data)
          ? body.data
          : [];

    if (!sessions.length) {
      return respond(context, 400, { message: 'invalid sessions payload' });
    }

    const preparedSessions = [];
    let missingMailbox = false;

    sessions.forEach((entry) => {
      const payload = normalizeSessionPayload(entry);
      if (!payload) {
        return;
      }
      const rawLocalId = entry && typeof entry === 'object' ? entry._localId : null;
      const fallbackLocalId = typeof rawLocalId === 'string' && rawLocalId ? rawLocalId : null;
      const parsedMetadata = parseMetadataObject(payload.metadata);
      const metadataObject = parsedMetadata ? { ...parsedMetadata } : {};
      if (parsedMetadata) {
        payload.metadata = metadataObject;
      }
      let mailboxId = typeof metadataObject._localId === 'string' && metadataObject._localId ? metadataObject._localId : null;

      if (!mailboxId && fallbackLocalId) {
        metadataObject._localId = fallbackLocalId;
        payload.metadata = metadataObject;
        mailboxId = fallbackLocalId;
      }

      if (!mailboxId) {
        missingMailbox = true;
        return;
      }

      preparedSessions.push({
        payload,
        localId: mailboxId,
      });
    });

    if (!preparedSessions.length || missingMailbox) {
      return respond(context, 400, { message: 'invalid sessions payload' });
    }

    const insertPayload = preparedSessions.map(item => item.payload);

    const { data, error } = await tenantClient
      .from('WorkSessions')
      .insert(insertPayload)
      .select('*');

    if (error) {
      context.log?.error?.('work-sessions insert failed', { message: error.message });
      return respond(context, 500, { message: 'failed_to_create_sessions' });
    }

    const createdRows = Array.isArray(data) ? data : [];

    const cleanupNullIds = [];
    const cleanupObjectTargets = [];

    const createdWithLocalIds = createdRows.map((row) => {
      const mailboxId = extractLocalIdFromMetadata(row?.metadata);
      const { metadata: sanitizedMetadata, changed } = sanitizeMetadataMailbox(row.metadata);
      if (row && row.id && changed) {
        if (!sanitizedMetadata || (typeof sanitizedMetadata === 'object' && Object.keys(sanitizedMetadata).length === 0)) {
          cleanupNullIds.push(row.id);
        } else {
          cleanupObjectTargets.push({ id: row.id, metadata: sanitizedMetadata });
        }
      }
      const baseRow = changed ? { ...row, metadata: sanitizedMetadata } : { ...row };
      return mailboxId ? { ...baseRow, _localId: mailboxId } : baseRow;
    });

    let cleanupError = null;

    if (cleanupNullIds.length) {
      const { error: nullCleanupError } = await tenantClient
        .from('WorkSessions')
        .update({ metadata: null })
        .in('id', cleanupNullIds);
      if (nullCleanupError) {
        cleanupError = nullCleanupError;
      }
    }

    if (!cleanupError && cleanupObjectTargets.length) {
      for (const target of cleanupObjectTargets) {
        const { error: objectCleanupError } = await tenantClient
          .from('WorkSessions')
          .update({ metadata: target.metadata })
          .eq('id', target.id);
        if (objectCleanupError) {
          cleanupError = objectCleanupError;
          break;
        }
      }
    }

    if (cleanupError) {
      context.log?.error?.('work-sessions metadata cleanup failed', { message: cleanupError.message });
      const createdIds = createdRows.map(row => row?.id).filter(Boolean);
      if (createdIds.length) {
        const { error: rollbackError } = await tenantClient
          .from('WorkSessions')
          .delete()
          .in('id', createdIds);
        if (rollbackError) {
          context.log?.error?.('work-sessions insert rollback failed', {
            message: rollbackError.message,
            createdIds,
          });
        }
      }
      return respond(context, 500, { message: 'failed_to_create_sessions' });
    }

    return respond(context, 201, { created: createdWithLocalIds });
  }

  if (method === 'PATCH' || method === 'PUT') {
    const sessionId = resolveSessionId(context, body);
    if (!sessionId) {
      return respond(context, 400, { message: 'invalid session id' });
    }

    const isRestore = body && typeof body === 'object' && body.restore === true;

    if (isRestore) {
      const { data: existingSession, error: fetchError } = await tenantClient
        .from('WorkSessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (fetchError) {
        context.log?.error?.('work-sessions restore lookup failed', { message: fetchError.message, sessionId });
        return respond(context, 500, { message: 'failed_to_restore_session' });
      }

      if (!existingSession) {
        return respond(context, 404, { message: 'session_not_found' });
      }

      const { error: updateError, data: updatedRows } = await tenantClient
        .from('WorkSessions')
        .update({ deleted: false, deleted_at: null })
        .eq('id', sessionId)
        .select('*');

      if (updateError) {
        context.log?.error?.('work-sessions restore failed', { message: updateError.message, sessionId });
        return respond(context, 500, { message: 'failed_to_restore_session' });
      }

      if (!updatedRows || updatedRows.length === 0) {
        return respond(context, 404, { message: 'session_not_found' });
      }

      const restoredSession = updatedRows[0];

      const cleanupResult = await deleteLedgerForSession(tenantClient, sessionId);
      if (cleanupResult.error) {
        await tenantClient
          .from('WorkSessions')
          .update({ deleted: existingSession.deleted, deleted_at: existingSession.deleted_at })
          .eq('id', sessionId);
        context.log?.error?.('work-sessions restore ledger cleanup failed', { message: cleanupResult.error.message, sessionId });
        return respond(context, 500, { message: 'failed_to_restore_session' });
      }

      const ledgerResult = await insertLedgerForSession(tenantClient, restoredSession);
      if (ledgerResult.error) {
        await tenantClient
          .from('WorkSessions')
          .update({ deleted: true, deleted_at: existingSession.deleted_at || new Date().toISOString() })
          .eq('id', sessionId);
        context.log?.error?.('work-sessions restore ledger insert failed', { message: ledgerResult.error.message, sessionId });
        return respond(context, 500, { message: 'failed_to_restore_session' });
      }

      return respond(context, 200, { restored: true, session: restoredSession, ledger: ledgerResult.inserted || null });
    }

    const updates = normalizeSessionUpdates(body.updates || body.session || body.workSession || body.data);

    if (!updates) {
      return respond(context, 400, { message: 'invalid session payload' });
    }

    const { error, data } = await tenantClient
      .from('WorkSessions')
      .update(updates)
      .eq('id', sessionId)
      .select('id');

    if (error) {
      context.log?.error?.('work-sessions update failed', { message: error.message, sessionId });
      return respond(context, 500, { message: 'failed_to_update_session' });
    }

    if (!data || data.length === 0) {
      return respond(context, 404, { message: 'session_not_found' });
    }

    return respond(context, 200, { updated: true });
  }

  if (method === 'DELETE') {
    const sessionId = resolveSessionId(context, body);
    if (!sessionId) {
      return respond(context, 400, { message: 'invalid session id' });
    }

    const permanentFlag = normalizeString(req?.query?.permanent ?? context.bindingData?.permanent);

    const wantsPermanent = permanentFlag === 'true' || permanentFlag === '1';

    const { data: sessionRow, error: fetchError } = await tenantClient
      .from('WorkSessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (fetchError) {
      context.log?.error?.('work-sessions delete lookup failed', { message: fetchError.message, sessionId });
      return respond(context, 500, { message: 'failed_to_delete_session' });
    }

    if (!sessionRow) {
      return respond(context, 404, { message: 'session_not_found' });
    }

    if (wantsPermanent) {
      const cleanupResult = await deleteLedgerForSession(tenantClient, sessionId);
      if (cleanupResult.error) {
        context.log?.error?.('work-sessions permanent delete ledger cleanup failed', { message: cleanupResult.error.message, sessionId });
        return respond(context, 500, { message: 'failed_to_permanently_delete_session' });
      }

      const { error: deleteError, data } = await tenantClient
        .from('WorkSessions')
        .delete()
        .eq('id', sessionId)
        .select('id');

      if (deleteError) {
        const rollbackLedger = await insertLedgerForSession(tenantClient, sessionRow);
        if (rollbackLedger.error) {
          context.log?.error?.('work-sessions permanent delete rollback ledger failed', { message: rollbackLedger.error.message, sessionId });
        }
        context.log?.error?.('work-sessions permanent delete failed', { message: deleteError.message, sessionId });
        return respond(context, 500, { message: 'failed_to_permanently_delete_session' });
      }

      if (!data || data.length === 0) {
        const rollbackLedger = await insertLedgerForSession(tenantClient, sessionRow);
        if (rollbackLedger.error) {
          context.log?.error?.('work-sessions permanent delete rollback ledger failed', { message: rollbackLedger.error.message, sessionId });
        }
        return respond(context, 404, { message: 'session_not_found' });
      }

      return respond(context, 200, { deleted: true, permanent: true });
    }

    const timestamp = new Date().toISOString();
    const { error: softDeleteError, data: updatedRows } = await tenantClient
      .from('WorkSessions')
      .update({ deleted: true, deleted_at: timestamp })
      .eq('id', sessionId)
      .select('*');

    if (softDeleteError) {
      context.log?.error?.('work-sessions soft delete failed', { message: softDeleteError.message, sessionId });
      return respond(context, 500, { message: 'failed_to_delete_session' });
    }

    if (!updatedRows || updatedRows.length === 0) {
      return respond(context, 404, { message: 'session_not_found' });
    }

    const ledgerDeleteResult = await deleteLedgerForSession(tenantClient, sessionId);
    if (ledgerDeleteResult.error) {
      await tenantClient
        .from('WorkSessions')
        .update({ deleted: sessionRow.deleted, deleted_at: sessionRow.deleted_at })
        .eq('id', sessionId);
      context.log?.error?.('work-sessions soft delete ledger cleanup failed', { message: ledgerDeleteResult.error.message, sessionId });
      return respond(context, 500, { message: 'failed_to_delete_session' });
    }

    return respond(context, 200, { deleted: true, permanent: false });
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PATCH,PUT,DELETE' });
}
