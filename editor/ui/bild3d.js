import * as THREE from 'three';
import { extrusion, verkleinerteGroesse, MAX_PIXEL } from '../kern/bild3d.js';

/**
 * Three.js-Hülle für Bild → 3D (kern/bild3d.js) und Muster-Texturen (Holz, Stein … für Objekt-/Typ-Texturen).
 */
const geometriePuffer = new Map();

/** data-URL → verkleinerte Pixel { breite, hoehe, rgba } */
export async function ladePixel(dataUrl, max = MAX_PIXEL) {
  const bild = new Image();
  bild.src = dataUrl;
  await bild.decode();
  const { breite, hoehe } = verkleinerteGroesse(bild.naturalWidth, bild.naturalHeight, max);
  const c = document.createElement('canvas');
  c.width = breite;
  c.height = hoehe;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bild, 0, 0, breite, hoehe);
  return { breite, hoehe, rgba: ctx.getImageData(0, 0, breite, hoehe).data };
}

/** Bild verkleinern (für die Speicherung im Entwurf: längste Seite ≤ max) → data-URL (PNG) */
export async function verkleinereBild(dataUrl, max = 64) {
  const { breite, hoehe, rgba } = await ladePixel(dataUrl, max);
  const c = document.createElement('canvas');
  c.width = breite;
  c.height = hoehe;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), breite, hoehe), 0, 0);
  return c.toDataURL('image/png');
}

/** Extrudierte Geometrie (gepuffert je Bild + Maße) */
export async function extrusionsGeometrie(dataUrl, { breite = 1, tiefe = 0.3 } = {}) {
  const schluessel = `${dataUrl.length}|${dataUrl.slice(-40)}|${breite}|${tiefe}`;
  if (geometriePuffer.has(schluessel)) return geometriePuffer.get(schluessel).clone();
  const pixel = await ladePixel(dataUrl);
  const { positionen, normalen, farben } = extrusion(pixel, { breite, tiefe });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positionen, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normalen, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  geometriePuffer.set(schluessel, geo);
  return geo.clone();
}

const musterPuffer = new Map();
/** Graustufen-Muster (wird mit der Materialfarbe eingefärbt): holz, stein, metall, stoff, gras, streifen, punkte */
export function musterTextur(muster) {
  if (musterPuffer.has(muster)) return musterPuffer.get(muster);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  const zufall = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (muster === 'holz') for (let y = 0; y < 64; y += 6) ctx.fillRect(0, y + zufall() * 2, 64, 1.5);
  else if (muster === 'streifen') for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 64);
  else if (muster === 'punkte') for (let y = 4; y < 64; y += 12) for (let x = 4; x < 64; x += 12) ctx.fillRect(x, y, 4, 4);
  else if (muster === 'metall') {
    const v = ctx.createLinearGradient(0, 0, 64, 64);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 64);
  } else if (muster === 'stoff') for (let i = 0; i < 64; i += 3) ctx.fillRect(i, 0, 1, 64), ctx.fillRect(0, i, 64, 1);
  else for (let i = 0; i < (muster === 'gras' ? 500 : 260); i++) ctx.fillRect(zufall() * 64, zufall() * 64, 2, muster === 'gras' ? 4 : 2); // stein, gras
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  musterPuffer.set(muster, t);
  return t;
}
