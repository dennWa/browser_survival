/**
 * MCP-Server des Studios (Model Context Protocol, offizielles SDK @modelcontextprotocol/sdk).
 * Läuft im Hauptprozess auf http://127.0.0.1:<port>/mcp (Streamable HTTP, zustandslos) – nur lokal + Bearer-Token.
 * Werkzeuge = studio/kern/kiWerkzeuge.js; ausgeführt im Studio-Fenster über `fuehreAus(name, argumente)`.
 * Clients, die nur stdio können (Claude Desktop): studio/mcp-bruecke.mjs (liest Port/Token aus .studio/mcp.json).
 */
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { KI_WERKZEUGE } from '../kern/kiWerkzeuge.js';

export const MCP_NAME = 'browser-survival-studio';

/** Werkzeugliste im MCP-Format */
export const mcpWerkzeuge = () => KI_WERKZEUGE.map((w) => ({ name: w.name, description: w.beschreibung, inputSchema: w.schema, ...(w.lesen ? { annotations: { readOnlyHint: true } } : {}) }));

/**
 * Ergebnis eines Studio-Werkzeugs → MCP-Inhalt. Ergebnis-Form (kiAusfuehren.js): { ok, text?, daten?, bild? (PNG base64) }
 */
export function alsMcpInhalt(e) {
  const inhalt = [];
  if (e?.bild) inhalt.push({ type: 'image', data: e.bild, mimeType: 'image/png' });
  const t = e?.text ?? (e?.daten !== undefined ? JSON.stringify(e.daten) : e?.ok === false ? 'Fehler' : 'ok');
  inhalt.push({ type: 'text', text: t });
  return { content: inhalt, isError: e?.ok === false };
}

function neuerServer(fuehreAus, version) {
  const server = new Server({ name: MCP_NAME, version }, { capabilities: { tools: {} }, instructions: 'Karten-Editor für Browser Survival. Zuerst das Werkzeug „anleitung“ aufrufen.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpWerkzeuge() }));
  server.setRequestHandler(CallToolRequestSchema, async (anfrage) => {
    try {
      return alsMcpInhalt(await fuehreAus(anfrage.params.name, anfrage.params.arguments ?? {}, 'mcp'));
    } catch (fehler) {
      return { content: [{ type: 'text', text: `Fehler: ${fehler.message}` }], isError: true };
    }
  });
  return server;
}

/**
 * @param fuehreAus (name, argumente, quelle) → Promise<Ergebnis>
 * @returns { server (http), schliessen() }
 */
export function starteMcp({ port, token, fuehreAus, version = '0.1.0', beiAktivitaet = () => {} }) {
  const http = createServer(async (anfrage, antwort) => {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(anfrage.headers.host ?? '')) return antwort.writeHead(403).end();
    // Browser-Seiten dürfen nicht mitbauen (DNS-Rebinding/CSRF): Origin nur, wenn lokal
    const ursprung = anfrage.headers.origin;
    if (ursprung && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ursprung)) return antwort.writeHead(403).end();
    const url = new URL(anfrage.url, 'http://localhost');
    if (url.pathname !== '/mcp') return antwort.writeHead(404).end();
    if (anfrage.headers.authorization !== `Bearer ${token}`) return antwort.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Token fehlt oder falsch (Studio → KI → Mit Claude verbinden)' }));
    if (anfrage.method !== 'POST') return antwort.writeHead(405, { Allow: 'POST' }).end();
    let body;
    try {
      const teile = [];
      for await (const t of anfrage) teile.push(t);
      body = JSON.parse(Buffer.concat(teile).toString('utf8') || 'null');
    } catch {
      return antwort.writeHead(400).end();
    }
    beiAktivitaet();
    const server = neuerServer(fuehreAus, version);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    antwort.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(anfrage, antwort, body);
  });
  return new Promise((ok, fehler) => {
    http.once('error', fehler);
    http.listen(port, '127.0.0.1', () => ok({ server: http, port: http.address().port, schliessen: () => new Promise((r) => http.close(r)) }));
  });
}
