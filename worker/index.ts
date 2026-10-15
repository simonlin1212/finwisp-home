import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import { createMcpServer, NOTE } from '../mcp-server/tools.js';
import { MemoryProfileStorage, ProfileStore } from '../mcp-server/memory.js';
import { SecEdgar } from '../mcp-server/sources/sec-edgar.js';
import { WorkerCache, type EdgeCache } from './cache.js';
export interface Env {
 SEC_CONTACT_EMAIL?:string; SEC_APP_NAME?:string; ALLOWED_ORIGINS?:string;
 MCP_RATE_LIMITER?:{limit(options:{key:string}):Promise<{success:boolean}>};
}
interface Context { waitUntil(promise:Promise<unknown>):void }
export function createWorker(deps:{fetch?:typeof fetch; sec?:SecEdgar; cache?:WorkerCache; sleep?:(ms:number)=>Promise<void>}={}) {
 let sec=deps.sec;
 const profiles=new ProfileStore('',new MemoryProfileStorage());
 const error=(status:number,message:string)=>Response.json({jsonrpc:'2.0',id:null,error:{code:-32000,message}},{status});
 return { async fetch(request:Request, env:Env={}, _ctx?:Context):Promise<Response> {
  const path=new URL(request.url).pathname;
  if(request.method==='GET' && (path==='/' || path==='/health')) return Response.json({name:'finwisp-home',version:'0.1.0',mcp:'/mcp',transport:'streamable-http',note:NOTE});
  if(path!=='/mcp')return error(404,'Not found');
  const origin=request.headers.get('Origin');
  if(origin && !(env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean).includes(origin))return error(403,'Forbidden Origin');
  if(env.MCP_RATE_LIMITER && !(await env.MCP_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'})).success)return error(429,'Rate limit exceeded');
  const cors=new Headers();
  if(origin) { cors.set('Access-Control-Allow-Origin',origin); cors.set('Vary','Origin'); cors.set('Access-Control-Expose-Headers','MCP-Protocol-Version'); }
  if(request.method==='OPTIONS') { cors.set('Access-Control-Allow-Methods','POST, GET, DELETE, OPTIONS'); cors.set('Access-Control-Allow-Headers','Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id'); return new Response(null,{status:204,headers:cors}); }
  if(!['POST','DELETE','GET'].includes(request.method) || request.method==='GET') { const r=error(405,'Method not allowed'); r.headers.set('Allow','POST, DELETE, OPTIONS'); return r; }
  const cap=256*1024;
  if(Number(request.headers.get('Content-Length'))>cap)return error(413,'Request body exceeds 256 KB');
  const chunks:Uint8Array[]=[]; let size=0;
  if(request.body) { const reader=request.body.getReader(); while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>cap) { await reader.cancel(); return error(413,'Request body exceeds 256 KB'); } chunks.push(value); } }
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!sec) {
   const edge=(globalThis as typeof globalThis & {caches?:{default?:EdgeCache}}).caches?.default;
   // Missing contact is checked at fetch time so initialize/list and educational tools still work.
   sec=new SecEdgar({conceptsOnly:true,cache:deps.cache??new WorkerCache(edge),userAgent:`${env.SEC_APP_NAME?.trim()||'FinwispHome/0.1'} ${env.SEC_CONTACT_EMAIL?.trim()||'contact@example.com'}`,sleep:deps.sleep,
    fetch:((input,init)=> { if(!env.SEC_CONTACT_EMAIL?.trim())throw new Error('SEC_CONTACT_EMAIL is required before calling SEC'); return (deps.fetch??fetch)(input,init); }) as typeof fetch});
  }
  const server=createMcpServer(sec,{jsonSchemaValidator:new CfWorkerJsonSchemaValidator()},profiles);
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try {
   await server.connect(transport);
   const response=await transport.handleRequest(new Request(request.url,{method:request.method,headers:request.headers,...(size?{body:bytes}:{})}));
   // JSON mode completes the response before closing this request's stateless server.
   const body=await response.arrayBuffer();
   const headers=new Headers(response.headers); cors.forEach((value,key)=>headers.set(key,value));
   return new Response(body.byteLength?body:null,{status:response.status,headers});
  } finally { await server.close(); }
 } };
}
export default createWorker();
