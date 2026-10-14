import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/protocol.ts';
import { SEMANTIC_LIMITS, SemanticInputSchema, SemanticViewSchema, validateSemanticOutput } from '../shared/semantic-memory.ts';
import type { SemanticInput, SemanticView } from '../shared/semantic-memory.ts';
import type { PresentationMemory } from './presentation-memory.ts';
import type { PresentationSources, PresentationInput, PresentationSourceState } from './presentation-sources.ts';

export interface SemanticEngine {
  available(): boolean;
  /** Resolve/reject only after the owned model connection is closed, including on abort. */
  run(input: SemanticInput, signal: AbortSignal): Promise<unknown>;
}
type Preview = { view: SemanticView; sources: PresentationInput[]; policy: PresentationSourceState; revision: number; version: string; expires: number; includeVoice: boolean };
/** Explicit one-shot previews, not automatic learning. No preview/source/model output is persisted.
 * An ID can start at most one model call; expired/restarted IDs never recreate paid work.
 * Only a second explicit acceptance writes via the existing durable, version-checked memory API. */
export class SemanticMemory {
  private previews = new Map<string, Preview>();
  private active: { job: Preview; abort: AbortController; worker: Promise<void> } | null = null;
  private closed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sources: PresentationSources;
  private memory: PresentationMemory;
  private engine: SemanticEngine;
  private busy: () => boolean;
  private clock: () => number;
  constructor(sources: PresentationSources, memory: PresentationMemory, engine: SemanticEngine, busy: () => boolean, clock = Date.now) {
    this.sources = sources; this.memory = memory; this.engine = engine; this.busy = busy; this.clock = clock;
  }
  /** Occupancy only; never exposes candidate text or implies model availability. */
  activity(): import('../shared/workspace-activity.ts').ActivityPhase {
    return this.closed ? 'unavailable' : this.active ? (this.active.abort.signal.aborted ? 'cancelling' : 'running') : 'idle';
  }
  hasActiveWork() { return this.active !== null; }
  private clear(job: Preview, state: 'invalidated' | 'cancelled' | 'cancelling' | 'failed', error: SemanticView['error']) {
    job.view.state = state; job.view.input = null; job.view.output = null; job.view.error = error; job.view.sourceOrigins = null; job.sources = [];
  }
  private matches(job: Preview) {
    try {
      const policy = this.sources.state(), status = this.memory.status();
      // The user may retract/refine a request in a NEW saved message without changing the
      // old source rows or global privacy epoch. Do not accept that obsolete source window.
      // Accepted receipts no longer carry sources and remain governed by the stored revision.
      if (job.sources.length) {
        const latest = this.sources.preview?.(job.view.sessionId, job.sources.length as 1 | 2, job.includeVoice);
        if (!latest || latest.length !== job.sources.length || latest.some((source, index) => {
          const frozen = job.sources[index]!;
          return source.position !== frozen.position || source.ref.kind !== frozen.ref.kind || source.ref.id !== frozen.ref.id ||
            source.ref.proof !== frozen.ref.proof || source.ref.sessionId !== frozen.ref.sessionId;
        })) return false;
      }
      return policy.mode !== 'off' && policy.epoch === job.policy.epoch && policy.consent === job.policy.consent && policy.mode === job.policy.mode &&
        status.revision === job.revision && this.memory.context().version === job.version && job.sources.every(source => this.sources.valid(source.ref));
    } catch { return false; }
  }
  private sweep() {
    for (const [id, job] of this.previews) {
      if (job.expires <= this.clock()) {
        if (this.active?.job === job) this.active.abort.abort();
        this.clear(job, 'invalidated', 'STALE'); this.previews.delete(id);
      } else if (!['invalidated', 'cancelled', 'cancelling', 'failed'].includes(job.view.state) && !this.matches(job)) {
        if (this.active?.job === job) this.active.abort.abort();
        this.clear(job, 'invalidated', 'STALE');
      }
    }
  }
  private get(id: string) {
    if (this.closed) throw new AppError('HOST_UNAVAILABLE');
    this.sweep(); const job = this.previews.get(id); if (!job) throw new AppError('NOT_FOUND'); return job;
  }
  private view(job: Preview) { return SemanticViewSchema.parse(structuredClone(job.view)); }
  prepare(sessionId: string, count: 1 | 2, includeVoice = false): SemanticView {
    if (this.closed) throw new AppError('HOST_UNAVAILABLE');
    if (this.busy() || this.active) throw new AppError('WORKSPACE_BUSY');
    this.sweep(); if (this.previews.size >= SEMANTIC_LIMITS.pending) throw new AppError('WORKSPACE_BUSY');
    const policy = this.sources.state(); if (policy.mode === 'off') throw new AppError('MEMORY_OFF');
    if (!this.sources.preview) throw new AppError('HOST_UNAVAILABLE');
    const sources = this.sources.preview(sessionId, count, includeVoice), status = this.memory.status();
    if (sources.some(source => !source.eligible || source.ref.sessionId !== sessionId || !this.sources.valid(source.ref))) throw new AppError('INVALID_INPUT');
    const input = SemanticInputSchema.parse({ sources: sources.map((source, i) => ({ label: `s${i + 1}`, text: source.text })), currentRule: status.entry?.rule ?? null });
    const expires = this.clock() + SEMANTIC_LIMITS.ttlMs;
    const job: Preview = { view: { id: randomUUID(), sessionId, expiresAt: new Date(expires).toISOString(), state: 'prepared', input,
      output: null, attempted: false, error: null,
      sourceOrigins: sources.map((source,i) => ({ label: `s${i + 1}` as 's1' | 's2', kind: source.ref.kind, id: source.ref.id, proof: source.ref.proof })) }, sources: structuredClone(sources), policy, revision: status.revision, version: this.memory.context().version, expires, includeVoice };
    if (!this.matches(job)) throw new AppError('CONFLICT');
    this.previews.set(job.view.id, job); return this.view(job);
  }
  read(id: string) { return this.view(this.get(id)); }
  start(id: string, allowExternal: true): SemanticView {
    const job = this.get(id);
    if (allowExternal !== true) throw new AppError('INVALID_INPUT');
    if (job.view.attempted) return this.view(job); // Lost ACK retries never make a second call, even after failure.
    if (job.view.state !== 'prepared' || !job.view.input) throw new AppError('CONFLICT');
    if (this.active || this.busy()) throw new AppError('WORKSPACE_BUSY');
    if (!this.engine.available()) throw new AppError('HOST_UNAVAILABLE');
    const input = structuredClone(job.view.input), abort = new AbortController();
    job.view.attempted = true; job.view.state = 'running';
    const worker = Promise.resolve().then(async () => {
      const timeout = setTimeout(() => abort.abort(), SEMANTIC_LIMITS.timeoutMs);
      try {
        // Recheck after the scheduling boundary and before any model receives the input.
        if (abort.signal.aborted) return;
        if (this.busy() || !this.matches(job)) { this.clear(job, 'invalidated', 'STALE'); return; }
        const raw = await this.engine.run(input, abort.signal);
        if (this.closed || abort.signal.aborted || job.expires <= this.clock()) return;
        if (!this.matches(job) || job.view.state !== 'running') { this.clear(job, 'invalidated', 'STALE'); return; }
        const output = validateSemanticOutput(raw, input);
        job.view.output = output; job.view.state = output.decision === 'candidate' ? 'ready' : 'no-candidate';
      } catch {
        if (!abort.signal.aborted && job.view.state === 'running') this.clear(job, 'failed', 'MODEL_FAILED');
      } finally {
        clearTimeout(timeout);
        if (abort.signal.aborted && ['running', 'cancelling'].includes(job.view.state)) this.clear(job, 'cancelled', 'CANCELLED');
        if (this.active?.job === job) this.active = null;
      }
    });
    this.active = { job, abort, worker }; return this.view(job);
  }
  accept(id: string): SemanticView {
    const job = this.get(id);
    if (job.view.state === 'accepted') return this.view(job);
    if (job.view.state !== 'ready' || !job.view.output?.rule || !this.matches(job)) throw new AppError('CONFLICT');
    if (this.active || this.busy()) throw new AppError('WORKSPACE_BUSY');
    this.memory.set(job.view.output.rule, job.revision, job.policy.epoch);
    // Only the durable set's return permits this acknowledgement. Sources are no longer retained.
    job.revision = this.memory.status().revision; job.version = this.memory.context().version;
    job.sources = []; job.view.state = 'accepted'; job.view.input = null; job.view.output = null; job.view.sourceOrigins = null;
    return this.view(job);
  }
  cancel(id: string): SemanticView {
    const job = this.get(id);
    if (job.view.state === 'accepted') return this.view(job);
    if (this.active?.job === job) { this.active.abort.abort(); this.clear(job, 'cancelling', 'CANCELLED'); }
    else this.clear(job, 'cancelled', 'CANCELLED');
    return this.view(job);
  }
  async preempt() {
    const active = this.active; if (!active) return;
    active.abort.abort(); this.clear(active.job, 'cancelling', 'CANCELLED'); await active.worker;
  }
  settled() { return this.active?.worker ?? Promise.resolve(); }
  startMaintenance() { if (!this.closed && !this.timer) { this.timer = setInterval(() => this.sweep(), 30_000); this.timer.unref(); } }
  async close() { this.closed = true; if (this.timer) clearInterval(this.timer); this.timer = null; await this.preempt(); this.previews.clear(); }
}
