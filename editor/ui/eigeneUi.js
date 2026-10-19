import { KATEGORIEN, objektInfo, katalog } from '../kern/katalog.js';
import { formular, dialog, esc, feldHtml, liesFelder } from './dialoge.js';
import { dateiWaehlen, herunterladen } from './speicher.js';
import { verkleinereBild } from './bild3d.js';

/**
 * Eigene Objekte & Grafik (Phase 10, Phase 3 von Editor 2.0):
 *   • Neues Objekt anlegen (Name, Größe, Kollision, Ebene, Kategorie, Farbe, 3D-Höhe) → Sammlung `typen` der Karte,
 *     erscheint in der Bauleiste seiner Kategorie. Im Spiel: Platzhalter-Quader, bis eine Grafik per Pipeline kommt.
 *   • 3D-Modelle: seit Phase 3 über die Projekt-Bibliothek (ui/modelleUi.js, Reiter „📦 Modelle“); `modell3d` leitet dorthin.
 *   • Ausgeblendet seit Schritt 3.2 (Nutzer-Wunsch „nur 3D-Formate“, Code bleibt, Aufruf nur noch über aktionen.*):
 *     Bild → 3D (Billboard/Extrusion, `aktionen.bild3d`) und Neue Grafik (Antrag `<id>.grafik.json` für
 *     werkzeuge/assets/editor_grafiken/ → baue_assets.py, Lizenz CC0/CC-BY Pflicht, `aktionen.grafik`). Vorhandene Bild-Typen
 *     werden weiter angezeigt.
 *   • Farbe/Textur je Objekttyp (Sammlung `texturen`) – pro Objekt geht es im Eigenschaften-Panel.
 */
const ID_MUSTER = /^[a-z0-9_]{1,40}$/;
const LIZENZEN = [['', '– bitte wählen (Pflicht) –'], ['CC0', 'CC0 (gemeinfrei)'], ['CC-BY 4.0', 'CC-BY 4.0 (Namensnennung)'], ['CC-BY 3.0', 'CC-BY 3.0 (Namensnennung)']];
const MUSTER = [['', '– keins –'], ['holz', 'Holz'], ['stein', 'Stein'], ['metall', 'Metall'], ['stoff', 'Stoff'], ['gras', 'Gras'], ['streifen', 'Streifen'], ['punkte', 'Punkte']];
// .glb wird als Base64 (Data-URL, ~4/3 der Dateigröße) in der Karte gespeichert → Obergrenze in Zeichen
const MODELL_MAX_MB = 8;
const MODELL_MAX_ZEICHEN = Math.ceil(MODELL_MAX_MB * 1024 * 1024 * 1.4);

export function eigeneUi({ zustand, aktionen }) {
  const typFelder = (t = {}, id = '') => [
    { name: 'id', label: 'Typ-ID', typ: 'text', wert: id, pflicht: true, hilfe: 'a–z, 0–9, _ (so heißt der Typ in der Karte)' },
    { name: 'name', label: 'Name', typ: 'text', wert: t.name ?? '', pflicht: true },
    { name: 'kategorie', label: 'Kategorie', typ: 'auswahl', wert: t.kategorie ?? 'Eigene', optionen: KATEGORIEN.map((k) => [k, k]) },
    { name: 'b', label: 'Breite (Kacheln)', typ: 'zahl', wert: t.b ?? 1, min: 0.1, schritt: 0.1, pflicht: true },
    { name: 'h', label: 'Tiefe (Kacheln)', typ: 'zahl', wert: t.h ?? 1, min: 0.1, schritt: 0.1, pflicht: true },
    { name: 'hoehe3d', label: '3D-Höhe (m)', typ: 'zahl', wert: t.hoehe3d ?? 0.8, min: 0.05, schritt: 0.05 },
    { name: 'blockiert', label: 'Kollision', typ: 'haken', wert: t.blockiert ?? true },
    { name: 'ebene', label: 'Ebene', typ: 'auswahl', wert: t.ebene ?? '', optionen: [['', 'Möbel'], ['boden', 'Boden (flach)'], ['oben', 'Oben (Krone)']] },
    { name: 'farbe', label: 'Farbe', typ: 'farbe', wert: t.farbe ?? '#c080ff' },
  ];
  const speichereTyp = (w, alt = {}) => {
    const typ = { ...alt, name: w.name, kategorie: w.kategorie, b: w.b, h: w.h, hoehe3d: w.hoehe3d ?? 0.8, blockiert: !!w.blockiert, farbe: w.farbe };
    if (w.ebene) typ.ebene = w.ebene;
    else delete typ.ebene;
    zustand.ausfuehren(`Objekttyp „${w.id}“`, [{ s: 'typen', k: w.id, neu: typ }]);
    aktionen.waehleKatalog(`eigen:${w.id}`);
    zustand.meldung(`Objekt „${w.name}“ angelegt – steht in der Bauleiste (${w.kategorie}). Im Spiel: Platzhalter, bis eine Grafik per Pipeline kommt.`, 'ok');
  };
  const pruefeId = (neu) => (v) => (!ID_MUSTER.test(v.id) ? 'Typ-ID: nur a–z, 0–9, _' : neu && (zustand.karte.s('typen').has(v.id) || katalog().some((e) => e.typ === v.id)) ? 'Typ-ID gibt es schon' : !(v.b > 0 && v.h > 0) ? 'Größe muss > 0 sein' : null);

  aktionen.neuerTyp = async () => {
    if (!zustand.karte) return;
    const w = await formular('✚ Neues Objekt anlegen', typFelder(), { okText: 'Anlegen', pruefe: pruefeId(true), text: 'Ein neuer Objekttyp für diese Karte – im Spiel ein farbiger Quader. Für ein echtes 3D-Modell: 📦 Modelle (Datei hochladen).' });
    if (w) speichereTyp(w);
  };

  aktionen.typBearbeiten = async (id) => {
    const t = zustand.karte.s('typen').get(id);
    if (!t) return;
    const felder = typFelder(t, id).map((f) => (f.name === 'id' ? { ...f, hilfe: 'kann nicht geändert werden' } : f));
    const w = await formular(`✎ Objekttyp „${id}“`, felder, { okText: 'Speichern' });
    if (w) speichereTyp({ ...w, id }, t);
  };

  aktionen.bild3d = async () => {
    if (!zustand.karte) return;
    const datei = await dateiWaehlen('image/png,image/webp,image/gif,image/jpeg', true);
    if (!datei) return;
    let bild;
    try {
      bild = await verkleinereBild(datei.text, 64);
    } catch {
      return zustand.meldung('Bild nicht lesbar', 'fehler');
    }
    const vorschlag = datei.name.toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9_]+/g, '_').slice(0, 40) || 'bild';
    const felder = [
      ...typFelder({ name: datei.name.replace(/\.[a-z]+$/i, ''), hoehe3d: 1.5 }, vorschlag),
      { name: 'modus', label: 'Umwandlung', typ: 'auswahl', wert: 'extrusion', optionen: [['extrusion', 'Extrusion (Alpha-Maske → Pixel-Körper)'], ['billboard', 'Billboard (Bild zeigt zur Kamera)']] },
      { name: 'tiefe', label: 'Tiefe Extrusion (m)', typ: 'zahl', wert: 0.3, min: 0.05, schritt: 0.05 },
    ];
    const w = await formular('🖼 Bild → 3D-Objekt', felder, {
      okText: 'Umwandeln',
      pruefe: pruefeId(true),
      text: `<img src="${esc(bild)}" style="max-height:80px;image-rendering:pixelated;background:#333;border-radius:4px"><br>Erster Schritt: einfache Umwandlung. <label><input type="radio" disabled> 🤖 KI-Umwandlung (später, optional – noch nicht eingebaut)</label>`,
    });
    if (!w) return;
    speichereTyp(w, { bild, modus: w.modus, tiefe: w.tiefe ?? 0.3 });
  };

  // Alt (vor Phase 3): .glb als Data-URL direkt in den Typ. Neu: Projekt-Bibliothek – der alte Weg bleibt nur als Rückfall.
  aktionen.modell3d = () => (aktionen.modellHochladen ? aktionen.modellHochladen() : alterModellDialog());
  const alterModellDialog = async () => {
    if (!zustand.karte) return;
    const datei = await dateiWaehlen('.glb,model/gltf-binary', true);
    if (!datei) return;
    if (!datei.name.toLowerCase().endsWith('.glb')) return zustand.meldung('Nur .glb-Dateien (binäres glTF) werden unterstützt', 'fehler');
    if (datei.text.length > MODELL_MAX_ZEICHEN) return zustand.meldung(`Modell zu groß (max. ${MODELL_MAX_MB} MB, sonst wird die Karte unhandlich)`, 'fehler');
    const vorschlag = datei.name.replace(/\.glb$/i, '').replace(/[^a-z0-9_]+/gi, '_').toLowerCase().slice(0, 40) || 'modell';
    const felder = [
      ...typFelder({ name: datei.name.replace(/\.glb$/i, ''), kategorie: 'Eigene' }, vorschlag),
      { name: 'urheber', label: 'Urheber (optional)', typ: 'text', wert: '', hilfe: 'Nur angeben, wenn eine Lizenz existiert (wird mit dem Modell abgelegt)' },
      { name: 'lizenz', label: 'Lizenz (optional)', typ: 'text', wert: '', hilfe: 'z. B. CC0 oder CC-BY 4.0' },
    ];
    const w = await formular('🧊 3D-Modell anlegen', felder, {
      okText: 'Anlegen',
      pruefe: pruefeId(true),
      text: 'Keine Lizenzprüfung – die Rechte am Modell liegen bei dir. Beim Veröffentlichen landet die Datei unter client/assets/eigene/ und erscheint im Spiel auf Fußabdruck × 3D-Höhe.',
    });
    // Browser liefern für .glb oft keinen MIME-Typ (→ octet-stream); der Server nimmt nur model/gltf-binary an
    const glb = datei.text.replace(/^data:[^,]*,/, 'data:model/gltf-binary;base64,');
    if (w) speichereTyp(w, { glb, ...(w.urheber ? { urheber: w.urheber } : {}), ...(w.lizenz ? { lizenz: w.lizenz } : {}) });
    // Nur Hinweis, kein Stopp: Aus dem Internet stammende Modelle brauchen eine Lizenzangabe (landet in client/assets/eigene/LIZENZEN.md)
    if (w && !w.lizenz) zustand.meldung('Keine Lizenz angegeben – bitte vor dem Veröffentlichen prüfen, ob du das Modell nutzen darfst', 'fehler');
  };

  aktionen.grafik = async () => {
    const eigeneMitBild = zustand.karte ? [...zustand.karte.s('typen')].filter(([, t]) => t.bild) : [];
    const felder = [
      { name: 'id', label: 'Grafik-ID', typ: 'text', wert: eigeneMitBild[0]?.[0] ?? '', pflicht: true, hilfe: 'Objekttyp bzw. Item-ID, die die Grafik bekommt' },
      { name: 'name', label: 'Name / Paket', typ: 'text', wert: eigeneMitBild[0]?.[1].name ?? '', pflicht: true },
      { name: 'art', label: 'Art', typ: 'auswahl', wert: 'objekt', optionen: [['objekt', 'Objekt (Draufsicht, Möbel-Atlas)'], ['item', 'Item-Icon']] },
      { name: 'b', label: 'Breite (Kacheln)', typ: 'zahl', wert: eigeneMitBild[0]?.[1].b ?? 1, min: 0.1, schritt: 0.1 },
      { name: 'h', label: 'Tiefe (Kacheln)', typ: 'zahl', wert: eigeneMitBild[0]?.[1].h ?? 1, min: 0.1, schritt: 0.1 },
      { name: 'lizenz', label: 'Lizenz', typ: 'auswahl', wert: '', optionen: LIZENZEN, pflicht: true, hilfe: 'Pflicht: nur CC0 oder CC-BY (Projektregel)' },
      { name: 'urheber', label: 'Urheber', typ: 'text', wert: '', pflicht: true, hilfe: 'erscheint bei CC-BY in den Credits' },
      { name: 'quelle', label: 'Quelle (URL)', typ: 'text', wert: '', pflicht: true },
      { name: 'zweck', label: 'Verwendet für', typ: 'text', wert: '' },
      { name: 'bildQuelle', label: 'Bild', typ: 'auswahl', wert: eigeneMitBild.length ? 'typ' : 'datei', optionen: [...(eigeneMitBild.length ? [['typ', 'Bild des eigenen Typs (Bild → 3D)']] : []), ['datei', 'Datei hochladen …']] },
    ];
    const w = await formular('🎨 Neue Grafik (Antrag für die Pipeline)', felder, {
      okText: 'Antrag erstellen',
      text: 'Der Editor legt Grafiken nicht selbst ins Spiel (Projektregel 6). Er erzeugt eine Datei <code>&lt;id&gt;.grafik.json</code> für <code>werkzeuge/assets/editor_grafiken/</code>; dann <code>python3 werkzeuge/assets/baue_assets.py</code> und <code>npm run assets:3d</code>. Die Lizenz wird dort nochmals geprüft und in die Credits übernommen.',
      pruefe: (v) => (!ID_MUSTER.test(v.id) ? 'ID: nur a–z, 0–9, _' : !v.lizenz ? 'Lizenz ist Pflicht' : !/^https?:\/\//.test(v.quelle) ? 'Quelle muss eine URL sein' : null),
    });
    if (!w) return;
    let bild = w.bildQuelle === 'typ' ? zustand.karte.s('typen').get(eigeneMitBild.find(([id]) => id === w.id)?.[0] ?? eigeneMitBild[0][0])?.bild : null;
    if (!bild) {
      const d = await dateiWaehlen('image/png,image/webp', true);
      if (!d) return;
      bild = await verkleinereBild(d.text, 256);
    }
    const antrag = { format: 'browser-survival-grafik', formatVersion: 1, id: w.id, name: w.name, art: w.art, lizenz: w.lizenz, urheber: w.urheber, quelle: w.quelle, zweck: w.zweck || `Map-Editor: ${w.id}`, b: w.b, h: w.h, bild };
    herunterladen(`${w.id}.grafik.json`, JSON.stringify(antrag, null, 1));
    dialog({ titel: 'Antrag erstellt', html: `<p><code>${esc(w.id)}.grafik.json</code> wurde heruntergeladen.</p><ol><li>nach <code>werkzeuge/assets/editor_grafiken/</code> legen</li><li><code>python3 werkzeuge/assets/baue_assets.py</code> (prüft Lizenz, packt Atlas, Credits)</li><li><code>npm run assets:3d</code>, <code>npm test</code>, committen</li></ol>` });
  };

  aktionen.texturen = async () => {
    const k = zustand.karte;
    if (!k) return;
    const typen = [...new Set([...[...k.s('objekte').values()].map((o) => o.typ), ...k.s('texturen').keys()])].sort();
    if (!typen.length) return zustand.meldung('Noch keine Objekte in der Zone', 'fehler');
    const html = `<p class="leise">Farbe und Muster gelten für alle Objekte des Typs (2D + 3D). Einzelne Objekte: Eigenschaften-Panel (Farbe/Textur). Leer = Standard.</p>${typen
      .map((t) => {
        const tx = k.s('texturen').get(t) ?? {};
        return `<div class="feld" style="grid-template-columns:150px 60px 1fr 60px"><span>${esc(objektInfo(t, k).name)}</span>${feldHtml({ name: `f_${t}`, typ: 'farbe', wert: tx.farbe ?? objektInfo(t, k).farbe }).replace(/<label class="feld"><span>[^<]*<\/span>|<\/label>/g, '')}${feldHtml({ name: `m_${t}`, typ: 'auswahl', wert: tx.muster ?? '', optionen: MUSTER }).replace(/<label class="feld"><span>[^<]*<\/span>|<\/label>/g, '')}<label><input type="checkbox" name="a_${t}" ${k.s('texturen').has(t) ? 'checked' : ''}> an</label></div>`;
      })
      .join('')}`;
    const w = await dialog({
      titel: '🎨 Farbe/Textur je Objekttyp',
      html,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Übernehmen', art: 'akzent', wert: (b) => liesFelder(b, typen.flatMap((t) => [{ name: `f_${t}`, typ: 'farbe' }, { name: `m_${t}`, typ: 'auswahl' }, { name: `a_${t}`, typ: 'haken' }])) }],
      beiOeffnen: (b) => b.querySelectorAll('input[type=color],select').forEach((el) => el.addEventListener('change', () => (b.querySelector(`[name="a_${el.name.slice(2)}"]`).checked = true))),
    });
    if (!w) return;
    const ops = typen.map((t) => ({ s: 'texturen', k: t, neu: w[`a_${t}`] ? { farbe: w[`f_${t}`], ...(w[`m_${t}`] ? { muster: w[`m_${t}`] } : {}) } : null }));
    zustand.ausfuehren('Farbe/Textur je Typ', ops);
  };
}
