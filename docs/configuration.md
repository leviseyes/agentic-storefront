# Configuration

## Choose a merchant

The default export in `storefront.config.js` selects `examples/outdoor/storefront.js`. Vite’s `coffee` mode selects `examples/coffee/storefront.js` on both client and server. Use `npm run dev:coffee` or `npm run build:coffee`. Stop the current local dev server before switching examples; they share local D1 storage in this checkout. Production deployments can replace that selector with a single merchant import.

Each example is a complete configuration contract. Keep stable, unique IDs. Configure:

| Field | Purpose |
| --- | --- |
| `id`, `name`, `guide` | Merchant identity, scoped session cookie and consistent guide name |
| `currency`, `country`, `locale` | Sample money formatting and Shopify buyer context |
| `headline`, `introduction`, `openingQuestion`, `openingChoices` | First-run experience and suggestions |
| `hero` | Owned image, descriptive alt text and caption |
| `policies` | Merchant-verified shipping, returns and contact text |
| `products` | Up to 20 products with stable IDs, handles, aliases, descriptions, facts, use cases and images |
| `products[].variants` | Up to 100 uniquely identified options with title, sample price and availability |
| `products[].visuals` | Optional authored image or GLB model, identified by ID and label |
| `video` | `null`, or `{youtubeId, title}` for an authorized YouTube walkthrough |
| `tools.photoPreview` | `null`, or `{instructions}` for a category-specific photo concept tool |

Every variant ID is unique across the whole catalog. Aliases help literal requests such as “add two pouches” resolve correctly. Prefer distinctive variant names; ambiguous product or option requests are clarified instead of guessed. A bare number does not authorize an addition. “Add” increments, “set/make” sets the total, “remove two” subtracts, “remove the pouch” removes that option, and “empty my cart” clears all lines. Negated and hypothetical requests do not mutate the cart. Keep supported commands easy to find through suggestions.

Default sample prices, availability and facts are fictional. In Shopify mode prices and stock come from Shopify; authored facts and policies still require merchant review. Product images from Shopify replace the configured overview when available. Authored alternate visuals stay configured.

## Optional visuals

```js
visuals: [
  {id: 'detail', type: 'image', label: 'Detail', src: '/my-shop/detail.jpg', alt: 'Close view of the product'},
  {id: 'model', type: 'model', label: '3D model', src: '/my-shop/product.glb', alt: 'Interactive product model'}
]
```

Only local paths or HTTPS sources are accepted. The agent chooses a configured ID, never an arbitrary source. GLB models are loaded on demand and support rotate, zoom and reset controls. Convert STEP/STP to a web-ready GLB using your CAD workflow before adding it. Ship only assets you may distribute.

Photo concepts are optional. See `extensions/photo-concepts.js` for a configuration snippet. Configure the instructions for your category, enable OpenAI, and explain the provider upload to visitors. Concepts are illustrative, not measured fit or safety evidence. Both bundled merchants leave photo uploads disabled.

## Server environment

Copy `.env.example` to the ignored `.dev.vars`. Restart local development after changes. Never put secrets in client-facing environment variables.

`COMMERCE_MODE=demo` uses local sample commerce. OpenAI, xAI and ElevenLabs keys are independent of that choice. No credentials are bundled or created by the repository.

- `OPENAI_API_KEY`: conversational text and fallback transcription. Defaults: `OPENAI_MODEL=gpt-5.4-mini`, `IMAGE_MODEL=gpt-image-2`; transcription uses `gpt-4o-mini-transcribe`. Images are used only when the merchant photo tool is configured and requested.
- `XAI_API_KEY` plus `GROK_VOICE_ENABLED=true`: realtime `grok-voice-3.0`. The browser gets a constrained stream, never the provider key. Presets are in `server/voice-agent.mjs`.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`: speech output. Optional `ELEVENLABS_FEMALE_VOICE_ID`; default model `eleven_v4`. OpenAI is needed for fallback recorded-input transcription. ElevenLabs does not reason about shopping.

Provider access, model availability and billing depend on your account. Voice requires HTTPS or localhost, sound activation, and microphone permission for spoken input. Browser autoplay rules still apply.

## Shopify

Set product `handle` values in your merchant configuration, then map **every** local variant ID to its real Shopify ProductVariant GID:

```dotenv
COMMERCE_MODE=shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_VARIANT_MAP_JSON={"daypack-sand":"gid://shopify/ProductVariant/111","daypack-ink":"gid://shopify/ProductVariant/112","bottle-500":"gid://shopify/ProductVariant/113","bottle-750":"gid://shopify/ProductVariant/114","pouch-rust":"gid://shopify/ProductVariant/115"}
SHOPIFY_CHECKOUT_DOMAIN=shop.your-domain.example
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=
```

The mapping above illustrates the outdoor example; use your real IDs. Each option must map to a different variant. The server verifies that Shopify returns the configured product handle. Products must be published to the appropriate storefront channel. An alternative is an authored `shopifyId` per variant; environment mappings override it.

Use a canonical `myshopify.com` hostname without protocol or path. The adapter uses [Storefront API 2026-10](https://shopify.dev/docs/api/storefront/2026-10), queries configured variant IDs in batches, and updates only the requested cart line. It supports tokenless operations where permitted; otherwise use a narrowly scoped **private Storefront token**, sent server-side through `Shopify-Storefront-Private-Token`. Do not supply an Admin token. Buyer IP is forwarded from Cloudflare’s trusted header.

Checkout is re-fetched and restricted to HTTPS on the exact configured myshopify.com or checkout hostname. Shopify calculates shipping, taxes and eligible discounts and enforces inventory, payment and order creation. This app does not manage fulfillment, Admin inventory, customer accounts, subscriptions or discounts. Test with a development store first.
