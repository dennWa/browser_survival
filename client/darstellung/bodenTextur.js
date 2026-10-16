import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { FARBEN, KACHEL_FARBEN } from './farben.js';

/**
 * Malt den Boden der ganzen Karte in ein Canvas (wird im 3D-Renderer zur Bodentextur):
 * Bodentexturen aus dem Atlas bzw. prozedural (Asphalt, Straße mit Markierungen, Gehwegplatten),
 * Bodendeko (Teppiche, Blut, Parkplatzmarkierungen) und Türschwellen.
 * Wände, Möbel und Bäume sind im 3D-Renderer echte Körper und fehlen hier bewusst.
 */
export class BodenTextur {
  constructor(welt, assets) {
    this.welt = welt;
    this.assets = assets;
    this.g = welt.kachelGroesse;
    this.bodenObjekte = welt.objekte.filter((o) => o.ebene === 'boden');
  }

  /** @param massstab Pixel pro Weltpixel */
  rendere(massstab = 1) {
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
    if (name === 'gehweg') this.#gehwegPlatten(ctx, tx, ty);
    if (name === 'wasser') this.#wasser(ctx, tx, ty);
  }
  /** See: tiefes Blau in der Mitte, helle Uferkante zum Land, ein paar Wellenstriche (die bewegten Wellen liegen in kartenModell). */
  #wasser(ctx, tx, ty) {
    const g = this.g;
    const istWasser = (x, y) => KACHELN[this.welt.kachelAn(x, y)]?.wasser === true;
    let tief = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!istWasser(tx + dx, ty + dy)) tief = false;
    if (tief) {
      ctx.fillStyle = 'rgba(10, 40, 90, 0.35)';
      ctx.fillRect(tx * g, ty * g, g + 0.25, g + 0.25);
    }
    // Ufer: helle Kante, wo Land angrenzt
    ctx.fillStyle = 'rgba(214, 238, 246, 0.55)';
    if (!istWasser(tx, ty - 1)) ctx.fillRect(tx * g, ty * g, g, 3);
    if (!istWasser(tx, ty + 1)) ctx.fillRect(tx * g, ty * g + g - 3, g, 3);
    if (!istWasser(tx - 1, ty)) ctx.fillRect(tx * g, ty * g, 3, g);
    if (!istWasser(tx + 1, ty)) ctx.fillRect(tx * g + g - 3, ty * g, 3, g);
    let h = streuwert(tx, ty);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const x = tx * g + 4 + (h % (g - 14));
      const y = ty * g + 6 + ((h >> 8) % (g - 12));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y);
      ctx.stroke();
    }
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
    // Richtung der Straße: lang in x → waagerecht, lang in y → senkrecht (Kreuzung: beides → keine Linien)
    const waagerecht = istStrasse(tx - 2, ty) && istStrasse(tx + 2, ty);
    const senkrecht = istStrasse(tx, ty - 2) && istStrasse(tx, ty + 2);
    if (waagerecht && senkrecht) return;
    ctx.fillStyle = FARBEN.markierung;
    if (waagerecht || !senkrecht) {
      if (istStrasse(tx, ty - 1) && istStrasse(tx, ty + 1) && tx % 3 !== 0) ctx.fillRect(tx * g, ty * g + g / 2 - 1.5, g, 3);
      if (!istStrasse(tx, ty - 1)) ctx.fillRect(tx * g, ty * g + 2, g, 2);
      if (!istStrasse(tx, ty + 1)) ctx.fillRect(tx * g, ty * g + g - 4, g, 2);
    } else {
      if (istStrasse(tx - 1, ty) && istStrasse(tx + 1, ty) && ty % 3 !== 0) ctx.fillRect(tx * g + g / 2 - 1.5, ty * g, 3, g);
      if (!istStrasse(tx - 1, ty)) ctx.fillRect(tx * g + 2, ty * g, 2, g);
      if (!istStrasse(tx + 1, ty)) ctx.fillRect(tx * g + g - 4, ty * g, 2, g);
    }
  }
  #gehwegPlatten(ctx, tx, ty) {
    const g = this.g;
    const h = streuwert(tx, ty);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + (h % 5) * 0.012})`;
    ctx.fillRect(tx * g, ty * g, g / 2, g / 2);
    ctx.fillRect(tx * g + g / 2, ty * g + g / 2, g / 2, g / 2);
    ctx.fillStyle = 'rgba(40, 42, 46, 0.45)';
    ctx.fillRect(tx * g, ty * g, g, 1);
    ctx.fillRect(tx * g, ty * g + g / 2, g, 1);
    ctx.fillRect(tx * g, ty * g, 1, g);
    ctx.fillRect(tx * g + g / 2, ty * g, 1, g);
  }
  #tuerBoden(tx, ty) {
    const nachbarn = [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]].map(([x, y]) => KACHELN[this.welt.kachelAn(x, y)]);
    return (nachbarn.find((k) => k?.innen) ?? nachbarn.find((k) => k && !k.blockiert && k.name !== 'tuer'))?.name ?? 'beton';
  }
  #istWandig(tx, ty) {
    const name = KACHELN[this.welt.kachelAn(tx, ty)]?.name;
    return name === 'wand' || name === 'fenster';
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
  #zeichneObjekt(ctx, o) {
    const g = this.g;
    if (o.typ === 'markierung') {
      // Fahrbahn-/Parkplatzmarkierung: einfache weiße Linie
      ctx.fillStyle = FARBEN.markierung;
      ctx.fillRect(o.x * g, o.y * g, o.b * g, o.h * g);
      return;
    }
    const b = o.b * g;
    const h = o.h * g;
    const mx = o.x * g + b / 2;
    const my = o.y * g + h / 2;
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
  }}

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
