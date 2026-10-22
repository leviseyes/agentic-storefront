import { storefront } from "../storefront.config.js";
import { createStoreApi } from "./store-api.mjs";
import { createDemoCommerce, createShopifyCommerce } from "./commerce.mjs";
import { createStoreAI } from "./store-ai.mjs";
export function commerceFor(env, buyerIp = "", merchant = storefront) {
  if (env.COMMERCE_MODE !== "shopify") return createDemoCommerce(merchant);
  let variantMap;
  try {
    variantMap = JSON.parse(env.SHOPIFY_VARIANT_MAP_JSON || "{}");
  } catch {
    throw Error("SHOPIFY_VARIANT_MAP_JSON must be a JSON object.");
  }
  return createShopifyCommerce(merchant, {
    shopDomain: env.SHOPIFY_STORE_DOMAIN,
    privateToken: env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN || "",
    variantMap,
    buyerIp,
  });
}
export function createConfiguredApi(env) {
  return createStoreApi({
    merchant: storefront,
    db: env.DB,
    bucket: env.BUCKET,
    commerceFactory: (ip) => commerceFor(env, ip),
    ai: env.OPENAI_API_KEY
      ? createStoreAI({
          key: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL,
          imageModel: env.IMAGE_MODEL,
          merchant: storefront,
        })
      : null,
    demo: env.COMMERCE_MODE !== "shopify",
    checkoutHosts: [
      env.SHOPIFY_STORE_DOMAIN,
      env.SHOPIFY_CHECKOUT_DOMAIN,
    ].filter(Boolean),
    features: {
      voice: Boolean(
        (env.XAI_API_KEY && env.GROK_VOICE_ENABLED === "true") ||
          (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),
      ),
      transcribe: Boolean(env.OPENAI_API_KEY),
      previews: Boolean(env.OPENAI_API_KEY && storefront.tools?.photoPreview),
    },
  });
}
