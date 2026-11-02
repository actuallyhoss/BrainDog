/**
 * The home page after the redesign: its words, and the page the
 * build writes from them.
 *
 * THE WORDS ARE THE REVIEW'S, with the spec's changes. `copy/home.ts` holds them at the key paths the claims ledger
 * reads, with no em dash and none of the words a reader never meets (`docs/54-WRITING.md`), but for the one quiet link
 * and the one answer that name the protocol for a developer. No paid plan is named while billing is off.
 *
 * THE BUILT PAGE reads completely with scripting off: one h1, the hero and five sections in order with everything they
 * draw already in the HTML (the redo of 2 November), the makers by name, no picture, and no solid red but the start
 * button. Those checks read `apps/site/build` and skip, saying why, until it has been built.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { home } from '../src/lib/copy/home.ts';
import { APP_NAMES, CODEX_LISTED } from '../src/lib/agents.ts';
import { BUILD, missing, when } from './built.ts';

const NO_BUILD = missing(['index.html'], 'the home page checks read the built page');

/** Every string a reader can meet in `home`, the functions said with a sample figure. */
function strings(value: unknown, path = 'home'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') return [[path, String((value as (x: never) => unknown)(3 as never))]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}.${i}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

/* The words the site never says in prose (docs/54-WRITING.md), whole words and either case. */
const NEVER = /\b(rows?|list items?|entit(?:y|ies)|register|schemas?|slugs?|MCP|packs?|credentials?|snapshots?)\b/i;

test('home.ts holds the words of the redo at the key paths the ledger reads', () => {
  assert.equal(home.hero.title, 'Give your business a memory.');
  assert.equal(home.hero.sub, 'One place that remembers your work, your money and your life, and tells you what needs you today. Your AI tools read from it too.');
  assert.equal(home.hero.secondary, 'Connect your AI tools');
  assert.deepEqual(
    home.hero.makers.map((m) => m.name),
    APP_NAMES,
  );
  assert.equal(home.filing.title, 'It does the filing. You make the calls.');
  assert.equal(
    home.filing.say,
    'Payments, receipts and notes are filed on their own, each with a reason and an undo. Only what needs a person waits for you.',
  );
  assert.equal(home.filing.floor.say, 'Money, keys, sharing and deletes always wait for your yes. No rule and no AI tool can change that.');
  assert.equal(home.tools.title, 'Your AI tools share one memory.');
  assert.match(home.tools.say, /start from your brief and leave a note when they're done\. Nothing gets explained twice\.$/);
  assert.equal(home.tools.slash.title, 'Or ask BrainDog itself');
  assert.equal(home.money.title, 'Your money, in one place.');
  assert.equal(home.yours.title, 'It stays yours.');
  assert.deepEqual(home.yours.points.map((p) => p.text), [
    'Every change has a name on it, and an undo.',
    'Export everything as one file, any time.',
    'AI tools use your keys without ever seeing them.',
    "Nothing is shared between customers, so no one else's search can reach yours.",
    'Sign in with your email, Google or a passkey. No password to steal.',
    'A sealed copy every night, to a key kept outside Cloudflare.',
  ]);
  assert.equal(home.free.title, 'Free while in early access.');
  assert.equal(home.faq.questions.length, 6);
  assert.ok(!('closing' in home), 'home has no recap close (site F1)');
  assert.ok(!('who' in home) && !('chores' in home) && !('slash' in home), 'the bands of 1 November are gone');
});

/* THE ONE LINK AND THE ONE ANSWER THAT NAME THE PROTOCOL, for the developer who came for it (site 2a sections 4 and 7). */
const FOR_DEVELOPERS = new Set(['home.tools.dev', 'home.faq.questions.2.a']);

test('the home words hold no em dash and none of the never-words', () => {
  for (const [path, said] of strings(home)) {
    assert.ok(!said.includes('—'), `${path} holds an em dash: ${said}`);
    if (FOR_DEVELOPERS.has(path)) continue;
    assert.ok(!NEVER.test(said), `${path} says ${said.match(NEVER)?.[0]}: ${said}`);
  }
});

test('the hero sentence names no mechanism', () => {
  assert.doesNotMatch(home.hero.sub, /\b(events?|logs?|rows?|MCP|ledger)\b/i);
});

test('the home page draws no plans while the pricing page is held', () => {
  assert.ok(!('plans' in home), 'home.ts holds a plans band');
  const page = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /\/pricing|Plans\.svelte/, 'the home page links the held pricing page or draws its cards');
});

/** The built home page, and its readable text: tags and Svelte's markers out, entities said, spaces closed up. */
const page = (): string => readFileSync(new URL('index.html', BUILD), 'utf8');
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
const text = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/\s+/g, ' ');

test('the built home page has one h1, the slogan', when(NO_BUILD), () => {
  const h1s = [...page().matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1, 'one h1');
  assert.equal(text(h1s[0]![1]!).trim(), 'Give your business a memory.');
  assert.match(h1s[0]![0], /\bid="hero-title"/, 'the h1 is #hero-title, which scripts/product.mjs reads');
});

test('the hero is section.hero with the slogan and the .sub sentence', when(NO_BUILD), () => {
  const html = page();
  const hero = html.match(/<section\b[^>]*class="[^"]*\bhero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(hero, 'section.hero');
  assert.match(hero[0], /id="hero-title"/);
  assert.match(hero[0], /class="[^"]*\bsub\b[^"]*"[^>]*>\s*(<!--[^>]*-->)?\s*One place that remembers your work/);
});

test('the five sections after the hero, in order, and no close after them', when(NO_BUILD), () => {
  const said = text(page());
  /* THE QUESTIONS ARE THE PRICING PAGE'S (plan F12, 1 Nov). */
  const order = [home.filing.title, home.tools.title, home.money.title, home.yours.title, home.free.title];
  let at = 0;
  for (const heading of order) {
    const found = said.indexOf(heading, at);
    assert.ok(found >= 0, `"${heading}" is on the page after the one before it`);
    at = found + heading.length;
  }
  assert.equal([...page().matchAll(/<section\b[^>]*class="[^"]*\bsection\b/g)].length, 5, 'five section.section');
  assert.doesNotMatch(page(), /\bband--/, 'no band of its own ground: every section is on the board');
  assert.doesNotMatch(said, /Start your record\./, 'the recap close is gone');
});

test('the makers are named, and the page draws no picture', when(NO_BUILD), () => {
  const html = page();
  const said = text(html);
  for (const name of APP_NAMES) assert.ok(said.includes(name), name);
  if (!CODEX_LISTED) assert.doesNotMatch(said, /codex/i, 'the page names Codex while CODEX_LISTED is off');
  assert.doesNotMatch(html, /<img\b/i);
});

test('the only solid red button in the served page is the start button', when(NO_BUILD), () => {
  for (const m of page().matchAll(/<(\w+)\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const classes = m[2]!.split(/\s+/);
    if (!(classes.includes('btn') && classes.includes('red'))) continue;
    assert.equal(m[1], 'a', `a solid red ${m[1]}`);
    assert.match(text(m[3]!).trim(), /^(Get early access|Start free|Open BrainDog)$/, `a solid red button says "${text(m[3]!).trim()}"`);
  }
});

test('with scripting off, every section says what it draws', when(NO_BUILD), async () => {
  const { ASKED, HANDLED, NEEDS, NOTES, ASKS, FOUNDER } = await import('../src/lib/demo/maya.ts');
  const { today } = await import('../src/lib/copy/product.ts');
  const said = text(page());
  /* TODAY OPENS ON THE GREETING, the morning's in the prerendered page. */
  assert.ok(said.includes(today.greet(9, FOUNDER.short)), "Today's greeting, in plain text");
  for (const n of NEEDS) assert.ok(said.includes(n.what), `Needs you's "${n.what}"`);
  for (const n of NOTES) assert.ok(said.includes(n.text), `the note "${n.text}"`);
  assert.ok(said.includes(ASKED[0]!.ask), `the first question that waits, "${ASKED[0]!.ask}"`);
  for (const h of HANDLED) assert.ok(said.includes(h.text), `the filing "${h.text}"`);
  assert.ok(said.includes(ASKS[0]!.q), "Slash's first question");
  assert.ok(said.includes(home.filing.floor.say), 'the floor');
  for (const p of home.yours.points) assert.ok(said.includes(p.text), `what keeps it yours: "${p.text}"`);
});
