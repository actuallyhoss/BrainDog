/**
 * A project's Key numbers tiles draw their charts, rendered and not planned (`Kpis.svelte`, `kinds/kpis.css`).
 *
 * THE EMPTY BAND. A project page was photographed with nothing between each number's change line and its target line:
 * the chart was in the page, but its draw-in starts fully clipped and the picture caught it at its start. So a tile with
 * points must draw its chart with a line in it, and the draw-in belongs only to a chart that arrives after the block's
 * first draw (`data-draw`), never to one drawn with the page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import type { KpiInput } from '../../src/kpis.ts';

/* `kpis-today.test.ts`'s hook: every `.svelte` and runes module the entry reaches is compiled for the server. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

type Props = { kpis: KpiInput[]; form?: 'project' | 'today'; home?: string | null; now?: number; lead?: boolean; leads?: string };
const entry = async (): Promise<{ Kpis: Component<Props> }> => (await import(new URL('../index.ts', import.meta.url).href)) as { Kpis: Component<Props> };

const NOW = Date.UTC(2026, 8, 3, 12);
const revenue: KpiInput = {
  kpi: 'k1',
  name: 'Revenue a month',
  unit: 'GBP',
  kind: 'flow',
  every: '1m',
  headline: true,
  target: 'GBP 2,000.00',
  points: [
    { at: '2026-05-28', amount: 'GBP 1,500.00' },
    { at: '2026-06-28', amount: 'GBP 1,600.00' },
    { at: '2026-07-28', amount: 'GBP 1,800.00' },
    { at: '2026-08-28', amount: 'GBP 2,300.00' },
  ],
};
const studios: KpiInput = {
  kpi: 'k2',
  name: 'Studios licensed',
  unit: 'studios',
  kind: 'level',
  every: '1w',
  target: '60',
  points: [
    { at: '2026-08-12', value: 48 },
    { at: '2026-08-19', value: 50 },
    { at: '2026-08-26', value: 50 },
    { at: '2026-09-02', value: 52 },
  ],
};
const downloads: KpiInput = {
  kpi: 'k3',
  name: 'Specimen downloads',
  unit: 'downloads',
  kind: 'level',
  every: '1w',
  points: [
    { at: '2026-07-23', value: 240 },
    { at: '2026-07-30', value: 262 },
    { at: '2026-08-06', value: 275 },
    { at: '2026-08-13', value: 251 },
  ],
};

const tilesOf = (html: string): string[] => html.match(/<li class="kpi kpi-tile"[\s\S]*?<\/li>/gu) ?? [];

test('EVERY TILE WITH POINTS DRAWS ITS CHART, with a line in it, as the project page draws the tiles', async () => {
  const { Kpis } = await entry();
  const { body } = render(Kpis, { props: { kpis: [revenue, studios, downloads], form: 'project', home: 'GBP', now: NOW, lead: false, leads: 'Leads the card' } });
  const tiles = tilesOf(body);
  assert.equal(tiles.length, 3);
  for (const tile of tiles) {
    const chart = /<svg class="kpi-chart"[^>]*>([\s\S]*?)<\/svg>/u.exec(tile);
    assert.ok(chart, `a tile with points draws its chart: ${tile.slice(0, 120)}`);
    const line = /<path class="kpi-line"[^>]* d="([^"]*)"/u.exec(chart[1]!) ?? /<path[^>]* d="([^"]*)"[^>]*class="kpi-line"/u.exec(chart[1]!);
    assert.ok(line, 'the chart has its line');
    assert.match(line[1]!, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){2,}$/u, 'the line goes through every point');
    /* DRAWN WITH THE PAGE, SO NOT DRAWING IN: nothing clips it on the first frame. */
    assert.doesNotMatch(chart[0], /data-draw/u);
  }
});

test('THE DRAW-IN BELONGS ONLY TO A CHART THAT ARRIVES AFTER THE FIRST DRAW', () => {
  const css = readFileSync(fileURLToPath(new URL('../../../skin/kinds/kpis.css', import.meta.url)), 'utf8');
  const rules = [...css.matchAll(/([^{};]+)\{[^{}]*animation:[^{}]*\}/gu)].map((m) => m[1]!.replace(/\/\*[\s\S]*?\*\//gu, '').trim());
  assert.ok(rules.length > 0, 'the charts still draw in when they arrive');
  for (const r of rules) for (const one of r.split(',')) assert.match(one.trim(), /\[data-draw\]$/u, `${one.trim()} draws in a chart drawn with the page`);
  const source = readFileSync(fileURLToPath(new URL('../Kpis.svelte', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /data-draw=\{/u, 'data-draw is set once, as the chart is made, and never follows state');
});
