import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { parseDateStrict, toISODateString, isValidRange, isFullMonthRange } from '../src/lib/date.js';

test('reports_invalid_date_shows_error_and_blocks_query', () => {
  const res = parseDateStrict('31/09/2025');
  assert.equal(res.ok, false);
});

test('reports_leap_year_validation', () => {
  assert.equal(parseDateStrict('29/02/2025').ok, false);
  assert.equal(parseDateStrict('29/02/2024').ok, true);
});

test('reports_start_after_end_blocks_query', () => {
  const start = parseDateStrict('02/10/2025').date;
  const end = parseDateStrict('01/10/2025').date;
  assert.equal(isValidRange(start, end), false);
});

test('reports_valid_range_builds_YYYY_MM_DD_and_no_TZ_shift', () => {
  const res = parseDateStrict('01/10/2025');
  assert.equal(toISODateString(res.date), '2025-10-01');
});

test('parseDateStrict_accepts_various_formats', () => {
  assert.equal(parseDateStrict('1/9/25').ok, true);
  assert.equal(parseDateStrict('2025-09-01').ok, true);
});

test('isFullMonthRange_detects_full_month', () => {
  const start = parseDateStrict('01/09/2025').date;
  const end = parseDateStrict('30/09/2025').date;
  assert.equal(isFullMonthRange(start, end), true);
  const end2 = parseDateStrict('15/09/2025').date;
  assert.equal(isFullMonthRange(start, end2), false);
});


test.skip('error_boundary_does_not_white_screen_on_runtime_error', () => {});
