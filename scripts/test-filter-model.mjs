import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_SETTINGS,difficulty,isRecommended,filterAdvice} from '../dist/core.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
const object=id=>catalog.find(o=>o.id===id);
const sky={sun:{altitude:-30},moon:{altitude:-30},moonIllumination:0,moonJ2000:{ra:0,dec:0}},h={altitude:60,azimuth:180};
const settings=filter=>({...DEFAULT_SETTINGS,filter});
const score=(id,filter)=>difficulty(object(id),settings(filter),h,sky).score;
for(const id of ['NGC7000','NGC281','NGC2237','NGC6888','NGC6960','NGC6992','IC410']){
 assert(score(id,'none')>=4,id+' is not easy unfiltered');
 assert(score(id,'uhc')<score(id,'none'),id+' responds to UHC');
}
assert(score('NGC7000','oiii')<score('NGC7000','none'));
assert(score('IC1805','uhc')>=4,'Heart remains a challenge with a filter');
assert(score('NGC1976','none')<=2,'M42 bright core is visible without a filter');
assert(score('NGC1982','oiii')>score('NGC1982','uhc'),'M43 is not an OIII target');
assert(score('NGC1499','oiii')>=score('NGC1499','none'),'OIII does not rescue California');
assert.match(filterAdvice(object('NGC1499'),settings('oiii')).note,/Hβ/);
assert.equal(object('NGC281').magnitude,null,'No invented magnitude for a profile');
assert.equal(difficulty({...object('NGC6503'),magnitude:null},settings('none'),h,sky).score,null);
assert.equal(isRecommended(object('NGC7000'),settings('none'),h,sky),false);
assert.equal(isRecommended(object('NGC7000'),settings('uhc'),h,sky),true);
assert.equal(isRecommended(object('IC1805'),settings('uhc'),h,sky),false);
assert.equal(isRecommended(object('NGC1976'),settings('none'),{...h,altitude:10},sky),false);
assert.equal(isRecommended(object('NGC1976'),settings('none'),h,{...sky,sun:{altitude:5}}),false);
assert.equal(difficulty(object('NGC6503'),settings('none'),h,sky).score,difficulty(object('NGC6503'),settings('uhc'),h,sky).score,'Galaxies are evaluated without nebula filters');
console.log('PASS: conservative filter comparisons, bright cores, H-beta caveats, unknown magnitudes and recommendation eligibility.');
