export const BAND_COUNT=32;
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));

// Shared feature extraction for the browser analyser and Windows FFT frames.
// No oscillator, timer-based beat or generated input enters this processor.
export class RhythmSignal {
  constructor(){this.reset();}
  reset(){this.bands=new Float32Array(BAND_COUNT);this.previous=new Float32Array(BAND_COUNT);this.target=new Float32Array(BAND_COUNT);this.energy=0;this.targetEnergy=0;this.low=0;this.mid=0;this.high=0;this.onset=0;this.beats=0;this.lastBeat=-1000;this.lastInput=-1000;this.floor=.015;this.rms=0;}
  accept(frame,now){
    if(!frame||!Array.isArray(frame.bands)||frame.bands.length!==BAND_COUNT||!Number.isFinite(frame.rms))return false;
    const elapsed=Math.min(.2,Math.max(.001,(now-this.lastInput)/1000));
    const audible=frame.rms>.00015;let flux=0;
    for(let i=0;i<BAND_COUNT;i++){const v=audible?clamp(frame.bands[i]):0;flux+=Math.max(0,v-this.previous[i]);this.target[i]=v;this.previous[i]=v;}
    flux/=BAND_COUNT;
    this.targetEnergy=audible?clamp((20*Math.log10(Math.max(frame.rms,1e-8))+65)/50):0;
    if(audible&&flux>Math.max(.028,this.floor*1.65)&&now-this.lastBeat>240){this.onset=Math.min(1,flux*5+.2);this.lastBeat=now;this.beats++;}
    this.floor+=(flux-this.floor)*(1-Math.exp(-elapsed*2));
    this.rms=audible?frame.rms:0;this.lastInput=now;return true;
  }
  update(dt,now,enabled=true,intensity=1){
    dt=Math.min(.1,Math.max(0,dt));
    const live=enabled&&now-this.lastInput<350;
    const gain=Math.max(0,Math.min(1.5,intensity));
    for(let i=0;i<BAND_COUNT;i++){const target=live?this.target[i]*gain:0;this.bands[i]+=(target-this.bands[i])*(1-Math.exp(-dt*(target>this.bands[i]?20:6)));}
    const target=live?this.targetEnergy*gain:0;this.energy+=(target-this.energy)*(1-Math.exp(-dt*(target>this.energy?18:6)));
    const average=(a,b)=>{let sum=0;for(let i=a;i<b;i++)sum+=this.bands[i];return sum/(b-a);};
    this.low=average(0,10);this.mid=average(10,23);this.high=average(23,32);
    this.onset*=Math.exp(-dt*5);if(!live||gain===0)this.onset=0;
    return this;
  }
}

export function analyserFrame(analyser,bins,wave,gain=1){
  analyser.getFloatFrequencyData(bins);analyser.getFloatTimeDomainData(wave);
  let squares=0;for(const x of wave)squares+=x*x;
  const rate=analyser.context.sampleRate,fft=analyser.fftSize,bands=[];
  for(let b=0;b<BAND_COUNT;b++){
    if(40*400**(b/32)>=rate/2){bands.push(0);continue;}
    const first=Math.max(1,Math.min(bins.length-1,Math.round(40*400**(b/32)*fft/rate)));
    const last=Math.max(first,Math.min(bins.length-1,Math.round(40*400**((b+1)/32)*fft/rate)));
    let peak=-160;for(let i=first;i<=last;i++)peak=Math.max(peak,bins[i]);
    bands.push(clamp((peak+20*Math.log10(Math.max(gain,1e-10))+76)/56));
  }
  return {bands,rms:Math.sqrt(squares/wave.length)*gain};
}
