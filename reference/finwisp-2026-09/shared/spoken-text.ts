/** ASR may insert whitespace between Chinese words. Preserve numbers, Latin tokens and punctuation. */
export function compactHanSpacing(text: string): string {
  return text.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '');
}
