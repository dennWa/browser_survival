import * as THREE from 'three';

/**
 * Malen & Textur-Effekte der Modell-Werkstatt (Studio Phase 4.10) – Leinwand-Hilfen ohne eigenen Zustand.
 * Jede Mal-/Effekt-Aktion arbeitet auf einer KOPIE der Textur (neue CanvasTexture) → das Undo der Werkstatt tauscht nur die
 * Textur zurück (Stand speichert die Textur-Nr.). glTF-Konvention: flipY = false, uv (0,0) = oben links der Leinwand.
 *   neueLeinwand(material) → { canvas, ctx, textur } (Kopie der bisherigen Textur oder Fläche in der Materialfarbe; Farbe → weiß)
 *   pinsel(ctx, u, v, { farbe, groesse (px), deckkraft, weich })
 *   effekt(ctx, art, { staerke 0..1, farbe, saat })   EFFEKTE: dunkler, dreck, blut, rost, moos, verblassen, rauschen, faerben
 */
export const EFFEKTE = Object.freeze({
  dunkler: 'Dunkler',
  dreck: 'Dreck',
  blut: 'Blut',
  rost: 'Rost',
  moos: 'Moos',
  verblassen: 'Verblassen',
  rauschen: 'Rauschen',
  faerben: 'Einfärben',
});
const MAX = 2048;

function zufall(saat = 1) {
  let z = (saat * 2654435761) >>> 0;
  return () => {
    z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
    return z / 4294967296;
  };
}

export function neueLeinwand(material) {
  const alt = material.map;
  const bild = alt?.image;
  const canvas = document.createElement('canvas');
  if (bild && (bild.width || bild.videoWidth)) {
    const s = Math.min(1, MAX / Math.max(bild.width, bild.height));
    canvas.width = Math.max(4, Math.round(bild.width * s));
    canvas.height = Math.max(4, Math.round(bild.height * s));
  } else canvas.width = canvas.height = 256; // einfarbige Materialien: kleine Leinwand reicht (Low-Poly, kleine Dateien)
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (bild && (bild.width || bild.videoWidth)) {
    // Textur mit flipY = true (selten bei glTF) steht im Bild kopfüber → so zeichnen, wie die UVs sie lesen
    if (alt.flipY) {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.fillStyle = `#${(material.color ?? new THREE.Color(0xffffff)).getHexString()}`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const textur = new THREE.CanvasTexture(canvas);
  textur.flipY = false;
  textur.colorSpace = THREE.SRGBColorSpace;
  textur.wrapS = alt?.wrapS ?? THREE.RepeatWrapping;
  textur.wrapT = alt?.wrapT ?? THREE.RepeatWrapping;
  if (alt?.channel !== undefined) textur.channel = alt.channel;
  if (!bild && material.color) material.color.set(0xffffff); // Farbe steckt jetzt in der Leinwand
  material.map = textur;
  material.needsUpdate = true;
  return { canvas, ctx, textur };
}

export function pinsel(ctx, u, v, { farbe = '#8a0000', groesse = 24, deckkraft = 1, weich = 0.5 } = {}) {
  const b = ctx.canvas.width;
  const h = ctx.canvas.height;
  const x = (((u % 1) + 1) % 1) * b;
  const y = (((v % 1) + 1) % 1) * h;
  const r = Math.max(1, groesse / 2);
  const c = new THREE.Color(farbe);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const g = ctx.createRadialGradient(x, y, r * (1 - weich), x, y, r);
  g.addColorStop(0, `rgba(${rgb},${deckkraft})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Flecken (Blut/Dreck/Rost/Moos): weiche Kleckse, Blut zusätzlich mit Laufspuren */
function flecken(ctx, z, { anzahl, farbe, groesse, deckkraft, laufspuren = false, modus = 'source-over' }) {
  const b = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.globalCompositeOperation = modus;
  for (let i = 0; i < anzahl; i++) {
    const x = z() * b;
    const y = z() * h;
    const r = groesse * (0.4 + z() * 1.2) * (b / 512);
    for (let k = 0; k < 4; k++) pinsel(ctx, (x + (z() - 0.5) * r) / b, (y + (z() - 0.5) * r) / h, { farbe, groesse: r * (0.6 + z()), deckkraft: deckkraft * (0.5 + z() * 0.5), weich: 0.7 });
    if (laufspuren && z() < 0.7) {
      const laenge = r * (1.5 + z() * 4);
      const breite = Math.max(1, r * 0.12);
      ctx.fillStyle = farbe;
      ctx.globalAlpha = deckkraft * 0.8;
      ctx.fillRect(x - breite / 2 + (z() - 0.5) * r * 0.5, y, breite, laenge);
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function effekt(ctx, art, { staerke = 0.5, farbe = '#5a7a3a', saat = 7 } = {}) {
  const st = Math.max(0, Math.min(1, Number(staerke)));
  const b = ctx.canvas.width;
  const h = ctx.canvas.height;
  const z = zufall(saat);
  switch (art) {
    case 'dunkler':
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.round(255 * (1 - st * 0.75))},${Math.round(255 * (1 - st * 0.78))},${Math.round(255 * (1 - st * 0.72))})`;
      ctx.fillRect(0, 0, b, h);
      ctx.globalCompositeOperation = 'source-over';
      return;
    case 'dreck':
      return flecken(ctx, z, { anzahl: Math.round(10 + st * 70), farbe: '#3b2e1f', groesse: 26, deckkraft: 0.25 + st * 0.45, modus: 'multiply' });
    case 'blut':
      return flecken(ctx, z, { anzahl: Math.round(4 + st * 36), farbe: '#5c0606', groesse: 22, deckkraft: 0.45 + st * 0.5, laufspuren: true });
    case 'rost':
      return flecken(ctx, z, { anzahl: Math.round(8 + st * 50), farbe: '#8a4517', groesse: 20, deckkraft: 0.3 + st * 0.5 });
    case 'moos':
      return flecken(ctx, z, { anzahl: Math.round(8 + st * 50), farbe: '#3f5f22', groesse: 24, deckkraft: 0.3 + st * 0.45 });
    case 'verblassen':
    case 'rauschen': {
      const d = ctx.getImageData(0, 0, b, h);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        if (art === 'verblassen') {
          const grau = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
          for (let k = 0; k < 3; k++) p[i + k] = p[i + k] + (grau * 0.85 + 30 - p[i + k]) * st;
        } else {
          const n = (z() - 0.5) * 90 * st;
          for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, p[i + k] + n));
        }
      }
      ctx.putImageData(d, 0, 0);
      return;
    }
    case 'faerben': {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = st;
      ctx.fillStyle = farbe;
      ctx.fillRect(0, 0, b, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    default:
      throw new Error(`Effekt: ${Object.keys(EFFEKTE).join(', ')}`);
  }
}
