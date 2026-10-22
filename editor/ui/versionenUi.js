import { neueVersion, fuegeHinzu, vergleiche, wiederherstellenOps, letzteExportVersion } from '../kern/versionen.js';
import { formular, bestaetigen, esc } from './dialoge.js';

/**
 * Reiter „🕓 Versionen“ (rechte Seitenleiste, Editor 2.0 Schritt 7.5): benannte Versionen der aktiven Zone.
 * Gespeichert im Editor-Speicher (Bereich 'versionen', Schlüssel = Zonen-ID; Liste neueste zuerst, kern/versionen.js).
 *   💾 Version speichern (Name) · automatisch bei Export/Veröffentlichen (aktionen.versionAuto) – automatische max. 20
 *   Δ Diff zu Version X: Liste + farbige Markierung auf der Karte (zeichner.ueberlagerungen: grün neu, rot weg, gelb geändert)
 *   ↺ Wiederherstellungspunkt laden = 1 Undo-Schritt (alle Ebenen, auch gesperrte), vorher wird der jetzige Stand als Version gesichert
 *   aktionen.aenderungenSeitExport() → Textzeilen für den Veröffentlichen-Dialog (Änderungsübersicht seit dem letzten Export)
 * Versionen sind nicht im Komplett-Backup (Größe) – der Entwurf mit Verlauf ist es.
 */
const REITER = '🕓 Versionen';
const FARBE = { neu: '#4caf50', weg: '#e5484d', geaendert: '#ffc107' };

export function versionenUi({ zustand, leiste, zeichner, aktionen }) {
  const liste = async (id = zustand.aktivId) => (id ? ((await zustand.speicher.hole('versionen', id)) ?? []) : []);
  const speichere = async (id, l) => {
    await zustand.speicher.setze('versionen', id, l);
    if (leiste.aktiv === REITER) leiste.zeichne();
  };
  let diffVon = null; // Versions-ID, deren Diff gerade auf der Karte liegt

  const neu = async (name, art = 'manuell') => {
    const k = zustand.karte;
    if (!k) return null;
    const v = neueVersion(k, { name, art });
    await speichere(zustand.aktivId, fuegeHinzu(await liste(), v));
    return v;
  };
  aktionen.versionSpeichern = async () => {
    if (!zustand.karte) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    const w = await formular('Version speichern', [{ name: 'name', label: 'Name', typ: 'text', wert: `Stand ${new Date().toLocaleString('de-DE')}`, pflicht: true }]);
    if (!w) return;
    await neu(w.name);
    zustand.meldung(`🕓 Version „${w.name}“ gespeichert`, 'ok');
  };
  aktionen.versionAuto = (art) => neu(art === 'export' ? 'Export' : 'Veröffentlicht', art);
  aktionen.versionen = () => leiste.zeige(REITER);
  aktionen.aenderungenSeitExport = async () => {
    const v = letzteExportVersion(await liste());
    if (!v || !zustand.karte) return null;
    return { version: v, zeilen: vergleiche(v.karte, zustand.karte).zusammenfassung };
  };

  const zeigeDiff = (v) => {
    if (diffVon === v.id) {
      diffVon = null;
      zeichner.ueberlagerungen = [];
    } else {
      diffVon = v.id;
      const d = vergleiche(v.karte, zustand.karte);
      zeichner.ueberlagerungen = d.markierungen.slice(0, 3000).map((m) => ({ rechteck: m, farbe: FARBE[m.art], gestrichelt: m.art === 'weg' }));
      zustand.meldung(d.anzahl ? `Δ seit „${v.name}“: ${d.zusammenfassung.join(' · ')}` : `Keine Änderungen seit „${v.name}“`);
    }
    zeichner.anfordern();
    leiste.zeichne();
  };

  const wiederherstellen = async (v) => {
    if (!(await bestaetigen('Wiederherstellungspunkt laden', `Zone auf „${esc(v.name)}“ (${esc(new Date(v.zeit).toLocaleString('de-DE'))}) zurücksetzen? Der jetzige Stand wird vorher als Version gesichert; Strg+Z macht es rückgängig.`, { ok: 'Laden' }))) return;
    await neu('Vor Wiederherstellung', 'wiederherstellung');
    zustand.ausfuehren(`Version „${v.name}“ geladen`, wiederherstellenOps(zustand.karte, v.karte), zustand.karte, { alleEbenen: true });
    diffVon = null;
    zeichner.ueberlagerungen = [];
    zeichner.anfordern();
    zustand.meldung(`↺ „${v.name}“ geladen (Strg+Z = zurück)`, 'ok');
  };

  zustand.bei('zone', () => {
    if (!diffVon) return;
    diffVon = null;
    zeichner.ueberlagerungen = [];
  });

  leiste.registriere(REITER, async () => {
    const el = leiste.el;
    const l = await liste();
    if (leiste.aktiv !== REITER) return;
    const k = zustand.karte;
    const symbol = { manuell: '💾', export: '⬇', veroeffentlichen: '🚀', wiederherstellung: '↺' };
    el.innerHTML = `<div class="knopfreihe"><button class="akzent" data-v="neu">💾 Version speichern</button></div>
      <p class="leise">Automatisch bei Export/Veröffentlichen. Δ zeigt die Änderungen bis jetzt auf der Karte (grün neu, rot weg, gelb geändert).</p>
      ${l.length ? '' : '<p class="leise">Noch keine Versionen.</p>'}
      ${l.map((v, i) => {
        const d = k ? vergleiche(v.karte, k) : null;
        return `<div class="version${diffVon === v.id ? ' aktiv' : ''}"><div><b>${symbol[v.art] ?? '•'} ${esc(v.name)}</b> <span class="leise">${esc(new Date(v.zeit).toLocaleString('de-DE'))}</span></div>
          <div class="leise">${d ? (d.anzahl ? esc(d.zusammenfassung.slice(0, 4).join(' · ')) + (d.anzahl > 4 ? ' …' : '') : 'wie jetzt') : ''}</div>
          <div class="knopfreihe"><button data-v="diff" data-i="${i}">${diffVon === v.id ? 'Δ aus' : 'Δ Diff'}</button><button data-v="laden" data-i="${i}">↺ Laden</button><button data-v="name" data-i="${i}">✎</button><button class="gefahr" data-v="weg" data-i="${i}">🗑</button></div></div>`;
      }).join('')}`;
    el.querySelectorAll('button[data-v]').forEach((b) =>
      b.addEventListener('click', async () => {
        const v = l[Number(b.dataset.i)];
        if (b.dataset.v === 'neu') return aktionen.versionSpeichern();
        if (b.dataset.v === 'diff') return zeigeDiff(v);
        if (b.dataset.v === 'laden') return wiederherstellen(v);
        if (b.dataset.v === 'name') {
          const w = await formular('Version umbenennen', [{ name: 'name', label: 'Name', typ: 'text', wert: v.name, pflicht: true }]);
          if (w) await speichere(zustand.aktivId, l.map((x) => (x.id === v.id ? { ...x, name: w.name, art: 'manuell' } : x)));
          return;
        }
        if (b.dataset.v === 'weg' && (await bestaetigen('Version löschen', `„${esc(v.name)}“ löschen?`, { ok: 'Löschen', gefahr: true }))) {
          if (diffVon === v.id) zeigeDiff(v);
          await speichere(zustand.aktivId, l.filter((x) => x.id !== v.id));
        }
      }),
    );
  }, { gruppe: '🗂 Mehr', ereignisse: ['zone'] }); // Runde 19: rechts nur noch 4 Knöpfe (Bereiche + Versionen gebündelt)
}
