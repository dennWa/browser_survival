import { icon } from './icons.js';
import { esc } from './dialoge.js';

/**
 * Menüleiste, Kontextmenü und Befehlspalette (Strg+K) – alles aus der Befehlsschicht (kern/befehle.js).
 * Menü-Definition: [{ titel, eintraege: ['befehl.id' | '-' ] }].
 */
export class Menues {
  constructor(befehle, ziel) {
    this.befehle = befehle;
    this.ziel = ziel;
    this.offen = null;
    this.liste = document.createElement('div');
    this.liste.className = 'menue-liste versteckt';
    document.body.append(this.liste);
    document.addEventListener('pointerdown', (e) => {
      if (this.offen && !this.liste.contains(e.target) && !e.target.closest('.menue-titel')) this.schliesse();
      const k = document.getElementById('kontextmenue');
      if (!k.contains(e.target)) k.classList.add('versteckt');
    });
  }

  baue(definition) {
    this.definition = definition;
    this.ziel.innerHTML = '';
    for (const m of definition) {
      const t = document.createElement('div');
      t.className = 'menue-titel';
      t.textContent = m.titel;
      t.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.offen === m) this.schliesse();
        else this.oeffne(m, t);
      });
      t.addEventListener('pointerenter', () => {
        if (this.offen && this.offen !== m) this.oeffne(m, t);
      });
      this.ziel.append(t);
    }
  }

  #eintraege(liste, ziel, nachKlick) {
    ziel.innerHTML = '';
    for (const id of liste) {
      if (id === '-') {
        ziel.append(Object.assign(document.createElement('div'), { className: 'menue-trenner' }));
        continue;
      }
      const b = this.befehle.hole(typeof id === 'string' ? id : id.id);
      if (!b) continue;
      const e = document.createElement('div');
      e.className = `menue-eintrag ${this.befehle.istAktiv(b.id) ? '' : 'inaktiv'}`;
      const haken = b.angehakt?.() ? 'pruefen' : b.icon;
      e.innerHTML = `${haken ? icon(haken, 16) : '<span style="width:16px"></span>'}<span>${esc(b.titel)}</span>${b.kuerzel ? `<span class="kuerzel">${esc([].concat(b.kuerzel)[0])}</span>` : ''}`;
      e.addEventListener('click', () => {
        nachKlick();
        this.befehle.aus(b.id, typeof id === 'object' ? id.args : undefined);
      });
      ziel.append(e);
    }
  }

  oeffne(m, titel) {
    for (const t of this.ziel.children) t.classList.toggle('offen', t === titel);
    this.offen = m;
    this.#eintraege(m.eintraege, this.liste, () => this.schliesse());
    const r = titel.getBoundingClientRect();
    this.liste.style.left = `${r.left}px`;
    this.liste.style.top = `${r.bottom + 2}px`;
    this.liste.classList.remove('versteckt');
  }

  schliesse() {
    this.offen = null;
    this.liste.classList.add('versteckt');
    for (const t of this.ziel.children) t.classList.remove('offen');
  }

  /** Kontextmenü an (x, y) mit Befehls-IDs ('-' = Trenner, oder { id, args }) */
  kontext(x, y, eintraege) {
    const k = document.getElementById('kontextmenue');
    this.#eintraege(eintraege, k, () => k.classList.add('versteckt'));
    k.classList.remove('versteckt');
    const r = k.getBoundingClientRect();
    k.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    k.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  }

  /** Befehlspalette */
  palette() {
    const ebene = document.getElementById('dialog-ebene');
    const d = document.createElement('div');
    d.className = 'dialog palette';
    d.innerHTML = '<input class="feld" placeholder="Befehl suchen …" /><div class="palette-liste"></div>';
    const feld = d.querySelector('input');
    const liste = d.querySelector('.palette-liste');
    let gewaehlt = 0;
    let treffer = [];
    const zu = () => {
      d.remove();
      if (!ebene.children.length) ebene.classList.remove('offen');
    };
    const zeichne = () => {
      treffer = this.befehle.suche(feld.value).filter((b) => this.befehle.istAktiv(b.id)).slice(0, 60);
      gewaehlt = Math.min(gewaehlt, Math.max(0, treffer.length - 1));
      liste.innerHTML = treffer.map((b, i) => `<div class="menue-eintrag ${i === gewaehlt ? 'gewaehlt' : ''}" data-i="${i}"><span class="gruppe">${esc(b.gruppe)}</span>${b.icon ? icon(b.icon, 16) : ''}<span>${esc(b.titel)}</span>${b.kuerzel ? `<span class="kuerzel">${esc([].concat(b.kuerzel)[0])}</span>` : ''}</div>`).join('');
    };
    const ausfuehren = (i) => {
      const b = treffer[i];
      zu();
      if (b) this.befehle.aus(b.id);
    };
    feld.addEventListener('input', () => {
      gewaehlt = 0;
      zeichne();
    });
    feld.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') gewaehlt = Math.min(treffer.length - 1, gewaehlt + 1);
      else if (e.key === 'ArrowUp') gewaehlt = Math.max(0, gewaehlt - 1);
      else if (e.key === 'Enter') return ausfuehren(gewaehlt);
      else if (e.key === 'Escape') return zu();
      else return;
      e.preventDefault();
      zeichne();
    });
    liste.addEventListener('click', (e) => {
      const z = e.target.closest('[data-i]');
      if (z) ausfuehren(Number(z.dataset.i));
    });
    ebene.addEventListener('pointerdown', function weg(e) {
      if (e.target === ebene) {
        zu();
        ebene.removeEventListener('pointerdown', weg);
      }
    });
    ebene.append(d);
    ebene.classList.add('offen');
    zeichne();
    feld.focus();
  }
}

/** Tooltips für [data-tipp] (Titel · Kürzel · Erklärung) */
export function tooltips() {
  const t = document.getElementById('tooltip');
  let zeit = null;
  document.addEventListener('pointerover', (e) => {
    const z = e.target.closest('[data-tipp]');
    clearTimeout(zeit);
    if (!z) return t.classList.remove('sichtbar');
    zeit = setTimeout(() => {
      t.innerHTML = `<b>${esc(z.dataset.tipp)}</b>${z.dataset.kuerzel ? `<span class="kuerzel">${esc(z.dataset.kuerzel)}</span>` : ''}${z.dataset.text ? `<span class="tt-text">${esc(z.dataset.text)}</span>` : ''}`;
      const r = z.getBoundingClientRect();
      t.style.left = `${Math.min(r.left, innerWidth - 330)}px`;
      t.style.top = `${r.bottom + 6}px`;
      t.classList.add('sichtbar');
    }, 380);
  });
  document.addEventListener('pointerdown', () => t.classList.remove('sichtbar'));
}
