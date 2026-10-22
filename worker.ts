import {openGrokVoice} from './server/grok-voice.mjs';
import {createConfiguredApi,commerceFor} from './server/bootstrap.mjs';
import {createSpeechApi} from './server/speech-api.mjs';
export default {
 async fetch(request:Request,env:Cloudflare.Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/api/voice/live')return openGrokVoice(request,env,{commerce:commerceFor(env,request.headers.get('cf-connecting-ip')||''),wallApi:createConfiguredApi(env)});
  if(path==='/api/voice/status')return Response.json({enabled:Boolean(env.XAI_API_KEY&&env.GROK_VOICE_ENABLED==='true'),provider:'xAI',model:'grok-voice-3.0'},{headers:{'Cache-Control':'no-store'}});
  if(path==='/api/studio'||path.startsWith('/api/studio/'))return createConfiguredApi(env)(request);
  if(path==='/api/speech')return createSpeechApi({key:env.ELEVENLABS_API_KEY,voiceId:env.ELEVENLABS_VOICE_ID,femaleVoiceId:env.ELEVENLABS_FEMALE_VOICE_ID,model:env.ELEVENLABS_MODEL||'eleven_v4'})(request);
  if(path.startsWith('/api/'))return new Response('Not found',{status:404});
  return env.ASSETS.fetch(request);
 }
};
