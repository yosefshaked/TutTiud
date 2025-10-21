import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sumHourlyHours, countGlobalEffectiveDays, sumInstructorSessions } from './payroll.js';

const employees = [
  { id: 'h1', employee_type: 'hourly' },
  { id: 'g1', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] },
  { id: 'i1', employee_type: 'instructor' }
];
const services = [{ id: 's1' }, { id: 's2' }];
const entries = [
  { employee_id: 'h1', date: '2024-02-05', entry_type: 'hours', hours: 5, service_id: 's1' },
  { employee_id: 'h1', date: '2024-02-06', entry_type: 'hours', hours: 3, service_id: 's2' },
  { employee_id: 'g1', date: '2024-02-05', entry_type: 'hours', service_id: 's1' },
  { employee_id: 'g1', date: '2024-02-06', entry_type: 'leave_system_paid', service_id: 's1' },
  { employee_id: 'i1', date: '2024-02-07', entry_type: 'session', sessions_count: 2, service_id: 's1' },
  { employee_id: 'i1', date: '2024-02-08', entry_type: 'session', sessions_count: 1, service_id: 's2' },
];

const baseFilters = {
  dateFrom: '2024-02-01',
  dateTo: '2024-02-28',
  employeeType: 'all',
  serviceId: 'all',
  selectedEmployee: null
};

describe('payroll helpers', () => {
  it('sums hourly hours with filters', () => {
    assert.equal(sumHourlyHours(entries, employees, baseFilters), 8);
    assert.equal(sumHourlyHours(entries, employees, { ...baseFilters, employeeType: 'global' }), 0);
  });
  it('counts global days excluding paid leave', () => {
    assert.equal(countGlobalEffectiveDays(entries, employees, baseFilters, { excludePaidLeave: true }), 1);
    assert.equal(countGlobalEffectiveDays(entries, employees, { ...baseFilters, employeeType: 'hourly' }), 0);
  });
  it('sums instructor sessions', () => {
    assert.equal(sumInstructorSessions(entries, services, employees, baseFilters), 3);
    assert.equal(sumInstructorSessions(entries, services, employees, { ...baseFilters, employeeType: 'hourly' }), 0);
  });
});
