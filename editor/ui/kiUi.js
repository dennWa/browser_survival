import { ausschnitt, ausschnittText, bereichAus, bereichText } from '../kern/ausschnitt.js';
import { leseKiAntwort, pruefeAenderungen, eintragRechteck } from '../kern/kiImport.js';
import { dialog, esc } from './dialoge.js';
import { herunterladen, dateiWaehlen } from './speicher.js';

/**
 * KI-Arbeit (Phase 8): Ausschnitt-Export (markierter Bereich → Text/JSON für eine KI) und KI-Import mit Vorschau.
 * Import-Ablauf: Antwort einfügen → Prüfen → Reiter „KI-Import“ zeigt den Diff (＋ neu grün, － weg rot, ～ geändert gelb,
 * ✗ ungültig orange, mit Grund) und hebt alles auf der Karte hervor → erst „Übernehmen“ ändert die Karte (1 Verlaufsschritt).
 */
const FARBE = { neu: '#4caf50', weg: '#e5484d', aendern: '#f5b83d', ungueltig: '#ff8a3c' };
const ZEICHEN = { neu: '＋', weg: '－', aendern: '～', ungueltig: '✗' };

export function kiUi({ zustand, panel, aktionen, layout, zeichner }) {
  const auswahlBereich = () => aktionen.auswahlBereich();
  let offen = null; // { ergebnis, karte, quelle }

  const bereichOderZone = () => auswahlBereich() ?? (zustand.karte ? { x: 0, y: 0, b: zustand.karte.breite, h: zustand.karte.hoehe } : null);

  aktionen.ausschnittExport = async () => {
    const k = zustand.karte;
    if (!k) return;
    const r = bereichOderZone();
    const a = ausschnitt(k, r);
    const text = ausschnittText(a);
    const name = `${k.id}_x${a.bereich.x0}-${a.bereich.x1}_y${a.bereich.y0}-${a.bereich.y1}`;
    const w = await dialog({
      titel: `🤖 Ausschnitt für KI: ${bereichText(a.bereich)}`,
      html: `<p class="leise">${auswahlBereich() ? '' : 'Kein Bereich markiert – das ist die ganze Zone. Für einen Ausschnitt mit ⬚ ein Rechteck ziehen. '}Text in den KI-Chat kopieren (oder JSON-Datei geben). Die KI antwortet mit einer Aktionsliste → 🤖 KI-Import.</p><textarea readonly style="min-height:320px">${esc(text)}</textarea>`,
      knoepfe: [{ text: 'Schließen', wert: null }, { text: '⬇ JSON', wert: 'json' }, { text: '⬇ Text (.md)', wert: 'md' }, { text: '📋 Text kopieren', wert: 'kopieren', art: 'akzent' }],
    });
    if (w === 'json') herunterladen(`${name}.ausschnitt.json`, JSON.stringify(a, null, 1));
    if (w === 'md') herunterladen(`${name}.ausschnitt.md`, text, 'text/markdown');
    if (w === 'kopieren') {
      try {
        await navigator.clipboard.writeText(text);
        zustand.meldung('📋 Ausschnitt kopiert – in den KI-Chat einfügen', 'ok');
      } catch {
        herunterladen(`${name}.ausschnitt.md`, text, 'text/markdown');
        zustand.meldung('Zwischenablage gesperrt – als Datei heruntergeladen', 'fehler');
      }
    }
  };

  aktionen.kiImport = async () => {
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    const r = auswahlBereich();
    const w = await dialog({
      titel: '🤖 KI-Änderungen importieren',
      html: `<p class="leise">Antwort der KI hier einfügen (Aktionsliste als JSON, gern mit Text drumherum) – oder eine Datei laden. Erlaubt ist nur der Bereich ${r ? `<b>${esc(bereichText(bereichAus(k, r)))}</b> (aktuelle Markierung)` : 'aus der Antwort ({"aktion":"bereich",…}) – oder vorher einen Bereich markieren'}. Vor dem Übernehmen gibt es eine Vorschau.</p>
        <textarea name="text" placeholder='[{"aktion":"setze","typ":"baum","x":23,"y":14}]'></textarea>`,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: '📂 Datei …', wert: 'datei' }, { text: 'Prüfen', art: 'akzent', wert: (b) => ({ text: b.querySelector('[name="text"]').value }) }],
    });
    let text = w?.text;
    if (w === 'datei') text = (await dateiWaehlen('.json,.txt,.md'))?.text;
    if (!text?.trim()) return;
    pruefeText(text, r ? bereichAus(k, r) : null);
  };

  /** Antworttext prüfen und als Vorschau zeigen (auch vom Gemini-Helfer genutzt). bereich = {x0,x1,y0,y1}|null */
  function pruefeText(text, bereich, zurueck = 'Inspektor') {
    const k = zustand.karte;
    try {
      const gelesen = leseKiAntwort(text, k);
      const ergebnis = pruefeAenderungen(k, gelesen, { bereich });
      offen = { ergebnis, karte: k, gelesen, bereich, zurueck };
      zeigeVorschau();
    } catch (e) {
      dialog({ titel: 'KI-Antwort nicht verwendbar', html: `<p>${esc(e.message)}</p>` });
    }
  }

  function zeigeVorschau() {
    const { ergebnis } = offen;
    zeichner.ueberlagerungen = [
      { rechteck: { x: ergebnis.bereich.x0, y: ergebnis.bereich.y0, b: ergebnis.bereich.x1 - ergebnis.bereich.x0 + 1, h: ergebnis.bereich.y1 - ergebnis.bereich.y0 + 1 }, farbe: '#4fc3ff', gestrichelt: true, text: `KI-Bereich ${bereichText(ergebnis.bereich)}` },
      ...ergebnis.eintraege.map((e) => ({ rechteck: eintragRechteck(e), farbe: FARBE[e.art], gestrichelt: e.art === 'ungueltig', text: `${ZEICHEN[e.art]}${e.nr}` })).filter((u) => u.rechteck),
    ];
    zeichner.anfordern();
    const b = ergebnis.bereich;
    zeichner.springeZu(Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2), Math.min(28, Math.max(6, (zeichner.groesse.b - 60) / (b.x1 - b.x0 + 4))));
    panel.registriere('KI-Import', kiReiter, { ereignisse: ['zone'] });
    layout.zeigeReiter('rechts', 'KI-Import');
  }

  function verwerfen(meldung = 'KI-Änderungen verworfen') {
    const zurueck = offen?.zurueck ?? 'Inspektor';
    offen = null;
    zeichner.ueberlagerungen = [];
    zeichner.anfordern();
    panel.entferne('KI-Import');
    panel.zeige(zurueck);
    zustand.meldung(meldung);
  }

  /** Reiter „KI-Import“ – nur sichtbar, solange eine Vorschau offen ist */
  function kiReiter() {
    const el = panel.el;
    if (!offen) {
      el.innerHTML = '<p class="leise">Keine KI-Änderungen geladen – Menü KI → KI-Antwort importieren.</p>';
      return;
    }
    const { ergebnis, karte } = offen;
    if (karte !== zustand.karte) {
      el.innerHTML = '<p>Die Vorschau gehört zu einer anderen Zone. Zurückwechseln oder verwerfen.</p>';
      const v = Object.assign(document.createElement('button'), { textContent: 'Verwerfen' });
      v.addEventListener('click', () => verwerfen());
      el.append(v);
      return;
    }
    const z = ergebnis.zaehler;
    el.innerHTML = `<h3>KI-Änderungen (Vorschau)</h3><p>Bereich <b>${esc(bereichText(ergebnis.bereich))}</b><br>
      <span style="color:${FARBE.neu}">＋ ${z.neu} neu</span> · <span style="color:${FARBE.weg}">－ ${z.weg} weg</span> · <span style="color:${FARBE.aendern}">～ ${z.aendern} geändert</span> · <span style="color:${FARBE.ungueltig}">✗ ${z.ungueltig} ungültig</span></p>
      ${ergebnis.warnungen.map((w) => `<p style="color:var(--gelb)">⚠ ${esc(w)}</p>`).join('')}
      ${z.ungueltig ? '<p class="leise">Ungültige Aktionen werden NICHT übernommen (Grund steht dabei).</p>' : ''}`;
    const reihe = document.createElement('div');
    reihe.className = 'knopfreihe';
    const ok = Object.assign(document.createElement('button'), { textContent: `✔ Übernehmen (${ergebnis.ops.length ? z.neu + z.weg + z.aendern : 0})`, className: 'akzent', disabled: !ergebnis.ops.length });
    ok.addEventListener('click', () => {
      // Hat sich die Karte seit der Vorschau geändert? Dann neu prüfen und die neue Vorschau zeigen statt blind anzuwenden
      const frisch = pruefeAenderungen(karte, offen.gelesen, { bereich: offen.bereich });
      if (JSON.stringify(frisch.ops) !== JSON.stringify(ergebnis.ops)) {
        offen.ergebnis = frisch;
        zeigeVorschau();
        return zustand.meldung('Die Karte hat sich seit der Vorschau geändert – Vorschau aktualisiert, bitte nochmal prüfen', 'fehler');
      }
      const n = z.neu + z.weg + z.aendern;
      zustand.ausfuehren(`KI-Änderungen (${n})`, ergebnis.ops);
      verwerfen(`✔ ${n} KI-Änderungen übernommen – Strg+Z macht alle auf einmal rückgängig`);
    });
    const nein = Object.assign(document.createElement('button'), { textContent: '✗ Verwerfen', className: 'gefahr' });
    nein.addEventListener('click', () => verwerfen());
    reihe.append(ok, nein);
    el.append(reihe);
    const ul = document.createElement('ul');
    ul.className = 'liste';
    for (const e of ergebnis.eintraege) {
      const li = document.createElement('li');
      li.className = `diff-${e.art === 'ungueltig' ? 'ungueltig' : e.art === 'weg' ? 'weg' : e.art === 'neu' ? 'neu' : 'aendern'}`;
      li.textContent = `${e.nr}. ${e.art === 'ungueltig' ? '✗ ' : ''}${e.text}`;
      li.addEventListener('click', () => e.x !== null && e.x !== undefined && zeichner.springeZu(e.x, e.y));
      ul.append(li);
    }
    el.append(ul);
  }

  return { verwerfen, pruefeText };
}
