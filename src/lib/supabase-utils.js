export function maskSupabaseCredential(value) {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.length <= 6) return '••••';
  return `${stringValue.slice(0, 3)}…${stringValue.slice(-3)}`;
}
