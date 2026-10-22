import {createLiveAudio,pcmBase64} from '../voice/live-audio';
type Event={type:string;[key:string]:any};
type Options={audio:HTMLAudioElement;getVoice:()=> 'man'|'woman';onEvent:(event:Event)=>void;onState:(state:string)=>void;onError:(message:string)=>void;onBlocked:(blocked:boolean)=>void};
export function createLiveVoice({audio,getVoice,onEvent,onState,onError,onBlocked}:Options){
  let ws:WebSocket|null=null,connecting:Promise<void>|null=null,stream:MediaStream|null=null,input:AudioContext|null=null,capture:AudioWorkletNode|null=null;
  let enabled=false,healthy=true,disposed=false,generation=0,micWanted=false,responseDone=true,mediaPaused=false,selectedVoice='',pendingResolve:(()=>void)|null=null;
  let awaitingResponse=false,playbackAllowed=false,playbackResponse='',playbackRevision=0;
  const output=createLiveAudio(audio,()=>onState('Speaking'),()=>{if(responseDone)onState(micWanted?'Listening':'');});
  const configuration=fetch('/api/voice/status').then(r=>r.json() as Promise<{enabled?:boolean}>).then(d=>{enabled=!!d.enabled;return enabled;}).catch(()=>false);
  function emit(data:Event){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
  function releaseMic(){capture?.disconnect();capture=null;stream?.getTracks().forEach(t=>t.stop());stream=null;void input?.close();input=null;emit({type:'microphone',enabled:false});}
  function silence(){playbackRevision++;playbackAllowed=false;awaitingResponse=false;playbackResponse='';if(mediaPaused)output.pauseForMedia();else output.reset();}
  function cancel(){silence();if(!mediaPaused)emit({type:'cancel'});pendingResolve?.();pendingResolve=null;if(!mediaPaused)responseDone=true;onState(micWanted?'Listening':'');}
  // Keep tool results and transcripts while video owns sound; discard late audio.
  function pauseForMedia(){mediaPaused=true;micWanted=false;releaseMic();silence();onState('');}
  function stop(){generation++;micWanted=false;releaseMic();cancel();output.reset();mediaPaused=false;const socket=ws;ws=null;connecting=null;socket?.close();onState('');}
  function fallback(){healthy=false;stop();}
  function fail(message:string){fallback();onError(message);}
  async function connect(){
    if(disposed)throw Error('Voice is closed.');
    if(!await configuration)throw Error('Live voice is not connected.');
    if(ws?.readyState===WebSocket.OPEN&&selectedVoice===getVoice())return;
    if(connecting)return connecting;
    ws?.close();const attempt=generation;selectedVoice=getVoice();onState('Connecting voice…');
    const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/voice/live?voice=${selectedVoice}`);ws=socket;
    const job=new Promise<void>((resolve,reject)=>{
      let ready=false;
      const timer=setTimeout(()=>{socket.close();reject(Error('Live voice took too long to connect. You can keep typing.'));},18000);
      socket.onmessage=({data})=>{
        if(disposed||attempt!==generation||socket!==ws)return;
        let event:Event;try{event=JSON.parse(data);}catch{return;}
        if(event.type==='ready'){ready=true;clearTimeout(timer);resolve();onState(micWanted?'Listening':'');}
        if(event.type==='response-start'&&!mediaPaused&&(awaitingResponse||micWanted)){
          playbackResponse=event.responseId;playbackAllowed=true;responseDone=false;
          // A new response may follow a spoken interruption without a click.
          // Reopen the native route only for this new response, never late audio.
          void tryUnlock();onEvent(event);
        }
        if(event.type==='audio'&&!mediaPaused&&playbackAllowed&&event.responseId===playbackResponse){try{output.push(event.audio);}catch{fail('The voice audio could not play. Please try Talk again.');}}
        // A manual cancel is already applied locally. Its delayed acknowledgement
        // must not interrupt a newer utterance that the visitor has requested.
        if(event.type==='interrupt'&&event.reason!=='cancel'){silence();responseDone=false;onState(micWanted?'Listening':'');}
        if(event.type==='status'&&(mediaPaused||awaitingResponse||playbackAllowed||micWanted)){responseDone=false;if(!mediaPaused)onState(event.status);onEvent(event);}
        if(event.type==='done'){responseDone=true;pendingResolve?.();pendingResolve=null;if(!mediaPaused&&!output.pending())onState(micWanted?'Listening':'');}
        if(event.type==='error'){clearTimeout(timer);reject(Error(event.message));fail(event.message);}
        if(event.type==='notice')onEvent(event);
        if(event.type==='transcript')onEvent({...event,active:!mediaPaused&&playbackAllowed&&(!event.responseId||event.responseId===playbackResponse)});
        if(['state','presentation','done'].includes(event.type))onEvent(event);
      };
      socket.onerror=()=>{clearTimeout(timer);reject(Error('Live voice could not connect. You can keep typing.'));if(ready&&ws===socket)fail('The voice connection stopped. Your conversation is saved; please try again.');};
      socket.onclose=()=>{clearTimeout(timer);if(!ready)reject(Error('Live voice could not connect. You can keep typing.'));if(ws===socket){const interrupted=!responseDone;ws=null;if(mediaPaused)output.pauseForMedia();else output.reset();releaseMic();micWanted=false;responseDone=true;onState('');pendingResolve?.();pendingResolve=null;onEvent({type:'ended'});if(ready&&interrupted)onError('The voice connection stopped. Your conversation is saved; please try again.');}};
    }).finally(()=>{if(connecting===job)connecting=null;});connecting=job;return job;
  }
  async function tryUnlock(){const revision=playbackRevision,ok=await output.unlock();if(revision===playbackRevision)onBlocked(!ok);return ok;}
  async function say(type:'text'|'read',text:string){
    mediaPaused=false;const attempt=generation;
    await connect();if(attempt!==generation||disposed||mediaPaused)return;
    if(!await tryUnlock())throw Error('Tap Enable sound to hear the assistant.');
    if(attempt!==generation||disposed||mediaPaused)return;
    awaitingResponse=true;responseDone=false;onState('Thinking…');emit({type,text});
  }
  async function start(){
    mediaPaused=false;const attempt=generation;micWanted=true;
    if(!await tryUnlock()){micWanted=false;throw Error('Tap Enable sound to allow audio.');}
    await connect();if(attempt!==generation||mediaPaused)return;
    const source=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(attempt!==generation||disposed||mediaPaused){source.getTracks().forEach(t=>t.stop());return;}
    stream=source;const context=new AudioContext({latencyHint:'interactive'});input=context;await context.resume();
    if(attempt!==generation||mediaPaused){releaseMic();return;}
    await context.audioWorklet.addModule('/audio/voice-capture.js');
    if(attempt!==generation||mediaPaused){releaseMic();return;}
    capture=new AudioWorkletNode(input,'agentic-capture');input.createMediaStreamSource(source).connect(capture);
    const silent=input.createGain();silent.gain.value=0;capture.connect(silent).connect(input.destination);
    capture.port.onmessage=({data})=>{if(!micWanted||!ws||ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>96000)return;emit({type:'audio',audio:pcmBase64(data.audio,data.rate)});};
    emit({type:'microphone',enabled:true});onState('Listening');
  }
  function dispose(){disposed=true;stop();output.dispose();}
  return {available:()=>configuration,isEnabled:()=>enabled&&healthy,isActive:()=>micWanted,start,stop,dispose,tryUnlock,cancel,fallback,pauseForMedia,
    speak:(text:string)=>say('read',text),send:(text:string)=>say('text',text),interrupt:cancel};
}
