const DEFAULT_AUTH_HEADER_NAMES = [
  'x-supabase-authorization',
  'x-supabase-auth',
  'authorization',
];

function toStringValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = toStringValue(entry);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const stringValue = value.toString();
    return typeof stringValue === 'string' ? stringValue : null;
  }
  return null;
}

function getHeaderFromRaw(rawHeaders, name) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) {
    return null;
  }
  const target = name.toLowerCase();
  for (let index = 0; index < rawHeaders.length - 1; index += 2) {
    const headerName = String(rawHeaders[index] || '').toLowerCase();
    if (headerName === target) {
      return rawHeaders[index + 1];
    }
  }
  return null;
}

function readHeader(headers, name) {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === 'function') {
    const direct = headers.get(name);
    if (direct) {
      return direct;
    }
    const lower = headers.get(name.toLowerCase());
    if (lower) {
      return lower;
    }
  }
  if (typeof headers.entries === 'function') {
    for (const [headerName, headerValue] of headers.entries()) {
      if (String(headerName || '').toLowerCase() === name.toLowerCase()) {
        return headerValue;
      }
    }
  }
  if (typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return headers[key];
      }
    }
  }
  return null;
}

export function resolveAuthorizationHeader(request, names = DEFAULT_AUTH_HEADER_NAMES) {
  const headerNames = Array.isArray(names) && names.length ? names : DEFAULT_AUTH_HEADER_NAMES;
  const headers = request?.headers ?? null;

  for (const name of headerNames) {
    const value = readHeader(headers, name);
    if (value) {
      return toStringValue(value);
    }
  }

  const rawHeaders = request?.rawHeaders;
  if (Array.isArray(rawHeaders) && rawHeaders.length) {
    for (const name of headerNames) {
      const value = getHeaderFromRaw(rawHeaders, name);
      if (value) {
        return toStringValue(value);
      }
    }
  }

  return null;
}

export function resolveBearerAuthorization(request) {
  const raw = resolveAuthorizationHeader(request);
  if (!raw) {
    return null;
  }

  const segments = String(raw)
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.toLowerCase().startsWith('bearer ')) {
      const token = segment.slice('Bearer '.length).trim();
      if (token) {
        return { header: `Bearer ${token}`, token };
      }
    }
    if (!segment.includes(' ')) {
      return { header: `Bearer ${segment}`, token: segment };
    }
  }

  return null;
}

function ensureJsonSerializable(value) {
  if (value === undefined) {
    return null;
  }
  return value;
}

export function json(status, body, extraHeaders = {}) {
  const headers = {
    'content-type': 'application/json',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  return {
    status,
    headers,
    body: JSON.stringify(ensureJsonSerializable(body)),
  };
}
