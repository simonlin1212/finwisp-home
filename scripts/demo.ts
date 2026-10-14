import { startServer } from '../mcp-server/index.js';
import { teach } from '../orchestrator/index.js';
const app=await startServer({port:0});
try {
  const result=await teach(app.url,process.argv[2] ?? 'COST',process.argv[3] ?? 'net_margin',event=>console.log(JSON.stringify(event)));
  console.log(JSON.stringify(result));
} finally { await app.close(); console.log('Server shut down.'); }
