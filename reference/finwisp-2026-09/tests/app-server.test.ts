import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { AppServerClient } from '../host/app-server.ts';
import { voiceError } from '../shared/voice.ts';
function client(timeoutMs = 10_000) {
  return new AppServerClient({ executable: process.execPath, args: [resolve('tests/fixtures/app-server.mjs')], cwd: process.cwd(), env: {}, timeoutMs });
}
test('a read-only account routing timeout retries once without repeating other operations', async () => {
  const c = client();
  try {
    assert.deepEqual(await c.request('account/read', { refreshToken: false, routingFailures: 1 }), { attempts: 2 });
  } finally { await c.close(); }
});
test('persistent account routing failure stops after two attempts and has an accurate message', async () => {
  const c = client();
  try {
    await assert.rejects(c.request('account/read', { refreshToken: false, routingFailures: 3 }), /ENGINE_ACCOUNT_DISCOVERY_TIMEOUT/);
    assert.equal(await c.request('routing-attempts'), 2);
    assert.match(voiceError(new Error('ENGINE_ACCOUNT_DISCOVERY_TIMEOUT')), /账号.*超时/);
  } finally { await c.close(); }
});
test('account routing retries exclude writes, thread creation, token refresh and unrelated failures', async () => {
  for (const [method, params, expected] of [
    ['thread/start', { routingFailures: 1 }, /ENGINE_ACCOUNT_DISCOVERY_TIMEOUT/],
    ['turn/start', { routingFailures: 1 }, /ENGINE_ACCOUNT_DISCOVERY_TIMEOUT/],
    ['account/read', { refreshToken: true, routingFailures: 1 }, /ENGINE_ACCOUNT_DISCOVERY_TIMEOUT/],
    ['account/read', { routingFailures: 1 }, /ENGINE_ACCOUNT_DISCOVERY_TIMEOUT/],
    ['account/read', { refreshToken: false, routingFailures: 1, failureMessage: 'unknown internal failure' }, /ENGINE_RPC_-32603/],
  ] as const) {
    const c = client();
    try {
      await assert.rejects(c.request(method, params), expected);
      assert.equal(await c.request('routing-attempts'), 1);
    } finally { await c.close(); }
  }
});
test('transport reassembles partial JSON lines and correlates method responses', async () => {
  const c = client();
  try { await c.initialize(); assert.deepEqual(await c.request('thread/resume', { threadId: 't1' }), { method: 'thread/resume', echoed: { threadId: 't1' } }); }
  finally { await c.close(); }
});
test('unapproved server tool requests are rejected', async () => {
  const c = client();
  try { assert.deepEqual(await c.request('approval'), { rejected: true }); }
  finally { await c.close(); }
});
test('experimental initialization forwards async notifications independently of an empty acknowledgement', async () => {
  const events: string[] = [];
  const c = new AppServerClient({ executable: process.execPath, args: [resolve('tests/fixtures/app-server.mjs')], cwd: process.cwd(), env: {}, onNotification: method => events.push(method) });
  try {
    const initialized = await c.initialize(true) as { echoed: { capabilities: { experimentalApi: boolean } } };
    assert.equal(initialized.echoed.capabilities.experimentalApi, true);
    assert.deepEqual(await c.request('notification'), {});
    assert.deepEqual(events, ['thread/realtime/sdp']);
  } finally { await c.close(); }
});
type Answer = { result: unknown; error: { code: number; message: string } | null };
function serving(onRequest: (method: string, params: unknown) => unknown) {
  return new AppServerClient({ executable: process.execPath, args: [resolve('tests/fixtures/app-server.mjs')], cwd: process.cwd(), env: {}, timeoutMs: 10_000, onRequest });
}
test('an asynchronous host answer is awaited, and a faulting one stays a sanitized error', async () => {
  for (const mode of ['value', 'reject', 'undefined'] as const) {
    const c = serving(async (method, params) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (mode === 'reject') throw new Error('secret: /Users/someone/.local/auth.json');
      return mode === 'value' ? { read: true, method, params } : undefined;
    });
    try {
      const [answer] = (await c.request('serve') as { answers: Answer[] }).answers;
      if (mode === 'value') {
        assert.deepEqual(answer, { result: { read: true, method: 'host/read', params: { n: 0 } }, error: null });
      } else {
        // A handler fault is one internal error, never an empty object and never its own diagnostic.
        assert.equal(answer?.result, null);
        assert.equal(answer?.error?.code, mode === 'reject' ? -32603 : -32601);
        assert.ok(answer?.error?.message);
        assert.doesNotMatch(JSON.stringify(answer), /secret|auth\.json/);
      }
    } finally { await c.close(); }
  }
});
test('a repeated server request id is refused while the first one is still being answered', async () => {
  let calls = 0;
  const c = serving(() => { calls++; return new Promise(resolve => setTimeout(() => resolve({ served: true }), 50)); });
  try {
    const answers = (await c.request('serve', { calls: 2 }) as { answers: Answer[] }).answers;
    assert.equal(calls, 1);
    assert.equal(answers.filter(answer => answer.error?.code === -32603).length, 1);
    assert.deepEqual(answers.find(answer => answer.error === null)?.result, { served: true });
  } finally { await c.close(); }
});
test('an answer settling after the client stops is dropped, not written and not left unhandled', async () => {
  for (const mode of ['resolve', 'reject'] as const) {
    let settle: (value: unknown) => void = () => {}, fault: (error: Error) => void = () => {};
    let invoked: () => void = () => {};
    const seen = new Promise<void>(resolve => { invoked = resolve; });
    const c = serving(() => { invoked(); return new Promise((resolve, reject) => { settle = resolve; fault = reject; }); });
    // The original call can never be answered, so closing is what resolves this attempt.
    const pending = assert.rejects(c.request('serve'), /ENGINE_CLOSED/);
    await seen;
    await c.close();
    if (mode === 'resolve') settle({ late: true }); else fault(new Error('late fault'));
    await pending;
    await assert.rejects(c.request('next'), /ENGINE_CLOSED/);
    await new Promise(resolve => setImmediate(resolve));
  }
});
for (const [method, error] of [['crash', /ENGINE_EXITED/], ['bad', /ENGINE_INVALID_RESPONSE/], ['never', /ENGINE_TIMEOUT/]] as const) {
  test(`${method} rejects every pending call instead of leaving a task running`, async () => {
    // The timeout case has no response by design. Other cases must allow process startup
    // under a concurrent native build so they actually exercise their distinct failure.
    const c = client(method === 'never' ? 2000 : 10_000);
    try { await assert.rejects(Promise.all([c.request('never'), c.request(method)]), error); await assert.rejects(c.request('next'), /ENGINE_CLOSED/); }
    finally { await c.close(); }
  });
}
