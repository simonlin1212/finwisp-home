import { readFile, mkdir, rename, writeFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProfileStorage } from './memory.js';
export class FileProfileStorage implements ProfileStorage {
 constructor(private directory:string) {}
 async get(id:string) { const file=join(this.directory,`${id}.json`); try { if((await stat(file)).size>65536) throw new Error('Profile exceeds size cap'); return await readFile(file,'utf8'); } catch(e:any) { if(e.code==='ENOENT')return undefined; throw e; } }
 async delete(id:string) { await unlink(join(this.directory,`${id}.json`)).catch(e=>{if(e.code!=='ENOENT')throw e;}); }
 async set(id:string,body:string) { await mkdir(this.directory,{recursive:true}); const temp=join(this.directory,`.${id}-${randomUUID()}.tmp`); try { await writeFile(temp,body,{mode:0o600,flag:'wx'}); await rename(temp,join(this.directory,`${id}.json`)); } finally { await unlink(temp).catch(()=>{}); } }
}
