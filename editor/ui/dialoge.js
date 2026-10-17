/**
 * Modale Dialoge (ein Dialog gleichzeitig). Alles Promise-basiert:
 *   dialog({ titel, html | knoten, knoepfe: [{ text, wert, art }] }) → wert des gedrückten Knopfs (Esc/Hintergrund = null)
 *   formular(titel, felder, { text, okText }) → { name: wert } | null
 *   bestaetigen(titel, text) → true | false
 */
const hintergrund = () => document.getElementById('dialog-hintergrund');
const box = () => document.getElementById('dialog');
let offen = null;

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function istDialogOffen() {
  return offen !== null;
}

export function dialog({ titel, html = '', knoten = null, knoepfe = [{ text: 'OK', wert: true, art: 'akzent' }], beiOeffnen = null }) {
  schliesse(null);
  return new Promise((fertig) => {
    const b = box();
    b.innerHTML = `<h2>${esc(titel)}</h2><div class="inhalt">${html}</div><div class="knopfreihe" style="justify-content:flex-end;margin-top:12px"></div>`;
    if (knoten) b.querySelector('.inhalt').append(knoten);
    const reihe = b.querySelector('.knopfreihe');
    for (const k of knoepfe) {
      const knopf = document.createElement('button');
      knopf.textContent = k.text;
      if (k.art) knopf.className = k.art;
      knopf.addEventListener('click', () => {
        const wert = typeof k.wert === 'function' ? k.wert(b) : k.wert;
        if (wert === undefined) return; // Prüfung fehlgeschlagen → offen lassen
        schliesse(wert);
      });
      reihe.append(knopf);
    }
    offen = fertig;
    hintergrund().hidden = false;
    beiOeffnen?.(b);
    (b.querySelector('input,select,textarea') ?? reihe.querySelector('button.akzent') ?? reihe.lastElementChild)?.focus();
  });
}

export function schliesse(wert = null) {
  const f = offen;
  offen = null;
  hintergrund().hidden = true;
  box().innerHTML = '';
  f?.(wert);
}

/** Felder: { name, label, typ: 'text'|'zahl'|'auswahl'|'haken'|'textbereich', wert, optionen: [[wert, text]], min, max, schritt, hilfe, pflicht } */
export function formular(titel, felder, { text = '', okText = 'OK', pruefe = null } = {}) {
  const html = `${text ? `<p class="leise">${text}</p>` : ''}${felder.map(feldHtml).join('')}<p class="fehlertext" style="color:var(--rot)"></p>`;
  return dialog({
    titel,
    html,
    knoepfe: [
      { text: 'Abbrechen', wert: null },
      {
        text: okText,
        art: 'akzent',
        wert: (b) => {
          const werte = liesFelder(b, felder);
          const fehlt = felder.find((f) => f.pflicht && (werte[f.name] === '' || werte[f.name] === null || Number.isNaN(werte[f.name])));
          const meldung = fehlt ? `„${fehlt.label}“ fehlt` : (pruefe?.(werte) ?? null);
          if (meldung) {
            b.querySelector('.fehlertext').textContent = meldung;
            return undefined;
          }
          return werte;
        },
      },
    ],
    beiOeffnen: (b) =>
      b.querySelectorAll('input').forEach((i) =>
        i.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') b.querySelector('.knopfreihe button.akzent').click();
        }),
      ),
  });
}

export function feldHtml(f) {
  const id = `f-${f.name}`;
  const hilfe = f.hilfe ? `<small class="standard">${esc(f.hilfe)}</small>` : '';
  if (f.typ === 'auswahl')
    return `<label class="feld"><span>${esc(f.label)}</span><select id="${id}" name="${f.name}">${f.optionen.map(([w, t]) => `<option value="${esc(w)}"${String(w) === String(f.wert ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${hilfe}</label>`;
  if (f.typ === 'haken') return `<label class="feld"><span>${esc(f.label)}</span><input id="${id}" name="${f.name}" type="checkbox"${f.wert ? ' checked' : ''} />${hilfe}</label>`;
  if (f.typ === 'textbereich') return `<label class="feld" style="grid-template-columns:1fr"><span>${esc(f.label)}</span><textarea id="${id}" name="${f.name}">${esc(f.wert ?? '')}</textarea>${hilfe}</label>`;
  const typ = f.typ === 'zahl' ? 'number' : f.typ === 'farbe' ? 'color' : 'text';
  const zusatz = f.typ === 'zahl' ? ` step="${f.schritt ?? 'any'}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}` : '';
  return `<label class="feld"><span>${esc(f.label)}</span><input id="${id}" name="${f.name}" type="${typ}" value="${esc(f.wert ?? '')}"${zusatz} placeholder="${esc(f.platzhalter ?? '')}" />${hilfe}</label>`;
}

export function liesFelder(b, felder) {
  const werte = {};
  for (const f of felder) {
    const el = b.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.typ === 'haken') werte[f.name] = el.checked;
    else if (f.typ === 'zahl') werte[f.name] = el.value === '' ? null : Number(el.value);
    else werte[f.name] = el.value.trim();
  }
  return werte;
}

export async function bestaetigen(titel, text, { ok = 'Ja', abbrechen = 'Abbrechen', gefahr = false } = {}) {
  const w = await dialog({ titel, html: text, knoepfe: [{ text: abbrechen, wert: false }, { text: ok, wert: true, art: gefahr ? 'gefahr' : 'akzent' }] });
  return w === true;
}

// Esc / Klick auf den Hintergrund schließt
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && offen) {
    e.stopPropagation();
    schliesse(null);
  }
}, true);
document.addEventListener('click', (e) => {
  if (offen && e.target === hintergrund()) schliesse(null);
});
