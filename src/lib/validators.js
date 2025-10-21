import { calculateGlobalDailyRate } from './payroll.js';
import { isLeaveEntryType } from './leave.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export function validateRow(row, employee, services, getRateForDate) {
  const errors = [...row.errors];
  const empType = employee.employee_type;
  const rateServiceId = row.entry_type === 'session' ? row.service_id : GENERIC_RATE_SERVICE_ID;
  if (row.entry_type === 'session' && !row.service_id) errors.push('חסר שירות');
  const { rate: rateUsed, reason } = getRateForDate(employee.id, row.date, rateServiceId);
  let rate = rateUsed;
  if (!rate) errors.push(reason || 'לא נמצא תעריף');
  let totalPayment = null;
  if (row.entry_type === 'session') {
    if (empType === 'global') errors.push('אין להזין שירות לעובד גלובלי');
    if (!row.sessions_count || row.sessions_count < 1) errors.push('מספר שיעורים חסר או קטן מ-1');
    if (!row.students_count || row.students_count < 1) errors.push('מספר תלמידים חסר או קטן מ-1');
    if (row.hours) errors.push('אין להזין שעות');
    if (row.adjustment_amount) errors.push('אין להזין סכום התאמה');
    if (!errors.length) totalPayment = row.sessions_count * row.students_count * rate;
  } else if (row.entry_type === 'hours') {
    if (row.service_id) errors.push('אין להזין שירות');
    if (row.sessions_count || row.students_count) errors.push('אין להזין שיעורים/תלמידים');
    if (row.adjustment_amount) errors.push('אין להזין סכום התאמה');
    if (empType === 'hourly') {
      if (!row.hours) errors.push('חסרות שעות');
      if (!errors.length) totalPayment = row.hours * rate;
    } else if (empType === 'global') {
      try {
        const daily = calculateGlobalDailyRate(employee, row.date, rate);
        totalPayment = daily;
      } catch (err) {
        errors.push(err.message);
      }
    }
  } else if (isLeaveEntryType(row.entry_type)) {
    if (empType !== 'global') errors.push('חופשה בתשלום רק לעובד גלובלי');
    if (row.service_id || row.hours || row.sessions_count || row.students_count || row.adjustment_amount) errors.push('שדות לא רלוונטיים');
    try {
      const daily = calculateGlobalDailyRate(employee, row.date, rate);
      totalPayment = daily;
    } catch (err) {
      errors.push(err.message);
    }
  } else if (row.entry_type === 'adjustment') {
    if (row.service_id || row.hours || row.sessions_count || row.students_count) errors.push('שדות לא רלוונטיים');
    if (row.adjustment_amount === null || row.adjustment_amount === undefined) errors.push('חסר סכום התאמה');
    if (!errors.length) {
      totalPayment = row.adjustment_amount;
      rate = null;
    }
  }
  return { ...row, rate_used: rate, total_payment: totalPayment, errors };
}

export function validateRows(rows, employee, services, getRateForDate, includeDuplicates = false) {
  const seen = new Set();
  return rows.map(row => {
    const res = validateRow(row, employee, services, getRateForDate);
    const key = `${employee.id}|${row.date}|${row.entry_type}|${row.service_id || ''}`;
    if (seen.has(key)) {
      res.errors.push('שורה כפולה');
      res.duplicate = true;
    } else {
      seen.add(key);
    }
    if (includeDuplicates && res.duplicate) {
      res.errors = res.errors.filter(e => e !== 'שורה כפולה');
    }
    return res;
  });
}
