import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {educationHandlers as h} from '../mcp-server/education.js';
import {glossary} from '../mcp-server/glossary.js';
import {ToolChips,updateTools} from '../web/src/tool-chips.js';
import {askWith} from '../orchestrator/index.js';
import {profiles,ProfileStore} from '../mcp-server/memory.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('all question types distribute correct positions across 256 seeds',async()=>{
 const counts=[Array(4).fill(0),Array(4).fill(0),Array(3).fill(0)];
 for(let seed=0;seed<256;seed++){
 const q=await h.make_quiz({seed,computed:[{metric:'gross_margin',fiscalYear:2025,value:.12,sources:[]},{metric:'net_margin',fiscalYear:2025,value:.03,sources:[]}]});
 const keys=q.questions.map((q,i)=>q.options.indexOf([glossary.gross_margin,'3.0%','It explains one aspect of a business, with context from filings.'][i]));
 assert.equal((await h.grade_quiz({quiz_id:q.quiz_id,answers:keys})).score,3);keys.forEach((k,i)=>counts[i][k]++);
 }for(const row of counts)for(const n of row)assert.ok(n>30 && n<120,JSON.stringify(counts));
});
test('chips retain repeated calls, status, duration and error in demo markup',()=>{
 let tools=updateTools([],{call_id:'1',tool:'make_card',status:'started',duration_ms:0});
 assert.match(renderToStaticMarkup(React.createElement(ToolChips,{tools})),/running/);
 tools=updateTools(tools,{call_id:'1',tool:'make_card',status:'completed',duration_ms:12});
 tools=updateTools(tools,{call_id:'2',tool:'make_card',status:'failed',duration_ms:3});
 const html=renderToStaticMarkup(React.createElement('main',{className:'demo'},React.createElement(ToolChips,{tools})));
 assert.match(html,/done/);assert.match(html,/error/);assert.match(html,/12/);assert.equal((html.match(/make_card/g)??[]).length,2);
});
test('rule-based lesson grading persists missed concepts, re-quiz targets them, reset clears memory',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'flow-'));const store=new ProfileStore(dir);
 t.mock.method(profiles,'update',(id:string,event:unknown)=>store.update(id,event));
 const call=async(name:string,args:any):Promise<any>=>{
 if(name in h)return (h as any)[name](args);
 if(name==='lookup_company')return {companies:[{ticker:'COST',cik:'909832',title:'Costco'}]};
 if(name==='get_filings')return {filings:[]};if(name==='get_financials')return {financials:[]};
 if(name==='get_learning_profile')return {profile:await store.get(args.profile_id)};
 if(name==='update_learning_profile')return {profile:await store.update(args.profile_id,args.event)};
 if(name==='explain_concept')return {concept:args.concept,text:glossary[args.concept]};throw Error(name);
 };
 try{
 const lesson:any=await askWith(call,'COST net margin');const correct=lesson.quiz.questions.map((q:any)=>q.options.indexOf(q.concept==='education_policy'?'It explains one aspect of a business, with context from filings.':glossary[q.concept]));
 const grade=await h.grade_quiz({quiz_id:lesson.quiz.quiz_id,answers:correct.map((a:number,i:number)=>(a+1)%lesson.quiz.questions[i].options.length),profile_id:'family'});
 assert.equal(grade.score,0);const review:any=await askWith(call,'continue where we left off');assert.ok(review.review.length);assert.equal(review.quiz.questions.length,3);assert.ok(review.quiz.questions.every((q:any)=>review.profile.quizHistory.at(-1).missedConcepts.includes(q.concept)));
 await store.reset();assert.equal((await store.get()).quizHistory.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Nvidia refusal uses fetched financials and provenance; tool errors emit failure',async()=>{
 const events:any[]=[];const fact=(value:number,year=2025)=>({value,fiscalYear:year,unit:'USD',end:`${year}-01-26`,accessionNumber:'0001045810-25-000023'});
 const result:any=await askWith(async(name,args)=>{
 if(name==='lookup_company')return {companies:[{ticker:'NVDA',cik:'1045810',title:'Nvidia'}]};
 if(name==='get_financials')return {financials:[{metric:'Revenue',values:[fact(130497e6),fact(60922e6,2024)]},{metric:'NetIncomeLoss',values:[fact(72880e6)]},{metric:'Assets',values:[fact(111601e6)]},{metric:'Liabilities',values:[fact(32274e6)]}]};
 return (h as any)[name](args);
 },'Should I buy Nvidia?','family',e=>events.push(e));
 assert.match(result.text,/I can't tell you whether to buy/);assert.equal(result.cards.items.length,4);assert.match(result.cards.items[2].body,/55.8%/);assert.ok(result.cards.items.slice(1).every((c:any)=>c.sources.length));assert.ok(result.spoken_text.length<180);
 const failed:any[]=[];await askWith(async()=>{throw Error('offline');},'Should I buy Nvidia?','family',e=>failed.push(e));assert.ok(failed.some(e=>e.status==='failed' && e.tool==='lookup_company' && e.duration_ms>=0));
});
