import type { SecCache, CacheEntry } from '../mcp-server/sources/sec-edgar.js';
export interface EdgeCache { match(key:string):Promise<Response|undefined>; put(key:string,response:Response):Promise<void> }
// TTL validation belongs to SecEdgar. Cache API expiry also prevents retaining stale data at the edge.
export class WorkerCache implements SecCache {
 private entries = new Map<string,{value:CacheEntry;size:number}>();
 private bytes=0;
 constructor(private edge?:EdgeCache) {}
 private remember(key:string,value:CacheEntry,size:number) {
  const old=this.entries.get(key); if(old) { this.bytes-=old.size; this.entries.delete(key); }
  if(size>20*1024*1024)return;
  this.entries.set(key,{value,size}); this.bytes+=size;
  while(this.entries.size>200 || this.bytes>20*1024*1024) { let first=this.entries.keys().next().value!;
   // Keep the ticker directory parsed for the isolate (until its normal TTL refresh).
   if(first.includes('company_tickers') && this.entries.size>1) { const tickers=this.entries.get(first)!; this.entries.delete(first); this.entries.set(first,tickers); first=this.entries.keys().next().value!; }
   this.bytes-=this.entries.get(first)!.size; this.entries.delete(first); }
 }
 async get(key:string) {
  const hit=this.entries.get(key);
  if(hit) { this.entries.delete(key); this.entries.set(key,hit); return hit.value; }
  try { const response=await this.edge?.match(key); if(response) { const body=await response.text(), value=JSON.parse(body) as CacheEntry; this.remember(key,value,body.length*2); return value; } } catch {}
  return undefined;
 }
 async set(key:string,value:CacheEntry) {
  const body=JSON.stringify(value); this.remember(key,value,body.length*2);
  const ttl=key.includes('company_tickers')?86400:21600;
  try { await this.edge?.put(key,new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${ttl}`}})); } catch { /* cache failures must not fail SEC tools */ }
 }
}
