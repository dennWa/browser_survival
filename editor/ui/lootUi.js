import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { LOOT_ORTE, MAX_PUNKTE, erwarteteAusbeute, standardMenge } from '../../server/spiel/karten/lootZonen.js';
import { lootVorschau } from '../kern/lootZonenEditor.js';
import { eingebauteVorlagen, vorlageAusZone, zoneMitVorlage, weichtAb, syncOps, loeseOps, verknuepfungen, passtVorlage, neueVorlagenId, vorlagenDatei, leseVorlagenDatei } from '../kern/lootVorlagen.js';
import { dialog, formular, bestaetigen, esc } from './dialoge.js';
import { herunterladen, dateiWaehlen } from './speicher.js';

/**
 * Loot-Zonen im Inspektor (Editor 2.0, Schritt 6.2): `aktionen.lootZonenFelder(el, schl, wert, setze, { felder, knoepfe })`
 * (aufgerufen von ui/inspektor.js). Zone: Name, Modus (exakte Chance in % oder Gewicht), Punkte, innen/außen, Spawn-Chance
 * (nur Gewicht), Nachschub, Höchstzahl, Rechteck. Item-Liste: Item, Chance %/Gewicht, Menge von–bis, ✕; „＋ Item“,
 * „Tabelle übernehmen“ (vorhandene LOOT_TABELLEN). Darunter die erwartete Ausbeute je Befüllung (gleiche Regeln wie das Spiel).
 * Jede Änderung = 1 Undo-Schritt, immer vom aktuellen Stand der Karte aus (der Inspektor zeichnet verzögert neu).
 * Vorlagen (6.3, kern/lootVorlagen.js): oben im Inspektor übernehmen (Kopie) / verknüpfen / lösen / als Vorlage speichern /
 * Vorlage aus dieser Zone aktualisieren (zieht alle verknüpften Zonen des Projekts nach, je Zone 1 Undo-Schritt). Eigene Änderung
 * an einer verknüpften Zone löst die Verknüpfung (Meldung). Verwaltung: `aktionen.lootVorlagen()` (Suche, Ordner, Umbenennen,
 * Löschen, Import/Export). Eigene Vorlagen: Editor-Speicher meta/lootVorlagen (auch im Komplett-Backup).
 */
const ITEMS = Object.entries(GEGENSTAENDE)
  .map(([id, g]) => [id, g.name ?? id])
  .sort((a, b) => a[1].localeCompare(b[1], 'de'));
const STANDARD = STANDARD_KONFIGURATION.loot;
const prozent = (p) => `${(Math.round(p * 1000) / 10).toString().replace('.', ',')} %`;

const SPEICHER = 'lootVorlagen';

export function lootUi({ zustand, aktionen }) {
  let eigene = {};
  zustand.speicher.hole('meta', SPEICHER).then((v) => (eigene = v && typeof v === 'object' ? v : {}));
  const alle = () => ({ ...eingebauteVorlagen(), ...eigene });
  const speichere = async () => {
    await zustand.speicher.setze('meta', SPEICHER, eigene);
    zustand.melde('auswahl'); // Inspektor neu zeichnen
  };
  const karten = () => [...zustand.zonen.values()].map((e) => e.karte);
  /** Vorlage geändert → alle verknüpften Zonen im Projekt nachziehen (je Zone 1 Undo-Schritt) */
  const ziehNach = (id) => {
    let n = 0;
    for (const e of zustand.zonen.values()) {
      const ops = syncOps(e.karte, id, alle()[id]);
      if (ops.length) zustand.ausfuehren(`Vorlage „${alle()[id].name}“ übernommen`, ops, e.karte);
      n += ops.length;
    }
    return n;
  };
  aktionen.lootVorlagenEigene = () => eigene; // für Backup/Wiederherstellen (ohne eingebaute)
  aktionen.lootVorlagenSetzen = async (neu) => {
    eigene = neu;
    await zustand.speicher.setze('meta', SPEICHER, eigene);
  };

  aktionen.lootZonenFelder = (el, schl, wert, setze0, { felder }) => {
    const k = zustand.karte;
    const aktuell = () => k.s('lootZonen').get(schl) ?? wert;
    const z = wert;
    const chance = z.modus === 'chance';
    // Eigene Änderungen an einer verknüpften Zone lösen die Verknüpfung (die Vorlage bleibt unverändert)
    const setze = (text, neu) => {
      const v = neu.vorlage ? alle()[neu.vorlage] : null;
      if (v && weichtAb(neu, v)) {
        delete neu.vorlage;
        zustand.meldung(`Verknüpfung mit „${v.name}“ gelöst – die Zone hat jetzt eigene Werte (💾 „Vorlage aktualisieren“ hätte die Vorlage geändert)`);
      }
      setze0(text, neu);
    };
    el.append(vorlagenBox(schl, aktuell, setze0));
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

  /** Kasten „Vorlage“ oben im Inspektor */
  function vorlagenBox(schl, aktuell, setze) {
    const z = aktuell();
    const box = document.createElement('div');
    box.className = 'loot-vorlage';
    const v = z.vorlage ? alle()[z.vorlage] : null;
    const optionen = Object.entries(alle())
      .sort(([, a], [, b]) => `${a.ordner}/${a.name}`.localeCompare(`${b.ordner}/${b.name}`, 'de'))
      .map(([id, x]) => `<option value="${esc(id)}">${esc(x.ordner ? `${x.ordner} / ` : '')}${esc(x.name)}${x.eingebaut ? ' (Spiel)' : ''}</option>`)
      .join('');
    box.innerHTML = v
      ? `<p>🔗 Verknüpft mit Vorlage <b>${esc(v.name)}</b>${v.eingebaut ? ' (Spiel-Tabelle)' : ''}</p><div class="knopfreihe"><button type="button" data-v="loesen">Verknüpfung lösen</button>${v.eingebaut ? '' : '<button type="button" data-v="aktualisieren" title="Vorlage auf den Stand dieser Zone bringen – alle verknüpften Zonen ziehen nach">💾 Vorlage aktualisieren</button>'}<button type="button" data-v="verwalten">📚</button></div>`
      : `<div class="knopfreihe"><select data-v="wahl" aria-label="Loot-Vorlage"><option value="">Vorlage wählen …</option>${optionen}</select><button type="button" data-v="kopie" title="Werte übernehmen (Kopie, keine Verknüpfung)">Übernehmen</button><button type="button" data-v="verknuepfen" title="übernehmen und verknüpft lassen – Änderungen an der Vorlage kommen automatisch">🔗</button></div>
         <div class="knopfreihe"><button type="button" data-v="speichern">💾 Als Vorlage speichern</button><button type="button" data-v="verwalten">📚 Vorlagen …</button></div>`;
    const wahl = () => box.querySelector('[data-v="wahl"]')?.value;
    box.querySelectorAll('button[data-v]').forEach((b) =>
      b.addEventListener('click', async () => {
        const was = b.dataset.v;
        if (was === 'verwalten') return aktionen.lootVorlagen();
        if (was === 'loesen') {
          const neu = { ...aktuell() };
          delete neu.vorlage;
          return setze('Verknüpfung gelöst', neu);
        }
        if (was === 'kopie' || was === 'verknuepfen') {
          const id = wahl();
          if (!id) return zustand.meldung('Erst eine Vorlage wählen', 'fehler');
          return setze(`Vorlage „${alle()[id].name}“`, zoneMitVorlage(aktuell(), alle()[id], was === 'verknuepfen' ? id : null));
        }
        if (was === 'speichern') {
          const w = await formular('💾 Als Loot-Vorlage speichern', [
            { name: 'name', label: 'Name', typ: 'text', wert: aktuell().name ?? '', pflicht: true },
            { name: 'ordner', label: 'Ordner', typ: 'text', wert: '', hilfe: 'z. B. Medizin oder Waffen/Militär' },
            { name: 'mitOrt', label: 'Punkte + innen/außen mitnehmen', typ: 'haken', wert: false },
            { name: 'verknuepfen', label: 'Zone mit der Vorlage verknüpfen', typ: 'haken', wert: true },
          ], { okText: 'Speichern', text: 'Gilt im ganzen Projekt (alle Zonen), auch im Komplett-Backup.' });
          if (!w) return;
          const id = neueVorlagenId(new Set(Object.keys(alle())));
          eigene = { ...eigene, [id]: vorlageAusZone(aktuell(), { name: w.name, ordner: w.ordner ?? '', mitOrt: !!w.mitOrt }) };
          await speichere();
          if (w.verknuepfen) setze(`Mit Vorlage „${w.name}“ verknüpft`, { ...aktuell(), vorlage: id });
          return zustand.meldung(`💾 Vorlage „${w.name}“ gespeichert`, 'ok');
        }
        if (was === 'aktualisieren') {
          const id = aktuell().vorlage;
          const n = verknuepfungen(karten(), id);
          if (!(await bestaetigen('Vorlage aktualisieren', `„${esc(alle()[id].name)}“ auf den Stand dieser Zone bringen? ${n} verknüpfte Zone(n) im Projekt ziehen nach.`, { ok: 'Aktualisieren' }))) return;
          eigene = { ...eigene, [id]: { ...vorlageAusZone(aktuell(), { name: alle()[id].name, ordner: alle()[id].ordner }) } };
          await speichere();
          zustand.meldung(`💾 Vorlage aktualisiert – ${ziehNach(id)} weitere Zone(n) nachgezogen`, 'ok');
        }
      }),
    );
    return box;
  }

  /** Verwaltung: Suche, Ordner, Umbenennen, Löschen (löst Verknüpfungen), Import/Export */
  aktionen.lootVorlagen = async () => {
    let suche = '';
    const knoten = document.createElement('div');
    knoten.className = 'loot-vorlagen';
    const zeichne = () => {
      const liste = Object.entries(alle()).filter(([, v]) => !suche || passtVorlage(v, suche)).sort(([, a], [, b]) => `${a.eingebaut ? 1 : 0}${a.ordner}/${a.name}`.localeCompare(`${b.eingebaut ? 1 : 0}${b.ordner}/${b.name}`, 'de'));
      knoten.querySelector('.liste-vorlagen').innerHTML = liste.length
        ? `<table><tbody>${liste
            .map(([id, v]) => `<tr data-id="${esc(id)}"><td>${esc(v.ordner ? `${v.ordner} / ` : '')}<b>${esc(v.name)}</b>${v.eingebaut ? ' <span class="leise">Spiel</span>' : ''}<br><span class="leise klein">${v.eintraege.length} Items · ${v.modus === 'chance' ? 'Chance %' : 'Gewicht'} · ${verknuepfungen(karten(), id)} verknüpft</span></td><td>${v.eingebaut ? '' : '<button type="button" data-a="umbenennen" title="Name/Ordner">✎</button><button type="button" data-a="loeschen" class="gefahr" title="löschen">🗑</button>'}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="leise">Nichts gefunden.</p>';
      knoten.querySelectorAll('tr[data-id] button').forEach((b) => b.addEventListener('click', () => aktion(b.dataset.a, b.closest('tr').dataset.id)));
    };
    const aktion = async (was, id) => {
      const v = eigene[id];
      if (!v) return;
      if (was === 'umbenennen') {
        const w = await formular('✎ Vorlage', [{ name: 'name', label: 'Name', typ: 'text', wert: v.name, pflicht: true }, { name: 'ordner', label: 'Ordner', typ: 'text', wert: v.ordner }], { okText: 'Speichern' });
        if (w) eigene = { ...eigene, [id]: { ...v, name: w.name, ordner: w.ordner ?? '' } };
      } else if (was === 'loeschen') {
        const n = verknuepfungen(karten(), id);
        if (!(await bestaetigen('Vorlage löschen', `„${esc(v.name)}“ löschen?${n ? ` ${n} verknüpfte Zone(n) behalten ihre Werte, die Verknüpfung wird gelöst.` : ''}`, { ok: 'Löschen', gefahr: true }))) return aktionen.lootVorlagen();
        for (const e of zustand.zonen.values()) {
          const ops = loeseOps(e.karte, id);
          if (ops.length) zustand.ausfuehren(`Vorlage „${v.name}“ gelöscht`, ops, e.karte);
        }
        const { [id]: _weg, ...rest } = eigene;
        eigene = rest;
      }
      await speichere();
      aktionen.lootVorlagen();
    };
    knoten.innerHTML = '<input type="search" placeholder="Vorlagen suchen … (Name, Ordner, Item)" aria-label="Vorlagen suchen"><div class="liste-vorlagen"></div>';
    knoten.querySelector('input').addEventListener('input', (e) => {
      suche = e.target.value;
      zeichne();
    });
    knoten.querySelector('input').addEventListener('keydown', (e) => e.stopPropagation());
    zeichne();
    const w = await dialog({ titel: '📚 Loot-Vorlagen', knoten, knoepfe: [{ text: '⬆ Importieren …', wert: 'import' }, { text: '⬇ Exportieren', wert: 'export' }, { text: 'Schließen', art: 'akzent', wert: null }] });
    if (w === 'export') herunterladen('loot-vorlagen.json', JSON.stringify(vorlagenDatei(eigene), null, 1));
    if (w === 'import') {
      const d = await dateiWaehlen('.json,application/json');
      if (!d) return;
      try {
        const { vorlagen, anzahl } = leseVorlagenDatei(d.text, new Set(Object.keys(alle())));
        eigene = { ...eigene, ...vorlagen };
        await speichere();
        zustand.meldung(`⬆ ${anzahl} Loot-Vorlage(n) importiert`, 'ok');
      } catch (e) {
        zustand.meldung(`Import fehlgeschlagen: ${e.message}`, 'fehler');
      }
    }
  };
}
