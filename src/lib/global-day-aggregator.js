import { isLeaveEntryType, getLeaveValueMultiplier } from './leave.js';

export function collectGlobalDayAggregates(rows = [], employeesById = {}) {
  const map = new Map();
  rows.forEach((row, index) => {
    if (!row || row.deleted) return;
    const employee = employeesById[row.employee_id];
    if (!employee || employee.employee_type !== 'global') return;
    if (employee.start_date && row.date < employee.start_date) return;
    const isHoursEntry = row.entry_type === 'hours';
    const isLeaveEntry = isLeaveEntryType(row.entry_type);
    if (!isHoursEntry && !isLeaveEntry) return;
    if (isLeaveEntry && row.payable === false) return;

    const key = `${row.employee_id}|${row.date}`;
    const amount = Number(row.total_payment);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const leaveMultiplier = isLeaveEntry
      ? getLeaveValueMultiplier({
        entry_type: row.entry_type,
        metadata: row.metadata,
        leave_type: row.leave_type,
        leave_kind: row.leave_kind,
      })
      : 0;
    const normalizedMultiplier = isLeaveEntry
      ? (Number.isFinite(leaveMultiplier) && leaveMultiplier > 0 ? leaveMultiplier : 1)
      : 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        dayType: row.entry_type,
        indices: [index],
        dailyAmount: safeAmount,
        payable: row.payable !== false,
        multiplier: normalizedMultiplier,
      });
    } else {
      existing.indices.push(index);
      existing.dailyAmount += safeAmount;
      if (normalizedMultiplier) {
        const current = Number.isFinite(existing.multiplier) ? existing.multiplier : 0;
        existing.multiplier = current + normalizedMultiplier;
      }
      if (existing.dayType && row.entry_type && existing.dayType !== row.entry_type) {
        existing.conflict = true;
      }
      existing.payable = existing.payable && row.payable !== false;
      if (!existing.dayType && row.entry_type) {
        existing.dayType = row.entry_type;
      }
    }
  });
  return map;
}
