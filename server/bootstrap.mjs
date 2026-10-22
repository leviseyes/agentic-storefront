import {createWallApi} from './wall-api.mjs';
import {createCommerce} from './wall-commerce.mjs';
import {createDemoAI,createDemoCommerce} from './demo.mjs';
export function commerceFor(env,buyerIp=''){
  if(env.COMMERCE_MODE!=='shopify')return createDemoCommerce();
  if(!env.SHOPIFY_STORE_DOMAIN||!env.SHOPIFY_PRODUCT_HANDLE||!env.SHOPIFY_VARIANT_ID)throw Error('Set your Shopify store domain, product handle and variant ID before enabling live commerce.');
  return createCommerce(fetch,{buyerIp,shopDomain:env.SHOPIFY_STORE_DOMAIN,productHandle:env.SHOPIFY_PRODUCT_HANDLE,variantId:env.SHOPIFY_VARIANT_ID,privateToken:env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN||''});
}
export function createConfiguredApi(env){
  const demo=env.COMMERCE_MODE!=='shopify';
  return createWallApi({db:env.DB,bucket:env.BUCKET,key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-5.4-mini',imageModel:env.IMAGE_MODEL||'gpt-image-2',
    ai:env.OPENAI_API_KEY?undefined:createDemoAI(),commerceFactory:buyerIp=>commerceFor(env,buyerIp),demoCheckout:demo,
    checkoutHosts:[env.SHOPIFY_STORE_DOMAIN,env.SHOPIFY_CHECKOUT_DOMAIN].filter(Boolean),
    features:{demo,scripted:!env.OPENAI_API_KEY,voice:Boolean(env.XAI_API_KEY&&env.GROK_VOICE_ENABLED==='true'||env.ELEVENLABS_API_KEY&&env.ELEVENLABS_VOICE_ID),previews:Boolean(env.OPENAI_API_KEY)},
  });
}
