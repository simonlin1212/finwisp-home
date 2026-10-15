import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualFinancials } from '../mcp-server/financials.js';
import { costcoFacts } from './fixtures/costco.js';
import { secUserAgent } from '../mcp-server/sources/sec-edgar.js';
import { glossary } from '../mcp-server/glossary.js';
import { educationHandlers as h } from '../mcp-server/education.js';
import { startServer } from '../mcp-server/index.js';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
import { teach } from '../orchestrator/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('SEC identity env precedence, default name and placeholder warning',()=>{
 const warnings:string[]=[];
 assert.equal(secUserAgent({},m=>warnings.push(m)),'FinwispHome/0.1 contact@example.com');assert.equal(warnings.length,1);
 assert.equal(secUserAgent({SEC_CONTACT_EMAIL:'team@example.org'}),'FinwispHome/0.1 team@example.org');
 assert.equal(secUserAgent({SEC_APP_NAME:'Coach',SEC_CONTACT_EMAIL:'team@example.org'}),'Coach team@example.org');
 assert.equal(secUserAgent({SEC_USER_AGENT:'Override override@example.org',SEC_CONTACT_EMAIL:'team@example.org'}),'Override override@example.org');
});
test('Costco aliases merge across years, annual durations, comparative FY and latest accession',()=>{
 const result=annualFinancials(costcoFacts,['Revenue','Assets'],3);
 assert.deepEqual(result[0].values.map(v=>[v.fiscalYear,v.value,v.accessionNumber]),[[2026,270,'new'],[2025,251,'new'],[2024,240,'old']]);
 assert.equal(result[0].values[0].concept,'RevenueFromContractWithCustomerExcludingAssessedTax');
 assert.equal(result[0].values[2].concept,'Revenues');
 assert.deepEqual(result[1].values.map(v=>v.fiscalYear),[2026,2025]);
 assert.equal(annualFinancials(costcoFacts,['Revenues'],1)[0].values[0].fiscalYear,2026);
});
test('January fiscal year uses filing fiscal label, not calendar end year',()=>{
 const f={facts:{'us-gaap':{Revenues:{units:{USD:[{fy:2026,fp:'FY',form:'10-K',start:'2025-02-01',end:'2026-01-31',val:10,filed:'2026-03-01',accn:'n'},{fy:2026,fp:'FY',form:'10-K',start:'2024-02-01',end:'2025-01-31',val:8,filed:'2026-03-01',accn:'n'}]}}}}};
 assert.deepEqual(annualFinancials(f,['Revenue'],3)[0].values.map(v=>v.fiscalYear),[2026,2025]);
});
const make=(metric:string,year:number,value:number,end=`${year}-12-31`)=>({metric,values:[{fiscalYear:year,value,unit:'USD',end,accessionNumber:'source'}]});
const input=[{metric:'Revenue',values:[...make('Revenue',2026,200).values,...make('Revenue',2025,100).values,...make('Revenue',2024,50).values]},make('GrossProfit',2026,80),make('NetIncomeLoss',2026,20),make('OperatingIncomeLoss',2026,40),make('Assets',2026,400),make('Liabilities',2026,100),make('NetCashProvidedByUsedInOperatingActivities',2026,30)];
test('fixed metrics formulas, provenance, missing/zero and mismatched period',async()=>{
 const r=await h.compute_metrics({financials:input});const value=(metric:string)=>r.computed.find(c=>c.metric===metric && c.fiscalYear===2026)!;
 for(const [m,v] of Object.entries({gross_margin:.4,net_margin:.1,operating_margin:.2,revenue_growth_yoy:1,cagr:1,liabilities_to_assets:.25,operating_cash_conversion:1.5})) assert.equal(value(m).value,v);
 assert.equal(value('net_margin').sources[0].accessionNumber,'source');
 const missing=await h.compute_metrics({financials:[make('Revenue',2026,0),make('NetIncomeLoss',2026,1)]});assert.equal(missing.computed.find(c=>c.metric==='net_margin')!.value,null);
 const mismatch=await h.compute_metrics({financials:[make('Revenue',2026,100),make('NetIncomeLoss',2026,1,'2026-09-30')]});assert.equal(mismatch.computed.find(c=>c.metric==='net_margin')!.value,null);
});
test('cards, deterministic three-question quiz, grading and invalid id',async()=>{
 const {computed}=await h.compute_metrics({financials:input});
 for(const type of ['metric','concept','trend']) {const r=await h.make_card({type,metric:'net_margin',computed});assert.equal(r.card.type,type);assert.ok(r.text);if(type==='trend') assert.ok(r.card.chart!.series.length);}
 const quiz=await h.make_quiz({computed});assert.deepEqual(quiz,await h.make_quiz({computed}));assert.equal(quiz.questions.length,3);assert.ok(quiz.questions.every(q=>!('answer' in q)));
 assert.ok(!('answer_keys' in quiz));
 const answers=quiz.questions.map((q,i)=>q.options.indexOf(i===0?glossary.gross_margin:i===1?'10.0%':'It explains one aspect of a business, with context from filings.'));
 assert.equal((await h.grade_quiz({quiz_id:quiz.quiz_id,answers})).score,3);
 const wrong=answers.map((a,i)=>(a+1)%quiz.questions[i].options.length);
 const grade=await h.grade_quiz({quiz_id:quiz.quiz_id,answers:wrong});assert.equal(grade.score,0);assert.ok(grade.results.every(r=>r.explanation && r.correct_option));
 await assert.rejects(h.grade_quiz({quiz_id:'missing',answers:[0,0,0]}));
});
test('teach executes actual HTTP MCP six-step plan and closes sessions; advice bypass',async()=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'coach-test-'));
 const sec=new SecEdgar({cacheDir,userAgent:'Test contact@example.com',fetch:(async(url:any)=>Response.json(String(url).includes('company_tickers')?{0:{ticker:'COST',cik_str:909832,title:'Costco'}}:String(url).includes('companyfacts')?costcoFacts:{filings:{recent:{accessionNumber:[],form:[],filingDate:[],primaryDocument:[]}}})) as typeof fetch});
 const app=await startServer({port:0,sec});
 try {const events:any[]=[];const r=await teach(app.url,'COST','net_margin',e=>events.push(e));assert.equal(r.mode,'education');assert.deepEqual(events.filter(e=>e.status==='completed').map(e=>e.step),['lookup','filings','financials','compute','cards','quiz']);assert.equal((r as any).quiz.questions.length,3);}
 finally{await app.close();await rm(cacheDir,{recursive:true,force:true});}
 assert.match((await teach('http://127.0.0.1:1/mcp','COST','should I buy')).text!,/not investment advice/);
});

test('comparative-only concept uses the accession current period from other facts',()=>{
 const data={facts:{'us-gaap':{Revenues:{units:{USD:[{fy:2027,fp:'FY',form:'10-K',start:'2025-01-01',end:'2025-12-31',val:5,filed:'2028-02-01',accn:'x'}]}},Assets:{units:{USD:[{fy:2027,fp:'FY',form:'10-K',end:'2027-12-31',val:9,filed:'2028-02-01',accn:'x'}]}}}}};
 assert.equal(annualFinancials(data,['Revenue'],3)[0].values[0].fiscalYear,2025);
});

test('forward-dated estimates do not shift the filing fiscal year (Starbucks FY2025 10-K)',()=>{
 const row=(start:string,end:string,val:number)=>({fy:2025,fp:'FY',form:'10-K',start,end,val,filed:'2025-11-14',accn:'sbux'});
 const data={facts:{'us-gaap':{Revenues:{units:{USD:[row('2024-09-30','2025-09-28',37.2),row('2023-10-02','2024-09-29',36.2)]}},RestructuringAndRelatedCostExpectedCost1:{units:{USD:[{...row('','2026-09-27',1),start:undefined}]}}}}};
 assert.deepEqual(annualFinancials(data,['Revenue'],3)[0].values.map(v=>[v.fiscalYear,v.value]),[[2025,37.2],[2024,36.2]]);
});
test('total Revenues wins over contract revenue reported in the same filing (Berkshire)',()=>{
 const row=(val:number)=>({fy:2024,fp:'FY',form:'10-K',start:'2024-01-01',end:'2024-12-31',val,filed:'2025-02-24',accn:'brk'});
 const data={facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[row(249.7)]}},Revenues:{units:{USD:[row(371.4)]}}}}};
 assert.deepEqual(annualFinancials(data,['Revenue'],1)[0].values.map(v=>[v.value,v.concept]),[[371.4,'Revenues']]);
});
test('a concept the company stopped tagging does not return decade-old years (Mastercard net income)',()=>{
 const row=(fy:number,val:number)=>({fy,fp:'FY',form:'10-K',start:`${fy}-01-01`,end:`${fy}-12-31`,val,filed:`${fy+1}-02-10`,accn:`ma${fy}`});
 const data={facts:{'us-gaap':{Revenues:{units:{USD:[2023,2024,2025].map(y=>row(y,30+y-2023))}},NetIncomeLoss:{units:{USD:[2011,2012,2013].map(y=>row(y,2))}}}}};
 const [revenue,income]=annualFinancials(data,['Revenue','NetIncomeLoss'],3);
 assert.deepEqual(revenue.values.map(v=>v.fiscalYear),[2025,2024,2023]);assert.deepEqual(income.values,[]);
});

test('plain English cards keep raw SEC concepts only in sources',async()=>{
 const source=(concept:string,value:number)=>({concept,value,unit:'USD',fiscalYear:2026,end:'2026-08-31',accessionNumber:'0000909832-26-000001'});
 const computed=[{metric:'net_margin',fiscalYear:2026,value:9.2/303.2,sources:[source('NetIncomeLoss',9.2e9),source('RevenueFromContractWithCustomerExcludingAssessedTax',303.2e9)]}];
 const {card}=await h.make_card({type:'metric',metric:'net_margin',company:'Costco',computed});
 assert.equal(card.body,'In FY2026 Costco kept 3.0% of revenue as net income ($9.2B of $303.2B).');
 assert.equal(card.sources[1].label,'Revenue');
 const {sources,...visible}=card;assert.doesNotMatch(JSON.stringify(visible),/NetIncomeLoss|RevenueFromContract/);
 assert.equal(sources[0].concept,'NetIncomeLoss');
});
test('numeric distractors are unique and visibly separated, including Costco 3.9 vs 3.8',async()=>{
 for(const value of [.039,.038,.03,0,-.04,1.5,12.3]){
  const computed=[{metric:'gross_margin',fiscalYear:2026,value:.12,sources:[]},{metric:'net_margin',fiscalYear:2026,value,sources:[]},{metric:'net_margin',fiscalYear:2025,value:value-.001,sources:[]}];
  const quiz=await h.make_quiz({computed});const options=quiz.questions[1].options;
  assert.equal(options.length,4);assert.equal(new Set(options).size,4);
  const numbers=options.map(parseFloat);
  for(let i=0;i<numbers.length;i++)for(let j=i+1;j<numbers.length;j++)assert.ok(Math.abs(numbers[i]-numbers[j])+1e-8>=Math.max(1.5,.3*Math.max(Math.abs(numbers[i]),Math.abs(numbers[j]))));
  if(value===.039)assert.ok(!options.includes('3.8%'));
 }
});

test('readable label map covers common SEC financial concepts',async()=>{
 const {conceptLabel}=await import('../mcp-server/education.js');
 for(const [concept,label] of Object.entries({RevenueFromContractWithCustomerExcludingAssessedTax:'Revenue',NetIncomeLoss:'Net income',OperatingIncomeLoss:'Operating income',CostOfGoodsAndServicesSold:'Cost of goods sold',NetCashProvidedByUsedInOperatingActivities:'Operating cash flow',Assets:'Assets',Liabilities:'Liabilities',GrossProfit:'Gross profit'}))assert.equal(conceptLabel(concept),label);
});

test('out-of-range percentage input fails without an unbounded distractor loop',async()=>{
 const {numericOptions}=await import('../mcp-server/education.js');
 assert.throws(()=>numericOptions(Number.MAX_VALUE),/too large/);
});
test('numeric quiz answer is not always the smallest option and margins stay plausible',async()=>{
 const ranks=Array(4).fill(0);
 for(let k=1;k<=40;k++){
  const value=k/50,computed=[{metric:'gross_margin',fiscalYear:2026,value:.4,sources:[]},{metric:'operating_margin',fiscalYear:2026,value,sources:[]}];
  const options=(await h.make_quiz({computed})).questions[1].options.map(parseFloat),correct=Number((value*100).toFixed(1));
  ranks[[...options].sort((a,b)=>a-b).indexOf(correct)]++;
  assert.ok(options.every(o=>o>=-100 && o<=100),`${value}: ${options}`);
 }
 assert.ok(ranks.every(n=>n>0),JSON.stringify(ranks));
});
test('review quiz with one missed concept asks three different questions about it',async()=>{
 for(const concept of ['net_margin','education_policy']){
  const quiz=await h.make_quiz({computed:[],concepts:[concept]});
  assert.equal(new Set(quiz.questions.map(q=>q.prompt)).size,3);assert.ok(quiz.questions.every(q=>q.concept===concept));
  const answers=quiz.questions.map(q=>q.options.findIndex(o=>o===glossary[concept] || o==='Net Margin' || o==='Net income ÷ revenue' || o.startsWith('It explains') || o.startsWith('No. It describes')));
  assert.equal((await h.grade_quiz({quiz_id:quiz.quiz_id,answers})).score,3);
 }
});
test('no reported figures (20-F filer) gives explanatory cards and no duplicate questions',async()=>{
 const quiz=await h.make_quiz({computed:[]});assert.equal(new Set(quiz.questions.map(q=>q.prompt)).size,3);
 const {card}=await h.make_card({type:'trend',metric:'net_margin',computed:[],company:'TSMC'});assert.equal(card.body,'No annual 10-K figures for net margin were available for TSMC.');
 // A bank files 10-Ks but has no gross margin: the card names the missing metric, not the whole company.
 const bank=await h.make_card({type:'metric',metric:'gross_margin',computed:[{metric:'net_margin',fiscalYear:2024,value:0.3,sources:[]}],company:'JPMorgan Chase'});
 assert.equal(bank.card.body,'No annual 10-K figures for gross margin were available for JPMorgan Chase.');
});
test('cash conversion is not computed against a net loss',async()=>{
 const f=(metric:string,value:number)=>make(metric,2025,value);
 const {computed}=await h.compute_metrics({financials:[f('Revenue',5e9),f('NetIncomeLoss',-3.6e9),f('NetCashProvidedByUsedInOperatingActivities',-3.2e9)]});
 const cash=computed.find(c=>c.metric==='operating_cash_conversion')!;assert.equal(cash.value,null);
 const {card}=await h.make_card({type:'metric',metric:'operating_cash_conversion',computed,company:'Rivian'});
 assert.match(card.body,/net income of -\$3\.6B, so cash conversion is not meaningful/);assert.doesNotMatch(card.body,/88\.9%/);
});
