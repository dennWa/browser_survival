/**
 * Ein-Klick-Veröffentlichen (Studio Phase 4.6, Hauptprozess): Änderungen im Spielordner → Tests → Commit → Push.
 * GitHub Pages liefert `main` aus (CLAUDE.md Regel 9) – nach dem Push ist das Spiel in ein paar Minuten online.
 *   status(wurzel)              → { zweig, aenderungen: [{ datei, art }], voraus (Commits nicht gepusht, null = kein Upstream), vorschlag, gitDa }
 *   tests(wurzel)               → { ok, ausgabe }  (`node --test "tests/**\/*.test.js"`, wie `npm test`)
 *   veroeffentliche(wurzel, { nachricht }) → { ok, schritte: [{ name, ok, ausgabe }], commit? }
 *     add -A → commit → pull --rebase --autostash → push. Bricht beim ersten Fehler ab (nichts halb Gepushtes).
 * git/node laufen als Kindprozesse (execFile, keine Shell). Zugangsdaten: wie im Terminal (Git Credential Manager / SSH).
 */
import { execFile } from 'node:child_process';

const lauf = (befehl, args, wurzel, { env = {}, timeout = 240_000 } = {}) => {
  const umgebung = { ...process.env, ...env };
  delete umgebung.NODE_TEST_CONTEXT; // sonst meldet ein verschachteltes `node --test` an den Eltern-Runner statt per Exit-Code
  return new Promise((ok) => execFile(befehl, args, { cwd: wurzel, timeout, maxBuffer: 20 * 1024 * 1024, env: umgebung }, (fehler, stdout, stderr) => ok({ ok: !fehler, ausgabe: `${stdout}${stderr}`.trim(), code: fehler?.code ?? 0 })));
};

const ARTEN = { M: 'geändert', A: 'neu', D: 'gelöscht', R: 'umbenannt', '?': 'neu' };

/** Commit-Nachricht aus den geänderten Dateien vorschlagen */
export function nachrichtVorschlag(aenderungen) {
  const bereiche = new Set();
  for (const { datei } of aenderungen) {
    if (datei.startsWith('server/spiel/karten/')) bereiche.add('Zonen');
    else if (datei.startsWith('client/assets/eigene/')) bereiche.add('Modelle');
    else if (datei.startsWith('client/audio/') || datei.startsWith('client/musik/')) bereiche.add('Audio');
    else if (datei.includes('studioDaten')) bereiche.add('Items');
    else if (datei.startsWith('studio/vorlagen/')) bereiche.add('Vorlagen');
    else bereiche.add('Sonstiges');
  }
  return `Studio: ${[...bereiche].join(', ') || 'Änderungen'} aktualisiert`;
}

export async function status(wurzel) {
  const v = await lauf('git', ['--version'], wurzel);
  if (!v.ok) return { gitDa: false, aenderungen: [], zweig: null, voraus: null, vorschlag: '' };
  const zweig = (await lauf('git', ['rev-parse', '--abbrev-ref', 'HEAD'], wurzel)).ausgabe;
  const s = await lauf('git', ['status', '--porcelain', '-uall'], wurzel);
  const aenderungen = s.ausgabe
    .split('\n')
    .filter(Boolean)
    .map((z) => ({ art: ARTEN[z.trim()[0]] ?? z.slice(0, 2).trim(), datei: z.slice(3).replace(/^"|"$/g, '') }));
  const v2 = await lauf('git', ['rev-list', '--count', '@{u}..HEAD'], wurzel);
  const voraus = v2.ok ? Number(v2.ausgabe) || 0 : null;
  return { gitDa: true, zweig, aenderungen, voraus, vorschlag: nachrichtVorschlag(aenderungen) };
}

export function tests(wurzel) {
  return lauf(process.execPath, ['--test', 'tests/**/*.test.js'], wurzel, { env: { ELECTRON_RUN_AS_NODE: '1' }, timeout: 600_000 });
}

export async function veroeffentliche(wurzel, { nachricht }) {
  const text = String(nachricht ?? '').trim();
  if (!text) throw new Error('Commit-Nachricht fehlt');
  const schritte = [];
  const schritt = async (name, befehl, args, opts) => {
    const r = await lauf(befehl, args, wurzel, opts);
    schritte.push({ name, ok: r.ok, ausgabe: r.ausgabe.slice(-4000) });
    return r.ok;
  };
  if (!(await schritt('Tests (npm test)', process.execPath, ['--test', 'tests/**/*.test.js'], { env: { ELECTRON_RUN_AS_NODE: '1' }, timeout: 600_000 }))) return { ok: false, schritte };
  if (!(await schritt('Dateien vormerken', 'git', ['add', '-A']))) return { ok: false, schritte };
  const leer = (await lauf('git', ['diff', '--cached', '--quiet'], wurzel)).ok;
  if (!leer && !(await schritt('Commit', 'git', ['commit', '-m', text]))) return { ok: false, schritte };
  const zweig = (await lauf('git', ['rev-parse', '--abbrev-ref', 'HEAD'], wurzel)).ausgabe;
  if (!(await schritt('Neuesten Stand holen', 'git', ['pull', '--rebase', '--autostash', 'origin', zweig]))) {
    await lauf('git', ['rebase', '--abort'], wurzel);
    schritte.at(-1).ausgabe += '\n→ Konflikt: Rebase abgebrochen, dein Commit ist lokal gespeichert. Bitte im Terminal klären.';
    return { ok: false, schritte };
  }
  if (!(await schritt('Hochladen (push)', 'git', ['push', 'origin', `HEAD:${zweig}`]))) return { ok: false, schritte };
  const commit = (await lauf('git', ['log', '-1', '--format=%h %s'], wurzel)).ausgabe;
  return { ok: true, schritte, commit, zweig };
}
