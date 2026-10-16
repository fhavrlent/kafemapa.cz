// Texty interaktivních částí webu (mapa, formuláře, živé stavy) v češtině a angličtině.
// Jazyk stránky určuje <html lang>; build skripty volají `dict(lang)` přímo.

export const LANG = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'cs';

export const pluralIn = (lang, n, forms) =>
  lang === 'en' ? (n === 1 ? forms[0] : forms[forms.length - 1]) : n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2];
export const numIn = (lang, n) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'cs-CZ');
export const decIn = (lang, n) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const STR = {
  cs: {
    // stav a seznam
    hoursInDetail: 'Otevírací doba v detailu',
    hoursUnknown: 'Otevírací doba neuvedena',
    places: ['místo', 'místa', 'míst'],
    results: ['výsledek', 'výsledky', 'výsledků'],
    inCzechia: 'v celém Česku',
    inView: 'v této části mapy',
    nothingHere: 'Tady nic není',
    tryFilters: 'Zkuste upravit hledání nebo vypnout některý filtr.',
    tryMove: 'Oddalte nebo posuňte mapu.',
    more: (n) => `a dalších ${n} — přibližte mapu nebo zpřesněte hledání`,
    goToCity: 'Přejít na mapu města',
    withCoffee: 's kávou',
    inhabitants: 'obyvatel',
    tagline: (n) => `${n} kaváren, pražíren a obchodů s kávou v Česku.`,
    lastUpdate: (d) => `Poslední aktualizace: ${d}.`,
    loadError: 'Data se nepodařilo načíst. Zkuste stránku obnovit.',
    // druhy a vybavení
    roaster: 'Pražírna', homeCoffee: 'Káva na doma', coffeeShop: 'Obchod s kávou', cafeRoaster: 'Kavárna a pražírna', cafe: 'Kavárna',
    outdoor: 'Zahrádka', wifi: 'Wi‑Fi', vegan: 'Vegan', wheelchair: 'Bezbariérový vstup', wheelchairLimited: 'Částečně bezbariérové',
    veganOptions: 'Veganské možnosti', vegetarianOptions: 'Vegetariánské možnosti', card: 'Platba kartou',
    chain: (b) => `Síť ${b}`, level: (l) => `Podlaží ${l}`,
    // detail
    days: ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'],
    closed: 'zavřeno', nonstop: 'nonstop',
    noHolidays: 'Svátky a výjimky nezohledňujeme.',
    hoursMissing: 'Otevírací doba zatím není v OpenStreetMap.',
    navigate: 'Navigovat', web: 'Web', call: 'Zavolat', share: 'Sdílet', copied: 'Odkaz zkopírován ✓', copyManually: 'Zkopírujte odkaz:', back: 'Zpět na seznam',
    description: 'Popis', hours: 'Otevírací doba', amenities: 'Vybavení',
    fixHours: 'Nesedí otevírací doba? Opravte ji', addHours: 'Znáte otevírací dobu? Pomozte ji doplnit',
    report: 'Zavřeno nebo je tu chyba? Nahlaste to',
    cafePage: 'Stránka kavárny', editOsm: 'Upravit v OSM', mapySearch: 'Najít na Mapy.com (fotky, recenze)',
    shareText: (n) => `${n} na Kafemapě`,
    pendingAmenities: (u) => `Vaše úprava vybavení je uložená v <a href="${u}" target="_blank" rel="noopener">OpenStreetMap</a> a na Kafemapě se objeví do druhého dne.`,
    noFeats: 'Zatím o vybavení nic nevíme.', fixFeats: 'Nesedí vybavení? Opravte ho', addFeats: 'Víte, jestli tu mají Wi‑Fi nebo zahrádku? Doplňte to',
    pendingHours: (w, u) => `Vaše úprava otevírací doby (${w}) je uložená v <a href="${u}" target="_blank" rel="noopener">OpenStreetMap</a> a na Kafemapě se objeví do druhého dne.`,
    title: 'Kafemapa — všechny kavárny v Česku na jedné mapě',
    // žebříček
    rankNotePer: 'Města nad 10 000 obyvatel. Počet kaváren na 10 000 obyvatel. Kavárny se přiřazují k nejbližšímu městu, takže čísla jsou orientační.',
    rankNoteTotal: 'Kavárny, pražírny a obchody s kávou v okolí centra města.',
    // mobilní list a poloha
    collapse: 'Sbalit seznam', expand: 'Rozbalit seznam',
    noGeo: 'Váš prohlížeč neumí zjistit polohu.', geoDenied: 'Přístup k poloze byl zamítnut.', geoFailed: 'Polohu se nepodařilo zjistit.',
    tilesBy: 'Podkladová mapa © <a href="https://mapy.com/" target="_blank" rel="noopener">Seznam.cz a.s. (Mapy.com)</a> a další.',
    cafesAttr: 'Kavárny © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">přispěvatelé OpenStreetMap</a>',
    mapyAttr: '© Seznam.cz a.s. a další',
    // stránky měst (pages.js)
    shownOf: (s, n) => `Zobrazeno ${s} z ${n}`,
  },
  en: {
    hoursInDetail: 'Opening hours in detail',
    hoursUnknown: 'Opening hours unknown',
    places: ['place', 'places'],
    results: ['result', 'results'],
    inCzechia: 'across Czechia',
    inView: 'in this part of the map',
    nothingHere: 'Nothing here',
    tryFilters: 'Try a different search or turn off a filter.',
    tryMove: 'Zoom out or move the map.',
    more: (n) => `and ${n} more — zoom in or refine your search`,
    goToCity: 'Show the map of',
    withCoffee: 'with coffee',
    inhabitants: 'inhabitants',
    tagline: (n) => `${n} cafés, roasters and coffee shops in Czechia.`,
    lastUpdate: (d) => `Last updated: ${d}.`,
    loadError: 'Could not load the data. Please reload the page.',
    roaster: 'Roaster', homeCoffee: 'Coffee beans', coffeeShop: 'Coffee shop', cafeRoaster: 'Café & roaster', cafe: 'Café',
    outdoor: 'Outdoor seating', wifi: 'Wi‑Fi', vegan: 'Vegan', wheelchair: 'Wheelchair accessible', wheelchairLimited: 'Partly wheelchair accessible',
    veganOptions: 'Vegan options', vegetarianOptions: 'Vegetarian options', card: 'Cards accepted',
    chain: (b) => `Chain: ${b}`, level: (l) => `Floor ${l}`,
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    closed: 'closed', nonstop: 'open 24/7',
    noHolidays: 'Public holidays and exceptions are not included.',
    hoursMissing: 'Opening hours are not in OpenStreetMap yet.',
    navigate: 'Directions', web: 'Website', call: 'Call', share: 'Share', copied: 'Link copied ✓', copyManually: 'Copy the link:', back: 'Back to list',
    description: 'Description', hours: 'Opening hours', amenities: 'Amenities',
    fixHours: 'Hours wrong? Fix them', addHours: 'Know the opening hours? Add them',
    report: 'Closed or something wrong? Report it',
    cafePage: 'Café page', editOsm: 'Edit in OSM', mapySearch: 'Find on Mapy.com (photos, reviews)',
    shareText: (n) => `${n} on Kafemapa`,
    pendingAmenities: (u) => `Your amenities edit is saved on <a href="${u}" target="_blank" rel="noopener">OpenStreetMap</a> and will show up on Kafemapa by the next day.`,
    noFeats: 'We don\'t know anything about the amenities yet.', fixFeats: 'Amenities wrong? Fix them', addFeats: 'Know if they have Wi‑Fi or outdoor seating? Add it',
    pendingHours: (w, u) => `Your opening hours edit (${w}) is saved on <a href="${u}" target="_blank" rel="noopener">OpenStreetMap</a> and will show up on Kafemapa by the next day.`,
    title: 'Kafemapa — every café in Czechia on one map',
    rankNotePer: 'Towns over 10,000 people. Places with coffee per 10,000 inhabitants. Cafés are assigned to the nearest town, so the numbers are approximate.',
    rankNoteTotal: 'Cafés, roasters and coffee shops around the town centre.',
    collapse: 'Collapse list', expand: 'Expand list',
    noGeo: 'Your browser cannot determine your location.', geoDenied: 'Location access was denied.', geoFailed: 'Could not determine your location.',
    tilesBy: 'Base map © <a href="https://mapy.com/" target="_blank" rel="noopener">Seznam.cz a.s. (Mapy.com)</a> and others.',
    cafesAttr: 'Cafés © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    mapyAttr: '© Seznam.cz a.s. and others',
    shownOf: (s, n) => `Showing ${s} of ${n}`,
  },
};

export const dict = (lang) => STR[lang] || STR.cs;
export const t = dict(LANG);
