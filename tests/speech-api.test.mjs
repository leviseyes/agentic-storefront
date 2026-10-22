import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechApi, spokenText } from "../server/speech-api.mjs";

const url = "https://site.test/api/speech";
const request = (text = "Hello there.", headers = {}) => new Request(url, {
  method: "POST", headers: { "origin": "https://site.test", "content-type": "application/json", ...headers }, body: JSON.stringify({ text }),
});
test("streams ElevenLabs v4 audio with fixed server-side voice and secret", async () => {
  let args;
  const api = createSpeechApi({ key: "secret-test", voiceId: "approved-voice", fetchImpl: async (...a) => {
    args = a; return new Response(new Uint8Array([1, 2, 3, 4]));
  } });
  const response = await api(request("**Hello**, [see this](https://store.test)."));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/pcm");
  assert.equal(response.headers.get("x-audio-sample-rate"), "24000");
  assert.match(args[0], /approved-voice\/stream\?output_format=pcm_24000$/);
  const body = JSON.parse(args[1].body);
  assert.equal(body.model_id, "eleven_v4");
  assert.equal(body.text, "[Warm, relaxed conversational tone] Hello, see this.");
  assert.equal(args[1].headers["xi-api-key"], "secret-test");
  assert.doesNotMatch([...response.headers].flat().join(""), /secret-test/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
});
test("speech requires same-origin JSON, configured credentials, and bounded nonempty text", async () => {
  let calls = 0;
  const api = createSpeechApi({ key: "key", voiceId: "voice", fetchImpl: async () => { calls++; throw Error(); } });
  assert.equal((await api(request("Hi", { origin: "https://other.test" }))).status, 403);
  assert.equal((await api(request("Hi", { "content-type": "text/plain" }))).status, 415);
  assert.equal((await api(request(""))).status, 400);
  assert.equal((await api(request("a".repeat(1801)))).status, 400);
  assert.equal((await api(request("a".repeat(13000)))).status, 413);
  assert.equal((await createSpeechApi()(request())).status, 503);
  assert.equal(calls, 0);
});
test("speech input strips arbitrary audio tags and markup while retaining content", () => {
  assert.equal(spokenText("[shouting] **Ready?**\n- A photo\n- A frame"), "Ready?\nA photo\nA frame");
});
test("each visitor's preset selects its own allowed voice without changing other requests", async () => {
  const urls = [];
  const api = createSpeechApi({ key:"key", voiceId:"chris-id", femaleVoiceId:"jessica-id", fetchImpl:async (url) => {
    urls.push(url); return new Response(new Uint8Array([0,0]));
  } });
  const chosen = (voice) => new Request(url, {method:"POST",headers:{origin:"https://site.test","content-type":"application/json"},body:JSON.stringify({text:"Hello",voice})});
  await Promise.all(["woman","man","woman"].map(async (voice) => {
    const r=await api(chosen(voice)); assert.equal(r.status,200); await r.arrayBuffer();
  }));
  assert.deepEqual(urls.map((u)=>u.split("/")[5]),["jessica-id","chris-id","jessica-id"]);
  assert.equal((await api(chosen("arbitrary-provider-id"))).status,400);
  assert.equal((await api(chosen("__proto__"))).status,400);
  assert.equal(urls.length,3);
  const missing = createSpeechApi({ key:"key",voiceId:"chris-id" });
  assert.equal((await missing(chosen("woman"))).status,503);
});
test("provider failures never expose provider body or credentials", async () => {
  const api = createSpeechApi({ key: "secret-test", voiceId: "voice", fetchImpl: async () => new Response("private provider detail secret-test", {status:401}) });
  const response = await api(request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private|secret-test/);
});
test("avatar audio uses true 16 kHz PCM and arbitrary output formats are rejected", async () => {
  let calledUrl;
  const api = createSpeechApi({ key: "key", voiceId: "voice", fetchImpl: async (url) => {
    calledUrl = url; return new Response(new Uint8Array([0, 0]));
  } });
  const make = (sampleRate) => new Request(url, { method: "POST", headers: { origin: "https://site.test", "content-type": "application/json" }, body: JSON.stringify({ text: "Hello", sampleRate }) });
  const response = await api(make(16000));
  assert.equal(response.headers.get("x-audio-sample-rate"), "16000");
  assert.match(calledUrl, /output_format=pcm_16000$/);
  await response.arrayBuffer();
  assert.equal((await api(make(44100))).status, 400);
});
test("voice rate and character limits reject requests before consuming provider credits", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(new Uint8Array([0,0])); };
  const api = createSpeechApi({ key:"key",voiceId:"voice", fetchImpl,limit:1 });
  await (await api(request())).arrayBuffer();
  assert.equal((await api(request())).status,429);
  assert.equal(calls,1);
  const limited = createSpeechApi({ key:"key",voiceId:"voice", fetchImpl,dailyCharacters:3 });
  assert.equal((await limited(request("1234"))).status,429);
  assert.equal(calls,1);
});
test("cancelling playback aborts upstream generation and frees concurrency", async () => {
  const signals = [];
  const api = createSpeechApi({ key:"key",voiceId:"voice", fetchImpl:async (_,args) => {
    signals.push(args.signal);
    return new Response(new ReadableStream({pull(){}}));
  } });
  const response = await api(request());
  await response.body.cancel();
  assert.equal(signals[0].aborted,true);
  for (let i=0;i<4;i++) {
    const next = await api(request());
    assert.equal(next.status,200);
    await next.body.cancel();
  }
});
