/**
 * A feed under a heading for each day, and a run's work as one line with its fold's words.
 *
 * The contract is two cells the host writes: a row whose first cell is `day` is a heading and its second cell the
 * heading's words, as the `seen` row is a marker; and a row's sixth cell is the words of its fold ("and 39 more").
 * The plan is tested as a function, and the two drawers as trees, compiled the way `parity.test.ts` compiles them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';
import { FEED_DAY, FEED_EARLIER, feedFault, feedFold, feedPlan } from './feed.ts';

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

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)]
        .map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!))
        .sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const rows = (...lines: string[]) => lines.map((l) => ({ cells: l.split('|').map((c) => c.trim()) }));

/**
 * The line a run's work is folded into, with its fold's words in the sixth cell. Written onto the parsed block, as the
 * host writes it onto the block it builds, so this file does not wait on the dialect's width for a feed row.
 */
function folded(block: BlockSegment, what: string, words: string): BlockSegment {
  const row = block.rows.find((r) => (r.cells[3] ?? '').includes(what));
  assert.ok(row, `no line says "${what}"`);
  row.cells[5] = words;
  return block;
}

const THREE_DAYS =
  '```feed\nday | Today\nagent | Claude | 40 | saves on [Variable axis QA](/r/things/4) | 3h ago\nyou | Sam |  | paid the printer | 5h ago\n' +
  'seen | 6h ago\nrule |  |  | Tallyard categorised | 9h ago | warn\nday | Yesterday\nrule | Late fees | 2 | reminders sent | 1d ago\n' +
  'day | Mon 12 Oct\nyou | Sam |  | closed the quote | 2d ago\n```';

const threeDays = (): BlockSegment => folded(page(THREE_DAYS), 'saves on', 'and 39 more');

test('`feedFault` takes a `day` row, and still refuses a first word it does not know', () => {
  assert.equal(feedFault([['day', 'Today'], ['agent', 'Claude', '2', 'saves', 'now'], ['seen', '2h ago'], ['day', 'Yesterday'], ['you', 'Sam', '', 'paid', '1d ago']]), null);
  assert.match(feedFault([['day', 'Today'], ['week', 'Claude']]) ?? '', /starts "week"/u);
  assert.match(feedFault([['week', 'Claude']]) ?? '', /agent, rule, you/u, 'the sentence still names what goes there');
  assert.match(feedFault([['day', 'Today'], ['week', 'x']]) ?? '', /day/u, 'and now names the heading word too');
  assert.equal(feedFault([['seen', 'a'], ['day', 'Today'], ['seen', 'b']]), 'more than one seen row');
});

test('`feedFault` refuses a `day` row that names no day, which would be a heading with no words', () => {
  assert.match(feedFault([['day', ' '], ['you', 'Sam', '', 'paid', 'now']]) ?? '', /day row/u);
  assert.match(feedFault([['day']]) ?? '', /day row/u);
});

test('`feedPlan` over `day` rows answers one group a day, in the order given, with its heading and its lines', () => {
  const plan = feedPlan(
    rows(
      'day | Today',
      'agent | Claude | 14 | saves | 3h ago',
      'you | Sam |  | paid it | 5h ago',
      'rule | Late fees | 2 | reminders | 6h ago',
      'day | Yesterday',
      'you | Sam |  | closed it | 1d ago',
      'agent | Codex |  | drafted | 1d ago',
      'day | Mon 12 Oct',
      'rule |  |  | Tallyard categorised | 2d ago',
    ),
  );
  assert.equal(plan.days, true);
  assert.deepEqual(plan.groups.map((g) => g.label), ['Today', 'Yesterday', 'Mon 12 Oct']);
  assert.deepEqual(plan.groups.map((g) => g.by), [FEED_DAY, FEED_DAY, FEED_DAY], 'no Agents, Rules and You groups');
  /* A DAY'S LINES KEEP THE ORDER THEY CAME IN, each with its own actor, never sorted by who did them. */
  assert.deepEqual(plan.groups[0]!.rows.map((m) => m.by), ['agent', 'you', 'rule']);
  assert.deepEqual(plan.groups[1]!.rows.map((m) => `${m.by} ${m.row.cells[3]}`), ['you closed it', 'agent drafted']);
  assert.deepEqual(plan.groups.map((g) => g.total), [17, 2, 1]);
  assert.equal(plan.lone, false, 'a day is named even when it is the only one');
  assert.equal(feedPlan(rows('day | Today', 'you | Sam |  | paid | now')).lone, false);
});

test('a feed with no `day` row plans exactly as it did', () => {
  const plan = feedPlan(rows('agent | Claude | 14 | saves | 3h ago', 'rule | Late fees | 2 | reminders | 5h ago', 'seen | 6h ago', 'you | Sam |  | paid | 1d ago', 'agent | Codex |  | drafted | 2d ago'));
  assert.equal(plan.days, false);
  assert.deepEqual(plan.groups.map((g) => [g.by, g.label, g.fresh, g.total, g.earlier, g.rows.length]), [
    ['agent', 'Agents', 14, 15, 1, 2],
    ['rule', 'Rules', 2, 2, -1, 1],
    ['you', 'You', 0, 1, -1, 1],
  ]);
  assert.deepEqual(plan.groups[0]!.rows.map((m) => m.by), ['agent', 'agent']);
  assert.equal(plan.lone, false);
  assert.equal(feedPlan(rows('rule |  |  | categorised | now')).lone, true, 'one kind of actor still draws no head');
});

test('a `day` row with nothing under it is dropped, and a feed of only those is an empty feed', () => {
  const plan = feedPlan(rows('day | Today', 'day | Yesterday', 'you | Sam |  | paid | 1d ago', 'day | Mon 12 Oct', 'seen | 3d ago'));
  assert.deepEqual(plan.groups.map((g) => g.label), ['Yesterday']);
  const none = feedPlan(rows('day | Today', 'seen | 1h ago'));
  assert.deepEqual(none.groups, []);
  assert.equal(none.empty, 'Nothing new.');
});

test('the `seen` row still splits new from read inside a day, and only in the day it falls in', () => {
  const plan = feedPlan(
    rows('day | Today', 'agent | Claude | 3 | saves | 1h ago', 'you | Sam |  | paid | 2h ago', 'seen | 3h ago', 'rule | Late fees | 2 | reminders | 5h ago', 'day | Yesterday', 'you | Sam |  | closed | 1d ago'),
  );
  const [today, yesterday] = plan.groups;
  assert.deepEqual(today!.rows.map((m) => m.fresh), [true, true, false]);
  assert.equal(today!.fresh, 4);
  assert.equal(today!.earlier, 2, 'the line goes above the first one already read');
  assert.equal(yesterday!.fresh, 0);
  assert.equal(yesterday!.earlier, -1, 'a day that is all read draws no line');
  /* A mark with no time is the reader who has not looked yet: nothing is new, in a day as in a group. */
  assert.equal(feedPlan(rows('day | Today', 'you | Sam |  | paid | 2h ago', 'seen | ')).groups[0]!.fresh, 0);
});

test('a line above the first `day` row is kept, under no heading', () => {
  const plan = feedPlan(rows('you | Sam |  | paid | now', 'day | Yesterday', 'you | Sam |  | closed | 1d ago'));
  assert.deepEqual(plan.groups.map((g) => [g.label, g.rows.length]), [['', 1], ['Yesterday', 1]]);
});

test('`feedFold` reads the fold\'s words from a line\'s sixth cell, and nothing from a shorter line', () => {
  assert.equal(feedFold(['agent', 'Claude', '40', 'saves', '3h ago', ' and 39 more ']), 'and 39 more');
  assert.equal(feedFold(['agent', 'Claude', '40', 'saves', '3h ago']), '');
});

test('BOTH DRAWERS DRAW ONE TREE for a three-day feed with one folded run', () => {
  const block = threeDays();
  const svelte = tree(render(Block, { props: { block } }).body);
  const html = tree(toHTML([block]));
  assert.equal(svelte, html);

  /* THE HEADING IS AN `h3` IN THE TILE'S OWN HEADING CLASS, one a day, in the order the days came. */
  assert.deepEqual([...html.matchAll(/<h3 class="feed-head">([^<]*)/gu)].map((m) => m[1]), ['Today', 'Yesterday', 'Mon 12 Oct']);
  assert.doesNotMatch(html, />(Agents|Rules|You)</u, 'no head for a kind of actor');
  assert.equal([...html.matchAll(/<div class="feed-group" data-by="day">/gu)].length, 3);
  assert.match(html, /<h3 class="feed-head">Today<span class="feed-new num">41 new<\/span><\/h3>/u, 'what is new is said in words on its day');
  assert.match(html, /<h3 class="feed-head">Yesterday<\/h3>/u, 'a day all read carries no count');

  /* THE FOLD'S WORDS FOLLOW THE LINE, in their own quiet part, and only on the line that has them. */
  assert.match(toHTML([block]), /saves on <a [^>]*>Variable axis QA<\/a> <span class="feed-more">and 39 more<\/span><\/span>/u);
  const app = render(Block, { props: { block } }).body.replace(/<!--[\s\S]*?-->/gu, '');
  assert.match(app, /Variable axis QA<\/a> <span class="feed-more">and 39 more<\/span>/u, 'and a space parts them in the app too');
  assert.equal([...html.matchAll(/class="feed-more"/gu)].length, 1);

  /* A DAY'S LINES KEEP THEIR ACTOR'S MARK: a person their initial, a rule no face at all, and its own tone. */
  const today = /<div class="feed-group" data-by="day">.*?<\/ul>/u.exec(html)?.[0] ?? '';
  assert.equal([...today.matchAll(/<li class="feed-row"/gu)].length, 3);
  assert.match(today, /<span aria-hidden="true" class="feed-face">S<\/span>/u);
  const rule = /<li [^>]*data-row="4"[^>]*>.*?<\/li>/u.exec(today)?.[0] ?? '';
  assert.match(rule, /Tallyard categorised/u);
  assert.doesNotMatch(rule, /feed-face|feed-who/u);
  assert.match(rule, /data-intent="warn"/u);
  assert.ok(today.includes(`<li class="feed-seen">${FEED_EARLIER}</li><li `), 'the read lines of a day begin under the line');
  assert.equal([...html.matchAll(/class="feed-seen"/gu)].length, 1);
});

test('both drawers still draw one tree where a day has nothing under it, and where no day is named', () => {
  for (const src of [
    '```feed\nday | Today\nday | Yesterday\nyou | Sam |  | paid it | 1d ago\n```',
    '```feed\nday | Today\nseen | 2h ago\n```',
    '```feed\nagent | Claude | 14 | saves | 3h ago\nrule | Late fees | 2 | reminders sent | 5h ago\nseen | 6h ago\nyou | Sam |  | paid it | 1d ago\n```',
  ]) {
    const block = page(src);
    assert.equal(tree(render(Block, { props: { block } }).body), tree(toHTML([block])), src);
  }
  const html = toHTML([page('```feed\nday | Today\nday | Yesterday\nyou | Sam |  | paid it | 1d ago\n```')]);
  assert.deepEqual([...html.matchAll(/<h3 class="feed-head">([^<]*)/gu)].map((m) => m[1]), ['Yesterday']);
  assert.match(toHTML([page('```feed\nday | Today\nseen | 2h ago\n```')]), /<p class="feed-empty">Nothing new\.<\/p>/u);
});

test('a line with no fold draws none, and a fold\'s words are written as words, never as markup', () => {
  const block = folded(page('```feed\nday | Today\nagent | Claude | 3 | saves | 1h ago\n```'), 'saves', 'and <b>2</b> more');
  const html = toHTML([block]);
  assert.match(html, /<span class="feed-more">and &lt;b&gt;2&lt;\/b&gt; more<\/span>/u);
  assert.equal(tree(render(Block, { props: { block } }).body), tree(html));
  assert.doesNotMatch(toHTML([page('```feed\nagent | Claude | 3 | saves | 1h ago\n```')]), /feed-more/u);
});
