import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../src/server.js';
import { projectRoot } from './helpers.js';
import { makeFrontendRuntime } from './fixtures/frontend-runtime.js';
const dataDir=await mkdtemp(join(tmpdir(),'novel-template-preview-'));
const fixture=makeFrontendRuntime();
const app=await createAppServer({projectRoot,dataDir,runtimeFactory:fixture.runtimeFactory,logger:{error(){},warn(){}}});
await new Promise(resolve=>app.server.listen(Number(process.env.PREVIEW_PORT ?? 4319),'127.0.0.1',resolve));
console.log('Isolated preview: http://127.0.0.1:'+app.server.address().port+' (temporary save; no AI calls)');
async function close(){app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));await rm(dataDir,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
