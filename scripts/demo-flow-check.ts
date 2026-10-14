// Live SEC + deterministic host flow; isolated memory, random port, no voice/model.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'finwisp-flow-'));
process.env.PROFILE_DIR=directory;
const {startHub}=await import('../host/index.js');
const {glossary}=await import('../mcp-server/glossary.js');
const app=await startHub({port:0});
const post=(path:string,value:unknown)=>fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const ask=async(text:string)=>{const response=await post('/api/ask',{text});assert.equal(response.status,200);const blocks=(await response.text()).split('\n\n');const result=blocks.find(b=>b.startsWith('event: result'));assert.ok(result,blocks.join('\n'));return JSON.parse(result.split('\ndata: ')[1]);};
try{
 const lesson=await ask('COST net margin');assert.equal(lesson.company.ticker,'COST');assert.equal(lesson.quiz.questions.length,3);
 const answers=lesson.quiz.questions.map((q:any)=>{const key=q.options.indexOf(glossary[q.concept] ?? 'It explains one aspect of a business, with context from filings.');return key>=0?(key+1)%q.options.length:0;});
 assert.equal((await post('/api/quiz/grade',{quiz_id:lesson.quiz.quiz_id,answers,profile_id:'family'})).status,200);
 const review=await ask('continue where we left off');assert.ok(review.review.some((c:any)=>c.concept==='net_margin'));assert.equal(review.quiz.questions.length,3);
 const refusal=await ask('Should I buy Nvidia?');assert.equal(refusal.mode,'policy');assert.equal(refusal.cards.items.length,4);assert.ok(refusal.cards.items.slice(1).every((c:any)=>c.sources.length && c.figures.some((f:any)=>f.value!==null)));
 console.log('Live COST grade → memory re-quiz; NVDA refusal with SEC sources: OK');
 for(const card of refusal.cards.items.slice(1))console.log(`${card.title}: ${card.body}`);
 assert.equal((await post('/api/profile/reset',{profile_id:'family'})).status,200);
 const profile=await (await fetch(app.url+'/api/profile')).json();assert.equal(profile.profile.quizHistory.length,0);
 console.log('UI reset API: OK');
}finally{await app.close();await rm(directory,{recursive:true,force:true});console.log('Random-port hub shut down; temporary profile removed.');}
