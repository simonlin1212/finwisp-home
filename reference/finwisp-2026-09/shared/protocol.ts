import { WatchInputSchema, WatchSchema, SessionTargetSchema } from './watchlist.ts';
export { WatchInputSchema, WatchSchema } from './watchlist.ts';
import { VoiceResearchRecordSchema } from './voice-research.ts';
import { CORE_SCHEMA_VERSION } from './storage-version.ts';
import { SourceTraceSchema, SourceTraceViewSchema } from './source-trace.ts';
import { PersonalizationSchema, PreferenceCategorySchema, PreferenceValueSchema } from './preferences.ts';
import { BriefDraftSchema, DraftRequestSchema, DraftControlSchema } from './brief-draft.ts';
import { z } from 'zod';
import { BriefWriteSchema, ResearchBriefSchema } from './research-brief.ts';
import { ResearchTaskSchema } from './research.ts';
import { VoiceTranscriptSchema } from './voice-history.ts';
import { DocumentSchema, SessionDocumentSchema } from './documents.ts';

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1).max(160);
const text = z.string().trim().min(1).max(12_000);
const targetVersion = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const SettingsSchema = z.object({
  skin: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reducedMotion: z.boolean(),
  memoryMode: z.enum(['off', 'manual', 'auto']),
  saveVoiceHistory: z.boolean().default(true),
}).strict();
export type Settings = z.infer<typeof SettingsSchema>;
export const SettingsPatchSchema = SettingsSchema.omit({ saveVoiceHistory: true }).partial().extend({ saveVoiceHistory: z.boolean().optional() }).refine(v => Object.keys(v).length > 0);
export const MemoryInputSchema = z.object({ kind: z.enum(['preference', 'question']), text: text.max(2000), sourceSessionId: id.nullable() }).strict();
const ResearchSubmitParamsSchema = z.object({
  sessionId: id,
  requestId: id.min(8),
  text,
  revision: z.number().int().nonnegative(),
  navigationText: z.string().trim().min(1).max(160).optional(),
  focusReceipt: z.string().uuid().optional(),
}).strict().refine(value => !(value.navigationText && value.focusReceipt), 'Use one temporary object authorization');
export const RequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('research.brief.generate'), params: DraftRequestSchema }).strict(),
  z.object({ method: z.literal('research.brief.discard'), params: DraftControlSchema }).strict(),
  z.object({ method: z.literal('research.brief.save'), params: BriefWriteSchema }).strict(),
  z.object({ method: z.literal('preference.correct'), params: z.object({ value: PreferenceValueSchema, epoch: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ method: z.literal('preference.delete'), params: z.object({ category: PreferenceCategorySchema, epoch: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ method: z.literal('session.memory'), params: z.object({ sessionId: id, excluded: z.boolean(), epoch: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ method: z.literal('snapshot'), params: z.object({}).strict() }).strict(),
  z.object({ method: z.literal('session.create'), params: z.object({ title, id }).strict() }).strict(),
  z.object({ method: z.literal('session.draft'), params: z.object({ id, text: z.string().max(12_000), revision: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ method: z.literal('question.save'), params: z.object({ sessionId: id, requestId: id.min(8), text, revision: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ method: z.literal('research.submit'), params: ResearchSubmitParamsSchema }).strict(),
  z.object({ method: z.literal('research.start'), params: z.object({ messageId: id }).strict() }).strict(),
  z.object({ method: z.literal('research.cancel'), params: z.object({ id, attempt: z.number().int().positive() }).strict() }).strict(),
  z.object({ method: z.literal('research.retry'), params: z.object({ id, attempt: z.number().int().positive() }).strict() }).strict(),
  z.object({ method: z.literal('settings.update'), params: SettingsPatchSchema }).strict(),
  z.object({ method: z.literal('memory.add'), params: MemoryInputSchema }).strict(),
  z.object({ method: z.literal('memory.delete'), params: z.object({ id }).strict() }).strict(),
  z.object({ method: z.literal('watch.add'), params: WatchInputSchema }).strict(),
  z.object({ method: z.literal('watch.prepare'), params: z.object({ id, sessionId: id }).strict() }).strict(),
  // Bounded one below the storable maximum so an accepted request can never write an unreadable version.
  z.object({ method: z.literal('watch.target.set'), params: z.object({ sessionId: id, watchId: id, expectedVersion: targetVersion }).strict() }).strict(),
  z.object({ method: z.literal('watch.target.clear'), params: z.object({ sessionId: id, expectedVersion: targetVersion }).strict() }).strict(),
  z.object({ method: z.literal('watch.delete'), params: z.object({ id }).strict() }).strict(),
  // The same bound and the same retry rule as a research target; the choice is a reference to a stored document.
  z.object({ method: z.literal('document.select'), params: z.object({ sessionId: id, documentId: id, expectedVersion: targetVersion }).strict() }).strict(),
  z.object({ method: z.literal('document.clear'), params: z.object({ sessionId: id, expectedVersion: targetVersion }).strict() }).strict(),
]);
export type Request = z.infer<typeof RequestSchema>;
const offset = z.number().int().min(0).max(1_000_000_000).default(0);
export const ViewSchema = z.object({ sessionId: id.optional(), source: SourceTraceViewSchema.optional(), sessionsOffset: offset, messagesOffset: offset, memoriesOffset: offset, watchlistOffset: offset, voiceOffset: offset, voiceResearchOffset: offset }).strict();
export type View = z.input<typeof ViewSchema>;
export const TransportSchema = z.object({ request: RequestSchema, view: ViewSchema.default({ sessionsOffset: 0, messagesOffset: 0, memoriesOffset: 0, watchlistOffset: 0, voiceOffset: 0, voiceResearchOffset: 0 }) }).strict();
export const MessageSchema = z.object({ id, text: z.string(), createdAt: z.string(), role: z.literal('user'), status: z.literal('saved') });
export const SessionSchema = z.object({ id, title: z.string(), draft: z.string(), revision: z.number(), createdAt: z.string(), updatedAt: z.string(), messages: z.array(MessageSchema), messageCount: z.number().int(), voiceMessageCount: z.number().int().nonnegative(), hasDraft: z.boolean() });
export const MemorySchema = z.object({ id, kind: z.enum(['preference', 'question']), text: z.string(), sourceSessionId: id.nullable(), createdAt: z.string(), origin: z.literal('manual') });
export const SnapshotSchema = z.object({
  sourceTrace: SourceTraceSchema.optional(),
  sessionTarget: SessionTargetSchema.nullable(),
  sessionDocument: SessionDocumentSchema.nullable(), documents: z.array(DocumentSchema).max(50),
  schemaVersion: z.literal(CORE_SCHEMA_VERSION), voiceResearch: z.array(VoiceResearchRecordSchema).max(20), briefDraft: BriefDraftSchema.nullable(), personalization: PersonalizationSchema, researchBrief: ResearchBriefSchema.nullable(), voiceTranscripts: z.array(VoiceTranscriptSchema).max(50), sessions: z.array(SessionSchema), memories: z.array(MemorySchema), watchlist: z.array(WatchSchema), tasks: z.array(ResearchTaskSchema).max(50),
  settings: SettingsSchema, memoryEpoch: z.number().int().nonnegative(),
  activeSession: SessionSchema.nullable(),
  counts: z.object({ sessions: z.number(), messages: z.number(), voiceMessages: z.number(), voiceResearch: z.number(), memories: z.number(), watchlist: z.number() }),
  view: ViewSchema,
  engine: z.object({ state: z.enum(['not_connected', 'connected']), voice: z.literal('not_connected') }),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Watch = z.infer<typeof WatchSchema>;
export class AppError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export const ErrorCodeSchema = z.enum(['INVALID_INPUT', 'NOT_FOUND', 'CONFLICT', 'MEMORY_OFF', 'STORAGE_ERROR', 'HOST_UNAVAILABLE', 'ENGINE_NOT_CONNECTED', 'VOICE_ACTIVE', 'DRAFT_BUSY', 'DRAFT_NO_SOURCES', 'BACKTEST_DATA_UNVERIFIED', 'OBJECT_FOCUS_EXPIRED']);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const errorMessages: Record<ErrorCode, string> = {
  DRAFT_BUSY: '已有研究进度正在整理，请等待完成或先停止它。',
  DRAFT_NO_SOURCES: '本次选中的记录中没有可整理的用户问题或已完成的语音研究任务。请先保存问题或完成研究。',
  BACKTEST_DATA_UNVERIFIED: '受控历史数据回执已失效或不是本机生成；请重新读取，或转为不带受控证据的手工数据。',
  OBJECT_FOCUS_EXPIRED: '刚才打开的证券对象已失效；请重新打开该证券后，再明确说“分析它/这家公司…”。',
  VOICE_ACTIVE: '语音或后台研究尚未结束，请等待完成或中断研究后再修改进度、研究标的或研究资料。',
  INVALID_INPUT: '内容格式不正确或过长，请检查后重试。',
  NOT_FOUND: '这条记录已不存在，请重新打开。',
  CONFLICT: '记录已经变化，或内容已添加。请重新打开后再试。',
  MEMORY_OFF: '请先在记忆设置中开启手动记忆。',
  STORAGE_ERROR: '本地保存失败，内容尚未确认写入，请保留输入并重试。',
  HOST_UNAVAILABLE: '本地服务暂时不可用，请保留输入并重新打开应用。',
  ENGINE_NOT_CONNECTED: '研究引擎尚未连接，问题仍保存在本机。',
};
