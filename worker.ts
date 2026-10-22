import { openVoiceAgent } from "./server/voice-agent.mjs";
import { storefront } from "./storefront.config.js";
import { createConfiguredApi, commerceFor } from "./server/bootstrap.mjs";
import { createSpeechApi } from "./server/speech-api.mjs";
let speechHandler: ReturnType<typeof createSpeechApi> | undefined;
export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/voice/live")
      return openVoiceAgent(request, env, {
        commerce: commerceFor(
          env,
          request.headers.get("cf-connecting-ip") || "",
        ),
        storeApi: createConfiguredApi(env),
        merchant: storefront,
      });
    if (path === "/api/voice/status")
      return Response.json(
        {
          enabled: Boolean(
            env.XAI_API_KEY && env.GROK_VOICE_ENABLED === "true",
          ),
          provider: "xAI",
          model: "grok-voice-3.0",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path === "/api/studio" || path.startsWith("/api/studio/"))
      return createConfiguredApi(env)(request);
    if (path === "/api/speech")
      return (speechHandler ??= createSpeechApi({
        key: env.ELEVENLABS_API_KEY,
        voiceId: env.ELEVENLABS_VOICE_ID,
        femaleVoiceId: env.ELEVENLABS_FEMALE_VOICE_ID,
        model: env.ELEVENLABS_MODEL || "eleven_v4",
      }))(request);
    if (path.startsWith("/api/"))
      return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
