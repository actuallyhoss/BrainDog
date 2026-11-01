/**
 * ONE DECISION CARD (`card.ts`): what every place a question is drawn says about it, read without a DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { answerRowOf, answeredLine, askerOf, byWords, cardOf, hardOf, inlineOf, keptWay, leadOf, movesOf, nameOrNull, pressOf, pressSaid, pressTail, primaryOf, queueOf, shiftsOf, spoken, startsOn, suggestsOf, wayTail } from './card.ts';

const now = Date.parse('2026-10-06T09:00:00Z');

const ask = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'options',
    question: 'Which plan for Oxbow?',
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
  assert.equal(card.question, 'Which plan for Oxbow?');
  assert.equal(card.why, 'Two of the three quotes came back.');
  assert.equal(card.by.kind, 'agent');
  assert.equal(card.when, '2h ago');
  assert.equal(card.ways.find((w) => w.recommended)?.key, 'seat');
  assert.equal(card.enter, 'seat', 'Enter gives the suggested answer');
  assert.equal(card.decline, null, 'a question of options has no Decline key');
  assert.equal(card.band, '', 'the plainest band is not said');
  assert.equal(card.href, '/decide/SG7');
});

test('THE SUGGESTION STAYS, AND NO KEY ANSWERS, WHERE IT IS HARD TO UNDO OR MONEY MOVES', () => {
  const hard = cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' });
  assert.equal(hard.ways.find((w) => w.recommended)?.key, 'seat', 'the dot stays on a hard card');
  assert.equal(hard.enter, null);
  assert.ok(hard.band !== '', 'a band that warns is said');

  const paying = cardOf(ask({ kind: 'rowset', options: [], money: { amount: 1298, currency: 'GBP' } }), { now, home: 'GBP' });
  assert.equal(paying.money, 'Moves £12.98');
  assert.deepEqual(
    paying.ways.map((w) => w.label),
    ['Accept', 'Decline'],
    'Accept says Accept, the amount on the line over it, and Reject says Decline',
  );
  assert.equal(paying.enter, null, 'Enter never accepts money');
  assert.equal(paying.decline, 'reject');
  assert.equal(paying.seeWhole, true);

  /* AN AMOUNT ON AN ENTRY ACCEPTING ADDS IS RECORDED, NOT MOVED (20 Oct): a bank text added to the Ledger said "Moves". */
  const adding = cardOf(ask({ kind: 'rowset', options: [], cost: 'rows', money: { amount: 1298, currency: 'GBP' }, records: true }), { now, home: 'GBP' });
  assert.equal(adding.money, 'Records £12.98');
  assert.ok(adding.ways.every((w) => !/undone/u.test(pressSaid(adding, w.label, w))), 'an added entry said it cannot be undone');
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
  const bare = askerOf(ask({ run: '01J9Z8X7W6V5T4S3R2Q1P0N9M8', app: '/Users/mara/repo' }));
  assert.deepEqual(byWords(bare), ['Claude'], 'a run named by its id and an app named by a path say nothing');
  for (const id of ['tools#8', 'run_42', 'agent:claude', 'SG14', 'mara-mbp.local', '01J9Z8X7W6V5T4S3R2Q1P0N9M8']) assert.equal(nameOrNull(id), null, id);
  for (const name of ['Claude Code', 'claude.ai', 'MacBook']) assert.equal(nameOrNull(name), name);
});

test('THE RECORD\'S OWN FACTS DRAW: money from each row, the run by what it was doing, the app as the name', () => {
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
  assert.equal(card.money, 'Moves −£17.98 and $7');
  assert.equal(card.ways[0]?.label, 'Accept');
  assert.equal(card.enter, null, 'Enter never accepts money');
  assert.equal(card.slash, true, 'drafted by Slash');
  const old = cardOf(ask({ who: 'S42', run: { id: 'S42', app: 'Claude Code' } }), { now });
  assert.deepEqual(byWords(old.by), ['Claude Code'], 'a run that said nothing of what it did is its app alone');
  const doing = askerOf(ask({ run: { id: 'S9', name: 'Fix the sign-in in apps/web/src/login.ts', app: 'Cursor' } }));
  assert.equal(doing.run, 'Fix the sign-in', 'a path the agent wrote is taken out, not the whole line');
});

test('AN ADDRESS SIGNS AS SOMEONE, and no address or id reaches the words', () => {
  assert.match(askerOf(ask({ who: 'alex@acme.com' })).name, /^Someone\b/u);
  assert.equal(nameOrNull('alex@acme.com'), null);
  const card = cardOf(
    ask({
      question: 'Add alex@acme.com to Acme?',
      why: 'Alex Ng <alex.ng@acme.com> replied from 192.168.1.4 about tasks#8 (see /Users/mara/Developer/braindog/notes.md).',
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
  assert.equal(spoken('Running on mara-mbp.local'), 'Running');
  assert.equal(spoken('From commit 4464966f in braindog'), 'From commit in braindog');
  assert.equal(spoken('Filed by agent:claude as SG14 for p_7x2k'), 'Filed');
  assert.equal(spoken('Proposed by agent:claude because the bill is late'), 'Proposed because the bill is late');
  assert.equal(spoken('Moved from ~/Developer/old to C:\\Repos\\new'), 'Moved');
  assert.equal(spoken('Renew the face2face plan.'), 'Renew the face2face plan.', 'a word of hex letters is no hash');
  assert.equal(spoken('Ask Jo (jo@x.io) about it.'), 'Ask Jo about it.', 'an address beside its name goes whole');
  assert.equal(spoken('Changed in (apps/web/src/a.ts, apps/web/src/b.ts)'), 'Changed', 'no bracket of commas is left');
  assert.equal(spoken('Approve the review (see docs/review.md)'), 'Approve the review', 'a file two parts deep goes with its bracket');
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

test('NO ADDRESS OR ID IN AN ANSWER, ITS REASON OR WHAT A CHANGE WAS AND BECOMES', () => {
  const card = cardOf(
    ask({
      options: [
        { key: 'merge', label: 'Merge into joaquin@x.com', because: 'Same address as tasks#8 in /Users/mara/Developer/braindog', recommended: true },
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
          { field: 'link', before: '01ARZ3NDEKTSV4RRFFQ69G5FAV', after: 'Oxbow' },
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
  assert.equal(answeredLine(slash, accept, 'Mara', 'just now'), 'Slash suggested · Mara accepted');
  assert.equal(answeredLine(slash, slash.ways.find((w) => w.key === 'reject')!, 'Mara', 'just now'), 'Slash suggested · Mara declined');
  const drafted = cardOf(ask({ who: 'agent:claude', drafted_by: 'slash:model' }), { now });
  assert.equal(drafted.slash, true, 'drafted by Slash for whoever filed it');
  assert.equal(answeredLine(drafted, drafted.ways[1]!, 'Mara', 'just now'), 'Slash suggested · Mara chose Flat');
  const plain = cardOf(ask(), { now });
  assert.equal(answeredLine(plain, plain.ways[0]!, 'Mara', 'just now'), 'Per seat · you, just now');
  for (const s of [answeredLine(slash, accept, 'Mara', 'now'), slash.money, ...slash.ways.map((w) => w.label)]) assert.doesNotMatch(s, /—/u);
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

/* ── the card reads like a form ───────────────────────────── */

test('A FORM STARTS ON THE SUGGESTION ONLY WHERE A KEY MAY GIVE IT, and a hard answer says so in its button', () => {
  assert.equal(startsOn(cardOf(ask(), { now, home: 'GBP' })), 'seat', 'the suggestion is not chosen to start with');
  assert.equal(startsOn(cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' })), null, 'a hard answer starts chosen for the reader');
  const none = ask({ options: [{ key: 'a', label: 'A', because: '', recommended: false }, { key: 'b', label: 'B', because: '', recommended: false }] });
  assert.equal(startsOn(cardOf(none, { now })), null, 'a question with nothing suggested starts on an answer');
  /* THE RECORD'S OWN TWO ANSWERS ARE BUTTONS, so there is nothing to start on, even where Enter accepts. */
  assert.equal(startsOn(cardOf(ask({ kind: 'rowset', options: [] }), { now })), null);

  const hard = cardOf(ask({ cost: 'undo' }), { now, home: 'GBP' });
  assert.equal(pressSaid(hard, 'Needs you'), 'Needs you, can’t be undone easily');
  assert.equal(pressSaid(hard, 'Accept £12.98'), 'Accept £12.98, can’t be undone easily');
  assert.equal(pressSaid(cardOf(ask({ cost: 'shape' }), { now }), 'Needs you'), 'Needs you', 'a band that only warns adds nothing to the words');
  assert.doesNotMatch(pressSaid(hard, 'Needs you'), /—/u);
});

test('A CHOICE IS CHOSEN AND DECIDE GIVES IT; a number key and Enter on a choice still answer; Enter only where cheap', () => {
  const card = src('./DecisionCard.svelte');
  /* A POINTER OR SPACE ON A CHOICE ONLY CHOOSES IT; a press from outside it (a page's number key) answers, as it did. */
  assert.match(card, /function onChoice\(e: MouseEvent, way: Way\) \{\n\s+if \(e\.detail === 0 && document\.activeElement !== e\.currentTarget\) return press\(way\);\n\s+selectWay\(way\);/u);
  /* ENTER ON A CHOICE CHOOSES AND ANSWERS, as Enter sends a form; where one press decides there is nothing to choose first. */
  assert.match(card, /if \(e\.key === 'Enter'\) \{\n\s+e\.preventDefault\(\);\n\s+e\.stopPropagation\(\);\n\s+if \(chooses\) selectWay\(way\);\n\s+press\(way\);/u);
  /* DECIDE CARRIES THE KEY'S MARK ONLY ON A CARD THAT COSTS NOTHING, with an answer chosen. */
  assert.match(card, /data-enter=\{card\.enter !== null && selected !== null \? '' : undefined\}/u);
  assert.match(card, /onclick=\{commit\}>\{pressSaid\(card, queueWords\.decide, card\.ways\.find\(\(w\) => w\.key === selected\)\)\}/u, 'Needs you does not say the care a hard answer asks for');
  /* NO CHIP SAYS THE BAND: it is kept for the keys and the ranking, hidden, and said in the button. */
  assert.match(card, /<span class="queue-cost" data-cost=\{card\.cost\} hidden>/u);
  assert.match(card, /import '\.\/form\.css';/u, 'the card draws its choices its own way again');
});

test('ONE HARD ANSWER BESIDE A SAFE ONE: the question is a call, and only the hard answer is worded, held from the keys and from one press', () => {
  /* THE PACK UPDATE'S QUESTION, as the record sends it since batch 64: band `call`, and `hard` on taking alone. */
  const kept = (rec: 'keep' | 'take' | null, because = ''): QueueQuestion =>
    ask({
      options: [
        { key: 'keep', label: 'Keep my page', because, recommended: rec === 'keep' },
        { key: 'take', label: 'Take the update’s page', because, recommended: rec === 'take', hard: true },
      ],
    });
  const card = cardOf(kept('keep'), { now });
  assert.deepEqual(card.ways.map((w) => [w.key, w.hard]), [['keep', false], ['take', true]]);
  const [keep, take] = card.ways as [(typeof card.ways)[number], (typeof card.ways)[number]];

  /* THE QUESTION IS NOT HARD, SO KEEPING IS NOT WORDED AS HARD; taking is, on its own button and on Decide once chosen. */
  assert.equal(hardOf(card), false);
  assert.equal(hardOf(card, keep), false);
  assert.equal(hardOf(card, take), true);
  assert.equal(pressSaid(card, 'Needs you', keep), 'Needs you');
  assert.equal(pressSaid(card, 'Needs you', take), 'Needs you, can’t be undone easily');
  assert.equal(pressSaid(card, 'Needs you', undefined), 'Needs you', 'with nothing chosen Needs you says nothing it does not know');
  assert.equal(wayTail(card, keep, primaryOf(card)), '', 'the filled safe answer was worded as hard');
  assert.equal(wayTail(card, take, primaryOf(card)), ', can’t be undone easily', 'the hard answer says nothing on its own button');
  /* A QUESTION HARD AS A WHOLE STILL SAYS IT ON THE FILLED BUTTON, as it always did, and not on the others. */
  const whole = cardOf(ask({ cost: 'undo', options: [{ key: 'a', label: 'A', because: '', recommended: true }, { key: 'b', label: 'B', because: '', recommended: false }] }), { now });
  assert.deepEqual(whole.ways.map((w) => wayTail(whole, w, leadOf(whole))), [', can’t be undone easily', '']);
  /* AND THE HARD ONE IS NEVER THE FILLED ONE (audit 6g, AG11), suggested or not. */
  assert.equal(primaryOf(whole), null);

  /* ENTER GIVES THE SAFE SUGGESTION, AND NEVER A SUGGESTION THAT IS THE HARD ONE; nor does the form start chosen on it. */
  assert.equal(card.enter, 'keep');
  assert.equal(cardOf(kept('take'), { now }).enter, null, 'Enter gives an answer that cannot be taken back');
  assert.equal(startsOn(cardOf(kept('take', 'what it does'), { now })), null, 'the form starts chosen on the hard answer');

  /* ONE PRESS ON A CHOICE NEVER DECIDES WHERE ONE OF THE CHOICES IS HARD: the list keeps its ring and Decide. */
  assert.equal(pressOf(cardOf(kept('keep', 'what it does'), { now })), false);
  assert.equal(pressOf(cardOf(ask({ options: [{ key: 'keep', label: 'Keep', because: 'x', recommended: true }, { key: 'take', label: 'Take', because: 'y', recommended: false }] }), { now })), true, 'two safe answers lost their one press');

  /* DECIDE'S OWN SCREEN HANDS THE MARK ON (`queueOf`), so its card reads the same. */
  const classic = queueOf({ id: 'SG7', title: 'Q', band: 'call', opened: '', options: [{ key: 'keep', title: 'Keep', body: '' }, { key: 'take', title: 'Take', body: '', hard: true }] });
  assert.deepEqual(classic.options.map((o) => o.hard ?? false), [false, true]);

  /* AND THE CARD DRAWS IT THROUGH THOSE: each button by its own way points at the line under the row that says the care
     (said inside the button it wrapped to two lines at 390). */
  assert.match(src('./DecisionCard.svelte'), /aria-describedby=\{wayTail\(card, way, primary\) !== '' \? `\$\{uid\}-hard` : undefined\}/u);
});

test('TWO OR THREE ANSWERS THAT ARE ONLY THEIR NAMES ARE A ROW OF BUTTONS, the suggested or the first filled', () => {
  const named = (n: number, rec = -1) =>
    ask({ options: ['Chase it', 'Not yet', 'Ask Ana', 'Write it off'].slice(0, n).map((label, i) => ({ key: `k${i}`, label, because: '', recommended: i === rec })) });
  assert.equal(inlineOf(cardOf(named(2), { now })), true, 'Chase it and Not yet are two buttons');
  assert.equal(inlineOf(cardOf(named(3), { now })), true);
  assert.equal(inlineOf(cardOf(named(4), { now })), false, 'a fourth answer keeps the form');
  /* ONE ANSWER GRAMMAR: answers that each say what they do are a row too, the first filled, its line under the row. */
  assert.equal(inlineOf(cardOf(ask({ options: ask().options.map((o) => ({ ...o, recommended: false })) }), { now })), true, 'an answer with a line of what it does is a button, not a box that reads like text');
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
  assert.match(card, /data-weight=\{way\.key === primary \? filled : undefined\}/u);
  assert.match(card, /data-enter=\{way\.key === card\.enter \? '' : undefined\}/u);
  assert.match(card, /onclick=\{\(\) => press\(way\)\}/u);
  assert.match(card, /<span class="dc-btn-name">\{amount !== null && way\.key === primary \? amountAnswer\(way\.label, amount\) : way\.label\}<\/span>/u, 'the gate and the answered line read the name apart from the care said after it');
});

test('TWO OR THREE ANSWERS THAT CAN BE UNDONE ARE ONE PRESS EACH, even with a line of what each does', () => {
  const described = (n: number, over: Record<string, unknown> = {}) =>
    ask({
      options: ['Retire it', 'Park it another year', 'Sell it', 'Give it away'].slice(0, n).map((label, i) => ({ key: `k${i}`, label, because: `What answer ${i + 1} does.`, recommended: false })),
      ...over,
    });
  assert.equal(pressOf(cardOf(described(2), { now })), true, 'two answers with nothing suggested still waited in Needs you');
  assert.equal(pressOf(cardOf(described(3), { now })), true);
  assert.equal(pressOf(cardOf(ask(), { now })), true, 'a suggestion does not bring Needs you back');
  assert.equal(pressOf(cardOf(described(4), { now })), false, 'a fourth answer is a list to weigh, chosen and then given');
  assert.equal(pressOf(cardOf(described(2, { cost: 'undo' }), { now })), false, 'an answer that is hard to undo is two presses');
  assert.equal(pressOf(cardOf(described(2, { cost: 'shape' }), { now })), true, 'a band that only warns does not ask for two');
  assert.equal(pressOf(cardOf(ask({ kind: 'rowset', options: [] }), { now })), false, 'the record’s own two are a row of buttons');
  /* ONE ANSWER GRAMMAR SINCE U-A9: an answer with a line is a button in the row too, and a hard one keeps the form. */
  assert.equal(inlineOf(cardOf(described(2), { now })), true);
  assert.equal(inlineOf(cardOf(described(3), { now })), true);
  assert.equal(inlineOf(cardOf(described(4), { now })), false, 'a fourth answer is a list to weigh');
  assert.equal(inlineOf(cardOf(described(2, { cost: 'undo' }), { now })), false, 'an answer hard to undo is chosen, then given');
  assert.equal(inlineOf(cardOf(ask(), { now })), true, 'a suggested answer is the button, not a rectangle');

  const card = src('./DecisionCard.svelte');
  /* NOT WHILE THE RECORD'S REASON LINE IS OPEN, NOR ON A HOST THAT ASKS FOR A REASON ITSELF, where a press only chooses. */
  assert.match(card, /const oneTap = \$derived\(listed && drawn && onpress === undefined && phase !== 'asking' && pressOf\(card\)\);/u);
  /* A BUTTON IN A LIST, NOT A RADIO, with no ring; the gate finds it as it finds every choice, and reads its name. */
  const at = card.indexOf('{:else if oneTap}');
  const list = card.slice(at, card.indexOf('{:else if listed}', at));
  assert.ok(at > 0 && list.length > 0, 'the one-press choices are not drawn before the form’s');
  assert.match(list, /<ul class="queue-options dc-choices" aria-label=\{queueWords\.choices\}>/u);
  assert.match(list, /<li class="queue-option" data-recommended=\{way\.recommended \? '' : undefined\}>/u);
  assert.match(list, /class="queue-act dc-choice"\n\s+data-press\n\s+id=\{optId\(way\.key\)\}\n\s+data-enter=\{way\.key === card\.enter \? '' : undefined\}\n\s+onclick=\{\(\) => press\(way\)\}/u);
  assert.doesNotMatch(list, /role="radio|radiogroup|dc-ring|aria-checked/u, 'a choice that decides is drawn as a radio');
  /* AND NO DECIDE UNDER THEM, so the queue gate's press is the answer. */
  assert.match(card, /\{:else if phase !== 'asking' && !oneTap\}\n\s+<button\n\s+type="button"\n\s+class="dc-btn"\n\s+data-weight=\{filled\}\n\s+data-decide/u);
  const form = src('./form.css');
  assert.match(form, /\.dc-actions:not\(:has\(\*\)\) \{\n\s+display: none;/u, 'an empty row of buttons keeps its room');
  assert.match(form, /@media \(pointer: coarse\) \{\n\s+\.dc-choice \{\n\s+min-block-size: var\(--tap\);/u, 'a choice under a thumb is shorter than a thumb');
});

test('EVERY CARD STARTS WITH ITS SENTENCE: who asked is one line under the question, and the side is drawn only with something in it', () => {
  const card = src('./DecisionCard.svelte');
  /* CUT AT TWO LINES UNTIL "READ ALL", so the heading carries its clamp and its measure. */
  assert.match(card, /<div class="dc-main">\n(\s+<!--[^]*?-->\n)?\s+<svelte:element this=\{questionLevel\} class="queue-question" dir="auto" data-clamp=\{readAll \? undefined : ''\} bind:this=\{titleEl\}>/u, 'a card starts with who asked, not its sentence (U-A7)');
  assert.match(card, /\{#if !compact\}\n(\s+<!--[^]*?-->\n)?\s+<p class="queue-by">\n\s+<span class="dc-sr">\{cardWords\.askedBy\}<\/span>/u);
  const article = card.indexOf('<div class="dc-main">');
  assert.ok(card.indexOf('class="queue-question"', article) < card.indexOf('<p class="queue-by">', article), 'who asked leads the question');
  /* NAME AND APP, NEVER THE RUN'S TITLE CUT AT 24 CHARACTERS. */
  assert.match(card, /const from = \$derived\(\[card\.by\.app\]\.filter/u);
  /* THE LADDER'S RULE IS NO WHY: it waits behind an info mark, so it alone draws no side. */
  assert.match(card, /const side = \$derived\(!compact && \(\(card\.why !== '' && !ladderLine\(card\.why\)\) \|\| changesAny\)\);/u);
  assert.match(card, /\{#if side\}\n(\s+<!--[^]*?-->\n)?\s+<div class="dc-side">/u, 'a side is drawn for who asked alone');
  assert.match(card, /data-side=\{side \? '' : undefined\}/u);
  /* TWO COLUMNS ONLY FOR A CARD WITH A SIDE, and the parts are groups named once each, never sections. */
  assert.match(card, /@container \(inline-size >= 52rem\) \{\n\s+\.dc\[data-side\]:not\(\[data-compact\]\) \{\n\s+grid-template-columns: minmax\(0, 1fr\) 280px;/u);
  assert.doesNotMatch(card, /\.dc:not\(\[data-compact\]\)/u, 'a card with no side is laid out in two columns');
  assert.doesNotMatch(card, /<section|dc-part-by/u);
  assert.equal(card.match(/role="group" aria-labelledby=/gu)?.length, 2);
  assert.match(card, /\.queue-by \{\n\s+align-items: center;\n\s+flex-wrap: wrap;\n\s+column-gap: var\(--sp-2\);\n\s+font-size: var\(--fs-meta\);/u, 'the meta line is not 13');
});

test('COMPACT, OUTSIDE DECIDE: the question and its buttons only, and at most three before a count that opens Needs you', () => {
  const card = src('./DecisionCard.svelte');
  assert.match(card, /const inline = \$derived\(inlineOf\(card, compact\)\);/u);
  assert.match(card, /\{#if !compact\}\n\s+<!-- WHO ASKED[^]*?-->\n\s+<p class="queue-by">/u, 'a compact card still says who asked');
  assert.match(card, /\{#if link \|\| compact\}<a class="dc-open tap" href=\{at\(card\.href\)\}>/u, 'a compact question is not the door to its page');
  assert.match(card, /!link && !compact && onpress === undefined/u, 'a compact card offers Not now');
  const host = src('../page/QueueAnswer.svelte');
  assert.match(host, /compact = false,/u, 'QueueAnswer takes no compact prop');
  assert.match(host, /\{compact\} \/>/u, 'QueueAnswer does not hand compact to the card');
});

test('THE SUGGESTED ANSWER IS THE RED PRIMARY, IN ITS OWN WORDS, and the others are quiet beside it', () => {
  const three = ask({
    options: [
      { key: 'apex', label: 'Move to the apex', because: 'One domain to renew.', recommended: false },
      { key: 'keep', label: 'Keep the subdomain', because: 'Reputation stays where it is.', recommended: true },
      { key: 'both', label: 'Run both', because: 'Twice the warm-up.', recommended: false },
    ],
  });
  const card = cardOf(three, { now });
  assert.equal(suggestsOf(card), true);
  assert.equal(inlineOf(card), true, 'the answers are a row of buttons in Needs you');
  assert.equal(primaryOf(card), 'keep', 'the primary is the suggested option');
  assert.equal(card.ways[0]?.key, 'keep', 'the suggested option leads the row');
  assert.equal(card.ways[0]?.label, 'Keep the subdomain', 'the primary says the answer in its own words, not Decide');
  assert.equal(card.enter, 'keep', 'Enter gives the suggestion where it costs nothing');
  /* A HARD CARD FILLS NO ANSWER (audit 6g, AG11): its lead still says its care, and no key answers it. */
  const hard = cardOf({ ...three, cost: 'undo' } as QueueQuestion, { now });
  assert.equal(primaryOf(hard), null);
  assert.equal(leadOf(hard), 'keep');
  assert.equal(hard.enter, null);
  assert.equal(wayTail(hard, hard.ways[0]!, leadOf(hard)), ', can’t be undone easily');
  /* A MONEY CARD IS NEVER ACCEPTED BY ENTER, whatever is suggested. */
  const paying = cardOf({ ...three, money: [{ amount: 480000, currency: 'GBP' }] } as QueueQuestion, { now, home: 'GBP' });
  assert.equal(primaryOf(paying), 'keep');
  assert.equal(paying.enter, null, 'Enter never accepts money');
  /* NOTHING SUGGESTED, A FOURTH ANSWER, OR AN ANSWER THAT SHOWS ITS PICTURE: the form, as before. */
  assert.equal(suggestsOf(cardOf(ask({ options: three.options.map((o) => ({ ...o, recommended: false })) }), { now })), false);
  assert.equal(suggestsOf(cardOf(ask({ options: [...three.options, { key: 'sell', label: 'Sell it', because: '', recommended: false }] }), { now })), false);
  assert.equal(suggestsOf(cardOf(ask({ options: [{ ...three.options[1]!, shows: { swatch: ['#aa7744'] } }, three.options[0]!] }), { now })), false);
});

/* ── every place a question is drawn draws this card ───────────────────────── */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('THE FOUR DRAWS AND THE PALETTE DRAW THIS CARD', () => {
  for (const path of ['../palette/SlashThread.svelte'])
    assert.match(src(path), /import DecisionCard from '\$lib\/decide\/DecisionCard\.svelte'/u, `${path} draws a card of its own`);
  /* A PAGE'S QUEUE LOADS THE CARD beside its data, rather than ahead of the first paint. */
  for (const path of ['../page/QueueAnswer.svelte']) {
    assert.match(src(path), /import \{ cardNow, loadCard \} from '\$lib\/decide\/card-load\.ts'/u, `${path} draws the card it loads`);
    assert.match(src(path), /<DecisionCard [^>]*\{question\}/u, `${path} draws a card of its own`);
  }
  assert.match(src('./card-load.ts'), /import\('\.\/DecisionCard\.svelte'\)/u, 'the loader loads this card');
  const card = src('./DecisionCard.svelte');
  assert.match(card, /cardOf\(/u, 'the card reads its view model');
  assert.match(card, /import MergeCard from/u, 'a merge is a variant of the card');
  assert.match(card, /hold\(/u, 'a press is held for its Undo');
  assert.doesNotMatch(card, /—/u);
});

/* ── an arrangement in its own summary ── */

const ARRANGEMENT = {
  why: ['The money has stood still since the move.'],
  approve: ['CALLS OUT api.harbourline.example · every 1d · grant "Harbourline Bank"', 'CALLS OUT api.cedar.example · every 6h · grant "Cedar Mutual"'],
  rows: [
    { register: 'accounts', at: 'accounts#2', version: 3, patch: { name: 'Savings' }, before: { name: 'Everyday' } },
    { register: 'books', fields: { name: 'Lanternfish' } },
  ],
};

test('AN ARRANGEMENT SAYS ITSELF IN ITS OWN SUMMARY on every card, in place of the general line of what accepting does', () => {
  const said = 'Rearranges this BrainDog: 2 keys, 1 update, 2 feeds, 1 addition.';
  const arranging = ask({ kind: 'arrange', body_kind: 'arrange', options: [], does: 'Adds 1 to Books.', arranged: ARRANGEMENT });
  assert.equal(cardOf(arranging, { now, lead: true }).does, said, 'the lead says the summary, not the general line');
  assert.equal(cardOf(arranging, { now }).does, said, 'and so does a card further down the queue');
  /* A HOST THAT HOLDS THE BODY hands it, and the question need not carry it. */
  const bare = ask({ kind: 'arrange', body_kind: 'arrange', options: [], does: 'Adds 1 to Books.' });
  assert.equal(cardOf(bare, { now, body: ARRANGEMENT }).does, said);
  /* WITHOUT THE BODY the card says what it always said: the general line on the lead, nothing further down. */
  assert.equal(cardOf(bare, { now, lead: true }).does, 'Adds 1 to Books.');
  assert.equal(cardOf(bare, { now }).does, '');
  /* ONLY AN ARRANGEMENT: a body beside any other kind is not read as one. */
  assert.equal(cardOf(ask({ arranged: ARRANGEMENT }), { now }).does, '');
  assert.doesNotMatch(said, /—|#\d|api\./u);
});

test('AN ARRANGEMENT NAMES A PACK BY ITS NAME, never by its id, and keeps its own last word', () => {
  const said = (kind: string, arranged: Record<string, unknown>) => cardOf(ask({ kind, body_kind: kind, options: [], arranged }), { now }).does;
  assert.equal(said('pack', { install: 'money-core', packs: { install: ['money-core'] } }), 'Adds Money.');
  assert.equal(said('pack', { install: 'money-core', plan: [{ pack: 'money-core', from: '3.1.0', version: '3.2.0' }] }), 'Updates Money from 3.1.0 to 3.2.0.');
  assert.equal(said('settings', { pack: 'money-core', words: { a: 'b' } }), 'Changes the words and settings of Money.');
  assert.equal(said('arrange', { usecase: 'founder', packs: { install: ['usecase-founder', 'money-core'] } }), 'Sets this BrainDog up for Solo founder.');
  /* "ON" IS THE COPY'S OWN, not a word left hanging where an id was taken out. */
  assert.equal(said('pack', { enable: 'money-core' }), 'Turns Money back on.');
  for (const s of [said('pack', { install: 'money-core' }), said('pack', { enable: 'usecase-founder' }), said('settings', { pack: 'money-core' })]) {
    assert.doesNotMatch(s, /money-core|usecase-|#\d|—/u, s);
  }
});

/* A PRESS KEPT FOR THE RECORD (fluid F5) goes only if the same answer is still offered in the same words. */
test('a kept press is the same answer saying the same thing, and never another one', () => {
  const ways = [
    { key: 'accept', label: 'Chase it' },
    { key: 'reject', label: 'Not yet' },
  ];
  const said = (amount: string) => (w: { key: string; label: string }) => (w.key === 'accept' ? `${w.label} ${amount}` : w.label);
  assert.equal(keptWay(ways, { key: 'accept', said: 'Chase it £4,800' }, said('£4,800')), ways[0]);
  assert.equal(keptWay(ways, { key: 'accept', said: 'Chase it £4,800' }, said('£4,500')), null, 'the amount changed under the press');
  assert.equal(keptWay(ways.slice(1), { key: 'accept', said: 'Chase it £4,800' }, said('£4,800')), null, 'the answer was taken away');
  assert.equal(keptWay(ways, { key: 'reject', said: 'Chase it' }, said('£4,800')), null, 'a key alone is not the answer');
});

test('a card shows at most two answers, the suggested first, and one quiet later when the asker offered one', () => {
  const ways = [
    { key: 'a', label: 'Per seat' },
    { key: 'b', label: 'Per product' },
    { key: 'c', label: 'Ask me later' },
    { key: 'd', label: 'Flat price' },
  ];
  const row = answerRowOf(ways, 'b');
  assert.deepEqual(row.shown.map((w) => w.key), ['b', 'a']);
  assert.equal(row.later?.key, 'c');
  assert.equal(row.more, 1);
  const two = answerRowOf(ways.slice(0, 2), null);
  assert.deepEqual(two.shown.map((w) => w.key), ['a', 'b']);
  assert.equal(two.later, null);
  assert.equal(two.more, 0);
});
