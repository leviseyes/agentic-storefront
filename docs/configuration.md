# Configuration

The default is offline-style demo commerce with scripted responses. It makes no Shopify or AI requests. Local tooling may access npm or perform its own update/telemetry checks; this is not an air-gapped development environment.

Copy `.env.example` to `.dev.vars` in the project root. Wrangler/Vite reads this ignored file. Restart the dev server after changing configuration. Never use public frontend environment variables for provider secrets.

## Public merchant content

`storefront.config.js` defines the brand, guide, sample product name, sample price, currency and optional `videoId`. Set `videoId` to a YouTube video you are allowed to embed; blank uses the original local walkthrough. No YouTube script is loaded by the default walkthrough.

This release contains a complete **single-product wall-mount example**. Renaming the config is a starting point, not a catalog importer. Replace `client/shared/product-knowledge.js`, `client/shared/catalog.js`, deterministic replies in `server/wall-conversation.mjs`, and product-specific copy in `server/wall-ai.mjs`, `server/grok-voice.mjs`, `client/wall/ProductStage.tsx` and `client/wall/narration.ts`. Swap assets under `public/` and the procedural scene in `client/wall/hanger-scene.ts`. Check the guide capabilities against features you actually enable.

Sample capacities, compatibility and kit contents are fictional fixtures. Verify real installation and policy claims with the merchant before enabling checkout. `DESIGN.md` records the visual language.

## OpenAI text and photo concepts

Set `OPENAI_API_KEY` to your own server-side key. `OPENAI_MODEL` defaults to `gpt-5.4-mini`; `IMAGE_MODEL` defaults to `gpt-image-2`. Access and billing depend on your provider account. Image editing uses the Responses decision followed by the Images edits endpoint; transcription uses `gpt-4o-mini-transcribe`.

Without the key, text uses explicit scripted replies and photo upload is disabled. With the key, uploaded photos can be sent to OpenAI for a requested concept. Do not infer measurements, load ratings or installation safety from a generated image. No API key is bundled, provisioned or shared by this repository.

## Voice

For realtime speech, set `XAI_API_KEY` and `GROK_VOICE_ENABLED=true`. The server opens xAI’s realtime connection with `grok-voice-3.0`; the browser receives a constrained event stream, not your key. The two sample voice presets are configured in `server/grok-voice.mjs`.

For ElevenLabs speech, set `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` and optionally `ELEVENLABS_FEMALE_VOICE_ID`. `ELEVENLABS_MODEL` defaults to `eleven_v4`. Select voices available to your account. Use OpenAI too for fallback microphone transcription. ElevenLabs is speech output, not the conversational reasoning engine.

Voice needs a secure browser context (HTTPS or localhost), user sound activation, and microphone permission for spoken input. Mute and interruption cancel pending output. There is no avatar service dependency.

Provider names and model defaults are implementation choices, not guaranteed latency or availability claims. Check your provider account’s model access before enabling public traffic.

## Shopify

Keep `COMMERCE_MODE=demo` until you are ready to use a real cart. Then set:

```dotenv
COMMERCE_MODE=shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_PRODUCT_HANDLE=your-product-handle
SHOPIFY_VARIANT_ID=gid://shopify/ProductVariant/123456789
SHOPIFY_CHECKOUT_DOMAIN=your-store.example
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=
```

Use your canonical **myshopify.com** hostname without `https://` or paths. Publish the product to the appropriate storefront sales channel and supply the full variant GID. The current query reads the first 10 variants; extend it if your selected variant is outside that range.

The adapter is pinned to **Storefront API 2026-10** with US buyer context. It supports tokenless product/cart operations where the store permits them; if needed, supply a **private Storefront token** with only the necessary product and cart permissions. It is sent in the server-side `Shopify-Storefront-Private-Token` header. Do not use an Admin token. The buyer IP is forwarded through Shopify’s documented header when present at Cloudflare’s trusted edge.

Checkout redirects are limited to HTTPS on the configured myshopify.com hostname or exact `SHOPIFY_CHECKOUT_DOMAIN`. A live cart is re-fetched before redirect. Taxes, shipping, inventory enforcement, discounts, payment and order creation happen in Shopify. The starter does not manage fulfillment, synchronize Admin records, create discounts, or bypass checkout.

The demo adapter cannot hand off to a real store, even when AI is enabled. `COMMERCE_MODE` controls commerce separately from AI keys. Test with a development store before using a production merchant.

Primary reference: [Shopify Storefront API](https://shopify.dev/docs/api/storefront/2026-10).
