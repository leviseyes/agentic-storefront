import test from 'node:test';
import assert from 'node:assert/strict';
import {createWallApi,cartPermission,imageType,readBounded,publicWallState} from '../server/wall-api.mjs';
import {emptyWallState} from '../server/wall-store.mjs';
import {createCommerce,safeCart,VARIANT_ID} from '../server/wall-commerce.mjs';
import {validateDecision,parseDecisionOutput} from '../server/wall-ai.mjs';
import {completePreviewMessage,shoppingDecision} from '../server/wall-conversation.mjs';
const origin='https://example.test', money={amount:'31.98',currencyCode:'USD'};
const cart={id:'secret-cart-id',checkoutUrl:'https://example.com/checkouts/private-token',totalQuantity:2,cost:{subtotalAmount:money,totalAmount:money},lines:{nodes:[{id:'private-line',quantity:2,merchandise:{id:VARIANT_ID,product:{title:'Studio Mount'},price:{amount:'15.99',currencyCode:'USD'}}}]}};
function harness(){
 const rows=new Map(),assets=new Map(),locks=new Set();let cartCalls=0;
 const store={find:async id=>rows.has(id)?structuredClone(rows.get(id)):null,create:async()=>{const s={id:crypto.randomUUID(),state:emptyWallState()};rows.set(s.id,structuredClone(s));return s;},save:async(id,state)=>{rows.set(id,{id,state:structuredClone(state)});},lock:async id=>locks.has(id)?false:(locks.add(id),true),unlock:async id=>{locks.delete(id);},consume:async()=>true,cleanup:async()=>{},put:async(id,bytes)=>{const asset=crypto.randomUUID();assets.set(id+'/'+asset,bytes);return asset;},image:async(id,asset)=>assets.has(id+'/'+asset)?{body:assets.get(id+'/'+asset),arrayBuffer:async()=>assets.get(id+'/'+asset),httpMetadata:{contentType:'image/jpeg'}}:null,remove:async(id)=>{rows.delete(id);for(const a of assets.keys())if(a.startsWith(id+'/'))assets.delete(a);}};
 const ai={decision:async()=>({reply:'Here is an idea.',plan:emptyWallState().plan,action:'none',title:'Three frames',previewPrompt:'Three wood frames',cartQuantity:2,choices:['Try dark frames']}),preview:async()=>new Uint8Array([255,216,255,1]),transcribe:async()=>''};
 const commerce={product:async()=>({title:'Studio Mount',available:true,price:money}),get:async()=>cart,setQuantity:async()=>{cartCalls++;return{cart,warnings:[]};}};
 const handle=createWallApi({store,ai,commerce});
 async function request(path='',method='GET',body,cookie,headers={}){return handle(new Request(origin+'/api/studio'+path,{method,headers:{origin,...(cookie?{cookie}:{}),...headers},...(body?{body:typeof body==='string'||body instanceof FormData?body:JSON.stringify(body)}:{})}));}
 async function session(){const r=await request();return r.headers.get('set-cookie').split(';')[0];}
 return {request,session,ai,store,rows,assets,locks,commerce,get cartCalls(){return cartCalls;}};
}
test('cart details sent to the browser contain no cart keys or checkout tokens',()=>{const safe=JSON.stringify(publicWallState({...emptyWallState(),cart}));for(const secret of ['secret-cart-id','private-token','private-line'])assert.equal(safe.includes(secret),false);assert.equal(safeCart(cart).quantity,2);});
test('cart consent excludes negated, hypothetical and question requests',()=>{for(const s of ["Don't add 2 units to my cart",'Do not remove my cart','Could you explain how to add to cart?','If I add 3 units','Maybe add to cart','Show me the cart'])assert.equal(cartPermission(s),false,s);for(const s of ['Add 2 units to my cart','Set my cart to 3','Remove all units from my cart'])assert.equal(cartPermission(s),true,s);});
test('image validation rejects SVG/HTML, and request size is bounded',async()=>{assert.equal(imageType(new TextEncoder().encode('<svg></svg>')),null);assert.equal(imageType(new Uint8Array([255,216,255])), 'image/jpeg');await assert.rejects(readBounded(new Request(origin,{method:'POST',body:'123456'}),5),/too large/);});
test('session cookies are private, uploads reject cross-origin, and photo URLs are isolated',async()=>{const h=harness();const a=await h.session(),b=await h.session();assert.notEqual(a,b);const r=await h.request();assert.match(r.headers.get('set-cookie'),/HttpOnly.*SameSite=Lax.*Secure/);const form=new FormData();form.append('photo',new Blob([new Uint8Array([255,216,255,1])],{type:'image/jpeg'}),'room.jpg');assert.equal((await h.request('/upload','POST',form,a,{origin:'https://elsewhere.test'})).status,403);const uploaded=await h.request('/upload','POST',form,a);assert.equal(uploaded.status,200);const {photo}=await uploaded.json();assert.equal((await h.request('/image/'+photo.id,'GET',null,a)).status,200);assert.equal((await h.request('/image/'+photo.id,'GET',null,b)).status,404);assert.equal((await h.request('/image/'+photo.id)).status,401);await h.request('','DELETE',null,a);assert.equal(h.assets.size,0);});
test('preview failure retains original photo and releases the project lock',async()=>{const h=harness(),cookie=await h.session();const form=new FormData();form.append('photo',new Blob([new Uint8Array([255,216,255,1])]),'room.jpg');await h.request('/upload','POST',form,cookie);h.ai.decision=async()=>({...validateDecision({reply:'Making an idea',plan:emptyWallState().plan,action:'preview',cartQuantity:0,choices:[]}),previewPrompt:'3 wood frames'});h.ai.preview=async()=>{throw Error('Preview unavailable');};const r=await h.request('/chat','POST',{message:'Show 3 frames'},cookie);const events=(await r.text()).trim().split('\n').map(JSON.parse);const end=events.at(-1);assert.match(end.error,/Preview unavailable/);assert.ok(end.state.photo);assert.equal(end.state.previews.length,0);assert.equal(h.locks.size,0);});
test('AI cart proposal does not mutate on negation, explicit request reports real returned quantity',async()=>{const h=harness(),cookie=await h.session();h.ai.decision=async()=>({reply:'Proposal',plan:emptyWallState().plan,action:'cart',cartQuantity:3,choices:[]});await (await h.request('/chat','POST',{message:"Don't add anything to my cart"},cookie)).text();assert.equal(h.cartCalls,0);const r=await h.request('/chat','POST',{message:'Add 3 units to my cart'},cookie);const events=(await r.text()).trim().split('\n').map(JSON.parse);assert.equal(h.cartCalls,1);assert.equal(events.at(-1).state.cart.quantity,2);assert.match(events.at(-1).state.messages.at(-1).text,/2 Studio/);assert.equal(events.at(-1).state.proposal,null);});
test('busy projects reject concurrent mutations; checkout rejects untrusted hosts',async()=>{const h=harness(),cookie=await h.session();const id=cookie.split('=')[1];h.locks.add(id);assert.equal((await h.request('/cart','POST',{quantity:1},cookie)).status,409);h.commerce.get=async()=>({...cart,checkoutUrl:'https://evil.test/pay'});assert.equal((await h.request('/checkout','GET',null,cookie)).status,400);h.commerce.get=async()=>cart;const r=await h.request('/checkout','GET',null,cookie);assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).hostname,'example.com');});
test('commerce uses the verified variant and returns store warnings, rejects invalid quantities',async()=>{let payload;const commerce=createCommerce(async(url,args)=>{payload=JSON.parse(args.body);return Response.json({data:{cartCreate:{cart,userErrors:[],warnings:[{message:'Quantity adjusted to availability'}]}}});});await assert.rejects(commerce.setQuantity(null,1.5),/0 and 20/);const result=await commerce.setQuantity(null,2);assert.equal(payload.variables.input.lines[0].merchandiseId,VARIANT_ID);assert.equal(result.warnings[0],'Quantity adjusted to availability');});
test('structured decisions enforce preview and cart quantity bounds',()=>{const value={reply:'Okay',plan:emptyWallState().plan,action:'preview',cartQuantity:0,choices:[]};assert.equal(validateDecision(value).plan.count,3);assert.throws(()=>validateDecision({...value,cartQuantity:21}));assert.throws(()=>validateDecision({...value,plan:{...value.plan,count:13}}));});

test('Responses parses final structured message without concatenating duplicate messages',()=>{const value={reply:'Okay',plan:emptyWallState().plan,action:'none',cartQuantity:0,choices:[]};const msg={type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]};assert.equal(parseDecisionOutput({output:[msg,msg]}).reply,'Okay');assert.throws(()=>parseDecisionOutput({output:[{type:'message',content:[{type:'output_text',text:'invalid'}]}]}),/could not prepare/);});

test('view-cart chat opens the existing cart without changing quantity or calling the model',async()=>{const h=harness(),cookie=await h.session();await h.request('/cart','POST',{quantity:2},cookie);h.ai.decision=async()=>{throw Error('View cart must not ask the model');};const r=await h.request('/chat','POST',{message:'Show me the cart'},cookie);const e=JSON.parse((await r.text()).trim());assert.equal(e.openCart,true);assert.equal(e.state.cart.quantity,2);assert.equal(e.state.proposal,null);assert.equal(h.cartCalls,1);});
test('mutations reload the project after acquiring its lock to prevent stale updates',async()=>{const h=harness(),cookie=await h.session();const baseLock=h.store.lock;h.store.lock=async id=>{const value=await baseLock(id);const s=h.rows.get(id);s.state.plan.style='a concurrent saved style';h.rows.set(id,s);return value;};const r=await h.request('/cart','POST',{quantity:2},cookie);assert.equal((await r.json()).plan.style,'a concurrent saved style');});

const previewMonologue='I’m previewing a warm, balanced 3-frame gallery on the large white wall to the right of the opening, with warm wood frames, soft neutral artwork, and even spacing that visually lines up above the small framed piece already there. The arrangement sits as a gentle horizontal cluster, keeping the doorway and adjacent wall art feeling connected without crowding the space.';
test('a successful preview always ends with a spoken review question and usable reply choices',async()=>{
 const h=harness(),cookie=await h.session(),id=cookie.split('=')[1];
 const form=new FormData();form.append('photo',new Blob([new Uint8Array([255,216,255,1])]),'room.jpg');
 await h.request('/upload','POST',form,cookie);
 h.ai.decision=async()=>({reply:previewMonologue,plan:emptyWallState().plan,action:'preview',title:'Warm wood gallery',previewPrompt:'Three wood frames',cartQuantity:0,choices:[]});
 const response=await h.request('/chat','POST',{message:'Show me a warm 3-frame arrangement'},cookie);
 const events=(await response.text()).trim().split('\n').map(JSON.parse),state=events.at(-1).state,last=state.messages.at(-1);
 assert.equal(state.previews.length,1);
 assert.equal(last.previewId,state.previews[0].id);
 assert.match(last.text,/Your wall preview is ready/);
 assert.match(last.text,/Studio Mount.*\?$/);
 assert.equal(last.text.match(/\?/g).length,1);
 assert.ok(last.choices.length>=2&&last.choices.length<=4);
 assert.ok(last.choices.includes('Add 1 to my cart'));
 assert.ok(last.choices.includes('Will it work for my frame?'));
 assert.deepEqual(h.rows.get(id).state.messages.at(-1),last);
 assert.equal(h.cartCalls,0);
});
test('a complete contextual preview question and its choices survive unchanged',()=>{
 const message={id:'reply',role:'assistant',previewId:'preview',text:'The three wood frames now sit in a tighter cluster. Would you like to see the hanger or check your frame?',choices:['Show me the hanger','Will it work for my frame?']};
 assert.deepEqual(completePreviewMessage(message),message);
 assert.deepEqual(completePreviewMessage(completePreviewMessage(message)),message);
});
test('an incomplete question/choice set becomes one coherent review question',()=>{
 for(const choices of [[],['  ',null,'Keep it','Keep it'],null]){
  const result=completePreviewMessage({text:'Here is your three-frame concept. Which frame finish would you like?',choices});
  assert.match(result.text,/^Here is your three-frame concept\./);
  assert.equal(result.text.includes('Which frame finish'),false);
  assert.equal(result.text.match(/\?/g).length,1);
  assert.equal(result.choices.length,3);
  assert.deepEqual(completePreviewMessage(result),result);
 }
});
test('reopening a stranded preview supplies next steps and passes the same context to the agent',async()=>{
 const h=harness(),cookie=await h.session(),id=cookie.split('=')[1],row=h.rows.get(id);
 row.state.previews=[{id:'saved-preview',title:'Three wood frames'}];
 row.state.messages=[{id:'old',role:'assistant',text:'An earlier reply.'},{id:'final',role:'assistant',text:previewMonologue,previewId:'saved-preview',choices:[]}];
 const before=structuredClone(row.state);
 const loaded=await (await h.request('','GET',null,cookie)).json(),last=loaded.messages.at(-1);
 assert.match(last.text,/\?$/);
 assert.equal(last.choices.length,4);
 assert.match(last.text,/31.98/);
 assert.deepEqual(row.state,before);
 assert.deepEqual(loaded.messages[0],before.messages[0]);
 let context;
 h.ai.decision=async state=>{context=state;return{reply:'Let’s check your frames first. How much does the heaviest one weigh?',plan:state.plan,action:'cart',cartQuantity:3,choices:['Under 5 lb','Over 5 lb','I’m not sure']};};
 const response=await h.request('/chat','POST',{message:'Why did you choose this layout?'},cookie);
 await response.text();
 assert.deepEqual(context.messages[1],last);
 assert.equal(h.cartCalls,0,'discussing a design cannot add product units even if the model proposes a cart');
});
test('accepting a preview advances to mounting help without asking again, generating an image, or changing the cart',async()=>{
 for(const answer of ['Keep this spacing','Keep this design','I like it.']){
  const h=harness(),cookie=await h.session(),id=cookie.split('=')[1];
  h.rows.get(id).state.previews=[{id:'saved-preview'}];
  h.ai.decision=async()=>{throw Error('Acceptance should not need another design decision');};
  h.ai.preview=async()=>{throw Error('Acceptance must not generate an image');};
  const r=await h.request('/chat','POST',{message:answer},cookie);
  const end=(await r.text()).trim().split('\n').map(JSON.parse).at(-1),last=end.state.messages.at(-1);
  assert.equal(end.error,undefined);
  assert.match(last.text,/rotate your picture level/);
  assert.match(last.text,/current price/);
  assert.equal(last.text.match(/\?/g).length,1);
  assert.ok(last.choices.includes('Add 1 to my cart'));
  assert.equal(end.state.previews.length,1);
  assert.equal(h.cartCalls,0);
  assert.equal(end.state.proposal,null);
 }
});
test('shopping shortcuts preserve known facts and leave mixed approval/refinement requests to the agent',()=>{
 const state={...emptyWallState(),previews:[{id:'preview'}]};
 state.plan.weight='4 lb';state.plan.surface='painted drywall';state.plan.fixing='screws allowed';
 const next=shoppingDecision(state,'Keep this design',{available:true,price:money});
 assert.deepEqual(next.plan,state.plan);
 assert.ok(next.choices.includes('Add 1 to my cart'));
 for(const text of ['Keep this spacing but use wood frames','I like it, but try a different layout','Do not keep it','Maybe add 1 to my cart'])assert.equal(shoppingDecision(state,text),null,text);
 assert.equal(shoppingDecision(emptyWallState(),'I like it'),null);
});
test('a visitor can buy directly in one exchange without a photo, preview, or qualification loop',async()=>{
 const h=harness(),cookie=await h.session();
 h.ai.decision=async()=>{throw Error('Explicit buying needs no model round trip');};
 const r=await h.request('/chat','POST',{message:'Add 1 to my cart'},cookie);
 const end=(await r.text()).trim().split('\n').map(JSON.parse).at(-1);
 assert.equal(end.error,undefined);assert.equal(h.cartCalls,1);assert.equal(end.openCart,true);
 assert.equal(end.state.photo,null);assert.equal(end.state.previews.length,0);
 assert.equal(end.state.messages.at(-1).presentation,'cart');
});
test('direct purchase adds exactly one to the current total; unavailable items and refusals do not create a cart action',()=>{
 const state={...emptyWallState(),cart:{totalQuantity:2}};
 assert.equal(shoppingDecision(state,'Add 1 to my cart',{available:true}).cartQuantity,3);
 assert.equal(shoppingDecision(state,'Add 1 to my cart',{available:false}).action,'none');
 for(const input of ['Not for me','No thanks']){
  const d=shoppingDecision(state,input,{available:true,price:money});
  assert.equal(d.action,'none');assert.deepEqual(d.choices,[]);assert.equal(d.reply.includes('?'),false);
 }
});
test('the short optional fit check distinguishes a candidate from a known overweight frame',()=>{
 const state=emptyWallState(),product={available:true,price:money};
 const start=shoppingDecision(state,'Will it work for my frame?',product);
 assert.ok(start.choices.includes('Up to 5 lb, painted drywall'));
 const candidate=shoppingDecision(state,start.choices[0],product);
 assert.equal(candidate.plan.weight,'5 lb or less');assert.equal(candidate.plan.surface,'painted drywall');
 assert.match(candidate.reply,/attachment rated/);assert.ok(candidate.choices.includes('Add 1 to my cart'));
 const heavy=shoppingDecision(state,'Heavier than 5 lb',product);
 assert.match(heavy.reply,/8 rated/);assert.match(heavy.reply,/nails/);assert.equal(heavy.choices.includes('Add 1 to my cart'),false);
 assert.equal(heavy.action,'none');
 const demo=shoppingDecision(state,'Show me how it works',product);
 assert.equal(demo.presentation,'demo');assert.match(demo.reply,/current price/);
});
test('only a final assistant message linked to a completed preview gets the recovery question',()=>{
 for(const last of [
  {role:'assistant',text:'Upload a photo first.'},
  {role:'user',text:'Show a different idea',previewId:'existing'},
  {role:'assistant',text:'An image was not saved.',previewId:'missing'},
 ]){
  const state={...emptyWallState(),previews:[{id:'existing'}],messages:[last]};
  assert.deepEqual(publicWallState(state).messages,[last]);
 }
});

test('a comparison with a nail helps the visitor decline when their current setup works',()=>{
 const d=shoppingDecision(emptyWallState(),'Why would I choose this instead of a nail?',{available:true,price:money});
 assert.match(d.reply,/may not need this/);assert.equal(d.action,'none');
 assert.deepEqual(d.choices,['Show me how it works','Not for me']);
});

for(const reason of ['ended','dismissed'])test(`closing a demo (${reason}) saves one assistant follow-up without inventing a user turn or changing the cart`,async()=>{
 const h=harness(),cookie=await h.session(),eventId=crypto.randomUUID();
 h.ai.decision=async()=>{throw Error('A video follow-up must not require a model request');};
 const first=await h.request('/demo-closed','POST',{eventId,reason},cookie);assert.equal(first.status,200);
 const result=await first.json();assert.equal(result.messages.length,1);assert.equal(result.followUp.role,'assistant');
 assert.ok(result.followUp.choices.length>=2);assert.match(result.followUp.text,/\?/);
 if(reason==='dismissed')assert.doesNotMatch(result.followUp.text,/seen|watched/);
 const retried=await (await h.request('/demo-closed','POST',{eventId,reason},cookie)).json();
 assert.equal(retried.messages.length,1);assert.equal(retried.followUp.id,result.followUp.id);
 assert.equal(h.cartCalls,0);
 const reopened=await (await h.request('','GET',null,cookie)).json();assert.equal(reopened.messages.at(-1).id,result.followUp.id);
});
test('demo follow-ups reflect an existing cart or unavailable stock and preserve project isolation',async()=>{
 const h=harness(),cookie=await h.session();await h.request('/cart','POST',{quantity:2},cookie);
 const result=await (await h.request('/demo-closed','POST',{eventId:crypto.randomUUID(),reason:'ended'},cookie)).json();
 assert.ok(result.followUp.choices.includes('Show me my cart'));assert.equal(h.cartCalls,1);
 const other=await h.session();h.commerce.product=async()=>({available:false});
 const noStock=await (await h.request('/demo-closed','POST',{eventId:crypto.randomUUID(),reason:'ended'},other)).json();
 assert.equal(noStock.messages.length,1);assert.equal(noStock.followUp.choices.includes('Add 1 to my cart'),false);
 for(const body of [{eventId:'bad',reason:'ended'},{eventId:crypto.randomUUID(),reason:'anything'}])assert.equal((await h.request('/demo-closed','POST',body,other)).status,400);
 assert.equal((await h.request('/demo-closed','POST',{eventId:crypto.randomUUID(),reason:'ended'},other,{origin:'https://elsewhere.test'})).status,403);
});

test('text cart commands add, remove, set and empty without relying on model arithmetic',async()=>{
 const h=harness(),cookie=await h.session();let live=null,calls=[];
 h.commerce.get=async()=>live;
 h.commerce.setQuantity=async(_,quantity)=>{calls.push(quantity);live={...cart,totalQuantity:quantity,lines:{nodes:quantity?[{...cart.lines.nodes[0],quantity}]:[]}};return {cart:live,warnings:[]};};
 h.ai.decision=async()=>{throw Error('Explicit cart quantities should not require a model');};
 for(const [message,expected] of [['Could you add two to my cart?',2],['Add one more to my cart',3],['Remove one from my cart',2],['Set my cart to 4',4],['Make it five',5],['Add five',10],['I want five hangers',5],['Empty my cart',0],['just add 20',20]]){
  const response=await h.request('/chat','POST',{message},cookie);
  const end=(await response.text()).trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(end.error,undefined,message);assert.equal(end.openCart,true);assert.equal(end.state.cart.quantity,expected,message);assert.equal(end.state.messages.at(-1).presentation,'cart');
 }
 assert.deepEqual(calls,[2,3,2,4,5,10,5,0,20]);
});

test('commerce removes the real Shopify line and preserves returned totals and warnings',async()=>{
 let sent;const commerce=createCommerce(async(_,args)=>{const payload=JSON.parse(args.body);if(payload.query.includes('query StudioCartGet'))return Response.json({data:{cart}});sent=payload;return Response.json({data:{cartLinesRemove:{cart:{...cart,totalQuantity:0,lines:{nodes:[]}},userErrors:[],warnings:[]}}});});
 const result=await commerce.setQuantity('secret-cart-id',0);
 assert.deepEqual(sent.variables.lineIds,['private-line']);assert.equal(result.cart.totalQuantity,0);
});

test('saved duplicate voice items collapse on reload while independent identical turns survive',()=>{
 const state={...emptyWallState(),messages:[{id:'speech-1',role:'user',text:'Just add'},{id:'speech-1',role:'user',text:'Just add twenty of them.'},{id:'speech-1',role:'user',text:'Just add twenty of them.'},{id:'answer',role:'assistant',text:'Okay'},{id:'speech-2',role:'user',text:'Just add twenty of them.'}]};
 const visible=publicWallState(state).messages;
 assert.equal(visible.length,3);assert.equal(visible[0].text,'Just add twenty of them.');assert.equal(visible[2].id,'speech-2');assert.equal(state.messages.length,5);
});

test('commerce refresh reads Shopify changes without changing conversation or leaking cart identifiers',async()=>{
 const h=harness(),cookie=await h.session();await h.request('/cart','POST',{quantity:2},cookie);
 const id=cookie.split('=')[1];h.rows.get(id).state.messages=[{id:'msg',role:'assistant',text:'Keep our conversation'}];
 h.commerce.get=async()=>({...cart,totalQuantity:5});
 const r=await h.request('/commerce','GET',null,cookie),data=await r.json();
 assert.equal(data.cart.quantity,5);assert.ok(data.checkedAt);assert.equal(data.commerceError,'');
 assert.equal(JSON.stringify(data).includes('secret-cart-id'),false);
 assert.equal(h.rows.get(id).state.messages[0].text,'Keep our conversation');assert.equal(h.cartCalls,1);
 h.commerce.get=async()=>null;
 assert.equal((await (await h.request('/commerce','GET',null,cookie)).json()).cart,null);
 assert.equal(h.rows.get(id).state.cart,null);
});
test('store outages preserve saved cart but mark its data unverified; refresh recovers',async()=>{
 const h=harness(),cookie=await h.session();await h.request('/cart','POST',{quantity:2},cookie);
 h.commerce.get=async()=>{throw Error('offline');};h.commerce.product=async()=>{throw Error('offline');};
 const data=await (await h.request('/commerce','GET',null,cookie)).json();
 assert.equal(data.product,null);assert.equal(data.cart.quantity,2);assert.equal(data.checkedAt,null);assert.match(data.commerceError,/refresh your cart/);assert.equal(h.locks.size,0);
 h.commerce.get=async()=>cart;h.commerce.product=async()=>({available:true,price:money});
 assert.equal((await (await h.request('/commerce','GET',null,cookie)).json()).commerceError,'');
});
test('checkout failure offers browser recovery without exposing private tokens or raw errors',async()=>{
 const h=harness(),cookie=await h.session();h.commerce.get=async()=>{throw Error('private-cart-token');};
 const response=await h.request('/checkout','GET',null,cookie,{accept:'text/html'});
 assert.equal(response.status,400);assert.match(response.headers.get('content-type'),/text\/html/);
 const text=await response.text();assert.match(text,/Return to your cart/);assert.equal(text.includes('private-cart-token'),false);
});
test('commerce forwards buyer IP, uses live product metadata, and never silently recreates an expired cart',async()=>{
 let requests=0;
 const commerce=createCommerce(async(_,args)=>{requests++;assert.equal(args.headers['Shopify-Storefront-Buyer-IP'],'192.0.2.1');return Response.json({data:{cart:null}});},{buyerIp:'192.0.2.1'});
 await assert.rejects(commerce.setQuantity('expired-cart',3),/Refresh the cart/);assert.equal(requests,1);
 const busy=createCommerce(async()=>new Response('',{status:429}));await assert.rejects(busy.product(),/store is busy/);
});
