import { icon } from './icons.js';
import { dialog, formular, esc } from './dialoge.js';

/**
 * KI-Reiter (rechts): Chat mit dem eingebauten Assistenten (Hauptprozess studio/main/ki.mjs – Claude, Gemini, OpenAI,
 * Grok, DeepSeek) + Verbindung für externe KIs per MCP (studio/main/mcp.mjs). Werkzeug-Aufrufe erscheinen live im Verlauf.
 */
export class KiPanel {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('ki-panel');
    this.laeuft = false;
    this.el.innerHTML = `
      <div class="insp-abschnitt" style="grid-template-columns:1fr auto auto;align-items:center">
        <div><div class="insp-titel" id="ki-anbieter">KI-Assistent</div><div class="insp-unter" id="ki-modell"></div></div>
        <button class="knopf flach" data-ki="einstellungen" data-tipp="KI einstellen" data-text="Anbieter, Modell, API-Schlüssel">${icon('einstellungen', 16)}</button>
        <button class="knopf flach" data-ki="mcp" data-tipp="Mit Claude & Co. verbinden" data-text="MCP-Server für Claude Desktop, Claude Code, Cursor …">${icon('stecker', 16)}</button>
      </div>
      <div class="insp-abschnitt" style="padding:6px 12px"><label class="schalter" data-tipp="Vorschlagsmodus" data-text="KI-Änderungen bleiben vorläufig und farbig markiert – einzeln ablehnen (✕) oder übernehmen"><input type="checkbox" id="ki-vorschlag" /> Vorschlagsmodus (KI-Änderungen erst prüfen)</label></div>
      <div id="ki-vorschlaege"></div>
      <div class="ki-verlauf" id="ki-verlauf"><div class="insp-leer">Beschreibe, was gebaut werden soll – z. B. „Bau eine kleine Tankstelle mit Kiosk, zwei Autos und Loot hinter der Theke bei 40|30“.<br /><br />Die KI arbeitet mit denselben Werkzeugen wie du. Alles ist rückgängig machbar (Strg+Z).</div></div>
      <div class="ki-eingabe">
        <textarea class="feld" id="ki-text" placeholder="Nachricht an die KI … (Strg+Enter senden)"></textarea>
        <div class="ki-leiste"><button class="knopf flach" data-ki="neu">${icon('plus', 14)} Neues Gespräch</button><button class="knopf flach" data-ki="auftraege" data-tipp="Notizen abarbeiten" data-text="Die KI erledigt alle offenen Notiz-Pins (Aufträge) und hakt sie ab">${icon('notiz', 14)} Notizen abarbeiten</button><button class="knopf primaer" data-ki="senden">${icon('senden', 14)} Senden</button></div>
      </div>`;
    this.verlauf = this.el.querySelector('#ki-verlauf');
    this.el.querySelector('#ki-vorschlag').checked = !!studio.vorschlagsModus;
    this.el.querySelector('#ki-vorschlag').addEventListener('change', (e) => studio.setzeVorschlagsModus(e.target.checked));
    this.el.querySelector('#ki-vorschlaege').addEventListener('click', (e) => {
      const t = e.target.closest('[data-vs]');
      if (!t) return;
      const { vs, ref } = t.dataset;
      if (vs === 'weg') studio.lehneVorschlagAb(ref);
      else if (vs === 'ok') studio.uebernimmVorschlaege(ref);
      else if (vs === 'alleOk') studio.uebernimmVorschlaege();
      else if (vs === 'alleWeg') for (const x of [...studio.vorschlaege.vonZone(studio.dok.aktivId)].reverse()) studio.lehneVorschlagAb(String(x.id));
      else if (vs === 'zeige') studio.zeigeVorschlagOrt(ref);
    });
    this.text = this.el.querySelector('#ki-text');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ki]');
      if (!b) return;
      const a = b.dataset.ki;
      if (a === 'senden') this.senden();
      if (a === 'neu') this.neu();
      if (a === 'einstellungen') this.einstellungen();
      if (a === 'mcp') this.mcp();
      if (a === 'auftraege') {
        this.text.value = 'Rufe auftraege auf und arbeite alle offenen Notiz-Pins nacheinander ab. Hake jeden mit notiz_erledigt (mit kurzer antwort) ab. Bei Unklarheiten setze eine Notiz für Menschen.';
        this.senden();
      }
    });
    this.text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.senden();
      }
      e.stopPropagation();
    });
    studio.nativ.bei('ki-ereignis', (e) => {
      if (e.art === 'werkzeug') this.#nachricht('werkzeug', `▸ ${e.name}(${JSON.stringify(e.argumente).slice(0, 140)})`);
      else if (e.art === 'text') this.#nachricht('ki', e.text);
    });
    this.infoLaden();
  }

  /** Liste der offenen KI-Vorschläge der aktiven Zone (Phase 4.7) */
  zeichneVorschlaege() {
    const ziel = this.el.querySelector('#ki-vorschlaege');
    const st = this.studio;
    const liste = st.dok.aktivId ? st.vorschlaege.vonZone(st.dok.aktivId) : [];
    if (!liste.length) {
      ziel.innerHTML = '';
      return;
    }
    const farbe = { neu: 'var(--gruen)', weg: 'var(--rot)', geaendert: 'var(--gelb)' };
    ziel.innerHTML = `<div class="insp-abschnitt" style="gap:4px"><div class="insp-abschnitt-titel">KI-Vorschläge (${liste.length}) – grün neu · gelb geändert · rot gelöscht</div>
      <div style="max-height:260px;overflow:auto">${liste.map((e) => `<div class="vs-schritt"><div class="az-datei"><b style="flex:1">${esc(e.name)}</b><button class="knopf flach ws-mini" data-vs="ok" data-ref="${e.id}" title="Diesen Schritt übernehmen">${icon('pruefen', 13)}</button><button class="knopf flach ws-mini" data-vs="weg" data-ref="${e.id}" title="Diesen Schritt ablehnen (rückgängig)">${icon('schliessen', 13)}</button></div>
        ${e.elemente.map((el) => `<div class="az-datei" style="padding-left:12px"><span data-vs="zeige" data-ref="${e.id}:${esc(el.id)}" style="cursor:pointer;flex:1"><span style="color:${farbe[el.art]}">●</span> ${esc(el.text)}</span><button class="knopf flach ws-mini" data-vs="weg" data-ref="${e.id}:${esc(el.id)}" title="Nur das nicht übernehmen">${icon('schliessen', 12)}</button></div>`).join('')}</div>`).join('')}</div>
      <div class="insp-knoepfe"><button class="knopf primaer" data-vs="alleOk">${icon('pruefen', 13)} Alle übernehmen</button><button class="knopf gefahr" data-vs="alleWeg">Alle ablehnen</button></div></div>`;
  }

  async infoLaden() {
    this.info = await this.studio.nativ.aufruf('ki.info');
    const a = this.info.liste.find((x) => x.id === this.info.anbieter);
    this.el.querySelector('#ki-anbieter').textContent = a?.name ?? 'KI-Assistent';
    this.el.querySelector('#ki-modell').textContent = a?.hatSchluessel ? a.modell : 'kein API-Schlüssel – Zahnrad klicken';
  }

  #nachricht(art, text) {
    const leer = this.verlauf.querySelector('.insp-leer');
    if (leer) leer.remove();
    const d = document.createElement('div');
    d.className = `ki-nachricht ${art}`;
    d.textContent = text;
    this.verlauf.append(d);
    this.verlauf.scrollTop = this.verlauf.scrollHeight;
    return d;
  }

  async senden() {
    const text = this.text.value.trim();
    if (!text) return;
    if (this.laeuft) return this.studio.nativ.aufruf('ki.abbrechen');
    const a = this.info?.liste.find((x) => x.id === this.info.anbieter);
    if (!a?.hatSchluessel) return this.einstellungen();
    this.text.value = '';
    this.#nachricht('nutzer', text);
    const knopf = this.el.querySelector('[data-ki=senden]');
    this.laeuft = true;
    knopf.innerHTML = `${icon('stopp', 14)} Stopp`;
    const warte = this.#nachricht('werkzeug', '… denkt nach');
    try {
      const antwort = await this.studio.nativ.aufruf('ki.senden', { text });
      warte.remove();
      this.#nachricht('ki', antwort);
    } catch (f) {
      warte.remove();
      this.#nachricht('fehler', String(f.message ?? f).replace(/^Error invoking remote method 'studio': (Error: )?/, ''));
    } finally {
      this.laeuft = false;
      knopf.innerHTML = `${icon('senden', 14)} Senden`;
    }
  }

  async neu() {
    await this.studio.nativ.aufruf('ki.neu');
    this.verlauf.innerHTML = '<div class="insp-leer">Neues Gespräch.</div>';
  }

  async einstellungen() {
    const info = await this.studio.nativ.aufruf('ki.info');
    const f = formular([
      { name: 'anbieter', titel: 'Anbieter', art: 'auswahl', wert: info.anbieter, werte: info.liste.map((a) => [a.id, `${a.name}${a.hatSchluessel ? ' ✓' : ''}`]) },
      { name: 'modell', titel: 'Modell', art: 'text', wert: info.liste.find((a) => a.id === info.anbieter)?.modell, hilfe: 'Leer = Standardmodell des Anbieters.' },
      { name: 'schluessel', titel: 'API-Schlüssel', art: 'passwort', platzhalter: 'unverändert lassen', hilfe: 'Wird verschlüsselt auf diesem Rechner gespeichert (nie im Repo).' },
      { name: 'entfernen', titel: '', art: 'schalter', text: 'Gespeicherten Schlüssel dieses Anbieters löschen' },
    ]);
    f.feld('anbieter').addEventListener('change', (e) => {
      const a = info.liste.find((x) => x.id === e.target.value);
      f.feld('modell').value = a?.modell ?? '';
    });
    const ok = await dialog({ titel: 'KI-Assistent einstellen', icon: 'ki', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Speichern', wert: true, art: 'primaer' }] });
    if (!ok) return;
    const w = f.werte();
    await this.studio.nativ.aufruf('ki.einstellen', { anbieter: w.anbieter, modell: w.modell, schluessel: w.entfernen ? null : w.schluessel || undefined });
    await this.infoLaden();
  }

  /**
   * „KI verbinden“ (Phase 4.14): Schritt-für-Schritt statt Konfig-Wand – Status-Lampe (live), Reiter je KI-App,
   * Kopier-Knöpfe, Beispiel-Aufträge. Ausführlich: studio/MCP_ANLEITUNG.md.
   */
  async mcp() {
    const m = await this.studio.nativ.aufruf('mcp.info');
    if (!m.aktiv) return dialog({ titel: 'KI verbinden', icon: 'stecker', inhalt: 'Der MCP-Server läuft nicht (Port belegt oder STUDIO_OHNE_MCP gesetzt). Studio neu starten hilft meistens.' });
    const kopie = (text, id) => `<div class="code-kopie"><div class="code" style="white-space:pre-wrap;word-break:break-all">${esc(text)}</div><button class="knopf" data-kopie="${id}">${icon('kopieren', 13)} Kopieren</button></div>`;
    const texte = {
      desktop: m.claudeDesktop,
      code: m.claudeCode,
      url: m.url,
      kopf: `Authorization: Bearer ${m.token}`,
      b1: 'Schau dir im Browser Survival Studio die offenen Notizen an und arbeite sie ab.',
      b2: 'Öffne im Browser Survival Studio die Zone waldweg und bau am See eine kleine Fischerhütte mit Steg und etwas Loot.',
      b3: 'Mach in der Modell-Werkstatt den Zombie gruseliger: dunkler, mit Blut und Dreck, und speichere als Kopie.',
    };
    const reiter = {
      desktop: `<p>1. <b>Node.js</b> muss installiert sein (<a href="#" data-link="https://nodejs.org">nodejs.org</a>, LTS-Version).<br />2. Claude Desktop → <b>Einstellungen → Entwickler → Konfiguration bearbeiten</b>. Es öffnet sich <code>${esc(m.desktopDatei)}</code>.<br />3. Diesen Text hineinkopieren und speichern. Steht schon etwas unter <code>mcpServers</code>, nur den Eintrag <code>browser-survival-studio</code> dazusetzen.</p>${kopie(texte.desktop, 'desktop')}`,
      code: `<p>Terminal im Spielordner öffnen (<code>${esc(m.spielordner)}</code>) und <b>einmal</b> ausführen:</p>${kopie(texte.code, 'code')}<p class="neben">Danach in diesem Ordner <code>claude</code> starten. Mit <code>/mcp</code> siehst du, ob die Verbindung steht.</p>`,
      andere: `<p>Für Cursor, VS Code, Windsurf … einen MCP-Server vom Typ <b>Streamable HTTP</b> anlegen:</p>${kopie(texte.url, 'url')}${kopie(texte.kopf, 'kopf')}<p class="neben">Der Kopf (Header) ist das Passwort. Ohne ihn lehnt das Studio ab.</p>`,
    };
    const status = () => {
      const lampe = this.studio.mcpLetzte ?? m.zuletzt;
      const vor = lampe ? Math.round((Date.now() - lampe) / 1000) : null;
      const text = vor === null ? 'Studio bereit, noch keine KI verbunden' : vor < 15 ? 'KI ist verbunden und arbeitet gerade' : `KI war verbunden, letzte Anfrage vor ${vor < 120 ? `${vor} s` : `${Math.round(vor / 60)} min`}`;
      return `<span class="lampe ${vor !== null && vor < 120 ? 'an' : ''}"></span><span>${esc(text)}</span><span class="neben" style="margin-left:auto">${m.werkzeuge} Werkzeuge · nur auf diesem Rechner</span>`;
    };
    const inhalt = `<div class="mcp-status" id="mcp-status">${status()}</div>
      <div style="line-height:1.6;color:var(--text-2);margin:10px 0"><b>Was ist das?</b> Mit MCP steuert eine KI-App auf deinem Rechner (Claude Desktop, Claude Code, Cursor …) das Studio fern, wie ein zweiter Mensch an der Maus. Sie kann Zonen bauen, Modelle bemalen, Sounds schneiden, Items anlegen und deine Notizen abarbeiten. Jede Aktion ist mit Strg+Z rückgängig zu machen.<br /><span class="neben">Unterschied zum KI-Reiter: Der braucht einen API-Schlüssel (Abrechnung pro Nutzung). MCP nutzt dein vorhandenes Claude-Abo.</span></div>
      <div class="mcp-schritt"><div class="nr">1</div><div><b>Deine KI-App einmalig verbinden</b><div class="mcp-reiter"><button class="knopf aktiv" data-reiter="desktop">Claude Desktop</button><button class="knopf" data-reiter="code">Claude Code (Terminal)</button><button class="knopf" data-reiter="andere">Cursor & andere</button></div><div id="mcp-reiter-inhalt">${reiter.desktop}</div></div></div>
      <div class="mcp-schritt"><div class="nr">2</div><div><b>KI-App neu starten</b><br />In Claude Desktop taucht dann unten im Eingabefeld unter „Werkzeuge“ der Eintrag <b>browser-survival-studio</b> auf. Das Studio muss dabei offen sein. Sobald die KI das erste Mal fragt, wird die Lampe oben grün.</div></div>
      <div class="mcp-schritt"><div class="nr">3</div><div><b>Sag der KI, was sie tun soll</b>, zum Beispiel:${kopie(texte.b1, 'b1')}${kopie(texte.b2, 'b2')}${kopie(texte.b3, 'b3')}<span class="neben">Tipp: Den Vorschlagsmodus im KI-Reiter einschalten, dann siehst du jede Änderung erst markiert und kannst sie einzeln wegklicken.</span></div></div>`;
    await dialog({
      titel: 'KI verbinden (MCP), Schritt für Schritt',
      icon: 'stecker',
      breit: true,
      inhalt,
      knoepfe: [{ text: 'Ausführliche Anleitung', wert: 'anleitung' }, { text: 'Fertig', wert: true, art: 'primaer' }],
      beimOeffnen: (d) => {
        const takt = setInterval(() => {
          if (!d.isConnected) return clearInterval(takt);
          d.querySelector('#mcp-status').innerHTML = status();
        }, 1000);
        d.addEventListener('click', async (e) => {
          const r = e.target.closest('[data-reiter]');
          if (r) {
            d.querySelectorAll('[data-reiter]').forEach((b) => b.classList.toggle('aktiv', b === r));
            d.querySelector('#mcp-reiter-inhalt').innerHTML = reiter[r.dataset.reiter];
          }
          const k = e.target.closest('[data-kopie]');
          if (k) {
            await navigator.clipboard.writeText(texte[k.dataset.kopie]).catch(() => {});
            k.innerHTML = `${icon('pruefen', 13)} Kopiert`;
            setTimeout(() => (k.innerHTML = `${icon('kopieren', 13)} Kopieren`), 1500);
          }
          const l = e.target.closest('[data-link]');
          if (l) {
            e.preventDefault();
            this.studio.nativ.aufruf('link.oeffnen', { url: l.dataset.link });
          }
        });
      },
    }).then((w) => w === 'anleitung' && this.studio.nativ.aufruf('link.oeffnen', { url: 'https://github.com/dennwa/browser_survival/blob/main/studio/MCP_ANLEITUNG.md' }));
  }
}
