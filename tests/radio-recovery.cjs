const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const source=(process.argv.includes('--baseline')?execFileSync('git',['show','v1.2.0:web/radio.js'],{encoding:'utf8'}):fs.readFileSync('web/radio.js','utf8')).replace("import Hls from 'hls.js';",'');
const station=(url='https://radio.test/live.mp3',hls=false)=>({id:'24711f7f-8ff5-4141-8e0f-ab17f3da1b89',name:'Test music',url,hls});
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function harness({saved=station(),query='',resolve=async s=>s,failures=0,native=false}={}){
 const elements=new Map(),storage=new Map(),timers=new Map(),media=[],hlsSources=[],requests=[],messages=[];let clock=0,listener;
 class Element {constructor(){this.handlers={};this.hidden=false;this.children=[];this.value='';this.textContent='';}addEventListener(k,f){this.handlers[k]=f;}setAttribute(){}append(...c){this.children.push(...c);}replaceChildren(){this.children=[];}click(){return this.handlers.click?.({target:this});}showModal(){this.open=true;}close(){this.open=false;}focus(){}}
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 class Audio {constructor(){this.events={};this.currentTime=0;this.readyState=0;media.push(this);}addEventListener(k,f){this.events[k]=f;}emit(k){this['on'+k]?.();this.events[k]?.();}pause(){}load(){}removeAttribute(){this.src='';}hasAttribute(){return !!this.src;}canPlayType(){return '';}async play(){if(failures-->0){this.error={code:4,message:'Simulated unavailable source'};this.emit('error');throw Object.assign(new Error(),{name:'NotSupportedError'});}this.currentTime=1;this.readyState=4;this.emit('playing');}}
 class Hls {static Events={MEDIA_ATTACHED:'attach',MANIFEST_PARSED:'parsed',ERROR:'error'};static isSupported(){return true;}constructor(){this.handlers={};}on(k,f){this.handlers[k]=f;}attachMedia(){this.handlers.attach?.();}loadSource(url){hlsSources.push(url);this.handlers.parsed?.();}destroy(){}}
 storage.set('nexus.radio.v1',JSON.stringify({station:saved,favorites:[saved],volume:21,muted:true,auto:false}));
 const window={addEventListener(){}};
 if(native)window.chrome={webview:{addEventListener(k,f){listener=f;},postMessage(s){const m=JSON.parse(s);messages.push(m);if(m.action==='preferences')queueMicrotask(()=>listener({data:{id:m.id,result:{musicAuto:false}}}));if(m.action==='audioRelease'||m.action==='radioClick')queueMicrotask(()=>listener({data:{id:m.id,result:true}}));}}};
 const context={window,document:{getElementById:get,createElement:()=>new Element(),addEventListener(){}},location:{search:query},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URL,URLSearchParams,AbortSignal,Audio,Hls,console,clearTimeout:id=>timers.delete(id),setTimeout:(f,ms)=>{timers.set(++clock,{f,ms});return clock;},fetch:async url=>{requests.push(url);if(url.includes('/byuuid/')){const s=await resolve(saved);return {ok:true,json:async()=>s?[{stationuuid:s.id,name:s.name,url_resolved:s.url,hls:s.hls}]:[]};}return {ok:true,json:async()=>({ok:true})};}};
 vm.runInNewContext(source,context);
 return {get,media,hlsSources,requests,messages,state:()=>window.nexusRadio.getState(),prefs:()=>JSON.parse(storage.get('nexus.radio.v1')),click:()=>get('miniPlay').click(),stop:()=>window.nexusRadio.stop(),reply:(m,result,error)=>listener({data:{id:m.id,result,error}}),retry:async()=>{await flush();for(const [id,t] of [...timers])if(t.ms===700){timers.delete(id);t.f();}await flush();},switchTo:s=>{storage.set('nexus.radio.cache',JSON.stringify({stations:[s],at:Date.now()}));}};
}
const tests=[];
function test(name,run){tests.push({name,run});}
test('Expired URL refreshes by UUID, updates favorites and preserves mute/volume',async()=>{
 const old=station('https://radio.test/expired.mp3'),fresh=station('https://radio.test/current.mp3');const b=harness({saved:old,failures:1,resolve:async()=>fresh});b.click();await b.retry();
 assert.equal(b.state().playing,true);assert.equal(b.state().station.url,fresh.url);assert.equal(b.prefs().favorites[0].url,fresh.url);assert.equal(b.state().retries,1);assert.equal(b.media.at(-1).volume,.21);assert.equal(b.media.at(-1).muted,true);assert.equal(b.requests.filter(x=>x.includes('/byuuid/')).length,1);
});
test('String zero HLS flag uses direct audio for extensionless streams',async()=>{const b=harness({saved:station('https://radio.test/stream','0')});b.click();await flush();assert.equal(b.hlsSources.length,0);assert.equal(b.media.at(-1).src,'https://radio.test/stream');assert.equal(b.state().playing,true);});
test('MP3 extension overrides stale HLS metadata',async()=>{const b=harness({saved:station(undefined,true)});b.click();await flush();assert.equal(b.hlsSources.length,0);assert.equal(b.state().station.hls,false);});
test('M3U8 extension selects HLS despite false metadata',async()=>{const b=harness({saved:station('https://radio.test/live.m3u8',false)});b.click();await flush();assert.equal(b.hlsSources.length,1);assert.equal(b.state().playing,true);});
test('Old media errors, ended and playing callbacks cannot affect a new attempt',async()=>{
 const b=harness();b.click();await flush();const old=b.media.at(-1),callbacks=[old.onerror,old.onended,old.onplaying];b.stop();b.click();await flush();for(const callback of callbacks)callback?.();old.emit('error');old.emit('ended');await flush();assert.equal(b.state().playing,true);assert.equal(b.state().retries,0);
});
test('Stop cancels an outstanding URL refresh without restarting music',async()=>{
 let finish;const b=harness({failures:1,resolve:()=>new Promise(r=>finish=r)});b.click();await flush();b.stop();finish(station('https://radio.test/new.mp3'));await b.retry();assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);assert.equal(b.state().station.url,station().url);
});
test('Directory outage still retries the original station',async()=>{const b=harness({failures:1,resolve:async()=>{throw Error('Offline directory');}});b.click();await b.retry();assert.equal(b.state().playing,true);assert.equal(b.state().station.url,station().url);});
test('Repeated failure is bounded to two retries with no background restart',async()=>{const b=harness({failures:10});b.click();await b.retry();await b.retry();await b.retry();assert.equal(b.state().retries,2);assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);assert.match(b.get('radioStatus').textContent,/2/);assert.equal(b.media.length,4);});
test('Preview and secondary screen never acquire or play audio',async()=>{for(const query of ['?preview=1','?screensaver=1&audio=0']){const b=harness({query});b.click();await flush();assert.equal(b.state().playing,false);assert.equal(b.state().busy,false);}});
test('Late native acquisition failure cannot stop the newer playback session',async()=>{const b=harness({native:true});b.click();await flush();const first=b.messages.find(m=>m.action==='audioAcquire');b.stop();b.click();await flush();const second=b.messages.filter(m=>m.action==='audioAcquire').at(-1);b.reply(second,true);await flush();b.reply(first,null,'Old request failed');await flush();assert.equal(b.state().playing,true);});
(async()=>{for(const t of tests){await t.run();console.log('PASS '+t.name);}console.log(tests.length+' radio recovery tests passed');})().catch(e=>{console.error(e);process.exitCode=1;});
