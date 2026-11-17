import assert from 'node:assert/strict';
import { forecastUrl, readForecast, tonightForecast, weatherSite } from '../dist/weather.mjs';

const utc = value => Date.parse(value + 'Z') / 1000;
const hour = 3600;
const settings = { latitude: 55.751234, longitude: 37.621234, utcOffset: 3, locationConfirmed: true };
const site = weatherSite(settings);
assert.deepEqual(site, { latitude: 55.75, longitude: 37.62, offsetSeconds: 10800 });
assert.equal(weatherSite({ ...settings, locationConfirmed: false }), null);
assert.equal(weatherSite({ ...settings, latitude: 91 }), null);
assert.equal(forecastUrl(site).searchParams.get('latitude'), '55.75');

const start = utc('2026-11-09T20:00:00');
const noon = utc('2026-11-09T09:00:00');
const hourly = {
  time: Array.from({ length: 5 }, (_, i) => start + i * hour),
  cloud_cover: [15, 20, 60, 10, null],
  precipitation_probability: [100, 0, 20, 90, null],
  precipitation: [3, 0, 0.1, 2, null]
};
const hours = readForecast({ hourly });
assert.equal(hours[0].rainChance, 0);
assert.equal(hours[3].rain, null);
assert.equal(hours[4].cloud, null);
assert.deepEqual(tonightForecast(hours, site, noon).window, { start, end: start + 2 * hour });
assert.equal(tonightForecast(hours, site, start + 1).window, null, 'Exclude the elapsed hour');
assert.equal(tonightForecast(hours.filter((_, i) => i !== 1), site, noon).window, null);
assert.equal(tonightForecast(hours.map(h => ({ ...h, rain: null })), site, noon).window, null);
assert.equal(tonightForecast(hours.map(h => ({ ...h, rain: 0.2 })), site, noon).window, null);

const summer = utc('2026-06-21T20:00:00');
const polar = { ...site, latitude: 72 };
const summerHours = hours.map((h, i) => ({ ...h, start: summer + i * hour }));
assert.deepEqual(tonightForecast(summerHours, polar, summer), { rows: [], window: null });

const afterMidnight = utc('2026-11-09T22:00:00');
const clear = [0, 1, 2].map(i => ({ start: afterMidnight + i * hour, cloud: 0, rain: 0, rainChance: 0 }));
assert.deepEqual(tonightForecast(clear, site, afterMidnight).window, { start: afterMidnight, end: afterMidnight + 3 * hour });
console.log('PASS: rounded forecast location, rain-hour alignment, midnight, cloud and rain limits, missing hours, polar day.');
