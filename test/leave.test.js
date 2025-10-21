import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEAVE_POLICY,
  normalizeLeavePolicy,
  findHolidayForDate,
  computeEmployeeLeaveSummary,
  projectBalanceAfterChange,
} from '../src/lib/leave.js';

const baseEmployee = {
  id: 'emp-1',
  start_date: '2024-01-15',
  annual_leave_days: 12,
};

const leaveBalancesSample = [
  { employee_id: 'emp-1', effective_date: '2024-03-10', balance: -1, leave_type: 'usage_employee_paid' },
  { employee_id: 'emp-1', effective_date: '2024-07-01', balance: '2', leave_type: 'allocation' },
  { employee_id: 'emp-1', effective_date: '2025-01-05', balance: -0.5, leave_type: 'usage_half_day' },
  { employee_id: 'emp-1', effective_date: '2025-01-20', balance: -1, leave_type: 'usage_employee_paid' },
];

const policyWithRules = normalizeLeavePolicy({
  allow_half_day: true,
  allow_negative_balance: true,
  negative_floor_days: 3,
  carryover_enabled: true,
  carryover_max_days: 5,
  holiday_rules: [
    {
      id: 'rule-1',
      name: 'יום העצמאות',
      type: 'system_paid',
      start_date: '2025-05-11',
      end_date: '2025-05-11',
    },
    {
      id: 'rule-2',
      name: 'ערב חג',
      type: 'half_day',
      start_date: '2025-04-21',
      end_date: '2025-04-21',
    },
  ],
});

describe('findHolidayForDate', () => {
  it('returns null when no rule matches', () => {
    const res = findHolidayForDate(policyWithRules, '2025-01-01');
    assert.equal(res, null);
  });

  it('returns matching rule with label', () => {
    const res = findHolidayForDate(policyWithRules, '2025-05-11');
    assert.ok(res);
    assert.equal(res.type, 'system_paid');
    assert.equal(res.label, 'חופשה בתשלום (על חשבון המערכת)');
  });

  it('supports half-day type', () => {
    const res = findHolidayForDate(policyWithRules, '2025-04-21');
    assert.ok(res);
    assert.equal(res.type, 'half_day');
    assert.equal(res.half_day, true);
  });
});

describe('computeEmployeeLeaveSummary', () => {
  it('handles proration for start year', () => {
    const summary = computeEmployeeLeaveSummary({
      employee: baseEmployee,
      leaveBalances: leaveBalancesSample,
      policy: DEFAULT_LEAVE_POLICY,
      date: '2024-05-01',
    });
    assert.ok(summary.quota < baseEmployee.annual_leave_days);
    assert.ok(summary.remaining < baseEmployee.annual_leave_days);
  });

  it('applies carryover with cap', () => {
    const summaryPrevYear = computeEmployeeLeaveSummary({
      employee: baseEmployee,
      leaveBalances: leaveBalancesSample,
      policy: policyWithRules,
      date: '2024-12-31',
    });
    const summaryCurrent = computeEmployeeLeaveSummary({
      employee: baseEmployee,
      leaveBalances: leaveBalancesSample,
      policy: policyWithRules,
      date: '2025-02-01',
    });
    assert.ok(summaryCurrent.carryIn <= policyWithRules.carryover_max_days);
    assert.ok(summaryPrevYear.remaining >= summaryCurrent.carryIn);
  });

  it('counts usage and adjustments', () => {
    const summary = computeEmployeeLeaveSummary({
      employee: baseEmployee,
      leaveBalances: leaveBalancesSample,
      policy: DEFAULT_LEAVE_POLICY,
      date: '2025-02-01',
    });
    assert.equal(Number(summary.used.toFixed(3)), 1.5);
    assert.ok(summary.adjustments < 0);
  });
});

describe('projectBalanceAfterChange', () => {
  it('computes projected remaining balance', () => {
    const projection = projectBalanceAfterChange({
      employee: baseEmployee,
      leaveBalances: leaveBalancesSample,
      policy: policyWithRules,
      date: '2025-02-01',
      delta: -1,
    });
    assert.ok(projection.projectedRemaining <= projection.remaining);
  });
});
