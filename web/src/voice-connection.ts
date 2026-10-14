/** Initial PCM bridge. No microphone or server process is opened by construction. */
export class VoiceConnection {
 private events?:EventSource;
 private stream?:MediaStream;
 private context?:AudioContext;
 private processor?:ScriptProcessorNode;
 private nextAudio=0;
 private stopped=true;
 private sending=false;
 constructor(private notice:(text:string)=>void,private ended:()=>void){}
 async start(){
  this.stopped=false;
  try {
   const status=await fetch('/api/voice/status').then(r=>r.json());
   if(this.stopped)return false;
   if(!status.available)throw Error('Codex voice is disabled on this hub.');
   this.events=new EventSource('/api/voice/events');
   this.events.onmessage=e=>{
    const event=JSON.parse(e.data),p=event.params ?? {};
    if(event.method==='error'||event.method.endsWith('/error')){this.notice('Codex voice disconnected. Switch to Browser and tap to speak.');void this.stop();return;}
    if(event.method.endsWith('/closed')){void this.stop();return;}
    const transcript=p.text ?? p.delta ?? p.item?.text;
    if(typeof transcript==='string')this.notice(transcript);
    const audio=p.audio;
    if(audio?.data && this.context){
     const bytes=Uint8Array.from(atob(audio.data),(c)=>c.charCodeAt(0));
     const pcm=new DataView(bytes.buffer),count=Math.floor(bytes.length/2);
     const buffer=this.context.createBuffer(1,count,audio.sampleRate ?? 24000),channel=buffer.getChannelData(0);
     for(let i=0;i<count;i++)channel[i]=pcm.getInt16(i*2,true)/32768;
     const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);
     this.nextAudio=Math.max(this.context.currentTime,this.nextAudio);source.start(this.nextAudio);this.nextAudio+=buffer.duration;
    }
   };
   this.events.onerror=()=>{this.notice('Codex voice connection lost. Use Browser voice.');void this.stop();};
   const response=await fetch('/api/voice/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({explicit:true})});
   if(!response.ok)throw Error('Codex voice could not start.');
   if(this.stopped){await this.stop();return false;}
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(this.stopped){stream.getTracks().forEach(t=>t.stop());await this.stop();return false;}
   this.stream=stream;this.context=new AudioContext({sampleRate:24000});await this.context.resume();
   this.processor=this.context.createScriptProcessor(2048,1,1);
   this.context.createMediaStreamSource(stream).connect(this.processor);this.processor.connect(this.context.destination);
   this.processor.onaudioprocess=e=>{
    if(this.sending || this.stopped)return;
    const samples=e.inputBuffer.getChannelData(0),bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);
    samples.forEach((v,i)=>view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,v))*32767),true));
    this.sending=true;
    void fetch('/api/voice/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:{data:btoa(String.fromCharCode(...bytes)),sampleRate:24000,numChannels:1}})})
     .then(r=>{if(!r.ok)throw Error('Voice input failed');}).catch(()=>{this.notice('Codex audio unavailable. Use Browser voice.');void this.stop();}).finally(()=>{this.sending=false;});
   };
   this.notice('Codex voice connected. Ask a question about a business.');return true;
  }catch{await this.stop();this.notice('Codex voice unavailable. Falling back to Web Speech; tap to speak using Browser voice.');return false;}
 }
 async stop(){this.stopped=true;this.ended();this.events?.close();this.events=undefined;this.processor?.disconnect();this.processor=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;await this.context?.close();this.context=undefined;this.nextAudio=0;
  await fetch('/api/voice/stop',{method:'POST',keepalive:true}).catch(()=>{});
 }
}
