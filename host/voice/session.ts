import { AppServerClient, type AppServerEvents } from './app-server.js';
import { INSTRUCTIONS } from '../../mcp-server/policy.js';
export type VoiceEvent = { method:string; params:unknown };
// Codex repeats each transcript piece as item/transcript/delta without a role, and hand-off items
// carry the whole conversation. The page needs only these.
const FORWARDED=new Set(['thread/realtime/transcript/delta','thread/realtime/transcript/done','thread/realtime/error','thread/realtime/closed']);
export interface VoiceRuntime { initialize(experimental?:boolean):Promise<unknown>; request(method:string,params?:unknown):Promise<any>; close():Promise<void> }
export const voiceConfig=(url:string)=>({
 'mcp_servers.finwisp.url':url,
 'mcp_servers.finwisp.default_tools_approval_mode':'approve',
 'features.realtime_conversation':true,
 'features.shell_tool':false, 'features.unified_exec':false,
 'features.apps':false, 'features.plugins':false, 'features.multi_agent':false,
 'project_doc_max_bytes':0,
});
/** Constructing/status/subscribing never spawns. Only explicit start owns a runtime. */
export class RealtimeVoiceSession {
 private client?:VoiceRuntime;
 private threadId?:string;
 private starting=false;
 private listeners=new Set<(event:VoiceEvent)=>void>();
 private idle?:ReturnType<typeof setTimeout>;
 constructor(private options:{mcpUrl:string; enabled:boolean; factory?:(events:AppServerEvents)=>VoiceRuntime}){}
 subscribe(fn:(event:VoiceEvent)=>void){this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 private emit(method:string,params:unknown){for(const fn of this.listeners)fn({method,params});}
 private touch(){clearTimeout(this.idle);this.idle=setTimeout(()=>{void this.stop();},120_000);this.idle.unref();}
 status(){return {engine:this.options.enabled?'codex':'browser',available:this.options.enabled,active:!!this.threadId};}
 /**
  * ChatGPT (subscription) login only supports WebRTC realtime: the browser's SDP offer goes to
  * thread/realtime/start and the answer arrives as thread/realtime/sdp. Audio then flows between the
  * browser and OpenAI. Hub-relayed appendAudio fails with "requires API key auth".
  */
 async start(explicit:boolean,offer?:string){
  if(!explicit)throw Error('Explicit voice start required');
  if(!this.options.enabled)throw Error('Codex voice is disabled. Using browser voice.');
  if(!offer?.startsWith('v=0'))throw Error('A WebRTC offer is required');
  if(this.client || this.starting)throw Error('Voice is already starting or active');
  this.starting=true;
  let answered:(sdp:string)=>void=()=>{},rejected:(error:Error)=>void=()=>{};
  const answer=new Promise<string>((ok,no)=>{answered=ok;rejected=no;});answer.catch(()=>{});
  // Each start owns its runtime. Once that runtime is stopped or replaced, its late events, including
  // the failure its own close reports, must not reach the page or stop the next call.
  let runtime:VoiceRuntime|undefined;
  const live=()=>!!runtime && this.client===runtime;
  const events:AppServerEvents={onNotification:(method,params:any)=>{
   if(!method.startsWith('thread/realtime/'))return;
   if(method==='thread/realtime/sdp'){const sdp=typeof params?.sdp==='string'?params.sdp:'';if(sdp.startsWith('v=0') && sdp.length<=100_000)answered(sdp);else rejected(Error('Invalid answer'));return;}
   if(method==='thread/realtime/error'||method==='thread/realtime/closed')rejected(Error(method));
   if(!live())return;
   // Audio bypasses the hub, so transcripts and items are the activity that keeps the call alive.
   if(this.threadId)this.touch();
   if(FORWARDED.has(method))this.emit(method,params);
   if(method==='thread/realtime/error'||method==='thread/realtime/closed')void this.stop();
  },onFailure:()=>{rejected(Error('runtime'));if(!live())return;this.emit('error',{message:'Codex voice unavailable. Use browser voice.'});void this.stop();}};
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   const config=voiceConfig(this.options.mcpUrl);
   runtime=this.options.factory?.(events) ?? new AppServerClient({executable:process.env.CODEX_EXECUTABLE ?? 'codex',args:['app-server',...Object.entries(config).flatMap(([key,value])=>['-c',`${key}=${JSON.stringify(value)}`])],cwd:process.cwd(),env:process.env,...events});
   this.client=runtime;
   await runtime.initialize(true);
   const result=await runtime.request('thread/start',{developerInstructions:INSTRUCTIONS,approvalPolicy:'never',sandbox:'read-only',config});
   if(!result?.thread?.id)throw Error('Invalid voice thread');
   if(!live())throw Error('Stopped');
   this.threadId=result.thread.id;
   await runtime.request('thread/realtime/start',{threadId:this.threadId,version:'v3',outputModality:'audio',transport:{type:'webrtc',sdp:offer},prompt:INSTRUCTIONS});
   const sdp=await Promise.race([answer,new Promise<never>((_,no)=>{timer=setTimeout(()=>no(Error('No WebRTC answer')),15_000);})]);
   if(!live())throw Error('Stopped');
   this.touch();return {...this.status(),sdp};
  } catch {if(live())await this.stop();throw Error('Codex voice unavailable. Check your Codex login; using browser voice.');}
  finally{clearTimeout(timer);this.starting=false;}
 }
 async stop(){clearTimeout(this.idle);const client=this.client,threadId=this.threadId;this.client=undefined;this.threadId=undefined;
  if(client){try{if(threadId)await client.request('thread/realtime/stop',{threadId});}catch{}finally{await client.close();}}
 }
}
