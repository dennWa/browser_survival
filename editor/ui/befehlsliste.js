import { ANZEIGEN } from '../kern/ebenen.js';
import { katalog } from '../kern/katalog.js';

/**
 * Alle Befehle des Editors (Editor 2.0, Schritt 1.2) + Aufbau von Menüleiste, Schnellleiste, Werkzeugleiste und Kontextmenü.
 * Neue Funktion = hier einen Befehl anmelden (ID 'bereich.name') und ihn in MENUES/… eintragen – Tastatur, Menü, Tooltip
 * und Hilfe (?) kommen dann von selbst. Kürzel-Schreibweise siehe ui/befehle.js.
 *
 * t = { zustand, zeichner, aktionen, datei, werkzeuge, layout, links, rechts, assets, schalteAnsicht, zeigeHilfe, zeigePalette }
 */
export function meldeBefehleAn(befehle, t) {
  const { zustand: z, zeichner, aktionen: a, datei } = t;
  const karte = () => !!z.karte;
  const in2d = () => !!z.karte && z.ansicht === '2d';
  const gewaehlt = () => z.gewaehlte().length > 0;
  const bereichOderAuswahl = () => !!z.karte && (!!z.auswahlRechteck || gewaehlt());
  // Genau ein Objekt gewählt, dessen Typ ein Bibliotheks-Modell zeigt → Asset-ID (für die Werkstatt, 5.1)
  const gewaehltesModell = () => {
    const g = z.gewaehlte();
    return g.length === 1 && g[0].s === 'objekte' ? (z.karte?.s('typen').get(g[0].wert.typ)?.asset ?? null) : null;
  };
  const werkzeug = (id, name, symbol, kuerzel, ziel, aktiv) => ({ id, name, symbol, kuerzel, gruppe: 'Werkzeuge', verfuegbar: in2d, grund: 'nur in 2D (Taste 3)', ausfuehren: () => a.werkzeug(ziel), aktiv });

  befehle.registriere(
    // --- Datei ---------------------------------------------------------------------
    { id: 'datei.neu', name: 'Neue Zone…', symbol: '➕', gruppe: 'Datei', kuerzel: ['Alt+N'], ausfuehren: () => datei.neu() },
    { id: 'datei.oeffnen', name: 'Öffnen…', symbol: '📂', gruppe: 'Datei', kuerzel: ['Strg+O'], ausfuehren: () => datei.oeffnen() },
    { id: 'datei.speichern', name: 'Speichern (lokal im Browser)', symbol: '💾', gruppe: 'Datei', kuerzel: ['Strg+S'], inEingabe: true, verfuegbar: karte, ausfuehren: () => datei.speichern() },
    { id: 'datei.herunterladen', name: 'Entwurf als Datei herunterladen', symbol: '⬇', gruppe: 'Datei', kuerzel: ['Strg+Umschalt+S'], inEingabe: true, verfuegbar: karte, ausfuehren: () => datei.herunterladen() },
    { id: 'datei.alleHerunterladen', name: 'Alle Entwürfe des Projekts herunterladen', symbol: '🗂', gruppe: 'Datei', verfuegbar: () => z.zonen.size > 0, ausfuehren: () => datei.alleHerunterladen() },
    { id: 'datei.exportJson', name: 'Karte als JSON (für KI/Menschen)', symbol: '📄', gruppe: 'Datei', verfuegbar: karte, ausfuehren: () => datei.exportJson() },
    { id: 'datei.liesmich', name: 'LIESMICH.txt (Feld-Erklärung für KIs)', symbol: '📝', gruppe: 'Datei', ausfuehren: () => datei.liesmich() },
    { id: 'datei.veroeffentlichen', name: 'Veröffentlichen…', kurz: 'Veröffentlichen', symbol: '🚀', gruppe: 'Datei', verfuegbar: karte, ausfuehren: () => datei.veroeffentlichen() },
    { id: 'datei.backup', name: 'Komplett-Backup herunterladen (alle Entwürfe, Prefabs, Einstellungen)', kurz: 'Backup', symbol: '🛟', gruppe: 'Datei', ausfuehren: () => datei.backup() },
    { id: 'datei.wiederherstellen', name: 'Backup wiederherstellen…', symbol: '♻', gruppe: 'Datei', ausfuehren: () => datei.wiederherstellen() },
    { id: 'datei.speicherplatz', name: 'Speicherplatz & Status…', symbol: '💽', gruppe: 'Datei', ausfuehren: () => datei.speicherplatz() },
    { id: 'datei.zoneEntfernen', name: 'Zone aus dem Projekt entfernen…', symbol: '🗑', gruppe: 'Datei', verfuegbar: karte, ausfuehren: () => datei.zoneEntfernen() },
    { id: 'datei.zumSpiel', name: 'Zurück zum Spiel', symbol: '🧟', gruppe: 'Datei', ausfuehren: () => (location.href = new URL('../client/', location.href).href) },

    // --- Bearbeiten ---------------------------------------------------------------
    { id: 'bearbeiten.rueckgaengig', name: 'Rückgängig', symbol: '↶', gruppe: 'Bearbeiten', kuerzel: ['Strg+Z'], verfuegbar: () => !!z.verlauf?.kannZurueck, ausfuehren: () => z.rueckgaengig() },
    { id: 'bearbeiten.wiederholen', name: 'Wiederholen', symbol: '↷', gruppe: 'Bearbeiten', kuerzel: ['Strg+Y', 'Strg+Umschalt+Z'], verfuegbar: () => !!z.verlauf?.kannVor, ausfuehren: () => z.wiederholen() },
    { id: 'bearbeiten.kopieren', name: 'Kopieren', symbol: '📋', gruppe: 'Bearbeiten', kuerzel: ['Strg+C'], verfuegbar: bereichOderAuswahl, ausfuehren: () => a.kopieren() },
    { id: 'bearbeiten.ausschneiden', name: 'Ausschneiden', symbol: '✂', gruppe: 'Bearbeiten', kuerzel: ['Strg+X'], verfuegbar: bereichOderAuswahl, ausfuehren: () => a.ausschneiden() },
    { id: 'bearbeiten.einfuegen', name: 'Einfügen (an der Maus)', kurz: 'Einfügen', symbol: '📥', gruppe: 'Bearbeiten', kuerzel: ['Strg+V'], verfuegbar: () => !!z.zwischenablage && karte(), ausfuehren: () => a.einfuegen() },
    { id: 'bearbeiten.duplizieren', name: 'Duplizieren', symbol: '⧉', gruppe: 'Bearbeiten', kuerzel: ['Strg+D'], verfuegbar: gewaehlt, ausfuehren: () => a.duplizieren() },
    { id: 'bearbeiten.drehen', name: 'Drehen 90°', kurz: 'Drehen', symbol: '⟳', gruppe: 'Bearbeiten', kuerzel: ['R'], verfuegbar: in2d, ausfuehren: () => a.drehen() },
    // --- Anordnen (7.2): je 1 Undo-Schritt; Tasten frei belegbar (Hilfe → ⌨) --------------------------------
    ...[['links', 'Links ausrichten', '⇤', 'Links'], ['mitteH', 'Waagerecht mittig ausrichten', '↔', 'Mitte'], ['rechts', 'Rechts ausrichten', '⇥', 'Rechts'], ['oben', 'Oben ausrichten', '⤒', 'Oben'], ['mitteV', 'Senkrecht mittig ausrichten', '↕', 'Mitte'], ['unten', 'Unten ausrichten', '⤓', 'Unten']].map(([wie, name, symbol, kurz]) => ({ id: `anordnen.${wie}`, name, kurz, symbol, gruppe: 'Anordnen', verfuegbar: () => in2d() && z.gewaehlte().length >= 2, grund: 'mindestens 2 Elemente wählen', ausfuehren: () => a.anordnen('ausrichten', wie) })),
    { id: 'anordnen.verteilenH', name: 'Waagerecht verteilen (gleiche Abstände)', kurz: 'Verteilen', symbol: '⇹', gruppe: 'Anordnen', verfuegbar: () => in2d() && z.gewaehlte().length >= 3, grund: 'mindestens 3 Elemente wählen', ausfuehren: () => a.anordnen('verteilen', 'h') },
    { id: 'anordnen.verteilenV', name: 'Senkrecht verteilen (gleiche Abstände)', kurz: 'Verteilen', symbol: '⇳', gruppe: 'Anordnen', verfuegbar: () => in2d() && z.gewaehlte().length >= 3, grund: 'mindestens 3 Elemente wählen', ausfuehren: () => a.anordnen('verteilen', 'v') },
    { id: 'anordnen.spiegelnH', name: 'Waagerecht spiegeln (links ⇄ rechts, mit Kacheln im Bereich)', kurz: 'Spiegeln ⇄', symbol: '⇋', gruppe: 'Anordnen', verfuegbar: () => in2d() && (z.gewaehlte().length > 0 || !!z.auswahlRechteck), grund: 'erst etwas wählen oder einen Bereich markieren', ausfuehren: () => a.anordnen('spiegeln', 'h') },
    { id: 'anordnen.spiegelnV', name: 'Senkrecht spiegeln (oben ⇄ unten, mit Kacheln im Bereich)', kurz: 'Spiegeln ⇅', symbol: '⇵', gruppe: 'Anordnen', verfuegbar: () => in2d() && (z.gewaehlte().length > 0 || !!z.auswahlRechteck), grund: 'erst etwas wählen oder einen Bereich markieren', ausfuehren: () => a.anordnen('spiegeln', 'v') },
    { id: 'bearbeiten.loeschen', name: 'Löschen', symbol: '🗑', gruppe: 'Bearbeiten', kuerzel: ['Entf', 'Rück'], verfuegbar: bereichOderAuswahl, ausfuehren: () => a.auswahlLoeschen() },
    { id: 'bearbeiten.bereichLeeren', name: 'Bereich leeren (Rasen, Elemente weg)', kurz: 'Leeren', symbol: '🧹', gruppe: 'Bearbeiten', verfuegbar: () => !!z.auswahlRechteck, ausfuehren: () => a.loeschen() },
    { id: 'bearbeiten.alles', name: 'Ganze Zone markieren', symbol: '⬚', gruppe: 'Bearbeiten', kuerzel: ['Strg+A'], verfuegbar: karte, ausfuehren: () => a.alles() },
    { id: 'bearbeiten.abbrechen', name: 'Abbrechen / Auswahl aufheben', symbol: '✕', gruppe: 'Bearbeiten', kuerzel: ['Esc'], ausfuehren: () => a.abbrechen() },
    { id: 'bearbeiten.werkstatt', name: 'Modell in der Werkstatt bearbeiten…', kurz: 'Werkstatt', symbol: '🛠', gruppe: 'Bearbeiten', verfuegbar: () => !!gewaehltesModell() && !!a.werkstatt, grund: 'ein Objekt mit eigenem 3D-Modell wählen', ausfuehren: () => a.werkstatt(gewaehltesModell()) },
    { id: 'bearbeiten.alsPrefab', name: 'Als Prefab speichern…', kurz: 'Als Prefab', symbol: '🏠', gruppe: 'Bearbeiten', verfuegbar: bereichOderAuswahl, ausfuehren: () => a.prefabSpeichern?.() },
    ...['Links', 'Rechts', 'Hoch', 'Runter'].map((richtung) => ({
      id: `bearbeiten.schiebe${richtung}`,
      name: `Auswahl verschieben (${richtung.toLowerCase()}; Umschalt = 5)`,
      gruppe: 'Bearbeiten',
      kuerzel: [richtung, `Umschalt+${richtung}`],
      verfuegbar: karte,
      ausfuehren: (e) => {
        const n = e?.shiftKey ? 5 : 1;
        const [dx, dy] = { Links: [-n, 0], Rechts: [n, 0], Hoch: [0, -n], Runter: [0, n] }[richtung];
        a.verschieben(dx, dy);
      },
    })),

    // --- Ansicht ------------------------------------------------------------------
    { id: 'ansicht.dreiD', name: '2D / 3D umschalten', kurz: '3D', symbol: '🧊', gruppe: 'Ansicht', kuerzel: ['3'], verfuegbar: karte, aktiv: () => z.ansicht === '3d', ausfuehren: () => t.schalteAnsicht() },
    { id: 'ansicht.einpassen', name: 'Ganze Zone zeigen', symbol: '⤢', gruppe: 'Ansicht', kuerzel: ['F'], verfuegbar: karte, ausfuehren: () => (z.ansicht === '3d' ? t.ansicht3d?.zoomen(0) : zeichner.einpassen()) },
    { id: 'ansicht.zoomRein', name: 'Hineinzoomen', symbol: '＋', gruppe: 'Ansicht', kuerzel: ['+', '='], verfuegbar: karte, ausfuehren: () => (z.ansicht === '3d' ? t.ansicht3d?.zoomen(1.25) : zeichner.zoomen(1.25)) },
    { id: 'ansicht.zoomRaus', name: 'Herauszoomen', symbol: '－', gruppe: 'Ansicht', kuerzel: ['-'], verfuegbar: karte, ausfuehren: () => (z.ansicht === '3d' ? t.ansicht3d?.zoomen(0.8) : zeichner.zoomen(0.8)) },
    { id: 'ansicht.links', name: 'Linke Seitenleiste (Assets, Prefabs, Zonen, Räume)', symbol: '◧', gruppe: 'Ansicht', aktiv: () => t.layout.sichtbar('links'), ausfuehren: () => t.layout.umschalten('links') },
    { id: 'ansicht.rechts', name: 'Rechte Seitenleiste (Inspektor, Ebenen, Prüfung)', symbol: '◨', gruppe: 'Ansicht', aktiv: () => t.layout.sichtbar('rechts'), ausfuehren: () => t.layout.umschalten('rechts') },
    { id: 'ansicht.fokus', name: 'Fokus-Modus (nur Karte)', symbol: '⛶', gruppe: 'Ansicht', kuerzel: ['Tab'], aktiv: () => t.layout.fokus, ausfuehren: () => t.layout.fokusUmschalten() },
    { id: 'ansicht.ebenen', name: 'Ebenen (ein-/ausblenden, sperren)', symbol: '🗂', gruppe: 'Ansicht', ausfuehren: () => t.layout.zeigeReiter('rechts', 'Ebenen') },
    ...ANZEIGEN.map((anz) => ({ id: `ansicht.${anz.id}`, name: anz.name, ...(anz.kurz ? { kurz: anz.kurz, symbol: anz.symbol } : {}), ...(anz.kuerzel ? { kuerzel: anz.kuerzel } : {}), gruppe: 'Ansicht', aktiv: () => z.sichtbar(anz.id), ausfuehren: () => z.setzeEbene(anz.id, 'sichtbar', !z.sichtbar(anz.id)) })),
    { id: 'ansicht.suche', name: 'Assets suchen', symbol: '🔎', gruppe: 'Ansicht', kuerzel: ['Strg+F'], ausfuehren: () => {
        t.layout.zeige('links');
        t.assets.fokusSuche();
      } },

    // --- Werkzeuge ----------------------------------------------------------------
    werkzeug('werkzeug.auswahl', 'Auswahl (Klick, Bereich ziehen)', '⬚', ['V'], 'auswahl', () => z.werkzeug === 'auswahl'),
    werkzeug('werkzeug.hand', 'Schwenken', '✋', ['H'], 'hand', () => z.werkzeug === 'hand'),
    werkzeug('werkzeug.pinsel', 'Pinsel', '🖌', ['B'], 'malen:pinsel', () => z.werkzeug === 'malen' && z.malModus === 'pinsel'),
    werkzeug('werkzeug.rechteck', 'Rechteck (Umschalt: nur Rand)', '▭', ['U'], 'malen:rechteck', () => z.werkzeug === 'malen' && z.malModus === 'rechteck'),
    werkzeug('werkzeug.linie', 'Linie / Mauer ziehen', '╱', ['L'], 'malen:linie', () => z.werkzeug === 'malen' && z.malModus === 'linie'),
    werkzeug('werkzeug.fuellen', 'Füllen', '🪣', ['G'], 'malen:fuellen', () => z.werkzeug === 'malen' && z.malModus === 'fuellen'),
    werkzeug('werkzeug.radierer', 'Radierer', '⌫', ['E'], 'radierer', () => z.werkzeug === 'radierer'),
    werkzeug('werkzeug.pipette', 'Pipette (auch Alt+Klick)', '💧', ['I'], 'pipette', () => z.werkzeug === 'pipette'),
    { ...werkzeug('werkzeug.terrain', 'Gelände formen', '⛰', ['T'], 'terrain', () => z.werkzeug === 'terrain'), ausfuehren: () => t.assets.waehleId(z.eintrag?.werkzeug?.startsWith('terrain') ? z.eintrag.id : 'werkzeug:terrain-heben') },
    { ...werkzeug('werkzeug.farbe', 'Boden bemalen', '🎨', ['K'], 'farbe', () => z.werkzeug === 'farbe'), ausfuehren: () => t.assets.waehleId(z.eintrag?.werkzeug?.startsWith('farbe') ? z.eintrag.id : 'werkzeug:farbe-pinsel') },
    werkzeug('werkzeug.zone', 'Zonengröße (Griffe)', '⤡', ['Z'], 'zone', () => z.werkzeug === 'zone'),
    { id: 'werkzeug.kleiner', name: 'Pinsel kleiner', gruppe: 'Werkzeuge', kuerzel: ['['], ausfuehren: () => a.pinselGroesse(-1) },
    { id: 'werkzeug.groesser', name: 'Pinsel größer', gruppe: 'Werkzeuge', kuerzel: [']'], ausfuehren: () => a.pinselGroesse(1) },

    // --- Zone ---------------------------------------------------------------------
    { id: 'zone.groesse', name: 'Größe ändern…', symbol: '⤡', gruppe: 'Zone', verfuegbar: karte, ausfuehren: () => a.groesseDialog() },
    { id: 'zone.einstellungen', name: 'Zonen-Werte (Wetter, Zombies, Loot, Tiere)', symbol: '⚙', gruppe: 'Zone', verfuegbar: karte, ausfuehren: () => {
        t.layout.zeige('rechts');
        a.zonenEinstellungen();
      } },
    { id: 'zone.uebersicht', name: 'Zonen-Übersicht & Weltkarte', symbol: '🗺', gruppe: 'Zone', ausfuehren: () => t.layout.zeigeReiter('links', '🗺 Zonen') },
    { id: 'zone.vorschlaege', name: 'Übergänge vorschlagen', symbol: '💡', gruppe: 'Zone', verfuegbar: karte, ausfuehren: () => a.vorschlaege?.() },
    { id: 'zone.raeume', name: 'Räume', symbol: '🚪', gruppe: 'Zone', verfuegbar: karte, ausfuehren: () => t.layout.zeigeReiter('links', '🚪 Räume') },
    { id: 'zone.prefabs', name: 'Prefabs (Vorlagen)', symbol: '🏠', gruppe: 'Zone', ausfuehren: () => t.layout.zeigeReiter('links', '🏠 Prefabs') },
    { id: 'zone.pruefung', name: 'Prüfung anzeigen', symbol: '✓', gruppe: 'Zone', verfuegbar: karte, ausfuehren: () => t.layout.zeigeReiter('rechts', 'Prüfung') },
    { id: 'zone.testen', name: 'Im Spiel testen', kurz: 'Testen', symbol: '▶', gruppe: 'Zone', kuerzel: ['Strg+Enter'], verfuegbar: karte, ausfuehren: () => a.testen?.() },

    // --- KI -----------------------------------------------------------------------
    { id: 'ki.helfer', name: 'KI-Helfer (Gemini-Chat)', kurz: 'Helfer', symbol: '🤖', gruppe: 'KI', kuerzel: ['Strg+J'], aktiv: () => t.layout.sichtbar('ki'), ausfuehren: () => t.layout.umschalten('ki') },
    { id: 'ki.ausschnitt', name: 'Ausschnitt für KI…', kurz: 'KI-Ausschnitt', symbol: '🤖', gruppe: 'KI', verfuegbar: karte, ausfuehren: () => a.ausschnittExport?.() },
    { id: 'ki.import', name: 'KI-Antwort importieren (mit Vorschau)…', symbol: '📥', gruppe: 'KI', verfuegbar: karte, ausfuehren: () => a.kiImport?.() },

    // --- Hilfe --------------------------------------------------------------------
    { id: 'hilfe.kuerzel', name: 'Tastenkürzel & Befehle (anpassen)', symbol: '⌨', gruppe: 'Hilfe', kuerzel: ['?', 'F1'], ausfuehren: () => t.zeigeHilfe() },
    { id: 'hilfe.palette', name: 'Befehlspalette (Befehl suchen & ausführen)', symbol: '🔎', gruppe: 'Hilfe', kuerzel: ['Strg+K'], inEingabe: true, ausfuehren: () => t.zeigePalette() },
    { id: 'hilfe.anleitung', name: 'Anleitung (LIESMICH)', symbol: '📖', gruppe: 'Hilfe', ausfuehren: () => window.open(new URL('LIESMICH.md', location.href).href, '_blank', 'noopener') },
  );
}

/** Menü „Einfügen“: häufige Katalog-Einträge direkt wählbar */
function einfuegenEintraege(t) {
  const ids = [
    ['marker:start', 'Spieler-Start'], ['marker:zombie', 'Zombie-Spawn'], ['marker:horde', 'Horden-Spawnpunkt'], ['marker:loot', 'Loot-Punkt'], '-',
    ['objekt:licht', 'Lampe'], ['objekt:laterne', 'Straßenlaterne'], ['objekt:werkbank', 'Werkbank'], '-',
    ['bereich:uebergang', 'Übergang (am Rand)'], ['marker:ankunft', 'Ankunftspunkt'], ['bereich:raum', 'Raum markieren'], ['bereich:tier', 'Hasen-Bereich'],
  ];
  return [
    ...ids.map((e) => {
      if (e === '-') return '-';
      const [id, name] = e;
      const k = katalog().find((x) => x.id === id);
      return { name, symbol: k?.symbol ?? '', ausfuehren: () => t.assets.waehleId(id), verfuegbar: () => !!t.zustand.karte };
    }),
    '-',
    'zone.prefabs',
    'bearbeiten.einfuegen',
  ];
}

export function menues(t) {
  return [
    { titel: 'Datei', eintraege: ['datei.neu', 'datei.oeffnen', '-', 'datei.speichern', 'datei.herunterladen', 'datei.alleHerunterladen', '-', { ueberschrift: 'Export' }, 'datei.exportJson', 'datei.liesmich', 'ki.ausschnitt', '-', 'datei.veroeffentlichen', '-', { ueberschrift: 'Sicherung' }, 'datei.backup', 'datei.wiederherstellen', 'datei.speicherplatz', '-', 'datei.zoneEntfernen', 'datei.zumSpiel'] },
    { titel: 'Bearbeiten', eintraege: ['bearbeiten.rueckgaengig', 'bearbeiten.wiederholen', '-', 'bearbeiten.kopieren', 'bearbeiten.ausschneiden', 'bearbeiten.einfuegen', 'bearbeiten.duplizieren', 'bearbeiten.drehen', 'bearbeiten.loeschen', '-', 'bearbeiten.alles', 'bearbeiten.bereichLeeren', 'bearbeiten.alsPrefab', 'bearbeiten.werkstatt', 'bearbeiten.abbrechen', '-', { ueberschrift: 'Anordnen' }, 'anordnen.links', 'anordnen.mitteH', 'anordnen.rechts', 'anordnen.oben', 'anordnen.mitteV', 'anordnen.unten', 'anordnen.verteilenH', 'anordnen.verteilenV', 'anordnen.spiegelnH', 'anordnen.spiegelnV'] },
    { titel: 'Ansicht', eintraege: ['ansicht.dreiD', 'ansicht.einpassen', 'ansicht.zoomRein', 'ansicht.zoomRaus', '-', 'ansicht.links', 'ansicht.rechts', 'ki.helfer', 'ansicht.fokus', '-', 'ansicht.ebenen', ...ANZEIGEN.map((a) => `ansicht.${a.id}`), '-', 'ansicht.suche'] },
    { titel: 'Einfügen', eintraege: () => einfuegenEintraege(t) },
    { titel: 'Werkzeuge', eintraege: WERKZEUGLEISTE.filter((x) => x !== '-').concat(['-', 'werkzeug.kleiner', 'werkzeug.groesser']) },
    { titel: 'Zone', eintraege: ['zone.einstellungen', 'zone.groesse', '-', 'zone.uebersicht', 'zone.vorschlaege', 'zone.raeume', 'zone.prefabs', '-', 'zone.pruefung', 'zone.testen'] },
    { titel: 'KI', eintraege: ['ki.helfer', 'ki.ausschnitt', 'ki.import'] },
    { titel: 'Hilfe', eintraege: ['hilfe.palette', 'hilfe.kuerzel', 'hilfe.anleitung'] },
  ];
}

export const SCHNELLLEISTE = ['bearbeiten.rueckgaengig', 'bearbeiten.wiederholen', '-', 'ansicht.dreiD', 'ansicht.loot', 'zone.testen', 'datei.veroeffentlichen', '-', 'ki.helfer', 'ansicht.links', 'ansicht.rechts'];

export const WERKZEUGLEISTE = ['werkzeug.auswahl', 'werkzeug.hand', '-', 'werkzeug.pinsel', 'werkzeug.rechteck', 'werkzeug.linie', 'werkzeug.fuellen', 'werkzeug.radierer', 'werkzeug.pipette', '-', 'werkzeug.terrain', 'werkzeug.farbe', '-', 'werkzeug.zone'];

/** Kontextmenü je nach Ziel (Rechtsklick auf Element / leere Fläche) */
export function kontextEintraege(t, ziel) {
  const z = t.zustand;
  if (z.gewaehlte().length || ziel?.treffer)
    return ['bearbeiten.duplizieren', 'bearbeiten.drehen', ...(z.gewaehlte().length >= 2 ? ['-', 'anordnen.links', 'anordnen.oben', 'anordnen.verteilenH', 'anordnen.spiegelnH'] : []), '-', 'bearbeiten.kopieren', 'bearbeiten.ausschneiden', 'bearbeiten.alsPrefab', 'ki.ausschnitt', ...(z.gewaehlte().length === 1 && z.gewaehlte()[0].s === 'objekte' ? ['bearbeiten.werkstatt'] : []), '-', 'bearbeiten.loeschen'];
  if (z.auswahlRechteck) return ['bearbeiten.kopieren', 'bearbeiten.ausschneiden', 'bearbeiten.bereichLeeren', '-', 'anordnen.spiegelnH', 'anordnen.spiegelnV', '-', 'bearbeiten.alsPrefab', 'ki.ausschnitt'];
  return ['bearbeiten.einfuegen', 'bearbeiten.alles', '-', 'ansicht.einpassen', 'ansicht.ebenen', 'zone.einstellungen'];
}
