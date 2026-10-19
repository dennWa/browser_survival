import { KARTEN } from '../../server/spiel/karten/kartenLader.js';
import { ausDefinition, ladeDatei, entwurfJson, exportJson, LIESMICH_TEXT } from '../kern/format.js';
import { kopie } from '../kern/karte.js';
import { validiere, hatFehler } from '../kern/validierung.js';
import { veroeffentlichung } from '../kern/veroeffentlichen.js';
import { AKTIONEN_ANLEITUNG } from '../kern/ausschnitt.js';
import { baueBackup, leseBackup, backupDateiname, groesseText, EINSTELLUNGEN_WHITELIST } from '../kern/backup.js';
import { benutzteModelle } from '../kern/bibliothek.js';
import { herunterladen, dateiWaehlen } from './speicher.js';
import { dialog, schliesse, bestaetigen, esc } from './dialoge.js';

/**
 * Menü „Datei“ (aus main.js herausgelöst, Editor 2.0 Schritt 1.2): neue Zone, öffnen (Spielzone als Vorlage, Entwurf, Datei),
 * lokal speichern, als Datei herunterladen, Export (JSON, LIESMICH, alle Entwürfe), Veröffentlichen,
 * Komplett-Backup + Wiederherstellen + Speicherplatz (Schritt 1.6, Format kern/backup.js – ohne Gemini-Schlüssel).
 * 3D-Modelle (Phase 3, ui/bibliothek.js): Entwurf-Datei und Backup nehmen die benutzten bzw. alle Modelle mit (`bibliothek`),
 * Öffnen/Wiederherstellen übernimmt sie in die Projekt-Bibliothek; Export/Veröffentlichen betten sie als `glb` ein.
 * Der Editor schreibt NIE Repo-Dateien – Veröffentlichen = Download + `npm run karte:editor`.
 */
export function dateiAktionen({ zustand, zeichner, werkzeuge, aktionen, rechts, bibliothek }) {
  /** Entwurf als Datei: mit den Modellen, die die Zone benutzt (sonst fehlen sie auf einem anderen Gerät) */
  const entwurfDatei = (karte, verlauf) => {
    const j = entwurfJson(karte, verlauf);
    const modelle = bibliothek?.exportiere(benutzteModelle(karte)) ?? [];
    return modelle.length ? { ...j, bibliothek: modelle } : j;
  };

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
        let roh = text;
        try {
          roh = typeof text === 'string' ? JSON.parse(text) : text;
        } catch {
          /* ladeDatei meldet den Fehler */
        }
        const neueModelle = roh?.bibliothek && bibliothek ? await bibliothek.importiere(roh.bibliothek) : 0;
        const { karte, verlauf, warnungen, art } = ladeDatei(roh);
        if (neueModelle) warnungen.unshift(`${neueModelle} 3D-Modell(e) in die Bibliothek übernommen`);
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
      herunterladen(`${zustand.karte.id}.entwurf.json`, JSON.stringify(entwurfDatei(zustand.karte, zustand.verlauf)));
      zustand.meldung('💾 Entwurf als Datei heruntergeladen (mit Verlauf)', 'ok');
    },

    alleHerunterladen() {
      for (const [id, e] of zustand.zonen) herunterladen(`${id}.entwurf.json`, JSON.stringify(entwurfDatei(e.karte, e.verlauf)));
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

    /** Komplett-Backup: alle Entwürfe (mit Verlauf), eigene Prefabs, Weltanordnung, Editor-Einstellungen (Whitelist) */
    async backup() {
      await zustand.speichereAlle();
      const prefabs = {};
      for (const name of await zustand.speicher.schluessel('prefabs')) {
        const v = await zustand.speicher.hole('prefabs', name);
        if (v) prefabs[name] = v;
      }
      const einstellungen = {};
      for (const k of EINSTELLUNGEN_WHITELIST) {
        try {
          const w = localStorage.getItem(k);
          if (w !== null) einstellungen[k] = JSON.parse(w);
        } catch {
          /* gesperrt oder kaputt → weglassen */
        }
      }
      const b = baueBackup({ entwuerfe: [...zustand.zonen].map(([id, e]) => ({ id, entwurf: entwurfJson(e.karte, e.verlauf) })), prefabs, meta: { layout: zustand.layout, aktiv: zustand.aktivId }, einstellungen, bibliothek: bibliothek?.exportiere() ?? [] });
      const text = JSON.stringify(b);
      herunterladen(backupDateiname(), text);
      zustand.meldung(`🛟 Komplett-Backup: ${b.entwuerfe.length} Zonen, ${Object.keys(prefabs).length} Prefabs, ${b.bibliothek.length} Modelle (${groesseText(text.length)})`, 'ok');
    },

    /** Backup-Datei laden → Auswahl, was zurückkommt → Entwürfe ersetzen/ergänzen, Prefabs + Anordnung übernehmen */
    async wiederherstellen() {
      const d = await dateiWaehlen('.json,application/json');
      if (!d) return;
      let b;
      try {
        b = leseBackup(d.text);
      } catch (e) {
        return dialog({ titel: 'Backup nicht lesbar', html: `<p>${esc(e.message)}</p>` });
      }
      const html = `<p class="leise">Backup vom ${esc(b.erstellt ? new Date(b.erstellt).toLocaleString('de-DE') : '?')} – Häkchen = wiederherstellen. Vorhandene Entwürfe gleicher ID werden <b>ersetzt</b> (Tipp: vorher selbst ein Backup ziehen).</p>
        ${b.entwuerfe.map((e, i) => `<label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" name="z${i}" checked><span>${esc(e.karte.name)} (${esc(e.id)}, ${e.karte.breite} × ${e.karte.hoehe}, ${e.verlauf.zurueck.length} Schritte) ${zustand.zonen.has(e.id) ? '<b style="color:var(--gelb)">ersetzt vorhandenen</b>' : 'neu'}</span></label>`).join('')}
        ${b.fehlerhaft.length ? `<p style="color:var(--rot)">${b.fehlerhaft.length} beschädigt: ${b.fehlerhaft.map((f) => `${esc(f.id)} (${esc(f.grund)})`).join(', ')}</p>` : ''}
        <label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" name="prefabs" ${Object.keys(b.prefabs).length ? 'checked' : 'disabled'}><span>${Object.keys(b.prefabs).length} eigene Prefabs (gleiche Namen werden ersetzt)</span></label>
        <label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" name="modelle" ${b.bibliothek.length ? 'checked' : 'disabled'}><span>${b.bibliothek.length} 3D-Modelle der Bibliothek (gleiche Dateien werden nicht doppelt angelegt)</span></label>
        <label class="feld" style="grid-template-columns:24px 1fr"><input type="checkbox" name="einst" checked><span>Weltanordnung der Zonen + Editor-Einstellungen (Ebenen, Layout, Favoriten)</span></label>`;
      const w = await dialog({
        titel: '♻ Backup wiederherstellen',
        html,
        knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Wiederherstellen', art: 'akzent', wert: (box) => Object.fromEntries([...box.querySelectorAll('input[type=checkbox]')].map((c) => [c.name, c.checked])) }],
      });
      if (!w) return;
      // Modelle zuerst: die Entwürfe verweisen darauf
      const modelle = w.modelle && bibliothek ? await bibliothek.importiere(b.bibliothek) : 0;
      let n = 0;
      for (const [i, e] of b.entwuerfe.entries()) {
        if (!w[`z${i}`]) continue;
        zustand.fuegeZoneHinzu(e.karte, e.verlauf, { aktivieren: false });
        n++;
      }
      if (w.prefabs) for (const [name, v] of Object.entries(b.prefabs)) await zustand.speicher.setze('prefabs', name, v);
      if (w.einst) {
        Object.assign(zustand.layout, b.meta.layout);
        await zustand.speicher.setze('meta', 'layout', zustand.layout);
        for (const [k, v] of Object.entries(b.einstellungen))
          try {
            localStorage.setItem(k, JSON.stringify(v));
          } catch {
            /* gesperrt */
          }
      }
      await aktionen.prefabsNeuLaden?.();
      const ziel = b.meta.aktiv && zustand.zonen.has(b.meta.aktiv) ? b.meta.aktiv : (zustand.aktivId ?? b.entwuerfe[0]?.id);
      if (ziel) zustand.aktiviere(ziel);
      zeichner.einpassen();
      zustand.meldung(`♻ ${n} Zonen${w.prefabs ? ` + ${Object.keys(b.prefabs).length} Prefabs` : ''}${modelle ? ` + ${modelle} Modelle` : ''} wiederhergestellt${w.einst ? ' (Einstellungen gelten nach dem Neuladen)' : ''}`, 'ok');
    },

    /** Speicherplatz & Status */
    async speicherplatz() {
      const schaetzung = await navigator.storage?.estimate?.().catch(() => null);
      const dauerhaft = await navigator.storage?.persisted?.().catch(() => null);
      const sz = zustand.speicherZustand;
      await dialog({
        titel: '💽 Speicher',
        html: `<p>Ort: <b>${esc(zustand.speicherOrt ?? zustand.speicher.art)}</b> · Status: <b>${esc(zustand.speicherStatus || '–')}</b>${sz.fehler ? `<br><span style="color:var(--rot)">${esc(sz.fehler)}</span>` : ''}</p>
          <p>Belegt: <b>${schaetzung ? `${groesseText(schaetzung.usage)} von ${groesseText(schaetzung.quota)}` : 'unbekannt'}</b> · ${dauerhaft === true ? '✓ dauerhaft (der Browser löscht nichts von selbst)' : dauerhaft === false ? '⚠ nicht dauerhaft – bei Speichermangel darf der Browser löschen. Regelmäßig ein Komplett-Backup ziehen!' : ''}</p>
          <p class="leise">${zustand.zonen.size} Zonen im Projekt. Entwürfe liegen nur in diesem Browser – auf einem anderen Gerät per Komplett-Backup übertragen.</p>`,
        knoepfe: [{ text: 'Schließen', wert: null }, { text: '🛟 Komplett-Backup', art: 'akzent', wert: 'backup' }],
      }).then((x) => x === 'backup' && datei.backup());
    },

    async zoneEntfernen() {
      const k = zustand.karte;
      if (!k) return;
      if (await bestaetigen('Zone entfernen', `„${esc(k.name)}“ (${esc(k.id)}) aus dem Projekt entfernen? Der lokale Entwurf wird gelöscht (vorher sichern: Datei → Komplett-Backup oder Entwurf herunterladen).`, { ok: 'Entfernen', gefahr: true })) await zustand.entferneZone(k.id);
    },
  };
  return datei;
}
