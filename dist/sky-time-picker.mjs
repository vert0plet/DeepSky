import {escapeHtml as e,localInput,offsetLabel} from './core.mjs?v=59d02c126dc7cb25';

const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export function validSkyTime(value){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
 if(!m)return false;
 const [y,month,day,h,min]=m.slice(1).map(Number),d=new Date(Date.UTC(y,month-1,day));
 return y>=1900&&y<=2100&&month>=1&&month<=12&&day>=1&&h>=0&&h<24&&min>=0&&min<60&&d.getUTCFullYear()===y&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
export function calendarDays(year,month){
 const first=new Date(Date.UTC(year,month,1)),offset=(first.getUTCDay()+6)%7;
 return Array.from({length:42},(_,i)=>{const d=new Date(Date.UTC(year,month,i-offset+1));return {key:d.toISOString().slice(0,10),day:d.getUTCDate(),outside:d.getUTCMonth()!==month};});
}
export function createSkyTimePicker({host,value,utcOffset,icon,onApply,onClose}){
 let draft=validSkyTime(value)?value:localInput(new Date(),utcOffset),month=Number(draft.slice(5,7))-1,year=Number(draft.slice(0,4)),live=false,disposed=false;
 const previousFocus=document.activeElement,overlay=document.createElement('div');overlay.className='sky-time-overlay';
 overlay.innerHTML=`<section class="sky-time-dialog" role="dialog" aria-modal="true" aria-labelledby="sky-time-title"><div class="sky-sheet-handle" aria-hidden="true"></div><header><div><span class="eyebrow">ТВОЁ НЕБО ВО ВРЕМЕНИ</span><h3 id="sky-time-title">Дата и время</h3></div><button class="icon-btn" type="button" data-time="close" aria-label="Закрыть выбор даты">${icon('close')}</button></header><p class="sky-time-zone">Время места наблюдений <span>${e(offsetLabel(utcOffset))}</span></p><div class="sky-calendar-heading"><button class="icon-btn" data-time="previous" aria-label="Предыдущий месяц">${icon('arrow')}</button><strong id="sky-calendar-month"></strong><input id="sky-calendar-year" aria-label="Год карты" type="number" inputmode="numeric" min="1900" max="2100" value="${year}"><button class="icon-btn" data-time="next" aria-label="Следующий месяц">${icon('arrow')}</button></div><div class="sky-weekdays" aria-hidden="true">${['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(d=>`<span>${d}</span>`).join('')}</div><div id="sky-calendar-days" class="sky-calendar-days" role="group" aria-label="День месяца"></div><div class="sky-time-clock"><span>Время</span><label><span class="sr-only">Часы</span><input id="sky-time-hour" aria-label="Часы" type="text" inputmode="numeric" maxlength="2" value="${draft.slice(11,13)}"></label><b>:</b><label><span class="sr-only">Минуты</span><input id="sky-time-minute" aria-label="Минуты" type="text" inputmode="numeric" maxlength="2" value="${draft.slice(14,16)}"></label></div><div class="sky-time-presets"><button class="chip" data-time="now">Сейчас</button><button class="chip" data-time="tonight">Сегодня · 22:00</button><button class="chip" data-time="tomorrow">Завтра · 22:00</button></div><p class="sky-time-error" role="status"></p><footer><button class="btn ghost" data-time="close">Отмена</button><button class="btn primary" data-time="apply">Показать небо</button></footer></section>`;
 host.append(overlay);const q=id=>overlay.querySelector('#'+id);let focusTimer;
 function keepClockVisible(){
  const field=document.activeElement;if(disposed||!field?.matches('#sky-time-hour,#sky-time-minute'))return;
  const panel=overlay.querySelector('.sky-time-dialog'),box=panel.getBoundingClientRect(),input=field.getBoundingClientRect(),footer=panel.querySelector('footer').getBoundingClientRect();
  if(input.top<box.top+12||input.bottom>footer.top-12)panel.scrollTo({top:panel.scrollTop+input.top+input.height/2-(box.top+footer.top)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 const clockResize=new ResizeObserver(()=>requestAnimationFrame(keepClockVisible));clockResize.observe(host);
 const stopClockTracking=()=>{clockResize.disconnect();clearTimeout(focusTimer);};
 function render(){
  q('sky-calendar-month').textContent=MONTHS[month];q('sky-calendar-year').value=year;
  overlay.querySelector('[data-time=previous]').disabled=year===1900&&month===0;overlay.querySelector('[data-time=next]').disabled=year===2100&&month===11;
  const selected=draft.slice(0,10),today=localInput(new Date(),utcOffset).slice(0,10);
  q('sky-calendar-days').innerHTML=calendarDays(year,month).map(d=>`<button type="button" data-day="${d.key}" ${+d.key.slice(0,4)<1900||+d.key.slice(0,4)>2100?'disabled':''} class="${d.outside?'outside ':''}${d.key===selected?'selected ':''}${d.key===today?'today':''}" aria-label="${d.day} ${MONTHS[Number(d.key.slice(5,7))-1]} ${d.key.slice(0,4)}" aria-pressed="${d.key===selected}">${d.day}</button>`).join('');
 }
 function close(){
  if(disposed)return;disposed=true;stopClockTracking();overlay.classList.add('closing');onClose();
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  const remove=()=>overlay.remove();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)remove();else {overlay.addEventListener('animationend',remove,{once:true});setTimeout(remove,240);}
 }
 function clock(){const h=q('sky-time-hour').value.trim(),m=q('sky-time-minute').value.trim();if(!/^\d{1,2}$/.test(h)||!/^\d{1,2}$/.test(m)||+h>23||+m>59)return null;return h.padStart(2,'0')+':'+m.padStart(2,'0');}
 function setDraft(next,isLive=false){draft=next;year=+draft.slice(0,4);month=+draft.slice(5,7)-1;live=isLive;q('sky-time-hour').value=draft.slice(11,13);q('sky-time-minute').value=draft.slice(14,16);render();}
 overlay.addEventListener('click',event=>{
  if(event.target===overlay){close();return;}
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.day){draft=button.dataset.day+'T'+(clock()||draft.slice(11));year=+draft.slice(0,4);month=+draft.slice(5,7)-1;live=false;render();return;}
  const action=button.dataset.time;if(action==='close'){close();return;}
  if(action==='previous'||action==='next'){const date=new Date(Date.UTC(year,month+(action==='next'?1:-1),1));if(date.getUTCFullYear()<1900||date.getUTCFullYear()>2100)return;year=date.getUTCFullYear();month=date.getUTCMonth();render();}
  if(['now','tonight','tomorrow'].includes(action)){const now=localInput(new Date(),utcOffset);if(action==='now')setDraft(now,true);else{let day=now.slice(0,10);if(action==='tomorrow')day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);setDraft(day+'T22:00');}}
  if(action==='apply'){const time=clock(),next=draft.slice(0,10)+'T'+time;if(!time||!validSkyTime(next)){overlay.querySelector('.sky-time-error').textContent='Часы: от 00 до 23, минуты: от 00 до 59.';return;}onApply(next,live);close();}
 });
 q('sky-calendar-year').addEventListener('change',()=>{const next=+q('sky-calendar-year').value;if(Number.isInteger(next)&&next>=1900&&next<=2100){year=next;render();}else q('sky-calendar-year').value=year;});
 for(const id of ['sky-time-hour','sky-time-minute']){q(id).addEventListener('input',()=>{live=false;overlay.querySelector('.sky-time-error').textContent='';});q(id).addEventListener('focus',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(keepClockVisible,300);});}
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key==='Enter'&&event.target.matches('#sky-time-hour,#sky-time-minute')){event.preventDefault();overlay.querySelector('[data-time=apply]').click();}
  if(event.key==='Tab'){const fields=[...overlay.querySelectorAll('button,input')].filter(el=>!el.disabled),first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 });
 render();overlay.querySelector('[data-time=close]').focus({preventScroll:true});
 return {close,dispose:()=>{disposed=true;stopClockTracking();overlay.remove();},isOpen:()=>!disposed};
}
