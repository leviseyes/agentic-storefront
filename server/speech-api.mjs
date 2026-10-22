const json = (status, error) => new Response(JSON.stringify({ error }), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

// Presentation markup should not be spoken, and only our own delivery cues
// should reach the speech model. Keep the assistant's actual words intact.
export function spokenText(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link shown here")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[*#`_]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Server-only ElevenLabs proxy. Limits apply per Worker isolate. */
export function createSpeechApi({ key = "", voiceId = "", femaleVoiceId = "", model = "eleven_v4", fetchImpl = fetch,
  limit = 15, dailyCharacters = 100000, timeoutMs = 45000 } = {}) {
  const rates = new Map();
  let day = "", used = 0, concurrent = 0;
  return async function speech(request) {
    if (request.method !== "POST") return json(405, "Use POST");
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return json(403, "Origin not allowed");
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json(415, "Send JSON");
    if (!key || !voiceId) return json(503, "The voice service isn’t connected yet. You can keep typing.");
    const now = Date.now();
    for (const [ip, rate] of rates) if (rate.reset <= now) rates.delete(ip);
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const rate = rates.get(ip) || { count: 0, reset: now + 60000 };
    rates.set(ip, rate);
    if (++rate.count > limit) return json(429, "Voice is busy. Please wait a minute and try again.");
    let text, selectedVoiceId, sampleRate = 24000;
    const reader = request.body?.getReader();
    if (!reader) return json(400, "Missing speech text");
    try {
      const decoder = new TextDecoder();
      let raw = "", bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 12000) { await reader.cancel(); return json(413, "Speech text is too long"); }
        raw += decoder.decode(value, { stream: true });
      }
      const body = JSON.parse(raw + decoder.decode());
      if (body.sampleRate !== undefined && body.sampleRate !== 16000 && body.sampleRate !== 24000)
        return json(400, "Unsupported audio format");
      sampleRate = body.sampleRate ?? 24000;
      // The browser chooses a preset, never an arbitrary provider voice or model.
      // Resolve it per request so one visitor cannot change another's voice.
      const voice = body.voice ?? "man";
      if (voice !== "man" && voice !== "woman") return json(400, "Choose a man's or woman's voice");
      selectedVoiceId = voice === "woman" ? femaleVoiceId : voiceId;
      if (!selectedVoiceId) return json(503, "That voice isn’t available right now. Please choose another in Conversation settings.");
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1800)
        return json(400, "Speech text must contain 1–1800 characters");
      text = spokenText(body.text);
      if (!text) return json(400, "Missing speech text");
    } catch { return json(400, "Invalid speech request"); }
    finally { reader.releaseLock(); }
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; used = 0; }
    if (used + text.length > dailyCharacters || concurrent >= 3)
      return json(429, "Voice is at capacity. Please try again shortly.");
    used += text.length;
    concurrent++;
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const timer = setTimeout(onAbort, timeoutMs);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      concurrent--;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
    };
    try {
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(selectedVoiceId)}/stream?output_format=pcm_${sampleRate}`, {
        method: "POST", signal: abort.signal,
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[Warm, relaxed conversational tone] ${text}`,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.98 },
          apply_text_normalization: "on",
        }),
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        cleanup();
        return json(response.status === 429 ? 429 : 502, "The voice service couldn’t respond. Please try again.");
      }
      const audio = response.body.getReader();
      let bytes = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await audio.read();
            if (done) { cleanup(); controller.close(); return; }
            bytes += value.byteLength;
            if (bytes > 12_000_000) throw Error("audio limit");
            controller.enqueue(value);
          } catch {
            abort.abort();
            await audio.cancel().catch(() => {});
            cleanup();
            controller.error(new Error("Speech stream interrupted"));
          }
        },
        async cancel() { abort.abort(); cleanup(); await audio.cancel().catch(() => {}); },
      });
      return new Response(stream, { headers: {
        "Content-Type": "audio/pcm", "X-Audio-Sample-Rate": String(sampleRate),
        "X-Voice-Provider": "ElevenLabs", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch {
      cleanup();
      return json(502, "The voice service couldn’t connect. Please try again.");
    }
  };
}
