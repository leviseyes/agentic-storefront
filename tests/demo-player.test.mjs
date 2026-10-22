import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDemoPlayer} from '../client/wall/demo-player.ts';

function environment(t){
 for(const [key,value] of Object.entries({document:{createElement:()=>({})},location:{origin:'https://studio.test'}})){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{value,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
 }
 const instances=[],statuses=[],host={children:[],replaceChildren(...children){this.children=children;}};
 let ended=0;
 class Player{
  plays=0;unmutes=0;mutes=0;destroyed=false;
  constructor(element,options){this.element=element;this.options=options;instances.push(this);}
  playVideo(){this.plays++;}unMute(){this.unmutes++;}mute(){this.mutes++;}destroy(){this.destroyed=true;}
  event(name,data){this.options.events[name]({target:this,data});}
 }
 return {instances,statuses,host,api:{Player},callbacks:{onStatus:s=>statuses.push(s),onEnded:()=>ended++},ended:()=>ended};
}

test('demo autoplays with sound; only completion closes it; teardown releases the iframe',async t=>{
 const h=environment(t),video=mountDemoPlayer(h.host,h.callbacks,async()=>h.api);t.after(()=>video.destroy());
 await Promise.resolve();const p=h.instances[0];
 assert.match(p.element.allow,/autoplay/);assert.match(p.element.src,/enablejsapi=1/);
 p.event('onReady');assert.equal(p.plays,1);assert.equal(p.unmutes,1);
 for(const state of [1,2,3])p.event('onStateChange',state);
 assert.equal(h.ended(),0);
 p.event('onStateChange',0);p.event('onStateChange',0);assert.equal(h.ended(),1);
 video.destroy();assert.equal(p.destroyed,true);assert.equal(h.host.children.length,0);
 p.event('onStateChange',0);assert.equal(h.ended(),1);
});
test('blocked autoplay offers an explicit play retry and player errors are recoverable',async t=>{
 const h=environment(t),video=mountDemoPlayer(h.host,h.callbacks,async()=>h.api);t.after(()=>video.destroy());
 await Promise.resolve();const p=h.instances[0];p.event('onReady');p.event('onAutoplayBlocked');
 assert.equal(h.statuses.at(-1),'blocked');video.play();assert.equal(p.plays,2);
 p.event('onStateChange',1);assert.equal(h.statuses.at(-1),'playing');
 p.event('onError',150);assert.equal(h.statuses.at(-1),'error');assert.equal(h.ended(),0);
});
test('closing during load cannot create a late playing iframe, and replay starts fresh',async t=>{
 const h=environment(t);let resolve;
 const video=mountDemoPlayer(h.host,h.callbacks,()=>new Promise(r=>resolve=r));
 video.destroy();resolve(h.api);await Promise.resolve();assert.equal(h.instances.length,0);
 const replay=mountDemoPlayer(h.host,h.callbacks,async()=>h.api);t.after(()=>replay.destroy());
 await Promise.resolve();assert.equal(h.instances.length,1);h.instances[0].event('onReady');assert.equal(h.instances[0].plays,1);
});
test('a failed player-script request surfaces a usable error state',async t=>{
 const h=environment(t),video=mountDemoPlayer(h.host,h.callbacks,async()=>{throw Error('offline');});t.after(()=>video.destroy());
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.statuses.at(-1),'error');assert.equal(h.ended(),0);
});


test('the no-sound choice also keeps the demonstration and play retries muted',async t=>{
 const h=environment(t),video=mountDemoPlayer(h.host,{...h.callbacks,muted:true},async()=>h.api);t.after(()=>video.destroy());
 await Promise.resolve();const p=h.instances[0];p.event('onReady');
 assert.equal(p.unmutes,0);assert.equal(p.mutes,1);assert.match(p.element.src,/mute=1/);
 video.play();assert.equal(p.mutes,2);assert.equal(p.unmutes,0);
});
