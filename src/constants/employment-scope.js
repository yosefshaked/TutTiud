import {
  EMPLOYMENT_SCOPES,
  EMPLOYMENT_SCOPE_OPTIONS,
  EMPLOYMENT_SCOPE_VALUES,
  normalizeEmploymentScopeSystemValue,
} from '@/lib/translations.js';

export { EMPLOYMENT_SCOPES, EMPLOYMENT_SCOPE_OPTIONS };

export const EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES = ['global'];

const SUPPORTED_EMPLOYEE_TYPES = new Set(['global', 'hourly', 'instructor']);
const EMPLOYMENT_SCOPE_VALUE_SET = new Set(EMPLOYMENT_SCOPE_VALUES);

export function getEmploymentScopeValue(source) {
  if (!source) {
    return '';
  }
  const rawValue = typeof source === 'string'
    ? source
    : typeof source.employment_scope === 'string'
      ? source.employment_scope
      : '';
  const normalized = normalizeEmploymentScopeSystemValue(rawValue);
  return normalized && EMPLOYMENT_SCOPE_VALUE_SET.has(normalized) ? normalized : '';
}

export function normalizeEmploymentScopeEnabledTypes(source) {
  const rawList = Array.isArray(source) ? source : [];
  const normalized = rawList
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => SUPPORTED_EMPLOYEE_TYPES.has(item));
  const unique = new Set([...normalized, ...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
  return Array.from(unique);
}

export function normalizeEmploymentScopePolicy(value) {
  const enabledTypes = normalizeEmploymentScopeEnabledTypes(value?.enabled_types);
  return { enabledTypes };
}

export function sanitizeEmploymentScopeFilter(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const unique = new Set();
  values.forEach((value) => {
    const normalized = getEmploymentScopeValue(value);
    if (normalized) {
      unique.add(normalized);
    }
  });
  return Array.from(unique);
}
