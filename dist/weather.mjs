// Weather hours use UTC; the observing site's fixed UTC offset defines the night.
const HOUR = 3600;
const DAY = 24 * HOUR;
const RAD = Math.PI / 180;
export const WEATHER_FIELDS = 'cloud_cover,precipitation_probability,precipitation,temperature_2m,wind_speed_10m';

export function weatherSite(settings) {
  const { latitude, longitude, utcOffset } = settings;
  if (!settings.locationConfirmed || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(utcOffset) || utcOffset < -12 || utcOffset > 14) return null;
  return { latitude: +latitude.toFixed(2), longitude: +longitude.toFixed(2), offsetSeconds: Math.round(utcOffset * HOUR) };
}

export function forecastUrl(site) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: site.latitude, longitude: site.longitude, hourly: WEATHER_FIELDS,
    timeformat: 'unixtime', timezone: 'GMT', forecast_days: '3'
  });
  return url;
}

export function readForecast(data) {
  const hours = data?.hourly;
  if (!Array.isArray(hours?.time) || !Array.isArray(hours.cloud_cover)) throw new Error('Invalid forecast');
  const field = (key, index) => Number.isFinite(hours[key]?.[index]) ? hours[key][index] : null;
  return hours.time.slice(0, 96).flatMap((start, i) => {
    if (!Number.isSafeInteger(start)) return [];
    // Rain totals and probability describe the preceding hour in Open-Meteo.
    const nextHour = hours.time[i + 1] === start + HOUR;
    return [{
      start, cloud: field('cloud_cover', i),
      rainChance: nextHour ? field('precipitation_probability', i + 1) : null,
      rain: nextHour ? field('precipitation', i + 1) : null,
      temperature: field('temperature_2m', i), wind: field('wind_speed_10m', i)
    }];
  });
}

// NOAA fractional-year approximation for the Sun's altitude.
function sunAltitude(timestamp, { latitude, longitude }) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1) / 1000;
  const yearDays = (Date.UTC(year + 1, 0, 1) / 1000 - yearStart) / DAY;
  const g = 2 * Math.PI / yearDays * ((timestamp - yearStart) / DAY - 0.5);
  const timeCorrection = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const hourAngle = ((timestamp % DAY) / 240 + timeCorrection / 4 + longitude - 180) * RAD;
  const lat = latitude * RAD;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)) / RAD;
}

export function tonightForecast(hours, site, now) {
  const evening = Math.floor((now + site.offsetSeconds - 6 * HOUR) / DAY);
  const noon = evening * DAY + 12 * HOUR - site.offsetSeconds;
  const rows = hours.filter(({ start }) => start >= Math.max(now, noon) && start + HOUR <= noon + DAY
    && sunAltitude(start, site) <= -12 && sunAltitude(start + HOUR, site) <= -12)
    .map(hour => ({
      ...hour, clear: hour.cloud != null && hour.cloud >= 0 && hour.cloud <= 20
        && hour.rainChance != null && hour.rainChance >= 0 && hour.rainChance <= 20
        && hour.rain != null && hour.rain >= 0 && hour.rain <= 0.1
    }));
  let window = null;
  let run = null;
  for (const row of rows) {
    if (!row.clear) { run = null; continue; }
    run = { start: run?.end === row.start ? run.start : row.start, end: row.start + HOUR };
    if (run.end - run.start >= 2 * HOUR && (!window || run.end - run.start > window.end - window.start)) window = run;
  }
  return { rows, window };
}
