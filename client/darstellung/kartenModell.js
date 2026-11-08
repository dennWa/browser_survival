import * as THREE from 'three';
import { WAND_ARTEN, KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { ladeGlbGeometrien, einpassen } from './glbGeometrien.js';
import { baueBaum, ladeStuempfe, stumpfMaterial, STUMPF_GRUPPEN, STUMPF_FORMEN, toonMaterial, ladeTanneAusGlb, BAUM_LAUB_TOENE, BAUM_VARIANTE_INFO, BAUM_GRUNDFLAECHE, baumVarianten, waehleBaumVariante, ladeBaumVariante, leereBaumGeometrie, laubMaterial, baumWindMaterial, stammBreite, STUMPF_BREITE, STUMPF_MIN_BREITE } from './baumModell.js';
import { BodenTextur } from './bodenTextur.js';
import { Daecher } from './dachModell.js';
import { WandDurchsicht } from './wandDurchsicht.js';
import { wendeWandTexturAn, wandArtFarbe, ohneFarbe } from './wandTexturen.js';
import { einfrieren, matrixAus, vereineGeometrien } from './geometrie.js';
import { eigeneGroesse } from '../../gemeinsam/welt/drehung.js';
import { eigenesModellUrl, ladeEigenesModell, eigenesModellInhalt, leerlaufMischer } from './eigeneModelle.js';
import { StrassenNaesse } from './nasseStrassen.js';
import { BLOCK_KACHELN, BlockInstanzen, boxZweiGruppen, kulEintrag, kulleNachWeite } from './bloecke.js';

/**
 * Die Karte als 3D-Modell – auf wenige Draw-Calls optimiert (Performance!):
 *   Boden        je 32×32-Kachel-Block ein Mesh + eigene kleine Textur (Runde 19, BODEN_BLOCK; sichtbar nach bodenHochladen)
 *   Wände/Glas   InstancedMesh je Block (BlockInstanzen, Runde 18) – 2 Materialgruppen je Block
 *   Möbel        je Block ein Mesh mit allen Möbelseiten (Vertexfarben) + je Block und Möbeltyp ein Mesh für die Deckel
 *   Culling      alles blockweise: Frustum (three.js) + Sichtweite (kulle, Nebelweite + Puffer)
 *   Bäume/Steine InstancedMesh pro Teil – einzelne Instanzen werden beim Abbauen ausgeblendet (Stumpf erscheint)
 *   Türen        einzelne Flügel (bewegen sich)
 *   Lampen       nur ein kleines Glühen pro Lampe; echtes Licht kommt aus einem Pool im Renderer
 *   Lichterketten (Runde 42, Kartenfeld `lichterketten`) Kabel + Birnen in 2 Meshes, Birnen glühen nachts (emissiveIntensity)
 *
 * Alles außer Türen und Ressourcen wird "eingefroren" (Matrizen nicht jeden Frame neu berechnen).
 * Bau: am Stück (Konstruktor) oder in kleinen Schritten (KartenModell.baueSchrittweise – Ladebildschirm mit Fortschritt).
 */
export const WANDHOEHE = 84;
export const TUER_HOEHE = WANDHOEHE - 14;
/** Höhe des Lichtpunkts einer Straßenlaterne – deutlich über der Figur (64 px) */
export const LATERNEN_LICHTHOEHE = 124; // Runde 18: Laternen etwas kleiner (vorher 150)
const TUER_DREHTEMPO = 9;
/** Höhe (Weltpixel) der Möbel-Quader */
const MOEBEL_HOEHE = {
  bett: 18, bett_orange: 18, tisch: 24, tisch_rund: 24, stuhl: 14, sessel: 18, sessel_blau: 18, sofa: 18, sofa_dunkel: 18,
  kiste: 26, kiste_klein: 16, pflanze: 30, kueche_theke: 30, kueche_herd: 30, kueche_spuele: 30, kueche_kochfeld: 30,
  auto_schwarz: 38, auto_blau: 38, auto_rot: 38, auto_gruen: 38, auto_gelb: 38, transporter: 46, fass: 28, pylone: 18,
  werkbank: 26,
};
const _matrix = new THREE.Matrix4();
const _vektor = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _skala = new THREE.Vector3();
const _achseY = new THREE.Vector3(0, 1, 0);
const INSTANZ_AB = 3; // Runde 44: ab so vielen gleichen eigenen Modellen (gleiche Maße) instanziert zeichnen

/** Weicher, runder Lichtschein (radialer Verlauf) für den Boden unter Lampen – einmal erzeugt, geteilt */
let lichtscheinCache = null;
function lichtscheinTextur() {
  if (lichtscheinCache) return lichtscheinCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const verlauf = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  verlauf.addColorStop(0, 'rgba(255,255,255,0.9)');
  verlauf.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  verlauf.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, 64, 64);
  lichtscheinCache = new THREE.CanvasTexture(c);
  return lichtscheinCache;
}
const NULL_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
/** Kantenlänge (Kacheln) der Blöcke, in die Bäume/Steine fürs Frustum-Culling aufgeteilt werden (Performance: sonst zeichnet jeder Frame ALLE Bäume der Karte). */
const CHUNK_KACHELN = 12;
/** Three.js-Layer, auf dem alle Türblätter zusätzlich liegen: der Renderer zeichnet sie nochmal als Schimmer, wo Wände sie verdecken. */
export const TUER_EBENE = 2;
/** Nur Türen näher als das (px) schimmern durch Wände (schwacher X-Ray, damit Eingänge auffindbar sind) */
export const TUER_SCHIMMER_WEITE = 96;
/** Runde 19: Kantenlänge eines Boden-Blocks in Kacheln (32 → bei voller Auflösung 1024 px ≈ 4 MB je Textur, hochgeladen in wenigen ms) */
export const BODEN_BLOCK = 32;

/** Modell-Animationen laufen nur bis zu dieser Entfernung (Kacheln) von der Kamera – spart Rechenzeit auf großen Karten */
const ANIMATION_WEITE = 40;

/** Runde 31: Helligkeit des Baumstamms nach 0…3 abgeschnittenen Rinden-Stücken (Multiplikator auf die Vertexfarbe) */
const RINDE_HELLIGKEIT = [1, 1.45, 1.9, 2.4];
const _rindeFarbe = new THREE.Color();

export class KartenModell {
  /**
   * @param mitSchnitt  Funktion, die einem Material den Wand-Schnitt (siehe Renderer) verpasst
   * @param bodenMassstab  Auflösung der Bodentextur (Pixel pro Weltpixel) – auf Handys kleiner
   */
  constructor({ welt, assets, gl, mitSchnitt, bodenMassstab = 1, aufgeschoben = false }) {
    this.welt = welt;
    this.assets = assets;
    this.gl = gl;
    this.mitSchnitt = mitSchnitt;
    this.g = welt.kachelGroesse;
    this.spriteCache = new Map();
    /** Geländehöhe (Weltpixel) an x/z – 0 ohne Gelände. Alles Statische wird beim Bau darauf gestellt (Editor 2.0, 2.5). */
    this.hy = (x, z) => welt.hoeheBei(x, z);

    this.statisch = new THREE.Group();
    this.beweglich = new THREE.Group(); // Türen, Ressourcen
    /** Leerlauf-Animationen eigener Modelle (Map-Editor 5.3): [{ mischer, x, z }] – nur in der Nähe der Kamera abgespielt */
    this.mischer = [];
    /** Sichtweiten-Culling (Runde 18, 4.1): [{ objekt, x, y, z, r, sichtbar }] in Modell-Koordinaten (bloecke.js) */
    this.kulEintraege = [];
    this.blockPx = BLOCK_KACHELN * this.g;
    this.bodenMassstab = bodenMassstab;
    if (!aufgeschoben) for (const _ of this.#schritte()) {
      /* alles am Stück (aktive Karte, hinter dem Ladebild) */
    }
  }

  /**
   * Karte in kleinen Schritten bauen (Ladebildschirm: Renderer.bereiteVor). Erster Wert = das (noch leere) Modell, damit der
   * Aufrufer den Fortschritt an `bodenBloecke` ablesen kann; Ergebnis = fertiges Modell (Boden-Texturen noch nicht hochgeladen,
   * siehe bodenHochladen).
   */
  static *baueSchrittweise(optionen) {
    const modell = new KartenModell({ ...optionen, aufgeschoben: true });
    yield modell;
    yield* modell.#schritte();
    return modell;
  }

  *#schritte() {
    yield* this.#baueBoden(this.bodenMassstab);
    yield;
    this.#baueWasser();
    this.naesse = new StrassenNaesse({ welt: this.welt, g: this.g, hy: this.hy, wandHoehe: WANDHOEHE }); // Runde 38: nasse Straßen + Dachtropfen
    this.statisch.add(this.naesse.gruppe);
    yield;
    this.#baueWaende();
    yield;
    this.#baueDaecher();
    yield;
    this.#baueDurchsicht();
    yield;
    this.#baueMoebel();
    yield;
    this.#baueEigeneModelle();
    yield;
    this.#baueLampen();
    this.#baueLichterketten();
    yield;
    this.#baueTueren();
    yield;
    this.#baueRessourcen();
    einfrieren(this.statisch);
  }

  /**
   * Sichtweiten-Culling: Blöcke weiter als `weite` von der Kamera ausblenden (Wände, Möbel, Laternen, Bäume …).
   * @param kamera  Weltposition der Kamera (Vector3)
   * @returns Anzahl sichtbarer Blöcke
   */
  kulle(kamera, weite) {
    const v = this.statisch.position;
    return kulleNachWeite(this.kulEintraege, kamera.x - v.x, kamera.y - v.y, kamera.z - v.z, weite);
  }

  /** Runde 38: Server-Nässe 0..1 (Asphalt) + Regenstärke 0..1 (Dachtropfen) – Renderer ruft es vor `aktualisiere` jedes Bild auf */
  setzeNaesse(nass, regen) {
    this.naesse?.setze(nass, regen);
  }

  /** Lampen der Karte: [{ x, y, z, farbe, radius, staerke, objekt }] – für den Licht-Pool im Renderer */
  get lampen() {
    return this.lampenListe;
  }

  /** Pro Frame: Türen schwingen lassen, Ressourcen ein-/ausblenden, Lampen-Glühen, Modell-Animationen (fokus = Weltpixel). */
  aktualisiere(dt, dunkel, fokus = null) {
    const weit = (ANIMATION_WEITE * this.g) ** 2;
    for (const m of this.mischer) if (!fokus || (m.x - fokus.x) ** 2 + (m.z - fokus.y) ** 2 < weit) m.mischer.update(dt);
    for (const t of this.tuerFluegel) {
      const soll = this.welt.istTuerOffen(t.tuerId) ? (t.richtung * Math.PI) / 2 : 0;
      if (t.winkel === soll) continue;
      t.winkel = t.winkel === null ? soll : t.winkel + (soll - t.winkel) * Math.min(1, dt * TUER_DREHTEMPO);
      if (Math.abs(t.winkel - soll) < 0.002) t.winkel = soll;
      t.fluegel.rotation.y = t.winkel;
    }
    this.naesse?.aktualisiere(dt, fokus);
    if (this.abgebautStand !== this.welt.ressourcenVersion) this.#zeigeRessourcen();
    if (this.laternenStand !== this.welt.ressourcenVersion) this.#zeigeLaternen();
    if (this.wasser) {
      // Wellen ziehen langsam; nachts blasser (der Wellen-Glanz leuchtet nicht)
      this.wasser.textur.offset.x = (this.wasser.textur.offset.x + dt * 0.035) % 1;
      this.wasser.textur.offset.y = (this.wasser.textur.offset.y + dt * 0.014) % 1;
      this.wasser.material.opacity = 0.5 * (1 - dunkel * 0.85);
    }
    this.lampenGluehen.visible = dunkel > 0.08;
    this.lampenGluehen.material.opacity = Math.min(1, dunkel * 1.4);
    if (this.kettenBirnen) this.kettenBirnen.material.emissiveIntensity = 0.35 + dunkel * 2.6; // Runde 42: Lichterketten glühen nachts
    // Lichtschein am Boden: jede Lampe leuchtet nachts sichtbar, auch ohne echtes Licht aus dem Pool
    this.lampenSchein.visible = dunkel > 0.08;
    this.lampenSchein.material.opacity = Math.min(0.55, dunkel * 0.6);
  }

  /**
   * Tür-Röntgen: Türblätter in der Nähe der Figur kommen auf Ebene TUER_EBENE – der Renderer zeichnet sie dort als Schimmer durch
   * Wände. Alle anderen Türen bleiben normal verdeckt. @returns Abstand (px) zur nächsten schimmernden Tür (Infinity = keine)
   */
  aktualisiereTuerSchimmer(fokus) {
    const reichweite2 = TUER_SCHIMMER_WEITE * TUER_SCHIMMER_WEITE;
    let naechste2 = Infinity;
    for (const t of this.tuerFluegel) {
      const d2 = (t.x - fokus.x) ** 2 + (t.z - fokus.y) ** 2;
      const nah = d2 < reichweite2;
      if (nah !== t.schimmer) {
        t.schimmer = nah;
        if (nah) t.blatt.layers.enable(TUER_EBENE);
        else t.blatt.layers.disable(TUER_EBENE);
      }
      if (nah && d2 < naechste2) naechste2 = d2;
    }
    return Math.sqrt(naechste2);
  }

  /**
   * Dach-Ausblendung: Steht man in einem Raum (zusammenhängender Innenboden), ist nur dessen Dach offen –
   * von draußen bleibt alles zu, man schaut nicht mehr in fremde Räume. @param x,y Weltpixel der eigenen Figur
   */
  aktualisiereDaecher(x, y) {
    this.daecher?.aktualisiere(x, y);
  }

  /** Wände des eigenen Raums, die die Figur verdecken (südlich, nah), werden weich durchsichtig (wandDurchsicht.js). an = false → alles dicht (Ego-Modus). */
  aktualisiereDurchsicht(dt, x, y, an = true) {
    this.durchsicht?.aktualisiere(dt, x, y, an);
  }

  /** Runde 32: Ich-Ansicht – Dachunterseite sichtbar (Decke), Draufsicht wieder nur Oberseite. */
  dachDoppelseitig(an) {
    const seite = an ? THREE.DoubleSide : THREE.FrontSide;
    for (const m of [this.daecher?.material, this.daecher?.flachMaterial]) {
      if (!m || m.side === seite) continue;
      m.side = seite;
      m.needsUpdate = true;
    }
  }

  /** Liegt der Punkt draußen oder im gerade geöffneten Raum? (Beschriftungen in geschlossenen Räumen bleiben aus.) */
  istEinsehbar(x, y) {
    return this.daecher ? this.daecher.einsehbar(x, y) : true;
  }

  /** Echte Walmdächer über allen Gebäuden (dachModell.js), räumeweise aufklappbar. */
  #baueDaecher() {
    const material = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0xffffff }));
    this.daecher = new Daecher({ welt: this.welt, basisHoehe: WANDHOEHE, hy: this.hy, material });
    if (this.daecher.leer) {
      this.daecher = null;
      return;
    }
    this.statisch.add(this.daecher.gruppe);
  }


  // ---------------------------------------------------------------------------

  /**
   * Bodenbild eines Ausschnitts malen (Innenräume abgedunkelt, weil es kein Dach gibt) – Generator, gibt zwischendurch ab.
   * @param r { x0, y0, x1, y1 } Kacheln (x1/y1 exklusiv) · Ergebnis = Canvas
   */
  *#maleBereich(r, massstab) {
    const g = this.g;
    const welt = this.welt;
    const leinwand = yield* new BodenTextur(welt, this.assets).renderePortionen(massstab, r);
    const ctx = leinwand.getContext('2d');
    ctx.setTransform(massstab, 0, 0, massstab, -r.x0 * g * massstab, -r.y0 * g * massstab);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (let ty = r.y0; ty < r.y1; ty++) {
      for (let tx = r.x0; tx < r.x1; tx++) {
        if (KACHELN[welt.kachelAn(tx, ty)]?.innen) ctx.fillRect(tx * g, ty * g, g, g);
      }
    }
    return leinwand;
  }

  /** Grafik-Einstellung geändert: alle Boden-Blöcke in anderer Auflösung neu malen (kein Shader-Neubau). */
  setzeBodenMassstab(massstab) {
    if (massstab === this.bodenMassstab) return;
    this.bodenMassstab = massstab;
    for (const b of this.bodenBloecke) {
      const it = this.#maleBereich(b.bereich, massstab);
      let schritt = it.next();
      while (!schritt.done) schritt = it.next();
      b.textur.dispose(); // andere Größe → neu anlegen statt überschreiben
      b.textur.image = schritt.value;
      b.textur.needsUpdate = true;
    }
  }

  /**
   * Runde 19 (Block-Welt): Boden in Blöcken zu BODEN_BLOCK × BODEN_BLOCK Kacheln, jeder mit eigener kleiner Textur
   * (vorher EINE Textur über die ganze Zone: ~5000 × 4000 px = 80 MB, die auf einen Schlag zur Grafikkarte gingen – der große
   * Ruckler vor der Zonengrenze; große Editor-Zonen sprengten sogar die maximale Texturgröße). Ein Block wird erst sichtbar,
   * wenn seine Textur hochgeladen ist (bodenHochladen, der Renderer lädt nur wenige pro Bild – nächste zuerst).
   */
  *#baueBoden(massstab) {
    const welt = this.welt;
    const g = this.g;
    this.bodenBloecke = [];
    // alle Blöcke teilen sich EIN Material-Setup (gleicher Shader); jede Textur ist ein eigenes Material
    for (let by = 0; by < welt.hoehe; by += BODEN_BLOCK) {
      for (let bx = 0; bx < welt.breite; bx += BODEN_BLOCK) {
        const bereich = { x0: bx, y0: by, x1: Math.min(welt.breite, bx + BODEN_BLOCK), y1: Math.min(welt.hoehe, by + BODEN_BLOCK) };
        const leinwand = yield* this.#maleBereich(bereich, massstab);
        const textur = new THREE.CanvasTexture(leinwand);
        textur.colorSpace = THREE.SRGBColorSpace;
        textur.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
        const nx = bereich.x1 - bereich.x0;
        const ny = bereich.y1 - bereich.y0;
        const breite = nx * g;
        const tiefe = ny * g;
        const x0 = bereich.x0 * g;
        const z0 = bereich.y0 * g;
        // Mit Gelände: ein Gitterpunkt je Kachelecke, Höhe aus welt.hoeheBei (Ebene liegt vor der Drehung in X/Y, lokales Z = Höhe)
        const geometrie = welt.hoehen ? new THREE.PlaneGeometry(breite, tiefe, nx, ny) : new THREE.PlaneGeometry(breite, tiefe);
        if (welt.hoehen) {
          const pos = geometrie.attributes.position;
          for (let i = 0; i < pos.count; i++) pos.setZ(i, this.hy(x0 + pos.getX(i) + breite / 2, z0 + tiefe / 2 - pos.getY(i)));
          geometrie.computeVertexNormals();
        }
        const mesh = new THREE.Mesh(geometrie, new THREE.MeshStandardMaterial({ map: textur, roughness: 1 }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x0 + breite / 2, 0, z0 + tiefe / 2);
        mesh.receiveShadow = true;
        mesh.visible = false; // erst nach dem Hochladen der Textur
        // Hülle fürs Sichtweiten-Culling (bloecke.js setzt visible der Hülle, das Mesh selbst wartet aufs Hochladen)
        const huelle = new THREE.Group();
        huelle.add(mesh);
        this.statisch.add(huelle);
        this.kulEintraege.push({ objekt: huelle, x: x0 + breite / 2, y: 0, z: z0 + tiefe / 2, r: Math.hypot(breite, tiefe) / 2, sichtbar: true });
        this.bodenBloecke.push({ bereich, mesh, textur, x: x0 + breite / 2, z: z0 + tiefe / 2, hoch: false });
        yield;
      }
    }
    const draussen = new THREE.Mesh(new THREE.PlaneGeometry(welt.pixelBreite + 8000, welt.pixelHoehe + 8000), new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 }) /* Rasen jenseits des Kartenrands – war fast schwarz und wirkte im Auto (Kamera weiter weg) wie "extrem dunkel" im Norden */);
    draussen.rotation.x = -Math.PI / 2;
    draussen.position.set(welt.pixelBreite / 2, -1.5, welt.pixelHoehe / 2); // knapp unter dem Kartenboden
    this.draussen = draussen;
    this.statisch.add(draussen);
  }

  /** Alle Boden-Texturen (Vorkompilieren, Statistik) */
  get bodenTexturen() {
    return this.bodenBloecke.map((b) => b.textur);
  }

  /**
   * Boden-Texturen hochladen – nächste Blöcke (x/z in Modell-Koordinaten) zuerst, höchstens `anzahl` (Infinity = alle).
   * @returns Anzahl noch wartender Blöcke
   */
  bodenHochladen(x, z, anzahl = 1) {
    const offen = this.bodenBloecke.filter((b) => !b.hoch);
    if (anzahl < offen.length) offen.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const b of offen.slice(0, anzahl)) {
      this.gl.initTexture(b.textur);
      b.hoch = true;
      b.mesh.visible = true;
    }
    return Math.max(0, offen.length - anzahl);
  }

  /** Seen: bewegte Wellen als ein InstancedMesh (ein Draw-Call) über dem gemalten Wasserboden. */
  #baueWasser() {
    const welt = this.welt;
    const g = this.g;
    const felder = [];
    for (let ty = 0; ty < welt.hoehe; ty++) for (let tx = 0; tx < welt.breite; tx++) if (KACHELN[welt.kachelAn(tx, ty)]?.wasser) felder.push([tx, ty]);
    this.wasser = null;
    if (felder.length === 0) return;
    const leinwand = document.createElement('canvas');
    leinwand.width = leinwand.height = 64;
    const c = leinwand.getContext('2d');
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    // Wellenbögen, an den Rändern gespiegelt gemalt → nahtlos kachelbar
    for (const [x, y] of [[8, 14], [38, 30], [18, 50], [50, 8], [30, 58]]) {
      for (const ox of [-64, 0, 64]) {
        for (const oy of [-64, 0, 64]) {
          c.beginPath();
          c.moveTo(x + ox, y + oy);
          c.quadraticCurveTo(x + 7 + ox, y - 5 + oy, x + 14 + ox, y + oy);
          c.stroke();
        }
      }
    }
    const textur = new THREE.CanvasTexture(leinwand);
    textur.wrapS = textur.wrapT = THREE.RepeatWrapping;
    textur.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: textur, transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(g, g).rotateX(-Math.PI / 2), material, felder.length);
    felder.forEach(([tx, ty], i) => mesh.setMatrixAt(i, _matrix.makeTranslation((tx + 0.5) * g, 0.45 + this.hy((tx + 0.5) * g, (ty + 0.5) * g), (ty + 0.5) * g)));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.statisch.add(mesh);
    this.wasser = { material, textur };
  }

  /** Zusammengefasste Geometrie (Weltkoordinaten) aufs Gelände stellen: jede Ecke um die Höhe an ihrer Stelle anheben */
  #anGelaende(geometrie) {
    if (!this.welt.hoehen) return geometrie;
    const pos = geometrie.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + this.hy(pos.getX(i), pos.getZ(i)));
    geometrie.computeBoundingSphere();
    return geometrie;
  }

  #baueWaende() {
    const welt = this.welt;
    const g = this.g;
    const teile = [];
    const instanzVon = new Map(); // Kachelindex → Instanz-Nummern in `wand` (für die Wand-Durchsicht)
    const glas = [];
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const kachel = KACHELN[welt.kachelAn(tx, ty)];
        const name = kachel?.name;
        const art = wandArtBei(welt, tx, ty); // Phase 4.12: Wandart (Fenster/Tür: Art der Nachbarwand)
        const x = tx * g + g / 2;
        const z = ty * g + g / 2;
        const b = this.hy(x, z); // Wände stehen auf dem Gelände
        const nimm = (...neu) => {
          const liste = instanzVon.get(ty * welt.breite + tx) ?? [];
          for (const t of neu) {
            liste.push(teile.length);
            teile.push(t);
          }
          instanzVon.set(ty * welt.breite + tx, liste);
        };
        if (kachel?.wand) nimm({ x, z, unten: b, hoehe: WANDHOEHE, art });
        if (name === 'fenster') {
          nimm({ x, z, unten: b, hoehe: 24, art }, { x, z, unten: b + WANDHOEHE - 12, hoehe: 12, art });
          const senkrecht = !istWandig(welt, tx - 1, ty) && !istWandig(welt, tx + 1, ty);
          glas.push({ x, z, unten: b + 24, hoehe: WANDHOEHE - 36, drehung: senkrecht ? Math.PI / 2 : 0 });
        }
        if (name === 'tuer') nimm({ x, z, unten: b + TUER_HOEHE, hoehe: WANDHOEHE - TUER_HOEHE, art }); // Sturz
      }
    }
    // Runde 23: Ziegelwand statt grauer Fläche (wandTexturen.js, Welt-Raum-Projektion; Farbe hellt die Textur nur noch ab)
    // Phase 4.12: alle Wandarten in EINEM Mesh – Art steckt in der Instanzfarbe (Blau-Kanal), der Shader wählt die Textur im Atlas
    const seite = this.mitSchnitt(wendeWandTexturAn(new THREE.MeshStandardMaterial({ color: 0xa4a4a4, roughness: 0.92 }), 'mehrfach'));
    const oben = this.mitSchnitt(ohneFarbe(new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 1 })));
    // je Block ein InstancedMesh (Culling); Box mit nur 2 Materialgruppen (Seiten, Deckel) → 2 Draw-Calls je Block
    const wand = this.#instanzen(boxZweiGruppen(g, 1, g), [seite, oben], teile, { farben: teile.map((t) => wandArtFarbe(t.art)) }).schatten(true);
    const glasMaterial = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x8cc8e2, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }));
    this.statisch.add(wand, this.#instanzen(new THREE.BoxGeometry(g, 1, g * 0.3), glasMaterial, glas, { bloecke: false }));
    this.wandDaten = { wand, teile, instanzVon, seite, oben };
  }

  /** Gleiche Teile als BlockInstanzen (je Block ein InstancedMesh) + fürs Sichtweiten-Culling anmelden */
  // Leichte Teile (Glas, Glühen, Lichtschein: wenige Dreiecke je Stück) bleiben EIN Mesh (bloecke: false) – Blöcke würden dort nur
  // Draw-Calls kosten (Messung Runde 18: +50–70 Calls ohne Gewinn). Schwere Teile (Wände, Masten) lohnen sich.
  #instanzen(geometrie, material, teileOderMatrizen, { farben = null, istMatrix = false, bloecke = true } = {}) {
    const matrizen = istMatrix ? teileOderMatrizen : teileOderMatrizen.map(teilMatrix);
    const bi = new BlockInstanzen(geometrie, material, matrizen, { blockPx: bloecke ? this.blockPx : Infinity, farben });
    if (bloecke) this.kulEintraege.push(...bi.kulEintraege());
    return bi;
  }

  /** Wand-Durchsicht (wandDurchsicht.js): braucht Wände + Räume der Dächer */
  #baueDurchsicht() {
    this.durchsicht = null;
    if (!this.daecher || !this.wandDaten) return;
    const { wand, teile, instanzVon, seite, oben } = this.wandDaten;
    this.durchsicht = new WandDurchsicht({ wand, teile, instanzVon, daecher: this.daecher, g: this.g, breite: this.welt.breite, seite, oben, mitSchnitt: this.mitSchnitt });
    this.statisch.add(this.durchsicht.gruppe);
  }

  /**
   * Eigene Objekte mit 3D-Modell (Map-Editor): Gruppe sofort da, Modell kommt nach dem Laden. Ohne Modell → Ersatz-Quader wie gehabt.
   * Runde 44: Typen, die oft vorkommen (≥ INSTANZ_AB, ohne Animation, kein abbaubarer Fels), werden INSTANZIERT gezeichnet –
   * ein InstancedMesh je Teil-Mesh statt eines Klons je Objekt (Palisade, Blumen, Grasbüschel … → viel weniger Draw-Calls).
   */
  #baueEigeneModelle() {
    const g = this.g;
    // Runde 38: Felsen-Modelle (r32_fels_*) sind Steinvorkommen → ihre Gruppe verschwindet, wenn der Fels abgebaut ist (#zeigeRessourcen)
    const ressourceVon = new Map(this.welt.ressourcen.map((r) => [r.objekt, r]));
    this.ressourcenGruppen = new Map();
    const sammlung = new Map(); // `${typ}|${b}|${h}|${skalierung}` → [o …] (nur instanzierbare Objekte)
    for (const o of this.welt.objekte) {
      const typ = this.welt.typen[o.typ];
      const url = eigenesModellUrl(typ);
      if (!url) continue;
      if (!typ.animation && !ressourceVon.has(o)) {
        const eigen = eigeneGroesse(o);
        const schluessel = `${o.typ}|${eigen.b}|${eigen.h}|${o.skalierung ?? 1}`;
        if (!sammlung.has(schluessel)) sammlung.set(schluessel, []);
        sammlung.get(schluessel).push(o);
        continue;
      }
      this.#eigenesEinzeln(o, typ, url, ressourceVon.get(o));
    }
    for (const liste of sammlung.values()) {
      const typ = this.welt.typen[liste[0].typ];
      const url = eigenesModellUrl(typ);
      if (liste.length < INSTANZ_AB) for (const o of liste) this.#eigenesEinzeln(o, typ, url, null);
      else this.#eigeneInstanziert(liste, typ, url);
    }
  }

  /** Lage eines eigenen Objekts (Mitte, Boden + Aufstellhöhe z, Drehung) */
  #eigeneLage(o) {
    const g = this.g;
    const x = (o.x + o.b / 2) * g;
    const z = (o.y + o.h / 2) * g;
    // Runde 44: o.z = Aufstellhöhe in m (Teller auf dem Tisch …)
    return { x, y: this.hy(x, z) + (o.z ?? 0) * g, z, dreh: (-(o.drehung ?? 0) * Math.PI) / 180 };
  }

  #eigenesEinzeln(o, typ, url, ressource) {
    const g = this.g;
    const lage = this.#eigeneLage(o);
    const gruppe = new THREE.Group();
    gruppe.position.set(lage.x, lage.y, lage.z);
    gruppe.rotation.y = lage.dreh;
    this.statisch.add(gruppe);
    if (ressource) this.ressourcenGruppen.set(ressource.id, gruppe);
    ladeEigenesModell(url)
      .then((szene) => {
        if (!gruppe.parent) return;
        // eigene Maße vor dem Drehen, dann um den vollen Winkel (gruppe.rotation) – sonst sind bei 90° Breite/Tiefe vertauscht
        const eigen = eigeneGroesse(o);
        const inhalt = eigenesModellInhalt(szene, { b: eigen.b, h: eigen.h, hoehe: (typ.hoehe3d ?? 1) * (o.skalierung ?? 1), einheit: g });
        gruppe.add(inhalt);
        // Leerlauf-Animation (Map-Editor 5.3): Kinder der eingefrorenen Gruppe aktualisieren ihre Matrizen weiter selbst
        const mischer = leerlaufMischer(inhalt, typ.animation);
        if (mischer) this.mischer.push({ mischer, x: gruppe.position.x, z: gruppe.position.z });
      })
      .catch((fehler) => console.warn(`3D-Modell „${o.typ}“ nicht geladen:`, fehler));
  }

  /** Runde 44: alle Objekte eines Typs (gleiche Maße) als InstancedMesh je Teil-Mesh des Modells */
  #eigeneInstanziert(liste, typ, url) {
    const g = this.g;
    const halter = new THREE.Group();
    this.statisch.add(halter);
    ladeEigenesModell(url)
      .then((szene) => {
        if (!halter.parent) return;
        const o0 = liste[0];
        const eigen = eigeneGroesse(o0);
        const inhalt = eigenesModellInhalt(szene, { b: eigen.b, h: eigen.h, hoehe: (typ.hoehe3d ?? 1) * (o0.skalierung ?? 1), einheit: g });
        inhalt.updateMatrixWorld(true);
        const lagen = liste.map((o) => {
          const l = this.#eigeneLage(o);
          return new THREE.Matrix4().compose(_vektor.set(l.x, l.y, l.z), _quat.setFromAxisAngle(_achseY, l.dreh), _skala.set(1, 1, 1));
        });
        inhalt.traverse((t) => {
          if (!t.isMesh || t.isSkinnedMesh) return;
          const mesh = new THREE.InstancedMesh(t.geometry, t.material, lagen.length);
          lagen.forEach((m, i) => mesh.setMatrixAt(i, _matrix.multiplyMatrices(m, t.matrixWorld)));
          mesh.castShadow = t.castShadow;
          mesh.receiveShadow = t.receiveShadow;
          mesh.computeBoundingSphere();
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          halter.add(mesh);
        });
        halter.updateMatrixWorld(true);
      })
      .catch((fehler) => console.warn(`3D-Modell „${typ.name ?? url}“ nicht geladen:`, fehler));
  }

  /** Alle Möbel: Seiten in EIN Mesh (Farbe je Möbel), Deckel (Sprite von oben) je Typ in ein Mesh. */
  #baueMoebel() {
    const g = this.g;
    const seiten = [];
    const deckelProTyp = new Map();
    for (const o of this.welt.objekte) {
      // ebene 'unsichtbar' = steile Hänge aus dem Map-Editor (nur Kollision, keine Grafik)
      if (o.typ === 'licht' || o.typ === 'markierung' || o.ebene === 'boden' || o.ebene === 'oben' || o.ebene === 'unsichtbar' || RESSOURCEN_OBJEKTE[o.typ]) continue;
      if (eigenesModellUrl(this.welt.typen[o.typ])) continue; // eigenes 3D-Modell → #baueEigeneModelle
      // eigene Maße vor dem Drehen (Viertel stecken schon in b/h) – um den vollen Winkel gedreht (gemeinsam/welt/drehung.js)
      const eigen = eigeneGroesse(o);
      const breite = eigen.b * g;
      const tiefe = eigen.h * g;
      const hoehe = (MOEBEL_HOEHE[o.typ] ?? 20) * (o.skalierung ?? 1); // Studio: skalierte Möbel werden auch höher
      const x = (o.x + o.b / 2) * g;
      const z = (o.y + o.h / 2) * g;
      const drehung = (-(o.drehung ?? 0) * Math.PI) / 180;
      if (o.typ === 'werkbank') {
        seiten.push(...werkbankTeile(x, z, breite, tiefe, hoehe, drehung));
        continue;
      }
      const { farbe } = this.#spriteTextur(o.typ);
      seiten.push({ geometrie: new THREE.BoxGeometry(breite, hoehe, tiefe), matrix: matrixAus(x, hoehe / 2, z, drehung), farbe });
      const deckel = new THREE.PlaneGeometry(breite, tiefe).rotateX(-Math.PI / 2);
      if (!deckelProTyp.has(o.typ)) deckelProTyp.set(o.typ, []);
      deckelProTyp.get(o.typ).push({ geometrie: deckel, matrix: matrixAus(x, hoehe + 0.15, z, drehung) });
    }
    this.#baueWegweiser(seiten);
    // Runde 18 (4.1): je Block zusammenfassen (Culling) statt eines Meshes über die ganze Karte
    if (seiten.length) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      for (const teile of this.#nachBlock(seiten).values()) {
        const mesh = this.#blockMesh(vereineGeometrien(teile, { mitFarbe: true }), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    }
    // Deckel (2 Dreiecke je Möbel, eigene Textur je Typ): ein Mesh je Typ – in Blöcken nur mehr Draw-Calls
    for (const [typ, teile] of deckelProTyp) {
      const mesh = new THREE.Mesh(this.#anGelaende(vereineGeometrien(teile)), new THREE.MeshStandardMaterial({ map: this.#spriteTextur(typ).textur, roughness: 0.8 }));
      mesh.receiveShadow = true;
      this.statisch.add(mesh);
    }
  }

  /** Teile { matrix, … } nach Block (Position aus der Matrix) gruppieren */
  #nachBlock(teile) {
    const bloecke = new Map();
    for (const t of teile) {
      const k = `${Math.floor(t.matrix.elements[12] / this.blockPx)},${Math.floor(t.matrix.elements[14] / this.blockPx)}`;
      if (!bloecke.has(k)) bloecke.set(k, []);
      bloecke.get(k).push(t);
    }
    return bloecke;
  }

  /** Statisches Mesh aus Weltgeometrie (aufs Gelände gestellt), in `statisch` + Sichtweiten-Culling */
  #blockMesh(geometrie, material) {
    const mesh = new THREE.Mesh(this.#anGelaende(geometrie), material);
    mesh.geometry.computeBoundingSphere();
    this.kulEintraege.push(kulEintrag(mesh, mesh.geometry.boundingSphere));
    this.statisch.add(mesh);
    return mesh;
  }

  /** Wegweiser an jedem Zonen-Übergang: Pfosten + Schild (in `seiten`) und ein Schild-Text "⬆ Waldweg". */
  #baueWegweiser(seiten) {
    const g = this.g;
    const holz = new THREE.Color(0x6b4524).convertSRGBToLinear();
    const brett = new THREE.Color(0xc89b62).convertSRGBToLinear();
    for (const u of this.welt.uebergaenge) {
      const oben = u.y === 0;
      const unten = u.y + u.h >= this.welt.hoehe;
      const links = u.x === 0;
      // neben den Weg, eine Kachel in die Karte hinein
      const x = links ? u.px.x1 + g * 2 : oben || unten ? u.px.x1 + g * 1.8 : u.px.x0 - g * 2;
      const z = oben ? u.px.y1 + g : unten ? u.px.y0 - g : u.px.y0 - g * 0.7;
      seiten.push({ geometrie: new THREE.BoxGeometry(5, 58, 5), matrix: matrixAus(x, 29, z, 0), farbe: holz });
      seiten.push({ geometrie: new THREE.BoxGeometry(104, 30, 3), matrix: matrixAus(x, 56, z, 0), farbe: holz });
      const pfeil = oben ? '⬆' : unten ? '⬇' : links ? '⬅' : '➡';
      const leinwand = Object.assign(document.createElement('canvas'), { width: 320, height: 90 });
      const ctx = leinwand.getContext('2d');
      ctx.fillStyle = '#d9b27c'; // helles Brett, dunkle Schrift
      ctx.fillRect(0, 0, 320, 90);
      ctx.fillStyle = '#2b1a0b';
      ctx.font = '700 46px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pfeil} ${u.name}`.slice(0, 20), 160, 48, 304);
      const textur = new THREE.CanvasTexture(leinwand);
      textur.colorSpace = THREE.SRGBColorSpace;
      textur.anisotropy = 4;
      const schild = new THREE.Mesh(new THREE.PlaneGeometry(98, 27.5), new THREE.MeshStandardMaterial({ map: textur, roughness: 0.9 }));
      schild.position.set(x, 56 + this.hy(x, z), z + 1.6);
      this.statisch.add(schild);
    }
  }

  /**
   * Runde 42: Lichterketten – je Leine ein dünnes Kabel mit Durchhang (Parabel) + Glühbirnen. Alles in zwei Meshes (Kabel, Birnen),
   * die Birnen leuchten über emissiveIntensity (aktualisiere). Echtes Licht = normale `licht`-Objekte der Karte (Lampen-Pool).
   */
  #baueLichterketten() {
    const ketten = this.welt.lichterketten ?? [];
    if (!ketten.length) return;
    const g = this.g;
    const kabel = [];
    const birnen = [];
    const birneGeo = new THREE.SphereGeometry(2.3, 8, 6);
    const fassungGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.6, 6);
    const kurve = (k, t) => {
      const x = (k.von[0] + (k.bis[0] - k.von[0]) * t) * g;
      const z = (k.von[1] + (k.bis[1] - k.von[1]) * t) * g;
      const boden = this.hy(k.von[0] * g, k.von[1] * g) * (1 - t) + this.hy(k.bis[0] * g, k.bis[1] * g) * t;
      return new THREE.Vector3(x, boden + (k.hoehe - k.durchhang * 4 * t * (1 - t)) * g, z);
    };
    for (const k of ketten) {
      const punkte = [];
      for (let i = 0; i <= 16; i++) punkte.push(kurve(k, i / 16));
      kabel.push({ geometrie: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(punkte), 24, 0.45, 4, false), matrix: new THREE.Matrix4() });
      const farbe = new THREE.Color(k.farbe);
      for (let i = 0; i < k.birnen; i++) {
        const p = kurve(k, (i + 0.5) / k.birnen);
        kabel.push({ geometrie: fassungGeo, matrix: new THREE.Matrix4().makeTranslation(p.x, p.y - 1.2, p.z) });
        birnen.push({ geometrie: birneGeo, matrix: new THREE.Matrix4().makeTranslation(p.x, p.y - 4, p.z), farbe });
      }
    }
    const kabelMesh = new THREE.Mesh(vereineGeometrien(kabel), new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.9 }));
    this.kettenBirnen = new THREE.Mesh(
      vereineGeometrien(birnen, { mitFarbe: true }),
      new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xffc070, emissiveIntensity: 0.4, roughness: 0.4 }),
    );
    this.statisch.add(kabelMesh, this.kettenBirnen);
  }

  /** Lampen: kleines Glühen pro Lampe (ein InstancedMesh); echtes Licht verteilt der Renderer aus einem Pool. */
  #baueLampen() {
    const g = this.g;
    this.lampenListe = this.welt.objekte
      .filter((o) => o.typ === 'licht')
      .map((o) => ({
        x: (o.x + 0.5) * g,
        y: (o.mast ? LATERNEN_LICHTHOEHE : o.hoehe ? o.hoehe * g : 60) + this.hy((o.x + 0.5) * g, (o.y + 0.5) * g), // Runde 42: hoehe (m)
        z: (o.y + 0.5) * g,
        farbe: new THREE.Color(o.farbe),
        reichweite: o.radius * g * 1.8,
        // Straßenlaternen hängen hoch: Punktlicht muss weiter reichen und stärker sein, damit der Boden darunter genauso hell bleibt
        lichtReichweite: o.radius * g * 1.8 * (o.mast ? 1.7 : 1),
        staerke: (o.staerke ?? 0.8) * 260 * (o.mast ? 2.2 : 1),
        objekt: o,
      }));
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
    this.gluehMatrizen = this.lampenListe.map((l) => new THREE.Matrix4().makeTranslation(l.x, l.y, l.z));
    const gluehFarben = this.lampenListe.map((l) => l.farbe.clone().multiplyScalar(1.3));
    this.lampenGluehen = this.#instanzen(new THREE.SphereGeometry(3.5, 8, 6), material, this.gluehMatrizen, { farben: gluehFarben, istMatrix: true, bloecke: false });
    this.statisch.add(this.lampenGluehen);
    // Lichtschein am Boden (additiv, günstig): Kreis für Punkt-Lampen, gestreckter Fleck in Leuchtrichtung für Kegel-Lampen
    const schein = new THREE.MeshBasicMaterial({ map: lichtscheinTextur(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.scheinMatrizen = [];
    const scheinFarben = [];
    this.lampenListe.forEach((l, i) => {
      const r = l.reichweite * 0.9;
      if (l.objekt.art === 'kegel') {
        const w = ((l.objekt.richtung ?? 90) * Math.PI) / 180;
        const lang = l.reichweite * 1.2;
        const breit = Math.max(r * 0.5, lang * Math.tan((((l.objekt.oeffnung ?? 60) / 2) * Math.PI) / 180) * 1.4);
        const sx = l.x + Math.cos(w) * lang * 0.45;
        const sz = l.z + Math.sin(w) * lang * 0.45;
        _matrix.compose(_vektor.set(sx, 1.2 + this.hy(sx, sz), sz), _quat.setFromAxisAngle(_achseY, -w), _skala.set(lang, 1, breit));
      } else _matrix.compose(_vektor.set(l.x, 1.2 + this.hy(l.x, l.z), l.z), _quat.identity(), _skala.set(r * 2, 1, r * 2));
      this.scheinMatrizen.push(_matrix.clone());
      scheinFarben.push(l.farbe.clone().multiplyScalar(l.objekt.staerke ?? 0.8));
    });
    this.lampenSchein = this.#instanzen(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), schein, this.scheinMatrizen, { farben: scheinFarben, istMatrix: true, bloecke: false });
    this.lampenSchein.visible = false;
    for (const m of this.lampenSchein.meshes) m.renderOrder = 1;
    this.statisch.add(this.lampenSchein);
    // Straßenlaternen (mast): ein InstancedMesh (eine Instanz je Laterne) – so lässt sich jede einzeln ausblenden, wenn ein Auto sie umfährt
    this.mastInstanzen = this.lampenListe.map((l, i) => ({ l, i })).filter(({ l }) => l.objekt.mast);
    this.lampenListe.forEach((l) => (l.laterneId = null));
    this.mastInstanzen.forEach(({ l }, nr) => (l.laterneId = nr)); // gleiche Reihenfolge wie welt.laternen
    if (this.mastInstanzen.length > 0) {
      const eisen = new THREE.Color(0x2b2f35).convertSRGBToLinear();
      const h = LATERNEN_LICHTHOEHE; // Lichtpunkt; der Mast endet knapp darüber
      const teile = [
        { geometrie: new THREE.CylinderGeometry(1.5, 2.5, h - 2, 8), matrix: matrixAus(0, (h - 2) / 2, 0, 0), farbe: eisen },
        { geometrie: new THREE.CylinderGeometry(3.4, 3.4, 5, 8), matrix: matrixAus(0, 2.5, 0, 0), farbe: eisen }, // Sockel
        { geometrie: new THREE.CylinderGeometry(5.8, 3.8, 5, 8), matrix: matrixAus(0, h - 3.5, 0, 0), farbe: eisen }, // Lampenschale
        { geometrie: new THREE.CylinderGeometry(6.6, 6.6, 1.4, 8), matrix: matrixAus(0, h + 3.8, 0, 0), farbe: eisen }, // Dach
      ];
      this.mastGeometrie = vereineGeometrien(teile, { mitFarbe: true });
      this.mastMaterial = this.mitSchnitt(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
      this.mastMatrizen = this.mastInstanzen.map(({ l }) => new THREE.Matrix4().makeTranslation(l.x, this.hy(l.x, l.z), l.z));
      this.mastMesh = this.#instanzen(this.mastGeometrie, this.mastMaterial, this.mastMatrizen, { istMatrix: true }).schatten(true, false);
      this.statisch.add(this.mastMesh);
    }
    this.laternenStand = -1;
  }

  /** Umgefahrene Laternen ausblenden (Mast, Glühen, Bodenschein, Licht aus dem Pool) bzw. nach dem Nachwachsen wieder zeigen. */
  #zeigeLaternen() {
    this.laternenStand = this.welt.ressourcenVersion;
    if (!this.mastMesh) return;
    for (const { l, i } of this.mastInstanzen) {
      const weg = this.welt.laternenUmgefahren.has(l.laterneId);
      l.aus = weg;
      l.kopfWeg = false;
      this.mastMesh.setMatrixAt(l.laterneId, weg ? NULL_MATRIX : this.mastMatrizen[l.laterneId]);
      this.lampenGluehen.setMatrixAt(i, weg ? NULL_MATRIX : this.gluehMatrizen[i]);
      this.lampenSchein.setMatrixAt(i, weg ? NULL_MATRIX : this.scheinMatrizen[i]);
    }
    this.mastMesh.instanceMatrix.needsUpdate = true;
    this.lampenGluehen.instanceMatrix.needsUpdate = true;
    this.lampenSchein.instanceMatrix.needsUpdate = true;
  }

  /**
   * Runde 35: Laternen-Masten, deren Lampenkopf über dem oberen Bildrand liegt, ausblenden – sonst ragt nur ein loser dunkler Balken
   * ins Bild (in der Draufsicht stehen Masten oben nah an der Kamera und werden beim Reinzoomen größer). Licht/Glühen bleiben.
   * @param kamera THREE.PerspectiveCamera (matrixWorldInverse/projectionMatrix aktuell)
   */
  blendeMastenAusserhalb(kamera) {
    if (!this.mastMesh) return;
    let geaendert = false;
    for (const { l } of this.mastInstanzen) {
      if (l.aus) continue;
      _vektor.set(l.x, this.hy(l.x, l.z) + LATERNEN_LICHTHOEHE + 4, l.z).applyMatrix4(kamera.matrixWorldInverse);
      const hinter = _vektor.z > 0; // hinter der Kamera
      _vektor.applyMatrix4(kamera.projectionMatrix);
      const ueberRand = !hinter && _vektor.y > 1;
      if (ueberRand === !!l.kopfWeg) continue;
      l.kopfWeg = ueberRand;
      this.mastMesh.setMatrixAt(l.laterneId, ueberRand ? NULL_MATRIX : this.mastMatrizen[l.laterneId]);
      geaendert = true;
    }
    if (geaendert) this.mastMesh.instanceMatrix.needsUpdate = true;
  }

  /** Mast einer Laterne als eigene Gruppe (für die Umkipp-Animation) – oder null. */
  laterneKopie(id) {
    const l = this.mastInstanzen?.[id]?.l;
    if (!l) return null;
    const gruppe = new THREE.Group();
    const mesh = new THREE.Mesh(this.mastGeometrie, this.mastMaterial);
    mesh.castShadow = true;
    gruppe.add(mesh);
    gruppe.position.set(l.x, this.hy(l.x, l.z), l.z);
    return gruppe;
  }

  /** Türflügel mit Scharnier: pro Tür-Kachel ein Flügel; Doppeltüren öffnen auseinander. */
  #baueTueren() {
    const g = this.g;
    const material = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.75 }));
    const griffMaterial = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.8 }));
    const blattGeometrie = new THREE.BoxGeometry(g - 2, TUER_HOEHE - 1, 4);
    const griffGeometrie = new THREE.BoxGeometry(4, 2, 7);
    this.tuerFluegel = [];
    for (const tuer of this.welt.tueren) {
      tuer.kacheln.forEach(({ tx, ty }, i) => {
        const ersteHaelfte = tuer.kacheln.length === 1 || i < tuer.kacheln.length / 2;
        const richtung = ersteHaelfte ? 1 : -1;
        const scharnier = new THREE.Group();
        const fluegel = new THREE.Group();
        const blatt = new THREE.Mesh(blattGeometrie, material);
        const griff = new THREE.Mesh(griffGeometrie, griffMaterial);
        blatt.position.set((richtung * (g - 2)) / 2, TUER_HOEHE / 2, 0);
        griff.position.set(richtung * (g - 7), TUER_HOEHE * 0.48, 0);
        blatt.castShadow = true;
        blatt.receiveShadow = true;
        // Ebene TUER_EBENE wird erst in der Nähe des Spielers eingeschaltet (aktualisiereTuerSchimmer)
        fluegel.add(blatt, griff);
        scharnier.add(fluegel);
        if (tuer.senkrecht) {
          scharnier.position.set(tx * g + g / 2, this.hy(tx * g + g / 2, ty * g + g / 2), ersteHaelfte ? ty * g + 1 : (ty + 1) * g - 1);
          scharnier.rotation.y = -Math.PI / 2;
        } else {
          scharnier.position.set(ersteHaelfte ? tx * g + 1 : (tx + 1) * g - 1, this.hy(tx * g + g / 2, ty * g + g / 2), ty * g + g / 2);
        }
        this.beweglich.add(scharnier);
        this.tuerFluegel.push({ tuerId: tuer.id, fluegel, blatt, richtung, winkel: null, x: tx * g + g / 2, z: ty * g + g / 2, schimmer: false });
      });
    }
  }

  /**
   * Bäume (Modell-Varianten je Karte, Runde 25), Büsche (prozedural) und Steine als InstancedMesh. Abbaubare (welt.ressourcen) können ausgeblendet
   * werden – an ihrer Stelle erscheint ein Stumpf bzw. nichts. Büsche sind Deko.
   */
  #baueRessourcen() {
    const g = this.g;
    const baeume = this.welt.objekte.filter((o) => o.ebene === 'oben');
    const ressourceVon = new Map(this.welt.ressourcen.map((r) => [r.objekt, r]));
    const steine = this.welt.objekte.filter((o) => o.typ === 'stein' || o.typ === 'eisenerz');

    // Alles in räumliche Blöcke (Chunks) aufteilen: ein einziges riesiges InstancedMesh lässt sich nicht per Frustum-Culling
    // aussortieren – dann würden jeden Frame (und in der Schatten-Runde nochmal) ALLE Bäume der Karte gezeichnet.
    const BLOCK = CHUNK_KACHELN * g;
    const blockVon = (o) => `${Math.floor(((o.x + o.b / 2) * g) / BLOCK)},${Math.floor(((o.y + o.h / 2) * g) / BLOCK)}`;
    const kugelFuer = (schluessel) => {
      const [bx, bz] = schluessel.split(',').map(Number);
      // Gelände: Kugel auf die Blockhöhe stellen und um den größten möglichen Höhenunterschied (± 10 m) vergrößern
      const hoch = this.welt.hoehen ? 10 * this.g : 0;
      return new THREE.Sphere(new THREE.Vector3((bx + 0.5) * BLOCK, 40 + this.hy((bx + 0.5) * BLOCK, (bz + 0.5) * BLOCK), (bz + 0.5) * BLOCK), BLOCK * 0.72 + 90 + hoch);
    };
    const neuesMesh = (geometrie, material, anzahl, schluessel, { schatten = true } = {}) => {
      const mesh = new THREE.InstancedMesh(geometrie, material, anzahl);
      mesh.castShadow = schatten;
      mesh.receiveShadow = schatten;
      mesh.boundingSphere = kugelFuer(schluessel); // feste Kugel: Instanzen werden ein-/ausgeblendet (Nullmatrix), nie neu berechnen
      mesh.frustumCulled = true;
      this.kulEintraege.push(kulEintrag(mesh, mesh.boundingSphere));
      return mesh;
    };

    // Runde 25: Modellbäume ('baum', 'baum_herbst') – je Karte eine Mischung aus Varianten (baumModell.baumVarianten); jede Variante
    // = Rinde + Laub als eigene InstancedMeshes je Block. Geometrie kommt asynchron aus der .glb (bis dahin leer → unsichtbar).
    // Büsche/Tannen: Körper (Toon, Vertexfarben) + schwarzer Umriss wie gehabt.
    const umrissMaterial = this.mitSchnitt(new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide }));
    this.baumArten = new Map();
    const stuempfe = new Map(); // `Block#Gruppe#Form` → { mesh, frei: [freie Slots] } – mesh.count = belegte Slots (nur gefällte Bäume zeichnen einen Stumpf)
    const stumpfMaterialien = Array.from({ length: STUMPF_GRUPPEN }, () => this.mitSchnitt(stumpfMaterial())); // Runde 34: je Rindentextur ein Material
    const stumpfArt = (o) => `${Math.floor(streuung(o.x + 2, o.y + 9) * STUMPF_GRUPPEN) % STUMPF_GRUPPEN}#${Math.floor(streuung(o.x + 7, o.y + 13) * STUMPF_FORMEN) % STUMPF_FORMEN}`;
    const artVon = new Map(); // Objekt → Schlüssel in baumArten ('busch', 'tanne' oder 'baum|laubbaum_a' …)
    for (const o of baeume) {
      const varianten = baumVarianten(o.typ, this.welt.id);
      artVon.set(o, varianten ? `${o.typ}|${waehleBaumVariante(varianten, streuung(o.x + 11, o.y + 5))}` : o.typ);
    }
    const rindeMaterial = baumWindMaterial(this.mitSchnitt(toonMaterial({ vertexColors: true })));
    for (const schluesselArt of new Set(artVon.values())) {
      const laubMat = baumWindMaterial(this.mitSchnitt(laubMaterial()), { laub: true }); // Runde 32: je Variante eigene Laub-Textur
      const [typ, variante] = schluesselArt.split('|');
      const bloecke = new Map();
      for (const o of baeume) if (artVon.get(o) === schluesselArt) bloecke.set(blockVon(o), (bloecke.get(blockVon(o)) ?? 0) + 1);
      const teile = new Map();
      if (variante) {
        const leer = leereBaumGeometrie();
        for (const [schluessel, anzahl] of bloecke) {
          const rinde = neuesMesh(leer, rindeMaterial, anzahl, schluessel);
          const laub = neuesMesh(leer, laubMat, anzahl, schluessel);
          teile.set(schluessel, { meshes: [rinde, laub], laub, naechster: 0 });
        }
        const info = BAUM_VARIANTE_INFO[variante] ?? {};
        const toene = info.toene === undefined ? BAUM_LAUB_TOENE[typ] : info.toene;
        this.baumArten.set(schluesselArt, { teile, grundflaeche: BAUM_GRUNDFLAECHE / (info.massstab ?? 1), toene, modell: true });
        ladeBaumVariante(variante).then((modell) => {
          if (!modell) return;
          if (modell.laubTextur && laubMat.map !== modell.laubTextur) {
            modell.laubTextur.colorSpace = THREE.SRGBColorSpace;
            laubMat.map = modell.laubTextur; // gleiche Shader-Variante (map war schon gesetzt)
          }
          for (const t of teile.values()) {
            t.meshes[0].geometry = modell.rinde ?? leer;
            t.meshes[1].geometry = modell.laub ?? leer;
          }
        });
        continue;
      }
      const { koerper, umriss, grundflaeche } = baueBaum(typ);
      const material = this.mitSchnitt(toonMaterial({ vertexColors: true }));
      for (const [schluessel, anzahl] of bloecke) {
        const mesh = neuesMesh(koerper, material, anzahl, schluessel);
        const rand = neuesMesh(umriss, umrissMaterial, anzahl, schluessel, { schatten: false });
        teile.set(schluessel, { meshes: [mesh, rand], rand, naechster: 0 });
      }
      this.baumArten.set(schluesselArt, { teile, grundflaeche });
      if (typ === 'tanne') {
        // Ersatz-Tanne steht sofort; sobald die .glb da ist, wird die Geometrie getauscht (gleiche Materialien → kein Shader-Neubau)
        ladeTanneAusGlb().then((modell) => {
          if (!modell) return;
          for (const t of teile.values()) {
            t.meshes[0].geometry.dispose();
            t.meshes[1].geometry.dispose();
            t.meshes[0].geometry = modell.koerper;
            t.meshes[1].geometry = modell.umriss;
          }
        });
      }
    }
    const stammBloecke = new Map();
    for (const o of baeume) {
      if (o.typ === 'busch') continue;
      const k = `${blockVon(o)}#${stumpfArt(o)}`;
      stammBloecke.set(k, (stammBloecke.get(k) ?? 0) + 1);
    }
    for (const [schluessel, anzahl] of stammBloecke) {
      const [block, gruppe] = schluessel.split('#');
      const mesh = neuesMesh(leereBaumGeometrie(), stumpfMaterialien[Number(gruppe)], anzahl, block);
      mesh.count = 0; // wächst mit gefällten Bäumen
      stuempfe.set(schluessel, { mesh, frei: [] });
    }
    ladeStuempfe().then((liste) => {
      if (!liste) return;
      for (const { geometrie, textur, gruppe, form } of liste) {
        stumpfMaterialien[gruppe].map = textur;
        for (const [schluessel, e] of stuempfe) if (schluessel.endsWith(`#${gruppe}#${form}`)) e.mesh.geometry = geometrie;
      }
    });

    // Steine & Eisenerz
    const steinGeo = new THREE.DodecahedronGeometry(14, 0);
    const steinMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.95, flatShading: true });
    // Eisenerz: dunklerer, rostiger Fels mit orange glänzenden Erzbrocken (ein Mesh mit Vertexfarben)
    const erzTeile = [{ geometrie: new THREE.DodecahedronGeometry(14, 0), matrix: new THREE.Matrix4(), farbe: new THREE.Color(0x6e5a4e) }];
    for (const [x, y, z, r] of [[7, 6, 5, 4], [-6, 8, -3, 3.5], [2, 11, -7, 3], [-8, 2, 8, 3.2], [9, -1, -6, 2.6]]) {
      erzTeile.push({ geometrie: new THREE.OctahedronGeometry(r, 0), matrix: matrixAus(x, y, z, x), farbe: new THREE.Color(0xd9772e) });
    }
    const erzGeo = vereineGeometrien(erzTeile, { mitFarbe: true });
    const erzMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35, flatShading: true });
    // Runde 32: Steine = 3 Fels-Varianten (r32_steine.glb), Eisenerz = Fels mit roten Erzbrocken (r32_eisenerz.glb); bis zum Laden die alten Körper
    const STEIN_VARIANTEN = 6; // Runde 35: 6 texturierte Felsen (r32_steine.glb stein_0..5, je eigene Textur)
    const steinVariante = (o) => Math.floor(streuung(o.y + 3, o.x + 1) * STEIN_VARIANTEN) % STEIN_VARIANTEN;
    const steinBloecke = new Map();
    const erzBloecke = new Map();
    for (const o of steine) {
      const erz = o.typ === 'eisenerz';
      const ziel = erz ? erzBloecke : steinBloecke;
      const k = erz ? blockVon(o) : `${blockVon(o)}#${steinVariante(o)}`;
      ziel.set(k, (ziel.get(k) ?? 0) + 1);
    }
    const steinMaterialNeu = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const steinMeshes = new Map([...steinBloecke].map(([k, n]) => [k, { mesh: neuesMesh(steinGeo, steinMaterial, n, k.split('#')[0]), naechster: 0 }]));
    const erzMeshes = new Map([...erzBloecke].map(([k, n]) => [k, { mesh: neuesMesh(erzGeo, erzMaterial, n, k), mesh2: neuesMesh(leereBaumGeometrie(), erzMaterial, n, k), naechster: 0 }]));
    ladeGlbGeometrien('r32_steine.glb').then((teile) => {
      const liste = Array.from({ length: STEIN_VARIANTEN }, (_, i) => teile.get(`stein_${i}`));
      if (liste.some((t) => !t)) return;
      const geos = liste.map((t) => einpassen(t.geometrie, 50, -10));
      for (const [k, e] of steinMeshes) {
        const v = Number(k.split('#')[1]);
        e.mesh.geometry = geos[v];
        e.mesh.material = liste[v].material ?? steinMaterialNeu;
      }
    });
    // Eisenerz: Fels (Textur) + rote Brocken (Materialfarbe) als zwei Meshes mit gleicher Instanz-Matrix; gleiche Einpassung für beide
    ladeGlbGeometrien('r32_eisenerz.glb').then((teile) => {
      const fels = teile.get('eisenerz_fels');
      const erz = teile.get('eisenerz_erz');
      if (!fels || !erz) return;
      const gesamt = new THREE.Box3().union(fels.geometrie.boundingBox).union(erz.geometrie.boundingBox);
      const geoF = einpassen(fels.geometrie, 52, -10, gesamt);
      const geoE = einpassen(erz.geometrie, 52, -10, gesamt);
      const matFels = fels.material ?? steinMaterialNeu;
      const matErz = erz.material ?? erzMaterial;
      for (const e of erzMeshes.values()) {
        e.mesh.geometry = geoF;
        e.mesh.material = matFels;
        e.mesh2.geometry = geoE;
        e.mesh2.material = matErz;
      }
    });

    // Pro Ressourcen-ID merken, welche Instanzen dazugehören
    this.ressourcenInstanzen = new Map();
    for (const o of [...baeume, ...steine]) {
      const x = (o.x + o.b / 2) * g;
      const z = (o.y + o.h / 2) * g;
      const r = ressourceVon.get(o);
      const zufall = streuung(o.x, o.y);
      const eintrag = { teile: [] };
      const block = blockVon(o);
      if (o.typ === 'stein' || o.typ === 'eisenerz') {
        const erz = o.typ === 'eisenerz';
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, 8 + this.hy(x, z), z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, zufall * 7, 0)), // Runde 32: Fels-Modelle stehen auf flacher Unterseite
          new THREE.Vector3(1 + zufall * 0.4, 0.7 + zufall * 0.3, 1.1 - zufall * 0.3).multiplyScalar((erz ? 1 : o.groesse === 'gross' ? 1.55 : 1) * (o.skalierung ?? 1)),
        );
        const ziel = erz ? erzMeshes.get(block) : steinMeshes.get(`${block}#${steinVariante(o)}`);
        const index = ziel.naechster++;
        eintrag.teile.push({ mesh: ziel.mesh, index, matrix: m });
        if (ziel.mesh2) eintrag.teile.push({ mesh: ziel.mesh2, index, matrix: m });
      } else {
        const art = this.baumArten.get(artVon.get(o));
        // Größe passend zur Grundfläche, dazu etwas Zufall in Größe und Drehung – kein Baum gleicht dem anderen
        const groesse = ((Math.min(o.b, o.h) * g) / art.grundflaeche) * (art.modell ? 0.82 + zufall * 0.36 : 0.9 + zufall * 0.22) * (o.groesse === 'gross' ? 1.25 : o.groesse === 'klein' ? 0.8 : 1);
        const matrix = matrixAus(x, this.hy(x, z), z, zufall * Math.PI * 2, groesse);
        const teil = art.teile.get(block);
        const index = teil.naechster++;
        for (const mesh of teil.meshes) eintrag.teile.push({ mesh, index, matrix });
        if (art.modell) eintrag.rinde = { mesh: teil.meshes[0], index, stand: 0 }; // Runde 31: Rinde-Mesh → Stamm wird heller, wenn Rinde abgeschnitten wurde
        if (art.toene && teil.laub) {
          // Laubfarbe je Baum leicht anders (Ton aus der Liste × kleine Helligkeitsschwankung) – nur das Laub, die Rinde bleibt
          const ton = art.toene[Math.floor(streuung(o.y, o.x) * art.toene.length)];
          const hell = 0.9 + streuung(o.x + 3, o.y + 7) * 0.2;
          teil.laub.setColorAt(index, new THREE.Color().setRGB(ton[0] * hell, ton[1] * hell, ton[2] * hell, THREE.LinearSRGBColorSpace));
        }
        if (o.typ !== 'busch') {
          // Runde 38: Stumpfdicke = Stammdicke der Baum-Variante × Baumgröße (× 1,1 Wurzelanlauf), Höhe 1,4× – passt zum gefällten Baum
          const breite = Math.max(STUMPF_MIN_BREITE, stammBreite(artVon.get(o)) * groesse * 1.1);
          const s = breite / STUMPF_BREITE;
          const stumpfMatrix = new THREE.Matrix4().compose(new THREE.Vector3(x, this.hy(x, z), z), new THREE.Quaternion().setFromAxisAngle(_achseY, zufall * 5), new THREE.Vector3(s, s * 1.4, s));
          eintrag.stumpf = { pool: stuempfe.get(`${block}#${stumpfArt(o)}`), slot: -1, matrix: stumpfMatrix };
        }
      }
      for (const t of eintrag.teile) t.mesh.setMatrixAt(t.index, t.matrix);
      if (r) this.ressourcenInstanzen.set(r.id, eintrag);
    }
    const meshes = [...stuempfe.values(), ...steinMeshes.values(), ...erzMeshes.values()].map((e) => e.mesh);
    for (const e of erzMeshes.values()) meshes.push(e.mesh2);
    for (const art of this.baumArten.values()) for (const t of art.teile.values()) meshes.push(...t.meshes);
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.beweglich.add(m);
    }
    this.abgebautStand = -1;
  }

  /**
   * Kopie eines Baums (für die Fall-Animation): Gruppe am Stammfuß, darin Körper + Umriss mit der Original-Drehung
   * und -Größe. null, wenn die Ressource kein Baum ist.
   */
  baumKopie(ressourceId) {
    const eintrag = this.ressourcenInstanzen.get(ressourceId);
    const teil = eintrag?.teile[0];
    if (!teil || !eintrag.stumpf) return null;
    const gruppe = new THREE.Group();
    const position = new THREE.Vector3();
    const drehung = new THREE.Quaternion();
    const groesse = new THREE.Vector3();
    teil.matrix.decompose(position, drehung, groesse);
    gruppe.position.copy(position);
    for (const t of eintrag.teile) {
      const mesh = new THREE.Mesh(t.mesh.geometry, t.mesh.material);
      mesh.quaternion.copy(drehung);
      mesh.scale.copy(groesse);
      mesh.castShadow = t.mesh.castShadow;
      gruppe.add(mesh);
    }
    return gruppe;
  }

  /** Qualitätsstufe: Baum-Umrisse und -Schatten an/aus (spart viel bei schwacher Grafik). */
  setzeBaumDetail(an) {
    for (const art of this.baumArten.values()) {
      for (const t of art.teile.values()) {
        if (t.rand) t.rand.visible = an;
        t.meshes[0].castShadow = an;
        if (t.laub) t.laub.castShadow = an;
      }
    }
  }

  #zeigeRessourcen() {
    this.abgebautStand = this.welt.ressourcenVersion;
    for (const [id, gruppe] of this.ressourcenGruppen ?? []) gruppe.visible = this.welt.istRessourceDa(id);
    const geaendert = new Set();
    for (const [id, eintrag] of this.ressourcenInstanzen) {
      const da = this.welt.istRessourceDa(id);
      for (const t of eintrag.teile) {
        t.mesh.setMatrixAt(t.index, da ? t.matrix : NULL_MATRIX);
        geaendert.add(t.mesh);
      }
      const st = eintrag.stumpf;
      if (st && !da && st.slot < 0) {
        // Stumpf belegt einen Slot im Pool (mesh.count wächst nur mit gefällten Bäumen → ausgeblendete Stümpfe kosten nichts)
        st.slot = st.pool.frei.pop() ?? st.pool.mesh.count++;
        st.pool.mesh.setMatrixAt(st.slot, st.matrix);
        geaendert.add(st.pool.mesh);
      } else if (st && da && st.slot >= 0) {
        st.pool.mesh.setMatrixAt(st.slot, NULL_MATRIX);
        st.pool.frei.push(st.slot);
        st.slot = -1;
        geaendert.add(st.pool.mesh);
      }
      // Runde 31: je abgeschnittener Rinde (max. 3) wird der Stamm heller; Instanzfarbe nur anlegen, wenn nötig
      const rinde = eintrag.rinde;
      const schnitte = this.welt.rindeAb.get(id) ?? 0;
      if (rinde && rinde.stand !== schnitte) {
        rinde.stand = schnitte;
        const hell = RINDE_HELLIGKEIT[Math.min(schnitte, RINDE_HELLIGKEIT.length - 1)];
        rinde.mesh.setColorAt(rinde.index, _rindeFarbe.setRGB(hell, hell, hell, THREE.LinearSRGBColorSpace));
        rinde.mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const m of geaendert) m.instanceMatrix.needsUpdate = true;
  }

  /** Schneidet ein Sprite aus dem Umgebungs-Atlas → Textur + mittlere Farbe (für Möbelseiten). */
  #spriteTextur(typ) {
    if (this.spriteCache.has(typ)) return this.spriteCache.get(typ);
    const rahmen = this.assets?.objekt(typ);
    const bild = this.assets?.umgebungBild;
    const canvas = document.createElement('canvas');
    canvas.width = rahmen?.b ?? 4;
    canvas.height = rahmen?.h ?? 4;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let farbe = new THREE.Color(0x6b5a48);
    if (rahmen && bild) {
      ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, 0, 0, rahmen.b, rahmen.h);
      const daten = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (let i = 0; i < daten.length; i += 16) {
        if (daten[i + 3] < 128) continue;
        r += daten[i]; gr += daten[i + 1]; b += daten[i + 2]; n++;
      }
      if (n) farbe = new THREE.Color(r / n / 255, gr / n / 255, b / n / 255).multiplyScalar(0.6).convertSRGBToLinear();
    } else {
      ctx.fillStyle = '#6b5a48';
      ctx.fillRect(0, 0, 4, 4);
    }
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    const eintrag = { textur, farbe };
    this.spriteCache.set(typ, eintrag);
    return eintrag;
  }

  /** Blutflecken nutzen dieselben Sprites wie die Bodendeko. */
  sprite(typ) {
    return this.#spriteTextur(typ).textur;
  }
}

/** Werkbank: Platte, Beine, Schraubstock, ein paar Bretter – als farbige Quader. */
export function werkbankTeile(x, z, breite, tiefe, hoehe, drehung) {
  const holz = new THREE.Color(0x7a4f2a).convertSRGBToLinear();
  const dunkel = new THREE.Color(0x4a3018).convertSRGBToLinear();
  const metall = new THREE.Color(0x5b6168).convertSRGBToLinear();
  const hell = new THREE.Color(0xb88a55).convertSRGBToLinear();
  const basis = matrixAus(x, 0, z, drehung);
  const teil = (b, h, t, px, py, pz, farbe) => ({ geometrie: new THREE.BoxGeometry(b, h, t), matrix: basis.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, pz)), farbe });
  const bx = breite / 2 - 3;
  const bz = tiefe / 2 - 3;
  return [
    teil(breite, 5, tiefe, 0, hoehe - 2.5, 0, holz),
    teil(4, hoehe - 5, 4, -bx, (hoehe - 5) / 2, -bz, dunkel),
    teil(4, hoehe - 5, 4, bx, (hoehe - 5) / 2, -bz, dunkel),
    teil(4, hoehe - 5, 4, -bx, (hoehe - 5) / 2, bz, dunkel),
    teil(4, hoehe - 5, 4, bx, (hoehe - 5) / 2, bz, dunkel),
    teil(breite - 6, 3, tiefe - 6, 0, 8, 0, dunkel),
    teil(8, 7, 7, breite / 2 - 8, hoehe + 3.5, 0, metall),
    teil(breite * 0.45, 2, 6, -breite * 0.18, hoehe + 1, -tiefe * 0.15, hell),
    teil(breite * 0.35, 2, 5, -breite * 0.2, hoehe + 3, tiefe * 0.12, hell),
  ];
}

/** Matrix je Teil { x, z, unten, hoehe, drehung? } für eine Geometrie der Höhe 1 */
function teilMatrix(t) {
  const q = new THREE.Quaternion().setFromAxisAngle(_achseY, t.drehung ?? 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.unten + t.hoehe / 2, t.z), q, new THREE.Vector3(1, t.hoehe, 1));
}

function istWandig(welt, tx, ty) {
  const k = KACHELN[welt.kachelAn(tx, ty)];
  return !!k?.wand || k?.name === 'fenster';
}

/** Wandart einer Kachel: eigene (Wand) oder die der ersten Nachbarwand (Fenster, Tür) – Index in WAND_ARTEN */
function wandArtBei(welt, tx, ty) {
  const eigen = KACHELN[welt.kachelAn(tx, ty)]?.wand;
  const art = eigen ?? [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]].map(([x, y]) => KACHELN[welt.kachelAn(x, y)]?.wand).find(Boolean) ?? 'ziegel';
  return Math.max(0, WAND_ARTEN.indexOf(art));
}

/** Deterministischer Wert 0..1 pro Position (Steine sehen unterschiedlich aus, aber immer gleich). */
function streuung(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
