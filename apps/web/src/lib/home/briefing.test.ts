/**
 * The briefing on Today: the record's cards as lines a person can press, and nothing at all where there are none.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BRIEFING_MOST, briefingRead, briefingRows, footOf, readBriefing, readBriefingSaid } from './briefing.ts';

const card = (h: string, line: unknown, row: unknown, by: unknown = 'rule') => ({ h, line, row, cause: null, by });
const answer = (cards: unknown[]) => ({ ok: true as const, value: { cards, at: '2026-10-14T08:00:00.000Z', basis: 'b1' } });
/** The answer with the record's own sentence on why the rules wrote it, and with no such key where `said` is left out. */
const saying = (cards: unknown[], said?: unknown) => ({ ok: true as const, value: { ...answer(cards).value, ...(said === undefined ? {} : { said }) } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A CARD IS ITS LINE, WHERE ITS OWN THING OPENS, AND WHO WROTE IT', () => {
  const rows = briefingRows(
    answer([
      card('b1', 'Studio rent is 3 days late, at GBP 1,200.00.', 'obligations#2', 'slash'),
      card('r1', 'Tidy the contacts is waiting on a check from you.', 'runs#5'),
    ]),
  );
  assert.deepEqual(rows, [
    { key: 'b1', line: 'Studio rent is 3 days late, at GBP 1,200.00.', href: '/r/obligations/2', by: 'slash' },
    { key: 'r1', line: 'Tidy the contacts is waiting on a check from you.', href: '/r/runs/5', by: 'rule' },
  ]);
});

test('AN ADDRESS IS ONLY EVER ONE INSIDE THE APP: anything else is a line that opens nothing', () => {
  const rows = briefingRows(
    answer([
      card('a', 'One.', '/decide'),
      card('b', 'Two.', 'https://elsewhere.example/x'),
      card('c', 'Three.', '//elsewhere.example/x'),
      card('d', 'Four.', 'tasks#0'),
      card('e', 'Five.', 'Tasks List#4'),
      card('f', 'Six.', null),
      card('g', 'Seven.', { register: 'tasks', seq: 9 }),
    ]),
  );
  assert.deepEqual(rows.map((r) => r.href), ['/decide', null, null, null, null, null, '/r/tasks/9']);
});

test('A QUESTION OPENS ON DECIDE AND A RUN OPENS AS ITS OWN ROW, as the record says each', () => {
  const rows = briefingRows(
    answer([
      card('q', 'One.', 'suggestion:SG7'),
      card('h', 'Two.', 'suggestion:q.4f2a'),
      card('s', 'Three.', 'S42'),
      card('x', 'Four.', 'suggestion:../settings'),
      card('y', 'Five.', 'suggestion:'),
      card('z', 'Six.', 'S0'),
      card('w', 'Seven.', ''),
    ]),
  );
  assert.deepEqual(rows.map((r) => r.href), ['/decide/SG7', '/decide/q.4f2a', '/r/session/42', null, null, null, null]);
});

test('A CARD WITH NO LINE IS DROPPED, and a line is trimmed, never drawn as spaces', () => {
  const rows = briefingRows(answer([card('a', '', 'tasks#1'), card('b', '   ', 'tasks#2'), card('c', 7, 'tasks#3'), card('d', '  Call the bank.  ', 'tasks#4'), null, 'x']));
  assert.deepEqual(rows, [{ key: 'd', line: 'Call the bank.', href: '/r/tasks/4', by: 'rule' }]);
});

test('WHO WROTE IT IS SLASH ONLY WHEN THE RECORD SAYS SO: any other word is a rule', () => {
  const rows = briefingRows(answer([card('a', 'One.', 'tasks#1', 'slash'), card('b', 'Two.', 'tasks#2', 'model'), card('c', 'Three.', 'tasks#3', undefined)]));
  assert.deepEqual(rows.map((r) => r.by), ['slash', 'rule', 'rule']);
});

test('SEVEN AT MOST, the first seven as the record ordered them, each under its own key', () => {
  const rows = briefingRows(answer(Array.from({ length: 12 }, (_, i) => card(i < 2 ? 'same' : `h${i}`, `Line ${i}.`, `tasks#${i + 1}`))));
  assert.equal(BRIEFING_MOST, 7);
  assert.deepEqual(rows.map((r) => r.line), ['Line 0.', 'Line 1.', 'Line 2.', 'Line 3.', 'Line 4.', 'Line 5.', 'Line 6.']);
  assert.equal(new Set(rows.map((r) => r.key)).size, 7);
});

test('A RECORD WITH NO BRIEFING ANSWERS NOTHING, so nothing is drawn', () => {
  for (const code of ['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN', 'FORBIDDEN', 'UNREACHABLE'])
    assert.deepEqual(briefingRows({ ok: false, refusal: { code, fix: 'No.' } }), []);
  for (const odd of [null, undefined, 'x', {}, { ok: true }, { ok: true, value: null }, { ok: true, value: { cards: 'none' } }, answer([])])
    assert.deepEqual(briefingRows(odd), []);
});

test('THE READ NEVER FAILS THE SCREEN: a host without the call, a refusal and a dead line all answer no cards', async () => {
  const none = { ok: true, value: [] };
  const absent = async () => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no briefing yet.', at: 'briefing' } });
  assert.deepEqual(await readBriefing('http://record.test', absent), none);
  assert.deepEqual(await readBriefing('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  assert.deepEqual(await readBriefing('http://record.test', async () => Promise.reject(new Error('offline'))), none);
});

test('THE WHOLE READ IS THE CARDS, WHO WROTE THEM AND WHAT THE RECORD SAID: Slash where any card is Slash\'s', () => {
  const both = [card('a', 'One.', 'tasks#1', 'slash'), card('b', 'Two.', 'tasks#2')];
  assert.deepEqual(briefingRead(saying(both, 'Slash ran out of its budget for today.')), {
    rows: briefingRows(answer(both)),
    written: 'slash',
    said: 'Slash ran out of its budget for today.',
    paused: null,
  });
  assert.equal(briefingRead(saying([card('a', 'One.', 'tasks#1'), card('b', 'Two.', 'tasks#2')], null)).written, 'rule');
  assert.equal(briefingRead(saying([card('a', 'One.', 'tasks#1', 'slash')])).written, 'slash');
  /* The rows reader stays, and reads the same cards. */
  assert.deepEqual(briefingRead(saying(both)).rows, briefingRows(saying(both)));
});

test('AN OLDER HOST SAYS NOTHING: no `said`, an empty one and one that is no sentence all read as null', () => {
  const cards = [card('a', 'One.', 'tasks#1')];
  for (const said of [undefined, null, '', '   ', 7, {}, ['x']]) assert.equal(briefingRead(saying(cards, said)).said, null);
  assert.equal(briefingRead(saying(cards, '  Slash is switched off.  ')).said, 'Slash is switched off.');
  for (const odd of [null, undefined, 'x', {}, { ok: true, value: null }, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } }])
    assert.deepEqual(briefingRead(odd), { rows: [], written: 'rule', said: null, paused: null });
});

test('THE FOOT SAYS WHY THE RULES WROTE IT, once, and nothing where Slash wrote it or nothing was said', () => {
  const rule = [card('a', 'One.', 'tasks#1'), card('b', 'Two.', 'tasks#2')];
  const slash = [card('a', 'One.', 'tasks#1', 'slash'), card('b', 'Two.', 'tasks#2', 'slash')];
  const why = 'Slash ran out of its budget for today.';
  assert.equal(footOf(briefingRead(saying(rule, why))), `Written by the rules: ${why}`);
  /* ITS FULL STOP IS KEPT ONCE: one is added where the record left it off, and three are one. */
  assert.equal(footOf(briefingRead(saying(rule, 'Slash is switched off'))), 'Written by the rules: Slash is switched off.');
  assert.equal(footOf(briefingRead(saying(rule, 'Slash is switched off...'))), 'Written by the rules: Slash is switched off.');
  /* EVERY CARD IS SLASH'S: nothing to explain, whatever was said. */
  assert.equal(footOf(briefingRead(saying(slash, why))), null);
  /* A RECORD WITH NO MODEL is not told so on every visit, and an older host says nothing at all. */
  assert.equal(footOf(briefingRead(saying(rule, null))), null);
  assert.equal(footOf(briefingRead(saying(rule))), null);
  /* NO CARDS IS NO BRIEFING, so there is nothing for a foot to stand under. */
  assert.equal(footOf(briefingRead(saying([], why))), null);
  /* SOME OF EACH says so, and never claims the rules wrote Slash's lines. */
  assert.equal(footOf(briefingRead(saying([slash[0], rule[1]], why))), `Partly written by the rules: ${why}`);
});

test('THE FOOT IS A SENTENCE AND NEVER AN ADDRESS OR A LONG DASH, since its words came down the wire', () => {
  const rule = [card('a', 'One.', 'tasks#1')];
  const foot = footOf(briefingRead(saying(rule, `No model answered \u2014 the budget is spent.\nTry again${' later'.repeat(80)}`)));
  assert.ok(foot !== null);
  assert.doesNotMatch(foot, /[\u2014\u2013\n]/u);
  assert.ok(foot.length <= 'Written by the rules: '.length + 200, 'the foot runs on');
});

test('THE READ WITH WHAT WAS SAID NEVER FAILS THE SCREEN EITHER', async () => {
  const none = { ok: true, value: { rows: [], written: 'rule', said: null, paused: null } };
  assert.deepEqual(await readBriefingSaid('http://record.test', async () => Promise.reject(new Error('offline'))), none);
  assert.deepEqual(await readBriefingSaid('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  const cards = [card('a', 'One.', 'tasks#1')];
  const out = await readBriefingSaid('http://record.test', async () => json(200, saying(cards, 'Slash is switched off.')));
  assert.equal(footOf(out.value), 'Written by the rules: Slash is switched off.');
});

test('THE TILE HAS THE HEAD EVERY TILE ON TODAY HAS: its glyph in a well, then its name', () => {
  const tile = readFileSync(new URL('./Briefing.svelte', import.meta.url), 'utf8');
  assert.match(tile, /<Tile icon="[a-z-]+" title=\{words\.title\}/u, 'the tile names no glyph');
  assert.doesNotMatch(tile, /<Section\b/u, 'a section draws a name and no glyph');
});

test('THE TILE DRAWS THE FOOT AS PLAIN TEXT UNDER THE CARDS: 15px, no pill, no icon, no colour of its own', () => {
  const tile = readFileSync(new URL('./Briefing.svelte', import.meta.url), 'utf8');
  /* ONE MORE PROP, null until a screen passes it, so a screen that does not draws what it drew. */
  assert.match(tile, /foot = null/u);
  assert.match(tile, /foot\?: string \| null/u);
  const list = tile.indexOf('</ul>');
  const drawn = tile.indexOf('{#if foot}<p class="b-foot" data-briefing-foot dir="auto">{foot}</p>{/if}');
  assert.ok(list > 0 && drawn > list && drawn < tile.indexOf('</Tile>'), 'the foot is not under the cards, inside the tile');
  const rule = /\.b-foot \{([^}]*)\}/u.exec(tile)?.[1] ?? '';
  assert.match(rule, /font-size: var\(--t-row\);/u, 'the foot is not 15px');
  assert.match(rule, /color: var\(--dim\);/u);
  assert.match(rule, /overflow-wrap: anywhere;/u, 'a long sentence would push the tile wide at 390');
  assert.doesNotMatch(rule, /background|border|radius|var\(--(red|accent|late)/u, 'the foot is a pill or has a colour of its own');
});

test('A WRITTEN BRIEF IS ONE PARAGRAPH WHOSE FIGURES OPEN THEIR ROWS, then the few needs as lines', () => {
  const written = {
    sentences: [{ parts: [{ text: 'The EDF bill', row: 'bills#4' }, { text: ' is ' }, { text: '3 days', row: 'bills#4' }, { text: ' late.' }] }],
    needs: [{ h: 'asked-001', line: 'A question waits on you: "Which card?"', row: 'suggestion:s1' }],
  };
  const rows = briefingRows({ ok: true, value: { cards: [card('a', 'Rules line.', 'tasks#1')], written } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.line, 'The EDF bill is 3 days late.');
  assert.deepEqual(rows[0]!.parts?.filter((p) => p.href !== null).map((p) => p.href), ['/r/bills/4', '/r/bills/4']);
  assert.equal(rows[1]!.href, '/decide/s1');
  assert.equal(footOf(briefingRead({ ok: true, value: { cards: [], written, said: 'Slash is off.' } })), null);
});

test('A PAUSED WRITTEN BRIEF LEAVES THE RULES LINES AND ONE QUIET LINE, and no line under no lines', () => {
  const paused = 'The written brief is paused. Slash has no model on this host, so BrainDog works from its rules.';
  const read = briefingRead({ ok: true, value: { cards: [card('a', 'One.', 'tasks#1')], written: null, paused } });
  assert.equal(read.rows[0]!.parts, undefined);
  assert.equal(footOf(read), paused);
  assert.equal(footOf(briefingRead({ ok: true, value: { cards: [], paused } })), null);
});
