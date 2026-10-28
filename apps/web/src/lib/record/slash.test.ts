import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askSlash, canAsk, dailySaid, draftChange, draftedBy, readSlash, setDaily, suggestionsOf, words, type Drafted, type Reading, type SlashClient } from './slash.ts';

const READING: Reading = {
  model: null,
  quiet: null,
  noticed: [{ kind: 'grows', subject: 'logbook', text: 'Logbook gained 6 rows in the last thirty days, on 3 separate days.' }],
  drafts: [
    { question: 'Turn off Notes?', body_kind: 'pack', asked: { id: 'SG4', status: 'resolved' } },
    { question: 'Add Watch?', body_kind: 'pack', asked: { id: 'SG3', status: 'open' } },
    { question: 'Give Logbook a page of its own?', body_kind: 'arrange', asked: null },
  ],
  waiting: [{ id: 'SG3', question: 'Add Watch?' }],
  cap: 3,
};

const client = (answers: Record<string, unknown>): SlashClient & { called: string[] } => {
  const called: string[] = [];
  return { called, call: async (name) => (called.push(name), answers[name] as never) };
};

test('each suggestion says where it stands, new first, and links into Needs you once asked', () => {
  assert.deepEqual(suggestionsOf(READING), [
    { question: 'Give Logbook a page of its own?', state: 'new', href: null, said: words.fresh },
    { question: 'Add Watch?', state: 'waiting', href: '/decide/SG3', said: words.waiting },
    { question: 'Turn off Notes?', state: 'answered', href: '/decide/SG4', said: words.answered },
  ]);
});

test('the press is offered only when there is something new, room for it, and a record old enough', () => {
  assert.equal(canAsk(READING), true);
  assert.equal(canAsk({ ...READING, quiet: 'This BrainDog is 3 days old.' }), false);
  assert.equal(canAsk({ ...READING, waiting: [{ id: 'a', question: 'a' }, { id: 'b', question: 'b' }, { id: 'c', question: 'c' }] }), false);
  assert.equal(canAsk({ ...READING, drafts: READING.drafts.filter((d) => d.asked !== null) }), false);
});

test('the frame says who drafts, plainly, and no line uses a dash as punctuation', () => {
  assert.equal(draftedBy(READING), words.byRules);
  assert.match(draftedBy({ ...READING, model: 'endpoint' }), /^Drafted by endpoint, /u);
  for (const w of Object.values(words)) {
    const line = typeof w === 'function' ? (w as (x: never) => string)(2 as never) : w;
    assert.ok(!line.includes('—') && !line.includes(' - '), line);
  }
});

test('reading and asking go to the two record methods, and a refusal is said in the record’s own words', async () => {
  const c = client({ slash: { ok: true, value: READING }, slashPropose: { ok: true, value: { by: 'rules', filed: [{ id: 'SG5', question: 'x', by: 'rules' }], skipped: [], dropped: [] } } });
  assert.deepEqual(await readSlash(c), { ok: true, reading: READING });
  const asked = await askSlash(c);
  assert.ok(asked.ok);
  assert.equal(asked.said, 'One suggestion is in Needs you.');
  assert.deepEqual(c.called, ['slash', 'slashPropose']);

  const member = client({ slash: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This needs owner.' } } });
  assert.deepEqual(await readSlash(member), { ok: false, fix: words.notOwner, owner: false });
  const none = client({ slashPropose: { ok: true, value: { by: 'rules', filed: [], skipped: [], dropped: [] } } });
  assert.equal(((await askSlash(none)) as { said: string }).said, words.filedNone);
});

/* A PRESS THE INCLUDED MODEL TURNED AWAY UNSENT. The record says
   `large` (`packages/record/test/slash-declined.test.ts`), and before this the screen kept "Slash drafts with a model
   (included)" under the title, on a record where every press will be the rules'. */
test('a record too large for the included model is said plainly, under the title and once in the press, with no fix he cannot apply', async () => {
  const included: Reading = { ...READING, model: 'included' };
  /* THE RECORD'S OWN ANSWER, DROPPED LINE AND ALL. A mock with `dropped: []` beside `large: true` is a press no record
     returns, and it hid that the screen already draws `asked.dropped` under "Not put in Needs you": with the sentence added
     to the toast as well, one press said it verbatim twice on one screen, and a third time under the title. */
  const why = "This BrainDog is too large for the included model to read, so Slash's own rules drafted these.";
  const large = client({ slashPropose: { ok: true, value: { by: 'rules', filed: [{ id: 'SG5', question: 'x', by: 'rules' }], skipped: [], dropped: [why], large: true } } });
  const out = await askSlash(large);
  assert.ok(out.ok);
  assert.equal(out.said, 'One suggestion is in Needs you.');
  assert.ok(!out.asked.dropped.some((d) => out.said.includes(d)), out.said);
  assert.equal(draftedBy(included, out.asked), words.byLarge);
  assert.match(words.byLarge, /too large for the included model/u);
  assert.doesNotMatch(words.byLarge, /ceiling|neuron|raise|fewer/iu);

  /* A PRESS THE MODEL ANSWERED, or one that did not say `large`, leaves the frame as the reading has it. */
  const fine = client({ slashPropose: { ok: true, value: { by: 'included', filed: [], skipped: [], dropped: [], large: false } } });
  const said = await askSlash(fine);
  assert.ok(said.ok);
  assert.equal(said.said, words.filedNone);
  assert.equal(draftedBy(included, said.asked), words.byModel('included'));
  assert.equal(draftedBy(included), words.byModel('included'));

  /* THE SCREEN HANDS THE PRESS'S ANSWER TO THE LINE UNDER THE TITLE, or the line never changes, and draws the press's
     dropped lines, which is where the too-large sentence is said. */
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../routes/slash/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /draftedBy\(reading, asked/u);
  assert.match(screen, /#each asked\.dropped/u);
});

test('the daily switch says what on and off mean and when Slash last looked, and sends only the choice', async () => {
  assert.equal(dailySaid({ on: true, last: null }), words.dailyOn);
  assert.equal(dailySaid({ on: false, last: '2026-09-17' }), `${words.dailyOff} It last looked on 17 September 2026.`);
  for (const line of [words.dailyOn, words.dailyOff, words.dailySwitch, words.dailyTitle]) assert.ok(!line.includes('—'), line);

  const sent: unknown[] = [];
  const c: SlashClient = { call: async (name, args) => (sent.push([name, args]), { ok: true, value: { on: false, last: '2026-09-17' } }) as never };
  assert.deepEqual(await setDaily(c, false), { ok: true, daily: { on: false, last: '2026-09-17' }, said: words.dailySaidOff });
  assert.deepEqual(sent, [['slashDaily', { on: false }]]);

  const refused: SlashClient = { call: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this in the app.' } }) as never };
  assert.deepEqual(await setDaily(refused, true), { ok: false, fix: 'Open this in the app.' });
});

test('a new record with nothing noticed and nothing suggested gets one friendly empty state, not two empty sections', async () => {
  const { nothingYet } = await import('./slash.ts');
  const fresh: Reading = { ...READING, noticed: [], drafts: [], waiting: [] };
  assert.equal(nothingYet(fresh), true);
  assert.equal(nothingYet(READING), false);
  assert.equal(nothingYet({ ...fresh, noticed: READING.noticed }), false);
  assert.ok(words.emptyTitle.length > 0 && words.emptyBody.length > 0);
  for (const line of [words.emptyTitle, words.emptyBody]) assert.doesNotMatch(line, /—|–/u);

  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../routes/slash/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /nothingYet\(reading\)/u);
  assert.match(screen, /words\.emptyTitle/u);

  /* THE SIDEBAR HAS NO SLASH ROW: the page folded into the palette, the one ask (batch 5d). */
  const rail = readFileSync(new URL('../shell/SideBar.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(rail, /href: '\/slash'/u);
});

test('a description goes to the same press as asked, and is said in the same sentence', async () => {
  const sent: Record<string, unknown>[] = [];
  const c: SlashClient = {
    call: async (_name, args) => (sent.push(args ?? {}), { ok: true, value: { by: 'model', filed: [{ id: 'SG6', question: 'x', by: 'model' }], skipped: [], dropped: [] } } as never),
  };
  const out = await askSlash(c, 'A desk for my launch');
  assert.ok(out.ok);
  assert.equal(out.said, 'One suggestion is in Needs you.');
  await askSlash(c);
  assert.deepEqual(sent, [{ asked: 'A desk for my launch' }, {}]);
  const refused: SlashClient = { call: async () => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'asked: is at most 1000 characters.' } }) as never };
  assert.deepEqual(await askSlash(refused, 'x'), { ok: false, fix: 'asked: is at most 1000 characters.' });
});

test('TRY AGAIN SENDS THE SAME WORDS WITH THE DRAFTS TURNED DOWN, each as its question and change, and a first ask sends none', async () => {
  const sent: Record<string, unknown>[] = [];
  const c: SlashClient = { call: async (_name, args) => (sent.push(args ?? {}), { ok: true, value: { by: 'test model', drafts: [], dropped: [] } } as never) };
  const shown: Drafted = { question: 'A desk?', change: { to: { id: 'page.desk', kind: 'page', body: { page: 'desk' } } }, rows: { tasks: [{ what: 'x' }] }, preview: { pages: [] } };
  await draftChange(c, 'A desk for my launch.', 'desk');
  await draftChange(c, 'A desk for my launch.', 'desk', undefined, [shown]);
  assert.deepEqual(sent, [
    { asked: 'A desk for my launch.', page: 'desk' },
    { asked: 'A desk for my launch.', page: 'desk', not: [{ question: 'A desk?', change: { to: { id: 'page.desk', kind: 'page', body: { page: 'desk' } } } }] },
  ]);
});
