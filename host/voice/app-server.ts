import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';

const Envelope = z.object({ id: z.union([z.string(), z.number().int()]).optional(), method: z.string().optional(), result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string() }).passthrough().optional(), params: z.unknown().optional() }).passthrough();
type Pending = { method: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export interface AppServerEvents {
  onNotification?: (method: string, params: unknown) => void;
  /** A handler may answer immediately or return a promise; `undefined` still means "not enabled". */
  onRequest?: (method: string, params: unknown) => unknown | Promise<unknown>;
  onFailure?: (code: string) => void;
}
/** Transport only. This module does not select a model, load credentials, or create a research agent. */
export class AppServerClient {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>();
  private serving = new Set<string>();
  private buffer = '';
  private next = 1;
  private stopped = false;
  private exited: Promise<void>;
  private timeoutMs: number;
  private events: AppServerEvents;
  constructor(options: { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number; spawnChild?: typeof spawn } & AppServerEvents) {
    this.events = options;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.child = (options.spawnChild ?? spawn)(options.executable, options.args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.exited = new Promise(resolve => this.child.once('close', () => { this.fail(new Error('ENGINE_EXITED')); resolve(); }));
    this.child.on('error', () => this.fail(new Error('ENGINE_UNAVAILABLE')));
    this.child.stdin.on('error', () => this.fail(new Error('ENGINE_WRITE_FAILED')));
    this.child.stderr.resume(); // Never copy provider diagnostics or credentials into product logs.
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.receive(chunk));
  }
  private fail(error: Error) {
    if (this.stopped) return;
    this.stopped = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    this.child.kill('SIGTERM');
    this.events.onFailure?.(error.message);
  }
  private receive(chunk: string) {
    if (this.stopped) return;
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 4 * 1024 * 1024) { this.fail(new Error('ENGINE_RESPONSE_TOO_LARGE')); return; }
    let boundary: number;
    while ((boundary = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, boundary); this.buffer = this.buffer.slice(boundary + 1);
      try {
        const message = Envelope.parse(JSON.parse(line));
        if (message.method && message.id !== undefined) this.serve(message.id, message.method, message.params);
        else if (message.id !== undefined && typeof message.id === 'number') {
          const pending = this.pending.get(message.id);
          if (!pending) continue;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(
            message.error.code === -32603 && message.error.message === 'workspace routing discovery timed out'
              ? 'ENGINE_ACCOUNT_DISCOVERY_TIMEOUT'
              : `ENGINE_RPC_${message.error.code}`));
          else if ('result' in message) pending.resolve(message.result);
          else { pending.reject(new Error('ENGINE_INVALID_RESPONSE')); this.fail(new Error('ENGINE_INVALID_RESPONSE')); }
        } else if (message.method) this.events.onNotification?.(message.method, message.params);
        else this.fail(new Error('ENGINE_INVALID_RESPONSE'));
      } catch { this.fail(new Error('ENGINE_INVALID_RESPONSE')); return; }
    }
  }
  /**
   * Answer one request from the server. A handler may work asynchronously — a host tool that reads
   * the user's own records has to — so the reply waits for it and is written when it resolves, while
   * every other message on this connection keeps flowing. A handler fault never travels back as a
   * diagnostic: it is one sanitized internal error, and a still-pending answer is simply dropped once
   * this client has stopped, rather than written to a closed process or left as a loose rejection.
   */
  private serve(id: string | number, method: string, params: unknown) {
    const key = String(id);
    // The server owns these ids. A repeat of one still being answered, or more outstanding work than
    // this transport will hold, is refused rather than queued behind the first.
    if (this.serving.has(key) || this.serving.size >= 32) { this.answer(id, undefined, true); return; }
    let result: unknown;
    try { result = this.events.onRequest?.(method, params); }
    catch { this.answer(id, undefined, true); return; }
    if (typeof (result as { then?: unknown } | undefined)?.then !== 'function') { this.answer(id, result); return; }
    this.serving.add(key);
    void Promise.resolve(result).then(value => { this.serving.delete(key); this.answer(id, value); },
      () => { this.serving.delete(key); this.answer(id, undefined, true); });
  }
  private answer(id: string | number, result: unknown, failed = false) {
    if (this.stopped) return;
    try {
      if (failed) this.write({ id, error: { code: -32603, message: 'Finwisp could not complete this request.' } });
      else if (result !== undefined) this.write({ id, result });
      else this.write({ id, error: { code: -32601, message: 'This capability is not enabled by Finwisp.' } });
    } catch (error) { this.fail(error instanceof Error ? error : new Error('ENGINE_WRITE_FAILED')); }
  }
  private write(value: unknown) {
    if (this.stopped) throw new Error('ENGINE_CLOSED');
    const line = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(line) > 262_144) throw new Error('ENGINE_REQUEST_TOO_LARGE');
    this.child.stdin.write(line, error => { if (error) this.fail(new Error('ENGINE_WRITE_FAILED')); });
  }
  async request(method: string, params: unknown = {}): Promise<unknown> {
    return this.requestOnce(method, params, this.timeoutMs);
  }
  private requestOnce(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('ENGINE_CLOSED'));
    if (this.pending.size >= 32) return Promise.reject(new Error('ENGINE_BUSY'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('ENGINE_TIMEOUT')), timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(method: string, params?: unknown) { this.write({ method, ...(params === undefined ? {} : { params }) }); }
  async initialize(experimentalApi = false) {
    const result = await this.request('initialize', { clientInfo: { name: 'finwisp', version: '0.1.0' }, capabilities: { experimentalApi } });
    this.notify('initialized'); return result;
  }
  async close() {
    this.fail(new Error('ENGINE_CLOSED'));
    const force = setTimeout(() => this.child.kill('SIGKILL'), 1000);
    await this.exited; clearTimeout(force);
  }
}
