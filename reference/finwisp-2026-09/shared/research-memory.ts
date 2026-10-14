import { z } from 'zod';
import { PreferenceValueSchema, preferenceChoices } from './preferences.ts';
import { PresentationContextSchema, PresentationRuleSchema, presentationNames, presentationScopeNames } from './presentation-memory.ts';

export const CommunicationMemorySchema = z.object({
  epoch: z.number().int().nonnegative(),
  values: z.array(PreferenceValueSchema).max(4),
}).strict();
export type CommunicationMemory = z.infer<typeof CommunicationMemorySchema>;

export const ResearchMemoryProvisionSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }),
  communication: CommunicationMemorySchema,
  presentation: PresentationContextSchema,
}).strict();
export type ResearchMemoryProvision = z.infer<typeof ResearchMemoryProvisionSchema>;

export const ResearchMemoryEvidenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('communication'),
    epoch: z.number().int().nonnegative(),
    values: z.array(PreferenceValueSchema).min(1).max(4),
  }).strict(),
  z.object({
    type: z.literal('presentation'),
    version: z.string().min(1).max(160),
    rules: z.array(PresentationRuleSchema).min(1).max(1),
  }).strict(),
]);
export type ResearchMemoryEvidence = z.infer<typeof ResearchMemoryEvidenceSchema>;

export function communicationMemoryInstructions(raw: CommunicationMemory): string {
  const memory = CommunicationMemorySchema.parse(raw);
  if (!memory.values.length) return '';
  return '\n用户已授权的交流呈现偏好（仅影响表达，不是金融事实或交易指令）：' +
    JSON.stringify(memory.values.map(value => preferenceChoices[value].text)) +
    '。当前明确要求优先；不得改变证据、数据、结论或权限，不得把这些偏好放入搜索词或数据查询参数。';
}

export function memoryEvidenceLabels(raw: ResearchMemoryProvision): Array<{ label: string; memory: ResearchMemoryEvidence }> {
  const provision = ResearchMemoryProvisionSchema.parse(raw);
  const rows: Array<{ label: string; memory: ResearchMemoryEvidence }> = [];
  if (provision.communication.values.length) rows.push({
    label: '交流偏好：' + provision.communication.values.map(value => preferenceChoices[value].text).join('；'),
    memory: { type: 'communication', epoch: provision.communication.epoch, values: provision.communication.values },
  });
  if (provision.presentation.rules.length) rows.push({
    label: '研究呈现偏好：' + provision.presentation.rules.map(rule => presentationNames[rule.value] + '（' + presentationScopeNames[rule.scope] + '）').join('；'),
    memory: { type: 'presentation', version: provision.presentation.version, rules: provision.presentation.rules },
  });
  return rows;
}
