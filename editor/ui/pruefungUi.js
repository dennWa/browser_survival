import { esc } from './dialoge.js';

/**
 * Reiter „Prüfung“ (rechte Seitenleiste): Live-Validierung der aktiven Zone (kern/validierung.js) als Liste,
 * Klick springt zur Stelle. Die Reiter-Beschriftung zeigt die Zähler (⛔ Fehler / ⚠ Warnungen / ✓).
 */
export function zaehlerText(liste) {
  const f = liste.filter((e) => e.schwere === 'fehler').length;
  const w = liste.length - f;
  return { f, w, text: f || w ? `${f ? `⛔${f}` : ''}${f && w ? ' ' : ''}${w ? `⚠${w}` : ''}` : '✓' };
}

export function pruefungUi({ zustand, leiste, aktionen }) {
  leiste.registriere(
    'Prüfung',
    () => {
      const liste = zustand.validierung;
      const { f, w } = zaehlerText(liste);
      const el = leiste.el;
      el.innerHTML = liste.length ? `<p class="leise">${f} Fehler (verhindern Test/Veröffentlichen) · ${w} Warnungen. Klick springt zur Stelle.</p>` : '<p>✓ Keine Probleme gefunden.</p>';
      const ul = document.createElement('ul');
      ul.className = 'liste';
      for (const e of liste) {
        const li = document.createElement('li');
        li.className = e.schwere;
        li.innerHTML = `${esc(e.text)}${e.x !== null ? ` <span class="leise">(${e.x}|${e.y})</span>` : ''}`;
        li.addEventListener('click', () => e.x !== null && aktionen.springeZu(e.x, e.y));
        ul.append(li);
      }
      el.append(ul);
    },
    { ereignisse: ['zone', 'pruefung'], beschriftung: () => `Prüfung ${zaehlerText(zustand.validierung).text}` },
  );
}
