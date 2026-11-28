import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordOldPaths, redirectLines } from './redirects.mjs';

const ds = (cafes) => ({ cities: [{ n: 'Olomouc' }], cafes });
const cafe = (i, n, extra = {}) => ({ i, n, y: 49.59, x: 17.25, c: 0, a: 'Horní náměstí 1', ...extra });

test('přejmenování: stará adresa vede na novou (cs i en)', () => {
  const old = recordOldPaths({}, ds([cafe('n1', 'Enjoy bar kavárna')]), ds([cafe('n1', 'ENJOY Olomouc')]));
  assert.deepEqual(old, {
    '/kavarna/enjoy-bar-kavarna-olomouc-n1/': 'n1',
    '/en/cafe/enjoy-bar-kavarna-olomouc-n1/': 'n1',
  });
  assert.deepEqual(redirectLines(old, ds([cafe('n1', 'ENJOY Olomouc')])), [
    '/en/cafe/enjoy-bar-kavarna-olomouc-n1/ /en/cafe/enjoy-olomouc-olomouc-n1/ 301',
    '/kavarna/enjoy-bar-kavarna-olomouc-n1/ /kavarna/enjoy-olomouc-olomouc-n1/ 301',
  ]);
});

test('dvojí přejmenování vede rovnou na poslední adresu, návrat ke starému jménu přesměrování ruší', () => {
  let old = recordOldPaths({}, ds([cafe('n1', 'A')]), ds([cafe('n1', 'B')]));
  old = recordOldPaths(old, ds([cafe('n1', 'B')]), ds([cafe('n1', 'C')]));
  assert.deepEqual(redirectLines(old, ds([cafe('n1', 'C')])).filter((l) => l.startsWith('/kavarna/')), [
    '/kavarna/a-olomouc-n1/ /kavarna/c-olomouc-n1/ 301',
    '/kavarna/b-olomouc-n1/ /kavarna/c-olomouc-n1/ 301',
  ]);
  old = recordOldPaths(old, ds([cafe('n1', 'C')]), ds([cafe('n1', 'A')]));
  assert.equal(old['/kavarna/a-olomouc-n1/'], undefined);
});

test('bez stránky na mapu (302), zmizelé místo bez přesměrování', () => {
  const old = recordOldPaths({}, ds([cafe('n1', 'A'), cafe('n2', 'B')]), ds([cafe('n1', 'A', { a: undefined })]));
  assert.deepEqual(redirectLines(old, ds([cafe('n1', 'A', { a: undefined })])), [
    '/en/cafe/a-olomouc-n1/ /en/#n1 302',
    '/kavarna/a-olomouc-n1/ /#n1 302',
  ]);
});
