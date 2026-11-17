import assert from 'node:assert/strict';
import fs from 'node:fs';
import {skyScene,projectSky} from '../dist/sky-overview.mjs';
const read=path=>JSON.parse(fs.readFileSync(new URL('../dist/'+path,import.meta.url)));
const catalog=read('data/catalog.json'),stars=read('data/stars.json'),constellations=read('data/constellations.json'),previews=read('assets/preview-credits.json');
assert.equal(constellations.length,89);
const missed=[];
for(const object of catalog){
  const preview=previews[object.id];
  assert(preview?.preview,object.id+' has no overview photo');
  assert.equal(preview.width,640);assert.equal(preview.height,360);
  assert(Math.abs(preview.fovHeight/preview.fov-360/640)<1e-4,object.id+' aspect mismatch');
  for(const [w,h] of [[760,517],[334,317]])for(const field of [70,100]){
    const scene=skyScene(object,stars,constellations,w,h,field);
    assert(scene.target&&scene.target.x>0&&scene.target.x<w&&scene.target.y>0&&scene.target.y<h,object.id+' off-screen');
    assert(scene.lines.length>1,object.id+' no surrounding constellations');
    assert(scene.stars.length>10,object.id+' empty stars');
    if(!scene.activeId)missed.push(object.constellation);
  }
}
assert.equal(missed.length,0,'Unknown constellation names: '+[...new Set(missed)]);
const fraction=id=>catalog.find(o=>o.id===id).major/(previews[id].fov*60);
assert(fraction('NGC224')>fraction('NGC6503')*1.7,'M31 should look wider than NGC6503');
assert(fraction('NGC6205')<.4,'M13 needs whole-cluster context');
assert(fraction('NGC6720')<.15,'M57 must not fill its frame');
assert(fraction('NGC650')<.15,'M76 must not fill its frame');
for(const ra of [0,359.99,180]){const p=projectSky({ra,dec:75},{ra:(ra+360)%360,dec:75},760,517,100);assert(Math.abs(p.x-380)<1e-6&&Math.abs(p.y-258.5)<1e-6);}
console.log(`PASS: ${catalog.length} overview photos; apparent-size ordering; whole-cluster fields; all sky targets and constellation context at desktop/mobile sizes.`);
