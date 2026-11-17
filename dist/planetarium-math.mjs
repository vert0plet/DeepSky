const R=Math.PI/180;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const wrap=v=>(v%360+360)%360;
export const signedAngle=v=>((v+540)%360)-180;
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(v){const n=Math.hypot(...v);if(!Number.isFinite(n)||n<1e-10)throw new Error('Invalid direction');return v.map(x=>x/n);}
export function equatorial(ra,dec){const a=ra*R,d=dec*R;return [Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)];}
export function horizon(azimuth,altitude){const a=azimuth*R,h=altitude*R;return [Math.sin(a)*Math.cos(h),Math.cos(a)*Math.cos(h),Math.sin(h)];}
export function angles(v){return {azimuth:wrap(Math.atan2(v[0],v[1])/R),altitude:Math.asin(clamp(unit(v)[2],-1,1))/R};}
export function transform(m,v){return m.map(row=>dot(row,v));}
export function equatorialToLocal(A,date,settings){
 const r=A.Rotation_EQJ_HOR(date,new A.Observer(settings.latitude,settings.longitude,0)).rot;
 // Astronomy Engine uses north/west/up; the planetarium uses east/north/up.
 return [[-r[0][1],-r[1][1],-r[2][1]],[r[0][0],r[1][0],r[2][0]],[r[0][2],r[1][2],r[2][2]]];
}
export function camera(azimuth,altitude){const forward=horizon(azimuth,altitude),a=azimuth*R,right=[Math.cos(a),-Math.sin(a),0];return {forward,right,up:unit(cross(right,forward))};}
export function validatedCamera(value){
 if(!value||!['forward','right','up'].every(k=>Array.isArray(value[k])&&value[k].length===3&&value[k].every(Number.isFinite)))throw new Error('Invalid orientation');
 const forward=unit(value.forward),right=unit(cross(forward,unit(value.up))),up=unit(cross(right,forward));
 return {forward,right,up};
}
export function screenPoint(v,view,width,height,fov){
 const depth=dot(v,view.forward);if(depth<=.025)return null;
 const focal=Math.min(width,height)/(2*Math.tan(fov*R/2));
 return {x:width/2+focal*dot(v,view.right)/depth,y:height/2-focal*dot(v,view.up)/depth,depth};
}
export function screenRay(x,y,view,width,height,fov){const f=Math.min(width,height)/(2*Math.tan(fov*R/2)),sx=(x-width/2)/f,sy=-(y-height/2)/f;return unit(view.forward.map((v,i)=>v+sx*view.right[i]+sy*view.up[i]));}
export function separation(a,b){return Math.acos(clamp(dot(unit(a),unit(b)),-1,1))/R;}
export function rotationBetween(from,to){
 const a=unit(from),b=unit(to),d=dot(a,b);
 if(d<-.999999){const axis=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return [...axis,0];}
 return unit4([...cross(a,b),1+d]);
}
function unit4(v){const n=Math.hypot(...v);return v.map(x=>x/n);}
export function rotateQuaternion(q,v){const u=q.slice(0,3),uv=cross(u,v),uuv=cross(u,uv);return v.map((x,i)=>x+2*(q[3]*uv[i]+uuv[i]));}
export function calibrateCamera(view,q){return validatedCamera(Object.fromEntries(['forward','right','up'].map(k=>[k,rotateQuaternion(q,view[k])])));}
export function dragCamera(view,from,to,width,height,fov){
 const aim=angles(view.forward);
 // Preserve the original controls throughout the wide view. Only deep zoom
 // adds a small, gradual boost (at most 10%), without altitude-based gain.
 const zoom=clamp(Math.log2(8/fov)/5,0,1),gain=1+.1*zoom*zoom*(3-2*zoom);
 const horizontal=(to.x-from.x)/width*fov*1.3;
 const vertical=(to.y-from.y)/height*fov;
 return camera(wrap(aim.azimuth-horizontal*gain),clamp(aim.altitude+vertical*gain,-90,90));
}
function cameraQuaternion(view){
 const {right:r,up:u,forward:f}=view;
 // Rotation columns are camera right, up and back, forming a right-handed basis.
 const m=[[r[0],u[0],-f[0]],[r[1],u[1],-f[1]],[r[2],u[2],-f[2]]],trace=m[0][0]+m[1][1]+m[2][2];
 let q;
 if(trace>0){const s=2*Math.sqrt(1+trace);q=[(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s,s/4];}
 else {const i=m[0][0]>m[1][1]?(m[0][0]>m[2][2]?0:2):(m[1][1]>m[2][2]?1:2),j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]);q=[0,0,0,0];q[i]=s/4;q[j]=(m[i][j]+m[j][i])/s;q[k]=(m[i][k]+m[k][i])/s;q[3]=(m[k][j]-m[j][k])/s;}
 return unit4(q);
}
export function blendCameras(from,to,amount){
 const a=cameraQuaternion(from),b=cameraQuaternion(to);let cosine=a.reduce((n,v,i)=>n+v*b[i],0);
 if(cosine<0){for(let i=0;i<4;i++)b[i]=-b[i];cosine=-cosine;}
 const t=clamp(amount,0,1),angle=Math.acos(clamp(cosine,-1,1)),sine=Math.sin(angle);
 const q=unit4(a.map((v,i)=>cosine>.9995?v*(1-t)+b[i]*t:(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/sine));
 return {right:rotateQuaternion(q,[1,0,0]),up:rotateQuaternion(q,[0,1,0]),forward:rotateQuaternion(q,[0,0,-1])};
}
export function groundPolygon(view,width,height,fov){
 const f=Math.min(width,height)/(2*Math.tan(fov*R/2));
 const altitude=p=>view.forward[2]+(p[0]-width/2)/f*view.right[2]-(p[1]-height/2)/f*view.up[2];
 const vertices=[[0,0],[width,0],[width,height],[0,height]],out=[];
 for(let i=0;i<4;i++){const a=vertices[i],b=vertices[(i+1)%4],ha=altitude(a),hb=altitude(b);if(ha<=0)out.push(a);if((ha<0)!==(hb<0)){const t=ha/(ha-hb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
 return out;
}

export function detailLimits(fov){
 const field=clamp(Number(fov)||85,.25,120),zoom=Math.log2(120/field);
 return {starMagnitude:field<4?clamp(10.7+.85*Math.log2(4/field),10.7,14):clamp(3.6+1.45*zoom,3.6,10.7),objectMagnitude:clamp(6+2.5*zoom,6,15),objectLabelMagnitude:clamp(4.8+2.5*zoom,4.8,14),showUnknown:field<=25};
}
export function showCatalogObject(object,limits){return Number.isFinite(object.magnitude)?object.magnitude<=limits.objectMagnitude:limits.showUnknown;}
