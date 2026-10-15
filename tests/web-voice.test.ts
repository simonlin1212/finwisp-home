import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenOnce, lessonSummary, MISSED } from '../web/src/speech.js';
import { VoiceConnection } from '../web/src/voice-connection.js';
test('browser recognition that ends without words says so instead of staying silent',()=>{
 for(const [events,expected] of [[['start','end'],MISSED],[['start','no-speech','end'],MISSED],[['start','not-allowed','end'],/unavailable/],[['start','empty','end'],MISSED]] as const){
  const r:any={start(){}},messages:string[]=[],texts:string[]=[];
  listenOnce(r,{text:v=>texts.push(v),message:m=>messages.push(m),listening:()=>{}});
  for(const e of events){if(e==='start')r.onstart();else if(e==='end')r.onend();else if(e==='empty')r.onresult({results:[[{transcript:'  '}]]});else r.onerror({error:e});}
  assert.equal(messages.length,1,events.join());assert.match(messages[0],expected instanceof RegExp?expected:new RegExp(expected));assert.equal(texts.length,0);
 }
 const r:any={start(){}},messages:string[]=[],texts:string[]=[];
 listenOnce(r,{text:v=>texts.push(v),message:m=>messages.push(m),listening:()=>{}});r.onstart();r.onresult({results:[[{transcript:'Costco net margin'}]]});r.onend();
 assert.deepEqual(texts,['Costco net margin']);assert.equal(messages.length,0);assert.equal(r.lang,'en-US');
});
test('lesson summary speaks the everyday name with one period',()=>{
 assert.equal(lessonSummary({company:{name:'Costco',title:'COSTCO WHOLESALE CORP /NEW'}}),'Let’s explore Costco.');
 assert.equal(lessonSummary({company:{title:'Apple Inc.'}}),'Let’s explore Apple Inc.');
 assert.equal(lessonSummary({text:'TSMC has no annual 10-K report.',company:{name:'TSMC'}}),'TSMC has no annual 10-K report.');
});
test('Codex voice sends a WebRTC offer, applies the answer, shows transcripts and falls back on errors',async(t)=>{
 const posts:{url:string;body:any}[]=[],applied:any[]=[],sources:any[]=[];let startStatus=200;
 const g=globalThis as any,saved={fetch:g.fetch,EventSource:g.EventSource,RTCPeerConnection:g.RTCPeerConnection,navigator:Object.getOwnPropertyDescriptor(g,'navigator')};
 t.after(()=>{g.fetch=saved.fetch;g.EventSource=saved.EventSource;g.RTCPeerConnection=saved.RTCPeerConnection;if(saved.navigator)Object.defineProperty(g,'navigator',saved.navigator);});
 g.fetch=async(url:string,init?:any)=>{if(init?.method==='POST')posts.push({url,body:init.body?JSON.parse(init.body):undefined});
  if(url.endsWith('/status'))return Response.json({available:true});if(url.endsWith('/start'))return startStatus===200?Response.json({active:true,sdp:'v=0 answer'}):new Response('{}',{status:startStatus});return Response.json({ok:true});};
 g.EventSource=class{onopen?:()=>void;onmessage?:(e:any)=>void;onerror?:()=>void;closed=false;constructor(){sources.push(this);queueMicrotask(()=>this.onopen?.());}close(){this.closed=true;}};
 const track={stopped:false,stop(){this.stopped=true;}};
 Object.defineProperty(g,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[track],getTracks:()=>[track]})}}});
 g.RTCPeerConnection=class{connectionState='new';channels:string[]=[];addTrack(){}createDataChannel(name:string){this.channels.push(name);}async createOffer(){return {type:'offer',sdp:'v=0 offer'};}async setLocalDescription(){}async setRemoteDescription(d:any){applied.push(d);}close(){}};
 const notices:string[]=[],ended:boolean[]=[];const voice=new VoiceConnection(n=>notices.push(n),f=>ended.push(f));
 assert.equal(await voice.start(),true);
 assert.deepEqual(posts[0],{url:'/api/voice/start',body:{explicit:true,sdp:'v=0 offer'}});assert.deepEqual(applied,[{type:'answer',sdp:'v=0 answer'}]);assert.match(notices.at(-1)!,/connected/);
 const send=(method:string,params:any)=>sources[0].onmessage({data:JSON.stringify({method,params})});
 send('thread/realtime/transcript/delta',{role:'assistant',delta:' Net '});send('thread/realtime/item/transcript/delta',{itemId:'i1',delta:' Net '});send('thread/realtime/transcript/delta',{role:'assistant',delta:'margin'});assert.equal(notices.at(-1),'Finwisp: Net margin');
 send('thread/realtime/transcript/done',{role:'user',text:'Teach me Costco'});assert.equal(notices.at(-1),'You: Teach me Costco');
 send('thread/realtime/error',{message:'boom'});await new Promise(r=>setImmediate(r));
 assert.deepEqual(ended,[true]);assert.equal(posts.at(-1)!.url,'/api/voice/stop');assert.ok(track.stopped);assert.ok(sources[0].closed);assert.match(notices.at(-1)!,/Switched to browser voice/);
 startStatus=500;ended.length=0;assert.equal(await voice.start(),false);assert.deepEqual(ended,[true]);assert.match(notices.at(-1)!,/Falling back to browser voice/);
});
test('leaving the page while Codex voice waits for its event stream ends the start instead of hanging',async(t)=>{
 const g=globalThis as any,saved={fetch:g.fetch,EventSource:g.EventSource};
 t.after(()=>{g.fetch=saved.fetch;g.EventSource=saved.EventSource;});
 const posts:string[]=[];
 g.fetch=async(url:string,init?:any)=>{if(init?.method==='POST')posts.push(url);return Response.json({available:true});};
 g.EventSource=class{onopen?:()=>void;onerror?:()=>void;close(){}}; // never opens, and a closed one never fires
 const notices:string[]=[],ended:boolean[]=[];const voice=new VoiceConnection(n=>notices.push(n),f=>ended.push(f));
 const start=voice.start();await new Promise(r=>setImmediate(r));
 await voice.stop();
 assert.equal(await Promise.race([start,new Promise(r=>setTimeout(()=>r('still waiting'),200))]),false);
 assert.deepEqual(ended,[false]);assert.deepEqual(posts,['/api/voice/stop']);assert.ok(!notices.some(n=>/unavailable/.test(n)));
});
