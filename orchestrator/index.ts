import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { glossary } from '../mcp-server/glossary.js';
import { isAdvice, policyResponse } from '../mcp-server/policy.js';
import { profileId } from '../mcp-server/memory.js';
export const plan = ['lookup','filings','financials','compute','cards','quiz'] as const;
export type StepEvent = { step: string; status: 'started'|'completed'|'failed'; result?: unknown; error?: string };
export type ToolCaller = (name:string,args:Record<string,unknown>)=>Promise<any>;
export async function withMcp<T>(url:string,work:(call:ToolCaller)=>Promise<T>):Promise<T> {
 const client=new Client({name:'finwisp-coach',version:'0.1.0'}),transport=new StreamableHTTPClientTransport(new URL(url));
 try {await client.connect(transport);return await work(async(name,args)=>{const r=await client.callTool({name,arguments:args});if(r.isError) throw new Error((r.structuredContent as any)?.error ?? 'MCP tool failed');return r.structuredContent ?? JSON.parse((r.content as any[]).find(c=>c.type==='text').text);});}
 finally {await transport.terminateSession().catch(()=>{});await client.close();}
}
const aliases:Record<string,string>={revenue:'revenue_growth_yoy',growth:'revenue_growth_yoy',profitability:'net_margin','net income':'net_margin',liabilities:'liabilities_to_assets',cash:'operating_cash_conversion'};
export function parseIntent(text:string) {
 const topic=Object.keys(glossary).find(k=>text.toLowerCase().includes(k.replaceAll('_',' ')) || text.toLowerCase().includes(k)) ?? Object.keys(aliases).find(k=>new RegExp(`\\b${k}\\b`,'i').test(text)) ?? 'net_margin';
 const ticker=text.match(/\b[A-Z]{1,5}\b/g)?.find(t=>!['I','FY','USD','WHAT','HOW'].includes(t));
 const known=text.match(/\b(costco|apple|nvidia|microsoft|amazon|tesla|alphabet|google)\b/i)?.[0];
 const company=ticker ?? known ?? text.replace(/\b(teach|me|about|explain|show|the|of|for|please|net|margin|revenue|growth|profitability|cash|operating|gross|trend|liabilities)\b/gi,'').trim();
 return {company,topic:aliases[topic] ?? topic,continue:/\bcontinue\b|where we left off|resume/i.test(text)};
}
export async function teachWith(call:ToolCaller,company:string,topic='net_margin',emit:(event:StepEvent)=>void=()=>{},id?:string) {
 if(isAdvice(`${company} ${topic}`)) return policyResponse();
 const metric=aliases[topic.toLowerCase()] ?? topic;
 if(!Object.hasOwn(glossary,metric)) throw new Error('Unknown concept');
 const run=async(step:string,name:string,args:Record<string,unknown>)=>{emit({step,status:'started'});try{const result=await call(name,args);emit({step,status:'completed',result});return result;}catch(e){emit({step,status:'failed',error:String(e)});throw e;}};
 const lookup=await run('lookup','lookup_company',{query:company});
 const match=lookup.companies.find((c:any)=>c.ticker.toUpperCase()===company.toUpperCase()) ?? lookup.companies[0];if(!match) throw new Error('Company not found');
 const filings=await run('filings','get_filings',{ticker_or_cik:match.cik,form:'10-K',limit:3});
 const financials=await run('financials','get_financials',{ticker_or_cik:match.cik,years:3});
 const compute=await run('compute','compute_metrics',{financials:financials.financials});
 const cards=await run('cards','make_card',{type:'trend',metric,computed:compute.computed});
 const conceptCard=await call('make_card',{type:'concept',metric,computed:[]});
 const metricCard=await call('make_card',{type:'metric',metric,computed:compute.computed});
 cards.items=[cards.card,conceptCard.card,metricCard.card];
 const quiz=await run('quiz','make_quiz',{computed:compute.computed});
 let profile;
 if(id) {await call('update_learning_profile',{profile_id:id,event:{type:'company',company:match.ticker}});await call('update_learning_profile',{profile_id:id,event:{type:'concept',concept:metric}});profile=await call('update_learning_profile',{profile_id:id,event:{type:'session',summary:`Reviewed ${match.ticker}: ${metric.replaceAll('_',' ')}.`}});}
 return {mode:'education',plan,company:match,filings,financials,compute,cards,quiz,...(profile ?? {})};
}
export async function askWith(call:ToolCaller,text:string,id='family',emit:(e:StepEvent)=>void=()=>{}) {
 id=profileId.parse(id); if(isAdvice(text)) return policyResponse();
 const intent=parseIntent(text);
 if(intent.continue) {
  emit({step:'memory',status:'started'});const {profile}=await call('get_learning_profile',{profile_id:id});emit({step:'memory',status:'completed'});
  const missed=[...new Set(profile.quizHistory.slice(-3).flatMap((q:any)=>q.missedConcepts))] as string[];
  const review=[];for(const concept of missed) review.push(Object.hasOwn(glossary,concept)?await call('explain_concept',{concept}):{concept,text:'Financial ratios explain businesses; they do not predict stock prices or decide investments.'});
  return {mode:'review',text:profile.lastSession || 'Start by asking about a company and a concept, such as COST net margin.',profile,review};
 }
 if(!intent.company) return {mode:'education',text:'Enter a company name or ticker and a topic, such as COST net margin.'};
 return teachWith(call,intent.company,intent.topic,emit,id);
}
export async function teach(url:string,company:string,topic='net_margin',emit:(event:StepEvent)=>void=()=>{}) {if(isAdvice(`${company} ${topic}`)) return policyResponse();return withMcp(url,call=>teachWith(call,company,topic,emit));}
