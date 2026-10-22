import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFit} from '../client/shared/catalog.js';
import {shoppingDecision} from '../server/wall-conversation.mjs';
import {emptyWallState} from '../server/wall-store.mjs';

const fit=(weight,drilling)=>assessFit({weight:String(weight),surface:'painted drywall',drilling,count:'1'});
test('weight boundaries distinguish adhesive-only mounting from the complete heavy-item setup',()=>{
 assert.equal(fit(5,'no').status,'candidate');
 for(const permission of ['no','unknown','']){
  const answer=fit(5.01,permission);assert.equal(answer.status,'check');
  assert.match(answer.text,/8 rated/);assert.match(answer.text,/nails through/);
 }
 const supported=fit(10,'yes');assert.equal(supported.status,'candidate');
 assert.match(supported.text,/8 rated/);assert.match(supported.text,/security holes/);
 assert.match(supported.text,/4 adhesive strips/);
 assert.equal(fit(10.01,'yes').status,'check');assert.match(fit(10.01,'yes').text,/exceeds the 10 lb maximum/i);
});
test('heavy-item reply choices explain the required extras and never silently add to the cart',()=>{
 const state=emptyWallState(),product={available:true};
 const heavy=shoppingDecision(state,'Heavier than 5 lb',product);
 assert.match(heavy.reply,/at least 8 rated/);assert.match(heavy.reply,/nails through/);
 assert.equal(heavy.action,'none');
 const allowed=shoppingDecision(state,'5–10 lb, nails are allowed',product);
 assert.equal(allowed.action,'none');assert.match(allowed.reply,/4 included strips do not/);
 assert.ok(allowed.choices.includes('Add 1 to my cart'));
 for(const response of ['No nails, over 5 lb','Over 10 lb']){
  const declined=shoppingDecision(state,response,product);assert.equal(declined.action,'none');
  assert.equal(declined.choices.includes('Add 1 to my cart'),false);
 }
});
