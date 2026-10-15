// Sdílené URL pro mapu (prohlížeč) i build (Node): stejný vstup musí dát stejnou adresu.

export const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const CHAIN = 16; // bitový příznak z data/cafes.json

// Anglická jména měst tam, kde je turisté skutečně hledají (URL i texty /en/).
export const EN_CITY = { Praha: 'Prague', Plzeň: 'Pilsen' };
export const cityNameIn = (name, lang) => (lang === 'en' && name ? EN_CITY[name] || name : name);

// Vlastní stránku má nezávislý podnik s aspoň adresou, otevírací dobou nebo webem;
// samotné jméno by byla příliš tenká stránka a řetězce by byly duplicitní.
export const hasCafePage = (c) => !(c.f & CHAIN) && !!(c.a || c.o || c.w);

// OSM id na konci drží adresu stabilní i při shodě jmen nebo přejmenování města.
export function cafePath(c, cityName, lang = 'cs') {
  if (!hasCafePage(c)) return null;
  const slug = [slugify(c.n), slugify(cityNameIn(cityName, lang)), c.i].filter(Boolean).join('-');
  return lang === 'en' ? `/en/cafe/${slug}/` : `/kavarna/${slug}/`;
}

// Odkaz na podnik na Mapy.com (fotky, recenze): vyhledá jméno + adresu kolem polohy.
// Mapy.com při jasné shodě otevře přímo detail podniku; ID podniků si ukládat nesmíme
// (podmínky API), proto jde o vyhledávání. Adresa rozliší pobočky (Kafec Orlí × Úvoz).
export function mapySearchUrl(c, cityName) {
  const where = c.a || cityName;
  const q = where ? `${c.n}, ${where}` : c.n;
  return `https://mapy.com/fnc/v1/search?query=${encodeURIComponent(q)}&center=${c.x},${c.y}&zoom=18`;
}
