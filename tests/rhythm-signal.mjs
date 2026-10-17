import assert from 'node:assert/strict';
import {RhythmSignal,analyserFrame} from '../web/rhythm-signal.mjs';
const signal=new RhythmSignal();
const tone=(start,end)=>({bands:Array.from({length:32},(_,i)=>i>=start&&i<end?.6:0),rms:.03});
let now=0;
for(let i=0;i<25;i++){signal.accept(tone(0,10),now);signal.update(.04,now);now+=40;}
assert.ok(signal.low>.58&&signal.mid===0&&signal.high===0,'Low tone must stay in low bands');
assert.equal(signal.beats,1,'A steady signal must not invent repeated beats');
const beats=signal.beats;
for(let hit=0;hit<4;hit++)for(let i=0;i<12;i++){signal.accept(i<3?tone(10,23):{bands:Array(32).fill(0),rms:0},now);signal.update(.04,now);now+=40;}
assert.equal(signal.beats-beats,4,'Four measured transients should produce four onsets');
for(let i=0;i<75;i++){signal.update(.04,now);now+=40;}
assert.ok(signal.energy<.00001&&Math.max(...signal.bands)<.00001,'Stale stream must decay to zero');
assert.equal(signal.accept({bands:[1],rms:1},now),false);
assert.equal(signal.accept({bands:Array(32).fill(1),rms:NaN},now),false);
signal.accept({bands:Array(32).fill(Infinity),rms:.1},now);signal.update(.04,now);assert.ok([...signal.bands].every(Number.isFinite));
signal.reset();signal.accept(tone(23,32),now);for(let i=0;i<60;i++)signal.update(.04,now,false);
assert.equal(signal.energy,0);assert.equal(signal.onset,0);
signal.reset();signal.accept(tone(23,32),now);for(let i=0;i<25;i++)signal.update(.04,now,true,0);assert.equal(signal.high,0);
const analyser={context:{sampleRate:48000},fftSize:2048,getFloatFrequencyData:b=>{b.fill(-Infinity);b[256]=-30;},getFloatTimeDomainData:w=>{for(let i=0;i<w.length;i++)w[i]=.03*Math.sin(i*Math.PI/4);}};
const measured=analyserFrame(analyser,new Float32Array(1024),new Float32Array(2048));
assert.ok(Math.abs(measured.rms-.03/Math.sqrt(2))<1e-6);assert.ok(measured.bands[26]>.5);assert.equal(measured.bands[0],0);
analyser.context.sampleRate=8000;analyser.getFloatFrequencyData=b=>b.fill(-25);
assert.equal(analyserFrame(analyser,new Float32Array(1024),new Float32Array(2048)).bands[31],0,'Bands above Nyquist must not repeat the last bin');
console.log('PASS real spectral bands, stable tone, transients, silence/stale decay, pause, intensity, invalid frames, browser bin mapping');
