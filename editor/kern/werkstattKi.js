import { ANIMATIONS_ARTEN, ACHSEN } from './animation.js';

/**
 * KI in der Modell-Werkstatt (Editor 2.0, Schritt 5.4) – umgebungsfrei (tests/werkstatt.test.js, Gemini gemockt).
 * Drei Aufgaben, jeweils strukturierte JSON-Antwort → streng geprüft → Werkstatt zeigt eine Vorschau → Übernehmen = 1 Undo-Schritt.
 *   farben     – Farbschema: Materialliste (+ optional Vorschaubild) → [{ material, farbe, rauheit?, metall? }]
 *   animation  – Animation vorschlagen: Knotenliste → [{ art, ziel, achse, dauer, staerke }] (kern/animation.js)
 *   textur     – Textur aus Text: Bildmodell (kern/gemini.frageGeminiBild) → Bild für das gewählte Material
 * Gesendet wird NUR das Modell (Name, Maße, Material-/Teil-/Knotennamen, Farben, ggf. Vorschaubild) – nie Karte oder Schlüssel.
 *   werkstattKontext(info) → Text („Das wird gesendet“) · baueWerkstattAnfrage(aufgabe, info, wunsch) → generateContent-Body
 *   leseFarbVorschlag(text, materialNamen) · leseAnimationsVorschlag(text, knotenNamen) · texturPrompt(info, wunsch)
 */
export const KI_AUFGABEN = Object.freeze({
  farben: '🎨 Farbschema vorschlagen',
  animation: '🎞 Animation vorschlagen',
  textur: '🖼 Textur aus Text (gewähltes Material)',
});

const SYSTEM = {
  farben:
    'Du bist Grafik-Assistent für ein Low-Poly-Survival-Spiel (Zombies, Stadtrand, Wald). Schlage ein stimmiges Farbschema für die Materialien eines 3D-Modells vor. ' +
    'Antworte NUR mit JSON: {"materialien":[{"material":"<Name genau wie gegeben>","farbe":"#rrggbb","rauheit":0..1,"metall":0..1}],"erklaerung":"<ein kurzer Satz auf Deutsch>"}. ' +
    'Nur Materialien aus der Liste, Farben realistisch und gut unterscheidbar.',
  animation:
    'Du bist Animations-Assistent für ein Low-Poly-Survival-Spiel. Schlage 1–3 einfache Schleifen-Animationen für ein 3D-Modell vor. ' +
    `Erlaubte Arten: ${Object.keys(ANIMATIONS_ARTEN).join(', ')}. Achsen: x, y (hoch), z. ` +
    'Antworte NUR mit JSON: {"animationen":[{"art":"<Art>","ziel":"<Knotenname genau wie gegeben>","achse":"x|y|z","dauer":<Sekunden>,"staerke":<Zahl: Grad bei drehen/pendeln, Meter bei wippen, Anteil 0..0.5 bei pulsieren/flackern>}],"erklaerung":"<ein kurzer Satz auf Deutsch>"}.',
};

const text = (w, max = 80) => String(w ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, max);

/** Was über das Modell gesendet wird (lesbar, auch für den Dialog „Das wird gesendet“) */
export function werkstattKontext({ name, masse, materialien = [], teile = [], knoten = [] }) {
  const z = [`Modell: ${text(name)}`];
  if (masse) z.push(`Maße: ${masse.b} × ${masse.h} m Grundfläche, ${masse.hoehe} m hoch`);
  z.push(`Materialien (${materialien.length}): ${materialien.map((m) => `${text(m.name)} = ${m.farbe}${m.textur ? ' (mit Textur)' : ''}`).join('; ') || '–'}`);
  z.push(`Teile (${teile.length}): ${teile.slice(0, 60).map((t) => text(t)).join(', ') || '–'}`);
  if (knoten.length) z.push(`Knoten für Animationen: ${knoten.slice(0, 80).map((k) => text(k)).join(', ')}`);
  return z.join('\n');
}

/** generateContent-Body. vorschau = PNG-Data-URL (nur farben) */
export function baueWerkstattAnfrage(aufgabe, info, wunsch = '', { vorschau = null } = {}) {
  if (!SYSTEM[aufgabe]) throw new Error(`Aufgabe „${aufgabe}“ braucht kein Textmodell`);
  const parts = [{ text: `${werkstattKontext(info)}\n\nWunsch des Nutzers: ${text(wunsch, 500) || '(keiner – mach einen guten Vorschlag)'}` }];
  const bild = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(vorschau ?? '');
  if (aufgabe === 'farben' && bild) parts.push({ inlineData: { mimeType: `image/${bild[1]}`, data: bild[2] } });
  return { systemInstruction: { parts: [{ text: SYSTEM[aufgabe] }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.8, responseMimeType: 'application/json' } };
}

/** JSON aus der Antwort (auch in ```json-Blöcken oder mit Text drumherum) */
export function leseJson(antwort) {
  const t = String(antwort ?? '').trim();
  const block = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1] ?? t;
  const start = block.search(/[[{]/);
  if (start < 0) throw new Error('Die KI hat kein JSON geschickt');
  try {
    return JSON.parse(block.slice(start, Math.max(block.lastIndexOf('}'), block.lastIndexOf(']')) + 1));
  } catch {
    throw new Error('Die KI-Antwort ist kein gültiges JSON');
  }
}

const zahl01 = (w) => (Number.isFinite(Number(w)) && w !== null && w !== '' ? Math.min(1, Math.max(0, Number(w))) : undefined);

/** → { vorschlaege: [{ material, farbe, rauheit?, metall? }], erklaerung, verworfen } (nur bekannte Materialien, gültige Farben) */
export function leseFarbVorschlag(antwort, materialNamen) {
  const j = leseJson(antwort);
  const liste = Array.isArray(j) ? j : Array.isArray(j.materialien) ? j.materialien : [];
  const bekannt = new Set(materialNamen);
  const vorschlaege = [];
  let verworfen = 0;
  for (const v of liste) {
    const farbe = String(v?.farbe ?? '').trim().toLowerCase();
    if (!bekannt.has(v?.material) || !/^#[0-9a-f]{6}$/.test(farbe) || vorschlaege.some((x) => x.material === v.material)) {
      verworfen++;
      continue;
    }
    const e = { material: v.material, farbe };
    const r = zahl01(v.rauheit);
    const m = zahl01(v.metall);
    if (r !== undefined) e.rauheit = r;
    if (m !== undefined) e.metall = m;
    vorschlaege.push(e);
  }
  if (!vorschlaege.length) throw new Error('Kein brauchbarer Farbvorschlag (Materialnamen passten nicht)');
  return { vorschlaege, erklaerung: text(j.erklaerung, 300), verworfen };
}

/** → { vorschlaege: [{ art, ziel, achse, dauer, staerke }], erklaerung, verworfen } (nur bekannte Arten/Knoten, Werte begrenzt) */
export function leseAnimationsVorschlag(antwort, knotenNamen) {
  const j = leseJson(antwort);
  const liste = Array.isArray(j) ? j : Array.isArray(j.animationen) ? j.animationen : [];
  const bekannt = new Set(knotenNamen);
  const grenzen = { drehen: [-1080, 1080], pendeln: [-120, 120], wippen: [-2, 2], pulsieren: [-0.5, 0.5], flackern: [0, 0.5] };
  const vorschlaege = [];
  let verworfen = 0;
  for (const v of liste.slice(0, 5)) {
    if (!ANIMATIONS_ARTEN[v?.art] || !bekannt.has(v?.ziel)) {
      verworfen++;
      continue;
    }
    const [lo, hi] = grenzen[v.art];
    const st = Number(v.staerke);
    vorschlaege.push({
      art: v.art,
      ziel: v.ziel,
      achse: ACHSEN.includes(v.achse) ? v.achse : 'y',
      dauer: Math.min(30, Math.max(0.2, Number(v.dauer) || 2)),
      staerke: Number.isFinite(st) ? Math.min(hi, Math.max(lo, st)) : ANIMATIONS_ARTEN[v.art].staerke,
    });
  }
  if (!vorschlaege.length) throw new Error('Kein brauchbarer Animationsvorschlag (Art oder Knoten unbekannt)');
  return { vorschlaege, erklaerung: text(j.erklaerung, 300), verworfen };
}

/** Prompt fürs Bildmodell: kachelbare, quadratische Textur ohne Schrift */
export function texturPrompt({ name, material }, wunsch) {
  return `Seamless tileable square texture for a low-poly survival game 3D model (${text(name)}, material "${text(material)}"). Style: ${text(wunsch, 300) || 'realistic, slightly worn'}. Flat, evenly lit, top-down, no text, no logos, no borders, no perspective.`;
}
