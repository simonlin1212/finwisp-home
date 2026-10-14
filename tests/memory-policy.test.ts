import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../mcp-server/memory.js';
import { isAdvice, policyResponse, INSTRUCTIONS } from '../mcp-server/policy.js';
import { askWith, parseIntent } from '../orchestrator/index.js';
import { educationHandlers as h, formatUSD } from '../mcp-server/education.js';
test('atomic memory persists across stores; concurrent events, validation and caps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'profiles-'));try{
 const store=new ProfileStore(dir);assert.equal((await store.get()).lastSession,'');
 await Promise.all(Array.from({length:8},()=>store.update('family',{type:'concept',concept:'net_margin'})));
 await store.update('family',{type:'quiz',score:1,missedConcepts:['net_margin']});await store.update('family',{type:'company',company:'COST'});await store.update('family',{type:'session',summary:'Reviewed Costco.'});
 const p=await new ProfileStore(dir).get();assert.equal(p.conceptsLearned.net_margin.count,8);assert.ok(p.conceptsLearned.net_margin.lastSeen);assert.equal(p.quizHistory[0].score,1);assert.deepEqual(p.companiesFollowed,['COST']);assert.equal(p.lastSession,'Reviewed Costco.');
 assert.deepEqual(await readdir(dir),['family.json']);assert.deepEqual(JSON.parse(await readFile(join(dir,'family.json'),'utf8')),p);
 await assert.rejects(store.get('../escape'));assert.throws(()=>store.update('family',{type:'quiz',score:4,missedConcepts:[]}));assert.throws(()=>store.update('family',{type:'session',summary:'x'.repeat(1001)}));
 for(let i=0;i<102;i++)await store.update('family',{type:'quiz',score:0,missedConcepts:[]});assert.equal((await store.get()).quizHistory.length,100);
 await writeFile(join(dir,'huge.json'),' '.repeat(65537));await assert.rejects(store.get('huge'),/size cap/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('policy tricky requests and educational questions',()=>{
 for(const text of ['Should I hold COST?','What is your price-target for Apple?','Will it go up?','Could NVDA double next year?','Is Costco worth buying?','Allocate 20% to AAPL?','How much should I put into shares?','Would you recommend this stock?','Is it a good investment?','Will Apple recover?','Should I sell my shares?'])assert.equal(isAdvice(text),true,text);
 for(const text of ['What is Net Margin?','COST revenue growth','Explain operating cash flow','continue where we left off'])assert.equal(isAdvice(text),false,text);
 assert.equal(policyResponse().questions.length,3);assert.match(policyResponse().text,/not investment advice/);assert.ok(INSTRUCTIONS.length<=512);
});
test('orchestrator policy bypass, continue reviews missed concepts and parses intents',async()=>{
 assert.equal((await askWith(async()=>{throw Error('must not call MCP');},'Will it go up?')).mode,'policy');
 const calls:string[]=[];const p={quizHistory:[{missedConcepts:['net_margin']}],lastSession:'Reviewed COST',companiesFollowed:['COST']};
 const result=await askWith(async(name,args)=>{calls.push(name);return name==='get_learning_profile'?{profile:p}:{concept:args.concept,text:'Profit after expenses.'};},'continue where we left off');assert.deepEqual(calls,['get_learning_profile','explain_concept','make_quiz']);assert.equal((result as any).review.length,1);
 assert.deepEqual(parseIntent('teach me about COST net margin'),{company:'COST',topic:'net_margin',continue:false});
});
test('card formatting preserves raw figures and quiz hides keys with varied deterministic positions',async()=>{
 const computed=[{metric:'net_margin',fiscalYear:2026,value:.03,sources:[{fiscalYear:2026,value:303200000000,unit:'USD',end:'2026-12-31',accessionNumber:'x'}]},{metric:'operating_margin',fiscalYear:2026,value:.05,sources:[]}];
 const card=await h.make_card({type:'metric',metric:'net_margin',computed});assert.equal(card.card.title,'Net Margin');assert.match(card.card.body,/3\.0%/);assert.match(card.card.body,/\$303\.2B/);assert.equal(card.card.figures[0].value,.03);assert.equal(formatUSD(-303200000000),'-$303.2B');
 const quiz=await h.make_quiz({computed});assert.deepEqual(quiz,await h.make_quiz({computed}));assert.ok(!JSON.stringify(quiz).includes('answer_keys'));assert.ok(quiz.questions.every(q=>q.options.length>=3 && q.options.length<=4 && new Set(q.options).size===q.options.length));assert.ok(quiz.questions[1].options.includes('5.0%'));
 await assert.rejects(h.grade_quiz({quiz_id:quiz.quiz_id,answers:[3,3,3]}),/outside options/);
});
test('quiz expiry rejects grading after the one-hour TTL',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now;
 try{const quiz=await h.make_quiz({computed:[]});now+=3600001;await assert.rejects(h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0]}),/expired/);}finally{Date.now=original;}
});
test('grading optionally records score and missed concepts in learning memory',async(t)=>{
 const {profiles}=await import('../mcp-server/memory.js');const events:any[]=[];
 t.mock.method(profiles,'update',async(id:string,event:unknown)=>{events.push({id,event});return {};});
 const quiz=await h.make_quiz({computed:[]});await h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0]});assert.equal(events.length,0);
 const grade=await h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0],profile_id:'family'});assert.equal(events.length,1);assert.equal(events[0].id,'family');assert.equal(events[0].event.score,grade.score);assert.deepEqual(events[0].event.missedConcepts,grade.results.filter(r=>!r.correct).map(r=>r.concept));
});
