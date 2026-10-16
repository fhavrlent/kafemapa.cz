# Kafemapa — kafemapa.cz

Všechny kavárny, pražírny a obchody s kávou v Česku na jedné mapě: co má právě otevřeno, zahrádky, Wi‑Fi, bezbariérový vstup, nezávislé podniky a žebříček měst podle počtu kaváren na obyvatele. Česky i anglicky na [kafemapa.cz](https://kafemapa.cz/).

## Data

- Kavárny jsou z [OpenStreetMap](https://www.openstreetmap.org/) (© přispěvatelé OpenStreetMap, [ODbL](https://www.openstreetmap.org/copyright)): `amenity=cafe`, `shop=coffee` a `craft=coffee_roaster` v Česku, stahují se každý den přes Overpass API.
- Počty obyvatel měst jsou z [Českého statistického úřadu](https://data.csu.gov.cz/datastat/info/SADA/OBY02A) (stav k 1. 1.).
- Podkladová mapa je z [Mapy.com](https://developer.mapy.com/) (© Seznam.cz).

## Jak opravit data

Chybí kavárna nebo je údaj špatně? Oprava patří do OpenStreetMap, odkud ji převezmou i ostatní mapy:

- **Otevírací doba a vybavení** (Wi‑Fi, zahrádka, vegan…) jdou opravit přímo na stránce kavárny, po přihlášení účtem OpenStreetMap.
- **Cokoli jiného** přes odkaz *Upravit v OSM* u každé kavárny.
- **Zavřený podnik** nahlaste formulářem „Zavřeno nebo je tu chyba?“, vznikne poznámka v OSM pro místní mapery.

Na webu se změna objeví do druhého dne. Co přesně Kafemapa do OSM zapisuje, popisuje stránka [Kafemapa na wiki OSM](https://wiki.openstreetmap.org/wiki/Cs:Kafemapa).

## Jak to funguje

Statický web bez backendu. Web ani build nemají žádné npm závislosti; TypeScript slouží jen ke kontrole typů JavaScriptu (typy v JSDoc komentářích, nic se nekompiluje).

- `scripts/fetch-data.mjs` stáhne data z Overpass a zapíše kompaktní `data/cafes.json` (každé místo se přiřadí k nejbližšímu městu, takže žebříčky jsou orientační). GitHub Action to dělá každé ráno a změněná data commitne.
- `scripts/build.mjs` sestaví `_site/`: mapu, statické stránky měst a kaváren (kvůli vyhledávačům), anglickou verzi, přehled změn, Kavárenský index a sitemap. Na konci zkontroluje všechny interní odkazy.
- V prohlížeči běží mapa (Leaflet) a parser `opening_hours`, který počítá „otevřeno teď“ podle času návštěvníka.

```
index.html                  mapa (úvodní stránka)
assets/app.js               mapa, seznam, filtry, detail kavárny
assets/hours.js             parser opening_hours
assets/i18n.js              texty v češtině a angličtině
assets/osm.js               přihlášení do OSM a zápis úprav
assets/hours-editor.js      formulář otevírací doby
assets/amenities-editor.js  formulář vybavení
assets/osm-note.js          hlášení chyb jako poznámky OSM
scripts/fetch-data.mjs      stažení dat z OSM
scripts/fetch-population.mjs  počty obyvatel z ČSÚ (jednou ročně)
scripts/build*.mjs          sestavení webu
scripts/*.test.mjs          testy
docs/osm-wiki/              text stránek na wiki OSM
```

## Lokální vývoj

Potřebujete Node 20+.

```bash
npm run data    # stáhne data z OSM (1–3 minuty)
npm run build   # sestaví _site/
npm run dev     # http://localhost:8080
npm test
npm run typecheck   # kontrola typů (po npm install)
```

- **Podkladová mapa:** pro dlaždice Mapy.com zkopírujte `assets/config.example.js` jako `assets/config.js` a doplňte vlastní klíč z [developer.mapy.com](https://developer.mapy.com/). Bez klíče se použijí dlaždice OSM. Podle podmínek Mapy.com musí být nad mapou jejich logo a dlaždice se nesmí ukládat, cachovat ani upravovat.
- **Úpravy do OSM:** na `localhost` a `127.0.0.1` jde přihlášení, zápis i poznámky na [testovací server OSM](https://master.apis.dev.openstreetmap.org/), ne do skutečné mapy. Skutečné kavárny tam nejsou, testujte na vlastním testovacím uzlu.

## Úpravy do OSM

- Zapisuje se jen to, co je v seznamu `EDITABLE` v `assets/osm.js`, a jen do kaváren, které v OSM už jsou. Každá úprava je samostatná sada změn s `created_by=Kafemapa` a `#kafemapa`, přes verzi objektu (cizí úpravu nepřepíše).
- `OSM_SAVE` v `assets/osm.js` přímé ukládání vypíná; formuláře se pak vrátí k ručnímu postupu přes editor OSM.
- Když se změní, co Kafemapa zapisuje, upravte i stránky na wiki OSM (`docs/osm-wiki/`).

## Kavárenský index

Datová zpráva na `/kavarensky-index/<edice>/`. Čísla edice jsou zmrazená v `data/kavarensky-index/<edice>.json`, takže se aktualizací dat nemění. Nová edice:

1. `node scripts/make-index-snapshot.mjs jaro-2027 "Jaro 2027"` vytvoří snapshot z aktuálních dat.
2. V `scripts/build-report.mjs` přidejte funkci s texty edice a zapište ji do `EDITIONS`. Tvrzení v textu hlídejte přes `assert()`, build pak selže, když by přestala odpovídat číslům.
