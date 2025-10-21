const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);

let cachedSupportPromise = null;
let forcedSupport = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function prune(value) {
  if (Array.isArray(value)) {
    const next = value
      .map(item => prune(item))
      .filter(item => item !== undefined);
    return next.length ? next : undefined;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const result = {};
    for (const [key, raw] of entries) {
      if (raw === undefined || raw === null) continue;
      const pruned = prune(raw);
      if (pruned === undefined) continue;
      if (isPlainObject(pruned) && Object.keys(pruned).length === 0) continue;
      if (Array.isArray(pruned) && pruned.length === 0) continue;
      result[key] = pruned;
    }
    return Object.keys(result).length ? result : undefined;
  }
  return value;
}

function normalizeVersion(version) {
  const parsed = Number(version);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.trunc(parsed);
}

function normalizeSource(source) {
  if (typeof source !== 'string') return null;
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

function shouldTreatAsMissing(error) {
  if (!error) return false;
  if (MISSING_COLUMN_CODES.has(error.code)) return true;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('column') && message.includes('metadata');
}

export async function canUseWorkSessionMetadata(client) {
  if (typeof forcedSupport === 'boolean') {
    return forcedSupport;
  }
  if (cachedSupportPromise) {
    return cachedSupportPromise;
  }
  cachedSupportPromise = (async () => {
    if (!client || typeof client.from !== 'function') {
      return false;
    }
    let table;
    try {
      table = client.from('WorkSessions');
    } catch {
      return false;
    }
    if (!table || typeof table.select !== 'function') {
      return false;
    }
    try {
      const { error } = await table.select('metadata').limit(0);
      if (error) {
        if (shouldTreatAsMissing(error)) {
          return false;
        }
        console.warn('Unable to verify WorkSessions.metadata support', error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('Unable to verify WorkSessions.metadata support', error);
      return false;
    }
  })();
  try {
    const result = await cachedSupportPromise;
    cachedSupportPromise = Promise.resolve(result);
    return result;
  } catch (error) {
    cachedSupportPromise = null;
    throw error;
  }
}

export function createMetadataEnvelope({ source, leave, calc, extra = {}, version = 1 } = {}) {
  const base = { version: normalizeVersion(version) };
  const normalizedSource = normalizeSource(source);
  if (normalizedSource) {
    base.source = normalizedSource;
  }
  const normalizedExtra = prune(extra);
  if (normalizedExtra && isPlainObject(normalizedExtra)) {
    Object.assign(base, normalizedExtra);
  }
  if (leave && isPlainObject(leave)) {
    const normalizedLeave = prune(leave);
    if (normalizedLeave) {
      base.leave = normalizedLeave;
    }
  }
  if (calc && isPlainObject(calc)) {
    const normalizedCalc = prune(calc);
    if (normalizedCalc) {
      base.calc = normalizedCalc;
    }
  }
  const pruned = prune(base);
  return pruned || { version: 1 };
}

export function buildLeaveMetadata({
  source = null,
  mixedPaid = null,
  subtype = null,
  method = null,
  lookbackMonths = null,
  legalAllow12mIfBetter = null,
  overrideApplied = null,
  noteInternal = null,
  extra = {},
  version = 1,
} = {}) {
  const resolvedSubtype = typeof subtype === 'string' && subtype.trim().length > 0
    ? subtype.trim().slice(0, 120)
    : null;
  const leaveSection = {
    mixed_paid: typeof mixedPaid === 'boolean' ? mixedPaid : undefined,
    subtype: resolvedSubtype || undefined,
  };
  const calcSection = {
    method: method || undefined,
    lookback_months:
      typeof lookbackMonths === 'number' && Number.isFinite(lookbackMonths)
        ? Math.round(lookbackMonths)
        : undefined,
    legal_allow_12m_if_better: typeof legalAllow12mIfBetter === 'boolean' ? legalAllow12mIfBetter : undefined,
    override_applied: typeof overrideApplied === 'boolean' ? overrideApplied : undefined,
  };
  const topLevel = { ...extra };
  if (typeof noteInternal === 'string') {
    const trimmed = noteInternal.trim();
    if (trimmed) {
      topLevel.note_internal = trimmed.slice(0, 500);
    }
  }
  return createMetadataEnvelope({
    source,
    leave: leaveSection,
    calc: calcSection,
    extra: topLevel,
    version,
  });
}

export function buildSourceMetadata(source, extra = {}, version = 1) {
  return createMetadataEnvelope({ source, extra, version });
}

export function stripLeaveBusinessFields(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const clone = JSON.parse(JSON.stringify(metadata));

  delete clone.leave_kind;
  delete clone.leave_type;
  delete clone.leave_fraction;

  if (clone.leave && typeof clone.leave === 'object') {
    delete clone.leave.kind;
    delete clone.leave.type;
    delete clone.leave.payable;
    delete clone.leave.fraction;
    if (Object.keys(clone.leave).length === 0) {
      delete clone.leave;
    }
  }

  if (clone.calc && typeof clone.calc === 'object') {
    delete clone.calc.daily_value_snapshot;
    if (Object.keys(clone.calc).length === 0) {
      delete clone.calc;
    }
  }

  const pruned = prune(clone);
  return pruned;
}

export function __setWorkSessionMetadataSupportForTests(value) {
  if (typeof value === 'boolean') {
    forcedSupport = value;
  } else {
    forcedSupport = null;
  }
  cachedSupportPromise = null;
}
