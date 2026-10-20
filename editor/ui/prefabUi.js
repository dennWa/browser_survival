import { kopiere } from '../kern/auswahl.js';
import { eingebautePrefabs, prefabDatei, ladePrefabDatei } from '../kern/prefabs.js';
import { prefabEintraege, prefabOrdner, vorschauDaten } from '../kern/bibliothekVorlagen.js';
import { katalog } from '../kern/katalog.js';
import { formular, bestaetigen, esc } from './dialoge.js';
import { herunterladen, dateiWaehlen } from './speicher.js';

/**
 * Prefabs (Phase 6, Bibliothek 7.4): Reiter „🏠 Prefabs“ der linken Seitenleiste – eingebaute Vorlagen (Wohnhaus, Werkstatt …) und
 * eigene (lokal gespeichert, Bereich 'prefabs' im Editor-Speicher, als Datei austauschbar). 7.4: Suche, Ordner (Feld `ordner`
 * der Vorlage, ✎ ändert Name/Ordner), automatische Vorschaubilder (kern/bibliothekVorlagen.js vorschauDaten → Canvas, Cache),
 * Ziehen auf die Karte (HTML-Drag, `application/x-editor-asset` = Eintrags-ID → aktionen.ablegen), Favoriten im Asset-Browser.
 * Einfügen hängt die Vorlage an die Maus (aktionen.einfuegen).
 * aktionen.prefabEintraege() liefert alle Prefabs als Asset-Einträge (Asset-Browser: Gruppe „Prefabs“, Suche, Favoriten).
 * Änderungen melden 'vorlagen' (Seitenleisten zeichnen neu).
 */
export function prefabUi({ zustand, panel, aktionen, layout }) {
  const REITER = '🏠 Prefabs';
  const eigene = new Map(); // Name → Vorlage
  let suche = '';
  const geaendert = () => zustand.melde('vorlagen');
  const laden = async () => {
    eigene.clear();
    for (const name of await zustand.speicher.schluessel('prefabs')) {
      const v = await zustand.speicher.hole('prefabs', name);
      if (v?.zellen) eigene.set(name, v);
    }
    geaendert();
    if (panel.aktiv === REITER) panel.zeichne();
  };
  laden();
  aktionen.prefabsNeuLaden = laden; // nach „Backup wiederherstellen“
  aktionen.eigenePrefabs = () => [...eigene].map(([name, vorlage]) => ({ name, vorlage })); // KI-Aktion prefab (9.1)
  aktionen.prefabEintraege = () => prefabEintraege([...eingebautePrefabs(), ...[...eigene].map(([name, vorlage]) => ({ name, vorlage, eigen: true }))]);

  // Vorschaubilder (Cache je Vorlage-Objekt)
  const bilder = new WeakMap();
  let farben = null;
  aktionen.prefabVorschau = (vorlage) => {
    if (bilder.has(vorlage)) return bilder.get(vorlage);
    if (!farben) {
      farben = { kachel: new Map(), typ: new Map() };
      for (const e of katalog()) {
        if (e.art === 'kachel') farben.kachel.set(e.zeichen, e.farbe);
        else if (e.typ && e.farbe) farben.typ.set(e.typ, e.farbe);
      }
    }
    let url = '';
    try {
      const d = vorschauDaten(vorlage, (z) => farben.kachel.get(z), (t) => farben.typ.get(t) ?? '#d0b080');
      const s = Math.max(1, Math.floor(64 / Math.max(d.b, d.h)));
      const c = Object.assign(document.createElement('canvas'), { width: d.b * s, height: d.h * s });
      const ctx = c.getContext('2d');
      d.pixel.forEach((f, i) => {
        ctx.fillStyle = f;
        ctx.fillRect((i % d.b) * s, Math.floor(i / d.b) * s, s, s);
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      for (const r of d.rechtecke) {
        ctx.fillStyle = r.farbe;
        ctx.fillRect(r.x * s, r.y * s, Math.max(1, r.b * s), Math.max(1, r.h * s));
        ctx.strokeRect(r.x * s + 0.5, r.y * s + 0.5, Math.max(1, r.b * s - 1), Math.max(1, r.h * s - 1));
      }
      url = c.toDataURL('image/png');
    } catch {
      url = '';
    }
    bilder.set(vorlage, url);
    return url;
  };

  aktionen.prefabSpeichern = async () => {
    const r = aktionen.auswahlBereich();
    if (!r) return zustand.meldung('Erst einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
    const w = await formular('Als Prefab speichern', [{ name: 'name', label: 'Name', typ: 'text', wert: 'Mein Gebäude', pflicht: true }, { name: 'ordner', label: 'Ordner', typ: 'text', wert: '', hilfe: 'optional, z. B. Häuser' }], { text: `Bereich ${r.b} × ${r.h} ab ${r.x}|${r.y} – Kacheln, Objekte, Marker, Bauwerke und Räume kommen mit.` });
    if (!w) return;
    const vorlage = kopiere(zustand.karte, r, { name: w.name });
    if (w.ordner?.trim()) vorlage.ordner = w.ordner.trim();
    eigene.set(w.name, vorlage);
    await zustand.speicher.setze('prefabs', w.name, vorlage);
    zustand.meldung(`🏠 Prefab „${w.name}“ gespeichert`, 'ok');
    geaendert();
    layout.zeigeReiter('links', REITER);
  };
  aktionen.prefabs = () => layout.zeigeReiter('links', REITER);

  const bearbeiten = async (name) => {
    const v = eigene.get(name);
    const w = await formular('Prefab bearbeiten', [{ name: 'name', label: 'Name', typ: 'text', wert: name, pflicht: true }, { name: 'ordner', label: 'Ordner', typ: 'text', wert: v.ordner ?? '' }], { pruefe: (x) => (x.name !== name && eigene.has(x.name) ? 'Name schon vergeben' : null) });
    if (!w) return;
    const neu = { ...v, name: w.name };
    if (w.ordner?.trim()) neu.ordner = w.ordner.trim();
    else delete neu.ordner;
    if (w.name !== name) {
      eigene.delete(name);
      await zustand.speicher.loesche('prefabs', name);
    }
    eigene.set(w.name, neu);
    await zustand.speicher.setze('prefabs', w.name, neu);
    geaendert();
  };

  panel.registriere(REITER, () => {
    const el = panel.el;
    el.innerHTML = '<p class="leise">Vorlage antippen → hängt an der Maus (R dreht, Klick setzt) – oder auf die Karte ziehen. Eigene: Bereich markieren → Rechtsklick → „Als Prefab“.</p><input type="search" class="prefab-suche" placeholder="Prefabs suchen …" aria-label="Prefabs suchen">';
    const eingabe = el.querySelector('.prefab-suche');
    eingabe.value = suche;
    const liste = document.createElement('div');
    el.append(liste);
    const zeichneListe = () => {
      liste.replaceChildren();
      const gruppen = prefabOrdner(aktionen.prefabEintraege(), suche);
      if (!gruppen.length) liste.innerHTML = '<p class="leise">Nichts gefunden.</p>';
      for (const { ordner, eintraege } of gruppen) {
        liste.insertAdjacentHTML('beforeend', `<h4>📁 ${esc(ordner)} <span class="leise">${eintraege.length}</span></h4>`);
        for (const e of eintraege) {
          const { name, beschreibung, vorlage, eigen } = e;
          const div = document.createElement('div');
          div.className = 'knopfreihe prefab-eintrag';
          const bild = aktionen.prefabVorschau(vorlage);
          div.innerHTML = `<button class="akzent" draggable="true" data-prefab="${esc(e.id)}" title="${esc(beschreibung ?? '')}">${bild ? `<img class="vorschau" src="${bild}" alt="" style="width:40px;height:40px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">` : '🏠'} ${esc(name)} <span class="leise">${vorlage.b}×${vorlage.h}</span></button>`;
          const knopf = div.firstChild;
          knopf.addEventListener('click', () => {
            if (!zustand.karte) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
            aktionen.einfuegen(vorlage);
          });
          knopf.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('application/x-editor-asset', e.id));
          if (eigen) {
            const stift = Object.assign(document.createElement('button'), { textContent: '✎', title: 'Name/Ordner ändern' });
            stift.addEventListener('click', () => bearbeiten(name));
            const export_ = Object.assign(document.createElement('button'), { textContent: '⬇', title: 'Als Datei speichern' });
            export_.addEventListener('click', () => herunterladen(`${name.replace(/[^\w-]+/g, '_')}.prefab.json`, JSON.stringify(prefabDatei(name, vorlage))));
            const weg = Object.assign(document.createElement('button'), { textContent: '🗑', title: 'Löschen', className: 'gefahr' });
            weg.addEventListener('click', async () => {
              if (!(await bestaetigen('Prefab löschen', `„${esc(name)}“ löschen?`, { ok: 'Löschen', gefahr: true }))) return;
              eigene.delete(name);
              await zustand.speicher.loesche('prefabs', name);
              geaendert();
            });
            div.append(stift, export_, weg);
          }
          if (beschreibung) div.insertAdjacentHTML('beforeend', `<span class="leise">${esc(beschreibung)}</span>`);
          liste.append(div);
        }
      }
    };
    eingabe.addEventListener('input', () => {
      suche = eingabe.value;
      zeichneListe();
    });
    eingabe.addEventListener('keydown', (ev) => ev.stopPropagation());
    zeichneListe();
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
        geaendert();
        zustand.meldung(`Prefab „${name}“ geladen`, 'ok');
      } catch (e) {
        zustand.meldung(`Prefab-Datei: ${e.message}`, 'fehler');
      }
    });
    reihe.children[1].addEventListener('click', () => aktionen.prefabSpeichern());
    el.append(reihe);
  }, { gruppe: '🗺 Projekt', ereignisse: ['zone', 'vorlagen'], ohneKarte: true });
}
