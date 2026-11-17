import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {TYPES,groupForType,parseCoordinate,freshState,cleanState,foundIds,addToList,saveState,loadState,markObjectFound,unmarkObjectFound,searchMatches,distance,horizontal,skyContext,difficulty,fromLocal,localInput} from '../dist/core.mjs';
const require=createRequire(import.meta.url),A=require('../dist/vendor/astronomy.js');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/data/catalog.json',import.meta.url))),stars=JSON.parse(fs.readFileSync(new URL('../dist/data/stars.json',import.meta.url)));
assert.equal(new Set(catalog.map(o=>o.id)).size,catalog.length);
for(const o of catalog){assert(o.ra>=0&&o.ra<360,o.id);assert(o.dec>=-90&&o.dec<=90,o.id);assert(o.magnitude===null||Number.isFinite(o.magnitude),o.id);}
assert(stars.length>10000);
assert(catalog.some(o=>o.id==='NGC6503'));
const m31=catalog.find(o=>o.id==='NGC224');
assert(searchMatches(m31,'M31'));assert(searchMatches(m31,'ngc 224'));assert(searchMatches(m31,'андромеда'));
const expectedGroups={galaxy:'galaxy',open:'clusters',globular:'clusters',planetary:'nebula',emission:'nebula',reflection:'nebula',dark:'nebula',snr:'nebula',quasar:'special',special:'special'};
for(const type of Object.keys(TYPES)){assert.equal(groupForType(type),expectedGroups[type]);assert(catalog.filter(o=>o.type===type).every(o=>groupForType(o.type)===expectedGroups[type]));}
assert.equal(groupForType('all'),'all');
assert.equal(parseCoordinate('12.345678',-90,90),12.345678);
assert.equal(parseCoordinate(' 12,345678 ',-90,90),12.345678);
assert.equal(parseCoordinate('−23,456789',-180,180),-23.456789);
for(const value of ['', ' ', '55,98,6','55abc','Infinity','90.000001'])assert(Number.isNaN(parseCoordinate(value,-90,90)),value);
assert.equal(parseCoordinate('-90',-90,90),-90);assert.equal(parseCoordinate('180',-180,180),180);
const preciseState=freshState();preciseState.settings.latitude=parseCoordinate('12.345678',-90,90);preciseState.settings.longitude=parseCoordinate('23.456789',-180,180);assert.equal(cleanState(preciseState).settings.latitude,12.345678);assert.equal(cleanState(preciseState).settings.longitude,23.456789);
const state=freshState();state.lists.push({id:'test',name:'Ночь',date:'2026-11-02',notes:'',objectIds:[],createdAt:'2026-11-02T00:00:00Z'});
addToList(state,'test','NGC6503');addToList(state,'test','NGC6503');assert.equal(state.lists[0].objectIds.length,1);
state.observations.push({id:'a',objectId:'NGC6503',outcome:'not_seen',observedAt:'2026-11-01T19:00:00Z',note:'Попытка',aperture:150,sqm:21.35,eyepiece:25,place:'Поле'});
assert.equal(foundIds(state).size,0);
state.observations.push({...state.observations[0],id:'b',outcome:'averted'});assert(foundIds(state).has('NGC6503'));
const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
saveState(state,storage);assert.deepEqual(loadState(storage),cleanState(state));
const clean=cleanState(JSON.parse(JSON.stringify(state)));assert.equal(clean.lists[0].name,'Ночь');assert.equal(clean.observations.length,2);
assert.throws(()=>cleanState({schemaVersion:99}));
const badDate = {...state,lists:[{...state.lists[0],date:'2026-02-31'}]};
assert.equal(cleanState(badDate).lists[0].date,'');
assert.equal(cleanState({...state,settings:{...state.settings,foreignKey:'extra'}}).settings.foreignKey,undefined);
const invalid={...state,settings:{...state.settings,latitude:999}};assert.equal(cleanState(invalid).settings.latitude,56);
const date=new Date('2026-11-02T19:00:00Z');assert.equal(localInput(date,3),'2026-11-02T22:00');assert.equal(fromLocal('2026-11-02T22:00',3).toISOString(),date.toISOString());
assert(Math.abs(distance({ra:0,dec:0},{ra:90,dec:0})-90)<1e-9);
const ngc=catalog.find(o=>o.id==='NGC6503'),s=state.settings;
for(let hour=0;hour<24;hour++){const h=horizontal(A,ngc,new Date(`2026-11-02T${String(hour).padStart(2,'0')}:00:00Z`),s);assert(h.altitude>25&&h.altitude<77,`Circumpolar NGC6503 altitude ${h.altitude}`);}
const winter=new Date('2026-12-15T20:00:00Z'),context=skyContext(A,winter,s);assert(context.sun.altitude< -18);
const sunSummer=skyContext(A,new Date('2026-06-21T21:30:00Z'),s);assert(sunSummer.sun.altitude> -18);
const h=horizontal(A,ngc,winter,s),dark={...context,sun:{altitude:-30},moon:{altitude:-30}};
const d1=difficulty(ngc,s,h,dark),d2=difficulty(ngc,{...s,aperture:300},h,dark),d3=difficulty(ngc,{...s,sqm:18},h,dark);
assert(d2.score<=d1.score);assert(d3.score>=d1.score);
assert.equal(difficulty({...ngc,magnitude:null},s,h,dark).score,null);
console.log(`PASS: ${catalog.length} catalogue objects, ${stars.length} stars; persistence, found status, import validation, dates, visibility and difficulty checks.`);

const quickState=freshState();const quick=markObjectFound(quickState,"NGC6503",new Date("2026-11-02T19:00:00Z"));assert(quick.created);assert(foundIds(quickState).has("NGC6503"));assert.equal(quick.observation.note,"");quick.observation.note="Еле разглядел";assert.equal(markObjectFound(quickState,"NGC6503").created,false);assert.equal(quickState.observations.length,1);assert.equal(quickState.observations[0].note,"Еле разглядел");saveState(quickState,storage);assert.equal(loadState(storage).observations[0].note,"Еле разглядел");console.log("PASS: one-click found marking, optional note, repeat-click idempotence and persistence.");

for(const o of catalog.filter(o=>['special','quasar'].includes(o.type))){assert(o.specificType&&o.subtitle,o.id+' has a concrete type and subtitle');assert(!o.subtitle.includes('Необычный объект'));}
assert(searchMatches(catalog.find(o=>o.id==='NGC6994'),'астеризм'));
console.log('PASS: specific labels for all unusual objects and searchable classifications.');

const removalState=cleanState(state);const originalRecords=JSON.parse(JSON.stringify(removalState.observations));
removalState.observations.push({...removalState.observations[1],id:'second-success',outcome:'seen'});
markObjectFound(removalState,'NGC224');unmarkObjectFound(removalState,'NGC6503');
assert(!foundIds(removalState).has('NGC6503'));assert(foundIds(removalState).has('NGC224'));
assert.deepEqual(removalState.lists,state.lists);assert.equal(removalState.observations.length,4);
assert.equal(removalState.observations[0].excludedFromFound,undefined);
assert.equal(removalState.observations[1].note,originalRecords[1].note);
saveState(removalState,storage);const reloaded=loadState(storage);assert(!foundIds(reloaded).has('NGC6503'));
assert.equal(reloaded.observations.length,4);assert.equal(reloaded.observations[1].outcome,'averted');
assert.equal(markObjectFound(reloaded,'NGC6503').created,false);assert(foundIds(reloaded).has('NGC6503'));assert.equal(reloaded.observations.length,4);
unmarkObjectFound(reloaded,'NGC6503');unmarkObjectFound(reloaded,'NGC6503');assert(!foundIds(reloaded).has('NGC6503'));
console.log('PASS: removing found status across multiple records, preserved notes/lists, persistence, idempotence and re-marking without duplicates.');
