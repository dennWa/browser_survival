import * as THREE from 'three';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { baueBaum, baueStumpf, toonMaterial } from './baumModell.js';
import { BodenTextur } from './bodenTextur.js';
import { einfrieren, matrixAus, vereineGeometrien } from './geometrie.js';

/**
 * Die Karte als 3D-Modell – auf wenige Draw-Calls optimiert (Performance!):
 *   Boden        1 Mesh mit Bodentextur
 *   Wände/Glas   InstancedMesh (1–2 Draw-Calls)
 *   Möbel        ALLE Möbelseiten in einem Mesh (Vertexfarben) + je Möbeltyp ein Mesh für die Deckel
 *   Bäume/Steine InstancedMesh pro Teil – einzelne Instanzen werden beim Abbauen ausgeblendet (Stumpf erscheint)
 *   Türen        einzelne Flügel (bewegen sich)
 *   Lampen       nur ein kleines Glühen pro Lampe; echtes Licht kommt aus einem Pool im Renderer
 *
 * Alles außer Türen und Ressourcen wird "eingefroren" (Matrizen nicht jeden Frame neu berechnen).
 */
export const WANDHOEHE = 72;
export const TUER_HOEHE = WANDHOEHE - 14;
const TUER_DREHTEMPO = 9;
/** Höhe (Weltpixel) der Möbel-Quader */
const MOEBEL_HOEHE = {
  bett: 18, bett_orange: 18, tisch: 24, tisch_rund: 24, stuhl: 14, sessel: 18, sessel_blau: 18, sofa: 18, sofa_dunkel: 18,
  kiste: 26, kiste_klein: 16, pflanze: 30, kueche_theke: 30, kueche_herd: 30, kueche_spuele: 30, kueche_kochfeld: 30,
  auto_schwarz: 38, auto_blau: 38, auto_rot: 38, auto_gruen: 38, auto_gelb: 38, transporter: 46, fass: 28, pylone: 18,
  werkbank: 26,
};
const _matrix = new THREE.Matrix4();
const NULL_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class KartenModell {
  /**
   * @param mitSchnitt  Funktion, die einem Material den Wand-Schnitt (siehe Renderer) verpasst
   * @param bodenMassstab  Auflösung der Bodentextur (Pixel pro Weltpixel) – auf Handys kleiner
   */
  constructor({ welt, assets, gl, mitSchnitt, bodenMassstab = 1 }) {
    this.welt = welt;
    this.assets = assets;
    this.gl = gl;
    this.mitSchnitt = mitSchnitt;
    this.g = welt.kachelGroesse;
    this.spriteCache = new Map();

    this.statisch = new THREE.Group();
    this.beweglich = new THREE.Group(); // Türen, Ressourcen
    this.#baueBoden(bodenMassstab);
    this.#baueWasser();
    this.#baueWaende();
    this.#baueMoebel();
    this.#baueLampen();
    this.#baueTueren();
    this.#baueRessourcen();
    einfrieren(this.statisch);
  }

  /** Lampen der Karte: [{ x, y, z, farbe, radius, staerke, objekt }] – für den Licht-Pool im Renderer */
  get lampen() {
    return this.lampenListe;
  }

  /** Pro Frame: Türen schwingen lassen, Ressourcen ein-/ausblenden, Lampen-Glühen. */
  aktualisiere(dt, dunkel) {
    for (const t of this.tuerFluegel) {
      const soll = this.welt.istTuerOffen(t.tuerId) ? (t.richtung * Math.PI) / 2 : 0;
      if (t.winkel === soll) continue;
      t.winkel = t.winkel === null ? soll : t.winkel + (soll - t.winkel) * Math.min(1, dt * TUER_DREHTEMPO);
      if (Math.abs(t.winkel - soll) < 0.002) t.winkel = soll;
      t.fluegel.rotation.y = t.winkel;
    }
    if (this.abgebautStand !== this.welt.ressourcenVersion) this.#zeigeRessourcen();
    if (this.wasser) {
      // Wellen ziehen langsam; nachts blasser (der Wellen-Glanz leuchtet nicht)
      this.wasser.textur.offset.x = (this.wasser.textur.offset.x + dt * 0.035) % 1;
      this.wasser.textur.offset.y = (this.wasser.textur.offset.y + dt * 0.014) % 1;
      this.wasser.material.opacity = 0.5 * (1 - dunkel * 0.85);
    }
    this.lampenGluehen.visible = dunkel > 0.08;
    this.lampenGluehen.material.opacity = Math.min(1, dunkel * 1.4);
  }

  // ---------------------------------------------------------------------------

  /** Bodenbild malen (Innenräume abgedunkelt, weil es kein Dach gibt) */
  #maleBoden(massstab) {
    const welt = this.welt;
    const g = this.g;
    const leinwand = new BodenTextur(welt, this.assets).rendere(massstab);
    const ctx = leinwand.getContext('2d');
    ctx.setTransform(massstab, 0, 0, massstab, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        if (KACHELN[welt.kachelAn(tx, ty)]?.innen) ctx.fillRect(tx * g, ty * g, g, g);
      }
    }
    return leinwand;
  }

  /** Grafik-Einstellung geändert: Bodentextur in anderer Auflösung neu malen (Textur-Objekt bleibt, kein Shader-Neubau). */
  setzeBodenMassstab(massstab) {
    if (massstab === this.bodenMassstab) return;
    this.bodenMassstab = massstab;
    this.bodenTextur.image = this.#maleBoden(massstab);
    this.bodenTextur.needsUpdate = true;
  }

  #baueBoden(massstab) {
    const welt = this.welt;
    this.bodenMassstab = massstab;
    const leinwand = this.#maleBoden(massstab);
    const textur = new THREE.CanvasTexture(leinwand);
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
    this.bodenTextur = textur;
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(welt.pixelBreite, welt.pixelHoehe), new THREE.MeshStandardMaterial({ map: textur, roughness: 1 }));
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(welt.pixelBreite / 2, 0, welt.pixelHoehe / 2);
    boden.receiveShadow = true;
    const draussen = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 }) /* Rasen jenseits des Kartenrands – war fast schwarz und wirkte im Auto (Kamera weiter weg) wie "extrem dunkel" im Norden */);
    draussen.rotation.x = -Math.PI / 2;
    draussen.position.set(welt.pixelBreite / 2, -0.5, welt.pixelHoehe / 2);
    this.statisch.add(boden, draussen);
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
    felder.forEach(([tx, ty], i) => mesh.setMatrixAt(i, _matrix.makeTranslation((tx + 0.5) * g, 0.45, (ty + 0.5) * g)));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.statisch.add(mesh);
    this.wasser = { material, textur };
  }

  #baueWaende() {
    const welt = this.welt;
    const g = this.g;
    const teile = [];
    const glas = [];
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
        const x = tx * g + g / 2;
        const z = ty * g + g / 2;
        if (name === 'wand') teile.push({ x, z, unten: 0, hoehe: WANDHOEHE });
        if (name === 'fenster') {
          teile.push({ x, z, unten: 0, hoehe: 24 }, { x, z, unten: WANDHOEHE - 12, hoehe: 12 });
          const senkrecht = !istWandig(welt, tx - 1, ty) && !istWandig(welt, tx + 1, ty);
          glas.push({ x, z, unten: 24, hoehe: WANDHOEHE - 36, drehung: senkrecht ? Math.PI / 2 : 0 });
        }
        if (name === 'tuer') teile.push({ x, z, unten: TUER_HOEHE, hoehe: WANDHOEHE - TUER_HOEHE }); // Sturz
      }
    }
    const seite = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x5a616c, roughness: 0.92 }));
    const oben = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 1 }));
    const wand = instanzen(new THREE.BoxGeometry(g, 1, g), [seite, seite, oben, oben, seite, seite], teile);
    wand.castShadow = true;
    wand.receiveShadow = true;
    const glasMaterial = this.mitSchnitt(new THREE.MeshStandardMaterial({ color: 0x8cc8e2, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }));
    this.statisch.add(wand, instanzen(new THREE.BoxGeometry(g, 1, g * 0.3), glasMaterial, glas));
  }

  /** Alle Möbel: Seiten in EIN Mesh (Farbe je Möbel), Deckel (Sprite von oben) je Typ in ein Mesh. */
  #baueMoebel() {
    const g = this.g;
    const seiten = [];
    const deckelProTyp = new Map();
    for (const o of this.welt.objekte) {
      if (o.typ === 'licht' || o.typ === 'markierung' || o.ebene === 'boden' || o.ebene === 'oben' || RESSOURCEN_OBJEKTE[o.typ]) continue;
      const quer = (o.drehung ?? 0) % 180 !== 0;
      const breite = (quer ? o.h : o.b) * g;
      const tiefe = (quer ? o.b : o.h) * g;
      const hoehe = MOEBEL_HOEHE[o.typ] ?? 20;
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
    if (seiten.length) {
      const mesh = new THREE.Mesh(vereineGeometrien(seiten, { mitFarbe: true }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.statisch.add(mesh);
    }
    for (const [typ, teile] of deckelProTyp) {
      const mesh = new THREE.Mesh(vereineGeometrien(teile), new THREE.MeshStandardMaterial({ map: this.#spriteTextur(typ).textur, roughness: 0.8 }));
      mesh.receiveShadow = true;
      this.statisch.add(mesh);
    }
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
      schild.position.set(x, 56, z + 1.6);
      this.statisch.add(schild);
    }
  }

  /** Lampen: kleines Glühen pro Lampe (ein InstancedMesh); echtes Licht verteilt der Renderer aus einem Pool. */
  #baueLampen() {
    const g = this.g;
    this.lampenListe = this.welt.objekte
      .filter((o) => o.typ === 'licht')
      .map((o) => ({ x: (o.x + 0.5) * g, y: 60, z: (o.y + 0.5) * g, farbe: new THREE.Color(o.farbe), reichweite: o.radius * g * 1.8, staerke: (o.staerke ?? 0.8) * 260, objekt: o }));
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
    this.lampenGluehen = new THREE.InstancedMesh(new THREE.SphereGeometry(3.5, 8, 6), material, Math.max(1, this.lampenListe.length));
    this.lampenListe.forEach((l, i) => {
      this.lampenGluehen.setMatrixAt(i, _matrix.makeTranslation(l.x, l.y, l.z));
      this.lampenGluehen.setColorAt(i, l.farbe.clone().multiplyScalar(1.3));
    });
    this.lampenGluehen.count = this.lampenListe.length;
    this.statisch.add(this.lampenGluehen);
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
        fluegel.add(blatt, griff);
        scharnier.add(fluegel);
        if (tuer.senkrecht) {
          scharnier.position.set(tx * g + g / 2, 0, ersteHaelfte ? ty * g + 1 : (ty + 1) * g - 1);
          scharnier.rotation.y = -Math.PI / 2;
        } else {
          scharnier.position.set(ersteHaelfte ? tx * g + 1 : (tx + 1) * g - 1, 0, ty * g + g / 2);
        }
        this.beweglich.add(scharnier);
        this.tuerFluegel.push({ tuerId: tuer.id, fluegel, richtung, winkel: null });
      });
    }
  }

  /**
   * Bäume, Büsche (prozedurale 3D-Cartoon-Modelle aus baumModell.js) und Steine als InstancedMesh. Abbaubare (welt.ressourcen) können ausgeblendet
   * werden – an ihrer Stelle erscheint ein Stumpf bzw. nichts. Büsche sind Deko.
   */
  #baueRessourcen() {
    const g = this.g;
    const baeume = this.welt.objekte.filter((o) => o.ebene === 'oben');
    const ressourceVon = new Map(this.welt.ressourcen.map((r) => [r.objekt, r]));
    const typen = [...new Set(baeume.map((o) => o.typ))];

    // Pro Baumtyp: Körper (Toon, Vertexfarben) + schwarzer Umriss – je ein InstancedMesh
    const umrissMaterial = this.mitSchnitt(new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide }));
    this.baumArten = new Map();
    for (const typ of typen) {
      const anzahl = baeume.filter((o) => o.typ === typ).length;
      const { koerper, umriss, grundflaeche } = baueBaum(typ);
      const mesh = new THREE.InstancedMesh(koerper, this.mitSchnitt(toonMaterial({ vertexColors: true })), anzahl);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const rand = new THREE.InstancedMesh(umriss, umrissMaterial, anzahl);
      this.baumArten.set(typ, { mesh, rand, grundflaeche, naechster: 0 });
    }
    const stammAnzahl = baeume.filter((o) => o.typ !== 'busch').length;
    this.stuempfe = new THREE.InstancedMesh(baueStumpf(), toonMaterial({ vertexColors: true }), Math.max(1, stammAnzahl));
    this.stuempfe.castShadow = true;
    this.stuempfe.receiveShadow = true;
    const steine = this.welt.objekte.filter((o) => o.typ === 'stein' || o.typ === 'eisenerz');
    this.steine = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(14, 0), new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.95, flatShading: true }), Math.max(1, steine.length));
    this.steine.castShadow = true;
    this.steine.receiveShadow = true;
    // Eisenerz: dunklerer, rostiger Fels mit orange glänzenden Erzbrocken (ein Mesh mit Vertexfarben)
    const erzTeile = [{ geometrie: new THREE.DodecahedronGeometry(14, 0), matrix: new THREE.Matrix4(), farbe: new THREE.Color(0x6e5a4e) }];
    for (const [x, y, z, r] of [[7, 6, 5, 4], [-6, 8, -3, 3.5], [2, 11, -7, 3], [-8, 2, 8, 3.2], [9, -1, -6, 2.6]]) {
      erzTeile.push({ geometrie: new THREE.OctahedronGeometry(r, 0), matrix: matrixAus(x, y, z, x), farbe: new THREE.Color(0xd9772e) });
    }
    this.erze = new THREE.InstancedMesh(
      vereineGeometrien(erzTeile, { mitFarbe: true }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35, flatShading: true }),
      Math.max(1, steine.filter((o) => o.typ === 'eisenerz').length),
    );
    this.erze.castShadow = true;
    this.erze.receiveShadow = true;

    // Pro Ressourcen-ID merken, welche Instanzen dazugehören
    this.ressourcenInstanzen = new Map();
    let stumpfIndex = 0;
    let steinIndex = 0;
    let erzIndex = 0;
    for (const o of [...baeume, ...steine]) {
      const x = (o.x + o.b / 2) * g;
      const z = (o.y + o.h / 2) * g;
      const r = ressourceVon.get(o);
      const zufall = streuung(o.x, o.y);
      const eintrag = { teile: [] };
      if (o.typ === 'stein' || o.typ === 'eisenerz') {
        const erz = o.typ === 'eisenerz';
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, 6, z),
          new THREE.Quaternion().setFromEuler(erz ? new THREE.Euler(0, zufall * 7, 0) : new THREE.Euler(zufall * 3, zufall * 7, zufall * 2)),
          new THREE.Vector3(1 + zufall * 0.4, 0.7 + zufall * 0.3, 1.1 - zufall * 0.3),
        );
        eintrag.teile.push(erz ? { mesh: this.erze, index: erzIndex++, matrix: m } : { mesh: this.steine, index: steinIndex++, matrix: m });
      } else {
        const art = this.baumArten.get(o.typ);
        // Größe passend zur Grundfläche, dazu etwas Zufall in Größe und Drehung – kein Baum gleicht dem anderen
        const groesse = ((Math.min(o.b, o.h) * g) / art.grundflaeche) * (0.9 + zufall * 0.22);
        const matrix = matrixAus(x, 0, z, zufall * Math.PI * 2, groesse);
        const index = art.naechster++;
        eintrag.teile.push({ mesh: art.mesh, index, matrix }, { mesh: art.rand, index, matrix });
        if (o.typ !== 'busch') eintrag.stumpf = { mesh: this.stuempfe, index: stumpfIndex++, matrix: matrixAus(x, 0, z, zufall * 5, groesse * 1.3) };
      }
      for (const t of eintrag.teile) t.mesh.setMatrixAt(t.index, t.matrix);
      if (eintrag.stumpf) eintrag.stumpf.mesh.setMatrixAt(eintrag.stumpf.index, NULL_MATRIX);
      if (r) this.ressourcenInstanzen.set(r.id, eintrag);
    }
    this.stuempfe.count = stumpfIndex;
    this.steine.count = steinIndex;
    this.erze.count = erzIndex;
    const meshes = [this.stuempfe, this.steine, this.erze];
    for (const art of this.baumArten.values()) meshes.push(art.mesh, art.rand);
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      // Kein Frustum-Culling: Instanzen werden ein-/ausgeblendet, eine einmal berechnete Bounding-Sphere
      // (z. B. als alle Stümpfe noch versteckt waren) wäre sonst falsch → Stümpfe blieben unsichtbar.
      m.frustumCulled = false;
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
      art.rand.visible = an;
      art.mesh.castShadow = an;
    }
  }

  #zeigeRessourcen() {
    this.abgebautStand = this.welt.ressourcenVersion;
    const geaendert = new Set();
    for (const [id, eintrag] of this.ressourcenInstanzen) {
      const da = this.welt.istRessourceDa(id);
      for (const t of eintrag.teile) {
        t.mesh.setMatrixAt(t.index, da ? t.matrix : NULL_MATRIX);
        geaendert.add(t.mesh);
      }
      if (eintrag.stumpf) {
        eintrag.stumpf.mesh.setMatrixAt(eintrag.stumpf.index, da ? NULL_MATRIX : eintrag.stumpf.matrix);
        geaendert.add(eintrag.stumpf.mesh);
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

function instanzen(geometrie, material, teile) {
  const mesh = new THREE.InstancedMesh(geometrie, material, Math.max(1, teile.length));
  mesh.count = teile.length;
  const q = new THREE.Quaternion();
  teile.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.drehung ?? 0);
    _matrix.compose(new THREE.Vector3(t.x, t.unten + t.hoehe / 2, t.z), q, new THREE.Vector3(1, t.hoehe, 1));
    mesh.setMatrixAt(i, _matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function istWandig(welt, tx, ty) {
  const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
  return name === 'wand' || name === 'fenster';
}

/** Deterministischer Wert 0..1 pro Position (Steine sehen unterschiedlich aus, aber immer gleich). */
function streuung(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
