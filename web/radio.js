import Hls from 'hls.js';

const $=id=>document.getElementById(id);
const native=Boolean(window.chrome?.webview);
const params=new URLSearchParams(location.search);
const canPlay=!params.has('preview')&&params.get('audio')!=='0';
let audio=new Audio();audio.preload='none';
let prefs={volume:35,muted:false,station:null,favorites:[],auto:false};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('nexus.radio.v1')||'{}')};}catch{}
prefs.volume=Math.max(0,Math.min(100,Number(prefs.volume)||0));
prefs.favorites=Array.isArray(prefs.favorites)?prefs.favorites.filter(validStation).slice(0,100):[];
if(!validStation(prefs.station))prefs.station=null;
let stations=[],hls=null,generation=0,timeout=null,retryTimer=null,playing=false,busy=false,onlyFavorites=false,requestNumber=0,searchNumber=0,clickReported=false,retries=0,lastError=null;
const pending=new Map();
function validStation(s){try{return s&&typeof s.name==='string'&&typeof s.id==='string'&&new URL(s.url).protocol==='https:';}catch{return false;}}
function isHls(s){if(/\.m3u8(?:[?#]|$)/i.test(s.url))return true;if(/\.(?:mp3|aac|ogg|opus|wav)(?:[?#]|$)/i.test(s.url))return false;return s.hls===true||s.hls===1||s.hls==='1'||s.hls==='true';}
function normalizeStation(s){return {...s,hls:isHls(s)};}
function fromDirectory(s){return normalizeStation({id:s.stationuuid,name:s.name,url:s.url_resolved||s.url,language:s.language,tags:s.tags,hls:s.hls});}
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
function unload(){clearTimeout(timeout);clearTimeout(retryTimer);timeout=retryTimer=null;audio.onplaying=audio.onwaiting=audio.onerror=audio.onended=null;audio.pause();if(hls){hls.destroy();hls=null;}audio.removeAttribute('src');audio.load();playing=false;busy=false;}
function stop(message='已停止播放'){generation++;unload();release();setStatus(message);controls();}
function fail(message){generation++;unload();release();setStatus(message);controls();}
async function refreshStation(station){
  const fresh=native?await host('radioResolve',{station:station.id}):fromDirectory((await api('/json/stations/byuuid/'+encodeURIComponent(station.id)))[0]||{});
  return validStation(fresh)&&fresh.id===station.id?normalizeStation(fresh):station;
}
function rememberStation(station){prefs.station=normalizeStation(station);prefs.favorites=prefs.favorites.map(s=>s.id===station.id?prefs.station:s);save();}
async function play(station=prefs.station){
  if(!canPlay){setStatus('当前为预览或副屏，请在主屏播放。');return;}
  if(!validStation(station))return;
  const token=++generation;unload();clickReported=false;retries=0;lastError=null;rememberStation(station);busy=true;setStatus('连接中…');controls();
  if(native){try{const granted=await host('audioAcquire');if(token!==generation)return;if(!granted){fail('另一个 NEXUS 窗口正在播放，请先停止那里的音乐。');return;}}catch{if(token===generation)fail('无法取得播放器，请重试。');return;}}
  if(token!==generation)return;
  connect(prefs.station,token);
}
function connect(station,token){
  if(token!==generation)return;
  unload();const media=audio=new Audio();media.preload='none';busy=true;controls();let recovering=false;
  const active=()=>token===generation&&audio===media&&!recovering;
  const recover=async(reason,details)=>{
    if(!active())return;recovering=true;lastError={reason,details};unload();
    if(retries>=2){fail('该电台暂时无法连接，已重试 2 次；可点击播放重试或选择其他电台。');return;}
    retries++;busy=true;setStatus('正在恢复连接（'+retries+'/2）…');controls();
    let next=station;
    // Refresh a saved URL once; directory outages must not prevent retrying the original stream.
    if(retries===1){try{next=await refreshStation(station);}catch{}}
    if(token!==generation)return;
    rememberStation(next);controls();retryTimer=setTimeout(()=>connect(next,token),700);
  };
  const armTimeout=()=>{clearTimeout(timeout);timeout=setTimeout(()=>recover('timeout','No playable audio within 18 seconds'),18000);};
  media.onplaying=()=>{if(!active())return;clearTimeout(timeout);busy=false;playing=true;lastError=null;setStatus(prefs.muted?'正在播放 · 已静音':'正在播放 · LIVE');controls();if(!clickReported){clickReported=true;if(native)host('radioClick',{station:station.id}).catch(()=>{});else api('/json/url/'+encodeURIComponent(station.id)).catch(()=>{});}};
  media.onwaiting=()=>{if(active()){setStatus('缓冲中…');armTimeout();}};
  media.onerror=()=>{if(active())recover('media',{code:media.error?.code,message:media.error?.message||''});};
  media.onended=()=>{if(active())recover('ended','Live stream ended');};
  armTimeout();
  const start=async()=>{if(!active())return;try{await media.play();}catch(error){if(!active()||error.name==='AbortError')return;if(error.name==='NotAllowedError')fail('点击播放即可开始收听。');else recover('play',error.name);}};
  if(isHls(station)){
    if(Hls.isSupported()){
      const engine=hls=new Hls({enableWorker:false,backBufferLength:15,maxBufferLength:20,maxMaxBufferLength:30});engine.on(Hls.Events.MEDIA_ATTACHED,()=>{if(active())engine.loadSource(station.url);});engine.on(Hls.Events.MANIFEST_PARSED,start);engine.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal&&active())recover('hls',data.details);});engine.attachMedia(media);
    }else if(media.canPlayType('application/vnd.apple.mpegurl')){media.src=station.url;start();}
    else fail('此设备不支持该电台格式，请选择其他电台。');
  }else{media.src=station.url;start();}
}
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
    else{const data=await api('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=80&name='+encodeURIComponent(query.trim()||'音乐'));if(token!==searchNumber)return;stations=data.map(fromDirectory).filter(validStation);stations=[...new Map(stations.map(s=>[s.url,s])).values()];}
    if(token!==searchNumber)return;stations=stations.filter(validStation).map(normalizeStation);renderList();$('directoryStatus').textContent=stations.length+' 个电台 · 优先中文音乐 · 仅显示 HTTPS 音源';
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
window.addEventListener('pagehide',()=>{generation++;unload();release();});
window.nexusRadio={stop,getState:()=>({station:prefs.station,volume:prefs.volume,muted:prefs.muted,auto:prefs.auto,playing,busy,favorites:prefs.favorites.length,stations:stations.length,currentTime:audio.currentTime,readyState:audio.readyState,retries,lastError}),open};
controls();setStatus('音乐默认关闭 · 选择电台后点击播放');
