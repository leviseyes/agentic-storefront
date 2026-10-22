import {createStoreApi,cookieName} from '../server/store-api.mjs';
import {createDemoCommerce} from '../server/commerce.mjs';
import {emptySession} from '../server/session-store.mjs';
import {storefront} from '../storefront.config.js';
export const origin='https://store.test';
export function harness({merchant=storefront,ai=null,features={},demo=true,checkoutHosts=[]}={}){
 const rows=new Map(),assets=new Map(),locks=new Set();let calls=0;
 const store={find:async id=>rows.has(id)?structuredClone(rows.get(id)):null,create:async()=>{const row={id:crypto.randomUUID(),state:emptySession()};rows.set(row.id,structuredClone(row));return row;},save:async(id,state)=>rows.set(id,{id,state:structuredClone(state)}),lock:async id=>locks.has(id)?false:(locks.add(id),true),unlock:async id=>locks.delete(id),consume:async()=>true,cleanup:async()=>{},remove:async id=>rows.delete(id),put:async(id,bytes)=>{const key=crypto.randomUUID();assets.set(id+'/'+key,bytes);return key;},image:async(id,key)=>assets.has(id+'/'+key)?{body:assets.get(id+'/'+key),arrayBuffer:async()=>assets.get(id+'/'+key),httpMetadata:{contentType:'image/jpeg'}}:null};
 const commerce=createDemoCommerce(merchant),set=commerce.setLineQuantity;
 commerce.setLineQuantity=async(...args)=>{calls++;return set(...args);};
 const api=createStoreApi({merchant,store,commerce,ai,features,demo,checkoutHosts});
 const request=(path='',method='GET',body,cookie,headers={})=>api(new Request(origin+'/api/studio'+path,{method,headers:{origin,...(cookie?{cookie}:{}),...headers},...(body!==undefined?{body:body instanceof FormData?body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
 const session=async()=>{const response=await request();return response.headers.get('set-cookie').split(';')[0];};
 const chat=async(cookie,message,turnId=crypto.randomUUID())=>{const response=await request('/chat','POST',{message,turnId},cookie);const text=await response.text();return {response,...JSON.parse(text.trim())};};
 return {merchant,store,commerce,api,request,session,chat,rows,locks,assets,get calls(){return calls;}};
}
