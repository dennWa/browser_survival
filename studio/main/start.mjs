/**
 * Browser Survival Studio – Electron-Hauptprozess (`npm run studio`).
 *   Fenster          http://127.0.0.1:<port>/studio/ (dateiServer.mjs), Vorab-Skript vorab.cjs (window.studioNativ)
 *   IPC 'studio'     (aktion, daten) → Projekt-Dateien (projekt.mjs), Einstellungen, KI, Testlauf, Dialoge
 *   MCP              127.0.0.1:<mcpPort>/mcp (mcp.mjs) – Port/Token zusätzlich in <Spielordner>/.studio/mcp.json für die Brücke
 *   KI-Werkzeuge     laufen im Fenster: window.studioKi.fuehreAus(name, argumente, quelle) (studio/kern/kiAusfuehren.js)
 * Einstellungen: <userData>/einstellungen.json { spielordner, ki: { anbieter, modelle{}, schluessel{} (safeStorage) }, mcp: { port, token } }.
 */
import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Projekt } from './projekt.mjs';
import { erstelleDateiServer } from './dateiServer.mjs';
import { starteMcp } from './mcp.mjs';
import { KiAssistent, ANBIETER } from './ki.mjs';

const APP_WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MCP_STANDARD_PORT = 8766;

// Container/Root unter Linux: Chromium-Sandbox geht nicht als root
if (process.platform === 'linux' && process.getuid?.() === 0) app.commandLine.appendSwitch('no-sandbox');
app.setName('Browser Survival Studio');

const einstellungsDatei = () => path.join(app.getPath('userData'), 'einstellungen.json');
function leseEinstellungen() {
  try {
    return JSON.parse(readFileSync(einstellungsDatei(), 'utf8'));
  } catch {
    return {};
  }
}
function schreibeEinstellungen(e) {
  mkdirSync(path.dirname(einstellungsDatei()), { recursive: true });
  writeFileSync(einstellungsDatei(), JSON.stringify(e, null, 1));
}

let einstellungen = {};
let projekt = null;
let hauptFenster = null;
let basisUrl = '';
let mcp = null;
let assistent = null;

const verschluesseln = (t) => (safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(t).toString('base64')}` : `roh:${Buffer.from(t).toString('base64')}`);
const entschluesseln = (t) => {
  if (!t) return '';
  if (t.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(t.slice(4), 'base64'));
  if (t.startsWith('roh:')) return Buffer.from(t.slice(4), 'base64').toString('utf8');
  return '';
};

function oeffneProjekt(ordner) {
  projekt = new Projekt(ordner);
  return projekt;
}

/** KI-/MCP-Werkzeug im Fenster ausführen */
async function fuehreAus(name, argumente, quelle) {
  if (!hauptFenster || hauptFenster.isDestroyed()) return { ok: false, text: 'Studio-Fenster ist geschlossen' };
  const js = `window.studioKi ? window.studioKi.fuehreAus(${JSON.stringify(name)}, ${JSON.stringify(argumente ?? {})}, ${JSON.stringify(quelle)}) : ({ ok: false, text: 'Studio lädt noch – bitte gleich nochmal' })`;
  return hauptFenster.webContents.executeJavaScript(js, true);
}

function schreibeMcpDatei() {
  if (!projekt || !mcp) return;
  mkdirSync(projekt.pfad('.studio'), { recursive: true });
  writeFileSync(projekt.pfad('.studio', 'mcp.json'), JSON.stringify({ port: mcp.port, token: einstellungen.mcp.token, pid: process.pid }));
}

async function starteMcpServer() {
  einstellungen.mcp ??= {};
  einstellungen.mcp.token ??= randomBytes(18).toString('base64url');
  einstellungen.mcp.port ??= MCP_STANDARD_PORT;
  schreibeEinstellungen(einstellungen);
  const melde = () => hauptFenster?.webContents.send('mcp-aktivitaet', Date.now());
  try {
    mcp = await starteMcp({ port: einstellungen.mcp.port, token: einstellungen.mcp.token, fuehreAus, version: projekt?.info().version, beiAktivitaet: melde });
  } catch {
    mcp = await starteMcp({ port: 0, token: einstellungen.mcp.token, fuehreAus, version: projekt?.info().version, beiAktivitaet: melde }); // Port belegt → freien nehmen
  }
  schreibeMcpDatei();
}

function mcpInfo() {
  const url = mcp ? `http://127.0.0.1:${mcp.port}/mcp` : null;
  const bruecke = path.join(APP_WURZEL, 'studio', 'mcp-bruecke.mjs');
  return {
    aktiv: !!mcp,
    url,
    token: einstellungen.mcp?.token,
    claudeCode: url ? `claude mcp add --transport http browser-survival-studio ${url} --header "Authorization: Bearer ${einstellungen.mcp.token}"` : '',
    claudeDesktop: JSON.stringify({ mcpServers: { 'browser-survival-studio': { command: 'node', args: [bruecke] } } }, null, 2),
  };
}

function kiInfo() {
  const ki = einstellungen.ki ?? {};
  return {
    anbieter: ki.anbieter ?? 'claude',
    liste: Object.entries(ANBIETER).map(([id, a]) => ({ id, name: a.name, standardModell: a.modell, modell: ki.modelle?.[id] ?? a.modell, hatSchluessel: !!ki.schluessel?.[id] })),
  };
}

function testFenster(pfad) {
  const f = new BrowserWindow({ width: 1280, height: 800, title: 'Browser Survival – Testlauf', backgroundColor: '#0d0f12', autoHideMenuBar: true, webPreferences: { sandbox: true } });
  f.removeMenu();
  f.webContents.on('will-navigate', (e, url) => {
    if (url.includes('/editor/')) {
      e.preventDefault(); // „Zurück zum Editor“ im Test-Banner → Fenster schließen
      f.close();
    }
  });
  f.loadURL(`${basisUrl}${pfad}`);
  return true;
}

const AKTIONEN = {
  'projekt.info': () => ({ ...projekt.info(), basisUrl, appWurzel: APP_WURZEL }),
  'projekt.zonen': () => projekt.zonen(),
  'projekt.definition': ({ id }) => projekt.definition(id),
  'projekt.ladeEntwurf': ({ id }) => projekt.ladeEntwurf(id),
  'projekt.speichereEntwurf': ({ id, inhalt }) => projekt.speichereEntwurf(id, inhalt),
  'projekt.loescheEntwurf': ({ id }) => projekt.loescheEntwurf(id),
  'projekt.insSpiel': ({ definition }) => projekt.insSpiel(definition),
  'projekt.vorlagen': () => projekt.vorlagen(),
  'projekt.studioDaten': () => projekt.studioDaten(),
  'projekt.speichereStudioDaten': async ({ daten }) => {
    projekt.speichereStudioDaten(daten);
    return projekt.aktualisiereKiAnleitung();
  },
  'projekt.versionen': ({ id }) => projekt.versionen(id),
  'projekt.speichereVersionen': ({ id, liste }) => projekt.speichereVersionen(id, liste),
  'projekt.speichereVorlage': ({ vorlage }) => projekt.speichereVorlage(vorlage),
  'projekt.loescheVorlage': ({ id }) => projekt.loescheVorlage(id),
  'projekt.modellIndex': () => projekt.modellIndex(),
  'projekt.credits': () => projekt.credits(),
  'projekt.importiereModell': async ({ bytes, meta }) => {
    const e = projekt.importiereModell({ bytes }, meta);
    await projekt.aktualisiereKiAnleitung();
    return e;
  },
  'modell.einstellen': async ({ datei, felder }) => projekt.einstellenModell(datei, felder),
  'modell.speichern': async (d) => {
    const r = projekt.speichereModell(d);
    await projekt.aktualisiereKiAnleitung();
    return r;
  },
  'modell.sicherungen': ({ stem }) => projekt.modellSicherungen(stem),
  'modell.wiederherstellen': ({ stem, sicherung }) => projekt.stelleModellWiederHer(stem, sicherung),
  'audio.schreiben': (d) => projekt.schreibeAudio(d),
  'audio.kopieren': (d) => projekt.kopiereAudio(d),
  'audio.loeschen': (d) => projekt.loescheAudio(d),
  'audio.einstellungen': (d) => projekt.speichereAudioEinstellungen(d),
  'projekt.klangDateien': () => projekt.klangDateien(),
  'projekt.klangFuerZone': ({ quelle, zone }) => projekt.klangFuerZone(quelle, zone),
  'projekt.importiereKlang': ({ bytes, meta }) => projekt.importiereKlang(bytes, meta),
  'projekt.ordnerZeigen': () => shell.openPath(projekt.wurzel),
  'projekt.ordnerWaehlen': async () => {
    const r = await dialog.showOpenDialog(hauptFenster, { title: 'Spielordner wählen (enthält server/spiel/karten)', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    oeffneProjekt(r.filePaths[0]); // wirft, wenn es kein Spielordner ist
    einstellungen.spielordner = projekt.wurzel;
    schreibeEinstellungen(einstellungen);
    schreibeMcpDatei();
    return projekt.info();
  },
  'test.starten': ({ pfad }) => testFenster(pfad),
  'ki.info': () => kiInfo(),
  'ki.einstellen': ({ anbieter, modell, schluessel }) => {
    if (!ANBIETER[anbieter]) throw new Error('Unbekannter Anbieter');
    einstellungen.ki ??= {};
    einstellungen.ki.anbieter = anbieter;
    einstellungen.ki.modelle ??= {};
    if (modell !== undefined) einstellungen.ki.modelle[anbieter] = String(modell).trim() || ANBIETER[anbieter].modell;
    einstellungen.ki.schluessel ??= {};
    if (schluessel === null) delete einstellungen.ki.schluessel[anbieter];
    else if (schluessel) einstellungen.ki.schluessel[anbieter] = verschluesseln(String(schluessel).trim());
    schreibeEinstellungen(einstellungen);
    assistent = null; // neues Gespräch mit neuen Werten
    return kiInfo();
  },
  'ki.senden': async ({ text }) => {
    const ki = einstellungen.ki ?? {};
    const anbieter = ki.anbieter ?? 'claude';
    if (!assistent || assistent.anbieter !== anbieter) {
      assistent = new KiAssistent({ anbieter, modell: ki.modelle?.[anbieter], schluessel: entschluesseln(ki.schluessel?.[anbieter]), fuehreAus, beiEreignis: (e) => hauptFenster?.webContents.send('ki-ereignis', e) });
    }
    return assistent.senden(text);
  },
  'ki.abbrechen': () => {
    if (assistent) assistent.abbrechen = true;
    return true;
  },
  'ki.neu': () => {
    assistent = null;
    return true;
  },
  'mcp.info': () => mcpInfo(),
  'link.oeffnen': ({ url }) => /^https:\/\//.test(url) && shell.openExternal(url),
};

ipcMain.handle('studio', async (_e, aktion, daten = {}) => {
  const f = AKTIONEN[aktion];
  if (!f) throw new Error(`Unbekannte Aktion „${aktion}“`);
  return f(daten);
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (hauptFenster) {
    if (hauptFenster.isMinimized()) hauptFenster.restore();
    hauptFenster.focus();
  }
});

app.whenReady().then(async () => {
  einstellungen = leseEinstellungen();
  const ordner = process.env.STUDIO_SPIELORDNER || (einstellungen.spielordner && existsSync(einstellungen.spielordner) ? einstellungen.spielordner : APP_WURZEL);
  try {
    oeffneProjekt(ordner);
  } catch {
    oeffneProjekt(APP_WURZEL);
  }
  const server = erstelleDateiServer({ appWurzel: APP_WURZEL, spielWurzel: () => projekt.wurzel });
  await new Promise((ok) => server.listen(Number(process.env.STUDIO_PORT) || 0, '127.0.0.1', ok));
  basisUrl = `http://127.0.0.1:${server.address().port}`;
  if (process.env.STUDIO_OHNE_MCP !== '1') await starteMcpServer();

  Menu.setApplicationMenu(null); // eigene Menüleiste im Fenster
  hauptFenster = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    title: 'Browser Survival Studio',
    backgroundColor: '#14161a',
    show: false,
    webPreferences: { preload: path.join(APP_WURZEL, 'studio/main/vorab.cjs'), sandbox: true, contextIsolation: true },
  });
  hauptFenster.once('ready-to-show', () => hauptFenster.show());
  hauptFenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  hauptFenster.loadURL(`${basisUrl}/studio/`);
  hauptFenster.on('closed', () => (hauptFenster = null));
});

app.on('window-all-closed', () => app.quit());
