import * as THREE from 'three';

/**
 * Kleidung & Frisuren als echte Schichten über der Spielerfigur (Quaternius „Adventurer“, figur_mann/frau.glb).
 *
 * Idee: Eine Kleidungsschicht ist eine KOPIE des Körper-Meshes (gleiches Skelett, gleiche Gewichte), deren Punkte entlang
 * der (geglätteten) Normalen etwas nach außen geschoben sind („Hülle“). Dadurch sitzt sie wie Stoff ein Stück über dem Körper
 * und folgt jeder Animation automatisch. Welche Dreiecke dazugehören, entscheidet ein Filter (Knochen, Höhe, Kopf-Anteil),
 * z. B. Hoodie = Rumpf + Arme ohne Hände, Mütze = Kopfhaut oberhalb der Stirn. Starre Zusatzteile (Kapuze, Kragen,
 * Helmkrempe, Zopf, lange Haare, Visier) werden im selben Mesh-Raum gebaut und zu 100 % an einen Knochen geskinnt.
 *
 * Alle Hüllen-Geometrien werden je Modell + Form einmal gebaut und geteilt (viele Spieler = kaum Mehrkosten beim Bauen).
 * Benutzt von renderer.js → #setzeKleidung (Spiel, Inventar-Vorschau, Charaktererstellung).
 *
 * Formen (gemeinsam/spieler/aussehen.js `form` bzw. gegenstaende.js `form`):
 *   oberkoerper: shirt · pulli · hoodie · jacke · mantel · weste      beine: hose      fuesse: schuh · stiefel
 *   haende: handschuh      kopf: muetze · helm · motorradhelm      haare: standard · kurz · lang · zopf · glatze
 */
const HAND = /^(Wrist|Thumb|Index|Middle|Ring|Pinky)/;
const KOPF_HALS = /^(Head|Neck)/;
const ARM = /(UpperArm|LowerArm)/;
const HAAR_MATERIAL = /hair/i;
const AUGEN_MATERIAL = /^(eyes?|eyebrows|brown)$/i;
const REFERENZ_HOEHE = 1.85; // Figurhöhe in Mesh-Einheiten, auf die sich alle Dicken beziehen

/** Je Stelle: Dicke (m bei 1,85 m Figur) und Dreiecks-Filter auf Punktdaten p = { art, mat, knochen, h, kopf, vorne } */
const HUELLEN = {
  shirt: { dicke: 0.012, filter: (p) => p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen) && !/LowerArm/.test(p.knochen) },
  pulli: { dicke: 0.018, filter: (p) => p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen) },
  hoodie: { dicke: 0.02, filter: (p) => p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen) },
  jacke: { dicke: 0.03, filter: (p) => p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen) },
  mantel: { dicke: 0.033, filter: (p) => (p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen)) || (p.art === 'Legs' && p.h > 0.47) },
  weste: { dicke: 0.038, filter: (p) => p.art === 'Body' && !HAND.test(p.knochen) && !KOPF_HALS.test(p.knochen) && !ARM.test(p.knochen) },
  hose: { dicke: 0.014, filter: (p) => p.art === 'Legs' || (p.art === 'Feet' && p.h > 0.066) },
  schuh: { dicke: 0.018, filter: (p) => p.art === 'Feet' && p.h <= 0.078 },
  stiefel: { dicke: 0.026, filter: (p) => (p.art === 'Feet' || p.art === 'Legs') && p.h <= 0.2 },
  handschuh: { dicke: 0.008, filter: (p) => p.art === 'Body' && HAND.test(p.knochen) },
  // Kopf: kopf = Höhe in der Kopfhaut (0 = Halsansatz, 1 = Scheitel), vorne = −1 (Hinterkopf) … +1 (Gesicht)
  muetze: { dicke: (p) => 0.02 + 0.012 * Math.max(0, p.kopf - 0.85) / 0.15, filter: (p) => p.kopfhaut && p.kopf > schnitt(p.vorne, 0.7, 0.62, 0.5) },
  muetzeBund: { dicke: 0.031, filter: (p) => p.kopfhaut && p.kopf > schnitt(p.vorne, 0.7, 0.62, 0.5) && p.kopf < schnitt(p.vorne, 0.7, 0.62, 0.5) + 0.075 },
  helm: { dicke: 0.034, filter: (p) => p.kopfhaut && p.kopf > schnitt(p.vorne, 0.69, 0.64, 0.58) },
  motorradhelm: { dicke: 0.05, filter: (p) => p.kopfhaut && p.kopf > 0.2 },
  visier: { dicke: 0.056, filter: (p) => p.kopfhaut && p.vorne > 0.3 && p.kopf > 0.5 && p.kopf < 0.8 },
  haarKurz: { dicke: 0.007, filter: (p) => p.kopfhaut && p.kopf > schnitt(p.vorne, 0.82, 0.66, 0.42) },
};

/** Schnitthöhe im Kopf (vorne/Seite/hinten) – weich zwischen den drei Werten */
function schnitt(vorne, v, s, h) {
  return vorne >= 0 ? s + (v - s) * vorne : s + (h - s) * -vorne;
}

/** Hilfsdaten je Modell (einmal je Figurenart): Netze, Maße, Punktdaten. Lagert am Modell (modell.userData.kleidung). */
export function kleidungsVorlage(modell) {
  if (modell.userData.kleidung) return modell.userData.kleidung;
  const netze = [];
  modell.updateMatrixWorld(true);
  modell.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const name = `${o.name} ${o.parent?.name ?? ''}`;
    const art = ['Body', 'Legs', 'Feet', 'Head'].find((a) => name.includes(a)) ?? 'sonst';
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material)?.name ?? '';
    o.geometry.computeBoundingBox();
    netze.push({ index: netze.length, netz: o, art, mat, box: o.geometry.boundingBox });
  });
  const vereine = (liste) => liste.reduce((b, n) => b.union(n.box), new THREE.Box3());
  const fuesse = vereine(netze.filter((n) => n.art === 'Feet'));
  const kopfBox = vereine(netze.filter((n) => n.art === 'Head'));
  const sohle = Number.isFinite(fuesse.min.y) ? fuesse.min.y : vereine(netze).min.y;
  const H = Math.max(0.1, kopfBox.max.y - sohle);
  const haut = netze.find((n) => n.art === 'Head' && /^skin/i.test(n.mat));
  const augen = netze.filter((n) => n.art === 'Head' && AUGEN_MATERIAL.test(n.mat));
  const kb = haut?.box ?? kopfBox;
  const mitte = kb.getCenter(new THREE.Vector3());
  const augenZ = augen.length ? vereine(augen).getCenter(new THREE.Vector3()).z : mitte.z + 1;
  const vorneZ = Math.sign(augenZ - mitte.z) || 1; // Mann-Modell schaut im Mesh-Raum nach −z, Frau nach +z
  const haar = netze.find((n) => n.art === 'Head' && HAAR_MATERIAL.test(n.mat));
  const haarMat = haar && (Array.isArray(haar.netz.material) ? haar.netz.material[0] : haar.netz.material);
  const vorlage = {
    netze,
    haarFarbe: haarMat?.color ? `#${haarMat.color.getHexString()}` : '#5b3a22',
    sohle,
    H,
    s: H / REFERENZ_HOEHE,
    vorneZ,
    kopf: { unten: kb.min.y, oben: kb.max.y, mitte, breite: kb.max.x - kb.min.x, tiefe: kb.max.z - kb.min.z, haut },
    knochen: haut?.netz.skeleton.bones.map((b) => b.name) ?? [],
    punkte: new Map(),
    geometrien: new Map(),
  };
  modell.userData.kleidung = vorlage;
  return vorlage;
}

/** Punktdaten eines Netzes: geglättete Normalen (keine Risse an harten Kanten), Knochen, Höhe, Kopf-Anteile. */
function punkte(vorlage, n) {
  if (vorlage.punkte.has(n.index)) return vorlage.punkte.get(n.index);
  const g = n.netz.geometry;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const bones = n.netz.skeleton.bones;
  const anzahl = pos.count;
  // Normalen aller Punkte an derselben Stelle mitteln
  const summe = new Map();
  const schluessel = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < anzahl; i++) {
    const k = schluessel(i);
    const a = summe.get(k) ?? [0, 0, 0];
    a[0] += nrm.getX(i);
    a[1] += nrm.getY(i);
    a[2] += nrm.getZ(i);
    summe.set(k, a);
  }
  const glatt = new Float32Array(anzahl * 3);
  const info = new Array(anzahl);
  const { kopf, sohle, H, vorneZ } = vorlage;
  const kopfHoehe = Math.max(0.01, kopf.oben - kopf.unten);
  for (let i = 0; i < anzahl; i++) {
    const a = summe.get(schluessel(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    glatt.set([a[0] / l, a[1] / l, a[2] / l], i * 3);
    let beste = 0;
    for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > sw.getComponent(i, beste)) beste = c;
    const knochen = bones[si.getComponent(i, beste)]?.name ?? '';
    const y = pos.getY(i);
    info[i] = {
      art: n.art,
      mat: n.mat,
      knochen,
      kopfhaut: n === kopf.haut,
      h: (y - sohle) / H,
      kopf: (y - kopf.unten) / kopfHoehe,
      vorne: Math.max(-1, Math.min(1, ((pos.getZ(i) - kopf.mitte.z) / (kopf.tiefe / 2)) * vorneZ)),
    };
  }
  const daten = { glatt, info };
  vorlage.punkte.set(n.index, daten);
  return daten;
}

/** Hüllen-Geometrien einer Form: [{ netzIndex, geometrie }] (geteilt, gecacht). */
function huellen(vorlage, form) {
  if (vorlage.geometrien.has(form)) return vorlage.geometrien.get(form);
  const def = HUELLEN[form];
  const liste = [];
  for (const n of def ? vorlage.netze : []) {
    const g = n.netz.geometry;
    if (!g.index) continue;
    const { glatt, info } = punkte(vorlage, n);
    const idx = g.index.array;
    const neu = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (def.filter(info[idx[t]]) && def.filter(info[idx[t + 1]]) && def.filter(info[idx[t + 2]])) neu.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (!neu.length) continue;
    const pos = g.attributes.position;
    const verschoben = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const d = (typeof def.dicke === 'function' ? def.dicke(info[i]) : def.dicke) * vorlage.s;
      verschoben[i * 3] = pos.getX(i) + glatt[i * 3] * d;
      verschoben[i * 3 + 1] = pos.getY(i) + glatt[i * 3 + 1] * d;
      verschoben[i * 3 + 2] = pos.getZ(i) + glatt[i * 3 + 2] * d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verschoben, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(glatt, 3));
    geo.setAttribute('skinIndex', g.attributes.skinIndex);
    geo.setAttribute('skinWeight', g.attributes.skinWeight);
    geo.setIndex(neu);
    geo.computeBoundingSphere();
    liste.push({ netzIndex: n.index, geometrie: geo });
  }
  vorlage.geometrien.set(form, liste);
  return liste;
}

/** Starres Zusatzteil (Mesh-Raum) zu 100 % an einen Knochen geskinnt. teile = [THREE.BufferGeometry …] */
function starr(vorlage, schluessel, knochen, baue) {
  if (vorlage.geometrien.has(schluessel)) return vorlage.geometrien.get(schluessel);
  const nr = Math.max(0, vorlage.knochen.indexOf(knochen));
  const geo = vereine(baue(vorlage));
  const anzahl = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(anzahl * 4).map((_, i) => (i % 4 === 0 ? nr : 0)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(anzahl * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  geo.computeBoundingSphere();
  const liste = [{ netzIndex: vorlage.kopf.haut?.index ?? 0, geometrie: geo }];
  vorlage.geometrien.set(schluessel, liste);
  return liste;
}

/** Einfaches Zusammenfügen nicht-indizierter Geometrien (nur position + normal). */
function vereine(geos) {
  const teile = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const anzahl = teile.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(anzahl * 3);
  const nrm = new Float32Array(anzahl * 3);
  let o = 0;
  for (const g of teile) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return geo;
}

/** Geometrie in den Mesh-Raum legen: Maße/Lage relativ zum Kopf, z zeigt nach vorne (vorneZ). */
function lege(geo, vorlage, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, kippen = 0 }) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(vorlage.kopf.mitte.x + x, y, vorlage.kopf.mitte.z + z * vorlage.vorneZ),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(kippen * vorlage.vorneZ, 0, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.applyMatrix4(m);
}

const ZUSATZ = {
  /** Kapuze (heruntergeklappt) im Nacken + zwei Kordeln vorne */
  kapuze: (v) => {
    const k = v.kopf;
    const hals = k.unten + (k.oben - k.unten) * 0.18;
    const kapuze = lege(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), v, { y: hals, z: -k.tiefe * 0.42, sx: k.breite * 0.62, sy: 0.07 * v.s, sz: k.tiefe * 0.45, kippen: -0.5 });
    const kordel = (x) => lege(new THREE.CylinderGeometry(0.0035 * v.s, 0.0035 * v.s, 0.07 * v.s, 4), v, { x, y: hals - 0.06 * v.s, z: k.tiefe * 0.58 });
    return [kapuze, kordel(-0.022 * v.s), kordel(0.022 * v.s)];
  },
  /** Jackenkragen: Ring um den Hals */
  kragen: (v) => {
    const k = v.kopf;
    const hals = k.unten + (k.oben - k.unten) * 0.14;
    return [lege(new THREE.TorusGeometry(k.breite * 0.5, 0.02 * v.s, 6, 14).rotateX(Math.PI / 2), v, { y: hals, z: -k.tiefe * 0.05, sz: 1.05 })];
  },
  /** Bauhelm-Krempe */
  krempe: (v) => {
    const k = v.kopf;
    const y = k.unten + (k.oben - k.unten) * 0.66;
    return [lege(new THREE.CylinderGeometry(1, 1, 0.012 * v.s, 18), v, { y, z: k.tiefe * 0.06, sx: k.breite * 0.72, sz: k.tiefe * 0.74 })];
  },
  /** Lange Haare: Haarteil am Hinterkopf bis auf die Schultern + zwei Strähnen */
  lang: (v) => {
    const k = v.kopf;
    const h = k.oben - k.unten;
    const ruecken = lege(new THREE.SphereGeometry(1, 14, 10), v, { y: k.unten + h * 0.38, z: -k.tiefe * 0.3, sx: k.breite * 0.56, sy: h * 0.58, sz: k.tiefe * 0.34 });
    const straehne = (x) => lege(new THREE.BoxGeometry(k.breite * 0.13, h * 0.55, k.tiefe * 0.3), v, { x, y: k.unten + h * 0.42, z: -k.tiefe * 0.02 });
    return [ruecken, straehne(-k.breite * 0.5), straehne(k.breite * 0.5)];
  },
  /** Pferdeschwanz: Ansatz am Hinterkopf, fällt in den Nacken */
  zopf: (v) => {
    const k = v.kopf;
    const h = k.oben - k.unten;
    const ansatz = lege(new THREE.SphereGeometry(1, 10, 8), v, { y: k.unten + h * 0.74, z: -k.tiefe * 0.5, sx: k.breite * 0.2, sy: h * 0.13, sz: k.tiefe * 0.16 });
    const schwanz = lege(new THREE.CylinderGeometry(k.breite * 0.13, k.breite * 0.05, h * 0.62, 8), v, { y: k.unten + h * 0.42, z: -k.tiefe * 0.62, kippen: 0.25 });
    return [ansatz, schwanz];
  },
};

/**
 * Figur einkleiden. outfit = { kopf, oberkoerper: [Schichten], haende, beine, fuesse, haare: { form, farbe } } mit je { form, farbe }.
 * material(farbe, art) liefert (geteilte) Materialien. Entfernt vorher die alten Teile. Rückgabe: Anzahl gebauter Teile.
 */
export function kleideFigur(figur, vorlage, outfit, material) {
  for (const t of figur.kleidungTeile ?? []) t.removeFromParent();
  for (const n of figur.versteckteHaare ?? []) n.visible = true;
  figur.kleidungTeile = [];
  figur.versteckteHaare = [];
  const klon = [];
  figur.modell.traverse((o) => o.isSkinnedMesh && klon.push(o));
  const haengeAn = (liste, mat) => {
    for (const { netzIndex, geometrie } of liste) {
      const ziel = klon[netzIndex];
      if (!ziel) continue;
      const mesh = new THREE.SkinnedMesh(geometrie, mat);
      mesh.bind(ziel.skeleton, ziel.bindMatrix);
      mesh.position.copy(ziel.position);
      mesh.quaternion.copy(ziel.quaternion);
      mesh.scale.copy(ziel.scale);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.layers.mask = ziel.layers.mask;
      ziel.parent.add(mesh);
      figur.kleidungTeile.push(mesh);
    }
  };
  const haare = outfit.haare ?? { form: 'standard' };
  const kopfbedeckung = outfit.kopf?.form;
  // Modell-Haar: weg bei Glatze/Kurzhaar und unter Mütze/Helm
  if (haare.form === 'kurz' || haare.form === 'glatze' || kopfbedeckung) {
    for (const n of vorlage.netze) {
      if (n.art !== 'Head' || !HAAR_MATERIAL.test(n.mat) || !klon[n.index]) continue;
      klon[n.index].visible = false;
      figur.versteckteHaare.push(klon[n.index]);
    }
  }
  const haarMat = material(haare.farbe ?? vorlage.haarFarbe, 'haar');
  // Modell-Haar umfärben (Haarfarbe) bzw. zurück zum Original
  for (const n of vorlage.netze) {
    const m = klon[n.index];
    if (n.art !== 'Head' || !HAAR_MATERIAL.test(n.mat) || !m) continue;
    m.userData.haarBasis ??= m.material;
    m.material = haare.farbe ? haarMat : m.userData.haarBasis;
  }
  if (haare.form === 'kurz' && !kopfbedeckung) haengeAn(huellen(vorlage, 'haarKurz'), haarMat);
  if (haare.form === 'lang') haengeAn(starr(vorlage, 'z:lang', 'Head', ZUSATZ.lang), haarMat);
  if (haare.form === 'zopf') haengeAn(starr(vorlage, 'z:zopf', 'Head', ZUSATZ.zopf), haarMat);

  for (const schicht of outfit.oberkoerper ?? []) {
    if (!HUELLEN[schicht.form]) continue;
    const mat = material(schicht.farbe, 'stoff');
    haengeAn(huellen(vorlage, schicht.form), mat);
    if (schicht.form === 'hoodie' || schicht.form === 'mantel') haengeAn(starr(vorlage, 'z:kapuze', 'Chest', ZUSATZ.kapuze), mat);
    if (schicht.form === 'jacke') haengeAn(starr(vorlage, 'z:kragen', 'Chest', ZUSATZ.kragen), mat);
  }
  for (const stelle of ['beine', 'fuesse', 'haende']) {
    const s = outfit[stelle];
    if (s && HUELLEN[s.form]) haengeAn(huellen(vorlage, s.form), material(s.farbe, stelle === 'fuesse' ? 'leder' : 'stoff'));
  }
  if (kopfbedeckung === 'muetze') {
    haengeAn(huellen(vorlage, 'muetze'), material(outfit.kopf.farbe, 'strick'));
    haengeAn(huellen(vorlage, 'muetzeBund'), material(outfit.kopf.farbe, 'strickBund'));
  } else if (kopfbedeckung === 'helm') {
    const mat = material(outfit.kopf.farbe, 'hart');
    haengeAn(huellen(vorlage, 'helm'), mat);
    haengeAn(starr(vorlage, 'z:krempe', 'Head', ZUSATZ.krempe), mat);
  } else if (kopfbedeckung === 'motorradhelm') {
    haengeAn(huellen(vorlage, 'motorradhelm'), material(outfit.kopf.farbe, 'hart'));
    haengeAn(huellen(vorlage, 'visier'), material('#11161c', 'visier'));
  }
  return figur.kleidungTeile.length;
}

/**
 * Was trägt die Figur? Grundkleidung aus dem Aussehen (Charaktererstellung), darüber getragene Items.
 * Westen liegen ÜBER dem Oberteil, alles andere ersetzt die Grundkleidung an seiner Stelle.
 * @param optionen  (merkmal) → Aussehen-Option ({ form, farbe }) – aus gemeinsam/spieler/aussehen.js
 */
export function outfitFuer(aussehenOption, kleidung, itemDefinitionen) {
  const item = (stelle) => {
    const def = itemDefinitionen?.[kleidung?.[stelle]];
    return def ? { form: def.form ?? null, farbe: def.farbe ?? '#777777' } : null;
  };
  const basis = (merkmal) => {
    const o = aussehenOption(merkmal);
    return o?.form ? { form: o.form, farbe: o.farbe } : null;
  };
  const oberItem = item('oberkoerper');
  const oberBasis = basis('oberteil');
  const oberkoerper = oberItem?.form === 'weste' ? [oberBasis, oberItem] : [oberItem ?? oberBasis];
  return {
    haare: { form: aussehenOption('haare')?.form ?? 'standard', farbe: aussehenOption('haarfarbe')?.farbe ?? null },
    oberkoerper: oberkoerper.filter((s) => s?.form),
    beine: item('beine') ?? basis('hose'),
    fuesse: item('fuesse') ?? basis('schuhe'),
    haende: item('haende'),
    kopf: item('kopf'),
  };
}
