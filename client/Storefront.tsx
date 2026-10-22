import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  Code2,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Mic,
  Plus,
  Settings2,
  ShoppingBag,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { storefront } from "../storefront.config.js";
import { createSpeechVoice } from "./voice/voice";
import { createLiveVoice } from "./voice/live-voice";
import {
  createNarration,
  saveSoundEnabled,
  welcomeGreeting,
  returningGreeting,
} from "./voice/narration";
import { readVoicePreference, saveVoicePreference } from "./voice/preferences";
import {
  guideName,
  guideIntroduction,
  guideHelpQuestion,
} from "./shared/guide.js";
import { VisualStage } from "./VisualStage";
import { VideoDialog } from "./media/VideoDialog";
import type { Session, Presentation } from "./types";
import "./storefront.css";
const initial: Session = {
  messages: [],
  catalog: [],
  cart: null,
  selectedProductId: null,
  selectedVariantId: null,
  presentation: { view: "collection" },
  photo: null,
  previews: [],
  demo: true,
  scripted: true,
  ready: false,
  features: { voice: false, transcribe: false, previews: false, video: false },
};
async function readJSON(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    throw Error(
      "The store connection is unavailable. Please refresh and try again.",
    );
  }
}
export default function Storefront() {
  const [session, setSession] = useState(initial),
    [started, setStarted] = useState(false),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [localView, setLocalView] = useState<Presentation | null>(null);
  const [sound, setSound] = useState(false),
    [blocked, setBlocked] = useState(false),
    [voiceOn, setVoiceOn] = useState(false),
    [voiceStatus, setVoiceStatus] = useState(""),
    [voice, setVoice] = useState<"man" | "woman">("woman"),
    [liveEnabled, setLiveEnabled] = useState(false),
    [settings, setSettings] = useState(false),
    [video, setVideo] = useState(false);
  const stateRef = useRef(session),
    startedRef = useRef(false),
    soundRef = useRef(false),
    voiceRef = useRef(voice),
    busyRef = useRef(false),
    videoRef = useRef(false),
    revision = useRef(0),
    abort = useRef<AbortController | null>(null),
    sendRef = useRef<(text: string) => Promise<void>>(async () => {}),
    retry = useRef<{ text: string; turnId: string } | null>(null);
  const audio = useRef<HTMLAudioElement>(null),
    liveAudio = useRef<HTMLAudioElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null),
    resetDialog = useRef<HTMLDialogElement>(null);
  const speech = useRef<ReturnType<typeof createSpeechVoice> | null>(null),
    live = useRef<ReturnType<typeof createLiveVoice> | null>(null),
    narration = useRef<ReturnType<typeof createNarration> | null>(null),
    videoEvent = useRef("");
  stateRef.current = session;
  voiceRef.current = voice;
  sendRef.current = (text) => send(text);
  function apply(next: Session) {
    stateRef.current = next;
    setSession(next);
    setLocalView(null);
    if (next.presentation?.view === "video") openVideo();
  }
  function show(next: Presentation) {
    setLocalView(next);
    if (matchMedia("(max-width:760px)").matches)
      requestAnimationFrame(() =>
        document
          .querySelector(".shop-visual")
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  }
  function working(value: string) {
    busyRef.current = Boolean(value);
    setBusy(value);
  }
  useEffect(() => {
    const selected = readVoicePreference() === "man" ? "man" : "woman";
    setVoice(selected);
    voiceRef.current = selected;
    const player = createSpeechVoice({
      audio: audio.current!,
      getVoice: () => voiceRef.current,
      onText: (text) => sendRef.current(text),
      onBlocked: setBlocked,
      onState: (value) => {
        setVoiceStatus(value);
        if (value === "Speaking") narration.current?.didStartSpeaking();
      },
      onError: (message) => {
        setError(message);
        setVoiceOn(false);
      },
    });
    speech.current = player;
    const realtime = createLiveVoice({
      audio: liveAudio.current!,
      getVoice: () => voiceRef.current,
      onBlocked: setBlocked,
      onState: (value) => {
        setVoiceStatus(value);
        if (value === "Speaking") narration.current?.didStartSpeaking();
      },
      onError: (message) => {
        setError(message);
        setVoiceOn(false);
        setLiveEnabled(false);
        working("");
      },
      onEvent: (event) => {
        if (event.type === "state")
          apply({ ...stateRef.current, ...event.state });
        if (event.type === "presentation") {
          if (event.view === "video") openVideo();
          else setLocalView(event as unknown as Presentation);
        }
        if (event.type === "transcript")
          setSession((current) => ({
            ...current,
            messages: current.messages.some((m) => m.id === event.id)
              ? current.messages.map((m) =>
                  m.id === event.id ? { ...m, text: event.text } : m,
                )
              : [
                  ...current.messages,
                  { id: event.id, role: "assistant", text: event.text },
                ],
          }));
        if (event.type === "status") working(event.status);
        if (event.type === "done" || event.type === "ended") {
          working("");
          if (event.type === "ended") setVoiceOn(false);
        }
        if (event.type === "notice") {
          setError(event.message);
          working("");
        }
      },
    });
    live.current = realtime;
    void realtime.available().then(setLiveEnabled);
    const reader = createNarration({
      output: {
        tryUnlock: async () =>
          (await realtime.available())
            ? realtime.tryUnlock()
            : player.tryUnlock(),
        speak: async (text) => {
          if (await realtime.available()) await realtime.speak(text);
          else await player.speak(text);
        },
        stop: () => {
          player.pauseInput();
          realtime.cancel();
        },
      },
      enabled: false,
      onBlocked: setBlocked,
      onError: setError,
    });
    narration.current = reader;
    reader.setVisible(!document.hidden);
    void load();
    const visibility = () => {
      reader.setVisible(!document.hidden);
      if (document.hidden) {
        player.stop();
        realtime.stop();
        setVoiceOn(false);
        working("");
      }
    };
    const unlock = (event: Event) => {
      if (
        !startedRef.current ||
        videoRef.current ||
        !event.isTrusted ||
        (event.target instanceof Element &&
          event.target.closest("[data-audio-control]"))
      )
        return;
      void reader.activate();
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("click", unlock);
    return () => {
      abort.current?.abort();
      reader.dispose();
      player.dispose();
      realtime.dispose();
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("click", unlock);
    };
  }, []);
  useEffect(() => {
    if (started && !videoRef.current)
      messagesEnd.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
  }, [session.messages.at(-1)?.text, busy, started]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !busyRef.current) void load(true);
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, []);
  async function load(refresh = false) {
    const ticket = revision.current,
      previous = stateRef.current;
    try {
      const response = await fetch(
        "/api/studio" + (refresh ? "/commerce" : ""),
      );
      const data = await readJSON(response);
      if (!response.ok)
        throw Error(data.error || "The storefront could not load.");
      if (
        refresh &&
        (ticket !== revision.current ||
          busyRef.current ||
          previous !== stateRef.current)
      )
        return;
      apply(data);
      if (new URLSearchParams(location.search).get("cart") === "open") {
        setLocalView({ view: "cart" });
        startedRef.current = true;
        setStarted(true);
      }
      if (!refresh && startedRef.current && soundRef.current)
        void narration.current?.greet(data.messages.length > 0);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function begin(enabled: boolean) {
    if (!session.ready) return;
    startedRef.current = true;
    setStarted(true);
    changeSound(enabled);
    if (enabled) {
      void live.current?.tryUnlock();
      void speech.current?.tryUnlock();
      void narration.current?.greet(session.messages.length > 0);
    }
    requestAnimationFrame(() =>
      composer.current?.focus({ preventScroll: true }),
    );
  }
  function changeSound(enabled: boolean) {
    soundRef.current = enabled;
    setSound(enabled);
    saveSoundEnabled(enabled);
    narration.current?.setEnabled(enabled);
    if (!enabled) {
      speech.current?.stop();
      live.current?.stop();
      setVoiceOn(false);
    }
  }
  async function send(text: string, turnId: string = crypto.randomUUID()) {
    if (
      !startedRef.current ||
      busyRef.current ||
      !text.trim() ||
      !stateRef.current.ready
    )
      return;
    revision.current++;
    retry.current = { text, turnId };
    setError("");
    setInput("");
    setLocalView(null);
    narration.current?.cancel();
    working("Thinking…");
    if (live.current?.isEnabled() && soundRef.current) {
      try {
        await live.current.send(text);
        retry.current = null;
        return;
      } catch {
        live.current.fallback();
        setLiveEnabled(false);
        setVoiceOn(false);
      }
    }
    const previous = stateRef.current,
      controller = new AbortController();
    abort.current = controller;
    setSession((current) => ({
      ...current,
      messages: [...current.messages, { id: turnId, role: "user", text }],
    }));
    try {
      const response = await fetch("/api/studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, turnId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await readJSON(response);
        throw Error(data.error || "The request could not finish.");
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        next: Session | undefined;
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.status) working(event.status);
            if (event.error) throw Error(event.error);
            if (event.state) {
              next = event.state;
              apply(next!);
            }
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!next)
        throw Error(
          "The connection ended before a reply. Try again to recover this request.",
        );
      retry.current = null;
      if (next.presentation.view !== "video")
        void narration.current?.speak(next.messages.at(-1)?.text || "");
    } catch (error) {
      if (!controller.signal.aborted) {
        setError((error as Error).message);
        setSession(previous);
      }
    } finally {
      abort.current = null;
      working("");
    }
  }
  async function cart(variantId: string, quantity: number) {
    if (busyRef.current) return;
    revision.current++;
    working("Updating your cart…");
    narration.current?.cancel();
    setError("");
    try {
      const response = await fetch("/api/studio/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId,
          quantity,
          turnId: crypto.randomUUID(),
        }),
      });
      const next = await readJSON(response);
      if (!response.ok) throw Error(next.error || "The cart could not update.");
      apply(next);
      setLocalView({ view: "cart" });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      working("");
    }
  }
  async function toggleVoice() {
    if (voiceOn) {
      live.current?.stop();
      speech.current?.stop();
      setVoiceOn(false);
      return;
    }
    changeSound(true);
    try {
      if (await live.current?.available()) await live.current?.start();
      else await speech.current?.start();
      setVoiceOn(true);
    } catch (error) {
      setError((error as Error).message);
      setVoiceOn(false);
    }
  }
  function openVideo() {
    if (!storefront.video || videoRef.current) return;
    videoEvent.current = crypto.randomUUID();
    videoRef.current = true;
    live.current?.pauseForMedia();
    narration.current?.cancel();
    speech.current?.stop();
    setVoiceOn(false);
    setVideo(true);
  }
  async function closeVideo(reason: "ended" | "dismissed") {
    if (!videoRef.current) return;
    videoRef.current = false;
    setVideo(false);
    working("Continuing our conversation…");
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch("/api/studio/video-closed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, eventId: videoEvent.current }),
        });
        if (response.status !== 409) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const next = await readJSON(response!);
      if (!response!.ok)
        throw Error(next.error || "Choose a reply to continue.");
      apply(next);
      void narration.current?.speak(next.messages.at(-1)?.text || "");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      working("");
    }
  }
  async function upload(file: File) {
    if (busyRef.current) return;
    setError("");
    if (file.size > 5_000_000) {
      setError("Choose a JPG, PNG or WebP under 5 MB.");
      return;
    }
    working("Saving your reference photo…");
    const form = new FormData();
    form.append("photo", file);
    try {
      const response = await fetch("/api/studio/upload", {
          method: "POST",
          body: form,
        }),
        next = await readJSON(response);
      if (!response.ok)
        throw Error(next.error || "The photo could not upload.");
      apply(next);
      setInput("Create a photo concept using my reference.");
      composer.current?.focus();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      working("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function reset() {
    if (busyRef.current) return;
    working("Starting fresh…");
    narration.current?.cancel();
    live.current?.stop();
    speech.current?.stop();
    try {
      const response = await fetch("/api/studio", { method: "DELETE" });
      if (!response.ok) throw Error("Your conversation could not reset.");
      resetDialog.current?.close();
      retry.current = null;
      narration.current?.resetGreeting();
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      working("");
    }
  }
  const presentation = localView || session.presentation,
    choices =
      session.messages.at(-1)?.role === "assistant"
        ? session.messages.at(-1)?.choices
        : [],
    hasMessages = session.messages.length > 0;
  return (
    <div className={"shop " + (!started ? "is-intro" : "")}>
      <a href="#conversation" className="skip">
        Skip to conversation
      </a>
      <audio ref={audio} playsInline preload="auto" className="sr-only" />
      <audio ref={liveAudio} playsInline preload="auto" className="sr-only" />
      <header className="shop-header">
        <a className="wordmark" href="/">
          {storefront.name}
          <span>.</span>
        </a>
        <span className="mode-label">
          {session.demo ? "Demo store" : "Personal shopping"}
          <span>{session.demo ? " · fictional products" : ""}</span>
        </span>
        <a
          className="source-link"
          href={storefront.repo}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code2 size={17} />
          <span>Source</span>
        </a>
        <div className="header-actions">
          {started && session.features.voice && (
            <>
              <button
                className="icon-button"
                data-audio-control
                aria-label={sound ? "Mute guide" : "Enable sound"}
                aria-pressed={!sound}
                onClick={() => {
                  changeSound(!sound);
                  if (!sound) void narration.current?.activate();
                }}
              >
                {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
              </button>
              <button
                className="icon-button"
                aria-label="Voice settings"
                aria-expanded={settings}
                onClick={() => setSettings(!settings)}
              >
                <Settings2 size={19} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label="New conversation"
            disabled={!started || Boolean(busy)}
            onClick={() => resetDialog.current?.showModal()}
          >
            <Plus size={20} />
          </button>
          <button
            className="cart-button"
            aria-label={
              "Open cart, " + (session.cart?.quantity || 0) + " items"
            }
            aria-pressed={presentation.view === "cart"}
            onClick={() => show({ view: "cart" })}
          >
            <ShoppingBag size={18} />
            <span>Cart</span>
            <b>{session.cart?.quantity || 0}</b>
          </button>
        </div>
        {settings && (
          <section className="voice-settings">
            <div className="stage-heading">
              <h2>Your voice</h2>
              <button
                className="icon-button"
                aria-label="Close voice settings"
                onClick={() => setSettings(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label htmlFor="guide-voice">Guide voice</label>
            <select
              id="guide-voice"
              value={voice}
              onChange={(e) => {
                live.current?.stop();
                speech.current?.stop();
                setVoiceOn(false);
                const selected = e.target.value as "man" | "woman";
                setVoice(selected);
                saveVoicePreference(selected);
              }}
            >
              <option value="woman">Woman</option>
              <option value="man">Man</option>
            </select>
            <label className="sound-checkbox" data-audio-control>
              <input
                type="checkbox"
                checked={sound}
                onChange={() => changeSound(!sound)}
              />
              Speak replies automatically
            </label>
            <p>
              {liveEnabled
                ? "Realtime voice is connected."
                : "Speech is provided by the configured voice service."}{" "}
              Your microphone starts only when you choose Talk.
            </p>
          </section>
        )}
      </header>
      <main className="shop-layout">
        <div
          className={
            "shop-visual " +
            (!started && presentation.view !== "cart" ? "inspiration" : "")
          }
        >
          {!started && presentation.view !== "cart" ? (
            <figure className="hero-image">
              <img src={storefront.hero.src} alt={storefront.hero.alt} />
              <figcaption>
                {storefront.hero.caption
                  .split("\n")
                  .map((line: string, i: number) => (
                    <span key={i}>
                      {line}
                      <br />
                    </span>
                  ))}
              </figcaption>
            </figure>
          ) : (
            <VisualStage
              session={session}
              presentation={presentation}
              busy={Boolean(busy)}
              onAsk={(text) => {
                if (!startedRef.current) begin(false);
                void sendRef.current(text);
              }}
              onCart={(id, q) => void cart(id, q)}
              onCloseCart={() => show({ view: "collection" })}
              onRefresh={() => void load(true)}
            />
          )}
        </div>
        <section
          className="shop-conversation"
          id="conversation"
          aria-label={"Conversation with " + guideName}
        >
          <div
            className="messages"
            tabIndex={0}
            aria-label="Conversation history"
          >
            {!started ? (
              <div className="intro">
                <h1>
                  {storefront.headline
                    .split("\n")
                    .map((line: string, i: number) => (
                      <span key={i}>
                        {line}
                        <br />
                      </span>
                    ))}
                </h1>
                <p>
                  {guideIntroduction} {storefront.introduction}
                </p>
                <p>
                  Type, tap a suggestion
                  {session.features.voice ? ", or talk" : ""}. We’ll explore the
                  products and build your cart together. No account needed.
                </p>
                <div className="start-choice">
                  <h2>
                    {session.features.voice
                      ? "Shall we turn on sound?"
                      : "Shopping starts with a conversation."}
                  </h2>
                  <p>
                    {session.features.voice
                      ? "Enable sound for the best experience. You can mute me anytime; your microphone stays off until you choose Talk."
                      : session.scripted
                        ? "Try the scripted demo. Connect your own AI provider for an open conversation."
                        : "Ask a question, compare your options, or tell me what you’d like."}
                  </p>
                  {session.features.voice ? (
                    <div className="start-actions" data-audio-control>
                      <button
                        className="button primary"
                        disabled={!session.ready}
                        onClick={() => begin(true)}
                      >
                        <Volume2 size={18} />
                        Enable sound
                        <ArrowUpRight size={18} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={!session.ready}
                        onClick={() => begin(false)}
                      >
                        Text only
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button primary"
                      disabled={!session.ready}
                      onClick={() => begin(false)}
                    >
                      Start exploring <ArrowUpRight size={18} />
                    </button>
                  )}
                </div>
              </div>
            ) : !hasMessages ? (
              <div className="welcome">
                <h1>Let’s find your fit.</h1>
                <p>{welcomeGreeting}</p>
                <div className="opening-choices">
                  {storefront.openingChoices.map((choice: string) => (
                    <button
                      className="button secondary"
                      key={choice}
                      disabled={Boolean(busy)}
                      onClick={() => void send(choice)}
                    >
                      {choice}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div role="log" aria-live={sound && !blocked ? "off" : "polite"}>
                {session.messages.map((message) => (
                  <article
                    className={"message " + message.role}
                    key={message.id}
                  >
                    <span className="message-name">
                      {message.role === "user" ? "You" : guideName}
                    </span>
                    <p>{message.text}</p>
                    {message.role === "assistant" && message.presentation && (
                      <button
                        className="text-action"
                        disabled={Boolean(busy)}
                        onClick={() => show(message.presentation!)}
                      >
                        View{" "}
                        {message.presentation.view === "cart" ? "cart" : "this"}
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                    {message.role === "assistant" && session.features.voice && (
                      <button
                        className="read-reply icon-button"
                        aria-label="Read reply aloud"
                        data-audio-control
                        onClick={() => {
                          changeSound(true);
                          void narration.current?.speak(message.text);
                        }}
                      >
                        <Volume2 size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
            {busy && (
              <p className="working" role="status">
                <LoaderCircle size={16} />
                {busy}
              </p>
            )}
            <div ref={messagesEnd} />
          </div>
          {error && (
            <div className="error-message" role="alert">
              <p>{error}</p>
              {retry.current ? (
                <button
                  className="text-action"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    const value = retry.current!;
                    void send(value.text, value.turnId);
                  }}
                >
                  Try again
                </button>
              ) : (
                <button className="text-action" onClick={() => void load()}>
                  Refresh
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {session.commerceError && (
            <div className="error-message" role="status">
              <p>{session.commerceError}</p>
              <button
                className="text-action"
                disabled={Boolean(busy)}
                onClick={() => void load(true)}
              >
                Refresh store
              </button>
            </div>
          )}
          {started && (
            <div className="composer-dock">
              {!busy && choices?.length ? (
                <div
                  className="suggestions"
                  role="group"
                  aria-label="Suggested replies"
                >
                  {choices.map((choice) => (
                    <button key={choice} onClick={() => void send(choice)}>
                      {choice}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              ) : null}
              {blocked && sound && (
                <div className="audio-prompt" role="status">
                  <p>Your browser needs a tap for sound.</p>
                  <button
                    className="text-action"
                    data-audio-control
                    onClick={() => void narration.current?.activate()}
                  >
                    Enable sound
                  </button>
                </div>
              )}
              {voiceStatus && (
                <div className="voice-status" role="status">
                  <span />
                  {voiceStatus}
                  <button
                    className="text-action"
                    data-audio-control
                    onClick={() => {
                      if (voiceStatus === "Speaking") {
                        narration.current?.cancel();
                        live.current?.interrupt();
                        speech.current?.interrupt();
                        working("");
                      } else {
                        live.current?.stop();
                        speech.current?.stop();
                        setVoiceOn(false);
                      }
                    }}
                  >
                    <Square size={12} />
                    {voiceStatus === "Speaking" ? "Interrupt" : "Stop voice"}
                  </button>
                </div>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <label className="sr-only" htmlFor="message">
                  Message {guideName}
                </label>
                <textarea
                  id="message"
                  ref={composer}
                  placeholder={"Ask " + guideName + " about the products…"}
                  rows={2}
                  maxLength={2000}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                />
                <div className="composer-actions">
                  {session.features.previews && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Upload a reference photo"
                      disabled={Boolean(busy)}
                      onClick={() => fileInput.current?.click()}
                    >
                      <ImagePlus size={20} />
                    </button>
                  )}
                  {session.features.voice && (
                    <button
                      type="button"
                      className={"talk-button " + (voiceOn ? "active" : "")}
                      data-audio-control
                      disabled={
                        Boolean(busy) ||
                        (!liveEnabled && !session.features.transcribe)
                      }
                      onClick={() => void toggleVoice()}
                    >
                      <Mic size={17} />
                      {voiceOn ? "Listening" : "Talk"}
                    </button>
                  )}
                  <button
                    className="send-button"
                    aria-label="Send message"
                    disabled={!input.trim() || Boolean(busy) || !session.ready}
                  >
                    {busy ? <LoaderCircle size={19} /> : <ArrowUp size={22} />}
                  </button>
                </div>
              </form>
              <button
                className="help-button"
                disabled={Boolean(busy)}
                onClick={() => void send(guideHelpQuestion)}
              >
                {guideHelpQuestion}
              </button>
            </div>
          )}
        </section>
      </main>
      <input
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Reference photo"
        ref={fileInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <VideoDialog
        open={video}
        muted={!sound}
        onClose={(reason) => void closeVideo(reason)}
      />
      <dialog className="reset-dialog" ref={resetDialog}>
        <div className="stage-heading">
          <h2>Start a new conversation?</h2>
          <button
            className="icon-button"
            aria-label="Cancel new conversation"
            onClick={() => resetDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          This clears this browser project’s conversation, cart reference and
          uploaded images. It does not cancel an order or delete a Shopify cart.
        </p>
        <div className="start-actions">
          <button
            className="button secondary"
            onClick={() => resetDialog.current?.close()}
          >
            Keep exploring
          </button>
          <button
            className="button primary"
            disabled={Boolean(busy)}
            onClick={() => void reset()}
          >
            <Trash2 size={16} />
            Start fresh
          </button>
        </div>
      </dialog>
    </div>
  );
}
