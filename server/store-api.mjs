import { createSessionStore, emptySession } from "./session-store.mjs";
import { MAX_QUANTITY, lineQuantity, safeCart } from "./commerce.mjs";
import { findVariant } from "../shared/storefront.js";
import {
  cartDecision,
  scriptedDecision,
  selectionFor,
  validatePresentation,
} from "./shopping.mjs";
import { readBounded, imageType } from "./request.mjs";
import { uniqueVoiceMessages } from "./voice-transcripts.mjs";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
const json = (status, data, extra = {}) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });
export const cookieName = (merchant) =>
  "agentic_storefront_v2_" + merchant.id.replaceAll("-", "_");
export function publicSession(state) {
  return {
    messages: uniqueVoiceMessages(state.messages).map(
      ({ providerItemId, ...message }) => message,
    ),
    cart: safeCart(state.cart),
    selectedProductId: state.selectedProductId,
    selectedVariantId: state.selectedVariantId,
    presentation: state.presentation,
    photo: state.photo
      ? { id: state.photo.id, url: "/api/studio/image/" + state.photo.id }
      : null,
    previews: state.previews.map((p) => ({
      ...p,
      url: "/api/studio/image/" + p.id,
    })),
    recovering: Boolean(state.cartOperation),
  };
}
export function createStoreApi({
  merchant,
  db,
  bucket,
  store: providedStore,
  commerce: providedCommerce,
  commerceFactory,
  ai = null,
  demo = true,
  checkoutHosts = [],
  features = {},
}) {
  const store =
    providedStore || (db && bucket ? createSessionStore(db, bucket) : null);
  return async (request, trustedContext = null) => {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/studio\/?/, ""),
      mutation = ["POST", "DELETE"].includes(request.method);
    if (mutation && request.headers.get("origin") !== url.origin)
      return json(403, { error: "Open this storefront directly to continue." });
    if (!store)
      return json(503, {
        error:
          "Session storage is not configured. Check the server’s D1 and R2 bindings.",
      });
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName(merchant) + "="))
      ?.split("=")[1];
    const cookieHeader = (id) =>
      `${cookieName(merchant)}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${id ? 604800 : 0}${url.protocol === "https:" ? "; Secure" : ""}`;
    let locked = false,
      session,
      state,
      commerce,
      catalog;
    const loadCatalog = async () =>
      catalog || (catalog = await commerce.catalog());
    const view = () => ({
      ...publicSession(state),
      catalog: catalog || [],
      demo,
      scripted: !ai,
      ready: true,
      features: { ...features, video: Boolean(merchant.video) },
    });
    async function completeCart(operation) {
      let result;
      try {
        result = operation.change.clear
          ? await commerce.clear(state.cart?.id)
          : await commerce.setLineQuantity(
              state.cart?.id,
              operation.change.variantId,
              operation.change.quantity,
            );
      } catch (error) {
        let fresh;
        try {
          fresh = await commerce.get(state.cart?.id);
        } catch {
          throw error;
        }
        const reached =
          fresh &&
          (operation.change.clear
            ? fresh.totalQuantity === 0
            : lineQuantity(fresh, operation.change.variantId) ===
              operation.change.quantity);
        if (reached)
          result = {
            cart: fresh,
            warnings: ["The store confirmed your earlier change."],
          };
        else {
          state.cart = fresh;
          state.cartOperation = null;
          await store.save(session.id, state);
          throw error;
        }
      }
      state.cart = result.cart;
      state.pendingCart = null;
      state.lastCartVariantId = operation.change.variantId || null;
      state.presentation = { view: "cart" };
      if (
        operation.userText &&
        !state.messages.some((m) => m.id === operation.id)
      )
        state.messages.push({
          id: operation.id,
          role: "user",
          text: operation.userText,
        });
      const variant = operation.change.variantId
        ? findVariant(await loadCatalog(), operation.change.variantId)
        : null;
      const count = variant
        ? state.cart?.lines.nodes.find((l) => l.merchandise.key === variant.id)
            ?.quantity || 0
        : 0;
      const text = variant
        ? `${variant.productTitle} · ${variant.title} is now ${count} in your cart. ${result.warnings.join(" ")} Would you like to keep exploring or review checkout?`
        : "Your cart is now empty. What would you like to explore?";
      if (operation.userText)
        state.messages.push({
          id: "reply:" + operation.id,
          role: "assistant",
          text,
          choices: ["Show me the collection", "Show me my cart"],
          presentation: { view: "cart" },
        });
      state.cartOperation = null;
      state.completedTurns = [
        ...(state.completedTurns || []),
        operation.id,
      ].slice(-40);
      state.messages = state.messages.slice(-40);
      await store.save(session.id, state);
      return result;
    }
    try {
      commerce =
        providedCommerce ||
        commerceFactory(request.headers.get("cf-connecting-ip") || "");
      session = await store.find(cookie);
      if (!session && path === "" && request.method === "GET") {
        const ip = request.headers.get("cf-connecting-ip") || "local";
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(ip + new Date().toISOString().slice(0, 10)),
        );
        const hash = Array.from(new Uint8Array(bytes), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        if (!(await store.consume("sessions:" + merchant.id + ":" + hash, 40)))
          return json(429, {
            error: "Too many new conversations. Please return later.",
          });
        session = await store.create();
        await store.cleanup();
      }
      if (!session)
        return json(401, {
          error: "Your conversation expired. Reload to start again.",
        });
      state = { ...emptySession(), ...session.state };
      if (mutation || state.cartOperation) {
        if (!(await store.lock(session.id)))
          return json(409, {
            error: "Your last change is still finishing. Please wait.",
          });
        locked = true;
        const fresh = await store.find(session.id);
        if (!fresh)
          throw Error("Your conversation expired. Reload to continue.");
        state = { ...emptySession(), ...fresh.state };
        if (state.cartOperation && request.method !== "DELETE")
          await completeCart(state.cartOperation);
      }
      if ((path === "" || path === "commerce") && request.method === "GET") {
        let commerceError = "";
        try {
          await loadCatalog();
          if (state.cart?.id) state.cart = await commerce.get(state.cart.id);
        } catch {
          commerceError =
            "We couldn’t refresh store details. Please refresh before buying.";
        }
        return json(
          200,
          { ...view(), commerceError },
          { "Set-Cookie": cookieHeader(session.id) },
        );
      }
      if (path === "checkout" && request.method === "GET") {
        const cart = await commerce.get(state.cart?.id);
        if (!cart?.totalQuantity)
          throw Error(
            "Your cart is empty or expired. Return to your cart to continue.",
          );
        if (demo)
          return new Response(null, {
            status: 303,
            headers: { ...headers, Location: url.origin + "/demo-checkout" },
          });
        const target = new URL(cart.checkoutUrl);
        if (
          target.protocol !== "https:" ||
          !checkoutHosts.includes(target.hostname)
        )
          throw Error(
            "Checkout is unavailable for this hostname. Return to your cart.",
          );
        return new Response(null, {
          status: 303,
          headers: { ...headers, Location: target.href },
        });
      }
      if (path.startsWith("image/") && request.method === "GET") {
        const asset = path.slice(6);
        if (
          ![state.photo?.id, ...state.previews.map((p) => p.id)].includes(asset)
        )
          return json(404, { error: "Image not found." });
        const object = await store.image(session.id, asset);
        if (!object)
          return json(404, { error: "Image unavailable. Upload it again." });
        return new Response(object.body, {
          headers: {
            ...headers,
            "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
            "Content-Security-Policy": "default-src 'none'",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        });
      }
      if (path === "" && request.method === "DELETE") {
        await store.remove(session.id, state);
        return json(200, { deleted: true }, { "Set-Cookie": cookieHeader("") });
      }
      if (path === "transcribe" && request.method === "POST") {
        if (!ai)
          return json(503, {
            error: "Transcription is not connected. You can keep typing.",
          });
        if (!(await store.consume("transcribe:" + session.id, 80)))
          return json(429, {
            error: "Voice has reached its allowance. You can keep typing.",
          });
        const raw = await readBounded(request, 3_000_000),
          form = await new Response(raw, {
            headers: {
              "Content-Type": request.headers.get("content-type") || "",
            },
          }).formData(),
          file = form.get("audio");
        if (
          !(file instanceof File) ||
          !["audio/webm", "audio/mp4", "audio/ogg", "video/webm"].some((t) =>
            file.type.startsWith(t),
          )
        )
          throw Error("Use a supported audio recording.");
        return json(200, { text: await ai.transcribe(file) });
      }
      if (path === "upload" && request.method === "POST") {
        if (!features.previews || !merchant.tools?.photoPreview || !ai)
          return json(503, {
            error: "Photo concepts are not enabled for this storefront.",
          });
        if (!(await store.consume("upload:" + session.id, 20)))
          return json(429, { error: "Photo upload allowance reached." });
        const raw = await readBounded(request, 5_500_000),
          form = await new Response(raw, {
            headers: {
              "Content-Type": request.headers.get("content-type") || "",
            },
          }).formData(),
          file = form.get("photo");
        if (!(file instanceof File) || !file.size || file.size > 5_000_000)
          throw Error("Choose a JPG, PNG or WebP under 5 MB.");
        const bytes = new Uint8Array(await file.arrayBuffer()),
          type = imageType(bytes);
        if (!type) throw Error("Choose a JPG, PNG or WebP image.");
        const previousImages = [
          state.photo?.id,
          ...state.previews.map((p) => p.id),
        ].filter(Boolean);
        state.photo = { id: await store.put(session.id, bytes, type) };
        state.previews = [];
        await store.save(session.id, state);
        await store.deleteImages?.(session.id, previousImages);
        await loadCatalog();
        return json(200, view());
      }
      if (request.method !== "POST")
        return json(405, { error: "This action is unavailable." });
      const body = JSON.parse(
        new TextDecoder().decode(await readBounded(request, 12000)),
      );
      if (path === "video-closed") {
        if (
          !merchant.video ||
          !["ended", "dismissed"].includes(body.reason) ||
          !/^[a-f0-9-]{36}$/.test(body.eventId || "")
        )
          throw Error("Invalid video event.");
        await loadCatalog();
        state.presentation = { view: "collection" };
        const messageId = "video:" + body.eventId;
        if (!state.messages.some((m) => m.id === messageId))
          state.messages.push({
            id: messageId,
            role: "assistant",
            text:
              body.reason === "ended"
                ? "What would help you decide next: comparing options or reviewing your cart?"
                : "What would you like to explore next?",
            choices: ["Compare products", "Show me my cart"],
            presentation: { view: "collection" },
          });
        state.messages = state.messages.slice(-40);
        await store.save(session.id, state);
        return json(200, view());
      }
      const turnId = body.turnId || crypto.randomUUID();
      if (!/^[a-f0-9-]{36}$/.test(turnId))
        throw Error("Invalid request identifier.");
      await loadCatalog();
      if (state.cart?.id) state.cart = await commerce.get(state.cart.id);
      if (state.completedTurns?.includes(turnId))
        return path === "chat"
          ? new Response(JSON.stringify({ state: view() }) + "\n", {
              headers: { ...headers, "Content-Type": "application/x-ndjson" },
            })
          : json(200, view());
      if (path === "cart") {
        const change =
          body.clear === true
            ? { clear: true }
            : { variantId: body.variantId, quantity: body.quantity };
        if (!change.clear && !findVariant(catalog, change.variantId))
          throw Error("Select an option from the configured catalog.");
        if (
          !change.clear &&
          (!Number.isInteger(change.quantity) ||
            change.quantity < 0 ||
            change.quantity > MAX_QUANTITY)
        )
          throw Error("Choose a quantity from 0 to " + MAX_QUANTITY + ".");
        state.cartOperation = { id: turnId, change };
        await store.save(session.id, state);
        const result = await completeCart(state.cartOperation);
        return json(200, { ...view(), warnings: result.warnings });
      }
      if (path !== "chat") return json(404, { error: "Action not found." });
      if (
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 2000
      )
        throw Error("Write a message between 1 and 2,000 characters.");
      if (
        !(await store.consume("chat:" + session.id, 120)) ||
        !(await store.consume("chat:global", 1500))
      )
        return json(429, {
          error:
            "The assistant is at capacity today. Your conversation is saved.",
        });
      const message = body.message.trim(),
        decision = cartDecision(
          trustedContext?.turnId === turnId
            ? { ...state, ...trustedContext.shoppingContext, cart: state.cart }
            : state,
          message,
          catalog,
        );
      if (decision?.cartChange) {
        if (decision.selection) {
          state.selectedProductId = decision.selection.productId;
          state.selectedVariantId = decision.selection.variantId;
        }
        state.cartOperation = {
          id: turnId,
          change: decision.cartChange,
          userText: message,
        };
        await store.save(session.id, state);
        await completeCart(state.cartOperation);
      } else {
        const selected = selectionFor(message, catalog);
        if (selected) {
          state.selectedProductId = selected.productId;
          state.selectedVariantId = selected.variantId;
        }
        const result =
          decision ||
          (ai
            ? await ai.decision(publicSession(state), message, catalog)
            : scriptedDecision(state, message, catalog, merchant));
        if (result.selection) {
          state.selectedProductId = result.selection.productId;
          state.selectedVariantId = result.selection.variantId;
        }
        state.pendingCart = result.pendingCart || null;
        if ("lastCartVariantId" in result)
          state.lastCartVariantId = result.lastCartVariantId;
        state.presentation = validatePresentation(
          result.presentation,
          catalog,
          merchant,
        );
        let previewId;
        if (
          result.previewInstruction &&
          features.previews &&
          merchant.tools?.photoPreview &&
          state.photo &&
          ai &&
          /photo|image|preview|concept|visuali[sz]e/i.test(message)
        ) {
          if (
            !(await store.consume("preview:" + session.id, 8)) ||
            !(await store.consume("preview:global", 40)) ||
            state.previews.length >= 8
          )
            throw Error(
              "Photo concept allowance reached. Your existing images are saved.",
            );
          const original = await store.image(session.id, state.photo.id),
            bytes = await ai.preview({
              original,
              instruction: result.previewInstruction,
              sessionId: session.id,
            });
          previewId = await store.put(session.id, bytes, "image/jpeg");
          state.previews.push({ id: previewId, title: "Your concept" });
          state.presentation = { view: "concept", previewId };
        }
        if (!state.messages.some((m) => m.id === turnId))
          state.messages.push({ id: turnId, role: "user", text: message });
        state.messages.push({
          id: "reply:" + turnId,
          role: "assistant",
          text: String(result.reply || "What would you like to explore?").slice(
            0,
            1800,
          ),
          choices: (result.choices || [])
            .filter((c) => typeof c === "string" && c.length <= 100)
            .slice(0, 4),
          presentation: state.presentation,
        });
        state.messages = state.messages.slice(-40);
        state.completedTurns = [...(state.completedTurns || []), turnId].slice(
          -40,
        );
        await store.save(session.id, state);
      }
      return new Response(JSON.stringify({ state: view() }) + "\n", {
        headers: { ...headers, "Content-Type": "application/x-ndjson" },
      });
    } catch (error) {
      return json(400, {
        error:
          error instanceof Error
            ? error.message
            : "That request could not finish. Please try again.",
      });
    } finally {
      if (locked && session) await store.unlock(session.id);
    }
  };
}
