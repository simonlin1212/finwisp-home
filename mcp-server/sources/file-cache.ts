import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SecCache, CacheEntry } from './sec-edgar.js';
export class FileCache implements SecCache {
 constructor(private directory: string) {}
 private file(key: string) { return join(this.directory, createHash('sha256').update(key).digest('hex')+'.json'); }
 async get(key: string) { try { return JSON.parse(await readFile(this.file(key),'utf8')) as CacheEntry; } catch { return undefined; } }
 async set(key: string, value: CacheEntry) { await mkdir(this.directory,{recursive:true}); const file=this.file(key), temp=file+'.'+randomUUID(); await writeFile(temp,JSON.stringify(value)); await rename(temp,file); }
}
