import {uniqueVoiceMessages} from './voice-transcripts.mjs';
import {cartPermission,requestedCartQuantity} from './cart-intent.mjs';
export {cartPermission} from './cart-intent.mjs';
import {createWallStore} from './wall-store.mjs';
import {createWallAI} from './wall-ai.mjs';
import {completePreviewMessage,withPreviewFollowUp,shoppingDecision} from './wall-conversation.mjs';
import {createCommerce,safeCart} from './wall-commerce.mjs';
import {demoFollowUp} from '../client/shared/demo-follow-up.js';
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json',...extra}});
export function imageType(bytes) {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
  if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
export async function readBounded(request,max) {
  const reader=request.body?.getReader(); if(!reader)throw Error('Missing request.');
  const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('That file is too large. Choose a smaller image.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const all=new Uint8Array(size);let at=0;for(const part of chunks){all.set(part,at);at+=part.length;}return all;
}
export function publicWallState(state,product) {
  const asset=p=>p?{...p,url:`/api/studio/image/${p.id}`}:null;
  return {...withPreviewFollowUp({...state,messages:uniqueVoiceMessages(state.messages)},product),photo:asset(state.photo),previews:state.previews.map(asset),cart:safeCart(state.cart)};
}
export function cartViewRequested(text) {
  return /\b(show|view|see|open|review)\b.{0,50}\b(cart|bag)\b/i.test(text)||/\b(checkout|check out)\b/i.test(text);
}
export function createWallApi({db,bucket,key,model,imageModel=undefined,fetchImpl=fetch,store:customStore=undefined,ai:customAI=undefined,commerce:customCommerce=undefined,commerceFactory=undefined,checkoutHosts=['example.com','example.myshopify.com'],demoCheckout=false,features=undefined}) {
  const store=customStore || (db&&bucket?createWallStore(db,bucket):null);
  const ai=customAI||createWallAI({key,model,imageModel,fetchImpl});

  return async function handle(request) {
    let commerce;
    try{commerce=customCommerce||(commerceFactory?commerceFactory(request.headers.get('cf-connecting-ip')||''):createCommerce(fetchImpl,{buyerIp:request.headers.get('cf-connecting-ip')||''}));}
    catch{return json(503,{error:'The merchant connection is incomplete. Check the server’s Shopify configuration.'});}
    const url=new URL(request.url), path=url.pathname.replace(/^\/api\/studio\/?/,'');
    const mutation=['POST','DELETE'].includes(request.method);
    if(mutation && request.headers.get('origin')!==url.origin)return json(403,{error:'Open this page directly to continue.'});
    if(!store)return json(503,{error:'The wall studio is temporarily unavailable. Please try again shortly.'});
    let session;
    const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)agentic_storefront=([a-f0-9-]{36})(?:;|$)/)?.[1];
    const cookieHeader=id=>`agentic_storefront=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${id?604800:0}${url.protocol==='https:'?'; Secure':''}`;
    try {
      session=await store.find(cookie);
      if(!session && path===''&&request.method==='GET') {
        const ip=request.headers.get('cf-connecting-ip')||'local';
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+new Date().toISOString().slice(0,10))))).map(x=>x.toString(16).padStart(2,'0')).join('');
        if(!await store.consume('sessions:'+hash,40))return json(429,{error:'Too many new projects. Please return later.'});
        session=await store.create();
        await store.cleanup();
      }
      if(!session)return json(401,{error:'Your project has expired. Reload to start a new one.'});
      const {id,state}=session;
      if((path===''||path==='commerce')&&request.method==='GET') {
        let product=null,commerceError='';
        try{product=await commerce.product();}catch{commerceError='We couldn’t check the current price and availability. Please refresh the store details.';}
        if(state.cart?.id){
          if(!await store.lock(id))return json(409,{error:'Your last change is still finishing. Please wait a moment.'});
          try{
            Object.assign(state,(await store.find(id)).state);
            state.messages=uniqueVoiceMessages(state.messages);
            try{state.cart=await commerce.get(state.cart?.id);await store.save(id,state);}
            catch{commerceError='We couldn’t refresh your cart. Your saved items are still here; refresh before checkout.';}
          }finally{await store.unlock(id);}
        }
        const commerceState={product,cart:safeCart(state.cart),commerceError,checkedAt:commerceError?null:new Date().toISOString()};
        return json(200,path==='commerce'?commerceState:{...publicWallState(state,product),...commerceState,configured:Boolean(key||customAI),...(features?{features}:{})},{'Set-Cookie':cookieHeader(id)});
      }
      if(path.startsWith('image/')&&request.method==='GET') {
        const asset=path.slice(6);
        if(![state.photo?.id,...state.previews.map(p=>p.id)].includes(asset))return json(404,{error:'Image not found.'});
        const object=await store.image(id,asset);if(!object)return json(404,{error:'Image unavailable. Please upload it again.'});
        return new Response(object.body,{headers:{...baseHeaders,'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Content-Security-Policy':"default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
      }
      if(path==='checkout'&&request.method==='GET') {
        const cart=await commerce.get(state.cart?.id);
        if(!cart?.totalQuantity)throw Error('Your cart is empty or no longer available. Return to your cart to continue.');
        if(demoCheckout)return new Response(null,{status:303,headers:{...baseHeaders,Location:url.origin+'/demo-checkout'}});
        const target=new URL(cart.checkoutUrl);
        if(target.protocol!=='https:'||!checkoutHosts.includes(target.hostname))throw Error('The secure checkout is unavailable. Please try again.');
        return new Response(null,{status:303,headers:{...baseHeaders,Location:target.href}});
      }
      if(path==='transcribe'&&request.method==='POST') {
        if(!key&&!customAI)return json(503,{error:'Voice is unavailable. You can keep typing.'});
        if(!await store.consume(`transcribe:${id}`,80))return json(429,{error:'Voice has reached its daily allowance. You can keep typing.'});
        const raw=await readBounded(request,3_000_000);
        const form=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
        const file=form.get('audio');
        if(!(file instanceof File)||!['audio/webm','audio/mp4','audio/ogg','video/webm'].some(t=>file.type.startsWith(t)))return json(400,{error:'That recording format is not supported. You can keep typing.'});
        return json(200,{text:await ai.transcribe(file)});
      }
      if(!mutation)return json(405,{error:'This action is unavailable.'});
      if(!await store.lock(id))return json(409,{error:'Your last change is still finishing. Please wait a moment.'});
      let streaming=false;
      try {
        Object.assign(state,(await store.find(id)).state);state.messages=uniqueVoiceMessages(state.messages);
        if(path===''&&request.method==='DELETE') {await store.remove(id,state);return json(200,{deleted:true},{'Set-Cookie':cookieHeader('')});}
        if(path==='upload'&&request.method==='POST') {
          if(!await store.consume(`uploads:${id}`,20))return json(429,{error:'You have uploaded several photos today. Please continue with the current room.'});
          const raw=await readBounded(request,5_500_000);
          const form=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
          const file=form.get('photo');
          if(!(file instanceof File)||!file.size||file.size>5_000_000)return json(400,{error:'Choose a JPG, PNG or WebP photo under 5 MB.'});
          const bytes=new Uint8Array(await file.arrayBuffer()),type=imageType(bytes);
          if(!type)return json(400,{error:'Choose a JPG, PNG or WebP photo. HEIC files can be exported as JPG.'});
          const old=[state.photo?.id,...state.previews.map(p=>p.id)].filter(Boolean);
          const asset=await store.put(id,bytes,type);
          state.photo={id:asset,name:'Your room',example:form.get('example')==='true'};state.previews=[];state.messages=[];state.proposal=null;
          await store.save(id,state);
          if(bucket&&old.length)await bucket.delete(old.map(a=>`walls/${id}/${a}`));
          return json(200,publicWallState(state));
        }
        const body=JSON.parse(new TextDecoder().decode(await readBounded(request,12000)));
        if(path==='demo-closed'&&request.method==='POST') {
          if(!['ended','dismissed'].includes(body.reason)||typeof body.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(body.eventId))return json(400,{error:'The video event was invalid.'});
          const messageId=`demo-follow-up:${body.eventId}`;
          let followUp=state.messages.find(message=>message.id===messageId);
          if(!followUp){
            if(!await store.consume(`demo-follow-up:${id}`,60))return json(429,{error:'Please continue by choosing a reply or typing your question.'});
            const product=await commerce.product().catch(()=>null);
            followUp={id:messageId,role:'assistant',...demoFollowUp(body.reason,{cartQuantity:state.cart?.totalQuantity||0,available:!!product?.available}),presentation:'product'};
            state.messages.push(followUp);state.messages=state.messages.slice(-40);await store.save(id,state);
          }
          return json(200,{...publicWallState(state),followUp});
        }
        if(path==='cart'&&request.method==='POST') {
          const result=await commerce.setQuantity(state.cart?.id,body.quantity);state.cart=result.cart;state.proposal=null;await store.save(id,state);
          const product=await commerce.product().catch(()=>null);
          return json(200,{...publicWallState(state),product,warnings:result.warnings});
        }
        if(path!=='chat'||request.method!=='POST')return json(404,{error:'Action not found.'});
        if(!key&&!customAI)return json(503,{error:'The assistant is unavailable right now. Please try again shortly.'});
        if(typeof body.message!=='string'||!body.message.trim()||body.message.length>2000)return json(400,{error:'Write a message between 1 and 2,000 characters.'});
        if(cartViewRequested(body.message)&&!cartPermission(body.message,state)){
          if(state.cart?.id)state.cart=await commerce.get(state.cart.id);
          const product=await commerce.product().catch(()=>null);
          state.proposal=null;
          state.messages.push({id:crypto.randomUUID(),role:'user',text:body.message.trim()},{id:crypto.randomUUID(),role:'assistant',text:state.cart?.totalQuantity?'Here’s your cart with its current quantity and subtotal. You can review it and continue to checkout.':'Your cart is open. Choose how many Studio Mount product units you’d like, and we’ll show the current subtotal.',presentation:'cart',choices:state.cart?.totalQuantity?['Checkout','Add 1 to my cart','Remove 1 from my cart']:['Add 1 to my cart','Show me the 3D model']});
          state.messages=state.messages.slice(-40);await store.save(id,state);
          return new Response(JSON.stringify({state:publicWallState(state),product,openCart:true})+'\n',{headers:{...baseHeaders,'Content-Type':'application/x-ndjson'}});
        }
        if(!await store.consume(`chat:${id}`,120)||!await store.consume('chat:global',1500))return json(429,{error:'The assistant is at capacity for today. Your project is saved.'});
        streaming=true;
        const encoder=new TextEncoder();let cancelled=false;
        return new Response(new ReadableStream({
          async start(controller) {
            const send=data=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));};
            const heartbeat=setInterval(()=>send({ping:true}),10000);
            try {
              send({status:'Checking that for you…'});
              const product=await commerce.product().catch(()=>null);
              if(state.cart?.id)state.cart=await commerce.get(state.cart.id);
              const shortcut=shoppingDecision(state,body.message,product);
              const original=!shortcut&&state.photo?await store.image(id,state.photo.id):null;
              let imageData;
              if(original){const bytes=new Uint8Array(await original.arrayBuffer());let str='';for(let n=0;n<bytes.length;n+=8192)str+=String.fromCharCode(...bytes.subarray(n,n+8192));imageData=`data:${original.httpMetadata?.contentType||'image/jpeg'};base64,${btoa(str)}`;}
              const decision=shortcut||await ai.decision(withPreviewFollowUp(state,product),body.message.trim(),product,imageData);
              if(cancelled)return;
              state.messages.push({id:crypto.randomUUID(),role:'user',text:body.message.trim()});
              state.plan=decision.plan;
              let reply=decision.reply,openCart=false,previewId;
              if(decision.action==='preview') {
                if(!state.photo)reply='Upload a photo of your wall, and I can show you how that arrangement could look.';
                else {
                  if(state.previews.length>=8||!await store.consume(`preview:${id}`,8)||!await store.consume('preview:global',40))throw Error('This project has reached its preview allowance. You can still compare your saved ideas, chat, and shop.');
                  send({status:'Creating your wall preview…',generating:true,plan:state.plan});
                  const source=await store.image(id,state.photo.id),last=state.previews.at(-1);
                  const previous=last?await store.image(id,last.id):null;
                  const bytes=await ai.preview({original:source,previous,instruction:decision.previewPrompt,count:state.plan.count,sessionId:id});
                  const asset=await store.put(id,bytes,'image/jpeg');
                  state.previews.push({id:asset,title:decision.title,description:decision.previewPrompt,count:state.plan.count,createdAt:Date.now()});
                  previewId=asset;
                }
              }
              if(decision.action==='cart') {
                state.proposal={quantity:decision.cartQuantity};
                if(cartPermission(body.message,state)) {
                  send({status:'Updating your Shopify cart…'});
                  const result=await commerce.setQuantity(state.cart?.id,requestedCartQuantity(body.message,state.cart?.totalQuantity||0,decision.cartQuantity,state));state.cart=result.cart;state.proposal=null;openCart=true;
                  reply=`Your cart now has ${result.cart?.totalQuantity||0} Studio Mount${result.cart?.totalQuantity===1?'':'s'}. ${result.warnings.join(' ')} ${result.cart?.totalQuantity?'Would you like to check out or change the quantity?':'Would you like to keep looking or ask about the hanger?'}`;
                  decision.presentation='cart';decision.choices=result.cart?.totalQuantity?['Checkout','Add 1 to my cart','Remove 1 from my cart']:['Show me the 3D model','Add 1 to my cart'];
                }
              }
              const message={id:crypto.randomUUID(),role:'assistant',text:reply,choices:decision.choices,previewId,presentation:decision.presentation||'none'};
              state.messages.push(previewId?completePreviewMessage(message,product):message);
              state.messages=state.messages.slice(-40);
              await store.save(id,state);send({state:publicWallState(state,product),product,openCart});
            } catch(error) {
              await store.save(id,state).catch(()=>{});
              send({error:error instanceof Error?error.message:'Something went wrong. Your project is saved.',state:publicWallState(state)});
            } finally {clearInterval(heartbeat);await store.unlock(id);if(!cancelled)controller.close();}
          },cancel(){cancelled=true;}
        }),{headers:{...baseHeaders,'Content-Type':'application/x-ndjson'}});
      } finally {if(!streaming)await store.unlock(id);}
     } catch(error) {
      if(path==='checkout'&&request.headers.get('accept')?.includes('text/html')){
        return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Return to your Studio cart</title><style>body{margin:0;background:#f7f5ef;color:#29271f;font:18px/1.7 system-ui}main{max-width:32rem;margin:12vh auto;padding:24px}h1{font-size:32px;line-height:1.2}a{display:inline-block;background:#66543b;color:white;padding:12px 24px;border-radius:12px;text-decoration:none}</style><main><h1>Let’s check your cart.</h1><p>We couldn’t open checkout just now. Your cart may have changed, or the store may be temporarily unavailable. Return to refresh it and try again.</p><a href="/?cart=open">Return to your cart</a></main></html>',{status:400,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});
      }
      return json(400,{error:error instanceof Error?error.message:'Something went wrong. Please try again.'});
    }
  };
}
