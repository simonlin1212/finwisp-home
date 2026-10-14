import { glossary } from './glossary.js';
import { z } from 'zod';
export const DISCLAIMER='Educational use only, not investment advice.';
export function isAdvice(text:string) {
 return /\b(buy|sell|hold|price[ -]?target|allocation|allocate|portfolio|invest|investment recommendation|worth buying|good investment|overvalued|undervalued|entry point|exit point|add to my position|time to get in|time to get out|keep my shares|keep this stock)\b|\b(will|could|can|going to|likely to)\b.{0,60}\b(go up|rise|fall|rally|crash|outperform|double|increase|recover)\b|\b(should|would you|recommend)\b.{0,40}\b(stock|shares|money|position)\b|\b(how much|what percentage|what percent)\b.{0,40}\b(put|weight|exposure)\b/i.test(text);
}
export function policyResponse() {return {mode:'policy',text:`I cannot recommend trades, portfolio allocations, price targets, or predict stock prices. Here are 3 questions you can check yourself:\n1. How have revenue and margins changed in the filings?\n2. How do operating cash flow and profit compare?\n3. What risks and liabilities does the company report?\n${DISCLAIMER}`,questions:['How have revenue and margins changed in the filings?','How do operating cash flow and profit compare?','What risks and liabilities does the company report?'],note:DISCLAIMER};}
export const conceptSchema=z.object({concept:z.enum(Object.keys(glossary) as [string,...string[]])});
export async function explainConcept(args:unknown) {const {concept}=conceptSchema.parse(args);return {concept,text:glossary[concept],note:DISCLAIMER};}
export const INSTRUCTIONS='Teach in English: lookup company, read SEC filings and facts, compute metrics, show cards, then quiz and review learning memory. Refuse trade, allocation, price-target and prediction requests; reframe into three filing questions. Education only, not investment advice. SEC requests are serialized at least 210 ms apart (under five/second); use one shared SEC client.';
