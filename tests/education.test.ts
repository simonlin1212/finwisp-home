import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualFinancials } from '../mcp-server/financials.js';
import { costcoFacts } from './fixtures/costco.js';
import { secUserAgent } from '../mcp-server/sources/sec-edgar.js';
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
 assert.equal((await h.grade_quiz({quiz_id:quiz.quiz_id,answers:quiz.answer_keys})).score,3);
 assert.equal((await h.grade_quiz({quiz_id:quiz.quiz_id,answers:[2,2,2]})).score,0);
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
