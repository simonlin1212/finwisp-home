import { startHub } from '../host/index.js';
const app=await startHub({port:0});
try {
 const response=await fetch(app.url);
 if(!response.ok || !(await response.text()).includes('Finwisp Home'))throw Error('UI serving failed');
 const profile=await fetch(app.url+'/api/profile');
 if(!profile.ok || !(await profile.json() as any).profile)throw Error('MCP profile failed');
 console.log('Built Hub + official HTTP MCP profile: OK');
} finally {await app.close();console.log('Hub shut down.');}
