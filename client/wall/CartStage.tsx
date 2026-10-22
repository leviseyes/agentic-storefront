'use client';
import {ArrowDown,ArrowUpRight,Minus,Plus,RefreshCw,ShoppingBag,X} from 'lucide-react';
import {productKnowledge} from '../shared/product-knowledge.js';
import './cart-stage.css';
type Money={amount:string;currencyCode:string};
type Props={demo:boolean;title?:string;image?:{url:string;altText?:string};refreshing:boolean;storeError:string;onRefresh:()=>void;quantity:number;subtotal?:Money;price?:Money;available:boolean;busy:boolean;notice:string;hasPhoto:boolean;onQuantity:(n:number)=>void;onClose:()=>void;onConversation:()=>void};
const money=(value?:Money)=>value?new Intl.NumberFormat('en-US',{style:'currency',currency:value.currencyCode}).format(Number(value.amount)):'—';
export function CartStage({demo,title,image,refreshing,storeError,onRefresh,quantity,subtotal,price,available,busy,notice,hasPhoto,onQuantity,onClose,onConversation}:Props){
 return <section className="cart-stage" aria-labelledby="cart-stage-title" aria-busy={busy}>
  <header className="cart-stage-heading"><h2 id="cart-stage-title">Your cart.</h2><button className="wall-icon" aria-label="Close cart" onClick={onClose}><X size={22}/></button></header>
  <p className="cart-stage-intro">Ask me to add, remove, or change the quantity. We can keep talking right here.</p>
  <div className="cart-stage-product"><img src={image?.url||"/product/mount.svg"} alt={image?.altText||title||"Studio Mount"} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src="/product/mount.svg";}}/><div><h3>{title||'Studio Mount'}</h3><p>{productKnowledge.contents}</p><strong>{price?`${money(price)} each`:'Price temporarily unavailable'}</strong><span>{available?(demo?'Fictional sample product':'Available from the connected store'):price?'Currently unavailable':'Checking store availability'}</span></div></div>
  <div className="cart-stage-sync"><p role="status">{refreshing?'Checking the store…':storeError||(demo?'Sample cart · no real inventory or orders':'Price and cart connected to Shopify.')}</p><button onClick={onRefresh} disabled={busy||refreshing} aria-label="Refresh store details"><RefreshCw size={16}/>Refresh</button></div>
  <div className="cart-stage-quantity"><span>Quantity</span><div><button aria-label="Remove one unit" disabled={!quantity||busy} onClick={()=>onQuantity(quantity-1)}><Minus size={18}/></button><output aria-label="Cart quantity" aria-live="polite">{quantity}</output><button aria-label="Add one unit" disabled={quantity>=20||busy||!available||Boolean(storeError)} onClick={()=>onQuantity(quantity+1)}><Plus size={18}/></button></div></div>
  {quantity>0?<button className="cart-stage-remove" disabled={busy} onClick={()=>onQuantity(0)}>Remove from cart</button>:<p className="cart-stage-empty"><ShoppingBag size={20}/> Your cart is empty. Add a hanger whenever you’re ready.</p>}
  <div className="cart-stage-summary">
   {quantity>0&&<div className="cart-stage-total"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>}
   <p className="cart-stage-details">{demo?'This cart is for demonstration only. No payment will be taken.':'Shipping, tax, and eligible discounts are calculated by Shopify at checkout.'}{hasPhoto?' Frames and artwork in your preview are not included.':''}</p>
   {notice&&<p className="wall-cart-notice" role="status">{notice}</p>}
   {quantity>0?<a className={`wall-primary cart-stage-checkout ${busy||refreshing||storeError?'is-disabled':''}`} aria-disabled={busy||refreshing||Boolean(storeError)} href="/api/studio/checkout" target="_blank" rel="noopener" onClick={e=>{if(busy||refreshing||storeError)e.preventDefault();}}>{demo?'Preview checkout':'Continue to secure checkout'} <ArrowUpRight size={18}/></a>:<button className="wall-primary cart-stage-checkout" disabled={busy||!available||Boolean(storeError)} onClick={()=>onQuantity(1)}>Add 1 to my cart <Plus size={18}/></button>}
   <p className="cart-stage-note">{demo?'No payment, shipping, or returns in the demo.':'Shopify handles payment and the merchant’s policies apply.'}</p>
  </div>
  <details className="cart-stage-mounting"><summary>Before you hang</summary><p>{productKnowledge.mounting} {productKnowledge.heavyMounting}</p></details>
  <button className="cart-stage-conversation" onClick={onConversation}>Continue the conversation <ArrowDown size={17}/></button>
 </section>;
}
