import {escapeHtml as e,offsetLabel} from './core.mjs?v=59d02c126dc7cb25';

export function planetariumMarkup(icon,settings,withCamera){return `
 <div class="planetarium">
  <header class="sky-page-header">
   <div class="sky-page-title"><span class="sky-header-mark" aria-hidden="true">${icon('catalog')}</span><h1>Карта неба</h1></div>
   <div class="sky-tool-buttons" aria-label="Инструменты карты">
    <button class="icon-btn" id="pl-search-toggle" aria-label="Поиск объектов на карте" aria-expanded="false">${icon('search')}</button>
    <button class="icon-btn sky-clock-button" id="pl-date-trigger" aria-label="Выбрать дату и время карты" aria-haspopup="dialog" aria-expanded="false">${icon('clock')}</button>
    <button class="icon-btn" id="pl-orientation" aria-label="Навести телефон" aria-pressed="false">${icon('target')}</button>
    <button class="icon-btn" id="pl-options" aria-label="Слои карты" aria-expanded="false">${icon('settings')}</button>
   </div>
  </header>
  <div class="pl-tools pl-search-panel" id="pl-search-panel" hidden>
   <div class="pl-search"><label>${icon('search')}<input id="pl-search" type="search" placeholder="Объект, звезда или планета…" aria-label="Поиск на карте неба" autocomplete="off"><button class="pl-search-clear" id="pl-search-clear" type="button" aria-label="Очистить поиск" hidden>${icon('close')}</button></label><button class="icon-btn" id="pl-search-close" aria-label="Закрыть поиск">${icon('close')}</button></div>
   <div id="pl-results" class="pl-results" role="listbox" aria-label="Результаты поиска" hidden></div>
  </div>
  <div class="pl-viewport">
   <canvas id="pl-canvas" tabindex="0" aria-label="Интерактивная трёхмерная карта неба. Перетаскивай для обзора, используй плюс и минус для масштаба. Стрелки клавиатуры вращают карту."></canvas>
   <div class="pl-caption"><span id="pl-status">Свободный обзор</span><button id="pl-location" aria-label="Место наблюдений"></button><span id="pl-detail"></span></div>
   <div class="pl-reticle" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
   <div class="pl-scale"><button class="icon-btn" id="pl-zoom-in" aria-label="Приблизить карту">+</button><span id="pl-fov"></span><button class="icon-btn" id="pl-zoom-out" aria-label="Отдалить карту">−</button>${withCamera?`<button class="icon-btn pl-camera" id="pl-camera" aria-label="Небо в камере" title="Небо в камере">${icon('camera')}</button>`:''}</div>
   <div id="pl-arrow" class="pl-target-arrow" hidden><span>↑</span><small></small></div>
   <div id="pl-layers" class="pl-layers" hidden><header><strong>Слои неба</strong><button class="icon-btn" id="pl-close-layers" aria-label="Закрыть слои карты">${icon('close')}</button></header>
    ${[['constellations','Фигуры созвездий',true],['names','Названия',true],['objects','Объекты каталога',true],['grid','Сетка высоты и азимута',false],['ground','Горизонт и земля',true],['atmosphere','Атмосфера',false]].map(([key,label,checked])=>`<label><input type="checkbox" data-layer="${key}" ${checked?'checked':''}>${label}</label>`).join('')}
    <div class="pl-time-summary"><span id="pl-time-label"></span><button id="pl-now" class="chip active" aria-pressed="true">Сейчас</button></div><p>Звёзды HYG по всему небу; возле целей — поля Gaia до 14 G при приближении. G отличается от визуальной V. Слабые поля покрывают радиус 0,4° вокруг объектов каталога. Протяжённые объекты показаны схематично, с каталожными размерами. Карта доступна офлайн.</p><button class="btn small ghost" id="pl-open-settings">${icon('settings')}Место и настройки</button>
   </div>
   <div id="pl-calibration" class="pl-calibration" hidden></div>
   <section class="pl-selection" id="pl-selection" aria-label="Выбранный объект" hidden></section>
   <div class="pl-compass" id="pl-compass"></div>
   <div class="pl-feedback" id="pl-feedback" role="status" hidden></div>
  </div>
 </div>`;}

export function targetMarkup(target,icon,sensor,withCamera){return `
 <div class="sky-sheet-handle" aria-hidden="true"></div>
 <div class="pl-target-heading"><div><strong>${e(target.label)}</strong><span>${e(target.kind==='dso'?target.object.commonName||target.subtitle:target.kind==='star'?'Звезда · '+target.mag+(target.star[6]==='G'?' G':'m'):'Солнечная система')}</span></div><span id="pl-target-alt"></span><button class="icon-btn pl-clear-target" data-sky-action="clear" aria-label="Снять выбор объекта">${icon('close')}</button></div>
 <div class="pl-target-actions"><button class="btn small ghost" data-sky-action="center">${icon('target')}Показать</button>${target.object?'<button class="btn small primary" data-sky-action="details">Карточка объекта</button>':''}<button class="btn small ghost" data-sky-action="calibrate" ${sensor?'':'hidden'}>По звезде</button>${withCamera?`<button class="btn small ghost" data-sky-action="camera">${icon('camera')}Камера</button>`:''}</div>`;}
