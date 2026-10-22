declare namespace Cloudflare {interface Env {
    ASSETS: Fetcher;
  DB?:D1Database; BUCKET?:R2Bucket; COMMERCE_MODE?:string;
  OPENAI_API_KEY?:string; OPENAI_MODEL?:string; IMAGE_MODEL?:string;
  XAI_API_KEY?:string; GROK_VOICE_ENABLED?:string;
  ELEVENLABS_API_KEY?:string; ELEVENLABS_VOICE_ID?:string; ELEVENLABS_FEMALE_VOICE_ID?:string; ELEVENLABS_MODEL?:string;
  SHOPIFY_STORE_DOMAIN?:string; SHOPIFY_PRODUCT_HANDLE?:string; SHOPIFY_VARIANT_ID?:string; SHOPIFY_CHECKOUT_DOMAIN?:string; SHOPIFY_STOREFRONT_PRIVATE_TOKEN?:string;
}}
