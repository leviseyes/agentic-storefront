import {guideIntroduction,guideCapabilities} from '../shared/guide.js';
const soundKey = 'agentic-assistant-sound-v1';
export const welcomeGreeting = `${guideIntroduction} ${guideCapabilities} Want to see how the hanger works first?`;
export const returningGreeting = 'Welcome back. You can ask me questions, watch the demo, explore the hanger in 3D, preview your wall, or ask me to change your cart. What would you like to do next?';

export function readSoundEnabled(storage?: Pick<Storage, 'getItem'>) {
  try { return (storage ?? localStorage).getItem(soundKey) !== 'muted'; }
  catch { return true; }
}
export function saveSoundEnabled(enabled: boolean, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? localStorage).setItem(soundKey, enabled ? 'on' : 'muted'); } catch {}
}

type Output = {tryUnlock: () => Promise<boolean>; speak: (text: string) => Promise<void>; stop: () => void};

// Own the pending utterance, so mute, navigation and a newer turn can cancel
// even an autoplay attempt whose AudioContext.resume() has not resolved yet.
export function createNarration({output, enabled = true, onBlocked, onError}: {
  output: Output; enabled?: boolean; onBlocked: (blocked: boolean) => void; onError: (message: string) => void;
}) {
  let pending = '', revision = 0, greeted = false, visible = true, disposed = false;
  let waitingGreeting: boolean | null = null;
  let queuedGreeting: boolean | null = null;
  const allowed = () => enabled && visible && !disposed;
  function cancel() { revision++; pending = ''; queuedGreeting = null; waitingGreeting = null; output.stop(); onBlocked(false); }
  async function activate() {
    if (!allowed()) return;
    const attempt = ++revision;
    try {
      const unlocked = await output.tryUnlock();
      if (attempt !== revision || !allowed()) return;
      onBlocked(!unlocked);
      if (!unlocked || !pending) return;
      const text = pending; pending = '';
      await output.speak(text);
    } catch (error) {
      if (attempt === revision && allowed()) { pending = ''; onError((error as Error).message); }
    }
  }
  function speak(text: string) {
    cancel();
    if (!allowed() || !text.trim()) return Promise.resolve();
    pending = text;
    return activate();
  }
  function greet(returning: boolean) {
    if (greeted || disposed) return Promise.resolve();
    if (!visible) { waitingGreeting = returning; return Promise.resolve(); }
    greeted = true;
    const result = speak(returning ? returningGreeting : welcomeGreeting);
    if (enabled) queuedGreeting = returning;
    return result;
  }
  // Scheduling the welcome is not proof that it played. Retain it through a
  // blocked resume or an in-flight voice request until the player starts audio.
  function didStartSpeaking() { queuedGreeting = null; }
  function resetGreeting() { cancel(); greeted = false; }
  function setEnabled(value: boolean) { enabled = value; if (!value) cancel(); }
  function setVisible(value: boolean) {
    visible = value;
    if (!value) {
      const unheardGreeting = queuedGreeting ?? waitingGreeting;
      cancel();
      waitingGreeting = unheardGreeting;
    }
    else if (waitingGreeting !== null) {
      const returning = waitingGreeting; waitingGreeting = null; greeted = false; void greet(returning);
    }
  }
  function dispose() { disposed = true; cancel(); }
  return {speak, greet, activate, cancel, didStartSpeaking, resetGreeting, setEnabled, setVisible, dispose};
}
