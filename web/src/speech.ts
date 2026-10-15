export const MISSED='I didn’t catch that. Tap to speak again, or type your question.';
/** One browser recognition turn. Ending without usable words always leaves a message, never silence. */
export function listenOnce(r:any,on:{text:(value:string)=>void;message:(value:string)=>void;listening:(value:boolean)=>void}){
 let heard=false,failed=false;
 r.lang='en-US';r.interimResults=false;
 r.onstart=()=>on.listening(true);
 r.onend=()=>{on.listening(false);if(!heard && !failed)on.message(MISSED);};
 r.onerror=(e:any)=>{failed=true;on.listening(false);on.message(e.error==='no-speech'?MISSED:'Microphone input was unavailable. You can always type your question.');};
 r.onresult=(e:any)=>{const value=e.results[0]?.[0]?.transcript?.trim();if(!value)return;heard=true;on.text(value);};
 r.start();
}
/** Spoken and shown after a lesson loads: the everyday company name, one closing period. */
export const lessonSummary=(data:any):string=>data.text ?? `Let’s explore ${(data.company.name ?? data.company.title).replace(/\.+$/,'')}.`;
