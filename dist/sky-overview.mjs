const rad=Math.PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const nameKey=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[\s()\-]/g,'');
export function sphericalCenter(points){
  let x=0,y=0,z=0;
  for(const p of points){const weight=p.weight||1,d=p.dec*rad,a=p.ra*rad;x+=weight*Math.cos(d)*Math.cos(a);y+=weight*Math.cos(d)*Math.sin(a);z+=weight*Math.sin(d);}
  return {ra:(Math.atan2(y,x)/rad+360)%360,dec:Math.atan2(z,Math.hypot(x,y))/rad};
}
export function projectSky(center,point,width,height,fov=100){
  const d=center.dec*rad,a=center.ra*rad,p=point.dec*rad,q=point.ra*rad;
  const cosc=Math.sin(d)*Math.sin(p)+Math.cos(d)*Math.cos(p)*Math.cos(q-a);
  if(cosc<=.16)return null;
  const scale=width/(2*Math.tan(clamp(fov,40,145)*rad/2));
  const x=width/2-scale*Math.cos(p)*Math.sin(q-a)/cosc;
  const y=height/2-scale*(Math.cos(d)*Math.sin(p)-Math.sin(d)*Math.cos(p)*Math.cos(q-a))/cosc;
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function intersects(a,b,w,h){return a&&b&&!(Math.max(a.x,b.x)<0||Math.min(a.x,b.x)>w||Math.max(a.y,b.y)<0||Math.min(a.y,b.y)>h);}
const STAR_NAMES={Vega:'Вега',Deneb:'Денеб',Altair:'Альтаир',Polaris:'Полярная',Arcturus:'Арктур',Capella:'Капелла',Mirach:'Мирах',Alpheratz:'Альферац',Almach:'Альмак',Dubhe:'Дубхе',Merak:'Мерак',Alioth:'Алиот',Mizar:'Мицар',Alkaid:'Алькаид',Betelgeuse:'Бетельгейзе',Rigel:'Ригель',Aldebaran:'Альдебаран',Sirius:'Сириус',Procyon:'Процион',Regulus:'Регул',Spica:'Спика',Antares:'Антарес',Fomalhaut:'Фомальгаут',Castor:'Кастор',Pollux:'Поллукс'};
export function skyScene(object,stars,constellations,width,height,fov=100){
  const candidates=constellations.filter(c=>nameKey(c.name)===nameKey(object.constellation)||nameKey(c.name).startsWith(nameKey(object.constellation)));
  let active=candidates[0];
  if(candidates.length>1)active=candidates.toSorted((a,b)=>{const aa=projectSky(object,{ra:a.center[0],dec:a.center[1]},100,100,100),bb=projectSky(object,{ra:b.center[0],dec:b.center[1]},100,100,100);return (aa?Math.hypot(aa.x-50,aa.y-50):999)-(bb?Math.hypot(bb.x-50,bb.y-50):999);})[0];
  const center=active?sphericalCenter([{...object,weight:3},...active.lines.flat().map(p=>({ra:p[0],dec:p[1],weight:1/Math.max(1,active.lines.flat().length)}))]):object;
  const project=p=>projectSky(center,p,width,height,fov);
  const target=project(object);
  const lineGroups=[];
  for(const c of constellations){
    const segments=[];
    for(const line of c.lines)for(let i=1;i<line.length;i++){
      const a=project({ra:line[i-1][0],dec:line[i-1][1]}),b=project({ra:line[i][0],dec:line[i][1]});
      if(intersects(a,b,width,height))segments.push([a,b]);
    }
    if(segments.length)lineGroups.push({id:c.id,name:c.name,active:c.id===active?.id,segments,label:project({ra:c.center[0],dec:c.center[1]})});
  }
  const visibleStars=stars.filter(s=>s[2]<=5.8).map(s=>{const p=project({ra:s[0],dec:s[1]});return p&&p.x>=0&&p.y>=0&&p.x<=width&&p.y<=height?{...p,mag:s[2],name:STAR_NAMES[s[3]]||s[3],named:!!STAR_NAMES[s[3]],hip:s[4]}:null;}).filter(Boolean);
  const boxes=[];
  function reserve(text,x,y,activeLabel=false){
    const w=Math.min(width-30,text.length*(activeLabel?7.7:7));
    x=clamp(x,12+w/2,width-12-w/2);y=clamp(y,34,height-30);
    for(const shift of [0,20,-20,40,-40,60,-60]){
      const yy=clamp(y+shift,34,height-30),box={l:x-w/2-5,r:x+w/2+5,t:yy-16,b:yy+5};
      if(target&&Math.abs(x-target.x)<w/2+24&&Math.abs(yy-target.y)<28)continue;
      if(!boxes.some(b=>box.l<b.r&&box.r>b.l&&box.t<b.b&&box.b>b.t)){boxes.push(box);return {text,x,y:yy};}
    }
    return null;
  }
  const labels=[];
  for(const c of lineGroups.toSorted((a,b)=>Number(b.active)-Number(a.active))){
    let p=c.label;
    if((!p||p.x<0||p.x>width||p.y<0||p.y>height)&&c.active){const pts=c.segments.flat().filter(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);if(pts.length)p={x:pts.reduce((a,p)=>a+p.x,0)/pts.length,y:pts.reduce((a,p)=>a+p.y,0)/pts.length};}
    if(!p||p.x<10||p.x>width-10||p.y<20||p.y>height-20)continue;
    const label=reserve(c.name,p.x,p.y,c.active);if(label)labels.push({...label,active:c.active});
  }
  const starLabels=[];
  for(const star of visibleStars.filter(s=>s.name&&(s.mag<=1.7||s.named&&s.mag<=2.5)).toSorted((a,b)=>a.mag-b.mag).slice(0,16)){
    const label=reserve(star.name,star.x+18+star.name.length*2.5,star.y-9);if(label)starLabels.push(label);
  }
  return {center,target,stars:visibleStars,lines:lineGroups,labels,starLabels,activeId:active?.id,activeName:active?.name||object.constellation,fov};
}
