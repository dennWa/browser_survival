import * as THREE from 'three';
import { FBXLoader, GLTFLoader, SkeletonUtils } from '../vendor/three/addons.js';
import { KartenModell, BODEN_BLOCK, TUER_EBENE, TUER_SCHIMMER_WEITE } from './kartenModell.js';
import { SICHT_PUFFER } from './bloecke.js';
import { Himmel } from './himmel.js';
import { strahlGegenWaende } from '../../gemeinsam/physik/strahl.js';
import { NaturSchicht, ladeNaturModelle } from './naturModell.js';
import { vereineGeometrien } from './geometrie.js';
import { Fussspuren } from './fussspuren.js';
import { Reifenspuren } from './reifenspuren.js';
import { bauwerkDrehungY, erzeugeBauwerk, erzeugeVorschau } from './bauwerkModelle.js';
import { BASIS_MATERIAL, BasisbauSchicht, INSTANZ_TYPEN, bauteilGeometrie, erzeugeGebietRing, initialisiereBasisbauModelle, markierungsHoehe, wirdInstanziert } from './basisbauModelle.js';
import { animiereWrack, erzeugeFahrzeugModell, macheWrack } from './fahrzeugModelle.js';
import { FAHRZEUG, FAHRZEUG_MODELLE } from '../../gemeinsam/physik/fahrzeug.js';
import { erzeugeFrisur } from './haarModell.js';
import { AUSSEHEN, skinFuer } from '../../gemeinsam/spieler/aussehen.js';
import { itemGeometrie, ITEM_MATERIAL, rucksackTeile } from './itemModelle.js';
import { zeichneBeschriftung, zeichneItemName, zeichneSprechblase } from './beschriftung.js';
import { richteFigurEin, aktualisiereHaltung, ARBEIT_KLIP, istBeidhaendigerSchlag } from './figurHaltung.js';
import { erzeugeWaffe, WAFFEN_NAMEN } from './waffenModelle.js';
import { erzeugeTier } from './tierModelle.js';
import { erzeugeAngel } from './angelModell.js';
import { WetterEffekt } from './wetterEffekt.js';
import { BAUM_WIND } from './baumModell.js';
import { BlaetterEffekt } from './blaetterEffekt.js';
import { SonderEffekte } from './sonderEffekte.js';
import { LICHTER, hatStrom, leuchtet } from '../../gemeinsam/welt/einrichtung.js';
import { erkenneGeraet, merkeAutoProfil } from './geraet.js';

/**
 * Renderer mit Three.js (WebGL): schräge Kamera, echte Lichter und Schatten, Tag & Nacht.
 *
 * Gameplay bleibt 2D (x/y auf dem Boden); nur die Darstellung ist 3D:
 *   Weltpixel x → three.x, Weltpixel y → three.z, Höhe → three.y (1 Einheit = 1 Weltpixel)
 *
 * Runde 20: zwei Scheinwerfer je Auto, Karosserie neigt sich (Kurve/Bremsen), Reifenspuren (reifenspuren.js), Geisterschatten-Fix
 *   (Taschenlampen-Schattenkarte nie eingefroren benutzen).
 * Runde 25: Streulicht (STREULICHT) – drinnen hellt die Taschenlampe den Raum indirekt auf; Regen/Schnee blenden drinnen aus (wetterEffekt).
 * Runde 26: Innen-Abschirmung (#innenAbschirmung, globale Clipping-Ebenen um das betretene Gebäude), Nebel-/NaN-Schutz.
 * v0.10: Tiere (Hase), Angel (Rute/Schnur/Pose), Wetter (wetterEffekt.js: Regen, Nebel, Licht), Wracks, Erdfeld-Vorschau.
 * v0.11 Basisbau: Böden/Wände/Dächer als instanzierte Schicht (basisbauModelle.js → BasisbauSchicht), Bau-Hologramm (zeigeVorschau mit
 *   drehung, 'abriss'-Markierung, 'flagge'), roter Baugebiet-Ring (zeigeGebiet, nur Besitzer) + Flaggen-Ring (zeigeGebietVorschau).
 *
 * Spieler-Figur: Quaternius „Adventurer“ (figur_mann/frau.glb, Pipeline werkzeuge/assets/figuren; Clips stehen/laufen/hacken/sterben; #neueSurvivorFigur) – Zombies: Kenney-FBX.
 *
 * Ebenen: WebGL-Canvas (#spielflaeche3d) liegt UNTER dem 2D-Canvas (#spielflaeche). Das 2D-Canvas bleibt
 * durchsichtig, empfängt Maus/Touch und zeigt Namen & Lebensbalken. Vignette und Schadensblitz sind CSS.
 *
 * Performance (Ziel: 60 FPS auch auf Handys):
 *   - Karte in wenigen Draw-Calls (kartenModell.js: Instancing, zusammengefasste Möbel, eingefrorene Matrizen)
 *   - feste Lichteranzahl je Grafikprofil (LICHT_BUDGET): Lampen-Pool (nur die nächsten Punkt- bzw. Kegel-Lampen leuchten echt;
 *     alle anderen zeigen nachts einen Lichtschein am Boden, kartenModell.js), Taschenlampen, Mündungsblitze, 2 Auto-Scheinwerfer
 *     (#aktualisiereScheinwerfer, ohne Schatten) → Shader werden nur beim Profilwechsel neu kompiliert (#baueLichter)
 *   - Grafikprofil „Auto“ (Standard, geraet.js erkenneGeraet): schwache Grafikchips starten auf mittel/niedrig, bei dauerhaft
 *     < 40 FPS eine Basis tiefer (gemerkt); Schattenkarten in sparsamen Stufen nur jedes 2. Bild (#schattenDran)
 *   - Zombie-Figuren aus einem Pool (#holeFigur), höchstens NEUE_FIGUREN_JE_BILD neue Klone pro Bild, entfernte Zombies nur jedes
 *     2. Bild animiert (ANIM_HALB_AB); Zombie-Modelle: alte Kenney-Figur + Spielordner-GLBs (ZOMBIE_MODELLE, zombieModellFuer)
 *   - alle Shader beim Laden vorkompiliert (#vorkompilieren), Materialien geteilt
 *   - adaptive Qualität (QUALITAETS_STUFEN): fallen die FPS, werden erst Details gespart (Retina-Auflösung,
 *     Schattenauflösung, Baum-Umrisse/-Schatten) und erst ganz zum Schluss die Auflösung unter 1 – nie unter 0,8
 *   - Figuren außerhalb der Sichtweite werden nicht animiert
 *   - kein `discard` in Welt-Shadern (Schnitt aus, #mitSchnitt) → früher Tiefentest bleibt aktiv; Dächer zuerst gezeichnet
 */
const ASSETS = new URL('../assets/', import.meta.url);
const FIGUR_HOEHE = 64;
// Spieler-Figuren (Quaternius „Adventurer“, werkzeuge/assets/figuren): je ein GLB mit Clips stehen/laufen/hacken/sterben
const SURVIVOR = { mann: '3d/figur_mann.glb', frau: '3d/figur_frau.glb' };
// Runde 23: Kleidung → Mesh der Spielerfigur (Namensteil) und Zusatzteile (Einheitsgrößen, skaliert an den Knochen)
const KLEIDUNG_MESH = [['Body', 'oberkoerper'], ['Legs', 'beine'], ['Feet', 'fuesse']];
const KLEIDUNG_GEO = {
  muetze: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  handschuh: new THREE.SphereGeometry(0.5, 8, 6),
};
const kleidungsSchluessel = (k) => (k ? Object.values(k).join(',') : '');
// px/s, bei denen „laufen“ (Run) bzw. „gehen“ (Walk) mit timeScale 1 passen – je Figur aus der Fußgeschwindigkeit der Clips
// (Clip-Weg/s × FIGUR_HOEHE / Modellhöhe, gemessen in figuren_bauen.py)
const LAUF_TEMPO = { mann: 100, frau: 83 };
const GEH_TEMPO = { mann: 47, frau: 38 };
const GEH_GRENZE = 90; // darunter Geh-Clip, darüber Lauf-Clip (Grundtempo = leichtes Joggen 100, Joggen erschöpft 125, Rennen 170)
const SCHLAG_KLIPS = new Set(['hacken', 'spitzhacke', 'abbauen', 'hacke', 'nahkampf']); // Clips, die ein Werkzeug schwingen (figurHaltung legt es in die Hände)
const HACK_ARBEIT = new Set(['holz', 'stein', 'eisenerz']);
const AUFSCHLAG = { hacken: 0.5, spitzhacke: 0.48, abbauen: 0.48 }; // Runde 23: Treffer-Zeitpunkt je Werkzeug-Clip (Anteil)
const SCHNITT_RADIUS = 0; // 0 = aus: kein Durchschauen durch Wände mehr (verdeckte Figur zeigt stattdessen die Silhouette)
const SCHNITT_HOEHE = 10; // bis zu dieser Höhe bleiben aufgeschnittene Wände als Sockel stehen
const ZIELHOEHE = 36; // Mausstrahl trifft diese Höhe (Brust) → Zielen fühlt sich richtig an
/** Runde 26: Abstand der Innen-Schnittebenen, wenn man draußen ist (praktisch unendlich) und Rand beim Einblenden (px) */
const INNEN_WEIT = 1e7;
const INNEN_RAND = 1400;
const KAMERA_VERSATZ = new THREE.Vector3(0, 540, 400); // etwas flacher als früher (600/320): schrägerer Blick, nicht rein von oben
const SKINS = { normal: 'zombieMaleA', laeufer: 'zombieFemaleA', brocken: 'zombieMaleA' }; // Zombies; Spieler: aussehen.js
const KOPF = { hoehe: 1.22, breite: 0.9, tiefe: 1.07 }; // Schädelmaße im Verhältnis zum Abstand Kopfknochen → Head_end (gemessen)
const _wetterGrau = new THREE.Color();
const _blitzFarbe = new THREE.Color(0.82, 0.86, 1);
const _zenit = new THREE.Color();
const _buffer = new THREE.Vector2();
const _blick = new THREE.Vector3();
const _wolkenFarbe = new THREE.Color();
const NACHT_MOND = 0.1; // Mondlicht bei voller Dunkelheit (Runde 23: 0,13 → 0,1, düsterer)
const NACHT_UMGEBUNG = 0.095; // Himmelslicht bei voller Dunkelheit (Runde 23: 0,12 → 0,095)
const NACHT_EIGENLEUCHTEN = 0.4; // (Runde 18: 0,2 → 0,4, eigene Figur bleibt nachts erkennbar) Emissive-Stärke der Spieler-Figur bei voller Dunkelheit (nur Orientierung, kein echtes Licht)
const TASCHENLAMPEN_ANSATZ = { vorn: 16, hoehe: 36 }; // Lichtkegel beginnt knapp vor der Brust (px vor der Körpermitte, Höhe über Boden)
// So viele Kartenlampen leuchten gleichzeitig echt (die nächsten); jede echte Lichtquelle kostet in jedem Pixel → klein halten,
// die übrigen Lampen zeigen nachts nur ihren Lichtschein am Boden (kartenModell.js)
// Runde 20: Lichtbudget je Grafikprofil – three.js rechnet JEDE Lichtquelle in jedem Pixel jedes beleuchteten Materials (auch mit
// Stärke 0). Das war auf alten Laptops der größte Bremsklotz (15 Lichter je Pixel) → schwächere Profile bekommen weniger Lichter.
// taschen = Taschenlampen (die erste mit Schatten), muendung = Mündungsblitze; dazu immer 2 Auto-Scheinwerfer (ohne Schatten).
const LICHT_BUDGET = {
  hoch: { lampen: { handy: 5, desktop: 8 }, kegel: { handy: 1, desktop: 2 }, taschen: 2, muendung: 2 },
  mittel: { lampen: { handy: 4, desktop: 5 }, kegel: { handy: 1, desktop: 1 }, taschen: 2, muendung: 1 },
  niedrig: { lampen: { handy: 3, desktop: 3 }, kegel: { handy: 1, desktop: 1 }, taschen: 1, muendung: 1 },
};
/** Taschenlampe (Spieler): eher schmal und schwach – Nächte sollen düster bleiben (Nutzer-Wunsch, Editor 2.0 Schritt 2.1) */
// Fokussierter Strahl: schmaler Kegel (~11°), 520 px Reichweite, weicher Rand (penumbra) und Abfall mit decay 1,5 statt hartem Schnitt.
// Bei decay > 1 fällt das Licht schneller ab → Stärken entsprechend höher (≈ ×16 gegenüber decay 1 bei 250 px). Tagsüber aus.
// Runde 18: kürzer und breiter, Rand sehr weich (penumbra 0,95) – der Lichtfleck läuft zu den Seiten aus statt hart abzuschneiden
/** Streulicht (Runde 25): drinnen hellt die Taschenlampe den Raum indirekt auf – schattenloses Punktlicht am Auftreffpunkt des Strahls (Fake-Bounce). */
const STREULICHT = { staerke: 150, reichweite: 230, hoehe: 46, zurueck: 0.35 };
const TASCHENLAMPE = { winkel: 0.56, rand: 0.95, reichweite: 330, decay: 1.5, staerke: 0, staerkeNacht: 26000, kegelLaenge: 200, ziel: 120 }; // ziel = px vor dem Spieler (näher = Lichtkreis beginnt dichter an der Figur)
// Je Scheinwerfer (zwei pro Auto, Runde 20): etwas mehr als die Hälfte des früheren Einzel-Lichts, Ziel = px vor der Front
const SCHEINWERFER = { decay: 1, winkel: 0.4, rand: 0.55, reichweite: 620, staerke: 280, staerkeNacht: 1500, ziel: 360 };
const SITZ_TIEFE = 24; // so weit sinkt die Figur beim Sitzen am Feuer
const SICHTWEITE = 1300; // weiter entfernte Figuren werden nicht animiert/gezeichnet
const ANIM_HALB_AB = 650; // Zombies weiter weg werden nur jedes 2. Bild animiert (mit doppeltem dt)
const NEUE_FIGUREN_JE_BILD = 2; // höchstens so viele Zombie-Figuren pro Bild neu aufbauen (Horden-Spawn ruckelte)
/**
 * Zusätzliche Zombie-Modelle (Spielordner, Quaternius „Ultimate Monsters“, CC0) mit eigenen Clips.
 * hoehe = Anteil von FIGUR_HOEHE, klips = Spielname → Clipname im GLB (ohne „CharacterArmature|“), tempo = px/s, bei denen der Clip passt.
 */
const ZOMBIE_MODELLE = {
  gruen: { datei: 'eigene/zombie-2.glb', hoehe: 0.86, klips: { stehen: 'Idle', gehen: 'Walk', rennen: 'Run', angriff: 'Punch' }, tempo: { gehen: 55, rennen: 125 } },
  koloss: { datei: 'eigene/zombie.glb', hoehe: 1.05, klips: { stehen: 'Idle', gehen: 'Walk', rennen: 'Run', angriff: 'Punch' }, tempo: { gehen: 50, rennen: 115 } },
  halb: { datei: 'eigene/zombie-half.glb', hoehe: 0.62, klips: { stehen: 'Idle', gehen: 'Walk', rennen: 'Run', angriff: 'HitReact' }, tempo: { gehen: 40, rennen: 95 } },
};
/** Runde 24: Hautfarbe (+ Glühen) der Sonder-Zombies auf der Kenney-Figur */
const SONDER_TOENE = {
  sprinter: { farbe: [1.05, 0.95, 0.9] },
  spucker: { farbe: [0.75, 0.95, 0.45], leuchten: [0.25, 0.5, 0.05] },
  gepanzert: { farbe: [0.6, 0.62, 0.66] },
  explosiv: { farbe: [1, 0.62, 0.5], leuchten: [0.5, 0.12, 0] },
};
const SONDER_MATERIAL = {};
/** Welches Modell trägt welche Zombie-Variante? normal: abwechselnd alte Kenney-Figur und grüner Zombie (Abwechslung) */
function zombieModellFuer(e) {
  if (e.variante === 'brocken') return 'koloss';
  if (e.variante === 'halb') return 'halb';
  if (e.variante === 'normal' || !e.variante) return (e.id ?? 0) % 2 ? 'gruen' : null;
  return null;
}
const SPRECHBLASE_MS = 4000; // Chat-Sprechblase: Grunddauer + 60 ms je Zeichen …
const SPRECHBLASE_MAX_MS = 10000; // … höchstens so lange
/**
 * Qualitätsstufen, von schön (0) nach sparsam. aufloesung = Obergrenze fürs Pixelverhältnis (null = Gerät),
 * schatten = Größe der Schattenkarte, baumDetail = Umrisse + Schatten der Bäume.
 */
const QUALITAETS_STUFEN = [
  { aufloesung: null, schatten: 2048, baumDetail: true, schattenTakt: 1 },
  { aufloesung: 1.5, schatten: 2048, baumDetail: true, schattenTakt: 1 },
  { aufloesung: 1, schatten: 2048, baumDetail: true, schattenTakt: 1 },
  { aufloesung: 1, schatten: 1024, baumDetail: true, schattenTakt: 1 },
  { aufloesung: 1, schatten: 1024, baumDetail: false, schattenTakt: 2 },
  { aufloesung: 0.9, schatten: 1024, baumDetail: false, schattenTakt: 2 },
  { aufloesung: 0.8, schatten: 1024, baumDetail: false, schattenTakt: 2 },
];
/**
 * Grafik-Einstellung (Einstellungen ⚙): hoch = volle Auflösung, Schatten & Texturen (Bildrate wird nur über
 * Schatten/Baum-Details nachgeregelt, die Auflösung bleibt – sonst wirkt das Bild mal scharf, mal unscharf),
 * mittel = etwas abgeschwächt, niedrig = beste Bildrate (kleinere Auflösung, kleine Texturen, keine Sonnenschatten).
 * stufe = feste Qualitätsstufe (QUALITAETS_STUFEN), adaptiv = darf bei Ruckeln sparsamer werden.
 * schattenTakt = Schattenkarten nur jedes n-te Bild neu zeichnen (2 = halbe Kosten, bewegte Schatten hängen 1 Bild nach).
 * auto (Runde 20, Standard): erkennt schwache Grafikchips (erkenneGeraet) und nimmt hoch/mittel/niedrig als Basis (#profil),
 *   regelt innerhalb der Basis nach (AUTO_STUFEN) und geht bei dauerhaft < 40 FPS eine Basis tiefer (gemerkt je Grafikchip).
 */
export const GRAFIK_PROFILE = Object.freeze({
  auto: { name: 'Auto', beschreibung: 'passt sich dem Gerät an (empfohlen)' },
  hoch: { name: 'Hoch', beschreibung: 'volle Auflösung, Schatten, Texturen', stufe: null, adaptiv: true, aufloesung: null, texturen: 1, sonnenschatten: true, schattenTakt: 1 },
  mittel: { name: 'Mittel', beschreibung: 'etwas weichere Schatten & Texturen, weniger Lichter', stufe: 3, adaptiv: false, aufloesung: 1.25, texturen: 0.6, sonnenschatten: true, schattenTakt: 2 },
  niedrig: { name: 'Niedrig', beschreibung: 'beste Leistung für schwache Geräte (ohne 3D-Gras)', stufe: 6, adaptiv: false, aufloesung: 0.8, texturen: 0.4, sonnenschatten: false, natur: false, schattenTakt: 2 },
});
const GRAFIK_SCHLUESSEL = 'browserSurvival.grafik';
const AUTO_STUFEN = { hoch: [null, 4], mittel: [3, 5], niedrig: [6, 6] }; // Auto: [beste, sparsamste] Qualitätsstufe je Basis (null = Gerät)
const AUTO_TIEFER = { hoch: 'mittel', mittel: 'niedrig' };
const ADAPTIV_MAX_STUFE = 4; // im Profil "hoch" wird höchstens bis hier gespart (Schatten, Baum-Details) – Auflösung bleibt
const AUFWAERM_MS = 6000; // so lange nach dem Betreten nicht messen (Shader, Texturen, erste Frames)
const ZOOM_MIN = 0.32; // so nah kommt die Kamera an die Figur (Runde 18: näher als vorher 0,5)
const ZOOM_MAX = 1.12; // weiter raus geht nicht (Runde 18: 1,35 war noch zu weit)
const EGO_SICHT_ZOOM = 1.35; // Sichtweite der Ich-Ansicht = Draufsicht bei diesem Zoom (unabhängig vom Zoom-Limit)
/** Ich-Ansicht sieht nicht weiter als die Draufsicht beim weitesten Rauszoomen: Halbbreite des Bildes am Boden (1 = Halbbreite, 2 = ganzer Durchmesser) */
const EGO_SICHT_FAKTOR = 1;
/** Lichtfarben für Tag, Nacht und Dämmerung (siehe #tageslicht) */
const TAG = { sonne: new THREE.Color(0xfff1dc), himmel: new THREE.Color(0xbfd8ff), boden: new THREE.Color(0x4a4636), hintergrund: new THREE.Color(0x9cc3e4), zenit: new THREE.Color(0x2f78e0), wolken: new THREE.Color(0xffffff) };
const NACHT = { sonne: new THREE.Color(0x7489c8), himmel: new THREE.Color(0x1f2842), boden: new THREE.Color(0x0a0b0e), hintergrund: new THREE.Color(0x02030a), zenit: new THREE.Color(0x000105), wolken: new THREE.Color(0x0b0e18) };
const DAEMMERUNG = { sonne: new THREE.Color(0xff9a4d), hintergrund: new THREE.Color(0xe08a5a), zenit: new THREE.Color(0x5a5aa8), wolken: new THREE.Color(0xffb48a) };
/** Himmel (himmel.js): Die Welt endet per Kamera-Ferne (Vielfaches des Kameraabstands) – darüber, am oberen Bildrand, beginnt der Himmel. */
const BODEN_SPEICHER_MB = { pc: 512, handy: 192 }; // Grafikspeicher für die Bodentextur einer Zone (wird hinter dem Ladebild komplett hochgeladen)
const HIMMEL_FERNE = 1.36; // Welt endet erst knapp über dem oberen Bildrand – der Himmel verdeckt das Spielfeld nicht
const HIMMEL_DUNST = 0.12; // so breit (Kameraabstände) verblasst die Welt vor der Ferne in die Horizontfarbe
const REGEN_ZENIT = new THREE.Color(0x3c4048);
const REGEN_WOLKEN = new THREE.Color(0x62666e);

const _ziel = new THREE.Vector3();
const _kameraZiel = new THREE.Vector3();
const _blutRot = new THREE.Color(1, 0.16, 0.1);
const _schwarz = new THREE.Color(0, 0, 0);
const _blutHimmel = new THREE.Color(0.2, 0.02, 0.02);
const _wackelVersatz = new THREE.Vector3();

const ITEM_NAMEN_RADIUS = 58; // px: Namen von Bodenitems erscheinen erst, wenn man (fast) davor steht
const PARTIKEL_FARBE = new THREE.Color();

// Silhouette: Ist die eigene Figur hinter einer Wand verschwunden, bleibt ein grauer Umriss sichtbar.
// Schritt 1 markiert per Stencil, wo die Figur sichtbar ist; Schritt 2 malt sie nur dort grau, wo sie verdeckt ist.
const SILHOUETTE_EBENE = 1;
const SILHOUETTE_MARKE = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, depthFunc: THREE.LessEqualDepth,
  stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
});
const SILHOUETTE_GRAU = new THREE.MeshBasicMaterial({
  color: 0x9aa3b0, transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false,
  stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
});

// Türen hinter Wänden: ein leichter Farbschimmer zeigt, wo der Eingang ist – nur für Türen in unmittelbarer Nähe der Figur (TUER_SCHIMMER_WEITE)
// und nur dort gezeichnet, wo etwas Näheres die Tür verdeckt.
const TUER_UMRISS = new THREE.MeshBasicMaterial({
  color: 0xffc04a, transparent: true, opacity: 0.4, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false,
});

export class Renderer {
  /** Lädt Figuren & Animationen, baut den Renderer. Wirft, wenn WebGL fehlt. */
  static async erstelle(leinwand2d, assets) {
    const renderer = new Renderer(leinwand2d, assets);
    await renderer.#ladeFiguren();
    renderer.naturModelle = await ladeNaturModelle(); // Gras & Co. (naturModell.js); fehlen sie, bleibt die Karte wie sie war
    return renderer;
  }

  constructor(leinwand2d, assets) {
    this.assets = assets;
    this.overlay = leinwand2d;
    this.octx = leinwand2d.getContext('2d');
    this.leinwand = Object.assign(document.createElement('canvas'), { id: 'spielflaeche3d' });
    leinwand2d.before(this.leinwand);
    this.vignette = document.getElementById('vignette');
    this.schadenEbene = document.getElementById('schadensblitz');
    this.istHandy = matchMedia('(pointer: coarse)').matches;
    // Grafik-Profil vor dem WebGL-Kontext bestimmen: Kantenglättung (MSAA) lässt sich nur beim Anlegen wählen
    this.grafik = ladeGrafik();
    this.geraet = erkenneGeraet(this.istHandy);
    this.autoProfil = this.geraet.profil;

    this.gl = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: !this.istHandy && this.#basisProfil() !== 'niedrig', stencil: true, powerPreference: 'high-performance' });
    // Runde 26: Innen-Abschirmung – 4 globale Schnitt-Ebenen um das betretene Gebäude (#innenAbschirmung). Immer aktiv (draußen
    // weit weg), damit sich die Ebenen-Anzahl nie ändert → kein Shader-Neubau/Ruckler beim Betreten.
    this.innenEbenen = [new THREE.Plane(new THREE.Vector3(1, 0, 0), INNEN_WEIT), new THREE.Plane(new THREE.Vector3(-1, 0, 0), INNEN_WEIT), new THREE.Plane(new THREE.Vector3(0, 0, 1), INNEN_WEIT), new THREE.Plane(new THREE.Vector3(0, 0, -1), INNEN_WEIT)];
    this.gl.clippingPlanes = this.innenEbenen;
    this.innenAnteil = 0; // 0 = draußen … 1 = ganz abgeschirmt
    this.innenGebaeude = -1;
    this.innenBox = null; // { x0, z0, x1, z1 } Weltpixel des Gebäudes (inkl. Wände)
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x04060b);
    this.szene.fog = new THREE.Fog(0x04060b, 650, 1500);
    this.kamera3d = new THREE.PerspectiveCamera(38, 1, 10, 4000);
    this.himmel = new Himmel(this.szene);
    this.kamera = new KameraAdapter(this);
    this.nachtsicht = false; // Admin: Dunkelheit aus
    this.letzteZeit = 0;

    // Grundlicht: Himmel/Boden-Licht + Sonne bzw. Mond (Farbe & Stärke je nach Tageszeit, siehe #tageslicht)
    this.umgebung = new THREE.HemisphereLight(0x3a4a70, 0x101010, 0.55);
    this.mond = new THREE.DirectionalLight(0x9db4e8, 0.9);
    this.mond.castShadow = true;
    this.mond.shadow.mapSize.set(this.istHandy ? 1024 : 2048, this.istHandy ? 1024 : 2048);
    Object.assign(this.mond.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 10, far: 2500 });
    this.mond.shadow.bias = -0.0006;
    this.szene.add(this.umgebung, this.mond, this.mond.target);

    /** Wand-Schnitt: Wände zwischen Kamera und eigener Figur werden nahe der Figur weggeschnitten (#mitSchnitt) */
    this.schnitt = { uFokus: { value: new THREE.Vector3() }, uRadius: { value: SCHNITT_RADIUS }, uHoehe: { value: SCHNITT_HOEHE } };
    this.figuren = new Map(); // Entitäts-ID → { gruppe, mixer, aktionen, aktuell, ... }
    this.items = new Map();
    /** Leuchtring unter dem Item, das E gerade aufheben würde */
    this.markierRing = new THREE.Mesh(
      new THREE.RingGeometry(11, 14, 28, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.markierRing.visible = false;
    /** Roter Ring um den angetippten Zombie (Auto-Zielen) */
    this.zielRing = new THREE.Mesh(
      new THREE.RingGeometry(17, 20, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }),
    );
    this.zielRing.renderOrder = 5;
    this.zielRing.visible = false;
    this.itemMaterialien = new Map(); // defId → { normal, markiert, breite, hoehe }
    this.figurMaterialien = new Map(); // Skin-Schlüssel → Material (geteilt)
    this.spielerMaterialien = []; // Spieler-Skins: bekommen nachts ein schwaches Eigenleuchten
    this.#baueLichter(); // Taschenlampen, Lampen-Pool, Kegel, Mündungsblitze, Scheinwerfer (Anzahl je Profil, LICHT_BUDGET)
    this.bildNr = 0;
    this.figurPool = new Map(); // Pool-Schlüssel → [Figur] (verschwundene Zombies, werden wiederverwendet statt neu geklont)
    this.#baueEffektObjekte();
    this.fussspuren = new Fussspuren(this.szene);
    this.reifenspuren = new Reifenspuren(this.szene, (x, y) => this.#hy(x, y));
    this.fallendeBaeume = []; // { gruppe, achse, zeit }
    this.sprechblasen = new Map(); // Spielername → { text, bis } (Chat über dem Kopf)
    this.fallendeLaternen = []; // { gruppe, achse, zeit } – von Autos umgefahrene Straßenlaternen
    this.bauwerke = new Map(); // Bauwerk-ID → { gruppe, aktualisiere, typ }
    this.bauwerkeStand = -1;
    this.feuerLampen = []; // brennende Lagerfeuer als Lampen für den Lampen-Pool
    this.vorschau = null; // { typ, gruppe }
    // Basisbau: instanzierte Böden/Wände/Dächer, roter Baugebiet-Ring (nur der Besitzer sieht ihn) und Ring fürs Flaggen-Hologramm
    initialisiereBasisbauModelle({ mitSchnitt: (m) => this.#mitSchnitt(m) });
    this.basisbau = new BasisbauSchicht(this.szene);
    this.gebietRing = erzeugeGebietRing(0xff3b30);
    this.gebietVorschau = erzeugeGebietRing(0x7dff6a);
    this.szene.add(this.gebietRing.mesh, this.gebietVorschau.mesh);
    this.fahrzeuge = new Map(); // Fahrzeug-ID → Gruppe
    this.tiere = new Map(); // Tier-ID → { gruppe, aktualisiere }
    this.angelnde = new Map(); // Spieler-ID → Angel-Darstellung (Rute, Schnur, Pose)
    this.wetterEffekt = new WetterEffekt(this.szene); // Regen-Striche + weiche Übergänge für Nebel/Licht
    this.aufschlaege = []; // Werkzeug-Treffer der Figuren in diesem Bild (#merkeAufschlag → clientSpiel: Hack-Sound)
    this.fahrZoom = 1; // Kamera geht beim Fahren etwas weiter weg

    // Adaptive Qualität (siehe QUALITAETS_STUFEN)
    this.aufloesungMax = Math.min(window.devicePixelRatio || 1, this.istHandy ? 1.5 : 2);
    this.stufe = 0;
    this.aufloesung = this.#stufenAufloesung();
    this.#setzeStufe(this.#startStufe());
    this.mond.castShadow = this.#profil().sonnenschatten;
    this.messung = { frames: 0, zeit: 0, seit: 0 };
    this.messenAb = 0;
    // Zoom (Mausrad / zwei Finger), gemerkt im Browser
    this.zoom = 1;
    try {
      const z = Number(localStorage.getItem('browserSurvival.zoom'));
      if (z >= ZOOM_MIN) this.zoom = Math.min(z, ZOOM_MAX); // älteres, weiteres Zoom-Maximum wird gekappt
    } catch {
      // egal
    }
    this.letzterSchaden = -1;
    this.overlayBenutzt = false;

    this.#groesseAnpassen();
    window.addEventListener('resize', () => this.#groesseAnpassen());
    window.visualViewport?.addEventListener('resize', () => this.#groesseAnpassen());
  }

  anzeigen() {
    this.leinwand.hidden = false;
    if (this.vignette) this.vignette.hidden = false;
  }

  verbergen() {
    this.leinwand.hidden = true;
    if (this.vignette) this.vignette.hidden = true;
    if (this.schadenEbene) this.schadenEbene.style.opacity = '0';
    this.leeren();
  }

  leeren() {
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /** Rein-/Rauszoomen. @param faktor > 1 = raus, < 1 = rein */
  zoomen(faktor) {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * faktor));
    this.#kameraAbstand();
    try {
      localStorage.setItem('browserSurvival.zoom', this.zoom.toFixed(3));
    } catch {
      // egal
    }
  }

  /** Touch-Knopf 🔍: normal → weiter weg → näher dran → normal … */
  naechsteZoomStufe() {
    const stufen = [1, ZOOM_MAX, 0.6];
    const i = stufen.findIndex((z) => Math.abs(z - this.zoom) < 0.05);
    this.zoomen(stufen[(i + 1) % stufen.length] / this.zoom);
  }

  /** Nach dem Betreten erst messen, wenn alles warm ist (sonst landet man wegen der Ladeframes gleich auf "unscharf"). */
  aufwaermen(jetzt = performance.now()) {
    this.messenAb = jetzt + AUFWAERM_MS;
    this.messung = { frames: 0, zeit: 0, seit: this.messenAb };
  }

  /** Admin-Nachtsicht: Szene immer taghell. @returns neuer Zustand */
  nachtsichtUmschalten() {
    this.nachtsicht = !this.nachtsicht;
    return this.nachtsicht;
  }

  setzeAssets(assets) {
    this.assets = assets;
  }

  /**
   * Ladebildschirm: Karte der Zone in Portionen bauen (Seite bleibt bedienbar, Balken läuft) – setzeWelt übernimmt sie dann.
   * @param beiFortschritt (0..1) → void
   */
  async bereiteVor(welt, beiFortschritt = () => {}) {
    this.vorbereitet = null;
    const bauer = KartenModell.baueSchrittweise({ welt, assets: this.assets, gl: this.gl, mitSchnitt: (m) => this.#mitSchnitt(m), bodenMassstab: this.#bodenMassstab(welt) });
    const modell = bauer.next().value;
    const bloecke = Math.max(1, Math.ceil(welt.breite / BODEN_BLOCK) * Math.ceil(welt.hoehe / BODEN_BLOCK));
    let schritt = { done: false };
    let rest = 0; // Schritte nach dem Boden (Wände, Möbel, Bäume …)
    while (!schritt.done) {
      const ende = performance.now() + 40;
      while (performance.now() < ende && !(schritt = bauer.next()).done) if ((modell.bodenBloecke?.length ?? 0) >= bloecke) rest++;
      // Boden ≈ 90 % der Arbeit, die übrigen ~10 Schritte teilen sich den Rest
      beiFortschritt(Math.min(0.99, (0.9 * (modell.bodenBloecke?.length ?? 0)) / bloecke + rest * 0.01));
      await new Promise((r) => setTimeout(r, 0));
    }
    this.vorbereitet = { welt, modell: schritt.value };
    beiFortschritt(1);
  }

  /** Baut die statische Szene aus der Welt und kompiliert alle Shader vor (dauert kurz, danach ruckelfrei). */
  setzeWelt(welt) {
    this.welt = welt;
    if (this.karte) {
      // Zonenwechsel/Neu-Login: alte Karte raus und ihre Geometrie freigeben (Grafikspeicher; geteilte
      // Geometrie lädt three.js bei Bedarf einfach neu hoch – Materialien/Texturen bleiben)
      this.szene.remove(this.karte.statisch, this.karte.beweglich);
      for (const teil of [this.karte.statisch, this.karte.beweglich]) teil.traverse((o) => o.geometry?.dispose());
      for (const t of this.karte.bodenTexturen) t.dispose();
    }
    if (this.natur) {
      this.szene.remove(this.natur.gruppe);
      this.natur.freigeben();
      this.natur = null;
    }
    for (const b of this.fallendeBaeume) this.szene.remove(b.gruppe);
    this.fallendeBaeume.length = 0;
    for (const l of this.fallendeLaternen) this.szene.remove(l.gruppe);
    this.fallendeLaternen.length = 0;
    for (const f of this.figuren.values()) this.szene.remove(f.gruppe);
    this.figuren.clear();
    for (const g of this.fahrzeuge.values()) this.szene.remove(g);
    this.fahrzeuge.clear();
    for (const t of this.tiere.values()) this.szene.remove(t.gruppe);
    this.tiere.clear();
    for (const m of this.items.values()) this.szene.remove(m);
    this.items.clear();
    for (const a of this.angelnde.values()) a.freigeben();
    this.angelnde.clear();
    for (const b of this.bauwerke.values()) this.szene.remove(b.gruppe);
    this.bauwerke.clear();
    this.bauwerkeStand = -1;
    this.basisbau.leeren();
    this.gebietRing.verstecke();
    this.gebietVorschau.verstecke();
    this.zeigeVorschau(null);
    this.blaetter?.entfernen();
    this.blaetter = new BlaetterEffekt(this.szene, welt);
    this.reifenspuren.setzeWelt(welt);
    // vom Ladebildschirm schon gebaut (bereiteVor) – sonst am Stück
    this.karte = this.vorbereitet?.welt === welt
      ? this.vorbereitet.modell
      : new KartenModell({ welt, assets: this.assets, gl: this.gl, mitSchnitt: (m) => this.#mitSchnitt(m), bodenMassstab: this.#bodenMassstab(welt) });
    this.vorbereitet = null;
    this.karte.bodenHochladen(0, 0, Infinity); // hinter dem Ladebild: alles auf einmal
    this.szene.add(this.karte.statisch, this.karte.beweglich);
    this.natur = this.naturModelle ? NaturSchicht.erzeuge(welt, this.naturModelle, (x, z) => this.#hy(x, z), this.istHandy) : null;
    if (this.natur) {
      this.natur.gruppe.visible = this.#profil().natur !== false;
      this.szene.add(this.natur.gruppe);
    }
    this.karte.setzeBaumDetail(QUALITAETS_STUFEN[this.stufe].baumDetail);
    this.#vorkompilieren();
    this.aufwaermen();
  }

  /** Kurzinfo für das Debug-Overlay (F3). */
  statistik() {
    const info = this.gl.info.render;
    const profil = this.grafik === 'auto' ? `Auto→${this.autoProfil}` : this.grafik;
    const lichter = this.taschenlampen.length + this.lampenPool.length + this.kegelPool.length + this.muendungslichter.length + this.scheinwerfer.length + 1;
    return `Draw-Calls ${info.calls} · Dreiecke ${Math.round(info.triangles / 1000)}k · ${profil} · Qualität ${this.stufe} · Auflösung ${this.aufloesung.toFixed(2)} · Lichter ${lichter} · Zoom ${this.zoom.toFixed(2)}\nGPU ${this.geraet.gpu || '?'}`;
  }

  /**
   * @param tageszeit  { helligkeit 0..1, istNacht, anteil } (gemeinsam/tageszeit.js)
   */
  zeichne({ fokus, entitaeten, gegenstaende, itemDefinitionen = {}, jetzt, effekte = null, markiertId = null, zielId = null, tageszeit = null, wetter = 'klar' }) {
    const roh = this.letzteZeit ? (jetzt - this.letzteZeit) / 1000 : 0;
    const dt = Number.isFinite(roh) ? Math.max(0, Math.min(0.1, roh)) : 0; // Runde 26: nie negativ/NaN (sonst kippen Wetter/Nebel dauerhaft)
    this.letzteZeit = jetzt;
    this.itemDefinitionen = itemDefinitionen; // Kleidungsfarben (#setzeKleidung)
    this.bildNr = (this.bildNr + 1) % 1e6;
    this.#passeAufloesungAn(dt, jetzt);

    // Kamera folgt weich dem eigenen Spieler (im Auto etwas weiter weg – man ist schneller)
    this.fahrZoom += ((fokus.fahrzeugId ? 1.3 : 1) - this.fahrZoom) * Math.min(1, dt * 2);
    // Gelände (Editor 2.0, 2.5): Kamera folgt auch der Höhe – weich, damit Rampen nicht ruckeln
    // ⚠ Ein einziger ungültiger Fokus (NaN, z. B. kurz beim Respawn) machte Kamera/Höhe dauerhaft NaN → schwarzes Bild, Figur weg
    // (Runde 18: „nach dem Respawn in der Nacht sieht man nichts mehr“). Ungültige Werte nie in die weichen Nachführ-Größen übernehmen.
    if (Number.isFinite(fokus.x) && Number.isFinite(fokus.y)) this.letzterFokus = { x: fokus.x, y: fokus.y };
    this.fokusId = fokus.id;
    const fx = this.letzterFokus?.x ?? 0;
    const fy = this.letzterFokus?.y ?? 0;
    const bodenY = this.#hy(fx, fy);
    if (!Number.isFinite(this.kameraHoehe)) this.kameraHoehe = bodenY;
    this.kameraHoehe += (bodenY - this.kameraHoehe) * Math.min(1, dt * 6);
    _ziel.set(fx, this.kameraHoehe, fy);
    _kameraZiel.copy(this.kameraVersatz).multiplyScalar(this.fahrZoom).add(_ziel);
    const kp = this.kamera3d.position;
    // Ich-Ansicht: Kamera nicht weich nachziehen (der Haken setzt sie ins Auge) – sonst schwankt istAbstand mit der Bildzeit und Nebel/Sichtweite pulsieren
    if (this.egoHaken || !Number.isFinite(kp.x + kp.y + kp.z)) kp.copy(_kameraZiel);
    else kp.lerp(_kameraZiel, Math.min(1, dt * 8) || 1);
    this.kamera3d.lookAt(_ziel.x, _ziel.y, _ziel.z - 20);
    const wackeln = this.egoHaken ? 0 : (this.sonderEffekte?.wackeln ?? 0); // Runde 24: Explosion in der Nähe
    if (wackeln > 0.01) kp.add(_wackelVersatz.set((Math.random() - 0.5) * 14 * wackeln, (Math.random() - 0.5) * 8 * wackeln, (Math.random() - 0.5) * 14 * wackeln));
    // Tatsächlicher Abstand (Kamera gleitet weich nach): Nebel/Ferne/Himmel daran koppeln, nicht an den Zielzoom –
    // sonst endet die Welt beim Reinzoomen kurz zu früh und der Himmel legt sich wie ein heller Schleier von oben drüber
    const istAbstand = this.kamera3d.position.distanceTo(_ziel) / KAMERA_VERSATZ.length();
    this.istAbstand = Number.isFinite(istAbstand) && istAbstand > 0 ? istAbstand : undefined;
    this.schnitt.uFokus.value.set(fokus.x, _ziel.y, fokus.y);
    this.wetterEffekt.setzeArt(wetter);
    this.wetterEffekt.aktualisiere(dt, fokus.x, fokus.y, !!this.welt?.istInnen(fokus.x, fokus.y) && !fokus.fahrzeugId);
    this.wetterEffekt.setzeInnenMaske(this.welt); // kein Regen im Haus (nur bei Niederschlag und geänderten Bauwerken neu)
    BAUM_WIND.uWindStufe.value = this.wetterEffekt.windStufe;
    BAUM_WIND.uWindZeit.value = this.wetterEffekt.windZeit % 600;
    const dunkel = this.#tageslicht(tageszeit, _ziel);
    this.dunkel = this.nachtsicht ? 1 - (tageszeit?.helligkeit ?? 1) : dunkel; // für Haltungen (Lampe nur nachts vorn)

    this.karte.aktualisiere(dt, dunkel, fokus);
    this.karte.aktualisiereDaecher(fokus.x, fokus.y);
    this.#innenAbschirmung(dt, fokus);
    this.karte.aktualisiereDurchsicht(dt, fokus.x, fokus.y, !this.egoHaken);
    this.natur?.aktualisiere(fokus, this.welt.bauwerkeVersion, !!this.egoHaken);
    const tuerAbstand = this.karte.aktualisiereTuerSchimmer(fokus);
    this.blaetter?.aktualisiere(dt, fokus, jetzt, dunkel, Math.max(this.wetterEffekt.sturm, (this.wetterEffekt.windStufe - 1.2) / 3));
    this.#aktualisiereFahrzeuge(entitaeten, fokus);
    this.#aktualisiereFiguren(entitaeten, fokus, dt, jetzt);
    this.egoHaken?.(this.kamera3d, fokus); // EGO-PROTOTYP (client/ego/, siehe EGO_PROTOTYP.md)
    this.#aktualisiereTiere(entitaeten, fokus, jetzt);
    this.#aktualisiereAngeln(entitaeten, fokus, jetzt);
    this.#aktualisiereTaschenlampen(entitaeten, fokus, dunkel);
    this.#aktualisiereScheinwerfer(entitaeten, fokus, dunkel);
    this.#aktualisiereItems(gegenstaende, markiertId, jetzt);
    this.#aktualisiereZielRing(entitaeten, zielId, jetzt);
    this.#aktualisiereFallendeBaeume(dt);
    this.#aktualisiereFallendeLaternen(dt);
    this.#aktualisiereBauwerke(jetzt, fokus);
    this.gebietRing.animiere(jetzt);
    this.gebietVorschau.animiere(jetzt);
    this.fussspuren.aktualisiere(entitaeten, jetzt);
    this.reifenspuren.aktualisiere(entitaeten, jetzt);
    this.#aktualisiereLampenPool(fokus, jetzt, dunkel);
    if (effekte) {
      effekte.aktualisiere(dt, jetzt);
      this.#aktualisiereEffekte(effekte.zustand);
    }

    // Runde 18 (4.1): Sichtweiten-Culling – Blöcke jenseits von Nebelweite + Puffer gar nicht erst zeichnen (auch nicht im Schattendurchgang)
    let weite = (this.szene.fog?.far ?? Infinity) + SICHT_PUFFER;
    // Runde 26: drinnen (abgeschirmt) nur noch bis zur entferntesten Gebäudeecke zeichnen – draußen ist eh alles weggeschnitten
    if (this.innenAnteil > 0.99 && this.innenBox) {
      const b = this.innenBox;
      const kp = this.kamera3d.position;
      const dx = Math.max(Math.abs(kp.x - b.x0), Math.abs(kp.x - b.x1));
      const dz = Math.max(Math.abs(kp.z - b.z0), Math.abs(kp.z - b.z1));
      weite = Math.min(weite, Math.hypot(dx, dz, kp.y) + 2 * (this.welt?.kachelGroesse ?? 32));
    }
    this.karte.kulle(this.kamera3d.position, weite);

    this.gl.render(this.szene, this.kamera3d);
    this.#zeichneSilhouette(fokus);
    this.#zeichneTuerUmrisse(tuerAbstand);
    this.#zeichneOverlay(entitaeten, fokus, gegenstaende, itemDefinitionen);
    if (this.ruhigWarter) this.#pruefeRuhig(dt, jetzt);
  }

  /** Grauer Umriss der eigenen Figur, wo Wände/Dächer/Bäume sie verdecken (zweiter Durchgang, nur Figur-Ebene). */
  #zeichneSilhouette(fokus) {
    const figur = this.figuren.get(fokus.id);
    if (!figur || !figur.gruppe.visible || fokus.fahrzeugId) return;
    figur.gruppe.traverse((o) => o.layers.enable(SILHOUETTE_EBENE)); // Waffe/Haare wechseln → jedes Mal (≈50 Objekte)
    const { gl, szene, kamera3d } = this;
    const schatten = gl.shadowMap.autoUpdate;
    const ebenen = kamera3d.layers.mask;
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = false;
    const hintergrund = szene.background;
    szene.background = null; // eine Farb-Hintergrund würde den Bildpuffer sonst bei jedem render() löschen
    kamera3d.layers.set(SILHOUETTE_EBENE);
    szene.overrideMaterial = SILHOUETTE_MARKE;
    gl.render(szene, kamera3d);
    szene.overrideMaterial = SILHOUETTE_GRAU;
    gl.render(szene, kamera3d);
    szene.overrideMaterial = null;
    szene.background = hintergrund;
    kamera3d.layers.mask = ebenen;
    gl.autoClear = true;
    gl.shadowMap.autoUpdate = schatten;
  }

  /** Zusätzlicher Durchgang: Türen (Ebene TUER_EBENE), die von Wänden verdeckt sind, als goldener Schimmer. */
  #zeichneTuerUmrisse(abstand) {
    if (!(abstand < TUER_SCHIMMER_WEITE)) return; // keine Tür in der Nähe
    // je näher an der Tür, desto deutlicher (schwach am Rand der Reichweite)
    TUER_UMRISS.opacity = 0.12 + 0.3 * Math.min(1, (TUER_SCHIMMER_WEITE - abstand) / (TUER_SCHIMMER_WEITE * 0.6));
    const { gl, szene, kamera3d } = this;
    const schatten = gl.shadowMap.autoUpdate;
    const ebenen = kamera3d.layers.mask;
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = false;
    const hintergrund = szene.background;
    szene.background = null;
    kamera3d.layers.set(TUER_EBENE);
    szene.overrideMaterial = TUER_UMRISS;
    gl.render(szene, kamera3d);
    szene.overrideMaterial = null;
    szene.background = hintergrund;
    kamera3d.layers.mask = ebenen;
    gl.autoClear = true;
    gl.shadowMap.autoUpdate = schatten;
  }

  /**
   * Gefällter Baum kippt um – weg vom Holzfäller (sx/sy). Ablauf passend zum Geräusch 'baum_faellt':
   * 0–1 s knarzen (leichtes Neigen), 1–1,65 s fallen (immer schneller), Aufschlag + Nachfedern, ab 2,4 s versinken.
   */
  baumFaellt({ id, x, y, sx, sy }) {
    const gruppe = this.karte?.baumKopie(id);
    if (!gruppe) return;
    let dx = x - (sx ?? x - 1);
    let dz = y - (sy ?? y);
    const laenge = Math.hypot(dx, dz) || 1;
    dx /= laenge;
    dz /= laenge;
    this.szene.add(gruppe);
    // Drehachse senkrecht zur Fallrichtung (rechte Hand: Spitze kippt Richtung +dx/+dz)
    this.fallendeBaeume.push({ gruppe, achse: new THREE.Vector3(dz, 0, -dx), zeit: 0 });
  }

  /**
   * Umgefahrene Straßenlaterne knickt weg vom Fahrzeug (sx/sy) um: schnell fallen, kurz federn, liegen bleiben, dann versinken.
   * Der Mast selbst ist in der Karte schon ausgeblendet (kartenModell #zeigeLaternen).
   */
  laterneFaellt({ id, x, y, sx, sy }) {
    const gruppe = this.karte?.laterneKopie(id);
    if (!gruppe) return;
    let dx = x - (sx ?? x - 1);
    let dz = y - (sy ?? y);
    const laenge = Math.hypot(dx, dz) || 1;
    dx /= laenge;
    dz /= laenge;
    this.szene.add(gruppe);
    this.fallendeLaternen.push({ gruppe, achse: new THREE.Vector3(dz, 0, -dx), zeit: 0 });
  }

  #aktualisiereFallendeLaternen(dt) {
    for (let i = this.fallendeLaternen.length - 1; i >= 0; i--) {
      const l = this.fallendeLaternen[i];
      l.zeit += dt;
      const t = l.zeit;
      // 0–0,45 s kippen (immer schneller), danach zweimal federn
      const winkel = t < 0.45 ? (Math.PI / 2 - 0.05) * (t / 0.45) ** 2 : Math.PI / 2 - 0.05 + Math.abs(Math.sin((t - 0.45) * 12)) * 0.12 * Math.exp(-(t - 0.45) * 5) * -1;
      l.gruppe.quaternion.setFromAxisAngle(l.achse, Math.min(Math.PI / 2, Math.max(0, winkel)));
      if (t > 2.2) {
        const rest = Math.max(0, 1 - (t - 2.2) / 0.8);
        l.gruppe.scale.setScalar(rest);
      }
      if (t > 3.1) {
        this.szene.remove(l.gruppe);
        this.fallendeLaternen.splice(i, 1);
      }
    }
  }

  /** Autos: ein Mesh pro Fahrzeug, Position/Drehung jedes Frame (Front = +z → Drehung wie bei Figuren). */
  #aktualisiereFahrzeuge(entitaeten, fokus) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'fahrzeug') continue;
      gesehen.add(e.id);
      let g = this.fahrzeuge.get(e.id);
      if (!g) {
        g = erzeugeFahrzeugModell(e.modell, e.laenge, e.breite);
        this.fahrzeuge.set(e.id, g);
        this.szene.add(g);
      }
      g.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      g.position.set(e.x, this.#hy(e.x, e.y), e.y);
      g.rotation.y = Math.PI / 2 - e.winkel;
      if (!g.userData.wrack && g.visible) {
        // Karosserie neigt sich in Kurven nach außen und beim Anfahren/Bremsen nach hinten/vorn (nur Optik)
        const anteil = Math.max(-1, Math.min(1, (e.tempo ?? 0) / FAHRZEUG.max));
        const vorher = g.userData.tempo ?? e.tempo ?? 0;
        g.userData.tempo = e.tempo ?? 0;
        const nicken = Math.max(-1, Math.min(1, ((e.tempo ?? 0) - vorher) / 6));
        const mesh = g.children[0];
        mesh.rotation.z += (-(e.lenkung ?? 0) * Math.abs(anteil) * 0.07 - mesh.rotation.z) * 0.2;
        mesh.rotation.x += (-nicken * 0.03 - mesh.rotation.x) * 0.15;
      }
      if (e.kaputt && !g.userData.wrack) macheWrack(g);
      if (g.userData.wrack) animiereWrack(g, performance.now());
    }
    for (const [id, g] of this.fahrzeuge) {
      if (gesehen.has(id)) continue;
      this.szene.remove(g);
      this.fahrzeuge.delete(id);
    }
  }

  /** Tiere (Hasen): ein Modell pro Tier, hüpft beim Laufen. */
  #aktualisiereTiere(entitaeten, fokus, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'tier') continue;
      gesehen.add(e.id);
      let t = this.tiere.get(e.id);
      if (!t) {
        t = erzeugeTier(e.art, e.id);
        this.tiere.set(e.id, t);
        this.szene.add(t.gruppe);
      }
      t.gruppe.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      if (!t.gruppe.visible) continue;
      t.gruppe.position.set(e.x, this.#hy(e.x, e.y), e.y);
      t.gruppe.rotation.y = Math.PI / 2 - e.blick;
      t.aktualisiere(e, jetzt);
    }
    for (const [id, t] of this.tiere) {
      if (gesehen.has(id)) continue;
      this.szene.remove(t.gruppe);
      this.tiere.delete(id);
    }
  }

  /** Angelnde Spieler: Rute in der Hand, Schnur, Pose im Wasser (e.angeln kommt vom Server). */
  #aktualisiereAngeln(entitaeten, fokus, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' || !e.angeln || e.tot) continue;
      gesehen.add(e.id);
      let a = this.angelnde.get(e.id);
      if (!a) {
        a = erzeugeAngel();
        this.angelnde.set(e.id, a);
        this.szene.add(a.gruppe);
      }
      a.gruppe.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      if (a.gruppe.visible) a.aktualisiere(e, jetzt);
    }
    for (const [id, a] of this.angelnde) {
      if (gesehen.has(id)) continue;
      a.freigeben();
      this.angelnde.delete(id);
    }
  }

  /**
   * Bauwerke der Welt als 3D-Gruppen – neu aufbauen nur, wenn sich die Liste geändert hat (bauwerkeVersion).
   * Viele gleiche Basisbau-Teile (Boden, Wand, Dach …) zeichnet stattdessen die BasisbauSchicht instanziert.
   */
  #aktualisiereBauwerke(jetzt, fokus) {
    const welt = this.welt;
    this.basisbau.aktualisiere(welt, fokus);
    if (welt.bauwerkeVersion !== this.bauwerkeStand) {
      this.bauwerkeStand = welt.bauwerkeVersion;
      const g = welt.kachelGroesse;
      for (const [id, b] of this.bauwerke) {
        const jetztB = welt.bauwerke.get(id);
        // Ausgerichtete Einzelstücke (Tür, Bett) neu stellen, wenn sich die Richtung ändert – sonst nur bei Typwechsel
        if (jetztB?.typ === b.typ && (jetztB.drehung ?? 0) === b.drehung && zaunMaske(welt, jetztB) === b.maske) continue;
        this.szene.remove(b.gruppe);
        this.bauwerke.delete(id);
      }
      for (const b of welt.bauwerke.values()) {
        if (this.bauwerke.has(b.id) || wirdInstanziert(b.typ)) continue;
        const maske = zaunMaske(welt, b);
        const neu = erzeugeBauwerk(maske ? { ...b, maske } : b);
        neu.typ = b.typ;
        neu.drehung = b.drehung ?? 0;
        neu.maske = maske;
        neu.gruppe.position.set((b.tx + 0.5) * g, this.#hy((b.tx + 0.5) * g, (b.ty + 0.5) * g), (b.ty + 0.5) * g);
        neu.gruppe.rotation.y = bauwerkDrehungY(b);
        this.szene.add(neu.gruppe);
        this.bauwerke.set(b.id, neu);
      }
      // Brennende Lagerfeuer leuchten (über den Lampen-Pool) – Runde 24: auch Kamin, Kerzen, Öllampen und Strom-Lampen (einrichtung.js)
      this.stromAn = new Set([...welt.bauwerke.values()].filter((b) => LICHTER[b.typ]?.strom && hatStrom(welt, b.tx, b.ty)).map((b) => b.id));
      this.feuerLampen = [...welt.bauwerke.values()]
        .filter((b) => (b.typ === 'lagerfeuer' && b.brennt) || leuchtet(welt, b))
        .map((b) => {
          const l = LICHTER[b.typ];
          return l
            ? { x: (b.tx + 0.5) * g, y: l.hoehe, z: (b.ty + 0.5) * g, farbe: new THREE.Color(l.farbe), reichweite: l.reichweite, staerke: l.staerke, objekt: { feuer: !!l.flackern, x: b.tx, y: b.ty } }
            : { x: (b.tx + 0.5) * g, y: 22, z: (b.ty + 0.5) * g, farbe: new THREE.Color(0xff9a40), reichweite: 300, staerke: 320, objekt: { feuer: true, x: b.tx, y: b.ty } };
        });
      this.naechsteLampen = null;
    }
    for (const [id, b] of this.bauwerke) b.aktualisiere(welt.bauwerke.get(id), jetzt, this.stromAn?.has(id) ?? false);
  }

  /**
   * Eigenes Baugebiet als roter Ring (nur der Besitzer kennt es, siehe SPIELER_DATEN.flagge) – oder null/false = aus.
   * @param gebiet { tx, ty, radius } in Kacheln
   */
  zeigeGebiet(gebiet) {
    if (!gebiet) return this.gebietRing.verstecke();
    const g = this.welt.kachelGroesse;
    this.gebietRing.setze((gebiet.tx + 0.5) * g, (gebiet.ty + 0.5) * g, (gebiet.radius + 0.5) * g);
  }

  /** Vorschau-Ring beim Platzieren der Flagge: { tx, ty, radius, ok } oder null. */
  zeigeGebietVorschau(daten) {
    if (!daten) return this.gebietVorschau.verstecke();
    const g = this.welt.kachelGroesse;
    this.gebietVorschau.setze((daten.tx + 0.5) * g, (daten.ty + 0.5) * g, (daten.radius + 0.5) * g, daten.ok ? 0x7dff6a : 0xff4a3a);
  }

  /** Platzier-Vorschau: { typ, tx, ty, ok } oder null (weg). */
  zeigeVorschau(daten) {
    if (!daten || daten.tx === undefined) {
      if (this.vorschau) this.szene.remove(this.vorschau.gruppe);
      this.vorschau = null;
      return;
    }
    if (this.vorschau?.typ !== daten.typ) {
      if (this.vorschau) this.szene.remove(this.vorschau.gruppe);
      this.vorschau = { typ: daten.typ, gruppe: erzeugeVorschau(daten.typ), ok: null };
      this.szene.add(this.vorschau.gruppe);
    }
    const g = this.welt.kachelGroesse;
    const n = daten.groesse ?? 1; // Blöcke (2×2): Hologramm über die ganze Fläche
    this.vorschau.gruppe.position.set((daten.tx + n / 2) * g, 0.2 + this.#hy((daten.tx + n / 2) * g, (daten.ty + n / 2) * g), (daten.ty + n / 2) * g);
    this.vorschau.gruppe.scale.set(n, 1, n);
    this.vorschau.gruppe.rotation.y = (daten.drehung ?? 0) * (Math.PI / 2); // nur Teile mit Richtung bekommen drehung != 0
    if (daten.typ === 'abriss') this.vorschau.gruppe.userData.kasten.scale.y = markierungsHoehe(daten.ziel);
    if (this.vorschau.ok !== daten.ok) {
      this.vorschau.ok = daten.ok;
      this.vorschau.gruppe.userData.setzeOk(daten.ok);
    }
  }

  #aktualisiereFallendeBaeume(dt) {
    for (let i = this.fallendeBaeume.length - 1; i >= 0; i--) {
      const b = this.fallendeBaeume[i];
      b.zeit += dt;
      const t = b.zeit;
      let winkel;
      if (t < 1) winkel = 0.1 * (t * t) + Math.sin(t * 22) * 0.008 * t; // knarzt und neigt sich
      else if (t < 1.65) winkel = 0.1 + (Math.PI / 2 - 0.12) * ((t - 1) / 0.65) ** 2; // fällt
      else winkel = Math.PI / 2 - 0.02 - Math.abs(Math.sin((t - 1.65) * 14)) * 0.06 * Math.exp(-(t - 1.65) * 6); // federt nach
      b.gruppe.quaternion.setFromAxisAngle(b.achse, winkel);
      if (t > 2.4) {
        const rest = Math.max(0, 1 - (t - 2.4) / 1.2);
        b.gruppe.scale.setScalar(rest);
        b.gruppe.position.y = this.#hy(b.gruppe.position.x, b.gruppe.position.z) - (1 - rest) * 10;
      }
      if (t > 3.6) {
        this.szene.remove(b.gruppe);
        this.fallendeBaeume.splice(i, 1);
      }
    }
  }

  /** Promise: erfüllt, sobald 10 Frames hintereinander flott waren (max. 5 s) – für den Ladebildschirm. */
  warteBisRuhig() {
    return new Promise((erfuellen) => {
      this.ruhigWarter = { erfuellen, start: performance.now(), frames: 0, flott: 0 };
    });
  }

  #pruefeRuhig(dt, jetzt) {
    const w = this.ruhigWarter;
    w.frames++;
    w.flott = dt > 0 && dt < 1 / 30 ? w.flott + 1 : 0;
    if ((w.frames > 20 && w.flott >= 10) || jetzt - w.start > 5000) {
      this.ruhigWarter = null;
      this.aufwaermen(jetzt);
      w.erfuellen();
    }
  }

  // ---------------------------------------------------------------------------
  // Aufbau

  async #ladeFiguren() {
    const info = this.assets?.atlas.figuren3d;
    if (!info) throw new Error('3D-Figuren fehlen im Atlas');
    const [modell, clipsJson] = await Promise.all([
      new FBXLoader().loadAsync(new URL(info.modell, ASSETS).href),
      fetch(new URL(info.animationen, ASSETS)).then((a) => a.json()),
    ]);
    this.clips = Object.fromEntries(Object.entries(clipsJson).map(([name, json]) => [name, THREE.AnimationClip.parse(json)]));
    const groesse = new THREE.Box3().setFromObject(modell).getSize(new THREE.Vector3());
    this.modellMassstab = FIGUR_HOEHE / groesse.y;
    this.basisModell = modell;
    const lader = new THREE.TextureLoader();
    this.skins = {};
    await Promise.all([this.#ladeSurvivor(), this.#ladeZombieModelle()]);
    await Promise.all(
      Object.entries(info.skins).map(async ([name, pfad]) => {
        const textur = await lader.loadAsync(new URL(pfad, ASSETS).href);
        textur.colorSpace = THREE.SRGBColorSpace;
        textur.flipY = true;
        this.skins[name] = textur;
      }),
    );
  }

  /** Zusätzliche Zombie-Modelle (ZOMBIE_MODELLE) laden; fehlt eins, tragen die Zombies die alte Kenney-Figur. */
  async #ladeZombieModelle() {
    this.zombieModelle = {};
    await Promise.all(
      Object.entries(ZOMBIE_MODELLE).map(async ([name, def]) => {
        try {
          const gltf = await new GLTFLoader().loadAsync(new URL(def.datei, ASSETS).href);
          const modell = gltf.scene;
          // ⚠ Skelett-Modelle erst nach Matrix-/Skelett-Update messen (sonst ~100× falsch, siehe KI_INDEX §18)
          modell.updateMatrixWorld(true);
          modell.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.frustumCulled = false;
            if (o.isSkinnedMesh) {
              o.skeleton.update();
              o.geometry.boundingBox = null;
            }
          });
          const hoehe = new THREE.Box3().setFromObject(modell, true).getSize(new THREE.Vector3()).y;
          const clips = {};
          for (const [spiel, clipName] of Object.entries(def.klips)) {
            const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations.find((c) => c.name.endsWith(`|${clipName}`));
            if (clip) clips[spiel] = clip;
          }
          if (!clips.stehen || !(hoehe > 0)) return;
          this.zombieModelle[name] = { modell, clips, massstab: (FIGUR_HOEHE * def.hoehe) / hoehe, def };
        } catch (fehler) {
          console.warn(`Zombie-Modell ${def.datei} nicht geladen`, fehler);
        }
      }),
    );
  }

  /** Spielerfiguren (je ein GLB für Mann/Frau) laden; fehlt eine, bleibt die alte Kenney-Figur. */
  async #ladeSurvivor() {
    this.survivor = null;
    try {
      const figuren = {};
      await Promise.all(
        Object.entries(SURVIVOR).map(async ([name, pfad]) => {
          const gltf = await new GLTFLoader().loadAsync(new URL(pfad, ASSETS).href);
          const hoehe = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
          const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
          figuren[name] = { modell: gltf.scene, clips, massstab: FIGUR_HOEHE / hoehe, materialien: new Map() };
        }),
      );
      this.survivor = figuren;
    } catch (fehler) {
      console.warn('Spielerfiguren nicht geladen – benutze die Standardfigur', fehler);
    }
  }

  /**
   * Alle Shader-Varianten jetzt kompilieren und Texturen hochladen, nicht erst wenn sie zum ersten Mal ins Bild
   * kommen (das waren die Ruckler beim Start): je eine Figur pro Aussehen, jede Waffe, ein Item, ein Blutfleck.
   */
  #vorkompilieren() {
    const probe = new THREE.Group();
    probe.position.set(this.welt.pixelBreite / 2, 0, this.welt.pixelHoehe / 2);
    const figuren = [
      ...Object.keys(AUSSEHEN.koerper.optionen).map((koerper) => ({ id: -1, typ: 'spieler', aussehen: { koerper } })),
      ...['normal', 'laeufer', 'brocken', 'halb', 'sprinter', 'spucker', 'gepanzert', 'explosiv'].map((variante) => ({ id: 2, typ: 'zombie', variante })),
      { id: 1, typ: 'zombie', variante: 'normal' }, // grüner Zombie (zombieModellFuer)
    ];
    for (const e of figuren) {
      const f = this.#neueFigur(e);
      this.szene.remove(f.gruppe);
      probe.add(f.gruppe);
    }
    for (const name of WAFFEN_NAMEN) probe.add(erzeugeWaffe(name));
    for (const modell of Object.keys(FAHRZEUG_MODELLE)) probe.add(erzeugeFahrzeugModell(modell, 150, 70));
    for (const typ of Object.keys(INSTANZ_TYPEN)) {
      // Instanzierte Basisbau-Teile haben eine eigene Shader-Variante (USE_INSTANCING)
      const m = new THREE.InstancedMesh(bauteilGeometrie(typ), BASIS_MATERIAL, 1);
      m.castShadow = m.receiveShadow = true;
      probe.add(m);
    }
    for (const typ of ['werkbank', 'lagerfeuer', 'falle', 'beet', 'kiste', 'holztuer', 'zaun', 'zauntor', 'bett', 'flagge', 'abriss']) {
      if (typ === 'abriss') {
        probe.add(erzeugeVorschau(typ));
        continue;
      }
      const zustand = { typ, brennt: true, gespannt: true, pflanze: 'tomate', wachstum: 1 };
      const b = erzeugeBauwerk(zustand);
      b.aktualisiere(zustand, 0);
      probe.add(b.gruppe, erzeugeVorschau(typ));
    }
    const icon = new THREE.Mesh(this.#itemMaterial('apfel').geometrie, this.#itemMaterial('apfel').markiert);
    probe.add(icon, this.#itemMesh({ id: -2, defId: 'apfel', x: 0, y: 0 }), this.#blutMesh({ sprite: 'blutlache', groesse: 10, winkel: 0, x: 0, y: 0 }));
    this.szene.add(probe);
    this.lampenPool.forEach((l) => (l.intensity = 1));
    this.kegelPool.forEach((l) => (l.intensity = 1));
    for (const ring of [this.gebietRing, this.gebietVorschau]) {
      const kopie = ring.mesh.clone();
      kopie.visible = true;
      probe.add(kopie);
    }
    this.karte.kulle(this.kamera3d.position, Infinity); // alle Blöcke sichtbar, damit jedes Material kompiliert wird
    this.gl.compile(this.szene, this.kamera3d);
    for (const t of Object.values(this.skins)) this.gl.initTexture(t);
    this.gl.render(this.szene, this.kamera3d); // auch Schatten-Shader & Uploads einmal anstoßen
    this.szene.remove(probe);
  }

  /**
   * Material bekommt einen "Röntgen-Schnitt": Fragmente über SCHNITT_HOEHE, die südlich (kameraseitig) der
   * eigenen Figur und näher als SCHNITT_RADIUS liegen, werden verworfen – so verdecken Wände die Figur nie.
   * Schatten bleiben unverändert (der Schattendurchgang nutzt ein eigenes Material).
   * ⚠ Bei SCHNITT_RADIUS 0 bleibt das Material unangetastet: ein `discard` im Shader schaltet auf echten GPUs den frühen
   * Tiefentest ab → alles unter Dächern (Böden, Möbel) würde voll beleuchtet berechnet (draußen −10 FPS).
   */
  /**
   * Runde 26: Innen-Abschirmung. Steht die eigene Figur in einem Gebäude (Dach offen, Draufsicht, nicht im Auto), schneiden
   * 4 Ebenen alles außerhalb der Gebäude-Box weg (Boden, Bäume, Zombies … – Hintergrund wird schwarz): man sieht nicht, was
   * draußen lauert, und die GPU rechnet draußen nichts (+ Culling, Gras/Blätter aus). Beim Betreten zieht sich der Rand weich zu.
   */
  #innenAbschirmung(dt, fokus) {
    const daecher = this.karte?.daecher;
    const gebaeude = !this.egoHaken && !fokus.fahrzeugId && daecher ? daecher.offenesGebaeude ?? -1 : -1;
    if (gebaeude >= 0 && gebaeude !== this.innenGebaeude) {
      const g = this.welt.kachelGroesse;
      const breite = this.welt.breite;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const idx of daecher.gebaeude[gebaeude].kacheln) {
        const tx = idx % breite;
        const ty = Math.floor(idx / breite);
        x0 = Math.min(x0, tx); x1 = Math.max(x1, tx + 1); z0 = Math.min(z0, ty); z1 = Math.max(z1, ty + 1);
      }
      this.innenBox = { x0: x0 * g, z0: z0 * g, x1: x1 * g, z1: z1 * g };
    }
    if (gebaeude >= 0) this.innenGebaeude = gebaeude;
    const ziel = gebaeude >= 0 ? 1 : 0;
    // Rein weich (Rand zieht sich zu), raus sofort – sonst hängen die Ebenen beim Verlassen/Teleport noch am alten Haus
    this.innenAnteil = ziel ? this.innenAnteil + (1 - this.innenAnteil) * Math.min(1, dt * 5) : 0;
    if (ziel && 1 - this.innenAnteil < 0.005) this.innenAnteil = 1;
    const a = this.innenAnteil;
    const b = this.innenBox;
    const [o, w, s, n] = this.innenEbenen;
    if (a <= 0 || !b) {
      for (const e of this.innenEbenen) e.constant = INNEN_WEIT;
      this.innenGebaeude = -1;
    } else {
      // Ebene: n·p + c ≥ 0 bleibt sichtbar
      const rand = INNEN_RAND * (1 - a) ** 2 + 0.5;
      o.constant = -(b.x0 - rand); // x ≥ x0
      w.constant = b.x1 + rand; // x ≤ x1
      s.constant = -(b.z0 - rand); // z ≥ z0
      n.constant = b.z1 + rand; // z ≤ z1
    }
    // Hintergrund/Himmel abdunkeln, Gras & Blätter aus (spart Zeichnen)
    if (a > 0) {
      this.szene.background.lerp(_schwarz, a);
      this.szene.fog.color.copy(this.szene.background);
    }
    const zu = a > 0.99;
    this.himmel.sichtbar = !zu;
    if (this.natur) this.natur.gruppe.visible = !zu && this.#profil().natur !== false;
    if (this.blaetter?.mesh) this.blaetter.mesh.visible = !zu;
  }

  #mitSchnitt(material) {
    if (SCHNITT_RADIUS <= 0) return material;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.schnitt);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSchnittPos;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 schnittPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            schnittPos = instanceMatrix * schnittPos;
          #endif
          vSchnittPos = (modelMatrix * schnittPos).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSchnittPos;\nuniform vec3 uFokus;\nuniform float uRadius;\nuniform float uHoehe;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec2 schnittAbstand = vSchnittPos.xz - uFokus.xz;
          if (vSchnittPos.y > uHoehe && schnittAbstand.y > -6.0 && length(schnittAbstand * vec2(0.8, 1.0)) < uRadius) discard;`,
        );
    };
    material.customProgramCacheKey = () => 'schnitt';
    return material;
  }

  /** Kegel-Lampe der Karte (Scheinwerfer) – ohne Schatten, Ziel wird pro Frame gesetzt */
  /** Geländehöhe (Weltpixel) unter x/y – 0 ohne Gelände (Editor 2.0, 2.5) */
  #hy(x, y) {
    return this.welt?.hoehen ? this.welt.hoeheBei(x, y) : 0;
  }

  /** Öffentlich für Kamera-Adapter/Overlay/Ego: Geländehöhe in Weltpixeln */
  bodenHoehe(x, y) {
    return this.#hy(x, y);
  }

  /** Lichter nach dem Lichtbudget des Profils (neu) anlegen. @returns true, wenn sich etwas geändert hat (→ Shader neu kompilieren) */
  #baueLichter() {
    const name = this.#basisProfil();
    if (this.lichtProfil === name) return false;
    this.lichtProfil = name;
    const budget = LICHT_BUDGET[name];
    const art = this.istHandy ? 'handy' : 'desktop';
    for (const l of [...(this.taschenlampen ?? []), ...(this.lampenPool ?? []), ...(this.kegelPool ?? []), ...(this.muendungslichter ?? []), ...(this.scheinwerfer ?? []), ...(this.streuLicht ? [this.streuLicht] : [])]) {
      this.szene.remove(l);
      if (l.target) this.szene.remove(l.target);
      l.dispose();
    }
    for (const k of this.taschenKegel ?? []) {
      this.szene.remove(k);
      k.geometry.dispose();
      k.material.dispose();
    }
    this.taschenlampen = Array.from({ length: budget.taschen }, (_, i) => this.#neueTaschenlampe(i === 0));
    this.taschenKegel = Array.from({ length: budget.taschen }, () => this.#neuerLichtKegel()); // sichtbarer Strahl
    this.lampenPool = Array.from({ length: budget.lampen[art] }, () => this.#neuesPunktlicht(0xffffff, 300));
    this.kegelPool = Array.from({ length: budget.kegel[art] }, () => this.#neuesKegellicht());
    this.muendungslichter = Array.from({ length: budget.muendung }, () => this.#neuesPunktlicht(0xffc070, 380));
    this.scheinwerfer = [0, 1].map(() => this.#neuerScheinwerfer());
    this.streuLicht = this.#neuesPunktlicht(0xffe2b0, STREULICHT.reichweite); // immer da (feste Lichtanzahl → keine Shader-Neubauten)
    this.naechsteLampen = null;
    return true;
  }

  #neuerScheinwerfer() {
    const spot = new THREE.SpotLight(0xfff1d6, 0, SCHEINWERFER.reichweite, SCHEINWERFER.winkel, SCHEINWERFER.rand, SCHEINWERFER.decay);
    this.szene.add(spot, spot.target);
    return spot;
  }

  /** Grafik-Basis ('hoch'|'mittel'|'niedrig') – bei „Auto“ die erkannte bzw. gelernte */
  #basisProfil() {
    return this.grafik === 'auto' ? this.autoProfil : this.grafik;
  }

  #profil() {
    return GRAFIK_PROFILE[this.#basisProfil()];
  }

  /** Werden die Schattenkarten in diesem Bild neu gezeichnet? (schattenTakt aus Profil bzw. Qualitätsstufe) */
  #schattenDran() {
    const takt = Math.max(this.#profil().schattenTakt ?? 1, QUALITAETS_STUFEN[this.stufe]?.schattenTakt ?? 1);
    return this.bildNr % takt === 0;
  }

  #neuesKegellicht() {
    const spot = new THREE.SpotLight(0xffffff, 0, 300, 0.5, 0.5, 1);
    this.szene.add(spot, spot.target);
    return spot;
  }

  #neueTaschenlampe(mitSchatten) {
    const spot = new THREE.SpotLight(0xffe4b8, 0, TASCHENLAMPE.reichweite, TASCHENLAMPE.winkel, TASCHENLAMPE.rand, TASCHENLAMPE.decay);
    // Schatten nur für die eigene Lampe (jede Schattenlampe = ein zusätzlicher Szenen-Durchgang); Wände, Häuser, Möbel, Bäume werfen und empfangen Schatten
    spot.castShadow = mitSchatten;
    spot.shadow.mapSize.set(this.istHandy ? 512 : 1024, this.istHandy ? 512 : 1024);
    spot.shadow.camera.near = 6;
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.6;
    spot.shadow.radius = 3; // weiche Schattenkante
    this.szene.add(spot, spot.target);
    return spot;
  }

  /**
   * Sichtbarer Lichtkegel (additiv, Spitze am Spieler, nach vorn ausblendend) – zeigt den Strahl der Taschenlampe in der Luft.
   * Weiche Seiten (Runde 18): Der Shader blendet Flächen aus, die man flach (am Rand des Kegels) sieht → kein harter Umriss.
   */
  #neuerLichtKegel() {
    const laenge = TASCHENLAMPE.kegelLaenge;
    const geometrie = new THREE.CylinderGeometry(0, laenge * Math.tan(TASCHENLAMPE.winkel) * 0.75, laenge, 32, 4, true).translate(0, -laenge / 2, 0).rotateZ(Math.PI / 2);
    const pos = geometrie.attributes.position;
    const anteil = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getX(i) / laenge; // 0 = Lampe, 1 = Ende
      anteil[i] = (1 - t) * Math.min(1, t / 0.15); // vorn sanft einblenden, nach hinten auslaufen
    }
    geometrie.setAttribute('laengsAnteil', new THREE.BufferAttribute(anteil, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { farbe: { value: new THREE.Color(0xffe9b8) }, deckkraft: { value: 0 } },
      vertexShader: `attribute float laengsAnteil;
        varying float vAnteil; varying vec3 vNormale; varying vec3 vSicht;
        void main() {
          vAnteil = laengsAnteil;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormale = normalize(normalMatrix * normal);
          vSicht = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 farbe; uniform float deckkraft;
        varying float vAnteil; varying vec3 vNormale; varying vec3 vSicht;
        void main() {
          float rand = pow(abs(dot(normalize(vNormale), normalize(vSicht))), 1.8);
          gl_FragColor = vec4(farbe, deckkraft * vAnteil * rand);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometrie, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.szene.add(mesh);
    return mesh;
  }

  #neuesPunktlicht(farbe, reichweite) {
    const licht = new THREE.PointLight(farbe, 0, reichweite, 1);
    this.szene.add(licht);
    return licht;
  }

  #baueEffektObjekte() {
    this.spurGeometrie = new THREE.BufferGeometry();
    this.spurPunkte = new THREE.BufferAttribute(new Float32Array(6 * 64), 3);
    this.spurGeometrie.setAttribute('position', this.spurPunkte);
    this.spuren = new THREE.LineSegments(
      this.spurGeometrie,
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    this.spuren.frustumCulled = false;
    this.partikelGeometrie = new THREE.BufferGeometry();
    this.partikelPunkte = new THREE.BufferAttribute(new Float32Array(3 * 400), 3);
    this.partikelGeometrie.setAttribute('position', this.partikelPunkte);
    this.partikelFarben = new THREE.BufferAttribute(new Float32Array(3 * 400), 3);
    this.partikelGeometrie.setAttribute('color', this.partikelFarben);
    this.partikel = new THREE.Points(this.partikelGeometrie, new THREE.PointsMaterial({ vertexColors: true, size: 3 }));
    this.partikel.frustumCulled = false;
    this.blutFlecken = new Map(); // Effekt-Objekt → Mesh
    this.sonderEffekte = new SonderEffekte(this.szene); // Runde 24: Spucke, Explosionen
    this.blutmond = 0; // Runde 24: 0..1 (weich), Ziel `blutmondZiel` setzt clientSpiel aus ZUSTAND.nachtArt
    this.szene.add(this.spuren, this.partikel, this.markierRing, this.zielRing);
  }

  // ---------------------------------------------------------------------------
  // Pro Frame

  /**
   * Adaptive Qualität: Fällt die Bildrate (Mittel über 2 s) unter ~48 FPS, eine Stufe sparsamer; läuft es
   * dreimal hintereinander locker (> 57 FPS), eine Stufe schöner – aber nach dem Absenken 30 s lang nicht.
   * Jede Änderung kostet einen kurzen Hänger (Puffer neu anlegen), darum so zurückhaltend.
   */
  #passeAufloesungAn(dt, jetzt) {
    const auto = this.grafik === 'auto';
    if (!auto && !this.#profil().adaptiv) return; // mittel/niedrig: feste Stufe
    if (jetzt < this.messenAb || dt > 0.25) return; // Aufwärmphase bzw. Tab war im Hintergrund
    const m = this.messung;
    m.frames++;
    m.zeit += dt;
    if (jetzt - m.seit < 2000) return;
    const mittel = m.zeit / Math.max(1, m.frames);
    this.messung = { frames: 0, zeit: 0, seit: jetzt };
    const maxStufe = auto ? AUTO_STUFEN[this.autoProfil][1] : ADAPTIV_MAX_STUFE;
    if (mittel > 1 / 48 && this.stufe < maxStufe) {
      this.#setzeStufe(this.stufe + 1);
      this.anhebenGesperrtBis = jetzt + 30000;
      this.guteFenster = 0;
    } else if (auto && mittel > 1 / 40 && AUTO_TIEFER[this.autoProfil]) {
      // Auto: schon am sparsamsten Ende der Basis und trotzdem < 40 FPS (zweimal hintereinander) → eine Basis tiefer (einmal kurz ruckeln)
      this.schlechteFenster = (this.schlechteFenster ?? 0) + 1;
      if (this.schlechteFenster >= 2) {
        this.schlechteFenster = 0;
        this.autoProfil = AUTO_TIEFER[this.autoProfil];
        try {
          merkeAutoProfil(this.geraet.gpu, this.autoProfil);
        } catch {
          // egal
        }
        this.#wendeProfilAn();
      }
      return;
    } else if (mittel < 1 / 57) {
      this.guteFenster = (this.guteFenster ?? 0) + 1;
      this.schlechteFenster = 0;
      if (this.guteFenster >= 3 && jetzt > (this.anhebenGesperrtBis ?? 0) && this.stufe > this.#startStufe()) {
        this.#setzeStufe(this.stufe - 1);
        this.guteFenster = 0;
      }
    } else {
      this.guteFenster = 0;
    }
  }

  /** Beste Stufe des gewählten Profils (Handy startet im Profil "hoch" eine Stufe sparsamer). */
  #startStufe() {
    if (this.grafik === 'auto') return AUTO_STUFEN[this.autoProfil][0] ?? (this.istHandy ? 2 : 0);
    return this.#profil().stufe ?? (this.istHandy ? 2 : 0);
  }

  /** Pixelverhältnis: im Profil "hoch" immer volle Geräteauflösung (nie automatisch unscharf), sonst die Profil-Grenze. */
  #stufenAufloesung() {
    const grenze = this.#profil().aufloesung;
    return Math.min(this.aufloesungMax, grenze ?? (this.istHandy ? 1.25 : 2));
  }

  #bodenMassstab(welt = this.welt) {
    const massstab = this.#profil().texturen;
    // Speicherbudget: Bodentextur (RGBA + Mipmaps ≈ ×1,33) der ganzen Zone passt in BODEN_SPEICHER_MB – große Zonen werden gröber
    const budget = (this.istHandy ? BODEN_SPEICHER_MB.handy : BODEN_SPEICHER_MB.pc) * 1024 * 1024;
    const g = welt?.kachelGroesse ?? 32;
    const bytesBei1 = (welt ? welt.breite * welt.hoehe : 0) * g * g * 4 * 1.33;
    const grenze = bytesBei1 ? Math.sqrt(budget / bytesBei1) : Infinity;
    return Math.max(0.1, Math.min(this.istHandy ? Math.min(massstab, 0.6) : massstab, grenze));
  }

  /** Grafik-Einstellung ändern ('auto' | 'hoch' | 'mittel' | 'niedrig') – wirkt sofort und wird im Browser gemerkt. */
  setzeGrafik(name) {
    if (!(name in GRAFIK_PROFILE)) return;
    this.grafik = name;
    try {
      localStorage.setItem(GRAFIK_SCHLUESSEL, name);
    } catch {
      // egal
    }
    this.#wendeProfilAn();
  }

  /** Text für die Einstellungen (bei Auto mit der gerade gewählten Basis) */
  grafikBeschreibung() {
    const p = GRAFIK_PROFILE[this.grafik];
    return this.grafik === 'auto' ? `${p.name}: ${p.beschreibung} – gerade ${GRAFIK_PROFILE[this.autoProfil].name}` : `${p.name}: ${p.beschreibung}`;
  }

  #wendeProfilAn() {
    const profil = this.#profil();
    this.#setzeStufe(this.#startStufe());
    this.mond.castShadow = profil.sonnenschatten;
    if (this.natur) this.natur.gruppe.visible = profil.natur !== false; // Gras nur in den Profilen hoch/mittel
    this.karte?.setzeBodenMassstab(this.#bodenMassstab());
    if (this.#baueLichter() && this.welt) this.#vorkompilieren(); // andere Lichteranzahl → alle Shader einmal neu (kurzer Hänger)
    this.messung = { frames: 0, zeit: 0, seit: 0 };
    this.guteFenster = 0;
    this.schlechteFenster = 0;
    this.messenAb = performance.now() + 3000;
  }

  #setzeStufe(stufe) {
    const vorher = QUALITAETS_STUFEN[this.stufe];
    this.stufe = stufe;
    const neu = QUALITAETS_STUFEN[stufe];
    const aufloesung = this.#stufenAufloesung();
    if (aufloesung !== this.aufloesung) {
      this.aufloesung = aufloesung;
      this.gl.setPixelRatio(aufloesung);
    }
    const schatten = this.istHandy ? Math.min(1024, neu.schatten) : neu.schatten;
    if (schatten !== this.mond.shadow.mapSize.x) {
      this.mond.shadow.mapSize.set(schatten, schatten);
      this.mond.shadow.map?.dispose();
      this.mond.shadow.map = null;
    }
    if (neu.baumDetail !== vorher.baumDetail) this.karte?.setzeBaumDetail(neu.baumDetail);
  }

  #aktualisiereFiguren(entitaeten, fokus, dt, jetzt) {
    const gesehen = this.gesehenFiguren ?? (this.gesehenFiguren = new Set());
    gesehen.clear();
    let neuGebaut = 0;
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      gesehen.add(e.id);
      let f = this.figuren.get(e.id);
      // Eigene Figur wird manchmal schon vor dem ersten Server-Stand (mit Aussehen) gebaut → dann neu bauen
      if (f && e.typ === 'spieler' && f.koerper !== (e.aussehen?.koerper ?? AUSSEHEN.koerper.standard)) {
        this.szene.remove(f.gruppe);
        f.mixer.stopAllAction();
        f = null;
      }
      if (!f) {
        // Horde kommt in Sicht: nicht alle Figuren im selben Bild klonen (Ruckler) – der Rest kommt in den nächsten Bildern
        if (e.typ === 'zombie' && neuGebaut >= NEUE_FIGUREN_JE_BILD) continue;
        f = this.#holeFigur(e);
        if (f.neuGebaut) neuGebaut++;
        f.neuGebaut = false;
        this.figuren.set(e.id, f);
      }
      const nah = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      // Tote Spieler (Survivor) bleiben liegen, bis sie wiederbelebt werden; alte Figuren/Zombies verschwinden sofort
      f.gruppe.visible = (!e.tot || f.survivor) && nah && !e.fahrzeug && !e.fahrzeugId; // im Auto sieht man die Figur nicht
      if (!f.gruppe.visible) continue;
      const schlaeft = e.arbeit === 'schlafen' && e.arbeitOrt;
      if (schlaeft) {
        // Im Bett liegen: auf die Matratze, Kopf zum Kopfende
        // Rücken nach unten (x-Drehung), Kopf nach Norden bzw. Osten; Ursprung der Figur = Füße
        const laengs = e.arbeitOrt.laengs;
        f.gruppe.position.set(e.arbeitOrt.x - (laengs ? 0 : 30), 20 + this.#hy(e.arbeitOrt.x, e.arbeitOrt.y), e.arbeitOrt.y + (laengs ? 30 : 0));
        f.gruppe.rotation.set(-Math.PI / 2, laengs ? 0 : -Math.PI / 2, 0, 'YXZ');
      } else {
        // Sitzen: mit eigenem Clip senkt der Clip die Hüfte selbst, sonst wird die Figur abgesenkt (prozedurale Beine)
        const sitzTiefe = e.arbeit === 'sitzen' && !f.aktionen?.sitzen ? SITZ_TIEFE : 0;
        f.gruppe.position.set(e.x, this.#hy(e.x, e.y) - sitzTiefe + (e.fliegen ? 34 + Math.sin(jetzt / 260) * 3 : 0), e.y); // Flugmodus (Admin): schwebt; Gelände-Höhe darunter
        f.gruppe.rotation.set(0, Math.PI / 2 - e.blick, 0, 'YXZ');
      }

      if (f.beulen) f.beulen.emissiveIntensity = e.zuendet ? (Math.sin(jetzt / 45) > 0 ? 4 : 0.3) : 0.6 + 0.4 * Math.sin(jetzt / 400 + e.id);
      const tempo = e.geschwindigkeit ?? 0;
      let name;
      let zeitfaktor = 1;
      if (f.survivor) {
        // Spielerfigur: sterben (einmalig, bleibt liegen) > sitzen > Werkzeug-Clip (hacken/spitzhacke/abbauen) > Hacken-Schlag (einmal)
        // > gehen/laufen (Tempo über timeScale) > stehen. Fehlt ein Clip, gilt der nächstbeste (hacken bzw. prozedural).
        const k = f.aktionen;
        const arbeitsKlip = ARBEIT_KLIP[e.arbeit];
        if (e.tot || e.niedergestreckt) name = 'sterben'; // Runde 24: niedergestreckt liegt am Boden
        else if (e.arbeit === 'sitzen' && k.sitzen) name = 'sitzen';
        else if (arbeitsKlip && k[arbeitsKlip]) name = arbeitsKlip;
        else if (arbeitsKlip && (HACK_ARBEIT.has(e.arbeit) || e.arbeit === 'zerlegen')) name = 'hacken';
        else if (e.aktion === 'hacke' && !e.arbeit && k.hacke) name = 'hacke';
        else if (k.nahkampf && f.nahkampfBis > jetzt) name = 'nahkampf';
        else if (tempo > 12) name = k.gehen && tempo < GEH_GRENZE ? 'gehen' : 'laufen';
        else name = 'stehen';
        const fk = f.koerper === 'frau' ? 'frau' : 'mann';
        if (name === 'laufen') zeitfaktor = Math.max(0.6, Math.min(2.4, tempo / LAUF_TEMPO[fk]));
        if (name === 'gehen') zeitfaktor = Math.max(0.5, Math.min(2.4, tempo / GEH_TEMPO[fk]));
        // Hacken-Schlag: jeder neue Schlag (neuer aktionTick) startet den Einmal-Clip von vorn
        if (name === 'hacke' && f.aktuell === 'hacke' && f.hackeTick !== e.aktionTick) k.hacke.reset().play();
        if (name === 'hacke') f.hackeTick = e.aktionTick;
        // Nahkampf mit beidhändiger Waffe (Runde 18): jeder neue Schlag startet den Einmal-Clip; er läuft zu Ende, auch beim Gehen
        if (e.aktion === 'nahkampf' && k.nahkampf && f.nahkampfTick !== e.aktionTick && !e.arbeit && istBeidhaendigerSchlag(e)) {
          f.nahkampfTick = e.aktionTick;
          f.nahkampfBis = jetzt + k.nahkampf.getClip().duration * 1000;
          if (f.aktuell === 'nahkampf') k.nahkampf.reset().play();
          else if (name !== 'sterben' && name !== 'sitzen' && name !== 'hacke' && !arbeitsKlip) name = 'nahkampf';
        }
        f.schlagKlip = SCHLAG_KLIPS.has(name);
      } else if (f.glb) {
        // GLB-Zombie: Angriff (Einmal-Clip je neuem Schlag) > gehen/rennen (nach Tempo) > stehen
        const k = f.aktionen;
        const t = f.glb.def.tempo;
        const g = e.groesse ?? 1;
        if (e.aktion === 'angriff' && k.angriff && f.angriffTick !== e.aktionTick) {
          f.angriffTick = e.aktionTick;
          f.angriffBis = jetzt + (k.angriff.getClip().duration * 1000) / 1.4;
          if (f.aktuell === 'angriff') k.angriff.reset().play();
        }
        if (f.angriffBis > jetzt) {
          name = 'angriff';
          zeitfaktor = 1.4;
        } else if (tempo > 12) {
          name = tempo < ((t.gehen + t.rennen) / 2) * g ? 'gehen' : 'rennen';
          zeitfaktor = Math.max(0.5, Math.min(2.2, tempo / (t[name] * g)));
        } else name = 'stehen';
      } else {
        name = tempo > 12 ? 'rennen' : 'stehen';
        if (name === 'rennen') zeitfaktor = e.typ === 'zombie' ? Math.max(0.5, tempo / 140) : Math.max(0.6, tempo / 170);
      }
      if (f.aktuell !== name) {
        const neu = f.aktionen[name];
        if (name === 'sterben') {
          neu.reset().fadeIn(0.08).play();
          // Schon beim ersten Sehen tot (Beitritt/Wiedereintritt): gleich liegend zeigen statt noch einmal zu fallen
          if (f.gesehenAlsLebend === undefined) neu.time = neu.getClip().duration;
        } else neu.reset().fadeIn(0.15).play();
        f.aktionen[f.aktuell]?.fadeOut(name === 'sterben' ? 0.08 : 0.15);
        f.aktuell = name;
      }
      if (f.survivor) f.gesehenAlsLebend = !e.tot;
      f.aktionen[name].timeScale = zeitfaktor;
      if (!!e.rucksack !== !!f.rucksack) this.#setzeRucksack(f, !!e.rucksack);
      if (f.survivor && kleidungsSchluessel(e.kleidung) !== f.kleidungSchluessel) this.#setzeKleidung(f, e.kleidung);
      // Weiter entfernte Zombies nur jedes 2. Bild animieren (Knochen rechnen kostet CPU), Zeit wird nachgeholt
      if (!f.survivor && e.typ === 'zombie' && Math.abs(e.x - fokus.x) + Math.abs(e.y - fokus.y) > ANIM_HALB_AB && (this.bildNr + e.id) % 2) {
        f.animRest = (f.animRest ?? 0) + dt;
        continue;
      }
      f.mixer.update(dt + (f.animRest ?? 0));
      f.animRest = 0;
      this.#merkeAufschlag(f, e, name);
      if (f.waffe) f.waffe.visible = !e.tot;
      if (!schlaeft && !e.tot) aktualisiereHaltung(f, e, jetzt, this.dunkel ?? 0);
    }
    for (const [id, f] of this.figuren) {
      if (gesehen.has(id)) continue;
      this.szene.remove(f.gruppe);
      f.mixer.stopAllAction();
      this.figuren.delete(id);
      if (f.poolSchluessel) {
        const pool = this.figurPool.get(f.poolSchluessel) ?? [];
        if (pool.length < 12) pool.push(f);
        this.figurPool.set(f.poolSchluessel, pool);
      }
    }
  }

  #figurMaterial(e) {
    // Spieler: Skin aus dem gewählten Aussehen (gemeinsam/spieler/aussehen.js), Zombies: nach Variante
    // Zombies: 4 Gesichter (zombieGesicht0–3: gerade = männlicher, ungerade = weiblicher Körper) – Läufer weiblich, Brocken männlich
    let gesicht = null;
    if (e.typ === 'zombie') {
      const nr = (e.id ?? 0) % 4;
      gesicht = e.variante === 'laeufer' ? (nr % 2) * 2 + 1 : e.variante === 'brocken' ? (nr % 2) * 2 : nr;
    }
    const schluessel = e.typ === 'spieler' ? skinFuer(e.aussehen) : `${e.variante ?? 'normal'}:${gesicht}`;
    if (!this.figurMaterialien.has(schluessel)) {
      const skin = e.typ === 'spieler' ? schluessel : `zombieGesicht${gesicht}`;
      const textur = this.skins[skin] ?? this.skins[SKINS.normal];
      const material = new THREE.MeshStandardMaterial({ map: textur, roughness: 0.75 });
      if (e.typ === 'spieler') {
        // Nachts bleibt der Spieler-Körper schwach sichtbar (Eigenleuchten nach Skin-Textur, Stärke in #tageslicht)
        material.emissiveMap = textur;
        material.emissive.setRGB(1, 1, 1);
        material.emissiveIntensity = 0;
        this.spielerMaterialien.push(material);
      }
      if (e.variante === 'brocken') material.color.setRGB(0.75, 0.6, 0.55);
      // Runde 24: Sonder-Zombies an der Hautfarbe erkennbar (+ Anbauteile in #sonderTeile)
      const ton = SONDER_TOENE[e.variante];
      if (ton) {
        material.color.setRGB(...ton.farbe);
        if (ton.leuchten) {
          material.emissive.setRGB(...ton.leuchten);
          material.emissiveIntensity = 0.35;
        }
      }
      this.figurMaterialien.set(schluessel, material);
    }
    return this.figurMaterialien.get(schluessel);
  }

  /** Frisur (haarModell.js) an den Kopfknochen hängen; Maße aus dem Abstand Kopf → Head_end × KOPF. */
  #setzeFrisur(gruppe, modell, frisur) {
    const kopfKnochen = modell.getObjectByName('Head');
    const spitze = modell.getObjectByName('Head_end');
    if (!frisur || !kopfKnochen || !spitze) return;
    gruppe.updateMatrixWorld(true);
    const unten = gruppe.worldToLocal(kopfKnochen.getWorldPosition(new THREE.Vector3()));
    const oben = gruppe.worldToLocal(spitze.getWorldPosition(new THREE.Vector3()));
    const hoehe = Math.abs(oben.y - unten.y);
    const haare = erzeugeFrisur(frisur, { mitte: unten.clone().lerp(oben, 0.5), hoehe: hoehe * KOPF.hoehe, breite: hoehe * KOPF.breite, tiefe: hoehe * KOPF.tiefe });
    gruppe.add(haare);
    kopfKnochen.attach(haare); // behält die Weltlage, folgt aber ab jetzt dem Kopf
  }

  /** Rucksack auf dem Rücken (an der Figur befestigt; lokales +z = Blickrichtung → Rücken = -z). */
  #setzeRucksack(figur, an) {
    if (!an) {
      figur.rucksack?.removeFromParent();
      figur.rucksack = null;
      return;
    }
    this.rucksackGeometrie ??= vereineGeometrien(rucksackTeile(), { mitFarbe: true });
    const mesh = new THREE.Mesh(this.rucksackGeometrie, ITEM_MATERIAL);
    mesh.castShadow = true;
    mesh.position.set(0, FIGUR_HOEHE * 0.6, -8.5);
    figur.gruppe.add(mesh);
    figur.rucksack = mesh;
  }

  /** Materialien einer Spielerfigur (je Variante geteilt; nachts schwaches Eigenleuchten in der Grundfarbe wie bei den alten Skins). */
  #survivorMaterial(sv, original) {
    if (!sv.materialien.has(original)) {
      const material = original.clone();
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0;
      this.spielerMaterialien.push(material);
      sv.materialien.set(original, material);
    }
    return sv.materialien.get(original);
  }

  #neueSurvivorFigur(e) {
    const koerper = e.aussehen?.koerper ?? AUSSEHEN.koerper.standard;
    const sv = this.survivor[koerper === 'frau' ? 'frau' : 'mann'];
    const modell = SkeletonUtils.clone(sv.modell);
    modell.traverse((teil) => {
      if (!teil.isMesh) return;
      teil.material = Array.isArray(teil.material) ? teil.material.map((m) => this.#survivorMaterial(sv, m)) : this.#survivorMaterial(sv, teil.material);
      teil.castShadow = true;
      teil.frustumCulled = false; // Pose weicht stark von der Ruhepose ab (Sterben) – Hüllkörper unzuverlässig
    });
    modell.scale.setScalar(sv.massstab * (e.groesse ?? 1));
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    this.szene.add(gruppe);
    const mixer = new THREE.AnimationMixer(modell);
    const aktionen = {};
    for (const [name, clip] of Object.entries(sv.clips)) aktionen[name] = mixer.clipAction(clip);
    aktionen.sterben.setLoop(THREE.LoopOnce, 1);
    aktionen.sterben.clampWhenFinished = true;
    if (aktionen.hacke) {
      aktionen.hacke.setLoop(THREE.LoopOnce, 1); // Feld anlegen: ein einzelner Schlag
      aktionen.hacke.clampWhenFinished = true;
    }
    if (aktionen.nahkampf) {
      aktionen.nahkampf.setLoop(THREE.LoopOnce, 1);
      aktionen.nahkampf.clampWhenFinished = true;
    }
    aktionen.stehen.play();
    mixer.setTime(Math.random() * 2);
    const figur = { gruppe, mixer, aktionen, aktuell: 'stehen', koerper, survivor: true, tot: false, modell };
    richteFigurEin(figur, modell);
    figur.klipHacken = !!(figur.knochen.rechts && figur.knochen.links);
    figur.klips = new Set(Object.keys(aktionen));
    return figur;
  }

  /**
   * Runde 23: Aufschlag eines Werkzeug-Clips (Axt/Spitzhacke/Abbauen) erkannt → `this.aufschlaege` (clientSpiel spielt den
   * Hack-Sound genau dann – Ton passt zur Animation und endet mit ihr). AUFSCHLAG = Anteil der Clipdauer, an dem das Werkzeug trifft
   * (aus der Armgeschwindigkeit der Clips gemessen).
   */
  #merkeAufschlag(f, e, name) {
    const anteil = AUFSCHLAG[name];
    if (!f.survivor || anteil === undefined || !e.arbeit) {
      f.schlagAnteil = undefined;
      return;
    }
    const aktion = f.aktionen[name];
    const jetzt = aktion.time / aktion.getClip().duration;
    const vorher = f.schlagAnteil;
    f.schlagAnteil = jetzt;
    if (vorher === undefined) return;
    const getroffen = vorher <= jetzt ? vorher < anteil && jetzt >= anteil : vorher < anteil || jetzt >= anteil;
    if (getroffen) this.aufschlaege.push({ id: e.id, x: e.x, y: e.y, arbeit: e.arbeit, blick: e.blick });
  }

  /**
   * Runde 23: eigene Figur für die Charakter-Vorschau im Inventar (ui/charakterVorschau.js, eigener WebGL-Kontext) –
   * gleiche Modelle/Materialien wie im Spiel, aber nicht in der Spielszene. null, solange die Figuren nicht geladen sind.
   */
  vorschauFigur(aussehen, kleidung = null) {
    if (!this.survivor) return null;
    const figur = this.#neueSurvivorFigur({ typ: 'spieler', aussehen });
    this.szene.remove(figur.gruppe);
    figur.mixer.setTime(0);
    this.#setzeKleidung(figur, kleidung);
    return figur;
  }

  /**
   * Runde 23: Kleidung an der Spielerfigur. Oberteil/Hose/Schuhe färben die Stoff-Materialien von Body/Legs/Feet um (Haut,
   * Augen, Haare bleiben), Mütze und Handschuhe sind kleine Zusatzteile an den Knochen Head bzw. WristL/R.
   * Farben aus gegenstaende.js (`farbe`, kommt mit den Item-Definitionen).
   */
  #setzeKleidung(figur, kleidung) {
    figur.kleidungSchluessel = kleidungsSchluessel(kleidung);
    const farbe = (stelle) => this.itemDefinitionen?.[kleidung?.[stelle]]?.farbe ?? null;
    figur.modell.traverse((teil) => {
      if (!teil.isMesh) return;
      teil.userData.basisMaterial ??= teil.material;
      const stelle = KLEIDUNG_MESH.find(([muster]) => teil.name.includes(muster))?.[1];
      const f = stelle && farbe(stelle);
      const basis = teil.userData.basisMaterial;
      teil.material = !f ? basis : Array.isArray(basis) ? basis.map((m) => this.#kleidungsMaterial(m, f)) : this.#kleidungsMaterial(basis, f);
    });
    for (const teil of figur.kleidungTeile ?? []) teil.removeFromParent();
    figur.kleidungTeile = [];
    const kopfFarbe = farbe('kopf');
    const handFarbe = farbe('haende');
    if (!kopfFarbe && !handFarbe) return;
    figur.gruppe.updateMatrixWorld(true);
    const lage = (name) => figur.modell.getObjectByName(name);
    const welt = (knochen) => figur.gruppe.worldToLocal(knochen.getWorldPosition(new THREE.Vector3()));
    const haenge = (mesh, knochen) => {
      mesh.castShadow = true;
      figur.gruppe.add(mesh);
      knochen.attach(mesh); // behält die Weltlage, folgt ab jetzt dem Knochen
      figur.kleidungTeile.push(mesh);
    };
    // Kopfgröße aus Hüfte → Kopf (Head_end zeigt in diesem Rig nach unten, taugt nicht als Scheitel)
    const kopf = lage('Head');
    const huefte = lage('Hips');
    if (kopfFarbe && kopf && huefte) {
      const k = welt(kopf);
      const h = k.distanceTo(welt(huefte)) * 0.4;
      const hoch = k.clone().sub(welt(lage('Neck') ?? huefte)).normalize();
      const muetze = new THREE.Mesh(KLEIDUNG_GEO.muetze, this.#kleidungsMaterial(null, kopfFarbe));
      muetze.scale.set(h * 0.62, h * 0.5, h * 0.66);
      muetze.position.copy(k).addScaledVector(hoch, h * 0.62);
      muetze.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hoch);
      haenge(muetze, kopf);
    }
    for (const seite of ['L', 'R']) {
      const hand = lage(`Wrist${seite}`) ?? lage(`Wrist.${seite}`); // GLTFLoader entfernt Punkte aus Knotennamen
      const finger = lage(`Middle1${seite}`) ?? lage(`Middle1.${seite}`);
      if (!handFarbe || !hand) continue;
      const a = welt(hand);
      const b = finger ? welt(finger) : a;
      const groesse = Math.max(2.6, a.distanceTo(b) * 2.8);
      const handschuh = new THREE.Mesh(KLEIDUNG_GEO.handschuh, this.#kleidungsMaterial(null, handFarbe));
      handschuh.scale.setScalar(groesse);
      handschuh.position.copy(a.clone().lerp(b, 0.55));
      haenge(handschuh, hand);
    }
  }

  /** Umgefärbtes Material (je Original + Farbe geteilt; nachts schwaches Eigenleuchten wie die Spieler-Skins). Haut & Co. bleiben. */
  #kleidungsMaterial(original, farbe) {
    if (original && /^(skin|eyes?|eyebrows|hair.*)$/i.test(original.name)) return original; // Achtung: „Brown“ ≠ Augenbraue
    const schluessel = `${original?.uuid ?? 'neu'}:${farbe}`;
    this.kleidungsMaterialien ??= new Map();
    if (!this.kleidungsMaterialien.has(schluessel)) {
      const m = original ? original.clone() : new THREE.MeshStandardMaterial({ roughness: 0.85 });
      m.color.set(farbe);
      // Hell/Dunkel-Abstufung des Originals (z. B. Green/LightGreen) ungefähr beibehalten
      if (original) m.color.multiplyScalar(THREE.MathUtils.clamp(Math.sqrt(original.color.r + original.color.g + original.color.b) / 0.42, 0.7, 1.2));
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0;
      this.spielerMaterialien.push(m);
      this.kleidungsMaterialien.set(schluessel, m);
    }
    return this.kleidungsMaterialien.get(schluessel);
  }

  /** Zombie-Figur aus dem Pool (gleiches Modell/Skin/Größe) oder neu; Spieler immer neu. */
  #holeFigur(e) {
    if (e.typ !== 'zombie') return this.#neueFigur(e);
    const schluessel = `${e.variante ?? 'normal'}:${(e.id ?? 0) % 4}:${e.groesse ?? 1}`;
    const f = this.figurPool.get(schluessel)?.pop();
    if (f) {
      this.szene.add(f.gruppe);
      f.mixer.stopAllAction();
      f.aktionen.stehen.reset().play();
      f.aktuell = 'stehen';
      f.angriffBis = 0;
      f.angriffTick = undefined;
      f.animRest = 0;
      return f;
    }
    const neu = this.#neueFigur(e);
    neu.poolSchluessel = schluessel;
    neu.neuGebaut = true;
    return neu;
  }

  /** GLB-Zombie (ZOMBIE_MODELLE): eigenes Skelett + Clips stehen/gehen/rennen/angriff */
  #neueGlbZombie(e, z) {
    const modell = SkeletonUtils.clone(z.modell);
    modell.scale.setScalar(z.massstab * (e.groesse ?? 1));
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    this.szene.add(gruppe);
    const mixer = new THREE.AnimationMixer(modell);
    const aktionen = {};
    for (const [name, clip] of Object.entries(z.clips)) aktionen[name] = mixer.clipAction(clip);
    if (aktionen.angriff) {
      aktionen.angriff.setLoop(THREE.LoopOnce, 1);
      aktionen.angriff.clampWhenFinished = true;
    }
    aktionen.stehen.play();
    mixer.setTime(Math.random() * 2);
    const figur = { gruppe, mixer, aktionen, aktuell: 'stehen', koerper: AUSSEHEN.koerper.standard, glb: z };
    richteFigurEin(figur, modell);
    return figur;
  }

  #neueFigur(e) {
    if (e.typ === 'spieler' && this.survivor) return this.#neueSurvivorFigur(e);
    const glb = e.typ === 'zombie' ? this.zombieModelle?.[zombieModellFuer(e)] : null;
    if (glb) return this.#neueGlbZombie(e, glb);
    const modell = SkeletonUtils.clone(this.basisModell);
    const material = this.#figurMaterial(e);
    modell.traverse((teil) => {
      if (!teil.isMesh) return;
      teil.material = material;
      teil.castShadow = true;
    });
    modell.scale.setScalar(this.modellMassstab * (e.groesse ?? 1));
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    this.szene.add(gruppe);
    const mixer = new THREE.AnimationMixer(modell);
    const aktionen = {};
    for (const [name, clip] of Object.entries(this.clips)) aktionen[name] = mixer.clipAction(clip);
    aktionen.stehen.play();
    // Zombies nicht alle im Gleichtakt
    mixer.setTime(Math.random() * 2);
    const figur = { gruppe, mixer, aktionen, aktuell: 'stehen', koerper: e.aussehen?.koerper ?? AUSSEHEN.koerper.standard };
    richteFigurEin(figur, modell);
    if (e.typ === 'spieler') this.#setzeFrisur(gruppe, modell, AUSSEHEN.koerper.optionen[e.aussehen?.koerper]?.frisur);
    if (e.typ === 'zombie') this.#sonderTeile(figur, e);
    return figur;
  }

  /**
   * Runde 24: Anbauteile der Sonder-Zombies (an der Figurgruppe, in Welt-Pixeln; Figur ≈ FIGUR_HOEHE hoch):
   * gepanzert = Helm + Brust-/Schulterplatten, explosiv = glühende Beulen (blinken beim Zünden, `figur.beulen`), spucker = Giftblase am Hals.
   */
  #sonderTeile(figur, e) {
    const g = e.groesse ?? 1;
    const teile = [];
    if (e.variante === 'gepanzert') {
      const metall = (SONDER_MATERIAL.metall ??= new THREE.MeshStandardMaterial({ color: 0x5d646b, metalness: 0.7, roughness: 0.45 }));
      const helm = new THREE.Mesh(new THREE.SphereGeometry(8.5, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), metall);
      helm.position.set(0, 58, 0);
      const brust = new THREE.Mesh(new THREE.BoxGeometry(20, 16, 12), metall);
      brust.position.set(0, 40, 0);
      const schulterL = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 10), metall);
      schulterL.position.set(-12, 48, 0);
      const schulterR = schulterL.clone();
      schulterR.position.x = 12;
      teile.push(helm, brust, schulterL, schulterR);
    } else if (e.variante === 'explosiv') {
      const glut = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff4a00, emissiveIntensity: 0.8, roughness: 0.5 });
      figur.beulen = glut;
      for (const [x, y, z, r] of [[5, 42, 6, 4.5], [-6, 36, 5, 3.6], [3, 30, -6, 4], [-4, 47, -5, 3.2], [8, 34, -2, 3]]) {
        const beule = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), glut);
        beule.position.set(x, y, z);
        teile.push(beule);
      }
    } else if (e.variante === 'spucker') {
      const gift = (SONDER_MATERIAL.gift ??= new THREE.MeshStandardMaterial({ color: 0xa6e84e, emissive: 0x4f9a14, emissiveIntensity: 0.9, roughness: 0.25 }));
      const blase = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), gift);
      blase.position.set(0, 50, 5);
      blase.scale.set(1.1, 0.8, 1);
      teile.push(blase);
    }
    for (const t of teile) {
      t.position.multiplyScalar(g);
      t.scale.multiplyScalar(g);
      t.castShadow = true;
      figur.gruppe.add(t);
    }
  }

  /** Taschenlampen der nächsten Spieler (eigene zuerst, mit Schatten) – nur wenn deren Lampe an ist. */
  #aktualisiereTaschenlampen(entitaeten, fokus, dunkel) {
    const spieler = [];
    for (const e of entitaeten) if (e.typ === 'spieler' && !e.tot && e.lichtAn !== false && e.arbeit !== 'schlafen') spieler.push(e);
    spieler.sort((a, b) => (b.istEigener ? 1 : 0) - (a.istEigener ? 1 : 0) || Math.hypot(a.x - fokus.x, a.y - fokus.y) - Math.hypot(b.x - fokus.x, b.y - fokus.y));
    this.streuLicht.intensity = 0;
    this.taschenlampen.forEach((spot, i) => {
      const s = spieler[i];
      const kegel = this.taschenKegel[i];
      kegel.visible = false;
      if (!s) {
        spot.intensity = 0;
        return;
      }
      // Im Auto: Taschenlampe aus – das Auto leuchtet mit seinen zwei Scheinwerfern (#aktualisiereScheinwerfer)
      if (s.fahrzeugId != null || s.fahrzeug) {
        spot.intensity = 0;
        spot.shadow.autoUpdate = false;
        return;
      }
      const vx = Math.cos(s.blick);
      const vz = Math.sin(s.blick);
      // Der Kegel beginnt direkt vor der Brust (nicht mehr an der ausgestreckten Waffe): so liegt der Lichtkreis spürbar vorm Charakter.
      // Knapp außerhalb der Körpermitte, sonst verschluckt der eigene Schatten den Kegel.
      spot.position.set(s.x + vx * TASCHENLAMPEN_ANSATZ.vorn, TASCHENLAMPEN_ANSATZ.hoehe + this.#hy(s.x, s.y), s.y + vz * TASCHENLAMPEN_ANSATZ.vorn);
      spot.target.position.set(s.x + vx * TASCHENLAMPE.ziel, this.#hy(s.x + vx * TASCHENLAMPE.ziel, s.y + vz * TASCHENLAMPE.ziel), s.y + vz * TASCHENLAMPE.ziel);
      // Schmaler, schwacher Kegel (düster); tagsüber sieht man ihn kaum
      Object.assign(spot, { angle: TASCHENLAMPE.winkel, penumbra: TASCHENLAMPE.rand, distance: TASCHENLAMPE.reichweite, decay: TASCHENLAMPE.decay });
      spot.intensity = this.nachtsicht ? 14000 : TASCHENLAMPE.staerke + TASCHENLAMPE.staerkeNacht * dunkel;
      // Schattenkarte nur neu zeichnen, wenn die Lampe überhaupt leuchtet (nachts) – tagsüber spart das einen Szenen-Durchgang.
      // ⚠ Leuchtet sie, muss die Karte aktuell sein: eine eingefrorene Karte projiziert alte Schatten (z. B. das Auto, an dem man
      // eingestiegen ist) an die alte Stelle – das war der „Licht-Schatten, wo das Auto vorher stand“ (Runde 20).
      spot.shadow.autoUpdate = spot.castShadow && spot.intensity > 0 && this.#schattenDran();
      if (dunkel > 0.05) {
        // Sichtbarer Strahl endet an der ersten Wand (der echte Spot wird von der Schattenkarte begrenzt)
        const frei = this.welt ? strahlGegenWaende(this.welt, s.x, s.y, s.blick, TASCHENLAMPE.kegelLaenge + TASCHENLAMPEN_ANSATZ.vorn).laenge - TASCHENLAMPEN_ANSATZ.vorn : TASCHENLAMPE.kegelLaenge;
        const anteil = Math.max(0, Math.min(1, frei / TASCHENLAMPE.kegelLaenge));
        kegel.visible = anteil > 0.03;
        kegel.scale.setScalar(anteil);
        kegel.position.set(s.x + vx * TASCHENLAMPEN_ANSATZ.vorn, 30 + this.#hy(s.x, s.y), s.y + vz * TASCHENLAMPEN_ANSATZ.vorn);
        kegel.rotation.y = -s.blick;
        kegel.material.uniforms.deckkraft.value = 0.09 * dunkel;
        // Drinnen streut der Strahl von Wänden/Möbeln zurück → der ganze Raum wird schwach mit aufgehellt (nur nächste Lampe)
        if (i === 0 && this.welt?.istInnen(s.x, s.y)) {
          const weg = TASCHENLAMPEN_ANSATZ.vorn + Math.max(0, frei) * (1 - STREULICHT.zurueck);
          const lx = s.x + vx * weg;
          const lz = s.y + vz * weg;
          this.streuLicht.position.set(lx, STREULICHT.hoehe + this.#hy(lx, lz), lz);
          this.streuLicht.intensity = (this.nachtsicht ? 0.3 : 1) * STREULICHT.staerke * dunkel;
        }
      }
    });
  }

  /**
   * Scheinwerfer: zwei Kegel links/rechts an der Front des nächsten gefahrenen Autos (eigenes zuerst) – ohne Schatten.
   * Eigene Lichter (nicht die Taschenlampe), damit keine Schattenkarte mitwandert.
   */
  #aktualisiereScheinwerfer(entitaeten, fokus, dunkel) {
    let auto = null;
    let bester = Infinity;
    for (const e of entitaeten) {
      if (e.typ !== 'fahrzeug' || e.kaputt || e.fahrerId == null) continue;
      const d = e.id === fokus.fahrzeugId ? -1 : Math.hypot(e.x - fokus.x, e.y - fokus.y);
      if (d < bester && d < SICHTWEITE) {
        bester = d;
        auto = e;
      }
    }
    const staerke = auto && dunkel > 0.02 ? (this.nachtsicht ? 300 : SCHEINWERFER.staerke * Math.min(1, dunkel * 3) + SCHEINWERFER.staerkeNacht * dunkel) : 0;
    this.scheinwerfer.forEach((spot, i) => {
      spot.intensity = staerke;
      if (!staerke) return;
      const ax = Math.cos(auto.winkel);
      const az = Math.sin(auto.winkel);
      const seite = (i === 0 ? -1 : 1) * auto.breite * 0.32;
      const vorn = auto.laenge / 2 + 1;
      const x = auto.x + ax * vorn - az * seite;
      const z = auto.y + az * vorn + ax * seite;
      spot.position.set(x, 16 + this.#hy(auto.x, auto.y), z);
      // leicht nach außen gedreht, damit die zwei Lichtkegel sichtbar getrennt beginnen und sich weiter vorn treffen
      const zx = x + ax * SCHEINWERFER.ziel - az * seite * 0.6;
      const zz = z + az * SCHEINWERFER.ziel + ax * seite * 0.6;
      spot.target.position.set(zx, this.#hy(zx, zz), zz);
    });
  }

  /** Nur die nächsten Kartenlampen bekommen ein echtes Licht aus dem Pool (feste Lichteranzahl = keine Shader-Neubauten). */
  #aktualisiereLampenPool(fokus, jetzt, dunkel) {
    if (dunkel < 0.03 || this.karte.lampen.length + this.feuerLampen.length === 0) {
      for (const l of this.lampenPool) l.intensity = 0;
      for (const l of this.kegelPool) l.intensity = 0;
      return;
    }
    // Alle paar Frames neu sortieren reicht – Punkt- und Kegel-Lampen getrennt
    if (!this.naechsteLampen || jetzt - this.lampenSortiert > 250) {
      this.lampenSortiert = jetzt;
      const lampen = this.feuerLampen.length > 0 ? [...this.karte.lampen, ...this.feuerLampen] : this.karte.lampen;
      const abstand = (a, b) => Math.hypot(a.x - fokus.x, a.z - fokus.y) - Math.hypot(b.x - fokus.x, b.z - fokus.y);
      this.naechsteLampen = lampen.filter((l) => l.objekt.art !== 'kegel' && !l.aus).sort(abstand).slice(0, this.lampenPool.length);
      this.naechsteKegel = lampen.filter((l) => l.objekt.art === 'kegel' && !l.aus).sort(abstand).slice(0, this.kegelPool.length);
    }
    this.kegelPool.forEach((licht, i) => {
      const lampe = this.naechsteKegel[i];
      if (!lampe) {
        licht.intensity = 0;
        return;
      }
      const w = ((lampe.objekt.richtung ?? 90) * Math.PI) / 180;
      licht.position.set(lampe.x, lampe.y, lampe.z);
      const zx = lampe.x + Math.cos(w) * lampe.reichweite * 0.55;
      const zz = lampe.z + Math.sin(w) * lampe.reichweite * 0.55;
      licht.target.position.set(zx, this.#hy(zx, zz), zz);
      licht.color.copy(lampe.farbe);
      licht.distance = lampe.reichweite * 1.4;
      licht.angle = Math.min(1.3, (((lampe.objekt.oeffnung ?? 60) / 2) * Math.PI) / 180);
      licht.penumbra = 0.45;
      licht.intensity = lampe.staerke * 2.2 * flackern(lampe.objekt, jetzt) * dunkel;
    });
    this.lampenPool.forEach((licht, i) => {
      const lampe = this.naechsteLampen[i];
      if (!lampe) {
        licht.intensity = 0;
        return;
      }
      licht.position.set(lampe.x, lampe.y, lampe.z);
      licht.color.copy(lampe.farbe);
      licht.distance = lampe.lichtReichweite ?? lampe.reichweite;
      licht.intensity = lampe.staerke * (lampe.objekt.feuer ? feuerFlackern(lampe.objekt, jetzt) : flackern(lampe.objekt, jetzt)) * dunkel;
    });
  }

  #itemMaterial(defId) {
    if (this.itemMaterialien.has(defId)) return this.itemMaterialien.get(defId);
    const icon = this.assets?.item(defId);
    const bild = this.assets?.itemBild;
    const canvas = document.createElement('canvas');
    canvas.width = icon?.b ?? 8;
    canvas.height = icon?.h ?? 8;
    if (icon && bild) canvas.getContext('2d').drawImage(bild, icon.x, icon.y, icon.b, icon.h, 0, 0, icon.b, icon.h);
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    const massstab = ((icon?.weltGroesse ?? 20) * 1.4) / Math.max(canvas.width, canvas.height);
    const basis = { map: textur, emissiveMap: textur, emissive: 0xffffff, transparent: true, alphaTest: 0.3 };
    const eintrag = {
      normal: new THREE.MeshStandardMaterial({ ...basis, emissiveIntensity: 0 }), // kein Eigenleuchten: Items bleiben nachts dunkel (nur die Markierung glüht)
      markiert: new THREE.MeshStandardMaterial({ ...basis, emissiveIntensity: 0.8 }),
      geometrie: new THREE.PlaneGeometry(canvas.width * massstab, canvas.height * massstab).rotateX(-Math.PI / 2),
    };
    this.itemMaterialien.set(defId, eintrag);
    return eintrag;
  }

  /** 3D-Modell (itemModelle.js) – oder, falls es keins gibt, das flache Icon. */
  #itemMesh(g) {
    const geometrie = itemGeometrie(g.defId);
    let mesh;
    if (geometrie) {
      mesh = new THREE.Mesh(geometrie, ITEM_MATERIAL);
      mesh.castShadow = true;
      mesh.rotation.y = ((g.id * 2.399) % (Math.PI * 2)); // jedes Item liegt anders da
      mesh.position.set(g.x, this.#hy(g.x, g.y), g.y);
    } else {
      const m = this.#itemMaterial(g.defId);
      mesh = new THREE.Mesh(m.geometrie, m.normal);
      mesh.userData.icon = true;
      mesh.position.set(g.x, 1.5 + this.#hy(g.x, g.y), g.y);
    }
    mesh.userData.defId = g.defId;
    return mesh;
  }

  /** Roter, pulsierender Ring um den anvisierten Zombie. */
  #aktualisiereZielRing(entitaeten, zielId, jetzt) {
    const ziel = zielId !== null ? entitaeten.find((e) => e.id === zielId && e.typ === 'zombie' && !e.tot) : null;
    this.zielRing.visible = !!ziel;
    if (!ziel) return;
    const r = (ziel.groesse ?? 1) * (1 + Math.sin(jetzt / 180) * 0.07);
    this.zielRing.position.set(ziel.x, 1 + this.#hy(ziel.x, ziel.y), ziel.y);
    this.zielRing.scale.set(r, 1, r);
    this.zielRing.rotation.y = jetzt / 700;
  }

  #aktualisiereItems(gegenstaende, markiertId, jetzt) {
    const gesehen = new Set();
    for (const g of gegenstaende) {
      gesehen.add(g.id);
      let mesh = this.items.get(g.id);
      if (!mesh) {
        mesh = this.#itemMesh(g);
        this.items.set(g.id, mesh);
        this.szene.add(mesh);
      }
      if (mesh.userData.icon) {
        const m = this.itemMaterialien.get(g.defId);
        mesh.material = g.id === markiertId ? m.markiert : m.normal;
      }
      // Markiertes Item (E hebt es auf): hüpft leicht, Ring darunter
      mesh.position.y = this.#hy(g.x, g.y) + (mesh.userData.icon ? 1.5 : 0) + (g.id === markiertId ? 2 + Math.sin(jetzt / 180) * 1.5 : 0);
      if (g.id === markiertId) this.markierRing.position.set(g.x, 0.6 + this.#hy(g.x, g.y), g.y);
    }
    this.markierRing.visible = markiertId !== null && this.items.has(markiertId);
    if (this.markierRing.visible) {
      this.markierRing.material.opacity = 0.55 + Math.sin(jetzt / 150) * 0.25;
      this.markierRing.rotation.y = jetzt / 900;
    }
    if (markiertId !== null) this.itemMaterialien.forEach((m) => (m.markiert.emissiveIntensity = 0.6 + Math.sin(jetzt / 150) * 0.3));
    for (const [id, mesh] of this.items) {
      if (gesehen.has(id)) continue;
      this.szene.remove(mesh);
      this.items.delete(id);
    }
  }

  /**
   * Sonne/Mond, Himmel, Nebel nach Tageszeit. @returns dunkel 0 (Mittag) … 1 (Nacht) – für Lampen & Taschenlampen
   */
  #tageslicht(tageszeit, ziel) {
    const hell = this.nachtsicht ? 1 : (tageszeit?.helligkeit ?? 0);
    const dunkel = 1 - hell;
    // Sonne wandert von Ost nach West (Schatten drehen mit), nachts steht der Mond schräg im Süden
    const anteil = tageszeit?.anteil ?? 0.5;
    const bogen = tageszeit?.istNacht ? 0.35 : anteil;
    const winkel = Math.PI * (1 - bogen);
    this.mond.position.set(ziel.x + Math.cos(winkel) * 700, 650 + Math.sin(winkel) * 450, ziel.z + 380);
    this.mond.target.position.copy(ziel);
    // Farben mischen: Nacht (blau) → Dämmerung (orange) → Tag (warm-weiß)
    const daemmerung = Math.max(0, 1 - Math.abs(hell - 0.35) / 0.35) * (tageszeit?.istNacht ? 0 : 1);
    this.mond.color.copy(NACHT.sonne).lerp(TAG.sonne, hell).lerp(DAEMMERUNG.sonne, daemmerung * 0.6);
    // Nächte sind dunkel: Licht gibt es v. a. an Lampen, Feuern, Taschenlampe und Scheinwerfern (Editor 2.0, 2.1) – Runde 18: minimal heller, Umrisse/Hindernisse bleiben erkennbar
    this.mond.intensity = NACHT_MOND + hell * (3 - NACHT_MOND);
    this.umgebung.color.copy(NACHT.himmel).lerp(TAG.himmel, hell);
    this.umgebung.groundColor.copy(NACHT.boden).lerp(TAG.boden, hell);
    this.umgebung.intensity = NACHT_UMGEBUNG + hell * (1.3 - NACHT_UMGEBUNG);
    this.szene.background.copy(NACHT.hintergrund).lerp(TAG.hintergrund, hell).lerp(DAEMMERUNG.hintergrund, daemmerung * 0.5);
    this.szene.fog.color.copy(this.szene.background);
    // Sonnenschatten: nachts (Mond ≈ 0) keinen Szenen-Durchgang; Schattenkamera nur so groß wie der sichtbare Bereich (zoomabhängig)
    this.mond.shadow.autoUpdate = this.mond.intensity > 0.25 && this.#schattenDran();
    const schattenHalb = Math.round((560 * Math.max(0.9, this.zoom * this.fahrZoom)) / 20) * 20;
    if (this.mond.shadow.camera.right !== schattenHalb) {
      Object.assign(this.mond.shadow.camera, { left: -schattenHalb, right: schattenHalb, top: schattenHalb, bottom: -schattenHalb });
      this.mond.shadow.camera.updateProjectionMatrix();
    }
    const eigenLeuchten = NACHT_EIGENLEUCHTEN * dunkel;
    for (const m of this.spielerMaterialien) m.emissiveIntensity = eigenLeuchten;
    // Nebel wandert mit der Kamera (Zoom, Auto-Fahrt): sonst liegt beim Rauszoomen/Fahren alles hinter dem Nebel
    const abstand = this.istAbstand ?? (this.grundAbstand ?? 1) * this.zoom * this.fahrZoom;
    const istZoom = abstand / ((this.grundAbstand ?? 1) * this.fahrZoom);
    // Wetter: Regen/Nebel dämpfen Sonne & Himmel, färben den Hintergrund grau und rücken den Nebel heran
    const { regen, nebel } = this.wetterEffekt;
    const stimmung = Math.max(regen, nebel);
    if (stimmung > 0.001) {
      this.mond.intensity *= 1 - 0.4 * regen * hell - 0.25 * nebel * hell;
      this.umgebung.intensity *= 1 - 0.18 * regen;
      // ⚠ Runde 18: nachts muss das Regengrau so dunkel sein wie die Szene – sonst „verschluckt“ heller Nebel alles (Figur weg,
      // „nach dem Respawn sieht man nichts mehr“ war nachts bei Regen/Nebel)
      _wetterGrau.setRGB(0.6, 0.64, 0.7).multiplyScalar(0.02 + 0.98 * hell * hell);
      this.szene.background.lerp(_wetterGrau, 0.7 * stimmung);
      this.szene.fog.color.copy(this.szene.background);
    }
    // Runde 23: Gewitter dunkler, Blitz hellt alles kurz bläulich-weiß auf
    const { gewitter, blitz } = this.wetterEffekt;
    if (gewitter > 0.001) {
      this.mond.intensity *= 1 - 0.3 * gewitter * hell;
      this.umgebung.intensity *= 1 - 0.12 * gewitter;
    }
    if (blitz > 0.001) {
      this.umgebung.intensity += blitz * 2.4;
      this.mond.intensity += blitz * 1.5;
      this.szene.background.lerp(_blitzFarbe, 0.6 * blitz);
      this.szene.fog.color.copy(this.szene.background);
    }
    // Runde 24: Blutmond – rotes Mondlicht, rötlicher Nachthimmel (blendet weich, nur nachts)
    this.blutmond += ((this.blutmondZiel ?? 0) * dunkel - this.blutmond) * 0.02;
    if (this.blutmond > 0.005) {
      const b = this.blutmond;
      this.mond.color.lerp(_blutRot, b);
      this.mond.intensity *= 1 + 0.9 * b;
      this.umgebung.color.lerp(_blutRot, 0.5 * b);
      this.szene.background.lerp(_blutHimmel, 0.8 * b);
      this.szene.fog.color.copy(this.szene.background);
    }
    const dicht = Math.min(1, nebel + 0.35 * regen);
    // Dichter Nebel darf kräftig sein, aber nie die Figur selbst verschlucken (Top-Down: Kamera ~677 px × Zoom entfernt)
    const kamAbstand = KAMERA_VERSATZ.length() * abstand;
    const nah = Math.max((650 + hell * 600) * abstand * (1 - 0.82 * dicht), kamAbstand * 1.04); // Nebel beginnt erst hinter der Figur
    // Reingezoomt (< 1) schaut man auf einen kleinen Ausschnitt: Nebel weiter nach hinten schieben, sonst liegt ein grauer Schleier über dem oberen Bildrand
    const reingezoomt = 1 + 0.9 * Math.max(0, 1 - istZoom);
    this.szene.fog.near = nah * reingezoomt;
    this.szene.fog.far = Math.max((1500 + hell * 1500) * abstand * (1 - 0.62 * dicht), nah + kamAbstand * (0.5 + 0.3 * hell)) * reingezoomt;
    this.#zeichneHimmel(hell, daemmerung, regen, nebel, abstand, kamAbstand);
    // Runde 26: Notbremse – kaputte Nebelwerte (NaN/∞) hüllen sonst alles dauerhaft in Nebelfarbe
    if (!Number.isFinite(this.szene.fog.near) || !Number.isFinite(this.szene.fog.far) || this.szene.fog.far <= this.szene.fog.near) {
      this.istAbstand = undefined;
      this.#kameraAbstand();
    }
    if (this.blutmond > 0.005) this.himmel.uniforms.uZenit?.value.lerp(_blutHimmel, 0.7 * this.blutmond);
    return dunkel;
  }

  /**
   * Himmel nach Tageszeit & Wetter + Weltkante als Horizont: Die Kamera-Ferne wird knapp hinter den oberen Bildrand gelegt, die Welt
   * verblasst per Nebel in die Horizontfarbe, darüber beginnt der Himmel (siehe himmel.js). Im Ego-Modus bleibt alles beim Alten.
   */
  #zeichneHimmel(hell, daemmerung, regen, nebel, abstand, kamAbstand) {
    const ego = !!this.egoHaken;
    this.himmel.sichtbar = true;
    const kamera = this.kamera3d;
    // Ego: feste Sichtweite (= was die Draufsicht beim weitesten Rauszoomen zeigt), dichter Nebel/Regen verkürzt sie
    const egoSicht = ego ? this.#egoSichtweite() * (1 - 0.6 * Math.min(1, nebel + 0.35 * regen)) : 0;
    const ferne = ego ? egoSicht * 1.02 : kamAbstand * HIMMEL_FERNE;
    if (Math.abs(kamera.far - ferne) > 0.5) {
      kamera.far = ferne;
      kamera.updateProjectionMatrix();
    }
    let schnitt;
    if (ego) {
      this.szene.fog.near = egoSicht * 0.45;
      this.szene.fog.far = egoSicht;
      // Ego: echter Horizont – Bildhöhe der Horizontlinie aus der Kameraneigung; der Himmel füllt alles darüber
      kamera.getWorldDirection(_blick);
      const neigung = Math.asin(Math.max(-1, Math.min(1, _blick.y)));
      schnitt = Math.min(1.5, Math.max(-0.5, 0.5 - (0.5 * Math.tan(neigung)) / Math.tan((kamera.fov * Math.PI) / 360)));
    } else {
      // Nebel endet an der Kamera-Ferne (nie näher als vor der Figur): so ist die Weltkante unsichtbar
      this.szene.fog.far = Math.min(this.szene.fog.far, ferne);
      this.szene.fog.near = Math.max(kamAbstand * 0.92, Math.min(this.szene.fog.near, ferne - kamAbstand * HIMMEL_DUNST));
    }
    // Wo auf dem Bildschirm schneidet die Bodenebene die Kamera-Ferne? (Tiefe = Ferne, Neigung der Kamera aus dem Versatz)
    if (!ego) {
    const hoeheUeberBoden = KAMERA_VERSATZ.y * abstand;
    const neigung = Math.atan2(hoeheUeberBoden, KAMERA_VERSATZ.z * abstand + 20);
    const kot = (ferne / hoeheUeberBoden - Math.sin(neigung)) / Math.cos(neigung);
    const winkel = kot > 0 ? Math.atan(1 / kot) : Math.PI / 2;
    const bildY = Math.tan(neigung - winkel) / Math.tan((kamera.fov * Math.PI) / 360);
    schnitt = Math.min(0.97, Math.max(0.55, 0.5 + 0.5 * bildY));
    }
    const stimmung = Math.max(regen, nebel);
    _zenit.copy(NACHT.zenit).lerp(TAG.zenit, hell).lerp(DAEMMERUNG.zenit, daemmerung * 0.55);
    _wolkenFarbe.copy(NACHT.wolken).lerp(TAG.wolken, hell).lerp(DAEMMERUNG.wolken, daemmerung * 0.6);
    if (stimmung > 0.001) {
      // Regen/Nebel: dunkelgrauer, dicht bewölkter Himmel (tagsüber am deutlichsten)
      const grau = Math.min(1, 0.9 * regen + 0.55 * nebel);
      _zenit.lerp(_wetterGrau.copy(REGEN_ZENIT).multiplyScalar(0.1 + 0.9 * hell), grau);
      _wolkenFarbe.lerp(_wetterGrau.copy(REGEN_WOLKEN).multiplyScalar(0.12 + 0.88 * hell), grau);
    }
    const dunkel = 1 - hell;
    const wolken = Math.min(1, 0.34 + 0.75 * regen + 0.5 * nebel) * (1 - 0.4 * dunkel);
    this.gl.getDrawingBufferSize(_buffer);
    this.himmel.setze({
      horizont: this.szene.background,
      zenit: _zenit,
      sterne: Math.min(1, Math.max(0, (0.45 - hell) / 0.45)) * (1 - 0.8 * stimmung),
      wolken,
      wolkenFarbe: _wolkenFarbe,
      schnitt,
      zeit: performance.now() / 1000,
      breite: _buffer.x,
      hoehe: _buffer.y,
    });
  }

  #blutMesh(fleck) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fleck.groesse, fleck.groesse),
      new THREE.MeshStandardMaterial({ map: this.karte.sprite(fleck.sprite), transparent: true, depthWrite: false, roughness: 0.4, ...(fleck.farbe ? { color: fleck.farbe } : {}) }),
    );
    mesh.rotation.set(-Math.PI / 2, 0, fleck.winkel);
    mesh.position.set(fleck.x, 0.6 + this.#hy(fleck.x, fleck.y), fleck.y);
    return mesh;
  }

  #aktualisiereEffekte({ leuchtspuren, feuer, partikel, flecken, schadenBlitz, spucken, explosionen, pfeile, wuerfe, braende }) {
    this.sonderEffekte.wuerfeUndBraende(wuerfe ?? [], braende ?? [], (x, y) => this.#hy(x, y), this.letzteZeit ?? performance.now());
    this.sonderEffekte.aktualisiere(spucken ?? [], explosionen ?? [], (x, y) => this.#hy(x, y), this.letzterFokus);
    this.sonderEffekte.pfeileZeigen(pfeile ?? [], (x, y) => this.#hy(x, y));
    // Leuchtspuren als Linien in Brusthöhe (fester Puffer, keine neuen Arrays pro Frame)
    const spuren = Math.min(leuchtspuren.length, 64);
    for (let i = 0; i < spuren; i++) {
      const s = leuchtspuren[i];
      const a = this.spurPunkte.array;
      const k = i * 6;
      a[k] = s.x;
      a[k + 1] = ZIELHOEHE;
      a[k + 2] = s.y;
      a[k + 3] = s.zx;
      a[k + 4] = ZIELHOEHE;
      a[k + 5] = s.zy;
    }
    this.spurGeometrie.setDrawRange(0, spuren * 2);
    this.spurPunkte.needsUpdate = spuren > 0;
    // Mündungsfeuer als kurze Punktlichter
    this.muendungslichter.forEach((licht, i) => {
      const f = feuer[i];
      licht.intensity = f ? (f.staerke ?? 1400) * (1 - f.alter / f.dauer) : 0;
      if (f) licht.position.set(f.x, (f.hoehe ?? ZIELHOEHE + 6) + this.#hy(f.x, f.y), f.y);
    });
    // Blutspritzer
    const anzahl = Math.min(partikel.length, 400);
    for (let i = 0; i < anzahl; i++) {
      const t = partikel[i];
      const p = this.partikelPunkte.array;
      const f = this.partikelFarben.array;
      p[i * 3] = t.x;
      p[i * 3 + 1] = 12 + (1 - t.alter / t.dauer) * 20;
      p[i * 3 + 2] = t.y;
      PARTIKEL_FARBE.set(t.farbe);
      f[i * 3] = PARTIKEL_FARBE.r;
      f[i * 3 + 1] = PARTIKEL_FARBE.g;
      f[i * 3 + 2] = PARTIKEL_FARBE.b;
    }
    this.partikelFarben.needsUpdate = anzahl > 0;
    this.partikelGeometrie.setDrawRange(0, anzahl);
    this.partikelPunkte.needsUpdate = anzahl > 0;
    // Blutlachen am Boden
    const aktiv = new Set(flecken);
    for (const fleck of flecken) {
      if (this.blutFlecken.has(fleck)) continue;
      const mesh = this.#blutMesh(fleck);
      this.szene.add(mesh);
      this.blutFlecken.set(fleck, mesh);
    }
    for (const [fleck, mesh] of this.blutFlecken) {
      if (aktiv.has(fleck)) {
        mesh.material.opacity = Math.min(1, (1 - fleck.alter / fleck.dauer) * 4) * 0.9;
        continue;
      }
      this.szene.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
      this.blutFlecken.delete(fleck);
    }
    // Roter Rand bei Schaden: CSS-Ebene, nur bei Änderung anfassen
    const schaden = Math.round(schadenBlitz * 20) / 20;
    if (schaden !== this.letzterSchaden && this.schadenEbene) {
      this.letzterSchaden = schaden;
      this.schadenEbene.style.opacity = String(schaden);
    }
  }

  /** 2D-Ebene über der 3D-Szene: Namen, Lebensbalken und kleine Item-Namen am Boden (Vignette & Schaden sind CSS). */
  /** Chat-Sprechblase über dem Spieler mit diesem Namen (Runde 18); Anzeigedauer nach Textlänge. */
  zeigeSprechblase(name, text, jetzt = performance.now()) {
    if (!name || !text) return;
    const dauer = Math.min(SPRECHBLASE_MAX_MS, SPRECHBLASE_MS + String(text).length * 60);
    this.sprechblasen.set(name, { text, bis: jetzt + dauer });
  }

  #zeichneOverlay(entitaeten, fokus, gegenstaende = [], itemDefinitionen = {}) {
    const ctx = this.octx;
    const jetzt = this.letzteZeit;
    const zuZeichnen = [];
    const blasen = [];
    for (const [name, b] of this.sprechblasen) if (b.bis <= jetzt) this.sprechblasen.delete(name);
    for (const e of entitaeten) {
      if (e.tot || (e.typ !== 'spieler' && e.typ !== 'zombie' && !(e.typ === 'tier' && e.name))) continue;
      if (Math.abs(e.x - fokus.x) > SICHTWEITE || Math.abs(e.y - fokus.y) > SICHTWEITE) continue;
      const braucht = e.typ === 'spieler' ? !e.istEigener : e.typ === 'tier' ? true : e.leben < e.maxLeben; // Runde 24: Haustiere mit Namen
      if (braucht) zuZeichnen.push(e);
      const blase = e.typ === 'spieler' && !this.egoHaken ? this.sprechblasen.get(e.name) : null;
      if (blase) blasen.push({ e, blase });
    }
    const beschriftet = [];
    if (!this.egoHaken) {
      for (const g of gegenstaende) {
        if (Math.abs(g.x - fokus.x) > ITEM_NAMEN_RADIUS || Math.abs(g.y - fokus.y) > ITEM_NAMEN_RADIUS) continue;
        if (Math.hypot(g.x - fokus.x, g.y - fokus.y) > ITEM_NAMEN_RADIUS) continue;
        if (itemDefinitionen[g.defId]?.name && this.karte.istEinsehbar(g.x, g.y)) beschriftet.push(g);
      }
    }
    if (zuZeichnen.length === 0 && beschriftet.length === 0 && blasen.length === 0 && !this.overlayBenutzt) return;
    this.overlayBenutzt = zuZeichnen.length > 0 || beschriftet.length > 0 || blasen.length > 0;
    const dpr = this.overlay.width / Math.max(1, this.kamera.breite);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of zuZeichnen) {
      const kopf = this.kamera.weltZuBildschirm(e.x, e.y, e.typ === 'tier' ? 30 : FIGUR_HOEHE * (e.groesse ?? 1) + 8);
      zeichneBeschriftung(ctx, { ...e, x: kopf.x, y: kopf.y + 30 });
    }
    for (const g of beschriftet) {
      const p = this.kamera.weltZuBildschirm(g.x, g.y, 12);
      zeichneItemName(ctx, g.menge > 1 ? `${itemDefinitionen[g.defId].name} ×${g.menge}` : itemDefinitionen[g.defId].name, p.x, p.y - 4);
    }
    for (const { e, blase } of blasen) {
      const kopf = this.kamera.weltZuBildschirm(e.x, e.y, FIGUR_HOEHE * (e.groesse ?? 1) + 8);
      const ueberName = e.istEigener ? 4 : 18; // fremde Spieler: über Name + Lebensbalken
      zeichneSprechblase(ctx, blase.text, kopf.x, kopf.y - ueberName, Math.min(1, (blase.bis - jetzt) / 500));
    }
  }

  /** Sichtweite der Ich-Ansicht in px: Halbbreite des Draufsicht-Bildes am Boden bei EGO_SICHT_ZOOM (Bildschirm-Seitenverhältnis, mindestens 1:1) */
  #egoSichtweite() {
    const abstand = KAMERA_VERSATZ.length() * (this.grundAbstand ?? 1) * EGO_SICHT_ZOOM;
    const halbHoehe = Math.tan((38 * Math.PI) / 360) * abstand;
    return halbHoehe * Math.max(1, this.kamera3d.aspect) * EGO_SICHT_FAKTOR;
  }

  /** Kameraabstand = Bildschirmgröße × Zoom; Nebel wandert mit, damit man beim Rauszoomen nicht ins Graue schaut. */
  #kameraAbstand() {
    const abstand = (this.grundAbstand ?? 1) * this.zoom;
    this.kameraVersatz = KAMERA_VERSATZ.clone().multiplyScalar(abstand);
    this.szene.fog.near = 650 * abstand;
    this.szene.fog.far = 1500 * abstand;
  }

  #groesseAnpassen() {
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    // Runde 26: minimiertes/verdecktes Fenster meldet 0 px → Seitenverhältnis ∞, Kamera/Nebel NaN → „alles neblig“. Dann nichts tun.
    if (!(breite >= 2 && hoehe >= 2)) return;
    this.gl.setPixelRatio(this.aufloesung);
    this.gl.setSize(breite, hoehe, false);
    // Overlay-Canvas (nur Text) – höchstens 1,5-fach, das reicht für scharfe Schrift
    const overlayDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.overlay.width = Math.round(breite * overlayDpr);
    this.overlay.height = Math.round(hoehe * overlayDpr);
    this.overlayBenutzt = true;
    this.kamera3d.aspect = breite / hoehe;
    // Kleine Bildschirme (Handy): Kamera etwas weiter weg, damit man genug von der Umgebung sieht
    this.grundAbstand = Math.min(1.35, Math.max(1, Math.sqrt(720 / Math.max(1, Math.min(breite, hoehe)))));
    this.#kameraAbstand();
    this.kamera3d.updateProjectionMatrix();
    this.kamera.breite = breite;
    this.kamera.hoehe = hoehe;
  }
}

/** Kamera für Zielen (Maus → Welt) & Overlay (Welt → Bildschirm). */
class KameraAdapter {
  constructor(renderer) {
    this.renderer = renderer;
    this.breite = 1;
    this.hoehe = 1;
    this.zoom = 1;
    this.strahl = new THREE.Raycaster();
    this.ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ZIELHOEHE);
    this.boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.v = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    this.punkt = new THREE.Vector3();
  }

  weltZuBildschirm(x, y, hoehe = 0) {
    const v = this.v.set(x, hoehe + this.renderer.bodenHoehe(x, y), y).project(this.renderer.kamera3d);
    return { x: ((v.x + 1) / 2) * this.breite, y: ((1 - v.y) / 2) * this.hoehe };
  }

  /** Mausposition → Punkt in der Welt (Strahl auf eine Ebene in Brusthöhe). */
  bildschirmZuWelt(sx, sy) {
    // Gelände: Zielebene in Brusthöhe ÜBER der eigenen Figur (Draufsicht trifft 2D – Nutzer-Entscheidung F4)
    this.ebene.constant = -(ZIELHOEHE + (this.renderer.kameraHoehe ?? 0));
    this.ndc.set((sx / this.breite) * 2 - 1, -(sy / this.hoehe) * 2 + 1);
    this.strahl.setFromCamera(this.ndc, this.renderer.kamera3d);
    if (!this.strahl.ray.intersectPlane(this.ebene, this.punkt)) return null;
    return { x: this.punkt.x, y: this.punkt.z };
  }

  /** Mausposition → Punkt auf dem Boden (y = 0) – zum Bauen/Platzieren. */
  bildschirmZuBoden(sx, sy) {
    this.boden.constant = -(this.renderer.kameraHoehe ?? 0);
    this.ndc.set((sx / this.breite) * 2 - 1, -(sy / this.hoehe) * 2 + 1);
    this.strahl.setFromCamera(this.ndc, this.renderer.kamera3d);
    if (!this.strahl.ray.intersectPlane(this.boden, this.punkt)) return null;
    return { x: this.punkt.x, y: this.punkt.z };
  }

  istSichtbar() {
    return true;
  }
}

/** Zaun: welche Nachbarn (Zäune, Tore, Wände) sind verbunden? Bits 1 = Ost, 2 = Süd, 4 = West, 8 = Nord (0 = kein Zaun). */
const ZAUN_VERBINDER = new Set(['zaun', 'zauntor', 'holzwand', 'holzwand_fenster', 'holzwand_tuer']);
function zaunMaske(welt, b) {
  if (b.typ !== 'zaun') return 0;
  let maske = 0;
  for (const [dx, dy, bit] of [[1, 0, 1], [0, 1, 2], [-1, 0, 4], [0, -1, 8]]) {
    const n = welt.bauwerkBei(b.tx + dx, b.ty + dy, 'wand');
    if (n && ZAUN_VERBINDER.has(n.typ)) maske |= bit;
  }
  return maske || 5;
}

/** Lagerfeuer: unruhiges, warmes Flackern. */
function feuerFlackern(o, jetzt) {
  const t = jetzt / 1000 + o.x * 3.7 + o.y * 1.3;
  return 0.78 + Math.sin(t * 11) * 0.09 + Math.sin(t * 17.3) * 0.07 + Math.sin(t * 5.1) * 0.06;
}

/** Manche Lampen flackern (Notstrom!). Deterministisch pro Lampe, ohne Zufallszahlen pro Frame. */
function flackern(lampe, jetzt) {
  if (!lampe.flackern) return 1;
  const t = jetzt / 1000 + lampe.x * 7.3 + lampe.y * 3.1;
  const welle = Math.sin(t * 13) * Math.sin(t * 7.7) * Math.sin(t * 2.3);
  return welle > 0.55 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 31);
}

function ladeGrafik() {
  try {
    const gespeichert = localStorage.getItem(GRAFIK_SCHLUESSEL);
    if (gespeichert in GRAFIK_PROFILE) return gespeichert;
  } catch {
    // egal
  }
  return 'auto';
}
