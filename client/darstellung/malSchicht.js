import { hatInhalt } from '../../gemeinsam/welt/bodenMalerei.js';

/**
 * Runde 41: Boden-Malschicht (gemeinsam/welt/bodenMalerei.js) in eine Boden-Leinwand einblenden – vom Spiel
 * (bodenTextur.js, je Boden-Block) und von der Studio-Schnellansicht (studio/ansicht/viewport.js, je Sektor) benutzt.
 * Je Schicht: Hilfs-Leinwand mit der Bodentextur füllen (`fuelle`), mit der weich vergrößerten Maske ausstanzen
 * (destination-in, bilineare Glättung → runde, weiche Ränder), dann auf den Boden legen.
 *
 * @param ctx      Ziel-Kontext; die Leinwand zeigt die Kacheln bereich.x0..x1 × y0..y1 (x1/y1 exklusiv), `px` Bildpunkte je Kachel
 * @param masken   Map name → Uint8Array (bodenMalerei.entpacke)
 * @param fuelle   (hilfsCtx, name) → malt die ganze Hilfs-Leinwand (gleiche Größe/Lage wie ctx.canvas) mit dem Boden `name`
 */
export function maleSchichten(ctx, masken, { breite, hoehe, aufloesung }, bereich, px, fuelle) {
  if (!masken?.size) return;
  const { x0, y0, x1, y1 } = bereich;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Maske mit 1 Kachel Rand (weicher Übergang über die Blockgrenze hinweg)
  const ra = Math.max(0, x0 - 1);
  const rb = Math.min(breite, x1 + 1);
  const oa = Math.max(0, y0 - 1);
  const ob = Math.min(hoehe, y1 + 1);
  const mb = breite * aufloesung;
  for (const [name, maske] of masken) {
    if (!hatInhalt(maske, breite, aufloesung, ra, oa, rb, ob)) continue;
    const mw = (rb - ra) * aufloesung;
    const mh = (ob - oa) * aufloesung;
    const mc = neuesCanvas(mw, mh);
    const mctx = mc.getContext('2d');
    const bild = mctx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) {
      const quelle = (oa * aufloesung + y) * mb + ra * aufloesung;
      for (let x = 0; x < mw; x++) {
        const i = (y * mw + x) * 4;
        bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = 255;
        bild.data[i + 3] = maske[quelle + x];
      }
    }
    mctx.putImageData(bild, 0, 0);
    const hilf = neuesCanvas(W, H);
    const hctx = hilf.getContext('2d');
    fuelle(hctx, name);
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.globalCompositeOperation = 'destination-in';
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(mc, (ra - x0) * px, (oa - y0) * px, (rb - ra) * px, (ob - oa) * px);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(hilf, 0, 0);
    ctx.restore();
  }
}

function neuesCanvas(b, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, Math.ceil(b)), Math.max(1, Math.ceil(h)));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(b));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
