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
  // Phase 4.12 (ambientCG CC0, verkleinert): Beton, Quaderstein, Wellblech
  beton: { farbe: 'betonwand.jpg', kachel: 96, staerke: 0.95 },
  quader: { farbe: 'quaderwand.jpg', kachel: 80, staerke: 0.9 },
  blech: { farbe: 'blechwand.jpg', kachel: 64, staerke: 0.9 },
};
/** Reihenfolge im Wand-Atlas = gemeinsam/welt/kacheln.WAND_ARTEN */
const ATLAS_ARTEN = ['ziegel', 'holz', 'putz', 'beton', 'quader', 'blech'];
const ATLAS_GROESSE = 256;

/**
 * Phase 4.12: Wandart → Instanz-/Eckfarbe. Rot/Grün = 1 (Farbe bleibt), Blau = (Index + 0,5) / 8 → der Shader („mehrfach“)
 * liest daraus die Wandart und nimmt die passende Textur aus dem Atlas.
 */
export function wandArtFarbe(index) {
  return new THREE.Color(1, 1, (Math.max(0, index) + 0.5) / 8);
}

let atlas = null;
/** Alle Wandtexturen nebeneinander in EINER Textur (lädt nach; bis dahin grau) */
function wandAtlas() {
  if (atlas) return atlas;
  const leinwand = document.createElement('canvas');
  leinwand.width = ATLAS_GROESSE * ATLAS_ARTEN.length;
  leinwand.height = ATLAS_GROESSE;
  const ctx = leinwand.getContext('2d');
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, leinwand.width, leinwand.height);
  atlas = new THREE.CanvasTexture(leinwand);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  ATLAS_ARTEN.forEach((art, i) => {
    const bild = new Image();
    bild.onload = () => {
      ctx.drawImage(bild, i * ATLAS_GROESSE, 0, ATLAS_GROESSE, ATLAS_GROESSE);
      atlas.needsUpdate = true;
    };
    bild.src = new URL(TEXTUREN[art].farbe, BASIS).href;
  });
  return atlas;
}

/** Material, das Instanz-/Eckfarben NUR als Alpha nutzt (Wand-Deckel: die Farbe trägt dort die Wandart, siehe wandArtFarbe) */
export function ohneFarbe(material) {
  material.userData.ohneFarbe = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#if defined( USE_COLOR_ALPHA )
        diffuseColor.a *= vColor.a;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `ohnefarbe-${material.vertexColors ? 1 : 0}`;
  return material;
}

/** Alle Wandarten in einem Material (Instanz-/Eckfarbe Blau = Art, siehe wandArtFarbe) */
function wendeWandAtlasAn(material) {
  material.userData.wandTextur = 'mehrfach';
  const tex = wandAtlas();
  const normal = textur(TEXTUREN.ziegel.normal, false);
  const n = ATLAS_ARTEN.length;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWandAtlas = { value: tex };
    shader.uniforms.uWandNormal = { value: normal };
    shader.uniforms.uWandKachel = { value: ATLAS_ARTEN.map((a) => TEXTUREN[a].kachel) };
    shader.uniforms.uWandStaerke = { value: ATLAS_ARTEN.map((a) => TEXTUREN[a].staerke) };
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
        // Weltpixel OHNE modelMatrix: im Spiel ist sie die Einheit, in der Studio-Spiel-Optik skaliert sie ×1/32 (Textur sonst winzig)
        vWandPos = wandPos.xyz;
        vWandNor = normalize(wandNor);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWandPos;
        varying vec3 vWandNor;
        uniform sampler2D uWandAtlas;
        uniform sampler2D uWandNormal;
        uniform float uWandKachel[${n}];
        uniform float uWandStaerke[${n}];`,
      )
      // Farbe der Instanz/Ecke trägt die Wandart → NICHT als Farbe multiplizieren (nur Alpha der Durchsicht gilt)
      .replace(
        '#include <color_fragment>',
        `#if defined( USE_COLOR_ALPHA )
          diffuseColor.a *= vColor.a;
        #endif`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          int wandArt = int(clamp(floor(vColor.b * 8.0), 0.0, ${n - 1}.0));
        #else
          int wandArt = 0;
        #endif
        float wandKachel = uWandKachel[0];
        float wandStaerke = uWandStaerke[0];
        for (int i = 0; i < ${n}; i++) if (i == wandArt) { wandKachel = uWandKachel[i]; wandStaerke = uWandStaerke[i]; }
        vec3 wn = abs(vWandNor);
        vec2 wandRoh = (wn.y > 0.6 ? vWandPos.xz : (wn.x > wn.z ? vWandPos.zy : vWandPos.xy)) / wandKachel;
        vec2 wandUv = vec2((fract(wandRoh.x) + float(wandArt)) / ${n}.0, fract(wandRoh.y));
        // Ableitungen der ungebrochenen Koordinaten → keine Mipmap-Nähte an den Kachelgrenzen des Atlas
        vec2 wandDx = dFdx(wandRoh) * vec2(1.0 / ${n}.0, 1.0);
        vec2 wandDy = dFdy(wandRoh) * vec2(1.0 / ${n}.0, 1.0);
        vec3 wandTexel = textureGrad(uWandAtlas, wandUv, wandDx, wandDy).rgb;
        if (wandArt == 0) wandTexel *= 0.72 + 0.28 * (texture2D(uWandNormal, wandRoh).z * 2.0 - 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * wandTexel * 2.2, wandStaerke);`,
      );
  };
  material.customProgramCacheKey = () => `wandatlas-${material.vertexColors ? 1 : 0}`;
  return material;
}
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
  if (art === 'mehrfach') return wendeWandAtlasAn(material);
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
        // Weltpixel OHNE modelMatrix: im Spiel ist sie die Einheit, in der Studio-Spiel-Optik skaliert sie ×1/32 (Textur sonst winzig)
        vWandPos = wandPos.xyz;
        vWandNor = normalize(wandNor);`,
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
