import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceInput } from "../client/voice/input.ts";

function fixture(overrides = {}) {
  const events = { states: [], messages: [], transcripts: [], errors: [], recognizers: [], released: 0 };
  const input = createVoiceInput({
    secureContext: true,
    microphoneAllowed: () => true,
    requestMicrophone: async () => ({ getTracks: () => [{ stop: () => events.released++ }] }),
    createRecognition: () => {
      const r = { start() { this.started = true; }, abort() { this.aborted = true; } };
      events.recognizers.push(r);
      return r;
    },
    onState: (state) => events.states.push(state),
    onMessage: (text) => events.messages.push(text),
    onTranscript: (text) => events.transcripts.push(text),
    onError: (issue) => events.errors.push(issue),
    ...overrides,
  });
  return { input, events };
}

test("checks microphone access, releases the stream, and only submits final speech once", async () => {
  const { input, events } = fixture();
  await input.start();
  assert.equal(events.released, 1);
  assert.equal(events.states.at(-1), "checking");
  const r = events.recognizers[0];
  r.onstart();
  assert.equal(events.states.at(-1), "listening");
  r.onresult({ results: [{ 0: { transcript: "hello" }, isFinal: false }] });
  assert.deepEqual(events.messages, []);
  r.onresult({ results: [{ 0: { transcript: "hello world" }, isFinal: true }] });
  const end = r.onend;
  end(); end();
  assert.deepEqual(events.messages, ["hello world"]);
  assert.equal(events.states.at(-1), "idle");
  input.stop();
});

test("automatic browser rejection never claims the user denied permission", async () => {
  const { input, events } = fixture({ requestMicrophone: async () => { throw new DOMException("", "NotAllowedError"); } });
  await input.start();
  assert.equal(events.recognizers.length, 0);
  assert.match(events.errors[0].message, /without you choosing Block/);
  assert.doesNotMatch(JSON.stringify(events.errors), /denied/i);
  assert.equal(events.states.at(-1), "idle");
});

test("separates a blocked speech service from a successful microphone permission check", async () => {
  const { input, events } = fixture();
  await input.start();
  const r = events.recognizers[0];
  const end = r.onend;
  r.onerror({ error: "not-allowed" });
  end();
  assert.match(events.errors[0].message, /microphone check passed/);
  assert.equal(events.errors.length, 1);
  assert.deepEqual(events.messages, []);
  assert.equal(r.aborted, true);
});

test("stopping while permission is pending releases a late stream without listening", async () => {
  let resolve;
  let released = 0;
  const { input, events } = fixture({ requestMicrophone: () => new Promise((r) => { resolve = r; }) });
  const pending = input.start();
  input.stop();
  resolve({ getTracks: () => [{ stop: () => released++ }] });
  await pending;
  assert.equal(released, 1);
  assert.equal(events.recognizers.length, 0);
  assert.equal(events.states.at(-1), "idle");
});

test("a superseded permission rejection cannot stop a newer session", async () => {
  let reject;
  let attempts = 0;
  const { input, events } = fixture({ requestMicrophone: () => ++attempts === 1
    ? new Promise((_, r) => { reject = r; })
    : Promise.resolve({ getTracks: () => [] }) });
  const old = input.start();
  await input.start();
  reject(new DOMException("", "NotAllowedError"));
  await old;
  assert.deepEqual(events.errors, []);
  assert.equal(events.recognizers[0].aborted, undefined);
  input.stop();
});

test("late recognition events cannot send a message after End voice", async () => {
  const { input, events } = fixture();
  await input.start();
  const r = events.recognizers[0];
  const result = r.onresult, end = r.onend, error = r.onerror;
  input.stop();
  result({ results: [{ 0: { transcript: "discard this" }, isFinal: true }] });
  end(); error({ error: "not-allowed" });
  assert.deepEqual(events.messages, []);
  assert.deepEqual(events.transcripts, []);
  assert.deepEqual(events.errors, []);
});

test("policy restrictions and insecure pages do not request the microphone", async () => {
  for (const overrides of [{ microphoneAllowed: () => false }, { secureContext: false }]) {
    let requested = false;
    const { input, events } = fixture({ ...overrides, requestMicrophone: async () => { requested = true; throw Error(); } });
    await input.start();
    assert.equal(requested, false);
    assert.equal(events.errors.length, 1);
    assert.equal(events.errors[0].help, true);
  }
});

test("missing/busy devices and speech network failures have different recovery instructions", async () => {
  for (const [name, title] of [["NotFoundError", "No microphone found"], ["NotReadableError", "Your microphone couldn’t start"]]) {
    const { input, events } = fixture({ requestMicrophone: async () => { throw new DOMException("", name); } });
    await input.start();
    assert.equal(events.errors[0].title, title);
  }
  const { input, events } = fixture();
  await input.start();
  events.recognizers[0].onerror({ error: "network" });
  assert.equal(events.errors[0].title, "The speech service couldn’t connect");
});

test("browsers without getUserMedia can still use their speech API without a false permission claim", async () => {
  const { input, events } = fixture({ requestMicrophone: undefined });
  await input.start();
  events.recognizers[0].onerror({ error: "not-allowed" });
  assert.doesNotMatch(events.errors[0].message, /check passed/);
  assert.match(events.errors[0].message, /without you choosing Block/);
});

test("silence ends the session with an actionable retry and preserves any typed text", async () => {
  const { input, events } = fixture();
  await input.start();
  events.recognizers[0].onend();
  assert.equal(events.errors[0].title, "I didn’t catch any speech");
  assert.equal(events.errors[0].help, false);
  assert.deepEqual(events.transcripts, []);
  assert.deepEqual(events.messages, []);
});
