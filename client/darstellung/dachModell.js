import * as THREE from 'three';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Echte Dächer für alle Gebäude der Karte (Walmdach, Top-Down-/Isometrie-tauglich).
 *
 * Aufbau: Dachkacheln = Innenboden + Hüllkacheln (Wand/Fenster/Tür mit Innenboden in der Nachbarschaft). Zusammenhängende
 * Dachkacheln bilden ein Gebäude. Für jede Kachelecke wird der Abstand zum Gebäuderand berechnet (Chebyshev) – daraus
 * ergibt sich die Höhe: Rand = Traufe, nach innen steigt das Dach bis zum First (bei großen Gebäuden wie dem Krankenhaus
 * flacht es zum Flachdach ab). Traufe ragt etwas über die Wand hinaus. Flache Dreiecke (kein Weichzeichnen), Schindel-Textur
 * mit Farbe je Gebäude.
 *
 * Betritt man ein Gebäude, verschwindet das ganze Dach (alle Räume sofort sichtbar); andere Gebäude bleiben zu.
 * Pro Gebäude 1 Mesh, beim Betreten/Verlassen wird nur dieses Gebäude neu zusammengesetzt (Kachel-Geometrie ist vorberechnet).
 */
const ANSTIEG_KLEIN = 34; // Dachhöhe (px) über der Traufe bei kleinen Gebäuden (Wohnhäuser)
const ANSTIEG_GROSS = 14; // bei großen Gebäuden (Flachdach mit abgeschrägtem Rand)
const GROSS_AB = 6; // Gebäude mit größerem Abstand (Kacheln) Rand→Mitte gelten als groß
const ANSTIEG_KACHELN = 3; // so viele Kacheln braucht der Anstieg bis zum First
const UEBERSTAND = 5; // Traufe ragt so viele px über die Wand
const TRAUFE_SENKUNG = 3; // und hängt etwas nach unten
const TEXTUR_KACHELN = 1.5; // eine Texturkachel deckt so viele Dachkacheln ab
const DACH_FARBEN = [0xd0644a, 0x7f8ca0, 0xa8705a, 0x6f8f7a, 0xb88a62, 0x8a96aa]; // Ziegelrot, Schiefer, Braun, Moosgrün, Holz, Blaugrau
const GROSS_FARBE = 0xa2a8b0; // Flachdach (Krankenhaus u. a.): helles Betongrau
const NACHBARN8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

let schindelCache = null;
/** Graustufen-Schindeln (Reihen mit Versatz, dunkle Fugen) – die Farbe kommt aus den Vertexfarben. */
function schindelTextur() {
  if (schindelCache) return schindelCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#9a9a9a';
  x.fillRect(0, 0, 128, 128);
  const reihe = 16;
  const breite = 32;
  let zufall = 7;
  const zahl = () => ((zufall = (zufall * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < 128 / reihe; r++) {
    const versatz = r % 2 ? breite / 2 : 0;
    for (let s = -1; s < 128 / breite + 1; s++) {
      const hell = 150 + Math.floor(zahl() * 70);
      x.fillStyle = `rgb(${hell},${hell},${hell})`;
      x.fillRect(s * breite + versatz + 1, r * reihe + 1, breite - 2, reihe - 2);
      x.fillStyle = 'rgba(0,0,0,0.28)'; // Schatten-Kante unter jeder Schindel
      x.fillRect(s * breite + versatz + 1, r * reihe + reihe - 4, breite - 2, 3);
    }
  }
  schindelCache = new THREE.CanvasTexture(c);
  schindelCache.wrapS = schindelCache.wrapT = THREE.RepeatWrapping;
  schindelCache.colorSpace = THREE.SRGBColorSpace;
  schindelCache.anisotropy = 4;
  return schindelCache;
}

export class Daecher {
  /**
   * @param welt  gemeinsame Welt (kachelAn, hoehe/breite, kachelGroesse)
   * @param basisHoehe  Höhe der Wandoberkante (Weltpixel)
   * @param hy  Geländehöhe an (x, z)
   * @param material  Material mit Wand-Schnitt (Renderer.mitSchnitt) – bekommt hier Textur & Vertexfarben
   */
  constructor({ welt, basisHoehe, hy, material }) {
    this.welt = welt;
    this.g = welt.kachelGroesse;
    this.basis = basisHoehe + 0.4;
    this.hy = hy;
    this.gruppe = new THREE.Group();
    this.raumAn = new Map(); // Kachelindex → Raum-Nr. (nur Innenboden)
    this.raumKacheln = []; // Raum-Nr. → [Kachelindex] (Innenboden)
    this.huelleVonRaum = []; // Raum-Nr. → [Kachelindex] angrenzende Wand-/Tür-Dachkacheln
    this.tuerRaum = new Map(); // Kachelindex einer Tür → Raum-Nr. dahinter
    this.gebaeude = []; // { mesh, kacheln:[idx], daten Map idx→{pos,nor,uv,col}, raeume:Set }
    this.gebaeudeVon = new Map(); // Kachelindex → Gebäude-Nr.
    this.versteckt = new Set(); // aktuell offene (nicht gezeichnete) Dachkacheln
    this.offenesGebaeude = -1;
    material.map = schindelTextur();
    material.vertexColors = true;
    material.roughness = 0.85;
    material.needsUpdate = true;
    this.material = material;
    this.#baue();
  }

  get leer() {
    return this.gebaeude.length === 0;
  }

  /** Raum-Nr. an Weltposition (-1 draußen); Türkachel → Raum dahinter (so ist man im Türrahmen nicht unter dem Dach versteckt). */
  raumBei(x, y) {
    const idx = Math.floor(y / this.g) * this.welt.breite + Math.floor(x / this.g);
    return this.raumAn.get(idx) ?? this.tuerRaum.get(idx) ?? -1;
  }

  /** Gebäude-Nr. an Weltposition (-1 draußen); Tür-/Innenkachel zählt zum Gebäude, in dem man steht. */
  gebaeudeBei(x, y) {
    const raum = this.raumBei(x, y);
    return raum < 0 ? -1 : (this.gebaeudeVon.get(this.raumKacheln[raum][0]) ?? -1);
  }

  /** Liegt der Punkt draußen oder im gerade geöffneten Gebäude? */
  einsehbar(x, y) {
    const idx = Math.floor(y / this.g) * this.welt.breite + Math.floor(x / this.g);
    const raum = this.raumAn.get(idx);
    return raum === undefined || this.gebaeudeVon.get(idx) === this.offenesGebaeude;
  }

  /** Gebäude betreten/verlassen: beim Betreten wird das GANZE Dach des Gebäudes ausgeblendet (alle Räume sichtbar), draußen bleibt alles zu. */
  aktualisiere(x, y) {
    const gebaeude = this.gebaeudeBei(x, y);
    if (gebaeude === this.offenesGebaeude) return;
    const alt = this.offenesGebaeude;
    this.offenesGebaeude = gebaeude;
    if (alt >= 0) {
      for (const idx of this.gebaeude[alt].kacheln) this.versteckt.delete(idx);
      this.#baueMesh(alt);
    }
    if (gebaeude >= 0) {
      for (const idx of this.gebaeude[gebaeude].kacheln) this.versteckt.add(idx);
      this.#baueMesh(gebaeude);
    }
  }

  #baue() {
    const welt = this.welt;
    const { breite, hoehe } = welt;
    const art = (tx, ty) => KACHELN[welt.kachelAn(tx, ty)];
    const innen = (tx, ty) => art(tx, ty)?.innen === true;
    const huelle = (tx, ty) => ['wand', 'fenster', 'tuer'].includes(art(tx, ty)?.name);
    // 1. Räume: Flood-Fill über Innenboden (4er-Nachbarn; Türen trennen)
    for (let ty = 0; ty < hoehe; ty++) {
      for (let tx = 0; tx < breite; tx++) {
        if (!innen(tx, ty) || this.raumAn.has(ty * breite + tx)) continue;
        const nr = this.raumKacheln.length;
        const liste = [];
        const stapel = [[tx, ty]];
        this.raumAn.set(ty * breite + tx, nr);
        while (stapel.length > 0) {
          const [x, y] = stapel.pop();
          liste.push(y * breite + x);
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (!innen(nx, ny) || this.raumAn.has(ny * breite + nx)) continue;
            this.raumAn.set(ny * breite + nx, nr);
            stapel.push([nx, ny]);
          }
        }
        this.raumKacheln.push(liste);
        this.huelleVonRaum.push([]);
      }
    }
    // 2. Dachkacheln: Innenboden + Hüllkacheln, die an Innenboden grenzen (Zuordnung zum Raum nur für Tür-Sonderfall nötig)
    const dach = new Set(this.raumAn.keys());
    for (let ty = 0; ty < hoehe; ty++) {
      for (let tx = 0; tx < breite; tx++) {
        if (!huelle(tx, ty)) continue;
        const raeume = new Set();
        for (const [dx, dy] of NACHBARN8) {
          const r = this.raumAn.get((ty + dy) * breite + tx + dx);
          if (r !== undefined && innen(tx + dx, ty + dy)) raeume.add(r);
        }
        if (raeume.size === 0) continue;
        const idx = ty * breite + tx;
        dach.add(idx);
        for (const r of raeume) this.huelleVonRaum[r].push(idx);
        if (art(tx, ty).name === 'tuer') this.tuerRaum.set(idx, Math.min(...raeume));
      }
    }
    if (dach.size === 0) return;
    // 3. Gebäude = zusammenhängende Dachkacheln (8er-Nachbarn)
    const imDach = (tx, ty) => tx >= 0 && ty >= 0 && tx < breite && ty < hoehe && dach.has(ty * breite + tx);
    for (const start of dach) {
      if (this.gebaeudeVon.has(start)) continue;
      const nr = this.gebaeude.length;
      const kacheln = [];
      const stapel = [start];
      this.gebaeudeVon.set(start, nr);
      while (stapel.length > 0) {
        const idx = stapel.pop();
        kacheln.push(idx);
        const tx = idx % breite;
        const ty = Math.floor(idx / breite);
        for (const [dx, dy] of NACHBARN8) {
          if (!imDach(tx + dx, ty + dy)) continue;
          const n = (ty + dy) * breite + tx + dx;
          if (this.gebaeudeVon.has(n)) continue;
          this.gebaeudeVon.set(n, nr);
          stapel.push(n);
        }
      }
      this.gebaeude.push({ nr, kacheln, daten: new Map(), mesh: null });
    }
    // 4. Eckenabstand (Chebyshev) zum Rand, Höhen, Kachel-Geometrie
    const eb = breite + 1;
    const eckeImDach = (cx, cy) => imDach(cx - 1, cy - 1) || imDach(cx, cy - 1) || imDach(cx - 1, cy) || imDach(cx, cy);
    const eckeRand = (cx, cy) => !(imDach(cx - 1, cy - 1) && imDach(cx, cy - 1) && imDach(cx - 1, cy) && imDach(cx, cy));
    const abstand = new Map();
    let rand = [];
    for (const idx of dach) {
      const tx = idx % breite;
      const ty = Math.floor(idx / breite);
      for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]) {
        const k = cy * eb + cx;
        if (!abstand.has(k) && eckeRand(cx, cy)) {
          abstand.set(k, 0);
          rand.push([cx, cy]);
        }
      }
    }
    for (let d = 1; rand.length > 0; d++) {
      const neu = [];
      for (const [cx, cy] of rand) {
        for (const [dx, dy] of NACHBARN8) {
          const nx = cx + dx;
          const ny = cy + dy;
          const k = ny * eb + nx;
          if (nx < 0 || ny < 0 || nx > breite || ny > hoehe || abstand.has(k) || !eckeImDach(nx, ny)) continue;
          abstand.set(k, d);
          neu.push([nx, ny]);
        }
      }
      rand = neu;
    }
    const g = this.g;
    for (const gb of this.gebaeude) {
      let maxD = 1;
      for (const idx of gb.kacheln) {
        const tx = idx % breite;
        const ty = Math.floor(idx / breite);
        for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]) maxD = Math.max(maxD, abstand.get(cy * eb + cx) ?? 0);
      }
      const gross = maxD >= GROSS_AB;
      const kappe = gross ? ANSTIEG_GROSS : ANSTIEG_KLEIN;
      const proKachel = kappe / Math.min(ANSTIEG_KACHELN, maxD);
      const farbe = new THREE.Color(gross ? GROSS_FARBE : DACH_FARBEN[(gb.kacheln[0] * 7 + gb.kacheln.length) % DACH_FARBEN.length]);
      // Ecke → Position (Rand: nach außen über die Wand hinaus, etwas abgesenkt)
      const ecke = (cx, cy) => {
        const d = abstand.get(cy * eb + cx) ?? 0;
        let x = cx * g;
        let z = cy * g;
        let y = this.basis + Math.min(d * proKachel, kappe);
        if (d === 0) {
          let ax = 0;
          let az = 0;
          for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
            if (!imDach(cx + Math.floor(dx), cy + Math.floor(dy))) {
              ax += dx;
              az += dy;
            }
          }
          const l = Math.hypot(ax, az);
          if (l > 0) {
            x += (ax / l) * UEBERSTAND;
            z += (az / l) * UEBERSTAND;
          }
          y -= TRAUFE_SENKUNG;
        }
        return [x, y + this.hy(cx * g, cy * g), z];
      };
      for (const idx of gb.kacheln) {
        const tx = idx % breite;
        const ty = Math.floor(idx / breite);
        const a = ecke(tx, ty);
        const b = ecke(tx + 1, ty);
        const c = ecke(tx + 1, ty + 1);
        const e = ecke(tx, ty + 1);
        gb.daten.set(idx, kachelDaten([a, e, b, b, e, c], farbe, g));
      }
    }
    for (const gb of this.gebaeude) this.#baueMesh(gb.nr);
  }

  #baueMesh(nr) {
    const gb = this.gebaeude[nr];
    const sichtbar = gb.kacheln.filter((idx) => !this.versteckt.has(idx));
    if (!gb.mesh) {
      gb.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      gb.mesh.castShadow = true;
      gb.mesh.receiveShadow = true;
      this.gruppe.add(gb.mesh);
    }
    gb.mesh.visible = sichtbar.length > 0;
    const geometrie = new THREE.BufferGeometry();
    const n = sichtbar.length * 6;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    sichtbar.forEach((idx, i) => {
      const d = gb.daten.get(idx);
      pos.set(d.pos, i * 18);
      nor.set(d.nor, i * 18);
      uv.set(d.uv, i * 12);
      col.set(d.col, i * 18);
    });
    geometrie.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometrie.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometrie.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometrie.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometrie.computeBoundingSphere();
    gb.mesh.geometry.dispose();
    gb.mesh.geometry = geometrie;
  }
}

/** 2 Dreiecke (6 Ecken [x,y,z]) → Positionen, flache Normalen (nach oben orientiert), Welt-UVs, Vertexfarben. */
function kachelDaten(ecken, farbe, g) {
  const pos = new Float32Array(18);
  const nor = new Float32Array(18);
  const uv = new Float32Array(12);
  const col = new Float32Array(18);
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normale = new THREE.Vector3();
  for (let t = 0; t < 2; t++) {
    const [p0, p1, p2] = ecken.slice(t * 3, t * 3 + 3).map((p) => new THREE.Vector3(...p));
    normale.crossVectors(ab.subVectors(p1, p0), ac.subVectors(p2, p0)).normalize();
    if (normale.y < 0) normale.negate();
    [p0, p1, p2].forEach((p, k) => {
      const i = t * 3 + k;
      pos.set([p.x, p.y, p.z], i * 3);
      nor.set([normale.x, normale.y, normale.z], i * 3);
      uv.set([p.x / (g * TEXTUR_KACHELN), p.z / (g * TEXTUR_KACHELN)], i * 2);
      col.set([farbe.r, farbe.g, farbe.b], i * 3);
    });
  }
  return { pos, nor, uv, col };
}
