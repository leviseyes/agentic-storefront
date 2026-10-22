import test from 'node:test';
import assert from 'node:assert/strict';
import {pcmBase64,decodePcm,createLiveAudio} from '../client/voice/live-audio.ts';
test('microphone PCM converts rates and clips without wrapping or changing sign',()=>{
 const decoded=decodePcm(pcmBase64(new Float32Array([-2,-1,-.5,0,.5,1,2,0]),48000));
 assert.equal(decoded.length,4);assert.equal(decoded[0],-1);assert.equal(decoded[1],-.5);assert.ok(decoded[2]>.499&&decoded[2]<.501);assert.ok(decoded[3]>.999);
 assert.throws(()=>decodePcm(btoa('x')),/Incomplete/);
});
test('streaming output starts each packet on native media without waiting for the full reply; interrupt clears queued audio',async()=>{
 const previous=globalThis.AudioContext,nodes=[];let resumed=0,played=0,drained=0;
 class Context{state='running';currentTime=1;destination={};createGain(){return {gain:{value:1},connect(){},disconnect(){}};}createConstantSource(){return {offset:{value:0},connect(){},start(){},stop(){},disconnect(){}};}resume(){resumed++;return Promise.resolve();}close(){return Promise.resolve();}createMediaStreamDestination(){return {stream:{id:'native-stream',getTracks:()=>[]}};}createBuffer(_,n,rate){return {duration:n/rate,copyToChannel(){}};}createBufferSource(){const node={connect(target){this.target=target;},disconnect(){},start(time){this.started=time;},stop(){this.stopped=true;}};nodes.push(node);return node;}}
 globalThis.AudioContext=Context;
 try{
  const audio={paused:true,play(){this.paused=false;played++;return Promise.resolve();},pause(){},addEventListener(){},removeEventListener(){}};const player=createLiveAudio(audio,()=>{},()=>drained++);
  assert.equal(await player.unlock(),true);assert.equal(resumed,1);assert.equal(played,1);assert.equal(audio.srcObject.id,'native-stream');
  const packet=pcmBase64(new Float32Array(2400),24000);player.push(packet);assert.equal(nodes.length,1);assert.equal(nodes[0].started,1.025);
  player.push(packet);assert.equal(nodes[1].started,1.125);assert.equal(player.pending(),true);player.stop();assert.equal(nodes.every(n=>n.stopped),true);assert.equal(player.pending(),false);assert.equal(drained,0);player.dispose();
 }finally{globalThis.AudioContext=previous;}
});
