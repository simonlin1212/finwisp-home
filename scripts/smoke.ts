import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
import { Client, StreamableHTTPClientTransport, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/client';
import { startServer } from '../mcp-server/index.js';
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
console.log(`SDK: @modelcontextprotocol/server ${lock.packages['node_modules/@modelcontextprotocol/server'].version}; @modelcontextprotocol/client ${lock.packages['node_modules/@modelcontextprotocol/client'].version}`);
console.log('LATEST_PROTOCOL_VERSION:', LATEST_PROTOCOL_VERSION);
console.log('SUPPORTED_PROTOCOL_VERSIONS:', JSON.stringify(SUPPORTED_PROTOCOL_VERSIONS));
const cacheDir = await mkdtemp(join(tmpdir(), 'finwisp-smoke-'));
const app = await startServer({ port: 0, sec: new SecEdgar({ cacheDir }) });
const client = new Client({ name: 'finwisp-smoke', version: '0.1.0' });
const transport = new StreamableHTTPClientTransport(new URL(app.url));
let rawSession: string | null = null;
try {
  await client.connect(transport);
  console.log('SDK negotiated protocolVersion:', transport.protocolVersion);
  console.log('tools/list:', (await client.listTools()).tools.map(tool => tool.name).join(', '));
  const result = await client.callTool({ name: 'lookup_company', arguments: { query: 'AAPL' } });
  if (result.isError) console.log('LIVE SEC unavailable:', JSON.stringify(result.structuredContent));
  else { console.log('LIVE lookup_company(AAPL):', JSON.stringify(result.structuredContent)); if (!(result.structuredContent as any)?.companies?.some((r: any) => r.ticker === 'AAPL')) throw new Error('Live lookup missing AAPL'); }
  const response = await fetch(app.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-smoke', version: '0.1.0' } } }) });
  rawSession = response.headers.get('mcp-session-id');
  const raw = await response.json() as any;
  if (!response.ok || !raw.result?.protocolVersion) throw new Error(JSON.stringify(raw));
  console.log('Raw initialize requested: 2025-11-25; returned:', raw.result.protocolVersion);
} finally {
  if (rawSession) await fetch(app.url, { method: 'DELETE', headers: { 'mcp-session-id': rawSession, 'mcp-protocol-version': '2025-11-25' } });
  await transport.terminateSession().catch(() => {});
  await client.close();
  await app.close();
  await rm(cacheDir, { recursive: true, force: true });
  console.log('Server shut down.');
}
