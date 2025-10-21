import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseText, detectDelimiter } from '../src/lib/parsers.js';
import { mapRows } from '../src/lib/csvMapping.js';
import { validateRows } from '../src/lib/validators.js';

const services = [
  { id: '1', name: 'חוג אנגלית', payment_model: 'per_student' },
  { id: '2', name: 'שיעור פרטי', payment_model: 'per_session' }
];

const hourlyEmp = { id: 'e1', employee_type: 'hourly', working_days: ['SUN','MON','TUE','WED','THU'] };
const globalEmp = { id: 'e2', employee_type: 'global', working_days: ['SUN','MON','TUE','WED','THU'] };

function stubRate(rate) {
  return () => ({ rate });
}

describe('delimiter detection', () => {
  it('detects tab delimiter', () => {
    const d = detectDelimiter('תאריך\tסוג רישום');
    assert.equal(d, '\t');
  });
});

describe('mapping and validation', () => {
  it('maps headers and validates session row', () => {
    const text = 'תאריך,סוג רישום,שירות,שעות,מספר שיעורים,מספר תלמידים\n10/02/2024,שיעור,חוג אנגלית,,1,5';
    const parsed = parseText(text);
    const mapped = mapRows(parsed.headers, parsed.rows, services);
    const validated = validateRows(mapped, hourlyEmp, services, stubRate(50));
    assert.equal(validated[0].errors.length, 0);
    assert.equal(validated[0].total_payment, 1 * 5 * 50);
  });

  it('flags comments and invalid service', () => {
    const text = '# comment\nתאריך,סוג רישום,שירות\n10/02/2024,שיעור,לא קיים';
    const parsed = parseText(text);
    const mapped = mapRows(parsed.headers, parsed.rows, services);
    const validated = validateRows(mapped, hourlyEmp, services, stubRate(50));
    assert.ok(validated[0].errors.some(e => e.includes('שירות לא נמצא')));
  });

  it('validates global paid leave', () => {
    const text = 'תאריך,סוג רישום\n11/02/2024,חופשה בתשלום';
    const parsed = parseText(text);
    const mapped = mapRows(parsed.headers, parsed.rows, services);
    const validated = validateRows(mapped, globalEmp, services, stubRate(10000));
    assert.equal(validated[0].total_payment, 10000 / 21);
  });
});

