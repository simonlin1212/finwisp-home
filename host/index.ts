import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { startServer } from '../mcp-server/index.js';
import { askWith, withMcp, type ToolCaller } from '../orchestrator/index.js';
import { educationSchemas } from '../mcp-server/education.js';
import { profileId } from '../mcp-server/memory.js';
const askSchema=z.object({text:z.string().trim().min(1).max(2000),profile_id:profileId});
async function body(req:IncomingMessage) {let size=0;const chunks:Buffer[]=[];for await(const c of req){size+=c.length;if(size>16384)throw new Error('Request too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());}
export function validRequest(req:IncomingMessage,host:string) {
 const allowed=new Set(['localhost','127.0.0.1','[::1]',host.includes(':')?`[${host}]`:host]);
 try {const authority=new URL(`http://${req.headers.host ?? ''}`);if(!allowed.has(authority.hostname)||authority.username||authority.password||authority.pathname!=='/')return false;
  if(req.headers.origin){const origin=new URL(req.headers.origin);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==req.headers.origin||!allowed.has(origin.hostname))return false;}return true;
 } catch{return false;}
}
export async function startHub(options:{port?:number;host?:string;call?:ToolCaller;mcpUrl?:string;webDir?:string}={}) {
 const host=options.host ?? process.env.HOST ?? '127.0.0.1',webDir=resolve(options.webDir ?? 'web/dist');
 const mcp=options.call || options.mcpUrl || process.env.MCP_URL?undefined:await startServer({port:0});
 const url=options.mcpUrl ?? process.env.MCP_URL ?? mcp?.url;
 const invoke=async<T>(work:(call:ToolCaller)=>Promise<T>)=>options.call?work(options.call):withMcp(url!,work);
 const pending=new Set<Promise<void>>();
 const handle=async(req:IncomingMessage,res:import('node:http').ServerResponse)=>{
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  try {
   const path=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`).pathname;
   if(path.startsWith('/api/')) {
    if(!validRequest(req,host)){json(403,{error:'Forbidden Host or Origin'});return;}
    if(path==='/api/ask' && req.method==='POST') {
     const a=askSchema.parse(await body(req));res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});res.flushHeaders();
     const send=(event:string,data:unknown)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
     try{const result=await invoke(call=>askWith(call,a.text,a.profile_id,e=>send('step',e)));send('result',result);}catch(e){send('error',{error:e instanceof Error?e.message:String(e)});}finally{res.end();}return;
    }
    if(path==='/api/quiz/grade' && req.method==='POST'){const a=educationSchemas.grade_quiz.parse(await body(req));json(200,await invoke(call=>call('grade_quiz',a)));return;}
    if(path==='/api/profile' && req.method==='GET'){const id=profileId.parse(new URL(req.url!,'http://localhost').searchParams.get('profile_id') ?? 'family');json(200,await invoke(call=>call('get_learning_profile',{profile_id:id})));return;}
    json(404,{error:'Unknown API route'});return;
   }
   if(req.method!=='GET' && req.method!=='HEAD'){json(405,{error:'Method not allowed'});return;}
   const file=resolve(webDir,`.${decodeURIComponent(path==='/'?'/index.html':path)}`);if(!file.startsWith(webDir+sep)){json(403,{error:'Forbidden path'});return;}
   const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'} as Record<string,string>)[extname(file)] ?? 'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);
  }catch(e:any){if(!res.headersSent)json(e.code==='ENOENT'?404:400,{error:e instanceof Error?e.message:String(e)});else res.end();}
 };
 const http=createServer((req,res)=>{const task=handle(req,res);pending.add(task);void task.finally(()=>pending.delete(task));});
 try{await new Promise<void>((ok,no)=>{http.once('error',no);http.listen(options.port ?? Number(process.env.HUB_PORT ?? 8796),host,ok);});}catch(e){await mcp?.close();throw e;}
 return {url:`http://${host.includes(':')?`[${host}]`:host}:${(http.address() as any).port}`,close:async()=>{const closed=new Promise<void>((ok,no)=>http.close(e=>e?no(e):ok()));http.closeAllConnections();await closed;await Promise.allSettled([...pending]);await mcp?.close();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){const app=await startHub();console.log(`Finwisp Home: ${app.url}`);for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>{process.exitCode=0;});});}
