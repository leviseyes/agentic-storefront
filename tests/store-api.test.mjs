import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,origin} from './helpers.mjs';
import {emptySession} from '../server/session-store.mjs';
import {cookieName,publicSession} from '../server/store-api.mjs';
import {imageType,readBounded} from '../server/request.mjs';
import coffee from '../examples/coffee/storefront.js';
import {defineStorefront} from '../shared/storefront.js';
test('anonymous projects are isolated and secure cookies are scoped to the merchant',async()=>{
 const h=harness(),a=await h.session(),b=await h.session();assert.notEqual(a,b);assert.match((await h.request()).headers.get('set-cookie'),/HttpOnly.*SameSite=Lax.*Secure/);assert.notEqual(cookieName(h.merchant),cookieName(defineStorefront(coffee)));
 await h.chat(a,'Add two pouches');assert.equal((await(await h.request('','GET',undefined,b)).json()).cart,null);
 assert.equal((await h.request('/cart','POST',{variantId:'pouch-rust',quantity:1},a,{origin:'https://elsewhere.test'})).status,403);
});
test('cart mutation, replay and reload use one result and hide server cart keys',async()=>{
 const h=harness(),cookie=await h.session(),turnId=crypto.randomUUID();let result=await h.chat(cookie,'Add two pouches',turnId);assert.equal(result.state.cart.quantity,2);await h.chat(cookie,'Add two pouches',turnId);assert.equal(h.calls,1);
 result=await h.chat(cookie,'Add one bottle 500 ml');assert.equal(result.state.cart.quantity,3);assert.equal(result.state.cart.lines.length,2);
 const json=JSON.stringify(result.state);assert.equal(json.includes('demo.'),false);assert.equal(json.includes('checkoutUrl'),false);assert.equal(result.state.messages.filter(m=>m.role==='user').length,2);
});
test('ambiguous variant is clarified before mutation, then committed once',async()=>{
 const h=harness(),cookie=await h.session();let result=await h.chat(cookie,'Add two daypacks');assert.equal(h.calls,0);assert.match(result.state.messages.at(-1).text,/Which/);result=await h.chat(cookie,'Ink');assert.equal(h.calls,1);assert.equal(result.state.cart.lines[0].variantId,'daypack-ink');assert.equal(result.state.cart.quantity,2);
});
test('invalid quantities cannot poison future requests and a declined mutation remains recoverable',async()=>{
 const h=harness(),cookie=await h.session();assert.equal((await h.request('/cart','POST',{variantId:'pouch-rust',quantity:21},cookie)).status,400);assert.equal(h.rows.get(cookie.split('=')[1]).state.cartOperation,undefined);assert.equal((await h.request('','GET',undefined,cookie)).status,200);
 const set=h.commerce.setLineQuantity;h.commerce.setLineQuantity=async()=>{throw Error('Stock changed');};assert.equal((await h.chat(cookie,'Add one pouch')).response.status,400);assert.equal(h.rows.get(cookie.split('=')[1]).state.cartOperation,null);h.commerce.setLineQuantity=set;assert.equal((await h.chat(cookie,'Add one pouch')).state.cart.quantity,1);
});
test('an interrupted total-target operation recovers without repeating a relative add',async()=>{
 const h=harness(),cookie=await h.session(),id=cookie.split('=')[1],row=h.rows.get(id);row.state.cart=(await h.commerce.setLineQuantity(null,'pouch-rust',4)).cart;row.state.cartOperation={id:crypto.randomUUID(),userText:'Add two pouches',change:{variantId:'pouch-rust',quantity:4}};
 let next=await(await h.request('','GET',undefined,cookie)).json();assert.equal(next.cart.quantity,4);assert.equal(h.rows.get(id).state.cartOperation,null);next=await(await h.request('','GET',undefined,cookie)).json();assert.equal(next.cart.quantity,4);
});
test('server does not execute model-suggested cart actions or arbitrary presentation sources',async()=>{
 const ai={decision:async()=>({reply:'Explore this.',choices:['Show me my cart'],cartChange:{variantId:'pouch-rust',quantity:20},presentation:{view:'product',productId:'unknown',src:'https://evil.test'}})};const h=harness({ai}),cookie=await h.session(),result=await h.chat(cookie,'What do you recommend?');assert.equal(h.calls,0);assert.deepEqual(result.state.presentation,{view:'collection'});
});
test('voice-persisted user messages are not inserted again by the shared cart API',async()=>{
 const h=harness(),cookie=await h.session(),turnId=crypto.randomUUID(),row=h.rows.get(cookie.split('=')[1]);row.state.messages.push({id:turnId,role:'user',text:'Add a pouch'});const result=await h.chat(cookie,'Add a pouch',turnId);assert.equal(result.state.messages.filter(m=>m.role==='user').length,1);
});
test('checkout revalidates the cart, the demo never takes payment, and unsafe real hosts are rejected',async()=>{
 const h=harness(),cookie=await h.session();assert.equal((await h.request('/checkout','GET',undefined,cookie)).status,400);await h.chat(cookie,'Add one pouch');const result=await h.request('/checkout','GET',undefined,cookie);assert.equal(result.status,303);assert.equal(result.headers.get('location'),origin+'/demo-checkout');
 const real=harness({demo:false,checkoutHosts:['safe.test']}),c=await real.session();await real.chat(c,'Add a pouch');assert.equal((await real.request('/checkout','GET',undefined,c)).status,400);
});
test('photo tools are disabled by default and input signatures and sizes are checked',async()=>{
 const h=harness(),cookie=await h.session();assert.equal((await h.request('/upload','POST',new FormData(),cookie)).status,503);assert.equal(imageType(new TextEncoder().encode('<svg/>')),null);assert.equal(imageType(new Uint8Array([255,216,255])),'image/jpeg');await assert.rejects(readBounded(new Request(origin,{method:'POST',body:'123456'}),4),/too large/);
});
test('session locks reject concurrent mutations and reset can discard a stuck pending operation',async()=>{
 const h=harness(),cookie=await h.session(),id=cookie.split('=')[1];h.locks.add(id);assert.equal((await h.chat(cookie,'Add a pouch')).response.status,409);h.locks.clear();h.rows.get(id).state.cartOperation={id:crypto.randomUUID(),change:{variantId:'unknown',quantity:200}};assert.equal((await h.request('','DELETE',undefined,cookie)).status,200);assert.equal(h.rows.has(id),false);
});
test('configured video closure supplies one follow-up and does not reopen the video',async()=>{
 const h=harness({merchant:{...harness().merchant,video:{youtubeId:'abcdefghijk',title:'Walkthrough'}}}),cookie=await h.session();await h.chat(cookie,'Show me the video');const body={reason:'ended',eventId:crypto.randomUUID()};await h.request('/video-closed','POST',body,cookie);const state=await(await h.request('/video-closed','POST',body,cookie)).json();assert.equal(state.messages.filter(m=>m.id.startsWith('video:')).length,1);assert.equal(state.presentation.view,'collection');assert.match(state.messages.at(-1).text,/\?$/);
});

test('a lost response with a confirmed cart target succeeds without applying a relative add twice',async()=>{
 const h=harness(),cookie=await h.session();await h.chat(cookie,'Add one pouch');const set=h.commerce.setLineQuantity,get=h.commerce.get;let after;h.commerce.setLineQuantity=async(...args)=>{after=(await set(...args)).cart;throw Error('Response lost');};h.commerce.get=async id=>after||get(id);const turnId=crypto.randomUUID(),result=await h.chat(cookie,'Add one pouch',turnId);assert.equal(result.state.cart.quantity,2);await h.chat(cookie,'Add one pouch',turnId);assert.equal(h.calls,2);
});
