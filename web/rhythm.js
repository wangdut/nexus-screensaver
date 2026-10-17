import {RhythmSignal,analyserFrame} from './rhythm-signal.mjs';

const $=id=>document.getElementById(id),native=Boolean(window.chrome?.webview);
const params=new URLSearchParams(location.search),preview=params.has('preview');
const secondary=params.get('audio')==='0';
const signal=new RhythmSignal();
let prefs={source:'radio',intensity:80};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('nexus.rhythm.v1')||'{}')};}catch{}
function sanitize(){if(!['off','radio','system'].includes(prefs.source))prefs.source='radio';prefs.intensity=Math.max(0,Math.min(150,Number(prefs.intensity)||0));}
sanitize();
let context,analyser,stream,node,media,lastRead=-1000,lastRelay=-1000,lastUi=0,lastSequence=-1,lastAttach=-1000;
let capturing=false,suspended=false,closed=false,status='waiting',systemStatus='connecting',systemAt=-1000;
const silence=()=>({bands:Array(32).fill(0),rms:0});
function host(action,extra={}){if(native)window.chrome.webview.postMessage(JSON.stringify({id:'rhythm',action,...extra}));}
function disconnect(){try{node?.disconnect();stream?.getTracks().forEach(t=>t.stop());}catch{}node=stream=analyser=media=null;}
function activate(){
  if(preview||secondary||prefs.source!=='radio'||suspended)return;
  try{if(!context)context=new AudioContext();if(context.state==='suspended')context.resume().catch(()=>{});}catch{status='unsupported';}
}
function syncCapture(){
  const want=native&&!preview&&!suspended&&!document.hidden&&!closed&&prefs.source==='system';
  if(capturing!==want){capturing=want;lastSequence=-1;systemStatus='connecting';systemAt=-1000;host('rhythmSystem',{enabled:want});}
  if(prefs.source!=='radio'||suspended||document.hidden||closed){disconnect();context?.suspend().catch(()=>{});}
}
function preferencesChanged(){sanitize();signal.reset();disconnect();lastAttach=-1000;try{localStorage.setItem('nexus.rhythm.v1',JSON.stringify(prefs));}catch{}syncCapture();renderControls();}
function renderControls(){
  $('rhythmSource').value=prefs.source;$('rhythmIntensity').value=prefs.intensity;$('rhythmValue').textContent=prefs.intensity+'%';
  $('rhythmIntensity').style.setProperty('--fill',prefs.intensity/1.5+'%');
  $('rhythmButton').setAttribute('aria-pressed',String(prefs.source!=='off'));
  $('rhythmSource').querySelector('[value=system]').disabled=!native;
}
function attachRadio(current,now){
  if(media===current&&stream?.getAudioTracks().some(t=>t.readyState==='live'))return;
  if(now-lastAttach<800)return;lastAttach=now;disconnect();
  try{
    activate();if(!context||!current.captureStream){status='unsupported';return;}
    const captured=current.captureStream();
    if(!captured.getAudioTracks().length){captured.getTracks().forEach(t=>t.stop());status='waiting';return;}
    stream=captured;media=current;analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=0;
    node=context.createMediaStreamSource(stream);node.connect(analyser);
    // A read-only branch; the radio element keeps its own speaker output.
  }catch{disconnect();status='unsupported';}
}
const bins=new Float32Array(1024),wave=new Float32Array(2048);
function readRadio(now){
  if(secondary)return;
  const current=window.nexusRadio?.getMedia();
  let frame=silence();
  if(!current||current.paused||current.readyState<2){status='waiting';disconnect();context?.suspend().catch(()=>{});}
  else if(current.muted||current.volume===0){status='silent';}
  else{
    attachRadio(current,now);
    if(analyser&&context.state==='running'){frame=analyserFrame(analyser,bins,wave,current.volume);status=frame.rms>.00015?'live':'silent';}
    else if(context?.state==='suspended')status='gesture';
  }
  signal.accept(frame,now);
  if(native&&params.has('screensaver')&&now-lastRelay>=40){host('rhythmRelay',{bands:frame.bands,rms:frame.rms,status});lastRelay=now;}
}
if(native)window.chrome.webview.addEventListener('message',event=>{
  const frame=event.data;
  if(frame?.type!=='rhythm'||preview||suspended||document.hidden)return;
  if(frame.source==='system'&&prefs.source==='system'&&capturing&&frame.sequence!==lastSequence){
    lastSequence=frame.sequence;systemStatus=frame.status;systemAt=performance.now();signal.accept(frame,systemAt);
  }else if(frame.source==='radio'&&prefs.source==='radio'&&secondary){status=frame.status;systemAt=performance.now();signal.accept(frame,systemAt);}
});
function paint(now){
  if(now-lastUi<100)return;lastUi=now;
  const labels={off:'律动已关闭',preview:'系统预览不采集声音',paused:'画面已暂停',waiting:secondary?'等待主屏电台信号':'播放电台，点亮共振',live:'正在跟随真实声音',silent:'暂无可听见的声音',connecting:'正在连接默认播放设备…',unavailable:'播放设备不可用 · 将自动重连',unsupported:'当前环境不支持此音源分析',gesture:'点击「启用分析」继续',browser:'电脑声音分析请使用 Windows 版'};
  $('rhythmStatus').textContent=labels[status]||labels.waiting;
  $('rhythmBadge').textContent=prefs.source==='system'?'电脑声音':prefs.source==='radio'?'电台共振':'律动关闭';
  $('rhythmEnable').hidden=status!=='gesture';
  $('rhythmMeter').querySelectorAll('i').forEach((bar,i)=>bar.style.setProperty('--level',Math.max(.025,signal.bands[i]/1.5)));
  $('rhythmReadout').textContent=`低频 ${Math.round(signal.low*67)} / 中频 ${Math.round(signal.mid*67)} / 高频 ${Math.round(signal.high*67)}`;
}
export function updateRhythm(dt,now,paused){
  if(paused!==suspended){suspended=paused;syncCapture();if(!paused)activate();}
  if(preview)status='preview';
  else if(prefs.source==='off')status='off';
  else if(paused||document.hidden)status='paused';
  else if(prefs.source==='system')status=!native?'browser':now-systemAt>2500?'connecting':systemStatus==='listening'?'live':systemStatus;
  else if(now-lastRead>=40){readRadio(now);lastRead=now;if(secondary&&now-systemAt>500)status='waiting';}
  signal.update(dt,now,!preview&&!paused&&!document.hidden&&prefs.source!=='off',prefs.intensity/100);
  paint(now);return signal;
}
$('rhythmButton').addEventListener('click',()=>{$('rhythmDialog').showModal();activate();});
$('closeRhythm').addEventListener('click',()=>$('rhythmDialog').close());
$('rhythmDialog').addEventListener('close',()=>$('rhythmButton').focus());
$('rhythmSource').addEventListener('change',event=>{prefs.source=event.target.value;preferencesChanged();activate();});
$('rhythmIntensity').addEventListener('input',event=>{prefs.intensity=Number(event.target.value);sanitize();renderControls();try{localStorage.setItem('nexus.rhythm.v1',JSON.stringify(prefs));}catch{}});
$('rhythmEnable').addEventListener('click',activate);
document.addEventListener('pointerdown',()=>{if(prefs.source==='radio')activate();},{passive:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('rhythmDialog').open){event.preventDefault();event.stopImmediatePropagation();$('rhythmDialog').close();}},true);
document.addEventListener('visibilitychange',()=>{syncCapture();if(!document.hidden)activate();});
document.addEventListener('nexus-render-stopped',()=>{suspended=true;syncCapture();});
window.addEventListener('storage',event=>{if(event.key==='nexus.rhythm.v1'){try{prefs=JSON.parse(event.newValue)||{source:'radio',intensity:80};sanitize();signal.reset();disconnect();syncCapture();renderControls();}catch{}}});
window.addEventListener('pagehide',()=>{closed=true;syncCapture();disconnect();context?.close().catch(()=>{});});
window.nexusRhythm={getState:()=>({source:prefs.source,intensity:prefs.intensity,status,capturing,context:context?.state||'none',energy:signal.energy,low:signal.low,mid:signal.mid,high:signal.high,onset:signal.onset,beats:signal.beats,bands:Array.from(signal.bands),rms:signal.rms})};
renderControls();syncCapture();
