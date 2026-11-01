/**
 * The Slash page and the drawing of Slash that the home card, the desk's bar and this page share.
 *
 *   node --test apps/site/test/slash-page.test.ts
 *
 * FOUR THINGS HOLD. The page's words are the early access copy, with the
 * count of asks read off `plans.ts` and no word the writing guide refuses. Every answer the made-up record holds renders
 * on the server whole, the way the prerender writes it, so a reader with scripting off has it. The typing paints the
 * finished frame at once under reduced motion and sets no timer. And the built `slash.html` has its one h1, the three
 * modes, how asks are counted and the first answer's figure in plain text, and the home page's Slash band is that
 * first answer: those parts read `build/`, and a missing build is a skip that says so.
 *
 * THE COMPONENTS ARE COMPILED INTO THE TEMP DIRECTORY with `svelte/compiler`, as `src/lib/Decide.test.ts` does, each
 * `.svelte` it imports compiled beside it and each `.ts` module pointed back at its source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { slashDrawing, slashPage } from '../src/lib/copy/slash.ts';
import { ASKS, FINDS, MAKES } from '../src/lib/demo/maya.ts';
import { TABLE } from '../src/lib/plans.ts';
import { typeInto, type Clock, type Frame } from '../src/lib/slash/typing.ts';
import { BUILD, missing, when } from './built.ts';

const SITE = new URL('../', import.meta.url);
const SLASH = new URL('../src/lib/slash/', import.meta.url);

/** Every string a value holds, functions called with a sample so their sentences are read too. */
const strings = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : typeof v === 'number'
      ? []
      : typeof v === 'function'
        ? strings((v as (x: unknown) => unknown)(typeof v.length === 'number' && v.length ? 4 : undefined))
        : v && typeof v === 'object'
          ? Object.values(v).flatMap(strings)
          : [];

/* THE WRITING GUIDE'S NEVER-WORDS (docs/54-WRITING.md), and Spark, which is Slash now (test/slash.test.ts). */
const NEVER: readonly RegExp[] = [
  /\brows?\b/i,
  /\blist items?\b/i,
  /\bentit(?:y|ies)\b/i,
  /\bregisters?\b/i,
  /\bschemas?\b/i,
  /\bslugs?\b/i,
  /\bMCP\b/,
  /\bpacks?\b/i,
  /\bcredentials?\b/i,
  /\bsnapshots?\b/i,
  /spark(?!line)/i,
];

test("the page's words are the early access copy, and its one count of questions is the plan table's", () => {
  assert.equal(slashPage.head.title, 'Slash knows your whole business.');
  assert.deepEqual(
    [slashPage.ask.title, slashPage.find.title, slashPage.make.title, slashPage.tally.title, slashPage.agents.title, slashPage.faq.title],
    ['Ask', 'Find', 'Make', 'How questions are counted', 'Slash and your AI tools', 'Questions'],
  );
  assert.ok(!('close' in slashPage), 'the page ends on the early access strip, not a close of its own (site F11)');
  assert.equal(slashPage.faq.questions.length, 4);
  assert.equal(slashPage.agents.lines.length, 4);
  /* No paid plan is named while billing is off: one count, the early access month. */
  assert.ok(slashPage.tally.say.includes(`Free includes ${TABLE.free.credits} Slash questions a month`));
  for (const plan of [TABLE.hosted.name, TABLE.plus.name]) assert.ok(!strings(slashPage).some((s) => s.includes(plan)), `the page names ${plan}`);
  assert.equal(slashDrawing.modes.ask.note, `One question each time. Free has ${TABLE.free.credits} a month.`);
  assert.ok(slashPage.ask.body.some((p) => p.includes('Every figure opens what it came from')));
});

test('no word on the page or in the drawing is an em dash or a word the writing guide refuses', () => {
  for (const s of [...strings(slashPage), ...strings(slashDrawing)]) {
    assert.ok(!s.includes('\u2014'), `an em dash in "${s}"`);
    for (const never of NEVER) assert.ok(!never.test(s), `"${s}" says ${never}`);
  }
});

/* ---- the server render ---- */

const resolveFrom = (spec: string): string => import.meta.resolve(spec, SITE.href);

/** Compiles `name.svelte` in `from` and every component it imports into `dir`, returning the compiled file's path. */
async function compileTree(from: URL, dir: string, done: Map<string, string> = COMPILED): Promise<string> {
  const key = from.href;
  const had = done.get(key);
  if (had) return had;
  const { compile } = await import(resolveFrom('svelte/compiler'));
  const out = join(dir, `c${done.size}.js`);
  done.set(key, out);
  const { js } = compile(readFileSync(from, 'utf8'), { generate: 'server', filename: from.pathname });
  let code = js.code as string;
  const deps: [string, URL][] = [];
  code = code.replace(/from ['"]([^'"]+)['"]/g, (whole: string, spec: string) => {
    if (spec.startsWith('svelte') || spec.startsWith('@braindog/')) return `from '${resolveFrom(spec)}'`;
    if (spec.startsWith('.') && spec.endsWith('.svelte')) {
      const url = new URL(spec, from);
      deps.push([spec, url]);
      return `from '__DEP__${url.href}'`;
    }
    if (spec.startsWith('.')) return `from '${new URL(spec, from).href}'`;
    return whole;
  });
  for (const [, url] of deps) {
    const file = await compileTree(url, dir, done);
    code = code.replaceAll(`__DEP__${url.href}`, pathToFileURL(file).href);
  }
  writeFileSync(out, code);
  return out;
}

const DIR = mkdtempSync(join(tmpdir(), 'slash-page-'));
const COMPILED = new Map<string, string>();

async function render(name: string, props: Record<string, unknown>): Promise<string> {
  const file = await compileTree(new URL(`${name}.svelte`, SLASH), DIR);
  const { default: Component } = await import(pathToFileURL(file).href);
  const { render: ssr } = await import(resolveFrom('svelte/server'));
  return ssr(Component, { props }).body as string;
}

/** What a reader is shown: tags and Svelte's markers gone, entities decoded, runs of space as one. */
const text = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

const figures = (parts: readonly (string | { text: string })[]): string[] => parts.flatMap((p) => (typeof p === 'string' ? [] : [p.text]));

test('every answer the made-up record holds renders on the server, whole', async () => {
  for (const [at, a] of ASKS.entries()) {
    const said = text(await render('Answer', { mode: 'ask', at }));
    for (const f of figures(a.lead)) assert.ok(said.includes(f), `Ask ${at} lost its figure ${f}`);
    assert.ok(said.includes(a.read), `Ask ${at} lost "${a.read}"`);
    for (const b of a.bars ?? []) assert.ok(said.includes(b.label), `Ask ${at} lost the bar ${b.label}`);
    if (a.spark) assert.ok(said.includes(a.spark.big), `Ask ${at} lost "${a.spark.big}"`);
  }
  for (const [at, f] of FINDS.entries()) {
    const html = await render('Answer', { mode: 'find', at });
    const said = text(html);
    assert.ok(said.includes(f.aside), `Find ${at} lost "${f.aside}"`);
    for (const h of f.hits) assert.ok(said.includes(h.sub) && said.includes(h.kind), `Find ${at} lost the hit ${h.title}`);
    assert.match(html, /<mark\b/i, `Find ${at} marks no match`);
  }
  for (const [at, m] of MAKES.entries()) {
    const said = text(await render('Answer', { mode: 'make', at }));
    assert.ok(said.includes(m.from) && said.includes(m.yes) && said.includes(slashDrawing.notNow), `Make ${at} lost its buttons`);
    if (m.draft) assert.ok(said.includes(m.draft.title) && said.includes(m.draft.foot), `Make ${at} lost its draft`);
    if (m.rule) assert.ok(said.includes(m.rule.sub), `Make ${at} lost its rule`);
  }
});

test("the home page's Slash band is the first Ask, asked and answered, before any script runs", when(missing(['index.html'])), () => {
  const first = ASKS[0]!;
  const html = readFileSync(new URL('index.html', BUILD), 'utf8');
  const at = html.search(/<section\b[^>]*class="[^"]*\bband--slash\b/);
  assert.ok(at >= 0, 'index.html has no Slash band');
  const said = text(html.slice(at, html.indexOf('</section>', at)));
  assert.ok(said.includes(first.q), `the band has no question typed in: ${said.slice(0, 300)}`);
  for (const f of figures(first.lead)) assert.ok(said.includes(f), `the band lost the figure ${f}`);
  assert.ok(!said.includes('\u2014'));
});

test('the Slash page draws each mode small, its question over its answer', async () => {
  for (const [mode, q] of [['ask', ASKS[0]!.q], ['find', FINDS[0]!.q], ['make', MAKES[0]!.q]] as const) {
    const said = text(await render('Mini', { mode }));
    assert.ok(said.includes(q), `the ${mode} drawing lost its question`);
  }
});

/* ---- the typing ---- */

const fakeClock = () => {
  const due: { at: number; fn: () => void; id: number }[] = [];
  let next = 0;
  const clock: Clock = {
    later: (fn, ms) => (due.push({ at: ms, fn, id: next }), next++),
    cancel: (h) => {
      const i = due.findIndex((d) => d.id === h);
      if (i >= 0) due.splice(i, 1);
    },
  };
  const run = () => [...due].sort((a, b) => a.at - b.at || a.id - b.id).forEach((d) => d.fn());
  return { clock, run, due };
};

test('under reduced motion the question and its answer are set at once, and no timer is set', () => {
  const frames: Frame[] = [];
  const clock: Clock = { later: () => assert.fail('a timer was set under reduced motion'), cancel: () => {} };
  typeInto('What do I owe this month?', (f) => frames.push(f), { think: 'Reading your record', reduced: true, clock });
  assert.deepEqual(frames, [{ typed: 'What do I owe this month?', phase: 'answer' }]);
});

test('with motion, it types letter by letter, reads, then answers, and a stop cancels what is left', () => {
  const frames: Frame[] = [];
  const { clock, run } = fakeClock();
  typeInto('dana', (f) => frames.push(f), { think: 'Reading your record', reduced: false, clock });
  run();
  assert.deepEqual(
    frames.map((f) => `${f.phase}:${f.typed}`),
    ['typing:', 'typing:d', 'typing:da', 'typing:dan', 'typing:dana', 'thinking:dana', 'answer:dana'],
  );
  const none: Frame[] = [];
  const f2 = fakeClock();
  typeInto('stripe', (f) => none.push(f), { think: null, reduced: false, clock: f2.clock })();
  assert.equal(f2.due.length, 0, 'a stop left frames to come');
});

/* ---- the built page ---- */

const NO_BUILD = missing(['slash.html']);

test('slash.html has one h1, the three modes, how asks are counted and the first answer in plain text', when(NO_BUILD), () => {
  const html = readFileSync(new URL('slash.html', BUILD), 'utf8');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, 'not one h1');
  const h2s = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1] ?? '').trim());
  for (const h of ['Ask', 'Find', 'Make', 'How questions are counted']) assert.ok(h2s.includes(h), `no "${h}" heading`);
  const said = text(html);
  assert.ok(said.includes(slashPage.head.title));
  assert.ok(said.includes(slashPage.tally.say), 'how asks are counted is not said in plain text');
  for (const f of figures(ASKS[0]!.lead)) assert.ok(said.includes(f), `the first answer's ${f} is not in the page`);
});
