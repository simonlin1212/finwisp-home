import { test } from 'node:test';
import assert from 'node:assert/strict';
import { educationHandlers as h, businessModel, cardEyebrow } from '../mcp-server/education.js';
import { glossary } from '../mcp-server/glossary.js';
import { askWith, parseIntent } from '../orchestrator/index.js';
// Shapes from SEC companyfacts (values rounded, checked live 2026-10-15). No network in this file.
const v=(fy:number,value:number,concept:string)=>({fiscalYear:fy,value,unit:'USD',end:`${fy}-12-31`,accessionNumber:`acc-${fy}`,concept});
const series=(metric:string,concept:string,vals:Record<number,number>)=>({metric,values:Object.entries(vals).map(([fy,x])=>v(Number(fy),x,concept)).reverse()});
const empty=(metric:string)=>({metric,values:[]});
// Wells Fargo: total revenue tagged RevenuesNetOfInterestExpense, net interest income, no industrial lines.
const WFC=[series('Revenue','RevenuesNetOfInterestExpense',{2023:82.6e9,2024:82.3e9}),series('NetIncomeLoss','NetIncomeLoss',{2023:19.1e9,2024:19.7e9}),empty('GrossProfit'),series('Assets','Assets',{2023:1932e9,2024:1930e9}),series('Liabilities','Liabilities',{2023:1745e9,2024:1748e9}),empty('OperatingIncomeLoss'),empty('CostOfRevenue'),empty('NetCashProvidedByUsedInOperatingActivities'),series('NetInterestIncome','InterestIncomeExpenseNet',{2023:52.4e9,2024:47.7e9})];
// JPMorgan-style: same shape, bank SIC 6021.
const JPM=[series('Revenue','RevenuesNetOfInterestExpense',{2024:177.6e9}),series('NetIncomeLoss','NetIncomeLoss',{2024:58.5e9}),series('NetInterestIncome','InterestIncomeExpenseNet',{2024:92.6e9}),empty('GrossProfit'),empty('OperatingIncomeLoss'),empty('CostOfRevenue')];
// Caterpillar: revenue, cost of revenue and operating income, but gross profit untagged since FY2021.
const CAT=[series('Revenue','Revenues',{2024:64.8e9,2025:67.6e9}),series('NetIncomeLoss','NetIncomeLossAvailableToCommonStockholdersBasic',{2024:10.8e9,2025:8.9e9}),empty('GrossProfit'),series('CostOfRevenue','CostOfRevenue',{2024:41.5e9,2025:45.3e9}),series('OperatingIncomeLoss','OperatingIncomeLoss',{2024:13.1e9,2025:11.2e9}),empty('NetInterestIncome')];

test('businessModel: WFC-like and JPM-like are banks, CAT-like and mixed are general',()=>{
 assert.equal(businessModel(WFC),'bank');
 assert.equal(businessModel(JPM,'6021'),'bank');
 assert.equal(businessModel(CAT),'general');
 // Ambiguous: net interest income plus an industrial line keeps the existing behaviour.
 assert.equal(businessModel([...WFC.filter(f=>f.metric!=='OperatingIncomeLoss'),series('OperatingIncomeLoss','OperatingIncomeLoss',{2024:1e9})]),'general');
 // A bank SIC code without net interest income still counts; a non-bank SIC alone does not.
 assert.equal(businessModel(JPM.filter(f=>f.metric!=='NetInterestIncome'),'6021'),'bank');
 assert.equal(businessModel(JPM.filter(f=>f.metric!=='NetInterestIncome'),'3531'),'general');
 assert.equal(businessModel([]),'general');
});
test('net_interest_share is computed for banks with sources, and null on mismatched periods',async()=>{
 const r:any=await h.compute_metrics({financials:WFC});
 assert.equal(r.businessModel,'bank');
 const nis=r.computed.find((c:any)=>c.metric==='net_interest_share'&&c.fiscalYear===2024);
 assert.ok(Math.abs(nis.value-47.7/82.3)<1e-9);
 assert.deepEqual(nis.sources.map((s:any)=>s.concept),['InterestIncomeExpenseNet','RevenuesNetOfInterestExpense']);
 assert.equal(nis.sources[0].accessionNumber,'acc-2024');
 const shifted=WFC.map(f=>f.metric==='NetInterestIncome'?{...f,values:f.values.map(x=>({...x,end:`${x.fiscalYear}-09-30`}))}:f);
 const bad=(await h.compute_metrics({financials:shifted})).computed.find((c:any)=>c.metric==='net_interest_share')!;
 assert.equal(bad.value,null);assert.match(bad.reason!,/mismatched period/);
 const cat:any=await h.compute_metrics({financials:CAT});
 assert.equal(cat.businessModel,'general');
 assert.ok(!cat.computed.some((c:any)=>c.metric==='net_interest_share'));
 assert.ok(glossary.net_interest_share.split(/[.!?](\s|$)/).filter(Boolean).length<=2);
});
test('bank gross/operating margin cards say not applicable, keep eyebrow/title, carry no figures; CAT unchanged',async()=>{
 const {computed}=await h.compute_metrics({financials:WFC});
 for(const metric of ['gross_margin','operating_margin'] as const) for(const type of ['metric','trend'] as const){
  const r:any=await h.make_card({type,metric,computed,company:'Wells Fargo',business_model:'bank'});
  assert.match(r.card.body,/does not apply to Wells Fargo, because it is a bank/);
  assert.match(r.card.body,/interest|fees/);
  assert.doesNotMatch(r.card.body,/insufficient comparable data|\$|%/);
  assert.equal(r.card.eyebrow,cardEyebrow(type,metric));assert.equal(r.card.title,metric==='gross_margin'?'Gross Margin':'Operating Margin');
  assert.deepEqual(r.card.figures,[]);assert.deepEqual(r.card.sources,[]);assert.equal(r.card.chart,undefined);assert.equal(r.not_applicable,true);
 }
 const nis:any=await h.make_card({type:'metric',metric:'net_interest_share',computed,company:'Wells Fargo',business_model:'bank'});
 assert.equal(nis.card.eyebrow,'HOW BANKS EARN · FROM THE 10-K');
 assert.match(nis.card.body,/In FY2024 Wells Fargo earned 58\.0% of its revenue as net interest income \(\$47\.7B of \$82\.3B\)/);
 assert.deepEqual(nis.card.sources.slice(0,2).map((s:any)=>s.label),['Net interest income','Revenue (net of interest expense)']);
 const cat=(await h.compute_metrics({financials:CAT})).computed;
 const gm:any=await h.make_card({type:'metric',metric:'gross_margin',computed:cat,company:'Caterpillar'});
 assert.match(gm.card.body,/In FY2025 Caterpillar has insufficient comparable data for gross margin\./);
 const om:any=await h.make_card({type:'metric',metric:'operating_margin',computed:cat,company:'Caterpillar'});
 assert.match(om.card.body,/In FY2025 Caterpillar earned 16\.6% of revenue as operating income/);
});
test('orchestrator: "WFC net margin" adds a net-interest-share card and quizzes skip N/A metrics',async()=>{
 const calls:any[]=[];
 const call=async(name:string,args:any):Promise<any>=>{calls.push([name,args]);
  if(name in h)return (h as any)[name](args);
  if(name==='lookup_company')return {companies:[{ticker:'WFC',cik:'0000072971',title:'WELLS FARGO & COMPANY/MN'}]};
  if(name==='get_filings')return {cik:'0000072971',sic:'6021',sicDescription:'National Commercial Banks',filings:[{form:'10-K'}]};
  if(name==='get_financials')return {financials:WFC};
  if(name==='update_learning_profile')return {};throw Error(name);};
 const lesson:any=await askWith(call,'WFC net margin','family');
 assert.equal(lesson.compute.businessModel,'bank');
 assert.deepEqual(calls.find(c=>c[0]==='compute_metrics')[1].sic,'6021');
 const items=lesson.cards.items;
 assert.equal(items[0].title,'Net Margin');assert.match(items[2].body,/kept 23\.9% of revenue as net income/);
 assert.equal(items.at(-1).title,'Net Interest Share');assert.match(items.at(-1).body,/net interest income/);
 const quizInput=calls.find(c=>c[0]==='make_quiz')[1].computed;
 assert.ok(quizInput.length && !quizInput.some((c:any)=>['gross_margin','operating_margin'].includes(c.metric)));
 const gross:any=await askWith(call,'Wells Fargo gross margin','family');
 assert.match(gross.cards.items[0].body,/does not apply/);
 assert.equal(parseIntent('WFC net interest').topic,'net_interest_share');
 assert.equal(parseIntent('WFC net interest').company,'WFC');
});
