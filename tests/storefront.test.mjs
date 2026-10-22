import test from 'node:test';
import assert from 'node:assert/strict';
import outdoor from '../examples/outdoor/storefront.js';
import coffee from '../examples/coffee/storefront.js';
import {defineStorefront,publicCatalog,safeAsset} from '../shared/storefront.js';
import {emptySession} from '../server/session-store.mjs';
import {cartDecision,resolveCartChange,selectionFor,scriptedDecision,validatePresentation} from '../server/shopping.mjs';
import {createDemoCommerce,safeCart} from '../server/commerce.mjs';
const merchant=defineStorefront(outdoor),products=publicCatalog(merchant);
test('two unrelated merchants use the same configuration and shopping engine',()=>{
 for(const config of [outdoor,coffee]){const m=defineStorefront(config),catalog=publicCatalog(m);assert.equal(catalog.length,3);assert.equal(scriptedDecision(emptySession(),'Show me the collection',catalog,m).presentation.view,'collection');assert.match(scriptedDecision(emptySession(),'Shipping?',catalog,m).reply,/demo/i);}
 assert.equal(publicCatalog(defineStorefront(coffee))[2].variants[1].available,false);
});
test('merchant validation rejects duplicate options, unsafe visuals and invalid prices',()=>{
 for(const mutate of [m=>m.products[1].variants[0].id=m.products[0].variants[0].id,m=>m.products[0].variants[0].price='-1',m=>m.products[0].image.src='javascript:alert(1)',m=>m.hero.src='//untrusted.test/a']){const m=structuredClone(outdoor);mutate(m);assert.throws(()=>defineStorefront(m));}
 for(const s of ['javascript:alert(1)','//evil.test/a','/\\evil.test/a','https://user:pass@example.test/a'])assert.equal(safeAsset(s),false,s);
});
test('explicit requests resolve product, variant and arithmetic without assuming specifications are counts',async()=>{
 const commerce=createDemoCommerce(merchant),state=emptySession();state.cart=(await commerce.setLineQuantity(null,'pouch-rust',3)).cart;state.selectedProductId='pouch';state.selectedVariantId='pouch-rust';
 for(const [input,quantity]of [['just add twenty',23],['Remove two pouches',1],['Make it five',5],['Remove the pouch',0],['Add 2 Utility Pouches',5]])assert.equal(resolveCartChange(state,input,products).quantity,quantity,input);
 assert.equal(resolveCartChange(emptySession(),'Add 1 bottle 750 ml',products).quantity,1);
 assert.equal(resolveCartChange(emptySession(),'Add a bottle 750 ml',products).quantity,1);
 assert.equal(resolveCartChange(emptySession(),'Add a daypack',products).clarify,'variant');
 assert.equal(resolveCartChange(emptySession(),'Add one',products).clarify,'product');
 assert.equal(resolveCartChange(state,'Set the quantity',products).clarify,'quantity');
 assert.equal(resolveCartChange(state,'Add -2 pouches',products).clarify,'quantity');
});
test('negations, hypothetical questions and general desires never authorize cart changes',()=>{
 for(const text of ["Don't add a pouch",'Do not remove anything','If I add 3 pouches','Maybe add a pouch','How can I add a pouch?','Could you explain adding a pouch?','I want a daypack','Show me my cart'])assert.equal(resolveCartChange(emptySession(),text,products),null,text);
});
test('variant clarification preserves relative addition and does not select unavailable options',async()=>{
 const state=emptySession(),commerce=createDemoCommerce(merchant);state.cart=(await commerce.setLineQuantity(null,'daypack-ink',3)).cart;
 const question=cartDecision(state,'Add two daypacks',products);assert.equal(question.presentation.view,'product');state.pendingCart=question.pendingCart;
 assert.deepEqual(cartDecision(state,'Ink',products).cartChange,{variantId:'daypack-ink',quantity:5});
 const stock=cartDecision(emptySession(),'Add 1 ground coffee',publicCatalog(defineStorefront(coffee)));assert.equal(stock.cartChange,undefined);assert.match(stock.reply,/unavailable/);
});
test('the demo cart preserves other items, sums prices exactly and bounds each line',async()=>{
 const commerce=createDemoCommerce(merchant);let result=await commerce.setLineQuantity(null,'pouch-rust',2);result=await commerce.setLineQuantity(result.cart.id,'bottle-500',3);assert.equal(result.cart.totalQuantity,5);assert.equal(result.cart.cost.subtotalAmount.amount,'108.00');
 const saved=await commerce.get(result.cart.id);result=await commerce.setLineQuantity(saved.id,'pouch-rust',1);assert.equal(result.cart.totalQuantity,4);assert.equal(result.cart.lines.nodes[1].quantity,3);
 result=await commerce.setLineQuantity(result.cart.id,'bottle-500',0);assert.equal(result.cart.totalQuantity,1);assert.equal(safeCart(result.cart).lines[0].variantId,'pouch-rust');
 await assert.rejects(commerce.setLineQuantity(result.cart.id,'pouch-rust',21),/quantity/);await assert.rejects(commerce.setLineQuantity('expired','pouch-rust',1),/previous cart/);assert.equal((await commerce.clear(result.cart.id)).cart.totalQuantity,0);
});
test('presentations only expose configured IDs and sources never come from the model',()=>{
 const state={...emptySession(),selectedProductId:'bottle'};assert.equal(selectionFor('Show me 750 ml Trail Bottle',products).variantId,'bottle-750');
 assert.deepEqual(validatePresentation({view:'product',productId:'bottle',variantId:'daypack-ink',visualId:'https://evil.test'},products,merchant),{view:'product',productId:'bottle'});
 assert.deepEqual(validatePresentation({view:'product',productId:'evil'},products,merchant),{view:'collection'});
 assert.deepEqual(validatePresentation({view:'video'},products,merchant),{view:'collection'});
 assert.deepEqual(scriptedDecision(state,'Compare options',products,merchant).presentation.productIds,['bottle']);assert.equal(scriptedDecision(state,'Compare products',products,merchant).presentation.productIds.length,3);
});
