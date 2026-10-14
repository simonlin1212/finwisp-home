import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startServer } from '../mcp-server/index.js';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
test('Origin rejection, SDK tool result, independent sessions and DELETE', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'finwisp-http-'));
  const sec = new SecEdgar({ cacheDir, userAgent: 'Test test@example.com', fetch: (async () => Response.json({ 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } })) as typeof fetch });
  const app = await startServer({ port: 0, sec });
  const clients = [new Client({ name: 'test1', version: '1' }), new Client({ name: 'test2', version: '1' })];
  const transports = clients.map(() => new StreamableHTTPClientTransport(new URL(app.url)));
  try {
    for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example']) assert.equal((await fetch(app.url, { method: 'POST', headers: { Origin: origin } })).status, 403);
    for (let i = 0; i < 2; i++) await clients[i].connect(transports[i]);
    assert.notEqual(transports[0].sessionId, transports[1].sessionId);
    assert.equal((await clients[0].listTools()).tools.length, 7);
    const r = await clients[0].callTool({ name: 'lookup_company', arguments: { query: 'AAPL' } });
    assert.equal((r.structuredContent as any).companies[0].ticker, 'AAPL');
    assert.deepEqual(JSON.parse((r.content as any)[0].text), r.structuredContent);
    const id = transports[0].sessionId!;
    await transports[0].terminateSession();
    assert.equal((await fetch(app.url, { method: 'DELETE', headers: { 'mcp-session-id': id } })).status, 404);
    assert.equal((await clients[1].listTools()).tools.length, 7);
    await transports[1].terminateSession();
  } finally { for (const client of clients) await client.close(); await app.close(); await rm(cacheDir, { recursive: true, force: true }); }
});
