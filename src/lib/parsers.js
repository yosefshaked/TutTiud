export const DELIMITERS = {
  ',': 'פסיק',
  '\t': 'TAB',
  ';': 'נקודה-פסיק',
  '|': 'קו-אנכי',
};

export function detectDelimiter(line) {
  let best = ',';
  let max = 0;
  for (const d of Object.keys(DELIMITERS)) {
    const parts = line.split(d);
    if (parts.length > max) {
      max = parts.length;
      best = d;
    }
  }
  return best;
}

export function parseText(text, overrideDelimiter) {
  const clean = text.replace(/^\ufeff/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return { delimiter: overrideDelimiter || ',', headers: [], rows: [] };
  const delimiter = overrideDelimiter || detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const rows = lines.slice(1).map(l => l.split(delimiter).map(c => c.trim()));
  return { delimiter, headers, rows };
}

export async function parseFile(file, overrideDelimiter) {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    throw new Error('XLSX parsing not supported');
  }
  const text = new TextDecoder('utf-8').decode(buf);
  return parseText(text, overrideDelimiter);
}
