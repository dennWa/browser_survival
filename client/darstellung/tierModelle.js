import * as THREE from 'three';

/**
 * Tiere (bisher: Hase) – prozedurale Platzhalter im Comic-Stil: einfache Formen mit gemalten
 * Comic-Texturen (Fell mit Flecken, dicke Kontur-Optik). Später durch echte Modelle/Texturen ersetzbar:
 * nur diese Datei anfassen (erzeugeTier). Front = +z (wie die Figuren), Ursprung = Füße am Boden.
 */
let fellTextur = null;
let ohrTextur = null;
const FELL = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const OHR_INNEN = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const WEISS = new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 1 });
const SCHWARZ = new THREE.MeshBasicMaterial({ color: 0x1a1210 });
const NASE = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.6 });
const GLANZ = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Comic-Fell: warmes Braun, dunklere Flecken mit Kontur, helle Strichelchen. */
function malFell() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c99565';
  x.fillRect(0, 0, 128, 128);
  const zufall = mulberry(7);
  for (let i = 0; i < 14; i++) {
    const px = zufall() * 128;
    const py = zufall() * 128;
    const r = 8 + zufall() * 14;
    x.fillStyle = '#9a6a42';
    x.beginPath();
    x.ellipse(px, py, r, r * 0.7, zufall() * 3, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = '#4a2e1c';
    x.stroke();
  }
  x.strokeStyle = '#e8c9a0';
  x.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const px = zufall() * 128;
    const py = zufall() * 128;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + 6, py + 3);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function malOhr() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffb3c1';
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#d98096';
  x.lineWidth = 4;
  x.strokeRect(2, 2, 60, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neues Tier. @returns { gruppe, aktualisiere(e, jetzt) } */
export function erzeugeTier(art = 'hase') {
  if (art !== 'hase') art = 'hase';
  fellTextur ??= malFell();
  ohrTextur ??= malOhr();
  FELL.map = fellTextur;
  OHR_INNEN.map = ohrTextur;
  const gruppe = new THREE.Group();
  const koerper = new THREE.Group(); // hüpft
  gruppe.add(koerper);
  const teil = (geo, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    koerper.add(m);
    return m;
  };
  const kugel = new THREE.SphereGeometry(1, 14, 10);
  teil(kugel, FELL, 0, 6.5, -1, 5.2, 5.4, 7.4); // Rumpf
  teil(kugel, FELL, 0, 10.2, 6.2, 3.8, 3.6, 3.9); // Kopf
  teil(kugel, WEISS, 0, 8.2, 8.9, 2.2, 1.8, 1.6); // Schnauze
  teil(kugel, NASE, 0, 8.7, 10.3, 0.8, 0.7, 0.6);
  for (const s of [-1, 1]) {
    teil(kugel, SCHWARZ, s * 2.1, 11.2, 8.7, 0.9, 1.1, 0.7); // Augen
    teil(kugel, GLANZ, s * 2.3, 11.6, 9.2, 0.35, 0.4, 0.3);
  }
  teil(kugel, WEISS, 0, 6.8, -7.5, 2.3, 2.3, 2.3); // Puschelschwanz
  const hinterbein = [];
  for (const s of [-1, 1]) hinterbein.push(teil(kugel, FELL, s * 3.8, 3, -3, 1.9, 3, 4.2));
  for (const s of [-1, 1]) teil(kugel, FELL, s * 2.6, 2, 3.4, 1.2, 2, 1.4); // Vorderpfoten
  const ohren = [];
  for (const s of [-1, 1]) {
    const ohr = new THREE.Group();
    ohr.position.set(s * 1.9, 13, 5.2);
    const aussen = new THREE.Mesh(kugel, FELL);
    aussen.scale.set(1.1, 6.2, 1.6);
    aussen.position.y = 5;
    const innen = new THREE.Mesh(kugel, OHR_INNEN);
    innen.scale.set(0.6, 5.2, 0.5);
    innen.position.set(0, 5, 0.9);
    aussen.castShadow = true;
    ohr.add(aussen, innen);
    ohr.rotation.z = -s * 0.18;
    koerper.add(ohr);
    ohren.push({ ohr, s });
  }
  gruppe.scale.setScalar(1.15);

  return {
    gruppe,
    aktualisiere(e, jetzt) {
      const tempo = e.geschwindigkeit ?? 0;
      const huepft = tempo > 8;
      const phase = jetzt / (e.zustand === 'flucht' ? 70 : 120) + e.id;
      const welle = huepft ? Math.max(0, Math.sin(phase)) : 0;
      koerper.position.y = welle * (e.zustand === 'flucht' ? 7 : 3.5);
      koerper.rotation.x = huepft ? -Math.sin(phase) * 0.22 : 0;
      for (const b of hinterbein) b.rotation.x = huepft ? Math.sin(phase) * 0.6 : 0;
      for (const { ohr, s } of ohren) {
        ohr.rotation.z = -s * (huepft ? 0.45 + Math.sin(phase) * 0.2 : 0.18 + Math.sin(jetzt / 700 + e.id * 3 + s) * 0.06);
        ohr.rotation.x = e.zustand === 'flucht' ? -0.5 : 0; // Ohren flach beim Rennen
      }
    },
  };
}
