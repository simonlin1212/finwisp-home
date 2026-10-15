import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
await build({entryPoints:['worker/index.ts'],outfile:'dist-worker/worker.mjs',bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],minify:true});
const bundle=await readFile('dist-worker/worker.mjs','utf8');
if(/node:fs|node:path|new\s+Function\s*\(|\beval\s*\(/.test(bundle))throw new Error('Worker bundle contains filesystem or dynamic code evaluation');
console.log(`Worker bundle verified (${bundle.length} bytes)`);
