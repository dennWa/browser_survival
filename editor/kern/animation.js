/**
 * Einfache Keyframe-Animationen für die Modell-Werkstatt (Editor 2.0, Schritt 5.3) – umgebungsfrei (tests/werkstatt.test.js).
 * Ergebnis ist eine Clip-Beschreibung, die ui/werkstattAnimation.js in THREE.AnimationClip-Spuren übersetzt und die der
 * GLTFExporter als glTF-Animation speichert (nur Position/Drehung/Größe – glTF kennt keine Sichtbarkeits-Spuren).
 *   baueAnimation(art, { knoten, dauer, staerke, achse, basis, startwert })
 *     → { name, dauer, spuren: [{ name: '<knoten>.<position|quaternion|scale>', zeiten: [s], werte: [...] }] }
 *   Die Werte gehen vom aktuellen Stand des Knotens aus (`basis` = { position [3], quaternion [4], scale [3] });
 *   letzter Schlüssel = erster → nahtlose Schleife. Drehungen wirken im eigenen Koordinatensystem des Knotens.
 *   leerlaufName(namen, wunsch) – gültiger Leerlauf-Clip (oder '').
 */
export const ANIMATIONS_ARTEN = Object.freeze({
  drehen: { name: 'Drehen (360°)', staerke: 360, einheit: '°' },
  wippen: { name: 'Wippen (auf/ab)', staerke: 0.1, einheit: 'm' },
  pendeln: { name: 'Pendeln', staerke: 20, einheit: '°' },
  pulsieren: { name: 'Pulsieren (Größe)', staerke: 0.1, einheit: '×' },
  flackern: { name: 'Flackern (zittern)', staerke: 0.15, einheit: '×' },
});
export const ACHSEN = Object.freeze(['x', 'y', 'z']);
const SCHLUESSEL = 16;

const rund = (w) => Math.round(w * 1e6) / 1e6 || 0;

/** Quaternion [x,y,z,w] für eine Drehung um eine Hauptachse */
export function achsenDrehung(achse, winkel) {
  const h = winkel / 2;
  const s = Math.sin(h);
  return [achse === 'x' ? s : 0, achse === 'y' ? s : 0, achse === 'z' ? s : 0, Math.cos(h)];
}

/** a · b (wie THREE.Quaternion.multiplyQuaternions) */
export function quatMal(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}

/** Deterministischer Zufall 0..1 (Flackern soll bei gleichem Startwert gleich aussehen) */
function zufall(startwert) {
  let z = (startwert >>> 0) || 1;
  return () => {
    z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
    return z / 4294967296;
  };
}

export function baueAnimation(art, { knoten, dauer = 2, staerke, achse = 'y', basis, startwert = 7 } = {}) {
  const a = ANIMATIONS_ARTEN[art];
  if (!a) throw new Error(`Unbekannte Animation „${art}“`);
  if (!knoten) throw new Error('Knoten fehlt');
  const d = Math.min(60, Math.max(0.1, Number(dauer) || 2));
  const st = Number.isFinite(Number(staerke)) ? Number(staerke) : a.staerke;
  const ax = ACHSEN.includes(achse) ? achse : 'y';
  const b = { position: basis?.position ?? [0, 0, 0], quaternion: basis?.quaternion ?? [0, 0, 0, 1], scale: basis?.scale ?? [1, 1, 1] };
  const n = art === 'flackern' ? 12 : SCHLUESSEL;
  const zeiten = Array.from({ length: n + 1 }, (_, i) => rund((d * i) / n));
  const welle = (i) => Math.sin((2 * Math.PI * i) / n);
  const werte = [];
  let eigenschaft;
  if (art === 'drehen' || art === 'pendeln') {
    eigenschaft = 'quaternion';
    const grad = (st * Math.PI) / 180;
    for (let i = 0; i <= n; i++) {
      const w = art === 'drehen' ? (grad * i) / n : grad * welle(i);
      werte.push(...quatMal(b.quaternion, achsenDrehung(ax, w)).map(rund));
    }
  } else if (art === 'wippen') {
    eigenschaft = 'position';
    const k = ACHSEN.indexOf(ax);
    for (let i = 0; i <= n; i++) werte.push(...b.position.map((p, j) => rund(j === k ? p + st * welle(i) : p)));
  } else {
    eigenschaft = 'scale';
    const z = zufall(startwert);
    for (let i = 0; i <= n; i++) {
      const f = art === 'pulsieren' ? 1 + st * welle(i) : i === 0 || i === n ? 1 : 1 + st * (z() * 2 - 1);
      werte.push(...b.scale.map((s) => rund(s * f)));
    }
  }
  return { name: `${a.name.split(' ')[0]} ${knoten}`, dauer: d, spuren: [{ name: `${knoten}.${eigenschaft}`, zeiten, werte }] };
}

/** Leerlauf-Clip nur, wenn es ihn gibt */
export const leerlaufName = (namen, wunsch) => (wunsch && namen.includes(wunsch) ? wunsch : '');
