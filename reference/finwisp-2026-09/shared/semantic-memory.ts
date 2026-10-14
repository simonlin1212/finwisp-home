import { z } from 'zod';
import { PresentationRuleSchema } from './presentation-memory.ts';

export const SEMANTIC_LIMITS = { sources: 2, sourceChars: 200, outputChars: 6000, ttlMs: 600_000, pending: 8, timeoutMs: 60_000 } as const;
const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const SemanticInputSchema = z.object({
  sources: z.array(z.object({ label: z.enum(['s1', 's2']), text: z.string().min(1).max(200) }).strict()).min(1).max(2),
  currentRule: PresentationRuleSchema.nullable(),
}).strict().refine(v => v.sources.every((s, i) => s.label === `s${i + 1}`), 'Ordered source labels required');
export type SemanticInput = z.infer<typeof SemanticInputSchema>;
const evidence = z.object({ source: z.enum(['s1', 's2']), start: z.number().int().min(0).max(199), end: z.number().int().min(1).max(200), quote: z.string().min(1).max(200) }).strict();
// All output fields are finite or verbatim evidence. No free-form prompt, permissions or confidence score.
export const SemanticOutputSchema = z.object({
  decision: z.enum(['candidate', 'one-off', 'unclear', 'none']),
  relation: z.enum(['standalone', 'refinement', 'none']),
  rule: PresentationRuleSchema.nullable(), evidence: z.array(evidence).max(4),
}).strict();
export type SemanticOutput = z.infer<typeof SemanticOutputSchema>;
export function validateSemanticOutput(raw: unknown, rawInput: SemanticInput): SemanticOutput {
  const input = SemanticInputSchema.parse(rawInput), output = SemanticOutputSchema.parse(raw);
  if (output.decision !== 'candidate') {
    if (output.rule !== null || output.evidence.length || output.relation !== 'none') throw new Error('SEMANTIC_EVIDENCE');
    return output;
  }
  if (!output.rule || output.relation === 'none' || !output.evidence.length) throw new Error('SEMANTIC_EVIDENCE');
  const seen = new Set<string>();
  for (const item of output.evidence) {
    const source = input.sources.find(s => s.label === item.source);
    const key = `${item.source}:${item.start}:${item.end}`;
    if (!source || item.end <= item.start || item.end > source.text.length || source.text.slice(item.start, item.end) !== item.quote || seen.has(key)) throw new Error('SEMANTIC_EVIDENCE');
    seen.add(key);
  }
  // Earlier context cannot silently stand in for what the user said most recently.
  if (!output.evidence.some(e => e.source === input.sources.at(-1)!.label)) throw new Error('SEMANTIC_EVIDENCE');
  if (output.relation === 'refinement' && input.sources.length < 2 && !input.currentRule) throw new Error('SEMANTIC_EVIDENCE');
  return output;
}
export const SemanticRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('semantic.prepare'), sessionId: id, count: z.union([z.literal(1), z.literal(2)]), includeVoice: z.boolean().optional() }).strict(),
  z.object({ method: z.literal('semantic.start'), id: z.string().uuid(), allowExternal: z.literal(true) }).strict(),
  z.object({ method: z.literal('semantic.read'), id: z.string().uuid() }).strict(),
  z.object({ method: z.literal('semantic.cancel'), id: z.string().uuid() }).strict(),
  z.object({ method: z.literal('semantic.accept'), id: z.string().uuid() }).strict(),
]);
export type SemanticRequest = z.infer<typeof SemanticRequestSchema>;
export const SemanticViewSchema = z.object({
  id: z.string().uuid(), sessionId: id, expiresAt: z.string().datetime(),
  state: z.enum(['prepared', 'running', 'cancelling', 'ready', 'no-candidate', 'accepted', 'cancelled', 'invalidated', 'failed']),
  input: SemanticInputSchema.nullable(), output: SemanticOutputSchema.nullable(),
  /** Local preview provenance only. Never part of SemanticInput or the model payload. */
  sourceOrigins: z.array(z.object({ label:z.enum(['s1','s2']), kind:z.enum(['text','voice']), id,
    proof:z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(2).nullable().optional(),
  attempted: z.boolean(), error: z.enum(['MODEL_FAILED', 'STALE', 'CANCELLED']).nullable(),
}).strict().refine(view => {
  if (view.sourceOrigins && (!view.input || view.sourceOrigins.length !== view.input.sources.length
    || view.sourceOrigins.some((source,index) => source.label !== view.input!.sources[index]!.label))) return false;
  if (view.state === 'prepared') return view.input !== null && view.output === null && !view.attempted && view.error === null;
  if (view.state === 'running') return view.input !== null && view.output === null && view.attempted && view.error === null;
  if (view.state === 'ready' || view.state === 'no-candidate') {
    if (!view.input || !view.output || !view.attempted || view.error !== null) return false;
    try { validateSemanticOutput(view.output, view.input); } catch { return false; }
    return (view.state === 'ready') === (view.output.decision === 'candidate');
  }
  if (view.input !== null || view.output !== null) return false;
  if (view.state === 'accepted') return view.attempted && view.error === null;
  if (view.state === 'failed') return view.attempted && view.error === 'MODEL_FAILED';
  if (view.state === 'invalidated') return view.error === 'STALE';
  return view.error === 'CANCELLED';
}, 'Semantic preview state and content disagree');
export type SemanticView = z.infer<typeof SemanticViewSchema>;
