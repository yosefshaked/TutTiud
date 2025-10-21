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

function resolveAdminConfig(context) {
  const env = readEnv(context);
  const fallbackEnv = process.env ?? {};
  const url =
    selectStringCandidate(env, 'APP_CONTROL_DB_URL') ||
    selectStringCandidate(fallbackEnv, 'APP_CONTROL_DB_URL');
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
  if (
    !cachedAdminClient ||
    !cachedAdminConfig ||
    cachedAdminConfig.url !== config.url ||
    cachedAdminConfig.key !== config.key
  ) {
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
    context.log?.warn?.('directory failed to validate bearer token', { message: error?.message });
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

async function requireOrgMembership(context, supabase, orgId, userId) {
  const membershipResult = await supabase
    .from('org_memberships')
    .select('id, role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipResult.error) {
    context.log?.error?.('directory failed to verify membership', {
      orgId,
      userId,
      message: membershipResult.error.message,
    });
    respond(context, 500, { message: 'failed to verify membership' });
    return null;
  }

  if (!membershipResult.data) {
    respond(context, 403, { message: 'forbidden' });
    return null;
  }

  return membershipResult.data;
}

function logSupabaseQueryFailure(context, req, userId, stage, error) {
  const payload = {
    message: `Directory: Supabase query failed while ${stage}.`,
    context: {
      invocationId: context.invocationId,
      method: req?.method,
      url: req?.url,
      query: req?.query,
    },
    user: userId ? { id: userId } : undefined,
    error: {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    },
  };

  if (typeof context.log?.error === 'function') {
    context.log.error(payload);
  } else if (typeof context.log === 'function') {
    context.log(payload);
  } else {
    console.error(payload);
  }
}

async function fetchOrgMembers(context, req, supabase, orgId, userId) {
  try {
    const membershipsResult = await supabase
      .from('org_memberships')
      .select('id, org_id, user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (membershipsResult.error) {
      logSupabaseQueryFailure(context, req, userId, 'fetching membership rows', membershipsResult.error);
      respond(context, 500, { message: 'failed to load members' });
      return null;
    }

    const memberships = Array.isArray(membershipsResult.data) ? membershipsResult.data : [];
    const userIds = Array.from(
      new Set(
        memberships
          .map((membership) => membership.user_id)
          .filter((value) => typeof value === 'string' && value.trim().length > 0),
      ),
    );

    let profiles = [];
    if (userIds.length > 0) {
      const profilesResult = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (profilesResult.error) {
        logSupabaseQueryFailure(context, req, userId, 'fetching member profiles', profilesResult.error);
        respond(context, 500, { message: 'failed to load members' });
        return null;
      }

      profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];
    }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return memberships.map((membership) => ({
      ...membership,
      profile: profileMap.get(membership.user_id) ?? null,
    }));
  } catch (error) {
    logSupabaseQueryFailure(context, req, userId, 'fetching members', error);
    respond(context, 500, { message: 'failed to load members' });
    return null;
  }
}

async function fetchPendingInvitations(context, req, supabase, orgId, userId) {
  try {
    const result = await supabase
      .from('org_invitations')
      .select(
        'id, org_id, email, status, invited_by, created_at, expires_at, organization:organizations(id, name)',
      )
      .eq('org_id', orgId)
      .in('status', ['pending', 'sent'])
      .order('created_at', { ascending: true });

    if (result.error) {
      logSupabaseQueryFailure(context, req, userId, 'fetching invitations', result.error);
      respond(context, 500, { message: 'failed to load invitations' });
      return null;
    }

    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    logSupabaseQueryFailure(context, req, userId, 'fetching invitations', error);
    respond(context, 500, { message: 'failed to load invitations' });
    return null;
  }
}

export default async function directory(context, req) {
  const { client: supabase, error } = getAdminClient(context);
  if (error || !supabase) {
    context.log?.error?.('directory missing admin credentials', { message: error?.message });
    respond(context, 500, { message: 'missing admin credentials' });
    return;
  }

  const authUser = await getAuthenticatedUser(context, req, supabase);
  if (!authUser) {
    return;
  }

  const orgId = normalizeUuid(req.query?.orgId ?? req.query?.org_id);
  if (!orgId) {
    respond(context, 400, { message: 'missing orgId' });
    return;
  }

  const membership = await requireOrgMembership(context, supabase, orgId, authUser.id);
  if (!membership) {
    return;
  }

  const members = await fetchOrgMembers(context, req, supabase, orgId, authUser.id);
  if (!members) {
    return;
  }

  const invitations = await fetchPendingInvitations(context, req, supabase, orgId, authUser.id);
  if (!invitations) {
    return;
  }

  respond(context, 200, {
    members,
    invitations,
  });
}
