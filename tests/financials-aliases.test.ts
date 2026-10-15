import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualFinancials } from '../mcp-server/financials.js';
const row=(fy:number,val:number,start=true)=>({fy,fp:'FY',form:'10-K',val,end:`${fy}-12-31`,...(start?{start:`${fy}-01-01`}:{}),filed:`${fy+1}-02-15`,accn:`acc-${fy}`});
const facts=(g:Record<string,any[]>)=>({facts:{'us-gaap':Object.fromEntries(Object.entries(g).map(([k,rows])=>[k,{units:{USD:rows}}]))}});
// Shapes seen live in SEC companyfacts on 2026-10-15 (values rounded): CAT and WFC.
test('Caterpillar-style net income falls back to profit attributable to common shareholders',()=>{
 const d=facts({Revenues:[row(2024,64.8e9),row(2025,67.6e9)],NetIncomeLoss:[row(2010,2.7e9)],NetIncomeLossAvailableToCommonStockholdersBasic:[row(2024,10.8e9),row(2025,8.9e9)],ProfitLoss:[row(2025,8.95e9)]});
 const [ni]=annualFinancials(d,['NetIncomeLoss'],2);
 assert.deepEqual(ni.values.map((v:any)=>[v.fiscalYear,v.value,v.concept]),[[2025,8.9e9,'NetIncomeLossAvailableToCommonStockholdersBasic'],[2024,10.8e9,'NetIncomeLossAvailableToCommonStockholdersBasic']]);
});
test('bank revenue uses RevenuesNetOfInterestExpense and net interest income is available',()=>{
 const d=facts({RevenuesNetOfInterestExpense:[row(2024,82.3e9),row(2025,83.7e9)],InterestIncomeExpenseNet:[row(2024,47.7e9),row(2025,47.5e9)],NetIncomeLoss:[row(2024,19.7e9),row(2025,21.3e9)]});
 const [rev,nii]=annualFinancials(d,['Revenue','NetInterestIncome'],2);
 assert.deepEqual(rev.values.map((v:any)=>v.value),[83.7e9,82.3e9]);
 assert.equal(rev.values[0].concept,'RevenuesNetOfInterestExpense');
 assert.deepEqual(nii.values.map((v:any)=>v.value),[47.5e9,47.7e9]);
});
