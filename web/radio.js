import Hls from 'hls.js';

const $=id=>document.getElementById(id);
const native=Boolean(window.chrome?.webview);
const params=new URLSearchParams(location.search);
const canPlay=!params.has('preview')&&params.get('audio')!=='0';
const audio=new Audio();audio.preload='none';
let prefs={volume:35,muted:false,station:null,favorites:[],auto:false};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('nexus.radio.v1')||'{}')};}catch{}
prefs.volume=Math.max(0,Math.min(100,Number(prefs.volume)||0));
prefs.favorites=Array.isArray(prefs.favorites)?prefs.favorites.filter(validStation).slice(0,100):[];
if(!validStation(prefs.station))prefs.station=null;
let stations=[],hls=null,generation=0,timeout=null,playing=false,busy=false,onlyFavorites=false,requestNumber=0,searchNumber=0,clickReported=false;
const pending=new Map();
function validStation(s){try{return s&&typeof s.name==='string'&&typeof s.id==='string'&&new URL(s.url).protocol==='https:';}catch{return false;}}
function save(){try{localStorage.setItem('nexus.radio.v1',JSON.stringify(prefs));}catch{}}
function host(action,extra={}){
  return new Promise((resolve,reject)=>{const id='radio-'+(++requestNumber);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('请求超时，请重试。'));},30000);pending.set(id,{resolve,reject,timer});window.chrome.webview.postMessage(JSON.stringify({id,action,...extra}));});
}
if(native)window.chrome.webview.addEventListener('message',event=>{const entry=pending.get(event.data?.id);if(!entry)return;clearTimeout(entry.timer);pending.delete(event.data.id);event.data.error?entry.reject(new Error(event.data.error)):entry.resolve(event.data.result);});
const apiHosts=['https://de1.api.radio-browser.info','https://de2.api.radio-browser.info','https://nl1.api.radio-browser.info'];
async function api(path){let error;for(const server of apiHosts){try{const response=await fetch(server+path,{signal:AbortSignal.timeout(7000)});if(!response.ok)throw new Error('服务暂不可用');return await response.json();}catch(e){error=e;}}throw error;}
function setStatus(message){$('radioStatus').textContent=message;$('miniStatus').textContent=message;}
function controls(){
  $('radioPlay').textContent=playing||busy?'停止播放':'播放电台';$('miniPlay').textContent=playing||busy?'■':'▶';$('miniPlay').setAttribute('aria-label',playing||busy?'停止播放':'播放电台');
  $('radioMute').textContent=prefs.muted?'取消静音':'静音';$('radioMute').setAttribute('aria-pressed',String(prefs.muted));
  $('miniMute').textContent=prefs.muted?'静音中':'声音';$('miniMute').setAttribute('aria-pressed',String(prefs.muted));
  $('radioVolume').value=prefs.volume;$('miniVolume').value=prefs.volume;$('radioVolumeValue').textContent=prefs.volume+'%';
  audio.volume=prefs.volume/100;audio.muted=Boolean(prefs.muted);$('musicAuto').checked=Boolean(prefs.auto);
  $('nowStation').textContent=prefs.station?.name||'选择一个电台，给星空一点声音';$('miniStation').textContent=prefs.station?.name||'星际电台';
  $('audioDock').hidden=!prefs.station||!canPlay;
  $('radioPlay').disabled=!prefs.station||!canPlay;
}
function release(){if(native)host('audioRelease').catch(()=>{});}
function unload(){clearTimeout(timeout);timeout=null;audio.pause();if(hls){hls.destroy();hls=null;}audio.removeAttribute('src');audio.load();playing=false;busy=false;}
function stop(message='已停止播放'){generation++;unload();release();setStatus(message);controls();}
function fail(message){generation++;unload();release();setStatus(message);controls();}
async function play(station=prefs.station){
  if(!canPlay){setStatus('当前为预览或副屏，请在主屏播放。');return;}
  if(!validStation(station))return;
  const token=++generation;unload();clickReported=false;prefs.station={id:station.id,name:station.name,url:station.url,hls:Boolean(station.hls),language:station.language||'',tags:station.tags||''};save();busy=true;setStatus('连接中…');controls();
  if(native){try{const granted=await host('audioAcquire');if(token!==generation)return;if(!granted){fail('另一个 NEXUS 窗口正在播放，请先停止那里的音乐。');return;}}catch{fail('无法取得播放器，请重试。');return;}}
  if(token!==generation)return;
  timeout=setTimeout(()=>{if(token===generation)fail('连接超时，请换台或重试。');},18000);
  const start=async()=>{try{await audio.play();if(token!==generation)return;}catch(error){if(token===generation&&error.name!=='AbortError')fail(error.name==='NotAllowedError'?'点击播放即可开始收听。':'无法播放该电台，请尝试另一台。');}};
  if(station.hls||/\.m3u8(?:\?|$)/i.test(station.url)){
    if(Hls.isSupported()){
      hls=new Hls({enableWorker:false,backBufferLength:15,maxBufferLength:20,maxMaxBufferLength:30});hls.attachMedia(audio);hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(token===generation)hls?.loadSource(station.url);});hls.on(Hls.Events.MANIFEST_PARSED,start);hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal&&token===generation)fail('电台流暂不可用，请换台或稍后重试。');});
    }else if(audio.canPlayType('application/vnd.apple.mpegurl')){audio.src=station.url;start();}
    else fail('此设备不支持该电台格式，请选择其他电台。');
  }else{audio.src=station.url;start();}
}
audio.addEventListener('playing',()=>{clearTimeout(timeout);busy=false;playing=true;setStatus(prefs.muted?'正在播放 · 已静音':'正在播放 · LIVE');controls();if(!clickReported){clickReported=true;if(native)host('radioClick',{station:prefs.station.id}).catch(()=>{});else api('/json/url/'+encodeURIComponent(prefs.station.id)).catch(()=>{});}});
audio.addEventListener('waiting',()=>{if(playing||busy){setStatus('缓冲中…');clearTimeout(timeout);const token=generation;timeout=setTimeout(()=>{if(token===generation)fail('电台连接中断，请重试或换台。');},18000);}});
audio.addEventListener('error',()=>{if(audio.hasAttribute('src'))fail('连接中断或格式不支持，请换台重试。');});
audio.addEventListener('ended',()=>stop('直播已结束，请选择其他电台。'));
function mute(){prefs.muted=!prefs.muted;save();controls();if(playing)setStatus(prefs.muted?'正在播放 · 已静音':'正在播放 · LIVE');}
function volume(event){prefs.volume=Number(event.target.value);save();controls();}
function renderList(){
  const list=$('stationList');list.replaceChildren();const shown=onlyFavorites?prefs.favorites:stations;
  if(!shown.length){const p=document.createElement('p');p.className='radio-empty';p.textContent=onlyFavorites?'还没有收藏，点击电台旁的 ☆ 添加。':'暂无可用结果，请尝试其他关键词或刷新。';list.append(p);return;}
  for(const station of shown){
    const row=document.createElement('div');row.className='station-row';
    const button=document.createElement('button');button.className='station-select';button.type='button';
    const name=document.createElement('strong');name.textContent=station.name;
    const meta=document.createElement('small');meta.textContent=[station.language||'音乐电台',station.hls?'HLS':'LIVE'].join(' · ');button.append(name,meta);button.addEventListener('click',()=>play(station));
    const favorite=document.createElement('button');favorite.type='button';favorite.className='favorite-button';const selected=prefs.favorites.some(s=>s.id===station.id);favorite.textContent=selected?'★':'☆';favorite.setAttribute('aria-label',(selected?'取消收藏 ':'收藏 ')+station.name);favorite.setAttribute('aria-pressed',String(selected));favorite.addEventListener('click',()=>{prefs.favorites=prefs.favorites.filter(s=>s.id!==station.id);if(!selected)prefs.favorites.push(station);save();renderList();});row.append(button,favorite);list.append(row);
  }
}
async function search(query=''){
  const token=++searchNumber;onlyFavorites=false;$('favoritesButton').setAttribute('aria-pressed','false');$('radioSearchButton').disabled=true;$('directoryStatus').textContent='正在查找电台…';
  try{
    if(native){const response=await host('radioSearch',{query});if(token!==searchNumber)return;stations=response;}
    else{const data=await api('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=80&name='+encodeURIComponent(query.trim()||'音乐'));if(token!==searchNumber)return;stations=data.map(s=>({id:s.stationuuid,name:s.name,url:s.url_resolved,language:s.language,tags:s.tags,hls:Boolean(s.hls)})).filter(validStation);stations=[...new Map(stations.map(s=>[s.url,s])).values()];}
    if(token!==searchNumber)return;stations=stations.filter(validStation);renderList();$('directoryStatus').textContent=stations.length+' 个电台 · 优先中文音乐 · 仅显示 HTTPS 音源';
    try{localStorage.setItem('nexus.radio.cache',JSON.stringify({at:Date.now(),stations}));}catch{}
  }catch(error){if(token!==searchNumber)return;try{const cache=JSON.parse(localStorage.getItem('nexus.radio.cache')||'null');if(cache){stations=cache.stations.filter(validStation);renderList();$('directoryStatus').textContent='目录离线 · 显示 '+new Date(cache.at).toLocaleDateString()+' 缓存，播放仍需联网';}else throw error;}catch{$('directoryStatus').textContent='电台目录连接失败，请稍后重试。';renderList();}}
  finally{if(token===searchNumber)$('radioSearchButton').disabled=false;}
}
function open(){ $('radioDialog').showModal(); if(!stations.length)search();if(native)host('preferences').then(p=>{prefs.auto=p.musicAuto;save();controls();}).catch(()=>{}); }
$('radioButton').addEventListener('click',open);$('miniStation').addEventListener('click',open);$('closeRadio').addEventListener('click',()=>$('radioDialog').close());
$('radioSearchForm').addEventListener('submit',event=>{event.preventDefault();search($('radioQuery').value);});
$('favoritesButton').addEventListener('click',()=>{onlyFavorites=!onlyFavorites;$('favoritesButton').setAttribute('aria-pressed',String(onlyFavorites));renderList();});
$('radioPlay').addEventListener('click',()=>playing||busy?stop():play());$('miniPlay').addEventListener('click',()=>playing||busy?stop():play());
$('radioMute').addEventListener('click',mute);$('miniMute').addEventListener('click',mute);$('radioVolume').addEventListener('input',volume);$('miniVolume').addEventListener('input',volume);
$('musicAuto').addEventListener('change',async event=>{const previous=prefs.auto;prefs.auto=event.target.checked;save();if(native){try{await host('musicAuto',{value:prefs.auto});}catch{prefs.auto=previous;save();controls();setStatus('自动播放设置未保存，请重试。');}}});
$('radioDialog').addEventListener('close',()=>{$('radioButton').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('radioDialog').open){event.preventDefault();event.stopImmediatePropagation();$('radioDialog').close();}else if(event.key.toLowerCase()==='m'&&!event.target.matches('input,select,textarea')){mute();}},true);
if(native){$('settingsButton').addEventListener('click',()=>window.chrome.webview.postMessage('settings'));host('preferences').then(p=>{prefs.auto=p.musicAuto;save();controls();if(canPlay&&params.has('screensaver')&&prefs.auto&&prefs.station)play();}).catch(()=>{});}else{$('settingsButton').addEventListener('click',()=>{setStatus('系统设置请在 Windows 体验版或托盘中打开。');open();});}
if(!canPlay){$('radioButton').hidden=true;$('audioDock').hidden=true;}
window.addEventListener('pagehide',()=>{unload();release();});
window.nexusRadio={stop,getState:()=>({station:prefs.station,volume:prefs.volume,muted:prefs.muted,auto:prefs.auto,playing,busy,favorites:prefs.favorites.length,stations:stations.length,currentTime:audio.currentTime,readyState:audio.readyState}),open};
controls();setStatus('音乐默认关闭 · 选择电台后点击播放');
