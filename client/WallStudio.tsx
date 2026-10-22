'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowUpRight,Check,ImagePlus,LoaderCircle,Mic,Minus,Plus,FolderPlus,Settings2,ShoppingBag,Square,Play,Trash2,Volume2,VolumeX,X} from 'lucide-react';
import {readVoicePreference,saveVoicePreference} from './voice/preferences';
import {createWallVoice} from './wall/voice';
import {createLiveVoice} from './wall/live-voice';
import {createNarration,saveSoundEnabled,welcomeGreeting,returningGreeting} from './wall/narration';
import {guideName,guideIntroduction,guideHelpQuestion} from './shared/guide.js';
import {productKnowledge} from './shared/product-knowledge.js';
import {DemoDialog,type DemoCloseReason} from './wall/DemoDialog';
import {demoFollowUp} from './shared/demo-follow-up.js';
import {ProductStage,type ProductView} from './wall/ProductStage';
import {CartStage} from './wall/CartStage';
import {isProductView,spokenProductView} from './shared/product-visuals.js';
import './wall/studio.css';
import {storefront} from '../storefront.config.js';

type Money={amount:string;currencyCode:string};
type Photo={id:string;url:string;example?:boolean};
type Preview=Photo&{title:string;description:string;count:number};
type Message={id:string;role:'user'|'assistant';text:string;choices?:string[];previewId?:string;presentation?:'none'|'demo'|'cart'|ProductView};
type Studio={messages:Message[];photo:Photo|null;previews:Preview[];plan:{count:number;style:string;layout:string;weight:string;surface:string;fixing:string;budget:string};cart:null|{quantity:number;subtotal:Money;total:Money;lines:{quantity:number;title:string;price:Money}[]};proposal:null|{quantity:number}};
type Product={title:string;available:boolean;price:Money;url:string;image?:{url:string;altText?:string};checkedAt?:string};
type Features={demo:boolean;scripted:boolean;voice:boolean;previews:boolean};
type StudioResponse=Studio&{features?:Features;product:Product|null;configured:boolean;error?:string;warnings?:string[];commerceError?:string};
const money=(value?:Money)=>value?new Intl.NumberFormat('en-US',{style:'currency',currency:value.currencyCode}).format(Number(value.amount)):'';
const empty:Studio={messages:[],photo:null,previews:[],plan:{count:3,style:'',layout:'',weight:'',surface:'',fixing:'',budget:''},cart:null,proposal:null};

async function preparePhoto(file:File):Promise<Blob> {
  if(file.size>20_000_000)throw Error('Choose a photo smaller than 20 MB.');
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();img.src=url;await img.decode().catch(()=>{throw Error('This photo format could not be opened. Try a JPG, PNG or WebP image.');});
    const ratio=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('The photo could not be prepared.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('The photo could not be prepared.')),'image/jpeg',.9));
  } finally {URL.revokeObjectURL(url);}
}

export default function WallStudio(){
  const [state,setState]=useState<Studio>(empty),[product,setProduct]=useState<Product|null>(null),[ready,setReady]=useState(false);
  const [features,setFeatures]=useState<Features>({demo:true,scripted:true,voice:false,previews:false});
  const [input,setInput]=useState(''),[busy,setBusy]=useState(''),[generating,setGenerating]=useState(false),[error,setError]=useState('');
  const [material,setMaterial]=useState<'wall'|ProductView>('wall'),[demoOpen,setDemoOpen]=useState(false);
  const visualCue=useRef({id:'',view:''}),manualVisual=useRef(false),visualToolActive=useRef(false),visualUser=useRef('');
  const demoVisible=useRef(false),demoEventId=useRef(''),pendingDemoFollowUp=useRef<{eventId:string;reason:DemoCloseReason}|null>(null);
  const [experienceStarted,setExperienceStarted]=useState(false),experienceStartedRef=useRef(false);
  const [selected,setSelected]=useState<string>('original'),[cartOpen,setCartOpen]=useState(false),[cartBusy,setCartBusy]=useState(false),[cartNotice,setCartNotice]=useState('');
  const [storeRefreshing,setStoreRefreshing]=useState(false),[storeError,setStoreError]=useState('');
  const commerceRequest=useRef<AbortController|null>(null);
  const [voice,setVoice]=useState<'man'|'woman'>('woman'),[voiceStatus,setVoiceStatus]=useState(''),[voiceOn,setVoiceOn]=useState(false),[soundOn,setSoundOn]=useState(false),[audioBlocked,setAudioBlocked]=useState(false),[settings,setSettings]=useState(false);
  const [pendingPhoto,setPendingPhoto]=useState<{file:File;example:boolean}|null>(null);
  const [retry,setRetry]=useState(''),[dragging,setDragging]=useState(false);
  const replaceDialog=useRef<HTMLDialogElement>(null),composerDock=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),messagesEnd=useRef<HTMLDivElement>(null),resetDialog=useRef<HTMLDialogElement>(null);
  const operation=useRef(false),controller=useRef<AbortController|null>(null),speech=useRef<ReturnType<typeof createWallVoice>|null>(null),voiceRef=useRef(voice),sendRef=useRef<(text:string)=>Promise<void>>(async()=>{}),stateRef=useRef(state);
  const narration=useRef<ReturnType<typeof createNarration>|null>(null),soundRef=useRef(false),voiceAudio=useRef<HTMLAudioElement>(null);
  const live=useRef<ReturnType<typeof createLiveVoice>|null>(null),liveAudio=useRef<HTMLAudioElement>(null);
  const [liveEnabled,setLiveEnabled]=useState(false);
  stateRef.current=state;voiceRef.current=voice;sendRef.current=text=>send(text);
  useEffect(()=>{
    voiceRef.current=readVoicePreference()==='man'?'man':'woman';setVoice(voiceRef.current);
    speech.current=createWallVoice({audio:voiceAudio.current!,onBlocked:setAudioBlocked,onState:s=>{setVoiceStatus(s);if(s==='Speaking')narration.current?.didStartSpeaking();},onText:text=>sendRef.current(text),getVoice:()=>voiceRef.current,onError:text=>{setError(text);setVoiceOn(false);}});
    const player=speech.current;
    const realtime=createLiveVoice({audio:liveAudio.current!,getVoice:()=>voiceRef.current,onBlocked:setAudioBlocked,onState:s=>{setVoiceStatus(s);if(s==='Speaking')narration.current?.didStartSpeaking();},onError:text=>{live.current?.fallback();setLiveEnabled(false);setError(text);setVoiceOn(false);setBusy('');operation.current=false;},onEvent:event=>{
      if(event.type==='state'){
        const next=event.state as Studio,prior=stateRef.current;stateRef.current=next;setState(next);if('product' in event){setProduct(event.product);setStoreError(event.product?'':'Current store details are unavailable. Please refresh.');}
        const user=next.messages.filter(m=>m.role==='user').at(-1)?.id||'';if(user!==visualUser.current){visualUser.current=user;manualVisual.current=false;visualToolActive.current=false;}
        const latest=next.previews.at(-1);if(latest&&latest.id!==prior.previews.at(-1)?.id){setSelected(latest.id);if(!manualVisual.current){setMaterial('wall');setCartOpen(false);}}
      }
      if(event.type==='transcript'&&event.active&&!demoVisible.current&&!manualVisual.current&&!visualToolActive.current){const view=spokenProductView(event.text);if(view&&(visualCue.current.id!==event.id||visualCue.current.view!==view)){visualCue.current={id:event.id,view};setMaterial(view as ProductView);}}
      if(event.type==='response-start')visualCue.current={id:'',view:''};
      if(event.type==='transcript')setState(s=>({...s,messages:s.messages.some(m=>m.id===event.id)?s.messages.map(m=>m.id===event.id?{...m,text:event.text}:m):[...s.messages,{id:event.id,role:'assistant',text:event.text}]}));
      if(event.type==='presentation'){
        if(event.view!=='none')visualToolActive.current=true;
        if(event.view==='cart'){setCartNotice('');setCartOpen(true);}else if(event.view==='demo')openDemo();else if((isProductView(event.view)||event.view==='wall')&&!manualVisual.current){setMaterial(event.view);setCartOpen(false);}
        setState(s=>({...s,messages:s.messages.map((m,i)=>i===s.messages.length-1&&m.role==='assistant'?{...m,choices:event.choices}:m)}));
      }
      if(event.type==='status'){operation.current=true;setBusy(event.status);setGenerating(!!event.generating);}
      if(event.type==='done'){operation.current=false;setBusy('');setGenerating(false);}
      if(event.type==='notice'){setError(event.message);operation.current=false;setBusy('');setGenerating(false);}
      if(event.type==='ended'){setVoiceOn(false);operation.current=false;setBusy('');}
    }});live.current=realtime;void realtime.available().then(setLiveEnabled);
    const reader=createNarration({output:{tryUnlock:async()=>{if(realtime.isEnabled())return realtime.tryUnlock();await realtime.available();return realtime.isEnabled()?realtime.tryUnlock():player.tryUnlock();},speak:async text=>{await realtime.available();if(realtime.isEnabled())await realtime.speak(text);else await player.speak(text);},stop:()=>{player.pauseInput();realtime.cancel();}},enabled:soundRef.current,onBlocked:setAudioBlocked,onError:setError});
    narration.current=reader;reader.setVisible(!document.hidden);
    if(new URLSearchParams(window.location.search).get('cart')==='open')setCartOpen(true);
    void load();
    const hide=()=>{reader.setVisible(!document.hidden);if(document.hidden){player.stop();realtime.stop();setVoiceOn(false);operation.current=false;setBusy('');}};
    const unlock=(event:Event)=>{
      if(!experienceStartedRef.current||demoVisible.current||!event.isTrusted||event.target instanceof Element&&event.target.closest('[data-audio-control]'))return;
      if(event instanceof KeyboardEvent&&(event.metaKey||event.ctrlKey||event.altKey||['Shift','Control','Alt','Meta','Escape'].includes(event.key)))return;
      void reader.activate();
    };
    document.addEventListener('visibilitychange',hide);
    document.addEventListener('click',unlock);document.addEventListener('keydown',unlock);
    return()=>{controller.current?.abort();reader.dispose();player.dispose();realtime.dispose();narration.current=null;document.removeEventListener('visibilitychange',hide);document.removeEventListener('click',unlock);document.removeEventListener('keydown',unlock);};
  },[]);
  useEffect(()=>{if(experienceStarted&&!demoVisible.current&&state.messages.length){const target=window.matchMedia('(max-width:760px)').matches?composerDock.current:messagesEnd.current;target?.scrollIntoView({behavior:'instant',block:'nearest'});}},[state.messages.length,state.messages.at(-1)?.id,state.messages.at(-1)?.text,busy,error,experienceStarted]);
  useEffect(()=>{if(experienceStarted)document.querySelector<HTMLElement>('.wall-messages')?.focus({preventScroll:true});},[experienceStarted]);
  useEffect(()=>{if(!demoOpen&&!busy&&!operation.current&&pendingDemoFollowUp.current){const event=pendingDemoFollowUp.current;pendingDemoFollowUp.current=null;void continueAfterDemo(event);}},[demoOpen,busy]);
  // Refresh only commerce, never reset the conversation or replay the greeting.
  // Discard a slow read if a chat/tool/cart operation changes state meanwhile.
  async function refreshCommerce(){
    if(operation.current||commerceRequest.current||document.hidden)return;
    const previous=stateRef.current,abort=new AbortController();commerceRequest.current=abort;setStoreRefreshing(true);
    try{
      const response=await fetch('/api/studio/commerce',{signal:abort.signal});
      const data=await response.json() as Pick<StudioResponse,'product'|'cart'|'error'|'commerceError'>;
      if(response.status===409)return;
      if(!response.ok)throw Error(data.error||'Store details could not refresh. Please try again.');
      if(operation.current||stateRef.current!==previous)return;
      setProduct(data.product);setStoreError(data.commerceError||'');
      const next={...previous,cart:data.cart};stateRef.current=next;setState(next);
      if(!data.commerceError&&previous.cart?.quantity!==data.cart?.quantity)setCartNotice('Your cart has been updated from Shopify.');
    }catch(e){if(!abort.signal.aborted&&!operation.current&&stateRef.current===previous)setStoreError((e as Error).message||'Store details could not refresh. Please try again.');}
    finally{if(commerceRequest.current===abort){commerceRequest.current=null;setStoreRefreshing(false);}}
  }
  const refreshCommerceRef=useRef(refreshCommerce);refreshCommerceRef.current=refreshCommerce;
  useEffect(()=>{
    const refresh=()=>{void refreshCommerceRef.current();};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const interval=setInterval(refresh,60000);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);clearInterval(interval);commerceRequest.current?.abort();};
  },[]);
  useEffect(()=>{if(cartOpen)void refreshCommerceRef.current();},[cartOpen]);
  async function load(){
    const reader=narration.current;
    try{const r=await fetch('/api/studio');const d=await r.json() as StudioResponse;if(reader!==narration.current)return;if(!r.ok)throw Error(d.error||'The request could not finish. Please try again.');setState(d);stateRef.current=d;if(d.features)setFeatures(d.features);setProduct(d.product);setStoreError(d.commerceError||'');const shown=d.messages.filter(m=>m.role==='assistant').at(-1)?.presentation;setMaterial(shown==='demo'?'product':isProductView(shown)?shown as ProductView:experienceStartedRef.current&&!d.photo?'product':'wall');setSelected(d.previews.at(-1)?.id||'original');setReady(d.configured);if(!d.configured)setError('The assistant is temporarily unavailable. Please try again shortly.');else if(experienceStartedRef.current)void reader?.greet(Boolean(d.photo||d.messages.length));}
    catch(e){setError((e as Error).message||'The studio could not load. Please refresh.');}
  }
  async function send(text:string,keepDraft=false){
    if(!experienceStartedRef.current||operation.current||!text.trim()||!ready)return;
    manualVisual.current=false;visualToolActive.current=false;
    if(live.current?.isEnabled()&&soundRef.current){
      narration.current?.cancel();operation.current=true;setBusy('Connecting voice…');setError('');setRetry('');if(!keepDraft)setInput('');
      try{await live.current.send(text);return;}catch{live.current.fallback();setLiveEnabled(false);setVoiceOn(false);operation.current=false;setBusy('');}
    }
    operation.current=true;setBusy('Thinking…');setError('');setRetry('');setGenerating(false);narration.current?.cancel();
    if(!keepDraft)setInput('');
    const previous=stateRef.current;setState(s=>({...s,messages:[...s.messages,{id:'pending',role:'user',text:text.trim()}]}));
    const abort=new AbortController();controller.current=abort;
    let responseState:Studio|undefined,spoken='',presentedDemo=false;
    try {
      const r=await fetch('/api/studio/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text}),signal:abort.signal});
      if(!r.ok){const d=await r.json() as StudioResponse;throw Error(d.error||'The request could not finish. Please try again.');}
      if(!r.body)throw Error('The assistant returned an empty response.');
      const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
      try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;const event=JSON.parse(line);if(event.openCart){setCartNotice('');setCartOpen(true);}if(event.status)setBusy(event.status);if(event.generating)setGenerating(true);if(event.state){responseState=event.state;setState(event.state);if('product' in event){setProduct(event.product);setStoreError(event.product?'':'Current store details are unavailable. Please refresh.');}const latest=event.state.previews.at(-1);if(latest&&latest.id!==previous.previews.at(-1)?.id){setSelected(latest.id);if(!manualVisual.current){setMaterial('wall');setCartOpen(false);}}else{const shown=event.state.messages.filter((m:Message)=>m.role==='assistant').at(-1)?.presentation;if(shown==='demo'){presentedDemo=true;openDemo();}else if(shown==='cart')setCartOpen(true);else if(isProductView(shown)&&!manualVisual.current){setMaterial(shown as ProductView);if(!event.openCart)setCartOpen(false);}}spoken=event.state.messages.filter((m:Message)=>m.role==='assistant').at(-1)?.text||'';}if(event.error)throw Error(event.error);}if(done)break;}}
      finally{reader.releaseLock();}
      if(!responseState)throw Error('The connection stopped. Please reload your saved project.');
      if(spoken&&!presentedDemo)void narration.current?.speak(spoken);
    } catch(e){if((e as Error).name!=='AbortError'){setError((e as Error).message);setRetry(text);if(!responseState)setState(previous);speech.current?.stop();setVoiceOn(false);}}
    finally{operation.current=false;setBusy('');setGenerating(false);controller.current=null;}
  }
  function openDemo(){
    if(!experienceStartedRef.current||demoVisible.current)return;
    demoEventId.current=crypto.randomUUID();
    live.current?.pauseForMedia();narration.current?.cancel();speech.current?.stop();setVoiceOn(false);setVoiceStatus('');
    demoVisible.current=true;setDemoOpen(true);setMaterial('product');setSettings(false);
  }
  function closeDemo(reason:DemoCloseReason){
    if(!demoVisible.current)return;
    pendingDemoFollowUp.current={eventId:demoEventId.current,reason};demoVisible.current=false;setDemoOpen(false);
  }
  async function continueAfterDemo(event:{eventId:string;reason:DemoCloseReason}){
    operation.current=true;setBusy('Continuing our conversation…');
    const abort=new AbortController();controller.current=abort;
    let followUp:Message={id:`demo-follow-up:${event.eventId}`,role:'assistant',...demoFollowUp(event.reason,{cartQuantity:stateRef.current.cart?.quantity||0,available:!!product?.available})};
    try{
      let response:Response;
      for(let attempt=0;;attempt++){
        response=await fetch('/api/studio/demo-closed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),signal:abort.signal});
        if(response.status!==409||attempt===3)break;
        await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
        if(abort.signal.aborted)return;
      }
      const data=await response.json() as StudioResponse&{followUp:Message};
      if(!response.ok)throw Error(data.error||'The follow-up could not be saved.');
      stateRef.current=data;setState(data);followUp=data.followUp;
    }catch(e){
      if(abort.signal.aborted)return;
      setState(current=>({...current,messages:[...current.messages,followUp]}));
      setError('This follow-up could not be saved. You can still choose a reply or type your question.');
    }finally{operation.current=false;setBusy('');controller.current=null;}
    if(!abort.signal.aborted)void narration.current?.speak(followUp.text);
  }
  function beginExperience(enabled:boolean){
    if(experienceStartedRef.current)return;
    experienceStartedRef.current=true;setExperienceStarted(true);changeSound(enabled);
    if(!stateRef.current.photo&&material==='wall')setMaterial('product');
    if(enabled){
      // Start the native audio routes in the actual choice click for Safari.
      void live.current?.tryUnlock();void speech.current?.tryUnlock();
      if(ready)void narration.current?.greet(Boolean(stateRef.current.photo||stateRef.current.messages.length));
    }
  }
  function choosePhoto(file:File,example=false){
    if(!experienceStartedRef.current||operation.current)return;
    if(stateRef.current.photo||stateRef.current.messages.length){setPendingPhoto({file,example});replaceDialog.current?.showModal();}
    else void upload(file,example);
  }
  async function upload(file:File,example=false){
    if(operation.current)return;operation.current=true;setBusy('Preparing your photo…');setError('');narration.current?.cancel();
    live.current?.stop();setVoiceOn(false);
    try{
      const photo=await preparePhoto(file),form=new FormData();form.append('photo',photo,'room.jpg');form.append('example',String(example));
      const r=await fetch('/api/studio/upload',{method:'POST',body:form});const d=await r.json() as StudioResponse;if(!r.ok)throw Error(d.error||'The request could not finish. Please try again.');setState(d);stateRef.current=d;setSelected('original');setMaterial('wall');
      operation.current=false;setBusy('');
      await send(input.trim()||'Help me create a warm, balanced picture arrangement on this wall. Make a preview.',false);
    }catch(e){setError((e as Error).message);operation.current=false;setBusy('');speech.current?.stop();setVoiceOn(false);}
    finally{if(fileInput.current)fileInput.current.value='';}
  }
  async function example(){try{const r=await fetch('/brand/gallery-room.png');if(!r.ok)throw Error('The example photo could not load.');await upload(new File([await r.blob()],'example.jpg',{type:'image/jpeg'}),true);}catch(e){setError((e as Error).message);}}
  async function updateCart(quantity:number){
    if(cartBusy||operation.current)return;operation.current=true;setCartBusy(true);setCartNotice('');setError('');
    live.current?.stop();setVoiceOn(false);
    try{const r=await fetch('/api/studio/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity})});const d=await r.json() as StudioResponse;if(!r.ok)throw Error(d.error||'The request could not finish. Please try again.');setState(d);stateRef.current=d;if('product' in d)setProduct(d.product);setStoreError(d.product?'':'Current store details are unavailable. Please refresh.');setCartNotice(d.warnings?.join(' ')||'Your cart is saved in the Studio store.');setCartOpen(true);}
    catch(e){setCartNotice((e as Error).message);setError((e as Error).message);}finally{operation.current=false;setCartBusy(false);}
  }
  async function reset(){
    if(operation.current)return;operation.current=true;narration.current?.cancel();speech.current?.stop();setVoiceOn(false);setBusy('Deleting your project…');
    live.current?.stop();
    // Resume within the actual reset click, before the deletion/load awaits.
    if(soundRef.current)void speech.current?.tryUnlock();
    try{const r=await fetch('/api/studio',{method:'DELETE'});if(!r.ok)throw Error('Your project could not be deleted. Please try again.');narration.current?.resetGreeting();setState(empty);stateRef.current=empty;setSelected('original');setMaterial('wall');setCartOpen(false);setError('');setInput('');setRetry('');resetDialog.current?.close();await load();}
    catch(e){setError((e as Error).message);}finally{operation.current=false;setBusy('');}
  }
  async function toggleVoice(){
    manualVisual.current=false;visualToolActive.current=false;narration.current?.cancel();
    if(voiceOn){speech.current?.stop();live.current?.stop();setVoiceOn(false);return;}
    changeSound(true);
    setError('');try{setVoiceOn(true);if(live.current?.isEnabled())await live.current.start();else await speech.current?.start();}catch(e){live.current?.stop();setVoiceOn(false);setError((e as Error).message);}
  }
  function changeSound(enabled:boolean){
    soundRef.current=enabled;setSoundOn(enabled);saveSoundEnabled(enabled);narration.current?.setEnabled(enabled);
    if(!enabled){speech.current?.stop();live.current?.stop();setVoiceOn(false);operation.current=false;setBusy('');}
  }
  function toggleSound(){
    const enabled=!soundRef.current;changeSound(enabled);
    if(enabled)void narration.current?.speak(stateRef.current.messages.filter(m=>m.role==='assistant').at(-1)?.text||(stateRef.current.photo?returningGreeting:welcomeGreeting));
  }
  function readReply(text:string){changeSound(true);void narration.current?.speak(text);}
  function stopVoice(){narration.current?.cancel();speech.current?.stop();live.current?.stop();setVoiceOn(false);operation.current=false;setBusy('');setGenerating(false);}
  function interruptVoice(){manualVisual.current=true;narration.current?.cancel();if(live.current?.isEnabled()){operation.current=false;setBusy('');setGenerating(false);}else speech.current?.interrupt();}
  const preview=state.previews.find(p=>p.id===selected),display=experienceStarted?(preview?.url||state.photo?.url||'/brand/gallery-room.png'):'/brand/gallery-room.png';
  const last=state.messages.at(-1),choices=last?.role==='assistant'?last.choices:[];
  const hasWork=Boolean(state.photo||state.messages.length),qty=state.cart?.quantity||0;
  return <div className={`wall-studio ${!experienceStarted?'is-welcoming':''}`}>
    <audio ref={voiceAudio} preload="auto" aria-label="Studio voice playback" hidden />
    <audio ref={liveAudio} autoPlay playsInline aria-label="Studio live voice playback" hidden />
    <a className="wall-skip" href="#wall-conversation">Skip to conversation</a>
    <header className="wall-header"><a className="wall-brand" href="/" aria-label="Studio home"><span className="studio-wordmark">{storefront.name}<i>.</i></span></a><span className="wall-tagline">{features.demo?'Demo store · fictional products':'Your personal shopping guide'}</span><a className="source-link" href={storefront.repo} target="_blank" rel="noopener noreferrer">Source ↗</a><div className="wall-header-actions">{experienceStarted&&features.voice&&<><button className="wall-sound" data-audio-control aria-label={soundOn?'Mute assistant':'Unmute assistant'} aria-pressed={!soundOn} title={soundOn?'Automatic spoken replies are on':'Assistant is muted'} onClick={toggleSound}>{soundOn?<Volume2 size={18}/>:<VolumeX size={18}/>}<span>{soundOn?'Mute':'Unmute'}</span></button><button className="wall-icon" aria-label="Voice settings" aria-expanded={settings} onClick={()=>setSettings(!settings)}><Settings2 size={19}/></button></>}<button className="wall-icon" aria-label="Start a new project" title="Start a new wall project" data-audio-control disabled={!experienceStarted||Boolean(busy)} onClick={()=>{stopVoice();resetDialog.current?.showModal();}}><FolderPlus size={18}/></button><button className="wall-cart-button" aria-label={`Open cart, ${qty} item${qty===1?'':'s'}`} aria-expanded={cartOpen} aria-controls="cart-stage-title" onClick={()=>{setCartNotice('');setCartOpen(true);if(window.matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>document.querySelector('.wall-stage')?.scrollIntoView({behavior:'instant',block:'start'}));}}><ShoppingBag size={18}/><span>Cart</span><b>{qty}</b></button></div>
      {settings&&<section className="wall-settings" aria-label="Voice settings"><div className="wall-panel-heading"><h2>Your conversation</h2><button className="wall-icon" aria-label="Close voice settings" onClick={()=>setSettings(false)}><X size={18}/></button></div><label htmlFor="wall-voice">Assistant voice</label><select id="wall-voice" value={voice} onChange={e=>{const v=e.target.value as 'man'|'woman';live.current?.stop();setVoiceOn(false);setVoice(v);voiceRef.current=v;saveVoicePreference(v);}}><option value="woman">{liveEnabled?'Eve · woman':'Jessica · woman'}</option><option value="man">{liveEnabled?'Leo · man':'Chris · man'}</option></select><label className="wall-check" data-audio-control><input type="checkbox" checked={soundOn} onChange={()=>toggleSound()}/>Speak automatically</label><p>{liveEnabled?'Live Grok conversation. You can interrupt naturally while Talk is on.':'Natural ElevenLabs voices.'} Greetings and replies play automatically when sound is on. Your preferences stay in this browser.</p></section>}
    </header>
    <main className="wall-layout">
      <section className={`wall-stage ${cartOpen?'is-cart':!experienceStarted?'is-inspiration':material!=='wall'?'is-product':state.photo?'has-work':'is-inspiration'}`} aria-label={cartOpen?"Your shopping cart":experienceStarted&&isProductView(material)?"Studio product display":"Your wall preview"} onDragOver={e=>{e.preventDefault();if(experienceStarted&&!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files[0];if(file)choosePhoto(file);}}>
        {cartOpen?<CartStage demo={features.demo} quantity={qty} subtotal={state.cart?.subtotal} price={state.cart?.lines[0]?.price||product?.price} title={product?.title||state.cart?.lines[0]?.title} image={product?.image} refreshing={storeRefreshing} storeError={storeError} onRefresh={()=>void refreshCommerce()} available={!!product?.available} busy={cartBusy||Boolean(busy)} notice={cartNotice} hasPhoto={!!state.photo} onQuantity={n=>void updateCart(n)} onClose={()=>setCartOpen(false)} onConversation={()=>{document.getElementById('wall-message')?.focus();}}/>:experienceStarted&&material!=='wall'?<ProductStage view={material} onInteract={()=>{manualVisual.current=true;}} onView={view=>{manualVisual.current=true;setCartOpen(false);setMaterial(view);}} hasWall={!!state.photo} onWall={()=>{manualVisual.current=true;setCartOpen(false);setMaterial('wall');}} onDemo={openDemo} busy={Boolean(busy)}/>:<><div className="wall-stage-top"><span>{state.photo?state.photo.example?'Example room':'Your room':'A little inspiration'}</span>{state.photo&&<button disabled={Boolean(busy)} onClick={()=>fileInput.current?.click()}><ImagePlus size={16}/>Change photo</button>}</div>
        <div className={`wall-canvas ${generating?'is-generating':''}`}>
          <img src={display} alt={!experienceStarted?'A sunlit living room with a wall of photographs':preview?`AI wall concept: ${preview.title}`:state.photo?'Original room photograph':'A sunlit living room with a wall of photographs'} />
          {(!experienceStarted||!hasWork)&&<div className="wall-photo-note"><span>More memories.<br/>More moments.</span><p>Enjoy the picture. Adjust the angle.</p></div>}
          {generating&&<div className="wall-rendering" role="status"><LoaderCircle size={21}/><div><strong>Making room for your ideas</strong><span>Your preview may take a minute. Keep this page open.</span></div></div>}
          {dragging&&<div className="wall-drop">Drop your wall photo here</div>}
        </div>
        <div className="wall-stage-bottom">{state.photo?<><div className="wall-version-row" role="group" aria-label="Preview versions"><button aria-pressed={selected==='original'} onClick={()=>{setSelected('original');setMaterial('wall');}}>Original</button>{state.previews.map((p,i)=><button key={p.id} aria-pressed={selected===p.id} onClick={()=>{setSelected(p.id);setMaterial('wall');}}><img src={p.url} alt=""/><span>Idea {i+1}</span></button>)}</div><div className="wall-preview-caption"><strong>{preview?.title||'Your starting point'}</strong><span>{preview?'AI concept · not to scale. Frames and artwork are illustrative.':'Your photo stays unchanged. Compare it with any idea.'}</span></div></>:<p className="wall-inspiration-note">Start with a photo. Make it feel like you.</p>}</div></>}
      </section>
      <section className="wall-conversation" id="wall-conversation" aria-label={`Conversation with ${guideName}`}>
        <div className="wall-messages" tabIndex={0} aria-label="Conversation history">
          {!experienceStarted?<div className="wall-intro" aria-labelledby="wall-intro-title">
            <h1 id="wall-intro-title">A little guidance.<br/><em>A better fit.</em></h1>
            <p>{guideIntroduction} I’ll show you how the hanger works, answer your questions, and help you decide if it’s right for you.</p>
            <p>{features.scripted?'This is a working sample of a conversation-first store. Explore the product, try the walkthrough, and ask me to change your sample cart. No account needed.':'Talk or type, explore the product, or upload a wall photo. No account needed.'}</p>
            <div className="wall-intro-sound">{features.voice?<><h2>Shall we turn on sound?</h2><p><strong>Enable sound for the best experience.</strong> You’ll hear my guidance as we go. You can mute me anytime.</p>
              <div className="wall-intro-actions" data-audio-control><button className="wall-primary" onClick={()=>beginExperience(true)}><Volume2 size={19}/>Yes, enable sound <ArrowUpRight size={18}/></button><button className="wall-secondary" onClick={()=>beginExperience(false)}>No, continue without sound</button></div>
              <small>Your microphone stays off until you choose Talk.</small></>:<><h2>Shopping starts with a conversation.</h2><p>{features.scripted?'Scripted replies, a real interface, and no real orders. Connect your own providers to make it live.':'Explore together in text. Voice is available when the store connects a speech provider.'}</p><button className="wall-primary" disabled={!ready} onClick={()=>beginExperience(false)}>Try the storefront <ArrowUpRight size={18}/></button></>}
            </div>
            {error&&<div className="wall-error" role="alert"><p>{error}</p><button onClick={()=>void load()}>Reload studio</button></div>}
          </div>:!hasWork?<div className="wall-welcome"><h1>Hang it. <em>Then level it.</em></h1><p>{welcomeGreeting}</p>
            <div className="wall-offer"><img src="/product/mount.svg" alt="Studio Mount"/><div><strong>{product?.title||'Studio Mount'}</strong><span>{product?money(product.price):'Price temporarily unavailable'}</span><small>{product?(product.available?'1 system + 4 adhesive strips':'Currently unavailable'):'Please wait for the store'}</small></div></div>
            <div className="wall-opening-options" aria-label="Choose how to continue"><button className="wall-primary" disabled={!ready||Boolean(busy)} onClick={()=>void send('Show me how it works')}>Show me how it works <ArrowUpRight size={18}/></button><button className="wall-secondary" disabled={!ready||Boolean(busy)} onClick={()=>void send('Will it work for my frame?')}>Will it work for my frame?</button><button className="wall-secondary" disabled={!ready||Boolean(busy)||!product?.available} onClick={()=>void send('Add 1 to my cart')}>Add 1 to my cart <ShoppingBag size={16}/></button></div>
            <details className="wall-preview-option"><summary>Want to picture an arrangement on your wall?</summary><div><button className="wall-example" disabled={!features.previews||!ready||Boolean(busy)||cartBusy} onClick={()=>fileInput.current?.click()}>Upload a wall photo <ImagePlus size={16}/></button><button className="wall-example" disabled={!features.previews||!ready||Boolean(busy)||cartBusy} onClick={()=>void example()}>Try an example room <ArrowUpRight size={15}/></button></div><p className="wall-photo-privacy">{features.previews?'Optional. Photos are sent to OpenAI when you request a concept. Projects expire after 7 days; delete yours anytime.':'Photo concepts need an OpenAI key. Upload is disabled in this keyless demo.'}</p></details>
          </div>:<>
            <h1 className="wall-sr">Your wall, together</h1><div role="log" aria-live={soundOn&&!audioBlocked?'off':'polite'}>{state.messages.map(m=><article className={`wall-message ${m.role}`} key={m.id}><span className="wall-message-name">{m.role==='user'?'You':guideName}</span><p>{m.text}</p>{m.previewId&&state.previews.some(p=>p.id===m.previewId)&&<button className="wall-view-idea" onClick={()=>{setCartOpen(false);setSelected(m.previewId!);setMaterial('wall');if(window.matchMedia('(max-width:760px)').matches)document.querySelector('.wall-stage')?.scrollIntoView({behavior:'smooth',block:'start'});}}><Check size={14}/>View this idea <ArrowUpRight size={14}/></button>}{m.role==='assistant'&&(m.presentation==='cart'||isProductView(m.presentation))&&<button className="wall-view-idea" onClick={()=>{manualVisual.current=true;if(m.presentation==='cart')setCartOpen(true);else{setCartOpen(false);setMaterial(m.presentation as ProductView);}if(window.matchMedia('(max-width:760px)').matches)document.querySelector('.wall-stage')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}}>{m.presentation==='cart'?'View cart':'Explore this view'} <ArrowUpRight size={14}/></button>}{m.role==='assistant'&&features.voice&&<button className="wall-read" aria-label="Read this reply aloud" data-audio-control onClick={()=>readReply(m.text)}><Volume2 size={15}/></button>}</article>)}</div>
            {state.proposal&&<div className="wall-product"><img src="/product/mount.svg" alt="Studio Mount"/><div><h2>{product?.title||'Studio Mount'}</h2><p>{product?`${money(product.price)} per product unit`:'Check current price in your cart'}</p><small>{productKnowledge.contents}</small><button className="wall-primary" disabled={cartBusy||Boolean(busy)||!product?.available} onClick={()=>void updateCart(state.proposal!.quantity)}>Set cart to {state.proposal.quantity} unit{state.proposal.quantity===1?'':'s'} <ShoppingBag size={16}/></button></div></div>}
            {busy&&<div className="wall-working" role="status"><LoaderCircle size={16}/>{busy}</div>}
          </>}
          <div ref={messagesEnd}/>
        </div>
        {experienceStarted&&<div className="wall-composer-dock" ref={composerDock}>
          {error&&<div className="wall-error" role="alert"><p>{error}</p>{retry?<button disabled={Boolean(busy)} onClick={()=>void send(retry)}>Try again</button>:!ready?<button onClick={()=>void load()}>Reload studio</button>:null}<button aria-label="Dismiss message" onClick={()=>setError('')}><X size={15}/></button></div>}
          {!busy&&choices&&choices.length>0&&<div className="wall-suggestions" role="group" aria-label="Suggested replies">{choices.map(c=><button key={c} onClick={()=>void send(c,true)}>{c}<ArrowUpRight size={13}/></button>)}</div>}
          {soundOn&&audioBlocked&&<div className="wall-audio-prompt" role="status"><Volume2 size={17}/><p>Your browser needs a tap for sound.</p><button data-audio-control onClick={()=>void narration.current?.activate()}>Enable sound</button></div>}
          {voiceStatus&&<div className="wall-voice-status" role="status"><span className={voiceStatus==='Speaking'?'is-speaking':''}/>{voiceStatus}<button data-audio-control onClick={()=>{if(voiceStatus==='Speaking')interruptVoice();else stopVoice();}}><Square size={12}/>{voiceStatus==='Speaking'?'Interrupt':'Stop voice'}</button></div>}
          <form className="wall-composer" onSubmit={e=>{e.preventDefault();void send(input);}}><label className="wall-sr" htmlFor="wall-message">Message {guideName}</label><textarea id="wall-message" placeholder="Ask me about the hanger, or your wall…" rows={2} maxLength={2000} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(input);}}}/><div className="wall-composer-actions"><button type="button" className="wall-icon" aria-label="Upload a wall photo" title="Upload a wall photo" disabled={!features.previews||!ready||Boolean(busy)||cartBusy} onClick={()=>fileInput.current?.click()}><ImagePlus size={21}/></button><button type="button" data-audio-control className={`wall-talk ${voiceOn?'active':''}`} aria-pressed={voiceOn} disabled={!features.voice||!ready||Boolean(busy)||cartBusy} title={features.voice?'Talk to your guide':'Connect a voice provider to enable Talk'} onClick={()=>void toggleVoice()}><Mic size={18}/>{voiceOn?'Voice on':'Talk'}</button><button className="wall-send" aria-label="Send message" disabled={!ready||Boolean(busy)||cartBusy||!input.trim()}>{busy?<LoaderCircle size={20}/>:<ArrowUp size={22}/>}</button></div></form>
          <button className="wall-help" disabled={!ready||Boolean(busy)||cartBusy} onClick={()=>void send(guideHelpQuestion)}>{guideHelpQuestion}</button>
        </div>}
      </section>
    </main>
    <input className="wall-sr" tabIndex={-1} ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Choose a wall photo" onChange={e=>{const f=e.target.files?.[0];if(f)choosePhoto(f);}}/>
    <DemoDialog open={demoOpen} onClose={closeDemo} muted={!soundOn}/>

    <dialog className="wall-reset-dialog" ref={replaceDialog} onClose={()=>{setPendingPhoto(null);if(fileInput.current)fileInput.current.value='';}}><div className="wall-panel-heading"><h2>Replace this room photo?</h2><button className="wall-icon" aria-label="Cancel photo replacement" onClick={()=>replaceDialog.current?.close()}><X size={20}/></button></div><p>This replaces your current photo and deletes this project’s saved previews and conversation. Your cart stays as it is.</p><div className="wall-reset-actions"><button className="wall-secondary" onClick={()=>replaceDialog.current?.close()}>Keep this room</button><button className="wall-primary" disabled={Boolean(busy)||!pendingPhoto} onClick={()=>{const selectedPhoto=pendingPhoto;replaceDialog.current?.close();if(selectedPhoto)void upload(selectedPhoto.file,selectedPhoto.example);}}>Replace photo</button></div></dialog>
    <dialog className="wall-reset-dialog" data-audio-control ref={resetDialog}><div className="wall-panel-heading"><h2>Make room for a new idea?</h2><button className="wall-icon" aria-label="Cancel new project" onClick={()=>resetDialog.current?.close()}><X size={20}/></button></div><p>This deletes this project’s photos, previews and conversation. Its Shopify cart is not deleted, but this browser will start with a fresh cart.</p><div className="wall-reset-actions"><button className="wall-secondary" onClick={()=>resetDialog.current?.close()}>Keep this project</button><button className="wall-primary" disabled={Boolean(busy)} onClick={()=>void reset()}><Trash2 size={16}/>Delete and start fresh</button></div></dialog>
  </div>;
}
