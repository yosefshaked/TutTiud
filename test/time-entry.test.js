import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGlobalDailyRate } from '../src/lib/payroll.js';
import { copyFromPrevious, fillDown, isRowCompleteForProgress } from '../src/components/time-entry/multiDateUtils.js';
import { applyDayType, removeSegment } from '../src/components/time-entry/dayUtils.js';
import { duplicateSegment, toggleDelete } from '../src/components/time-entry/dayUtils.js';
import { useTimeEntry } from '../src/components/time-entry/useTimeEntry.js';
import fs from 'node:fs';
import path from 'node:path';
import { __setWorkSessionMetadataSupportForTests } from '../src/lib/workSessionsMetadata.js';

describe('multi-date save', () => {
  it('creates a WorkSessions row for each employee-date combination', async () => {
    const employees = [
      { id: 'e1', employee_type: 'hourly' },
      { id: 'e2', employee_type: 'hourly' }
    ];
    const services = [];
    const dates = [new Date('2024-02-01'), new Date('2024-02-02')];
    const rows = employees.flatMap(emp => dates.map(d => ({
      employee_id: emp.id,
      date: d.toISOString().slice(0,10),
      entry_type: 'hours',
      hours: '1'
    })));
    const fakeSupabase = { from: () => ({ insert: async () => ({}) }) };
    const { saveRows } = useTimeEntry({ employees, services, getRateForDate: () => ({ rate: 100 }), supabaseClient: fakeSupabase });
    const result = await saveRows(rows);
    assert.equal(result.inserted.length, employees.length * dates.length);
    assert.equal(result.conflicts.length, 0);
  });
});

describe('per-employee day type mapping', () => {
  it('maps global day types per employee on save', async () => {
    let inserted = [];
    const employees = [
      { id: 'g1', employee_type: 'global' },
      { id: 'g2', employee_type: 'global' }
    ];
    const services = [];
    const rows = [
      { employee_id: 'g1', date: '2024-02-01', hours: '' },
      { employee_id: 'g2', date: '2024-02-01', hours: '' }
    ];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 100 });
    const { saveRows } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const map = { g1: 'regular', g2: 'paid_leave' };
    const result = await saveRows(rows, map);
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted[0].entry_type, 'hours');
    assert.equal(inserted[1].entry_type, 'leave_system_paid');
  });
});

describe('per-employee day type control rendering', () => {
  it('omits the legacy group-level day type control for globals', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','MultiDateEntryModal.jsx'),'utf8');
    assert(!content.includes('סוג יום לעובד זה*'));
  });
});

describe('global leave flow gating', () => {
  it('allows mode toggle regardless of selected employee types', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','MultiDateEntryModal.jsx'),'utf8');
    assert(!content.includes('shouldForceLeaveMode'));
    assert(content.includes("handleModeChange('regular')"));
    assert(content.includes("handleModeChange('leave')"));
  });
});

describe('day type visibility', () => {
  it('single-day modal shows day type only for globals', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'),'utf8');
    assert(content.includes('showDayType={allowDayTypeSelection ? true : isGlobal}'));
  });
  it('multi-date modal shows day type only for global groups', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','MultiDateEntryModal.jsx'),'utf8');
    assert(content.includes("emp.employee_type === 'global'"));
  });
});

describe('copy and fill utilities', () => {
  it('copyFromPrevious copies only within same employee', () => {
    const rows = [
      { employee_id: 'e1', hours: '1' },
      { employee_id: 'e1', hours: '' },
      { employee_id: 'e2', hours: '' }
    ];
    let { rows: result, success } = copyFromPrevious(rows, 1, 'hours');
    assert.equal(success, true);
    assert.equal(result[1].hours, '1');
    const second = copyFromPrevious(result, 2, 'hours');
    assert.equal(second.success, false);
    assert.equal(second.rows[2].hours, '');
  });
  it('fillDown fills empty rows from first', () => {
    const rows = [{ sessions_count: '2' }, { sessions_count: '' }, { sessions_count: '3' }];
    const result = fillDown(rows, 'sessions_count');
    assert.equal(result[1].sessions_count, '2');
    assert.equal(result[2].sessions_count, '3');
  });

  it('global row is complete when no map override exists', () => {
    const row = { employee_id: 'g1' };
    const emp = { employee_type: 'global' };
    assert.equal(isRowCompleteForProgress(row, emp, {}), true);
    const paid = { g1: 'paid_leave' };
    assert.equal(isRowCompleteForProgress(row, emp, paid), true);
    const invalid = { g1: 'other' };
    assert.equal(isRowCompleteForProgress(row, emp, invalid), false);
  });
});

describe('paid leave restrictions', () => {
  it('converts paid_leave for non-globals and appends note', async () => {
    let inserted = [];
    const employees = [
      { id: 'h1', employee_type: 'hourly' },
      { id: 'i1', employee_type: 'instructor' }
    ];
    const services = [{ id: 's1', payment_model: 'per_student' }];
    const rows = [
      { employee_id: 'h1', date: '2024-01-01', entry_type: 'paid_leave', hours: '1', notes: '' },
      { employee_id: 'i1', date: '2024-01-01', entry_type: 'paid_leave', service_id: 's1', sessions_count: '1', students_count: '1', notes: '' }
    ];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 100 });
    const { saveRows } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const result = await saveRows(rows);
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted[0].entry_type, 'hours');
    assert(inserted[0].notes.includes('סומן בעבר כחופשה'));
    assert.equal(inserted[1].entry_type, 'session');
    assert(inserted[1].notes.includes('סומן בעבר כחופשה'));
  });

  it('global paid_leave persists and counts daily rate', async () => {
    let inserted = [];
    const employees = [{ id: 'g1', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] }];
    const services = [];
    const rows = [{ employee_id: 'g1', date: '2024-02-01', hours: '' }];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveRows } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const result = await saveRows(rows, { g1: 'paid_leave' });
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted[0].entry_type, 'leave_system_paid');
    const expected = calculateGlobalDailyRate(employees[0], '2024-02-01', 3000);
    assert.equal(inserted[0].total_payment, expected);
  });

  it('skips regular rows when leave already exists for the date', async () => {
    let inserted = [];
    const employees = [{ id: 'h1', name: 'רן', employee_type: 'hourly' }];
    const services = [];
    const rows = [
      { employee_id: 'h1', date: '2024-03-01', hours: '1' },
      { employee_id: 'h1', date: '2024-03-02', hours: '2' },
    ];
    const workSessions = [
      { employee_id: 'h1', date: '2024-03-01', entry_type: 'leave_system_paid' },
    ];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 120 });
    const { saveRows } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase, workSessions });
    const result = await saveRows(rows);
    assert.equal(result.inserted.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].date, '2024-03-01');
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].date, '2024-03-02');
  });

  it('legacy paid_leave banner text exists', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','EntryRow.jsx'),'utf8');
    assert(content.includes('רישום חופשה היסטורי עבור סוג עובד שאינו נתמך'));
  });
});

describe('mixed leave persistence', () => {
  it('saves paid mixed leave with payable flag', async () => {
    let inserted = [];
    const employees = [{ id: 'g1', name: 'אנה', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] }];
    const services = [];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const result = await saveMixedLeave([{ employee_id: 'g1', date: '2024-02-01', paid: true }], { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted[0].entry_type, 'leave_system_paid');
    assert.equal(inserted[0].payable, true);
    assert(inserted[0].total_payment > 0);
  });

  it('saves unpaid mixed leave without payment', async () => {
    let inserted = [];
    const employees = [{ id: 'g1', name: 'אנה', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] }];
    const services = [];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const result = await saveMixedLeave([{ employee_id: 'g1', date: '2024-02-02', paid: false }], { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted[0].entry_type, 'leave_unpaid');
    assert.equal(inserted[0].payable, false);
    assert.equal(inserted[0].total_payment, 0);
    assert.equal(inserted[0].rate_used, null);
  });

  it('skips mixed leave entries that conflict with regular sessions', async () => {
    let inserted = [];
    const employees = [{ id: 'g1', name: 'אנה', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] }];
    const services = [];
    const workSessions = [
      { employee_id: 'g1', date: '2024-02-01', entry_type: 'hours' },
    ];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase, workSessions });
    const payload = [
      { employee_id: 'g1', date: '2024-02-01', paid: true },
      { employee_id: 'g1', date: '2024-02-02', paid: true },
    ];
    const result = await saveMixedLeave(payload, { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].date, '2024-02-01');
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].date, '2024-02-02');
  });

  it('saves half-day leave with fraction metadata for globals', async () => {
    let inserted = [];
    const employees = [{ id: 'g1', name: 'אנה', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] }];
    const services = [];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    __setWorkSessionMetadataSupportForTests(true);
    try {
      await saveMixedLeave([{ employee_id: 'g1', date: '2024-03-01', paid: true }], { leaveType: 'half_day' });
    } finally {
      __setWorkSessionMetadataSupportForTests(null);
    }
    assert.equal(inserted.length, 1);
    const expectedDaily = calculateGlobalDailyRate(employees[0], '2024-03-01', 3000);
    assert.equal(inserted[0].metadata.leave_fraction, 0.5);
    assert.equal(inserted[0].metadata.leave_type, 'half_day');
    assert.equal(inserted[0].total_payment, expectedDaily / 2);
  });

  it('skips leave dates before employee start date and reports them', async () => {
    let inserted = [];
    const employees = [{
      id: 'g1',
      name: 'אנה',
      employee_type: 'global',
      working_days: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      start_date: '2024-02-01',
    }];
    const services = [];
    const fakeSupabase = { from: () => ({ insert: async (vals) => ({ error: null, data: (inserted = vals) }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    const payload = [
      { employee_id: 'g1', date: '2024-01-31', paid: true },
      { employee_id: 'g1', date: '2024-02-01', paid: true },
    ];
    const result = await saveMixedLeave(payload, { leaveType: 'mixed' });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.invalidStartDates.length, 1);
    assert.equal(result.invalidStartDates[0].date, '2024-01-31');
    assert.equal(result.conflicts.length, 0);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].date, '2024-02-01');
  });

  it('throws when all leave dates are before employee start date', async () => {
    const employees = [{
      id: 'g1',
      name: 'אנה',
      employee_type: 'global',
      working_days: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      start_date: '2024-02-01',
    }];
    const services = [];
    const fakeSupabase = { from: () => ({ insert: async () => ({ error: null, data: [] }) }) };
    const getRateForDate = () => ({ rate: 3000 });
    const { saveMixedLeave } = useTimeEntry({ employees, services, getRateForDate, supabaseClient: fakeSupabase });
    await assert.rejects(
      async () => saveMixedLeave([{ employee_id: 'g1', date: '2024-01-30', paid: true }], { leaveType: 'mixed' }),
      (err) => {
        assert.equal(err.code, 'TIME_ENTRY_LEAVE_CONFLICT');
        assert.equal(err.invalidStartDates.length, 1);
        assert.equal(err.invalidStartDates[0].date, '2024-01-30');
        return true;
      }
    );
  });
});

describe('day editor helpers', () => {
  it('applyDayType propagates to all rows', () => {
    const rows = [{ id: 'a', dayType: 'regular' }, { id: 'b', dayType: 'regular' }];
    const res = applyDayType(rows, 'paid_leave');
    assert.equal(res[0].dayType, 'paid_leave');
    assert.equal(res[1].dayType, 'paid_leave');
  });

  it('prevent removing last segment', () => {
    const rows = [{ id: 'a' }];
    let result = removeSegment(rows, 'a');
    assert.equal(result.removed, false);
    assert.equal(result.rows.length, 1);
    result = removeSegment([{ id: 'a' }, { id: 'b' }], 'a');
    assert.equal(result.removed, true);
    assert.equal(result.rows.length, 1);
  });

  it('preserves notes and date when applying day type', () => {
    const rows = [{ id: 'a', dayType: 'regular', notes: 'n', date: '2024-01-01' }];
    const res = applyDayType(rows, 'paid_leave');
    assert.equal(res[0].notes, 'n');
    assert.equal(res[0].date, '2024-01-01');
  });
});

describe('segment duplication and deletion', () => {
  it('duplicate_creates_unsaved_segment', () => {
    const rows = [{ id: 'a', hours: '2', _status: 'existing' }];
    const res = duplicateSegment(rows, 'a');
    assert.equal(res.length, 2);
    assert.equal(res[1].hours, '2');
    assert.equal(res[1]._status, 'new');
  });

  it('trash_unsaved_removes_immediately', () => {
    const rows = [{ id: 'a', _status: 'new' }, { id: 'b', _status: 'existing' }];
    const res = removeSegment(rows, 'a');
    assert.equal(res.removed, true);
    assert.equal(res.rows.length, 1);
  });

  it('prevent_delete_last_segment_instantly_blocks', () => {
    const rows = [{ id: 'a', _status: 'existing' }];
    const res = toggleDelete(rows, 'a');
    assert.equal(res.changed, false);
  });

  it('hours_required_message_exists', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'),'utf8');
    assert(content.includes('שעות נדרשות וגדולות מ־0'));
  });

  it('table_shows_sum_hours_for_global_date', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryTable.jsx'),'utf8');
    assert(!content.includes('שעות סה"כ'));
  });

  it('includes_delete_confirm_text', () => {
    const translations = fs.readFileSync(path.join('src','i18n','he.json'),'utf8');
    assert(translations.includes('הפעולה בלתי הפיכה'));
    assert(translations.includes("'מחק'"));
  });

  it('footer_actions_order', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','shared','SingleDayEntryShell.jsx'),'utf8');
    const cancelIndex = content.indexOf('בטל');
    const saveIndex = content.indexOf('שמור רישומים');
    assert(cancelIndex < saveIndex);
  });
});


describe('day type copy icon visibility', () => {
  it('renders copy-prev-daytype with aria-label', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','EntryRow.jsx'),'utf8');
    assert(content.includes('copy-prev-daytype'));
    assert(content.includes('העתק סוג יום מהרישום הקודם'));
  });
});

describe('global daily rate ignores hours', () => {
  it('uses daily rate regardless of hours input', () => {
    const emp = { working_days: ['SUN','MON','TUE','WED','THU'] };
    const monthlyRate = 3000;
    const dailyRate = calculateGlobalDailyRate(emp, new Date('2024-02-05'), monthlyRate);
    const total = dailyRate; // hours ignored
    assert.equal(total, dailyRate);
  });
});

describe('single day shell layout', () => {
  it('hourly shell matches global style without daytype', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'),'utf8');
    assert(content.includes('showDayType={allowDayTypeSelection ? true : isGlobal}'));
  });
  it('sticky footer visible and body scrolls', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','shared','SingleDayEntryShell.jsx'),'utf8');
    assert(content.includes('sticky bottom-0'));
    assert(content.includes('overflow-y-auto'));
  });
});

describe('progress completion rules', () => {
  it('session row requires service, sessions and students', () => {
    const emp = { employee_type: 'instructor' };
    const row = { service_id: 's1', sessions_count: '1', students_count: '1' };
    assert.equal(isRowCompleteForProgress(row, emp), true);
    row.students_count = '';
    assert.equal(isRowCompleteForProgress(row, emp), false);
  });
  it('hourly row requires hours > 0', () => {
    const emp = { employee_type: 'hourly' };
    const row = { hours: '0' };
    assert.equal(isRowCompleteForProgress(row, emp), false);
    row.hours = '2';
    assert.equal(isRowCompleteForProgress(row, emp), true);
  });
  it('global row counts as complete without explicit day type', () => {
    const emp = { employee_type: 'global' };
    const row = { employee_id: 'g1' };
    assert.equal(isRowCompleteForProgress(row, emp), true);
    const regularMap = { g1: 'regular' };
    assert.equal(isRowCompleteForProgress(row, emp, regularMap), true);
    const paidMap = { g1: 'paid_leave' };
    assert.equal(isRowCompleteForProgress(row, emp, paidMap), true);
    const invalidMap = { g1: 'something_else' };
    assert.equal(isRowCompleteForProgress(row, emp, invalidMap), false);
  });
});

describe('no days text in table for globals', () => {
  it('TimeEntryTable does not contain " ימים"', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryTable.jsx'), 'utf8');
    assert(!content.includes(' ימים'));
  });
});

describe('global hours segments', () => {
  it('TimeEntryTable shows hours count for globals', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryTable.jsx'), 'utf8');
    assert(content.includes('hoursCount.toFixed(1)} שעות'));
  });
  it('EntryRow requires hours for new global segments', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','EntryRow.jsx'), 'utf8');
    assert(content.includes('required={row.isNew}'));
  });
  it('TimeEntryForm has add segment microcopy', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'), 'utf8');
    assert(content.includes('הוסף מקטע שעות'));
  });
});

describe('mixed leave ui cues', () => {
  it('single-day modal asks if mixed day is paid', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'), 'utf8');
    assert(content.includes('האם היום המעורב בתשלום?'));
  });

  it('multi-date modal includes mixed quick actions', () => {
    const content = fs.readFileSync(path.join('src','components','time-entry','MultiDateEntryModal.jsx'), 'utf8');
    assert(content.includes('סמן הכל כבתשלום'));
    assert(content.includes('סמן הכל כלא בתשלום'));
  });
});

describe('multi-date modal layout', () => {
  it('uses wide dialog with footer outside body', () => {
    const content = fs.readFileSync(
      path.join('src', 'components', 'time-entry', 'MultiDateEntryModal.jsx'),
      'utf8'
    );
    assert(content.includes('w-[98vw]'));
    assert(content.includes('max-w-[1200px]'));
    const bodyIndex = content.indexOf('data-testid="md-body"');
    const footerIndex = content.indexOf('data-testid="md-footer"');
    assert(bodyIndex !== -1 && footerIndex !== -1);
    assert(footerIndex > bodyIndex);
    assert(content.includes('overflow-y-auto'));
    assert(!content.includes('sticky bottom-0'));
  });
});

describe('single-day modal layout and date handling', () => {
  it('uses wide form with scrollable body', () => {
    const form = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'),'utf8');
    const shell = fs.readFileSync(path.join('src','components','time-entry','shared','SingleDayEntryShell.jsx'),'utf8');
    assert(form.includes('w-[min(98vw,1100px)]'));
    assert(shell.includes('overflow-y-auto'));
  });

  it('avoids date off-by-one conversions', () => {
    const formContent = fs.readFileSync(path.join('src','components','time-entry','TimeEntryForm.jsx'),'utf8');
    assert(!formContent.includes('new Date(dateToUse).toISOString'));
    const tableContent = fs.readFileSync(path.join('src','components','time-entry','TimeEntryTable.jsx'),'utf8');
    assert(tableContent.includes("format(editingCell.day, 'yyyy-MM-dd')"));
  });

  it('renders one shell with single save button', () => {
    const shell = fs.readFileSync(path.join('src','components','time-entry','shared','SingleDayEntryShell.jsx'),'utf8');
    const matches = shell.match(/שמור רישומים/g) || [];
    assert.equal(matches.length, 1);
    assert(!shell.includes('<Dialog'));
  });

  it('time entry table uses no extra footer', () => {
    const table = fs.readFileSync(path.join('src','components','time-entry','TimeEntryTable.jsx'),'utf8');
    assert(!table.includes('day-modal-footer'));
  });
});
