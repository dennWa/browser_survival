import { EBENEN, ANZEIGEN } from '../kern/ebenen.js';
import { esc } from './dialoge.js';

/**
 * Reiter „Ebenen“ (rechte Seitenleiste, Schritt 1.4): je Ebene 👁 sichtbar und 🔒 gesperrt (ausgegraut, nicht anklickbar,
 * Änderungen werden ausgelassen), darunter reine Anzeigen (Raster, Innen/Außen, steile Hänge, Nachbarzonen).
 * Gespeichert pro Browser (localStorage), gilt für alle Zonen.
 */
export function ebenenUi({ zustand, leiste }) {
  leiste.registriere(
    'Ebenen',
    () => {
      const el = leiste.el;
      const k = zustand.karte;
      const anzahl = {
        boden: k.zellen.length,
        bemalung: k.s('bemalung').size,
        terrain: k.hoehen.filter((h) => h !== 0).length,
        bereiche: k.s('raumFlaechen').size + k.s('tierBereiche').size,
        objekte: k.s('objekte').size,
        bauwerke: k.s('bauwerke').size,
        marker: k.s('marker').size + k.s('ankuenfte').size,
        uebergaenge: k.s('uebergaenge').size,
      };
      el.innerHTML = `<p class="leise">👁 = sichtbar · 🔒 = gesperrt (ausgegraut, nicht anklickbar, wird nicht verändert)</p>
        <ul class="ebenen-liste">${[...EBENEN].reverse().map((e) => {
          const z = zustand.ebenen[e.id];
          return `<li class="${z.sichtbar ? '' : 'aus'} ${z.gesperrt ? 'gesperrt' : ''}"><button type="button" data-e="${e.id}" data-f="sichtbar" aria-pressed="${z.sichtbar}" title="ein-/ausblenden">${z.sichtbar ? '👁' : '◌'}</button><button type="button" data-e="${e.id}" data-f="gesperrt" aria-pressed="${z.gesperrt}" title="sperren">${z.gesperrt ? '🔒' : '🔓'}</button><span>${esc(e.symbol)} ${esc(e.name)}</span><span class="leise">${anzahl[e.id]}</span></li>`;
        }).join('')}</ul>
        <h4>Anzeigen</h4>
        ${ANZEIGEN.map((a) => `<label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" data-anzeige="${a.id}" ${zustand.ebenen[a.id].sichtbar ? 'checked' : ''}><span>${esc(a.name)}</span></label>`).join('')}
        <div class="knopfreihe"><button type="button" data-alle="zeigen">Alle zeigen & entsperren</button></div>`;
      el.querySelectorAll('button[data-e]').forEach((b) => b.addEventListener('click', () => zustand.setzeEbene(b.dataset.e, b.dataset.f, !zustand.ebenen[b.dataset.e][b.dataset.f])));
      el.querySelectorAll('[data-anzeige]').forEach((c) => c.addEventListener('change', () => zustand.setzeEbene(c.dataset.anzeige, 'sichtbar', c.checked)));
      el.querySelector('[data-alle]').addEventListener('click', () => {
        for (const e of EBENEN) {
          zustand.setzeEbene(e.id, 'sichtbar', true);
          zustand.setzeEbene(e.id, 'gesperrt', false);
        }
      });
    },
    { ereignisse: ['zone', 'ebenen', 'karte'] },
  );
}
