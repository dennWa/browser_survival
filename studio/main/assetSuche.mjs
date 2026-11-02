/**
 * Asset-Suche im Internet (Studio Phase 4.11, Hauptprozess – Node-fetch, kein CORS). Nur CC0/CC-BY (Projektregel 6);
 * Urheber/Lizenz/Quelle wandern beim Import nach client/assets/eigene/credits.json.
 *   QUELLEN: modell → polyhaven (ohne Schlüssel), polypizza (Schlüssel) · textur → ambientcg, polyhaven (ohne Schlüssel) ·
 *            klang → freesound (Schlüssel)
 *   suche({ art, quelle, text, seite, schluessel }) → { liste: [{ id, titel, urheber, lizenz, vorschau, url, info }], mehr }
 *   lade({ art, quelle, id, schluessel })
 *     modell polypizza → { art: 'glb', bytes } · modell polyhaven → { art: 'gltf', dateien: { 'name.gltf': bytes, … }, haupt }
 *     textur → { art: 'bild', bytes, endung } · klang → { art: 'audio', bytes, endung }
 *     jeweils + credits { urheber, lizenz, url, titel }
 * fetch ist injizierbar (Tests ohne Netz).
 */
import { inflateRawSync } from 'node:zlib';

export const QUELLEN = Object.freeze({
  modell: { polyhaven: { name: 'Poly Haven', schluessel: false }, polypizza: { name: 'Poly Pizza (Low-Poly)', schluessel: true, seite: 'https://poly.pizza/settings/api' } },
  textur: { ambientcg: { name: 'ambientCG', schluessel: false }, polyhaven: { name: 'Poly Haven', schluessel: false } },
  klang: { freesound: { name: 'Freesound', schluessel: true, seite: 'https://freesound.org/apiv2/apply' } },
});
const ANZAHL = 30;
const ERLAUBT = /^(CC0|CC-BY( [\d.]+)?)$/;
const cache = new Map();

export function lizenzAusUrl(url) {
  const u = String(url ?? '').toLowerCase();
  if (u.includes('publicdomain/zero') || u === 'cc0' || u.includes('creative commons 0')) return 'CC0';
  const by = u.match(/licenses\/by\/([\d.]+)/);
  if (by) return `CC-BY ${by[1]}`;
  if (u === 'attribution') return 'CC-BY';
  return u || 'unbekannt';
}

async function json(f, url, opt) {
  const a = await f(url, opt);
  if (a.status === 401 || a.status === 403) throw new Error('API-Schlüssel fehlt oder ist ungültig (Asset-Suche → Schlüssel)');
  if (!a.ok) throw new Error(`Quelle antwortet mit ${a.status}`);
  return a.json();
}

async function bytes(f, url, opt) {
  const a = await f(url, opt);
  if (!a.ok) throw new Error(`Download fehlgeschlagen (${a.status})`);
  return new Uint8Array(await a.arrayBuffer());
}

/** Minimaler ZIP-Leser (Zentralverzeichnis, deflate/stored) → { name: bytes } */
export function entpacke(zip) {
  const b = Buffer.from(zip);
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Keine ZIP-Datei');
  const anzahl = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const aus = {};
  for (let i = 0; i < anzahl; i++) {
    const methode = b.readUInt16LE(p + 10);
    const groesse = b.readUInt32LE(p + 20);
    const nl = b.readUInt16LE(p + 28);
    const el = b.readUInt16LE(p + 30);
    const kl = b.readUInt16LE(p + 32);
    const lokal = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    const lnl = b.readUInt16LE(lokal + 26);
    const lel = b.readUInt16LE(lokal + 28);
    const start = lokal + 30 + lnl + lel;
    const daten = b.subarray(start, start + groesse);
    if (!name.endsWith('/')) aus[name] = new Uint8Array(methode === 8 ? inflateRawSync(daten) : daten);
    p += 46 + nl + el + kl;
  }
  return aus;
}

const passt = (text, ...felder) => {
  const w = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const heu = felder.flat().join(' ').toLowerCase();
  return w.every((x) => heu.includes(x));
};

async function polyhavenListe(f, typ) {
  const k = `ph:${typ}`;
  if (!cache.has(k)) cache.set(k, json(f, `https://api.polyhaven.com/assets?t=${typ}`).catch((e) => (cache.delete(k), Promise.reject(e))));
  return cache.get(k);
}

export async function suche({ art, quelle, text = '', seite = 0, schluessel = '' }, f = globalThis.fetch) {
  const ab = seite * ANZAHL;
  if (quelle === 'polyhaven') {
    const alle = await polyhavenListe(f, art === 'modell' ? 'models' : 'textures');
    const treffer = Object.entries(alle).filter(([id, a]) => passt(text, id, a.name, a.tags ?? [], a.categories ?? []));
    return {
      liste: treffer.slice(ab, ab + ANZAHL).map(([id, a]) => ({ id, titel: a.name, urheber: Object.keys(a.authors ?? {}).join(', '), lizenz: 'CC0', vorschau: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`, url: `https://polyhaven.com/a/${id}`, info: a.polycount ? `${a.polycount.toLocaleString('de-DE')} Dreiecke` : (a.categories ?? []).slice(0, 2).join(', ') })),
      mehr: treffer.length > ab + ANZAHL,
    };
  }
  if (quelle === 'ambientcg') {
    const j = await json(f, `https://ambientcg.com/api/v2/full_json?type=Material&limit=${ANZAHL}&offset=${ab}&include=imageData,displayData&q=${encodeURIComponent(text || 'ground')}`);
    return {
      liste: (j.foundAssets ?? []).map((a) => ({ id: a.assetId, titel: a.displayName ?? a.assetId, urheber: 'ambientCG (Lennart Demes)', lizenz: 'CC0', vorschau: a.previewImage?.['256-PNG'] ?? a.previewImage?.['128-PNG'] ?? null, url: `https://ambientcg.com/view?id=${a.assetId}`, info: a.displayCategory ?? '' })),
      mehr: (j.numberOfResults ?? 0) > ab + ANZAHL,
    };
  }
  if (quelle === 'polypizza') {
    if (!schluessel) throw new Error('Poly Pizza braucht einen kostenlosen API-Schlüssel (poly.pizza/settings/api)');
    const j = await json(f, `https://api.poly.pizza/v1.1/search/${encodeURIComponent(text || 'tree')}?Limit=${ANZAHL}&Page=${seite}`, { headers: { 'x-auth-token': schluessel } });
    const roh = Array.isArray(j?.results) ? j.results : [];
    const liste = roh
      .map((r) => ({ id: String(r.ID ?? r.Id ?? r.id), titel: r.Title ?? r.title ?? r.ID, urheber: r.Creator?.Username ?? r.Attribution ?? '', lizenz: lizenzAusUrl(r.Licence ?? r.License ?? '').replace(/^cc-by$/i, 'CC-BY'), vorschau: r.Thumbnail ?? null, url: `https://poly.pizza/m/${r.ID ?? r.id}`, info: r['Tri Count'] ? `${r['Tri Count']} Dreiecke` : '', download: r.Download }))
      .map((e) => ({ ...e, lizenz: /^cc0/i.test(e.lizenz) || /creative commons zero/i.test(e.lizenz) ? 'CC0' : /by/i.test(e.lizenz) ? 'CC-BY' : e.lizenz }))
      .filter((e) => e.download && ERLAUBT.test(e.lizenz));
    for (const e of liste) cache.set(`pp:${e.id}`, e);
    return { liste, mehr: (Number(j?.total) || 0) > ab + ANZAHL };
  }
  if (quelle === 'freesound') {
    if (!schluessel) throw new Error('Freesound braucht einen kostenlosen API-Schlüssel (freesound.org/apiv2/apply)');
    const filter = encodeURIComponent('license:("Creative Commons 0" OR "Attribution")');
    const j = await json(f, `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(text || 'wind')}&filter=${filter}&page=${seite + 1}&page_size=${ANZAHL}&fields=id,name,username,license,previews,duration,url,images&token=${encodeURIComponent(schluessel)}`);
    const liste = (j.results ?? []).map((r) => ({ id: String(r.id), titel: r.name, urheber: r.username, lizenz: lizenzAusUrl(r.license), vorschau: r.images?.waveform_m ?? null, url: r.url, info: `${Math.round((r.duration ?? 0) * 10) / 10} s`, hoeren: r.previews?.['preview-hq-ogg'] ?? r.previews?.['preview-hq-mp3'] ?? null })).filter((e) => ERLAUBT.test(e.lizenz));
    for (const e of liste) cache.set(`fs:${e.id}`, e);
    return { liste, mehr: !!j.next };
  }
  throw new Error(`Unbekannte Quelle „${quelle}“`);
}

export async function lade({ art, quelle, id, schluessel = '' }, f = globalThis.fetch) {
  if (quelle === 'polyhaven' && art === 'modell') {
    const dateien = await json(f, `https://api.polyhaven.com/files/${encodeURIComponent(id)}`);
    const g = dateien.gltf?.['1k']?.gltf ?? dateien.gltf?.['2k']?.gltf;
    if (!g) throw new Error('Kein glTF für dieses Modell');
    const haupt = g.url.split('/').at(-1);
    const aus = { [haupt]: await bytes(f, g.url) };
    for (const [pfad, d] of Object.entries(g.include ?? {})) aus[pfad] = await bytes(f, d.url);
    const info = (await polyhavenListe(f, 'models'))[id] ?? {};
    return { art: 'gltf', dateien: aus, haupt, credits: { titel: info.name ?? id, urheber: Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven', lizenz: 'CC0', url: `https://polyhaven.com/a/${id}` } };
  }
  if (quelle === 'polyhaven' && art === 'textur') {
    const dateien = await json(f, `https://api.polyhaven.com/files/${encodeURIComponent(id)}`);
    const d = dateien.Diffuse?.['1k']?.jpg ?? dateien.diffuse?.['1k']?.jpg ?? Object.values(dateien.Diffuse ?? {})[0]?.jpg;
    if (!d) throw new Error('Keine Farbtextur gefunden');
    const info = (await polyhavenListe(f, 'textures'))[id] ?? {};
    return { art: 'bild', bytes: await bytes(f, d.url), endung: 'jpg', credits: { titel: info.name ?? id, urheber: Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven', lizenz: 'CC0', url: `https://polyhaven.com/a/${id}` } };
  }
  if (quelle === 'ambientcg') {
    const zip = await bytes(f, `https://ambientcg.com/get?file=${encodeURIComponent(id)}_1K-JPG.zip`);
    const dateien = entpacke(zip);
    const farbe = Object.keys(dateien).find((n) => /_color\.jpe?g$/i.test(n));
    if (!farbe) throw new Error('Keine Farbtextur im Paket');
    return { art: 'bild', bytes: dateien[farbe], endung: 'jpg', credits: { titel: id, urheber: 'ambientCG (Lennart Demes)', lizenz: 'CC0', url: `https://ambientcg.com/view?id=${id}` } };
  }
  if (quelle === 'polypizza') {
    const e = cache.get(`pp:${id}`);
    if (!e) throw new Error('Erst suchen, dann laden');
    return { art: 'glb', bytes: await bytes(f, e.download), credits: { titel: e.titel, urheber: e.urheber || 'Poly Pizza', lizenz: e.lizenz, url: e.url } };
  }
  if (quelle === 'freesound') {
    const e = cache.get(`fs:${id}`);
    if (!e?.hoeren) throw new Error('Erst suchen, dann laden');
    const endung = e.hoeren.endsWith('.mp3') ? 'mp3' : 'ogg';
    return { art: 'audio', bytes: await bytes(f, e.hoeren), endung, credits: { titel: e.titel, urheber: e.urheber, lizenz: e.lizenz, url: e.url } };
  }
  throw new Error(`Unbekannte Quelle „${quelle}“`);
}
