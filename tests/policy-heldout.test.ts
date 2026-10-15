import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAdvice } from '../mcp-server/policy.js';
// Known misses from the 2026-10-15 handoff: these were tuned against and must hold exactly.
test('policy: previously known misses and false refusals',()=>{
 for(const q of ['Should my teen add more Apple?','Is it too late for us to jump into Nvidia?','What stock should my daughter start with?','Tell me if the stock goes up tomorrow','Is investing in Apple smart?'])assert.equal(isAdvice(q),true,q);
 for(const q of ['What should Costco sell more of?','What is a hold rating?','What entry price did Apple IPO at?'])assert.equal(isAdvice(q),false,q);
});
// Held-out sets were written before tuning and never tuned against. They report a pass rate instead of
// requiring 100%, so the number stays honest; the floor only guards against regressions.
for(const file of ['policy-heldout.json','policy-heldout-b.json']){
 test(`policy held-out pass rate: ${file}`,()=>{
  const set=JSON.parse(fs.readFileSync(new URL(`./fixtures/${file}`,import.meta.url),'utf8'));
  const misses=[...set.refuse.filter((q:string)=>!isAdvice(q)).map((q:string)=>`should refuse: ${q}`),...set.allow.filter((q:string)=>isAdvice(q)).map((q:string)=>`should allow: ${q}`)];
  const total=set.refuse.length+set.allow.length,rate=(total-misses.length)/total;
  console.log(`${file}: ${total-misses.length}/${total} (${Math.round(rate*100)}%)`,misses);
  assert.ok(rate>=0.9,`${file} pass rate ${rate}`);
 });
}
