'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Box,Image,Minus,Plus,RotateCcw,Play} from 'lucide-react';
import type {HangerPose,mountHanger} from './hanger-scene';
import './product-stage.css';

export type ProductView='product'|'product-back'|'product-parts'|'product-photo'|'contents'|'mounting';
type Scene=Awaited<ReturnType<typeof mountHanger>>;
type Props={view:ProductView;onView:(view:ProductView)=>void;onInteract:()=>void;hasWall:boolean;onWall:()=>void;onDemo:()=>void;busy:boolean};
const titles:Record<ProductView,string>={product:'A closer look.', 'product-back':'Every side of the story.', 'product-parts':'Two parts. One system.', 'product-photo':'A simple idea.',contents:'One system. Four strips.',mounting:'Check the mounting.'};
const poseFor=(view:ProductView):HangerPose=>view==='product-back'?'back':view==='product-parts'?'parts':'front';

function HangerModel({view,onInteract}:{view:ProductView;onInteract:()=>void}){
  const host=useRef<HTMLDivElement>(null),scene=useRef<Scene|null>(null),latest=useRef(view);
  const interaction=useRef(onInteract);interaction.current=onInteract;
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[attempt,setAttempt]=useState(0);
  latest.current=view;
  useEffect(()=>{
    let cancelled=false;setStatus('loading');
    const fail=()=>{if(!cancelled){setStatus('error');scene.current?.dispose();scene.current=null;}};
    void import('./hanger-scene').then(async({mountHanger})=>{
      if(cancelled||!host.current)return;
      const instance=await mountHanger(host.current,()=>{if(!cancelled){setStatus('ready');scene.current?.view(poseFor(latest.current),false);}},fail,()=>interaction.current());
      if(cancelled){instance.dispose();return;}scene.current=instance;instance.view(poseFor(latest.current),false);
    }).catch(fail);
    return()=>{cancelled=true;scene.current?.dispose();scene.current=null;};
  },[attempt]);
  useEffect(()=>{scene.current?.view(poseFor(view));},[view]);
  return <div className="product-model" data-state={status}>
    <div className="product-model-canvas" ref={host}/>
    {status!=='ready'&&<div className="product-model-fallback"><img src="/product/mount.svg" alt="The two components of the white Studio Mount"/><div role="status"><span>{status==='loading'?'Opening the 3D hanger…':'3D isn’t available in this browser. Here’s an illustration.'}</span>{status==='error'&&<button onClick={()=>setAttempt(n=>n+1)}>Try 3D again</button>}</div></div>}
    {status==='ready'&&<><span className="product-model-hint">Drag to explore · or use the controls</span><div className="product-model-controls" role="group" aria-label="3D model controls"><button aria-label="Rotate hanger left" onClick={()=>scene.current?.turn(-1)}><ArrowLeft size={17}/></button><button aria-label="Rotate hanger right" onClick={()=>scene.current?.turn(1)}><ArrowRight size={17}/></button><span/><button aria-label="Zoom out" onClick={()=>scene.current?.zoom(-1)}><Minus size={17}/></button><button aria-label="Zoom in" onClick={()=>scene.current?.zoom(1)}><Plus size={17}/></button><button aria-label="Reset 3D view" onClick={()=>scene.current?.reset()}><RotateCcw size={16}/></button></div></>}
  </div>;
}

export function ProductStage({view,onView,onInteract,hasWall,onWall,onDemo,busy}:Props){
  const photograph=view==='product-photo',mounting=view==='mounting';
  return <div className="product-stage" data-view={view}>
    <div className="product-stage-toolbar"><div role="group" aria-label="Product display"><button aria-pressed={!photograph&&!mounting} onClick={()=>onView('product')}><Box size={16}/>3D model</button><button aria-pressed={photograph} onClick={()=>onView('product-photo')}><Image size={16}/>Illustration</button></div>{hasWall&&<button className="product-back-wall" onClick={onWall}>Your wall <ArrowUpRight size={15}/></button>}</div>
    <h2>{titles[view]}</h2>
    {photograph?<figure className="product-photograph"><img src="/product/mount.svg" alt="Illustrative fictional two-part mounting system"/></figure>:mounting?<figure className="product-heavy"><div className="product-heavy-image"><img src="/product/strips.svg" alt="An illustrative adhesive strip"/></div><figcaption><strong>Over 5 lb, up to 10 lb</strong><p>At least 8 rated adhesive strips <em>and</em> nails through the dedicated security holes.</p><small>Extra strips and nails are required. The 4 included strips do not make the complete heavy-item setup.</small></figcaption></figure>:<><HangerModel view={view} onInteract={onInteract}/><div className="product-view-options" role="group" aria-label="Choose a hanger angle"><button aria-pressed={poseFor(view)==='front'} onClick={()=>onView('product')}>Front</button><button aria-pressed={view==='product-back'} onClick={()=>onView('product-back')}>Back</button><button aria-pressed={view==='product-parts'} onClick={()=>onView('product-parts')}>Separate parts</button></div></>}
    <div className="product-stage-caption" aria-live="polite">
      {view==='contents'?<><p><strong>1 complete Studio Mount system + 4 adhesive strips.</strong></p><p>The model shows the hanger components. Adhesive strips, frames and artwork aren’t shown.</p></>:view==='product-parts'?<><p>Explore the two sample components.</p><p>Parts are spaced apart for inspection. This is not an installation sequence.</p></>:view==='product-back'?<><p>Turn it, zoom in, and inspect the mounting details.</p><p>For the correct installation steps, watch the demonstration.</p></>:mounting?<p>Without nails, the limit is 5 lb. Check the adhesive’s suitability for your item and wall.</p>:<><p>Illustrative geometry. Yours to replace.</p><p>A fictional product for exploring a real interaction.</p></>}
    </div>
    <button className="product-demo" data-audio-control disabled={busy} onClick={onDemo}><Play size={16}/>Watch how it works <ArrowUpRight size={16}/></button>
  </div>;
}
