# Deploy to your own Cloudflare account

Local `npm run dev` needs no Cloudflare login. Public hosting uses **your own** Cloudflare Workers, D1 and R2 resources. Cloudflare and AI usage can incur costs. This repository does not share the original merchant’s hosting or credentials.

1. Install dependencies with `npm ci` using Node 24 or 26.
2. Run `npx wrangler login` and authenticate to your own account.
3. Create resources:

```sh
npx wrangler d1 create agentic-storefront
npx wrangler r2 bucket create agentic-storefront-uploads
```

4. Replace the placeholder `database_id` in `wrangler.jsonc` with the D1 ID returned above. Match the R2 bucket name. The all-zero ID is a local placeholder, not a deployed resource. Choose a unique Worker name for your account.
5. Keep the initial public demo on `COMMERCE_MODE=demo`, `GROK_VOICE_ENABLED=false`. Configure real provider secrets only when you intend to expose those paid features:

```sh
npx wrangler secret put OPENAI_API_KEY
# Optional: XAI_API_KEY, ELEVENLABS_API_KEY, SHOPIFY_STOREFRONT_PRIVATE_TOKEN
```

Public non-secret variables such as the variant mapping, voice IDs and checkout hostname go in Wrangler vars. `.dev.vars` is local only and is not the production secret source.

6. Apply migrations remotely and deploy:

```sh
npx wrangler d1 migrations apply agentic-storefront --remote
npm run deploy
```

The build produces the Cloudflare Worker/asset configuration under `dist/`; Wrangler uses the generated deploy configuration. Check the reported URL, create a fresh session, test cart changes, verify the demo checkout stays local, and test voice only after opting into a configured provider. For live Shopify, test a development store checkout without placing a paid order first.

Set up your own domain through Cloudflare’s Worker settings if desired. No domain, customer records or Admin credentials from the original store are required.

See [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) for the deployment model. The local build is verified; publishing to a new Cloudflare account is an operator step, not a hosted demo included with this release.


## Build the desired merchant

`npm run build` builds Fieldwork. `npm run build:coffee` builds Daybreak. To deploy coffee, run its build followed by `npx wrangler deploy`; the default `npm run deploy` rebuilds the default merchant. For a real store, replace the selector in `storefront.config.js` with one merchant import, configure the variant map and run the default deploy. Both client and worker must use the same build mode.

Version 0.2 uses a new merchant-scoped session cookie. Older demo sessions are not migrated. This changes the open-source starter only; it does not update any separately hosted merchant website.
