import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { LOOT_ORTE, MAX_PUNKTE, erwarteteAusbeute, standardMenge } from '../../server/spiel/karten/lootZonen.js';
import { lootVorschau } from '../kern/lootZonenEditor.js';
import { esc } from './dialoge.js';

/**
 * Loot-Zonen im Inspektor (Editor 2.0, Schritt 6.2): `aktionen.lootZonenFelder(el, schl, wert, setze, { felder, knoepfe })`
 * (aufgerufen von ui/inspektor.js). Zone: Name, Modus (exakte Chance in % oder Gewicht), Punkte, innen/außen, Spawn-Chance
 * (nur Gewicht), Nachschub, Höchstzahl, Rechteck. Item-Liste: Item, Chance %/Gewicht, Menge von–bis, ✕; „＋ Item“,
 * „Tabelle übernehmen“ (vorhandene LOOT_TABELLEN). Darunter die erwartete Ausbeute je Befüllung (gleiche Regeln wie das Spiel).
 * Jede Änderung = 1 Undo-Schritt, immer vom aktuellen Stand der Karte aus (der Inspektor zeichnet verzögert neu).
 */
const ITEMS = Object.entries(GEGENSTAENDE)
  .map(([id, g]) => [id, g.name ?? id])
  .sort((a, b) => a[1].localeCompare(b[1], 'de'));
const STANDARD = STANDARD_KONFIGURATION.loot;
const prozent = (p) => `${(Math.round(p * 1000) / 10).toString().replace('.', ',')} %`;

export function lootUi({ zustand, aktionen }) {
  aktionen.lootZonenFelder = (el, schl, wert, setze, { felder }) => {
    const k = zustand.karte;
    const aktuell = () => k.s('lootZonen').get(schl) ?? wert;
    const z = wert;
    const chance = z.modus === 'chance';
    felder(el, [
      { name: 'name', label: 'Name', typ: 'text', wert: z.name ?? '' },
      { name: 'modus', label: 'Wahrscheinlichkeit', typ: 'auswahl', wert: z.modus ?? 'gewicht', optionen: [['gewicht', 'Gewicht (relativ, + Spawn-Chance)'], ['chance', 'Exakte Chance je Item (%)']] },
      { name: 'punkte', label: 'Loot-Punkte', typ: 'zahl', wert: z.punkte, min: 1, max: MAX_PUNKTE, schritt: 1, hilfe: 'werden fest auf freie Kacheln verteilt (Vorschau: Punkte auf der Karte)' },
      { name: 'ort', label: 'Wo', typ: 'auswahl', wert: z.ort ?? 'alle', optionen: Object.entries(LOOT_ORTE) },
      ...(chance ? [] : [{ name: 'spawnChance', label: 'Spawn-Chance (%)', typ: 'zahl', wert: z.spawnChance !== undefined ? Math.round(z.spawnChance * 100) : '', min: 0, max: 100, schritt: 5, hilfe: `leer = Standard ${Math.round(STANDARD.spawnChance * 100)} % je Punkt` }]),
      { name: 'respawnZeit', label: 'Nachschub (s)', typ: 'zahl', wert: z.respawnZeit ?? '', min: 1, schritt: 10, hilfe: `leer = Standard ${STANDARD.respawnZeit} s nach dem Aufheben` },
      { name: 'max', label: 'Höchstens gleichzeitig', typ: 'zahl', wert: z.max ?? '', min: 1, schritt: 1, hilfe: 'leer = so viele wie Punkte' },
      { name: 'x', label: 'x', typ: 'zahl', wert: z.x, schritt: 1 },
      { name: 'y', label: 'y', typ: 'zahl', wert: z.y, schritt: 1 },
      { name: 'b', label: 'Breite', typ: 'zahl', wert: z.b, min: 1, schritt: 1 },
      { name: 'h', label: 'Höhe', typ: 'zahl', wert: z.h, min: 1, schritt: 1 },
    ], (name, w) => {
      const neu = { ...aktuell() };
      if (name === 'name' || name === 'ort') neu[name] = w;
      else if (name === 'modus') {
        neu.modus = w;
        // Werte übernehmen: Gewicht → gleichmäßige Chancen (Summe 100 %), Chance → Gewicht = Prozentwert
        const summe = neu.eintraege.reduce((s, e) => s + (e.gewicht ?? 0), 0) || 1;
        neu.eintraege = neu.eintraege.map(({ gewicht, chance: c, ...rest }) => (w === 'chance' ? { ...rest, chance: Math.round(((gewicht ?? 0) / summe) * 1000) / 10 } : { ...rest, gewicht: Math.max(0.1, c ?? 1) }));
      } else if (name === 'spawnChance') {
        if (w === null) delete neu.spawnChance;
        else neu.spawnChance = Math.max(0, Math.min(1, w / 100));
      } else if (name === 'respawnZeit' || name === 'max') {
        if (w === null) delete neu[name];
        else neu[name] = Math.max(1, Math.round(w));
      } else neu[name] = Math.round(Number(w));
      if (neu.x < 0 || neu.y < 0 || neu.b < 1 || neu.h < 1 || neu.x + neu.b > k.breite || neu.y + neu.h > k.hoehe) return zustand.meldung('Loot-Zone muss ganz in der Zone liegen', 'fehler');
      setze(name, neu);
    });

    // Item-Liste
    const box = document.createElement('div');
    box.className = 'loot-items';
    const summe = z.eintraege.reduce((s, e) => s + (chance ? (e.chance ?? 0) : (e.gewicht ?? 0)), 0);
    box.innerHTML = `<h4>Items <span class="leise">${chance ? `Summe ${Math.round(summe * 10) / 10} %${summe > 100 ? ' ⚠ über 100 %' : ` · Rest ${Math.round((100 - summe) * 10) / 10} % = nichts`}` : 'Gewicht = relative Häufigkeit'}</span></h4>
      <table><thead><tr><th>Item</th><th>${chance ? 'Chance %' : 'Gewicht'}</th><th>Menge</th><th></th></tr></thead><tbody>${z.eintraege
        .map((e, i) => {
          const [a, b] = e.menge ?? standardMenge(e.id);
          return `<tr data-i="${i}"><td><select data-f="id">${ITEMS.map(([id, n]) => `<option value="${esc(id)}"${id === e.id ? ' selected' : ''}>${esc(n)}</option>`).join('')}${GEGENSTAENDE[e.id] ? '' : `<option selected>${esc(e.id)} (unbekannt!)</option>`}</select></td>
            <td><input type="number" data-f="wert" value="${chance ? (e.chance ?? 0) : (e.gewicht ?? 1)}" min="0" step="${chance ? 0.5 : 0.1}"></td>
            <td class="menge"><input type="number" data-f="min" value="${a}" min="1" step="1">–<input type="number" data-f="max" value="${b}" min="1" step="1"></td>
            <td><button type="button" data-f="weg" class="gefahr" title="entfernen">✕</button></td></tr>`;
        })
        .join('')}</tbody></table>
      <div class="knopfreihe"><button type="button" data-a="neu">＋ Item</button><select data-a="tabelle" title="Startliste aus einer Loot-Tabelle des Spiels"><option value="">Tabelle übernehmen …</option>${Object.keys(LOOT_TABELLEN).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>`;
    const aendereItems = (f, text) => {
      const neu = { ...aktuell(), eintraege: aktuell().eintraege.map((e) => ({ ...e })) };
      f(neu.eintraege);
      setze(text, neu);
    };
    box.querySelectorAll('tr[data-i]').forEach((tr) => {
      const i = Number(tr.dataset.i);
      tr.querySelector('[data-f="weg"]').addEventListener('click', () => aendereItems((l) => l.splice(i, 1), 'Item entfernt'));
      tr.querySelectorAll('select, input').forEach((f) =>
        f.addEventListener('change', () =>
          aendereItems((l) => {
            const e = l[i];
            if (f.dataset.f === 'id') {
              e.id = f.value;
              delete e.menge; // neue Standard-Menge des Items
            } else if (f.dataset.f === 'wert') e[chance ? 'chance' : 'gewicht'] = Math.max(0, Number(f.value) || 0);
            else {
              const [a, b] = e.menge ?? standardMenge(e.id);
              const v = Math.max(1, Math.round(Number(f.value) || 1));
              e.menge = f.dataset.f === 'min' ? [v, Math.max(v, b)] : [Math.min(a, v), v];
            }
          }, 'Item geändert'),
        ),
      );
    });
    box.querySelector('[data-a="neu"]').addEventListener('click', () => aendereItems((l) => l.push(chance ? { id: 'verband', chance: Math.max(0, Math.min(10, 100 - summe)) } : { id: 'verband', gewicht: 1 }), 'Item hinzugefügt'));
    box.querySelector('[data-a="tabelle"]').addEventListener('change', (ev) => {
      const t = LOOT_TABELLEN[ev.target.value];
      if (!t) return;
      const ges = t.reduce((s, e) => s + e.gewicht, 0) || 1;
      aendereItems((l) => l.splice(0, l.length, ...t.map((e) => (chance ? { id: e.id, chance: Math.round((e.gewicht / ges) * 1000) / 10 } : { id: e.id, gewicht: e.gewicht }))), `Tabelle „${ev.target.value}“ übernommen`);
    });
    el.append(box);

    // Erwartete Ausbeute (gleiche Regeln wie das Spiel)
    const v = lootVorschau(k, schl);
    const aus = document.createElement('div');
    aus.className = 'loot-ausbeute';
    if (!v.zone) aus.innerHTML = `<p style="color:var(--rot)">${esc(v.fehler.join(' · ') || 'Zone unvollständig')}</p>`;
    else {
      const e = erwarteteAusbeute(v.zone, STANDARD.spawnChance, v.punkte.length);
      aus.innerHTML = `<h4>Erwartete Ausbeute <span class="leise">je Befüllung · ${v.punkte.length} Punkte (${v.frei} freie Kacheln)</span></h4>
        <table><thead><tr><th>Item</th><th>je Punkt</th><th>Ø Stück</th></tr></thead><tbody>${e.eintraege.map((x) => `<tr><td>${esc(x.name)}</td><td>${prozent(x.wahrscheinlichkeit)}</td><td>${String(x.stueck).replace('.', ',')}</td></tr>`).join('')}<tr class="leise"><td>nichts</td><td>${prozent(e.leer)}</td><td></td></tr></tbody></table>
        ${v.zone.max ? `<p class="leise">Höchstens ${v.zone.max} Gegenstände gleichzeitig.</p>` : ''}${v.fehler.length ? `<p style="color:var(--rot)">${esc(v.fehler.join(' · '))}</p>` : ''}${v.frei < v.zone.punkte ? `<p style="color:var(--gelb)">Nur ${v.frei} freie Kacheln für ${v.zone.punkte} Punkte.</p>` : ''}`;
    }
    el.append(aus);
  };
}
