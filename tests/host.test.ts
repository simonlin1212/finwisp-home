import { request } from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHub } from '../host/index.js';
import { educationHandlers } from '../mcp-server/education.js';
import { profiles, ProfileStore } from '../mcp-server/memory.js';
test('host serves UI, streams plan via mocked MCP, grades and persists review; rejects unsafe input',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-'));await writeFile(join(dir,'index.html'),'<h1>Finwisp Home</h1>');const store=new ProfileStore(join(dir,'profiles'));const calls:string[]=[];t.mock.method(profiles,'reset',()=>store.reset('family'));
 const app=await startHub({port:0,webDir:dir,call:async(name,args)=>{
  calls.push(name);if(name==='lookup_company' && args.query==='BROKEN')throw Error('tool unavailable');if(name in educationHandlers)return (educationHandlers as any)[name](args);
  if(name==='lookup_company')return {companies:[{ticker:'COST',cik:'1',title:'Costco'}]};if(name==='get_filings')return {filings:[]};if(name==='get_financials')return {financials:[]};
  if(name==='get_learning_profile')return {profile:await store.get(args.profile_id as string)};
  if(name==='update_learning_profile')return {profile:await store.update(args.profile_id as string,args.event)};
  throw Error('Unknown mock tool');
 }});
 const post=(path:string,value:unknown,headers={})=>fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
 assert.match(await (await fetch(app.url)).text(),/Finwisp Home/);
 assert.equal((await fetch(app.url+'/api/voice/status')).status,200);
 assert.equal((await post('/api/voice/start',{explicit:false})).status,400);
 assert.equal((await post('/api/voice/input',{text:'hello'})).status,400);
 assert.equal((await post('/api/voice/stop',{})).status,200);
 const r=await post('/api/ask',{text:'COST net margin'});assert.equal(r.headers.get('content-type'),'text/event-stream');const stream=await r.text();assert.match(stream,/event: step/);assert.match(stream,/"status":"started"/);assert.match(stream,/"status":"completed"/);assert.match(stream,/event: result/);
 const result=JSON.parse(stream.split('\n\n').find(b=>b.startsWith('event: result'))!.split('\ndata: ')[1]);const events=stream.split('\n\n').filter(b=>b.startsWith('event: tool')).map(b=>JSON.parse(b.split('\ndata: ')[1]));assert.equal(events.length,calls.length*2);assert.equal(events.filter(e=>e.status==='started' && e.tool==='make_card').length,3);for(const e of events.filter(e=>e.status==='completed')){assert.ok(e.tool);assert.ok(e.duration_ms>=0);assert.ok(events.some(s=>s.call_id===e.call_id && s.status==='started'));}
 assert.ok(result.quiz);assert.ok(!('answer_keys' in result.quiz));assert.equal(result.profile.companiesFollowed[0],'COST');
 assert.equal((await post('/api/quiz/grade',{quiz_id:result.quiz.quiz_id,answers:[0,0,0]})).status,200);
 assert.equal((await post('/api/quiz/grade',{quiz_id:'missing',answers:[0,0,0]})).status,400);
 assert.match(await(await post('/api/ask',{text:'Should I buy COST?'})).text(),/3 questions/);
 const failure=await(await post('/api/ask',{text:'BROKEN net margin'})).text();assert.match(failure,/event: tool/);assert.match(failure,/"tool":"lookup_company".*"status":"failed".*"duration_ms":/);assert.match(failure,/event: error/);
 assert.equal((await post('/api/ask',{text:''})).status,400);assert.equal((await post('/api/ask',{text:'x'.repeat(17000)})).status,400);
 assert.equal((await post('/api/ask',{text:'COST'},{Origin:'https://evil.example'})).status,403);const badHost=await new Promise<number>(ok=>{const r=request(app.url+'/api/profile',{headers:{Host:'evil.example'}},response=>{response.resume();ok(response.statusCode!);});r.end();});assert.equal(badHost,403);
 assert.equal((await fetch(app.url+'/api/profile?profile_id=../bad')).status,400);assert.equal((await fetch(app.url+'/api/profile')).status,200);
 const review=await post('/api/ask',{text:'continue where we left off'});assert.equal(review.status,200);assert.match(await review.text(),/Reviewed COST/);
 assert.equal((await post('/api/profile/reset',{profile_id:'other'})).status,400);assert.equal((await post('/api/profile/reset',{profile_id:'family'},{Origin:'https://evil.example'})).status,403);assert.equal((await post('/api/profile/reset',{profile_id:'family'})).status,200);assert.equal((await(await fetch(app.url+'/api/profile')).json()).profile.quizHistory.length,0);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
