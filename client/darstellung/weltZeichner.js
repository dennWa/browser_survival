import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { FARBEN, KACHEL_FARBEN } from './farben.js';

/**
 * Zeichnet die Karte: Böden (Texturen), Möbel, Wände mit Schattenwurf, Fenster, Türen.
 *
 * Performance: Die Karte wird in Blöcke (Chunks) zu 16×16 Kacheln zerlegt. Jeder Block wird beim
 * ersten Sichtkontakt einmal in ein Offscreen-Canvas gemalt und danach nur noch kopiert.
 * Die Auflösung der Blöcke passt sich Zoom und Bildschirm (HiDPI) an.
 *
 * Objekte mit ebene 'oben' (Baumkronen) werden jeden Frame ÜBER den Figuren gezeichnet.
 */
export const CHUNK_KACHELN = 16;
const MAX_CHUNKS_IM_SPEICHER = 24;
const WAND_SCHATTEN = { x: 6, y: 8 };
const MOEBEL_SCHATTEN = { x: 3, y: 4 };
const BAUM_SCHATTEN = { x: 12, y: 16 };
const SCHATTEN_DECKKRAFT = 0.32;
const KANTE = 3; // helle Wandkante in Weltpixeln

const UNTERSTUETZT_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export class WeltZeichner {
  constructor(welt, assets) {
    this.welt = welt;
    this.assets = assets;
    this.g = welt.kachelGroesse;
    this.chunks = new Map(); // "cx,cy" → { canvas, benutzt }
    this.aufloesung = 0;
    this.bodenObjekte = welt.objekte.filter((o) => o.ebene === 'boden');
    this.moebel = welt.objekte.filter((o) => o.ebene === 'moebel');
    this.obenObjekte = welt.objekte.filter((o) => o.ebene === 'oben');
  }

  /** Zeichnet alle sichtbaren Blöcke. Kamera-Transformation muss gesetzt sein. */
  zeichne(ctx, sicht, aufloesung) {
    if (aufloesung !== this.aufloesung) {
      this.chunks.clear();
      this.aufloesung = aufloesung;
    }
    const groesse = CHUNK_KACHELN * this.g;
    const cx0 = Math.max(0, Math.floor(sicht.links / groesse));
    const cy0 = Math.max(0, Math.floor(sicht.oben / groesse));
    const cx1 = Math.min(Math.ceil(this.welt.breite / CHUNK_KACHELN) - 1, Math.floor(sicht.rechts / groesse));
    const cy1 = Math.min(Math.ceil(this.welt.hoehe / CHUNK_KACHELN) - 1, Math.floor(sicht.unten / groesse));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        ctx.drawImage(this.#chunk(cx, cy), cx * groesse, cy * groesse, groesse, groesse);
      }
    }
    this.#aufraeumen();
  }

  /** Baumkronen & Co. über den Figuren. Steht der Spieler darunter, wird die Krone durchsichtig. */
  zeichneObereEbene(ctx, sicht, fokus) {
    const g = this.g;
    for (const o of this.obenObjekte) {
      const x = o.x * g;
      const y = o.y * g;
      const b = o.b * g;
      const h = o.h * g;
      if (x > sicht.rechts || y > sicht.unten || x + b < sicht.links || y + h < sicht.oben) continue;
      const darunter = fokus && fokus.x > x && fokus.x < x + b && fokus.y > y && fokus.y < y + h;
      ctx.globalAlpha = darunter ? 0.45 : 1;
      this.#zeichneObjekt(ctx, o);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Nur Böden, Bodendeko (Teppiche, Blut, Markierungen) und Türschwellen der GANZEN Karte in ein Canvas –
   * ohne Wände und Möbel. Für den 3D-Prototyp (dort sind Wände/Möbel echte 3D-Körper).
   */
  rendereBoden(massstab = 1) {
    const canvas = neuesCanvas(this.welt.pixelBreite * massstab, this.welt.pixelHoehe * massstab);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(massstab, 0, 0, massstab, 0, 0);
    for (let ty = 0; ty < this.welt.hoehe; ty++) for (let tx = 0; tx < this.welt.breite; tx++) this.#zeichneBoden(ctx, tx, ty);
    for (const o of this.bodenObjekte) this.#zeichneObjekt(ctx, o);
    for (let ty = 0; ty < this.welt.hoehe; ty++) {
      for (let tx = 0; tx < this.welt.breite; tx++) {
        if (KACHELN[this.welt.kachelAn(tx, ty)]?.name === 'tuer') this.#zeichneTuerschwelle(ctx, tx, ty);
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------

  #chunk(cx, cy) {
    const schluessel = `${cx},${cy}`;
    let eintrag = this.chunks.get(schluessel);
    if (!eintrag) {
      eintrag = { canvas: this.#rendereChunk(cx, cy), benutzt: 0 };
      this.chunks.set(schluessel, eintrag);
    }
    eintrag.benutzt = performance.now();
    return eintrag.canvas;
  }

  #aufraeumen() {
    if (this.chunks.size <= MAX_CHUNKS_IM_SPEICHER) return;
    const aeltester = [...this.chunks.entries()].sort((a, b) => a[1].benutzt - b[1].benutzt)[0];
    this.chunks.delete(aeltester[0]);
  }

  #rendereChunk(cx, cy) {
    const g = this.g;
    const r = this.aufloesung;
    const groesse = CHUNK_KACHELN * g;
    const canvas = neuesCanvas(groesse * r, groesse * r);
    const ctx = canvas.getContext('2d');
    const x0 = cx * groesse;
    const y0 = cy * groesse;
    ctx.setTransform(r, 0, 0, r, -x0 * r, -y0 * r);
    ctx.imageSmoothingQuality = 'high';

    const tx0 = cx * CHUNK_KACHELN;
    const ty0 = cy * CHUNK_KACHELN;
    const tx1 = Math.min(this.welt.breite, tx0 + CHUNK_KACHELN);
    const ty1 = Math.min(this.welt.hoehe, ty0 + CHUNK_KACHELN);
    const bereich = { links: x0, oben: y0, rechts: x0 + groesse, unten: y0 + groesse };

    // 1. Böden
    for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) this.#zeichneBoden(ctx, tx, ty);
    // 2. Bodendeko (Teppiche, Blut)
    for (const o of this.bodenObjekte) if (ueberlappt(o, g, bereich)) this.#zeichneObjekt(ctx, o);
    // 3. Schatten von Wänden, Möbeln und Bäumen
    this.#zeichneSchatten(ctx, canvas.width, canvas.height, r, x0, y0, tx0 - 1, ty0 - 1, tx1 + 1, ty1 + 1, bereich);
    // 4. Möbel
    for (const o of this.moebel) if (ueberlappt(o, g, bereich)) this.#zeichneObjekt(ctx, o);
    // 5. Wände, Fenster, Türschwellen
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
        if (name === 'wand' || name === 'fenster') this.#zeichneWand(ctx, tx, ty, name === 'fenster');
        else if (name === 'tuer') this.#zeichneTuerschwelle(ctx, tx, ty);
      }
    }
    return canvas;
  }

  #zeichneBoden(ctx, tx, ty) {
    const g = this.g;
    let name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    if (name === 'tuer') name = this.#tuerBoden(tx, ty);
    if (name === 'wand' || name === 'fenster') return; // wird komplett übermalt

    const x = tx * g;
    const y = ty * g;
    const varianten = this.assets?.boden(name);
    const bild = this.assets?.umgebungBild;
    if (varianten && bild) {
      const h = streuwert(tx, ty);
      const v = varianten[h % varianten.length];
      if (name === 'gras') {
        // Gras zusätzlich drehen → kein sichtbares Kachelmuster
        ctx.save();
        ctx.translate(x + g / 2, y + g / 2);
        ctx.rotate(((h >> 4) % 4) * (Math.PI / 2));
        ctx.drawImage(bild, v.x, v.y, v.b, v.h, -g / 2 - 0.25, -g / 2 - 0.25, g + 0.5, g + 0.5);
        ctx.restore();
      } else {
        ctx.drawImage(bild, v.x, v.y, v.b, v.h, x, y, g + 0.25, g + 0.25);
      }
      return;
    }

    // Prozedurale Böden (Asphalt, Straße) bzw. Ersatzfarben ohne Assets
    ctx.fillStyle = KACHEL_FARBEN[name] ?? '#ff00ff';
    ctx.fillRect(x, y, g + 0.25, g + 0.25);
    if (name === 'asphalt' || name === 'strasse') this.#asphaltKoernung(ctx, tx, ty);
    if (name === 'strasse') this.#strassenMarkierung(ctx, tx, ty);
  }

  #asphaltKoernung(ctx, tx, ty) {
    const g = this.g;
    let h = streuwert(tx, ty);
    for (let i = 0; i < 7; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      ctx.fillStyle = h & 1 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(tx * g + (h % g), ty * g + ((h >> 8) % g), 2 + ((h >> 16) % 3), 2);
    }
  }

  #strassenMarkierung(ctx, tx, ty) {
    const g = this.g;
    const istStrasse = (x, y) => KACHELN[this.welt.kachelAn(x, y)]?.name === 'strasse';
    ctx.fillStyle = FARBEN.markierung;
    if (istStrasse(tx, ty - 1) && istStrasse(tx, ty + 1) && tx % 3 !== 0) ctx.fillRect(tx * g, ty * g + g / 2 - 1.5, g, 3);
    if (!istStrasse(tx, ty - 1)) ctx.fillRect(tx * g, ty * g + 2, g, 2);
    if (!istStrasse(tx, ty + 1)) ctx.fillRect(tx * g, ty * g + g - 4, g, 2);
  }

  /** Eine Tür übernimmt den Boden des angrenzenden Innenraums. */
  #tuerBoden(tx, ty) {
    const nachbarn = [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]].map(([x, y]) => KACHELN[this.welt.kachelAn(x, y)]);
    return (nachbarn.find((k) => k?.innen) ?? nachbarn.find((k) => k && !k.blockiert && k.name !== 'tuer'))?.name ?? 'beton';
  }

  #istWandig(tx, ty) {
    const name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    return name === 'wand' || name === 'fenster';
  }

  #zeichneWand(ctx, tx, ty, istFenster) {
    const g = this.g;
    const x = tx * g;
    const y = ty * g;
    ctx.fillStyle = FARBEN.wand;
    ctx.fillRect(x, y, g, g);

    // Helle Kante zu allen Seiten, an die keine Wand grenzt → Mauer wirkt erhaben
    ctx.fillStyle = FARBEN.wandKante;
    if (!this.#istWandig(tx, ty - 1)) ctx.fillRect(x, y, g, KANTE);
    if (!this.#istWandig(tx, ty + 1)) ctx.fillRect(x, y + g - KANTE, g, KANTE);
    if (!this.#istWandig(tx - 1, ty)) ctx.fillRect(x, y, KANTE, g);
    if (!this.#istWandig(tx + 1, ty)) ctx.fillRect(x + g - KANTE, y, KANTE, g);

    if (istFenster) {
      const waagerecht = this.#istWandig(tx - 1, ty) || this.#istWandig(tx + 1, ty);
      ctx.fillStyle = FARBEN.glas;
      if (waagerecht) {
        ctx.fillRect(x, y + g * 0.32, g, g * 0.36);
        ctx.fillStyle = FARBEN.glasGlanz;
        ctx.fillRect(x + 3, y + g * 0.38, g - 6, 2);
      } else {
        ctx.fillRect(x + g * 0.32, y, g * 0.36, g);
        ctx.fillStyle = FARBEN.glasGlanz;
        ctx.fillRect(x + g * 0.38, y + 3, 2, g - 6);
      }
    }
  }

  #zeichneTuerschwelle(ctx, tx, ty) {
    const g = this.g;
    const waagerecht = this.#istWandig(tx - 1, ty) || this.#istWandig(tx + 1, ty) || this.welt.kachelAn(tx - 1, ty) === 'T' || this.welt.kachelAn(tx + 1, ty) === 'T';
    ctx.fillStyle = FARBEN.tuerschwelle;
    if (waagerecht) ctx.fillRect(tx * g, ty * g + g * 0.4, g, g * 0.2);
    else ctx.fillRect(tx * g + g * 0.4, ty * g, g * 0.2, g);
    // Türpfosten neben Wänden
    ctx.fillStyle = FARBEN.wandKante;
    if (waagerecht) {
      if (this.#istWandig(tx - 1, ty)) ctx.fillRect(tx * g, ty * g + g * 0.3, 4, g * 0.4);
      if (this.#istWandig(tx + 1, ty)) ctx.fillRect(tx * g + g - 4, ty * g + g * 0.3, 4, g * 0.4);
    } else {
      if (this.#istWandig(tx, ty - 1)) ctx.fillRect(tx * g + g * 0.3, ty * g, g * 0.4, 4);
      if (this.#istWandig(tx, ty + 1)) ctx.fillRect(tx * g + g * 0.3, ty * g + g - 4, g * 0.4, 4);
    }
  }

  #zeichneSchatten(ctx, breite, hoehe, r, x0, y0, tx0, ty0, tx1, ty1, bereich) {
    const g = this.g;
    const schatten = neuesCanvas(breite, hoehe);
    const s = schatten.getContext('2d');
    s.setTransform(r, 0, 0, r, -x0 * r, -y0 * r);
    s.fillStyle = '#000';
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        if (this.#istWandig(tx, ty)) s.fillRect(tx * g + WAND_SCHATTEN.x, ty * g + WAND_SCHATTEN.y, g, g);
      }
    }
    const erweitert = { links: bereich.links - 40, oben: bereich.oben - 40, rechts: bereich.rechts, unten: bereich.unten };
    for (const o of this.moebel) {
      if (ueberlappt(o, g, erweitert)) this.#zeichneObjekt(s, o, MOEBEL_SCHATTEN);
    }
    for (const o of this.obenObjekte) {
      if (ueberlappt(o, g, erweitert)) this.#zeichneObjekt(s, o, BAUM_SCHATTEN);
    }
    // Alles Gezeichnete schwarz einfärben (Silhouetten)
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillRect(0, 0, breite, hoehe);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = SCHATTEN_DECKKRAFT;
    if (UNTERSTUETZT_FILTER) ctx.filter = `blur(${Math.round(3 * r)}px)`;
    ctx.drawImage(schatten, 0, 0);
    ctx.restore();
  }

  #zeichneObjekt(ctx, o, versatz = null) {
    const g = this.g;
    if (o.typ === 'markierung') {
      // Fahrbahn-/Parkplatzmarkierung: einfache weiße Linie
      ctx.fillStyle = FARBEN.markierung;
      ctx.fillRect(o.x * g, o.y * g, o.b * g, o.h * g);
      return;
    }
    const b = o.b * g;
    const h = o.h * g;
    const mx = o.x * g + b / 2 + (versatz?.x ?? 0);
    const my = o.y * g + h / 2 + (versatz?.y ?? 0);
    const rahmen = this.assets?.objekt(o.typ);
    const bild = this.assets?.umgebungBild;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(((o.drehung ?? 0) * Math.PI) / 180);
    const quer = (o.drehung ?? 0) % 180 !== 0;
    const zb = quer ? h : b;
    const zh = quer ? b : h;
    if (rahmen && bild) {
      ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, -zb / 2, -zh / 2, zb, zh);
    } else {
      ctx.fillStyle = FARBEN.moebelErsatz;
      ctx.fillRect(-zb / 2 + 2, -zh / 2 + 2, zb - 4, zh - 4);
    }
    ctx.restore();
  }
}

function ueberlappt(o, g, bereich) {
  return o.x * g < bereich.rechts && (o.x + o.b) * g > bereich.links && o.y * g < bereich.unten && (o.y + o.h) * g > bereich.oben;
}

/** Deterministische Pseudo-Zufallszahl pro Kachel (gleiche Kachel → gleiche Variante). */
function streuwert(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function neuesCanvas(breite, hoehe) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(breite));
  canvas.height = Math.max(1, Math.round(hoehe));
  return canvas;
}
