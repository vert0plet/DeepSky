import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {equatorial,horizon,angles,transform,equatorialToLocal,camera,validatedCamera,screenPoint,screenRay,dragCamera,separation,rotationBetween,calibrateCamera,blendCameras,groundPolygon,detailLimits,showCatalogObject} from '../dist/planetarium-math.mjs';
const A=createRequire(import.meta.url)('../dist/vendor/astronomy.js');
const close=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} vs ${b}`);
for(const az of [0,90,180,270,359.9])for(const alt of [-89,-30,0,40,89]){const v=horizon(az,alt),back=angles(v);close(back.azimuth,az);close(back.altitude,alt);const view=camera(az,alt),p=screenPoint(v,view,390,600,85);close(p.x,195);close(p.y,300);close(separation(v,screenRay(p.x,p.y,view,390,600,85)),0,2e-6);assert.equal(screenPoint(v.map(x=>-x),view,390,600,85),null);}
for(const settings of [{latitude:56,longitude:37.6},{latitude:-33.86,longitude:151.2},{latitude:0,longitude:-179.9}])for(const date of [new Date('2026-11-05T19:00:00Z'),new Date('2026-06-21T01:00:00Z')]){
 const matrix=equatorialToLocal(A,date,settings),rotation=A.Rotation_EQJ_HOR(date,new A.Observer(settings.latitude,settings.longitude,0));
 for(const [ra,dec] of [[0,0],[359.9,-10],[83.822,-5.391],[37.954,89.264]]){const local=angles(transform(matrix,equatorial(ra,dec))),v=A.RotateVector(rotation,A.VectorFromSphere(new A.Spherical(dec,ra,1),date)),expected=A.HorizonFromVector(v);close(local.altitude,expected.lat);close(local.azimuth,expected.lon);}
}
const north=camera(0,0),east=horizon(90,20),q=rotationBetween(north.forward,east),calibrated=calibrateCamera(north,q);close(separation(calibrated.forward,east),0,2e-6);close(separation(calibrateCamera(north,rotationBetween(north.forward,north.forward.map(x=>-x))).forward,[0,-1,0]),0,2e-6);
for(const [az,alt] of [[0,0],[123,80],[330,-60]]){const view=camera(az,alt),poly=groundPolygon(view,390,600,85);for(const [x,y] of poly){assert(Number.isFinite(x)&&Number.isFinite(y));assert(x>=-1e-6&&x<=390.000001&&y>=-1e-6&&y<=600.000001);assert(screenRay(x,y,view,390,600,85)[2]<1e-7);}}
assert.throws(()=>validatedCamera({forward:[NaN,1,0],right:[1,0,0],up:[0,0,1]}));
assert.throws(()=>validatedCamera({forward:[0,1,0],right:[1,0,0],up:[0,1,0]}));
console.log('PASS: 3D projection, round trips, polar/RA wrap, observer/date transforms vs Astronomy Engine, horizon clipping, orientation validation and star calibration.');

let previous={starMagnitude:0,objectMagnitude:0};
for(const fov of [120,100,85,60,40,25,15,8,4,1,.25]){const limits=detailLimits(fov);assert(limits.starMagnitude>=previous.starMagnitude);assert(limits.objectMagnitude>=previous.objectMagnitude);previous=limits;}
assert(!showCatalogObject({magnitude:11},detailLimits(85)));assert(showCatalogObject({magnitude:11},detailLimits(25)));
assert(!showCatalogObject({magnitude:null},detailLimits(85)));assert(showCatalogObject({magnitude:null},detailLimits(18)));
console.log('PASS: progressive star/object detail with zoom, faint-object reveal and explicit handling of unknown magnitudes.');

for(const target of [camera(180,0),{forward:north.forward,right:north.right.map(x=>-x),up:north.up.map(x=>-x)},camera(250,89)]){let blended=north;for(let i=0;i<60;i++)blended=blendCameras(blended,target,.3);close(separation(blended.forward,target.forward),0,3e-6);close(separation(blended.up,target.up),0,3e-6);}
const midpoint=blendCameras(north,camera(90,0),.5);close(angles(midpoint.forward).azimuth,45);
console.log('PASS: shortest-path orientation smoothing, including 180-degree turns and phone roll.');

const {validSkyTime,calendarDays}=await import('../dist/sky-time-picker.mjs');
assert(validSkyTime('2028-02-29T23:59'));assert(!validSkyTime('2026-02-29T22:00'));assert(!validSkyTime('2026-11-31T22:00'));assert(!validSkyTime('2026-11-05T24:00'));assert(!validSkyTime('2026-11-05T20:60'));assert(!validSkyTime('2026-13-01T00:00'));
const february=calendarDays(2028,1);assert.equal(february.length,42);assert.equal(february[0].key,'2028-01-31');assert(february.some(d=>d.key==='2028-02-29'&&!d.outside));assert.equal(calendarDays(2026,11).at(-1).key,'2027-01-10');
console.log('PASS: calendar Monday alignment, leap years, month/year boundaries and invalid date/time rejection.');

const {indexStarTiles,tilesInView}=await import('../dist/planetarium-stars.mjs');
const {objectFootprint}=await import('../dist/planetarium-objects.mjs');
const {pageDirection}=await import('../dist/navigation.mjs');
const fs=await import('node:fs');
const dense=JSON.parse(fs.readFileSync(new URL('../dist/data/sky-stars.json',import.meta.url)));
assert(dense.length>100000);assert.equal(new Set(dense.map(star=>star[5])).size,dense.length);
assert(dense.some(star=>star[2]>10));assert(dense.every(star=>star[2]<=14&&star[0]>=0&&star[0]<360&&star[1]>=-90&&star[1]<=90));
const entries=dense.map(star=>({star,eq:equatorial(star[0],star[1])})),tiles=indexStarTiles(entries),identity=[[1,0,0],[0,1,0],[0,0,1]];
// Compare the spatial selection against the unculled projection at the pole,
// RA wrap, portrait/landscape and the two zoom extremes: no visible star lost.
for(const [az,alt,w,h,fov] of [[0,89,390,760,.25],[359.9,0,390,760,1],[83,35,844,320,8],[0,0,390,760,120],[180,-70,760,390,60]]){
 const view=camera(az,alt),selected=new Set(tilesInView(tiles,identity,view,w,h,fov).flatMap(tile=>tile.stars));
 for(const entry of entries){const p=screenPoint(entry.eq,view,w,h,fov);if(p&&p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h)assert(selected.has(entry),'Culled a visible star');}
}
const object={ra:0,dec:0,major:60,minor:30,positionAngle:0},view=camera(90,0);
const wide=objectFootprint(object,identity,view,400,600,8),zoomed=objectFootprint(object,identity,view,400,600,.5);
assert(zoomed.major>wide.major*15);close(wide.minor/wide.major,.5);close(wide.x,200);close(wide.y,300);
const rotated=objectFootprint({...object,positionAngle:90},identity,view,400,600,8);close(Math.abs(Math.sin(wide.angle-rotated.angle)),1);
assert.equal(objectFootprint({...object,major:null},identity,view,400,600,8),null);
assert.equal(pageDirection('catalog','sky'),1);assert.equal(pageDirection('settings','lists'),-1);assert.equal(pageDirection('sky','sky'),0);
assert(detailLimits(.25).starMagnitude>detailLimits(8).starMagnitude);
const gaia=dense.filter(star=>star[6]==='G');assert(gaia.length>100000);assert(gaia.every(star=>typeof star[5]==='string'&&star[5].startsWith('G')));
assert(gaia.filter(star=>separation(equatorial(star[0],star[1]),equatorial(267.360125,70.144361))<.125).length>=5);
console.log(`PASS: ${dense.length} real HYG/Gaia sources, deep NGC6503 field, conservative tile culling, angular size/position angle and navigation direction.`);

for(const fov of [120,85,25,8,4,1,.25])for(const altitude of [0,56,-56,89.9,-89.9]){
 const view=camera(37,altitude),from={x:195,y:300},to={x:205,y:303},moved=dragCamera(view,from,to,390,600,fov),aim=angles(moved.forward);
 close(moved.right[2],0);assert(moved.up[2]>=-1e-12,'Horizon rolled upside down');
 const oldHorizontal=10/390*fov*1.3,oldVertical=3/600*fov;
 const horizontalGain=(37-aim.azimuth)/oldHorizontal;
 assert(horizontalGain>=1-1e-7&&horizontalGain<=1.1+1e-7,'Unexpected sensitivity boost');
 if(fov>=8){const original=camera(37-oldHorizontal,Math.min(90,Math.max(-90,altitude+oldVertical)));close(separation(moved.forward,original.forward),0,3e-6);}
 if(Math.abs(altitude)<80)close((aim.altitude-altitude)/oldVertical,horizontalGain,1e-6);
}
close((37-angles(dragCamera(camera(37,56),{x:195,y:300},{x:205,y:300},390,600,.25).forward).azimuth)/(10/390*.25*1.3),1.1,1e-7);
console.log('PASS: original wide-view sensitivity at every altitude, level horizon, deep-zoom boost capped at 10% on both axes.');
