import {storefront} from '../storefront.config.js';
import {shoppingDecision} from './wall-conversation.mjs';
const money=n=>({amount:n.toFixed(2),currencyCode:storefront.currency});
export function createDemoCommerce(){
  function cart(id,quantity){return {id,checkoutUrl:'/demo-checkout',totalQuantity:quantity,cost:{subtotalAmount:money(quantity*Number(storefront.demoPrice)),totalAmount:money(quantity*Number(storefront.demoPrice))},lines:{nodes:quantity?[{id:'demo-line',quantity,merchandise:{id:'gid://shopify/ProductVariant/1',product:{title:storefront.product},price:money(Number(storefront.demoPrice))},cost:{totalAmount:money(quantity*Number(storefront.demoPrice))}}]:[]}};}
  return {
    product:async()=>({title:storefront.product,available:true,price:money(Number(storefront.demoPrice)),url:'/demo-checkout',image:{url:'/product/mount.svg',altText:'Illustrative demo mounting system'},checkedAt:new Date().toISOString()}),
    get:async id=>{const match=/^demo-[a-f0-9-]+-(\d+)$/.exec(id||'');return match?cart(id,Number(match[1])):null;},
    setQuantity:async(id,quantity)=>{if(!Number.isInteger(quantity)||quantity<0||quantity>20)throw Error('Choose between 0 and 20 units.');return {cart:cart('demo-'+crypto.randomUUID()+'-'+quantity,quantity),warnings:[]};},
  };
}
export function createDemoAI(){return {
  decision:async(state,message,product)=>shoppingDecision(state,message,product)||{
    action:'none',plan:state.plan,cartQuantity:state.cart?.totalQuantity||0,presentation:'product',title:'Your idea',previewPrompt:'',
    reply:/price|cost|how much/i.test(message)?`This example product is $${storefront.demoPrice}. You can explore it in 3D or ask me to add a quantity to the sample cart. What would you like to try?`:/\b(?:hello|hi|hey)\b/i.test(message)?`Hi! I’m ${storefront.guide}. This is a scripted storefront demo. I can show you the model and change your sample cart. Where would you like to start?`:'This starter runs scripted replies until you connect an AI provider. Try the 3D product, ask what’s included, or say “add two to my cart.” What would you like to explore?',
    choices:['Show me the 3D model',"What's included?",'Add 2 to my cart'],
  },
  preview:async()=>{throw Error('AI photo previews need your own OpenAI key. This demo does not generate or claim to generate images.');},
  transcribe:async()=>{throw Error('Transcription needs your own OpenAI key. You can keep typing.');},
};}
