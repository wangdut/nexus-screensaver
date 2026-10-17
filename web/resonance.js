import * as THREE from 'three';

// Three continuous spectral ribbons, morphed with the existing particle forms.
// Their displacement, width and visibility are driven only by measured audio.
export function createResonance(uniforms){
  const positions=[],indices=[],segments=256;
  for(let lane=0;lane<3;lane++){
    const base=positions.length/3;
    for(let i=0;i<=segments;i++)for(let edge=0;edge<2;edge++)positions.push(i/segments,lane,edge);
    for(let i=0;i<segments;i++){const a=base+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:`
      uniform float uTime;uniform vec3 uWeights;uniform vec4 uAudio;uniform float uOnset;uniform float uBands[32];
      varying float vLevel;varying float vEdge;varying float vLane;
      mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      float band(float x){float f=clamp(x,0.,1.)*31.;int a=int(floor(f));int b=int(min(31.,floor(f)+1.));return mix(uBands[a],uBands[b],fract(f));}
      void main(){
        float lane=position.y,angle=position.x*6.2831853,edge=position.z-.5;
        float level=band(abs(sin(angle*.5+lane*.57)));
        float envelope=min(1.2,uAudio.w);
        float width=.012+envelope*.035+level*.10;
        float radius=2.28+lane*.22+level*.28+uAudio.x*.12+edge*width;
        float phase=angle+uTime*.08*(1.+lane*.18);
        vec3 core=vec3(cos(phase)*radius,sin(phase)*radius,0.);
        core.yz=turn(.45+lane*.65)*core.yz;core.xz=turn(-.35+lane*.52)*core.xz;
        float spiral=.8+position.x*2.5+level*.23+edge*width;
        float theta=angle*1.6+lane*2.094+uTime*.09;
        vec3 orbit=vec3(cos(theta)*spiral,level*.23,sin(theta)*spiral);
        orbit.yz=turn(.36)*orbit.yz;orbit.xy=turn(-.24)*orbit.xy;
        float gateRadius=1.68+lane*.26+level*.34+edge*width;
        vec3 gate=vec3(cos(phase)*gateRadius,sin(phase)*gateRadius,(lane-1.)*.26+level*.25*sin(angle*5.-uTime*.5));
        gate.xz=turn(.20*sin(uTime*.15)+.13)*gate.xz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(core*uWeights.x+orbit*uWeights.y+gate*uWeights.z,1.);
        vLevel=level;vEdge=position.z;vLane=lane;
      }`,
    fragmentShader:`
      uniform vec3 uColorA;uniform vec3 uColorB;uniform vec4 uAudio;uniform float uOnset;
      varying float vLevel;varying float vEdge;varying float vLane;
      void main(){
        float profile=pow(max(0.,sin(vEdge*3.1415926)),.7);
        vec3 color=mix(uColorA,uColorB,vLane*.28);
        float energy=clamp(uAudio.w*.5+vLevel*.4,0.,1.);
        gl_FragColor=vec4(color*1.8,profile*energy*(.18+vLevel*.42+uOnset*.12));
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return mesh;
}
