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
      <div class="ki-verlauf" id="ki-verlauf"><div class="insp-leer">Beschreibe, was gebaut werden soll – z. B. „Bau eine kleine Tankstelle mit Kiosk, zwei Autos und Loot hinter der Theke bei 40|30“.<br /><br />Die KI arbeitet mit denselben Werkzeugen wie du. Alles ist rückgängig machbar (Strg+Z).</div></div>
      <div class="ki-eingabe">
        <textarea class="feld" id="ki-text" placeholder="Nachricht an die KI … (Strg+Enter senden)"></textarea>
        <div class="ki-leiste"><button class="knopf flach" data-ki="neu">${icon('plus', 14)} Neues Gespräch</button><button class="knopf primaer" data-ki="senden">${icon('senden', 14)} Senden</button></div>
      </div>`;
    this.verlauf = this.el.querySelector('#ki-verlauf');
    this.text = this.el.querySelector('#ki-text');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ki]');
      if (!b) return;
      const a = b.dataset.ki;
      if (a === 'senden') this.senden();
      if (a === 'neu') this.neu();
      if (a === 'einstellungen') this.einstellungen();
      if (a === 'mcp') this.mcp();
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

  async mcp() {
    const m = await this.studio.nativ.aufruf('mcp.info');
    if (!m.aktiv) return dialog({ titel: 'MCP', inhalt: 'Der MCP-Server läuft nicht.' });
    await dialog({
      titel: 'KI per MCP verbinden',
      icon: 'stecker',
      breit: true,
      inhalt: `<div style="line-height:1.6;color:var(--text-2)">Das Studio stellt seine Werkzeuge als <b>MCP-Server</b> bereit – solange es läuft, kann eine KI direkt in der geöffneten Zone bauen (jede Aktion = ein Undo-Schritt „KI: …“).</div>
        <div class="insp-abschnitt-titel">Claude Code (Terminal im Spielordner)</div><div class="code">${esc(m.claudeCode)}</div>
        <div class="insp-abschnitt-titel">Claude Desktop · Einstellungen → Entwickler → Konfiguration bearbeiten</div><div class="code">${esc(m.claudeDesktop)}</div>
        <div class="insp-abschnitt-titel">Andere (Cursor, VS Code …) · Streamable HTTP</div><div class="code">URL: ${esc(m.url)}\nHeader: Authorization: Bearer ${esc(m.token)}</div>
        <div class="hinweis-kasten">Nur auf diesem Rechner erreichbar (127.0.0.1) und mit Token geschützt. Danach in der KI z. B. sagen: „Öffne die Zone waldweg im Browser Survival Studio und bau eine Hütte am See.“</div>`,
      knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }],
    });
  }
}
