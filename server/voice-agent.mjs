import { storefront } from "../storefront.config.js";
import { createSessionStore } from "./session-store.mjs";
import { cookieName, publicSession } from "./store-api.mjs";
import { shoppingInstructions } from "./store-ai.mjs";
import { cartDecision, validatePresentation } from "./shopping.mjs";
import { uniqueVoiceMessages } from "./voice-transcripts.mjs";
export const GROK_MODEL = "grok-voice-3.0";
const functionTool = (name, description, properties, required) => ({
  type: "function",
  name,
  description,
  parameters: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
});
export function voiceTools(merchant, env = {}) {
  return [
    functionTool(
      "get_store",
      "Read current catalog, availability, prices, selections and cart before discussing them.",
      {},
      [],
    ),
    functionTool(
      "present",
      "Show an authored product, comparison, collection, cart, policy, or configured video. Use only catalog product/visual IDs; include matching suggested replies.",
      {
        view: {
          type: "string",
          enum: [
            "collection",
            "product",
            "compare",
            "cart",
            "policy",
            ...(merchant.video ? ["video"] : []),
          ],
        },
        productId: { type: "string" },
        variantId: { type: "string" },
        visualId: { type: "string" },
        productIds: { type: "array", items: { type: "string" } },
        policy: { type: "string", enum: ["shipping", "returns", "contact"] },
        choices: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      ["view", "choices"],
    ),
    functionTool(
      "change_cart",
      "Apply the visitor’s explicit request to add, remove, set a quantity or empty the cart. Server resolves product, option and arithmetic; you cannot supply a guessed quantity. Ambiguous requests produce a clarification, not a mutation.",
      {},
      [],
    ),
    ...(merchant.tools?.photoPreview && env.OPENAI_API_KEY
      ? [
          functionTool(
            "photo_concept",
            "Create a requested concept from the visitor’s uploaded reference photo using the merchant-configured image instructions.",
            {},
            [],
          ),
        ]
      : []),
  ];
}
export function voiceInstructions(state, catalog, merchant) {
  return (
    shoppingInstructions(merchant, catalog) +
    ` Live voice tools: use get_store for current data. Use change_cart when the visitor explicitly requests a cart change; the server resolves their words. Ask which product or option when ambiguous. Do not claim success until the tool confirms it. Call present to show a relevant visual and 2–4 suggested replies. Current selection is ${state.selectedProductId || "none"} and option ${state.selectedVariantId || "none"}. After a video, wait for the application follow-up. Never narrate over it. Product and policy claims must use the configured merchant facts. Visitors can type, speak or tap; none requires an account.`
  );
}
export function voiceClientMessage(value) {
  if (!value || typeof value !== "object")
    throw Error("Invalid voice message.");
  if (["text", "read"].includes(value.type)) {
    if (
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 2000
    )
      throw Error("Please use a shorter message.");
    return { type: value.type, text: value.text.trim() };
  }
  if (value.type === "audio") {
    if (
      typeof value.audio !== "string" ||
      value.audio.length > 24000 ||
      !value.audio.length ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio)
    )
      throw Error("Invalid audio chunk.");
    return { type: "audio", audio: value.audio };
  }
  if (value.type === "microphone" && typeof value.enabled === "boolean")
    return { type: value.type, enabled: value.enabled };
  if (value.type === "cancel") return { type: "cancel" };
  throw Error("That voice action is unavailable.");
}

// Provider connection and tools stay on the server: browsers cannot change the
// persona, select arbitrary models/tools, or obtain the xAI key/client secret.
/** @param {Request} request @param {any} env @param {any} [options] */
export async function openVoiceAgent(
  request,
  env,
  {
    fetchImpl = fetch,
    pairFactory = () => new WebSocketPair(),
    upgradeResponse = (client) =>
      new Response(null, { status: 101, webSocket: client }),
    store: customStore,
    commerce: customCommerce,
    storeApi,
    merchant = storefront,
  } = {},
) {
  const url = new URL(request.url);
  const json = (status, error) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (request.headers.get("origin") !== url.origin)
    return json(403, "Open this storefront directly to use voice.");
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return json(426, "A live voice connection is required.");
  if (!env.XAI_API_KEY || env.GROK_VOICE_ENABLED !== "true")
    return json(503, "Live voice is not connected yet. You can keep typing.");
  const store =
    customStore ||
    (env.DB && env.BUCKET ? createSessionStore(env.DB, env.BUCKET) : null);
  if (!store) return json(503, "Voice is temporarily unavailable.");
  const id = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName(merchant) + "="))
    ?.split("=")[1];
  const session = await store.find(id);
  if (!session) return json(401, "Reload to reconnect your conversation.");
  session.state.messages = uniqueVoiceMessages(session.state.messages);
  if (
    !(await store.consume(`grok-connect:${id}`, 40)) ||
    !(await store.consume("grok-connect:global", 400))
  )
    return json(429, "Live voice is busy. You can keep typing.");
  if (
    !(await store.consume(`grok-minutes:${id}`, 30)) ||
    !(await store.consume("grok-minutes:global", 120))
  )
    return json(
      429,
      "Live voice has reached its daily allowance. You can keep typing.",
    );
  const commerce = customCommerce;
  if (!commerce || !storeApi)
    return json(503, "Voice tools are not configured.");
  let catalog = await commerce.catalog().catch(() => []);
  // This deadline applies only to the HTTP handshake. A signal left armed after
  // the upgrade also terminates the live WebSocket in Workers.
  const handshake = new AbortController(),
    deadline = setTimeout(() => handshake.abort(), 12000);
  let response;
  try {
    response = await fetchImpl(
      `https://api.x.ai/v1/realtime?model=${GROK_MODEL}`,
      {
        headers: {
          Upgrade: "websocket",
          Authorization: `Bearer ${env.XAI_API_KEY}`,
        },
        signal: handshake.signal,
      },
    );
  } catch {
    return json(
      502,
      "Grok could not connect. You can keep typing or try Talk again.",
    );
  } finally {
    clearTimeout(deadline);
  }
  const upstream = response.webSocket;
  if (!upstream)
    return json(502, "Grok voice could not start. You can keep typing.");
  upstream.accept();
  const pair = pairFactory(),
    client = pair[0],
    socket = pair[1];
  socket.accept();
  let closed = false,
    ready = false,
    responding = false,
    mic = false,
    scripted = false,
    lastUser = "",
    answerId = "",
    answer = "",
    choices = [],
    view = "none",
    calls = [],
    turns = 0,
    toolRounds = 0,
    chain = Promise.resolve(),
    lastActivity = Date.now(),
    lastMinute = Date.now(),
    cartChanged = false,
    previewResult = null;
  let toolReplyId = "",
    presentation = { view: "collection" };
  let currentResponse = "",
    cancelledTurn = false,
    audioSuppressed = false,
    cartRequestContext = session.state,
    currentUserId = "",
    audioItemId = "";
  const cancelledResponses = new Set(),
    utteranceIds = new Map(
      session.state.messages
        .filter((m) => m.role === "user" && m.providerItemId)
        .map((m) => [m.providerItemId, m.id]),
    );
  const send = (data) => {
    if (!closed)
      try {
        socket.send(JSON.stringify(data));
      } catch {}
  };
  const toGrok = (data) => {
    if (!closed) upstream.send(JSON.stringify(data));
  };
  const finish = (message = "") => {
    if (closed) return;
    if (message) send({ type: "notice", message });
    closed = true;
    clearInterval(watchdog);
    try {
      upstream.close(1000, "Session ended");
    } catch {}
    try {
      socket.close(1000, "Session ended");
    } catch {}
  };
  const started = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - started > 20 * 60 * 1000)
      finish(
        "Voice paused after 20 minutes. Tap Talk to continue this saved conversation.",
      );
    else if (!responding && Date.now() - lastActivity > 90000)
      finish(
        mic ? "Voice paused while you were away. Tap Talk to continue." : "",
      );
    if (Date.now() - lastMinute >= 60000) {
      lastMinute = Date.now();
      void Promise.all([
        store.consume(`grok-minutes:${id}`, 30),
        store.consume("grok-minutes:global", 120),
      ])
        .then((results) => {
          if (results.some((x) => !x))
            finish(
              "Live voice has reached its daily allowance. You can continue typing.",
            );
        })
        .catch(() => finish());
    }
  }, 15000);
  async function updateState(change) {
    if (!(await store.lock(id)))
      throw Error("Your last change is still finishing. Please try again.");
    try {
      const found = await store.find(id);
      if (!found) throw Error("Your project expired. Reload to continue.");
      found.state.messages = uniqueVoiceMessages(found.state.messages);
      await change(found.state);
      found.state.messages = found.state.messages.slice(-40);
      await store.save(id, found.state);
      send({
        type: "state",
        state: { ...publicSession(found.state), catalog },
      });
      return found.state;
    } finally {
      await store.unlock(id);
    }
  }
  async function userMessage(
    text,
    messageId = crypto.randomUUID(),
    providerItemId = "",
  ) {
    await updateState((state) => {
      const existing = state.messages.find(
        (m) => m.role === "user" && m.id === messageId,
      );
      if (existing) {
        existing.text = text;
        if (currentUserId === messageId) lastUser = text;
        return; // Redelivery must not reset cartChanged or the tool-round guard.
      }
      currentUserId = messageId;
      lastUser = text;
      scripted = false;
      lastActivity = Date.now();
      choices = [];
      view = "collection";
      presentation = { view: "collection" };
      toolReplyId = "";
      toolRounds = 0;
      cartChanged = false;
      previewResult = null;
      cartRequestContext = structuredClone(state);
      state.messages.push({
        id: messageId,
        role: "user",
        text,
        ...(providerItemId ? { providerItemId } : {}),
      });
    });
  }
  async function refreshStore() {
    catalog = await commerce.catalog();
    const state = await updateState(async (state) => {
      if (state.cart?.id) state.cart = await commerce.get(state.cart.id);
    });
    return {
      catalog,
      cart: publicSession(state).cart,
      selectedProductId: state.selectedProductId,
      selectedVariantId: state.selectedVariantId,
    };
  }
  async function tool(call) {
    let args;
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      throw Error("Invalid tool request.");
    }
    if (call.name === "get_store") return refreshStore();
    if (call.name === "present") {
      const next = validatePresentation(args, catalog, merchant);
      if (
        next.view !== args.view ||
        !Array.isArray(args.choices) ||
        args.choices.length > 4 ||
        args.choices.some((c) => typeof c !== "string" || c.length > 100)
      )
        throw Error("Choose a configured visual and up to four short replies.");
      presentation = next;
      view = next.view;
      choices = args.choices;
      await updateState((state) => {
        state.presentation = next;
        if (next.productId) {
          state.selectedProductId = next.productId;
          const product = catalog.find((p) => p.id === next.productId);
          if (next.variantId) state.selectedVariantId = next.variantId;
          else if (product?.variants.length === 1)
            state.selectedVariantId = product.variants[0].id;
          else if (
            !product?.variants.some((v) => v.id === state.selectedVariantId)
          )
            state.selectedVariantId = null;
        }
        const last = state.messages.at(-1);
        if (last?.id === answerId) {
          last.choices = choices;
          last.presentation = next;
        }
      });
      send({ type: "presentation", ...next, choices });
      return { shown: next };
    }
    if (call.name === "change_cart" || call.name === "photo_concept") {
      if (scripted)
        return {
          error:
            "Reading a saved reply cannot change the cart or generate a concept.",
        };
      if (cartChanged && call.name === "change_cart")
        return {
          error: "This turn already changed the cart; do not add again.",
        };
      const found = await store.find(id);
      if (!found) throw Error("Your conversation expired. Reload to continue.");
      const change = cartDecision(
        { ...cartRequestContext, cart: found.state.cart },
        lastUser,
        catalog,
      );
      if (call.name === "change_cart" && !change)
        return {
          error:
            "No explicit cart change was resolved. Ask for the product, option and quantity. Never infer consent from a recommendation.",
        };
      if (
        call.name === "photo_concept" &&
        (!merchant.tools?.photoPreview ||
          !env.OPENAI_API_KEY ||
          !found.state.photo)
      )
        return { error: "No enabled photo tool or uploaded photo." };
      const result = await storeApi(
        new Request(url.origin + "/api/studio/chat", {
          method: "POST",
          headers: {
            Origin: url.origin,
            Cookie: request.headers.get("cookie") || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: lastUser, turnId: currentUserId }),
        }),
        { turnId: currentUserId, shoppingContext: cartRequestContext },
      );
      if (!result.ok) {
        const data = await result.json();
        throw Error(data.error || "The request could not finish.");
      }
      const text = await result.text(),
        event = JSON.parse(text.trim().split("\n").at(-1));
      if (!event.state) throw Error("The tool did not return a state.");
      toolReplyId = "reply:" + currentUserId;
      catalog = event.state.catalog;
      presentation = event.state.presentation;
      view = presentation.view;
      choices = event.state.messages.at(-1)?.choices || [];
      if (call.name === "change_cart") cartChanged = true;
      send({ type: "state", state: event.state });
      send({ type: "presentation", ...presentation, choices });
      return {
        reply: event.state.messages.at(-1)?.text,
        cart: event.state.cart,
        presentation,
      };
    }
    throw Error("This tool is unavailable.");
  }
  async function providerEvent(e) {
    if (closed) return;
    if (e.type === "session.updated" && !ready) {
      ready = true;
      for (const m of session.state.messages.slice(-16))
        toGrok({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: m.role,
            content: [
              { type: m.role === "user" ? "input_text" : "text", text: m.text },
            ],
          },
        });
      send({ type: "ready", model: GROK_MODEL });
      return;
    }
    if (e.type === "input_audio_buffer.speech_started") {
      audioItemId = e.item_id || crypto.randomUUID();
      lastActivity = Date.now();
      scripted = false;
      lastUser = "";
      send({ type: "status", status: "Listening" });
    }
    if (e.type === "input_audio_buffer.committed" && e.item_id)
      audioItemId = e.item_id;
    if (e.type === "input_audio_buffer.speech_stopped")
      send({ type: "status", status: "Thinking…" });
    if (
      e.type === "conversation.item.input_audio_transcription.completed" &&
      e.transcript?.trim()
    ) {
      audioItemId = e.item_id || audioItemId || crypto.randomUUID();
      await userMessage(
        e.transcript.trim().slice(0, 2000),
        (() => {
          if (!utteranceIds.has(audioItemId))
            utteranceIds.set(audioItemId, crypto.randomUUID());
          return utteranceIds.get(audioItemId);
        })(),
        audioItemId,
      );
    }
    if (e.type === "response.created") {
      responding = true;
      answerId = crypto.randomUUID();
      answer = "";
      calls = [];
      send({ type: "status", status: "Thinking…" });
    }
    if (
      [
        "response.output_audio_transcript.delta",
        "response.audio_transcript.delta",
      ].includes(e.type)
    ) {
      answer += e.delta;
      if (!scripted)
        send({
          type: "transcript",
          id: answerId,
          text: answer,
          responseId: e.response_id || currentResponse,
        });
    }
    if (
      [
        "response.output_audio_transcript.done",
        "response.audio_transcript.done",
      ].includes(e.type)
    )
      answer = e.transcript || answer;
    if (e.type === "response.function_call_arguments.done") calls.push(e);
    if (e.type === "response.done") {
      if (!scripted && answer.trim())
        await updateState((state) => {
          const previous =
            toolReplyId && state.messages.find((m) => m.id === toolReplyId);
          if (previous) {
            previous.id = answerId;
            previous.text = answer.slice(0, 2000);
            previous.choices = choices;
            previous.presentation = presentation;
            toolReplyId = "";
          } else
            state.messages.push({
              id: answerId,
              role: "assistant",
              text: answer.slice(0, 2000),
              choices,
              presentation,
            });
        });
      if (calls.length) {
        // The player owns the next moment. A demo already has follow-up choices;
        // asking the model for a second spoken turn can hang while video plays.
        const demoOnly = calls.every((call) => {
          try {
            return (
              call.name === "present" &&
              JSON.parse(call.arguments || "{}").view === "video"
            );
          } catch {
            return false;
          }
        });
        const shouldContinue =
          !demoOnly &&
          (!answer.includes("?") ||
            calls.some((call) => call.name !== "present"));
        for (const call of calls) {
          let result;
          try {
            result = await tool(call);
          } catch (error) {
            result = { error: error.message };
            send({ type: "notice", message: error.message });
          }
          toGrok({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(result),
            },
          });
        }
        calls = [];
        if (shouldContinue && !cancelledTurn && ++toolRounds <= 4)
          toGrok({ type: "response.create" });
        else {
          responding = false;
          send({ type: "done" });
        }
      } else {
        responding = false;
        scripted = false;
        send({ type: "done" });
        if (++turns > 160)
          finish(
            "Your conversation is saved. Voice has reached its allowance; you can continue typing.",
          );
      }
    }
    if (e.type === "error") {
      const code = e.error?.code || e.code;
      if (
        [
          "response_cancel_not_active",
          "conversation_already_has_active_response",
        ].includes(code)
      )
        return;
      send({
        type: "error",
        message:
          "Grok voice could not finish that reply. You can keep typing or try Talk again.",
      });
      finish();
    }
  }
  upstream.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    // Apply the interruption barrier outside the async persistence queue.
    if (data.type === "input_audio_buffer.speech_started") {
      if (currentResponse) cancelledResponses.add(currentResponse);
      audioSuppressed = true;
      cancelledTurn = false;
      send({ type: "interrupt", reason: "speech" });
    }
    if (data.type === "response.created") {
      currentResponse =
        data.response?.id || data.response_id || crypto.randomUUID();
      audioSuppressed = cancelledTurn;
      if (cancelledTurn) {
        cancelledResponses.add(currentResponse);
        toGrok({ type: "response.cancel" });
      } else send({ type: "response-start", responseId: currentResponse });
    }
    // Forward audio immediately: image generation and durable writes must not
    // hold audio packets in the persistence/tool queue.
    if (
      ["response.output_audio.delta", "response.audio.delta"].includes(
        data.type,
      )
    ) {
      const responseId = data.response_id || currentResponse;
      if (
        currentResponse &&
        !audioSuppressed &&
        responseId === currentResponse &&
        !cancelledResponses.has(responseId)
      )
        send({ type: "audio", audio: data.delta, responseId });
      return;
    }
    chain = chain
      .then(() => providerEvent(data))
      .catch(() => {
        send({
          type: "error",
          message: "The conversation could not be saved. Please reconnect.",
        });
        finish();
      });
  });
  socket.addEventListener("message", (event) => {
    if (closed || !ready) return;
    let m;
    try {
      if (typeof event.data !== "string" || event.data.length > 25000)
        throw Error();
      m = voiceClientMessage(JSON.parse(event.data));
    } catch {
      send({ type: "error", message: "That voice request was invalid." });
      return;
    }
    if (m.type === "audio") {
      if (mic) toGrok({ type: "input_audio_buffer.append", audio: m.audio });
      return;
    }
    if (m.type === "microphone") {
      mic = m.enabled;
      lastActivity = Date.now();
      if (!mic) toGrok({ type: "input_audio_buffer.clear" });
      return;
    }
    if (m.type === "cancel") {
      cancelledTurn = true;
      audioSuppressed = true;
      if (currentResponse) cancelledResponses.add(currentResponse);
      if (responding) toGrok({ type: "response.cancel" });
      send({ type: "interrupt", reason: "cancel" });
      return;
    }
    chain = chain
      .then(async () => {
        if (responding) {
          send({
            type: "notice",
            message: "Please wait for this reply or interrupt it first.",
          });
          return;
        }
        lastActivity = Date.now();
        scripted = m.type === "read";
        cancelledTurn = false;
        if (scripted)
          toGrok({
            type: "conversation.item.create",
            item: {
              type: "force_message",
              role: "assistant",
              interruptible: true,
              content: [{ type: "output_text", text: m.text }],
            },
          });
        else {
          await userMessage(m.text);
          toGrok({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: m.text }],
            },
          });
          toGrok({ type: "response.create" });
        }
      })
      .catch(() => {
        send({
          type: "error",
          message: "That message could not be saved. Please reconnect.",
        });
        finish();
      });
  });
  socket.addEventListener("close", () => finish());
  socket.addEventListener("error", () => finish());
  upstream.addEventListener("close", () =>
    finish(
      responding || mic
        ? "The voice connection closed. Your conversation is saved; tap Talk to reconnect."
        : "",
    ),
  );
  upstream.addEventListener("error", () =>
    finish("The voice connection was interrupted. Tap Talk to reconnect."),
  );
  toGrok({
    type: "session.update",
    session: {
      voice: url.searchParams.get("voice") === "man" ? "leo" : "eve",
      instructions: voiceInstructions(session.state, catalog, merchant),
      reasoning: { effort: "none" },
      turn_detection: { type: "server_vad" },
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription: {
            model: "grok-transcribe",
            language_hint: "en",
            keyterms: [merchant.name, ...catalog.map((p) => p.title)],
          },
        },
        output: { format: { type: "audio/pcm", rate: 24000 } },
      },
      tools: voiceTools(merchant, env),
    },
  });
  return upgradeResponse(client);
}
