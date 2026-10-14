import { AppServerClient, type AppServerEvents } from './app-server.js';
import { INSTRUCTIONS } from '../../mcp-server/policy.js';
export type VoiceEvent = { method:string; params:unknown };
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
 async start(explicit:boolean){
  if(!explicit)throw Error('Explicit voice start required');
  if(!this.options.enabled)throw Error('Codex voice is disabled. Using browser voice.');
  if(this.client || this.starting)throw Error('Voice is already starting or active');
  this.starting=true;
  const events:AppServerEvents={onNotification:(method,params)=>{
   if(method.startsWith('thread/realtime/')){this.emit(method,params);if(method.endsWith('/error')||method.endsWith('/closed'))void this.stop();}
  },onFailure:()=>{this.emit('error',{message:'Codex voice unavailable. Use browser voice.'});void this.stop();}};
  try {
   const config=voiceConfig(this.options.mcpUrl);
   this.client=this.options.factory?.(events) ?? new AppServerClient({executable:process.env.CODEX_EXECUTABLE ?? 'codex',args:['app-server',...Object.entries(config).flatMap(([key,value])=>['-c',`${key}=${JSON.stringify(value)}`])],cwd:process.cwd(),env:process.env,...events});
   await this.client.initialize(true);
   const result=await this.client.request('thread/start',{developerInstructions:INSTRUCTIONS,approvalPolicy:'never',sandbox:'read-only',config});
   if(!result?.thread?.id)throw Error('Invalid voice thread');
   this.threadId=result.thread.id;
   await this.client.request('thread/realtime/start',{threadId:this.threadId,version:'v3',outputModality:'audio',prompt:INSTRUCTIONS});
   this.touch();return this.status();
  } catch {await this.stop();throw Error('Codex voice unavailable. Check your Codex login; using browser voice.');}
  finally{this.starting=false;}
 }
 async input(input:{audio?:{data:string;sampleRate:number;numChannels:number};text?:string}){
  if(!this.client || !this.threadId)throw Error('Start voice first');
  this.touch();
  if(input.audio)await this.client.request('thread/realtime/appendAudio',{threadId:this.threadId,audio:input.audio});
  else if(input.text)await this.client.request('thread/realtime/appendText',{threadId:this.threadId,text:input.text});
 }
 async stop(){clearTimeout(this.idle);const client=this.client,threadId=this.threadId;this.client=undefined;this.threadId=undefined;
  if(client){try{if(threadId)await client.request('thread/realtime/stop',{threadId});}catch{}finally{await client.close();}}
 }
}
