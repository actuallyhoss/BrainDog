import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askSpark, canAsk, dailySaid, draftedBy, readSpark, setDaily, suggestionsOf, words, type Reading, type SparkClient } from './spark.ts';

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

const client = (answers: Record<string, unknown>): SparkClient & { called: string[] } => {
  const called: string[] = [];
  return { called, call: async (name) => (called.push(name), answers[name] as never) };
};

test('each suggestion says where it stands, new first, and links into Decide once asked', () => {
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
  assert.match(draftedBy({ ...READING, model: 'endpoint' }), /\(endpoint\)/u);
  for (const w of Object.values(words)) {
    const line = typeof w === 'function' ? (w as (x: never) => string)(2 as never) : w;
    assert.ok(!line.includes('—') && !line.includes(' - '), line);
  }
});

test('reading and asking go to the two record methods, and a refusal is said in the record’s own words', async () => {
  const c = client({ spark: { ok: true, value: READING }, sparkPropose: { ok: true, value: { by: 'rules', filed: [{ id: 'SG5', question: 'x', by: 'rules' }], skipped: [], dropped: [] } } });
  assert.deepEqual(await readSpark(c), { ok: true, reading: READING });
  const asked = await askSpark(c);
  assert.ok(asked.ok);
  assert.equal(asked.said, 'One suggestion is on Decide.');
  assert.deepEqual(c.called, ['spark', 'sparkPropose']);

  const member = client({ spark: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This needs owner.' } } });
  assert.deepEqual(await readSpark(member), { ok: false, fix: words.notOwner, owner: false });
  const none = client({ sparkPropose: { ok: true, value: { by: 'rules', filed: [], skipped: [], dropped: [] } } });
  assert.equal(((await askSpark(none)) as { said: string }).said, words.filedNone);
});

/* A PRESS THE INCLUDED MODEL TURNED AWAY UNSENT (`loop/research-batch-sixty-four-audit.md` finding 5). The record says
   `large` (`packages/record/test/spark-declined.test.ts`), and before this the screen kept "Spark drafts with a model
   (included)" under the title, on a record where every press will be the rules'. */
test('a record too large for the included model is said plainly, under the title and once in the press, with no fix he cannot apply', async () => {
  const included: Reading = { ...READING, model: 'included' };
  /* THE RECORD'S OWN ANSWER, DROPPED LINE AND ALL. A mock with `dropped: []` beside `large: true` is a press no record
     returns, and it hid that the screen already draws `asked.dropped` under "Not put on Decide": with the sentence added
     to the toast as well, one press said it verbatim twice on one screen, and a third time under the title. */
  const why = "This BrainDog is too large for the included model to read, so Spark's own rules drafted these.";
  const large = client({ sparkPropose: { ok: true, value: { by: 'rules', filed: [{ id: 'SG5', question: 'x', by: 'rules' }], skipped: [], dropped: [why], large: true } } });
  const out = await askSpark(large);
  assert.ok(out.ok);
  assert.equal(out.said, 'One suggestion is on Decide.');
  assert.ok(!out.asked.dropped.some((d) => out.said.includes(d)), out.said);
  assert.equal(draftedBy(included, out.asked), words.byLarge);
  assert.match(words.byLarge, /too large for the included model/u);
  assert.doesNotMatch(words.byLarge, /ceiling|neuron|raise|fewer/iu);

  /* A PRESS THE MODEL ANSWERED, or one that did not say `large`, leaves the frame as the reading has it. */
  const fine = client({ sparkPropose: { ok: true, value: { by: 'included', filed: [], skipped: [], dropped: [], large: false } } });
  const said = await askSpark(fine);
  assert.ok(said.ok);
  assert.equal(said.said, words.filedNone);
  assert.equal(draftedBy(included, said.asked), words.byModel('included'));
  assert.equal(draftedBy(included), words.byModel('included'));

  /* THE SCREEN HANDS THE PRESS'S ANSWER TO THE LINE UNDER THE TITLE, or the line never changes, and draws the press's
     dropped lines, which is where the too-large sentence is said. */
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../routes/spark/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /draftedBy\(reading, asked/u);
  assert.match(screen, /#each asked\.dropped/u);
});

test('the daily switch says what on and off mean and when Spark last looked, and sends only the choice', async () => {
  assert.equal(dailySaid({ on: true, last: null }), words.dailyOn);
  assert.equal(dailySaid({ on: false, last: '2026-09-17' }), `${words.dailyOff} It last looked on 17 September 2026.`);
  for (const line of [words.dailyOn, words.dailyOff, words.dailySwitch, words.dailyTitle]) assert.ok(!line.includes('—'), line);

  const sent: unknown[] = [];
  const c: SparkClient = { call: async (name, args) => (sent.push([name, args]), { ok: true, value: { on: false, last: '2026-09-17' } }) as never };
  assert.deepEqual(await setDaily(c, false), { ok: true, daily: { on: false, last: '2026-09-17' }, said: words.dailySaidOff });
  assert.deepEqual(sent, [['sparkDaily', { on: false }]]);

  const refused: SparkClient = { call: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this in the app.' } }) as never };
  assert.deepEqual(await setDaily(refused, true), { ok: false, fix: 'Open this in the app.' });
});

test('a new record with nothing noticed and nothing suggested gets one friendly empty state, not two empty sections', async () => {
  const { nothingYet } = await import('./spark.ts');
  const fresh: Reading = { ...READING, noticed: [], drafts: [], waiting: [] };
  assert.equal(nothingYet(fresh), true);
  assert.equal(nothingYet(READING), false);
  assert.equal(nothingYet({ ...fresh, noticed: READING.noticed }), false);
  assert.ok(words.emptyTitle.length > 0 && words.emptyBody.length > 0);
  for (const line of [words.emptyTitle, words.emptyBody]) assert.doesNotMatch(line, /—|–/u);

  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../routes/spark/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /nothingYet\(reading\)/u);
  assert.match(screen, /words\.emptyTitle/u);

  /* The rail's star keeps its name and says what it is in plain words. */
  const rail = readFileSync(new URL('../ui/Sidebar.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(rail, /\['\/spark', 'Spark', 'star', '\/spark'\]/u);
  assert.match(rail, /sparkRail/u);
});
