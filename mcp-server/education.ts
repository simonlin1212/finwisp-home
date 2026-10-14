import { z } from 'zod';
import { createHash } from 'node:crypto';
import { profiles, profileId } from './memory.js';
import { glossary } from './glossary.js';
const fact = z.object({ fiscalYear: z.number().int(), value: z.number().finite(), unit: z.string(), end: z.string(), accessionNumber: z.string(), concept: z.string().optional() });
const financials = z.array(z.object({ metric: z.string(), values: z.array(fact).max(100) })).max(30);
const computedSchema = z.array(z.object({ metric: z.enum(Object.keys(glossary) as [string,...string[]]), fiscalYear: z.number().int(), value: z.number().finite().nullable(), reason: z.string().optional(), sources: z.array(fact).max(10) })).max(100);
export const educationSchemas = {
  compute_metrics: z.object({ financials }),
  make_card: z.object({ type: z.enum(['metric','concept','trend']), metric: z.enum(Object.keys(glossary) as [string,...string[]]), computed: computedSchema }),
  make_quiz: z.object({ computed: computedSchema }),
  grade_quiz: z.object({ quiz_id: z.string().max(100), answers: z.array(z.number().int().min(0).max(3)).length(3), profile_id: profileId.removeDefault().optional() }),
};
const quizzes = new Map<string, { expires: number; questions: {options:string[]; concept:string; explanation:string}[]; keys: number[] }>();
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
    const card = { type, title: titleCase(metric), body: `${glossary[metric]} ${figures.map(f => `FY${f.fiscalYear}: ${f.value === null ? 'Unavailable' : formatPercent(f.value)}${f.sources.filter(s=>s.unit==='USD').map(s=>` (${s.concept ?? 'source'}: ${formatUSD(s.value)})`).join('')}`).join('; ')}`, figures, ...(type==='trend' ? { chart: { series: figures.map(f=>({ year:f.fiscalYear, value:f.value })) } } : {}) };
    return { card, text: `${card.title}: ${card.body}`, note: 'Educational use only, not investment advice.' };
  },
  make_quiz: async (args: unknown) => {
    const { computed } = educationSchemas.make_quiz.parse(args);
    const selected = computed.filter(c=>c.value!==null).slice(0,2);
    const base = selected.map((c,i)=> {
      if(i===1) {
        const value=formatPercent(c.value!);
        const wrong=[...new Set([...computed.filter(v=>v.metric===c.metric && v.fiscalYear!==c.fiscalYear),...computed.filter(v=>v.fiscalYear===c.fiscalYear && v.metric.includes('margin')), ...computed.filter(v=>v.metric===c.metric)].filter(v=>v.value!==null && formatPercent(v.value!)!==value).map(v=>formatPercent(v.value!)))].slice(0,3);
        for(const v of [c.value!+.01,c.value!-.01,c.value!*2]) if(wrong.length<3 && !wrong.includes(formatPercent(v)) && formatPercent(v)!==value) wrong.push(formatPercent(v));
        return {id:i,concept:c.metric,prompt:`What is ${titleCase(c.metric)} in FY${c.fiscalYear}?`,options:[value,...wrong],explanation:`${glossary[c.metric]} The computed FY${c.fiscalYear} value is ${value}.`};
      }
      return {id:i,concept:c.metric,prompt:`What does ${titleCase(c.metric)} measure?`,options:[glossary[c.metric],...Object.entries(glossary).filter(([m])=>m!==c.metric).slice(0,3).map(([,v])=>v)],explanation:glossary[c.metric]};
    });
    while(base.length<2) base.push({id:base.length,concept:'net_margin',prompt:'What does Net Margin measure?',options:[glossary.net_margin,glossary.gross_margin,glossary.operating_margin],explanation:glossary.net_margin});
    base.push({id:2,concept:'education_policy',prompt:'What can a financial ratio tell you?',options:['It explains one aspect of a business, with context from filings.','It determines a suitable allocation for your portfolio.','It predicts the next stock price from past profits.'],explanation:'Ratios help explain business performance; they do not predict prices or provide personal investment advice.'});
    const quiz_id=createHash('sha256').update(JSON.stringify(base)).digest('hex');
    let seed=parseInt(quiz_id.slice(0,8),16)>>>0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const keys:number[]=[];
    const questions=base.map(q=>{const options=q.options.map((text,index)=>({text,index}));for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j],options[i]];} keys.push(options.findIndex(o=>o.index===0)); return {...q,options:options.map(o=>o.text)};});
    for(const [id,q] of quizzes) if(q.expires<Date.now()) quizzes.delete(id);
    if(quizzes.size>=1000) quizzes.delete(quizzes.keys().next().value!);
    quizzes.set(quiz_id,{expires:Date.now()+3600000,keys,questions});
    return {quiz_id,questions:questions.map(({explanation,...q})=>q),text:'Choose one answer per question.'};
  },
  grade_quiz: async (args: unknown) => {
    const {quiz_id,answers,profile_id}=educationSchemas.grade_quiz.parse(args), quiz=quizzes.get(quiz_id);
    if(!quiz || quiz.expires<Date.now()) throw new Error('Unknown or expired quiz; generate it again.');
    if(answers.some((a,i)=>a>=quiz.questions[i].options.length)) throw new Error('Answer index outside options');
    const correct=answers.map((a,i)=>a===quiz.keys[i]), score=correct.filter(Boolean).length;
    const results=quiz.questions.map((q,i)=>({correct:correct[i],correct_option:q.options[quiz.keys[i]],explanation:q.explanation,concept:q.concept}));
    if(profile_id) await profiles.update(profile_id,{type:'quiz',score,missedConcepts:results.filter(r=>!r.correct).map(r=>r.concept)});
    return {quiz_id,correct,results,score,total:3};
  },
};
export const titleCase=(text:string)=>text.split('_').map(w=>w==='yoy'?'YoY':w==='cagr'?'CAGR':w[0].toUpperCase()+w.slice(1)).join(' ');
export const formatPercent=(value:number)=>`${(value*100).toFixed(1)}%`;
export function formatUSD(value:number) {const n=Math.abs(value);const [scale,suffix]=n>=1e12?[1e12,'T']:n>=1e9?[1e9,'B']:n>=1e6?[1e6,'M']:n>=1e3?[1e3,'K']:[1,''];return `${value<0?'-':''}$${(n/Number(scale)).toFixed(1)}${suffix}`;}
