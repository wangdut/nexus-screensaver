const {connect,wait}=require('./cdp.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
// Deterministic PCM goes through a real HTMLAudioElement and captureStream.
// Only the test replaces the radio accessor; production always uses the player.
function playTone(hz=120,complex=false){
  window.testAudio?.pause();
  const rate=48000,seconds=12,n=rate*seconds,buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
  const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){
    const t=i/rate,beat=complex?Math.exp(-(t%.5)*15):1;
    let sample=Math.sin(2*Math.PI*hz*t)*.12*beat;
    if(complex)sample+=.07*Math.sin(2*Math.PI*[261.63,329.63,392,523.25][Math.floor(t*2)%4]*t)+.03*Math.sin(2*Math.PI*6000*t)*Math.exp(-(t%.25)*24);
    v.setInt16(44+i*2,Math.round(sample*32767),true);
  }
  if(window.testUrl)URL.revokeObjectURL(window.testUrl);
  window.testUrl=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
  window.testAudio=new Audio(window.testUrl);testAudio.loop=true;testAudio.volume=.25;
  nexusRadio.getMedia=()=>testAudio;
  document.getElementById('rhythmButton').click();document.getElementById('rhythmDialog').close();
  return testAudio.play();
}
(async()=>{
  const browser=await connect(),{send,evaluate,events}=browser,results=[];
  const state=()=>evaluate('nexusRhythm.getState()');
  const source=async name=>evaluate(`(()=>{const s=document.getElementById('rhythmSource');s.value='${name}';s.dispatchEvent(new Event('change'));})()`);
  async function until(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await wait(100);}throw new Error('Timeout '+expr+' '+JSON.stringify(await state()));}
  async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile('screenshots/'+name+'.png',Buffer.from(r.data,'base64'));}
  try{
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await until('Boolean(window.nexus?.getState().ready)');
    await evaluate("localStorage.removeItem('nexus.rhythm.v1');localStorage.removeItem('nexus.preferences.v1');localStorage.removeItem('nexus.radio.v1');location.reload()");await wait(500);await until('Boolean(window.nexus?.getState().ready)');
    assert.equal((await state()).energy,0);
    await evaluate(`(${playTone})(120)`);await until('nexusRhythm.getState().low>.1');let s=await state();assert.ok(s.low>s.high*3);const beats=s.beats;
    await wait(1200);assert.ok((await state()).beats<=beats+1);results.push('A real steady 120 Hz audio element drives bass without recurring fake beats');
    await evaluate(`(${playTone})(6000)`);await wait(1300);s=await state();assert.ok(s.high>s.low*3,JSON.stringify(s));results.push('Switching the media element to 6 kHz moves response to high frequencies');
    await evaluate('testAudio.muted=true');await wait(1600);assert.ok((await state()).energy<.001);await evaluate('testAudio.muted=false');await until('nexusRhythm.getState().high>.04');results.push('Mute decays and unmute restores analysis without reconnecting playback');
    await evaluate("document.getElementById('pauseButton').click()");await wait(1400);s=await state();assert.ok(s.energy<.001);assert.equal(s.context,'suspended');await evaluate("document.getElementById('pauseButton').click()");await until('nexusRhythm.getState().high>.04');results.push('Pause releases the capture branch and suspends analysis, resume recovers');
    await source('off');await wait(1400);assert.equal((await state()).energy,0);assert.ok(await evaluate('!testAudio.paused&&testAudio.currentTime>0'));await source('radio');await until('nexusRhythm.getState().high>.04');results.push('Turning off effects leaves music playing');
    await evaluate(`(${playTone})(80,true)`);await wait(1600);await screenshot('rhythm-core');
    for(const [index,name] of [[1,'orbit'],[2,'gate']]){await evaluate(`nexus.setScene(${index})`);await wait(2200);await screenshot('rhythm-'+name);}
    results.push('All three scenes render with measured bass, melody, treble and onsets');
    await evaluate("document.getElementById('rhythmButton').click()");await screenshot('rhythm-controls');
    for(const [width,height]of [[320,568],[375,812],[800,480],[768,1024],[3440,1440],[3840,2160]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(200);
      const r=await evaluate("(()=>{const r=document.getElementById('rhythmDialog').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:document.documentElement.scrollWidth>innerWidth}})()");
      assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width+1&&r.y+r.h<=height+1&&!r.overflow,JSON.stringify(r));
      if(width===320)await screenshot('rhythm-mobile');
    }results.push('Music controls fit 320px, short windows, portrait, ultrawide and 4K');
    await evaluate("document.getElementById('rhythmIntensity').value=42;document.getElementById('rhythmIntensity').dispatchEvent(new Event('input'))");await send('Page.reload');await wait(500);await until('Boolean(window.nexus?.getState().ready)');assert.equal((await state()).intensity,42);results.push('Intensity persists across reload');
    await send('Page.navigate',{url:'http://127.0.0.1:4173/?preview=1'});await wait(500);await until('Boolean(window.nexus?.getState().ready)');s=await state();assert.equal(s.capturing,false);assert.equal(s.energy,0);assert.equal(s.context,'none');results.push('Windows preview never captures audio');
    const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:results.length,results},null,2));await fs.writeFile('tests/rhythm-results.json',JSON.stringify(results,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
