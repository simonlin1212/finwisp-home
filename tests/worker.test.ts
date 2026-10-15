import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Env, createWorker } from '../worker/index.js';
import { WorkerCache } from '../worker/cache.js';
import { costcoFacts } from './fixtures/costco.js';
import { annualFinancials } from '../mcp-server/financials.js';
import { DEFAULT_METRICS } from '../mcp-server/tools.js';
import { financialConcepts } from '../mcp-server/sources/sec-edgar.js';
const env={SEC_CONTACT_EMAIL:'contact@example.com'};
const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
function fixture() {
 const urls:string[]=[];
 const worker=createWorker({cache:new WorkerCache(),sleep:async()=>{},fetch:(async(input:any)=>{
  const url=String(input);urls.push(url);
  assert.ok(!url.includes('companyfacts'));
  if(url.includes('company_tickers'))return Response.json({0:{cik_str:909832,ticker:'COST',title:'Costco'}});
  const concept=url.split('/').at(-1)!.replace('.json','');
  const data=(costcoFacts.facts['us-gaap'] as Record<string,unknown>)[concept];
  return data?Response.json(data):new Response(null,{status:404});
 }) as typeof fetch});
 return {worker,urls};
}
async function rpc(worker:ReturnType<typeof createWorker>,method:string,params:unknown={},e:Env=env,ip?:string) {
 const response=await worker.fetch(new Request('https://example.com/mcp',{method:'POST',headers:{...headers,...(ip?{'CF-Connecting-IP':ip}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),e);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(response.status,200,await response.clone().text()); return (await response.json()) as any;
}
test('concept subset matches committed full companyfacts fixture for default metrics',()=>{
 const all=costcoFacts.facts['us-gaap'] as Record<string,unknown>;
 const subset={facts:{'us-gaap':Object.fromEntries(financialConcepts(DEFAULT_METRICS).filter(c=>all[c]).map(c=>[c,all[c]]))}};
 assert.deepEqual(annualFinancials(subset,DEFAULT_METRICS,5),annualFinancials(costcoFacts,DEFAULT_METRICS,5));
 assert.throws(()=>financialConcepts(['../Assets']));
 assert.deepEqual(financialConcepts(['Revenues']),[...financialConcepts(['Revenue'])]);
});
test('Worker health, stateless initialize, list, and concept financials',async()=>{
 const {worker,urls}=fixture();
 assert.equal((await worker.fetch(new Request('https://example.com/health'))).status,200);
 const init=await rpc(worker,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});
 assert.equal(init.result.protocolVersion,'2025-11-25');assert.equal(init.result.serverInfo.name,'finwisp-home');
 const list=await rpc(worker,'tools/list');assert.ok(list.result.tools.some((t:any)=>t.name==='get_financials'));
 const result=await rpc(worker,'tools/call',{name:'get_financials',arguments:{ticker_or_cik:'COST'}});
 assert.equal(result.result.isError,undefined);
 assert.equal(result.result.structuredContent.source,'https://data.sec.gov/api/xbrl/companyconcept/CIK0000909832/us-gaap/');
 assert.deepEqual(result.result.structuredContent.financials,annualFinancials(costcoFacts,DEFAULT_METRICS,5));
 const starts=urls.length; await rpc(worker,'tools/call',{name:'get_financials',arguments:{ticker_or_cik:'COST'}});assert.equal(urls.length,starts);
});
test('Worker rejects oversized bodies, origins, rate limits and SSE GET',async()=>{
 const {worker}=fixture();
 assert.equal((await worker.fetch(new Request('https://example.com/mcp',{method:'POST',body:'x'.repeat(256*1024+1)}),env)).status,413);
 assert.equal((await worker.fetch(new Request('https://example.com/mcp',{method:'POST',headers:{Origin:'https://foreign.example'}}),env)).status,403);
 let key='';const limited=await worker.fetch(new Request('https://example.com/mcp',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'}}),{MCP_RATE_LIMITER:{limit:async options=>{key=options.key;return {success:false};}}});
 assert.equal(limited.status,429);assert.equal((await limited.json() as any).jsonrpc,'2.0');assert.equal(key,'192.0.2.1');
 const get=await worker.fetch(new Request('https://example.com/mcp'),env);
 assert.equal(get.status,405);assert.equal(get.headers.get('Allow'),'POST, DELETE, OPTIONS');
 assert.equal(get.headers.get('Cache-Control'),'no-store');
 assert.equal(limited.headers.get('Cache-Control'),'no-store');
 const options=await worker.fetch(new Request('https://example.com/mcp',{method:'OPTIONS'}),env);
 assert.equal(options.status,204);assert.equal(options.headers.get('Cache-Control'),'no-store');
});
test('missing SEC contact returns clear tool error without network',async()=>{
 let calls=0;const worker=createWorker({fetch:(async()=>{calls++;throw new Error('network forbidden');}) as typeof fetch});
 const result=await rpc(worker,'tools/call',{name:'lookup_company',arguments:{query:'Wells Fargo'}},{});
 assert.equal(result.result.isError,true);assert.match(result.result.structuredContent.error,/SEC_CONTACT_EMAIL/);assert.equal(calls,0);
});
test('Worker cache edge fallback and LRU bounds',async()=>{
 const edge=new Map<string,Response>();const cache=new WorkerCache({match:async k=>edge.get(k)?.clone(),put:async(k,r)=>{edge.set(k,r);}});
 await cache.set('https://www.sec.gov/files/company_tickers.json',{time:1,data:{ok:true}});
 for(let i=0;i<201;i++)await cache.set(`https://data.sec.gov/${i}`,{time:i,data:i});
 assert.deepEqual(await cache.get('https://www.sec.gov/files/company_tickers.json'),{time:1,data:{ok:true}});
 assert.match(edge.get('https://www.sec.gov/files/company_tickers.json')!.headers.get('Cache-Control')!,/86400/);
});

test('Worker profile storage persists across fresh request servers',async()=>{
 const {worker}=fixture();
 await rpc(worker,'tools/call',{name:'update_learning_profile',arguments:{profile_id:'worker-test',event:{type:'concept',concept:'Revenue'}}});
 const result=await rpc(worker,'tools/call',{name:'get_learning_profile',arguments:{profile_id:'worker-test'}});
 assert.equal(result.result.structuredContent.profile.conceptsLearned.Revenue.count,1);
});

test('Worker refreshes SEC client when environment user agent changes', async () => {
 const agents:string[]=[];
 const worker=createWorker({cache:new WorkerCache(),sleep:async()=>{},fetch:(async (_input,init)=>{
  agents.push(new Headers(init?.headers).get('User-Agent')!);
  return Response.json({filings:{recent:{form:[],filingDate:[],accessionNumber:[],primaryDocument:[]}}});
 }) as typeof fetch});
 for(const [index,email] of ['first@example.com','second@example.com'].entries()) {
  const result=await rpc(worker,'tools/call',{name:'get_filings',arguments:{ticker_or_cik:String(index+1)}},{SEC_CONTACT_EMAIL:email});
  assert.equal(result.result.isError,undefined);
 }
 assert.deepEqual(agents,['FinwispHome/0.1 first@example.com','FinwispHome/0.1 second@example.com']);
});

test('Worker profiles are isolated by caller IP within the shared isolate',async()=>{
 const {worker}=fixture();
 const call=(ip:string,name:string,event?:unknown)=>rpc(worker,'tools/call',{name,arguments:{profile_id:'shared-id',...(event?{event}:{})}},env,ip);
 await call('192.0.2.1','update_learning_profile',{type:'session',summary:'Private caller one summary'});
 const first=await call('192.0.2.1','get_learning_profile');
 assert.equal(first.result.structuredContent.profile.lastSession,'Private caller one summary');
 const second=await call('192.0.2.2','get_learning_profile');
 assert.equal(second.result.structuredContent.profile.lastSession,'');
 await call('192.0.2.2','update_learning_profile',{type:'session',summary:'Private caller two summary'});
 assert.equal((await call('192.0.2.1','get_learning_profile')).result.structuredContent.profile.lastSession,'Private caller one summary');
 assert.equal((await call('192.0.2.2','get_learning_profile')).result.structuredContent.profile.lastSession,'Private caller two summary');
});
