import { KARTEN } from '../../server/spiel/karten/kartenLader.js';
import { ausDefinition, ladeDatei, entwurfJson, exportJson, LIESMICH_TEXT } from '../kern/format.js';
import { kopie } from '../kern/karte.js';
import { validiere, hatFehler } from '../kern/validierung.js';
import { veroeffentlichung } from '../kern/veroeffentlichen.js';
import { AKTIONEN_ANLEITUNG } from '../kern/ausschnitt.js';
import { herunterladen, dateiWaehlen } from './speicher.js';
import { dialog, schliesse, bestaetigen, esc } from './dialoge.js';

/**
 * Menü „Datei“ (aus main.js herausgelöst, Editor 2.0 Schritt 1.2): neue Zone, öffnen (Spielzone als Vorlage, Entwurf, Datei),
 * lokal speichern, als Datei herunterladen, Export (JSON, LIESMICH, alle Entwürfe), Veröffentlichen.
 * Der Editor schreibt NIE Repo-Dateien – Veröffentlichen = Download + `npm run karte:editor`.
 */
export function dateiAktionen({ zustand, zeichner, werkzeuge, aktionen, rechts }) {
  const spielZonenPuffer = new Map();
  const ausDefinitionGepuffert = (id, d) => {
    if (!spielZonenPuffer.has(id)) spielZonenPuffer.set(id, ausDefinition(d).karte);
    return spielZonenPuffer.get(id);
  };

  const datei = {
    /** Zonen fürs Prüfen der Übergänge: alle Projekt-Zonen + Spielzonen, die nicht im Projekt sind */
    projektZonen() {
      const m = new Map([...zustand.zonen].map(([id, e]) => [id, e.karte]));
      for (const [id, d] of Object.entries(KARTEN)) if (!m.has(id)) m.set(id, ausDefinitionGepuffert(id, d));
      return m;
    },

    async neu() {
      const w = await dialog({
        titel: 'Neue Zone',
        html: '<p>Ziehe ein Rechteck auf der Fläche auf (die Zone wird mit Rasen gefüllt) – oder gib die Größe direkt ein.</p>',
        knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Größe eingeben', wert: 'zahlen' }, { text: '▭ Rechteck aufziehen', wert: 'ziehen', art: 'akzent' }],
      });
      if (w === 'zahlen') aktionen.neueZone(null);
      if (w === 'ziehen') {
        werkzeuge.neuModus = true;
        zustand.meldung('Rechteck aufziehen (mindestens 4 × 4) – Esc bricht ab');
      }
    },

    async oeffnen() {
      const zonen = [...zustand.zonen.values()].map((e) => e.karte);
      const html = `<h4>Zone aus dem Spiel als Vorlage</h4><div class="knopfreihe">${Object.entries(KARTEN).map(([id, d]) => `<button data-spiel="${esc(id)}">🗺 ${esc(d.name)} (${esc(id)}, ${d.kacheln[0].length} × ${d.kacheln.length})</button>`).join('')}</div>
        <h4>Entwürfe in diesem Projekt (lokal gespeichert)</h4><div class="knopfreihe">${zonen.length ? zonen.map((k) => `<button data-entwurf="${esc(k.id)}">✎ ${esc(k.name)} (${esc(k.id)})</button>`).join('') : '<span class="leise">noch keine</span>'}</div>
        <h4>Datei</h4><div class="knopfreihe"><button data-datei="1">📂 Entwurf/Karte aus Datei (.json) …</button></div>`;
      const w = await dialog({
        titel: 'Öffnen',
        html,
        knoepfe: [{ text: 'Schließen', wert: null }],
        beiOeffnen: (b) => b.querySelectorAll('[data-spiel],[data-entwurf],[data-datei]').forEach((k) => k.addEventListener('click', () => schliesse({ ...k.dataset }))),
      });
      if (!w) return;
      if (w.entwurf) {
        zustand.aktiviere(w.entwurf);
        zeichner.einpassen();
      } else if (w.spiel) datei.oeffneSpielzone(w.spiel);
      else if (w.datei) {
        const d = await dateiWaehlen();
        if (d) datei.oeffneDatei(d.text, d.name);
      }
    },

    async oeffneSpielzone(id) {
      if (zustand.zonen.has(id) && !(await bestaetigen('Entwurf ersetzen?', `Im Projekt gibt es schon einen Entwurf „${esc(id)}“. Durch die Spielversion ersetzen? (Der alte Entwurf geht verloren – vorher sichern: Datei → Komplett-Backup.)`, { ok: 'Ersetzen', gefahr: true }))) return;
      const { karte, warnungen } = ausDefinition(kopie(KARTEN[id]));
      zustand.fuegeZoneHinzu(karte);
      zeichner.einpassen();
      zustand.meldung(`„${karte.name}“ als Vorlage geöffnet – Änderungen landen im Entwurf, nicht im Spiel${warnungen.length ? ` (${warnungen.length} Hinweise)` : ''}`, 'ok');
    },

    async oeffneDatei(text, name = '') {
      try {
        const { karte, verlauf, warnungen, art } = ladeDatei(text);
        if (zustand.zonen.has(karte.id) && !(await bestaetigen('Entwurf ersetzen?', `„${esc(karte.id)}“ ist schon im Projekt. Ersetzen?`, { ok: 'Ersetzen', gefahr: true }))) return;
        zustand.fuegeZoneHinzu(karte, verlauf);
        zeichner.einpassen();
        zustand.meldung(`${art === 'entwurf' ? 'Entwurf' : 'Karte'} „${karte.name}“ geöffnet${name ? ` (${name})` : ''}${warnungen.length ? ` – ${warnungen.join('; ')}` : ''}`, warnungen.length ? 'fehler' : 'ok');
      } catch (e) {
        zustand.meldung(`Datei nicht lesbar: ${e.message}`, 'fehler');
        dialog({ titel: 'Datei nicht lesbar', html: `<p>${esc(e.message)}</p>` });
      }
    },

    async speichern() {
      if (!zustand.karte) return;
      await zustand.speichereAlle();
      zustand.meldung('💾 Lokal gespeichert', 'ok');
    },

    async herunterladen() {
      if (!zustand.karte) return;
      await zustand.speichereJetzt();
      herunterladen(`${zustand.karte.id}.entwurf.json`, JSON.stringify(entwurfJson(zustand.karte, zustand.verlauf)));
      zustand.meldung('💾 Entwurf als Datei heruntergeladen (mit Verlauf)', 'ok');
    },

    alleHerunterladen() {
      for (const [id, e] of zustand.zonen) herunterladen(`${id}.entwurf.json`, JSON.stringify(entwurfJson(e.karte, e.verlauf)));
    },

    exportJson() {
      const k = zustand.karte;
      if (k) herunterladen(`${k.id}.karte.json`, JSON.stringify(exportJson(k), null, 1));
    },

    liesmich() {
      herunterladen('LIESMICH.txt', `${LIESMICH_TEXT.join('\n\n')}\n\nKI-Änderungen zurückgeben (Aktionsliste):\n${AKTIONEN_ANLEITUNG.map((z) => `  ${z}`).join('\n')}\n`, 'text/plain');
    },

    async veroeffentlichen() {
      const k = zustand.karte;
      if (!k) return;
      const probleme = validiere(k, { zonen: datei.projektZonen() });
      if (hatFehler(probleme)) {
        rechts.zeige('Prüfung');
        return dialog({ titel: 'Noch Fehler', html: `<p>Vor dem Veröffentlichen bitte diese Fehler beheben:</p><ul>${probleme.filter((p) => p.schwere === 'fehler').slice(0, 20).map((p) => `<li>${esc(p.text)}${p.x !== null ? ` (${p.x}|${p.y})` : ''}</li>`).join('')}</ul>` });
      }
      const v = veroeffentlichung(k);
      const neu = !KARTEN[k.id];
      const w = await dialog({
        titel: `🚀 Veröffentlichen: ${v.dateiname}`,
        html: `<p>Zwei Wege ins Spiel (der Editor selbst ändert nie Repo-Dateien):</p>
          <ol><li><b>Empfohlen:</b> <code>${esc(k.id)}.karte.json</code> herunterladen und im Repo <code>npm run karte:editor -- ${esc(k.id)}.karte.json</code> ausführen → schreibt <code>server/spiel/karten/${esc(v.dateiname)}</code>${neu ? ' und trägt die Zone in KARTEN ein' : ''}.</li>
          <li>Von Hand: <code>${esc(v.dateiname)}</code> nach <code>server/spiel/karten/</code> legen${neu ? `; in <code>kartenLader.js</code> ergänzen:<pre>${esc(v.importZeile)}\n…\nexport const KARTEN = Object.freeze({\n…\n${esc(v.kartenZeile)}\n});</pre>` : ' (Zone ist schon in KARTEN eingetragen).'}</li></ol>
          <p>Danach <code>npm test</code>. ${probleme.length ? `<br>⚠ ${probleme.length} Warnungen (siehe Prüfung).` : ''}</p>`,
        knoepfe: [{ text: 'Schließen', wert: null }, { text: `${v.dateiname} laden`, wert: 'js' }, { text: `${k.id}.karte.json laden`, wert: 'json', art: 'akzent' }],
      });
      if (w === 'js') herunterladen(v.dateiname, v.quelltext, 'text/javascript');
      if (w === 'json') herunterladen(`${k.id}.karte.json`, JSON.stringify(exportJson(k), null, 1));
    },

    async zoneEntfernen() {
      const k = zustand.karte;
      if (!k) return;
      if (await bestaetigen('Zone entfernen', `„${esc(k.name)}“ (${esc(k.id)}) aus dem Projekt entfernen? Der lokale Entwurf wird gelöscht (vorher sichern: Datei → Komplett-Backup oder Entwurf herunterladen).`, { ok: 'Entfernen', gefahr: true })) await zustand.entferneZone(k.id);
    },
  };
  return datei;
}
