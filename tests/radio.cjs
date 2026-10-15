const {connect,wait}=require('./cdp.cjs');
const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{
 const b=await connect();const {send,evaluate}=b;const results=[];
 const click=s=>evaluate('document.querySelector('+JSON.stringify(s)+').click()');
 const until=async(expression,seconds=30)=>{for(let i=0;i<seconds*5;i++){if(await evaluate(expression))return;await wait(200);}throw Error('Timed out: '+expression);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile('screenshots/'+name+'.png',Buffer.from(r.data,'base64'));};
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await until('Boolean(window.nexus?.getState().ready)');
  await evaluate("localStorage.removeItem('nexus.radio.v1');localStorage.removeItem('nexus.radio.cache');location.reload()");await wait(400);await until('Boolean(window.nexusRadio)');
  assert.equal((await evaluate('nexusRadio.getState()')).playing,false);await click('#radioButton');await until('nexusRadio.getState().stations>0');
  results.push({test:'Live Radio Browser query returns music stations',pass:true,count:(await evaluate('nexusRadio.getState()')).stations});
  await click('.favorite-button');assert.equal((await evaluate('nexusRadio.getState()')).favorites,1);await click('#favoritesButton');assert.equal(await evaluate("document.querySelectorAll('.station-row').length"),1);await click('#favoritesButton');
  await click('#radioMute');assert.equal((await evaluate('nexusRadio.getState()')).muted,true);
  await evaluate("document.getElementById('radioVolume').value=21;document.getElementById('radioVolume').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal((await evaluate('nexusRadio.getState()')).volume,21);
  let streamed=false;
  for(let index=0;index<4;index++){
   await click('.station-row:nth-child('+(index+1)+') .station-select');
   try{await until('nexusRadio.getState().playing',19);const before=(await evaluate('nexusRadio.getState()')).currentTime;await wait(5000);assert.ok((await evaluate('nexusRadio.getState()')).currentTime>before+3);streamed=true;break;}catch{}
  }
  assert.ok(streamed,'No live station decoded successfully');
  results.push({test:'Real internet audio decoded and played muted',pass:true,station:(await evaluate('nexusRadio.getState()')).station});
  await shot('radio-desktop');await click('#closeRadio');
  await click('#miniMute');assert.equal((await evaluate('nexusRadio.getState()')).muted,false);await click('#miniMute');
  await evaluate('nexus.setZen(true)');assert.equal(await evaluate("document.getElementById('audioDock').hidden"),false);await click('#miniPlay');assert.equal((await evaluate('nexusRadio.getState()')).playing,false);await evaluate('nexus.setZen(false)');
  results.push({test:'Mini player, mute/unmute, volume and pure-mode controls',pass:true});
  await send('Page.reload');await wait(400);await until('Boolean(window.nexusRadio)');let state=await evaluate('nexusRadio.getState()');assert.equal(state.volume,21);assert.equal(state.muted,true);assert.equal(state.favorites,1);assert.equal(state.playing,false);
  results.push({test:'Preferences and favorites persist without unintended autoplay',pass:true});
  await click('#radioButton');await until('nexusRadio.getState().stations>0');
  for(const [width,height]of[[375,812],[320,568],[1920,1080]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(250);const fits=await evaluate("(()=>{const d=document.getElementById('radioDialog'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1})()");assert.ok(fits,'Radio dialog overflow '+width);if(width===375)await shot('radio-mobile');}
  results.push({test:'Radio dialog fits 320px mobile through full HD',pass:true});
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await click('#radioSearchButton');await until("document.getElementById('directoryStatus').textContent.includes('缓存')",25);results.push({test:'Offline directory falls back to labeled cache',pass:true});
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/?screensaver=1&audio=0'});await wait(500);await until('Boolean(window.nexusRadio)');assert.equal(await evaluate("document.getElementById('radioButton').hidden"),true);assert.equal((await evaluate('nexusRadio.getState()')).playing,false);results.push({test:'Secondary monitor cannot start audio',pass:true});
  await fs.writeFile('tests/radio-results.json',JSON.stringify({passed:results.length,results},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));
 }catch(error){await shot('radio-failure').catch(()=>{});await fs.writeFile('tests/radio-results.json',JSON.stringify({results,error:String(error),status:await evaluate("document.getElementById('directoryStatus')?.textContent"),errors:b.events.filter(e=>e.method==='Log.entryAdded'||e.method==='Runtime.exceptionThrown'||e.method==='Network.loadingFailed')},null,2));throw error;}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
