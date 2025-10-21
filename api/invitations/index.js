/* eslint-env node */
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { json, resolveBearerAuthorization } from '../_shared/http.js';

const ADMIN_CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      Accept: 'application/json',
    },
  },
};

const STATUS_PENDING = 'pending';
const STATUS_ACCEPTED = 'accepted';
const STATUS_REVOKED = 'revoked';
const STATUS_DECLINED = 'declined';
const STATUS_EXPIRED = 'expired';
const STATUS_FAILED = 'failed';

let cachedAdminClient = null;
let cachedAdminConfig = null;

function readEnv(context) {
  if (context?.env && typeof context.env === 'object') {
    return context.env;
  }
  return process.env ?? {};
}

function selectStringCandidate(source, key) {
  if (!source) {
    return '';
  }
  const value = source[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
}

function resolveUserFullName(user) {
  if (!user || typeof user !== 'object') {
    return '';
  }
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata.full_name, metadata.fullName, metadata.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (typeof user.email === 'string' && user.email.trim()) {
    return user.email.trim();
  }
  return '';
}

function resolveAdminConfig(context) {
  const env = readEnv(context);
  const fallbackEnv = process.env ?? {};
  const url = selectStringCandidate(env, 'APP_CONTROL_DB_URL') || selectStringCandidate(fallbackEnv, 'APP_CONTROL_DB_URL');
  const key =
    selectStringCandidate(env, 'APP_CONTROL_DB_SERVICE_ROLE_KEY') ||
    selectStringCandidate(fallbackEnv, 'APP_CONTROL_DB_SERVICE_ROLE_KEY');
  return { url, key };
}

function createAdminClient(url, key) {
  return createClient(url, key, ADMIN_CLIENT_OPTIONS);
}

function getAdminClient(context) {
  const config = resolveAdminConfig(context);
  if (!config.url || !config.key) {
    return { client: null, error: new Error('missing_admin_credentials') };
  }
  if (!cachedAdminClient || !cachedAdminConfig || cachedAdminConfig.url !== config.url || cachedAdminConfig.key !== config.key) {
    cachedAdminClient = createAdminClient(config.url, config.key);
    cachedAdminConfig = config;
  }
  return { client: cachedAdminClient, error: null };
}

function respond(context, status, body, extraHeaders = {}) {
  const response = json(status, body, { 'Cache-Control': 'no-store', ...extraHeaders });
  context.res = response;
  return response;
}

function parseRestSegments(context) {
  const raw = context?.bindingData?.restOfPath;
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  return raw
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeUuid(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  return emailPattern.test(trimmed) ? trimmed : null;
}

function normalizeRedirectUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeExpirationInput(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null, valid: true };
  }
  if (value instanceof Date) {
    return { value: value.toISOString(), valid: true };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed.toISOString(), valid: true };
    }
    return { value: null, valid: false };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { value: null, valid: true };
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed.toISOString(), valid: true };
    }
    return { value: null, valid: false };
  }
  return { value: null, valid: false };
}

function isAdminRole(role) {
  if (typeof role !== 'string') {
    return false;
  }
  const normalized = role.trim().toLowerCase();
  return normalized === 'admin' || normalized === 'owner';
}

function isExpiredTimestamp(timestamp) {
  if (!timestamp) {
    return false;
  }
  const expiresAt = new Date(timestamp);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }
  return expiresAt.getTime() <= Date.now();
}

function sanitizeInvitation(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    status: row.status,
    invitedBy: row.invited_by ?? null,
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

async function getAuthenticatedUser(context, req, supabase) {
  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    respond(context, 401, { message: 'missing bearer' });
    return null;
  }
  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.warn?.('invitations failed to validate bearer token', { message: error?.message });
    respond(context, 401, { message: 'invalid or expired token' });
    return null;
  }
  if (authResult.error || !authResult.data?.user?.id) {
    respond(context, 401, { message: 'invalid or expired token' });
    return null;
  }
  const user = authResult.data.user;
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
  };
}

async function requireAdminForOrg(context, supabase, orgId, userId) {
  const membershipResult = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipResult.error) {
    context.log?.error?.('invitations failed to load membership', {
      orgId,
      userId,
      message: membershipResult.error.message,
    });
    respond(context, 500, { message: 'failed to verify membership' });
    return null;
  }

  if (!membershipResult.data || !isAdminRole(membershipResult.data.role)) {
    respond(context, 403, { message: 'forbidden' });
    return null;
  }

  return membershipResult.data.role;
}

async function fetchOrganization(context, supabase, orgId) {
  const orgResult = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();

  if (orgResult.error) {
    context.log?.error?.('invitations failed to load organization', {
      orgId,
      message: orgResult.error.message,
    });
    respond(context, 500, { message: 'failed to load organization' });
    return null;
  }

  if (!orgResult.data) {
    respond(context, 404, { message: 'organization not found' });
    return null;
  }

  return orgResult.data;
}

async function findExistingMemberByEmail(supabase, orgId, email) {
  const listResult = await supabase.auth.admin.listUsers({ email, perPage: 1 });
  if (listResult.error) {
    return { error: listResult.error };
  }
  const users = Array.isArray(listResult.data?.users) ? listResult.data.users : [];
  for (const user of users) {
    if (typeof user?.email !== 'string' || user.email.toLowerCase() !== email) {
      continue;
    }
    const membershipResult = await supabase
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipResult.error) {
      return { error: membershipResult.error };
    }

    if (membershipResult.data) {
      return { userId: user.id };
    }
  }
  return { userId: null };
}

async function findPendingInvitation(supabase, orgId, email) {
  const invitationResult = await supabase
    .from('org_invitations')
    .select('id, status, expires_at')
    .eq('org_id', orgId)
    .eq('email', email)
    .in('status', [STATUS_PENDING])
    .maybeSingle();

  if (invitationResult.error) {
    return { error: invitationResult.error };
  }

  if (!invitationResult.data) {
    return { invitation: null };
  }

  return { invitation: invitationResult.data };
}

async function markInvitationExpired(supabase, invitationId) {
  if (!invitationId) {
    return;
  }
  await supabase
    .from('org_invitations')
    .update({ status: STATUS_EXPIRED })
    .eq('id', invitationId);
}

async function handleCreateInvitation(context, req, supabase) {
  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const orgId = normalizeUuid(body.orgId ?? body.org_id ?? body.organizationId);
  const email = normalizeEmail(body.email);
  const expiration = normalizeExpirationInput(body.expiresAt ?? body.expires_at);
  if (!expiration.valid) {
    respond(context, 400, { message: 'invalid expiration' });
    return;
  }

  const redirectTo = normalizeRedirectUrl(body.redirectTo ?? body.redirect_to);
  const emailData = body.emailData && typeof body.emailData === 'object' ? { ...body.emailData } : {};

  if (!orgId) {
    respond(context, 400, { message: 'missing orgId' });
    return;
  }

  if (!email) {
    respond(context, 400, { message: 'invalid email' });
    return;
  }

  const organization = await fetchOrganization(context, supabase, orgId);
  if (!organization) {
    return;
  }

  const role = await requireAdminForOrg(context, supabase, orgId, authUser.id);
  if (!role) {
    return;
  }

  const { error: memberLookupError, userId: existingUserId } = await findExistingMemberByEmail(supabase, orgId, email);
  if (memberLookupError) {
    context.log?.error?.('invitations failed to verify member by email', {
      orgId,
      email,
      message: memberLookupError.message,
    });
    respond(context, 500, { message: 'failed to verify member' });
    return;
  }

  if (existingUserId) {
    respond(context, 409, { message: 'user already a member' });
    return;
  }

  const { error: pendingError, invitation: pendingInvitation } = await findPendingInvitation(supabase, orgId, email);
  if (pendingError) {
    context.log?.error?.('invitations failed to verify pending invitation', {
      orgId,
      email,
      message: pendingError.message,
    });
    respond(context, 500, { message: 'failed to check pending invitations' });
    return;
  }

  if (pendingInvitation) {
    if (isExpiredTimestamp(pendingInvitation.expires_at)) {
      await markInvitationExpired(supabase, pendingInvitation.id);
    } else {
      respond(context, 409, { message: 'invitation already pending' });
      return;
    }
  }

  const invitationPayload = {
    org_id: orgId,
    email,
    invited_by: authUser.id,
    status: STATUS_PENDING,
    expires_at: expiration.value,
  };

  const insertResult = await supabase
    .from('org_invitations')
    .insert(invitationPayload)
    .select('id, token, email, status, invited_by, created_at, expires_at, org_id')
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    context.log?.error?.('invitations failed to create invitation', {
      orgId,
      email,
      message: insertResult.error?.message,
    });
    respond(context, 500, { message: 'failed to create invitation' });
    return;
  }

  const invitation = insertResult.data;
  const redirectUrl = redirectTo || null;
  const inviterResult = await supabase.auth.admin.getUserById(authUser.id);
  if (inviterResult.error || !inviterResult.data?.user) {
    context.log?.error?.('invitations failed to load inviter profile', {
      orgId,
      invitedBy: authUser.id,
      message: inviterResult.error?.message ?? 'inviter not found',
    });
    respond(context, 500, { message: 'failed to personalize invitation email' });
    return;
  }

  const inviterName = resolveUserFullName(inviterResult.data.user) || null;
  const inviteMetadata = {
    ...emailData,
    orgId,
    orgName: organization.name ?? null,
    organization_name: organization.name ?? null,
    inviter_name: inviterName,
    invitationId: invitation.id,
    invitationToken: invitation.token,
  };

  const inviteResult = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectUrl || undefined,
    data: inviteMetadata,
  });

  if (inviteResult.error) {
    context.log?.error?.('invitations failed to send email invite', {
      orgId,
      email,
      invitationId: invitation.id,
      message: inviteResult.error.message,
    });
    await supabase
      .from('org_invitations')
      .update({ status: STATUS_FAILED })
      .eq('id', invitation.id);
    respond(context, 502, { message: 'failed to send invitation email' });
    return;
  }

  respond(context, 201, {
    invitation: sanitizeInvitation(invitation),
  });
}

async function handleListPending(context, req, supabase) {
  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }
  const orgId = normalizeUuid(req.query?.orgId ?? req.query?.org_id ?? req.body?.orgId);
  if (!orgId) {
    respond(context, 400, { message: 'missing orgId' });
    return;
  }
  const role = await requireAdminForOrg(context, supabase, orgId, authUser.id);
  if (!role) {
    return;
  }
  const selectResult = await supabase
    .from('org_invitations')
    .select('id, org_id, email, status, invited_by, created_at, expires_at')
    .eq('org_id', orgId)
    .eq('status', STATUS_PENDING)
    .order('created_at', { ascending: false });

  if (selectResult.error) {
    context.log?.error?.('invitations failed to list pending invitations', {
      orgId,
      message: selectResult.error.message,
    });
    respond(context, 500, { message: 'failed to list invitations' });
    return;
  }

  const invitations = [];
  if (Array.isArray(selectResult.data)) {
    for (const invitation of selectResult.data) {
      if (isExpiredTimestamp(invitation.expires_at)) {
        await markInvitationExpired(supabase, invitation.id);
        continue;
      }
      const sanitized = sanitizeInvitation(invitation);
      if (sanitized) {
        invitations.push(sanitized);
      }
    }
  }

  respond(context, 200, { invitations });
}

async function loadInvitationById(context, supabase, invitationId) {
  const result = await supabase
    .from('org_invitations')
    .select('*')
    .eq('id', invitationId)
    .maybeSingle();

  if (result.error) {
    context.log?.error?.('invitations failed to load by id', {
      invitationId,
      message: result.error.message,
    });
    respond(context, 500, { message: 'failed to load invitation' });
    return null;
  }

  if (!result.data) {
    respond(context, 404, { message: 'invitation not found' });
    return null;
  }

  return result.data;
}

async function handleGetByToken(context, supabase, token) {
  if (!token) {
    respond(context, 400, { message: 'missing token' });
    return;
  }

  const result = await supabase
    .from('org_invitations')
    .select('id, org_id, email, status, created_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (result.error) {
    context.log?.error?.('invitations failed to load by token', {
      token,
      message: result.error.message,
    });
    respond(context, 500, { message: 'failed to load invitation' });
    return;
  }

  if (!result.data) {
    respond(context, 404, { message: 'invitation not found' });
    return;
  }

  const invitation = result.data;

  if (invitation.status !== STATUS_PENDING) {
    respond(context, 409, { message: `invitation ${invitation.status}` });
    return;
  }

  if (isExpiredTimestamp(invitation.expires_at)) {
    await markInvitationExpired(supabase, invitation.id);
    respond(context, 410, { message: 'invitation expired' });
    return;
  }

  const organization = await fetchOrganization(context, supabase, invitation.org_id);
  if (!organization) {
    return;
  }

  respond(context, 200, {
    invitation: {
      id: invitation.id,
      orgId: invitation.org_id,
      orgName: organization.name ?? null,
      email: invitation.email,
      status: invitation.status,
      createdAt: invitation.created_at ?? null,
      expiresAt: invitation.expires_at ?? null,
    },
  });
}

async function acceptInvitation(context, req, supabase, invitationId) {
  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }

  const invitation = await loadInvitationById(context, supabase, invitationId);
  if (!invitation) {
    return;
  }

  if (invitation.status !== STATUS_PENDING) {
    respond(context, 409, { message: `invitation ${invitation.status}` });
    return;
  }

  if (isExpiredTimestamp(invitation.expires_at)) {
    await markInvitationExpired(supabase, invitation.id);
    respond(context, 410, { message: 'invitation expired' });
    return;
  }

  const userEmail = authUser.email;
  if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
    respond(context, 403, { message: 'email mismatch' });
    return;
  }

  const membershipResult = await supabase
    .from('org_memberships')
    .upsert({ org_id: invitation.org_id, user_id: authUser.id, role: 'member' }, { onConflict: 'org_id,user_id' })
    .select('id')
    .maybeSingle();

  if (membershipResult.error) {
    context.log?.error?.('invitations failed to insert membership', {
      invitationId,
      message: membershipResult.error.message,
    });
    respond(context, 500, { message: 'failed to add membership' });
    return;
  }

  const updateResult = await supabase
    .from('org_invitations')
    .update({ status: STATUS_ACCEPTED })
    .eq('id', invitation.id);

  if (updateResult.error) {
    context.log?.error?.('invitations failed to mark accepted', {
      invitationId,
      message: updateResult.error.message,
    });
    respond(context, 500, { message: 'failed to update invitation' });
    return;
  }

  respond(context, 200, { message: 'invitation accepted' });
}

async function declineInvitation(context, req, supabase, invitationId) {
  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }

  const invitation = await loadInvitationById(context, supabase, invitationId);
  if (!invitation) {
    return;
  }

  if (invitation.status !== STATUS_PENDING) {
    respond(context, 409, { message: `invitation ${invitation.status}` });
    return;
  }

  if (!authUser.email || authUser.email !== invitation.email.toLowerCase()) {
    respond(context, 403, { message: 'email mismatch' });
    return;
  }

  const updateResult = await supabase
    .from('org_invitations')
    .update({ status: STATUS_DECLINED })
    .eq('id', invitation.id);

  if (updateResult.error) {
    context.log?.error?.('invitations failed to decline', {
      invitationId,
      message: updateResult.error.message,
    });
    respond(context, 500, { message: 'failed to update invitation' });
    return;
  }

  respond(context, 200, { message: 'invitation declined' });
}

async function revokeInvitation(context, req, supabase, invitationId) {
  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }

  const invitation = await loadInvitationById(context, supabase, invitationId);
  if (!invitation) {
    return;
  }

  const role = await requireAdminForOrg(context, supabase, invitation.org_id, authUser.id);
  if (!role) {
    return;
  }

  if (invitation.status !== STATUS_PENDING) {
    respond(context, 409, { message: `invitation ${invitation.status}` });
    return;
  }

  const updateResult = await supabase
    .from('org_invitations')
    .update({ status: STATUS_REVOKED })
    .eq('id', invitation.id);

  if (updateResult.error) {
    context.log?.error?.('invitations failed to revoke', {
      invitationId,
      message: updateResult.error.message,
    });
    respond(context, 500, { message: 'failed to revoke invitation' });
    return;
  }

  respond(context, 200, { message: 'invitation revoked' });
}

export default async function (context, req) {
  const { client: supabase, error } = getAdminClient(context);
  if (!supabase || error) {
    context.log?.error?.('invitations missing admin credentials');
    respond(context, 500, { message: 'server_misconfigured' });
    return;
  }

  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  const segments = parseRestSegments(context);

  if (method === 'POST' && segments.length === 0) {
    await handleCreateInvitation(context, req, supabase);
    return;
  }

  if (method === 'GET' && segments.length === 0) {
    await handleListPending(context, req, supabase);
    return;
  }

  if (method === 'GET' && segments.length === 2 && segments[0] === 'token') {
    await handleGetByToken(context, supabase, segments[1]);
    return;
  }

  if (method === 'POST' && segments.length === 2 && segments[1] === 'accept') {
    const invitationId = normalizeUuid(segments[0]);
    if (!invitationId) {
      respond(context, 400, { message: 'invalid invitation id' });
      return;
    }
    await acceptInvitation(context, req, supabase, invitationId);
    return;
  }

  if (method === 'POST' && segments.length === 2 && segments[1] === 'decline') {
    const invitationId = normalizeUuid(segments[0]);
    if (!invitationId) {
      respond(context, 400, { message: 'invalid invitation id' });
      return;
    }
    await declineInvitation(context, req, supabase, invitationId);
    return;
  }

  if (method === 'DELETE' && segments.length === 1) {
    const invitationId = normalizeUuid(segments[0]);
    if (!invitationId) {
      respond(context, 400, { message: 'invalid invitation id' });
      return;
    }
    await revokeInvitation(context, req, supabase, invitationId);
    return;
  }

  respond(context, 404, { message: 'not found' });
}
