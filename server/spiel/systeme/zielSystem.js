import { KAPITEL, WERT_ZAEHLER } from '../konfiguration/ziele.js';
import { gibXp } from './levelSystem.js';

/**
 * Überlebens-Tagebuch (Phase 4.15): zählt am Ende jedes Ticks die Ereignisse der Zone (spielWelt.ereignisse) je Spieler mit,
 * hakt Ziele des aktuellen Kapitels ab (XP + Meldung + Ereignis 'zielErreicht'), schaltet Kapitel weiter ('kapitelGeschafft').
 * Zustand am Spieler: `spieler.ziele = { zaehler: { name: zahl }, erledigt: [zielId …], kapitel: index }` – bleibt über den Tod
 * hinaus und steht im Spielstand (spielstand.js `ziele`, geprüft mit `pruefeZiele`). Nicht im Tutorial, nicht für Bots.
 * Ereignis → Zähler: abgebaut{art,von} · hergestellt{von} · gebaut{bauwerk,von} · gefangen{von} · gepflanzt/geerntet/repariert{von}
 *   · tod{ziel:'zombie',von,variante} · 'morgen'{nachtArt} (tageszeitSystem, alle Lebenden zählen eine Nacht).
 * Werte: level (spieler.level), zonen (1 + erkundetAndere).
 */
export function neueZiele() {
  return { zaehler: {}, erledigt: [], kapitel: 0 };
}

function zaehle(s, name, menge = 1) {
  const z = s.ziele.zaehler;
  z[name] = (z[name] ?? 0) + menge;
}

function setzeWert(s, name, wert) {
  const z = s.ziele.zaehler;
  if (wert > (z[name] ?? 0)) z[name] = wert;
}

export function aktualisiereZiele(spielWelt) {
  if (spielWelt.tutorial || spielWelt.konfiguration.ziele?.aktiv === false) return;
  const spieler = new Map();
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.bot) continue;
    s.ziele ??= neueZiele();
    spieler.set(s.id, s);
  }
  if (!spieler.size) return;
  for (const e of spielWelt.ereignisse) {
    switch (e.typ) {
      case 'abgebaut':
        if (spieler.has(e.von)) zaehle(spieler.get(e.von), `abbau_${e.art}`, Math.max(1, e.menge ?? 1));
        break;
      case 'hergestellt':
      case 'gepflanzt':
      case 'geerntet':
      case 'repariert':
        if (spieler.has(e.von)) zaehle(spieler.get(e.von), e.typ);
        break;
      case 'gefangen':
        if (spieler.has(e.von)) zaehle(spieler.get(e.von), 'fisch', Math.max(1, e.anzahl ?? 1));
        break;
      case 'gebaut':
        if (spieler.has(e.von)) {
          zaehle(spieler.get(e.von), 'gebaut');
          zaehle(spieler.get(e.von), `gebaut_${e.bauwerk}`);
        }
        break;
      case 'tod':
        if (e.ziel === 'zombie' && spieler.has(e.von)) {
          zaehle(spieler.get(e.von), 'zombie');
          if (e.variante === 'brocken') zaehle(spieler.get(e.von), 'boss');
        }
        break;
      case 'morgen':
        for (const s of spieler.values()) {
          if (s.tot) continue;
          zaehle(s, 'naechte');
          if (e.nachtArt === 'blutmond') zaehle(s, 'blutmond');
        }
        break;
    }
  }
  for (const s of spieler.values()) {
    setzeWert(s, 'level', s.level ?? 1);
    setzeWert(s, 'zonen', 1 + Object.keys(s.erkundetAndere ?? {}).length);
    pruefeKapitel(spielWelt, s);
  }
}

/** Ziele des aktuellen Kapitels abhaken; fertiges Kapitel → nächstes (Fortschritt zählt dort sofort mit) */
export function pruefeKapitel(spielWelt, s) {
  const zi = s.ziele;
  while (zi.kapitel < KAPITEL.length) {
    const kap = KAPITEL[zi.kapitel];
    for (const z of kap.ziele) {
      if (zi.erledigt.includes(z.id) || (zi.zaehler[z.zaehler] ?? 0) < z.ziel) continue;
      zi.erledigt.push(z.id);
      gibXp(spielWelt, s, z.xp);
      spielWelt.melde(s.id, `📓 Ziel geschafft: ${z.text} (+${z.xp} XP)`);
      spielWelt.ereignis({ typ: 'zielErreicht', id: s.id, ziel: z.id });
    }
    if (!kap.ziele.every((z) => zi.erledigt.includes(z.id))) return;
    zi.kapitel++;
    gibXp(spielWelt, s, kap.bonusXp);
    const naechstes = KAPITEL[zi.kapitel];
    spielWelt.melde(s.id, `📓 Kapitel „${kap.titel}“ abgeschlossen – du bist jetzt ${kap.rang}! (+${kap.bonusXp} XP)${naechstes ? ` Weiter: „${naechstes.titel}“` : ' Alle Kapitel geschafft!'}`);
    spielWelt.ereignis({ typ: 'kapitelGeschafft', id: s.id, kapitel: kap.id });
  }
}

/** Für spielerDatenPrivat: aktuelles Kapitel kompakt (ändert sich selten → spart Netz) */
export function zieleFuerClient(s) {
  const zi = s.ziele;
  if (!zi) return undefined;
  const fertigeKapitel = KAPITEL.slice(0, zi.kapitel);
  const rang = fertigeKapitel.at(-1)?.rang ?? null;
  const kap = KAPITEL[zi.kapitel];
  if (!kap) return { kapitel: zi.kapitel, kapitelAnzahl: KAPITEL.length, titel: 'Alle Kapitel geschafft', rang, ziele: [] };
  return {
    kapitel: zi.kapitel,
    kapitelAnzahl: KAPITEL.length,
    titel: kap.titel,
    rang,
    ziele: kap.ziele.map((z) => ({ id: z.id, text: z.text, stand: Math.min(z.ziel, Math.floor(zi.zaehler[z.zaehler] ?? 0)), ziel: z.ziel, fertig: zi.erledigt.includes(z.id) })),
  };
}

/** Spielstand-Prüfung: nur Zahlen ≥ 0, nur bekannte Ziel-IDs, Kapitel im Bereich */
export function pruefeZiele(roh) {
  const z = neueZiele();
  if (!roh || typeof roh !== 'object') return z;
  const bekannt = new Set(KAPITEL.flatMap((k) => k.ziele.map((x) => x.id)));
  for (const [name, wert] of Object.entries(roh.zaehler ?? {})) {
    if (/^[a-z_]{1,40}$/.test(name) && Number.isFinite(wert) && wert >= 0) z.zaehler[name] = Math.min(Math.floor(wert), 1e7);
  }
  if (Array.isArray(roh.erledigt)) z.erledigt = [...new Set(roh.erledigt.filter((id) => bekannt.has(id)))];
  if (Number.isInteger(roh.kapitel)) z.kapitel = Math.max(0, Math.min(KAPITEL.length, roh.kapitel));
  for (const name of WERT_ZAEHLER) if (z.zaehler[name] === undefined) delete z.zaehler[name];
  return z;
}
