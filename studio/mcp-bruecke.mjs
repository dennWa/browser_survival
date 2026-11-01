#!/usr/bin/env node
/**
 * MCP-Brücke (stdio → Studio): für KI-Programme, die lokale MCP-Server nur als Befehl starten (Claude Desktop u. a.).
 *   npm run studio:mcp     bzw. in der Konfiguration:  { "command": "node", "args": ["<Spielordner>/studio/mcp-bruecke.mjs"] }
 * Das Studio muss laufen; Port + Token stehen in <Spielordner>/.studio/mcp.json (schreibt das Studio beim Start).
 * Leitet Werkzeugliste und Aufrufe 1:1 an http://127.0.0.1:<port>/mcp weiter.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function verbindung() {
  try {
    return JSON.parse(readFileSync(path.join(WURZEL, '.studio', 'mcp.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function client() {
  const v = verbindung();
  if (!v) throw new Error('Browser Survival Studio läuft nicht (keine .studio/mcp.json) – bitte zuerst `npm run studio` starten.');
  const c = new Client({ name: 'studio-bruecke', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${v.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${v.token}` } } }));
  return c;
}

const server = new Server({ name: 'browser-survival-studio', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const c = await client();
  try {
    return await c.listTools();
  } finally {
    await c.close();
  }
});
server.setRequestHandler(CallToolRequestSchema, async (anfrage) => {
  let c;
  try {
    c = await client();
    return await c.callTool({ name: anfrage.params.name, arguments: anfrage.params.arguments ?? {} });
  } catch (fehler) {
    return { content: [{ type: 'text', text: `Fehler: ${fehler.message}` }], isError: true };
  } finally {
    await c?.close();
  }
});
await server.connect(new StdioServerTransport());
