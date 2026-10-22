import {createMediaSpeechPlayer} from '../voice/media-speech';
import {microphoneIssue} from '../voice/input';
export function createWallVoice({audio,onState,onText,onError,onBlocked,getVoice}:{audio:HTMLAudioElement;onState:(s:string)=>void;onText:(s:string)=>Promise<void>;onError:(s:string)=>void;onBlocked:(blocked:boolean)=>void;getVoice:()=> 'man'|'woman'}) {
  let active=false,sequence=0,stream:MediaStream|null=null,recorder:MediaRecorder|null=null,context:AudioContext|null=null,interval:ReturnType<typeof setInterval>|undefined;
  const player=createMediaSpeechPlayer({audio,onBlocked,onState:s=>onState(s==='idle'?'':s==='loading'?'Preparing voice…':'Speaking'),onEnd:()=>{if(active)void listen();else onState('');},onError:message=>{stop();onError(message);}});
  function release(){clearInterval(interval);interval=undefined;if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}recorder=null;stream?.getTracks().forEach(t=>t.stop());stream=null;void context?.close().catch(()=>{});context=null;}
  function stop(){active=false;sequence++;release();player.stop();onState('');}
  async function listen(){
    if(!active)return; release();const attempt=++sequence;
    try {
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Voice recording is unavailable in this browser. You can keep typing.');
      const source=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(!active||attempt!==sequence){source.getTracks().forEach(t=>t.stop());return;}
      stream=source;context=new AudioContext();await context.resume();
      if(!active||attempt!==sequence)return;
      const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(source).connect(analyser);
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const rec=new MediaRecorder(source,mime?{mimeType:mime}:undefined);recorder=rec;
      const chunks:BlobPart[]=[];let totalBytes=0;
      rec.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);totalBytes+=e.data.size;}};
      rec.onstop=async()=>{
        clearInterval(interval);stream?.getTracks().forEach(t=>t.stop());stream=null;void context?.close().catch(()=>{});context=null;recorder=null;
        if(!active||attempt!==sequence)return;
        try {
          if(!spoke){stop();onError('I didn’t hear any speech. Tap Talk when you’re ready.');return;}
          if(totalBytes>3_000_000)throw Error('That recording was too long. Please try a shorter message.');
          onState('Understanding you…');
          const form=new FormData();form.append('audio',new Blob(chunks,{type:rec.mimeType||'audio/webm'}),'speech');
          const response=await fetch('/api/studio/transcribe',{method:'POST',body:form});
          const data=await response.json() as {text?:string;error?:string};if(!active||attempt!==sequence)return;
          if(!response.ok)throw Error(data.error||'Voice could not connect.');
          if(!data.text?.trim()){onState('Listening');void listen();return;}
          await onText(data.text);
        } catch(e){if(attempt===sequence){stop();onError((e as Error).message);}}
      };
      rec.start();onState('Listening');
      const samples=new Float32Array(analyser.fftSize);let spoke=false,lastSound=Date.now();const began=Date.now();
      interval=setInterval(()=>{
        if(!active||attempt!==sequence)return;
        analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,n)=>s+n*n,0)/samples.length);
        if(rms>.018){spoke=true;lastSound=Date.now();}
        if((spoke&&Date.now()-lastSound>1400)||Date.now()-began>30000){clearInterval(interval);if(rec.state==='recording')rec.stop();}
      },100);
    } catch(e){if(attempt===sequence){stop();onError((e as Error).name==='NotAllowedError'?microphoneIssue('NotAllowedError').message:(e as Error).message);}}
  }
  async function start(){stop();const attempt=sequence;await player.unlock();if(attempt!==sequence)return;active=true;await listen();}
  async function speak(text:string){release();sequence++;await player.speak(text,getVoice());}
  function pauseInput(){release();sequence++;player.stop();}
  function interrupt(){release();sequence++;player.stop();if(active)void listen();}
  return {start,stop,speak,pauseInput,interrupt,tryUnlock:player.tryUnlock,isActive:()=>active,dispose:()=>{stop();player.dispose();}};
}
