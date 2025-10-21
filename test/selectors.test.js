import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectGlobalHours,
  selectTotalHours,
  selectHolidayForDate,
  selectLeaveRemaining,
  selectLeaveDayValue,
} from '../src/selectors.js';

const employees = [
  { id: 'g1', employee_type: 'global' },
  { id: 'g2', employee_type: 'global' },
  { id: 'h1', employee_type: 'hourly' },
  { id: 'i1', employee_type: 'instructor' }
];

const services = [
  { id: 's1', duration_minutes: 60 }
];

const entries = [
  { employee_id: 'g1', entry_type: 'hours', hours: 2, date: '2024-02-01' },
  { employee_id: 'g1', entry_type: 'hours', hours: 3, date: '2024-02-01' },
  { employee_id: 'g1', entry_type: 'leave_system_paid', hours: 4, date: '2024-02-02' },
  { employee_id: 'g2', entry_type: 'hours', hours: 4, date: '2024-02-01' },
  { employee_id: 'g2', entry_type: 'hours', hours: 1, date: '2024-03-01' },
  { employee_id: 'h1', entry_type: 'hours', hours: 8, date: '2024-02-01' },
  { employee_id: 'i1', entry_type: 'session', sessions_count: 1, service_id: 's1', date: '2024-02-01' }
];

const leavePolicy = {
  allow_half_day: true,
  carryover_enabled: true,
  carryover_max_days: 3,
  holiday_rules: [
    { id: 'r1', name: 'ערב חג', type: 'half_day', start_date: '2025-04-21', end_date: '2025-04-21' },
  ],
};

const leaveBalances = [
  { employee_id: 'g1', effective_date: '2024-02-10', balance: -1, leave_type: 'usage_employee_paid' },
  { employee_id: 'g1', effective_date: '2024-06-01', balance: 2, leave_type: 'allocation' },
  { employee_id: 'g1', effective_date: '2025-01-05', balance: -0.5, leave_type: 'usage_half_day' },
];

describe('selectors', () => {
  it('selectGlobalHours respects filters', () => {
    const total = selectGlobalHours(entries, employees, { dateFrom: '2024-02-01', dateTo: '2024-02-28' });
    assert.equal(total, 9);
    const single = selectGlobalHours(entries, employees, { dateFrom: '2024-02-01', dateTo: '2024-02-28', selectedEmployee: 'g1' });
    assert.equal(single, 5);
  });

  it('selectTotalHours sums all sources', () => {
    const total = selectTotalHours(entries, services, employees, { dateFrom: '2024-02-01', dateTo: '2024-02-28' });
    assert.equal(total, 18);
  });

  it('selectHolidayForDate resolves rule by date', () => {
    const rule = selectHolidayForDate(leavePolicy, '2025-04-21');
    assert.ok(rule);
    assert.equal(rule.type, 'half_day');
  });

  it('selectLeaveRemaining computes summary', () => {
    const summary = selectLeaveRemaining('g1', '2025-02-01', {
      employees: [
        { id: 'g1', employee_type: 'global', annual_leave_days: 12, start_date: '2024-01-15' },
      ],
      leaveBalances,
      policy: leavePolicy,
    });
    assert.ok(summary.quota > 0);
    assert.ok(summary.remaining <= summary.quota);
  });
});

describe('selectLeaveDayValue', () => {
  const leavePaySettings = [
    {
      key: 'leave_pay_policy',
      settings_value: {
        default_method: 'legal',
        lookback_months: 3,
        legal_allow_12m_if_better: true,
        fixed_rate_default: 360,
      },
    },
  ];

  const hourlySessions = [
    { employee_id: 'h1', date: '2024-04-01', entry_type: 'hours', hours: '8', total_payment: 400 },
    { employee_id: 'h1', date: '2024-04-02', entry_type: 'hours', hours: '6', total_payment: 300 },
    { employee_id: 'h1', date: '2023-09-10', entry_type: 'hours', hours: '8', total_payment: 800 },
    { employee_id: 'h1', date: '2024-04-03', entry_type: 'hours', hours: '5', total_payment: 0, payable: false },
  ];

  it('computes legal method with optional 12-month fallback', () => {
    const value = selectLeaveDayValue('h1', '2024-04-15', {
      employees: [{ id: 'h1', employee_type: 'hourly' }],
      workSessions: hourlySessions,
      settings: leavePaySettings,
    });
    assert.equal(value, 500);
  });

  it('respects employee override for average hourly method', () => {
    const value = selectLeaveDayValue('h1', '2024-04-15', {
      employees: [{ id: 'h1', employee_type: 'hourly', leave_pay_method: 'avg_hourly_x_avg_day_hours' }],
      workSessions: hourlySessions,
      settings: leavePaySettings,
    });
    assert.equal(value, 350);
  });

  it('derives hours for session entries from services', () => {
    const services = [{ id: 'svc1', duration_minutes: 90 }];
    const sessionRows = [
      { employee_id: 'i1', date: '2024-04-01', entry_type: 'session', sessions_count: 2, service_id: 'svc1', total_payment: 600 },
      { employee_id: 'i1', date: '2024-04-02', entry_type: 'session', sessions_count: 1, service_id: 'svc1', total_payment: 300 },
    ];
    const value = selectLeaveDayValue('i1', '2024-04-15', {
      employees: [{ id: 'i1', employee_type: 'instructor', leave_pay_method: 'avg_hourly_x_avg_day_hours' }],
      workSessions: sessionRows,
      services,
      settings: leavePaySettings,
    });
    assert.equal(value, 450);
  });

  it('returns fixed rates from overrides and defaults', () => {
    const overrideValue = selectLeaveDayValue('e1', '2024-04-15', {
      employees: [{ id: 'e1', employee_type: 'hourly', leave_pay_method: 'fixed_rate', leave_fixed_day_rate: 420 }],
      workSessions: [],
      settings: leavePaySettings,
    });
    assert.equal(overrideValue, 420);

    const defaultValue = selectLeaveDayValue('e2', '2024-04-15', {
      employees: [{ id: 'e2', employee_type: 'hourly' }],
      workSessions: [],
      leavePayPolicy: {
        default_method: 'fixed_rate',
        lookback_months: 3,
        legal_allow_12m_if_better: false,
        fixed_rate_default: 390,
      },
    });
    assert.equal(defaultValue, 390);
  });

  it('returns 0 and logs a warning when data is missing', () => {
    const originalDebug = console.debug;
    let warned = false;
    console.debug = () => {
      warned = true;
    };
    let value = 0;
    try {
      value = selectLeaveDayValue('missing', '2024-04-15', {
        employees: [{ id: 'missing', employee_type: 'hourly' }],
        workSessions: [],
        settings: leavePaySettings,
      });
    } finally {
      console.debug = originalDebug;
    }
    assert.equal(value, 0);
    assert.equal(warned, true);
  });

  it('marks dates before start date as excluded', () => {
    const result = selectLeaveDayValue('h1', '2024-01-15', {
      employees: [{ id: 'h1', employee_type: 'hourly', start_date: '2024-02-01' }],
      workSessions: hourlySessions,
      settings: leavePaySettings,
      collectDiagnostics: true,
    });
    assert.equal(result.value, 0);
    assert.equal(result.preStartDate, true);
    assert.equal(result.insufficientData, false);
  });
});
