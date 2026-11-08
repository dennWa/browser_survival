/**
 * Runde 46: Grafik-Details & Energiesparen (client/darstellung/grafikEinstellungen.js, client/kern/spielSchleife.js,
 * Licht-Sätze im Renderer). Gemessen: Lichter mit Stärke 0 kosteten tagsüber ≈ 40 % der Bildzeit (sie stehen trotzdem im Shader);
 * der Silhouetten-Durchgang ließ den Licht-Zustand jedes Bild kippen (Programm-Neusuche je Material).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AKKU_FPS,
  GRAFIK_DETAILS,
  GRAFIK_DETAILS_SCHLUESSEL,
  RUHE_FPS,
  SCHATTEN_WAHL,
  angepassteDetails,
  beobachteAkku,
  bildrateGrenze,
  detailsFuerProfil,
  ladeGrafikDetails,
  pruefeDetail,
  speichereGrafikDetails,
  standardDetails,
} from '../client/darstellung/grafikEinstellungen.js';
import { SpielSchleife } from '../client/kern/spielSchleife.js';

const lies = (datei) => readFileSync(new URL(`../${datei}`, import.meta.url), 'utf8');
function speicher(eintraege = {}) {
  const daten = { ...eintraege };
  return { daten, getItem: (k) => (k in daten ? daten[k] : null), setItem: (k, v) => (daten[k] = String(v)) };
}

test('Details: Standard, Speichern/Laden, ungültige Werte → Standard, Zahlen auch als Text', () => {
  const leer = speicher();
  assert.deepEqual(ladeGrafikDetails(leer), standardDetails());
  assert.equal(standardDetails().bildrate, 60, 'Standard bleibt 60 Bilder/s');
  assert.equal(standardDetails().akku, 'akku', 'Akku sparen greift standardmäßig nur im Akkubetrieb');
  for (const [name, d] of Object.entries(GRAFIK_DETAILS)) {
    assert.ok(d.optionen.some(([w]) => w === d.standard), `${name}: Standard ist eine Option`);
    assert.ok(d.name && d.hilfe, `${name}: Name + Hilfetext`);
  }
  const s = speicher();
  speichereGrafikDetails({ ...standardDetails(), schatten: 'mittel', aufloesung: 0.7, bildrate: 30 }, s);
  const geladen = ladeGrafikDetails(s);
  assert.equal(geladen.schatten, 'mittel');
  assert.equal(geladen.aufloesung, 0.7);
  assert.equal(geladen.bildrate, 30);
  assert.equal(s.daten.bs_maxfps, '30', 'alter FPS-Schlüssel wird mitgeschrieben');
  const kaputt = speicher({ [GRAFIK_DETAILS_SCHLUESSEL]: JSON.stringify({ schatten: 'ultra', aufloesung: '0.85', lichter: 7 }) });
  const k = ladeGrafikDetails(kaputt);
  assert.equal(k.schatten, 'auto');
  assert.equal(k.aufloesung, 0.85, 'Zahl als Text');
  assert.equal(k.lichter, 'auto');
  assert.equal(ladeGrafikDetails(speicher({ [GRAFIK_DETAILS_SCHLUESSEL]: '{kaputt' })).schatten, 'auto', 'kaputtes JSON → Standard');
  assert.equal(pruefeDetail('gibtsnicht', 1), undefined);
  assert.equal(pruefeDetail('bildrate', '120'), 120);
});

test('Details: alte FPS-Grenze (localStorage bs_maxfps) wird übernommen', () => {
  assert.equal(ladeGrafikDetails(speicher({ bs_maxfps: '0' })).bildrate, 0, '0 = unbegrenzt');
  assert.equal(ladeGrafikDetails(speicher({ bs_maxfps: '30' })).bildrate, 30);
  assert.equal(ladeGrafikDetails(speicher({ bs_maxfps: '45' })).bildrate, 60, 'kein Knopf dafür → Standard');
  // neuer Schlüssel gewinnt
  assert.equal(ladeGrafikDetails(speicher({ bs_maxfps: '30', [GRAFIK_DETAILS_SCHLUESSEL]: JSON.stringify({ bildrate: 120 }) })).bildrate, 120);
});

test('Details: Profil-Klick setzt nur Bild-Details zurück, Bildrate/Akku bleiben', () => {
  const vorher = { ...standardDetails(), bildrate: 30, akku: 'immer', schatten: 'aus', aufloesung: 0.5, natur: 'aus' };
  assert.equal(angepassteDetails(vorher), 3);
  const nachher = detailsFuerProfil(vorher);
  assert.equal(nachher.bildrate, 30);
  assert.equal(nachher.akku, 'immer');
  assert.equal(nachher.schatten, 'auto');
  assert.equal(nachher.aufloesung, 'auto');
  assert.equal(angepassteDetails(nachher), 0);
  assert.notEqual(nachher, vorher, 'neues Objekt');
});

test('Bildrate: Einstellung, Akku sparen, offene Fenster/Hintergrund', () => {
  const d = (bildrate, akku = 'aus') => ({ ...standardDetails(), bildrate, akku });
  assert.equal(bildrateGrenze(d(60)), 60);
  assert.equal(bildrateGrenze(d(0)), 0, 'Max = unbegrenzt');
  assert.equal(bildrateGrenze(d(120, 'akku'), { amAkku: false }), 120, 'am Strom volle Bildrate');
  assert.equal(bildrateGrenze(d(120, 'akku'), { amAkku: true }), AKKU_FPS);
  assert.equal(bildrateGrenze(d(0, 'akku'), { amAkku: true }), AKKU_FPS, 'auch „Max“ wird im Akkubetrieb gedeckelt');
  assert.equal(bildrateGrenze(d(60, 'immer')), AKKU_FPS);
  assert.equal(bildrateGrenze(d(30, 'immer')), 30);
  assert.equal(bildrateGrenze(d(60), { fensterOffen: true }), RUHE_FPS);
  assert.equal(bildrateGrenze(d(0), { imHintergrund: true }), RUHE_FPS);
  assert.equal(bildrateGrenze(undefined), 60, 'ohne Renderer: Standard');
  assert.ok(SCHATTEN_WAHL.hoch.groesse > SCHATTEN_WAHL.mittel.groesse && SCHATTEN_WAHL.aus.sonne === false && SCHATTEN_WAHL.aus.lampe === false);
});

test('Akku: Battery-API (Laden/Entladen live), ohne API = am Strom', async () => {
  let melde = null;
  const akku = { charging: true, addEventListener: (_, fn) => (melde = fn) };
  const zustand = beobachteAkku({ getBattery: async () => akku });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(zustand.amAkku, false);
  akku.charging = false;
  melde();
  assert.equal(zustand.amAkku, true, 'Stecker gezogen');
  assert.equal(beobachteAkku({}).amAkku, false);
  assert.equal(beobachteAkku(undefined).amAkku, false);
  const fehler = beobachteAkku({ getBattery: () => Promise.reject(new Error('nein')) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fehler.amAkku, false);
});

test('Spielschleife: grenze() je Bild – 30 = jedes 2. Bild bei 60 Hz, 0 = jedes; Takte laufen unabhängig weiter', () => {
  const rueckrufe = [];
  const altRaf = globalThis.requestAnimationFrame;
  const altCancel = globalThis.cancelAnimationFrame;
  const altNow = performance.now;
  globalThis.requestAnimationFrame = (fn) => rueckrufe.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  try {
    let grenze = 30;
    let bilder = 0;
    let takte = 0;
    performance.now = () => 0;
    const schleife = new SpielSchleife({ tickDauerMs: 1000 / 30, festerTakt: () => takte++, zeichne: () => bilder++, grenze: () => grenze });
    schleife.starten();
    const lauf = (von, n) => {
      for (let i = 1; i <= n; i++) rueckrufe.shift()(von + (i * 1000) / 60);
    };
    lauf(0, 60); // 1 s bei 60 Hz
    assert.ok(bilder >= 29 && bilder <= 31, `30er-Grenze: ${bilder} Bilder`);
    assert.ok(takte >= 29 && takte <= 30, `Takte unabhängig: ${takte}`);
    assert.equal(schleife.maxFps, 30);
    bilder = 0;
    grenze = 0;
    lauf(1000, 60);
    assert.ok(bilder >= 59, `unbegrenzt: ${bilder} Bilder`);
    bilder = 0;
    grenze = 60;
    lauf(2000, 60);
    assert.ok(bilder >= 58 && bilder <= 60, `60er-Grenze bei 60 Hz: ${bilder}`);
    schleife.stoppen();
  } finally {
    globalThis.requestAnimationFrame = altRaf;
    globalThis.cancelAnimationFrame = altCancel;
    performance.now = altNow;
  }
});

test('Renderer: Licht-Sätze (vorkompiliert, nach allen Lichtstärken gewählt), Lichter auf allen Ebenen, billige Zusatz-Durchgänge', () => {
  const r = lies('client/darstellung/renderer.js');
  assert.match(r, /const LICHT_SAETZE = \['aus', 'nah', 'halb', 'voll'\]/);
  // alle Lichter auf allen Ebenen (sonst kippt der Licht-Zustand durch den Silhouetten-Durchgang jedes Bild)
  assert.match(r, /this\.umgebung\.layers\.enableAll\(\)/);
  assert.match(r, /this\.mond\.layers\.enableAll\(\)/);
  assert.match(r, /this\.streuLicht\]\) l\.layers\.enableAll\(\)/);
  // Satz erst nach Effekten (Mündungsfeuer) und vor dem Zeichnen wählen
  const zeichne = r.slice(r.indexOf('  zeichne({'), r.indexOf('  #zeichneSilhouette('));
  const satz = zeichne.indexOf('this.#waehleLichtSatz(jetzt)');
  assert.ok(satz > zeichne.indexOf('this.#aktualisiereEffekte(effekte.zustand)'), 'nach den Effekten');
  assert.ok(satz > zeichne.indexOf('this.#aktualisiereLampenPool('), 'nach dem Lampen-Pool');
  assert.ok(satz < zeichne.indexOf('this.gl.render(this.szene, this.kamera3d)'), 'vor dem Zeichnen');
  // kleine Sätze beim Vorkompilieren mitübersetzen, Wechsel nur wenn fertig
  assert.match(r, /for \(let satz = VOLLER_SATZ - 1; satz >= 0; satz--\) \{\s+this\.#setzeLichtSatz\(satz\);\s+const materialien = this\.gl\.compile/);
  assert.match(r, /programm\.isReady\(\)/);
  // Zusatz-Durchgänge ohne Matrix-Neuberechnung, danach wieder an
  const zusatz = r.slice(r.indexOf('  #zusatzDurchgang('), r.indexOf('  #zeichneTuerUmrisse('));
  assert.match(zusatz, /szene\.matrixWorldAutoUpdate = false;[\s\S]*szene\.matrixWorldAutoUpdate = true;/);
  assert.match(r, /this\.#zusatzDurchgang\(TUER_EBENE, \[TUER_UMRISS\], \[this\.karte\?\.statisch, this\.natur\?\.gruppe\]\)/, 'Kartentüren liegen in karte.beweglich → nicht ausblenden');
  // ganze Bildstatistik (alle Durchgänge)
  assert.match(r, /this\.gl\.info\.autoReset = false/);
  assert.match(r, /this\.gl\.info\.reset\(\);/);
});

test('Einstellungen/Client: Details-Knöpfe, Bildraten-Grenze in der Schleife, Einstellungen drosseln nicht, Vorschau begrenzt', () => {
  const html = lies('client/index.html');
  for (const id of ['einst-details-knopf', 'einst-details', 'einst-details-hilfe']) assert.match(html, new RegExp(`id="${id}"`));
  const ui = lies('client/ui/einstellungen.js');
  assert.match(ui, /Object\.entries\(GRAFIK_DETAILS\)/);
  assert.match(ui, /setzeDetail\?\.\(name, wert\)/);
  const spiel = lies('client/kern/clientSpiel.js');
  assert.match(spiel, /grenze: \(\) => bildrateGrenze\(this\.renderer\?\.details/);
  const verdeckt = spiel.slice(spiel.indexOf('  #spielVerdeckt() {'), spiel.indexOf('  fensterOffen() {'));
  assert.ok(verdeckt.length > 0 && !verdeckt.includes('einstellungen.offen'), 'Einstellungen offen → volle Bildrate (Wirkung der Regler sehen)');
  assert.match(lies('client/ui/charakterVorschau.js'), /VORSCHAU_BILD_MS/);
  assert.match(lies('client/main.js'), /spiel: \(\) => aktuellesSpiel/);
});
