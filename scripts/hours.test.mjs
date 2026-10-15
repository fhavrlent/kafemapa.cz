import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHours, statusAt } from '../assets/hours.js';

// 2026-10-14 je středa
const at = (iso) => new Date(iso);

test('běžný týden se svátky', () => {
  const w = parseHours('Mo-Fr 08:00-18:00; Sa,Su 09:00-14:00; PH off');
  assert.deepEqual(w[0], [[480, 1080]]);
  assert.deepEqual(w[6], [[540, 840]]);
});

test('24/7', () => {
  assert.deepEqual(parseHours('24/7')[3], [[0, 1440]]);
});

test('chybějící středník mezi pravidly', () => {
  const w = parseHours('Mo-Fr 11:00-21:00, Sa-Su 10:00-21:00');
  assert.deepEqual(w[5], [[600, 1260]]);
  const w2 = parseHours('Mo-Fr 07:00-19:00 Su-Sa 10:00-19:00');
  assert.deepEqual(w2[5], [[600, 1140]]);
});

test('pozdější pravidlo přebíjí dřívější', () => {
  const w = parseHours('Mo-Su 10:00-22:00; Mo off');
  assert.deepEqual(w[0], []);
  assert.deepEqual(w[1], [[600, 1320]]);
});

test('přes půlnoc', () => {
  const w = parseHours('Mo-Fr 09:00-02:00');
  // čtvrtek 1:30 ráno — otevřeno díky středě
  const s = statusAt(w, at('2026-10-15T01:30:00'));
  assert.equal(s.open, true);
  assert.equal(s.until, 120);
});

test('status: zavřeno, otevírá zítra', () => {
  const w = parseHours('Mo-Fr 08:00-18:00');
  const s = statusAt(w, at('2026-10-14T19:00:00'));
  assert.equal(s.open, false);
  assert.deepEqual(s.next, { day: 1, at: 480 });
});

test('status: brzy zavírá', () => {
  const w = parseHours('Mo-Su 08:00-18:00');
  assert.equal(statusAt(w, at('2026-10-14T17:45:00')).soon, true);
});

test('sezónní pravidla', () => {
  const str = 'May-Sep: Mo-Su 09:00-22:00; Oct-Apr: Mo-Fr 10:00-18:00';
  assert.deepEqual(parseHours(str, at('2026-07-01T12:00:00'))[6], [[540, 1320]]);
  assert.deepEqual(parseHours(str, at('2026-10-14T12:00:00'))[6], []);
  // jen letní provoz → mimo sezónu zavřeno, ne „neznámo“
  const summer = parseHours('Jun-Sep Mo-Fr 10:00-17:00', at('2026-10-14T12:00:00'));
  assert.ok(summer);
  assert.equal(statusAt(summer, at('2026-10-14T12:00:00')).open, false);
});

test('neznámý zápis vrací null', () => {
  assert.equal(parseHours('dle domluvy'), null);
  assert.equal(parseHours('Mo-Fr 08:00-18:00; Su "dle domluvy"'), null);
});

test('formatWeek', async () => {
  const { formatWeek } = await import('../assets/hours.js');
  assert.equal(formatWeek(parseHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00')), 'po–pá 8:00–18:00 · so 9:00–14:00 · ne zavřeno');
  assert.equal(formatWeek(parseHours('Mo-Su 10:00-22:00')), 'denně 10:00–22:00');
  assert.equal(formatWeek(parseHours('24/7')), 'nonstop');
  assert.equal(formatWeek(parseHours('Sa,Su 09:00-12:00,13:00-17:00')), 'po–pá zavřeno · so, ne 9:00–12:00, 13:00–17:00');
  assert.equal(formatWeek(null), null);
});

test('buildOpeningHours: skládání a zpětné čtení', async () => {
  const { buildOpeningHours } = await import('../assets/hours-editor.js');
  const day = (from, to) => ({ closed: false, from, to });
  const off = { closed: true, from: '08:00', to: '18:00' };
  const wk = [day('08:00', '18:00'), day('08:00', '18:00'), day('08:00', '18:00'), day('08:00', '18:00'), day('08:00', '18:00'), day('09:00', '14:00'), off];
  assert.equal(buildOpeningHours(wk), 'Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off');
  assert.equal(buildOpeningHours(Array(7).fill(day('10:00', '22:00'))), 'Mo-Su 10:00-22:00');
  assert.equal(buildOpeningHours([off, ...Array(6).fill(day('10:00', '00:00'))]), 'Mo off; Tu-Su 10:00-24:00');
  // přes půlnoc
  const late = buildOpeningHours(Array(7).fill(day('18:00', '02:00')));
  assert.equal(late, 'Mo-Su 18:00-02:00');
  // vše, co editor vyrobí, musí přečíst i náš parser
  for (const oh of [buildOpeningHours(wk), late, 'Mo off; Tu-Su 10:00-24:00']) assert.ok(parseHours(oh), oh);
  assert.deepEqual(parseHours('Mo off; Tu-Su 10:00-24:00')[1], [[600, 1440]]);
});

test('angličtina: formatWeek a statusLabel', async () => {
  const { formatWeek, statusLabel } = await import('../assets/hours.js');
  const w = parseHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00');
  assert.equal(formatWeek(w, 'en'), 'Mon–Fri 8:00–18:00 · Sat 9:00–14:00 · Sun closed');
  assert.equal(formatWeek(w), 'po–pá 8:00–18:00 · so 9:00–14:00 · ne zavřeno');
  assert.equal(statusLabel(w, at('2026-10-14T12:00:00'), 'en').text, 'Open until 18:00');
  assert.equal(statusLabel(w, at('2026-10-14T19:00:00'), 'en').text, 'Closed · opens tomorrow at 8:00');
  assert.equal(statusLabel(parseHours('24/7'), at('2026-10-14T03:00:00'), 'en').text, 'Open 24/7');
});
