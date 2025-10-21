export const EMPLOYMENT_SCOPES = Object.freeze({
  full_time: 'משרה מלאה',
  half_time: 'חצי משרה',
  three_quarters_time: '75% משרה',
  quarter_time: '25% משרה',
});

export const EMPLOYMENT_SCOPE_ENTRIES = Object.freeze(Object.entries(EMPLOYMENT_SCOPES));
export const EMPLOYMENT_SCOPE_VALUES = Object.freeze(EMPLOYMENT_SCOPE_ENTRIES.map(([value]) => value));
export const EMPLOYMENT_SCOPE_LABEL_TO_VALUE = Object.freeze(
  Object.fromEntries(EMPLOYMENT_SCOPE_ENTRIES.map(([value, label]) => [label, value])),
);

const EMPLOYMENT_SCOPE_LOWER_VALUE_MAP = Object.freeze(
  Object.fromEntries(EMPLOYMENT_SCOPE_VALUES.map((value) => [value.toLowerCase(), value])),
);

export const EMPLOYMENT_SCOPE_OPTIONS = Object.freeze(
  EMPLOYMENT_SCOPE_ENTRIES.map(([value, label]) => ({ value, label })),
);

export function normalizeEmploymentScopeSystemValue(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }
  if (EMPLOYMENT_SCOPE_VALUES.includes(trimmed)) {
    return trimmed;
  }
  const lowerMatch = EMPLOYMENT_SCOPE_LOWER_VALUE_MAP[trimmed.toLowerCase()];
  if (lowerMatch) {
    return lowerMatch;
  }
  const fromLabel = EMPLOYMENT_SCOPE_LABEL_TO_VALUE[trimmed];
  if (fromLabel) {
    return fromLabel;
  }
  return '';
}

export function getEmploymentScopeLabel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = normalizeEmploymentScopeSystemValue(value);
  if (normalized) {
    return EMPLOYMENT_SCOPES[normalized] || '';
  }
  return value.trim();
}
