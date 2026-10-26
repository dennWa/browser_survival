/**
 * Auto-Grafik (Runde 20): Leistungsklasse des Geräts grob schätzen – für das Grafikprofil „Auto“ im Renderer.
 * Ohne three.js/DOM-Pflicht (testbar in Node: gpuText + umgebung übergeben).
 * Gelernte Basis je Grafikchip in localStorage `browserSurvival.grafikAuto` = { gpu, profil } (merkeAutoProfil, vom Renderer
 * gesetzt, wenn „Auto“ trotz sparsamster Stufe dauerhaft unter 40 FPS lag).
 */
const GRAFIK_AUTO_SCHLUESSEL = 'browserSurvival.grafikAuto';

/** Leistungsklasse grob nach Grafikchip/Kernen/Speicher schätzen (Auto-Grafik). Software-Rendering → niedrig, Intel-Onboard & alte Chips → mittel. */
const SCHWACHE_GPU = /intel(?!.*(iris xe|arc))|mali-(4|t)|adreno[^0-9]*[2-5]\d\d|powervr|radeon (r[2-7]|hd ?[2-8])|geforce (gt|gts|mx)? ?[1-9]\d\d(?!\d)|geforce [6-9]\d{3}|nvidia (quadro|nvs)/i;
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic/i;
export function erkenneGeraet(istHandy, gpuText = null, umgebung = globalThis.navigator) {
  let gpu = gpuText ?? '';
  if (gpuText === null && typeof document !== 'undefined') {
    try {
      const probe = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
      const ext = probe?.getExtension('WEBGL_debug_renderer_info');
      gpu = String(probe?.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER) ?? '');
      probe?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // egal – dann nur nach Kernen/Speicher
    }
  }
  const kerne = umgebung?.hardwareConcurrency ?? 4;
  const speicher = umgebung?.deviceMemory ?? 8;
  let profil = 'hoch';
  if (SOFTWARE_GPU.test(gpu) || kerne <= 2 || speicher <= 2) profil = 'niedrig';
  else if (SCHWACHE_GPU.test(gpu) || (kerne <= 4 && speicher <= 4 && !istHandy)) profil = 'mittel';
  // Gelernt: lief „Auto“ auf diesem Chip schon einmal zu langsam, gleich die tiefere Basis nehmen
  try {
    const gelernt = JSON.parse(globalThis.localStorage?.getItem(GRAFIK_AUTO_SCHLUESSEL) ?? 'null');
    const rang = { hoch: 0, mittel: 1, niedrig: 2 };
    if (gelernt?.gpu === gpu && rang[gelernt.profil] > rang[profil]) profil = gelernt.profil;
  } catch {
    // egal
  }
  return { gpu, profil };
}

export function merkeAutoProfil(gpu, profil) {
  try {
    globalThis.localStorage?.setItem(GRAFIK_AUTO_SCHLUESSEL, JSON.stringify({ gpu, profil }));
  } catch {
    // egal
  }
}
