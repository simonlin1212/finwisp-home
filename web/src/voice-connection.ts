/**
 * Codex voice over WebRTC: audio flows directly between the browser and OpenAI, the hub only
 * relays the SDP offer/answer and transcripts. This is the transport ChatGPT (subscription) login
 * supports; hub-relayed audio needs an API key. No microphone or server process opens by construction.
 */
export class VoiceConnection {
 private events?:EventSource;
 private stream?:MediaStream;
 private pc?:RTCPeerConnection;
 private audio?:HTMLAudioElement;
 private stopped=true;
 private partial:Record<string,string>={};
 /** A closed EventSource never fires again, so stop() has to release a start still waiting for it. */
 private abort?:(error:Error)=>void;
 constructor(private notice:(text:string)=>void,private ended:(failed:boolean)=>void){}
 async start(){
  this.stopped=false;
  try {
   const status=await fetch('/api/voice/status').then(r=>r.json());
   if(this.stopped)return false;
   if(!status.available)throw Error('Codex voice is disabled on this hub.');
   const events=new EventSource('/api/voice/events');this.events=events;
   await new Promise<void>((ok,no)=>{this.abort=no;events.onopen=()=>ok();events.onerror=()=>no(Error('Voice events unavailable'));});
   this.abort=undefined;
   events.onmessage=e=>{
    const event=JSON.parse(e.data),p=event.params ?? {};
    if(event.method==='error'||event.method==='thread/realtime/error'){void this.fail();return;}
    if(event.method==='thread/realtime/closed'){void this.stop();return;}
    const role=p.role,label=role==='user'?'You':'Finwisp';
    if(role!=='user' && role!=='assistant')return;
    if(event.method==='thread/realtime/transcript/delta' && typeof p.delta==='string'){this.partial[role]=(this.partial[role] ?? '')+p.delta;this.notice(`${label}: ${this.partial[role].trim()}`);}
    if(event.method==='thread/realtime/transcript/done' && typeof p.text==='string'){this.partial[role]='';this.notice(`${label}: ${p.text.trim()}`);}
   };
   events.onerror=()=>{void this.fail();};
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(this.stopped){stream.getTracks().forEach(t=>t.stop());return false;}
   this.stream=stream;
   const pc=new RTCPeerConnection();this.pc=pc;
   stream.getAudioTracks().forEach(track=>pc.addTrack(track,stream));
   pc.createDataChannel('oai-events');
   pc.ontrack=e=>{const audio=new Audio();audio.autoplay=true;audio.srcObject=e.streams[0] ?? new MediaStream([e.track]);this.audio=audio;void audio.play().catch(()=>{void this.fail();});};
   pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState) && !this.stopped)void this.fail();};
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   const response=await fetch('/api/voice/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({explicit:true,sdp:offer.sdp})});
   if(!response.ok)throw Error('Codex voice could not start.');
   const {sdp}=await response.json();
   if(this.stopped){await this.stop();return false;}
   await pc.setRemoteDescription({type:'answer',sdp});
   this.notice('Codex voice connected. Ask a question about a business.');return true;
  }catch{if(this.stopped)return false;await this.stop(true);this.notice('Codex voice unavailable. Falling back to browser voice; tap to speak.');return false;}
 }
 /** A dropped call hands control back to browser voice so the next tap still works. */
 private async fail(){if(this.stopped)return;await this.stop(true);this.notice('Codex voice disconnected. Switched to browser voice; tap to speak.');}
 async stop(failed=false){this.stopped=true;this.abort?.(Error('Stopped'));this.abort=undefined;this.ended(failed);this.events?.close();this.events=undefined;
  this.pc?.close();this.pc=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;
  if(this.audio){this.audio.pause();this.audio.srcObject=null;this.audio=undefined;}this.partial={};
  // Always tell the hub: a start that finished after a local stop must not keep running.
  await fetch('/api/voice/stop',{method:'POST',keepalive:true}).catch(()=>{});
 }
}
