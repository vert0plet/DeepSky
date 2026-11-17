import {equatorial,transform,screenPoint,clamp} from './planetarium-math.mjs?v=59d02c126dc7cb25';

// The catalogue footprint is projected in the same coordinate system as stars.
// Position angle is measured from celestial north towards east.
export function objectFootprint(object,matrix,view,width,height,fov){
 if(!(object.major>0))return null;
 const eq=equatorial(object.ra,object.dec),local=transform(matrix,eq),center=screenPoint(local,view,width,height,fov);
 if(!center)return null;
 const ra=object.ra*Math.PI/180,dec=object.dec*Math.PI/180,pa=(object.positionAngle||0)*Math.PI/180;
 const north=[-Math.cos(ra)*Math.sin(dec),-Math.sin(ra)*Math.sin(dec),Math.cos(dec)],east=[-Math.sin(ra),Math.cos(ra),0];
 const direction=north.map((v,i)=>v*Math.cos(pa)+east[i]*Math.sin(pa));
 const radius=object.major/120*Math.PI/180;
 const end=screenPoint(transform(matrix,eq.map((v,i)=>v*Math.cos(radius)+direction[i]*Math.sin(radius))),view,width,height,fov);
 if(!end)return null;
 const major=Math.hypot(end.x-center.x,end.y-center.y),minor=major*clamp((object.minor||object.major)/object.major,.08,1);
 return {x:center.x,y:center.y,major,minor,angle:Math.atan2(end.y-center.y,end.x-center.x)};
}

function seedFor(id){let n=2166136261;for(const c of id)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function sprite(object,night){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d'),ink=night?'205,105,74':'205,217,221';let seed=seedFor(object.id);
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const glow=(x,y,r,alpha)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${ink},${alpha})`);g.addColorStop(.3,`rgba(${ink},${alpha*.45})`);g.addColorStop(1,`rgba(${ink},0)`);ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);};
 if(object.type==='galaxy'){
  glow(128,128,124,.42);glow(128,128,54,.62);glow(128,128,14,.65);
  if((object.minor||object.major)/object.major<.35){ctx.fillStyle=night?'#190a0740':'#07101b45';ctx.fillRect(8,131,240,4);}
 }else if(object.type==='globular'){
  glow(128,128,123,.5);glow(128,128,45,.35);
  for(let i=0;i<170;i++){const a=random()*Math.PI*2,r=Math.pow(random(),1.7)*118;ctx.fillStyle=`rgba(${ink},${.15+random()*.55})`;ctx.beginPath();ctx.arc(128+Math.cos(a)*r,128+Math.sin(a)*r,.5+random()*.7,0,Math.PI*2);ctx.fill();}
 }else if(object.type==='planetary'){
  if(object.id==='NGC6720'){ctx.lineWidth=28;ctx.strokeStyle=`rgba(${ink},.35)`;ctx.shadowColor=`rgba(${ink},.6)`;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(128,128,86,0,Math.PI*2);ctx.stroke();}
  else if(object.id==='NGC6853'){glow(128,85,83,.52);glow(128,171,83,.52);}
  else{glow(128,128,122,.45);glow(128,128,35,.35);}
 }else if(object.type==='open'){
  for(let i=0;i<50;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*115;glow(128+Math.cos(a)*r,128+Math.sin(a)*r,1.5+random()*2,.3+random()*.55);}
 }else if(['emission','reflection','snr'].includes(object.type)){
  for(let i=0;i<14;i++){const a=random()*Math.PI*2,r=random()*65;glow(128+Math.cos(a)*r,128+Math.sin(a)*r,40+random()*45,.08+random()*.09);}
 }else return null;
 return canvas;
}

export function createObjectRenderer(){
 const cache=new Map();
 return function draw(ctx,object,footprint,fov,night){
  if(!footprint||fov>12||footprint.major<3)return false;
  const key=object.id+':'+night;
  if(!cache.has(key)){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,sprite(object,night));}
  const image=cache.get(key);if(!image)return false;
  const {x,y,major,minor,angle}=footprint;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=clamp((12-fov)/8,.12,.85);
  ctx.drawImage(image,-major,-minor,major*2,minor*2);ctx.restore();return true;
 };
}
