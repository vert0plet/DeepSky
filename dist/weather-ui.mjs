import { WeatherAlerts } from './vendor/native-bridge.mjs?v=59d02c126dc7cb25';
import { weatherSite, forecastUrl, readForecast, tonightForecast } from './weather.mjs?v=59d02c126dc7cb25';

const PREF = 'deepsky-weather-enabled';
const CACHE = 'deepsky-weather-cache';
const FRESH_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const readLocal = key => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};
const writeLocal = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Forecast remains available for this session. */ }
};

export function createWeatherUI(get) {
  let enabled = readLocal(PREF) === true;
  let cache = enabled ? readLocal(CACHE) : null;
  let site = null, siteKey = null, request = null, fetchError = false;
  let alerts = null, busy = false, nativeQueue = Promise.resolve();

  function updateAlerts(method, args, report = false) {
    if (!get().native) return Promise.resolve();
    // Keep a location update or a disable ordered behind any permission prompt.
    nativeQueue = nativeQueue.then(async () => {
      try {
        alerts = await WeatherAlerts[method](args);
        if (report && !alerts.allowed) get().toast('Разреши уведомления DeepSky в настройках Android.');
        else if (report && !alerts.enabled) get().toast('Не удалось включить уведомления о погоде.');
      } catch {
        if (report) get().toast('Не удалось изменить уведомления о погоде.');
      }
      paint();
    });
    return nativeQueue;
  }

  function syncSite() {
    const current = enabled ? weatherSite(get().settings) : null;
    const key = current ? JSON.stringify(current) : '';
    if (key === siteKey) return;
    request?.abort();
    request = null;
    fetchError = false;
    site = current;
    siteKey = key;
    if (cache?.key !== key) {
      cache = null;
      writeLocal(CACHE, null);
    }
    if (site) updateAlerts('syncSite', site);
    else updateAlerts('disable');
    mount();
  }

  async function refresh() {
    if (!site || request) return;
    const controller = new AbortController();
    const key = siteKey;
    request = controller;
    fetchError = false;
    paint();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(forecastUrl(site), { signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Forecast unavailable');
      const hours = readForecast(await response.json());
      if (!hours.length) throw new Error('Empty forecast');
      if (request !== controller) return;
      cache = { key, hours, received: Date.now() };
      writeLocal(CACHE, cache);
    } catch {
      if (request === controller) fetchError = true;
    } finally {
      clearTimeout(timeout);
      if (request === controller) { request = null; paint(); }
    }
  }

  function mount() {
    paint();
    if (document.getElementById('weather-panel') && site && !fetchError
      && (cache?.key !== siteKey || Date.now() - cache.received >= FRESH_MS)) refresh();
  }

  function paint() {
    const panel = document.getElementById('weather-panel');
    if (!panel) return;
    const { settings, btn, icon, native, escape } = get();
    const openedSettings = !!panel.querySelector('.weather-options')?.open;
    let content, options = '';
    if (!weatherSite(settings)) {
      content = '<p>Укажи координаты площадки, чтобы увидеть ночной прогноз.</p>'
        + btn('settings', 'Указать площадку', 'pin', 'small ghost');
    } else if (!enabled) {
      content = '<p>Облачность, осадки и ясные часы после сумерек. Для прогноза Open-Meteo получит координаты площадки с точностью до 0,01°.</p>'
        + btn('weather-enable', 'Включить прогноз', 'cloud', 'small ghost');
    } else {
      const usable = cache?.key === siteKey && Date.now() - cache.received < MAX_AGE_MS;
      const clock = (time, withDate = false) => new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        ...(withDate ? { day: 'numeric', month: 'short' } : {})
      }).format((time + site.offsetSeconds) * 1000);
      const time = row => clock(row.start);
      const number = (value, unit) => value == null ? '—' : Math.round(value) + unit;
      const reading = (title, value) => '<span title="' + title + '"><small>' + title + '</small><b>' + value + '</b></span>';
      const { rows, window } = usable
        ? tonightForecast(cache.hours, site, Date.now() / 1000) : { rows: [], window: null };
      const summary = request && !usable ? 'Загружаем прогноз…' : !usable ? 'Прогноз сейчас недоступен'
        : window ? clock(window.start) + '–' + clock(window.end)
        : rows.length ? 'Ясного окна на два часа пока нет' : 'Тёмных часов в ближайшую ночь по прогнозу нет';
      const status = fetchError && usable ? 'Без обновления · прогноз от ' + clock(cache.received / 1000, true)
        : usable ? 'Обновлено ' + clock(cache.received / 1000, true) + ' · время площадки'
        : fetchError ? 'Проверь подключение и попробуй обновить.' : '';
      const expanded = panel.querySelector('.weather-details')?.open;
      const table = rows.length ? '<details class="weather-details"' + (expanded ? ' open' : '')
        + '><summary>Почасовой прогноз</summary><div class="weather-hours">'
        + rows.map(row => '<div class="weather-hour' + (row.clear ? ' is-clear' : '') + '"><time>' + time(row) + '</time>'
          + reading('Облака', number(row.cloud, '%')) + reading('Осадки', number(row.rainChance, '%'))
          + reading('Темп.', number(row.temperature, '°')) + reading('Ветер', number(row.wind, ' км/ч'))
          + '</div>').join('') + '</div><p class="weather-meta">Ясное окно: от 2 часов после сумерек, облачность и вероятность осадков до 20%.</p></details>' : '';
      const alertLabel = !alerts?.enabled ? 'Выключены' : alerts.allowed ? 'Включены' : 'Запрещены в Android';
      const alertButton = native ? btn(alerts?.enabled ? 'weather-alert-off' : 'weather-alert-on',
        alerts?.enabled ? 'Отключить уведомления' : 'Включить уведомления', '', 'small ghost', busy ? 'disabled' : '') : '';
      const optionsLabel = 'Настройки прогноза';
      options = '<details class="weather-options"' + (openedSettings ? ' open' : '')
        + '><summary aria-label="' + optionsLabel + '" title="' + optionsLabel + '">' + icon('settings')
        + '</summary><div class="weather-option-menu">'
        + (native ? '<p><strong>Уведомления о ясном небе</strong><br>' + alertLabel + '</p>' + alertButton : '')
        + btn('weather-disable', 'Отключить прогноз', '', 'small ghost') + '</div></details>';
      content = '<div class="weather-brief' + (window ? ' is-clear' : '') + '" role="status">'
        + '<span class="weather-location">' + escape(settings.place || 'Твоя площадка') + '</span>'
        + '<div class="weather-summary' + (window ? ' is-clear' : '') + '">' + summary + '</div>'
        + (window ? '<span class="weather-clear-label"><span class="dot"></span>Ясное окно</span>' : '') + '</div>'
        + table + '<div class="weather-footer"><div class="weather-meta">'
        + (status ? '<div>' + status + '</div>' : '')
        + '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></div>'
        + btn('weather-refresh', 'Обновить', 'refresh', 'small ghost', request ? 'disabled' : '') + '</div>';
    }
    panel.innerHTML = '<div class="weather-heading"><div class="weather-title">' + icon('cloud')
      + '<h2 id="weather-title">Погода для наблюдений</h2></div>' + options + '</div>' + content;

  }

  function handleAction(action) {
    if (action === 'weather-enable' || action === 'weather-disable') {
      enabled = action === 'weather-enable';
      writeLocal(PREF, enabled);
      syncSite();
      paint();
    } else if (action === 'weather-refresh') {
      refresh();
    } else if (action === 'weather-alert-on' || action === 'weather-alert-off') {
      if (!site || busy) return true;
      busy = true;
      const options = document.querySelector('#weather-panel .weather-options');
      if (options) options.open = false;
      paint();
      const turningOn = action === 'weather-alert-on';
      updateAlerts(turningOn ? 'enable' : 'disable', turningOn ? site : undefined, turningOn)
        .finally(() => { busy = false; paint(); });
    } else return false;
    return true;
  }

  function resume() {
    if (enabled && site) updateAlerts('status');
    fetchError = false;
    mount();
  }

  return { syncSite, mount, resume, handleAction };
}
