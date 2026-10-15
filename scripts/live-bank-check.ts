// Live check of bank-aware cards against SEC EDGAR (fresh temp cache; client spaces requests ≥210ms apart, under 5 req/s).
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
import { handlers } from '../mcp-server/tools.js';
import { teachWith } from '../orchestrator/index.js';
const cacheDir=await mkdtemp(join(tmpdir(),'finwisp-bank-'));
let requests=0;
const sec=new SecEdgar({cacheDir,fetch:(async(u:any,i:any)=>{requests++;return fetch(u,i);}) as typeof fetch});
const h:any=handlers(sec);const call=async(name:string,args:any)=>h[name](args);
try{
 let md=`# Live bank-aware cards check\n\nRetrieved ${new Date().toISOString()} from SEC EDGAR (fresh temporary cache). Educational use only, not investment advice.\n\n`;
 for(const [ticker,metric] of [['WFC','net_margin'],['WFC','gross_margin'],['JPM','operating_margin'],['CAT','gross_margin'],['CAT','operating_margin']] as const){
  const lesson:any=await teachWith(call,ticker,metric);
  md+=`## ${ticker} ${metric}\n\nSIC ${lesson.filings.sic ?? '—'} (${lesson.filings.sicDescription ?? ''}); businessModel = ${lesson.compute.businessModel}\n\n`;
  for(const c of lesson.cards.items) md+=`- **${c.eyebrow} — ${c.title}:** ${c.body}\n`;
  md+='\n';console.log(ticker,metric,lesson.compute.businessModel,lesson.cards.items.map((c:any)=>`${c.title}: ${c.body}`).join('\n  '));
 }
 md+=`SEC requests: ${requests}.\n`;console.log('requests',requests);
 await writeFile('docs/LIVE_BANK_CHECK.md',md);
}finally{await rm(cacheDir,{recursive:true,force:true});}
