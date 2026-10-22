// Small PCM frames keep live input off the main/UI thread.
class StudioCapture extends AudioWorkletProcessor {
  constructor(){super();this.parts=[];this.size=0;}
  process(inputs){
    const channel=inputs[0]?.[0];
    if(channel){this.parts.push(new Float32Array(channel));this.size+=channel.length;
      if(this.size>=sampleRate*.04){const audio=new Float32Array(this.size);let offset=0;for(const part of this.parts){audio.set(part,offset);offset+=part.length;}this.port.postMessage({audio,rate:sampleRate},[audio.buffer]);this.parts=[];this.size=0;}}
    return true;
  }
}
registerProcessor('agentic-capture',StudioCapture);
