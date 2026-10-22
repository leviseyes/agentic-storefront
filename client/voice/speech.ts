import type { VoiceChoice } from "./preferences";

export function speechChunks(text: string, limit = 1700) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const head = remaining.slice(0, limit);
    const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "), head.lastIndexOf("\n"));
    const space = head.lastIndexOf(" ");
    const split = sentence > limit / 3 ? sentence + 1 : space > 0 ? space : limit;
    chunks.push(remaining.slice(0, split).trim());
    remaining = remaining.slice(split).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// Fetch chunks are not aligned to 16-bit PCM samples. Buffer small/odd chunks
// before scheduling audio, so arbitrary network boundaries cannot corrupt it.
export function pcmDecoder() {
  let pending = new Uint8Array(0);
  return (chunk: Uint8Array, flush = false) => {
    const bytes = new Uint8Array(pending.length + chunk.length);
    bytes.set(pending); bytes.set(chunk, pending.length);
    pending = bytes;
    if (!flush && bytes.length < 4800) return null;
    if (flush && bytes.length % 2) throw Error("Incomplete audio sample");
    const length = bytes.length - bytes.length % 2;
    if (!length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, length);
    const samples = new Float32Array(length / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    pending = bytes.slice(length);
    return samples;
  };
}

export type SpeechOutput = {
  sampleRate: 16000;
  write: (samples: Float32Array) => void;
  finish: () => Promise<void>;
  stop: () => void;
};
type Options = {
  onState: (state: "idle" | "loading" | "speaking") => void;
  onEnd: () => void;
  onError: (message: string) => void;
  contextFactory?: () => AudioContext;
  fetchAudio?: typeof fetch;
  getOutput?: (voice: VoiceChoice, signal: AbortSignal, onSpeaking: () => void) => Promise<SpeechOutput | null>;
};
export function createSpeechPlayer({ onState, onEnd, onError, contextFactory = () => new AudioContext(), fetchAudio = fetch, getOutput }: Options) {
  let context: AudioContext | undefined;
  let sequence = 0;
  let abort: AbortController | undefined;
  let sources = new Set<AudioBufferSourceNode>();
  let externalOutput: SpeechOutput | null = null;
  function stop() {
    sequence++;
    abort?.abort();
    abort = undefined;
    externalOutput?.stop();
    externalOutput = null;
    for (const source of sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    sources.clear();
    onState("idle");
  }
  async function tryUnlock(timeoutMs = 600) {
    context ??= contextFactory();
    const isRunning = () => context?.state === "running";
    if (isRunning()) return true;
    // A browser-blocked resume() can stay pending until the next gesture.
    // Bound this attempt so the UI can offer sound without hanging or fetching audio.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.resume(),
        new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); }),
      ]);
      return isRunning();
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  async function unlock() {
    if (!await tryUnlock()) throw Error("Tap Enable sound to allow audio in your browser.");
  }
  async function speak(text: string, voice: VoiceChoice = "man") {
    stop();
    if (!text.trim()) return;
    const id = sequence;
    const controller = new AbortController();
    abort = controller;
    onState("loading");
    let complete = false, heard = false, nextAt = 0;
    const current = () => sequence === id;
    const finish = () => {
      if (current() && complete && sources.size === 0) { onState("idle"); onEnd(); }
    };
    try {
      await unlock();
      if (!current()) return;
      const target = await getOutput?.(voice, controller.signal, () => {
        if (current()) onState("speaking");
      }) ?? null;
      if (!current()) { target?.stop(); return; }
      externalOutput = target;
      const sampleRate = target?.sampleRate ?? 24000;
      const audio = context!;
      const schedule = (samples: Float32Array | null) => {
        if (!samples?.length || !current()) return;
        if (target) { target.write(samples); heard = true; return; }
        const buffer = audio.createBuffer(1, samples.length, sampleRate);
        buffer.getChannelData(0).set(samples);
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        sources.add(source);
        source.onended = () => { source.disconnect(); sources.delete(source); finish(); };
        const at = Math.max(audio.currentTime + 0.08, nextAt);
        source.start(at);
        nextAt = at + buffer.duration;
        if (!heard) { heard = true; onState("speaking"); }
      };
      for (const chunk of speechChunks(text)) {
        if (!current()) return;
        const response = await fetchAudio("/api/speech", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, voice, sampleRate }), signal: controller.signal,
        });
        if (!current()) { await response.body?.cancel(); return; }
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw Error(typeof data.error === "string" ? data.error : "The voice service couldn’t respond. Please try again.");
        }
        if (!response.body || !response.headers.get("content-type")?.startsWith("audio/pcm")) throw Error("The voice service returned unreadable audio.");
        const returnedRate = response.headers.get("x-audio-sample-rate");
        if (returnedRate && Number(returnedRate) !== sampleRate) { await response.body.cancel(); throw Error("The voice service returned an incompatible audio format."); }
        const reader = response.body.getReader();
        const decode = pcmDecoder();
        try {
          while (current()) {
            const { done, value } = await reader.read();
            if (!current()) break;
            if (done) { schedule(decode(new Uint8Array(0), true)); break; }
            schedule(decode(value));
          }
        } finally {
          if (!current()) await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      if (!current()) return;
      if (!heard) throw Error("The voice service returned no audio. Please try again.");
      if (target) await target.finish();
      if (!current()) return;
      complete = true;
      finish();
    } catch (error) {
      if (!current()) return;
      stop();
      onError(error instanceof Error ? error.message : "Audio playback failed. Please try again.");
    }
  }
  function dispose() { stop(); void context?.close().catch(() => {}); }
  return { unlock, tryUnlock, speak, stop, dispose };
}
