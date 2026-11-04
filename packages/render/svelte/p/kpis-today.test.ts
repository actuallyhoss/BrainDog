/**
 * The `kpis` kind, registered: `Kpis` is on the Svelte entry a host imports, and Today's rows draw what a host hands
 * them, through the component as a page draws it (`Kpis.svelte`).
 *
 * WHAT A TODAY ROW MUST SAY, rendered and not planned: its project and name, the figure in its own currency divided from
 * minor units, its change when no why is given, the why when one is, a stale number's words in the warn colour, and one
 * link to where it opens when the host says where.
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

/* `roadmap-reach.test.ts`'s hook: every `.svelte` and runes module the entry reaches is compiled for the server. */
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

type Props = { kpis: KpiInput[]; form?: 'project' | 'today'; home?: string | null; now?: number; href?: (k: KpiInput) => string | null };
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const entry = async (): Promise<{ Kpis: Component<Props> }> => (await import(new URL('../index.ts', import.meta.url).href)) as { Kpis: Component<Props> };

const NOW = Date.UTC(2026, 8, 3, 12);
const sales: KpiInput = {
  kpi: 'k1',
  name: 'Sales a month',
  project: 'Kiln',
  slot: 'blue',
  unit: 'GBP',
  kind: 'flow',
  every: '1m',
  target: 'GBP 4,000.00',
  points: [
    { at: '2026-06-28', amount: 'GBP 3,900.00' },
    { at: '2026-07-28', amount: 'GBP 4,600.00' },
    { at: '2026-08-28', amount: 'GBP 4,350.00' },
  ],
};
const opens: KpiInput = {
  kpi: 'k2',
  name: 'Open rate',
  project: 'Portage',
  slot: 'teal',
  unit: '%',
  kind: 'share',
  every: '1w',
  points: [
    { at: '2026-08-06', value: 41 },
    { at: '2026-08-13', value: 44 },
    { at: '2026-08-20', value: 43 },
  ],
};
const pinned: KpiInput = { ...opens, kpi: 'k3', name: 'Subscribers', unit: 'subscribers', kind: 'level', why: 'Pinned to Today', points: [{ at: '2026-09-01', value: 512 }] };

const rowsOf = (html: string): string[] => html.match(/<li class="kpi kpi-row"[\s\S]*?<\/li>/gu) ?? [];
const textOf = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();

test('KPIS IS ON THE SVELTE ENTRY, as every kind a host draws is', async () => {
  const { Kpis } = await entry();
  assert.equal(typeof Kpis, 'function');
});

test('A TODAY ROW SAYS ITS PROJECT, ITS NAME AND ITS FIGURE IN ITS OWN CURRENCY, its change with no why, and opens where the host says', async () => {
  const { Kpis } = await entry();
  const { body } = render(Kpis, { props: { kpis: [sales], form: 'today', home: 'GBP', now: NOW, href: () => '/acme/p/kiln' } });
  const [row] = rowsOf(body);
  assert.ok(row);
  const said = textOf(row);
  assert.match(said, /Kiln Sales a month/u);
  /* MINOR UNITS DIVIDED ONCE: £4,350 for 435,000 pence, never 435,000 and never £43.50. */
  assert.match(said, /£4,350/u);
  /* A TODAY ROW SAYS WHICH PERIOD A FLOW'S FIGURE IS OF, in place of the one its change is against (20911d584). */
  assert.match(said, /Down 5\.4% in Aug/u);
  /* ONE LINK, over the project and the name, to where the row opens. */
  assert.equal((row.match(/<a /gu) ?? []).length, 1);
  assert.match(row, /<a class="kpi-open" href="\/acme\/p\/kiln">/u);
  /* THE PROJECT'S COLOUR IS ITS SLOT, set on the row. */
  assert.match(row, /--chart-1:var\(--cat-blue\)/u);
  assert.ok(!/kpi-stale-said/u.test(row), 'a number that arrived this month is not stale');
});

test('A STALE ROW SAYS SO IN THE WARN COLOUR, a pin says why it is there, and with no href the row is no link', async () => {
  const { Kpis } = await entry();
  const { body } = render(Kpis, { props: { kpis: [pinned, opens], form: 'today', home: 'GBP', now: NOW } });
  const [pin, stale] = rowsOf(body);
  assert.match(textOf(pin!), /Pinned to Today/u);
  /* LAST READ ON 20 AUG, EVERY WEEK: two weeks and more is stale, said in words beside the clock. */
  assert.match(stale!, /<p class="kpi-stale-said">/u);
  assert.match(textOf(stale!), /Not updated since 20 Aug/u);
  assert.match(stale!, /data-state="stale"/u);
  assert.ok(!/<a /u.test(body));
});
