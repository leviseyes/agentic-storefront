import {speechChunks} from './speech.ts';
import type {VoiceChoice} from './preferences';

// Keep ElevenLabs' original samples. A WAV container lets the browser's native
// media pipeline play them without an AudioContext or a second voice engine.
export function pcmWave(pcm: ArrayBuffer, sampleRate = 24000, requireSound = true) {
  if (!pcm.byteLength || pcm.byteLength % 2) throw Error('The voice service returned incomplete audio. Please try again.');
  if (requireSound) {
    const samples = new DataView(pcm);
    let peak = 0;
    for (let i = 0; i < pcm.byteLength; i += 2) peak = Math.max(peak, Math.abs(samples.getInt16(i, true)));
    if (!peak) throw Error('The voice service returned silent audio. Please try again.');
  }
  const header = new ArrayBuffer(44), view = new DataView(header);
  const label = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, pcm.byteLength + 36, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], {type: 'audio/wav'});
}

type Options = {
  audio: HTMLAudioElement;
  onState: (state: 'idle' | 'loading' | 'speaking') => void;
  onEnd: () => void;
  onError: (message: string) => void;
  onBlocked: (blocked: boolean) => void;
  fetchAudio?: typeof fetch;
  urls?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  playbackTimeoutMs?: number;
};

export function createMediaSpeechPlayer({audio, onState, onEnd, onError, onBlocked,
  fetchAudio = fetch, urls = URL, playbackTimeoutMs = 12000}: Options) {
  let sequence = 0, unlocked = false, disposed = false;
  let abort: AbortController | undefined, clipUrl: string | undefined;
  let unlockJob: Promise<boolean> | undefined;
  let cancelPlayback: (() => void) | undefined, retryPlayback: (() => Promise<boolean>) | undefined;
  // Safari grants playback per media element. Prime this same element inside
  // the visitor's gesture, before the network await, then reuse it for replies.
  const primer = urls.createObjectURL(pcmWave(new ArrayBuffer(4800), 24000, false));
  audio.preload = 'auto'; audio.muted = false; audio.volume = 1;
  function clearClip() {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (clipUrl) urls.revokeObjectURL(clipUrl);
    clipUrl = undefined;
  }
  function stop() {
    sequence++; abort?.abort(); abort = undefined;
    cancelPlayback?.(); cancelPlayback = undefined; retryPlayback = undefined;
    unlockJob = undefined;
    clearClip(); onState('idle'); onBlocked(false);
  }
  function tryUnlock(timeoutMs = 1000): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (retryPlayback) return retryPlayback();
    if (unlocked) return Promise.resolve(true);
    if (unlockJob) return unlockJob;
    const attempt = sequence;
    audio.src = primer;
    let timer: ReturnType<typeof setTimeout>;
    // Call play synchronously in the click handler, not after a fetch.
    const playing = audio.play();
    const job = Promise.race([
      playing.then(() => true, () => false),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]).then(result => {
      clearTimeout(timer);
      if (attempt !== sequence || disposed) return false;
      audio.pause();
      unlocked = result;
      return result;
    }).finally(() => { if (unlockJob === job) unlockJob = undefined; });
    unlockJob = job;
    return job;
  }
  async function unlock() {
    if (!await tryUnlock()) throw Error('Tap Enable sound to allow audio in your browser.');
  }
  function playClip(blob: Blob, id: number) {
    clearClip(); clipUrl = urls.createObjectURL(blob); audio.src = clipUrl;
    return new Promise<void>((resolve, reject) => {
      let settled = false, lastTime = 0, timer: ReturnType<typeof setTimeout>;
      const current = () => !settled && id === sequence && !disposed;
      const cleanup = () => {
        settled = true; clearTimeout(timer);
        audio.removeEventListener('timeupdate', progress);
        audio.removeEventListener('ended', ended);
        audio.removeEventListener('error', failed);
        cancelPlayback = undefined; retryPlayback = undefined;
      };
      const fail = (message: string) => { if (!current()) return; cleanup(); reject(Error(message)); };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => fail('Audio playback stopped. Please tap the speaker to try again.'), playbackTimeoutMs);
      };
      const progress = () => {
        if (!current() || audio.paused || audio.currentTime <= lastTime) return;
        lastTime = audio.currentTime;
        // Report playback only when the native media clock actually advances.
        onState('speaking'); onBlocked(false); arm();
      };
      const ended = () => { if (!current()) return; cleanup(); resolve(); };
      const failed = () => fail('Your browser couldn’t play this audio. Please tap the speaker to try again.');
      audio.addEventListener('timeupdate', progress);
      audio.addEventListener('ended', ended);
      audio.addEventListener('error', failed);
      cancelPlayback = () => { cleanup(); resolve(); };
      const play = async () => {
        if (!current()) return false;
        arm();
        try {
          await audio.play();
          if (!current()) return false;
          unlocked = true; onBlocked(false); retryPlayback = undefined;
          return true;
        } catch (error) {
          if (!current()) return false;
          clearTimeout(timer);
          if ((error as Error).name === 'NotAllowedError') {
            unlocked = false; retryPlayback = play;
            onState('idle'); onBlocked(true);
          } else failed();
          return false;
        }
      };
      void play();
    });
  }
  async function speak(text: string, voice: VoiceChoice = 'woman') {
    stop();
    if (disposed || !text.trim()) return;
    const id = sequence, controller = new AbortController(); abort = controller;
    const current = () => id === sequence && !disposed;
    onState('loading');
    try {
      for (const chunk of speechChunks(text)) {
        const response = await fetchAudio('/api/speech', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text: chunk, voice, sampleRate: 24000}), signal: controller.signal,
        });
        if (!current()) { await response.body?.cancel(); return; }
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as {error?: string};
          throw Error(data.error || 'The voice service couldn’t respond. Please try again.');
        }
        if (!response.headers.get('content-type')?.startsWith('audio/pcm') || response.headers.get('x-audio-sample-rate') !== '24000') {
          await response.body?.cancel(); throw Error('The voice service returned an incompatible audio format.');
        }
        const pcm = await response.arrayBuffer();
        if (!current()) return;
        await playClip(pcmWave(pcm), id);
        if (!current()) return;
      }
      clearClip(); abort = undefined; onState('idle'); onEnd();
    } catch (error) {
      if (!current()) return;
      stop(); onError(error instanceof Error ? error.message : 'Audio playback failed. Please try again.');
    }
  }
  function dispose() { disposed = true; stop(); urls.revokeObjectURL(primer); }
  return {speak, stop, unlock, tryUnlock, dispose};
}
