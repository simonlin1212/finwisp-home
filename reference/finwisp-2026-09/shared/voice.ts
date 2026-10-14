import { z } from 'zod';
import { VoiceHistoryResultSchema } from './voice-history-search.ts';
import { VoiceNavigationStatusSchema } from './voice-navigation-status.ts';
import { ProductResultSchema } from './product-agent.ts';
import { VoiceBacktestDraftSchema } from './voice-backtest-draft.ts';
import { NewsSelectionSchema, NewsRevisionSchema, VoiceNewsStatusSchema } from './news-voice.ts';
import { VoiceObjectNavigationResultSchema } from './voice-object-navigation.ts';

// A fresh native start performs initialize, login, resume/start, then realtime/start.
// Stop may queue behind that chain before its own RPC can finish.
export const VOICE_TIMING = {
  rpc: 30_000, start: 135_000, connect: 65_000, stop: 170_000,
  startingLease: 150_000, mediaDeadline: 145_000, socket: 285_000,
} as const;

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const LoginUrlSchema = z.string().max(8192).url().refine(value => {
  const url = new URL(value);
  return ['https://auth.openai.com', 'https://chatgpt.com'].includes(url.origin) && !url.username && !url.password;
});
export const VoiceRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('status') }).strict(),
  z.object({ method: z.literal('login') }).strict(),
  z.object({ method: z.literal('cancel-login') }).strict(),
  z.object({ method: z.literal('test-model') }).strict(),
  z.object({ method: z.literal('connect'), apiKey: z.string().min(20).max(512).regex(/^[\x21-\x7e]+$/) }).strict(),
  // `news` is the selection this call opens with; leaving it out keeps the existing start exactly as
  // it was. A call that starts with one gets a thread this product never records for reuse.
  z.object({ method: z.literal('start'), sessionId: id, callId: z.string().uuid(), sdp: z.string().min(50).max(100_000).startsWith('v=0'),
    news: z.object({ revision: NewsRevisionSchema, selection: NewsSelectionSchema }).strict().optional() }).strict(),
  /**
   * Change or clear the current news reference of a call that is already connected. `selection: null`
   * means there is no current reference from now on — not that anything was deleted. `requestId` is
   * the retry identity: repeating it with the same content never appends a second time, and reusing
   * it for different content is refused.
   */
  z.object({ method: z.literal('news-context'), callId: z.string().uuid(), sessionId: id,
    requestId: z.string().uuid(), revision: NewsRevisionSchema, selection: NewsSelectionSchema.nullable() }).strict(),
  z.object({ method: z.literal('poll'), callId: z.string().uuid(), cursor: z.number().int().nonnegative() }).strict(),
  z.object({ method: z.literal('stop'), callId: z.string().uuid() }).strict(),
  z.object({ method: z.literal('interrupt'), callId: z.string().uuid(), turnId: id }).strict(),
]);
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;
export type NewsContextRequest = Extract<VoiceRequest, { method: 'news-context' }>;
export const VoiceEventSchema = z.object({
  seq: z.number().int().positive(),
  type: z.enum(['sdp', 'started', 'transcript.delta', 'transcript.done', 'navigation', 'object.navigation', 'history.saved', 'history.warning', 'history.search', 'backtest.draft', 'turn.started', 'turn.completed', 'turn.unconfirmed', 'tool', 'product.result', 'error', 'closed']),
  text: z.string().max(100_000).optional(), role: z.string().max(40).optional(), turnId: id.optional(),
  /**
   * What one explicit business request actually did: the stored receipt, the page that was read, or
   * a plain statement that nothing was saved. Only `product.result` carries it, it is always the
   * host's own validated result rather than anything a model said, and the page reads it to refresh
   * the affected module immediately instead of waiting for the next turn.
   */
  product: ProductResultSchema.optional(),
  historySearch: VoiceHistoryResultSchema.optional(),
  /** A local-only spoken backtest draft. It contains only the user's cited instruction and bounded form fields. */
  backtestDraft: VoiceBacktestDraftSchema.optional(),
  /** Host-resolved local object identity. Models never provide this field. */
  objectNavigation: VoiceObjectNavigationResultSchema.optional(),
}).strict().superRefine((event, ctx) => {
  if ((event.type === 'object.navigation') !== Boolean(event.objectNavigation))
    ctx.addIssue({ code: 'custom', path: ['objectNavigation'], message: 'Object navigation payload belongs only to object.navigation events' });
});
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;
export const VoiceReplySchema = z.object({
  configured: z.boolean(), callId: z.string().uuid().nullable(),
  state: z.enum(['off', 'starting', 'active', 'stopping', 'failed']),
  events: z.array(VoiceEventSchema).max(100), cursor: z.number().int().nonnegative(),
  error: z.string().max(500).optional(),
  authMode: z.enum(['chatgpt', 'apiKey']).nullable().optional(),
  login: z.object({ state: z.enum(['pending', 'failed']), url: LoginUrlSchema.optional() }).strict().nullable().optional(),
  modelCheck: z.object({ state: z.enum(['untested', 'testing', 'passed', 'failed']), model: z.string().max(100).optional() }).strict().optional(),
  diagnostic: z.object({ stage: z.enum(['thread', 'realtime']), code: z.string().max(80) }).strict().optional(),
  /**
   * What this host knows about the news reference of the current call, if it has one at all. The
   * page shows "已送入" from this and from nothing else, and matches it by revision, request and
   * article rather than assuming its own latest click was the one that landed.
   */
  news: VoiceNewsStatusSchema.optional(),
  /** Persistent bounded navigation status; independent of the paged event log and transcript saving. */
  navigation: VoiceNavigationStatusSchema.optional(),
}).strict().refine(reply => !reply.navigation || reply.navigation.callId === reply.callId, 'Navigation status belongs to this call');
export type VoiceReply = z.infer<typeof VoiceReplySchema>;

/** Retain only an allowlisted failure category, never upstream bodies or credentials. */
export function realtimeErrorCode(message: string): string {
  if (/requires API key auth/i.test(message)) return 'VOICE_API_BRANCH';
  if (/invalid value/i.test(message) && /response\.cancel|output_audio_buffer\.clear/i.test(message)) return 'VOICE_PROTOCOL_MISMATCH';
  const parameter = message.match(/(?:unknown|unsupported|unrecognized) parameter:?\s*['"]([a-z_.]{1,45})['"]/i)?.[1];
  if (parameter) return `VOICE_UNKNOWN_PARAM_${parameter.toUpperCase().replaceAll('.', '_')}`;
  for (const code of ['model_not_found', 'invalid_api_key', 'insufficient_quota', 'invalid_request_error']) {
    if (message.includes(code)) return `VOICE_${code.toUpperCase()}`;
  }
  const status = message.match(/(?:http(?:\/\d(?:\.\d)?)?(?:\s+(?:client|server))?(?:\s+error)?|status(?:\s+code)?)[\s:=]*(400|401|403|404|429|500|502|503)\b/i)?.[1];
  if (status) return `VOICE_HTTP_${status}`;
  if (/timed?\s*out|timeout/i.test(message)) return 'VOICE_TIMEOUT';
  if (/not supported|unsupported/i.test(message)) return 'VOICE_UNSUPPORTED';
  if (/connect|dns|network|tls/i.test(message)) return 'VOICE_NETWORK';
  return 'VOICE_REALTIME_FAILED';
}

export function voiceError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ENGINE_ACCOUNT_DISCOVERY_TIMEOUT') return '官方账号服务连接超时，尚未开始语音。请稍后重新开启语音，无需因此重新登录。';
  if (code === 'VOICE_API_BRANCH') return '当前请求走到了需要 API key 的语音分支，请检查连接路径。';
  if (code === 'VOICE_PROTOCOL_MISMATCH') return '当前语音服务不接受应用发送的播放控制指令，通话已停止；这不是登录失效。';
  if (code === 'VOICE_MODEL_NOT_FOUND') return '当前语音模型在此账号下不可用，需要核实官方语音模型配置。';
  if (code === 'VOICE_INVALID_REQUEST_ERROR' || code.startsWith('VOICE_UNKNOWN_PARAM_')) return '官方语音服务拒绝了当前连接参数，正在核实原生语音协议。';
  if (code.startsWith('VOICE_HTTP_') && /^VOICE_HTTP_\d{3}$/.test(code)) return `官方语音服务返回 HTTP ${code.slice(-3)}；模型文字连接与语音服务需分别核实。`;
  if (code === 'VOICE_TIMEOUT') return '官方语音连接超时，麦克风已关闭，请检查网络后重试。';
  if (code === 'VOICE_UNSUPPORTED') return '当前官方运行时不支持这组语音参数，需要调整语音连接配置。';
  if (code === 'VOICE_NETWORK') return '本机无法建立官方语音网络连接，请检查网络后重试。';
  if (code === 'VOICE_LOGIN_REQUIRED') return '请先在本产品中登录 ChatGPT，或填写 OpenAI API 密钥。';
  if (code === 'MODEL_CHECK_FAILED') return '模型连接验证未完成，请检查登录、订阅额度和网络后重试。';
  if (code === 'VOICE_BUSY') return '另一个语音会话仍在使用中，请先结束它。';
  if (code === 'VOICE_STALE') return '这次语音连接已结束，请重新开始。';
  if (code === 'VOICE_NEWS_NOT_READY') return '语音正在接通，接通后再送这条资讯。';
  if (code === 'VOICE_OVERFLOW') return '语音状态更新中断，请结束后重新开始。';
  if (code === 'VOICE_ISOLATION') return '语音运行目录隔离检查未通过，连接已停止。';
  if (code === 'VOICE_CONFIG') return '语音本地配置不可读取，请保留资料并检查目录。';
  return '原生语音连接未完成，请检查官方接口额度、网络和当前运行时支持情况后重试。';
}
