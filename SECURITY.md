# Security

This is an early single-product starter. Version 0.1.x is the supported development line; there is no security response SLA.

Do not post API keys, personal photos, private transcripts, checkout tokens or exploitable security details in public issues. Use GitHub’s **Report a vulnerability** option if available. Otherwise, open an issue asking for a private reporting channel without including the exploit or sensitive material; wait for a maintainer to provide one.

Never commit `.dev.vars`, `.env.local`, Wrangler state or customer assets. If a key leaks, revoke it at its provider immediately; deleting it from the latest commit is insufficient. Review permissions and spending limits before connecting paid providers to public traffic.

The public customer agent intentionally uses Storefront cart operations rather than Shopify Admin access. Keep secrets server-side and avoid extending the agent with arbitrary network, filesystem or privileged store actions.
