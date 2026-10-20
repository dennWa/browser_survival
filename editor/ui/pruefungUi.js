import { esc, dialog } from './dialoge.js';
import { fixFuer, fixeAlle, istBehebbar } from '../kern/autoFix.js';

/**
 * Reiter „Prüfung“ (rechte Seitenleiste): Live-Validierung der aktiven Zone (kern/validierung.js) als Liste,
 * Klick springt zur Stelle. Die Reiter-Beschriftung zeigt die Zähler (⛔ Fehler / ⚠ Warnungen / ✓).
 * Auto-Fix (8.2, kern/autoFix.js): 🔧 je eindeutigem Eintrag, oben „Alle eindeutigen beheben“ – immer mit Vorschau
 * (Liste + Markierung auf der Karte: rot = vorher, grün = nachher), Übernehmen = 1 Undo-Schritt.
 */
export function zaehlerText(liste) {
  const f = liste.filter((e) => e.schwere === 'fehler').length;
  const w = liste.length - f;
  return { f, w, text: f || w ? `${f ? `⛔${f}` : ''}${f && w ? ' ' : ''}${w ? `⚠${w}` : ''}` : '✓' };
}

export function pruefungUi({ zustand, leiste, aktionen, zeichner }) {
  /** Vorschau-Dialog: Fixes markieren, bei „Übernehmen“ als ein Undo-Schritt ausführen */
  async function vorschau(titel, fixes, ops) {
    if (!fixes.length) return zustand.meldung('Nichts eindeutig automatisch behebbar', 'fehler');
    zeichner.ueberlagerungen = fixes.flatMap(({ eintrag, fix }) => [
      ...(eintrag.x !== null ? [{ rechteck: { x: eintrag.x, y: eintrag.y, b: 1, h: 1 }, farbe: '#ff5252', gestrichelt: true }] : []),
      { rechteck: { x: fix.ziel.x, y: fix.ziel.y, b: 1, h: 1 }, farbe: '#4caf50' },
    ]);
    zeichner.anfordern();
    const html = `<p class="leise">Rot gestrichelt = vorher, grün = nachher (auf der Karte markiert). Übernehmen = 1 Schritt, Strg+Z macht alles rückgängig.</p><ul class="liste">${fixes.map(({ fix }) => `<li>🔧 ${esc(fix.text)}</li>`).join('')}</ul>`;
    const ok = await dialog({ titel, html, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: `Übernehmen (${fixes.length})`, wert: true, art: 'akzent' }] });
    zeichner.ueberlagerungen = [];
    zeichner.anfordern();
    if (!ok) return;
    zustand.ausfuehren(fixes.length === 1 ? `Auto-Fix: ${fixes[0].fix.text}` : `Auto-Fix: ${fixes.length} Fälle`, ops);
    zustand.meldung(`🔧 ${fixes.length} behoben – Strg+Z macht es rückgängig`, 'ok');
  }
  aktionen.autoFix = (eintrag) => {
    const fix = fixFuer(zustand.karte, eintrag);
    return vorschau('Automatisch beheben', fix ? [{ eintrag, fix }] : [], fix?.ops ?? []);
  };
  aktionen.autoFixAlle = () => {
    const { fixes, ops } = fixeAlle(zustand.karte, zustand.validierung ?? []);
    return vorschau('Alle eindeutigen beheben', fixes, ops);
  };
  leiste.registriere(
    'Prüfung',
    () => {
      const liste = zustand.validierung;
      const { f, w } = zaehlerText(liste);
      const el = leiste.el;
      el.innerHTML = liste.length ? `<p class="leise">${f} Fehler (verhindern Test/Veröffentlichen) · ${w} Warnungen. Klick springt zur Stelle.</p>` : '<p>✓ Keine Probleme gefunden.</p>';
      const behebbar = liste.filter(istBehebbar).length;
      if (behebbar) {
        const alle = document.createElement('button');
        alle.type = 'button';
        alle.className = 'akzent auto-fix-alle';
        alle.textContent = `🔧 Alle eindeutigen beheben (${behebbar})`;
        alle.addEventListener('click', () => aktionen.autoFixAlle());
        el.append(alle);
      }
      const ul = document.createElement('ul');
      ul.className = 'liste';
      for (const e of liste) {
        const li = document.createElement('li');
        li.className = e.schwere;
        li.innerHTML = `${esc(e.text)}${e.x !== null ? ` <span class="leise">(${e.x}|${e.y})</span>` : ''}`;
        li.addEventListener('click', () => e.x !== null && aktionen.springeZu(e.x, e.y));
        if (istBehebbar(e)) {
          const k = document.createElement('button');
          k.type = 'button';
          k.className = 'auto-fix';
          k.title = 'Automatisch beheben (mit Vorschau)';
          k.textContent = '🔧';
          k.addEventListener('click', (ev) => {
            ev.stopPropagation();
            aktionen.autoFix(e);
          });
          li.append(' ', k);
        }
        // 9.4: 🤖 Erklären – ein Satz + Korrektur, Kontext nur die Umgebung des Fehlers
        const ki = document.createElement('button');
        ki.type = 'button';
        ki.className = 'auto-fix';
        ki.title = 'KI erklärt den Fehler und schlägt eine Korrektur vor';
        ki.textContent = '🤖';
        ki.addEventListener('click', (ev) => {
          ev.stopPropagation();
          aktionen.fehlerErklaeren?.(e);
        });
        li.append(' ', ki);
        ul.append(li);
      }
      el.append(ul);
    },
    { ereignisse: ['zone', 'pruefung'], beschriftung: () => `Prüfung ${zaehlerText(zustand.validierung).text}` },
  );
}
