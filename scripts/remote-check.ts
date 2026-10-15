import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const url=process.argv[2]??process.env.FINWISP_MCP_URL;
if(!url)throw new Error('Usage: npm run remote-check -- https://your-worker.workers.dev/mcp (or FINWISP_MCP_URL)');
const client=new Client({name:'finwisp-remote-check',version:'0.1.0'});
const transport=new StreamableHTTPClientTransport(new URL(url));
try {
 await client.connect(transport);
 console.log('Server:',client.getServerVersion());
 // Negotiated version is carried in subsequent HTTP request headers by the SDK.
 console.log('Protocol:',transport.protocolVersion??'negotiated by SDK');
 console.log('Tools:',(await client.listTools()).tools.map(t=>t.name).join(', '));
 async function call(name:string,args:Record<string,unknown>) {
  const result=await client.callTool({name,arguments:args});
  if(result.isError)throw new Error(`${name}: ${JSON.stringify(result.content)}`);
  const data=result.structuredContent??JSON.parse((result.content as {type:string;text:string}[]).find(c=>c.type==='text')!.text);
  console.log(`${name}:`,JSON.stringify(data,null,2));return data as any;
 }
 await call('lookup_company',{query:'Wells Fargo'});
 const financials=await call('get_financials',{ticker_or_cik:'WFC',years:3});
 const computed=await call('compute_metrics',{financials:financials.financials,sic:'6021'});
 const card=await call('make_card',{type:'metric',metric:'net_margin',computed:computed.computed,company:'Wells Fargo',business_model:computed.businessModel});
 console.log('Card:',JSON.stringify(card));
 console.log('SEC accession numbers:',[...new Set(financials.financials.flatMap((f:any)=>f.values.map((v:any)=>v.accessionNumber)))].join(', '));
} finally { await client.close(); }
