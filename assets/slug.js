// Sdílené URL pro mapu (prohlížeč) i build (Node): stejný vstup musí dát stejnou adresu.

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const CHAIN = 16; // bitový příznak z data/cafes.json

// Vlastní stránku má nezávislý podnik s aspoň adresou, otevírací dobou nebo webem;
// samotné jméno by byla příliš tenká stránka a řetězce by byly duplicitní.
export const hasCafePage = (c) => !(c.f & CHAIN) && !!(c.a || c.o || c.w);

// OSM id na konci drží adresu stabilní i při shodě jmen nebo přejmenování města.
export function cafePath(c, cityName) {
  if (!hasCafePage(c)) return null;
  return `/kavarna/${[slugify(c.n), slugify(cityName), c.i].filter(Boolean).join('-')}/`;
}
