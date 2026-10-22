export type VoiceIssue = { title: string; message: string; help: boolean; retry?: "speech" };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type InputOptions = {
  createRecognition: () => Recognition | null;
  requestMicrophone?: () => Promise<{ getTracks: () => { stop: () => void }[] }>;
  secureContext: boolean;
  microphoneAllowed: () => boolean;
  onState: (state: "checking" | "listening" | "idle") => void;
  onTranscript: (text: string) => void;
  onMessage: (text: string) => void;
  onError: (issue: VoiceIssue) => void;
};

const blocked: VoiceIssue = {
  title: "Microphone access isn’t available here",
  message: "Your browser or device is blocking access. This can happen without you choosing Block. Check microphone access, then try again.",
  help: true,
};
export function microphoneIssue(name: string): VoiceIssue {
  if (name === "NotAllowedError" || name === "SecurityError") return blocked;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return {
    title: "No microphone found",
    message: "Connect a microphone or choose an available input in your device’s sound settings, then try again.", help: true,
  };
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return {
    title: "Your microphone couldn’t start",
    message: "Another app or a device setting may be keeping it busy. Check your audio input, then try again.", help: true,
  };
  return { title: "Voice couldn’t start", message: "Try voice again, or continue with a typed message.", help: true };
}
export function recognitionIssue(code: string, microphoneChecked: boolean): VoiceIssue {
  if (code === "not-allowed" && !microphoneChecked) return blocked;
  if (code === "not-allowed" || code === "service-not-allowed") return {
    title: "Speech recognition couldn’t start here",
    message: microphoneChecked
      ? "The microphone check passed, but this browser’s speech service couldn’t start. Try opening this website in your regular browser."
      : "This browser’s speech service is unavailable. Try opening this website in your regular browser.",
    help: true,
  };
  if (code === "audio-capture") return microphoneIssue("NotReadableError");
  if (code === "network") return {
    title: "The speech service couldn’t connect",
    message: "Check your connection and try voice again. If it keeps happening, open this website in another browser.", help: true,
  };
  if (code === "no-speech") return {
    title: "I didn’t catch any speech",
    message: "Try voice again and speak when you see “Listening to you”.", help: false,
  };
  return { title: "Voice input stopped", message: "Try voice again, or continue with a typed message.", help: true };
}

// Keep permission checks and recognition in one cancellable session. A late
// permission result or an old recognizer must never restart a stopped session.
export function createVoiceInput(options: InputOptions) {
  let sequence = 0;
  let current: Recognition | null = null;
  let microphoneChecked = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    sequence++;
    clearTimeout(startTimer);
    const previous = current;
    current = null;
    if (previous) {
      previous.onstart = previous.onresult = previous.onerror = previous.onend = null;
      try { previous.abort(); } catch { /* Already ended. */ }
    }
    options.onState("idle");
  }
  function fail(issue: VoiceIssue) { stop(); options.onError(issue); }
  function listen() {
    stop();
    const id = sequence;
    let r: Recognition | null;
    try { r = options.createRecognition(); } catch { r = null; }
    if (!r) {
      fail({ title: "Voice input isn’t supported here", message: "Open this website in a browser with speech recognition, such as Chrome or Safari, or keep typing.", help: true });
      return;
    }
    current = r;
    let finalText = "";
    const isCurrent = () => sequence === id && current === r;
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    options.onState("checking");
    r.onstart = () => { if (isCurrent()) { clearTimeout(startTimer); options.onState("listening"); } };
    r.onresult = (event) => {
      if (!isCurrent()) return;
      let transcript = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      options.onTranscript(transcript.slice(0, 2000));
    };
    r.onerror = (event) => {
      if (!isCurrent()) return;
      if (event.error === "aborted") {
        fail({ title: "Voice input was interrupted", message: "Try voice again whenever you’re ready.", help: false });
      } else fail(recognitionIssue(event.error, microphoneChecked));
    };
    r.onend = () => {
      if (!isCurrent()) return;
      current = null;
      clearTimeout(startTimer);
      options.onState("idle");
      if (finalText.trim()) options.onMessage(finalText.trim().slice(0, 2000));
      else fail(recognitionIssue("no-speech", microphoneChecked));
    };
    startTimer = setTimeout(() => {
      if (isCurrent()) fail(recognitionIssue("service-not-allowed", microphoneChecked));
    }, 10000);
    try { r.start(); } catch (error) {
      if (isCurrent()) fail(recognitionIssue((error as Error).name === "NotAllowedError" ? "not-allowed" : "service-not-allowed", microphoneChecked));
    }
  }
  async function start() {
    stop();
    const id = sequence;
    microphoneChecked = false;
    if (!options.secureContext) {
      fail({ title: "Voice needs a secure page", message: "Open the HTTPS version of this website to use your microphone.", help: true });
      return;
    }
    if (!options.microphoneAllowed()) {
      fail({ title: "This browser context blocks the microphone", message: "Open the website directly in your regular browser, then allow microphone access there.", help: true });
      return;
    }
    options.onState("checking");
    if (options.requestMicrophone) {
      try {
        const stream = await options.requestMicrophone();
        // This is only a permission/device check; no audio is saved or uploaded.
        stream.getTracks().forEach((track) => track.stop());
        if (sequence !== id) return;
        microphoneChecked = true;
      } catch (error) {
        if (sequence === id) fail(microphoneIssue((error as Error).name));
        return;
      }
    }
    if (sequence === id) listen();
  }
  return { start, listen, stop };
}
