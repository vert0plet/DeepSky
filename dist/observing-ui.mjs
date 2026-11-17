import {planNight,eyepieceGeometry,activeEyepiece} from './observing.mjs?v=59d02c126dc7cb25';
import {uid,displayId,foundIds,markObjectFound,fromLocal,localInput,formatTime,formatDate,offsetLabel,horizontal,skyContext,visibility,escapeHtml as e} from './core.mjs?v=59d02c126dc7cb25';

export function createObservingUI(get){
 let pendingPlan=null,observing=null,compareFields=false;
 const field=(label,input)=>`<label class="field"><span>${label}</span>${input}</label>`;
 const select=(name,label,items,value)=>field(label,`<select class="control" name="${name}">${items.map(([k,v])=>`<option value="${k}" ${String(k)===String(value)?'selected':''}>${v}</option>`).join('')}</select>`);
 const button=(...args)=>get().btn(...args);
 function ensureEyepieces(){const s=get().state.settings;if(!s.eyepieces?.length){s.eyepieces=[{id:'default-eyepiece',name:'Основной',focalLength:s.eyepiece,afov:s.afov}];s.activeEyepieceId=s.eyepieces[0].id;}return s.eyepieces;}
 function planner(){
  const c=get(),s=c.state.settings;pendingPlan=null;
  c.showModal('Составить план на ночь',`<div class="modal-body planner-body"><p class="detail-text">Выбери время выезда. Подберём цели и порядок с учётом высоты, темноты, Луны и твоего фильтра.</p>${!s.locationConfirmed?'<div class="info-note">Пока используются примерные координаты. Для своего неба сначала укажи место в настройках.</div>':''}<form id="planner-form"><div class="form-grid">${field('Начало · '+offsetLabel(s.utcOffset),`<input class="control" type="datetime-local" name="start" required value="${localInput(c.sessionDate,s.utcOffset)}">`)}${select('duration','Продолжительность',[[60,'1 час'],[120,'2 часа'],[180,'3 часа'],[240,'4 часа'],[360,'6 часов']],120)}${select('minutesPerTarget','На поиск и наблюдение цели',[[15,'15 минут'],[20,'20 минут'],[30,'30 минут']],20)}${select('maxScore','Сложность до',[[2,'2/5 · попроще'],[3,'3/5 · средняя'],[4,'4/5 · сложные'],[5,'5/5 · любые']],3)}${select('group','Какие объекты',[['all','Разные'],['galaxy','Галактики'],['nebula','Туманности'],['clusters','Скопления']], 'all')}${select('minAltitude','Минимальная высота',[[20,'20°'],[25,'25°'],[30,'30°'],[40,'40°']],25)}<label class="check-row full"><input type="checkbox" name="includeFound"> Включать уже найденные</label></div><div class="planner-context">${s.aperture} мм · SQM ${s.sqm} · ${s.filter==='none'?'без фильтра':s.filter==='uhc'?'UHC':'O III'}</div>${button('planner-build','Подобрать цели','target','primary')}</form><div id="planner-result" aria-live="polite"></div></div>`, '',true,'planner');
  const form=c.modalRoot.querySelector('#planner-form');form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();buildPlan();});
  form.addEventListener('input',()=>{pendingPlan=null;const result=c.modalRoot.querySelector('#planner-result');if(result.childElementCount)result.innerHTML='<p class="form-help">Параметры изменились. Подбери цели заново.</p>';});
  form.addEventListener('change',()=>{pendingPlan=null;const result=c.modalRoot.querySelector('#planner-result');if(result.childElementCount)result.innerHTML='<p class="form-help">Параметры изменились. Подбери цели заново.</p>';});
 }
 function buildPlan(){
  const c=get(),form=c.modalRoot.querySelector('#planner-form');if(!form.reportValidity())return;
  const data=new FormData(form),options=Object.fromEntries(data);options.start=fromLocal(data.get('start'),c.state.settings.utcOffset);options.includeFound=data.has('includeFound');
  const result=c.modalRoot.querySelector('#planner-result');
  try{pendingPlan=planNight(c.A,c.catalog,c.state.settings,options,foundIds(c.state));
   const p=pendingPlan,s=c.state.settings;
   result.innerHTML=p.slots.length?`<div class="planner-results-heading"><div><h3>${p.slots.length} целей на ${formatTime(p.startAt,s.utcOffset)}–${formatTime(p.endAt,s.utcOffset)}</h3><p>Время включает поиск и смену окуляра.</p></div><span class="badge">Предварительный план</span></div><ol class="plan-timeline">${p.slots.map(slot=>{const o=c.byId.get(slot.objectId);return `<li><span class="timeline-time">${formatTime(slot.startAt,s.utcOffset)}<small>${formatTime(slot.endAt,s.utcOffset)}</small></span><div><strong>${e(displayId(o))}</strong><p>${e(o.commonName||o.constellation)}</p><small>${Math.round(slot.altitude)}° · сложность ${slot.score}/5</small></div></li>`;}).join('')}</ol><p class="form-help">Цели проверены в начале, середине и конце своего интервала. Сначала учитываем те, чьё подходящее окно скоро закончится. Пустое время может приходиться на сумерки или отсутствие подходящих целей. Облака и местные препятствия не учтены.</p>${button('planner-save','Сохранить как список','check','primary')}`:'<div class="empty"><h3>Подходящих целей не нашлось</h3><p>Попробуй более тёмное время, другую категорию, меньшую минимальную высоту или большую сложность. Неизвестная сложность в автоплан не попадает.</p></div>';
  }catch(error){pendingPlan=null;c.toast(error.message);}
 }
 function savePlan(){
  if(!pendingPlan?.slots.length)return;
  const c=get(),p=pendingPlan,s=c.state.settings,id=uid();
  const list={id,name:'Ночь '+formatDate(p.startAt,s.utcOffset,false),date:localInput(new Date(p.startAt),s.utcOffset).slice(0,10),notes:`Автоплан ${formatTime(p.startAt,s.utcOffset)}–${formatTime(p.endAt,s.utcOffset)} (${offsetLabel(s.utcOffset)}). ${s.aperture} мм, SQM ${s.sqm}, ${s.filter==='none'?'без фильтра':s.filter==='uhc'?'UHC':'O III'}. Высота от ${p.minAltitude}°. Погода и местные препятствия не учтены.`,objectIds:p.slots.map(x=>x.objectId),schedule:p.slots,createdAt:new Date().toISOString()};
  c.state.lists.push(list);if(!c.persist()){c.state.lists.pop();return;}pendingPlan=null;c.closeModal();c.openList(id);c.toast('План сохранён в «Мои списки».');
 }
 function beginObserving(id,listId){
  const c=get(),list=c.state.lists.find(l=>l.id===listId),ids=list?list.objectIds.filter(x=>c.byId.has(x)):[id].filter(x=>c.byId.has(x));if(!ids.length){c.toast('Добавь в список хотя бы одну цель.');return;}
  observing={ids,index:0,listId:list?.id,drafts:new Map(),records:new Map(),owned:new Set(),step:0,done:new Set()};renderObserving();
 }
 function renderObserving(){
  const c=get(),s=c.state.settings,o=c.byId.get(observing.ids[observing.index]),id=o.id,record=c.state.observations.find(r=>r.id===observing.records.get(id)),status=record?(record.outcome==='not_seen'?'Попытка записана':'Найдено · сохранено'):foundIds(c.state).has(id)?'Уже найден раньше':'';
  const now=new Date(),h=horizontal(c.A,o,now,s),sky=skyContext(c.A,now,s),v=visibility(h,sky);
  c.showModal('У телескопа',`<div class="observing-body"><div class="observing-title"><div><span class="eyebrow">ЦЕЛЬ ${observing.index+1} ИЗ ${observing.ids.length}</span><h2>${e(displayId(o))}</h2><p>${e(o.commonName||o.constellation)}</p></div><div class="observing-meta"><strong>${Math.round(h.altitude)}° сейчас</strong><span>${s.aperture} мм · ${!['emission','planetary','snr'].includes(o.type)?'без узкой полосы':s.filter==='none'?'без фильтра':s.filter==='uhc'?'UHC':'O III'}</span></div></div>${v.kind!=='good'?`<div class="observing-conditions">${e(v.text)} · ${formatTime(now,s.utcOffset)} ${offsetLabel(s.utcOffset)}</div>`:''}<div class="observing-progress"><i style="width:${observing.done.size/observing.ids.length*100}%"></i></div><div class="guide-controls observing-tabs">${['sky','overview','finder','eyepiece'].map((mode,i)=>button('guide-mode',['Созвездия','Маршрут','Искатель','Окуляр'][i],'',i===0?'chip active':'chip',`data-value="${mode}"`)).join('')}<span id="sky-zoom-controls" class="row">${button('sky-zoom','Ближе','','small ghost','data-value="-15"')}${button('sky-zoom','Шире','','small ghost','data-value="15"')}</span><span id="guide-optics-controls" class="row" hidden>${button('rotate-map','Повернуть','refresh','small ghost')}<label class="check-row"><input id="mirror-map" type="checkbox" ${s.mirror?'checked':''}>Зеркало</label></span></div><div id="guide-map-wrap"></div><div id="map-legend" class="map-legend"></div><div class="observing-step-nav" id="observing-step-nav" hidden>${button('observing-step-back','Назад','','small ghost')}<span id="observing-step-count"></span>${button('observing-step-next','Следующий шаг','arrow','small ghost')}</div><div id="guide-steps"></div><p class="form-help observing-warning">Маршрут рассчитан автоматически. Карта не отслеживает телефон или трубу. Видимость зависит от условий; поля ориентированы по небу.</p><label class="field observing-note"><span>Заметка · по желанию</span><textarea id="observing-note" class="control" rows="2" maxlength="10000" placeholder="Например, еле разглядел боковым зрением…">${e(observing.drafts.get(id)||record?.note||'')}</textarea></label><p class="observing-status" id="observing-status" role="status">${status}</p></div>`, `<div class="observing-actions">${button('observing-found','Нашёл','check','primary')}${button('observing-missed','Не получилось','close','ghost')}${button('observing-previous','Назад','','ghost',observing.index===0?'disabled':'')}${button('observing-next',observing.index===observing.ids.length-1?'Завершить':'Дальше','arrow','ghost')}</div>`,true,'observing');
  c.modalRoot.querySelector('.modal').classList.add('observing-dialog');c.modalRoot.dataset.object=id;c.modalRoot.dataset.guideMode='sky';c.modalRoot.dataset.skyFov='70';c.drawGuide();
 }
 function recordResult(outcome){
  const c=get(),id=observing.ids[observing.index],s=c.state.settings;let record=c.state.observations.find(r=>r.id===observing.records.get(id));
  if(record&&outcome==='not_seen'&&!observing.owned.has(record.id))record=null;
  if(record){record.outcome=outcome;delete record.excludedFromFound;}else if(outcome==='seen'){const result=markObjectFound(c.state,id);record=result.observation;if(result.created)observing.owned.add(record.id);}else{record={id:uid(),objectId:id,outcome,observedAt:new Date().toISOString(),aperture:s.aperture,sqm:s.sqm,eyepiece:s.eyepiece,place:s.locationConfirmed?s.place:'',note:''};c.state.observations.push(record);observing.owned.add(record.id);}
  if(observing.drafts.has(id))record.note=observing.drafts.get(id);observing.records.set(id,record.id);observing.done.add(id);c.persist();c.render();
  const el=c.modalRoot.querySelector('#observing-status');el.textContent=outcome==='seen'?'Найдено · сохранено':'Попытка записана';c.modalRoot.querySelector('.observing-progress i').style.width=observing.done.size/observing.ids.length*100+'%';
 }
 function mountSettings(){
  const c=get(),section=c.settingsRoot().querySelector('#settings-panel-optics');if(!section)return;
  section.querySelector('[name=eyepiece]')?.closest('label').remove();section.querySelector('[name=afov]')?.closest('label').remove();
  let area=section.querySelector('#my-eyepieces');if(!area){area=document.createElement('section');area.id='my-eyepieces';section.querySelector('.form-grid').after(area);}
  const pieces=ensureEyepieces();area.innerHTML=`<div class="eyepieces-heading"><h3>Мои окуляры</h3>${button('eyepiece-add','Добавить','plus','small ghost',pieces.length>=12?'disabled':'')}</div><p class="form-help">Укажи свои окуляры. Активный используется в оценках и на карте.</p>${pieces.map(p=>{const g=eyepieceGeometry(c.state.settings,p);return `<div class="eyepiece-editor" data-eyepiece="${e(p.id)}"><div class="eyepiece-editor-title"><input class="control" aria-label="Название окуляра" data-eyepiece-field="name" maxlength="60" value="${e(p.name)}">${button('eyepiece-active',p.id===c.state.settings.activeEyepieceId?'Активный':'Выбрать','check',p.id===c.state.settings.activeEyepieceId?'small primary':'small ghost',`data-id="${e(p.id)}" aria-pressed="${p.id===c.state.settings.activeEyepieceId}"`)}${button('eyepiece-remove','','trash','small ghost',`data-id="${e(p.id)}" aria-label="Удалить окуляр ${e(p.name)}" ${pieces.length===1?'disabled':''}`)}</div><div class="form-grid">${field('Фокус окуляра, мм',`<input class="control" type="number" min="1" max="100" step="any" required data-eyepiece-field="focalLength" value="${p.focalLength}">`)}${field('Видимое поле, °',`<input class="control" type="number" min="20" max="120" step="any" required data-eyepiece-field="afov" value="${p.afov}">`)}</div><p class="eyepiece-stats">${stats(g)}</p></div>`;}).join('')}`;
 }
 function stats(g){return `${g.magnification.toFixed(0)}× · поле ≈ ${g.trueFov.toLocaleString('ru-RU',{maximumFractionDigits:2})}° · зрачок ${g.exitPupil.toLocaleString('ru-RU',{maximumFractionDigits:1})} мм`;}
 function selectEyepiece(id){const c=get(),s=c.state.settings,p=ensureEyepieces().find(x=>x.id===id);if(!p)return;s.activeEyepieceId=id;s.eyepiece=p.focalLength;s.afov=p.afov;c.persist();c.recompute();c.render();if(c.modalType()==='settings')mountSettings();else c.drawGuide();}
 function afterGuide(){
  const c=get(),mode=c.modalRoot.dataset.guideMode,wrap=c.modalRoot.querySelector('#guide-map-wrap');if(!wrap)return;
  c.modalRoot.querySelector('#eyepiece-map-controls')?.remove();
  if(mode==='eyepiece'){
   const s=c.state.settings,pieces=ensureEyepieces(),active=activeEyepiece(s),g=eyepieceGeometry(s,active),toolbar=document.createElement('div');toolbar.id='eyepiece-map-controls';toolbar.className='eyepiece-map-controls';
   toolbar.innerHTML=`<label><span>Мой окуляр</span><select id="map-eyepiece" class="control" aria-label="Окуляр на карте">${pieces.map(p=>`<option value="${e(p.id)}" ${p.id===active.id?'selected':''}>${e(p.name)} · ${p.focalLength} мм / ${p.afov}°</option>`).join('')}</select></label><label class="check-row"><input id="compare-eyepieces" type="checkbox" ${compareFields?'checked':''}>Сравнить поля</label><p>${stats(g)}${g.exitPupil>7?' · зрачок больше 7 мм':''}</p>`;wrap.before(toolbar);c.enhanceSelects(toolbar);
   const svg=wrap.querySelector('svg'),vb=svg.viewBox.baseVal,span=Number(svg.dataset.span),scale=Math.min(vb.width,vb.height)/span;
   if(compareFields){const ns='http://www.w3.org/2000/svg';for(const [i,p] of pieces.entries()){if(p.id===active.id)continue;const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',vb.width/2);circle.setAttribute('cy',vb.height/2);circle.setAttribute('r',eyepieceGeometry(s,p).trueFov*scale/2);circle.setAttribute('class','comparison-field');circle.setAttribute('stroke-dasharray',`${3+i*2} 5`);svg.append(circle);const label=document.createElementNS(ns,'text');label.setAttribute('x',vb.width/2+5);label.setAttribute('y',Math.max(30,vb.height/2-eyepieceGeometry(s,p).trueFov*scale/2+13));label.setAttribute('class','field-label');label.textContent=p.name+' · '+p.focalLength+' мм';svg.append(label);}}
   const o=c.byId.get(c.modalRoot.dataset.object);if(o?.major){const ellipse=document.createElementNS('http://www.w3.org/2000/svg','ellipse');ellipse.setAttribute('cx',vb.width/2);ellipse.setAttribute('cy',vb.height/2);ellipse.setAttribute('rx',o.major/60*scale/2);ellipse.setAttribute('ry',(o.minor||o.major)/60*scale/2);ellipse.setAttribute('transform',`rotate(${-90+(s.mirror?1:-1)*(o.positionAngle||0)+s.rotation} ${vb.width/2} ${vb.height/2})`);ellipse.setAttribute('class','object-footprint');svg.append(ellipse);}
   c.modalRoot.querySelector('#map-legend').innerHTML='<span>Пунктир — поле активного окуляра</span><span>Контур — каталожный размер объекта</span><span>Поле ≈ AFOV / увеличение; видимость деталей не моделируется</span>';
  }
  if(c.modalType()==='observing'&&observing){
   const steps=[...c.modalRoot.querySelectorAll('#guide-steps .guide-step')],nav=c.modalRoot.querySelector('#observing-step-nav');nav.hidden=!steps.length;
   if(steps.length){observing.step=Math.min(observing.step,steps.length-1);steps.forEach((el,i)=>el.hidden=i!==observing.step);c.modalRoot.querySelector('#observing-step-count').textContent=`Шаг ${observing.step+1} / ${steps.length}`;nav.querySelector('[data-action=observing-step-back]').disabled=observing.step===0;nav.querySelector('[data-action=observing-step-next]').disabled=observing.step===steps.length-1;}
  }
 }
 function mapSpan(){const s=get().state.settings;return compareFields?Math.max(...ensureEyepieces().map(p=>eyepieceGeometry(s,p).trueFov))*1.35:null;}
 function handleInput(input){
  const c=get();if(input.id==='observing-note'&&observing){const id=observing.ids[observing.index];observing.drafts.set(id,input.value);const record=c.state.observations.find(r=>r.id===observing.records.get(id));if(record){record.note=input.value;c.persist();}return;}
  if(!input.dataset.eyepieceField)return;const editor=input.closest('[data-eyepiece]'),p=ensureEyepieces().find(p=>p.id===editor.dataset.eyepiece),key=input.dataset.eyepieceField;
  if(!input.checkValidity()||(key==='name'&&!input.value.trim())){c.formStatus(input.closest('form'),'Проверь значение окуляра','error');return;}
  p[key]=key==='name'?input.value:Number(input.value);const s=c.state.settings;if(p.id===s.activeEyepieceId){s.eyepiece=p.focalLength;s.afov=p.afov;}const saved=c.persist();c.recompute();c.render();editor.querySelector('.eyepiece-stats').textContent=stats(eyepieceGeometry(s,p));c.formStatus(input.closest('form'),saved?'Все изменения сохранены':'Не удалось сохранить на устройстве');
 }
 function handleChange(input){if(input.id==='map-eyepiece')selectEyepiece(input.value);if(input.id==='compare-eyepieces'){compareFields=input.checked;get().drawGuide();}}
 function handleAction(action,id,b){
  const c=get();
  if(action==='planner'){planner();return true;}if(action==='planner-build'){buildPlan();return true;}if(action==='planner-save'){savePlan();return true;}
  if(action==='observe-object'){beginObserving(id);return true;}if(action==='observe-list'){beginObserving(null,id);return true;}
  if(action==='observing-found'||action==='observing-missed'){recordResult(action==='observing-found'?'seen':'not_seen');return true;}
  if(action==='observing-next'||action==='observing-previous'){
   if(action==='observing-next'&&observing.index===observing.ids.length-1){c.closeModal();c.render();c.toast('Наблюдения сохранены.');return true;}
   observing.index+=action==='observing-next'?1:-1;observing.index=Math.max(0,observing.index);observing.step=0;renderObserving();return true;
  }
  if(action==='observing-step-next'||action==='observing-step-back'){observing.step=Math.max(0,observing.step+(action==='observing-step-next'?1:-1));afterGuide();return true;}
  if(action==='eyepiece-add'){const pieces=ensureEyepieces();if(pieces.length<12){pieces.push({id:uid(),name:'Новый окуляр',focalLength:10,afov:50});c.persist();mountSettings();}return true;}
  if(action==='eyepiece-active'){selectEyepiece(id);return true;}
  if(action==='eyepiece-remove'){const s=c.state.settings;if(ensureEyepieces().length<=1)return true;s.eyepieces=s.eyepieces.filter(p=>p.id!==id);if(s.activeEyepieceId===id)selectEyepiece(s.eyepieces[0].id);else{c.persist();mountSettings();}return true;}
  return false;
 }
 function refreshOptics(){const c=get();for(const editor of c.settingsRoot().querySelectorAll('[data-eyepiece]')){const p=c.state.settings.eyepieces.find(p=>p.id===editor.dataset.eyepiece);if(p)editor.querySelector('.eyepiece-stats').textContent=stats(eyepieceGeometry(c.state.settings,p));}}
 return {handleAction,handleInput,handleChange,mountSettings,afterGuide,mapSpan,refreshOptics};
}
