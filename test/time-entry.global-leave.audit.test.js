import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  calculateGlobalDailyRate,
  computePeriodTotals,
} from '../src/lib/payroll.js';
import { collectGlobalDayAggregates } from '../src/lib/global-day-aggregator.js';
import { useTimeEntry } from '../src/components/time-entry/useTimeEntry.js';
import { __setWorkSessionMetadataSupportForTests } from '../src/lib/workSessionsMetadata.js';

function useGlobalLeaveHarness({ rate = 12000, startDate = '2024-01-01', workSessions = [] } = {}) {
  const employee = {
    id: 'g-audit',
    name: 'הילה',
    employee_type: 'global',
    working_days: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
    start_date: startDate,
  };
  const employees = [employee];
  const services = [];
  let inserted = [];
  const supabaseClient = {
    from() {
      return {
        insert: async (rows) => {
          inserted = rows.map(row => JSON.parse(JSON.stringify(row)));
          return { error: null, data: inserted };
        },
      };
    },
  };
  const getRateForDate = () => ({ rate, reason: rate ? null : 'missing rate' });
  const hook = useTimeEntry({ employees, services, getRateForDate, supabaseClient, workSessions });
  return {
    hook,
    employee,
    employees,
    services,
    getRateForDate,
    supabaseClient,
    getInserted: () => inserted,
  };
}

let warnings = [];
let errors = [];
let originalWarn;
let originalError;

describe('global leave audit', () => {
  beforeEach(() => {
    warnings = [];
    errors = [];
    originalWarn = console.warn;
    originalError = console.error;
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    __setWorkSessionMetadataSupportForTests(false);
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
    __setWorkSessionMetadataSupportForTests(null);
    assert.equal(warnings.length, 0, `Expected no console warnings but got: ${warnings.join(' | ')}`);
    assert.equal(errors.length, 0, `Expected no console errors but got: ${errors.join(' | ')}`);
  });

  it('marks unpaid leave as non-payable with zero preview and totals', async () => {
    const harness = useGlobalLeaveHarness();
    const { hook, employee, employees, services } = harness;
    const date = '2024-04-01';
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date, paid: false },
    ], { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    const inserted = harness.getInserted();
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].payable, false);
    assert.equal(inserted[0].total_payment, 0);
    assert.equal(inserted[0].rate_used, null);
    const agg = collectGlobalDayAggregates(inserted, { [employee.id]: employee });
    assert.equal(agg.size, 0);
    const totals = computePeriodTotals({
      workSessions: inserted,
      employees,
      services,
      startDate: '2024-04-01',
      endDate: '2024-04-30',
    });
    assert.equal(totals.totalPay, 0);
  });

  it('values system-paid leave with the global daily rate and matches reports', async () => {
    const rate = 15500;
    const harness = useGlobalLeaveHarness({ rate });
    const { hook, employee, employees, services } = harness;
    const date = '2024-04-03';
    const expectedDaily = calculateGlobalDailyRate(employee, date, rate);
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date, paid: true },
    ], { leaveType: 'system_paid' });
    assert.equal(result.inserted.length, 1);
    const inserted = harness.getInserted();
    assert.equal(inserted[0].payable, true);
    assert.equal(inserted[0].total_payment, expectedDaily);
    assert.equal(inserted[0].rate_used, rate);
    const agg = collectGlobalDayAggregates(inserted, { [employee.id]: employee });
    assert.equal(agg.size, 1);
    const [entry] = [...agg.values()];
    assert.equal(entry.dailyAmount, expectedDaily);
    const totals = computePeriodTotals({
      workSessions: inserted,
      employees,
      services,
      startDate: '2024-04-01',
      endDate: '2024-04-30',
    });
    assert.equal(totals.totalPay, expectedDaily);
  });

  it('treats employee-deducted leave the same as system-paid for valuation', async () => {
    const rate = 14250;
    const harness = useGlobalLeaveHarness({ rate });
    const { hook, employee, employees, services } = harness;
    const date = '2024-05-06';
    const expectedDaily = calculateGlobalDailyRate(employee, date, rate);
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date },
    ], { leaveType: 'employee_paid' });
    assert.equal(result.inserted.length, 1);
    const inserted = harness.getInserted();
    assert.equal(inserted[0].payable, true);
    assert.equal(inserted[0].total_payment, expectedDaily);
    const agg = collectGlobalDayAggregates(inserted, { [employee.id]: employee });
    const [entry] = [...agg.values()];
    assert.equal(entry.dailyAmount, expectedDaily);
    const totals = computePeriodTotals({
      workSessions: inserted,
      employees,
      services,
      startDate: '2024-05-01',
      endDate: '2024-05-31',
    });
    assert.equal(totals.totalPay, expectedDaily);
  });

  it('pays half-day leave at half the daily amount and reports the same total', async () => {
    const rate = 18000;
    const harness = useGlobalLeaveHarness({ rate });
    const { hook, employee, employees, services } = harness;
    const date = '2024-06-12';
    const fullDaily = calculateGlobalDailyRate(employee, date, rate);
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date },
    ], { leaveType: 'half_day' });
    assert.equal(result.inserted.length, 1);
    const inserted = harness.getInserted();
    assert.equal(inserted[0].total_payment, fullDaily / 2);
    const agg = collectGlobalDayAggregates(inserted, { [employee.id]: employee });
    const [entry] = [...agg.values()];
    assert.equal(entry.dailyAmount, fullDaily / 2);
    assert.equal(entry.multiplier, 0.5);
    const totals = computePeriodTotals({
      workSessions: inserted,
      employees,
      services,
      startDate: '2024-06-01',
      endDate: '2024-06-30',
    });
    assert.equal(totals.totalPay, fullDaily / 2);
  });

  it('respects per-date paid flags for mixed leave batches', async () => {
    const rate = 21000;
    const harness = useGlobalLeaveHarness({ rate });
    const { hook, employee, employees, services } = harness;
    const paidDate = '2024-07-08';
    const unpaidDate = '2024-07-09';
    const expectedDaily = calculateGlobalDailyRate(employee, paidDate, rate);
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date: paidDate, paid: true },
      { employee_id: employee.id, date: unpaidDate, paid: false },
    ], { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 2);
    const inserted = harness.getInserted();
    const paidRow = inserted.find(r => r.date === paidDate);
    const unpaidRow = inserted.find(r => r.date === unpaidDate);
    assert(paidRow);
    assert(unpaidRow);
    assert.equal(paidRow.payable, true);
    assert.equal(paidRow.total_payment, expectedDaily);
    assert.equal(unpaidRow.payable, false);
    assert.equal(unpaidRow.total_payment, 0);
    const agg = collectGlobalDayAggregates(inserted, { [employee.id]: employee });
    assert.equal(agg.size, 1);
    const [entry] = [...agg.values()];
    assert.equal(entry.dailyAmount, expectedDaily);
    const totals = computePeriodTotals({
      workSessions: inserted,
      employees,
      services,
      startDate: '2024-07-01',
      endDate: '2024-07-31',
    });
    assert.equal(totals.totalPay, expectedDaily);
  });

  it('keeps the multi-date vacation UI focused on paid vs unpaid choices for globals', () => {
    const content = fs.readFileSync(path.join('src', 'components', 'time-entry', 'MultiDateEntryModal.jsx'), 'utf8');
    assert(!content.includes('יום רגיל'));
    assert(content.includes('בתשלום'));
    assert(content.includes('לא בתשלום'));
  });

  it('blocks leave vs hours overlaps in both directions for global staff', async () => {
    const date = '2024-08-13';
    const leaveBlocked = useGlobalLeaveHarness({
      rate: 16000,
      workSessions: [
        { employee_id: 'g-audit', date, entry_type: 'hours' },
      ],
    });
    await assert.rejects(
      async () => leaveBlocked.hook.saveMixedLeave([
        { employee_id: leaveBlocked.employee.id, date, paid: true },
      ], { leaveType: 'mixed' }),
      (error) => {
        assert.equal(error.code, 'TIME_ENTRY_LEAVE_CONFLICT');
        assert.equal(error.conflicts.length, 1);
        assert.equal(error.conflicts[0].date, date);
        return true;
      },
    );

    const hoursBlocked = useGlobalLeaveHarness({
      rate: 16000,
      workSessions: [
        { employee_id: 'g-audit', date, entry_type: 'leave_system_paid', payable: true },
      ],
    });
    await assert.rejects(
      async () => hoursBlocked.hook.saveRows([
        { employee_id: hoursBlocked.employee.id, date, hours: '8' },
      ]),
      (error) => {
        assert.equal(error.code, 'TIME_ENTRY_REGULAR_CONFLICT');
        assert.equal(error.conflicts.length, 1);
        assert.equal(error.conflicts[0].date, date);
        return true;
      },
    );
  });

  it('guards start dates and ignores legacy pre-start leave in totals', async () => {
    const startDate = '2024-09-05';
    const rate = 19000;
    const harness = useGlobalLeaveHarness({ rate, startDate });
    const { hook, employee, employees, services } = harness;
    const result = await hook.saveMixedLeave([
      { employee_id: employee.id, date: '2024-09-04', paid: true },
      { employee_id: employee.id, date: '2024-09-06', paid: true },
    ], { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.invalidStartDates.length, 1);
    assert.equal(result.invalidStartDates[0].date, '2024-09-04');
    const inserted = harness.getInserted();
    assert.equal(inserted.length, 1);
    const daily = calculateGlobalDailyRate(employee, '2024-09-06', rate);
    assert.equal(inserted[0].total_payment, daily);
    const legacyRow = {
      employee_id: employee.id,
      date: '2024-09-01',
      entry_type: 'leave_system_paid',
      payable: true,
      total_payment: daily,
    };
    const totals = computePeriodTotals({
      workSessions: [...inserted, legacyRow],
      employees,
      services,
      startDate: '2024-09-01',
      endDate: '2024-09-30',
    });
    assert.equal(totals.totalPay, daily);
  });

  it('aligns combined global leave totals between the table and reports', () => {
    const rate = 20000;
    const harness = useGlobalLeaveHarness({ rate });
    const { employee, employees, services } = harness;
    const paidDate = '2024-10-02';
    const halfDate = '2024-10-03';
    const unpaidDate = '2024-10-06';
    const paidDaily = calculateGlobalDailyRate(employee, paidDate, rate);
    const halfDaily = calculateGlobalDailyRate(employee, halfDate, rate) / 2;
    const rows = [
      { employee_id: employee.id, date: paidDate, entry_type: 'leave_system_paid', payable: true, total_payment: paidDaily },
      { employee_id: employee.id, date: halfDate, entry_type: 'leave_half_day', payable: true, total_payment: halfDaily },
      { employee_id: employee.id, date: unpaidDate, entry_type: 'leave_system_paid', payable: false, total_payment: 0 },
    ];
    const agg = collectGlobalDayAggregates(rows, { [employee.id]: employee });
    const tableSum = [...agg.values()].reduce((sum, entry) => sum + entry.dailyAmount, 0);
    const totals = computePeriodTotals({
      workSessions: rows,
      employees,
      services,
      startDate: '2024-10-01',
      endDate: '2024-10-31',
    });
    assert.equal(tableSum, paidDaily + halfDaily);
    assert.equal(totals.totalPay, paidDaily + halfDaily);
  });
});
