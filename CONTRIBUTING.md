# Contributing

Start with `npm ci` and `npm run dev` on Node 24+. The keyless demo is the default development path; contributions should not require private credentials or a real Shopify order.

Before opening a pull request, run `npm test`, `npm run typecheck`, `npm run build` and `npm run check:public`. Explain the user-visible problem and validation. Include desktop and mobile screenshots for interface changes, and a focused regression test when changing cart consent, quantities, audio lifecycle, session isolation or checkout behavior.

Keep agent actions small and server-validated. Never trust a model’s claimed quantity, HTML or arbitrary URL. Do not add Admin actions or payment collection to the public chat. Keep commercial secrets, real customer photos, transcripts, product CAD and unlicensed media out of fixtures and screenshots.

For a new provider, preserve cancellation, mute and interruption semantics. A mock-only test does not establish provider latency; label measurements with the environment and method. Discuss large architecture changes in an issue before implementing them.

Good first contributions: accessibility improvements backed by rendered checks, additional cart-intent language cases with clear consent, better configuration diagnostics, and documented product-scene adapters.

Be respectful, specific and constructive in issues and reviews. Security reports belong in [SECURITY.md](SECURITY.md), not public bug reports.
