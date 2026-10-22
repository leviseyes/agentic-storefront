import test from 'node:test';
import assert from 'node:assert/strict';
import {createMediaSpeechPlayer, pcmWave} from '../client/voice/media-speech.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const pcm = () => new Int16Array([0, 1234, -2345, 0]).buffer;
const response = () => new Response(pcm(), {headers: {'content-type': 'audio/pcm', 'x-audio-sample-rate': '24000'}});
class Audio extends EventTarget {
  paused = true; currentTime = 0; src = ''; calls = 0; muted = true; volume = 0;
  playImpl = async () => {};
  async play() { this.calls++; await this.playImpl(); this.paused = false; }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ''; }
  load() { this.currentTime = 0; }
  advance(time) { this.currentTime = time; this.dispatchEvent(new Event('timeupdate')); }
  end() { this.paused = true; this.dispatchEvent(new Event('ended')); }
}
function setup(options = {}) {
  const audio = new Audio(), events = {states: [], errors: [], blocked: [], ends: 0, requests: [], revoked: []};
  const blobs = [];
  const player = createMediaSpeechPlayer({audio, onState: s => events.states.push(s), onEnd: () => events.ends++,
    onError: e => events.errors.push(e), onBlocked: b => events.blocked.push(b),
    urls: {createObjectURL: blob => {blobs.push(blob); return `blob:${blobs.length}`;}, revokeObjectURL: url => events.revoked.push(url)},
    fetchAudio: async (_url, args) => {events.requests.push(JSON.parse(args.body)); return response();}, ...options});
  return {player, audio, events, blobs};
}

test('native WAV preserves ElevenLabs samples and the correct 24 kHz format', async () => {
  const bytes = await pcmWave(pcm()).arrayBuffer(), view = new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual(new Uint8Array(bytes.slice(44)), new Uint8Array(pcm()));
  assert.throws(() => pcmWave(new ArrayBuffer(10)), /silent audio/);
  assert.throws(() => pcmWave(new ArrayBuffer(3)), /incomplete audio/);
});
test('speaking requires an advancing native playback clock, and completion waits for ended', async () => {
  const {player, audio, events} = setup();
  await player.unlock();
  assert.equal(audio.muted, false); assert.equal(audio.volume, 1);
  const speaking = player.speak('Hello', 'woman'); await tick();
  assert.equal(events.states.at(-1), 'loading', 'play() resolving alone must not claim speech');
  assert.equal(events.ends, 0);
  audio.advance(.25); assert.equal(events.states.at(-1), 'speaking');
  audio.end(); await speaking;
  assert.equal(events.ends, 1); assert.equal(events.requests[0].voice, 'woman');
  assert.equal(events.states.at(-1), 'idle'); player.dispose();
});
test('a media clock that never starts produces a recoverable error instead of pretending to speak', async () => {
  const {player, events} = setup({playbackTimeoutMs: 10});
  await player.speak('Hello');
  assert.ok(!events.states.includes('speaking')); assert.match(events.errors[0], /playback stopped/);
  assert.equal(events.ends, 0); player.dispose();
});
test('a blocked native clip is retained and one gesture retries it without regenerating speech', async () => {
  const {player, audio, events} = setup();
  audio.playImpl = async () => {throw new DOMException('Gesture required', 'NotAllowedError');};
  const speaking = player.speak('Hello'); await tick();
  assert.equal(events.blocked.at(-1), true); assert.deepEqual(events.errors, []);
  const src = audio.src;
  audio.playImpl = async () => {};
  assert.equal(await player.tryUnlock(), true); assert.equal(audio.src, src);
  audio.advance(.5); audio.end(); await speaking;
  assert.equal(events.requests.length, 1); assert.equal(events.ends, 1); player.dispose();
});
test('mute cancels blocked clips, revokes audio, and cannot play them on a later gesture', async () => {
  const {player, audio, events} = setup();
  audio.playImpl = async () => {throw new DOMException('Gesture required', 'NotAllowedError');};
  const speaking = player.speak('Hello'); await tick(); const src = audio.src;
  player.stop(); await speaking;
  audio.playImpl = async () => {}; await player.tryUnlock();
  assert.ok(events.revoked.includes(src)); assert.notEqual(audio.src, src);
  assert.equal(events.ends, 0); assert.equal(events.requests.length, 1); player.dispose();
});
test('interrupt aborts generation and late responses never reach the native player', async () => {
  let finish, signal;
  const {player, audio, events} = setup({fetchAudio: async (_url, args) => {signal = args.signal; return new Promise(r => finish = r);}});
  const speaking = player.speak('Hello'); player.stop(); finish(response()); await speaking;
  assert.equal(signal.aborted, true); assert.equal(audio.calls, 0); assert.equal(events.ends, 0);
  assert.deepEqual(events.errors, []); player.dispose();
});
test('native decode errors and provider silence are visible failures, with no synthetic voice fallback', async () => {
  const {player, audio, events} = setup();
  const speaking = player.speak('Hello'); await tick(); audio.dispatchEvent(new Event('error')); await speaking;
  assert.match(events.errors[0], /couldn’t play/); assert.equal(events.ends, 0); player.dispose();
  const silent = setup({fetchAudio: async () => new Response(new ArrayBuffer(100), {headers: {'content-type': 'audio/pcm', 'x-audio-sample-rate': '24000'}})});
  await silent.player.speak('Hello'); assert.match(silent.events.errors[0], /silent audio/);
  assert.equal(silent.audio.calls, 0); silent.player.dispose();
});
test('long replies play in order on the same native audio element with the selected voice', async () => {
  const {player, audio, events} = setup();
  const speaking = player.speak('A longer reply. '.repeat(150), 'man'); await tick();
  assert.equal(events.requests.length, 1); audio.advance(.4); audio.end(); await tick();
  assert.equal(events.requests.length, 2); audio.advance(.4); audio.end(); await speaking;
  assert.ok(events.requests.every(r => r.voice === 'man'));
  assert.equal(events.ends, 1); assert.equal(audio.calls, 2); player.dispose();
});
test('a pending unlock is bounded and a later stop cannot revive speech', async () => {
  const {player, audio, events} = setup();
  audio.playImpl = () => new Promise(() => {});
  assert.equal(await player.tryUnlock(5), false);
  player.stop(); assert.equal(audio.src, ''); assert.equal(events.requests.length, 0); player.dispose();
});
