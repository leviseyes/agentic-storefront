# Architecture

The same merchant configuration feeds the React visual stage, scripted guide, model instructions, variant resolution and commerce adapter. `defineStorefront()` validates it before use. The two example merchants change content, not engine code.

## Request flow

1. `worker.ts` routes `/api/studio`, voice, speech and static assets.
2. `server/bootstrap.mjs` chooses demo or Shopify commerce and independently enables configured providers.
3. `server/store-api.mjs` loads a private anonymous session, validates origin, acquires a session lock for changes and resolves cart requests through `server/shopping.mjs`.
4. Explicit cart changes run before AI reasoning. Other turns use scripted decisions or the structured OpenAI adapter in `server/store-ai.mjs`.
5. Presentation IDs are validated against the configured catalog. The browser renders authored React components in `client/VisualStage.tsx`; no model HTML or arbitrary URL is executed.
6. `server/commerce.mjs` returns actual cart quantities, prices and stock from the selected adapter. Public state omits cart keys, checkout URLs and Shopify line IDs.

The live voice engine in `server/voice-agent.mjs` uses the same shopping rules and Store API. Its `change_cart` tool has no model-supplied product or quantity parameters. The server resolves the visitor’s words and original selection context. Voice transcripts are revised by utterance ID rather than appended repeatedly. Provider audio bypasses slow persistence work; cancellation barriers discard late audio from interrupted responses.

## Cart consistency

“Add” resolves to a total using fresh cart state. The server saves that total target before a mutation, then saves Shopify’s returned cart. A repeated UUID returns its completed result instead of adding again. An unfinished operation can replay the total target under a session lock. If the provider returns an error and a fresh cart read succeeds, the failed intent is discarded so a visitor can try another option. If connectivity prevents recovery, the intent remains recoverable; New conversation can discard it.

This is bounded retry protection, not transactional exactly-once delivery across Shopify and D1. A lost create response can leave an orphan cart because Shopify and D1 do not share a transaction. Only the cart whose ID was successfully saved is used for checkout. Completed request IDs are retained for the last 40 turns; this is not a general payments idempotency service.

## Sessions and assets

Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, scoped by merchant ID and session version. Anonymous state expires after seven days. D1 holds messages, selection, private cart references, pending operations and optional image references. R2 stores optional private image bytes; asset endpoints require ownership by the same session. New conversation clears the local project and images, not Shopify orders or remote carts. Small request-time sweeps remove expired sessions; configure an R2 lifecycle as an additional retention backstop.

Historical D1 table names retain the `wall_` prefix for migration compatibility; they impose no product-category behavior. Runtime modules and prompts are category-neutral. Replacing an image clears prior image references and bytes.

## Boundaries

This is a curated catalog, not full-text search across an entire Shopify shop. Unknown cart lines are shown read-only and can be reviewed at Shopify checkout. Local limits: 20 products, 100 variants per product, 20 configured cart lines, 20 units per option. The cart query reads the first 100 lines; do not reuse an externally expanded cart beyond this bound.

Limits and locks in D1 guard session creation, chat, uploads, optional image generation and live voice. ElevenLabs proxy limits are per Worker isolate and do not replace edge-wide abuse protection. Add account-specific budgets, alerts and public traffic controls before production scale.

Voice and AI are optional. The default demos make no runtime provider requests. Paid-provider behavior and merchant checkout still need staging verification with the deployer’s own accounts.
