import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoCommerce} from '../server/demo.mjs';
import {commerceFor} from '../server/bootstrap.mjs';
import {createCommerce,VARIANT_ID} from '../server/wall-commerce.mjs';
test('keyless commerce stays local, persists quantities and cannot produce a live checkout',async()=>{
 const commerce=commerceFor({});const product=await commerce.product();assert.equal(product.price.amount,'16.00');assert.equal(product.url,'/demo-checkout');
 for(const quantity of [20,5,0]){const {cart}=await commerce.setQuantity(null,quantity);const restored=await createDemoCommerce().get(cart.id);assert.equal(restored.totalQuantity,quantity);assert.equal(restored.checkoutUrl,'/demo-checkout');assert.equal(restored.cost.subtotalAmount.amount,(quantity*16).toFixed(2));}
 for(const quantity of [-1,21,1.5])await assert.rejects(commerce.setQuantity(null,quantity));
 assert.equal(await commerce.get('gid://shopify/Cart/a-private-cart'),null);
});
test('live commerce requires deliberate domain, handle and variant configuration',()=>{
 assert.throws(()=>commerceFor({COMMERCE_MODE:'shopify'}),/domain/);
 assert.throws(()=>createCommerce(fetch,{shopDomain:'evil.test'}),/myshopify/);
 assert.throws(()=>createCommerce(fetch,{variantId:'not-a-variant'}),/variant/);
});
test('private storefront credentials stay in the server request header',async()=>{
 let sent;const commerce=createCommerce(async(url,args)=>{sent={url,...args};return Response.json({data:{product:{title:'Test',availableForSale:true,variants:{nodes:[{id:VARIANT_ID,availableForSale:true,price:{amount:'9',currencyCode:'USD'}}]}}}});},{shopDomain:'sample.myshopify.com',productHandle:'sample',privateToken:'test-only-placeholder',buyerIp:'192.0.2.1'});
 const product=await commerce.product();assert.equal(sent.url,'https://sample.myshopify.com/api/2026-10/graphql.json');assert.equal(sent.headers['Shopify-Storefront-Private-Token'],'test-only-placeholder');assert.equal(sent.headers['Shopify-Storefront-Buyer-IP'],'192.0.2.1');assert.equal(JSON.stringify(product).includes('test-only-placeholder'),false);
});
