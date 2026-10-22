import test from 'node:test';
import assert from 'node:assert/strict';
import {createNarration,readSoundEnabled,saveSoundEnabled,welcomeGreeting,returningGreeting} from '../client/voice/narration.ts';

function setup(options={}){
  const events={spoken:[],blocked:[],errors:[],stops:0};
  let reader;
  const output={tryUnlock:async()=>true,speak:async text=>{events.spoken.push(text);reader.didStartSpeaking();},stop:()=>events.stops++,...options.output};
  reader=createNarration({output,onBlocked:b=>events.blocked.push(b),onError:e=>events.errors.push(e),...options,output});
  return {reader,events};
}

test('sound defaults on and an explicit mute survives returning visits without an account',()=>{
  let stored=null;
  const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;}};
  assert.equal(readSoundEnabled(storage),true);
  saveSoundEnabled(false,storage);assert.equal(readSoundEnabled(storage),false);
  saveSoundEnabled(true,storage);assert.equal(readSoundEnabled(storage),true);
  assert.equal(readSoundEnabled({getItem(){throw Error('Private mode');}}),true);
});
test('fresh visitors hear one greeting and every reply without starting their microphone',async()=>{
  const {reader,events}=setup();
  await reader.greet(false);await reader.greet(false);await reader.speak('A warm arrangement.');
  assert.deepEqual(events.spoken,[welcomeGreeting,'A warm arrangement.']);
});
test('returning visitors hear a brief welcome rather than a replay of their conversation',async()=>{
  const {reader,events}=setup();await reader.greet(true);
  assert.deepEqual(events.spoken,[returningGreeting]);
});
test('blocked autoplay retains the greeting until a gesture, then plays it once',async()=>{
  let unlocked=false;
  const {reader,events}=setup({output:{tryUnlock:async()=>unlocked}});
  await reader.greet(false);
  assert.deepEqual(events.spoken,[]);assert.equal(events.blocked.at(-1),true);
  unlocked=true;await reader.activate();await reader.activate();
  assert.deepEqual(events.spoken,[welcomeGreeting]);assert.equal(events.blocked.at(-1),false);
});
test('muting cancels a pending resume and suppresses replies that arrive after mute',async()=>{
  let resolve;
  const {reader,events}=setup({output:{tryUnlock:()=>new Promise(r=>resolve=r)}});
  const greeting=reader.greet(false);reader.setEnabled(false);resolve(true);await greeting;
  await reader.speak('A delayed server reply.');await reader.activate();
  assert.deepEqual(events.spoken,[]);assert.ok(events.stops>=2);assert.equal(events.blocked.at(-1),false);
});
test('a saved mute suppresses the greeting; unmute permits subsequent speech',async()=>{
  const {reader,events}=setup({enabled:false});await reader.greet(false);assert.deepEqual(events.spoken,[]);
  reader.setEnabled(true);await reader.speak('Sound is on.');assert.deepEqual(events.spoken,['Sound is on.']);
});
test('new turns replace the blocked welcome instead of speaking obsolete audio later',async()=>{
  let unlocked=false;const {reader,events}=setup({output:{tryUnlock:async()=>unlocked}});
  await reader.greet(false);reader.cancel();await reader.speak('Your latest answer.');
  unlocked=true;await reader.activate();
  assert.deepEqual(events.spoken,['Your latest answer.']);
});
test('a gesture racing the initial autoplay attempt cannot duplicate the greeting',async()=>{
  const resolves=[];const {reader,events}=setup({output:{tryUnlock:()=>new Promise(r=>resolves.push(r))}});
  const greeting=reader.greet(false),gesture=reader.activate();resolves[1](true);await gesture;resolves[0](true);await greeting;
  assert.deepEqual(events.spoken,[welcomeGreeting]);
});
test('hiding or disposing the page cancels pending playback and ignores late responses',async()=>{
  let resolve;const {reader,events}=setup({output:{tryUnlock:()=>new Promise(r=>resolve=r)}});
  const greeting=reader.greet(false);reader.setVisible(false);resolve(true);await greeting;
  await reader.speak('Hidden reply');reader.setVisible(true);reader.dispose();await reader.speak('Disposed reply');
  assert.deepEqual(events.spoken,[]);
});
test('a page opened in a background tab greets once when first made visible',async()=>{
  const {reader,events}=setup();reader.setVisible(false);await reader.greet(false);
  assert.deepEqual(events.spoken,[]);reader.setVisible(true);await new Promise(r=>setImmediate(r));
  assert.deepEqual(events.spoken,[welcomeGreeting]);reader.setVisible(false);reader.setVisible(true);await reader.greet(false);
  assert.deepEqual(events.spoken,[welcomeGreeting]);
});

test('starting a fresh project re-arms the welcome without reloading the player',async()=>{
  const {reader,events}=setup();await reader.greet(true);reader.resetGreeting();await reader.greet(false);await reader.greet(false);
  assert.deepEqual(events.spoken,[returningGreeting,welcomeGreeting]);
});
test('a blocked welcome survives a tab switch before the visitor hears it',async()=>{
  let unlocked=false;const {reader,events}=setup({output:{tryUnlock:async()=>unlocked}});
  await reader.greet(false);reader.setVisible(false);unlocked=true;reader.setVisible(true);
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(events.spoken,[welcomeGreeting]);
});
test('a welcome loading from the voice service is replayed after returning to the tab',async()=>{
  let resolve,started=0;
  const {reader,events}=setup({output:{speak:()=>{started++;return started===1?new Promise(r=>resolve=r):Promise.resolve();}}});
  const first=reader.greet(false);await new Promise(r=>setImmediate(r));
  reader.setVisible(false);resolve();await first;reader.setVisible(true);await new Promise(r=>setImmediate(r));
  assert.equal(started,2);assert.deepEqual(events.errors,[]);
});
test('a greeting that started playing is not repeated when returning to the tab',async()=>{
  const {reader,events}=setup();await reader.greet(false);reader.setVisible(false);reader.setVisible(true);
  await new Promise(r=>setImmediate(r));assert.deepEqual(events.spoken,[welcomeGreeting]);
});
test('mute and explicit interruptions discard an unheard welcome instead of reviving it on tab focus',async()=>{
  const {reader,events}=setup({output:{tryUnlock:async()=>false}});await reader.greet(false);
  reader.setEnabled(false);reader.setVisible(false);reader.setVisible(true);reader.setEnabled(true);await reader.activate();
  assert.deepEqual(events.spoken,[]);
});
test('fresh-project and manual greeting reset preserve an explicit mute until unmuted',async()=>{
  const {reader,events}=setup({enabled:false});await reader.greet(false);reader.resetGreeting();await reader.greet(false);
  assert.deepEqual(events.spoken,[]);reader.setEnabled(true);reader.resetGreeting();await reader.greet(false);
  assert.deepEqual(events.spoken,[welcomeGreeting]);
});
