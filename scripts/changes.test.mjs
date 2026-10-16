import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChanges, appendChanges } from './changes.mjs';

const city = [{ n: 'Brno' }];
const ds = (date, cafes) => ({ osmBase: `${date}T03:00:00Z`, cities: city, cafes });
const cafe = (i, n, extra = {}) => ({ i, n, y: 49.19, x: 16.6, c: 0, ...extra });

test('přibylo, zmizelo, otevírací doba', () => {
  const prev = ds('2026-10-12', [cafe('n1', 'Alfa'), cafe('n2', 'Beta', { o: 'Mo-Fr 08:00-18:00' }), cafe('n3', 'Gama')]);
  const next = ds('2026-10-19', [cafe('n1', 'Alfa', { o: 'Mo-Su 09:00-17:00' }), cafe('n2', 'Beta', { o: 'Mo-Fr 07:00-18:00' }), cafe('n4', 'Delta')]);
  const ch = computeChanges(prev, next);
  assert.equal(ch.from, '2026-10-12');
  assert.deepEqual(ch.added.map((c) => c.n), ['Delta']);
  assert.deepEqual(ch.removed.map((c) => c.n), ['Gama']);
  assert.deepEqual(ch.hoursAdded.map((c) => c.n), ['Alfa']);
  assert.deepEqual(ch.hoursChanged.map((c) => c.n), ['Beta']);
  assert.equal(ch.added[0].c, 'Brno');
});

test('překreslení v OSM (nové id, stejné jméno a místo) není nová kavárna', () => {
  const prev = ds('2026-10-12', [cafe('n1', 'Kafec')]);
  const next = ds('2026-10-19', [cafe('w9', 'Kafec', { y: 49.1902, o: 'Mo-Fr 08:00-16:00' })]);
  const ch = computeChanges(prev, next);
  assert.equal(ch.added.length, 0);
  assert.equal(ch.removed.length, 0);
  assert.deepEqual(ch.hoursAdded.map((c) => c.i), ['w9']);
});

test('stejné jméno daleko od sebe jsou dva různé podniky', () => {
  const prev = ds('2026-10-12', [cafe('n1', 'Kafec')]);
  const next = ds('2026-10-19', [cafe('n2', 'Kafec', { y: 50.08, x: 14.42 })]);
  const ch = computeChanges(prev, next);
  assert.equal(ch.added.length, 1);
  assert.equal(ch.removed.length, 1);
});

test('historie: první stažení se nezapisuje, stejný den se přepíše, nejnovější první', () => {
  const first = computeChanges(null, ds('2026-10-12', []));
  assert.deepEqual(appendChanges([], first), []);
  assert.deepEqual(appendChanges([], { date: '2026-10-15', from: '2026-10-15', added: [], removed: [], hoursAdded: [], hoursChanged: [] }), []);
  const a = { date: '2026-10-19', from: '2026-10-12', added: [], removed: [], hoursAdded: [], hoursChanged: [] };
  const b = { ...a, date: '2026-10-26', from: '2026-10-19' };
  let h = appendChanges([], a);
  h = appendChanges(h, b);
  h = appendChanges(h, { ...b, added: [{ n: 'X' }] });
  assert.deepEqual(h.map((x) => x.date), ['2026-10-26', '2026-10-19']);
  assert.equal(h[0].added.length, 1);
});

test('denní stažení se slučují do týdne (od pondělí)', () => {
  const day = (date, from, extra = {}) => ({ date, from, added: [], removed: [], hoursAdded: [], hoursChanged: [], ...extra });
  const b = (i, n) => ({ i, n, y: 49.19, x: 16.6 });
  let h = [];
  h = appendChanges(h, day('2026-10-20', '2026-10-19', { added: [b('n1', 'Alfa'), b('n2', 'Beta')] }));
  h = appendChanges(h, day('2026-10-21', '2026-10-20', { hoursAdded: [b('n1', 'Alfa'), b('n3', 'Gama')] }));
  h = appendChanges(h, day('2026-10-22', '2026-10-21', { removed: [b('n2', 'Beta')], hoursChanged: [b('n3', 'Gama')] }));
  assert.equal(h.length, 1);
  assert.deepEqual([h[0].from, h[0].date, h[0].week], ['2026-10-19', '2026-10-22', '2026-10-19']);
  assert.deepEqual(h[0].added.map((c) => c.n), ['Alfa']); // Beta přibyla a zase zmizela
  assert.deepEqual(h[0].removed, []);
  assert.deepEqual(h[0].hoursAdded.map((c) => c.n), ['Gama']); // Alfa je nové místo
  assert.deepEqual(h[0].hoursChanged, []); // Gama už je v doplněných
  h = appendChanges(h, day('2026-10-26', '2026-10-25', { added: [b('n4', 'Delta')] }));
  assert.deepEqual(h.map((e) => e.week), ['2026-10-26', '2026-10-19']);
});
