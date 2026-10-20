import { bereichsZonen, anzeigeOps, umbenennenOps, zoneLoeschOps, ablageEintrag, einsetzOps, ZONEN_ARTEN } from '../kern/zonenManager.js';
import { formular, bestaetigen, esc } from './dialoge.js';

/**
 * Reiter „▭ Bereiche“ (rechte Seitenleiste, Editor 2.0 Schritt 6.1): Zonen-Manager der aktiven Karte.
 * Je Bereichs-Zone (Räume, Loot-Zonen, Tier-Bereiche, Klänge, Übergänge – kern/zonenManager.js):
 *   👁 ein-/ausblenden · 🔒 sperren (ausgegraut, nicht anklickbar, Änderungen ausgelassen) · Farbe · Name (Klick = wählen
 *   und hinspringen) · ✎ umbenennen · 📥 in die Ablage (Zwischenspeichern) · 🗑 löschen (gesperrt → erst entsperren).
 * Ablage: projektweit im Editor-Speicher (meta/zonenAblage), „Einsetzen“ an der gespeicherten Stelle (in die Zone geschoben),
 * auch in andere Karten. Alle Kartenänderungen = 1 Undo-Schritt.
 */
const REITER = '▭ Bereiche';
const ABLAGE = 'zonenAblage';
const ABLAGE_MAX = 40;

export function zonenManagerUi({ zustand, leiste, zeichner, aktionen }) {
  let ablage = [];
  const ladeAblage = async () => {
    const v = await zustand.speicher.hole('meta', ABLAGE);
    ablage = Array.isArray(v) ? v : [];
    if (leiste.aktiv === REITER) leiste.zeichne();
  };
  ladeAblage();
  const speichereAblage = async () => {
    await zustand.speicher.setze('meta', ABLAGE, ablage);
    if (leiste.aktiv === REITER) leiste.zeichne();
  };

  const zonen = () => (zustand.karte ? bereichsZonen(zustand.karte) : []);
  const finde = (schl) => zonen().find((z) => z.schl === schl);

  function waehleZone(z) {
    const k = zustand.karte;
    if (z.anzeige.aus || z.anzeige.sperre) zustand.meldung('Zone ist ausgeblendet oder gesperrt – erst 👁/🔓 einschalten, dann wählen');
    else zustand.waehle(z.keys.map((key) => ({ s: z.sammlung, k: key })));
    if (z.rechteck) {
      const r = z.rechteck;
      zeichner.springeZu(Math.max(0, Math.min(k.breite, r.x + r.b / 2)), Math.max(0, Math.min(k.hoehe, r.y + r.h / 2)));
    }
  }

  async function aktion(was, schl) {
    const z = finde(schl);
    const k = zustand.karte;
    if (!z || !k) return;
    if (was === 'aus') zustand.ausfuehren(`${z.name}: ${z.anzeige.aus ? 'einblenden' : 'ausblenden'}`, anzeigeOps(k, schl, { aus: !z.anzeige.aus }));
    else if (was === 'sperre') {
      zustand.ausfuehren(`${z.name}: ${z.anzeige.sperre ? 'entsperren' : 'sperren'}`, anzeigeOps(k, schl, { sperre: !z.anzeige.sperre }));
      if (!z.anzeige.sperre) zustand.leereAuswahl();
    } else if (was === 'waehlen') waehleZone(z);
    else if (was === 'umbenennen') {
      const w = await formular(`✎ ${z.name}`, [{ name: 'name', label: 'Name', typ: 'text', wert: z.art === 'raum' ? (k.s('raeume').get(z.schl.slice(5))?.name ?? '') : z.name, pflicht: true }], { okText: 'Umbenennen', text: z.art === 'raum' ? 'Benennt den Raum um (gilt für alle seine Flächen).' : '' });
      if (w?.name) zustand.ausfuehren(`Zone umbenannt: ${w.name}`, umbenennenOps(k, z, w.name));
    } else if (was === 'ablage') {
      const e = ablageEintrag(k, z);
      ablage = [{ ...e, gespeichert: new Date().toISOString(), herkunft: k.id }, ...ablage].slice(0, ABLAGE_MAX);
      await speichereAblage();
      zustand.meldung(`📥 „${z.name}“ in der Ablage – mit „Einsetzen“ wieder (auch in anderen Zonen)`, 'ok');
    } else if (was === 'loeschen') {
      if (z.anzeige.sperre) return zustand.meldung('Gesperrte Zone – erst 🔓 entsperren', 'fehler');
      if (!(await bestaetigen('Zone löschen', `„${esc(z.name)}“ löschen?${z.art === 'raum' ? ' Die Raumflächen werden entfernt, der Raum (Name, Loot-Tabelle) bleibt im Reiter „Räume“.' : ''} Rückgängig mit Strg+Z. Tipp: vorher 📥 in die Ablage.`, { ok: 'Löschen', gefahr: true }))) return;
      zustand.leereAuswahl();
      zustand.ausfuehren(`Zone gelöscht: ${z.name}`, zoneLoeschOps(k, z));
    }
  }

  async function ablageAktion(was, nr) {
    const e = ablage[nr];
    if (!e) return;
    if (was === 'weg') {
      ablage.splice(nr, 1);
      return speichereAblage();
    }
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    const { ops, auswahl, grund } = einsetzOps(k, e);
    if (!ops.length) return zustand.meldung(`Einsetzen nicht möglich: ${grund}`, 'fehler');
    zustand.ausfuehren(`Zone eingesetzt: ${e.name}`, ops);
    zustand.waehle(auswahl);
    const erst = k.s(auswahl[0].s).get(auswahl[0].k);
    if (Number.isFinite(erst?.x)) zeichner.springeZu(Math.min(k.breite, erst.x), Math.min(k.hoehe, erst.y));
    zustand.meldung(`📤 „${e.name}“ eingesetzt (wie gespeichert, in die Zone geschoben) – verschieben wie gewohnt`, 'ok');
  }

  leiste.registriere(
    REITER,
    () => {
      const el = leiste.el;
      const liste = zonen();
      const gruppen = ZONEN_ARTEN.map((a) => ({ ...a, zonen: liste.filter((z) => z.art === a.art) })).filter((g) => g.zonen.length);
      el.innerHTML = `<p class="leise">👁 ein-/ausblenden · 🔒 sperren · Farbe · Name = wählen & hinspringen · 📥 Ablage (zwischenspeichern)</p>
        ${gruppen.length ? '' : '<p class="leise">Keine Bereichs-Zonen in dieser Zone (Räume, Tier-Bereiche, Übergänge, Klänge …).</p>'}
        ${gruppen
          .map(
            (g) => `<h4>${esc(g.symbol)} ${esc(g.name)} <span class="leise">${g.zonen.length}</span></h4><ul class="zonen-liste">${g.zonen
              .map((z) => {
                const gew = z.keys.some((key) => zustand.istGewaehlt(z.sammlung, key));
                return `<li class="${z.anzeige.aus ? 'aus' : ''} ${z.anzeige.sperre ? 'gesperrt' : ''} ${gew ? 'gewaehlt' : ''}" data-schl="${esc(z.schl)}">
                  <button type="button" data-z="aus" aria-pressed="${!z.anzeige.aus}" title="ein-/ausblenden">${z.anzeige.aus ? '◌' : '👁'}</button>
                  <button type="button" data-z="sperre" aria-pressed="${z.anzeige.sperre}" title="sperren">${z.anzeige.sperre ? '🔒' : '🔓'}</button>
                  <input type="color" data-z="farbe" value="${esc(z.farbe)}" title="Farbe im Editor">
                  <button type="button" class="name" data-z="waehlen" title="${esc(z.info)}">${esc(z.name)}<span class="leise klein"> ${esc(z.info)}</span></button>
                  <button type="button" data-z="umbenennen" title="umbenennen">✎</button>
                  <button type="button" data-z="ablage" title="in die Ablage (zwischenspeichern)">📥</button>
                  <button type="button" data-z="loeschen" class="gefahr" title="löschen">🗑</button></li>`;
              })
              .join('')}</ul>`,
          )
          .join('')}
        <h4>📥 Ablage <span class="leise">${ablage.length} (alle Zonen des Projekts)</span></h4>
        ${ablage.length ? `<ul class="zonen-liste ablage-liste">${ablage.map((e, i) => `<li data-nr="${i}"><span class="name">${esc(ZONEN_ARTEN.find((a) => a.art === e.art)?.symbol ?? '▭')} ${esc(e.name)}<span class="leise klein"> ${e.b ? `${e.b} × ${e.h}` : 'global'} · aus ${esc(e.herkunft ?? '?')}</span></span><button type="button" data-a="einsetzen" class="akzent" title="in die aktive Zone einsetzen">📤 Einsetzen</button><button type="button" data-a="weg" title="aus der Ablage entfernen">✕</button></li>`).join('')}</ul>` : '<p class="leise">leer – 📥 an einer Zone legt sie hier ab</p>'}`;
      el.querySelectorAll('[data-schl] button[data-z]').forEach((b) => b.addEventListener('click', () => aktion(b.dataset.z, b.closest('[data-schl]').dataset.schl)));
      el.querySelectorAll('[data-schl] input[data-z="farbe"]').forEach((f) =>
        f.addEventListener('change', () => {
          const schl = f.closest('[data-schl]').dataset.schl;
          const art = ZONEN_ARTEN.find((a) => a.art === finde(schl)?.art);
          zustand.ausfuehren('Zonen-Farbe', anzeigeOps(zustand.karte, schl, { farbe: f.value.toLowerCase() === art?.farbe ? null : f.value.toLowerCase() }));
        }),
      );
      el.querySelectorAll('[data-nr] button[data-a]').forEach((b) => b.addEventListener('click', () => ablageAktion(b.dataset.a, Number(b.closest('[data-nr]').dataset.nr))));
    },
    { ereignisse: ['zone', 'karte', 'auswahl'] },
  );
  aktionen.bereiche = () => leiste.zeige(REITER);
}
