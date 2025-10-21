// Keyboard layout swapper between EN and HE (Israeli layout)
// Maps by physical key position, not transliteration.

const EN_TO_HE = {
  q: '/', w: "'", e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ',
  a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת', '.': 'ץ', ';': 'ף',
};

const HE_TO_EN = {
  '/': 'q', "'": 'w', 'ק': 'e', 'ר': 'r', 'א': 't', 'ט': 'y', 'ו': 'u', 'ן': 'i', 'ם': 'o', 'פ': 'p',
  'ש': 'a', 'ד': 's', 'ג': 'd', 'כ': 'f', 'ע': 'g', 'י': 'h', 'ח': 'j', 'ל': 'k', 'ך': 'l',
  'ז': 'z', 'ס': 'x', 'ב': 'c', 'ה': 'v', 'נ': 'b', 'מ': 'n', 'צ': 'm', 'ת': ',', 'ץ': '.', 'ף': ';',
  // Map base/final pairs to the same key for safety
  'ך': 'l', 'ם': 'o', 'ן': 'i', 'ף': ';', 'ץ': '.',
};

export function swapLayout(str, to = 'he') {
  if (!str) return '';
  const map = to === 'he' ? EN_TO_HE : HE_TO_EN;
  let out = '';
  for (const ch of str) {
    const lower = ch.toLowerCase();
    const mapped = map[lower];
    out += mapped ? mapped : ch;
  }
  return out;
}

export function searchVariants(query) {
  if (!query) return [];
  const base = query.trim().toLowerCase();
  const enToHe = swapLayout(base, 'he');
  const heToEn = swapLayout(base, 'en');
  return Array.from(new Set([base, enToHe, heToEn])).filter(Boolean);
}

