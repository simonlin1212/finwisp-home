import { z } from 'zod';
import { readFile, mkdir, rename, writeFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const profileId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).default('family');
const label = z.string().trim().min(1).max(100);
export const eventSchema = z.discriminatedUnion('type', [
 z.object({type:z.literal('concept'),concept:label}),
 z.object({type:z.literal('quiz'),score:z.number().int().min(0).max(3),missedConcepts:z.array(label).max(3)}),
 z.object({type:z.literal('company'),company:label}),
 z.object({type:z.literal('session'),summary:z.string().trim().max(1000)}),
]);
const stored = z.object({conceptsLearned:z.record(z.string(),z.object({count:z.number().int().positive(),lastSeen:z.string()})),quizHistory:z.array(z.object({score:z.number().int().min(0).max(3),missedConcepts:z.array(label).max(3),at:z.string()})).max(100),companiesFollowed:z.array(label).max(100),lastSession:z.string().max(1000)});
export type Profile = z.infer<typeof stored>;
export class ProfileStore {
 private queue: Promise<unknown> = Promise.resolve();
 constructor(private directory = process.env.PROFILE_DIR ?? 'data/profiles') {}
 async get(id='family'): Promise<Profile> {
  const file=join(this.directory,`${profileId.parse(id)}.json`);
  try { if((await stat(file)).size>65536) throw new Error('Profile exceeds size cap'); return stored.parse(JSON.parse(await readFile(file,'utf8'))); }
  catch(e:any) { if(e.code==='ENOENT') return {conceptsLearned:{},quizHistory:[],companiesFollowed:[],lastSession:''}; throw e; }
 }
 reset(id='family'): Promise<Profile> {
  id=profileId.parse(id);const work=this.queue.then(async()=>{await unlink(join(this.directory,`${id}.json`)).catch(e=>{if(e.code!=='ENOENT')throw e;});return this.get(id);});this.queue=work.catch(()=>{});return work;
 }
 update(id: string, input: unknown): Promise<Profile> {
  id=profileId.parse(id); const event=eventSchema.parse(input);
  const work=this.queue.then(async()=>{
   const p=await this.get(id), at=new Date().toISOString();
   if(event.type==='concept') { if(!Object.hasOwn(p.conceptsLearned,event.concept) && Object.keys(p.conceptsLearned).length>=100) throw new Error('Concept cap reached'); Object.defineProperty(p.conceptsLearned,event.concept,{value:{count:(Object.hasOwn(p.conceptsLearned,event.concept)?p.conceptsLearned[event.concept].count:0)+1,lastSeen:at},enumerable:true,configurable:true,writable:true}); }
   if(event.type==='quiz') p.quizHistory=[...p.quizHistory,{score:event.score,missedConcepts:event.missedConcepts,at}].slice(-100);
   if(event.type==='company') p.companiesFollowed=[...new Set([...p.companiesFollowed,event.company])].slice(-100);
   if(event.type==='session') p.lastSession=event.summary;
   const body=JSON.stringify(stored.parse(p)); if(Buffer.byteLength(body)>65536) throw new Error('Profile exceeds size cap');
   await mkdir(this.directory,{recursive:true}); const temp=join(this.directory,`.${id}-${randomUUID()}.tmp`);
   try { await writeFile(temp,body,{mode:0o600,flag:'wx'}); await rename(temp,join(this.directory,`${id}.json`)); } finally {await unlink(temp).catch(()=>{});}
   return p;
  }); this.queue=work.catch(()=>{}); return work;
 }
}
export const profiles=new ProfileStore();
export const memorySchemas={get_learning_profile:z.object({profile_id:profileId}),update_learning_profile:z.object({profile_id:profileId,event:eventSchema})};
export const memoryHandlers={get_learning_profile:async(args:unknown)=>{const a=memorySchemas.get_learning_profile.parse(args);return {profile:await profiles.get(a.profile_id)};},update_learning_profile:async(args:unknown)=>{const a=memorySchemas.update_learning_profile.parse(args);return {profile:await profiles.update(a.profile_id,a.event)};}};
