/**
 * Every name in `contract.ts` is written by BOTH renderers, and the page names by the web app.
 *
 * ONE WRITE-UP THAT DRAWS EVERY NAME, through `toHTML` and through the Svelte drawers compiled and rendered on the
 * server (the hooks `parity.test.ts` uses), and the classes and attributes each side wrote are gathered off the markup.
 * A renderer that stops writing a name fails here with the name and the side, which is the failure a gate reading the
 * page would otherwise have been quiet about. The last test proves the check is not vacuous.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { ATTRS, CLASSES, PAGE, SELECT } from './contract.ts';
import { parse, type Segment } from './parse.ts';
import { toHTML } from './html.ts';

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

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the files. */
const drawer = async (name: string): Promise<Component<Record<string, unknown>>> =>
  ((await import(new URL(`../svelte/${name}.svelte`, import.meta.url).href)) as { default: Component<Record<string, unknown>> }).default;
const Block = await drawer('Block');
const Markdown = await drawer('Markdown');
const Degraded = await drawer('Degraded');

/** The write-up: one line of prose with every inline form, then one of each block the contract names a part of. */
const SPECIMEN = [
  'Due {{date:2026-10-01}}, {{money:500 UYW}}, loosely {{pct:12 %}}, {{nope.path}}, {verified: bank} {{icon:sun}} `x`, {{bad:two weeks late}}.',
  '```note | Heads up\nPlain words.\n```',
  '```stat\nCash | GBP 12.00 | in 2 accounts | | good\nCash now | EGP 43,700.00 · £24,800.00\n```',
  '```chips\nLate | 2 | late\n```',
  /* TWO ROWS THAT HAVE A BAR: a bar of one compares nothing and draws no track (8a2ad40fc). */
  '```bar\nA | 3\nB | many\nC | 2\n```',
  '```ring\nA | 3\nB | 2\n```',
  '```heat who\nAmara | 2026-10-01\n```',
  '```stat\n' + Array.from({ length: 7 }, (_, i) => `Row ${i + 1} | ${i}`).join('\n') + '\n```',
].join('\n\n');

/** The Svelte side, segment by segment, as `Document.svelte` draws a document. */
function svelteOf(segments: Segment[]): string {
  return segments
    .map((s) =>
      s.type === 'block'
        ? render(Block, { props: { block: s } }).body
        : s.type === 'degraded'
          ? render(Degraded, { props: { segment: s } }).body
          : render(Markdown, { props: { segment: s, opts: {} } }).body,
    )
    .join('');
}

/** The classes and the attribute names a stretch of markup wrote. */
function namesIn(html: string): { classes: Set<string>; attrs: Set<string> } {
  const classes = new Set([...html.matchAll(/ class="([^"]*)"/gu)].flatMap((m) => m[1]!.split(/\s+/u).filter(Boolean)));
  const attrs = new Set([...html.matchAll(/ (data-[a-z-]+)(?:=|[\s>])/gu)].map((m) => m[1]!));
  return { classes, attrs };
}

/** What the contract names and this markup does not write, as words a failure can say. */
function missing(html: string): string[] {
  const { classes, attrs } = namesIn(html);
  return [
    ...Object.entries(CLASSES).filter(([, c]) => !classes.has(c)).map(([k, c]) => `class "${c}" (${k})`),
    ...Object.entries(ATTRS).filter(([, a]) => !attrs.has(a)).map(([k, a]) => `attribute ${a} (${k})`),
  ];
}

const segments = parse(SPECIMEN, { page: true });

test('THE WRITE-UP PARSES AS IT IS MEANT TO: prose, six blocks and one fence for the stat of seven rows', () => {
  assert.deepEqual(
    segments.map((s) => s.type),
    ['markdown', 'block', 'block', 'block', 'block', 'block', 'block', 'degraded'],
  );
});

test('`toHTML` writes every class and attribute the contract names', () => {
  assert.deepEqual(missing(toHTML(segments)), [], 'the static renderer stopped writing a name tests and gates read');
});

test('the Svelte drawers write every class and attribute the contract names', () => {
  assert.deepEqual(missing(svelteOf(segments)), [], 'the Svelte renderer stopped writing a name tests and gates read');
});

test('the web app writes every page name: the tab strip and the two columns', () => {
  const app = (f: string): string => readFileSync(fileURLToPath(new URL(`../../../apps/web/src/lib/page/${f}`, import.meta.url)), 'utf8');
  const tabs = app('PageTabs.svelte');
  const body = app('PageBody.svelte');
  const { classes } = namesIn(tabs + body);
  for (const c of [PAGE.tabs, PAGE.tab, PAGE.tabMore, PAGE.tally, PAGE.area]) assert.ok(classes.has(c), `the app stopped writing class "${c}"`);
  assert.ok(body.includes(`${PAGE.areaAttr}="main"`) && body.includes(`${PAGE.areaAttr}="rail"`), `the columns lost ${PAGE.areaAttr}`);
  assert.ok(body.includes(`${PAGE.areaSpan}:`), `the columns lost ${PAGE.areaSpan}`);
});

test('the selectors are made of the names: a kind, a form, an evidence tag and a column', () => {
  assert.equal(SELECT.block('stat'), '.block[data-kind="stat"]');
  assert.equal(SELECT.typed('money'), '.typed[data-form="money"]');
  assert.equal(SELECT.evidence('verified'), '.evidence[data-evidence="verified"]');
  assert.equal(SELECT.column('rail'), '.area[data-area="rail"]');
  assert.equal(SELECT.degradedFix, '.block-degraded .degraded-fix');
});

test('and the check is not vacuous: a renderer that stops writing a name is told apart, by name', () => {
  const html = toHTML(segments);
  assert.deepEqual(missing(html.replaceAll('class="cell-note"', 'class="cell-aside"')), ['class "cell-note" (cellNote)']);
  assert.deepEqual(missing(html.replaceAll(' data-evidence=', ' data-tag=')), ['attribute data-evidence (evidence)']);
});
