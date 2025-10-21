/* eslint-env node */
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';

function jsonResponse(context, status, payload, extraHeaders = {}) {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function maskForLog(value) {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.length <= 6) return '••••';
  return `${stringValue.slice(0, 2)}••••${stringValue.slice(-2)}`;
}

function normalizeHeaderValue(rawValue) {
  if (!rawValue) {
    return undefined;
  }

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  if (Array.isArray(rawValue)) {
    for (const entry of rawValue) {
      const normalized = normalizeHeaderValue(entry);
      if (typeof normalized === 'string' && normalized.length > 0) {
        return normalized;
      }
    }
    return undefined;
  }

  if (typeof rawValue === 'object') {
    if (typeof rawValue.value === 'string') {
      return rawValue.value;
    }

    if (Array.isArray(rawValue.value)) {
      const normalized = normalizeHeaderValue(rawValue.value);
      if (normalized) {
        return normalized;
      }
    }

    if (typeof rawValue[0] === 'string') {
      return rawValue[0];
    }

    if (typeof rawValue.toString === 'function' && rawValue.toString !== Object.prototype.toString) {
      const candidate = rawValue.toString();
      if (typeof candidate === 'string' && candidate && candidate !== '[object Object]') {
        return candidate;
      }
    }

    if (typeof rawValue[Symbol.iterator] === 'function') {
      for (const entry of rawValue) {
        const normalized = normalizeHeaderValue(entry);
        if (typeof normalized === 'string' && normalized.length > 0) {
          return normalized;
        }
      }
    }
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue);
  }

  return undefined;
}

function extractBearerToken(rawValue) {
  const normalized = normalizeHeaderValue(rawValue);
  if (typeof normalized !== 'string') {
    return null;
  }
  const trimmed = normalized.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = trimmed.slice('bearer '.length).trim();
  return token || null;
}

function resolveHeaderValue(headers, name) {
  if (!headers || !name) {
    return undefined;
  }

  const targetName = typeof name === 'string' ? name : String(name || '');

  if (typeof headers.get === 'function') {
    const directValue = normalizeHeaderValue(headers.get(name));
    if (typeof directValue === 'string' && directValue.length > 0) {
      return directValue;
    }

    const lowerValue = normalizeHeaderValue(headers.get(name.toLowerCase()));
    if (typeof lowerValue === 'string' && lowerValue.length > 0) {
      return lowerValue;
    }
  }

  if (typeof headers === 'object') {
    if (Object.prototype.hasOwnProperty.call(headers, name)) {
      const directValue = normalizeHeaderValue(headers[name]);
      if (typeof directValue === 'string' && directValue.length > 0) {
        return directValue;
      }
    }

    const lowerName = typeof name === 'string' ? name.toLowerCase() : name;
    if (lowerName !== name && Object.prototype.hasOwnProperty.call(headers, lowerName)) {
      const lowerValue = normalizeHeaderValue(headers[lowerName]);
      if (typeof lowerValue === 'string' && lowerValue.length > 0) {
        return lowerValue;
      }
    }

    const upperName = typeof name === 'string' ? name.toUpperCase() : name;
    if (upperName !== name && Object.prototype.hasOwnProperty.call(headers, upperName)) {
      const upperValue = normalizeHeaderValue(headers[upperName]);
      if (typeof upperValue === 'string' && upperValue.length > 0) {
        return upperValue;
      }
    }
  }

  if (typeof headers?.toJSON === 'function') {
    const serialized = headers.toJSON();
    if (serialized && typeof serialized === 'object') {
      if (Object.prototype.hasOwnProperty.call(serialized, name)) {
        const directValue = normalizeHeaderValue(serialized[name]);
        if (typeof directValue === 'string' && directValue.length > 0) {
          return directValue;
        }
      }

      const lowerName = typeof name === 'string' ? name.toLowerCase() : name;
      if (lowerName !== name && Object.prototype.hasOwnProperty.call(serialized, lowerName)) {
        const lowerValue = normalizeHeaderValue(serialized[lowerName]);
        if (typeof lowerValue === 'string' && lowerValue.length > 0) {
          return lowerValue;
        }
      }

      const upperName = typeof name === 'string' ? name.toUpperCase() : name;
      if (upperName !== name && Object.prototype.hasOwnProperty.call(serialized, upperName)) {
        const upperValue = normalizeHeaderValue(serialized[upperName]);
        if (typeof upperValue === 'string' && upperValue.length > 0) {
          return upperValue;
        }
      }
    }
  }

  const rawHeaders = headers?.rawHeaders;
  if (Array.isArray(rawHeaders)) {
    for (let index = 0; index < rawHeaders.length - 1; index += 2) {
      const rawName = rawHeaders[index];
      if (typeof rawName !== 'string') {
        continue;
      }

      if (rawName.toLowerCase() !== targetName.toLowerCase()) {
        continue;
      }

      const rawValue = normalizeHeaderValue(rawHeaders[index + 1]);
      if (typeof rawValue === 'string' && rawValue.length > 0) {
        return rawValue;
      }
    }
  }

  const nestedHeaders = headers?.headers;
  if (nestedHeaders && nestedHeaders !== headers) {
    const nestedValue = resolveHeaderValue(nestedHeaders, name);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function normalizePolicyLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item.trim();
      if (typeof item.url === 'string') return item.url.trim();
      if (typeof item.href === 'string') return item.href.trim();
      return '';
    })
    .filter(Boolean);
}

function sanitizeLegalSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (value === null) {
      acc[key] = null;
      return acc;
    }
    if (typeof value === 'string') {
      acc[key] = value.trim();
      return acc;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export default async function (context, req) {
  const env = context.env ?? globalThis.process?.env ?? {};
  const adminConfig = readSupabaseAdminConfig(env);
  const { supabaseUrl, serviceRoleKey } = adminConfig;

  if (!supabaseUrl || !serviceRoleKey) {
    context.log.error('Supabase metadata credentials are missing.');
    jsonResponse(context, 500, { error: 'server_misconfigured' });
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(
      context,
      405,
      { error: 'method_not_allowed' },
      { Allow: 'POST' },
    );
    return;
  }

  const headerCandidates = [
    'X-Supabase-Authorization',
    'x-supabase-auth',
    'Authorization',
  ];

  let token = null;
  for (const headerName of headerCandidates) {
    const value = resolveHeaderValue(req.headers, headerName);
    token = extractBearerToken(value);
    if (token) {
      break;
    }
  }

  if (!token) {
    jsonResponse(context, 401, { error: 'missing_or_invalid_token' });
    return;
  }

  const supabase = createSupabaseAdminClient(adminConfig, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let userId;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    userId = data?.user?.id;
  } catch (authError) {
    context.log.warn('Failed to authenticate token for org creation.', {
      message: authError?.message,
    });
    jsonResponse(context, 401, { error: 'missing_or_invalid_token' });
    return;
  }

  if (!userId) {
    jsonResponse(context, 401, { error: 'missing_or_invalid_token' });
    return;
  }

  const body = req.body || {};
  const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';

  if (!trimmedName) {
    jsonResponse(context, 400, { error: 'missing_name', message: 'יש להזין שם ארגון.' });
    return;
  }

  const incomingSupabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : '';
  const incomingAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : '';
  const policyLinks = normalizePolicyLinks(body.policyLinks);
  const legalSettings = sanitizeLegalSettings(body.legalSettings);
  const now = new Date().toISOString();

  try {
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: trimmedName,
        supabase_url: incomingSupabaseUrl || null,
        supabase_anon_key: incomingAnonKey || null,
        policy_links: policyLinks,
        legal_settings: legalSettings,
        created_by: userId,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (orgError) {
      throw orgError;
    }

    const { error: membershipError } = await supabase
      .from('org_memberships')
      .upsert(
        {
          org_id: orgData.id,
          user_id: userId,
          role: 'admin',
          created_at: now,
        },
        { onConflict: 'org_id,user_id' },
      );

    if (membershipError && membershipError.code !== '23505') {
      throw membershipError;
    }

    if (incomingSupabaseUrl && incomingAnonKey) {
      const { error: settingsError } = await supabase
        .from('org_settings')
        .upsert({
          org_id: orgData.id,
          supabase_url: incomingSupabaseUrl,
          anon_key: incomingAnonKey,
          updated_at: now,
        }, { onConflict: 'org_id' });

      if (settingsError) {
        throw settingsError;
      }
    }

    context.log.info('Organization created successfully.', {
      orgId: orgData.id,
      userId: maskForLog(userId),
    });

    jsonResponse(context, 201, { id: orgData.id });
  } catch (error) {
    context.log.error('Failed to create organization.', {
      code: error?.code,
      message: error?.message,
      userId: maskForLog(userId),
    });

    if (error?.code === '23505') {
      jsonResponse(context, 409, {
        error: 'duplicate_organization',
        message: 'ארגון עם שם זה כבר קיים.',
      });
      return;
    }

    jsonResponse(context, 500, {
      error: 'server_error',
      message: 'יצירת הארגון נכשלה. נסה שוב מאוחר יותר.',
    });
  }
}
