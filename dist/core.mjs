export const TYPES = {galaxy:'Галактики',open:'Рассеянные скопления',globular:'Шаровые скопления',planetary:'Планетарные туманности',emission:'Эмиссионные туманности',reflection:'Отражательные туманности',dark:'Тёмные туманности',snr:'Остатки сверхновых',quasar:'Квазары',special:'Необычные объекты'};
export const groupForType=type=>['planetary','emission','reflection','dark','snr'].includes(type)?'nebula':['open','globular'].includes(type)?'clusters':['special','quasar'].includes(type)?'special':type==='galaxy'?'galaxy':'all';
export function parseCoordinate(value,min,max){
  const text=String(value??'').trim().replace(/−/g,'-').replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return NaN;
  const number=Number(text);
  return Number.isFinite(number)&&number>=min&&number<=max?number:NaN;
}
export const starLabel=name=>String(name||'').replace(/^(\d*)\s*(Alp|Bet|Gam|Del|Eps|Zet|Eta|The|Iot|Kap|Lam|Mu|Nu|Xi|Omi|Pi|Rho|Sig|Tau|Ups|Phi|Chi|Psi|Ome)(\d*)\s+([A-Za-z]{3})$/,(_,n,g,k,c)=>({Alp:'α',Bet:'β',Gam:'γ',Del:'δ',Eps:'ε',Zet:'ζ',Eta:'η',The:'θ',Iot:'ι',Kap:'κ',Lam:'λ',Mu:'μ',Nu:'ν',Xi:'ξ',Omi:'ο',Pi:'π',Rho:'ρ',Sig:'σ',Tau:'τ',Ups:'υ',Phi:'φ',Chi:'χ',Psi:'ψ',Ome:'ω'}[g])+k+' '+c);
export const TYPE_SINGLE = {galaxy:'Галактика',open:'Рассеянное скопление',globular:'Шаровое скопление',planetary:'Планетарная туманность',emission:'Эмиссионная туманность',reflection:'Отражательная туманность',dark:'Тёмная туманность',snr:'Остаток сверхновой',quasar:'Квазар',special:'Необычный объект'};
export const DEFAULT_SETTINGS = {place:'Место наблюдений',latitude:56,longitude:37.6,utcOffset:3,locationConfirmed:false,aperture:150,focalLength:750,eyepiece:25,afov:50,finderFov:6,finderMagnitude:7, sqm:21.35,sqmMode:'reference',transparency:3,filter:'none',rotation:0,mirror:false,nightMode:false,eyepieces:[],activeEyepieceId:''};
export const STORAGE_KEY = 'deepsky-observer-v1';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const uid=()=>globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
export const normal=s=>String(s??'').toUpperCase().replace(/[\s\-]/g,'');
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function freshState(){return {schemaVersion:1,settings:{...DEFAULT_SETTINGS,eyepieces:[{id:"default-eyepiece",name:"Основной",focalLength:25,afov:50}],activeEyepieceId:"default-eyepiece"},lists:[],observations:[]};}
const finite=(x,a,b,f)=>Number.isFinite(Number(x))&&Number(x)>=a&&Number(x)<=b?Number(x):f;
export function cleanState(raw){
  if(!raw || raw.schemaVersion!==1 || !Array.isArray(raw.lists)||!Array.isArray(raw.observations)) throw new Error('Неподдерживаемый формат резервной копии.');
  const s={...DEFAULT_SETTINGS};
  for(const key of Object.keys(s)) if(Object.prototype.hasOwnProperty.call(raw.settings || {},key)) s[key]=raw.settings[key];
  for(const [k,a,b] of [['latitude',-90,90],['longitude',-180,180],['utcOffset',-12,14],['aperture',20,2000],['focalLength',50,20000],['eyepiece',1,100],['afov',20,120],['finderFov',.3,20],['finderMagnitude',3,12],['sqm',16,22.5],['transparency',1,5],['rotation',0,360]])s[k]=finite(s[k],a,b,DEFAULT_SETTINGS[k]);
  for(const k of ['locationConfirmed','mirror','nightMode'])s[k]=s[k]===true;
  s.place=String(s.place??'Место наблюдений').slice(0,100);
  s.sqmMode=s.sqmMode==='current'?'current':'reference';
  s.filter=['none','uhc','oiii'].includes(s.filter)?s.filter:'none';
  const eyepieceIds=new Set();
  s.eyepieces=(Array.isArray(s.eyepieces)?s.eyepieces:[]).slice(0,12).filter(x=>x&&typeof x.id==='string'&&!eyepieceIds.has(x.id.slice(0,100))&&(eyepieceIds.add(x.id.slice(0,100)),true)).map(x=>({id:x.id.slice(0,100),name:String(x.name||'Окуляр').slice(0,60),focalLength:finite(x.focalLength,1,100,s.eyepiece),afov:finite(x.afov,20,120,s.afov)}));
  if(!s.eyepieces.length)s.eyepieces=[{id:'default-eyepiece',name:'Основной',focalLength:s.eyepiece,afov:s.afov}];
  if(!s.eyepieces.some(x=>x.id===s.activeEyepieceId))s.activeEyepieceId=s.eyepieces[0].id;

  const validDate=value=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const instant=Date.parse(value+'T12:00:00Z');
    return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===value;
  };
  const ids=new Set();
  const lists=raw.lists.slice(0,1000).filter(l=>l&&typeof l.id==='string'&&!ids.has(l.id.slice(0,100))&&(ids.add(l.id.slice(0,100)),true)).map(l=>({id:l.id.slice(0,100),name:String(l.name||'Без названия').slice(0,100),date:validDate(l.date)?l.date:'',notes:String(l.notes||'').slice(0,5000),objectIds:[...new Set(Array.isArray(l.objectIds)?l.objectIds.filter(x=>typeof x==='string').slice(0,5000):[])],createdAt:String(l.createdAt||new Date().toISOString()),...(Array.isArray(l.schedule)?{schedule:l.schedule.slice(0,100).filter(x=>x&&Array.isArray(l.objectIds)&&l.objectIds.includes(x.objectId)&&Number.isFinite(Date.parse(x.startAt))&&Number.isFinite(Date.parse(x.endAt))&&Date.parse(x.endAt)>Date.parse(x.startAt)).map(x=>({objectId:x.objectId,startAt:new Date(x.startAt).toISOString(),endAt:new Date(x.endAt).toISOString(),score:finite(x.score,1,5,3)}))}:{})}));
  const obsIds=new Set();
  const observations=raw.observations.slice(0,20000).filter(o=>o&&typeof o.id==='string'&&!obsIds.has(o.id.slice(0,100))&&(obsIds.add(o.id.slice(0,100)),true)&&typeof o.objectId==='string'&&['seen','averted','not_seen'].includes(o.outcome)&&Number.isFinite(Date.parse(o.observedAt))).map(o=>({id:o.id.slice(0,100),objectId:o.objectId.slice(0,100),outcome:o.outcome,observedAt:new Date(o.observedAt).toISOString(),note:String(o.note||'').slice(0,10000),aperture:finite(o.aperture,20,2000,s.aperture),sqm:finite(o.sqm,16,22.5,s.sqm),eyepiece:finite(o.eyepiece,1,100,s.eyepiece),place:String(o.place||'').slice(0,100),...(o.excludedFromFound===true?{excludedFromFound:true}:{})}));
  return {schemaVersion:1,settings:s,lists,observations};
}
export function loadState(storage=globalThis.localStorage){try{const raw=storage.getItem(STORAGE_KEY);return raw?cleanState(JSON.parse(raw)):freshState();}catch{return freshState();}}
export function saveState(state,storage=globalThis.localStorage){storage.setItem(STORAGE_KEY,JSON.stringify(state));}
export function foundIds(state){return new Set(state.observations.filter(o=>o.outcome!=='not_seen'&&!o.excludedFromFound).map(o=>o.objectId));}
export function markObjectFound(state,objectId,date=new Date()){
  const existing=state.observations.filter(o=>o.objectId===objectId&&o.outcome!=='not_seen').toSorted((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
  if(existing){for(const o of state.observations.filter(o=>o.objectId===objectId))delete o.excludedFromFound;return {observation:existing,created:false};}
  const s=state.settings,observation={id:uid(),objectId,outcome:'seen',observedAt:date.toISOString(),note:'',aperture:s.aperture,sqm:s.sqm,eyepiece:s.eyepiece,place:s.locationConfirmed?s.place:''};
  state.observations.push(observation);
  return {observation,created:true};
}
export function unmarkObjectFound(state,objectId){
  for(const observation of state.observations){if(observation.objectId===objectId&&observation.outcome!=='not_seen')observation.excludedFromFound=true;}
}
export function addToList(state,listId,objectId){const l=state.lists.find(l=>l.id===listId);if(!l)return false;if(!l.objectIds.includes(objectId))l.objectIds.push(objectId);return true;}
export function displayId(o){const m=o.aliases?.find(a=>/^M\s?\d+$/.test(a));return m?m.replace(/^M\s?/,'M '):o.name;}
export function searchMatches(o,q){return normal([o.name,o.commonName,o.specificType,o.subtitle,o.constellation,...(o.aliases||[])].join(' ')).includes(normal(q));}
export function localInput(date,offset){return new Date(date.getTime()+offset*3600000).toISOString().slice(0,16);}
export function fromLocal(value,offset){const d=new Date(value+'Z');return new Date(d.getTime()-offset*3600000);}
export function formatDate(date,offset=3,withTime=true){return new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(new Date(date).getTime()+offset*3600000));}
export function formatTime(date,offset=3){return new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}).format(new Date(new Date(date).getTime()+offset*3600000));}
export function offsetLabel(n){return 'UTC'+(n>=0?'+':'')+n;}
export function distance(a,b){const r=Math.PI/180,d1=a.dec*r,d2=b.dec*r;return Math.acos(clamp(Math.sin(d1)*Math.sin(d2)+Math.cos(d1)*Math.cos(d2)*Math.cos((a.ra-b.ra)*r),-1,1))/r;}
export function bearing(a,b){const r=Math.PI/180,dl=(b.ra-a.ra)*r;return (Math.atan2(Math.sin(dl)*Math.cos(b.dec*r),Math.cos(a.dec*r)*Math.sin(b.dec*r)-Math.sin(a.dec*r)*Math.cos(b.dec*r)*Math.cos(dl))/r+360)%360;}
const astroCache=new Map();
function ctx(A,date,s){const key=[date.getTime(),s.latitude,s.longitude].join(',');if(astroCache.has(key))return astroCache.get(key);const v={observer:new A.Observer(s.latitude,s.longitude,0),rotation:A.Rotation_EQJ_EQD(date)};if(astroCache.size>150)astroCache.clear();astroCache.set(key,v);return v;}
export function horizontal(A,o,date,s){const c=ctx(A,date,s),vec=A.VectorFromSphere(new A.Spherical(o.dec,o.ra,1),date),eq=A.EquatorFromVector(A.RotateVector(c.rotation,vec));return A.Horizon(date,c.observer,eq.ra,eq.dec,'normal');}
export function skyContext(A,date,s){const observer=new A.Observer(s.latitude,s.longitude,0);const se=A.Equator('Sun',date,observer,true,true),me=A.Equator('Moon',date,observer,true,true),moonVector=A.EquatorFromVector(A.GeoMoon(date));return {sun:A.Horizon(date,observer,se.ra,se.dec,'normal'),moon:A.Horizon(date,observer,me.ra,me.dec,'normal'),moonIllumination:A.Illumination('Moon',date).phase_fraction,moonJ2000:{ra:moonVector.ra*15,dec:moonVector.dec}};}
export function skyLabel(alt){return alt< -18?'Астрономическая ночь':alt< -12?'Астрономические сумерки':alt< -6?'Навигационные сумерки':alt<0?'Гражданские сумерки':'Дневное небо';}
export const FILTER_NAMES={none:'Без фильтра',uhc:'UHC',oiii:'O III'};
// Editorial baseline for 150 mm, SQM 21.35, transparent moonless sky, high altitude.
// The numbers are our conservative ordinal estimates, NOT published filter ratings.
const NEBULA_PROFILES={
 NGC7023:[[4,5,5],'none','Ирис — отражательная туманность. Свет звезды и газовое свечение различаются; узкополосные фильтры обычно мешают.'],
 NGC604:[[4,3,3],'uhc','Область H II внутри M33: ищи компактный узел, а не всю галактику. UHC или O III могут выделить газ.'],
 NGC1491:[[4,3,3],'uhc','Видна прежде всего компактная яркая часть. UHC или O III повышают контраст газа; внешние области труднее.'],
 NGC1788:[[4,5,5],'none','Отражательная туманность: яркость звёзд в области не делает газ лёгкой целью. Узкая полоса обычно мешает.'],
 NGC2174:[[4,3,3],'uhc','Диффузный газ требует тёмного неба. UHC или O III могут выделить светлые области.'],
 NGC2359:[[5,4,3],'oiii','Главное свечение Шлема Тора легче тонких дуг. O III полезен; объект остаётся требовательным к небу.'],
 NGC7635:[[5,4,4],'uhc','Оценивается слабая туманность Пузырь, а не звезда. Не ожидай замкнутую фотографическую оболочку в 150 мм.'],
 NGC7293:[[4,3,2],'oiii','Улитка большая и слабоконтрастная: нужны широкое поле и тёмное небо. O III помогает.'],
 NGC1952:[[3,3,3],'uhc','Фильтр может улучшить контраст, но не гарантирует тонких волокон.'],
 NGC6523:[[2,1,2],'uhc','Яркая часть Лагуны доступна без фильтра; UHC помогает выделить газ.'],
 NGC6611:[[4,3,3],'uhc','Звёздное скопление видно легче, чем окружающую туманность. Оценка относится к газу.'],
 NGC6618:[[2,1,1],'oiii','Яркая часть видна без фильтра; UHC и O III улучшают контраст.'],
 NGC6514:[[3,2,3],'uhc','UHC помогает эмиссионной части. Отражательная часть в узкой полосе слабеет.'],
 NGC6853:[[2,1,2],'uhc','Гантель можно найти без фильтра; UHC помогает различить слабое окружение.'],
 NGC1976:[[1,1,1],'uhc','Яркая сердцевина Ориона видна без фильтра. Фильтр меняет контраст деталей.'],
 NGC1982:[[3,2,4],'hbeta','O III подходит хуже: важна водородная эмиссия. UHC полезнее из выбранных фильтров.'],
 NGC6720:[[2,2,2],'oiii','Кольцо доступно без фильтра; фильтр полезен для контраста, а не обязателен для поиска.'],
 NGC650:[[4,3,3],'oiii','UHC или O III помогают выделить слабую оболочку.'],
 NGC3587:[[4,3,3],'oiii','Без фильтра слабоконтрастная; с O III проще отделить диск от фона.'],
 NGC281:[[4,3,3],'uhc','Для газовой туманности UHC или O III настоятельно рекомендуется.'],
 NGC2237:[[5,3,3],'uhc','Оценивается газ Розетки, а не яркое скопление в центре. Нужны малое увеличение и тёмное небо.'],
 NGC6888:[[5,4,3],'oiii','Без фильтра очень трудно; O III особенно полезен для оболочки.'],
 NGC6960:[[5,3,2],'oiii','O III резко повышает контраст нитей Вуали. Без него не считай объект простой целью.'],
 NGC6992:[[4,3,2],'oiii','Восточная Вуаль лучше выделяется с O III; тёмное небо всё равно необходимо.'],
 NGC7000:[[4,3,2],'oiii','Без фильтра трудно. Смотри яркую часть у «Мексиканского залива»: весь объект может не влезть в поле.'],
 IC1805:[[5,4,4],'uhc','Скопление в центре не равно видимости газа. Для Сердца фильтр рекомендуется; оценка особенно приблизительная.'],
 IC1848:[[5,4,4],'uhc','Газ слабоконтрастный: UHC полезен, но не делает туманность лёгкой.'],
 IC410:[[5,3,3],'uhc','Оценивается туманность, а не центральное скопление; UHC или O III помогают.'],
 IC405:[[5,4,5],'hbeta','Смешанная туманность. Hβ предпочтительнее для эмиссии; O III малоэффективен.'],
 NGC1499:[[5,4,5],'hbeta','Предпочтителен Hβ. O III не заменяет его; нужно большое поле и тёмное небо.'],
 B33:[[5,5,5],'hbeta','Конская Голова — предельная цель для 150 мм. Предпочтителен Hβ; O III не подходит.'],
 IC1396:[[5,4,5],'uhc','Очень слабый большой комплекс. UHC может помочь; не ожидай фотографического контура.'],
 IC5146:[[5,4,5],'hbeta','Для слабой газовой части предпочтителен Hβ; O III может мешать.'],
 NGC2024:[[4,4,5],'none','Мешает Альнитак. Узкополосный фильтр не даёт универсального выигрыша.'],
 NGC2264:[[5,4,5],'hbeta','Звёзды Ёлки видны намного легче газовой туманности и Конуса. Оценка относится к газу.'],
 NGC1931:[[4,3,4],'uhc','Газ и отражённый свет смешаны; польза фильтра зависит от выбранной детали.'],
 NGC1977:[[4,4,5],'none','Заметна отражательная составляющая; узкая полоса не обязана помогать.']
};
export function observingProfile(o){const p=NEBULA_PROFILES[o.id];return p?{scores:{none:p[0][0],uhc:p[0][1],oiii:p[0][2]},preferred:p[1],note:p[2]}:null;}
export function filterAdvice(o,s){
 const p=observingProfile(o),relevant=['emission','planetary','snr','reflection','dark'].includes(o.type);
 if(!relevant)return null;
 let hint,kind='neutral';
 if(p){
   if(s.filter==='none'){if(p.scores.none<=2)hint='Фильтр необязателен';else{hint=p.preferred==='hbeta'?'Предпочтителен Hβ':p.preferred==='none'?'Лучше без узкой полосы':'Рекомендуется '+FILTER_NAMES[p.preferred];kind=p.scores.none>=4?'needed':'neutral';}}
   else if(p.scores[s.filter]>p.scores.none){hint=FILTER_NAMES[s.filter]+' может мешать';kind='needed';}
   else if(p.preferred==='hbeta'){hint='Предпочтителен Hβ';kind='needed';}
   else{hint=FILTER_NAMES[s.filter]+(p.scores[s.filter]<p.scores.none?' повышает контраст':' · для контраста');kind='helpful';}
   return {hint,kind,note:p.note,preferred:p.preferred};
 }
 if(o.type==='reflection'||o.type==='dark')return {hint:'Без узкополосного фильтра',kind:s.filter==='none'?'neutral':'needed',note:'Узкая полоса обычно не помогает отражательному свету или тёмному облаку.'};
 return {hint:s.filter==='none'?'UHC / O III могут помочь':FILTER_NAMES[s.filter]+' · эффект зависит от объекта',kind:s.filter==='none'?'needed':'neutral',note:'Точного наблюдательного профиля пока нет; эффект зависит от спектра, полосы фильтра и выбранной детали.'};
}
export function difficulty(o,s,h,sky){
  const profile=observingProfile(o),advice=filterAdvice(o,s);
  if(!profile&&(o.magnitude==null || !Number.isFinite(o.magnitude)))return {score:null,label:'Мало данных',reasons:['Недостаточно фотометрических данных'],confidence:'недостаточная'};
  const point=['quasar','special'].includes(o.type),area=Math.max(1,(o.major||1)*(o.minor||o.major||1));
  const skyPenalty=Math.max(0,21.35-s.sqm)*.85;
  let penalty=skyPenalty+(3-s.transparency)*.35;
  const reasons=[];
  if(o.id==='NGC404'){penalty+=.8;reasons.push('Близкий Мирах мешает рассеянным светом: попробуй вывести звезду за край поля');}
  if(skyPenalty>.6)reasons.push('Засветка снижает контраст');
  if(h.altitude<30){penalty+=clamp((30-h.altitude)/30,0,1.4)*.9;reasons.push(h.altitude<0?'Сейчас под горизонтом':'Низко над горизонтом');}
  if(s.sqmMode==='reference'){
    if(sky.moon.altitude>0 && sky.moonIllumination>.15){const sep=distance(o,sky.moonJ2000),p=sky.moonIllumination*Math.sqrt(Math.max(0,sky.moon.altitude)/90)*Math.exp(-sep/100)*(point?.8:1.7);penalty+=p;if(p>.25)reasons.push('Мешает лунная засветка');}
    if(sky.sun.altitude> -18){penalty+=clamp((sky.sun.altitude+18)/6,0,4)*(point?.5:1);reasons.push('Небо ещё не полностью тёмное');}
  }
  const pupil=s.aperture*s.eyepiece/s.focalLength;
  if(pupil>7){penalty+=5*Math.log10(pupil/7);reasons.push('Выходной зрачок больше 7 мм');}
  if(!point&&pupil<.7){penalty+=.8;reasons.push('Малый выходной зрачок затемняет протяжённый объект');}
  if(profile){
    const score=clamp(Math.round(profile.scores[s.filter]-.8*Math.log2(s.aperture/150)+penalty*.8),1,5);
    reasons.unshift(profile.note);
    if(s.filter!=='none')reasons.push('Выбран '+FILTER_NAMES[s.filter]+': учтена пригодность именно для этого объекта');
    else if(profile.scores.none>=4)reasons.push('Без подходящего фильтра не относится к простым целям');
    return {score,label:['','Легко','Доступно','Средне','Сложно','Очень сложно'][score],reasons,confidence:'ориентировочная, по наблюдательному профилю',filterHint:advice?.hint};
  }
  const apertureGain=5*Math.log10(s.aperture/150);
  let effective=o.magnitude;
  if(!point){effective+=Math.log10(Math.max(1,area/10))*.7;penalty+=({galaxy:.7,globular:.3,open:0,planetary:.1,emission:1.1,reflection:1.4,dark:2,snr:1.1}[o.type]??.5);}
  if(['emission','planetary','snr'].includes(o.type)&&s.filter!=='none'){penalty-=s.filter==='uhc'?.8:(o.type==='emission'?.5:1.1);reasons.push('Приблизительно учтён контраст с '+FILTER_NAMES[s.filter]+'; индивидуального профиля пока нет');}
  if(o.type==='reflection'&&s.filter!=='none'){penalty+=.5;reasons.push('Узкополосный фильтр может мешать');}
  if(o.magBand==='V'&&o.major&&o.minor&&['galaxy','emission','reflection','snr'].includes(o.type)){
    const meanV=o.magnitude+2.5*Math.log10(Math.PI/4*o.major*o.minor*3600);
    if(meanV-s.sqm>1){penalty+=Math.min(3,(meanV-s.sqm-1)*1.2);reasons.push('Низкая оценочная средняя яркость протяжённого объекта');}
  }
  const raw=1+(effective-7.4-apertureGain+penalty)/1.5;
  let score=clamp(Math.round(raw),1,5);
  if(['emission','reflection','snr'].includes(o.type)&&area>1000){const floor=(s.filter==='none'||o.type==='reflection'?4:3)-Math.log2(s.aperture/150)+(21.35-s.sqm)*.6;score=Math.max(score,clamp(Math.round(floor),1,5));reasons.push('Большая слабоконтрастная область: суммарная величина малоинформативна');}
  if(area>100&&['galaxy','emission','reflection','snr'].includes(o.type))reasons.push('Протяжённый объект: важен контраст');
  if(s.transparency<3)reasons.push('Низкая прозрачность');
  if(!reasons.length)reasons.push('Предварительная оценка для выбранных условий');
  return {score,label:['','Легко','Доступно','Средне','Сложно','Очень сложно'][score],reasons,confidence:o.magBand==='V'?'приблизительная':'низкая'};
}
export function isRecommended(o,s,h,sky,d=difficulty(o,s,h,sky)){return d.score!=null&&d.score<=3&&h.altitude>=20&&sky.sun.altitude<(['special','quasar','open','globular','planetary'].includes(o.type)?-12:-18);}
export function visibility(h,sky){if(h.altitude<0)return {kind:'below',text:'Под горизонтом'};if(sky.sun.altitude>= -6)return {kind:'day',text:'Светлое небо'};if(h.altitude<20)return {kind:'low',text:'Низко над горизонтом'};if(sky.sun.altitude> -18)return {kind:'twilight',text:'Сумерки'};return {kind:'good',text:'Высота подходит'};}
export function seriesFor(A,o,date,s){const start=new Date(date.getTime()-4*3600000);return Array.from({length:49},(_,i)=>{const t=new Date(start.getTime()+i*15*60000),h=horizontal(A,o,t,s);const se=A.Equator('Sun',t,new A.Observer(s.latitude,s.longitude,0),true,true);const sun=A.Horizon(t,new A.Observer(s.latitude,s.longitude,0),se.ra,se.dec,'normal').altitude;return {date:t,alt:h.altitude,sun};});}
export function makeRoute(o,stars,s){
  const candidates=stars.filter(x=>x[2]<=4.5).map(x=>({ra:x[0],dec:x[1],mag:x[2],name:starLabel(x[3])||('HIP '+x[4]),hip:x[4]}));
  candidates.sort((a,b)=>(distance(a,o)+Math.max(0,a.mag-3)*1.5)-(distance(b,o)+Math.max(0,b.mag-3)*1.5));
  const anchor=candidates[0];if(!anchor)return {points:[{...o,name:displayId(o),target:true}],verified:false};
  const span=distance(anchor,o),maxLeg=s.finderFov*.8;
  let mid=stars.filter(x=>x[2]<=s.finderMagnitude).map(x=>({ra:x[0],dec:x[1],mag:x[2],name:starLabel(x[3])||('HIP '+x[4]),hip:x[4]})).filter(x=>x.hip!==anchor.hip&&distance(anchor,x)+distance(x,o)<span+maxLeg*1.7).sort((a,b)=>a.mag-b.mag).slice(0,160);
  const nodes=[anchor,...mid,{...o,name:displayId(o),target:true}],end=nodes.length-1,dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),used=new Set();dist[0]=0;
  for(let k=0;k<nodes.length;k++){let u=-1,best=Infinity;for(let j=0;j<nodes.length;j++)if(!used.has(j)&&dist[j]<best){u=j;best=dist[j];}if(u<0||u===end)break;used.add(u);for(let v=1;v<nodes.length;v++){if(used.has(v))continue;const d=distance(nodes[u],nodes[v]);if(d>maxLeg)continue;const cost=d+1.1+Math.max(0,(nodes[v].mag||4)-3)*.5;if(dist[u]+cost<dist[v]){dist[v]=dist[u]+cost;prev[v]=u;}}}
  if(!Number.isFinite(dist[end]))return {points:[anchor,nodes[end]],verified:false,longLeg:true};
  const path=[];for(let p=end;p>=0;p=prev[p])path.push(nodes[p]);return {points:path.reverse(),verified:false,longLeg:false};
}
