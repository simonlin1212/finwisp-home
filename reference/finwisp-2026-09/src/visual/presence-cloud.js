/* Reused from the approved original neural-sphere demo. No external code or model telemetry. */
export class PresenceCloud {
  constructor(host, options = {}) {
    this.host = host; this.mode = 'idle'; this.skin = 0; this.level = 0;
    this.pointer = [0, 0]; this.pointerSmooth = [0, 0]; this.low = false;
    this.paused = false; this.needsDraw = true; this.time = 0; this.last = 0;
    this.energy = .12; this.lastDraw = 0; this.alive = true; this.quality = 1;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.layer = 'volumetric-neural-sphere';
    host.appendChild(this.canvas);
    this.dust = document.createElement('canvas');
    this.dust.setAttribute('aria-hidden', 'true');
    this.dust.dataset.layer = 'synapses-and-particles';
    host.appendChild(this.dust);
    this.ctx = this.dust.getContext('2d');
    // The approved handoff screenshots use the existing particle renderer.
    // Select it explicitly so WKWebView and Chromium keep the same visual baseline.
    this.gl = options.renderer === 'particles' ? null : this.canvas.getContext('webgl', {
      alpha: true, antialias: false, premultipliedAlpha: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power'
    });
    if (this.gl) {
      try { this.initGL(); }
      catch (e) { console.warn('Neural sphere uses Canvas fallback:', e.message); this.gl = null; this.canvas.style.display = 'none'; }
    }
    this.seed = 90817;
    this.rand = () => { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; };
    this.palettes = [
      { base: '124,105,237', soft: '164,136,249', bright: '220,231,255', alt: '94,212,239', warm: '210,162,255' },
      { base: '49,152,174', soft: '100,213,199', bright: '220,255,248', alt: '125,176,249', warm: '165,244,222' },
      { base: '167,90,154', soft: '234,156,129', bright: '255,242,221', alt: '235,185,118', warm: '255,199,164' }
    ];
    const point = (radius) => {
      const z = this.rand() * 2 - 1, phi = this.rand() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      return { x: r * Math.cos(phi) * radius, y: r * Math.sin(phi) * radius, z: z * radius,
        radius, phase: this.rand() * Math.PI * 2, s: this.rand(), rate: .45 + this.rand() * .55 };
    };
    // Most motes occupy a thick surface volume; the rest supply interior depth.
    this.points = Array.from({ length: 3400 }, (_, i) => point(i < 2410 ? .78 + this.rand() * .205 : Math.cbrt(this.rand()) * .85));
    // A small, softly scattered fringe dissolves the silhouette without changing the round body.
    this.fringe = Array.from({ length: 105 }, () => point(.98 + this.rand() * .19));
    this.neurons = Array.from({ length: 165 }, () => point(.17 + Math.cbrt(this.rand()) * .7));
    this.edges = []; const pairs = new Set();
    for (let i = 0; i < this.neurons.length; i++) {
      const a = this.neurons[i];
      const near = this.neurons.map((b, j) => ({ j, d: (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2 }))
        .filter(n => n.j !== i).sort((x, y) => x.d - y.d).slice(0, 3);
      for (const n of near) {
        const key = [Math.min(i,n.j), Math.max(i,n.j)].join(':');
        if (pairs.has(key) || n.d > .245) continue;
        pairs.add(key);
        this.edges.push({ a: i, b: n.j, phase: this.rand(), bend: (this.rand()-.5)*.065, rate: .115+this.rand()*.16 });
      }
    }
    this.ribbons = Array.from({ length: 22 }, (_, i) => ({
      phi: this.rand()*6.283, theta: .5+this.rand()*2.1, phase: this.rand()*6.283,
      len: .85+this.rand()*.75, depth: .68+this.rand()*.28, strands: i%3===0?4:3,
      color: i%4===0?'alt':i%4===1?'bright':'soft'
    }));
    this.specks = Array.from({ length: 28 }, () => ({ x: this.rand(), y: this.rand(), r: this.rand(), phase: this.rand()*6.283 }));
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.move = e => { const r=host.getBoundingClientRect(); this.pointer=[(e.clientX-r.left)/Math.max(1,r.width)-.5,.5-(e.clientY-r.top)/Math.max(1,r.height)]; this.needsDraw=true; };
    this.leave = () => { this.pointer=[0,0]; this.needsDraw=true; };
    host.addEventListener('pointermove',this.move); host.addEventListener('pointerleave',this.leave);
    this.contextLost = e => { e.preventDefault(); this.gl=null; this.canvas.style.display='none'; this.needsDraw=true; };
    this.canvas.addEventListener('webglcontextlost',this.contextLost);
    this.resize(); this.frame=requestAnimationFrame(t=>this.tick(t));
  }
  initGL() {
    const gl=this.gl;
    const vertex='attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}';
    const frag=`precision mediump float;
    uniform vec2 u_resolution; uniform float u_radius; uniform float u_time;
    uniform float u_energy; uniform float u_skin; uniform vec2 u_pointer;
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,v=0.;mat2 m=mat2(.8,-.6,.6,.8);for(int i=0;i<4;i++){v+=a*noise(p);p=m*p*2.03+2.7;a*=.49;}return v;}
    void main(){
      vec2 p=(gl_FragCoord.xy-vec2(.5,.51)*u_resolution)/u_radius-u_pointer*.045;
      float t=u_time, e=u_energy;
      float angle=atan(p.y,p.x), rr=length(p);
      float ripples=(.018+e*.017)*sin(angle*5.+t*.85)+.013*sin(angle*9.-t*.59);
      float radius=.965+ripples+.012*sin(t*1.8);
      float inside=1.-smoothstep(radius-.09,radius+.045,rr);
      float z=sqrt(max(0.,radius*radius-dot(p,p)));
      vec2 q=p;
      q=mat2(cos(t*.038),-sin(t*.038),sin(t*.038),cos(t*.038))*q;
      q+=vec2(.14*sin(z*3.6+t*.21),.1*cos(z*4.8-t*.24));
      vec2 warp=vec2(fbm(q*2.+vec2(t*.13,z)),fbm(q*2.4+vec2(3.4,-t*.12)))-.5;
      float n=fbm(q*3.2+warp*2.3+vec2(t*.15,-t*.17));
      float fine=fbm(q*6.4+warp*2.6+vec2(-t*.16,t*.09));
      float fold=fbm(q*1.6+warp*.8+vec2(z*.4,t*.1));
      float silk=pow(max(0.,1.-abs(sin((q.y*.69+fold*1.8+n*.5-t*.025)*18.))),12.);
      float weave=pow(max(0.,1.-abs(sin((q.x*.32+fine*.75+n*.8+t*.025)*24.))),19.);
      float wisps=(silk*.64+weave*.38)*smoothstep(.26,.63,n);
      float depth=.27+z*.73;
      float gas=(.08+n*.25+fine*.065)*depth;
      vec3 deep=vec3(.12,.09,.30), mid=vec3(.42,.26,.77), pale=vec3(.75,.84,1.), accent=vec3(.26,.74,.84);
      if(u_skin>.5&&u_skin<1.5){deep=vec3(.025,.20,.25);mid=vec3(.1,.55,.50);pale=vec3(.73,1.,.91);accent=vec3(.40,.57,.95);}
      if(u_skin>1.5){deep=vec3(.28,.10,.21);mid=vec3(.75,.31,.28);pale=vec3(1.,.87,.71);accent=vec3(.96,.59,.29);}
      float h=smoothstep(-.75,.95,p.x+p.y*.5+n*.3);
      vec3 color=mix(deep,mid,.55+n*.38);
      color=mix(color,accent,h*.46);
      color=mix(color,pale,clamp(wisps*.9,0.,.65));
      color+=pale*wisps*.29;
      float core=exp(-dot(p-vec2(-.16,.12),p-vec2(-.16,.12))*9.);
      color+=core*mid*.08;
      float alpha=(gas+wisps*.69)*inside*(1.25+e*.19);
      float halo=exp(-dot(p,p)*3.0)*.055;
      alpha=clamp(alpha+halo,0.,.82);
      gl_FragColor=vec4(color,alpha);
    }`;
    const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,frag),p=gl.createProgram();
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v);gl.deleteShader(f);gl.useProgram(p);this.prog=p;
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    this.uniforms={};['u_time','u_resolution','u_radius','u_energy','u_skin','u_pointer'].forEach(n=>this.uniforms[n]=gl.getUniformLocation(p,n));
  }
  resize() {
    this.needsDraw=true;
    const r=this.canvas.getBoundingClientRect();
    // The fallback still uses the visible overlay's dimensions if the WebGL layer is hidden.
    const b=r.width>0?r:this.dust.getBoundingClientRect();
    this.w=Math.max(1,b.width);this.h=Math.max(1,b.height);
    this.dpr=Math.min(window.devicePixelRatio||1,1.6)*this.quality;
    for(const c of [this.canvas,this.dust]){c.width=Math.max(1,Math.round(this.w*this.dpr));c.height=Math.max(1,Math.round(this.h*this.dpr));}
    this.radius=Math.min(this.w*.365,this.h*.413);
    if(this.gl)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }
  setState(v){this.mode=v;this.needsDraw=true;}
  setLevel(v){this.level=Math.max(0,Math.min(Number(v)||0,1));this.needsDraw=true;}
  setSkin(v){this.skin=[0,1,2].includes(Number(v))?Number(v):0;this.needsDraw=true;}
  setLow(v){this.low=!!v;this.needsDraw=true;}
  setPaused(v){this.paused=!!v;this.needsDraw=true;this.last=0;}
  setQuality(v){this.quality=Math.max(.5,Math.min(1,Number(v)||1));this.resize();}
  tick(ms) {
    if(!this.alive)return;
    this.frame=requestAnimationFrame(t=>this.tick(t));
    if(document.hidden||this.paused){this.last=ms;return;}
    if(this.low&&!this.needsDraw)return;
    if(ms-this.lastDraw<(this.low?110:32))return;
    const dt=Math.min(.065,Math.max(0,(ms-(this.last||ms))/1000));
    this.last=ms;this.lastDraw=ms;
    const speed=this.mode==='thinking'?1.5:this.mode==='speaking'?1.15:this.mode==='listening'?1.0:.72;
    if(!this.low)this.time+=dt*speed;
    const target=this.mode==='thinking'?.64:this.mode==='speaking'?.40+Math.sin(this.time*6.3)*.14:this.mode==='listening'?.23+this.level*.64:.15;
    this.energy=this.low?target:this.energy+(target-this.energy)*.095;
    this.pointerSmooth=this.pointerSmooth.map((p,i)=>p+(this.pointer[i]-p)*.05);
    if(this.gl){const g=this.gl,u=this.uniforms;g.useProgram(this.prog);g.uniform2f(u.u_resolution,this.canvas.width,this.canvas.height);g.uniform1f(u.u_radius,this.radius*this.dpr);g.uniform1f(u.u_time,this.time);g.uniform1f(u.u_energy,this.energy);g.uniform1f(u.u_skin,this.skin);g.uniform2f(u.u_pointer,...this.pointerSmooth);g.drawArrays(g.TRIANGLES,0,6);}
    this.drawSphere();this.needsDraw=false;
  }
  setupProjection() {
    const t=this.time;
    const ay=t*.092+this.pointerSmooth[0]*.4, ax=-.18+Math.sin(t*.12)*.11-this.pointerSmooth[1]*.22;
    this.rotation=[Math.cos(ay),Math.sin(ay),Math.cos(ax),Math.sin(ax)];
  }
  project(x,y,z,phase=0,ripple=true) {
    const t=this.time,e=this.energy, r=Math.sqrt(x*x+y*y+z*z)||1;
    // Bounded three-dimensional travelling waves keep the mass recognizably round.
    if(ripple){const k=1+(.022+e*.034)*Math.sin(x*5.3+y*3.1-z*2.7+t*1.15)+.018*Math.sin(z*8.2-y*4.5-t*.82)+.009*Math.sin(t*2+phase);x*=k;y*=k;z*=k;}
    const [cy,sy,cx,sx]=this.rotation;
    const xx=x*cy+z*sy,zz=z*cy-x*sy;
    const yy=y*cx-zz*sx,depth=y*sx+zz*cx;
    return {x:this.w*.5+xx*this.radius+this.pointerSmooth[0]*this.radius*.045,y:this.h*.49+yy*this.radius-this.pointerSmooth[1]*this.radius*.045,z:depth,r};
  }
  glow(c,x,y,r,col,alpha) {
    const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${col},${alpha})`);g.addColorStop(.23,`rgba(${col},${alpha*.38})`);g.addColorStop(1,`rgba(${col},0)`);
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  drawSphere() {
    const c=this.ctx,w=this.w,h=this.h,t=this.time,e=this.energy,R=this.radius;
    if(!c)return;
    const pal=this.palettes[this.skin];
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,w,h);c.save();c.globalCompositeOperation='lighter';
    this.setupProjection();
    this.glow(c,w*.5,h*.49,R*1.28,pal.base,.065);
    if(!this.gl){this.glow(c,w*.5,h*.49,R*1.01,pal.base,.37);this.glow(c,w*.5-R*.19,h*.49-R*.14,R*.8,pal.soft,.09);}
    this.drawRibbons(c,pal);
    const screen=this.neurons.map(p=>this.project(p.x,p.y,p.z,p.phase));
    const activity=this.mode==='thinking'?1.6:this.mode==='speaking'?1.35:1;
    for(const edge of this.edges){
      const a=screen[edge.a],b=screen[edge.b],z=(a.z+b.z)*.5;
      const alpha=(.065+(z+.9)*.075)*(1+e*.35);
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const bend=edge.bend*R*Math.sin(t*.7+edge.phase*8);
      const mx=(a.x+b.x)*.5-dy/len*bend,my=(a.y+b.y)*.5+dx/len*bend;
      c.strokeStyle=`rgba(${edge.phase>.65?pal.alt:pal.soft},${alpha})`;c.lineWidth=.52+(z+.9)*.17;
      c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(mx,my,b.x,b.y);c.stroke();
      const phase=(t*edge.rate*activity+edge.phase)%1;
      if(phase<.17){
        const u=phase/.17,fade=Math.sin(u*Math.PI),px=(1-u)*(1-u)*a.x+2*(1-u)*u*mx+u*u*b.x,py=(1-u)*(1-u)*a.y+2*(1-u)*u*my+u*u*b.y;
        this.glow(c,px,py,4.5+e*2,pal.alt,fade*.22);
        c.fillStyle=`rgba(${pal.bright},${fade*(.36+z*.15)})`;c.beginPath();c.arc(px,py,.7+e*.35,0,Math.PI*2);c.fill();
      }
    }
    // Thousands of tiny front/back depth cues define the sphere, never a boundary line.
    const stride=this.quality<.8?2:1;
    for(let i=0;i<this.points.length;i+=stride){
      const p=this.points[i],s=this.project(p.x,p.y,p.z,p.phase),front=(s.z+1)*.5;
      const wave=Math.pow(Math.max(0,Math.cos(p.x*4+p.y*3-p.z*5-t*1.1)),7);
      const alpha=(.12+front*.46)*(p.s*.62+.35)+wave*.22;
      const size=.22+p.s*.46+front*.20+wave*.10;
      c.fillStyle=`rgba(${i%11===0?pal.bright:i%5===0?pal.alt:pal.soft},${alpha})`;
      c.beginPath();c.arc(s.x,s.y,size,0,Math.PI*2);c.fill();
    }
    for(let i=0;i<this.neurons.length;i++){
      const p=this.neurons[i],s=screen[i],front=(s.z+.9)/1.8;
      const pulse=Math.pow(Math.max(0,Math.sin(t*(1.35+e)+p.phase)),16);
      const size=.60+p.s*.67+front*.49+pulse*.7;
      const alpha=.33+front*.32+pulse*.28;
      const col=i%4===0?pal.alt:pal.bright;
      if(pulse>.24||i%17===0)this.glow(c,s.x,s.y,size*4.1,col,(.09+pulse*.21)*Math.max(.25,front));
      c.fillStyle=`rgba(${col},${alpha})`;c.beginPath();c.arc(s.x,s.y,size,0,Math.PI*2);c.fill();
      // Small dendrites, not star-shaped border decorations.
      if(pulse>.62&&i%3===0){c.strokeStyle=`rgba(${pal.soft},${pulse*.35})`;c.lineWidth=.55;
        for(let j=0;j<3;j++){let a=p.phase+j*2.09+t*.1;c.beginPath();c.moveTo(s.x+Math.cos(a)*2,s.y+Math.sin(a)*2);c.lineTo(s.x+Math.cos(a)*5,s.y+Math.sin(a)*5);c.stroke();}
      }
    }
    for(const p of this.fringe){const s=this.project(p.x,p.y,p.z,p.phase),a=(.055+p.s*.09)*(1+.3*Math.sin(t+p.phase));c.fillStyle=`rgba(${pal.soft},${a})`;c.beginPath();c.arc(s.x,s.y,.3+p.s*.35,0,Math.PI*2);c.fill();}
    for(const p of this.specks){let x=p.x*w+Math.sin(t*.2+p.phase)*4,y=p.y*h+Math.cos(t*.13+p.phase)*5;c.fillStyle=`rgba(${pal.bright},${.035+p.r*.10})`;c.fillRect(x,y,.6+p.r*.4,.6+p.r*.4);}
    c.restore();
  }
  drawRibbons(c,pal) {
    const t=this.time,e=this.energy;
    // Open, tapered stream sheets flow THROUGH the volume, not around its perimeter.
    // They remain inside the particle silhouette and cannot become orbit/outline rings.
    for(let group=0;group<5;group++){
      const angle=[-.45,.55,1.43,2.12,-1.03][group]+Math.sin(t*.14+group)*.14;
      const cg=Math.cos(angle),sg=Math.sin(angle),depth=[-.18,.23,.03,-.32,.36][group];
      for(let k=0;k<23;k++){
        const v=(k/22-.5)*2,pts=[];
        for(let j=0;j<=58;j++){
          const u=j/58*2-1,env=Math.sqrt(Math.max(0,1-u*u));
          let x=u*.86;
          let y=(v*.205+.245*Math.sin(u*3.4+t*.36+group*.86)+.032*Math.sin(u*8.3-v*1.8-t*.51))*env;
          let z=(depth+.23*Math.cos(u*2.7-t*.23+group*.57)+v*.045)*env;
          const xx=x*cg-y*sg,yy=x*sg+y*cg;
          pts.push(this.project(xx,yy,z,group));
        }
        const start=pts[0],end=pts[pts.length-1];
        const strength=Math.pow(Math.max(0,1-v*v),.75);
        const alpha=(.065+strength*.145)*(1+e*.25)*(group===2?.65:1);
        const col=group===1||group===4?pal.alt:group===3?pal.warm:pal.soft;
        const grad=c.createLinearGradient(start.x,start.y,end.x,end.y);
        grad.addColorStop(0,`rgba(${col},0)`);
        grad.addColorStop(.18,`rgba(${col},${alpha*.33})`);
        grad.addColorStop(.43,`rgba(${col},${alpha})`);
        grad.addColorStop(.60,`rgba(${pal.bright},${alpha*.93})`);
        grad.addColorStop(.84,`rgba(${col},${alpha*.28})`);
        grad.addColorStop(1,`rgba(${col},0)`);
        c.strokeStyle=grad;c.lineWidth=k%6===0?1.1:.6;
        c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
      }
    }
  }
  dispose() {
    this.alive=false;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();
    this.host.removeEventListener('pointermove',this.move);this.host.removeEventListener('pointerleave',this.leave);
    this.canvas.removeEventListener('webglcontextlost',this.contextLost);
    if(this.gl){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.prog);}
    this.canvas.remove();this.dust.remove();
  }
}
