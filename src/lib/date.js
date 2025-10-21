export function parseDateStrict(input) {
  if (!input) return { ok: false, date: null, error: 'format' };
  const str = input.trim();
  let day, month, year;
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]) - 1;
    day = Number(m[3]);
  } else {
    m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return { ok: false, date: null, error: 'format' };
    day = Number(m[1]);
    month = Number(m[2]) - 1;
    year = Number(m[3]);
    if (year < 100) year += 2000;
  }
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    return { ok: false, date: null, error: 'range' };
  }
  return { ok: true, date: d };
}

export function toISODateString(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isValidRange(start, end) {
  return !!(start && end && start <= end);
}

export function isFullMonthRange(start, end) {
  if (!start || !end) return false;
  return (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === 1 &&
    end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  );
}
