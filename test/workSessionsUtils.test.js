import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hasDuplicateSession } from '../src/lib/workSessionsUtils.js';

describe('hasDuplicateSession', () => {
  const existing = [
    { id: '1', employee_id: 'e1', date: '2024-01-01', entry_type: 'hours', hours: 5 },
    { id: '2', employee_id: 'e1', date: '2024-01-01', entry_type: 'leave_system_paid', hours: null },
  ];

  it('detects duplicates with different id', () => {
    const candidate = { id: '3', employee_id: 'e1', date: '2024-01-01', entry_type: 'hours', hours: 5 };
    assert.ok(hasDuplicateSession(existing, candidate));
  });

  it('ignores same row by id', () => {
    const candidate = { id: '1', employee_id: 'e1', date: '2024-01-01', entry_type: 'hours', hours: 5 };
    assert.ok(!hasDuplicateSession(existing, candidate));
  });

  it('differs by hours', () => {
    const candidate = { id: '3', employee_id: 'e1', date: '2024-01-01', entry_type: 'hours', hours: 6 };
    assert.ok(!hasDuplicateSession(existing, candidate));
  });

  it('differs by entry_type', () => {
    const candidate = { id: '3', employee_id: 'e1', date: '2024-01-01', entry_type: 'session', hours: null };
    assert.ok(!hasDuplicateSession(existing, candidate));
  });
});
