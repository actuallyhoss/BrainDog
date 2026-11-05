/**
 * The home page after the redesign: its words, and the page the
 * build writes from them.
 *
 * THE WORDS ARE THE REVIEW'S, with the spec's changes. `copy/home.ts` holds them at the key paths the claims ledger
 * reads, with no em dash and none of the words a reader never meets (`docs/54-WRITING.md`), but for the one quiet link
 * and the one answer that name the protocol for a developer. No paid plan is named while billing is off.
 *
 * THE BUILT PAGE reads completely with scripting off: one h1, the seven bands in order with everything they draw already
 * in the HTML, the makers by name, no picture, and no solid red but the start button. Those checks read
 * `apps/site/build` and skip, saying why, until it has been built.
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

test('home.ts holds the words of the site story at the key paths the ledger reads', () => {
  assert.equal(home.hero.title, 'Your agents keep track. You make the calls.');
  assert.equal(
    home.hero.sub,
    'One place for your projects, decisions and money. Every agent reads it before it starts and writes down what it did. Money, keys and deletes wait for your yes.',
  );
  assert.equal(home.hero.secondary, 'Connect your agents');
  /* No makers' row (4 November, the owner: "just say agents"). */
  assert.ok(!('makers' in home.hero) && !('works' in home.hero));
  assert.equal(home.who.title, 'How it works');
  assert.deepEqual(
    [home.who.small.title, home.who.build.title, home.who.life.title],
    ['Connect your agents', 'They keep track', 'You make the calls'],
  );
  assert.deepEqual([home.who.small.href, home.who.build.href, home.who.life.href], ['/agents', '/agents', '/docs/use/decide']);
  assert.equal(home.chores.title, "Agents ask until they've earned your trust.");
  assert.equal(
    home.chores.say,
    'A new agent asks before every change to your work. Keep ten of its changes of one kind and BrainDog offers to let it do that kind alone. One undo puts it back to asking.',
  );
  assert.equal(
    home.chores.floor,
    'Deletes, money, keys and sharing always ask. You can let your own agents skip that, but reading a key, giving BrainDog away and deleting it stay yours.',
  );
  assert.equal(home.tools.title, 'Every agent knows what the others did.');
  assert.equal(
    home.tools.say,
    'They all read the same page: the next step, what was decided and why, and the dead ends. What one agent learns on Monday, the next one knows on Tuesday.',
  );
  assert.equal(home.slash.title, 'Or just ask BrainDog.');
  assert.equal(home.yours.title, 'It stays yours.');
  assert.deepEqual(home.yours.points.map((p) => p.text), [
    'Every change carries a name, person or agent, and an undo.',
    'See which agents are working, and pause or stop one from any browser.',
    'Agents use your keys without ever seeing them.',
  ]);
  assert.equal(home.free.title, 'Start today, for free.');
  assert.equal(home.faq.questions.length, 9);
  assert.ok(!('closing' in home), 'home has no recap close (site F1)');
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

test('the built home page has one h1, the headline', when(NO_BUILD), () => {
  const h1s = [...page().matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1, 'one h1');
  assert.equal(text(h1s[0]![1]!).trim(), 'Your agents keep track. You make the calls.');
  assert.match(h1s[0]![0], /\bid="hero-title"/, 'the h1 is #hero-title, which scripts/product.mjs reads');
});

test('the hero is section.hero with the headline and the .sub sentence', when(NO_BUILD), () => {
  const html = page();
  const hero = html.match(/<section\b[^>]*class="[^"]*\bhero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(hero, 'section.hero');
  assert.match(hero[0], /id="hero-title"/);
  assert.match(hero[0], /class="[^"]*\bsub\b[^"]*"[^>]*>\s*(<!--[^>]*-->)?\s*One place for your projects/);
});

test('the six bands and the ask, in order, and no close after them', when(NO_BUILD), () => {
  const said = text(page());
  /* "IT STAYS YOURS" IS THE TRUST BAND'S, the questions are the pricing page's (plan F12, 1 Nov), and the order is the
     site story's (3 Nov): how it works, then the band that sells the product. */
  const order = [home.who.title, home.tools.title, home.chores.title, home.money.title, home.together.title, home.slash.title, home.free.title];
  let at = 0;
  for (const heading of order) {
    const found = said.indexOf(heading, at);
    assert.ok(found >= 0, `"${heading}" is on the page after the one before it`);
    at = found + heading.length;
  }
  assert.equal([...page().matchAll(/<section\b[^>]*class="[^"]*\bband--/g)].length, 7, 'seven section.band');
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

test('with scripting off, every band says what it draws', when(NO_BUILD), async () => {
  const { ASKED, EVIDENCE, HANDLED, NEEDS, NOTES, ASKS, FOUNDER } = await import('../src/lib/demo/maya.ts');
  const { DESK } = await import('../src/lib/desk/words.ts');
  const said = text(page());
  /* TODAY OPENS ON THE GREETING ALONE since 30 October (DIRECTION §51), where it read a line of counts. */
  assert.ok(said.includes(DESK.greet(9, FOUNDER.short)), "Today's greeting, in plain text");
  for (const n of NEEDS) assert.ok(said.includes(n.ask), `the desk's ask "${n.ask}"`);
  assert.ok(said.includes(EVIDENCE.inv.head), "the first need's facts are there");
  for (const n of NOTES) assert.ok(said.includes(n.text), `the note "${n.text}"`);
  for (const n of ASKED) assert.ok(said.includes(n.ask), `the chores band's ask "${n.ask}"`);
  for (const h of HANDLED) assert.ok(said.includes(h.text), `the chore "${h.text}"`);
  assert.ok(said.includes(ASKS[0]!.q), "the Slash band's first question");
  assert.ok(said.includes(home.chores.floor), 'the floor');
  for (const p of home.yours.points) assert.ok(said.includes(p.text), `what keeps it yours: "${p.text}"`);
});
