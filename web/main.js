import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import './radio.js';

const $=id=>document.getElementById(id);
const app=$('app');
const params=new URLSearchParams(location.search);
const native=Boolean(window.chrome?.webview);
const preview=params.has('preview');
const screensaver=params.has('screensaver');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(preview)app.classList.add('preview');
const palettes={ice:{primary:'#78e5e0',secondary:'#548ccc',rgb:'120,229,224'},violet:{primary:'#bca0ff',secondary:'#657de6',rgb:'188,160,255'},ember:{primary:'#f6c77f',secondary:'#dd7956',rgb:'246,199,127'}};
const scenes=[
  {name:'QUANTUM CORE',heading:'让引力，<br><span>回应你。</span>',description:'每一次靠近，都让宇宙泛起涟漪。<br>在指尖，创造属于你的秩序。',caption:'Q–01 / 涌动的秩序'},
  {name:'GRAVITY ORBIT',heading:'万千轨迹，<br><span>因你交汇。</span>',description:'让星尘沿着看不见的引力流动。<br>轻轻触碰，改写它们的轨道。',caption:'G–02 / 星尘的共振'},
  {name:'SPACETIME GATE',heading:'穿过此刻，<br><span>抵达无限。</span>',description:'时间在旋转中舒展，空间向内折叠。<br>蓄积能量，打开下一段旅程。',caption:'S–03 / 无限的入口'}
];
let saved={};
try{saved=JSON.parse(localStorage.getItem('nexus.preferences.v1')||'{}');}catch{}
const state={scene:0,palette:palettes[saved.palette]?saved.palette:'ice',gravity:THREE.MathUtils.clamp(Number(saved.gravity)||65,10,100),speed:THREE.MathUtils.clamp(Number(saved.speed)||10,2,20),autoplay:saved.autoplay!==false,quality:['auto','high','eco'].includes(saved.quality)?saved.quality:'auto',paused:reducedMotion,zen:(screensaver&&params.get('pure')!=='0')||params.has('zen'),charge:0,pulses:0,frames:0,fps:0,particleCount:0,ready:false,contextLost:false};
let toastTimer,pointerTimer;
function persist(){try{localStorage.setItem('nexus.preferences.v1',JSON.stringify({palette:state.palette,gravity:state.gravity,speed:state.speed,autoplay:state.autoplay,quality:state.quality}));}catch{}}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function sendHost(action){if(native)window.chrome.webview.postMessage(action);}

let renderer,scene,camera,composer,bloom,particles,universe,starfield,orbitGroup;
let uniforms,resize,resetQuality;
let clockTime=0,lastFrame=0,lastRender=0,lastSample=0,frameSamples=0,qualitySamples=0,lowSamples=0;
let rotationX=0,rotationY=0,dragX=0,dragY=0,morphStart=-10,fromWeights=[1,0,0],toWeights=[1,0,0],sceneAge=0;
let visible=true,raf=0;
const pointer={x:0,y:0,down:false,active:false,startX:0,startY:0,world:new THREE.Vector3(99,99,0),target:new THREE.Vector3(99,99,0)};
const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0),ndc=new THREE.Vector2();
const pulsePositions=Array.from({length:4},()=>new THREE.Vector3(0,0,0));
const pulseTimes=new Float32Array([-100,-100,-100,-100]);
let pulseIndex=0,layoutScale=1;
const rand=(()=>{let seed=21873;return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};})();

function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});
  }catch(error){$('fallback').hidden=false;console.error(error);return;}
  renderer.setClearColor(0x000000,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  $('universe').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();state.contextLost=true;cancelAnimationFrame(raf);toast('渲染暂停，正在等待显卡恢复');});
  renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
  scene=new THREE.Scene();scene.background=new THREE.Color(0x060b11);
  camera=new THREE.PerspectiveCamera(42,1,.1,100);
  camera.position.set(0,0,11);
  universe=new THREE.Group();scene.add(universe);
  const count=30000;
  const core=new Float32Array(count*3),orbit=new Float32Array(count*3),gate=new Float32Array(count*3),seeds=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const j=i*3,a=rand(),b=rand(),c=rand(),d=rand(),phi=a*Math.PI*2;
    // A laced spherical shell, rather than a uniformly filled ball.
    const latitude=Math.acos(2*b-1),strand=Math.floor(a*66)/66*Math.PI*2;
    const longitude=c<.67?strand+.08*Math.sin(latitude*9+strand*3)+(d-.5)*.013:phi;
    const shell=1.95+(c>.9?(d-.5)*.65:(d-.5)*.11)+.055*Math.sin(longitude*6+latitude*11);
    core[j]=shell*Math.sin(latitude)*Math.cos(longitude);
    core[j+1]=shell*Math.cos(latitude);
    core[j+2]=shell*Math.sin(latitude)*Math.sin(longitude);
    // A spiral accretion disc with a small central cloud.
    const arm=i%4,orbitalAngle=arm*Math.PI*.5+(a-.5)*.42;
    const radius=.5+Math.pow(b,.6)*2.8;
    const spiral=c<.78?orbitalAngle+radius*1.5:phi;
    orbit[j]=Math.cos(spiral)*radius;
    orbit[j+1]=(c-.5)*(.025+.18/(radius+.25))+.045*Math.sin(radius*7+phi);
    orbit[j+2]=Math.sin(spiral)*radius;
    if(i%8===0){const r=.45*Math.cbrt(c);orbit[j]=r*Math.sin(latitude)*Math.cos(phi);orbit[j+1]=r*Math.cos(latitude);orbit[j+2]=r*Math.sin(latitude)*Math.sin(phi);}
    // Twisting, open-centred magnetic flux loops.
    const tube=phi,ring=b*Math.PI*2,minor=.24+.20*c;
    const major=1.78+minor*Math.cos(tube*3+ring*9);
    gate[j]=major*Math.cos(ring);
    gate[j+1]=major*Math.sin(ring);
    gate[j+2]=minor*Math.sin(tube*3+ring*9)+(d-.5)*.12;
    seeds[j]=a;seeds[j+1]=c;seeds[j+2]=d;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(core,3));
  geometry.setAttribute('aCore',new THREE.BufferAttribute(core,3));
  geometry.setAttribute('aOrbit',new THREE.BufferAttribute(orbit,3));
  geometry.setAttribute('aGate',new THREE.BufferAttribute(gate,3));
  geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,3));
  uniforms={uTime:{value:0},uWeights:{value:new THREE.Vector3(1,0,0)},uPixelRatio:{value:1},uGravity:{value:state.gravity/100},uPointer:{value:new THREE.Vector3(99,99,0)},uCharge:{value:0},uColorA:{value:new THREE.Color(palettes[state.palette].primary)},uColorB:{value:new THREE.Color(palettes[state.palette].secondary)},uPulsePositions:{value:pulsePositions},uPulseTimes:{value:pulseTimes}};
  const material=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute vec3 aCore; attribute vec3 aOrbit; attribute vec3 aGate; attribute vec3 aSeed;
      uniform float uTime; uniform vec3 uWeights; uniform float uPixelRatio;
      uniform vec3 uPointer; uniform float uCharge; uniform float uGravity;
      uniform vec3 uPulsePositions[4]; uniform float uPulseTimes[4];
      varying float vAlpha; varying float vTint; varying float vSpark;
      mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      void main(){
        float t=uTime;
        vec3 core=aCore;
        core.xz=turn(t*.055)*core.xz;
        float breath=sin(t*.65+core.y*2.)*.025+sin(t*.31+core.x*3.)*.018;
        core*=1.+breath;
        core.y+=.028*sin(t*.5+atan(core.z,core.x)*7.);
        vec3 orbit=aOrbit;
        float radius=length(orbit.xz);
        orbit.xz=turn(t*(.08+.19/(radius+.5)))*orbit.xz;
        orbit.yz=turn(.36)*orbit.yz;
        orbit.xy=turn(-.24)*orbit.xy;
        vec3 gate=aGate;
        gate.xy=turn(t*.12)*gate.xy;
        gate.z+=.13*sin(atan(gate.y,gate.x)*6.-t*.7);
        gate.xz=turn(.20*sin(t*.15)+.13)*gate.xz;
        vec3 p=core*uWeights.x+orbit*uWeights.y+gate*uWeights.z;
        vec4 world=modelMatrix*vec4(p,1.);
        vec3 delta=world.xyz-uPointer;
        float dist=length(delta);
        float field=exp(-dist*dist*.8)*uGravity;
        world.xyz+=normalize(delta+vec3(.0001)) * field * (.25-uCharge*.9);
        world.xyz.z+=field*.18*sin(t*3.+dist*6.);
        float energy=0.;
        for(int k=0;k<4;k++){
          float age=t-uPulseTimes[k];
          float distanceToPulse=length(world.xyz-uPulsePositions[k]);
          float wave=exp(-pow((distanceToPulse-age*2.5)*2.7,2.))*exp(-age*.65)*step(0.,age);
          world.xyz+=normalize(world.xyz-uPulsePositions[k]+vec3(.001))*wave*.24;
          energy+=wave;
        }
        vec4 mv=viewMatrix*world;
        gl_Position=projectionMatrix*mv;
        float sparkle=pow(max(0.,sin(t*(.5+aSeed.y)+aSeed.x*170.)),18.);
        gl_PointSize=clamp((1.65+aSeed.y*1.15+sparkle*2.1+energy*1.9)*uPixelRatio*(9./-mv.z),.9,8.*uPixelRatio);
        vAlpha=(.45+aSeed.z*.65+sparkle*.55+field*.4+energy*1.2)*smoothstep(-4.5,1.8,p.z);
        vTint=clamp(aSeed.x*.62+(.5+p.z*.18)*.38,0.,1.);
        vSpark=sparkle+energy;
      }`,
    fragmentShader:`
      uniform vec3 uColorA;uniform vec3 uColorB;
      varying float vAlpha;varying float vTint;varying float vSpark;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
        float glow=exp(-r*r*5.)*.7+exp(-r*r*25.)*.55;
        vec3 color=mix(uColorB,uColorA,vTint);
        color=mix(color,vec3(.85,1.,1.),clamp(vSpark*.35,0.,.6));
        gl_FragColor=vec4(color*1.65,glow*vAlpha);
      }`
  });
  particles=new THREE.Points(geometry,material);particles.frustumCulled=false;universe.add(particles);
  createStars();createOrbits();
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.5,.65,.26);composer.addPass(bloom);composer.addPass(new OutputPass());
  let tier=state.quality==='eco'?0:state.quality==='high'?2:1;
  resetQuality=()=>{tier=state.quality==='eco'?0:state.quality==='high'?2:1;lowSamples=0;qualitySamples=0;applyQuality();};
  function applyQuality(){
    const dpr=Math.min(devicePixelRatio||1,tier===0?1:tier===1?1.5:2);
    renderer.setPixelRatio(dpr);composer.setPixelRatio(dpr);
    uniforms.uPixelRatio.value=dpr;
    geometry.setDrawRange(0,tier===0?16000:tier===1?24000:30000);
    state.particleCount=geometry.drawRange.count;
    bloom.enabled=tier>0;
    resize();
  }
  resize=()=>{
    const w=app.clientWidth,h=app.clientHeight,aspect=w/h;
    camera.aspect=aspect;camera.updateProjectionMatrix();
    renderer.setSize(w,h);composer.setSize(w,h);
    const halfH=Math.tan(THREE.MathUtils.degToRad(21))*11,halfW=halfH*aspect;
    if(preview){layoutScale=Math.min(1,aspect*.9);universe.position.set(0,0,0);}
    else if(w<=760){layoutScale=Math.min(.87,aspect*1.6);universe.position.set(-halfW*.07,h<700?.15:.05,0);}
    else {layoutScale=Math.min(1.12,aspect*.64);universe.position.set(halfW*.095,.12,0);}
    universe.scale.setScalar(layoutScale);
  };
  applyQuality();
  window.addEventListener('resize',resize);
  const observer=new ResizeObserver(resize);observer.observe(app);
  $('universe').addEventListener('pointerdown',pointerDown);
  $('universe').addEventListener('pointermove',pointerMove);
  $('universe').addEventListener('pointerup',pointerUp);
  $('universe').addEventListener('pointercancel',pointerCancel);
  $('universe').addEventListener('pointerleave',()=>{if(!pointer.down){pointer.active=false;pointer.target.set(99,99,0);}});
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(!visible){cancelAnimationFrame(raf);pointerCancel();}else{lastFrame=performance.now();raf=requestAnimationFrame(frame);}});
  // The loop is frame-rate independent, caps long gaps, and yields when hidden.
  function frame(now){
    if(!visible||state.contextLost)return;
    raf=requestAnimationFrame(frame);
    if(now-lastRender<(preview||state.quality==='eco'?1000/30:1000/60)-.5)return;
    lastRender=now;
    const dt=Math.min((now-(lastFrame||now))/1000,.05);lastFrame=now;
    if(!state.paused){clockTime+=dt*state.speed/10;sceneAge+=dt;}
    if(state.autoplay&&!state.paused&&!pointer.down&&sceneAge>75){setScene((state.scene+1)%3,true);sceneAge=0;}
    if(pointer.down){state.charge=Math.min(1,state.charge+dt*.48);$('chargeArc').style.strokeDashoffset=String(163.4*(1-state.charge));}
    else state.charge=Math.max(0,state.charge-dt*2.5);
    uniforms.uCharge.value=state.charge;
    pointer.world.lerp(pointer.target,1-Math.exp(-dt*12));uniforms.uPointer.value.copy(pointer.world);
    uniforms.uTime.value=clockTime;
    const morph=THREE.MathUtils.smootherstep((now-morphStart)/1800,0,1);
    uniforms.uWeights.value.set(...fromWeights.map((w,i)=>THREE.MathUtils.lerp(w,toWeights[i],morph)));
    const orbitTarget=state.autoplay&&!state.paused?Math.sin(clockTime*.12)*.12:0;
    rotationX=THREE.MathUtils.lerp(rotationX,dragX+orbitTarget,Math.min(1,dt*2));
    rotationY=THREE.MathUtils.lerp(rotationY,dragY,Math.min(1,dt*2));
    universe.rotation.set(rotationX,rotationY,0);
    starfield.rotation.z=clockTime*.001;
    orbitGroup.rotation.y=clockTime*.025;
    orbitGroup.visible=uniforms.uWeights.value.x>.05;
    orbitGroup.children.forEach((line,i)=>{line.material.opacity=(i===0?.18:.085)*uniforms.uWeights.value.x;});
    composer.render();state.frames++;frameSamples++;
    if(now-lastSample>1100){
      state.fps=Math.round(frameSamples*1000/(now-lastSample));$('fps').textContent=String(state.fps);
      frameSamples=0;lastSample=now;qualitySamples++;
      if(state.quality==='auto'&&qualitySamples>4){
        if(state.fps<34)lowSamples++;else lowSamples=0;
        if(lowSamples>=3&&tier>0){tier--;applyQuality();lowSamples=0;qualitySamples=0;}
      }
    }
  }
  state.ready=true;sendHost('ready');raf=requestAnimationFrame(frame);
}

function createStars(){
  const count=950,positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[i*3]=(rand()-.5)*32;positions[i*3+1]=(rand()-.5)*20;positions[i*3+2]=-4-rand()*16;
    const brightness=.15+rand()*.35;colors[i*3]=brightness*.52;colors[i*3+1]=brightness*.78;colors[i*3+2]=brightness;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const material=new THREE.PointsMaterial({size:.018,vertexColors:true,transparent:true,opacity:.6,depthWrite:false,sizeAttenuation:true});
  starfield=new THREE.Points(geometry,material);scene.add(starfield);
  const gridGeometry=new THREE.BufferGeometry(),grid=[];
  for(let x=-12;x<=12;x+=1.6){grid.push(x,-4,-12,x,-4,4);}
  for(let z=-12;z<=4;z+=1.6){grid.push(-12,-4,z,12,-4,z);}
  gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));
  scene.add(new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:0x2d6077,transparent:true,opacity:.055,depthWrite:false})));
}
function createOrbits(){
  orbitGroup=new THREE.Group();universe.add(orbitGroup);
  for(let k=0;k<3;k++){
    const vertices=[];const radius=2.55+k*.18;
    for(let i=0;i<=350;i++){const t=i/350*Math.PI*2;vertices.push(Math.cos(t)*radius,Math.sin(t)*radius,0);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:palettes[state.palette].primary,transparent:true,opacity:k===0?.18:.085,depthWrite:false,blending:THREE.AdditiveBlending}));
    line.rotation.set(.95+k*.47,.3+k*.4,-.35+k*.6);orbitGroup.add(line);
  }
}

function updatePointer(event){
  const rect=renderer.domElement.getBoundingClientRect();pointer.x=event.clientX;pointer.y=event.clientY;
  ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(ndc,camera);ray.ray.intersectPlane(plane,pointer.target);
  $('chargeIndicator').style.left=`${event.clientX}px`;$('chargeIndicator').style.top=`${event.clientY}px`;
}
function pointerDown(event){
  if(event.button!==0&&!event.pointerType?.includes('touch'))return;
  renderer.domElement.setPointerCapture(event.pointerId);pointer.down=true;pointer.active=true;pointer.startX=event.clientX;pointer.startY=event.clientY;state.charge=0;
  updatePointer(event);pointer.world.copy(pointer.target);$('chargeIndicator').classList.add('visible');
}
function pointerMove(event){
  if(pointer.down){dragY+=(event.clientX-pointer.x)*.003;dragX=THREE.MathUtils.clamp(dragX+(event.clientY-pointer.y)*.002,-.7,.7);}
  pointer.active=true;updatePointer(event);
  app.classList.add('pointer-active');clearTimeout(pointerTimer);pointerTimer=setTimeout(()=>app.classList.remove('pointer-active'),1800);
}
function pointerUp(event){
  if(!pointer.down)return;updatePointer(event);pointer.down=false;$('chargeIndicator').classList.remove('visible');
  if(!state.paused){pulsePositions[pulseIndex].copy(pointer.world);pulseTimes[pulseIndex]=clockTime;pulseIndex=(pulseIndex+1)%4;state.pulses++;}
  if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
}
function pointerCancel(){pointer.down=false;state.charge=0;$('chargeIndicator').classList.remove('visible');}

function setScene(index,automatic=false){
  if(index===state.scene)return;
  if(uniforms)fromWeights=uniforms.uWeights.value.toArray();
  toWeights=[0,0,0];toWeights[index]=1;morphStart=performance.now();state.scene=index;sceneAge=0;
  const data=scenes[index];$('sceneNumber').textContent=`0${index+1}`;$('sceneEnglish').textContent=data.name;$('headline').innerHTML=data.heading;$('sceneDescription').innerHTML=data.description;$('fieldCaption').textContent=data.caption;
  document.querySelectorAll('[data-scene]').forEach(button=>{const active=Number(button.dataset.scene)===index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  if(automatic&&!state.zen)toast(`自动漫游 · ${['量子星核','引力星环','时空之门'][index]}`);
}
function setPalette(name){
  state.palette=name;const palette=palettes[name];
  document.documentElement.style.setProperty('--accent',palette.primary);document.documentElement.style.setProperty('--accent-rgb',palette.rgb);
  if(uniforms){uniforms.uColorA.value.set(palette.primary);uniforms.uColorB.value.set(palette.secondary);orbitGroup.children.forEach(line=>line.material.color.set(palette.primary));}
  document.querySelectorAll('[data-palette]').forEach(button=>{const selected=button.dataset.palette===name;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});persist();
}
function setZen(value){state.zen=value;app.classList.toggle('zen',value);$('zenExit').hidden=!value;$('zenButton').setAttribute('aria-label',value?'显示界面':'进入纯净模式');if(!value&&!preview)toast('移动以扰动 · 长按以蓄能 · Esc 退出');}
function setPause(){state.paused=!state.paused;$('pauseIcon').textContent=state.paused?'▷':'Ⅱ';$('pauseButton').setAttribute('aria-label',state.paused?'继续演化':'暂停演化');$('pauseButton').setAttribute('aria-pressed',String(state.paused));toast(state.paused?'时间静止，宇宙等你':'演化继续');}
async function fullscreen(){
  if(native){sendHost('fullscreen');return;}
  try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen();}catch{toast('此预览环境暂不支持全屏，请用窗口版体验');}
}
function updateRanges(){
  $('gravity').value=state.gravity;$('speed').value=state.speed;
  $('gravityValue').innerHTML=`${state.gravity}<span>%</span>`;$('speedValue').innerHTML=`${(state.speed/10).toFixed(1)}<span>×</span>`;
  $('gravity').style.setProperty('--fill',`${(state.gravity-10)/90*100}%`);$('speed').style.setProperty('--fill',`${(state.speed-2)/18*100}%`);
  if(uniforms)uniforms.uGravity.value=state.gravity/100;
}
function updateQualityLabel(){$('qualityButton').innerHTML=`${{auto:'自动',high:'精细',eco:'节能'}[state.quality]} <span>↗</span>`;}
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>setScene(Number(button.dataset.scene))));
document.querySelectorAll('[data-palette]').forEach(button=>button.addEventListener('click',()=>setPalette(button.dataset.palette)));
$('gravity').addEventListener('input',event=>{state.gravity=Number(event.target.value);updateRanges();persist();});
$('speed').addEventListener('input',event=>{state.speed=Number(event.target.value);updateRanges();persist();});
$('autoplay').checked=state.autoplay;$('autoplay').addEventListener('change',event=>{state.autoplay=event.target.checked;sceneAge=0;persist();});
$('qualityButton').addEventListener('click',()=>{const values=['auto','high','eco'];state.quality=values[(values.indexOf(state.quality)+1)%3];updateQualityLabel();resetQuality?.();persist();toast({auto:'自动平衡画质与性能',high:'精细模式 · 完整粒子与辉光',eco:'节能模式 · 降低粒子数量与渲染负载'}[state.quality]);});
$('pauseButton').addEventListener('click',setPause);$('zenButton').addEventListener('click',()=>setZen(!state.zen));$('zenExit').addEventListener('click',()=>setZen(false));$('fullscreenButton').addEventListener('click',fullscreen);
$('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('startExploring').addEventListener('click',()=>$('helpDialog').close());
$('helpDialog').addEventListener('click',event=>{if(event.target===$('helpDialog')){const rect=$('helpDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('helpDialog').close();}});
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setScene(0);});
document.addEventListener('keydown',event=>{
  const editing=event.target.matches('input,select,textarea');
  if(event.key==='Escape'){
    if($('helpDialog').open){event.preventDefault();$('helpDialog').close();return;}
    if(native){sendHost('exit');return;}
    if(document.fullscreenElement){document.exitFullscreen();return;}
    if(state.zen)setZen(false);return;
  }
  if(editing||$('helpDialog').open||$('radioDialog').open||event.ctrlKey||event.altKey||event.metaKey)return;
  if(['1','2','3'].includes(event.key)){setScene(Number(event.key)-1);return;}
  if(event.code==='Space'){event.preventDefault();if(!event.repeat)setPause();}
  if(event.key.toLowerCase()==='h')setZen(!state.zen);
  if(event.key.toLowerCase()==='f')fullscreen();
  if(event.key==='?')$('helpDialog').showModal();
});
function updateClock(){const now=new Date();$('clock').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$('clock').dateTime=now.toISOString();$('date').textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'2-digit'}).replace(',',' /').toUpperCase();}
updateClock();setInterval(updateClock,1000);updateRanges();updateQualityLabel();setPalette(state.palette);setZen(state.zen);
if(reducedMotion){$('pauseIcon').textContent='▷';$('pauseButton').setAttribute('aria-label','继续演化');$('pauseButton').setAttribute('aria-pressed','true');}
window.nexus={getState:()=>({...state,width:app.clientWidth,height:app.clientHeight}),setScene,setZen};
init();
if(native&&screensaver){
  let firstPointer=null,lastInputNotice=0;
  document.addEventListener('pointermove',event=>{if(!firstPointer){firstPointer={x:event.clientX,y:event.clientY};return;}if(performance.now()-lastInputNotice>300&&Math.hypot(event.clientX-firstPointer.x,event.clientY-firstPointer.y)>8){lastInputNotice=performance.now();sendHost('input');}});
  document.addEventListener('keydown',()=>sendHost('input'));
  document.addEventListener('pointerdown',()=>sendHost('input'));
}
