const {connect,wait}=require('./cdp.cjs');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await connect();const {send,evaluate,events}=browser;
  const results=[];
  async function ready(){for(let i=0;i<100;i++){if(await evaluate('Boolean(window.nexus?.getState().ready)'))return;await wait(150);}throw new Error('Application did not become ready');}
  async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`screenshots/${name}.png`,Buffer.from(result.data,'base64'));}
  async function click(selector){const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});}
  async function key(key,code=key){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await wait(80);}
  try{
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await ready();
    await evaluate("localStorage.removeItem('nexus.preferences.v1'); location.reload()");await wait(500);await ready();await wait(1500);
    let state=await evaluate('nexus.getState()');assert.equal(state.ready,true);assert.ok(state.frames>3);assert.ok(state.particleCount>=16000);results.push({test:'WebGL rendering',pass:true,state});
    await screenshot('desktop-core');
    for(const index of [1,2,0]){await click(`[data-scene="${index}"]`);await wait(2100);assert.equal((await evaluate('nexus.getState()')).scene,index);await screenshot(['desktop-core','desktop-orbit','desktop-warp'][index]);}
    results.push({test:'All scene buttons and morphs',pass:true});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1050,y:490});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:1050,y:490,button:'left',clickCount:1});await wait(1000);
    assert.ok((await evaluate('nexus.getState()')).charge>.2);await screenshot('interaction-charge');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:510,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1100,y:510,button:'left',clickCount:1});
    assert.equal((await evaluate('nexus.getState()')).pulses,1);results.push({test:'Pointer charge, drag and release pulse',pass:true});
    await click('[data-palette="violet"]');assert.equal((await evaluate('nexus.getState()')).palette,'violet');
    await evaluate("document.getElementById('gravity').value=82;document.getElementById('gravity').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('speed').value=13;document.getElementById('speed').dispatchEvent(new Event('input',{bubbles:true}));");
    state=await evaluate('nexus.getState()');assert.equal(state.gravity,82);assert.equal(state.speed,13);
    await click('#autoplay');assert.equal((await evaluate('nexus.getState()')).autoplay,false);
    await click('#qualityButton');assert.equal((await evaluate('nexus.getState()')).quality,'high');
    await click('#qualityButton');assert.equal((await evaluate('nexus.getState()')).quality,'eco');assert.equal((await evaluate('nexus.getState()')).particleCount,16000);
    await click('#qualityButton');assert.equal((await evaluate('nexus.getState()')).quality,'auto');results.push({test:'Palette, sliders, roam and quality controls',pass:true});
    await send('Page.reload');await wait(600);await ready();state=await evaluate('nexus.getState()');assert.equal(state.palette,'violet');assert.equal(state.gravity,82);assert.equal(state.autoplay,false);results.push({test:'Preferences survive reload',pass:true});
    await key('2','Digit2');assert.equal((await evaluate('nexus.getState()')).scene,1);
    await key(' ','Space');assert.equal((await evaluate('nexus.getState()')).paused,true);
    await key(' ','Space');assert.equal((await evaluate('nexus.getState()')).paused,false);
    await key('h','KeyH');assert.equal((await evaluate('nexus.getState()')).zen,true);
    await key('h','KeyH');assert.equal((await evaluate('nexus.getState()')).zen,false);
    await click('#helpButton');assert.equal(await evaluate("document.getElementById('helpDialog').open"),true);
    await key('Escape');assert.equal(await evaluate("document.getElementById('helpDialog').open"),false);results.push({test:'Keyboard shortcuts and help modal',pass:true});
    await click('[data-palette="ice"]');await key('1','Digit1');
    for(const [width,height]of[[1366,768],[3440,1440],[3840,2160],[768,1024],[375,812],[320,568],[800,480]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(450);
      const layout=await evaluate(`(()=>{const selectors=['.header','.intro','.controls','.bottom'];return {overflow:document.documentElement.scrollWidth>innerWidth,rects:selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height}}),size:nexus.getState()}})()`);
      assert.equal(layout.overflow,false,`Horizontal overflow at ${width}x${height}`);
      for(const r of layout.rects){assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1,`Out of bounds at ${width}x${height}: ${JSON.stringify(r)}`);}
      const intro=layout.rects[1],controls=layout.rects[2];
      const overlap=intro.x<controls.x+controls.w&&intro.x+intro.w>controls.x&&intro.y<controls.y+controls.h&&intro.y+intro.h>controls.y;
      assert.equal(overlap,false,`Intro/control collision at ${width}x${height}`);
      if(width===375||width===3440||width===768)await screenshot(`responsive-${width}x${height}`);
      results.push({test:`Responsive ${width}×${height}`,pass:true});
    }
    await send('Emulation.setDeviceMetricsOverride',{width:500,height:300,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/?preview=1'});await wait(500);await ready();
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.header')).display"),'none');await screenshot('windows-preview');results.push({test:'Windows compact preview mode',pass:true});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Page.reload');await wait(600);await ready();assert.equal((await evaluate('nexus.getState()')).paused,true);results.push({test:'Reduced motion preference',pass:true});
    const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
    assert.equal(errors.length,0,JSON.stringify(errors));
    const remoteRequests=events.filter(e=>e.method==='Network.requestWillBeSent'&&!e.params.request.url.startsWith('http://127.0.0.1:4173')&&!e.params.request.url.startsWith('data:'));
    assert.equal(remoteRequests.length,0);results.push({test:'No JavaScript, shader or network errors; no external requests',pass:true});
    await fs.writeFile('tests/results.json',JSON.stringify({passed:results.length,results},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));
  }catch(error){await fs.writeFile('tests/results.json',JSON.stringify({results,error:String(error)},null,2));await screenshot('failure').catch(()=>{});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
