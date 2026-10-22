import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

export type HangerPose='front'|'back'|'parts';

/** An on-demand renderer: no idle spin, permanent animation loop, or microphone. */
export async function mountHanger(host:HTMLElement,onReady:()=>void,onFailure:()=>void,onInteract:()=>void){
  let disposed=false,frame=0,transitionStart=0,transitioning=false;
  let model:THREE.Group|null=null;
  const scene=new THREE.Scene();
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.9;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const camera=new THREE.PerspectiveCamera(34,1,.001,10);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.enableDamping=false;
  controls.minDistance=.1;controls.maxDistance=.5;
  controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI-.12;
  // Keep page scrolling available on touch. Rotation uses the visible turn
  // buttons on touch screens; desktop can drag. Wheel zoom is also opt-in.
  controls.enableZoom=false;
  controls.enableRotate=matchMedia('(pointer:fine)').matches;
  controls.cursorStyle='grab';
  renderer.domElement.setAttribute('aria-label','Interactive 3D Studio Mount. Use arrow keys to turn, plus or minus to zoom, and Home to reset.');
  renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;
  renderer.domElement.style.touchAction='pan-y';
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x796b58,.3));
  const key=new THREE.DirectionalLight(0xfff5e4,3);key.position.set(-.2,.16,.1);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-.09;key.shadow.camera.right=.09;key.shadow.camera.top=.09;key.shadow.camera.bottom=-.09;key.shadow.camera.near=.01;key.shadow.camera.far=1;key.shadow.bias=-.00002;key.shadow.normalBias=.00002;scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,.55);fill.position.set(.3,.06,-.2);scene.add(fill);
  const environment=new RoomEnvironment();
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environmentMap=pmrem.fromScene(environment,.04);
  scene.environment=environmentMap.texture;scene.environmentIntensity=.25;environment.dispose();pmrem.dispose();
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const fromCamera=new THREE.Vector3(),toCamera=new THREE.Vector3();
  const origins=new Map<THREE.Object3D,THREE.Vector3>();
  const fromParts=new Map<THREE.Object3D,THREE.Vector3>(),toParts=new Map<THREE.Object3D,THREE.Vector3>();
  let pose:HangerPose='front';
  const cameraFor=(next:HangerPose)=>{
    const direction=next==='back'?new THREE.Vector3(-.025,.012,-.205):next==='parts'?new THREE.Vector3(.012,.026,.26):new THREE.Vector3(.065,.035,.185);
    const width=next==='parts'?.18:.084;
    // Fill the stage while keeping both components in frame on narrow screens.
    const distance=Math.max(next==='parts'?.185:.145,width/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.84));
    return direction.normalize().multiplyScalar(distance);
  };
  camera.position.copy(cameraFor('front'));controls.target.set(0,0,0);controls.update();
  function render(now=performance.now()){
    frame=0;if(disposed||document.hidden)return;
    if(transitioning){
      const progress=reduced.matches?1:Math.min(1,(now-transitionStart)/700),eased=1-Math.pow(1-progress,4);
      // Spherical interpolation goes around the model, never through it.
      const from=new THREE.Spherical().setFromVector3(fromCamera),to=new THREE.Spherical().setFromVector3(toCamera);
      let delta=to.theta-from.theta;if(delta>Math.PI)delta-=Math.PI*2;if(delta<-Math.PI)delta+=Math.PI*2;
      camera.position.setFromSpherical(new THREE.Spherical(THREE.MathUtils.lerp(from.radius,to.radius,eased),THREE.MathUtils.lerp(from.phi,to.phi,eased),from.theta+delta*eased));
      for(const [part,end] of toParts)part.position.lerpVectors(fromParts.get(part)!,end,eased);
      controls.update();transitioning=progress<1;
      host.dataset.animating=String(transitioning);
    }
    renderer.render(scene,camera);
    if(transitioning)requestRender();
  }
  function requestRender(){if(!disposed&&!frame&&!document.hidden)frame=requestAnimationFrame(render);}
  function view(next:HangerPose,animate=true){
    pose=next;fromCamera.copy(camera.position);toCamera.copy(cameraFor(next));
    fromParts.clear();toParts.clear();
    for(const [part,origin] of origins){
      fromParts.set(part,part.position.clone());
      const end=origin.clone();
      // Geometry carries its exact assembled position. Separation is purely
      // an inspection aid for a clear side-by-side comparison, not an installation demo.
      if(next==='parts'){end.x+=part.userData.inspectionSide*.048;end.z+=part.userData.inspectionSide*.008;}
      toParts.set(part,end);
    }
    transitioning=true;host.dataset.animating='true';transitionStart=performance.now()-(animate&&!reduced.matches?0:700);requestRender();
  }
  function turn(direction:number){manual();const s=new THREE.Spherical().setFromVector3(camera.position);s.theta+=direction*Math.PI/8;camera.position.setFromSpherical(s);controls.update();requestRender();}
  function zoom(direction:number){manual();camera.position.multiplyScalar(direction>0?.85:1.18).clampLength(controls.minDistance,controls.maxDistance);controls.update();requestRender();}
  function keydown(event:KeyboardEvent){
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))event.preventDefault();
    if(event.key==='ArrowLeft')turn(-1);if(event.key==='ArrowRight')turn(1);
    if(['+','=','ArrowUp'].includes(event.key))zoom(1);if(['-','ArrowDown'].includes(event.key))zoom(-1);
    if(event.key==='Home'){manual();view(pose);}
  }
  function manual(){transitioning=false;host.dataset.animating='false';onInteract();}
  function lost(event:Event){event.preventDefault();onFailure();}
  const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();view(pose,false);});resize.observe(host);
  controls.addEventListener('change',requestRender);controls.addEventListener('start',manual);
  document.addEventListener('visibilitychange',requestRender);renderer.domElement.addEventListener('keydown',keydown);renderer.domElement.addEventListener('webglcontextlost',lost);
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();
    document.removeEventListener('visibilitychange',requestRender);renderer.domElement.removeEventListener('keydown',keydown);renderer.domElement.removeEventListener('webglcontextlost',lost);
    model?.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
    environmentMap.dispose();key.shadow.dispose();renderer.dispose();renderer.domElement.remove();
  }
  // Original procedural sample: no merchant CAD or external model download.
  model=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({color:0xeee9dc,roughness:.48,metalness:.06});
  const plate=new THREE.Mesh(new THREE.BoxGeometry(.068,.068,.006),material);
  plate.position.z=-.005;
  const face=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.009,64),material.clone());
  face.rotation.x=Math.PI/2;face.position.z=.004;
  for(const [index,part] of [plate,face].entries()){
    part.castShadow=true;part.receiveShadow=true;
    part.userData.inspectionSide=index===0?-1:1;origins.set(part,part.position.clone());model.add(part);
  }
  scene.add(model);view(pose,false);queueMicrotask(()=>{if(!disposed)onReady();});
  requestRender();
  return {view,turn,zoom,reset:()=>{manual();view(pose);},dispose};
}
