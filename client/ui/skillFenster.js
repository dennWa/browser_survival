import { SKILLS } from '../../gemeinsam/spieler/skills.js';

/**
 * Fähigkeiten-Fenster (Taste U, ⭐ oder Klick auf die Level-Plakette): Skillpunkte verteilen.
 * Welche Skills es gibt und was sie bewirken: gemeinsam/spieler/skills.js. Der Server prüft jeden Punkt.
 */
export class SkillFenster {
  #beiSkill = null;
  #stand = '';

  constructor(dokument) {
    this.dokument = dokument;
    this.el = dokument.getElementById('skills');
    this.liste = dokument.getElementById('skills-liste');
    this.punkteEl = dokument.getElementById('skills-punkte');
    dokument.getElementById('skills-schliessen').addEventListener('click', () => this.zeige(false));
    this.daten = null;
  }

  beiSkill(fn) {
    this.#beiSkill = fn;
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (offen) {
      this.#stand = '';
      this.#zeichne();
    }
  }

  setzeDaten(daten) {
    this.daten = daten;
    if (this.offen) this.#zeichne();
  }

  #zeichne() {
    const d = this.daten;
    if (!d?.skills) return;
    const stand = JSON.stringify([d.skills, d.skillPunkte, d.level]);
    if (stand === this.#stand) return;
    this.#stand = stand;
    this.punkteEl.textContent = d.skillPunkte > 0 ? `${d.skillPunkte} Punkt${d.skillPunkte === 1 ? '' : 'e'} zu verteilen` : 'Keine freien Punkte – Level aufsteigen (Zombies töten)';
    this.punkteEl.classList.toggle('frei', d.skillPunkte > 0);
    const doc = this.dokument;
    this.liste.replaceChildren(
      ...Object.entries(SKILLS).map(([name, def]) => {
        const stufe = d.skills[name] ?? 0;
        const zeile = Object.assign(doc.createElement('div'), { className: 'skill-zeile' });
        const kopf = Object.assign(doc.createElement('div'), { className: 'skill-kopf' });
        kopf.append(
          Object.assign(doc.createElement('b'), { textContent: `${def.symbol} ${def.name}` }),
          Object.assign(doc.createElement('span'), { textContent: `${stufe}/${def.max}` }),
        );
        const balken = Object.assign(doc.createElement('div'), { className: 'skill-balken' });
        for (let i = 0; i < def.max; i++) balken.append(Object.assign(doc.createElement('i'), { className: i < stufe ? 'voll' : '' }));
        const info = Object.assign(doc.createElement('small'), { textContent: def.beschreibung });
        const knopf = Object.assign(doc.createElement('button'), { type: 'button', textContent: '+', title: 'Punkt setzen', disabled: d.skillPunkte <= 0 || stufe >= def.max });
        knopf.addEventListener('click', () => this.#beiSkill?.(name));
        const text = Object.assign(doc.createElement('div'), { className: 'skill-text' });
        text.append(kopf, balken, info);
        zeile.append(text, knopf);
        return zeile;
      }),
    );
  }
}
