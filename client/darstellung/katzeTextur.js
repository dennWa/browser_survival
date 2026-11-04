import * as THREE from 'three';

/**
 * Katzen-Textur (Runde 30): legt eine selbst gemalte Textur (`assets/3d/skins/katze.png`, Zonen siehe `katze_zonen.json` +
 * Vorlage `docs/konzepte/katze_textur/`) auf `cat.glb`. Die UVs des GLB zeigen nur auf eine 32×32-Farbpalette → werden hier neu berechnet:
 * Geometrie entindizieren, jedes Dreieck einem Körperteil zuordnen (Position) und per Box-Projektion (dominante Normalachse)
 * auf die Zone des Körperteils legen. Augen/rosa Details (Nase, Ohr innen, Pfotenballen) erkennt man an der ALTEN Paletten-UV.
 * Statisches Mesh (kein Skelett), Y oben, Kopf = +Z. Nur Darstellung. Fehlt die Textur, bleibt die Katze unverändert (ladeKatzenTextur → null).
 */
const clamp = (v, a = 0.01, b = 0.99) => Math.min(b, Math.max(a, v));
const bruch = (w, min, max) => (max - min > 1e-6 ? (w - min) / (max - min) : 0.5);

/** Textur + Zonen laden; null wenn eine der beiden Dateien fehlt */
export async function ladeKatzenTextur(basis) {
  try {
    const [zonen, textur] = await Promise.all([
      fetch(new URL('3d/skins/katze_zonen.json', basis)).then((r) => (r.ok ? r.json() : Promise.reject(new Error('keine Zonen')))),
      new THREE.TextureLoader().loadAsync(new URL('3d/skins/katze.png', basis).href),
    ]);
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.flipY = false; // UV-v zählt wie im PNG von oben nach unten (glTF-Konvention)
    textur.anisotropy = 4;
    return { zonen, textur };
  } catch {
    return null;
  }
}

function grenzen(liste) {
  const g = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) };
  for (const c of liste) {
    g.min.min(c);
    g.max.max(c);
  }
  return g;
}

/** szene = gltf.scene von cat.glb; ersetzt Geometrie + Material des Meshes. Gibt true zurück, wenn umgebaut wurde. */
export function texturiereKatze(szene, { zonen, textur }) {
  const Z = zonen.zonen;
  const gr = zonen.groesse;
  let mesh = null;
  szene.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && !mesh) mesh = o;
  });
  if (!mesh) return false;
  const q = mesh.geometry;
  const geo = q.index ? q.toNonIndexed() : q.clone();
  const pos = geo.getAttribute('position');
  const alt = geo.getAttribute('uv'); // alte Paletten-UV: nur zum Erkennen von Augen/Rosa
  if (!pos || !alt) return false;
  const n = pos.count / 3;
  const gesamt = new THREE.Box3().setFromBufferAttribute(pos);
  const L = gesamt.max.z - gesamt.min.z;
  const H = gesamt.max.y - gesamt.min.y;
  const tz = (z) => (z - gesamt.min.z) / L; // 0 = Schwanzspitze … 1 = Nase
  const sy = (y) => (y - gesamt.min.y) / H; // 0 = Sohle … 1 = Schwanzspitze

  // 1. Teil + Fläche je Dreieck
  const tri = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nm = new THREE.Vector3();
  for (let d = 0; d < n; d++) {
    a.fromBufferAttribute(pos, d * 3);
    b.fromBufferAttribute(pos, d * 3 + 1);
    c.fromBufferAttribute(pos, d * 3 + 2);
    const mitte = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    nm.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    // alte Palette: 0 grau, 1 weiß, 2 rosa, 3 olive (Quadranten der 32×32-Textur)
    const pal = [0, 1, 2].map((e) => (alt.getX(d * 3 + e) >= 0.5 ? 1 : 0) + (alt.getY(d * 3 + e) >= 0.5 ? 2 : 0));
    const palette = pal.sort((x, y) => pal.filter((v) => v === y).length - pal.filter((v) => v === x).length)[0];
    let teil;
    if (palette === 3) teil = 'auge';
    else if (palette === 2) teil = 'rosa';
    else if (tz(mitte.z) < 0.12) teil = 'schwanz';
    else if (tz(mitte.z) > 0.8 && sy(mitte.y) > 0.3) teil = sy(mitte.y) > 0.6 ? 'ohr' : 'kopf';
    else if (sy(mitte.y) < 0.3) teil = 'bein';
    else teil = 'koerper';
    tri.push({ mitte, n: nm.clone(), teil });
  }

  // 2. Grenzen je Teil, Beine einzeln (4 Gruppen), Ohren je Seite
  const alle = (teil) => tri.filter((t) => t.teil === teil);
  const G = {};
  for (const teil of ['koerper', 'kopf', 'schwanz']) G[teil] = grenzen(alle(teil).map((t) => t.mitte));
  const gruppe = (t) => {
    if (t.teil === 'bein') return `bein${t.mitte.x >= 0 ? 'R' : 'L'}${t.mitte.z >= (G.koerper.min.z + G.koerper.max.z) / 2 ? 'V' : 'H'}`;
    if (t.teil === 'ohr') return `ohr${t.mitte.x >= 0 ? 'R' : 'L'}`;
    return t.teil;
  };
  const gruppenGrenzen = {};
  for (const t of tri) {
    const g = (gruppenGrenzen[gruppe(t)] ??= { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) });
    g.min.min(t.mitte);
    g.max.max(t.mitte);
  }
  const beinHoehe = grenzen(alle('bein').map((t) => t.mitte));
  // Schwanz: Mitte (z) je Höhenstreifen, damit die Kurve nicht verschmiert
  const schwanzZ = new Map();
  for (const t of alle('schwanz')) {
    const k = Math.round(t.mitte.y / 4);
    const e = schwanzZ.get(k) ?? { s: 0, n: 0 };
    e.s += t.mitte.z;
    e.n++;
    schwanzZ.set(k, e);
  }

  // 3. UV je Ecke
  const uv = new Float32Array(pos.count * 2);
  const setze = (i, zone, u, v) => {
    const [zx, zy, zw, zh] = Z[zone];
    uv[i * 2] = (zx + clamp(u) * zw) / gr;
    uv[i * 2 + 1] = (zy + clamp(v) * zh) / gr;
  };
  const p = new THREE.Vector3();
  for (let d = 0; d < n; d++) {
    const t = tri[d];
    const ax = Math.abs(t.n.x), ay = Math.abs(t.n.y), az = Math.abs(t.n.z);
    const achse = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
    const g = gruppenGrenzen[gruppe(t)];
    for (let e = 0; e < 3; e++) {
      const i = d * 3 + e;
      p.fromBufferAttribute(pos, i);
      if (t.teil === 'auge' || t.teil === 'rosa') {
        setze(i, t.teil, 0.5, 0.5);
      } else if (t.teil === 'koerper' || t.teil === 'kopf') {
        const gg = G[t.teil];
        const pre = t.teil === 'koerper' ? '' : 'kopf_';
        const uZ = bruch(p.z, gg.min.z, gg.max.z); // Kopf rechts im Bild
        const vY = 1 - bruch(p.y, gg.min.y, gg.max.y);
        const vorn = t.n.z >= 0;
        if (achse === 'x') setze(i, t.teil === 'koerper' ? 'seite' : 'kopf_seite', uZ, vY);
        else if (achse === 'y') setze(i, t.n.y >= 0 ? (pre ? 'kopf_oben' : 'ruecken') : pre ? 'kopf_unten' : 'bauch', pre ? bruch(p.x, gg.min.x, gg.max.x) : uZ, pre ? uZ : bruch(p.x, gg.min.x, gg.max.x));
        else setze(i, vorn ? (pre ? 'kopf_gesicht' : 'brust') : pre ? 'kopf_hinten' : 'hinterteil', vorn ? bruch(p.x, gg.min.x, gg.max.x) : 1 - bruch(p.x, gg.min.x, gg.max.x), vY);
      } else if (t.teil === 'bein') {
        const v = bruch(beinHoehe.max.y - p.y, 0, beinHoehe.max.y - beinHoehe.min.y);
        setze(i, 'bein', achse === 'x' ? bruch(p.z, g.min.z, g.max.z) : bruch(p.x, g.min.x, g.max.x), v);
      } else if (t.teil === 'schwanz') {
        const sg = G.schwanz;
        const zm = schwanzZ.get(Math.round(p.y / 4));
        const mitteZ = zm ? zm.s / zm.n : p.z;
        const breite = Math.max(sg.max.x - sg.min.x, 3);
        const u = achse === 'x' ? 0.5 + (p.z - mitteZ) / (breite * 1.6) : 0.5 + p.x / (breite * 1.6);
        setze(i, 'schwanz', u, 1 - bruch(p.y, sg.min.y, sg.max.y));
      } else {
        // Ohr (außen)
        setze(i, 'ohr', bruch(p.x, g.min.x, g.max.x), 1 - bruch(p.y, g.min.y, g.max.y));
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geo;
  mesh.material = new THREE.MeshStandardMaterial({ map: textur, roughness: 1, metalness: 0 });
  return true;
}
