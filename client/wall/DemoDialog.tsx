import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {demoVideoId,mountDemoPlayer,type DemoStatus} from './demo-player';
export type DemoCloseReason='ended'|'dismissed';
const steps=[['Meet the mount.','Two sample components, one simple idea.'],['Find your angle.','Inspect the front, back, and separate parts.'],['Make it yours.','Ask a question, change your cart, or keep exploring.']];
export function DemoDialog({open,onClose,muted=false}:{open:boolean;muted?:boolean;onClose:(reason:DemoCloseReason)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),host=useRef<HTMLDivElement>(null),close=useRef(onClose);
 const [step,setStep]=useState(0),[status,setStatus]=useState<DemoStatus>('loading');
 const player=useRef<ReturnType<typeof mountDemoPlayer>|null>(null);close.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const element=dialog.current!,focused=document.activeElement,overflow=document.body.style.overflow;
  setStep(0);document.body.style.overflow='hidden';element.showModal();
  let timer:ReturnType<typeof setInterval>|undefined;
  if(demoVideoId)player.current=mountDemoPlayer(host.current!,{muted,onStatus:setStatus,onEnded:()=>close.current('ended')});
  else {let n=0;timer=setInterval(()=>{n++;if(n===3){clearInterval(timer);close.current('ended');}else setStep(n);},4000);}
  return()=>{clearInterval(timer);player.current?.destroy();player.current=null;element.close();document.body.style.overflow=overflow;if(focused instanceof HTMLElement&&focused.isConnected)focused.focus({preventScroll:true});};
 },[open,muted]);
 return <dialog ref={dialog} className="wall-video-dialog" aria-labelledby="wall-video-title" data-audio-control onCancel={e=>{e.preventDefault();onClose('dismissed');}}>
  <div className="wall-video-heading"><h2 id="wall-video-title">A quick walkthrough</h2><button className="wall-icon" autoFocus aria-label="Close demonstration" onClick={()=>onClose('dismissed')}><X size={22}/></button></div>
  {demoVideoId?<div className="wall-video-frame"><div ref={host} className="wall-video-player"/></div>:<div className="sample-walkthrough" data-step={step}>
   <span className="sample-step">0{step+1} / 03 · illustrative demo</span><img src="/product/mount.svg" alt="Fictional two-part wall mount"/>
   <h3>{steps[step][0]}</h3><p>{steps[step][1]}</p><div className="sample-progress" aria-label={`Step ${step+1} of 3`}>{steps.map((_,i)=><span key={i} data-active={i===step}/>)}</div>
  </div>}
  <div className="wall-video-footer" aria-live="polite">{demoVideoId&&status==='blocked'?<button className="wall-primary" onClick={()=>player.current?.play()}>Play walkthrough</button>:demoVideoId&&status==='error'?<p>The video couldn’t load. Close it to continue the conversation.</p>:<p>Returns to the conversation automatically. Close anytime.</p>}</div>
 </dialog>;
}
