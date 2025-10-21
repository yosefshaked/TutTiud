export const headerMap = {
  'תאריך': 'date',
  'סוג רישום': 'entry_type',
  'שירות': 'service_name',
  'שעות': 'hours',
  'מספר שיעורים': 'sessions_count',
  'מספר תלמידים': 'students_count',
  'סכום התאמה': 'adjustment_amount',
  'הערות': 'notes',
};

export const typeMap = {
  'שיעור': 'session',
  'שעות': 'hours',
  'התאמה': 'adjustment',
  'חופשה בתשלום': 'leave_system_paid',
};

function parseDate(value) {
  const match = value && value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return { error: 'תאריך לא תקין (צפוי DD/MM/YYYY)' };
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(iso);
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() + 1 !== Number(mm) || d.getDate() !== Number(dd)) {
    return { error: 'תאריך לא תקין (צפוי DD/MM/YYYY)' };
  }
  return { value: iso };
}

export function mapRows(headers, rows, services = []) {
  const indices = {};
  headers.forEach((h, idx) => {
    const key = headerMap[h];
    if (key) indices[key] = idx;
  });
  return rows.map(cols => {
    const obj = { errors: [] };
    const dateRes = parseDate(cols[indices.date] || '');
    if (dateRes.error) obj.errors.push(dateRes.error); else obj.date = dateRes.value;
    const typeLabel = cols[indices.entry_type] || '';
    obj.entry_type = typeMap[typeLabel];
    if (!obj.entry_type) obj.errors.push('סוג רישום לא מוכר');
    const serviceName = indices.service_name !== undefined ? cols[indices.service_name] || '' : '';
    obj.service_name = serviceName;
    if (serviceName) {
      const service = services.find(s => s.name === serviceName);
      if (service) obj.service_id = service.id; else obj.errors.push(`שירות לא נמצא: ${serviceName}`);
    }
    obj.hours = indices.hours !== undefined && cols[indices.hours] !== undefined ? Number(cols[indices.hours]) || null : null;
    obj.sessions_count = indices.sessions_count !== undefined && cols[indices.sessions_count] !== undefined ? Number(cols[indices.sessions_count]) || null : null;
    obj.students_count = indices.students_count !== undefined && cols[indices.students_count] !== undefined ? Number(cols[indices.students_count]) || null : null;
    obj.adjustment_amount = indices.adjustment_amount !== undefined && cols[indices.adjustment_amount] !== undefined ? Number(cols[indices.adjustment_amount]) || null : null;
    obj.notes = indices.notes !== undefined && cols[indices.notes] !== undefined ? cols[indices.notes] : '';
    return obj;
  });
}
