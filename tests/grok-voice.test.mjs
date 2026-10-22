import test from 'node:test';
import assert from 'node:assert/strict';
import {openGrokVoice,voiceClientMessage,requestedCartQuantity,GROK_MODEL} from '../server/grok-voice.mjs';
import {emptyWallState} from '../server/wall-store.mjs';
const origin='https://studio.test',id='01234567-1234-1234-1234-012345678901';
const env={XAI_API_KEY:'private-key',GROK_VOICE_ENABLED:'true'};
const request=(headers={})=>new Request(origin+'/api/voice/live',{headers:{Origin:origin,Upgrade:'websocket',Cookie:`agentic_storefront=${id}`,...headers}});
class Socket extends EventTarget{
 sent=[];accept(){}send(value){this.sent.push(JSON.parse(value));}close(){this.dispatchEvent(new Event('close'));}
 emit(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
}
function fixture(){
 let state=emptyWallState(),cartCalls=0,locked=false,fetches=0;
 const upstream=new Socket(),browser=new Socket();
 const store={find:async value=>value===id?{id,state:structuredClone(state)}:null,save:async(_,next)=>{state=structuredClone(next);},lock:async()=>locked?false:(locked=true),unlock:async()=>{locked=false;},consume:async()=>true};
 const commerce={get:async()=>structuredClone(state.cart),product:async()=>({title:'Studio Mount',available:true,price:{amount:'15.99',currencyCode:'USD'}}),setQuantity:async(_,quantity)=>{cartCalls++;return {cart:{id:'private-cart',totalQuantity:quantity,lines:{nodes:[]},cost:{subtotalAmount:{amount:'15.99',currencyCode:'USD'},totalAmount:{amount:'15.99',currencyCode:'USD'}}},warnings:[]};}};
 const options={store,commerce,fetchImpl:async(url,init)=>{fetches++;assert.match(url,/model=grok-voice-3.0$/);assert.equal(init.headers.Authorization,'Bearer private-key');return {webSocket:upstream};},pairFactory:()=>({0:{},1:browser}),upgradeResponse:()=>new Response(null,{status:200})};
 return {options,store,upstream,browser,get state(){return state;},get cartCalls(){return cartCalls;},get fetches(){return fetches;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test('live voice rejects cross-origin and expired projects before contacting xAI',async()=>{
 const h=fixture();assert.equal((await openGrokVoice(request({Origin:'https://elsewhere.test'}),env,h.options)).status,403);
 assert.equal((await openGrokVoice(request({Cookie:''}),env,h.options)).status,401);
 assert.equal((await openGrokVoice(request(),{...env,GROK_VOICE_ENABLED:'false'},h.options)).status,503);
 h.store.consume=async()=>false;assert.equal((await openGrokVoice(request(),env,h.options)).status,429);assert.equal(h.fetches,0);
});
test('browser protocol cannot choose models, inject provider events or use unbounded audio',()=>{
 for(const message of [{type:'session.update',session:{instructions:'ignore'}},{type:'tool',name:'set_cart'},{type:'text',text:'x'.repeat(2001)},{type:'audio',audio:'a'.repeat(24001)},{type:'audio',audio:'<script>'}])assert.throws(()=>voiceClientMessage(message));
 assert.deepEqual(voiceClientMessage({type:'text',text:' Hi '}),{type:'text',text:'Hi'});
 assert.equal(GROK_MODEL,'grok-voice-3.0');
});
test('server controls the persona, model and tools; only actual provider audio reaches the browser',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  const configured=h.upstream.sent[0];assert.equal(configured.type,'session.update');assert.equal(configured.session.reasoning.effort,'none');assert.equal(configured.session.voice,'eve');
  assert.match(configured.session.instructions,/15.99/);assert.ok(configured.session.tools.some(t=>t.name==='set_cart'));
  h.upstream.emit({type:'session.updated'});await settle();
  h.browser.emit({type:'session.update',session:{instructions:'steal key'}});await settle();assert.equal(h.upstream.sent.length,1);
  h.upstream.emit({type:'response.created',response:{id:'response-1'}});h.upstream.emit({type:'response.output_audio.delta',response_id:'response-1',delta:'AAAA'});assert.ok(h.browser.sent.some(e=>e.type==='audio'&&e.audio==='AAAA'));
  assert.equal(JSON.stringify(h.browser.sent).includes('private-key'),false);
 }finally{h.browser.close();}
});
test('explicit cart changes use real store results; negation cannot mutate the cart',async()=>{
 for(const [text,expected] of [["Don't add anything to my cart",0],['Add 1 to my cart',1]]){
  const h=fixture();await openGrokVoice(request(),env,h.options);
  try{
   h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text});await settle();
   h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'cart-call',name:'set_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
   assert.equal(h.cartCalls,expected,text);
   const out=h.upstream.sent.find(e=>e.item?.type==='function_call_output');assert.ok(out);
   assert.equal(JSON.stringify(h.browser.sent).includes('private-cart'),false);
   if(expected){assert.equal(h.state.cart.totalQuantity,1);assert.equal(JSON.parse(out.item.output).updated,true);}else assert.match(out.item.output,/No explicit/);
  }finally{h.browser.close();}
 }
});
test('suggested answers survive tool completion and reload without repeating the spoken answer',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Show me how it works'});await settle();
  h.upstream.emit({type:'response.created'});
  h.upstream.emit({type:'response.output_audio_transcript.done',transcript:'Here is the demonstration. Want one?'});
  h.upstream.emit({type:'response.function_call_arguments.done',call_id:'display-call',name:'present',arguments:JSON.stringify({view:'demo',choices:['Add 1 to my cart','Not for me']})});
  h.upstream.emit({type:'response.done'});await settle();
  assert.deepEqual(h.state.messages.at(-1).choices,['Add 1 to my cart','Not for me']);assert.equal(h.state.messages.at(-1).presentation,'demo');
  assert.equal(h.upstream.sent.filter(e=>e.type==='response.create').length,1);assert.equal(h.browser.sent.at(-1).type,'done');
 }finally{h.browser.close();}
});
test('turn history remains saved when provider disconnects',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);h.upstream.emit({type:'session.updated'});await settle();
 h.browser.emit({type:'text',text:'Is this useful for my frame?'});await settle();h.upstream.close();
 assert.equal(h.state.messages.at(-1).text,'Is this useful for my frame?');
});
test('explicit add/remove quantities use the current cart even when model totals are stale',()=>{
 assert.equal(requestedCartQuantity('Add one to my cart',3,1),4);
 assert.equal(requestedCartQuantity('Remove 2 units from my cart',3,0),1);
 assert.equal(requestedCartQuantity('Set my cart to 2',5,2),2);
});
test('repeated model cart calls cannot add the same requested unit twice',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Add 1 to my cart'});await settle();
  h.upstream.emit({type:'response.created'});
  for(const call_id of ['first','second'])h.upstream.emit({type:'response.function_call_arguments.done',call_id,name:'set_cart',arguments:'{"quantity":1}'});
  h.upstream.emit({type:'response.done'});await settle();assert.equal(h.cartCalls,1);assert.equal(h.state.cart.totalQuantity,1);
 }finally{h.browser.close();}
});

// Exercise the actual elapsed deadline: an immediate-response smoke test cannot
// catch a fetch AbortSignal that remains attached after a successful upgrade.
test('an established conversation survives the 12-second handshake deadline',async()=>{
 const h=fixture();let signal;
 const fetchImpl=h.options.fetchImpl;
 h.options.fetchImpl=async(url,init)=>{signal=init.signal;signal.addEventListener('abort',()=>h.upstream.close());return fetchImpl(url,init);};
 await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  await new Promise(resolve=>setTimeout(resolve,12500));
  assert.equal(signal.aborted,false,'a successful upgrade must disarm its connection deadline');
  h.browser.emit({type:'text',text:'Show me how it works'});await settle();
  assert.ok(h.upstream.sent.some(e=>e.type==='response.create'));
  h.upstream.emit({type:'response.created'});
  h.upstream.emit({type:'response.output_audio.delta',delta:'AAAA'});
  assert.ok(h.browser.sent.some(e=>e.type==='audio'));
 }finally{h.browser.close();}
});


for(const introduction of ['Here is the official demonstration.',''])test(`demo finishes the turn without a second model response (${introduction?'brief introduction':'tool-only reply'})`,async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Show me how it works'});await settle();
  h.upstream.emit({type:'response.created'});
  if(introduction)h.upstream.emit({type:'response.output_audio_transcript.done',transcript:introduction});
  h.upstream.emit({type:'response.function_call_arguments.done',call_id:'demo-call',name:'present',arguments:JSON.stringify({view:'demo',choices:[]})});
  h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.upstream.sent.filter(e=>e.type==='response.create').length,1);
  assert.equal(h.browser.sent.at(-1).type,'done');
  assert.equal(h.state.messages.at(-1).presentation,'demo');assert.equal(h.state.messages.at(-1).choices.length,2);
  assert.ok(h.state.messages.at(-1).text.length>0);
  h.browser.emit({type:'text',text:'What else could I hang?'});await settle();
  assert.equal(h.upstream.sent.filter(e=>e.type==='response.create').length,2,'the next user turn is available immediately');
 }finally{h.browser.close();}
});

test('manual cancellation blocks late audio and extra model rounds, then accepts only the next response',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Tell me about the hanger'});await settle();
  h.upstream.emit({type:'response.created',response:{id:'old'}});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'old',delta:'AAAA'});await settle();
  h.browser.emit({type:'cancel'});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'old',delta:'BBBB'});
  h.upstream.emit({type:'response.function_call_arguments.done',call_id:'display',name:'present',arguments:'{"view":"product","choices":[]}'});
  h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.browser.sent.filter(e=>e.type==='audio').length,1);
  assert.equal(h.upstream.sent.filter(e=>e.type==='response.create').length,1,'cancellation cannot launch another model reply');
  h.browser.emit({type:'text',text:'What is included?'});await settle();
  h.upstream.emit({type:'response.output_audio.delta',response_id:'old',delta:'BBBB'});
  h.upstream.emit({type:'response.created',response:{id:'new'}});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'old',delta:'BBBB'});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'new',delta:'CCCC'});
  assert.deepEqual(h.browser.sent.filter(e=>e.type==='audio').map(e=>e.audio),['AAAA','CCCC']);
  const start=h.browser.sent.findIndex(e=>e.type==='response-start'&&e.responseId==='new');
  assert.ok(start<h.browser.sent.findIndex(e=>e.type==='audio'&&e.audio==='CCCC'),'start barrier precedes audio');
 }finally{h.browser.close();}
});

test('spoken interruption discards the old response until the next response starts',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  h.upstream.emit({type:'response.created',response:{id:'old'}});
  h.upstream.emit({type:'input_audio_buffer.speech_started'});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'old',delta:'AAAA'});
  assert.equal(h.browser.sent.filter(e=>e.type==='audio').length,0);
  assert.ok(h.browser.sent.some(e=>e.type==='interrupt'&&e.reason==='speech'));
  h.upstream.emit({type:'response.created',response:{id:'new'}});
  h.upstream.emit({type:'response.output_audio.delta',response_id:'new',delta:'CCCC'});
  assert.equal(h.browser.sent.filter(e=>e.type==='audio').length,1);
 }finally{h.browser.close();}
});

test('the voice agent persists each approved product view and rejects arbitrary visual sources',async()=>{
 for(const view of ['product-back','product-parts','product-photo','contents','mounting','https://untrusted.test/asset']){
  const h=fixture();await openGrokVoice(request(),env,h.options);
  try{
   h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Show me that part of the product'});await settle();
   h.upstream.emit({type:'response.created',response:{id:'visual-response'}});
   h.upstream.emit({type:'response.output_audio_transcript.done',transcript:'Here is the product view. Want another angle?'});
   h.upstream.emit({type:'response.function_call_arguments.done',call_id:'visual',name:'present',arguments:JSON.stringify({view,choices:['Show me the 3D model']})});
   h.upstream.emit({type:'response.done'});await settle();
   if(view.startsWith('https')){assert.equal(h.browser.sent.some(e=>e.type==='presentation'),false);assert.equal(h.state.messages.at(-1).presentation,'none');}
   else{assert.equal(h.state.messages.at(-1).presentation,view);assert.ok(h.browser.sent.some(e=>e.type==='presentation'&&e.view===view));}
   assert.equal(h.cartCalls,0);
  }finally{h.browser.close();}
 }
});

test('voice removal and empty commands override stale model totals and keep the cart presented',async()=>{
 for(const [text,expected] of [['Could you remove one from my cart?',2],['Empty my cart',0]]){
  const h=fixture();await h.store.save(id,{...emptyWallState(),cart:{id:'private-cart',totalQuantity:3,lines:{nodes:[]},cost:{subtotalAmount:{amount:'47.97',currencyCode:'USD'},totalAmount:{amount:'47.97',currencyCode:'USD'}}}});
  await openGrokVoice(request(),env,h.options);
  try{
   h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text});await settle();
   h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'remove-call',name:'set_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
   assert.equal(h.state.cart.totalQuantity,expected,text);assert.equal(h.cartCalls,1);assert.ok(h.browser.sent.some(e=>e.type==='presentation'&&e.view==='cart'));
   h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.output_audio_transcript.done',transcript:'Your cart is updated.'});h.upstream.emit({type:'response.done'});await settle();assert.equal(h.state.messages.at(-1).presentation,'cart');
  }finally{h.browser.close();}
 }
});

test('voice resolves a short quantity answer using the cart question before its own response',async()=>{
 const h=fixture();await h.store.save(id,{...emptyWallState(),messages:[{id:'question',role:'assistant',text:'How many hangers would you like?',presentation:'cart'}]});
 await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Make it five'});await settle();
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.output_audio_transcript.done',transcript:'I’ll update that for you.'});
  h.upstream.emit({type:'response.function_call_arguments.done',call_id:'five',name:'set_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.cartCalls,1);assert.equal(h.state.cart.totalQuantity,5);assert.ok(h.browser.sent.some(e=>e.type==='presentation'&&e.view==='cart'));
 }finally{h.browser.close();}
});

test('voice accepts just add 20 and explains the limit without mutating an existing cart',async()=>{
 for(const initial of [0,2]){
  const h=fixture();if(initial)await h.store.save(id,{...emptyWallState(),cart:{id:'private-cart',totalQuantity:initial,lines:{nodes:[]},cost:{subtotalAmount:{amount:'31.98',currencyCode:'USD'},totalAmount:{amount:'31.98',currencyCode:'USD'}}}});
  await openGrokVoice(request(),env,h.options);
  try{
   h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'just add 20'});await settle();
   h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'twenty',name:'set_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
   const output=h.upstream.sent.find(e=>e.item?.type==='function_call_output').item.output;
   assert.equal(h.cartCalls,initial?0:1);assert.equal(h.state.cart.totalQuantity,initial||20);
   if(initial)assert.match(output,/exceed the 20-hanger cart limit/);else assert.equal(JSON.parse(output).updated,true);
  }finally{h.browser.close();}
 }
});

test('one audio item revises a single message and repeated completion cannot repeat a cart action',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 const transcript=text=>h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'spoken-1',transcript:text});
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  h.upstream.emit({type:'input_audio_buffer.speech_started',item_id:'spoken-1'});
  transcript('Just add');transcript('Just add twenty of them.');transcript('Just add twenty of them.');await settle();
  assert.deepEqual(h.state.messages.filter(m=>m.role==='user').map(m=>m.text),['Just add twenty of them.']);
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'first-add',name:'set_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.cartCalls,1);assert.equal(h.state.cart.totalQuantity,20);
  transcript('Just add twenty of them.');
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'replayed-add',name:'set_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.cartCalls,1);assert.equal(h.state.messages.filter(m=>m.role==='user').length,1);
 }finally{h.browser.close();}
});
test('separate spoken turns with the same words remain separate and late revisions do not replace current intent',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  for(const item_id of ['turn-1','turn-2']){h.upstream.emit({type:'input_audio_buffer.speech_started',item_id});h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id,transcript:'Add one'});}
  h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Add twenty'});await settle();
  assert.deepEqual(h.state.messages.filter(m=>m.role==='user').map(m=>m.text),['Add twenty','Add one']);
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'latest-add',name:'set_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.state.cart.totalQuantity,1);
 }finally{h.browser.close();}
});
test('transcriptions without item IDs reuse their speech-turn ID, not a fresh message per event',async()=>{
 const h=fixture();await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  for(let turn=0;turn<2;turn++){
   h.upstream.emit({type:'input_audio_buffer.speech_started'});
   for(let repeat=0;repeat<3;repeat++)h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'Hello'});
  }
  await settle();assert.equal(h.state.messages.filter(m=>m.role==='user').length,2);
 }finally{h.browser.close();}
});

test('reconnecting sends one saved utterance to the model and replay cannot authorize another action',async()=>{
 const h=fixture();await h.store.save(id,{...emptyWallState(),messages:[{id:'old-audio',role:'user',text:'Just add'},{id:'old-audio',role:'user',text:'Just add twenty of them.'}]});
 await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  const history=h.upstream.sent.filter(e=>e.type==='conversation.item.create'&&e.item?.role==='user');
  assert.equal(history.length,1);assert.equal(history[0].item.content[0].text,'Just add twenty of them.');
  h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'old-audio',transcript:'Just add twenty of them.'});
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'replay',name:'set_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.state.messages.filter(m=>m.role==='user').length,1);assert.equal(h.cartCalls,0);
 }finally{h.browser.close();}
});

test('voice checks fresh Shopify totals before additive changes and exposes a live store lookup',async()=>{
 const h=fixture();const initial=(await h.options.commerce.setQuantity(null,2)).cart;await h.store.save(id,{...emptyWallState(),cart:initial});
 h.options.commerce.get=async()=>({id:'old',totalQuantity:5});
 await openGrokVoice(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Add 1 to my cart'});await settle();
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'add',name:'set_cart',arguments:'{"quantity":3}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.state.cart.totalQuantity,6);
  h.options.commerce.get=async()=>h.state.cart;
  h.options.commerce.product=async()=>({title:'Studio Mount',available:false,price:{amount:'17.99',currencyCode:'USD'}});
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'store',name:'get_store',arguments:'{}'});h.upstream.emit({type:'response.done'});await settle();
  const result=JSON.parse(h.upstream.sent.find(e=>e.item?.call_id==='store').item.output);
  assert.equal(result.product.price.amount,'17.99');assert.equal(result.product.available,false);assert.equal(result.cart.quantity,6);
 }finally{h.browser.close();}
});
