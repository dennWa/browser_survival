import * as THREE from 'three';
import { SkeletonUtils } from '../vendor/three/addons.js';
import { ladeEigenesModell } from './eigeneModelle.js';
import { ladeKatzenTextur, texturiereKatze } from './katzeTextur.js';

/**
 * Runde 24: Modelle für Haustiere & Hühner (Tier-Entitäten art 'hund' | 'katze' | 'huhn').
 *   Runde 32: Hund + Katze = PS1-Tierpaket (statisch, Textur). Vorher Husky/Shiba (Clips) bzw. cat.glb + katzeTextur.js.
 *   Katze, Huhn: statische Spielordner-Modelle (cat.glb, chicken.glb; Katze optional mit eigener Textur, katzeTextur.js) – Gehen/Picken prozedural (Wippen, Nicken).
 *   Runde 41: Reh/Hirsch/Fuchs (deer/stag/fox.glb) mit Skelett-Clips: Galopp (Flucht), Gehen, Stehen, im Stand ab und zu Fressen.
 * Bis das GLB da ist: kleiner Platzhalter. Front = +z, Ursprung = Füße. Höhen in Weltpixeln (Figur 64 ≈ 1,8 m).
 */
const WILD_CLIPS = { stehen: 'Idle', fressen: 'Eating', gehen: 'Walk', rennen: 'Gallop' };
const MODELLE = {
  // Runde 32: Hund/Katze = „Retro PS1 Animal Pack“ (Goee; r32_tier_*.glb, statisch → Bewegung prozedural wie das Huhn)
  hund: { dateien: ['r32_tier_hund'], hoehe: 24 },
  katze: { dateien: ['r32_tier_katze'], hoehe: 18 }, // Runde 27: vorher 13 (kleiner als Huhn/Hase) → ≈ 50 cm mit Kopf
  huhn: { dateien: ['chicken'], hoehe: 13 },
  // Runde 41: Wild (Quaternius „Animals“, CC0, schon im Spielordner) – echte Clips Idle/Walk/Gallop/Eating; Verhalten wie der Hase
  reh: { dateien: ['deer'], hoehe: 50, clips: WILD_CLIPS },
  hirsch: { dateien: ['stag'], hoehe: 57, clips: WILD_CLIPS },
  fuchs: { dateien: ['fox'], hoehe: 18, clips: WILD_CLIPS },
};
const vorlagen = new Map(); // datei → Promise<{ szene, massstab, versatz, drehung }>

function ladeVorlage(datei, hoehe) {
  if (!vorlagen.has(datei)) {
    vorlagen.set(
      datei,
      ladeEigenesModell(new URL(`../assets/eigene/${datei}.glb`, import.meta.url).href)
        .then(async (szene) => {
          // Runde 30: eigene Katzen-Textur (assets/3d/skins/katze.png + katze_zonen.json), fehlt sie → Katze bleibt wie sie ist
          if (datei === 'cat') {
            const k = await ladeKatzenTextur(new URL('../assets/', import.meta.url));
            if (k) texturiereKatze(szene, k);
          }
          const probe = SkeletonUtils.clone(szene);
          probe.updateMatrixWorld(true);
          let skelett = false;
          probe.traverse((t) => {
            if (t.isSkinnedMesh) {
              skelett = true;
              t.skeleton.update();
            }
          });
          const box = new THREE.Box3().setFromObject(probe, skelett);
          const groesse = box.getSize(new THREE.Vector3());
          const mitte = box.getCenter(new THREE.Vector3());
          // Quaternius-Tiere schauen nach +z; die Länge liegt auf der längeren Bodenachse
          const drehung = groesse.x > groesse.z * 1.2 ? -Math.PI / 2 : 0;
          return { szene, massstab: hoehe / (groesse.y || 1), versatz: new THREE.Vector3(-mitte.x, -box.min.y, -mitte.z), drehung };
        })
        .catch(() => null),
    );
  }
  return vorlagen.get(datei);
}

/** @returns { gruppe, aktualisiere(e, jetzt) } oder null (keine Haustier-Art) */
export function erzeugeHaustier(art, id = 0) {
  const def = MODELLE[art];
  if (!def) return null;
  const gruppe = new THREE.Group();
  const platzhalter = new THREE.Mesh(new THREE.BoxGeometry(def.hoehe * 0.5, def.hoehe * 0.6, def.hoehe), new THREE.MeshStandardMaterial({ color: art === 'huhn' ? 0xf4f0e6 : 0x8a6a4a }));
  platzhalter.position.y = def.hoehe * 0.3;
  gruppe.add(platzhalter);
  const innen = new THREE.Group();
  gruppe.add(innen);
  const tier = { gruppe, aktualisiere: () => {} };
  const datei = def.dateien[Math.abs(id) % def.dateien.length];
  ladeVorlage(datei, def.hoehe).then((v) => {
    if (!v) return;
    const modell = def.clips ? SkeletonUtils.clone(v.szene) : v.szene.clone(true);
    modell.traverse((t) => {
      if (!t.isMesh) return;
      t.castShadow = true;
      t.frustumCulled = false;
    });
    modell.position.copy(v.versatz);
    const huelle = new THREE.Group();
    huelle.add(modell);
    huelle.scale.setScalar(v.massstab);
    huelle.rotation.y = v.drehung;
    innen.add(huelle);
    gruppe.remove(platzhalter);
    let letzte = null;
    if (def.clips) {
      const mixer = new THREE.AnimationMixer(modell);
      const clips = {};
      for (const [name, clip] of Object.entries(def.clips)) {
        const c = v.szene.animations?.find((a) => a.name === clip);
        if (c) clips[name] = mixer.clipAction(c);
      }
      if (clips.angriff) {
        clips.angriff.setLoop(THREE.LoopOnce, 1);
        clips.angriff.clampWhenFinished = true;
      }
      let aktuell = null;
      mixer.setTime(Math.random() * 2);
      tier.aktualisiere = (e, jetzt) => {
        const dt = letzte === null ? 0 : Math.min(0.1, (jetzt - letzte) / 1000);
        letzte = jetzt;
        const tempo = e.geschwindigkeit ?? 0;
        // Runde 41: Wild frisst im Stand (Phasen je Tier versetzt), schaut nach einer Flucht aber erst auf
        const fressZeit = clips.fressen && e.zustand !== 'flucht' && Math.sin(jetzt / 4200 + id * 1.7) > 0.15;
        const name = e.aktion === 'angriff' ? 'angriff' : tempo > 130 ? 'rennen' : tempo > 10 ? 'gehen' : e.zustand === 'bleib' || e.zustand === 'schlaeft' ? 'sitzen' : fressZeit ? 'fressen' : 'stehen';
        const ziel = clips[name] ? name : 'stehen';
        if (ziel !== aktuell && clips[ziel]) {
          clips[ziel].reset().fadeIn(0.15).play();
          if (aktuell) clips[aktuell].fadeOut(0.15);
          aktuell = ziel;
        }
        if (aktuell === 'gehen') clips.gehen.timeScale = Math.max(0.6, Math.min(1.8, tempo / (def.clips === WILD_CLIPS ? 30 : 100)));
        if (aktuell === 'rennen' && def.clips === WILD_CLIPS) clips.rennen.timeScale = Math.max(0.8, Math.min(1.6, tempo / 230));
        mixer.update(dt);
      };
    } else {
      // Statisch: beim Laufen wippen, im Stehen ab und zu picken/nicken, schlafend flach
      tier.aktualisiere = (e, jetzt) => {
        const tempo = e.geschwindigkeit ?? 0;
        const t = jetzt / 1000 + id;
        if (e.zustand === 'schlaeft') {
          innen.position.y = 0;
          innen.scale.set(1.1, 0.6, 1.1);
          innen.rotation.x = 0;
          return;
        }
        innen.scale.set(1, 1, 1);
        innen.position.y = tempo > 8 ? Math.abs(Math.sin(t * 12)) * 1.6 : 0;
        innen.rotation.z = tempo > 8 ? Math.sin(t * 12) * 0.08 : 0;
        innen.rotation.x = tempo <= 8 && art === 'huhn' ? Math.max(0, Math.sin(t * 2.2)) ** 6 * 0.6 : 0;
        if (e.aktion === 'angriff') innen.rotation.x = -Math.abs(Math.sin(t * 9)) * 0.25; // Hund schnappt
        if (art !== 'huhn' && tempo <= 8) innen.scale.y = 1 + Math.sin(t * 1.8) * 0.015; // atmen
      };
    }
  });
  return tier;
}
