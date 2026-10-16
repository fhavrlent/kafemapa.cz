// Podkladová mapa pro hlavní mapu i minimapu na stránkách kaváren (Leaflet je globální `L`).
// Klíč je v assets/config.js, který se do gitu necommituje: lokálně ho vytvořte podle
// config.example.js, při nasazení ho zapíše build z proměnné MAPY_API_KEY.
// Klíč je v prohlížeči vždy veřejně vidět, chrání ho omezení na domény v konzoli Mapy.com.
// Bez klíče se použijí standardní dlaždice OSM.
import { LANG, t } from './i18n.js';

const { MAPY_API_KEY = '' } = /** @type {{ MAPY_API_KEY?: string }} */ (await import('./config.js').catch(() => ({})));

export function addBasemap(map) {
  if (MAPY_API_KEY) {
    // Ostré @2x dlaždice (~150 kB) jen při přiblížení na ulice; v přehledu republiky a krajů
    // stačí běžné (~50 kB). Úvodní načtení mapy tak přenese zhruba čtvrtinu dat.
    // lang=en přeloží popisky zemí a moří (Mapy.com to umí jen pro přehledové úrovně z ≤ 6).
    const tiles = L.tileLayer('', {
      minZoom: 0,
      maxZoom: 19,
      attribution: `<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">${t.mapyAttr}</a> · ${t.cafesAttr}`,
    });
    tiles.getTileUrl = (coords) => {
      const size = devicePixelRatio > 1 && coords.z >= 12 ? '256@2x' : '256';
      return `https://api.mapy.com/v1/maptiles/basic/${size}/${coords.z}/${coords.x}/${coords.y}?apikey=${MAPY_API_KEY}${LANG === 'en' ? '&lang=en' : ''}`;
    };
    tiles.addTo(map);

    // Logo Mapy.com musí být podle podmínek API viditelné nad mapou.
    const MapyLogo = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const a = L.DomUtil.create('a', 'mapy-logo');
        a.href = 'https://mapy.com/';
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML = '<img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" width="100" height="27">';
        L.DomEvent.disableClickPropagation(a);
        return a;
      },
    });
    new MapyLogo().addTo(map);
    map.getContainer().classList.add('tiles-mapy');
  } else {
    // Standardní dlaždice OSM jsou zdarma jen pro rozumný provoz
    // (https://operations.osmfoundation.org/policies/tiles/).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: t.cafesAttr }).addTo(map);
    map.getContainer().classList.add('tiles-osm');
  }
}
