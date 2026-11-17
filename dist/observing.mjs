import {clamp,difficulty,horizontal,skyContext,groupForType,distance} from './core.mjs?v=59d02c126dc7cb25';

export function eyepieceGeometry(settings,eyepiece){
  const magnification=settings.focalLength/eyepiece.focalLength;
  return {magnification,exitPupil:settings.aperture/magnification,trueFov:eyepiece.afov/magnification};
}
export function activeEyepiece(settings){
  return settings.eyepieces?.find(x=>x.id===settings.activeEyepieceId)||{id:'current',name:'Текущий окуляр',focalLength:settings.eyepiece,afov:settings.afov};
}
export function planNight(A,catalog,settings,options={},found=new Set()){
  const start=new Date(options.start),duration=clamp(Number(options.duration)||120,30,480),minutes=clamp(Number(options.minutesPerTarget)||20,10,60);
  if(!Number.isFinite(start.getTime()))throw new Error('Укажи дату и время начала.');
  const maxScore=clamp(Number(options.maxScore)||3,1,5),minAltitude=clamp(Number(options.minAltitude)||25,10,70),wanted=options.group||'all';
  const end=new Date(start.getTime()+duration*60000),slots=[],used=new Set(),contexts=new Map(),cache=new Map();
  const candidates=catalog.filter(o=>(options.includeFound||!found.has(o.id))&&(wanted==='all'||groupForType(o.type)===wanted));
  const sample=(o,date)=>{
    const key=date.getTime();let sky=contexts.get(key);if(!sky){sky=skyContext(A,date,settings);contexts.set(key,sky);}
    const objectKey=o.id+':'+key;if(cache.has(objectKey))return cache.get(objectKey);
    const h=horizontal(A,o,date,settings),d=difficulty(o,settings,h,sky),limit=['special','quasar','open','globular','planetary'].includes(o.type)?-12:-18;
    const result={altitude:h.altitude,score:d.score,valid:h.altitude>=minAltitude&&sky.sun.altitude<limit&&d.score!=null&&d.score<=maxScore};cache.set(objectKey,result);return result;
  };
  let previous=null;
  for(let ms=start.getTime();ms+minutes*60000<=end.getTime();){
    const dates=[0,.5,1].map(f=>new Date(ms+minutes*60000*f));
    const choices=[];
    for(const o of candidates){
      if(used.has(o.id))continue;
      const samples=dates.map(d=>sample(o,d));if(!samples.every(s=>s.valid))continue;
      let remaining=0;
      for(let later=ms+minutes*60000;later<=end.getTime();later+=10*60000){if(!sample(o,new Date(later)).valid)break;remaining+=10;}
      const mid=samples[1],urgency=remaining<40?30-remaining*.5:0,travel=previous?distance(previous,o)/90:0;
      choices.push({object:o,samples,rank:urgency+(6-mid.score)*3+mid.altitude/15-travel});
    }
    choices.sort((a,b)=>b.rank-a.rank||a.object.id.localeCompare(b.object.id));
    if(!choices.length){ms+=10*60000;continue;}
    const choice=choices[0],o=choice.object;
    slots.push({objectId:o.id,startAt:new Date(ms).toISOString(),endAt:new Date(ms+minutes*60000).toISOString(),score:Math.max(...choice.samples.map(s=>s.score)),altitude:choice.samples[1].altitude});
    used.add(o.id);previous=o;ms+=minutes*60000;
  }
  return {startAt:start.toISOString(),endAt:end.toISOString(),duration,minutesPerTarget:minutes,minAltitude,maxScore,group:wanted,includeFound:!!options.includeFound,slots};
}
