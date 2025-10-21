export function copyFromPrevious(rows, index, field) {
  const curr = rows[index];
  let prevIndex = index - 1;
  while (prevIndex >= 0 && rows[prevIndex].employee_id !== curr.employee_id) {
    prevIndex -= 1;
  }
  if (prevIndex < 0) return { rows, success: false };
  const prev = rows[prevIndex];
  if (prev[field] === undefined || prev[field] === '' || prev[field] === null) {
    return { rows, success: false };
  }
  const updated = [...rows];
  updated[index] = { ...curr, [field]: prev[field] };
  return { rows: updated, success: true };
}

export function fillDown(rows, field) {
  const first = rows[0]?.[field];
  if (first === undefined) return rows;
  return rows.map(r => ({ ...r, [field]: r[field] || first }));
}

export function formatDatesCount(n) {
  if (n === 1) return 'תאריך להזנה';
  if (n > 1) return `${n} תאריכים להזנה`;
  return 'אין תאריכים';
}

export function isRowCompleteForProgress(row, employee, dayTypeMap = {}) {
  if (employee.employee_type === 'instructor') {
    return Boolean(row.service_id) && parseInt(row.sessions_count, 10) >= 1 && parseInt(row.students_count, 10) >= 1;
  }
  if (employee.employee_type === 'hourly') {
    return parseFloat(row.hours) > 0;
  }
  if (employee.employee_type === 'global') {
    if (dayTypeMap && Object.prototype.hasOwnProperty.call(dayTypeMap, row.employee_id)) {
      const dt = dayTypeMap[row.employee_id];
      return dt === 'regular' || dt === 'paid_leave';
    }
    return true;
  }
  return false;
}
