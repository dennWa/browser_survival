import { frageGemini, frageGeminiBild, BILD_MODELL } from '../kern/gemini.js';
import { KI_AUFGABEN, werkstattKontext, baueWerkstattAnfrage, leseFarbVorschlag, leseAnimationsVorschlag, texturPrompt } from '../kern/werkstattKi.js';
import { ANIMATIONS_ARTEN } from '../kern/animation.js';
import { ladeEinstellungen } from './geminiUi.js';
import { vorschauBild } from './modellImport.js';
import { dialog, esc, feldHtml, liesFelder } from './dialoge.js';

/**
 * 🤖 KI in der Modell-Werkstatt (Editor 2.0, Schritt 5.4). Schlüssel + Textmodell aus dem 🤖 Helfer (localStorage
 * `browserSurvival.editorGemini`, nie im Modell/Backup). Ablauf: Aufgabe + Wunsch wählen (Dialog zeigt „Das wird gesendet“) →
 * Gemini → Antwort streng prüfen (kern/werkstattKi.js) → w.probiere(): Vorschau in der Werkstatt → Übernehmen = 1 Undo-Schritt.
 *   farben    – Materialfarben/Rauheit/Metall (Text + kleines Vorschaubild 256 px)
 *   animation – 1–3 Schleifen-Animationen für Modell/Gelenke/Teile (Vorschau spielt die erste)
 *   textur    – Bildmodell (BILD_MODELL) erzeugt eine kachelbare Textur fürs gewählte Material
 */
export async function werkstattKi(w) {
  const e = ladeEinstellungen();
  if (!e.schluessel) return w.zustand.meldung('Kein Gemini-Schlüssel – im 🤖 Helfer (rechte Leiste) unter ⚙ eintragen', 'fehler');
  w.animwerk.stoppe();
  const mats = w.materialien().map((m, i) => ({ m, name: m.name || `Material ${i + 1}` }));
  const knoten = w.animwerk.knoten;
  const info = { name: w.alt.name, masse: w.alt.masse, materialien: mats.map(({ m, name }) => ({ name, farbe: m.color ? `#${m.color.getHexString()}` : '–', textur: !!m.map })), teile: w.teile.filter((t) => t.visible).map((t) => t.name), knoten: knoten.map((k) => k.name) };
  const material = w.texturwerk.material;
  const felder = [
    { name: 'aufgabe', label: 'Aufgabe', typ: 'auswahl', wert: 'farben', optionen: Object.entries(KI_AUFGABEN) },
    { name: 'wunsch', label: 'Wunsch', typ: 'text', wert: '', hilfe: 'z. B. „rostig und verlassen“, „winterlich“, „Windrad dreht sich langsam“, „moosiges Holz“' },
  ];
  const a = await dialog({
    titel: '🤖 KI-Vorschlag',
    html: `${felder.map(feldHtml).join('')}<p class="leise klein">Textur: für ${material ? `Material „${esc(material.name || 'Material')}“` : '<b>erst ein Material in der Liste wählen</b>'} · Bildmodell ${esc(BILD_MODELL)}. Ergebnis kommt als Vorschau – erst „Übernehmen“ ändert etwas.</p>
      <details><summary>Das wird gesendet (nur dieses Modell, keine Karte, kein Schlüssel)</summary><pre class="ki-gesendet">${esc(werkstattKontext(info))}\n+ Vorschaubild 256 px (nur Farbschema)</pre></details>`,
    knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Fragen', art: 'akzent', wert: (b) => liesFelder(b, felder) }],
  });
  if (!a) return;
  const wunsch = a.wunsch ?? '';
  try {
    w.zustand.meldung('🤖 Gemini denkt nach …');
    if (a.aufgabe === 'farben') {
      const anfrage = baueWerkstattAnfrage('farben', info, wunsch, { vorschau: vorschauBild(w.modell, 256) });
      const { text } = await frageGemini({ schluessel: e.schluessel, modell: e.modell, anfrage });
      const v = leseFarbVorschlag(text, mats.map((x) => x.name));
      const liste = v.vorschlaege.map((x) => `<li><span class="farbe-punkt" style="background:${x.farbe}"></span> ${esc(x.material)}: ${x.farbe}${x.rauheit !== undefined ? ` · Rauheit ${x.rauheit}` : ''}${x.metall !== undefined ? ` · Metall ${x.metall}` : ''}</li>`).join('');
      await w.probiere('🎨 Farbschema', `<p>${esc(v.erklaerung)}</p><ul class="ki-liste">${liste}</ul>${v.verworfen ? `<p class="leise">${v.verworfen} Vorschlag/Vorschläge verworfen (unbekanntes Material/Farbe).</p>` : ''}`, () => {
        for (const x of v.vorschlaege)
          for (const { m } of mats.filter((y) => y.name === x.material)) {
            m.color?.set(x.farbe);
            if (x.rauheit !== undefined && 'roughness' in m) m.roughness = x.rauheit;
            if (x.metall !== undefined && 'metalness' in m) m.metalness = x.metall;
          }
      });
    } else if (a.aufgabe === 'animation') {
      const anfrage = baueWerkstattAnfrage('animation', info, wunsch);
      const { text } = await frageGemini({ schluessel: e.schluessel, modell: e.modell, anfrage });
      const v = leseAnimationsVorschlag(text, info.knoten);
      const liste = v.vorschlaege.map((x) => `<li>${esc(ANIMATIONS_ARTEN[x.art].name)} · ${esc(x.ziel)} · Achse ${x.achse} · ${x.dauer} s · Stärke ${x.staerke}</li>`).join('');
      await w.probiere('🎞 Animation', `<p>${esc(v.erklaerung)}</p><ul class="ki-liste">${liste}</ul><p class="leise">Die erste läuft gerade als Vorschau.</p>`, () => {
        const clips = v.vorschlaege.map((x) => w.animwerk.erzeuge({ ...x, ziel: knoten.find((k) => k.name === x.ziel) }));
        w.animwerk.spiele(clips[0]);
      });
    } else {
      if (!material) return w.zustand.meldung('Erst ein Material in der Liste wählen (Textur aus Text gilt für ein Material)', 'fehler');
      const { daten } = await frageGeminiBild({ schluessel: e.schluessel, prompt: texturPrompt({ name: w.alt.name, material: material.name }, wunsch) });
      const bild = await createImageBitmap(await (await fetch(daten)).blob());
      await w.probiere('🖼 Textur aus Text', `<img class="ki-bild" src="${esc(daten)}" alt="Erzeugte Textur"><p class="leise">Für „${esc(material.name || 'Material')}“ – Teile ohne UV-Koordinaten zeigen keine Textur.</p>`, () => w.texturwerk.setzeTextur(material, bild));
    }
    w.zustand.meldung('🤖 fertig');
  } catch (f) {
    w.zustand.meldung(`🤖 ${f.message ?? f}`, 'fehler');
  }
}
