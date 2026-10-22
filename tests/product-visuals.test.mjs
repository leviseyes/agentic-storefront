import test from 'node:test';
import assert from 'node:assert/strict';
import {productViews,isProductView,spokenProductView,visualInstructions} from '../client/shared/product-visuals.js';
import {shoppingDecision} from '../server/wall-conversation.mjs';
import {validateDecision} from '../server/wall-ai.mjs';
import {emptyWallState} from '../server/wall-store.mjs';

const product={available:true,price:{amount:'15.99',currencyCode:'USD'}};
test('visual requests show real product material without opening a video or modifying a cart',()=>{
 const state=emptyWallState();
 for(const [request,view] of [['Show me the 3D model','product'],['Show the back','product-back'],['Separate the parts','product-parts'],['Show me a product photo','product-photo'],["What's included?",'contents']]){
  const decision=shoppingDecision(state,request,product);assert.equal(decision.presentation,view);assert.equal(decision.action,'none');assert.equal(decision.cartQuantity,0);assert.ok(decision.choices.length>=2);
 }
});
test('only allowlisted visual identifiers survive structured AI decisions',()=>{
 const base={reply:'A product reply?',plan:emptyWallState().plan,action:'none',cartQuantity:0};
 for(const view of productViews)assert.equal(validateDecision({...base,presentation:view}).presentation,view);
 assert.equal(validateDecision({...base,presentation:'https://untrusted.test/model.glb'}).presentation,'none');assert.equal(isProductView('cart'),false);
});
test('streamed mentions move from the general model to the relevant product detail',()=>{
 assert.equal(spokenProductView('The Studio Mount'),'product');
 assert.equal(spokenProductView('The Studio Mount comes with four adhesive strips'),'contents');
 assert.equal(spokenProductView('For a heavier item, use eight rated adhesive strips'),'mounting');
 assert.equal(spokenProductView('Here are the two parts'),'product-parts');
 assert.equal(spokenProductView('Let me turn the hanger around'),'product-back');
 assert.equal(spokenProductView('Your wall preview has three picture frames.'),null);
});
test('heavy-item photo and guidance never imply its branded strips are the included four',()=>{
 const result=shoppingDecision(emptyWallState(),'Heavier than 5 lb',product);
 assert.equal(result.presentation,'mounting');assert.match(result.reply,/8 rated/);assert.match(result.reply,/plus nails/);
 assert.match(visualInstructions,/fictional/);assert.match(visualInstructions,/not actual product photographs/);
});
