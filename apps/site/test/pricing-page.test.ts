/**
 * The pricing page: its cards follow `LAUNCH.billing`, and every figure it draws is `TABLE`'s.
 *
 *   node --test "apps/site/test/pricing-page.test.ts"
 *
 * WHY THIS TEST (DIRECTION §47, "Honest at launch"). "Extra use says 'coming soon' until a checkout sells it. The paid
 * buttons follow `LAUNCH.billing`." So the page is rendered twice, the way the prerender renders it, once with a copy
 * of `LAUNCH` that has billing on and once with it off: on, "Choose Cloud" and "Choose Cloud Plus" link their plans;
 * off, no paid card links anything and each says "Coming soon" in its button's place. And every figure in the
 * rendered words is one `TABLE` (`plans.ts`, held to `PLAN_TABLE` by `plans.test.ts`) holds, so a figure typed into
 * the page, or a cell moved off its plan, fails here by name.
 *
 * THE RENDER COMPILES THE PAGE AND ITS COMPONENTS INTO THE TEMP DIRECTORY, as the old `Decide.test.ts` did: each
 * `.svelte` file is compiled for the server, its `svelte` imports are pointed at this package's copy, `$lib/...` and
 * relative `.ts` imports at their sources, `.svelte` imports at their compiled neighbours, and `$lib/launch.ts` at a
 * module that exports the test's copy of `LAUNCH`.
 *
 * THE LAST TEST READS THE BUILT PAGE, and skips while there is none, or while the build is older than the page's
 * sources (a stale build is the old page); under `SITE_BUILT=1` it always runs (`built.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HELD as HELD_PATHS, LAUNCH, held } from '../src/lib/launch.ts';
import { PLANS, TABLE, priceOf } from '../src/lib/plans.ts';
import { cardsFor } from '../src/lib/pricing/cards.ts';
import { BUILD, STRICT, missing, when } from './built.ts';

const SRC = new URL('../src/', import.meta.url);
const LIB = new URL('lib/', SRC);
const HERE = import.meta.url;

/** A file under `src/`, compiled for the server into `dir`, with every import pointed where plain Node finds it. */
function compile(dir: string, path: string, launch: string, seen: Set<string>, compiler: { compile: Function }): string {
  const name = path.replace(/[^A-Za-z0-9]+/g, '_') + '.js';
  if (seen.has(path)) return name;
  seen.add(path);
  const source = new URL(path, SRC);
  const { js } = compiler.compile(readFileSync(source, 'utf8'), { generate: 'server', filename: path });
  const code = (js.code as string).replace(/from ['"]([^'"]+)['"]/g, (_: string, spec: string) => {
    if (spec.startsWith('svelte')) return `from '${import.meta.resolve(spec, HERE)}'`;
    if (spec === '$lib/launch.ts' || /(^|\/)launch\.ts$/.test(spec)) return `from '${launch}'`;
    const target = spec.startsWith('$lib/') ? new URL(spec.slice(5), LIB) : new URL(spec, source);
    if (target.pathname.endsWith('.svelte')) return `from './${compile(dir, target.href.slice(SRC.href.length), launch, seen, compiler)}'`;
    return `from '${target.href}'`;
  });
  writeFileSync(join(dir, name), code);
  return name;
}

/** The server render of a page or component under `src/`, with `LAUNCH` as given: its head and its body. */
async function render(path: string, launch: { billing: boolean }, props: Record<string, unknown> = {}): Promise<{ head: string; body: string }> {
  const compiler = await import(import.meta.resolve('svelte/compiler', HERE));
  const { render: ssr } = await import(import.meta.resolve('svelte/server', HERE));
  const dir = mkdtempSync(join(tmpdir(), 'pricing-page-'));
  const flags = join(dir, 'launch.mjs');
  writeFileSync(flags, `export const LAUNCH = ${JSON.stringify({ ...LAUNCH, ...launch })};\n`);
  const file = compile(dir, path, pathToFileURL(flags).href, new Set(), compiler);
  const { default: Component } = await import(pathToFileURL(join(dir, file)).href);
  return ssr(Component, { props }) as { head: string; body: string };
}

/** The words a reader is shown: tags, comments and Svelte's hydration markers out, entities read. */
const words = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Every link in some markup, as `{ href, rel, text }`. */
const links = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: /href="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
    rel: /rel="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
    text: words(m[2]!),
  }));

const PAID = PLANS.filter((p) => p.id !== 'free');

test('the cards follow billing: on, each paid card links its plan; off, it says Coming soon and links nothing', () => {
  for (const card of cardsFor({ billing: true }).filter((c) => c.id !== 'free')) {
    const plan = PAID.find((p) => p.id === card.id)!;
    assert.deepEqual(card.button, { kind: 'link', label: `Choose ${plan.name}`, href: plan.href }, `${plan.name} with billing on`);
  }
  for (const card of cardsFor({ billing: false }).filter((c) => c.id !== 'free'))
    assert.deepEqual(card.button, { kind: 'soon', label: 'Coming soon' }, `${card.name} with billing off`);
  for (const billing of [true, false]) assert.deepEqual(cardsFor({ billing })[0]!.button, { kind: 'start' }, 'Free is not the shell’s Start free');
});

test('rendered with billing on, Choose Cloud and Choose Cloud Plus link their plans, and nothing says Coming soon on a card', async () => {
  const { body } = await render('lib/pricing/Plans.svelte', { billing: true });
  const paid = links(body).filter((a) => a.text.startsWith('Choose'));
  assert.deepEqual(
    paid.map((a) => [a.text, a.href, a.rel]),
    PAID.map((p) => [`Choose ${p.name}`, p.href, 'external']),
    'with billing on the paid cards do not link their plans',
  );
  assert.doesNotMatch(words(body), /Coming soon/, 'with billing on a card still says Coming soon');
});

test('rendered with billing off, no paid card links anything, each says Coming soon, and Free keeps Start free', async () => {
  const { body } = await render('lib/pricing/Plans.svelte', { billing: false });
  const hrefs = links(body).map((a) => a.href);
  for (const plan of PAID) assert.ok(!hrefs.includes(plan.href), `${plan.name} links ${plan.href} while billing is off`);
  assert.ok(!links(body).some((a) => a.text.startsWith('Choose')), 'a Choose button is drawn while billing is off');
  assert.equal(words(body).match(/Coming soon/g)?.length, PAID.length, 'each paid card does not say Coming soon once');
  assert.match(body, /<p class="soon[^"]*">Coming soon<\/p>/, 'Coming soon is not plain text in the button’s place');
  assert.ok(links(body).some((a) => a.text === 'Start free'), 'Free has no Start free');
  assert.ok(links(body).some((a) => a.text === 'Open BrainDog'), 'Free has no Open BrainDog for a visitor signed in');
  assert.match(body, /class="when-out[^"]*">Start here</, 'Free’s tag does not say Start here signed out');
  assert.match(body, /class="when-in[^"]*">Your plan</, 'Free’s tag does not say Your plan signed in');
});

/** Every figure `TABLE` gives the page, as the page writes it: a price, a count, megabytes, gigabytes and hours. */
const HELD = (() => {
  const rows = [TABLE.free, TABLE.hosted, TABLE.plus];
  const n = (x: number) => x.toLocaleString('en-US');
  const cost = Object.values(TABLE.hosted.extra!);
  return new Set<string>([
    ...rows.map((r) => r.price.month),
    ...rows.flatMap((r) => [r.agents, r.credits, r.allowance.runs, r.allowance.requests].map(n)),
    ...rows.map((r) => r.allowance.bytes).map((b) => (b < 1e9 ? n(b / 1e6) : n(b / 1e9))),
    ...rows.map((r) => n(r.allowance.ms / 3_600_000)),
    ...cost.map((c) => priceOf(c.cents)),
    ...cost.map((c) => c.per).filter((per) => per !== 1e9).map((per) => (per % 3_600_000 === 0 && per < 1e9 ? n(per / 3_600_000) : n(per))),
  ]);
})();

/** Every figure in some words: a `$` price or a bare count, as written. */
const figures = (text: string): string[] => [...text.matchAll(/\$?\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/[.,]$/, ''));

test('every figure on the page is TABLE’s, with billing on and off', async () => {
  for (const billing of [true, false]) {
    const { body } = await render('routes/pricing/+page.svelte', { billing });
    const said = figures(words(body));
    assert.ok(said.length > 30, `the page says only ${said.length} figures, so the check read nothing`);
    assert.deepEqual(said.filter((f) => !HELD.has(f)), [], `with billing ${billing ? 'on' : 'off'} the page says a figure TABLE does not hold`);
    for (const plan of PLANS) assert.ok(said.includes(plan.price), `${plan.name}'s ${plan.price} is not on the page`);
  }
  /* THE PLANTED FAULT: the roadmap's old Cloud Plus runs, and a price no plan has, are seen. */
  assert.deepEqual(figures('60,000 runs and $14').filter((f) => !HELD.has(f)), ['60,000', '$14']);
});

test('the page draws one h1 with no price, the three plans, the seven meters, and asks about cancelling only with billing on', async () => {
  const off = await render('routes/pricing/+page.svelte', { billing: false });
  const on = await render('routes/pricing/+page.svelte', { billing: true });
  const h1 = [...off.body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => words(m[1]!));
  assert.deepEqual(h1, ['Free for one person.'], 'the page does not have one h1, Free’s');
  assert.equal((off.body.match(/<tr\b/g) ?? []).length, 1 + 7 + 1 + 4, 'the two tables are not a header and seven meters, and a header and four prices');
  /* The cap is a promise about a checkout that is not sold yet, so it is said only with billing on (`extra-use-capped`). */
  assert.match(words(off.body), /Extra use, if you want it Coming soon\./);
  assert.doesNotMatch(words(off.body), /monthly cap/, 'the page promises a cap on extra use while nothing is sold');
  assert.match(words(on.body), /Off by default\. Turn it on with a monthly cap, and BrainDog never goes past it\. Coming soon\./);
  assert.doesNotMatch(words(off.body), /Can I cancel any time\?/, 'the page asks about cancelling while nothing is sold');
  assert.match(words(on.body), /Can I cancel any time\?/, 'with billing on the page does not ask about cancelling');
  assert.match(off.head, /<title>/, 'the page writes no title');
});

/* THE BUILT PAGE. A build older than the page's sources is the old page, so it is skipped unless the step says it just built. */
const SOURCES = ['routes/pricing/+page.svelte', 'lib/pricing/Plans.svelte', 'lib/pricing/cards.ts', 'lib/copy/pricing.ts'];
const page = new URL('pricing.html', BUILD);
const stale = (): string | null =>
  !STRICT && existsSync(page) && SOURCES.some((s) => statSync(new URL(s, SRC)).mtimeMs > statSync(page).mtimeMs)
    ? 'the built pricing.html is older than the pricing page’s sources: it is the page before this one'
    : null;

/* WHILE THE PAGE IS HELD the build writes no pricing.html (`HELD` in launch.ts), so there is nothing built to read. */
const HIDDEN = held() && (HELD_PATHS as readonly string[]).includes('/pricing');

test('the built pricing page: one h1 with no $, three plan names, and the seven meters', HIDDEN ? { skip: 'the pricing page is held until BrainDog is priced' } : when(missing(['pricing.html']) ?? stale()), () => {
  const html = readFileSync(page, 'utf8');
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => words(m[1]!));
  assert.equal(h1.length, 1, `pricing.html has ${h1.length} h1`);
  assert.doesNotMatch(h1[0]!, /\$/, 'the h1 carries a price, and Free leads');
  const text = words(html);
  for (const plan of PLANS) assert.ok(text.includes(plan.name), `pricing.html does not name ${plan.name}`);
  for (const meter of ['Agents connected', 'Questions and drafts from Slash', 'People on the record', 'Automation runs', 'Requests to other services', 'Data fetched', 'Script time'])
    assert.ok(text.includes(meter), `pricing.html has no "${meter}" row`);
});
