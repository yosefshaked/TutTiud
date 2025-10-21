import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePeriodTotals } from '../src/lib/payroll.js';

describe('payroll report totals', () => {
  const employees = [
    { id: 'g1', employee_type: 'global' },
    { id: 'h1', employee_type: 'hourly' }
  ];
  const rows = [
    { employee_id: 'g1', date: '2024-02-01', entry_type: 'hours', hours: 5, total_payment: 100, rate_used: 3000 },
    { employee_id: 'h1', date: '2024-02-01', entry_type: 'hours', hours: 8, total_payment: 200 }
  ];
  const totals = computePeriodTotals({
    workSessions: rows,
    employees,
    services: [],
    startDate: '2024-02-01',
    endDate: '2024-02-28'
  });
  it('includes global hours in per-employee and totals', () => {
    const emp = totals.totalsByEmployee.find(e => e.employee_id === 'g1');
    assert.equal(emp.hours, 5);
    assert.equal(totals.totalHours, 13);
  });
});
