export function applyDayType(rows, dayType) {
  return rows.map(r => ({ ...r, dayType }));
}

const resolveIndex = (rows, key) => {
  if (typeof key === 'number' && Number.isInteger(key)) {
    return key >= 0 && key < rows.length ? key : -1;
  }
  if (key == null) return -1;
  return rows.findIndex(row => row?.id === key);
};

export function removeSegment(rows, key) {
  if (rows.length <= 1) {
    return { rows, removed: false };
  }
  const index = resolveIndex(rows, key);
  if (index === -1) {
    return { rows, removed: false };
  }
  return {
    rows: [...rows.slice(0, index), ...rows.slice(index + 1)],
    removed: true,
  };
}

export function duplicateSegment(rows, key) {
  const index = resolveIndex(rows, key);
  if (index === -1) return rows;
  const { id: _omitId, _status: _omitStatus, ...rest } = rows[index];
  const copy = {
    ...rest,
    _status: 'new',
  };
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
}

export function toggleDelete(rows, key) {
  const index = resolveIndex(rows, key);
  if (index === -1) {
    return { rows, changed: false };
  }
  const target = rows[index];
  const activeCount = rows.reduce((count, row) => (row._status === 'deleted' ? count : count + 1), 0);
  if (target._status === 'deleted') {
    return {
      rows: rows.map((row, idx) => (idx === index
        ? { ...row, _status: row.id ? 'existing' : 'new' }
        : row
      )),
      changed: true,
    };
  }
  if (activeCount <= 1) {
    return { rows, changed: false };
  }
  return {
    rows: rows.map((row, idx) => (idx === index ? { ...row, _status: 'deleted' } : row)),
    changed: true,
  };
}

export function sumHours(rows) {
  return rows
    .filter(r => r._status !== 'deleted')
    .reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
}
