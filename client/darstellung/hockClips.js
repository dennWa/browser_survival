import * as THREE from 'three';

/**
 * Runde 47: Hock-Clips „ducken“ (aus „stehen“) und „schleichen“ (aus „gehen“) – zur Ladezeit gebacken, kein Blender nötig.
 * Gilt für ALLE Spielerfiguren: Mann/Frau bekommen sie in renderer.#ladeSurvivor, Zusatzfiguren (aussehen.figur) nutzen die Clips
 * der Mann-Figur (gleiche Knochennamen).
 *
 * Je Abtastzeitpunkt des Quell-Clips: Pose setzen → Körper (`Body`, Eltern von Becken UND Oberschenkeln) um `tiefe` × Beinlänge
 * absenken → Oberkörper (`Hips`) um `vorlage` nach vorn neigen, Kopf etwas zurück (Blick bleibt nach vorn) → je Bein Zwei-Knochen-IK:
 * Oberschenkel/Unterschenkel so drehen, dass der Knöchel wieder genau am Fuß-Knochen sitzt (⚠ `Foot*` sind IK-Ziele am `Root`,
 * keine Kinder des Unterschenkels – die Füße bleiben also stehen, wo der Clip sie hinsetzt), Knie zeigt nach vorn (+z = Figur vorn).
 * Die Spuren von Body/Hips/Kopf/Beinen werden durch die gebackenen ersetzt, alles andere (Arme, Füße …) bleibt aus dem Quell-Clip.
 * Das Modell wird danach exakt zurückgesetzt (die Vorlage wird später geklont).
 * ⚠ Bewusst OHNE AnimationMixer abgetastet (setzePose: Interpolanten direkt, jede Pose ab der Ruhepose): der PropertyMixer schreibt
 *   konstante Spuren nur einmal – die eigenen Änderungen würden sich sonst von Abtastung zu Abtastung aufaddieren (Figur stand Kopf).
 */
const _v = new THREE.Vector3();
const SEITE = new THREE.Vector3(1, 0, 0);
const OBEN = new THREE.Vector3(0, 1, 0);
const VORN = new THREE.Vector3(0, 0, 1);

/** Standardwerte (Anteil der Beinlänge, Radiant). */
export const HOCKE = Object.freeze({
  ducken: { tiefe: 0.34, vorlage: 0.42, kopf: -0.3 },
  schleichen: { tiefe: 0.3, vorlage: 0.5, kopf: -0.34 },
});

const welt = (o, ziel = new THREE.Vector3()) => o.getWorldPosition(ziel);

/** Knochen in Weltkoordinaten um eine Weltachse drehen (absolut aus der aktuellen Pose, kein Aufaddieren über Bilder). */
function dreheWelt(knochen, achse, winkel) {
  const eltern = knochen.parent.getWorldQuaternion(new THREE.Quaternion());
  const weltQ = knochen.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(achse, winkel));
  knochen.quaternion.copy(eltern.invert().multiply(weltQ));
  knochen.updateMatrixWorld(true);
}

/** Knochen so drehen, dass die Weltrichtung `jetzt` zu `ziel` wird (kleinste Drehung). */
function richteAus(knochen, jetzt, ziel) {
  if (jetzt.lengthSq() < 1e-12 || ziel.lengthSq() < 1e-12) return;
  const r = new THREE.Quaternion().setFromUnitVectors(jetzt.clone().normalize(), ziel.clone().normalize());
  const eltern = knochen.parent.getWorldQuaternion(new THREE.Quaternion());
  const weltQ = knochen.getWorldQuaternion(new THREE.Quaternion()).premultiply(r);
  knochen.quaternion.copy(eltern.invert().multiply(weltQ));
  knochen.updateMatrixWorld(true);
}

/** Zwei-Knochen-IK: Hüfte fest, Knöchel an `ziel`, Knie in Richtung `vorn`. */
export function loeseBein(bein, ziel, vorn = VORN) {
  const huefte = welt(bein.ober);
  const { L1, L2 } = bein;
  const d = Math.min(L1 + L2 - 1e-6, Math.max(Math.abs(L1 - L2) + 1e-6, huefte.distanceTo(ziel)));
  const u = ziel.clone().sub(huefte).normalize();
  const v = vorn.clone().sub(u.clone().multiplyScalar(vorn.dot(u)));
  if (v.lengthSq() < 1e-10) v.copy(OBEN);
  v.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const knieNeu = huefte.clone().addScaledVector(u, a).addScaledVector(v, h);
  richteAus(bein.ober, welt(bein.unter).sub(huefte), knieNeu.clone().sub(huefte));
  const knie = welt(bein.unter);
  richteAus(bein.unter, bein.unter.localToWorld(bein.schien.clone()).sub(knie), ziel.clone().sub(knie));
}

/** Pose eines Clips zur Zeit t setzen: erst alles auf die Ruhepose, dann jede Spur per Interpolant (kein Mixer, s. Kopf). */
function setzePose(modell, clip, t, ruhe, knotenCache) {
  for (const [o, p, q, s] of ruhe) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  for (const spur of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(spur.name);
    if (!knotenCache.has(nodeName)) knotenCache.set(nodeName, modell.getObjectByName(nodeName) ?? null);
    const ziel = knotenCache.get(nodeName);
    if (!ziel || !['position', 'quaternion', 'scale'].includes(propertyName)) continue;
    ziel[propertyName].fromArray(spur.createInterpolant().evaluate(t));
  }
  modell.updateMatrixWorld(true);
}

/** Beine der Figur + Längen aus einer Referenzpose (Knöchel = Fuß-Knochen). null, wenn das Skelett nicht passt. */
function beineVon(modell) {
  const beine = ['L', 'R'].map((s) => ({ ober: modell.getObjectByName(`UpperLeg${s}`), unter: modell.getObjectByName(`LowerLeg${s}`), fuss: modell.getObjectByName(`Foot${s}`) }));
  return beine.every((b) => b.ober && b.unter && b.fuss) ? beine : null;
}

/**
 * @param modell   Figur-Vorlage (gltf.scene) – wird nur vorübergehend bewegt
 * @param quelle   AnimationClip (stehen bzw. gehen)
 * @param referenz AnimationClip für die Beinlängen (aufrechter Steh-Clip)
 * @returns AnimationClip `name` oder null (Skelett ohne Body/Hips/Beine)
 */
export function backeHockClip(modell, quelle, referenz, { name, tiefe, vorlage, kopf, fps = 30 }) {
  const body = modell.getObjectByName('Body');
  const hips = modell.getObjectByName('Hips');
  const kopfKnochen = modell.getObjectByName('Head') ?? modell.getObjectByName('Neck');
  const beine = beineVon(modell);
  if (!body?.parent || !hips || !beine || !quelle || !referenz) return null;
  const gemerkt = [];
  modell.traverse((o) => gemerkt.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const cache = new Map();
  try {
    // Beinlängen + Knöchel im Unterschenkel-Raum aus der Steh-Pose
    setzePose(modell, referenz, 0, gemerkt, cache);
    for (const b of beine) {
      const huefte = welt(b.ober);
      const knie = welt(b.unter);
      const knoechel = welt(b.fuss);
      b.L1 = huefte.distanceTo(knie);
      b.L2 = knie.distanceTo(knoechel);
      b.schien = b.unter.worldToLocal(knoechel.clone());
    }
    const senken = (beine[0].L1 + beine[0].L2) * tiefe;
    const n = Math.max(2, Math.round(quelle.duration * fps) + 1);
    const zeiten = [];
    const werte = { body: [], hips: [], kopf: [], ober: [[], []], unter: [[], []] };
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * quelle.duration;
      setzePose(modell, quelle, t, gemerkt, cache);
      const ziele = beine.map((b) => welt(b.fuss));
      body.position.copy(body.parent.worldToLocal(welt(body, _v).addScaledVector(OBEN, -senken)));
      body.updateMatrixWorld(true);
      dreheWelt(hips, SEITE, vorlage);
      if (kopfKnochen) dreheWelt(kopfKnochen, SEITE, kopf);
      beine.forEach((b, k) => loeseBein(b, ziele[k]));
      zeiten.push(t);
      werte.body.push(...body.position.toArray());
      werte.hips.push(...hips.quaternion.toArray());
      if (kopfKnochen) werte.kopf.push(...kopfKnochen.quaternion.toArray());
      beine.forEach((b, k) => {
        werte.ober[k].push(...b.ober.quaternion.toArray());
        werte.unter[k].push(...b.unter.quaternion.toArray());
      });
    }
    const neu = [
      new THREE.VectorKeyframeTrack(`${body.name}.position`, zeiten, werte.body),
      new THREE.QuaternionKeyframeTrack(`${hips.name}.quaternion`, zeiten, werte.hips),
      ...(kopfKnochen ? [new THREE.QuaternionKeyframeTrack(`${kopfKnochen.name}.quaternion`, zeiten, werte.kopf)] : []),
      ...beine.flatMap((b, k) => [new THREE.QuaternionKeyframeTrack(`${b.ober.name}.quaternion`, zeiten, werte.ober[k]), new THREE.QuaternionKeyframeTrack(`${b.unter.name}.quaternion`, zeiten, werte.unter[k])]),
    ];
    const ersetzt = new Set(neu.map((s) => s.name));
    const spuren = [...quelle.tracks.filter((s) => !ersetzt.has(s.name)).map((s) => s.clone()), ...neu];
    return new THREE.AnimationClip(name, quelle.duration, spuren);
  } finally {
    for (const [o, p, q, s] of gemerkt) {
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }
    modell.updateMatrixWorld(true);
  }
}

/** Beide Hock-Clips an eine Clip-Sammlung { name: clip } hängen (fehlende Quellen → nichts). */
export function ergaenzeHockClips(modell, clips) {
  if (!clips?.stehen) return clips;
  const ducken = backeHockClip(modell, clips.stehen, clips.stehen, { name: 'ducken', ...HOCKE.ducken });
  if (ducken) clips.ducken = ducken;
  const schleichen = clips.gehen && backeHockClip(modell, clips.gehen, clips.stehen, { name: 'schleichen', ...HOCKE.schleichen });
  if (schleichen) clips.schleichen = schleichen;
  return clips;
}
