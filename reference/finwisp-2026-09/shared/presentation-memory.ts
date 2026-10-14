import { z } from 'zod';

export const PresentationValueSchema = z.enum(['cashflow-first', 'profit-first']);
export const PresentationScopeSchema = z.enum(['financial-reports', 'mature-business']);
export const PresentationRuleSchema = z.object({ value: PresentationValueSchema, scope: PresentationScopeSchema }).strict();
export type PresentationRule = z.infer<typeof PresentationRuleSchema>;
export const presentationNames = { 'cashflow-first': '财报先讲现金流', 'profit-first': '财报先讲利润' } as const;
export const presentationScopeNames = { 'financial-reports': '财报分析', 'mature-business': '仅成熟业务的财报分析' } as const;
export const PresentationSourceSchema = z.object({ kind: z.enum(['text', 'voice']), id: z.string().min(1).max(80), sessionId: z.string().min(1).max(80), proof: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type PresentationSource = z.infer<typeof PresentationSourceSchema>;
export const PresentationEntrySchema = z.object({ rule: PresentationRuleSchema, origin: z.enum(['automatic', 'confirmed']), source: PresentationSourceSchema.nullable(), updatedAt: z.string().datetime() }).strict();
export type PresentationEntry = z.infer<typeof PresentationEntrySchema>;
export const PresentationStatusSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), epoch: z.number().int().nonnegative(), enabled: z.boolean(),
  mode: z.enum(['off', 'manual', 'auto']), entry: PresentationEntrySchema.nullable(), pending: PresentationEntrySchema.nullable(),
  issue: z.boolean(), interpreter: z.literal('bounded-local-v1'),
}).strict();
export type PresentationStatus = z.infer<typeof PresentationStatusSchema>;
export const PresentationContextSchema = z.object({ version: z.string().min(1).max(160), rules: z.array(PresentationRuleSchema).max(1) }).strict();
export type PresentationContext = z.infer<typeof PresentationContextSchema>;

/** This is intentionally a finite local grammar, NOT a general semantic model. A whole
 * utterance must express an enduring financial-presentation request. No substring extraction
 * from quotes, reports, mixed questions, instructions or financial/permission claims. */
export function localPresentationCandidate(text: string): PresentationRule | null {
  if (text.length > 200) return null;
  const speech = text.trim().replace(/[。！!]$/, '').replace(/[ \t]/g, '');
  const match = /^(?:以后|今后|从现在起)(?:请)?(?:看|分析|讲解)(?:财报|财务报告)(?:时)?[，,]?(?:请)?先(?:讲|说|看)(现金流|利润)(?:[，,](?:但)?(?:只适用于|仅限)(成熟业务|成熟企业))?$/.exec(speech);
  if (!match) return null;
  return { value: match[1] === '现金流' ? 'cashflow-first' : 'profit-first', scope: match[2] ? 'mature-business' : 'financial-reports' };
}

/** Fixed product-owned text only. Stored/source text can never become developer instructions.
 * Providing a conditional presentation preference is not proof the model actually applied it. */
export function presentationInstructions(raw: PresentationContext): string {
  const context = PresentationContextSchema.parse(raw);
  if (!context.rules.length) return '';
  const rule = context.rules[0]!;
  return '\n用户已授权的有限研究呈现偏好（不是财务事实或交易指令）：' + presentationNames[rule.value] +
    '。适用范围：' + presentationScopeNames[rule.scope] + '。' +
    (rule.scope === 'mature-business' ? '只有用户或已核验资料明确表明当前研究对象为成熟业务时才适用；阶段未知、早期研发或混合业务时不套用，不根据股票代码猜测阶段。' : '非财报问题不适用。') +
    '当前明确要求（包括“仅这一次”）优先。只调整说明顺序，不减少证据、改变数据和计算口径、隐瞒风险、改变研究结论或增加权限；不得把此偏好放入网页搜索或数据查询参数。不要宣称偏好已经执行或新记忆已经保存。';
}
