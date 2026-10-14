import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
import { handlers } from '../mcp-server/tools.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cacheDir=await mkdtemp(join(tmpdir(),'finwisp-live-'));
const h=handlers(new SecEdgar({cacheDir}));
try {
let md=`# Live SEC check\n\nRetrieved ${new Date().toISOString()}. Four requests (one ticker directory and three companyfacts), fresh temporary cache. Latest three annual periods available from SEC companyfacts; not a forecast. Values are USD, unrounded.\n\n`;
for (const ticker of ['COST','NVDA','AAPL']) {
 const result=await h.get_financials({ticker_or_cik:ticker,metrics:['Revenue','NetIncomeLoss'],years:3});
 if(result.financials.some(f=>f.values.length!==3)) throw new Error(`${ticker}: expected three annual values per metric`);
 md+=`## ${ticker}\n\nSource: ${result.source}\n\n| Metric | FY | Period end | USD | Concept | Filed | Accession |\n|---|---|---|---|---|---|---|\n`;
 for(const f of result.financials) for(const v of f.values) md+=`| ${f.metric} | ${v.fiscalYear} | ${v.end} | ${v.value} | ${v.concept} | ${v.filed} | ${v.accessionNumber} |\n`;
 md+='\n';
 console.log(ticker,result.financials.map(f=>({metric:f.metric,values:f.values})));
}
await writeFile('docs/LIVE_CHECK.md',md);

} finally { await rm(cacheDir,{recursive:true,force:true}); }
