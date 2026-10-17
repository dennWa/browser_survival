import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { ausSchluessel } from '../kern/karte.js';
import { bestaetigen, esc } from './dialoge.js';

/**
 * Räume (Phase 6): Panel-Reiter „Räume“ – alle Räume der Zone mit Loot-Tabelle, Loot-Punkten und markierten Flächen.
 * Ein Raum = Buchstabe a–z in `raeume` (Name, Loot-Tabelle, optional Chance/Nachschub). Markieren: Kategorie „Räume“
 * (Rechteck oder Füllen bis zu Wänden). Innen/Außen zeigt „Zone → Anzeige → Innen/Außen“ (Berechnung wie im Spiel).
 */
export function raeumeUi({ zustand, panel, aktionen }) {
  panel.reiter.set('Räume', () => {
    const k = zustand.karte;
    const el = panel.el;
    el.innerHTML = '<h3>Räume</h3><p class="leise">Markieren: Kategorie „Räume“ (Rechteck oder 🪣 Füllen). Loot-Punkte: Kategorie „Loot“. Innen/Außen: Reiter Zone → Anzeige.</p>';
    if (!k.s('raeume').size) el.insertAdjacentHTML('beforeend', '<p>Noch keine Räume.</p>');
    for (const [b, r] of k.s('raeume')) {
      const punkte = [...k.s('marker')].filter(([, m]) => m.raum === b);
      const flaechen = [...k.s('raumFlaechen')].filter(([, f]) => f.raum === b);
      const kacheln = flaechen.reduce((s, [, f]) => s + f.b * f.h, 0);
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid var(--rand)';
      div.innerHTML = `<p><b>${esc(b)}: ${esc(r.name)}</b> · ${esc(r.lootTabelle)}${LOOT_TABELLEN[r.lootTabelle] ? '' : ' ⛔'} · ${punkte.length} Loot-Punkte · ${kacheln} Kacheln markiert</p>`;
      const reihe = document.createElement('div');
      reihe.className = 'knopfreihe';
      const knopf = (text, f, art) => {
        const x = Object.assign(document.createElement('button'), { textContent: text });
        if (art) x.className = art;
        x.addEventListener('click', f);
        reihe.append(x);
      };
      knopf('🔍 Zeigen', () => {
        const ziel = punkte[0] ? ausSchluessel(punkte[0][0]) : flaechen[0] ? [flaechen[0][1].x, flaechen[0][1].y] : null;
        if (ziel) aktionen.springeZu(...ziel);
        zustand.waehle([...punkte.map(([key]) => ({ s: 'marker', k: key })), ...flaechen.map(([id]) => ({ s: 'raumFlaechen', k: id }))]);
      });
      knopf('✎ Bearbeiten', () => {
        if (punkte[0]) zustand.waehle([{ s: 'marker', k: punkte[0][0] }]);
        else if (flaechen[0]) zustand.waehle([{ s: 'raumFlaechen', k: flaechen[0][0] }]);
        else return zustand.meldung('Raum hat weder Loot-Punkte noch Flächen – erst markieren', 'fehler');
        panel.zeige('Eigenschaften');
      });
      knopf('🎁 Loot-Punkt setzen', () => {
        zustand.lootRaum = b;
        aktionen.waehleKatalog?.('marker:loot', { raum: b });
      });
      knopf('🗑', async () => {
        if (!(await bestaetigen('Raum löschen', `Raum ${esc(b)} „${esc(r.name)}“ mit ${punkte.length} Loot-Punkten und ${flaechen.length} Flächen löschen?`, { ok: 'Löschen', gefahr: true }))) return;
        zustand.ausfuehren(`Raum ${b} löschen`, [{ s: 'raeume', k: b, neu: null }, ...punkte.map(([key]) => ({ s: 'marker', k: key, neu: null })), ...flaechen.map(([id]) => ({ s: 'raumFlaechen', k: id, neu: null }))]);
      }, 'gefahr');
      div.append(reihe);
      el.append(div);
    }
    const neu = Object.assign(document.createElement('button'), { textContent: '➕ Neuer Raum' });
    neu.addEventListener('click', () => aktionen.aktion('neuerRaum'));
    el.append(neu);
  });
}
