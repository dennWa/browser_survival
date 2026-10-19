import { kopiere } from '../kern/auswahl.js';
import { eingebautePrefabs, prefabDatei, ladePrefabDatei } from '../kern/prefabs.js';
import { formular, bestaetigen, esc } from './dialoge.js';
import { herunterladen, dateiWaehlen } from './speicher.js';

/**
 * Prefabs (Phase 6): Reiter „🏠 Prefabs“ der linken Seitenleiste – eingebaute Vorlagen (Wohnhaus, Werkstatt …) und eigene (lokal gespeichert,
 * Bereich 'prefabs' im Editor-Speicher, als Datei austauschbar). Einfügen hängt die Vorlage an die Maus (aktionen.einfuegen).
 */
export function prefabUi({ zustand, panel, aktionen, layout }) {
  const REITER = '🏠 Prefabs';
  const eigene = new Map(); // Name → Vorlage
  const laden = async () => {
    eigene.clear();
    for (const name of await zustand.speicher.schluessel('prefabs')) {
      const v = await zustand.speicher.hole('prefabs', name);
      if (v?.zellen) eigene.set(name, v);
    }
    if (panel.aktiv === REITER) panel.zeichne();
  };
  laden();
  aktionen.prefabsNeuLaden = laden; // nach „Backup wiederherstellen“

  aktionen.prefabSpeichern = async () => {
    const r = aktionen.auswahlBereich();
    if (!r) return zustand.meldung('Erst einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
    const w = await formular('Als Prefab speichern', [{ name: 'name', label: 'Name', typ: 'text', wert: 'Mein Gebäude', pflicht: true }], { text: `Bereich ${r.b} × ${r.h} ab ${r.x}|${r.y} – Kacheln, Objekte, Marker, Bauwerke und Räume kommen mit.` });
    if (!w) return;
    const vorlage = kopiere(zustand.karte, r, { name: w.name });
    eigene.set(w.name, vorlage);
    await zustand.speicher.setze('prefabs', w.name, vorlage);
    zustand.meldung(`🏠 Prefab „${w.name}“ gespeichert`, 'ok');
    layout.zeigeReiter('links', REITER);
  };
  aktionen.prefabs = () => layout.zeigeReiter('links', REITER);

  panel.registriere(REITER, () => {
    const el = panel.el;
    el.innerHTML = '<p class="leise">Vorlage wählen → hängt an der Maus, R dreht, Klick setzt. Eigene: Bereich markieren → Rechtsklick → „Als Prefab“.</p>';
    const liste = (titel, eintraege, eigen) => {
      el.insertAdjacentHTML('beforeend', `<h4>${esc(titel)}</h4>`);
      if (!eintraege.length) el.insertAdjacentHTML('beforeend', '<p class="leise">noch keine</p>');
      for (const { name, beschreibung, vorlage } of eintraege) {
        const div = document.createElement('div');
        div.className = 'knopfreihe';
        div.innerHTML = `<button class="akzent" title="${esc(beschreibung ?? '')}">🏠 ${esc(name)} <span class="leise">${vorlage.b}×${vorlage.h}</span></button>`;
        div.firstChild.addEventListener('click', () => {
          if (!zustand.karte) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
          aktionen.einfuegen(vorlage);
        });
        if (eigen) {
          const export_ = Object.assign(document.createElement('button'), { textContent: '⬇', title: 'Als Datei speichern' });
          export_.addEventListener('click', () => herunterladen(`${name.replace(/[^\w-]+/g, '_')}.prefab.json`, JSON.stringify(prefabDatei(name, vorlage))));
          const weg = Object.assign(document.createElement('button'), { textContent: '🗑', title: 'Löschen', className: 'gefahr' });
          weg.addEventListener('click', async () => {
            if (!(await bestaetigen('Prefab löschen', `„${esc(name)}“ löschen?`, { ok: 'Löschen', gefahr: true }))) return;
            eigene.delete(name);
            await zustand.speicher.loesche('prefabs', name);
            panel.zeichne();
          });
          div.append(export_, weg);
        }
        if (beschreibung) div.insertAdjacentHTML('beforeend', `<span class="leise">${esc(beschreibung)}</span>`);
        el.append(div);
      }
    };
    liste('Eingebaut', eingebautePrefabs(), false);
    liste('Eigene', [...eigene].map(([name, vorlage]) => ({ name, vorlage })), true);
    const reihe = document.createElement('div');
    reihe.className = 'knopfreihe';
    reihe.innerHTML = '<button>📂 Prefab-Datei laden</button><button>🏠 Auswahl als Prefab</button>';
    reihe.children[0].addEventListener('click', async () => {
      const d = await dateiWaehlen('.json');
      if (!d) return;
      try {
        const { name, vorlage } = ladePrefabDatei(d.text);
        eigene.set(name, vorlage);
        await zustand.speicher.setze('prefabs', name, vorlage);
        panel.zeichne();
        zustand.meldung(`Prefab „${name}“ geladen`, 'ok');
      } catch (e) {
        zustand.meldung(`Prefab-Datei: ${e.message}`, 'fehler');
      }
    });
    reihe.children[1].addEventListener('click', () => aktionen.prefabSpeichern());
    el.append(reihe);
  }, { ereignisse: ['zone'], ohneKarte: true });
}
