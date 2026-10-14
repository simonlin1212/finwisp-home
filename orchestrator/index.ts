import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
export const plan = ['lookup','filings','financials','compute','cards','quiz'] as const;
export type StepEvent = { step: typeof plan[number]; status: 'started'|'completed'|'failed'; result?: unknown; error?: string };
export async function teach(url: string, company: string, topic = 'net_margin', emit: (event: StepEvent)=>void = ()=>{}) {
  if (/\bshould\s+I\s+(buy|sell)\b/i.test(`${company} ${topic}`)) return { mode:'education', text:'I can teach you how to read company filings and financial ratios. Educational use only, not investment advice.' };
  const metric = ({ revenue: 'revenue_growth_yoy', growth: 'revenue_growth_yoy', profitability: 'net_margin', 'net income': 'net_margin', liabilities: 'liabilities_to_assets', cash: 'operating_cash_conversion' } as Record<string,string>)[topic.toLowerCase()] ?? topic;
  const client = new Client({name:'finwisp-coach',version:'0.1.0'});
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const run = async (step: StepEvent['step'], name: string, args: Record<string,unknown>) => {
    emit({step,status:'started'});
    try { const response=await client.callTool({name,arguments:args}); if(response.isError) throw new Error(JSON.stringify(response.structuredContent)); const result=response.structuredContent as any; emit({step,status:'completed',result}); return result; }
    catch(error) { emit({step,status:'failed',error:String(error)}); throw error; }
  };
  try {
    await client.connect(transport);
    const lookup=await run('lookup','lookup_company',{query:company});
    const match=lookup.companies.find((c:any)=>c.ticker.toUpperCase()===company.toUpperCase()) ?? lookup.companies[0];
    if(!match) throw new Error('Company not found');
    const filings=await run('filings','get_filings',{ticker_or_cik:match.cik,form:'10-K',limit:3});
    const financials=await run('financials','get_financials',{ticker_or_cik:match.cik,years:3});
    const compute=await run('compute','compute_metrics',{financials:financials.financials});
    const cards=await run('cards','make_card',{type:'trend',metric,computed:compute.computed});
    const quiz=await run('quiz','make_quiz',{computed:compute.computed});
    return {mode:'education',plan,company:match,filings,financials,compute,cards,quiz};
  } finally { await transport.terminateSession().catch(()=>{}); await client.close(); }
}
