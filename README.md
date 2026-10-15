# Kafemapa — kafemapa.cz

Všechny kavárny, pražírny a obchody s kávou v Česku na jedné mapě. Zobrazuje, co má právě otevřeno, umí filtrovat zahrádky, Wi‑Fi, bezbariérový vstup nebo nezávislé podniky a ukazuje žebříček měst podle počtu kaváren na obyvatele.

Data pocházejí z [OpenStreetMap](https://www.openstreetmap.org/) (ODbL). Kdo najde chybu, opraví ji přímo v OSM (každý detail má odkaz *Upravit v OSM*) a oprava se na webu objeví po další aktualizaci dat.

## Jak to funguje

Statický web: žádný backend ani npm závislosti, „build“ jen zkopíruje soubory do `_site/` a doplní klíč.

```
index.html               stránka
assets/app.js            mapa, seznam, filtry, detail, žebříček
assets/hours.js          parser OSM opening_hours (otevřeno teď / zavírá v…)
assets/style.css         vzhled (světlý i tmavý režim, mobilní spodní list)
assets/vendor/           Leaflet 1.9.4 + Leaflet.markercluster 1.5.3
data/cafes.json          kompaktní data (~600 kB, gzip ~200 kB)
scripts/fetch-data.mjs   stažení dat z Overpass API → data/cafes.json
scripts/hours.test.mjs   testy parseru otevírací doby
.github/workflows/       nasazení na GitHub Pages + týdenní aktualizace dat
```

## Lokální vývoj

Potřebujete Node 20+.

```bash
npm run dev     # http://localhost:8080
npm run build   # sestaví _site/ pro nasazení
npm test        # testy parseru otevírací doby
npm run data    # stáhne čerstvá data z OSM (1–3 minuty, Overpass občas zlobí, skript zkouší víc serverů)
```

## Nasazení

Web běží na **Cloudflare Workers** (statické soubory, bez kódu Workeru), zdrojem je tento repozitář.

- Každý push do `main` spustí Cloudflare Workers Builds: `npm test && npm run build` (sestaví `_site/`) a `npx wrangler deploy`. Nastavení je ve [`wrangler.jsonc`](wrangler.jsonc), bezpečnostní a cache hlavičky v [`_headers`](_headers).
- Každé pondělí ráno workflow [`refresh-data.yml`](.github/workflows/refresh-data.yml) stáhne čerstvá data z OSM a commitne je, čímž spustí nové nasazení. Ručně jde spustit v záložce Actions.
- Domény `kafemapa.cz` a `www.kafemapa.cz` jsou na Worker napojené jako custom domains, DNS záznamy spravuje Cloudflare sám.

### Klíč Mapy.com

Klíč nepatří do repozitáře, proto je `assets/config.js` v `.gitignore`. Při nasazení ho build zapíše z proměnné `MAPY_API_KEY`, která je v Cloudflare uložená jako tajná (Workers → kafemapa-cz → Settings → Build → Variables and secrets). Pro lokální vývoj zkopírujte `assets/config.example.js` jako `assets/config.js` a doplňte klíč. Bez klíče se použije podkladová mapa OSM.

Klíč pro dlaždice je v prohlížeči vždy veřejně vidět, protože se posílá s každým požadavkem na dlaždici. Skutečnou ochranou je omezení klíče v konzoli Mapy.com na domény `kafemapa.cz`, `www.kafemapa.cz` a `localhost`.

## Poznámky a limity

- **Podkladová mapa** je z [Mapy.com](https://developer.mapy.com/) a řídí se jejich [podmínkami](https://developer.mapy.com/terms-and-conditions/):
  - nad mapou musí být logo Mapy.com a copyright (web přidává sám),
  - dlaždice se **nesmí ukládat ani cachovat** (žádná proxy ani cache na Cloudflare) a **nesmí se upravovat**, proto na ně neaplikujeme CSS filtry a v tmavém režimu zůstává mapa světlá,
  - klíč musí být zabezpečený proti zneužití: v konzoli je omezený na referery `kafemapa.cz` a `www.kafemapa.cz` a jen na službu `v1/maptiles`,
  - jsme na výchozím tarifu Basic. Rozšířený tarif (Extended) mimo jiné zakazuje kombinovat mapová data Mapy.com s jinými mapovými daty, a naše kavárny jsou z OpenStreetMap, takže o něj bez dohody se Seznamem nežádat.
- **„Otevřeno teď“** se počítá z `opening_hours` v čase prohlížeče. Parser zvládá přes 99 % zápisů v ČR včetně sezónních (`May-Sep: …`), svátky (`PH`) ignoruje. Nečitelné zápisy se zobrazí jako text.
- **Města**: v OSM má `addr:city` jen menšina podniků, proto se každý přiřazuje k nejbližšímu městu (dosah roste s velikostí města). Žebříček je tedy orientační.
- Podniky bez jména (~270) se vynechávají.

## Nápady na další rozvoj

- Statické stránky pro jednotlivá města (`/praha/`, `/brno/`) kvůli SEO
- Vlastní vektorový styl mapy (MapLibre + OpenFreeMap) místo rastrových dlaždic
- Kurátorské vrstvy, např. výběrové kavárny nebo pražírny s e-shopem
