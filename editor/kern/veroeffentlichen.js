import { nachDefinition } from './format.js';

/**
 * Veröffentlichen = die Karte wird Spielcode: server/spiel/karten/<id>.js + Eintrag in KARTEN (kartenLader.js) – genau wie
 * `npm run karte:import`. Der Editor schreibt dabei NIE ins Repo (auch nicht auf Render): er erzeugt die Dateien zum
 * Herunterladen. Ins Repo kommen sie per Hand oder mit `npm run karte:editor -- <datei>` (werkzeuge/karten/editorImport.mjs).
 */
const IDENT = /^[a-zA-Z_$][\w$]*$/;

/** JS-Literal (einzeilig) im Stil der Kartendateien */
export function jsWert(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return `'${v.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(jsWert).join(', ')}]`;
  if (typeof v === 'object') {
    const teile = Object.entries(v)
      .filter(([, w]) => w !== undefined)
      .map(([k, w]) => `${IDENT.test(k) ? k : jsWert(k)}: ${jsWert(w)}`);
    return teile.length ? `{ ${teile.join(', ')} }` : '{}';
  }
  return 'undefined';
}

/** Objekt mit `blockiert: true` → `{ …, ...M }` wie in stadtrand.js */
function objektZeile(o) {
  const { blockiert, ...rest } = o;
  const text = jsWert(rest);
  return blockiert === true ? text.replace(/ \}$/, ', ...M }').replace(/^\{\}$/, '{ ...M }') : jsWert(o);
}

export function konstantenName(id) {
  return id.toUpperCase();
}

/** Kartendefinition → Quelltext von server/spiel/karten/<id>.js */
export function alsJsModul(definition, { quelle = 'Map-Editor (editor/)' } = {}) {
  const z = [
    '/**',
    ` * Zone "${definition.name}" – erstellt mit dem ${quelle}.`,
    ' * Bearbeiten: im Map-Editor öffnen (Öffnen → Zone aus dem Spiel), ändern, wieder veröffentlichen.',
    ' * Legende & Felder: siehe stadtrand.js und editor/LIESMICH.md (Erweiterungen: zombieSpawns, bauwerke, tierBereiche, einstellungen …).',
    ' */',
    'const M = { blockiert: true };',
    '',
    `export const ${konstantenName(definition.id)} = {`,
    `  id: ${jsWert(definition.id)},`,
    `  name: ${jsWert(definition.name)},`,
    '  kacheln: [',
    ...definition.kacheln.map((zeile) => `    ${jsWert(zeile)},`),
    '  ],',
    '  raeume: {',
    ...Object.entries(definition.raeume ?? {}).map(([k, r]) => `    ${k}: ${jsWert(r)},`),
    '  },',
    '  objekte: [',
    ...(definition.objekte ?? []).map((o) => `    ${objektZeile(o)},`),
    '  ],',
  ];
  const liste = (name) => definition[name]?.length && z.push(`  ${name}: [`, ...definition[name].map((e) => `    ${jsWert(e)},`), '  ],');
  liste('uebergaenge');
  if (definition.ankuenfte) z.push('  ankuenfte: {', ...Object.entries(definition.ankuenfte).map(([k, p]) => `    ${IDENT.test(k) ? k : jsWert(k)}: ${jsWert(p)},`), '  },');
  for (const name of ['zombieSpawns', 'bauwerke', 'tierBereiche', 'raumFlaechen']) liste(name);
  if (definition.einstellungen) z.push(`  einstellungen: ${jsWert(definition.einstellungen)},`);
  if (definition.musik) z.push(`  musik: ${jsWert(definition.musik)},`);
  if (definition.terrain) z.push('  terrain: {', '    hoehen: [', ...definition.terrain.hoehen.map((h) => `      ${jsWert(h)},`), '    ],', `    steil: ${jsWert(definition.terrain.steil)},`, '  },');
  if (definition.bemalung) z.push('  bemalung: {', ...Object.entries(definition.bemalung).map(([f, r]) => `    ${jsWert(f)}: ${jsWert(r)},`), '  },');
  for (const name of ['typen', 'texturen']) if (definition[name]) z.push(`  ${name}: {`, ...Object.entries(definition[name]).map(([k, t]) => `    ${IDENT.test(k) ? k : jsWert(k)}: ${jsWert(t)},`), '  },');
  z.push('};', '');
  return z.join('\n');
}

/** Zeilen, die in kartenLader.js ergänzt werden müssen (falls die Zone neu ist) */
export function ladeEintrag(id) {
  const n = konstantenName(id);
  return { importZeile: `import { ${n} } from './${id}.js';`, kartenZeile: `  ${id}: ${n},` };
}

export function veroeffentlichung(karte) {
  const definition = nachDefinition(karte);
  return { dateiname: `${definition.id}.js`, quelltext: alsJsModul(definition), ...ladeEintrag(definition.id), definition };
}
