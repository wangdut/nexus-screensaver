const WebSocket=require('ws');
const {spawn}=require('node:child_process');
const path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
  require('node:fs').mkdirSync(path.resolve('screenshots'),{recursive:true});
  const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const child=spawn(edge,['--headless=new','--remote-debugging-port=9222','--remote-allow-origins=*',`--user-data-dir=${path.resolve('.test-profile')}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-features=msEdgeSidebarV2','about:blank'],{stdio:'ignore',windowsHide:true});
  let tabs;
  for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9222/json')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await wait(200);}
  if(!tabs)throw new Error('Edge CDP did not start');
  const tab=tabs.find(t=>t.type==='page');const ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  let counter=0;const pending=new Map(),events=[];
  ws.on('message',message=>{const data=JSON.parse(message);if(data.id){const entry=pending.get(data.id);if(entry){pending.delete(data.id);data.error?entry.reject(new Error(JSON.stringify(data.error))):entry.resolve(data.result);}}else events.push(data);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(value.exceptionDetails)throw new Error(JSON.stringify(value.exceptionDetails));return value.result.value;};
  await Promise.all([send('Runtime.enable'),send('Page.enable'),send('Log.enable'),send('Network.enable')]);
  return{send,evaluate,events,child,close:async()=>{try{await send('Browser.close');}catch{}ws.close();child.kill();}};
}
module.exports={connect,wait};
