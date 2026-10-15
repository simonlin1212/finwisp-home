import { z } from 'zod';
import { createHash } from 'node:crypto';
import { profiles, profileId } from './memory.js';
import { glossary } from './glossary.js';
const fact = z.object({ fiscalYear: z.number().int(), value: z.number().finite(), unit: z.string(), end: z.string(), accessionNumber: z.string(), concept: z.string().optional() });
const financials = z.array(z.object({ metric: z.string(), values: z.array(fact).max(100) })).max(30);
const businessModelSchema = z.enum(['bank','general']);
const computedSchema = z.array(z.object({ metric: z.enum(Object.keys(glossary) as [string,...string[]]), fiscalYear: z.number().int(), value: z.number().finite().nullable(), reason: z.string().optional(), sources: z.array(fact).max(10) })).max(100);
export const educationSchemas = {
  compute_metrics: z.object({ financials, sic: z.string().regex(/^\d{4}$/).optional() }),
  make_card: z.object({ type: z.enum(['metric','concept','trend']), metric: z.enum(Object.keys(glossary) as [string,...string[]]), computed: computedSchema, company: z.string().max(200).optional(), business_model: businessModelSchema.optional() }),
  make_quiz: z.object({ computed: computedSchema, seed: z.number().int().min(0).max(4294967295).optional(), concepts: z.array(z.enum(['education_policy',...Object.keys(glossary)] as [string,...string[]])).min(1).max(3).optional() }),
  grade_quiz: z.object({ quiz_id: z.string().max(100), answers: z.array(z.number().int().min(0).max(3)).length(3), profile_id: profileId.removeDefault().optional() }),
};
const quizzes = new Map<string, { expires: number; questions: {options:string[]; concept:string; explanation:string}[]; keys: number[] }>();
export const educationHandlers = {
  compute_metrics: async (args: unknown) => {
    const { financials, sic } = educationSchemas.compute_metrics.parse(args);
    const model = businessModel(financials, sic);
    const get = (m: string, year: number) => financials.find(f => f.metric === m)?.values.find(v => v.fiscalYear === year && v.unit === 'USD');
    const years = [...new Set(financials.flatMap(f => f.values.map(v => v.fiscalYear)))].sort((a,b)=>b-a);
    const computed: z.infer<typeof computedSchema> = [];
    const add = (metric: string, year: number, a: ReturnType<typeof get>, b: ReturnType<typeof get>, growth = false, exponent = 1) => {
      const sources = [a,b].filter((v): v is NonNullable<typeof v> => !!v);
      const compatible = a && b && (growth || a.end === b.end);
      // Cash divided by a loss flips sign and reads as a healthy percentage.
      const loss = compatible && metric === 'operating_cash_conversion' && b.value <= 0;
      const value = compatible && !loss && b.value !== 0 && (!growth || (a.value >= 0 && b.value > 0)) ? (a.value / b.value) ** exponent - (growth ? 1 : 0) : null;
      const result = value !== null && Number.isFinite(value) ? value : null;
      computed.push({ metric, fiscalYear: year, value: result, ...(result === null ? { reason: loss ? LOSS_REASON : 'Missing, mismatched period, zero denominator, or invalid growth base.' } : {}), sources });
    };
    for (const year of years) {
      for (const [metric,a,b] of [['gross_margin','GrossProfit','Revenue'],['net_margin','NetIncomeLoss','Revenue'],['operating_margin','OperatingIncomeLoss','Revenue'],['liabilities_to_assets','Liabilities','Assets'],['operating_cash_conversion','NetCashProvidedByUsedInOperatingActivities','NetIncomeLoss']]) add(metric,year,get(a,year),get(b,year));
      add('revenue_growth_yoy',year,get('Revenue',year),get('Revenue',year-1),true);
      if (model === 'bank') add('net_interest_share',year,get('NetInterestIncome',year),get('Revenue',year));
    }
    const revenues = financials.find(f => f.metric === 'Revenue')?.values.filter(v=>v.unit==='USD').sort((a,b)=>a.fiscalYear-b.fiscalYear) ?? [];
    if (revenues.length > 1) { const a=revenues.at(-1)!, b=revenues[0]; add('cagr',a.fiscalYear,a,b,true,1/(a.fiscalYear-b.fiscalYear)); }
    return { computed, businessModel: model, glossary, note: 'Educational use only, not investment advice.' };
  },
  make_card: async (args: unknown) => {
    const { type, metric, computed, company, business_model } = educationSchemas.make_card.parse(args);
    const notApplicable = business_model === 'bank' && BANK_NOT_APPLICABLE.has(metric);
    const figures = notApplicable ? [] : computed.filter(v=>v.metric===metric);
    const describe = (f: typeof figures[number]) => {
      const prefix = `In FY${f.fiscalYear} ${company ?? 'the company'}`;
      const [a,b] = f.sources;
      if(f.reason === LOSS_REASON && a && b) return `${prefix} had net income of ${formatUSD(b.value)}, so cash conversion is not meaningful (operating cash flow: ${formatUSD(a.value)}).`;
      if(f.value === null) return `${prefix} has insufficient comparable data for ${titleCase(metric).toLowerCase()}.`;
      const amounts = a && b ? ` (${formatUSD(a.value)} of ${formatUSD(b.value)})` : a ? ` (reported amount: ${formatUSD(a.value)})` : '';
      if(metric === 'net_margin') return `${prefix} kept ${formatPercent(f.value)} of revenue as net income${amounts}.`;
      if(metric === 'gross_margin') return `${prefix} kept ${formatPercent(f.value)} of revenue as gross profit${amounts}.`;
      if(metric === 'operating_margin') return `${prefix} earned ${formatPercent(f.value)} of revenue as operating income${amounts}.`;
      if(metric === 'liabilities_to_assets') return `${prefix} reported liabilities equal to ${formatPercent(f.value)} of assets${amounts}.`;
      if(metric === 'net_interest_share') return `${prefix} earned ${formatPercent(f.value)} of its revenue as net interest income${amounts}; the rest came mostly from fees and other noninterest income.`;
      if(metric === 'operating_cash_conversion') return `${prefix} generated operating cash flow equal to ${formatPercent(f.value)} of net income${amounts}.`;
      return `${prefix} had ${titleCase(metric).toLowerCase()} of ${formatPercent(f.value)}.`;
    };
    const sources = figures.flatMap(f=>f.sources.map(s=>({...s,label:conceptLabel(s.concept ?? '')})));
    const card = { type, eyebrow: cardEyebrow(type, metric), title: titleCase(metric), body: type === 'concept' ? glossary[metric] + (notApplicable ? ` ${bankNote(metric)}` : '') : notApplicable ? `${titleCase(metric).replace(/ \w/g,w=>w.toLowerCase())} does not apply to ${company ?? 'this company'}, because it is a bank. ${bankNote(metric)}` : figures.length ? figures.map(describe).join(' ') : `No annual 10-K figures for ${titleCase(metric).toLowerCase()} were available for ${company ?? 'this company'}.`,
      figures: figures.map(({sources,...f})=>f), sources,
      ...(type==='trend' && !notApplicable ? { chart: { unit:'percent', series: figures.map(f=>({ year:f.fiscalYear, value:f.value })) } } : {}) };

    return { card, ...(notApplicable ? { not_applicable: true } : {}), text: `${card.title}: ${card.body}`, note: 'Educational use only, not investment advice.' };
  },
  make_quiz: async (args: unknown) => {
    const { computed, seed: inputSeed, concepts } = educationSchemas.make_quiz.parse(args);
    const selected = computed.filter(c=>c.value!==null).slice(0,2);
    const base = selected.map((c,i)=> {
      if(i===1) {
        const value=formatPercent(c.value!);
        const below=parseInt(createHash('sha256').update(`${c.metric}:${c.fiscalYear}:${c.value}:${inputSeed ?? ''}`).digest('hex').slice(0,8),16)%4;
        const wrong=numericOptions(c.value!,below,BOUNDS[c.metric]).slice(1);
        return {id:i,concept:c.metric,prompt:`What is ${titleCase(c.metric)} in FY${c.fiscalYear}?`,options:[value,...wrong],explanation:`${glossary[c.metric]} The computed FY${c.fiscalYear} value is ${value}.`};
      }
      return conceptQuestion(i,c.metric,0);
    });
    // Without enough reported figures (e.g. a 20-F filer), fall back to distinct concept questions.
    for(const q of [conceptQuestion(0,'net_margin',0),conceptQuestion(0,'net_margin',2)]) if(base.length<2 && !base.some(b=>b.prompt===q.prompt)) base.push({...q,id:base.length});
    base.push(conceptQuestion(2,'education_policy',0));
    // Review quizzes rotate question styles so a single missed concept yields three different questions.
    if(concepts) { const unique=[...new Set(concepts)]; base.splice(0,base.length,...Array.from({length:3},(_,i)=>conceptQuestion(i,unique[i%unique.length],Math.floor(i/unique.length)))); }
    const quiz_id=createHash('sha256').update(JSON.stringify({base,seed:inputSeed})).digest('hex');
    let seed=inputSeed ?? parseInt(quiz_id.slice(0,8),16)>>>0;
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
// Banks do not sell goods, so they report no gross profit, cost of revenue or operating income.
const BANK_NOT_APPLICABLE = new Set(['gross_margin','operating_margin']);
export const NOT_APPLICABLE_FOR: Record<'bank'|'general', string[]> = { bank: [...BANK_NOT_APPLICABLE], general: [] };
const bankNote = (metric: string) => metric === 'gross_margin'
  ? 'Banks earn money from interest on loans and from fees, not by selling goods, so there is no cost of goods and no gross profit to measure. Net interest share and net margin show how a bank earns instead.'
  : 'Banks do not report an operating income line: paying interest on deposits is part of running a bank, not a separate financing cost. Net interest share and net margin show how a bank earns instead.';
// SEC SIC codes for commercial banks, savings institutions and bank holding companies.
const BANK_SIC = new Set(['6021','6022','6029','6035','6036']);
// Classify from filing data only. A filer is a bank when it reports net interest income (or has a bank SIC code)
// and none of the industrial lines; any industrial line keeps the general behaviour.
export function businessModel(financials: { metric: string; values: { unit: string }[] }[], sic?: string): 'bank'|'general' {
  const has = (m: string) => financials.some(f => f.metric === m && f.values.some(v => v.unit === 'USD'));
  if (['GrossProfit','CostOfRevenue','OperatingIncomeLoss'].some(has)) return 'general';
  return has('NetInterestIncome') || (sic !== undefined && BANK_SIC.has(sic)) ? 'bank' : 'general';
}
const LOSS_REASON = 'Net income was zero or negative, so cash conversion is not meaningful.';
// Formulas mirror compute_metrics; used for the third review question style.
const FORMULAS: Record<string,string> = {
 gross_margin:'Gross profit ÷ revenue', net_margin:'Net income ÷ revenue', operating_margin:'Operating income ÷ revenue',
 revenue_growth_yoy:'This year’s revenue ÷ last year’s revenue − 1', cagr:'(Last revenue ÷ first revenue) ^ (1 ÷ years) − 1',
 liabilities_to_assets:'Total liabilities ÷ total assets', operating_cash_conversion:'Operating cash flow ÷ net income',
 net_interest_share:'Net interest income ÷ revenue',
};
const POLICY = [
 {prompt:'What can a financial ratio tell you?',options:['It explains one aspect of a business, with context from filings.','It determines a suitable allocation for your portfolio.','It predicts the next stock price from past profits.'],explanation:'Ratios help explain business performance; they do not predict prices or provide personal investment advice.'},
 {prompt:'Can one ratio tell you whether to buy a stock?',options:['No. It describes one part of the business, not whether to invest.','Yes. A high ratio means buy.','Yes. A low ratio means sell.'],explanation:'A ratio describes the business; it is not a buy or sell signal.'},
 {prompt:'What does Finwisp Home do when asked which stock to buy?',options:['It explains the business from SEC filings without picking investments.','It recommends the company with the best margin.','It predicts next quarter’s share price.'],explanation:'Finwisp Home is educational and never recommends investments.'},
];
// Percent bounds keep distractors plausible; they apply only when the true value is inside them.
const BOUNDS: Record<string,{min?:number;max?:number}> = {
 gross_margin:{min:-100,max:100}, net_margin:{min:-100,max:100}, operating_margin:{min:-100,max:100},
 liabilities_to_assets:{min:0}, revenue_growth_yoy:{min:-100}, cagr:{min:-100}, net_interest_share:{min:0,max:100},
};
function conceptQuestion(id:number,concept:string,style:number) {
 if(concept==='education_policy') return {id,concept,...POLICY[style%POLICY.length]};
 const others=Object.keys(glossary).filter(m=>m!==concept).slice(0,3), label=titleCase(concept);
 if(style%3===1) return {id,concept,prompt:`Which term means: “${glossary[concept]}”`,options:[label,...others.map(titleCase)],explanation:`${label}: ${glossary[concept]}`};
 if(style%3===2) return {id,concept,prompt:`How is ${label} calculated?`,options:[FORMULAS[concept],...others.map(m=>FORMULAS[m])],explanation:`${label} = ${FORMULAS[concept]}. ${glossary[concept]}`};
 return {id,concept,prompt:`What does ${label} measure?`,options:[glossary[concept],...others.map(m=>glossary[m])],explanation:glossary[concept]};
}
export const titleCase=(text:string)=>text.split('_').map(w=>w==='yoy'?'YoY':w==='cagr'?'CAGR':w[0].toUpperCase()+w.slice(1)).join(' ');
export const formatPercent=(value:number)=>`${(value*100).toFixed(1)}%`;
export function formatUSD(value:number) {const n=Math.abs(value);const [scale,suffix]=n>=1e12?[1e12,'T']:n>=1e9?[1e9,'B']:n>=1e6?[1e6,'M']:n>=1e3?[1e3,'K']:[1,''];return `${value<0?'-':''}$${(n/Number(scale)).toFixed(1)}${suffix}`;}

export const CONCEPT_LABELS: Record<string,string> = {
 Revenue:'Revenue', Revenues:'Revenue', RevenueFromContractWithCustomerExcludingAssessedTax:'Revenue',
 RevenueFromContractWithCustomerIncludingAssessedTax:'Revenue', SalesRevenueNet:'Revenue',
 NetIncomeLoss:'Net income', OperatingIncomeLoss:'Operating income', CostOfGoodsAndServicesSold:'Cost of goods sold',
 CostOfRevenue:'Cost of goods sold', NetCashProvidedByUsedInOperatingActivities:'Operating cash flow',
 Assets:'Assets', Liabilities:'Liabilities', GrossProfit:'Gross profit',
 RevenuesNetOfInterestExpense:'Revenue (net of interest expense)', NetIncomeLossAvailableToCommonStockholdersBasic:'Net income to common shareholders',
 ProfitLoss:'Net income incl. noncontrolling interests', InterestIncomeExpenseNet:'Net interest income',
 InterestIncomeExpenseAfterProvisionForLoanLoss:'Net interest income after loan-loss provisions', NetInterestIncome:'Net interest income',
};
// Small label above each card title: which part of the business the card is about, and what kind of card it is.
export const METRIC_GROUPS: Record<string,string> = {
 gross_margin:'PROFITABILITY', net_margin:'PROFITABILITY', operating_margin:'PROFITABILITY',
 revenue_growth_yoy:'GROWTH', cagr:'LONG-TERM GROWTH', liabilities_to_assets:'BALANCE SHEET', operating_cash_conversion:'CASH FLOW',
 net_interest_share:'HOW BANKS EARN',
};
export function cardEyebrow(type:'metric'|'concept'|'trend', metric:string) {
 const group = METRIC_GROUPS[metric] ?? 'FINANCIAL BASICS';
 return type === 'concept' ? `KEY IDEA · ${group}` : type === 'trend' ? `${group} · MULTI-YEAR TREND` : `${group} · FROM THE 10-K`;
}
export const conceptLabel=(concept:string)=>CONCEPT_LABELS[concept] ?? 'Reported amount';
// Compare rounded displayed values, using the larger magnitude for a symmetric relative gap.
// `below` distractors go under the true value (the rest above) so its rank varies.
export function numericOptions(correct:number,below=0,bounds:{min?:number;max?:number}={}):string[] {
 if(!Number.isFinite(correct) || Math.abs(correct)>Number.MAX_VALUE/1000)throw Error('Value is too large for a percentage quiz');
 const values=[Number((correct*100).toFixed(1))], v=values[0];
 const min=bounds.min!==undefined && v>=bounds.min ? bounds.min : -Infinity, max=bounds.max!==undefined && v<=bounds.max ? bounds.max : Infinity;
 const gap=Math.max(1.6,Math.abs(v)*.5);
 const fill=(direction:number,count:number)=>{
  for(let i=1,added=0;added<count && i<=100;i++) {
   const candidate=Number((v+direction*i*gap).toFixed(1));
   if(candidate<min || candidate>max) break;
   if(values.every(x=>Math.abs(candidate-x)+1e-9>=Math.max(1.5,.3*Math.max(Math.abs(candidate),Math.abs(x))))) {values.push(candidate);added++;}
  }
 };
 fill(-1,Math.min(3,Math.max(0,below)));fill(1,4-values.length);fill(-1,4-values.length);
 if(values.length!==4)throw Error('Cannot create distinct percentage options');
 return values.map(x=>`${x.toFixed(1)}%`);
}
