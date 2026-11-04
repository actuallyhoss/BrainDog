/**
 * Weather: today and the next six days from Open-Meteo, one row a day. The script is run alone in QuickJS over a host
 * double that answers Open-Meteo's place search and forecast as they answered on 29 October 2026, and the pack as it
 * ships is read by the add-on door. Every place here is real and every number is Open-Meteo's own shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('weather.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('weather.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { version: string; declarations: Record<string, unknown>[]; widgets: { id: string; sizes: string[]; size: string }[] };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as { script: string; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string; runs: unknown };

const GEO = { results: [{ name: 'Cairo', country: 'Egypt', latitude: 30.06263, longitude: 31.24967 }] };
const FORECAST = {
  daily: {
    time: ['2026-10-29', '2026-10-30', '2026-10-31'],
    weather_code: [2, 61, 3],
    temperature_2m_max: [27.9, 26.0, 27.1],
    temperature_2m_min: [17.7, 15.3, 15.7],
    precipitation_probability_max: [0, 40, 0],
  },
};

const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: SCRIPT.keys, reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });
const hostOf = (config: Json, held: Json[] = [], asked: string[] = []): CtxHost =>
  ({
    fetch: async (req: unknown) => {
      const url = String(typeof req === 'string' ? (JSON.parse(req) as { url: string }).url : (req as { url: string }).url);
      asked.push(url);
      return { status: 200, headers: {}, body: JSON.stringify(url.includes('geocoding') ? GEO : FORECAST) };
    },
    list: async () => held,
    get: async () => null,
    now: () => '2026-10-29T09:00:00.000Z',
    clock: () => 0,
    tz: 'Africa/Cairo',
    input: {},
    config,
  }) as unknown as CtxHost;
const writes = (a: ScriptAnswer) => {
  assert.ok('writes' in a, JSON.stringify(a));
  return a.writes as unknown as { op: string; fields?: Record<string, Json>; patch?: Record<string, Json> }[];
};

test('THE PACK CARRIES weather.js, CALLS ONLY OPEN-METEO, AND OFFERS TWO WIDGETS', async () => {
  assert.equal(SCRIPT.source, SOURCE);
  assert.deepEqual(SCRIPT.egress, ['https://geocoding-api.open-meteo.com', 'https://api.open-meteo.com']);
  assert.deepEqual(SCRIPT.keys, []);
  assert.deepEqual(PACK.widgets.map((w) => [w.id, w.size, w.sizes.includes(w.size)]), [
    /* WIDE SINCE 1.2.2 (265db20f8): a card must, and Small could not be added at that size. */
    ['weather-today', 'wide', true],
    ['weather-week', 'tall', true],
  ]);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(PACK.version, '1.2.2');
});

test('A PLACE IS LOOKED UP, AND EACH DAY IS ONE ROW, its sky in words', async () => {
  const asked: string[] = [];
  const w = writes(await runInQuickJs(decl(), hostOf({ place: 'Cairo', units: 'celsius' }, [], asked)));
  assert.equal(asked.length, 2);
  assert.match(asked[1]!, /latitude=30\.06263&longitude=31\.24967/);
  assert.deepEqual(
    w.map((x) => [x.fields!.day, x.fields!.what, x.fields!.high, x.fields!.rain, x.fields!.place]),
    [
      ['2026-10-29', 'Partly cloudy', 27.9, 0, 'Cairo, Egypt'],
      ['2026-10-30', 'Light rain', 26, 40, 'Cairo, Egypt'],
      ['2026-10-31', 'Cloudy', 27.1, 0, 'Cairo, Egypt'],
    ],
  );
});

test('A DAY ALREADY HELD IS UPDATED WHERE IT MOVED, AND NO PLACE ASKS FOR NOTHING', async () => {
  const held = [{ id: 'w1', register: 'weather', seq: 1, version: 3, fields: { day: '2026-10-29', what: 'Partly cloudy', place: 'Cairo, Egypt', high: 25, low: 17.7, rain: 0, code: 2, unit: '°C' } }];
  const w = writes(await runInQuickJs(decl(), hostOf({ place: 'Cairo' }, held as unknown as Json[])));
  assert.deepEqual(w[0], { op: 'update', spoken: 'weather#1', patch: { high: 27.9 }, version: 3 } as never);
  const asked: string[] = [];
  assert.deepEqual(writes(await runInQuickJs(decl(), hostOf({ place: '' }, [], asked))), []);
  assert.equal(asked.length, 0);
});
