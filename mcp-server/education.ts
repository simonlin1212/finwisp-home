import { z } from 'zod';
import { createHash } from 'node:crypto';
import { glossary } from './glossary.js';
const fact = z.object({ fiscalYear: z.number().int(), value: z.number().finite(), unit: z.string(), end: z.string(), accessionNumber: z.string(), concept: z.string().optional() });
const financials = z.array(z.object({ metric: z.string(), values: z.array(fact).max(100) })).max(30);
const computedSchema = z.array(z.object({ metric: z.enum(Object.keys(glossary) as [string,...string[]]), fiscalYear: z.number().int(), value: z.number().finite().nullable(), reason: z.string().optional(), sources: z.array(fact).max(10) })).max(100);
export const educationSchemas = {
  compute_metrics: z.object({ financials }),
  make_card: z.object({ type: z.enum(['metric','concept','trend']), metric: z.enum(Object.keys(glossary) as [string,...string[]]), computed: computedSchema }),
  make_quiz: z.object({ computed: computedSchema }),
  grade_quiz: z.object({ quiz_id: z.string().max(100), answers: z.array(z.number().int().min(0).max(2)).length(3) }),
};
const quizzes = new Map<string, { expires: number; keys: number[] }>();
export const educationHandlers = {
  compute_metrics: async (args: unknown) => {
    const { financials } = educationSchemas.compute_metrics.parse(args);
    const get = (m: string, year: number) => financials.find(f => f.metric === m)?.values.find(v => v.fiscalYear === year && v.unit === 'USD');
    const years = [...new Set(financials.flatMap(f => f.values.map(v => v.fiscalYear)))].sort((a,b)=>b-a);
    const computed: z.infer<typeof computedSchema> = [];
    const add = (metric: string, year: number, a: ReturnType<typeof get>, b: ReturnType<typeof get>, growth = false, exponent = 1) => {
      const sources = [a,b].filter((v): v is NonNullable<typeof v> => !!v);
      const compatible = a && b && (growth || a.end === b.end);
      const value = compatible && b.value !== 0 && (!growth || (a.value >= 0 && b.value > 0)) ? (a.value / b.value) ** exponent - (growth ? 1 : 0) : null;
      const result = value !== null && Number.isFinite(value) ? value : null;
      computed.push({ metric, fiscalYear: year, value: result, ...(result === null ? { reason: 'Missing, mismatched period, zero denominator, or invalid growth base.' } : {}), sources });
    };
    for (const year of years) {
      for (const [metric,a,b] of [['gross_margin','GrossProfit','Revenue'],['net_margin','NetIncomeLoss','Revenue'],['operating_margin','OperatingIncomeLoss','Revenue'],['liabilities_to_assets','Liabilities','Assets'],['operating_cash_conversion','NetCashProvidedByUsedInOperatingActivities','NetIncomeLoss']]) add(metric,year,get(a,year),get(b,year));
      add('revenue_growth_yoy',year,get('Revenue',year),get('Revenue',year-1),true);
    }
    const revenues = financials.find(f => f.metric === 'Revenue')?.values.filter(v=>v.unit==='USD').sort((a,b)=>a.fiscalYear-b.fiscalYear) ?? [];
    if (revenues.length > 1) { const a=revenues.at(-1)!, b=revenues[0]; add('cagr',a.fiscalYear,a,b,true,1/(a.fiscalYear-b.fiscalYear)); }
    return { computed, glossary, note: 'Educational use only, not investment advice.' };
  },
  make_card: async (args: unknown) => {
    const { type, metric, computed } = educationSchemas.make_card.parse(args);
    const figures = computed.filter(v=>v.metric===metric);
    const card = { type, title: metric.replaceAll('_',' '), body: glossary[metric], figures, ...(type==='trend' ? { chart: { series: figures.map(f=>({ year:f.fiscalYear, value:f.value })) } } : {}) };
    return { card, text: `${card.title}: ${card.body}`, note: 'Educational use only, not investment advice.' };
  },
  make_quiz: async (args: unknown) => {
    const { computed } = educationSchemas.make_quiz.parse(args);
    const selected = computed.filter(c=>c.value!==null).slice(0,2);
    const questions = selected.map((c,i)=>({ id:i, prompt:`In FY${c.fiscalYear}, ${c.metric.replaceAll('_',' ')} is ${c.value!.toFixed(4)}. What does this measure?`, options:[glossary[c.metric], 'The share price tomorrow.', 'A guarantee of future profit.'] }));
    while (questions.length<2) questions.push({id:questions.length,prompt:'What does net margin measure?',options:[glossary.net_margin,'The share price tomorrow.','A guaranteed return.']});
    questions.push({ id:2, prompt:'Does a financial ratio tell you whether you should buy a stock?', options:['Yes, always.','No. It helps explain a business but does not decide an investment.','Yes, if revenue grew.'] });
    const keys = [0,0,1];
    const quiz_id = createHash('sha256').update(JSON.stringify(questions)).digest('hex');
    for (const [id,q] of quizzes) if(q.expires<Date.now()) quizzes.delete(id);
    if(quizzes.size>=1000) quizzes.delete(quizzes.keys().next().value!);
    quizzes.set(quiz_id,{expires:Date.now()+3600000,keys});
    return { quiz_id, questions, answer_keys: keys, text:'Choose one answer per question. Answer keys are a separate instructor field; hide them in the learner UI.' };
  },
  grade_quiz: async (args: unknown) => {
    const {quiz_id,answers}=educationSchemas.grade_quiz.parse(args), quiz=quizzes.get(quiz_id);
    if(!quiz || quiz.expires<Date.now()) throw new Error('Unknown or expired quiz; generate it again.');
    const correct=answers.map((a,i)=>a===quiz.keys[i]);
    return {quiz_id,correct,score:correct.filter(Boolean).length,total:3};
  },
};
