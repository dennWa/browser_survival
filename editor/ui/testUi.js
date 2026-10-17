import { validiere, hatFehler } from '../kern/validierung.js';
import { testDaten, TEST_SCHLUESSEL } from '../kern/testlauf.js';
import { dialog, schliesse, esc } from './dialoge.js';

/**
 * Karte testen (Phase 9): prüfen (Start, Zombies im Haus, Übergänge, Objekte außerhalb …) → Fehler als Liste mit
 * Koordinaten (Klick springt hin) → sonst alle Entwürfe des Projekts in localStorage `browserSurvival.editorTest` und das
 * Spiel mit `client/?editorTest=1` öffnen. Das Spiel registriert die Entwürfe zur Laufzeit als Zonen (wie der Lokal-Modus),
 * ohne Repo-Code zu ändern. Zurück: Banner-Knopf → `editor/?vonTest=<id>` (Entwürfe liegen im Editor-Speicher).
 */
export function testUi({ zustand, panel, aktionen, sonderAktionen, projektZonen }) {
  sonderAktionen.testen = async () => {
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    const liste = validiere(k, { zonen: projektZonen() });
    zustand.validierung = liste;
    zustand.melde('pruefung');
    if (hatFehler(liste)) {
      panel.zeige('Prüfung');
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
      localStorage.setItem(TEST_SCHLUESSEL, JSON.stringify(daten));
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
