import { validiere, hatFehler } from '../kern/validierung.js';
import { testDaten } from '../kern/testlauf.js';
import { speichereEditorTest } from '../../client/ui/editorTestSpeicher.js';
import { dialog, schliesse, esc } from './dialoge.js';
import { startInDerMitte } from '../kern/platzierung.js';
import { markerSchluessel } from '../kern/karte.js';

/**
 * Karte testen (Phase 9): prüfen (Start, Zombies im Haus, Übergänge, Objekte außerhalb …) → Fehler als Liste mit
 * Koordinaten (Klick springt hin) → sonst alle Entwürfe des Projekts in IndexedDB (client/ui/editorTestSpeicher.js) und das
 * Spiel mit `client/?editorTest=1` öffnen. Das Spiel registriert die Entwürfe zur Laufzeit als Zonen (wie der Lokal-Modus),
 * ohne Repo-Code zu ändern. Zurück: Banner-Knopf → `editor/?vonTest=<id>` (Entwürfe liegen im Editor-Speicher).
 * Phase 10.7: Fehlt nur der Spieler-Start, fragt der Editor „Spawn in die Mitte der Karte?“ → OK setzt ihn (1 Undo-Schritt) und testet.
 */
export function testUi({ zustand, aktionen, layout, projektZonen }) {
  aktionen.testen = async () => {
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    let liste = validiere(k, { zonen: projektZonen() });
    if (liste.some((e) => e.code === 'start')) {
      const ort = startInDerMitte(k);
      const ok = ort && (await dialog({
        titel: '🧍 Kein Spieler-Start gesetzt',
        html: `<p>Der Spawn kommt in die <b>Mitte der Karte</b> (${ort.x}|${ort.y}). Einverstanden?</p><p class="leise">Später verschieben: Marker anklicken und ziehen – oder Spawns → Spieler-Start.</p>`,
        knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'OK – Spawn in die Mitte', wert: true, art: 'akzent' }],
      }));
      if (!ok) return;
      zustand.ausfuehren('Spieler-Start (Kartenmitte)', [{ s: 'marker', k: markerSchluessel(ort.x, ort.y), neu: { art: 'start' } }]);
      zustand.meldung(`🧍 Spieler-Start in die Mitte gesetzt (${ort.x}|${ort.y})`, 'ok');
      liste = validiere(k, { zonen: projektZonen() });
    }
    zustand.validierung = liste;
    zustand.melde('pruefung');
    if (hatFehler(liste)) {
      layout.zeigeReiter('rechts', 'Prüfung');
      const fehler = liste.filter((e) => e.schwere === 'fehler');
      await dialog({
        titel: `⛔ ${fehler.length} Fehler – Test nicht möglich`,
        html: `<p>Bitte zuerst beheben (Klick springt zur Stelle):</p><ul class="liste">${fehler.map((e, i) => `<li class="fehler" data-i="${i}">${esc(e.text)}${e.x !== null ? ` <b>(${e.x}|${e.y})</b>` : ''}</li>`).join('')}</ul>`,
        knoepfe: [{ text: 'OK', wert: null }],
        beiOeffnen: (b) =>
          b.querySelectorAll('li[data-i]').forEach((li) =>
            li.addEventListener('click', () => {
              const e = fehler[Number(li.dataset.i)];
              schliesse(null);
              if (e.x !== null) aktionen.springeZu(e.x, e.y);
            }),
          ),
      });
      return;
    }
    let daten;
    let probleme;
    try {
      ({ daten, probleme } = testDaten(new Map([...zustand.zonen].map(([id, e]) => [id, e.karte])), k.id));
    } catch (e) {
      return dialog({ titel: 'Spiel-Lader lehnt die Karte ab', html: `<p>${esc(e.message)}</p>` });
    }
    try {
      await speichereEditorTest(daten);
    } catch (e) {
      return dialog({ titel: 'Test nicht möglich', html: `<p>Der Browser-Speicher ist voll oder gesperrt (${esc(e.message)}). Tipp: nicht benötigte Zonen aus dem Projekt entfernen.</p>` });
    }
    await zustand.speichereAlle();
    const warnungen = liste.length + probleme.length;
    if (warnungen) {
      const weiter = await dialog({
        titel: '▶ Karte testen',
        html: `<p>${liste.length} Warnungen (siehe Prüfung)${probleme.length ? `<br>${probleme.map(esc).join('<br>')}` : ''}</p><p>Trotzdem starten? Im Spiel oben „⟵ Zurück zum Editor“.</p>`,
        knoepfe: [{ text: 'Abbrechen', wert: false }, { text: '▶ Starten', wert: true, art: 'akzent' }],
      });
      if (!weiter) return;
    }
    location.href = new URL('../client/?editorTest=1', location.href).href;
  };

  /** Nach dem Zurückkommen aus dem Test: getestete Zone öffnen */
  return {
    nachStart() {
      const id = new URLSearchParams(location.search).get('vonTest');
      if (!id) return;
      history.replaceState(null, '', location.pathname);
      if (zustand.zonen.has(id)) {
        zustand.aktiviere(id);
        zustand.meldung(`Zurück aus dem Test von „${zustand.karte.name}“ – alles noch da`, 'ok');
      }
    },
  };
}
