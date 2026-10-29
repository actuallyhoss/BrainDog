/**
 * The weather where you are, from Open-Meteo, free and with no key: today and the next six days, one row a day in
 * Weather, kept in step every three hours.
 *
 * THE PLACE IS A SETTING, A NAME AS A PERSON SAYS IT ("Cairo", "Alexandria, Egypt"). It is looked up once a run on
 * Open-Meteo's own place search, the first answer taken, and the forecast asked for there in the place's own time
 * zone, so "today" is the day it is where the weather is. No place set, and nothing is asked: the run says so.
 *
 * ONE ROW A DAY, FOUND BY ITS DAY AND KEPT IN STEP. A day already held is updated where the forecast moved and left
 * alone where it did not; a new day is written. A day that has gone stays as it was last forecast, which is the
 * nearest thing to what it was. A place changed in the settings writes its days over the old place's.
 *
 * WHAT THE SKY IS SAID IN WORDS, from the World Meteorological Organization's code Open-Meteo sends (`SKY`), so a
 * widget says "Light rain" and never "61".
 *
 * NOTHING OUTSIDE `run` IS READ: the text of this file is the script (`weather.pack.json`).
 */

export default async function run(ctx) {
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  const DAYS = 7;
  const SKY = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
  };
  const config = ctx.config && typeof ctx.config === 'object' ? ctx.config : {};
  const place = typeof config.place === 'string' ? config.place.trim() : '';
  if (place === '') {
    ctx.log('No place is set, so the weather was not asked for. Set one on this add-on\'s page.');
    return null;
  }
  const fahrenheit = config.units === 'fahrenheit';

  const found = await ctx.fetch(`${GEO}?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
  if (!found.ok) throw new Error(`Open-Meteo's place search answered ${found.status}, so the weather was not asked for this time.`);
  const hit = ((await found.json()).results || [])[0];
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
    ctx.log(`Open-Meteo knows no place called "${place}". Try the town and its country, such as "Cairo, Egypt".`);
    return null;
  }
  const where = [hit.name, hit.country].filter((s) => typeof s === 'string' && s !== '').join(', ');

  const asked =
    `${FORECAST}?latitude=${hit.latitude}&longitude=${hit.longitude}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&timezone=auto&forecast_days=${DAYS}${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`;
  const answered = await ctx.fetch(asked);
  if (!answered.ok) throw new Error(`Open-Meteo answered ${answered.status}, so the weather stays as it was.`);
  const daily = (await answered.json()).daily || {};
  const days = Array.isArray(daily.time) ? daily.time : [];
  const num = (list, i) => (Array.isArray(list) && typeof list[i] === 'number' ? list[i] : null);

  const held = new Map();
  for (const r of await ctx.record.list('weather', { field: 'day', in: days })) held.set(String(r.fields.day), r);

  let wrote = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const code = num(daily.weather_code, i);
    const fields = {
      what: code !== null && SKY[code] ? SKY[code] : 'Unknown',
      day,
      place: where,
      high: num(daily.temperature_2m_max, i),
      low: num(daily.temperature_2m_min, i),
      rain: num(daily.precipitation_probability_max, i),
      code,
      unit: fahrenheit ? '°F' : '°C',
    };
    const row = held.get(day);
    if (row === undefined) {
      ctx.write('weather', fields);
      wrote += 1;
      continue;
    }
    const patch = {};
    for (const [k, v] of Object.entries(fields)) if (row.fields[k] !== v && !(v === null && (row.fields[k] === undefined || row.fields[k] === null))) patch[k] = v;
    if (Object.keys(patch).length === 0) continue;
    ctx.update(`weather#${row.seq}`, patch, row.version);
    wrote += 1;
  }
  ctx.log(wrote === 0 ? `The forecast for ${where} is as it was.` : `The forecast for ${where}: ${wrote} ${wrote === 1 ? 'day' : 'days'} written.`);
  return { place: where, wrote };
}
