import {indexStarTiles,tilesInView} from './planetarium-stars.mjs?v=59d02c126dc7cb25';
import {objectFootprint,createObjectRenderer} from './planetarium-objects.mjs?v=59d02c126dc7cb25';
import {planetariumMarkup,targetMarkup} from './planetarium-view.mjs?v=59d02c126dc7cb25';
import {createSkyTimePicker} from './sky-time-picker.mjs?v=59d02c126dc7cb25';
import {equatorial,horizon,angles,transform,equatorialToLocal,camera,validatedCamera,screenPoint,dragCamera,separation,rotationBetween,calibrateCamera,blendCameras,groundPolygon,clamp,wrap,dot,detailLimits,showCatalogObject} from './planetarium-math.mjs?v=59d02c126dc7cb25';
import {Capacitor,SkyOrientation,SkyCamera} from './vendor/native-bridge.mjs?v=59d02c126dc7cb25';
import {displayId,searchMatches,normal,starLabel,TYPE_SINGLE,escapeHtml as e,localInput,fromLocal,formatTime,offsetLabel} from './core.mjs?v=59d02c126dc7cb25';

const NAMES={Vega:'Вега',Deneb:'Денеб',Altair:'Альтаир',Polaris:'Полярная',Arcturus:'Арктур',Capella:'Капелла',Mirach:'Мирах',Alpheratz:'Альферац',Almach:'Альмак',Dubhe:'Дубхе',Merak:'Мерак',Alioth:'Алиот',Mizar:'Мицар',Alkaid:'Алькаид',Betelgeuse:'Бетельгейзе',Rigel:'Ригель',Aldebaran:'Альдебаран',Sirius:'Сириус',Procyon:'Процион',Regulus:'Регул',Spica:'Спика',Antares:'Антарес',Fomalhaut:'Фомальгаут',Castor:'Кастор',Pollux:'Поллукс',Mirfak:'Мирфак',Algol:'Алголь',Caph:'Каф',Enif:'Эниф',Menkalinan:'Менкалинан',Schedar:'Шедар',Algenib:'Альгениб'};
const BODIES=[['Moon','Луна','#eee8cd'],['Mercury','Меркурий','#b2a295'],['Venus','Венера','#fff1ca'],['Mars','Марс','#e99d7b'],['Jupiter','Юпитер','#e9d4ac'],['Saturn','Сатурн','#d6c795'],['Uranus','Уран','#a6d7d7'],['Neptune','Нептун','#98b5ec']];
const deg=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:v<1?2:1})+'°';

export function createPlanetarium(get){
 let live=null,lastView={azimuth:180,altitude:35,fov:85},lastTarget=null;
 function open(id=null){
  dispose();const c=get(),s=c.state.settings;
  const page=c.mountSky(planetariumMarkup(c.icon,s,Capacitor.isPluginAvailable('SkyCamera')));
  const el=page.querySelector('.planetarium'),canvas=el.querySelector('canvas'),context=canvas.getContext('2d',{alpha:false});
  if(!context){c.toast('Не удалось открыть графику карты.');return;}
  const allStars=c.stars.map((star,i)=>({kind:'star',id:'star-'+(star[5]||star[4]||i),label:star[3]?(NAMES[star[3]]||starLabel(star[3])):'',aliases:star[3]||'',mag:star[2],eq:equatorial(star[0],star[1]),named:!!star[3],star}));
  const deep=c.catalog.map(o=>({kind:'dso',id:o.id,label:displayId(o),subtitle:o.specificType||TYPE_SINGLE[o.type],mag:o.magnitude??12,eq:equatorial(o.ra,o.dec),object:o}));
  live={el,canvas,context,allStars,deep,solar:[],labels:[],stars:[],targets:[],hits:[],matrix:null,width:0,height:0,fov:lastView.fov,azimuth:lastView.azimuth,altitude:lastView.altitude,view:camera(lastView.azimuth,lastView.altitude),layers:{constellations:true,names:true,objects:true,grid:false,ground:true,atmosphere:false},target:null,sensor:false,starting:false,sensorView:null,calibration:null,calibrating:false,accuracy:null,headingError:null,sampleAt:0,sensorStartedAt:0,covered:false,timePicker:null,feedbackTimer:null,cameraTween:null,fovGoal:lastView.fov,lastFrame:0,frame:0,dirty:true,liveTime:true,date:new Date(),lastTick:0,lastSolar:0,disposers:[],pointer:new Map(),gesture:false};
  const l=live;l.starTiles=indexStarTiles(allStars);l.namedStars=allStars.filter(star=>star.named);l.skyRevision=0;l.drawObject=createObjectRenderer();
  const on=(node,type,handler,options)=>{node.addEventListener(type,handler,options);l.disposers.push(()=>node.removeEventListener(type,handler,options));};
  const byId=id=>el.querySelector('#'+id);
  on(byId('pl-search-toggle'),'click',()=>toggleSearch());on(byId('pl-search-close'),'click',()=>toggleSearch(false));
  on(byId('pl-search'),'input',search);on(byId('pl-search'),'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();handleBack();}if(event.key==='Enter'){event.preventDefault();byId('pl-results').querySelector('button')?.click();}});
  on(byId('pl-search-clear'),'click',()=>{if(l.target)clearTarget();else{byId('pl-search').value='';search();}byId('pl-search').focus();});
  on(byId('pl-results'),'click',event=>{const b=event.target.closest('[data-result]');if(!b)return;selectTarget(findTarget(b.dataset.result),!l.sensor);byId('pl-results').hidden=true;toggleSearch(false);});
  const cameraButton=byId('pl-camera');if(cameraButton)on(cameraButton,'click',openSkyCamera);
  on(byId('pl-orientation'),'click',()=>l.sensor||l.starting?stopOrientation():startOrientation());
  on(byId('pl-date-trigger'),'click',openTimePicker);
  on(byId('pl-now'),'click',()=>{l.liveTime=true;l.lastTick=0;byId('pl-now').classList.add('active');byId('pl-now').setAttribute('aria-pressed','true');updateSky();});
  on(byId('pl-options'),'click',()=>toggleLayers());
  on(byId('pl-close-layers'),'click',()=>toggleLayers(false));
  on(byId('pl-location'),'click',()=>c.settingsModal());
  on(byId('pl-layers'),'change',event=>{if(event.target.dataset.layer){l.layers[event.target.dataset.layer]=event.target.checked;l.dirty=true;}});
  on(byId('pl-open-settings'),'click',()=>c.settingsModal());
  on(byId('pl-zoom-in'),'click',()=>zoom(.8));on(byId('pl-zoom-out'),'click',()=>zoom(1.25));
  on(byId('pl-selection'),'click',event=>{const action=event.target.closest('[data-sky-action]')?.dataset.skyAction;if(action==='center'){if(l.sensor)stopOrientation();centerTarget();}if(action==='details'&&l.target?.object)c.openObject(l.target.id,l.date);if(action==='clear')clearTarget();if(action==='calibrate')calibrationPrompt();if(action==='camera')openSkyCamera();});
  on(byId('pl-calibration'),'click',event=>{const b=event.target.closest('[data-calibrate]');if(!b)return;if(b.dataset.calibrate==='cancel'){l.calibrating=false;byId('pl-calibration').hidden=true;return;}if(b.dataset.calibrate==='confirm'){if(!l.sensorView||!l.target)return;l.calibration=rotationBetween(l.sensorView.forward,l.target.local);l.calibrating=false;byId('pl-calibration').hidden=true;l.dirty=true;feedback('Привязка применена. Она уточняет местный участок неба; при уходе далеко проверь по другой звезде.');}else{selectTarget(findTarget(b.dataset.calibrate),false);calibrationPrompt(true);}});
  on(canvas,'pointerdown',event=>{l.cameraTween=null;canvas.setPointerCapture(event.pointerId);l.pointer.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});if(l.pointer.size>1)l.gesture=true;});
  on(canvas,'pointermove',event=>{const previous=l.pointer.get(event.pointerId);if(!previous)return;const old=[...l.pointer.values()],oldDistance=old.length===2?Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y):0;const dx=event.clientX-previous.x,dy=event.clientY-previous.y;previous.x=event.clientX;previous.y=event.clientY;const points=[...l.pointer.values()];if(points.length===2){const next=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);if(next>5&&oldDistance>5)zoom(oldDistance/next);return;}if(Math.hypot(event.clientX-previous.startX,event.clientY-previous.startY)>5){l.gesture=true;if(l.sensor||l.starting)stopOrientation();const rect=canvas.getBoundingClientRect();l.view=dragCamera(l.view,{x:event.clientX-dx-rect.left,y:event.clientY-dy-rect.top},{x:event.clientX-rect.left,y:event.clientY-rect.top},l.width,l.height,l.fov);const aim=angles(l.view.forward);l.azimuth=aim.azimuth;l.altitude=aim.altitude;l.dirty=true;}});
  on(canvas,'pointerup',event=>{const point=l.pointer.get(event.pointerId);if(point&&!l.gesture){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=l.hits.map(h=>({...h,d:Math.hypot(h.x-x,h.y-y)})).filter(h=>h.d<22).sort((a,b)=>a.d-b.d)[0];if(hit)selectTarget(hit.target,false);}l.pointer.delete(event.pointerId);if(!l.pointer.size)l.gesture=false;});
  on(canvas,'pointercancel',event=>{l.pointer.delete(event.pointerId);l.gesture=true;});
  on(canvas,'wheel',event=>{event.preventDefault();zoom(Math.exp(event.deltaY*.0015));},{passive:false});
  on(canvas,'keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(event.key)){event.preventDefault();if(l.sensor)stopOrientation();if(event.key==='Home'){l.azimuth=180;l.altitude=35;l.fov=85;l.fovGoal=85;}else if(['+','='].includes(event.key))zoom(.8);else if(event.key==='-')zoom(1.25);else{const delta=l.fov*.1;if(event.key==='ArrowLeft')l.azimuth-=delta;if(event.key==='ArrowRight')l.azimuth+=delta;if(event.key==='ArrowUp')l.altitude+=delta;if(event.key==='ArrowDown')l.altitude-=delta;}l.azimuth=wrap(l.azimuth);l.altitude=clamp(l.altitude,-89.5,89.5);l.view=camera(l.azimuth,l.altitude);l.dirty=true;}});
  on(document,'visibilitychange',()=>{if(document.hidden&&(l.sensor||l.starting)){stopOrientation(false);feedback('Ориентация остановлена при сворачивании. Нажми «Навести телефон», чтобы включить снова.');}else{l.lastTick=0;l.dirty=true;}});
  mountSelectionSwipe(on);
  l.resize=new ResizeObserver(()=>resize());l.resize.observe(el.querySelector('.pl-viewport'));resize();updateSky();
  const targetId=id||lastTarget;if(targetId)selectTarget(findTarget(targetId),true);
  if(Capacitor.isNativePlatform())SkyOrientation.keepAwake({enabled:true}).catch(()=>{});
  l.frame=requestAnimationFrame(animate);
 }
 function findTarget(id){if(!live)return null;const target=[...live.deep,...live.solar,...live.allStars].find(o=>o.id===id)||null;if(target?.kind==='star')target.local=transform(live.matrix,target.eq);return target;}
 function feedback(text){const l=live;if(!l)return;const box=l.el.querySelector('#pl-feedback');box.textContent=text;box.hidden=false;clearTimeout(l.feedbackTimer);l.feedbackTimer=setTimeout(()=>{box.hidden=true;},6500);}
 function resize(){const l=live;if(!l)return;const rect=l.canvas.parentElement.getBoundingClientRect();l.width=rect.width;l.height=rect.height;const dpr=Math.min(devicePixelRatio||1,2);l.canvas.width=Math.round(l.width*dpr);l.canvas.height=Math.round(l.height*dpr);l.context.setTransform(dpr,0,0,dpr,0,0);l.dirty=true;}
 function updateSky(){
  const l=live;if(!l)return;const c=get(),s=c.state.settings;if(l.liveTime)l.date=new Date();
  l.matrix=equatorialToLocal(c.A,l.date,s);
  l.skyRevision++;for(const star of l.target?.kind==='star'&&!l.target.named?[...l.namedStars,l.target]:l.namedStars){star.local=transform(l.matrix,star.eq);star.revision=l.skyRevision;}
  for(const o of l.deep)o.local=transform(l.matrix,o.eq);
  const observer=new c.A.Observer(s.latitude,s.longitude,0);
  l.solar=BODIES.map(([body,label,color])=>{const eq=c.A.Equator(body,l.date,observer,false,true),v=equatorial(eq.ra*15,eq.dec);return {id:body,kind:'solar',label,color,mag:c.A.Illumination(body,l.date).mag,eq:v,local:transform(l.matrix,v),body};});
  const sun=c.A.Equator('Sun',l.date,observer,false,true);l.sun=transform(l.matrix,equatorial(sun.ra*15,sun.dec));l.sunAltitude=angles(l.sun).altitude;
  if(l.target?.kind==='solar')l.target=findTarget(l.target.id);
  const local=localInput(l.date,s.utcOffset);l.el.querySelector('#pl-time-label').textContent=local.slice(8,10)+'.'+local.slice(5,7)+'.'+local.slice(0,4)+' · '+local.slice(11,16);l.el.querySelector('#pl-date-trigger').title=offsetLabel(s.utcOffset);l.el.querySelector('#pl-date-trigger').dataset.value=local;
  l.el.querySelector('#pl-date-trigger').setAttribute('aria-label','Выбрать дату и время карты, '+local.slice(8,10)+'.'+local.slice(5,7)+' '+local.slice(11,16));
  l.el.querySelector('#pl-location').textContent=s.locationConfirmed?s.place:'Место: пример 56°, 37,6°';l.dirty=true;
 }
 function search(){
  const l=live;if(!l)return;const query=l.el.querySelector('#pl-search').value.trim(),box=l.el.querySelector('#pl-results');
  l.el.querySelector('#pl-search-clear').hidden=!query;if(!query){box.hidden=true;return;}
  const needle=normal(query),matches=[...l.deep.filter(o=>searchMatches(o.object,query)),...l.solar.filter(o=>normal(o.label+' '+o.id).includes(needle)),...l.allStars.filter(o=>o.named&&normal(o.label+' '+o.aliases+' HIP '+o.star[4]).includes(needle))].slice(0,12);
  box.hidden=false;box.innerHTML=matches.length?matches.map(o=>`<button type="button" role="option" data-result="${e(o.id)}"><span><strong>${e(o.label)}</strong><small>${e(o.kind==='dso'?o.subtitle:o.kind==='solar'?'Солнечная система':'Звезда · '+o.mag+'m')}</small></span><span>${deg(angles(o.local).altitude)}<small>высота</small></span></button>`).join(''):'<p>Ничего не найдено. Попробуй NGC, M или название звезды.</p>';
 }
 function selectTarget(target,center){
  const l=live;if(!l||!target)return;if(target.kind==='star'&&!target.label)target.label=target.star[4]?'HIP '+target.star[4]:target.star[6]==='G'?'Gaia DR3 '+String(target.star[5]).slice(1):'HYG '+target.star[5];l.target=target;lastTarget=target.id;l.el.querySelector('#pl-results').hidden=true;l.el.querySelector('#pl-search').value=target.label;l.el.querySelector('#pl-search-clear').hidden=false;
  const sheet=l.el.querySelector('#pl-selection');sheet.getAnimations().forEach(a=>a.cancel());sheet.hidden=false;sheet.innerHTML=targetMarkup(target,get().icon,l.sensor,Capacitor.isPluginAvailable('SkyCamera'));l.el.classList.add('has-target');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)sheet.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(center&&!l.sensor)centerTarget();l.dirty=true;
 }
 function clearTarget(){
  const l=live;if(!l?.target)return;l.target=null;lastTarget=null;l.el.querySelector('#pl-search').value='';l.el.querySelector('#pl-search-clear').hidden=true;l.el.querySelector('#pl-results').hidden=true;l.el.querySelector('#pl-arrow').hidden=true;l.el.classList.remove('has-target');
  const sheet=l.el.querySelector('#pl-selection');sheet.getAnimations().forEach(a=>a.cancel());
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)sheet.hidden=true;else sheet.animate([{opacity:1,transform:sheet.style.transform||'translateY(0)'},{opacity:0,transform:'translateY(30px)'}],{duration:180,easing:'ease-out'}).finished.then(()=>{if(!l.target)sheet.hidden=true;}).catch(()=>{});
  sheet.style.transform='';sheet.style.opacity='';l.dirty=true;
 }
 function centerTarget(){const l=live;if(!l?.target)return;const a=angles(l.target.local);l.azimuth=a.azimuth;l.altitude=clamp(a.altitude,-90,90);const to=camera(l.azimuth,l.altitude);l.cameraTween=matchMedia('(prefers-reduced-motion: reduce)').matches?null:{from:l.view,to,started:performance.now()};if(!l.cameraTween)l.view=to;l.dirty=true;}
 function zoom(factor){const l=live;if(!l)return;l.fovGoal=clamp(l.fovGoal*factor,.25,120);if(matchMedia('(prefers-reduced-motion: reduce)').matches)l.fov=l.fovGoal;l.dirty=true;}
 function syncTools(){const l=live;if(l)l.el.classList.toggle('is-tool-open',!l.el.querySelector('#pl-search-panel').hidden||!l.el.querySelector('#pl-layers').hidden||!!l.timePicker?.isOpen());}
 function toggleSearch(show){
  const l=live;if(!l)return;const panel=l.el.querySelector('#pl-search-panel');const opening=show===undefined?panel.hidden:show;
  panel.hidden=!opening;l.el.querySelector('#pl-search-toggle').setAttribute('aria-expanded',String(opening));
  if(opening){toggleLayers(false);l.el.querySelector('#pl-search').focus();search();}else{l.el.querySelector('#pl-results').hidden=true;l.el.querySelector('#pl-search').blur();}syncTools();
 }
 function toggleLayers(show){const l=live;if(!l)return;const box=l.el.querySelector('#pl-layers');if(show!==false)toggleSearch(false);box.hidden=show===undefined?!box.hidden:!show;l.el.querySelector('#pl-options').setAttribute('aria-expanded',String(!box.hidden));syncTools();}
 function openTimePicker(){
  const l=live;if(!l||l.timePicker?.isOpen())return;toggleLayers(false);const trigger=l.el.querySelector('#pl-date-trigger');toggleSearch(false);trigger.setAttribute('aria-expanded','true');
  l.timePicker=createSkyTimePicker({host:l.el,value:localInput(l.date,get().state.settings.utcOffset),utcOffset:get().state.settings.utcOffset,icon:get().icon,onApply:(value,isLive)=>{if(l.sensor||l.starting)stopOrientation(false);l.date=fromLocal(value,get().state.settings.utcOffset);l.liveTime=isLive;l.lastTick=0;l.el.querySelector('#pl-now').classList.toggle('active',isLive);l.el.querySelector('#pl-now').setAttribute('aria-pressed',String(isLive));updateSky();},onClose:()=>{l.timePicker=null;trigger.setAttribute('aria-expanded','false');syncTools();}});syncTools();
 }
 function handleBack(){
  const l=live;if(!l)return false;
  if(l.timePicker?.isOpen()){l.timePicker.close();return true;}
  for(const id of ['pl-calibration','pl-search-panel','pl-layers']){const el=l.el.querySelector('#'+id);if(!el.hidden){el.hidden=true;if(id==='pl-layers')toggleLayers(false);if(id==='pl-search-panel')toggleSearch(false);l.el.querySelector('#pl-search').blur();return true;}}
  if(l.target){clearTarget();return true;}return false;
 }
 function mountSelectionSwipe(on){
  const l=live,sheet=l.el.querySelector('#pl-selection');let drag=null;
  on(sheet,'pointerdown',ev=>{if(ev.target.closest('button,input')||!l.target)return;drag={x:ev.clientX,y:ev.clientY,dx:0,dy:0};sheet.setPointerCapture(ev.pointerId);});
  on(sheet,'pointermove',ev=>{if(!drag)return;drag.dx=ev.clientX-drag.x;drag.dy=ev.clientY-drag.y;const dx=Math.abs(drag.dx)>Math.abs(drag.dy)?drag.dx:0,dy=dx?0:Math.max(0,drag.dy);sheet.style.transform=`translate(${dx}px,${dy}px)`;sheet.style.opacity=String(Math.max(.35,1-Math.hypot(dx,dy)/240));});
  const release=()=>{if(!drag)return;const dismiss=Math.abs(drag.dx)>65||drag.dy>55;drag=null;if(dismiss)clearTarget();else{sheet.style.transition='transform .2s ease,opacity .2s ease';sheet.style.transform='';sheet.style.opacity='';setTimeout(()=>sheet.style.transition='',220);}};
  on(sheet,'pointerup',release);on(sheet,'pointercancel',()=>{drag=null;sheet.style.transform='';sheet.style.opacity='';});
 }
 async function openSkyCamera(){
  const l=live;if(!l||l.openingCamera)return;
  const {A,state,constellations}=get(),s=state.settings;
  if(!s.locationConfirmed){feedback('Задай координаты площадки в настройках, чтобы открыть небо в камере.');return;}
  l.openingCamera=true;
  try{
   // The overlay follows the current sky even if the map shows another date.
   const now=new Date(),matrix=equatorialToLocal(A,now,s);
   const direction=eq=>transform(matrix,eq).map(value=>Math.round(value*1e6)/1e6);
   const observer=new A.Observer(s.latitude,s.longitude,0);
   const solar=BODIES.map(([body,name])=>{
    const eq=A.Equator(body,now,observer,false,true);
    return {body,name,direction:direction(equatorial(eq.ra*15,eq.dec)),mag:A.Illumination(body,now).mag};
   });
   const target=l.target&&{
    name:l.target.label,
    direction:l.target.kind==='solar'?solar.find(o=>o.body===l.target.body).direction:direction(l.target.eq)
   };
   const marks=l.allStars.filter(star=>star.mag<=4.5)
    .map(star=>['star',star.label,direction(star.eq),star.mag]);
   const stars=marks.filter(([,name,dir,mag])=>name&&mag<3.4&&angles(dir).altitude>12)
    .sort((a,b)=>a[3]-b[3]).slice(0,40)
    .map(([,name,direction])=>({name,direction}));
   for(const o of solar)marks.push(['solar',o.name,o.direction,o.mag]);
   for(const o of l.deep){
    if(o.mag>8.5)continue;
    marks.push([o.object.type==='galaxy'?'galaxy':'deep',o.label,direction(o.eq),o.mag]);
   }
   const figures=constellations.map(group=>[
    group.name,direction(equatorial(...group.center)),
    group.lines.map(line=>line.map(point=>direction(equatorial(...point))))
   ]);
   await SkyCamera.open({latitude:s.latitude,longitude:s.longitude,timestamp:+now,redMode:s.nightMode,
    target,stars,marks,figures});
  }catch(error){if(live===l)feedback(error.message||'Не удалось открыть камеру.');}
  finally{l.openingCamera=false;}
 }
 async function startOrientation(){
  const l=live;if(!l)return;if(!Capacitor.isNativePlatform()||!Capacitor.isPluginAvailable('SkyOrientation')){feedback('Датчики доступны в Android-приложении. Здесь карту можно вращать пальцем или стрелками клавиатуры.');return;}
  l.starting=true;const token={};l.startToken=token;l.el.querySelector('#pl-status').textContent='Включаем датчики…';
  try{const available=await SkyOrientation.available();if(!available.available)throw new Error('На устройстве нет датчика направления.');
   l.orientationListener=await SkyOrientation.addListener('orientation',sample=>{
    if(live!==l||(!l.sensor&&!l.starting))return;
    try{l.sensorView=validatedCamera(sample);l.accuracy=sample.accuracy;l.headingError=Number.isFinite(sample.headingError)?sample.headingError:null;l.sampleAt=Date.now();l.dirty=true;}catch{feedback('Датчик передал некорректное направление. Останови и включи ориентацию снова.');}
   });
   const {latitude,longitude}=get().state.settings;l.orientationLocation={latitude,longitude};await SkyOrientation.start(l.orientationLocation);
   if(live!==l||l.startToken!==token){if(!live?.sensor&&!live?.starting)await SkyOrientation.stop();await l.orientationListener?.remove();return;}
   l.sensor=true;l.starting=false;l.sensorStartedAt=Date.now();l.liveTime=true;l.calibration=null;l.lastTick=0;updateSky();l.el.querySelector('#pl-now').classList.add('active');l.el.querySelector('#pl-now').setAttribute('aria-pressed','true');l.el.querySelector('#pl-orientation').setAttribute('aria-pressed','true');l.el.querySelector('#pl-orientation').setAttribute('aria-label','Остановить ориентацию телефона');if(l.target)selectTarget(l.target,false);
   feedback('Направляй заднюю сторону телефона на небо. Держись подальше от магнитов и металла; для уточнения нажми «По звезде».');
  }catch(error){if(live===l){stopOrientation(false);feedback(error.message||'Датчики недоступны. Свободный обзор продолжает работать.');}}
 }
 function stopOrientation(update=true){
  const l=live;if(!l)return;const was=l.sensor||l.starting;l.sensor=false;l.starting=false;l.startToken=null;l.calibration=null;l.sensorView=null;l.sampleAt=0;if(l.orientationListener){l.orientationListener.remove().catch(()=>{});l.orientationListener=null;}if(was)SkyOrientation.stop().catch(()=>{});
  const a=angles(l.view.forward);l.azimuth=a.azimuth;l.altitude=clamp(a.altitude,-90,90);l.view=camera(l.azimuth,l.altitude);l.el.querySelector('#pl-orientation').setAttribute('aria-pressed','false');l.el.querySelector('#pl-orientation').setAttribute('aria-label','Навести телефон');l.el.querySelector('#pl-status').textContent='Свободный обзор';l.el.querySelector('#pl-calibration').hidden=true;if(l.target)selectTarget(l.target,false);l.dirty=true;if(update&&was)feedback('Свободный обзор. Для ориентации снова нажми кнопку с прицелом.');
 }
 function calibrationPrompt(confirm=false){
  const l=live;if(!l?.sensor)return;const box=l.el.querySelector('#pl-calibration');box.hidden=false;
  if(confirm&&l.target?.kind==='star'){
   box.innerHTML=`<strong>Привязка к ${e(l.target.label)}</strong><p>Найди эту звезду на настоящем небе и направь на неё центр задней стороны телефона. Затем подтверди привязку. Не ориентируйся по текущей метке карты.</p><div><button class="btn small primary" data-calibrate="confirm">Звезда в центре</button><button class="btn small ghost" data-calibrate="cancel">Отмена</button></div>`;return;
  }
  const stars=l.allStars.filter(o=>o.named&&o.mag<2.8&&angles(o.local).altitude>15).sort((a,b)=>a.mag-b.mag).slice(0,7);
  box.innerHTML=`<strong>Уточнить по знакомой звезде</strong><p>Выбери звезду, которую уверенно узнаёшь на небе. Одна привязка улучшает местное направление, но не заменяет точный искатель.</p>${l.sunAltitude>0?'<p class="pl-warning">Сейчас день: привязку по звезде проверь ночью.</p>':''}<div>${stars.map(o=>`<button class="chip" data-calibrate="${e(o.id)}">${e(o.label)}</button>`).join('')}${!stars.length?'<span>Нет подходящих ярких звёзд выше 15°.</span>':''}</div><button class="btn small ghost" data-calibrate="cancel">Отмена</button>`;
 }
 function animate(timestamp){const l=live;if(!l)return;if(!document.hidden&&!l.covered){const delta=Math.min(64,timestamp-(l.lastFrame||timestamp));l.lastFrame=timestamp;if(Math.abs(l.fovGoal-l.fov)>.015){l.fov+=(l.fovGoal-l.fov)*(1-Math.exp(-delta/75));l.dirty=true;}else l.fov=l.fovGoal;if(l.cameraTween&&!l.sensor){const t=clamp((timestamp-l.cameraTween.started)/440,0,1);l.view=blendCameras(l.cameraTween.from,l.cameraTween.to,1-Math.pow(1-t,3));l.dirty=true;if(t===1)l.cameraTween=null;}if(timestamp-l.lastTick>1000){l.lastTick=timestamp;if(l.liveTime)updateSky();if(l.sensor&&Date.now()-(l.sampleAt||l.sensorStartedAt)>4000){stopOrientation(false);feedback('Обновления датчика прекратились. Включи ориентацию снова.');}}
   if(l.sensor&&l.sensorView){const desired=l.calibration?calibrateCamera(l.sensorView,l.calibration):l.sensorView;const progress=separation(l.view.forward,desired.forward);if(progress>.03||separation(l.view.up,desired.up)>.1){l.view=blendCameras(l.view,desired,.3);l.dirty=true;}else l.view=desired;}
   if(l.dirty){draw();l.dirty=false;}}
  l.frame=requestAnimationFrame(animate);
 }
 function draw(){
  const l=live;if(!l?.width||!l.height||!l.matrix)return;const c=get(),ctx=l.context,w=l.width,h=l.height,night=c.state.settings.nightMode,view=l.view,point=v=>screenPoint(v,view,w,h,l.fov),inFrame=p=>p&&p.x>-25&&p.x<w+25&&p.y>-25&&p.y<h+25;
  const light=l.layers.atmosphere?clamp((l.sunAltitude+18)/30,0,1):0;
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,night?'#100403':light>.6?'#15324d':'#050b17');gradient.addColorStop(1,night?'#240b07':light>.6?'#517b96':'#10253a');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);l.hits=[];
  const canvasBounds=l.canvas.getBoundingClientRect(),boxes=[...l.el.querySelectorAll('.sky-page-header,.pl-caption,.pl-scale,.pl-selection:not([hidden])')].map(el=>{const r=el.getBoundingClientRect();return {x:r.left-canvasBounds.left-6,y:r.top-canvasBounds.top-5,w:r.width+12,h:r.height+10};});function label(text,x,y,color='#a7b6cc',size=11){if(x<10||x>w-10||y<18||y>h-15)return;ctx.font=`${size}px -apple-system, sans-serif`;const width=ctx.measureText(text).width;const box={x:x-width/2,y:y-size,w:width,h:size+5};if(box.x<5||box.x+box.w>w-5||boxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))return;boxes.push(box);ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle=night?'#150603':'#06101c';ctx.strokeText(text,x,y);ctx.fillStyle=night?'#b56550':color;ctx.fillText(text,x,y);}
  const line=(vectors,color,width=1)=>{ctx.beginPath();let previous=null;for(const v of vectors){const p=point(v);if(p&&previous&&Math.abs(p.x-previous.x)<w*2&&Math.abs(p.y-previous.y)<h*2){ctx.lineTo(p.x,p.y);}else if(p)ctx.moveTo(p.x,p.y);previous=p;}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  if(l.layers.grid){for(let az=0;az<360;az+=30)line(Array.from({length:91},(_,i)=>horizon(az,-90+i*2)),night?'#50231b':'#31465c88',.7);for(const alt of [-30,0,30,60])line(Array.from({length:181},(_,i)=>horizon(i*2,alt)),night?'#50231b':'#31465c88',.7);}
  if(l.layers.constellations){for(const group of c.constellations){for(const segment of group.lines)line(segment.map(p=>transform(l.matrix,equatorial(p[0],p[1]))),night?'#77382b':'#7191b15e',1);}}
  if(l.layers.objects&&l.fov<=12){for(const target of l.deep){if(l.layers.ground&&target.local[2]<0)continue;const p=point(target.local);if(!inFrame(p))continue;l.drawObject(ctx,target.object,objectFootprint(target.object,l.matrix,view,w,h,l.fov),l.fov,night);}}
  const limits=detailLimits(l.fov),magnitudeLimit=light>.6?Math.min(1,limits.starMagnitude):limits.starMagnitude,bins=[[],[],[],[],[],[]];
  for(const tile of tilesInView(l.starTiles,l.matrix,view,w,h,l.fov))for(const star of tile.stars){if(star.mag>magnitudeLimit&&star!==l.target)break;if(star.revision!==l.skyRevision){star.local=transform(l.matrix,star.eq);star.revision=l.skyRevision;}const p=point(star.local);if(!inFrame(p))continue;if(l.layers.ground&&star.local[2]<0)continue;bins[clamp(Math.floor(star.mag+1),0,5)].push({p,star});}
  l.canvas.dataset.starCount=String(bins.reduce((n,bin)=>n+bin.length,0));
  for(let b=5;b>=0;b--){ctx.beginPath();for(const {p,star} of bins[b]){const r=clamp(2.6-star.mag*.29,.65,3.8);ctx.moveTo(p.x+r,p.y);ctx.arc(p.x,p.y,r,0,Math.PI*2);if(star.mag<4.5||l.fov<8)l.hits.push({x:p.x,y:p.y,target:star});}ctx.fillStyle=night?`rgba(207,104,76,${1-b*.09})`:`rgba(223,234,247,${1-b*.075})`;ctx.fill();}
  const visibleStars=bins.flat().filter(({star})=>star.named&&star.mag<2.4).sort((a,b)=>a.star.mag-b.star.mag);
  if(l.layers.names)for(const {p,star} of visibleStars.filter(({star})=>star.id!==l.target?.id).slice(0,18))label(star.label,p.x,p.y-9,'#c6d7e7',12);
  if(l.layers.objects){for(const target of l.deep){if(target!==l.target&&!showCatalogObject(target.object,limits))continue;if(l.layers.ground&&target.local[2]<0)continue;const p=point(target.local);if(!inFrame(p))continue;ctx.strokeStyle=night?'#ce7755':'#d9b97c';ctx.lineWidth=.9;ctx.beginPath();if(target.object.type==='galaxy')ctx.ellipse(p.x,p.y,5.5,2.7,-.5,0,Math.PI*2);else if(['open','globular'].includes(target.object.type))ctx.arc(p.x,p.y,4.5,0,Math.PI*2);else ctx.rect(p.x-3.5,p.y-3.5,7,7);ctx.stroke();l.hits.push({x:p.x,y:p.y,target});if(l.layers.names&&(target.object.magnitude!=null&&target.mag<=limits.objectLabelMagnitude||l.fov<18)&&target.id!==l.target?.id)label(target.label,p.x,p.y+16,'#ccb38b',10);}}
  for(const target of l.solar){if(l.layers.ground&&target.local[2]<0||target!==l.target&&target.mag>magnitudeLimit)continue;const p=point(target.local);if(!inFrame(p))continue;ctx.beginPath();ctx.arc(p.x,p.y,target.body==='Moon'?7:3.5,0,Math.PI*2);ctx.fillStyle=night?'#c78060':target.color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=target.body==='Venus'?8:0;ctx.fill();ctx.shadowBlur=0;l.hits.push({x:p.x,y:p.y,target});if(l.layers.names&&target.id!==l.target?.id)label(target.label,p.x,p.y-12,'#eee1c2',12);}
  if(l.layers.names&&l.layers.constellations){for(const group of c.constellations){const v=transform(l.matrix,equatorial(group.center[0],group.center[1])),p=point(v);if(inFrame(p)&&(!l.layers.ground||v[2]>.02))label(group.name.toLocaleUpperCase('ru'),p.x,p.y,'#8dabc3',Math.min(13,11+35/l.fov));}}
  if(l.layers.ground){const polygon=groundPolygon(view,w,h,l.fov);if(polygon.length){ctx.beginPath();polygon.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=night?'#160b07':'#0b1516';ctx.fill();}line(Array.from({length:181},(_,i)=>horizon(i*2,0)),night?'#8c4b31':'#739a91',1.3);}
  for(const [i,name] of ['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'].entries()){const p=point(horizon(i*45,3));if(inFrame(p))label(name,p.x,p.y,i%2?'#78998d':'#a8c4b0',i%2?11:14);}
  if(l.target){const p=point(l.target.local),angle=separation(l.target.local,view.forward),a=angles(l.target.local),arrow=l.el.querySelector('#pl-arrow');l.el.querySelector('#pl-target-alt').textContent=deg(a.altitude)+(a.altitude<0?' · под горизонтом':'');
   if(p&&p.x>22&&p.x<w-22&&p.y>22&&p.y<h-22){ctx.strokeStyle=night?'#f39a6d':'#f2cd82';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.moveTo(p.x-21,p.y);ctx.lineTo(p.x-15,p.y);ctx.moveTo(p.x+15,p.y);ctx.lineTo(p.x+21,p.y);ctx.moveTo(p.x,p.y-21);ctx.lineTo(p.x,p.y-15);ctx.moveTo(p.x,p.y+15);ctx.lineTo(p.x,p.y+21);ctx.stroke();ctx.font='13px -apple-system, sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle=night?'#150603':'#06101c';const tx=clamp(p.x,60,w-60),ty=clamp(p.y-25,23,h-18);ctx.strokeText(l.target.label,tx,ty);ctx.fillStyle=night?'#db8a67':'#f2d391';ctx.fillText(l.target.label,tx,ty);arrow.hidden=true;
   }else{let dx=dot(l.target.local,view.right),dy=-dot(l.target.local,view.up);if(Math.hypot(dx,dy)<.001)dx=1;const a2=Math.atan2(dy,dx),r=Math.min(w,h)*.33;arrow.hidden=false;arrow.style.left=w/2+Math.cos(a2)*r+'px';arrow.style.top=h/2+Math.sin(a2)*r+'px';arrow.querySelector('span').style.transform=`rotate(${a2*180/Math.PI+90}deg)`;arrow.querySelector('small').textContent=deg(angle);}
  }else l.el.querySelector('#pl-arrow').hidden=true;
  const a=angles(view.forward);l.el.querySelector('#pl-compass').textContent=`Аз ${deg(a.azimuth)} · Выс ${deg(a.altitude)}${l.sunAltitude> -6?' · день / сумерки':''}`;l.el.querySelector('#pl-fov').textContent=deg(l.fov);l.el.querySelector('#pl-detail').textContent=`Звёзды до ${magnitudeLimit.toLocaleString('ru-RU',{maximumFractionDigits:1})}${l.fov<4?'m V/G':'m'} · объекты до ≈ ${limits.objectMagnitude.toLocaleString('ru-RU',{maximumFractionDigits:1})}m`;
  if(l.sensor){const quality=l.accuracy>=3?'Компас: высокая точность':l.accuracy===2?'Компас: средняя точность':'Компас: нужна калибровка';l.el.querySelector('#pl-status').textContent=quality+(l.calibration?' · привязка':'')+(l.headingError!=null?' · курс ±'+deg(l.headingError):'');}
 }
 function dispose(){const l=live;if(!l)return;l.timePicker?.dispose();clearTimeout(l.feedbackTimer);stopOrientation(false);lastView={...angles(l.view.forward),fov:l.fov};if(Capacitor.isNativePlatform())SkyOrientation.keepAwake({enabled:false}).catch(()=>{});cancelAnimationFrame(l.frame);l.resize?.disconnect();for(const fn of l.disposers)fn();live=null;}
 return {open,dispose,isOpen:()=>!!live,handleBack,leave:()=>{if(live){stopOrientation(false);live.covered=true;live.pointer.clear();live.gesture=false;live.timePicker?.close();toggleSearch(false);}},focusTarget:id=>selectTarget(findTarget(id),true),cover:()=>{if(live){live.covered=true;live.timePicker?.close();live.el.inert=true;}},reveal:()=>{if(live){live.covered=false;live.lastTick=0;live.lastFrame=0;live.el.inert=false;updateSky();live.dirty=true;const position=get().state.settings;if(live.sensor&&live.orientationLocation&&(position.latitude!==live.orientationLocation.latitude||position.longitude!==live.orientationLocation.longitude)){stopOrientation(false);startOrientation();}}},suspend:()=>{if(live&&(live.sensor||live.starting)){stopOrientation(false);feedback('Ориентация остановлена при сворачивании. Включи её кнопкой с прицелом.');}},resume:()=>{if(live){live.lastTick=0;live.dirty=true;if(Capacitor.isNativePlatform())SkyOrientation.keepAwake({enabled:true}).catch(()=>{});}}};
}
