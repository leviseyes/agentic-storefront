// Feed streamed PCM into the same native media route Safari uses for <audio>.
// Never wait for a complete sentence, and never connect to two speaker outputs.
export function pcmBase64(samples:Float32Array,rate:number,target=24000){
  const length=Math.floor(samples.length*target/rate),bytes=new Uint8Array(length*2),view=new DataView(bytes.buffer);
  for(let i=0;i<length;i++){
    const at=i*rate/target,a=Math.floor(at),mix=at-a;
    const value=Math.max(-1,Math.min(1,(samples[a]||0)*(1-mix)+(samples[Math.min(a+1,samples.length-1)]||0)*mix));
    view.setInt16(i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);
  }
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);
}
export function decodePcm(value:string){
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  if(bytes.length%2)throw Error('Incomplete voice audio.');
  const view=new DataView(bytes.buffer),samples=new Float32Array(bytes.length/2);
  for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
  return samples;
}
export function createLiveAudio(audio:HTMLAudioElement,onSpeaking:()=>void,onDrained:()=>void){
  let context:AudioContext|null=null,destination:MediaStreamAudioDestinationNode|null=null,gate:GainNode|null=null,keepAlive:ConstantSourceNode|null=null,next=0,disposed=false;
  const sources=new Set<AudioBufferSourceNode>();
  const progress=()=>{if(sources.size&&!audio.paused&&audio.currentTime>0)onSpeaking();};
  audio.addEventListener('timeupdate',progress);
  function setup(){
    if(!context||context.state==='closed'){
      context=new AudioContext({latencyHint:'interactive'});
      destination=context.createMediaStreamDestination();
      gate=context.createGain();gate.connect(destination);
      // A zero-valued source keeps the native stream clock running between replies.
      keepAlive=context.createConstantSource();keepAlive.offset.value=0;
      keepAlive.connect(destination);keepAlive.start();
      audio.srcObject=destination.stream;audio.muted=false;audio.volume=1;next=0;
    }
    return context;
  }
  async function unlock(){
    if(disposed)return false;
    const ctx=setup();
    if(gate)gate.gain.value=1;
    if(ctx.state==='running'&&!audio.paused)return true;
    try{
      // Both calls begin in the click stack; Safari gates them separately.
      const resume=ctx.resume(),play=audio.play();
      const unlocked=await Promise.race([Promise.all([resume,play]).then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),1200))]);
      return unlocked&&!disposed&&context===ctx&&ctx.state!=='closed';
    }catch{return false;}
  }
  function push(data:string){
    // An audio packet must never resurrect a route released by Interrupt.
    if(disposed||!context||!destination)return;const ctx=context,samples=decodePcm(data);if(!samples.length)return;
    const buffer=ctx.createBuffer(1,samples.length,24000);buffer.copyToChannel(samples,0);
    const node=ctx.createBufferSource();node.buffer=buffer;node.connect(gate!);
    const start=Math.max(ctx.currentTime+.025,next);next=start+buffer.duration;sources.add(node);
    node.onended=()=>{sources.delete(node);node.disconnect();if(!sources.size)onDrained();};node.start(start);
  }
  function stop(){for(const node of sources){node.onended=null;try{node.stop();}catch{}node.disconnect();}sources.clear();next=context?.currentTime||0;}
  function pauseForMedia(){
    // Keep Safari's already-authorized native stream alive, but feed only silence.
    // Zero PCM also prevents its last audible buffer from lingering during video.
    if(gate)gate.gain.value=0;
    stop();
  }
  function reset(){
    // Stopping buffer nodes alone leaves Safari's native stream playing. On a
    // failed/closed session detach that route too, so no last fragment can linger.
    stop();audio.pause();audio.srcObject=null;
    keepAlive?.stop();keepAlive?.disconnect();keepAlive=null;gate?.disconnect();gate=null;
    destination?.stream.getTracks().forEach(track=>track.stop());destination=null;
    const previous=context;context=null;next=0;
    if(previous&&previous.state!=='closed')void previous.close().catch(()=>{});
  }
  function dispose(){disposed=true;reset();audio.removeEventListener('timeupdate',progress);}
  return {unlock,push,stop,pauseForMedia,reset,dispose,pending:()=>sources.size>0};
}
