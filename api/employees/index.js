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

async function fetchEmployeesBundle(tenantClient) {
  console.log('[DIAGNOSTIC TEST RUNNING]');

  // Test 1: Employees
  const employeesResult = await tenantClient.from('Employees').select('*').order('name');
  if (employeesResult.error) {
    console.error('DIAGNOSTIC FAILED ON: Employees', employeesResult.error);
    return { error: new Error('Failed on Employees table') };
  }
  console.log('DIAGNOSTIC PASSED: Employees');

  // Test 2: RateHistory
  const ratesResult = await tenantClient.from('RateHistory').select('*');
  if (ratesResult.error) {
    console.error('DIAGNOSTIC FAILED ON: RateHistory', ratesResult.error);
    return { error: new Error('Failed on RateHistory table') };
  }
  console.log('DIAGNOSTIC PASSED: RateHistory');

  // Test 3: Services
  const servicesResult = await tenantClient.from('Services').select('*');
  if (servicesResult.error) {
    console.error('DIAGNOSTIC FAILED ON: Services', servicesResult.error);
    return { error: new Error('Failed on Services table') };
  }
  console.log('DIAGNOSTIC PASSED: Services');

  // Test 4: LeaveBalances
  const leaveBalancesResult = await tenantClient.from('LeaveBalances').select('*');
  if (leaveBalancesResult.error) {
    console.error('DIAGNOSTIC FAILED ON: LeaveBalances', leaveBalancesResult.error);
    return { error: new Error('Failed on LeaveBalances table') };
  }
  console.log('DIAGNOSTIC PASSED: LeaveBalances');

  // Test 5: Settings
  const settingsResult = await tenantClient.from('Settings').select('key, settings_value').in('key', ['leave_policy', 'leave_pay_policy']);
  if (settingsResult.error) {
    console.error('DIAGNOSTIC FAILED ON: Settings', settingsResult.error);
    return { error: new Error('Failed on Settings table') };
  }
  console.log('DIAGNOSTIC PASSED: Settings');

  // If all tests passed, return data
  const settingsMap = new Map();
  for (const entry of settingsResult.data || []) {
    settingsMap.set(entry.key, entry.settings_value ?? null);
  }

  return {
    employees: employeesResult.data || [],
    rateHistory: ratesResult.data || [],
    services: servicesResult.data || [],
    leaveBalances: leaveBalancesResult.data || [],
    leavePolicy: settingsMap.get('leave_policy') ?? null,
    leavePayPolicy: settingsMap.get('leave_pay_policy') ?? null,
  };
}

function normalizeEmployeePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = { ...raw };
  if (Object.prototype.hasOwnProperty.call(payload, 'employment_scope')) {
    const value = payload.employment_scope;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      payload.employment_scope = trimmed ? trimmed : null;
    } else {
      payload.employment_scope = null;
    }
  }
  if (payload.annual_leave_days !== undefined && payload.annual_leave_days !== null) {
    const parsed = Number(payload.annual_leave_days);
    payload.annual_leave_days = Number.isNaN(parsed) ? 0 : parsed;
  }
  return payload;
}

function normalizeRateHistoryEntries(entries, employeeId) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const normalized = { ...entry };
      if (!normalized.employee_id && employeeId) {
        normalized.employee_id = employeeId;
      }
      return normalized;
    })
    .filter(Boolean);
}

async function upsertRateHistory(client, entries, options = {}) {
  if (!entries.length) {
    return null;
  }
  const config = options?.onConflict ? { onConflict: options.onConflict } : undefined;
  const { error } = await client.from('RateHistory').upsert(entries, config);
  return error || null;
}

export default async function (context, req) {
  console.log('--- API Function Invoked: Verifying Environment ---');

  const envSupabaseUrl = process.env.APP_SUPABASE_URL;
  const envServiceRoleKey = process.env.APP_SUPABASE_SERVICE_ROLE;

  console.log('Found APP_SUPABASE_URL:', envSupabaseUrl);

  if (envServiceRoleKey) {
    console.log('Found APP_SUPABASE_SERVICE_ROLE: [SECRET PRESENT], Length:', envServiceRoleKey.length);
    console.log('First 8 chars of Service Role Key:', envServiceRoleKey.substring(0, 8));
  } else {
    console.error('CRITICAL ERROR: APP_SUPABASE_SERVICE_ROLE is MISSING or UNDEFINED!');
  }

  console.log('--- API Function Invoked ---');
  console.log('Request Method:', req?.method);
  console.log('All Incoming Headers:', JSON.stringify(req?.headers, null, 2));
  const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  console.log('Received Authorization Header:', authHeader);

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('employees missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  const { supabaseUrl, serviceRoleKey } = adminConfig;

  if (!supabaseUrl || !serviceRoleKey) {
    context.log?.error?.('employees missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('employees failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('employees token did not resolve to user');
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

  try {
    const role = await ensureMembership(supabase, orgId, userId);
    if (!role) {
      return respond(context, 403, { message: 'forbidden' });
    }

    if ((method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') && !isAdminRole(role)) {
      return respond(context, 403, { message: 'forbidden' });
    }
  } catch (membershipError) {
    context.log?.error?.('employees failed to verify membership', {
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
    context.log?.error?.('employees missing encryption secret');
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
    context.log?.error?.('employees failed to create tenant client', { message: clientError?.message });
    return respond(context, 500, { message: 'failed_to_connect_tenant' });
  }

  if (method === 'GET') {
    const bundle = await fetchEmployeesBundle(tenantClient);
    if (bundle.error) {
      context.log?.error?.('employees fetch failed', { message: bundle.error.message });
      return respond(context, 500, { message: 'failed_to_fetch_employees' });
    }
    return respond(context, 200, { ...bundle });
  }

  if (method === 'POST') {
    const employeePayload = normalizeEmployeePayload(body.employee || body.employeeData);
    if (!employeePayload) {
      return respond(context, 400, { message: 'invalid employee payload' });
    }

    const rateUpdates = normalizeRateHistoryEntries(body.rate_updates || body.rateUpdates, null);
    const manualRateHistory = normalizeRateHistoryEntries(body.manual_rate_history || body.manualRateHistory, null);

    const insertResult = await tenantClient
      .from('Employees')
      .insert(employeePayload)
      .select('id')
      .single();

    if (insertResult.error) {
      context.log?.error?.('employees insert failed', { message: insertResult.error.message });
      return respond(context, 500, { message: 'failed_to_create_employee' });
    }

    const employeeId = insertResult.data?.id;
    const combinedErrors = [];

    const rateInsertError = await upsertRateHistory(
      tenantClient,
      normalizeRateHistoryEntries(rateUpdates, employeeId),
      { onConflict: 'employee_id,service_id,effective_date' },
    );
    if (rateInsertError) {
      combinedErrors.push(rateInsertError);
    }

    const manualError = await upsertRateHistory(
      tenantClient,
      normalizeRateHistoryEntries(manualRateHistory, employeeId),
      { onConflict: 'id' },
    );
    if (manualError) {
      combinedErrors.push(manualError);
    }

    if (combinedErrors.length) {
      context.log?.error?.('employees rate history upsert failed', {
        messages: combinedErrors.map((error) => error.message),
      });
      return respond(context, 500, { message: 'employee_created_but_rates_failed', employee_id: employeeId });
    }

    return respond(context, 201, { employee_id: employeeId });
  }

  if (method === 'PATCH' || method === 'PUT') {
    const employeeIdCandidate = context.bindingData?.employeeId || body.employee_id || body.employeeId;
    const employeeId = normalizeString(employeeIdCandidate);
    if (!employeeId || !isValidOrgId(employeeId)) {
      const numericId = Number(employeeIdCandidate);
      const acceptNumeric = !Number.isNaN(numericId) && numericId > 0;
      if (!acceptNumeric) {
        return respond(context, 400, { message: 'invalid employee id' });
      }
    }

    const updates = normalizeEmployeePayload(body.updates || body.employee || body.employeeData);
    const rateUpdates = normalizeRateHistoryEntries(body.rate_updates || body.rateUpdates, employeeId);
    const manualRateHistory = normalizeRateHistoryEntries(body.manual_rate_history || body.manualRateHistory, employeeId);

    if (updates) {
      const updateResult = await tenantClient
        .from('Employees')
        .update(updates)
        .eq('id', employeeId);

      if (updateResult.error) {
        context.log?.error?.('employees update failed', { message: updateResult.error.message });
        return respond(context, 500, { message: 'failed_to_update_employee' });
      }
    }

    const combinedErrors = [];

    const rateUpsertError = await upsertRateHistory(
      tenantClient,
      rateUpdates,
      { onConflict: 'employee_id,service_id,effective_date' },
    );
    if (rateUpsertError) {
      combinedErrors.push(rateUpsertError);
    }

    const manualUpsertError = await upsertRateHistory(
      tenantClient,
      manualRateHistory,
      { onConflict: 'id' },
    );
    if (manualUpsertError) {
      combinedErrors.push(manualUpsertError);
    }

    if (combinedErrors.length) {
      context.log?.error?.('employees update rate history failed', {
        messages: combinedErrors.map((error) => error.message),
      });
      return respond(context, 500, { message: 'employee_updated_but_rates_failed' });
    }

    return respond(context, 200, { updated: true });
  }

  if (method === 'DELETE') {
    const employeeIdCandidate = context.bindingData?.employeeId || body.employee_id || body.employeeId;
    const employeeId = normalizeString(employeeIdCandidate);
    if (!employeeId) {
      return respond(context, 400, { message: 'invalid employee id' });
    }

    const { error } = await tenantClient
      .from('Employees')
      .delete()
      .eq('id', employeeId);

    if (error) {
      context.log?.error?.('employees delete failed', { message: error.message });
      return respond(context, 500, { message: 'failed_to_delete_employee' });
    }

    return respond(context, 200, { deleted: true });
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PATCH,PUT,DELETE' });
}
