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
const OFFER='v=0\r\no=- offer',ANSWER='v=0\r\no=- answer';
test('voice session stays lazy, negotiates WebRTC with English policy and finwisp MCP overrides; relays and stops',async()=>{
 let spawned=0,closed=0,events:any;const calls:any[]=[];
 const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'http://127.0.0.1:1234/mcp',factory:e=>{
  spawned++;events=e;
  return {initialize:async()=>{},request:async(method,params)=>{calls.push({method,params});if(method==='thread/realtime/start')queueMicrotask(()=>events.onNotification('thread/realtime/sdp',{threadId:'t1',sdp:ANSWER}));return {thread:{id:'t1'}};},close:async()=>{closed++;}};
 }});
 const received:any[]=[];const unsubscribe=session.subscribe(e=>received.push(e));
 session.status();assert.equal(spawned,0);await assert.rejects(session.start(false),/Explicit/);await assert.rejects(session.start(true),/offer/);assert.equal(spawned,0);
 const started=await session.start(true,OFFER);assert.equal(spawned,1);assert.equal(started.sdp,ANSWER);assert.equal(started.active,true);
 assert.equal(calls[0].params.config['mcp_servers.finwisp.default_tools_approval_mode'],'approve');
 assert.match(calls[0].params.developerInstructions,/Teach in English/);assert.doesNotMatch(calls[0].params.developerInstructions,/[\u4e00-\u9fff]/);
 assert.deepEqual(calls.find(c=>c.method==='thread/realtime/start').params.transport,{type:'webrtc',sdp:OFFER});
 events.onNotification('thread/realtime/transcript/delta',{role:'assistant',delta:'Revenue'});
 events.onNotification('thread/realtime/item/transcript/delta',{itemId:'i1',delta:'Revenue'});
 events.onNotification('thread/realtime/itemAdded',{item:{type:'handoff_request',input_transcript:'Explain margins'}});
 events.onNotification('thread/realtime/transcript/done',{role:'user',text:'Explain margins'});
 assert.deepEqual(received.map(e=>e.method),['thread/realtime/transcript/delta','thread/realtime/transcript/done']);
 assert.ok(!calls.some(c=>/append/.test(c.method)));
 await assert.rejects(session.start(true,OFFER),/already/);await session.stop();unsubscribe();assert.equal(closed,1);assert.equal(session.status().active,false);
 assert.equal(voiceConfig('url')['mcp_servers.finwisp.url'],'url');
});
test('a realtime error before the WebRTC answer fails the start and releases the runtime',async()=>{
 let closed=0;
 const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'url',factory:events=>({initialize:async()=>{},request:async(method)=>{if(method==='thread/realtime/start')queueMicrotask(()=>events.onNotification?.('thread/realtime/error',{message:'realtime conversation requires API key auth'}));return {thread:{id:'t1'}};},close:async()=>{closed++;}})});
 await assert.rejects(session.start(true,OFFER),/unavailable/);assert.equal(closed,1);assert.equal(session.status().active,false);
});
test('disabled and failed voice clean up without retrying or leaking a runtime',async()=>{
 let spawned=0,closed=0;
 const disabled=new RealtimeVoiceSession({enabled:false,mcpUrl:'url',factory:()=>{spawned++;throw Error('should not spawn');}});
 await assert.rejects(disabled.start(true),/disabled/);assert.equal(spawned,0);
 const failed=new RealtimeVoiceSession({enabled:true,mcpUrl:'url',factory:()=>({initialize:async()=>{throw Error('no login');},request:async()=>{},close:async()=>{closed++;}})});
 await assert.rejects(failed.start(true,OFFER),/unavailable/);assert.equal(closed,1);assert.equal(failed.status().active,false);
});
test('session uses real JSON-RPC client with fake child, never real codex',async()=>{
 const f=fakeChild();const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'http://localhost:1234/mcp',factory:events=>new AppServerClient({...options,spawnChild:(()=>f.child) as any,...events})});
 const start=session.start(true,OFFER);
 await new Promise<void>(r=>setImmediate(r));f.reply({id:1,result:{}});
 await new Promise<void>(r=>setImmediate(r));assert.equal(f.writes[1].method,'initialized');assert.equal(f.writes[2].method,'thread/start');f.reply({id:2,result:{thread:{id:'fake-thread'}}});
 await new Promise<void>(r=>setImmediate(r));assert.equal(f.writes[3].method,'thread/realtime/start');assert.equal(f.writes[3].params.transport.sdp,OFFER);f.reply({id:3,result:{}});f.reply({method:'thread/realtime/sdp',params:{threadId:'fake-thread',sdp:ANSWER}});assert.equal((await start).sdp,ANSWER);
 const stop=session.stop();f.reply({id:4,result:{}});await stop;assert.equal(session.status().active,false);
});
test('closing the previous call neither reports an error to nor stops the call that replaced it',async()=>{
 const children:ReturnType<typeof fakeChild>[]=[],seen:string[]=[],tick=()=>new Promise<void>(r=>setImmediate(r));
 const session=new RealtimeVoiceSession({enabled:true,mcpUrl:'url',factory:events=>{const f=fakeChild();children.push(f);return new AppServerClient({...options,timeoutMs:5000,spawnChild:(()=>f.child) as any,...events});}});
 session.subscribe(e=>seen.push(e.method));
 const connect=async(f:ReturnType<typeof fakeChild>,thread:string)=>{await tick();f.reply({id:1,result:{}});await tick();f.reply({id:2,result:{thread:{id:thread}}});await tick();f.reply({id:3,result:{}});f.reply({method:'thread/realtime/sdp',params:{threadId:thread,sdp:ANSWER}});};
 const a=session.start(true,OFFER);await connect(children[0],'A');await a;
 const stopA=session.stop();await tick(); // A's thread/realtime/stop is still unanswered
 const b=session.start(true,OFFER);await connect(children[1],'B');await b;
 children[0].reply({id:4,result:{}});await stopA;await tick();await tick();
 assert.deepEqual(seen,[]);assert.equal(session.status().active,true);
 assert.ok(!children[1].writes.some(w=>w.method==='thread/realtime/stop'));
 children[0].reply({method:'thread/realtime/transcript/delta',params:{role:'assistant',delta:'old call'}});await tick();assert.deepEqual(seen,[]);
 const stopB=session.stop();await tick();children[1].reply({id:4,result:{}});await stopB;assert.equal(session.status().active,false);
});
