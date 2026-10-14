import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { AppServerClient } from '../host/voice/app-server.js';
import { RealtimeVoiceSession, voiceConfig } from '../host/voice/session.js';
function fakeChild(){
 const child=new EventEmitter() as any, writes:any[]=[];
 child.stdout=new PassThrough();child.stderr=new PassThrough();
 child.stdin=new Writable({write(chunk,_encoding,cb){writes.push(JSON.parse(chunk.toString()));cb();}});
 child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};
 return {child,writes,reply:(value:unknown)=>child.stdout.write(JSON.stringify(value)+'\n')};
}
const options={executable:'fake',args:[],cwd:process.cwd(),env:{},timeoutMs:100};
test('JSON-RPC framing, interleaving, errors, notifications and async server requests',async()=>{
 const f=fakeChild(),events:any[]=[];
 const client=new AppServerClient({...options,spawnChild:(()=>f.child) as any,onNotification:(...e)=>events.push(e),onRequest:async()=>({ok:true})});
 try{
  const first=client.request('first'),second=client.request('second');
  const frame=JSON.stringify({id:2,result:'second'})+'\n';f.child.stdout.write(frame.slice(0,8));f.child.stdout.write(frame.slice(8));
  f.reply({method:'event',params:{text:'hello'}});f.reply({id:1,result:'first'});
  assert.deepEqual(await Promise.all([first,second]),['first','second']);assert.equal(events[0][0],'event');
  const bad=client.request('bad');f.reply({id:3,error:{code:-32601,message:'private diagnostic'}});await assert.rejects(bad,/ENGINE_RPC_-32601/);
  f.reply({id:'server',method:'tool',params:{}});await new Promise<void>(r=>setImmediate(r));assert.deepEqual(f.writes.at(-1),{id:'server',result:{ok:true}});
 }finally{await client.close();}
});
test('JSON-RPC initialization, timeout, malformed response and process failure release pending work',async()=>{
 for(const mode of ['timeout','malformed','exit','error']){
  const f=fakeChild(),client=new AppServerClient({...options,timeoutMs:10,spawnChild:(()=>f.child) as any});
  const pending=client.initialize(true);
  assert.equal(f.writes[0].params.capabilities.experimentalApi,true);
  if(mode==='malformed')f.child.stdout.write('garbage\n');
  if(mode==='exit')f.child.emit('close',1);
  if(mode==='error')f.child.emit('error',Error('unavailable'));
  await assert.rejects(pending,/ENGINE_/);await client.close();
 }
});
test('voice session stays lazy, uses English policy and finwisp MCP overrides; relays and stops',async()=>{
 let spawned=0,closed=0,events:any;const calls:any[]=[];
 const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'http://127.0.0.1:1234/mcp',factory:e=>{
  spawned++;events=e;
  return {initialize:async()=>{},request:async(method,params)=>{calls.push({method,params});return {thread:{id:'t1'}};},close:async()=>{closed++;}};
 }});
 const received:any[]=[];const unsubscribe=session.subscribe(e=>received.push(e));
 session.status();assert.equal(spawned,0);await assert.rejects(session.start(false),/Explicit/);assert.equal(spawned,0);
 await session.start(true);assert.equal(spawned,1);
 assert.equal(calls[0].params.config['mcp_servers.finwisp.default_tools_approval_mode'],'approve');
 assert.match(calls[0].params.developerInstructions,/Teach in English/);assert.doesNotMatch(calls[0].params.developerInstructions,/[\u4e00-\u9fff]/);
 events.onNotification('thread/realtime/transcript/delta',{text:'Revenue'});
 events.onNotification('thread/realtime/outputAudio/delta',{audio:{data:'AA==',sampleRate:24000,numChannels:1}});
 assert.equal(received.length,2);
 await session.input({audio:{data:'AA==',sampleRate:24000,numChannels:1}});await session.input({text:'Explain margins'});
 assert.equal(calls.at(-2).method,'thread/realtime/appendAudio');
 await assert.rejects(session.start(true),/already/);await session.stop();unsubscribe();assert.equal(closed,1);assert.equal(session.status().active,false);
 await assert.rejects(session.input({text:'hello'}),/Start voice/);
 assert.equal(voiceConfig('url')['mcp_servers.finwisp.url'],'url');
});
test('disabled and failed voice clean up without retrying or leaking a runtime',async()=>{
 let spawned=0,closed=0;
 const disabled=new RealtimeVoiceSession({enabled:false,mcpUrl:'url',factory:()=>{spawned++;throw Error('should not spawn');}});
 await assert.rejects(disabled.start(true),/disabled/);assert.equal(spawned,0);
 const failed=new RealtimeVoiceSession({enabled:true,mcpUrl:'url',factory:()=>({initialize:async()=>{throw Error('no login');},request:async()=>{},close:async()=>{closed++;}})});
 await assert.rejects(failed.start(true),/unavailable/);assert.equal(closed,1);assert.equal(failed.status().active,false);
});
test('session uses real JSON-RPC client with fake child, never real codex',async()=>{
 const f=fakeChild();const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'http://localhost:1234/mcp',factory:events=>new AppServerClient({...options,spawnChild:(()=>f.child) as any,...events})});
 const start=session.start(true);
 await new Promise<void>(r=>setImmediate(r));f.reply({id:1,result:{}});
 await new Promise<void>(r=>setImmediate(r));assert.equal(f.writes[1].method,'initialized');assert.equal(f.writes[2].method,'thread/start');f.reply({id:2,result:{thread:{id:'fake-thread'}}});
 await new Promise<void>(r=>setImmediate(r));assert.equal(f.writes[3].method,'thread/realtime/start');f.reply({id:3,result:{}});await start;
 const stop=session.stop();f.reply({id:4,result:{}});await stop;assert.equal(session.status().active,false);
});
