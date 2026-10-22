import test from "node:test";
import assert from "node:assert/strict";
import { speechChunks, pcmDecoder, createSpeechPlayer } from "../client/voice/speech.ts";

test("long speech splits at sentence boundaries without dropping words", () => {
  const original = "This is a full sentence. ".repeat(220).trim();
  const chunks = speechChunks(original);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 1700));
  assert.equal(chunks.join(" "),original);
});
test("PCM decoding preserves samples across odd network boundaries and rejects truncation", () => {
  const decode=pcmDecoder();
  assert.equal(decode(new Uint8Array([0,128,255])),null);
  const samples=decode(new Uint8Array([127,0,0]),true);
  assert.deepEqual([...samples],[-1,32767/32768,0]);
  assert.throws(()=>pcmDecoder()(new Uint8Array([1]),true),/Incomplete/);
});
function setup(fetchAudio, options = {}) {
  const events={states:[],errors:[],ends:0,sources:[]};
  const context={state:"suspended",currentTime:0,destination:{},
    resume:async()=>{context.state="running";}, close:async()=>{},
    createBuffer:(_,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)}),
    createBufferSource:()=>{
      const source={connect(){},disconnect(){},start(at){this.started=at;},stop(){this.stopped=true;}};
      events.sources.push(source);return source;
    }};
  const player=createSpeechPlayer({fetchAudio,contextFactory:()=>context,onState:(state)=>events.states.push(state),onEnd:()=>events.ends++,onError:(e)=>events.errors.push(e), ...options});
  return {player,events,context};
}
const response = () => new Response(new Uint8Array(4800),{headers:{"content-type":"audio/pcm"}});
test("speech streams into scheduled audio and only ends after playback finishes", async () => {
  const {player,events,context}=setup(async()=>response());
  await player.unlock();
  assert.equal(context.state,"running");
  await player.speak("Hello");
  assert.equal(events.states.at(-1),"speaking");
  assert.equal(events.ends,0);
  events.sources[0].onended();
  assert.equal(events.ends,1);
  assert.equal(events.states.at(-1),"idle");
});
test("stop aborts outstanding fetch and rejects stale audio without restarting microphone", async () => {
  let resolve,signal;
  const {player,events}=setup(async(_,args)=>{signal=args.signal;return new Promise((r)=>resolve=r);});
  const pending=player.speak("Hello");
  await new Promise((r)=>setImmediate(r));
  player.stop();
  resolve(response());
  await pending;
  assert.equal(signal.aborted,true);
  assert.equal(events.sources.length,0);
  assert.equal(events.ends,0);
  assert.deepEqual(events.errors,[]);
});
test("interrupt stops already buffered audio and cannot fire completion", async () => {
  const {player,events}=setup(async()=>response());
  await player.speak("Hello");
  const source=events.sources[0];
  player.stop();
  assert.equal(source.stopped,true);
  assert.equal(source.onended,null);
  assert.equal(events.ends,0);
});
test("service errors are actionable with no fallback to the browser voice", async () => {
  const {player,events}=setup(async()=>new Response(JSON.stringify({error:"Voice is busy."}),{status:429}));
  await player.speak("Hello");
  assert.deepEqual(events.errors,["Voice is busy."]);
  assert.equal(events.sources.length,0);
  assert.equal(events.ends,0);
});
test("all chunks use the chosen voice and a later reply can switch voices", async () => {
  const requests=[];
  const {player}=setup(async(_,args)=>{requests.push(JSON.parse(args.body));return response();});
  await player.speak("A longer reply. ".repeat(150),"woman");
  assert.ok(requests.length>1);
  assert.ok(requests.every(r=>r.voice==="woman"));
  await player.speak("Hello again", "man");
  assert.equal(requests.at(-1).voice,"man");
});
test("avatar output receives 16 kHz audio exclusively and completion waits for its playback", async () => {
  let complete, began, body;
  const samples = [];
  const target = { sampleRate: 16000, write: (s) => samples.push(s), stop() {}, finish: () => new Promise((r) => complete = r) };
  const { player, events } = setup(async (_, args) => {
    body = JSON.parse(args.body);
    return new Response(new Uint8Array(4800), { headers: { "content-type": "audio/pcm", "x-audio-sample-rate": "16000" } });
  }, { getOutput: async (_voice, _signal, onSpeaking) => { began = onSpeaking; return target; } });
  const pending = player.speak("Hello", "woman");
  await new Promise((r) => setImmediate(r));
  assert.equal(body.sampleRate, 16000);
  assert.equal(body.voice, "woman");
  assert.equal(samples[0].length, 2400);
  assert.equal(events.sources.length, 0, "source voice must not play over the avatar");
  assert.equal(events.ends, 0);
  began();
  assert.equal(events.states.at(-1), "speaking");
  complete();
  await pending;
  assert.equal(events.ends, 1);
});
test("interrupt during avatar connection discards the stale output without fetching speech", async () => {
  let connected, calls = 0, stopped = 0;
  const { player, events } = setup(async () => { calls++; return response(); }, {
    getOutput: async () => new Promise((r) => connected = r),
  });
  const pending = player.speak("Hello");
  await new Promise((r) => setImmediate(r));
  player.stop();
  connected({ sampleRate: 16000, write() {}, finish: async () => {}, stop() { stopped++; } });
  await pending;
  assert.equal(calls, 0);
  assert.equal(stopped, 1);
  assert.equal(events.ends, 0);
});
test("unavailable avatar falls back to the existing ElevenLabs output", async () => {
  const { player, events } = setup(async () => response(), { getOutput: async () => null });
  await player.speak("Hello");
  assert.equal(events.sources.length, 1);
  assert.deepEqual(events.errors, []);
});

test('blocked resume is bounded and can be retried on a later gesture without fetching audio',async()=>{
  let calls=0;
  const {player,context}=setup(async()=>{calls++;return response();});
  context.resume=()=>new Promise(()=>{});
  assert.equal(await player.tryUnlock(5),false);
  assert.equal(calls,0);
  context.resume=async()=>{context.state='running';};
  assert.equal(await player.tryUnlock(5),true);
  player.dispose();
});
test('mute while resume is pending prevents late audio requests and playback',async()=>{
  let resume,calls=0;
  const {player,context,events}=setup(async()=>{calls++;return response();});
  context.resume=()=>new Promise(r=>{resume=()=>{context.state='running';r();};});
  const speaking=player.speak('Hello');player.stop();resume();await speaking;
  assert.equal(calls,0);assert.deepEqual(events.sources,[]);assert.deepEqual(events.errors,[]);
});
