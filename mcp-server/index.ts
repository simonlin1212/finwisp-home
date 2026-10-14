import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { createMcpServer } from './tools.js';
import { SecEdgar } from './sources/sec-edgar.js';
export function validOrigin(origin: string | undefined) {
  if (!origin) return true;
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === origin; } catch { return false; }
}
export async function startServer(options: { port?: number; sec?: SecEdgar } = {}) {
  const sec = options.sec ?? new SecEdgar();
  const sessions = new Map<string, { server: ReturnType<typeof createMcpServer>; transport: WebStandardStreamableHTTPServerTransport }>();
  const http = createServer(async (req, res) => {
    try {
      if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
      if (!validOrigin(req.headers.origin)) { res.writeHead(403).end('Forbidden Origin'); return; }
      const host = req.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.writeHead(403).end('Forbidden Host'); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      const body = Buffer.concat(chunks).toString();
      const id = req.headers['mcp-session-id'];
      let session = typeof id === 'string' ? sessions.get(id) : undefined;
      let fresh = false;
      if (!session) {
        if (id) { res.writeHead(404).end('Unknown session'); return; }
        let message; try { message = JSON.parse(body); } catch { res.writeHead(400).end('Invalid JSON'); return; }
        if (req.method !== 'POST' || message.method !== 'initialize') { res.writeHead(400).end('Initialize a session first'); return; }
        const server = createMcpServer(sec);
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: id => { sessions.set(id, { server, transport }); },
          onsessionclosed: id => { sessions.delete(id); },
        });
        session = { server, transport }; fresh = true;
        await server.connect(transport);
      }
      const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const response = await session.transport.handleRequest(new Request(`http://${host}/mcp`, { method: req.method, headers, ...(body ? { body } : {}) }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) { const reader = response.body.getReader(); res.on('close', () => { void reader.cancel().catch(() => {}); }); while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); } }
      res.end();
      if ((fresh && !session.transport.sessionId) || (req.method === 'DELETE' && response.ok)) await session.server.close();
    } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(options.port ?? Number(process.env.PORT ?? 8787), '127.0.0.1', resolve); });
  const address = http.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/mcp`, close: async () => { for (const session of sessions.values()) await session.server.close(); sessions.clear(); const closed = new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())); http.closeAllConnections(); await closed; } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startServer(); console.log(`Finwisp MCP listening at ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => { process.exitCode = 0; }); });
}
