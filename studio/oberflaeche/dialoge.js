import { icon } from './icons.js';

/**
 * Dialoge des Studios (modal, Esc = abbrechen, Enter = Standardknopf) + kleine Formular-Hilfe.
 *   dialog({ titel, icon, inhalt (HTML|Element), knoepfe: [{ text, wert, art: 'primaer'|'gefahr'|'' }], breit, beimOeffnen })
 *     → Promise<wert | null>
 *   formular(felder) → { element, werte() }  Felder: { name, titel, art: 'text'|'zahl'|'auswahl'|'schalter'|'textfeld'|'datei', wert, werte, min, max, schritt, hilfe, voll }
 *   frage(titel, text, { ja, nein, gefahr }) → Promise<boolean>
 */
const ebene = () => document.getElementById('dialog-ebene');
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]);

export function dialog({ titel, icon: ic = 'info', inhalt = '', knoepfe = [{ text: 'OK', wert: true, art: 'primaer' }], breit = false, beimOeffnen = null, klasse = '', ohneEnter = false }) {
  return new Promise((fertig) => {
    const e = ebene();
    const d = document.createElement('div');
    d.className = `dialog ${breit ? 'breit' : ''} ${klasse}`;
    d.innerHTML = `<div class="dialog-kopf">${icon(ic, 18)}<span>${esc(titel)}</span><button class="knopf flach" data-x title="Schließen (Esc)">${icon('schliessen', 16)}</button></div><div class="dialog-inhalt"></div><div class="dialog-fuss"></div>`;
    const ziel = d.querySelector('.dialog-inhalt');
    if (typeof inhalt === 'string') ziel.innerHTML = inhalt;
    else ziel.append(inhalt);
    const fuss = d.querySelector('.dialog-fuss');
    if (!knoepfe.length) fuss.remove();
    const schliesse = (wert) => {
      document.removeEventListener('keydown', tasten, true);
      d.remove();
      if (!e.children.length) e.classList.remove('offen');
      fertig(wert);
    };
    for (const k of knoepfe) {
      const b = document.createElement('button');
      b.className = `knopf ${k.art ?? ''}`;
      b.textContent = k.text;
      b.addEventListener('click', async () => {
        if (k.pruefe) {
          const fehler = await k.pruefe();
          if (fehler) return;
        }
        schliesse(typeof k.wert === 'function' ? k.wert() : k.wert);
      });
      fuss.append(b);
    }
    d.querySelector('[data-x]').addEventListener('click', () => schliesse(null));
    const tasten = (ev) => {
      if (e.lastElementChild !== d) return;
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        schliesse(null);
      } else if (ev.key === 'Enter' && !ohneEnter && ev.target.tagName !== 'TEXTAREA' && knoepfe.length) {
        ev.preventDefault();
        ev.stopPropagation();
        [...fuss.querySelectorAll('.knopf.primaer')].at(-1)?.click();
      }
    };
    document.addEventListener('keydown', tasten, true);
    e.append(d);
    e.classList.add('offen');
    beimOeffnen?.(d, schliesse);
    setTimeout(() => d.querySelector('input:not([type=checkbox]):not([type=file]), select, textarea')?.focus(), 30);
  });
}

export function frage(titel, text, { ja = 'OK', nein = 'Abbrechen', gefahr = false, icon: ic = 'warnung' } = {}) {
  return dialog({ titel, icon: ic, inhalt: `<div style="line-height:1.6">${text}</div>`, knoepfe: [{ text: nein, wert: false }, { text: ja, wert: true, art: gefahr ? 'primaer gefahr' : 'primaer' }] }).then((w) => !!w);
}

export function melde(titel, html, ic = 'info') {
  return dialog({ titel, icon: ic, inhalt: `<div style="line-height:1.6">${html}</div>`, knoepfe: [{ text: 'OK', wert: true, art: 'primaer' }] });
}

export function formular(felder) {
  const el = document.createElement('div');
  el.className = 'formular';
  for (const f of felder) {
    if (f.art === 'hinweis') {
      const h = document.createElement('div');
      h.className = `voll hinweis-kasten ${f.warnung ? 'warnung' : ''}`;
      h.innerHTML = f.html;
      el.append(h);
      continue;
    }
    const titel = document.createElement('label');
    titel.textContent = f.titel ?? '';
    let feld;
    if (f.art === 'auswahl') {
      feld = document.createElement('select');
      feld.className = 'feld';
      for (const [w, t] of f.werte) feld.append(new Option(t, w, false, String(w) === String(f.wert)));
    } else if (f.art === 'schalter') {
      const l = document.createElement('label');
      l.className = 'schalter';
      feld = document.createElement('input');
      feld.type = 'checkbox';
      feld.checked = !!f.wert;
      l.append(feld, document.createTextNode(f.text ?? ''));
      feld.dataset.name = f.name;
      el.append(titel, l);
      continue;
    } else if (f.art === 'textfeld') {
      feld = document.createElement('textarea');
      feld.className = 'feld';
      feld.rows = f.zeilen ?? 4;
      feld.value = f.wert ?? '';
    } else {
      feld = document.createElement('input');
      feld.className = 'feld';
      feld.type = f.art === 'zahl' ? 'number' : f.art === 'datei' ? 'file' : f.art === 'passwort' ? 'password' : 'text';
      if (f.art === 'datei' && f.annehmen) feld.accept = f.annehmen;
      if (f.art !== 'datei') feld.value = f.wert ?? '';
      for (const a of ['min', 'max']) if (f[a] !== undefined) feld[a] = f[a];
      if (f.schritt) feld.step = f.schritt;
      if (f.platzhalter) feld.placeholder = f.platzhalter;
    }
    feld.dataset.name = f.name;
    if (f.voll) {
      titel.classList.add('voll');
      feld.classList.add('voll');
    }
    el.append(titel, feld);
    if (f.hilfe) {
      const h = document.createElement('div');
      h.className = 'voll';
      h.style.cssText = 'color:var(--text-3);font-size:11.5px;margin-top:-4px';
      h.textContent = f.hilfe;
      el.append(document.createElement('span'), h);
    }
  }
  return {
    element: el,
    feld: (name) => el.querySelector(`[data-name="${name}"]`),
    werte() {
      const w = {};
      for (const f of el.querySelectorAll('[data-name]')) {
        const n = f.dataset.name;
        if (f.type === 'checkbox') w[n] = f.checked;
        else if (f.type === 'number') w[n] = f.value === '' ? null : Number(f.value);
        else if (f.type === 'file') w[n] = f.files?.[0] ?? null;
        else w[n] = f.value;
      }
      return w;
    },
  };
}
