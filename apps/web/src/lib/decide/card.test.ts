/**
 * ONE DECISION CARD (`card.ts`): what every place a question is drawn says about it, read without a DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { answeredLine, askerOf, byWords, cardOf, inlineOf, movesOf, nameOrNull, pressSaid, pressTail, primaryOf, shiftsOf, spoken, startsOn } from './card.ts';

const now = Date.parse('2026-10-06T09:00:00Z');

const ask = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'options',
    question: 'Which plan for Bake?',
    why: 'Two of the three quotes came back.',
    cost: 'call',
    options: [
      { key: 'seat', label: 'Per seat', because: 'Cheaper under ten people', recommended: true },
      { key: 'flat', label: 'Flat', because: '', recommended: false },
    ],
    ...over,
  }) as QueueQuestion;

test('WHY COMES FIRST, with who asked, and the suggestion is marked where it can be undone', () => {
  const card = cardOf(ask(), { now, home: 'GBP' });
  assert.equal(card.question, 'Which plan for Bake?');
  assert.equal(card.why, 'Two of the three quotes came back.');
  assert.equal(card.by.kind, 'agent');
  assert.equal(card.when, '2h ago');
  assert.equal(card.ways.find((w) => w.recommended)?.key, 'seat');
  assert.equal(card.enter, 'seat', 'Enter gives the suggested answer');
  assert.equal(card.decline, null, 'a question of options has no Decline key');
  assert.equal(card.band, '', 'the plainest band is not said');
  assert.equal(card.href, '/decide/SG7');
});

test('THE SUGGESTION STAYS, AND NO KEY ANSWERS, WHERE IT IS HARD TO UNDO OR MONEY MOVES (audit 19 M10)', () => {
  const hard = cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' });
  assert.equal(hard.ways.find((w) => w.recommended)?.key, 'seat', 'the dot stays on a hard card');
  assert.equal(hard.enter, null);
  assert.ok(hard.band !== '', 'a band that warns is said');

  const paying = cardOf(ask({ kind: 'rowset', options: [], money: { amount: 1298, currency: 'GBP' } }), { now, home: 'GBP' });
  assert.equal(paying.money, 'Moves £12.98');
  assert.deepEqual(
    paying.ways.map((w) => w.label),
    ['Accept £12.98', 'Decline'],
    'Accept names the amount and Reject says Decline',
  );
  assert.equal(paying.enter, null, 'Enter never accepts money');
  assert.equal(paying.decline, 'reject');
  assert.equal(paying.seeWhole, true);
});

test('TWO CURRENCIES ARE NEVER ADDED, and amounts pointing both ways name what moves', () => {
  assert.deepEqual(movesOf([{ amount: 500, currency: 'GBP' }, { amount: 700, currency: 'usd' }]), [
    { amount: 500, currency: 'GBP' },
    { amount: 700, currency: 'USD' },
  ]);
  assert.deepEqual(movesOf([{ amount: -300, currency: 'GBP' }, { amount: 300, currency: 'GBP' }]), [{ amount: 600, currency: 'GBP' }]);
  assert.deepEqual(movesOf({ amount: 12.5, currency: 'GBP' }), [], 'a fraction of a minor unit is not money');
  assert.deepEqual(movesOf({ amount: '1200', currency: 'JPY' }), [{ amount: 1200, currency: 'JPY' }]);
  assert.deepEqual(movesOf(undefined), []);
});

test('WHO ASKED IS THE AGENT, THE APP AND THE RUN, and never an id', () => {
  const by = askerOf(ask({ app: 'Claude Code · MacBook', run: { id: '01J9Z8X7W6V5T4S3R2Q1P0N9M8', name: 'Tidy invoices' } }));
  assert.deepEqual(byWords(by), ['Claude', 'Claude Code · MacBook', 'Tidy invoices']);
  const bare = askerOf(ask({ run: '01J9Z8X7W6V5T4S3R2Q1P0N9M8', app: '/Users/sam/repo' }));
  assert.deepEqual(byWords(bare), ['Claude'], 'a run named by its id and an app named by a path say nothing');
  for (const id of ['tools#8', 'run_42', 'agent:claude', 'SG14', 'sam-mbp.local', '01J9Z8X7W6V5T4S3R2Q1P0N9M8']) assert.equal(nameOrNull(id), null, id);
  for (const name of ['Claude Code', 'claude.ai', 'MacBook']) assert.equal(nameOrNull(name), name);
});

test('THE RECORD\'S OWN FACTS DRAW: money from each row, the run by what it was doing, the app as the name (audit 19 H3)', () => {
  const card = cardOf(
    ask({
      who: 'S42',
      kind: 'rowset',
      options: [],
      cost: 'rows',
      run: { id: 'S42', name: 'Tidy the March invoices', app: 'Claude Code' },
      drafted_by: 'slash:model',
      money: [{ amount: -1298, currency: 'GBP' }, { amount: -500, currency: 'GBP' }, { amount: 700, currency: 'USD' }],
      kinds: ['expenses:add'],
    }),
    { now, home: 'GBP' },
  );
  assert.deepEqual(byWords(card.by), ['Claude Code', 'Tidy the March invoices'], 'a run is named by its app, never An agent or S42');
  assert.equal(card.by.kind, 'agent');
  assert.equal(card.money, 'Moves −£17.98 and $7\u00a0USD');
  assert.equal(card.ways[0]?.label, 'Accept −£17.98 and $7\u00a0USD');
  assert.equal(card.enter, null, 'Enter never accepts money');
  assert.equal(card.slash, true, 'drafted by Slash');
  const old = cardOf(ask({ who: 'S42', run: { id: 'S42', app: 'Claude Code' } }), { now });
  assert.deepEqual(byWords(old.by), ['Claude Code'], 'a run that said nothing of what it did is its app alone');
  const doing = askerOf(ask({ run: { id: 'S9', name: 'Fix the sign-in in apps/web/src/login.ts', app: 'Cursor' } }));
  assert.equal(doing.run, 'Fix the sign-in', 'a path the agent wrote is taken out, not the whole line');
});

test('AN ADDRESS SIGNS AS SOMEONE, and no address or id reaches the words (audit 19 M11)', () => {
  assert.match(askerOf(ask({ who: 'alex@acme.com' })).name, /^Someone\b/u);
  assert.equal(nameOrNull('alex@acme.com'), null);
  const card = cardOf(
    ask({
      question: 'Add alex@acme.com to Acme?',
      why: 'Alex Ng <alex.ng@acme.com> replied from 192.168.1.4 about tasks#8 (see /Users/sam/Developer/braindog/notes.md).',
      does: 'Adds 01J9Z8X7W6V5T4S3R2Q1P0N9M8 to people',
    }),
    { now, lead: true },
  );
  assert.equal(card.question, 'Add someone to Acme?');
  assert.equal(card.why, 'Alex Ng replied.');
  assert.equal(card.does, 'Adds to people');
  for (const s of [card.question, card.why, card.does]) assert.doesNotMatch(s, /@|#\d|\/|[0-9A-HJKMNP-TV-Z]{26}/u, s);
});

test('SPOKEN LEAVES WORDS ALONE and takes out only what is an address or an id', () => {
  const same = ['Pay the £12.98 invoice by 10/06/2026.', 'Two of the three quotes came back.', 'Renew it in 3 days and/or cancel.', 'Invoice 20261001 is late.'];
  for (const s of same) assert.equal(spoken(s), s);
  assert.equal(spoken('alex@acme.com wrote back'), 'Someone wrote back');
  assert.equal(spoken('Seen on https://www.stripe.com/invoices/42.'), 'Seen on stripe.com.');
  assert.equal(spoken('Running on sam-mbp.local'), 'Running');
  assert.equal(spoken('From commit 4464966f in braindog'), 'From commit in braindog');
  assert.equal(spoken('Filed by agent:claude as SG14 for p_7x2k'), 'Filed');
  assert.equal(spoken('Proposed by agent:claude because the bill is late'), 'Proposed because the bill is late');
  assert.equal(spoken('Moved from ~/Developer/old to C:\\Repos\\new'), 'Moved');
  assert.equal(spoken('Renew the face2face plan.'), 'Renew the face2face plan.', 'a word of hex letters is no hash');
  assert.equal(spoken('Ask Jo (jo@x.io) about it.'), 'Ask Jo about it.', 'an address beside its name goes whole');
  assert.equal(spoken('Changed in (apps/web/src/a.ts, apps/web/src/b.ts)'), 'Changed', 'no bracket of commas is left');
});

test('WHAT CHANGES IS SAID FROM WHAT TO WHAT, and an id is never a value', () => {
  assert.deepEqual(shiftsOf(ask({ before: { status: 'open', due_on: '2026-10-01' }, after: { status: 'paid', due_on: '2026-10-01' } }), 'GBP'), [
    { what: 'status', before: 'open', after: 'paid' },
  ]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'amount', before: { amount: 100, currency: 'GBP' }, after: { amount: 250, currency: 'GBP' } }] }), 'GBP'), [
    { what: 'amount', before: '£1', after: '£2.50' },
  ]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'amount', before: { amount: 0, currency: 'GBP' }, after: { amount: 250, currency: 'GBP' } }] }), 'GBP'), [
    { what: 'amount', before: '£0', after: '£2.50' },
  ], 'an amount that was nothing is still an amount');
  assert.deepEqual(movesOf([{ amount: 0, currency: 'GBP' }, { amount: 0, currency: 'GBP' }]), [], 'zero moves nothing, in any position');
  assert.deepEqual(shiftsOf(ask({ before: null, after: 'Weekly' }), 'GBP'), [{ what: '', before: 'nothing', after: 'Weekly' }]);
  assert.deepEqual(shiftsOf(ask({ changes: [{ field: 'owner', before: 'people#3', after: 'people#4' }] }), 'GBP'), [], 'a handle is no value');
  assert.deepEqual(shiftsOf(ask(), 'GBP'), [], 'an older record sends none');
});

test('NO ADDRESS OR ID IN AN ANSWER, ITS REASON OR WHAT A CHANGE WAS AND BECOMES (audit 21 #4)', () => {
  const card = cardOf(
    ask({
      options: [
        { key: 'merge', label: 'Merge into rohan@x.com', because: 'Same address as tasks#8 in /Users/sam/Developer/braindog', recommended: true },
        { key: 'apart', label: 'people#4', because: '', recommended: false },
      ],
    }),
    { now, home: 'GBP' },
  );
  assert.deepEqual(
    card.ways.map((w) => [w.label, w.because]),
    [
      ['Merge into someone', 'Same address'],
      ['Answer 2', ''],
    ],
    'an answer that was only a handle is said by its place, never left blank',
  );
  /* SCRUBBED BEFORE IT IS TESTED: two addresses read alike and are left to the page, and a handle inside words goes. */
  assert.deepEqual(
    shiftsOf(
      ask({
        changes: [
          { field: 'email', before: 'old@x.com', after: 'new@y.com' },
          { field: 'link', before: '01ARZ3NDEKTSV4RRFFQ69G5FAV', after: 'Bake' },
          { field: 'note', before: 'Ask jo@x.io', after: 'Ask Jo, see tasks#8' },
        ],
      }),
      'GBP',
    ),
    [{ what: 'note', before: 'Ask someone', after: 'Ask Jo' }],
  );
  const later = cardOf(ask({ until: '2026-10-08', until_why: 'Until alex@acme.com replies on tasks#8' }), { now });
  assert.equal(later.later, 'Comes back in 2d · Until someone replies');
});

test("A SLASH PROPOSAL'S ANSWERED LINE READS AS ITS HISTORY", () => {
  const slash = cardOf(ask({ who: 'slash', kind: 'rowset', options: [] }), { now });
  assert.equal(slash.slash, true);
  const accept = slash.ways.find((w) => w.key === 'accept')!;
  assert.equal(answeredLine(slash, accept, 'Sam', 'just now'), 'Slash suggested · Sam accepted');
  assert.equal(answeredLine(slash, slash.ways.find((w) => w.key === 'reject')!, 'Sam', 'just now'), 'Slash suggested · Sam declined');
  const drafted = cardOf(ask({ who: 'agent:claude', drafted_by: 'slash:model' }), { now });
  assert.equal(drafted.slash, true, 'drafted by Slash for whoever filed it');
  assert.equal(answeredLine(drafted, drafted.ways[1]!, 'Sam', 'just now'), 'Slash suggested · Sam chose Flat');
  const plain = cardOf(ask(), { now });
  assert.equal(answeredLine(plain, plain.ways[0]!, 'Sam', 'just now'), 'Per seat · you, just now');
  for (const s of [answeredLine(slash, accept, 'Sam', 'now'), slash.money, ...slash.ways.map((w) => w.label)]) assert.doesNotMatch(s, /—/u);
});

test('A MERGE IS STILL DRAWN AS ONE, from the options the record offers', () => {
  const candidates = [
    { at: 'people#1', name: 'Ana', seen: [], kept: true as const },
    { at: 'people#2', name: 'Ana B', seen: ['GitHub'] },
  ];
  const card = cardOf(
    ask({
      candidates,
      options: [
        { key: 'merge', label: 'Merge all', because: '', recommended: false },
        { key: 'apart', label: 'Keep apart', because: '', recommended: false },
        { key: 'pick:people#2', label: 'Pick', because: '', recommended: false },
      ],
    }),
    { now },
  );
  assert.equal(card.merge?.all.option, 'merge');
  assert.equal(card.merge?.apart.option, 'apart');
});

/* ── the card reads like a form (DIRECTION §39) ───────────────────────────── */

test('A FORM STARTS ON THE SUGGESTION ONLY WHERE A KEY MAY GIVE IT, and a hard answer says so in its button', () => {
  assert.equal(startsOn(cardOf(ask(), { now, home: 'GBP' })), 'seat', 'the suggestion is not chosen to start with');
  assert.equal(startsOn(cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' })), null, 'a hard answer starts chosen for the reader');
  const none = ask({ options: [{ key: 'a', label: 'A', because: '', recommended: false }, { key: 'b', label: 'B', because: '', recommended: false }] });
  assert.equal(startsOn(cardOf(none, { now })), null, 'a question with nothing suggested starts on an answer');
  /* THE RECORD'S OWN TWO ANSWERS ARE BUTTONS, so there is nothing to start on, even where Enter accepts. */
  assert.equal(startsOn(cardOf(ask({ kind: 'rowset', options: [] }), { now })), null);

  const hard = cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' });
  assert.equal(pressSaid(hard, 'Decide'), 'Decide, can’t be undone easily');
  assert.equal(pressSaid(hard, 'Accept £12.98'), 'Accept £12.98, can’t be undone easily');
  assert.equal(pressSaid(cardOf(ask({ cost: 'shape' }), { now }), 'Decide'), 'Decide', 'a band that only warns adds nothing to the words');
  assert.doesNotMatch(pressSaid(hard, 'Decide'), /—/u);
});

test('A CHOICE IS CHOSEN AND DECIDE GIVES IT; a number key and Enter on a choice still answer; Enter only where cheap', () => {
  const card = src('./DecisionCard.svelte');
  /* A POINTER OR SPACE ON A CHOICE ONLY CHOOSES IT; a press from outside it (a page's number key) answers, as it did. */
  assert.match(card, /function onChoice\(e: MouseEvent, way: Way\) \{\n\s+if \(e\.detail === 0 && document\.activeElement !== e\.currentTarget\) return press\(way\);\n\s+selectWay\(way\);/u);
  /* ENTER ON A CHOICE CHOOSES AND ANSWERS, as Enter sends a form. */
  assert.match(card, /if \(e\.key === 'Enter'\) \{\n\s+e\.preventDefault\(\);\n\s+e\.stopPropagation\(\);\n\s+selectWay\(way\);\n\s+press\(way\);/u);
  /* DECIDE CARRIES THE KEY'S MARK ONLY ON A CARD THAT COSTS NOTHING, with an answer chosen. */
  assert.match(card, /data-enter=\{card\.enter !== null && selected !== null \? '' : undefined\}/u);
  assert.match(card, /onclick=\{commit\}>\{pressSaid\(card, queueWords\.decide\)\}/u, 'Decide does not say the care a hard answer asks for');
  /* NO CHIP SAYS THE BAND: it is kept for the keys and the ranking, hidden, and said in the button. */
  assert.match(card, /<span class="queue-cost" data-cost=\{card\.cost\} hidden>/u);
  assert.match(card, /import '\.\/form\.css';/u, 'the card draws its choices its own way again');
});

test('TWO OR THREE ANSWERS THAT ARE ONLY THEIR NAMES ARE A ROW OF BUTTONS, the suggested or the first filled', () => {
  const named = (n: number, rec = -1) =>
    ask({ options: ['Chase it', 'Not yet', 'Ask Ana', 'Write it off'].slice(0, n).map((label, i) => ({ key: `k${i}`, label, because: '', recommended: i === rec })) });
  assert.equal(inlineOf(cardOf(named(2), { now })), true, 'Chase it and Not yet are two buttons');
  assert.equal(inlineOf(cardOf(named(3), { now })), true);
  assert.equal(inlineOf(cardOf(named(4), { now })), false, 'a fourth answer keeps the form');
  assert.equal(inlineOf(cardOf(ask(), { now })), false, 'an answer with a line of what it does keeps the form');
  assert.equal(inlineOf(cardOf(ask({ kind: 'rowset', options: [] }), { now })), true, 'Accept and Decline were always buttons');
  /* COMPACT, OUTSIDE DECIDE, the line of what each does waits on the question's page, and only a fourth answer does not fit. */
  assert.equal(inlineOf(cardOf(ask(), { now }), true), true);
  assert.equal(inlineOf(cardOf(named(4), { now }), true), false);
  const swatch = ask({ options: [{ key: 'a', label: 'Oak', because: '', recommended: false, shows: { swatch: ['#aa7744'] } }, { key: 'b', label: 'Ash', because: '', recommended: false }] });
  assert.equal(inlineOf(cardOf(swatch, { now })), false, 'an answer that shows its colours is chosen in the form, where they are drawn');

  assert.equal(primaryOf(cardOf(named(3, 1), { now })), 'k1', 'the suggested answer is filled');
  assert.equal(primaryOf(cardOf(named(2), { now })), 'k0', 'with none suggested, the first');
  assert.equal(primaryOf(cardOf(ask({ kind: 'rowset', options: [] }), { now })), 'accept');
  /* THE ENTER RULES HOLD ON A ROW: the suggestion where it is cheap, and nothing on a hard card. */
  assert.equal(cardOf(named(2, 0), { now }).enter, 'k0');
  assert.equal(cardOf(named(2), { now }).enter, null, 'with nothing suggested, Enter gives nothing on a question of options');
  assert.equal(cardOf({ ...named(2, 0), cost: 'undo' } as QueueQuestion, { now }).enter, null);
  assert.equal(pressTail(cardOf(ask({ cost: 'undo' }), { now })), ', can’t be undone easily');
  assert.equal(pressTail(cardOf(ask(), { now })), '');

  const card = src('./DecisionCard.svelte');
  /* ONE PRESS DECIDES, through the same held press as every answer, and only the Enter answer carries its mark. */
  assert.match(card, /data-weight=\{way\.key === primary \? 'primary' : undefined\}/u);
  assert.match(card, /data-enter=\{way\.key === card\.enter \? '' : undefined\}/u);
  assert.match(card, /onclick=\{\(\) => press\(way\)\}/u);
  assert.match(card, /<span class="dc-btn-name">\{way\.label\}<\/span>/u, 'the gate and the answered line read the name apart from the care said after it');
});

test('COMPACT, OUTSIDE DECIDE: the question and its buttons only, and at most three before a count that opens Decide', () => {
  const card = src('./DecisionCard.svelte');
  assert.match(card, /const inline = \$derived\(inlineOf\(card, compact\)\);/u);
  assert.match(card, /\{#if !compact\}\n\s+<!-- WHO ASKED/u, 'a compact card still says who asked');
  assert.match(card, /\{#if link \|\| compact\}<a class="dc-open" href=\{at\(card\.href\)\}>/u, 'a compact question is not the door to its page');
  assert.match(card, /!link && !compact && onpress === undefined/u, 'a compact card offers Not now');
  const host = src('../page/QueueAnswer.svelte');
  assert.match(host, /compact = false,/u, 'QueueAnswer takes no compact prop');
  assert.match(host, /\{compact\} \/>/u, 'QueueAnswer does not hand compact to the card');
});

/* ── every place a question is drawn draws this card ───────────────────────── */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('THE FOUR DRAWS AND THE PALETTE DRAW THIS CARD', () => {
  for (const path of ['../page/QueueAnswer.svelte', '../home/Question.svelte', '../../routes/decide/Classic.svelte', '../palette/Palette.svelte'])
    assert.match(src(path), /import DecisionCard from '\$lib\/decide\/DecisionCard\.svelte'/u, `${path} draws a card of its own`);
  const card = src('./DecisionCard.svelte');
  assert.match(card, /cardOf\(/u, 'the card reads its view model');
  assert.match(card, /import MergeCard from/u, 'a merge is a variant of the card');
  assert.match(card, /hold\(/u, 'a press is held for its Undo');
  assert.doesNotMatch(card, /—/u);
});
