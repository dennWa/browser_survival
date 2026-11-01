/**
 * Eingebauter KI-Assistent des Studios (Hauptprozess). Ein Gespräch = Werkzeug-Schleife: Modell ruft Studio-Werkzeuge
 * (studio/kern/kiWerkzeuge.js – dieselben wie beim MCP-Server) auf, bis es fertig ist (max. MAX_SCHRITTE).
 * Anbieter: Claude (offizielles SDK @anthropic-ai/sdk), Gemini (REST), OpenAI / Grok (xAI) / DeepSeek (OpenAI-kompatibles
 * REST /chat/completions). Modellnamen sind im Studio änderbar (Einstellungen → KI), die Standards stehen in ANBIETER.
 * Schlüssel speichert start.mjs verschlüsselt (Electron safeStorage) – hier kommen sie nur als Argument an.
 */
import Anthropic from '@anthropic-ai/sdk';
import { KI_WERKZEUGE, KI_REGELN } from '../kern/kiWerkzeuge.js';

export const ANBIETER = Object.freeze({
  claude: { name: 'Claude (Anthropic)', modell: 'claude-opus-5-5', art: 'anthropic' },
  gemini: { name: 'Gemini (Google)', modell: 'gemini-2.5-flash', art: 'gemini', basis: 'https://generativelanguage.googleapis.com/v1beta' },
  openai: { name: 'OpenAI', modell: 'gpt-5', art: 'openai', basis: 'https://api.openai.com/v1', bilder: true },
  grok: { name: 'Grok (xAI)', modell: 'grok-4', art: 'openai', basis: 'https://api.x.ai/v1', bilder: true },
  deepseek: { name: 'DeepSeek', modell: 'deepseek-chat', art: 'openai', basis: 'https://api.deepseek.com/v1', bilder: false },
});
export const MAX_SCHRITTE = 40;
/** Claude-Modelle mit serverseitigem Ausweichen bei Ablehnung (fallbacks: "default") */
const MIT_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);

const SYSTEM = `${KI_REGELN}\nAntworte auf Deutsch, kurz und freundlich. Sag am Ende in 1–3 Sätzen, was du gebaut hast.`;

/** Ergebnis eines Werkzeugs als Text (Bild separat) */
const ergebnisText = (e) => (e?.text ?? (e?.daten !== undefined ? JSON.stringify(e.daten) : e?.ok === false ? 'Fehler' : 'ok')).slice(0, 60_000);

export class KiAssistent {
  /**
   * @param fuehreAus  (name, argumente, quelle) → Promise<{ ok, text?, daten?, bild? }>
   * @param beiEreignis ({ art: 'werkzeug'|'text'|'fehler', … }) – Fortschritt fürs Chat-Panel
   * @param holen      fetch-Ersatz (Tests)
   */
  constructor({ anbieter, modell, schluessel, fuehreAus, beiEreignis = () => {}, holen = fetch, anthropic = null }) {
    const a = ANBIETER[anbieter];
    if (!a) throw new Error(`Unbekannter KI-Anbieter „${anbieter}“`);
    if (!schluessel) throw new Error(`Kein API-Schlüssel für ${a.name} hinterlegt (KI → Einstellungen)`);
    this.anbieter = anbieter;
    this.info = a;
    this.modell = modell || a.modell;
    this.schluessel = schluessel;
    this.fuehreAus = fuehreAus;
    this.beiEreignis = beiEreignis;
    this.holen = holen;
    this.anthropic = anthropic ?? (a.art === 'anthropic' ? new Anthropic({ apiKey: schluessel }) : null);
    this.verlauf = [];
    this.abbrechen = false;
  }

  /** Neue Nutzernachricht → läuft bis zur Antwort. @returns Antworttext */
  async senden(text) {
    this.abbrechen = false;
    if (this.info.art === 'anthropic') return this.#claude(text);
    if (this.info.art === 'gemini') return this.#gemini(text);
    return this.#openai(text);
  }

  async #werkzeug(name, argumente) {
    this.beiEreignis({ art: 'werkzeug', name, argumente });
    try {
      return await this.fuehreAus(name, argumente ?? {}, 'assistent');
    } catch (fehler) {
      return { ok: false, text: `Fehler: ${fehler.message}` };
    }
  }

  // ---------- Claude (SDK) ----------
  async #claude(text) {
    const werkzeuge = KI_WERKZEUGE.map((w) => ({ name: w.name, description: w.beschreibung, input_schema: w.schema }));
    this.verlauf.push({ role: 'user', content: text });
    for (let schritt = 0; schritt < MAX_SCHRITTE && !this.abbrechen; schritt++) {
      const anfrage = { model: this.modell, max_tokens: 16000, system: SYSTEM, tools: werkzeuge, messages: this.verlauf };
      const antwort = MIT_FALLBACK.has(this.modell)
        ? await this.anthropic.beta.messages.create({ ...anfrage, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await this.anthropic.messages.create(anfrage);
      // vollständigen Inhalt zurückgeben (Denk-Blöcke bleiben unverändert drin)
      this.verlauf.push({ role: 'assistant', content: antwort.content });
      if (antwort.stop_reason === 'refusal') return `Die KI hat abgelehnt${antwort.stop_details?.explanation ? `: ${antwort.stop_details.explanation}` : '.'}`;
      const aufrufe = antwort.content.filter((b) => b.type === 'tool_use');
      const textTeile = antwort.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (textTeile && aufrufe.length) this.beiEreignis({ art: 'text', text: textTeile });
      if (antwort.stop_reason !== 'tool_use' || !aufrufe.length) return textTeile || '(fertig)';
      const ergebnisse = [];
      for (const a of aufrufe) {
        const e = await this.#werkzeug(a.name, a.input);
        const inhalt = [{ type: 'text', text: ergebnisText(e) }];
        if (e?.bild) inhalt.unshift({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: e.bild } });
        ergebnisse.push({ type: 'tool_result', tool_use_id: a.id, content: inhalt, ...(e?.ok === false ? { is_error: true } : {}) });
      }
      this.verlauf.push({ role: 'user', content: ergebnisse }); // alle Ergebnisse in EINER Nachricht
    }
    return this.abbrechen ? 'Abgebrochen.' : `Nach ${MAX_SCHRITTE} Schritten angehalten – sag „weiter“, wenn ich weitermachen soll.`;
  }

  // ---------- OpenAI-kompatibel (OpenAI, Grok, DeepSeek) ----------
  async #openai(text) {
    if (!this.verlauf.length) this.verlauf.push({ role: 'system', content: SYSTEM });
    this.verlauf.push({ role: 'user', content: text });
    const werkzeuge = KI_WERKZEUGE.map((w) => ({ type: 'function', function: { name: w.name, description: w.beschreibung, parameters: w.schema } }));
    for (let schritt = 0; schritt < MAX_SCHRITTE && !this.abbrechen; schritt++) {
      const antwort = await this.#json(`${this.info.basis}/chat/completions`, { Authorization: `Bearer ${this.schluessel}` }, { model: this.modell, messages: this.verlauf, tools: werkzeuge });
      const nachricht = antwort.choices?.[0]?.message;
      if (!nachricht) throw new Error('Leere Antwort der KI');
      this.verlauf.push(nachricht);
      const aufrufe = nachricht.tool_calls ?? [];
      if (!aufrufe.length) return (nachricht.content ?? '').trim() || '(fertig)';
      if (nachricht.content) this.beiEreignis({ art: 'text', text: nachricht.content });
      const bilder = [];
      for (const a of aufrufe) {
        let argumente = {};
        try {
          argumente = JSON.parse(a.function.arguments || '{}');
        } catch {
          // ungültiges JSON → leere Argumente, Werkzeug meldet den Fehler
        }
        const e = await this.#werkzeug(a.function.name, argumente);
        this.verlauf.push({ role: 'tool', tool_call_id: a.id, content: ergebnisText(e) });
        if (e?.bild && this.info.bilder) bilder.push(e.bild);
      }
      if (bilder.length) this.verlauf.push({ role: 'user', content: [{ type: 'text', text: 'Screenshot der Ansicht:' }, ...bilder.map((b) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${b}` } }))] });
    }
    return this.abbrechen ? 'Abgebrochen.' : `Nach ${MAX_SCHRITTE} Schritten angehalten – sag „weiter“, wenn ich weitermachen soll.`;
  }

  // ---------- Gemini ----------
  async #gemini(text) {
    this.verlauf.push({ role: 'user', parts: [{ text }] });
    const werkzeuge = [{ functionDeclarations: KI_WERKZEUGE.map((w) => ({ name: w.name, description: w.beschreibung, ...(Object.keys(w.schema.properties).length ? { parameters: w.schema } : {}) })) }];
    for (let schritt = 0; schritt < MAX_SCHRITTE && !this.abbrechen; schritt++) {
      const antwort = await this.#json(`${this.info.basis}/models/${encodeURIComponent(this.modell)}:generateContent`, { 'x-goog-api-key': this.schluessel }, { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: this.verlauf, tools: werkzeuge });
      const inhalt = antwort.candidates?.[0]?.content;
      if (!inhalt?.parts) throw new Error(`Leere Antwort der KI${antwort.promptFeedback?.blockReason ? ` (${antwort.promptFeedback.blockReason})` : ''}`);
      this.verlauf.push({ role: 'model', parts: inhalt.parts });
      const aufrufe = inhalt.parts.filter((p) => p.functionCall);
      const textTeile = inhalt.parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
      if (!aufrufe.length) return textTeile || '(fertig)';
      if (textTeile) this.beiEreignis({ art: 'text', text: textTeile });
      const teile = [];
      for (const { functionCall: f } of aufrufe) {
        const e = await this.#werkzeug(f.name, f.args);
        teile.push({ functionResponse: { name: f.name, response: { ergebnis: ergebnisText(e) } } });
        if (e?.bild) teile.push({ inlineData: { mimeType: 'image/png', data: e.bild } });
      }
      this.verlauf.push({ role: 'user', parts: teile });
    }
    return this.abbrechen ? 'Abgebrochen.' : `Nach ${MAX_SCHRITTE} Schritten angehalten – sag „weiter“, wenn ich weitermachen soll.`;
  }

  async #json(url, kopf, body) {
    const r = await this.holen(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...kopf }, body: JSON.stringify(body) });
    const t = await r.text();
    let j = null;
    try {
      j = JSON.parse(t);
    } catch {
      // kein JSON
    }
    if (!r.ok) throw new Error(`${this.info.name}: HTTP ${r.status} – ${j?.error?.message ?? t.slice(0, 200)}`);
    return j;
  }
}
