# Kafemapa — kafemapa.cz

Všechny kavárny, pražírny a obchody s kávou v Česku na jedné mapě. Zobrazuje, co má právě otevřeno, umí filtrovat zahrádky, Wi‑Fi, bezbariérový vstup nebo nezávislé podniky a ukazuje žebříček měst podle počtu kaváren na obyvatele.

Data pocházejí z [OpenStreetMap](https://www.openstreetmap.org/) (ODbL). Kdo najde chybu, opraví ji přímo v OSM (každý detail má odkaz *Upravit v OSM*) a oprava se na webu objeví po další aktualizaci dat.

## Jak to funguje

Statický web: žádný backend, build ani npm závislosti.

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
npm test        # testy parseru otevírací doby
npm run data    # stáhne čerstvá data z OSM (1–3 minuty, Overpass občas zlobí, skript zkouší víc serverů)
```

## Nasazení

Web běží na **GitHub Pages**, DNS je na **Cloudflare**.

- Každý push do `main` spustí workflow [`deploy.yml`](.github/workflows/deploy.yml): otestuje parser, zapíše `assets/config.js` s klíčem ze secretu `MAPY_API_KEY` a nasadí web.
- Každé pondělí ráno týž workflow stáhne čerstvá data z OSM, commitne je a nasadí. Ručně jde spustit v záložce Actions (*Run workflow* → *Stáhnout čerstvá data*).
- DNS: `kafemapa.cz` má A/AAAA záznamy na GitHub Pages, `www` je CNAME na `fhavrlent.github.io`. Záznamy nejsou proxované přes Cloudflare, aby GitHub mohl vystavit HTTPS certifikát.

### Klíč Mapy.com

Klíč nepatří do repozitáře, proto je `assets/config.js` v `.gitignore`. Pro lokální vývoj zkopírujte `assets/config.example.js` jako `assets/config.js` a doplňte klíč. Bez klíče se použije podkladová mapa OSM.

Klíč pro dlaždice je v prohlížeči vždy veřejně vidět, protože se posílá s každým požadavkem na dlaždici. Skutečnou ochranou je omezení klíče v konzoli Mapy.com na domény `kafemapa.cz`, `www.kafemapa.cz` a `localhost`.

## Poznámky a limity

- **Podkladová mapa** je z [Mapy.com](https://developer.mapy.com/). Podle podmínek API musí být nad mapou jejich logo, to web přidává sám.
- **„Otevřeno teď“** se počítá z `opening_hours` v čase prohlížeče. Parser zvládá přes 99 % zápisů v ČR včetně sezónních (`May-Sep: …`), svátky (`PH`) ignoruje. Nečitelné zápisy se zobrazí jako text.
- **Města**: v OSM má `addr:city` jen menšina podniků, proto se každý přiřazuje k nejbližšímu městu (dosah roste s velikostí města). Žebříček je tedy orientační.
- Podniky bez jména (~270) se vynechávají.

## Nápady na další rozvoj

- Statické stránky pro jednotlivá města (`/praha/`, `/brno/`) kvůli SEO
- Vlastní vektorový styl mapy (MapLibre + OpenFreeMap) místo rastrových dlaždic
- Kurátorské vrstvy, např. výběrové kavárny nebo pražírny s e-shopem
