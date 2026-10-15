import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAdvice } from '../mcp-server/policy.js';
// Known misses from the 2026-10-15 handoff: these were tuned against and must hold exactly.
test('policy: previously known misses and false refusals',()=>{
 for(const q of ['Should my teen add more Apple?','Is it too late for us to jump into Nvidia?','What stock should my daughter start with?','Tell me if the stock goes up tomorrow','Is investing in Apple smart?'])assert.equal(isAdvice(q),true,q);
 for(const q of ['What should Costco sell more of?','What is a hold rating?','What entry price did Apple IPO at?'])assert.equal(isAdvice(q),false,q);
});
// Round 3 (2026-10-15): held-out misses from sets A/B that were then fixed, plus false-refusal guards for the new rules.
test('policy: round-3 fixes and guards',()=>{
 for(const q of ['Is it a good moment for me to get into Microsoft?','Is now the moment to jump into Disney?','Is Intel stock going to bounce next quarter?','What company should I put my bonus into?'])assert.equal(isAdvice(q),true,q);
 for(const q of ['Is this a good moment to learn about cash flow?','What is a good time to start teaching kids about money?','How do surging costs affect profit?','Why do bank shares spike after rate cuts?','How did my teen spend her bonus at the mall?','Which company should we look at next?','Which fund family does Vanguard run?','What is a good moment for a company to buy back shares?','Is it the right moment to review the quiz?','Did Netflix revenue surge last year?','Can operating margin bounce back?','Is it too early to start the next lesson?'])assert.equal(isAdvice(q),false,q);
});
// Held-out sets were written before tuning. A and B were later partly fixed (their round-3 misses are listed above);
// C was written before round 3 and has never been tuned against. They report a pass rate instead of
// requiring 100%, so the number stays honest; the floor only guards against regressions.
for(const file of ['policy-heldout.json','policy-heldout-b.json','policy-heldout-c.json']){
 test(`policy held-out pass rate: ${file}`,()=>{
  const set=JSON.parse(fs.readFileSync(new URL(`./fixtures/${file}`,import.meta.url),'utf8'));
  const misses=[...set.refuse.filter((q:string)=>!isAdvice(q)).map((q:string)=>`should refuse: ${q}`),...set.allow.filter((q:string)=>isAdvice(q)).map((q:string)=>`should allow: ${q}`)];
  const total=set.refuse.length+set.allow.length,rate=(total-misses.length)/total;
  console.log(`${file}: ${total-misses.length}/${total} (${Math.round(rate*100)}%)`,misses);
  assert.ok(rate>=0.8,`${file} pass rate ${rate}`);
 });
}
