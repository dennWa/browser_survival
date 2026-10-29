import * as THREE from 'three';

/**
 * Runde 23: echte Oberflächen für Wände & Dächer (CC0-Texturen von ambientCG, verkleinert unter assets/eigene/texturen/).
 * Wände sind instanzierte Boxen ohne passende UVs → Welt-Raum-Projektion im Shader (je Fläche die passende Achse:
 * Seiten x/y bzw. z/y, Deckel x/z), Kachelgröße `kachel` Weltpixel. Optional Normalmap (nur ihr z-Anteil dunkelt Fugen ab).
 * `wendeWandTexturAn(material, art)` hängt sich an onBeforeCompile (geht nicht per clone() mit → wandDurchsicht wendet sie neu an,
 * Art steht in material.userData.wandTextur). Arten: TEXTUREN unten.
 */
const BASIS = new URL('../assets/eigene/texturen/', import.meta.url);
export const TEXTUREN = {
  ziegel: { farbe: 'ziegelwand.jpg', normal: 'ziegelwand_normal.jpg', kachel: 72, staerke: 0.9 },
  holz: { farbe: 'holzwand.jpg', kachel: 64, staerke: 0.7 },
  putz: { farbe: 'putz.jpg', kachel: 96, staerke: 1 },
};
const lader = new THREE.TextureLoader();
const cache = new Map();

function textur(datei, srgb) {
  if (!cache.has(datei)) {
    const t = lader.load(new URL(datei, BASIS).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(datei, t);
  }
  return cache.get(datei);
}

/** Geladene Textur (für Dächer mit echten UVs) – gleiche Instanz wie im Shader-Cache. */
export function ladeTextur(datei, srgb = true) {
  return textur(datei, srgb);
}

export function wendeWandTexturAn(material, art) {
  const def = TEXTUREN[art];
  if (!def) return material;
  material.userData.wandTextur = art;
  const farbe = textur(def.farbe, true);
  const normal = def.normal ? textur(def.normal, false) : null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWandFarbe = { value: farbe };
    shader.uniforms.uWandNormal = { value: normal };
    shader.uniforms.uWandKachel = { value: def.kachel };
    shader.uniforms.uWandStaerke = { value: def.staerke };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWandPos;\nvarying vec3 vWandNor;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wandPos = vec4(transformed, 1.0);
        vec3 wandNor = objectNormal;
        #ifdef USE_INSTANCING
          wandPos = instanceMatrix * wandPos;
          wandNor = mat3(instanceMatrix) * wandNor;
        #endif
        vWandPos = (modelMatrix * wandPos).xyz;
        vWandNor = normalize(mat3(modelMatrix) * wandNor);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWandPos;
        varying vec3 vWandNor;
        uniform sampler2D uWandFarbe;
        uniform float uWandKachel;
        uniform float uWandStaerke;
        ${normal ? 'uniform sampler2D uWandNormal;' : ''}
        vec2 wandUv() {
          vec3 n = abs(vWandNor);
          vec2 uv = n.y > 0.6 ? vWandPos.xz : (n.x > n.z ? vWandPos.zy : vWandPos.xy);
          return uv / uWandKachel;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 wandTexel = texture2D(uWandFarbe, wandUv()).rgb;
        ${normal ? 'wandTexel *= 0.72 + 0.28 * (texture2D(uWandNormal, wandUv()).z * 2.0 - 1.0); // Fugen aus der Normalmap leicht abdunkeln' : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * wandTexel * 2.2, uWandStaerke);`,
      );
  };
  material.customProgramCacheKey = () => `wandtextur-${art}-${material.vertexColors ? 1 : 0}`;
  return material;
}
