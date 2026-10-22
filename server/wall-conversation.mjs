import {guideCapabilities,guideHelpChoices} from '../client/shared/guide.js';
import {cartPermission,requestedCartQuantity} from './cart-intent.mjs';
import {productKnowledge} from '../client/shared/product-knowledge.js';
export const buyReply='Add 1 to my cart';
export const demoReply='Show me how it works';
export const fitReply='Will it work for my frame?';
const reviewQuestion=product=>`The Studio Mount lets you level a picture after hanging it. ${priceText(product)?`It’s ${priceText(product)}. `:''}Want to see how it works or check it against your frames?`;
const reviewChoices=[demoReply,fitReply,'Change this design'];
export function priceText(product) {
  if(!product?.price?.amount||!product.price.currencyCode)return '';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:product.price.currencyCode}).format(Number(product.price.amount));
}
const purchaseChoices=product=>product?.available?[buyReply,fitReply,'Not for me']:[fitReply,'Not for me'];

// Complete images lead back to the hardware decision, with refinement still optional.
// The same reply is displayed and spoken, including when reopening an older preview.
export function completePreviewMessage(message,product) {
  const text=String(message.text||'').trim();
  const choices=[...new Set((Array.isArray(message.choices)?message.choices:[])
    .filter(c=>typeof c==='string').map(c=>c.trim()).filter(c=>c&&c.length<=90))].slice(0,4);
  if(text.endsWith('?')&&(text.match(/\?/g)||[]).length===1&&choices.length>=2&&choices.some(c=>/hanger|cart|my frame/i.test(c)))return {...message,text,choices};
  const first=(text.match(/[^.!?]+(?:[.!?]+|$)/g)||[]).find(sentence=>!sentence.includes('?'))?.trim()||'';
  const description=first.length>220?'Your wall preview is ready.':first;
  return {...message,text:[description,reviewQuestion(product)].filter(Boolean).join(' '),choices:product?.available?[demoReply,fitReply,buyReply,'Change this design']:[...reviewChoices]};
}
export function withPreviewFollowUp(state,product) {
  const last=state.messages.at(-1);
  if(last?.role!=='assistant'||!last.previewId||!state.previews.some(p=>p.id===last.previewId))return state;
  return {...state,messages:[...state.messages.slice(0,-1),completePreviewMessage(last,product)]};
}

export function shoppingDecision(state,input,product) {
  const answer=input.trim().toLowerCase().replace(/[.!?]+$/,'');
  const base={action:'none',plan:{...state.plan},cartQuantity:state.cart?.totalQuantity||0,presentation:'product'};
  if(['what can i do here','what can you do','how can you help me'].includes(answer))return {...base,reply:guideCapabilities+' Where would you like to start?',choices:[...guideHelpChoices],presentation:'none'};
  const cartQuantity=cartPermission(input,state)?requestedCartQuantity(input,base.cartQuantity,NaN,state):NaN;
  if(Number.isInteger(cartQuantity)){
    if(cartQuantity>20)return {...base,presentation:'cart',reply:'You can add up to 20 hangers here. How many would you like?',choices:['Set my cart to 10','Set my cart to 20']};
    if(cartQuantity>base.cartQuantity&&!product?.available)return {...base,presentation:'cart',reply:'I can’t add it while availability is unconfirmed. You can still remove items or check again shortly.',choices:['Show me my cart','Show me the 3D model']};
    return {...base,action:'cart',cartQuantity,presentation:'cart',reply:'I’ll update your cart.',choices:cartQuantity?['Checkout','Add 1 to my cart','Remove 1 from my cart']:['Show me the 3D model','Add 1 to my cart']};
  }
  const priced=priceText(product),cost=priced?`The current price is ${priced}. `:'';
  const inspectChoices=['Show the back','Separate the parts','Show me how it works'];
  if(['show me the 3d model','show the 3d model','show me the product in 3d'].includes(answer))return {...base,reply:'Here’s the illustrative Studio Mount in 3D. You can turn it and zoom in, or I can show you another angle. Want to see the two parts?',choices:inspectChoices};
  if(['show the back','show me the back','turn it around'].includes(answer))return {...base,presentation:'product-back',reply:'Here’s the other side of the hanger. You can rotate and zoom to inspect it. Would you like to see the two separate parts or the walkthrough?',choices:['Separate the parts',demoReply,fitReply]};
  if(['separate the parts','show me the two parts','show the two parts'].includes(answer))return {...base,presentation:'product-parts',reply:'These are the two components of one Studio Mount system, spaced apart so you can inspect their shape. Want to see the sample walkthrough?',choices:[demoReply,"What's included?",fitReply]};
  if(['show me a product photo','show me the product photo','show the product photo'].includes(answer))return {...base,presentation:'product-photo',reply:'Here’s the sample product illustration. One unit includes one complete hanger system with four adhesive strips. Would you like to inspect the 3D model or check the fit?',choices:['Show me the 3D model',fitReply]};
  if(["what's included",'what’s included','what is included',"what's in the box",'what’s in the box'].includes(answer))return {...base,presentation:'contents',reply:'You get 1 Studio Mount system with 4 adhesive strips. Frames, artwork, nails and extra heavy-item strips are not included. Want to see how it works or check the fit?',choices:[demoReply,fitReply,...(product?.available?[buyReply]:[])]};
  const keep=/^(?:keep (?:it|this (?:look|design|layout|spacing|arrangement))|i (?:like|love) (?:it|this(?: (?:look|design|layout))?))$/.test(answer);
  if(['not for me',"i'll pass",'i’ll pass','no thanks'].includes(answer))return {...base,reply:'No problem. If it doesn’t solve what you need, there’s no reason to buy it.',choices:[]};
  if(/\bnails?\b/.test(answer)&&/\b(instead|rather|versus|vs|better|compare)\b/.test(answer))return {...base,reply:'If a nail already holds your frame securely and lets you level it easily, you may not need this. Studio’s appeal is adjusting the frame at the mount after hanging. Want to see the demonstration before deciding?',choices:[demoReply,'Not for me']};
  if(['add 1 to my cart','add 1 studio hanger to my cart'].includes(answer)) {
    if(!product?.available)return {...base,reply:'I can’t add it while availability is unconfirmed. Please check again shortly.',choices:[demoReply,fitReply]};
    return {...base,action:'cart',cartQuantity:base.cartQuantity+1,reply:'I’ll add one Studio Mount product unit to your cart.',choices:['Checkout','Ask about mounting']};
  }
  if([demoReply.toLowerCase(),'show me the hanger','show me price and buying options'].includes(answer)||(state.previews.length&&keep))return {...base,presentation:answer===demoReply.toLowerCase()?'demo':'product',reply:`You can rotate your picture level after it’s on the wall. ${cost}Want one, or would you like to check your frame first?`,choices:purchaseChoices(product)};
  if([fitReply.toLowerCase().replace(/\?$/,''),'check a different frame','keep it—help me hang it','help me hang it','show mounting help','check mounting suitability'].includes(answer))return {...base,reply:'Up to 5 lb without nails, or up to 10 lb with nails and the heavy-item setup. Which best describes your item?',choices:['Up to 5 lb, painted drywall','Heavier than 5 lb','Over 10 lb','Another wall or not sure']};
  if(answer==='up to 5 lb, painted drywall')return {...base,plan:{...base.plan,weight:'5 lb or less',surface:'painted drywall'},reply:`That is within the 5 lb limit without nails, for an item with a flat mounting surface up to about 20 × 20 inches. You’ll need an attachment rated for your frame and wall that you’re allowed to use. ${cost}Would you like one?`,choices:product?.available?[buyReply,'I need removable mounting','Not for me']:['I need removable mounting','Not for me']};
  if(answer==='heavier than 5 lb')return {...base,presentation:'mounting',plan:{...base.plan,weight:'more than 5 lb'},reply:productKnowledge.heavyMounting+' How much does yours weigh, and can you use nails?',choices:['5–10 lb, nails are allowed','No nails, over 5 lb','Over 10 lb','Not for me']};
  if(answer==='5–10 lb, nails are allowed')return {...base,presentation:'mounting',plan:{...base.plan,weight:'5–10 lb',fixing:'nails allowed'},reply:productKnowledge.heavyMounting+' For a flat-backed item up to about 20 × 20 inches, would you like a hanger?',choices:purchaseChoices(product)};
  if(answer==='no nails, over 5 lb'||answer==='over 10 lb')return {...base,plan:{...base.plan,weight:answer==='over 10 lb'?'over 10 lb':'more than 5 lb',fixing:answer.startsWith('no nails')?'no nails':base.plan.fixing},reply:answer==='over 10 lb'?'That exceeds the 10 lb maximum, even with nails. Would you like to check a lighter item?':'Without nails, the limit is 5 lb. Would you like to check a lighter item?',choices:['Check a different frame','Not for me']};
  if(answer==='another wall or not sure')return {...base,reply:'I can’t confirm fit from a photo alone. What do you know about the frame’s weight and the wall material?',choices:['I need to weigh the frame','It’s plaster','It’s brick or tile','Not for me']};
  return null;
}
