import test from 'node:test';
import assert from 'node:assert/strict';
import {openVoiceAgent,voiceClientMessage,GROK_MODEL} from '../server/voice-agent.mjs';
import {emptySession} from '../server/session-store.mjs';
import {cookieName} from '../server/store-api.mjs';
import {harness} from './helpers.mjs';
const origin='https://store.test';
const env={XAI_API_KEY:'private-key',GROK_VOICE_ENABLED:'true'};
let activeCookie='';
const request=(headers={})=>new Request(origin+'/api/voice/live',{headers:{Origin:origin,Upgrade:'websocket',Cookie:activeCookie,...headers}});
class Socket extends EventTarget{sent=[];accept(){}send(value){this.sent.push(JSON.parse(value));}close(){this.dispatchEvent(new Event('close'));}emit(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}}
function fixture(){
 const h=harness(),id=crypto.randomUUID();h.rows.set(id,{id,state:emptySession()});activeCookie=cookieName(h.merchant)+'='+id;
 let fetches=0;const upstream=new Socket(),browser=new Socket();
 const options={merchant:h.merchant,store:h.store,commerce:h.commerce,storeApi:h.api,fetchImpl:async(url,init)=>{fetches++;assert.match(url,/model=grok-voice-3.0$/);assert.equal(init.headers.Authorization,'Bearer private-key');return {webSocket:upstream};},pairFactory:()=>({0:{},1:browser}),upgradeResponse:()=>new Response(null,{status:200})};
 return {options,store:h.store,upstream,browser,get state(){return h.rows.get(id)?.state;},get cartCalls(){return h.calls;},get fetches(){return fetches;},id};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test('live voice rejects cross-origin and expired projects before contacting xAI',async()=>{
 const h=fixture();assert.equal((await openVoiceAgent(request({Origin:'https://elsewhere.test'}),env,h.options)).status,403);
 assert.equal((await openVoiceAgent(request({Cookie:''}),env,h.options)).status,401);
 assert.equal((await openVoiceAgent(request(),{...env,GROK_VOICE_ENABLED:'false'},h.options)).status,503);
 h.store.consume=async()=>false;assert.equal((await openVoiceAgent(request(),env,h.options)).status,429);assert.equal(h.fetches,0);
});
test('browser protocol cannot choose models, inject provider events or use unbounded audio',()=>{
 for(const message of [{type:'session.update',session:{instructions:'ignore'}},{type:'tool',name:'change_cart'},{type:'text',text:'x'.repeat(2001)},{type:'audio',audio:'a'.repeat(24001)},{type:'audio',audio:'<script>'}])assert.throws(()=>voiceClientMessage(message));
 assert.deepEqual(voiceClientMessage({type:'text',text:' Hi '}),{type:'text',text:'Hi'});
 assert.equal(GROK_MODEL,'grok-voice-3.0');
});
test('server controls the persona, model and tools; only actual provider audio reaches the browser',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 try{
  const configured=h.upstream.sent[0];assert.equal(configured.type,'session.update');assert.equal(configured.session.reasoning.effort,'none');assert.equal(configured.session.voice,'eve');
  assert.match(configured.session.instructions,/18.00|18/);assert.ok(configured.session.tools.some(t=>t.name==='change_cart'));
  h.upstream.emit({type:'session.updated'});await settle();
  h.browser.emit({type:'session.update',session:{instructions:'steal key'}});await settle();assert.equal(h.upstream.sent.length,1);
  h.upstream.emit({type:'response.created',response:{id:'response-1'}});h.upstream.emit({type:'response.output_audio.delta',response_id:'response-1',delta:'AAAA'});assert.ok(h.browser.sent.some(e=>e.type==='audio'&&e.audio==='AAAA'));
  assert.equal(JSON.stringify(h.browser.sent).includes('private-key'),false);
 }finally{h.browser.close();}
});
test('explicit cart changes use real store results; negation cannot mutate the cart',async()=>{
 for(const [text,expected] of [["Don't add anything to my cart",0],['Add 1 pouch to my cart',1]]){
  const h=fixture();await openVoiceAgent(request(),env,h.options);
  try{
   h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text});await settle();
   h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'cart-call',name:'change_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
   assert.equal(h.cartCalls,expected,text);
   const out=h.upstream.sent.find(e=>e.item?.type==='function_call_output');assert.ok(out);
   assert.equal(JSON.stringify(h.browser.sent).includes('private-cart'),false);
   if(expected){assert.equal(h.state.cart.totalQuantity,1);assert.equal(JSON.parse(out.item.output).cart.quantity,1);}else assert.match(out.item.output,/No explicit/);
  }finally{h.browser.close();}
 }
});
test('turn history remains saved when provider disconnects',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);h.upstream.emit({type:'session.updated'});await settle();
 h.browser.emit({type:'text',text:'Is this useful for my trip?'});await settle();h.upstream.close();
 assert.equal(h.state.messages.at(-1).text,'Is this useful for my trip?');
});
test('repeated model cart calls cannot add the same requested unit twice',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Add 1 pouch to my cart'});await settle();
  h.upstream.emit({type:'response.created'});
  for(const call_id of ['first','second'])h.upstream.emit({type:'response.function_call_arguments.done',call_id,name:'change_cart',arguments:'{"quantity":1}'});
  h.upstream.emit({type:'response.done'});await settle();assert.equal(h.cartCalls,1);assert.equal(h.state.cart.totalQuantity,1);
 }finally{h.browser.close();}
});

// Exercise the actual elapsed deadline: an immediate-response smoke test cannot
// catch a fetch AbortSignal that remains attached after a successful upgrade.
test('an established conversation survives the 12-second handshake deadline',async()=>{
 const h=fixture();let signal;
 const fetchImpl=h.options.fetchImpl;
 h.options.fetchImpl=async(url,init)=>{signal=init.signal;signal.addEventListener('abort',()=>h.upstream.close());return fetchImpl(url,init);};
 await openVoiceAgent(request(),env,h.options);
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


test('manual cancellation blocks late audio and extra model rounds, then accepts only the next response',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();h.browser.emit({type:'text',text:'Tell me about the daypack'});await settle();
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
 const h=fixture();await openVoiceAgent(request(),env,h.options);
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

test('one audio item revises a single message and repeated completion cannot repeat a cart action',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 const transcript=text=>h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'spoken-1',transcript:text});
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  h.upstream.emit({type:'input_audio_buffer.speech_started',item_id:'spoken-1'});
  transcript('Just add pouches');transcript('Just add twenty pouches.');transcript('Just add twenty pouches.');await settle();
  assert.deepEqual(h.state.messages.filter(m=>m.role==='user').map(m=>m.text),['Just add twenty pouches.']);
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'first-add',name:'change_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.cartCalls,1);assert.equal(h.state.cart.totalQuantity,20);
  transcript('Just add twenty pouches.');
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'replayed-add',name:'change_cart',arguments:'{"quantity":20}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.cartCalls,1);assert.equal(h.state.messages.filter(m=>m.role==='user').length,1);
 }finally{h.browser.close();}
});
test('separate spoken turns with the same words remain separate and late revisions do not replace current intent',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  for(const item_id of ['turn-1','turn-2']){h.upstream.emit({type:'input_audio_buffer.speech_started',item_id});h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id,transcript:'Add one pouch'});}
  h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'turn-1',transcript:'Add twenty pouches'});await settle();
  assert.deepEqual(h.state.messages.filter(m=>m.role==='user').map(m=>m.text),['Add twenty pouches','Add one pouch']);
  h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'latest-add',name:'change_cart',arguments:'{"quantity":1}'});h.upstream.emit({type:'response.done'});await settle();
  assert.equal(h.state.cart.totalQuantity,1);
 }finally{h.browser.close();}
});
test('transcriptions without item IDs reuse their speech-turn ID, not a fresh message per event',async()=>{
 const h=fixture();await openVoiceAgent(request(),env,h.options);
 try{
  h.upstream.emit({type:'session.updated'});await settle();
  for(let turn=0;turn<2;turn++){
   h.upstream.emit({type:'input_audio_buffer.speech_started'});
   for(let repeat=0;repeat<3;repeat++)h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'Hello'});
  }
  await settle();assert.equal(h.state.messages.filter(m=>m.role==='user').length,2);
 }finally{h.browser.close();}
});

test('a provider utterance replay after reconnect cannot authorize another cart mutation',async()=>{
 const h=fixture(),messageId=crypto.randomUUID();await h.store.save(h.id,{...emptySession(),messages:[{id:messageId,providerItemId:'spoken-prior',role:'user',text:'Add one pouch'}],completedTurns:[messageId]});await openVoiceAgent(request(),env,h.options);try{h.upstream.emit({type:'session.updated'});await settle();h.upstream.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'spoken-prior',transcript:'Add one pouch'});h.upstream.emit({type:'response.created'});h.upstream.emit({type:'response.function_call_arguments.done',call_id:'replay',name:'change_cart',arguments:'{}'});h.upstream.emit({type:'response.done'});await settle();assert.equal(h.state.messages.filter(m=>m.role==='user').length,1);assert.equal(h.cartCalls,0);}finally{h.browser.close();}
});
