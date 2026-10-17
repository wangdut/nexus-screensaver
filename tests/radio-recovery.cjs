const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policy=require('./radio-policy.cjs');
const source=fs.readFileSync('web/radio.js','utf8').replace(/^import .*;$/gm,'');
const station=()=>policy.searchStations()[0];
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function harness({saved=station(),query='',resolve=async s=>s,failures=0,native=false,favorites=[saved]}={}){
 const elements=new Map(),storage=new Map(),timers=new Map(),media=[],hlsSources=[],hlsOptions=[],requests=[],messages=[];let clock=0,listener;
 class Element {constructor(){this.handlers={};this.hidden=false;this.children=[];this.value='';this.textContent='';}addEventListener(k,f){this.handlers[k]=f;}setAttribute(){}append(...c){this.children.push(...c);}replaceChildren(){this.children=[];}click(){return this.handlers.click?.({target:this});}showModal(){this.open=true;}close(){this.open=false;}focus(){}}
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 class Audio {constructor(){this.events={};this.currentTime=0;this.readyState=0;media.push(this);}addEventListener(k,f){this.events[k]=f;}emit(k){this['on'+k]?.();this.events[k]?.();}pause(){}load(){}removeAttribute(){this.src='';}hasAttribute(){return !!this.src;}canPlayType(){return '';}async play(){if(failures-->0){this.error={code:4,message:'Simulated unavailable source'};this.emit('error');throw Object.assign(new Error(),{name:'NotSupportedError'});}this.currentTime=1;this.readyState=4;this.emit('playing');}}
 class Hls {static Events={MEDIA_ATTACHED:'attach',MANIFEST_PARSED:'parsed',ERROR:'error'};static isSupported(){return true;}constructor(options){this.handlers={};hlsOptions.push(options);}on(k,f){this.handlers[k]=f;}attachMedia(){this.handlers.attach?.();}loadSource(url){hlsSources.push(url);this.handlers.parsed?.();}destroy(){}}
 storage.set('nexus.radio.cache',JSON.stringify({stations:[{id:'unreviewed',name:'Cached',url:'https://evil.test/live.mp3'}]}));
 storage.set('nexus.radio.v1',JSON.stringify({station:saved,favorites,volume:21,muted:true,auto:false}));
 const window={addEventListener(){}};
 if(native)window.chrome={webview:{addEventListener(k,f){listener=f;},postMessage(s){const m=JSON.parse(s);messages.push(m);if(m.action==='preferences')queueMicrotask(()=>listener({data:{id:m.id,result:{musicAuto:false}}}));if(m.action==='radioResolve')Promise.resolve(resolve(saved)).then(r=>listener({data:{id:m.id,result:r}}));if(m.action==='audioRelease')queueMicrotask(()=>listener({data:{id:m.id,result:true}}));}}};
 const context={...policy,FetchLoader:class{},Request,window,document:{getElementById:get,createElement:()=>new Element(),addEventListener(){}},location:{search:query},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},URL,URLSearchParams,AbortSignal,Audio,Hls,console,clearTimeout:id=>timers.delete(id),setTimeout:(f,ms)=>{timers.set(++clock,{f,ms});return clock;},fetch:async url=>{requests.push(url);throw new Error('Unexpected directory request');}};
 vm.runInNewContext(source,context);
 return {get,media,hlsSources,hlsOptions,requests,messages,state:()=>window.nexusRadio.getState(),cache:()=>storage.get('nexus.radio.cache'),prefs:()=>JSON.parse(storage.get('nexus.radio.v1')),click:()=>get('miniPlay').click(),stop:()=>window.nexusRadio.stop(),reply:(m,result,error)=>listener({data:{id:m.id,result,error}}),retry:async()=>{await flush();for(const [id,t] of [...timers])if(t.ms===700){timers.delete(id);t.f();}await flush();}};
}
const tests=[];
function test(name,run){tests.push({name,run});}
test('Unreviewed saved stations and cache cannot play; volume is retained',async()=>{
 const b=harness({saved:{id:'unknown',url:station().url,name:station().name}});b.click();await flush();assert.equal(b.state().station,null);assert.equal(b.state().playing,false);assert.equal(b.state().favorites,0);assert.equal(b.state().volume,21);assert.equal(b.cache(),undefined);
});
test('A known legacy ID migrates to the reviewed source and canonical metadata',async()=>{
 const b=harness({saved:{id:station().legacyIds[0],name:'forged',url:'https://evil.test/live.mp3',hls:false}});b.click();await flush();assert.equal(b.state().station.id,station().id);assert.equal(b.state().station.url,station().url);assert.equal(b.state().playing,true);assert.equal(b.prefs().favorites[0].url,station().url);
});
test('Recovery never substitutes an arbitrary remote URL and retains volume/mute',async()=>{
 const b=harness({failures:1});b.click();await b.retry();assert.equal(b.state().playing,true);assert.equal(b.state().retries,1);assert.equal(b.media.at(-1).volume,.21);assert.equal(b.media.at(-1).muted,true);assert.equal(b.requests.length,0);assert.ok(b.hlsSources.every(u=>u===station().url));
});
test('Duplicate and unreviewed favorites are removed without losing approved entries',async()=>{
 const b=harness({favorites:[station(),{id:station().legacyIds[0]},{id:'unknown'}]});assert.equal(b.state().favorites,1);assert.equal(b.prefs().favorites[0].id,station().id);
});
test('Old media callbacks cannot affect a new attempt',async()=>{
 const b=harness();b.click();await flush();const old=b.media.at(-1),callbacks=[old.onerror,old.onended,old.onplaying];b.stop();b.click();await flush();for(const c of callbacks)c?.();old.emit('error');old.emit('ended');await flush();assert.equal(b.state().playing,true);assert.equal(b.state().retries,0);
});
test('Stop cancels an outstanding native resolution without restarting music',async()=>{
 let finish;const b=harness({native:true,failures:1,resolve:()=>new Promise(r=>finish=r)});b.click();await flush();b.reply(b.messages.find(m=>m.action==='audioAcquire'),true);await flush();b.stop();finish(station());await b.retry();assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);
});
test('Repeated failure is bounded to two retries with no background restart',async()=>{
 const b=harness({failures:10});b.click();await b.retry();await b.retry();await b.retry();assert.equal(b.state().retries,2);assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);assert.equal(b.media.length,4);
});
test('Preview and secondary screen never acquire or play audio',async()=>{
 for(const query of ['?preview=1','?screensaver=1&audio=0']){const b=harness({query});b.click();await flush();assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);}
});
test('Late native acquisition failure cannot stop the newer playback session',async()=>{
 const b=harness({native:true});b.click();await flush();const first=b.messages.find(m=>m.action==='audioAcquire');b.stop();b.click();await flush();const second=b.messages.filter(m=>m.action==='audioAcquire').at(-1);b.reply(second,true);await flush();b.reply(first,null,'Old request failed');await flush();assert.equal(b.state().playing,true);
});
test('Forged native resolution result cannot change the reviewed URL',async()=>{
 const b=harness({native:true,failures:1,resolve:async()=>({...station(),url:'https://evil.test/new.m3u8'})});b.click();await flush();b.reply(b.messages.find(m=>m.action==='audioAcquire'),true);await b.retry();assert.equal(b.state().playing,true);assert.ok(b.hlsSources.every(u=>u===station().url));
});
test('The HLS loader rejects foreign resources and disables redirects and credentials',async()=>{
 const b=harness();b.click();await flush();const options=b.hlsOptions.at(-1);assert.ok(options.loader);
 for(const url of [station().url,station().url.replace('live.m3u8','1792166400000/75513117.ts')]){
  const request=await options.fetchSetup({url},{method:'GET',redirect:'follow',credentials:'include',referrerPolicy:'unsafe-url'});
  assert.equal(request.url,url);assert.equal(request.redirect,'error');assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');
 }
 for(const url of ['https://evil.test/live.m3u8',policy.searchStations()[1].url,station().url.replace('live.m3u8','unreviewed-key.bin')]){
  await assert.rejects(options.fetchSetup({url},{}),/outside the reviewed station/);
 }
});
(async()=>{for(const t of tests){await t.run();console.log('PASS '+t.name);}console.log(tests.length+' radio recovery tests passed');})().catch(e=>{console.error(e);process.exitCode=1;});
