import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const skip=new Set(['node_modules','.git','.wrangler','dist','.vinext','.next','work','outputs']);
const failures=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 if(skip.has(entry.name)||entry.isSymbolicLink())continue;
 const file=path.join(dir,entry.name),relative=path.relative(root,file);
 if(entry.isDirectory()){await walk(file);continue;}
 if((/^\.env/.test(entry.name)&&entry.name!=='.env.example')||/^\.dev\.vars/.test(entry.name))failures.push(relative+' (local environment file)');
 if(/\.(stp|step|pem|key)$/i.test(entry.name))failures.push(relative+' (restricted asset/key type; review provenance)');
 if(/\.(png|jpg|jpeg|webp|woff2?)$/i.test(entry.name))continue;
 const text=await readFile(file,'utf8');
 for(const [label,pattern] of Object.entries({credential:/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|xai-[A-Za-z0-9_-]{24,}|shpat_[a-f0-9]{20,}|gh[pousr]_[A-Za-z0-9]{24,})\b/,privateKey:/-----BEGIN [A-Z ]*PRIVATE KEY-----/,localPath:/\/(?:Users|home)\/[A-Za-z0-9_-]+\//,deploymentId:/appgprj_[a-zA-Z0-9]+/}))if(pattern.test(text))failures.push(relative+' ('+label+')');
}}
await walk(root);
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
for(const [name,pkg]of Object.entries(lock.packages||{}))if(pkg.link||name&&(!name.startsWith('node_modules/')||pkg.resolved&&!pkg.resolved.startsWith('https://registry.npmjs.org/')))failures.push('package-lock.json (non-registry dependency: '+name+')');
if(failures.length){console.error('Public-source audit failed:\n'+failures.join('\n'));process.exitCode=1;}else console.log('Public-source audit passed: no matching credentials, local paths, deployment IDs or restricted asset types. Review is still required before publication.');
