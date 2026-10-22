import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bin=p=>fileURLToPath(new URL('../node_modules/'+p,import.meta.url));
const migration=spawnSync(process.execPath,[bin('wrangler/bin/wrangler.js'),'d1','migrations','apply','agentic-storefront','--local'],{stdio:'inherit'});
if(migration.status!==0)process.exit(migration.status||1);
const child=spawn(process.execPath,[bin('vite/bin/vite.js'),'--port','3000',...process.argv.slice(2)],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
