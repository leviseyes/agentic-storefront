import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createNarration} from '../client/wall/narration.ts';

// Run the browser controller with real PCM playback code and fake browser I/O.
const source=await readFile(new URL('../client/wall/live-voice.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
 .replace('../voice/live-audio',new URL('../client/voice/live-audio.ts',import.meta.url).href);
const {createLiveVoice}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

function browser(t){
 const contexts=[],sockets=[],nodes=[],errors=[],events=[];
 class Context{
  state='running';currentTime=1;
  constructor(){contexts.push(this);}
  audioWorklet={addModule:async()=>{}};
  createMediaStreamSource(){return {connect(){}};}
  createGain(){const gate={gain:{value:1},connect(){},disconnect(){}};this.gate=gate;return gate;}
  createConstantSource(){const source={offset:{value:0},connect(){},start(){},stop(){this.stopped=true;},disconnect(){}};this.keepAlive=source;return source;}
  resume(){return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createMediaStreamDestination(){const track={stopped:false,stop(){this.stopped=true;}};this.track=track;return {stream:{getTracks:()=>[track]}};}
  createBuffer(_,n,rate){return {duration:n/rate,copyToChannel(){}};}
  createBufferSource(){const node={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};nodes.push(node);return node;}
 }
 class Socket{
  static OPEN=1;readyState=1;sent=[];
  constructor(){sockets.push(this);queueMicrotask(()=>this.receive({type:'ready'}));}
  send(data){this.sent.push(JSON.parse(data));}
  receive(event){this.onmessage?.({data:JSON.stringify(event)});}
  begin(id='response-1'){this.responseId=id;this.receive({type:'response-start',responseId:id});}
  audio(id=this.responseId){this.receive({type:'audio',audio:'AAAAAA==',responseId:id});}
  close(){this.readyState=3;this.onclose?.();}
 }
 for(const [key,value] of Object.entries({AudioContext:Context,AudioWorkletNode:class{port={};connect(){return {connect(){}};}disconnect(){}},WebSocket:Socket,location:{protocol:'https:',host:'studio.test'},fetch:async()=>({json:async()=>({enabled:true})})})){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
 }
 const audio={paused:true,srcObject:null,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},addEventListener(){},removeEventListener(){}};
 const voice=createLiveVoice({audio,getVoice:()=> 'woman',onEvent:e=>events.push(e),onState(){},onBlocked(){},onError:e=>errors.push(e)});
 t.after(()=>voice.dispose());
 return {voice,audio,contexts,sockets,nodes,errors,events};
}

for(const completed of [false,true])test(`socket closure releases native audio even when generation ${completed?'finished before playback':'is incomplete'}`,async t=>{
 const h=browser(t);await h.voice.send('Show me how it works');
 const socket=h.sockets[0];socket.begin();socket.audio();
 if(completed)socket.receive({type:'done'});
 assert.equal(h.audio.paused,false);assert.ok(h.audio.srcObject);
 socket.close();
 assert.equal(h.audio.paused,true);assert.equal(h.audio.srcObject,null);
 assert.ok(h.nodes.every(n=>n.stopped));assert.ok(h.contexts.every(c=>c.state==='closed'&&c.track.stopped));
 assert.equal(h.errors.length,completed?0:1);assert.equal(h.events.at(-1).type,'ended');
 socket.audio();assert.equal(h.nodes.length,1,'late packets must not revive failed playback');
 await h.voice.send('How much does it cost?');
 h.sockets[1].begin('response-2');h.sockets[1].audio();
 assert.equal(h.audio.paused,false);assert.ok(h.audio.srcObject);assert.equal(h.contexts.length,2);
});

test('socket errors stop native playback immediately without waiting for a close event',async t=>{
 const h=browser(t);await h.voice.send('Hello');h.sockets[0].begin();h.sockets[0].audio();
 h.sockets[0].onerror();
 assert.equal(h.audio.paused,true);assert.equal(h.audio.srcObject,null);assert.equal(h.errors.length,1);
 assert.equal(h.voice.isEnabled(),false);assert.ok(h.contexts[0].track.stopped);
});

test('mute/stop releases the native route, and a later explicit request can play again',async t=>{
 const h=browser(t);await h.voice.send('Hello');h.sockets[0].begin();h.sockets[0].audio();h.voice.stop();
 assert.equal(h.audio.paused,true);assert.equal(h.audio.srcObject,null);assert.equal(h.errors.length,0);
 await h.voice.send('Show me how it works');h.sockets[1].begin('response-2');h.sockets[1].audio();
 assert.equal(h.audio.paused,false);assert.ok(h.audio.srcObject);
});

test('video owns sound without cancelling tool persistence; late speech is discarded until the next turn',async t=>{
 const h=browser(t);await h.voice.send('Show me how it works');const socket=h.sockets[0];
 socket.begin();socket.audio();assert.equal(h.audio.paused,false);
 h.voice.pauseForMedia();h.voice.cancel();
 assert.equal(h.audio.paused,false);assert.ok(h.audio.srcObject);assert.equal(h.contexts[0].gate.gain.value,0);assert.equal(h.voice.isActive(),false);
 assert.equal(socket.readyState,1);assert.ok(socket.sent.some(e=>e.type==='microphone'&&e.enabled===false));
 assert.equal(socket.sent.some(e=>e.type==='cancel'),false,'the demo must not cancel the in-flight tool result');
 socket.audio();socket.receive({type:'state',state:{messages:[]}});socket.receive({type:'done'});
 assert.equal(h.audio.paused,false);assert.equal(h.contexts[0].gate.gain.value,0);assert.equal(h.nodes.length,1);assert.equal(h.events.at(-1).type,'done');
 assert.ok(h.events.some(e=>e.type==='state'));
 await h.voice.send('Will it work for a tablet?');socket.begin('response-2');socket.audio();
 assert.equal(h.audio.paused,false);assert.equal(h.nodes.length,2);
});


test('video cancels an in-flight microphone permission request without opening capture later',async t=>{
 const h=browser(t);let grant;
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>grant=resolve)}}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;});
 const starting=h.voice.start();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof grant,'function');h.voice.pauseForMedia();
 const track={stopped:false,stop(){this.stopped=true;}};grant({getTracks:()=>[track]});await starting;
 assert.equal(track.stopped,true);assert.equal(h.voice.isActive(),false);assert.equal(h.audio.paused,false);assert.equal(h.contexts[0].gate.gain.value,0);
 assert.equal(h.sockets[0].sent.some(e=>e.type==='microphone'&&e.enabled===true),false);
});

for(const completed of [false,true])test(`Interrupt releases native playback and rejects late packets after ${completed?'generation completed':'an active reply'}`,async t=>{
 const h=browser(t);await h.voice.speak('Welcome to Studio');const socket=h.sockets[0];
 socket.begin('old');socket.audio();if(completed)socket.receive({type:'done'});
 h.voice.interrupt();
 assert.equal(h.audio.paused,true);assert.equal(h.audio.srcObject,null);
 assert.ok(h.nodes.every(n=>n.stopped));assert.ok(h.contexts.every(c=>c.state==='closed'&&c.track.stopped));
 socket.audio();socket.receive({type:'interrupt',reason:'cancel'});socket.receive({type:'done'});
 assert.equal(h.nodes.length,1);assert.equal(h.audio.srcObject,null,'cancelled audio cannot reopen the native route');
 await h.voice.send('What is included?');
 socket.audio('old');assert.equal(h.nodes.length,1,'old packets are still rejected after a new request');
 socket.receive({type:'interrupt',reason:'cancel'}); // Delayed acknowledgement of the previous cancel.
 socket.begin('new');socket.audio('old');assert.equal(h.nodes.length,1);
 socket.audio('new');assert.equal(h.nodes.length,2);assert.equal(h.audio.paused,false);
 assert.equal(h.errors.length,0);
});

test('a cancelled reply cannot restart just because a generic page gesture unlocks audio',async t=>{
 const h=browser(t);await h.voice.speak('Hello');const socket=h.sockets[0];socket.begin('old');socket.audio();
 h.voice.interrupt();await h.voice.tryUnlock();socket.audio();socket.receive({type:'response-start',responseId:'old'});socket.audio();
 assert.equal(h.nodes.length,1);assert.equal(h.errors.length,0);
});


test('Interrupt while listening keeps the microphone available for a new spoken response',async t=>{
 const h=browser(t),track={stopped:false,stop(){this.stopped=true;}};
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;});
 await h.voice.start();const socket=h.sockets[0];socket.begin('old');socket.audio();
 h.voice.interrupt();assert.equal(h.audio.paused,true);assert.equal(h.voice.isActive(),true);assert.equal(track.stopped,false);
 socket.audio('old');assert.equal(h.nodes.length,1);
 socket.receive({type:'interrupt',reason:'speech'});socket.begin('new');socket.audio('new');
 assert.equal(h.nodes.length,2);assert.equal(h.audio.paused,false);assert.equal(h.voice.isActive(),true);
});

for(const socketCloses of [false,true])test(`automatic post-video narration reuses authorized audio without a gesture${socketCloses?' after the socket closes':''}`,async t=>{
 const h=browser(t);await h.voice.send('Show me how it works');const socket=h.sockets[0];
 socket.begin('demo-intro');socket.audio();socket.receive({type:'done'});
 const authorizedContext=h.contexts[0],authorizedStream=h.audio.srcObject;
 // Model Safari denying a newly created route after the original user gesture.
 const resume=authorizedContext.constructor.prototype.resume;
 authorizedContext.constructor.prototype.resume=function(){return this===authorizedContext?resume.call(this):Promise.reject(Error('NotAllowedError'));};
 h.audio.play=function(){if(this.srcObject!==authorizedStream)return Promise.reject(Error('NotAllowedError'));this.paused=false;return Promise.resolve();};
 const blocked=[],errors=[];
 const reader=createNarration({output:{tryUnlock:h.voice.tryUnlock,speak:h.voice.speak,stop:h.voice.cancel},enabled:true,onBlocked:v=>blocked.push(v),onError:e=>errors.push(e)});
 h.voice.pauseForMedia();reader.cancel();
 assert.equal(authorizedContext.gate.gain.value,0);assert.equal(h.nodes.every(n=>n.stopped),true);
 socket.audio();assert.equal(h.nodes.length,1,'late intro audio remains discarded');
 if(socketCloses)socket.close();
 // The player ending triggers this after awaits, with no user click.
 await reader.speak('Would you like to check the fit or add one to your cart?');
 const resumedSocket=h.sockets.at(-1);resumedSocket.begin('follow-up');resumedSocket.audio();
 assert.deepEqual(errors,[]);assert.equal(blocked.includes(true),false);
 assert.equal(h.audio.srcObject,authorizedStream);assert.equal(authorizedContext.state,'running');
 assert.equal(h.contexts.length,1);assert.equal(authorizedContext.gate.gain.value,1);
 assert.equal(h.nodes.length,2);assert.equal(h.audio.paused,false);
 h.voice.stop();assert.equal(h.audio.srcObject,null);assert.equal(authorizedContext.keepAlive.stopped,true);
});
