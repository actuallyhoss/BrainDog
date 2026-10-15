/**
 * ENG-B14 jobs 3 and 5: one design agent and one queue of three, each offer with its last day (HD.224, "max 3 waiting").
 *
 * Slash's arrangement drafts wait in the pen's queue: the cap reads one count (the pen's waiting and every open
 * arrangement on Decide), a filed arrangement carries the recommender's rank and the day it lapses, and the page rules
 * are `recommend`'s alone. THE FILING BELOW IS `index.ts` `slashFiling` WITH THE BLOCKED LINE HANDED (`queueFiling`, then
 * `lapsing` on the body), since that file is not this job's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { FILED_RANK_MOST, LAPSE_DAYS, NAMED_PAGE, TIER, WAITING_MOST, WITHIN_MOST, filedRank, recommend } from '../src/design-agent.ts';
import { QUEUE_FULL, SLASH_OPEN_CAP, describedPresses, entityDrafts, lapsing, noticeUsage, queueFiling, readUsage, waitingCount, type EntityUse, type Usage } from '../src/slash.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 86_400_000;
const LAST_DAY = new Date(NOW + LAPSE_DAYS * DAY).toISOString().slice(0, 10);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const list = (id: string, name: string, added30: number) => ({
  id,
  name,
  pack: null,
  rows: added30 + 4,
  added30,
  addedDays30: 6,
  writes90: added30,
  reads90: 0,
  agentWrites30: 0,
  declaredAt: '2026-01-01',
});

/** A reading made by hand: two lists that grow and no page drawing either, on a record well past young. */
const reading = (over: Partial<Usage> = {}): Usage => ({
  at: new Date(NOW).toISOString(),
  firstWrite: '2026-01-01T00:00:00.000Z',
  ageDays: 280,
  listening: { pages: false, lists: false },
  lists: [list('visits', 'Visits', 12), list('samples', 'Samples', 7)],
  pages: [],
  agents: [],
  packs: [],
  speaking: null,
  writes: { all30: 0, agents30: 0, agents90: 0 },
  tone: null,
  skills: null,
  ...over,
});

const pagesOf = (drafts: readonly { body_kind: string; question: string }[]) => drafts.filter((d) => d.body_kind === 'arrange').map((d) => d.question);

test('with two of the pen\'s offers waiting, Slash files one arrangement, the strongest, and holds the next saying why', () => {
  const usage = reading({ pen: { held: [], dismissed: [], waiting: 2 } });
  const { drafts } = noticeUsage(usage, []);
  assert.equal(pagesOf(drafts).length, 2, 'both lists that grow are drafted a page');
  const { file, held } = queueFiling(usage, drafts);
  assert.deepEqual(pagesOf(file), ['Give Visits a page of its own? It grew by 12 in the last thirty days, and no page shows it yet.']);
  assert.deepEqual(held, [{ question: 'Give Samples a page of its own? It grew by 7 in the last thirty days, and no page shows it yet.', why: QUEUE_FULL }]);
  assert.doesNotMatch(QUEUE_FULL, /—|\brow\b|\bentit/u);

  /* ONE COUNT: three waiting anywhere is a full queue, the pen's or Decide's or both together. */
  assert.equal(queueFiling(reading({ pen: { held: [], dismissed: [], waiting: 1 }, arranging: 2 }), drafts).held.length, 2);
  assert.equal(queueFiling(reading({ arranging: WAITING_MOST }), drafts).held.length, 2);
  assert.equal(pagesOf(queueFiling(reading(), drafts).file).length, 2, 'an empty queue files both');

  /* ONE ASKED BEFORE TAKES NO ROOM, since filing skips it: the other is filed in the one place left. */
  const visits = drafts.find((d) => d.question.startsWith('Give Visits'))!;
  const again = queueFiling(usage, drafts, (d) => d.key === visits.key);
  assert.deepEqual(again.held, []);
  assert.equal(pagesOf(again.file).length, 2, 'the one asked passes to filing, which skips it');
});

test('a filed arrangement carries its rank and the day it lapses, and a lapse closes nothing', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const registers = ['visits', 'samples'].map((id) => ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } }));
  const put = await api.kernel.install(registers as never);
  assert.ok(put.ok, JSON.stringify(put));

  const before = readUsage(sql, api.kernel, NOW);
  assert.equal(before.arranging, 0);
  const usage = reading({ pen: { held: [], dismissed: [], waiting: 2 }, arranging: before.arranging });
  const { file } = queueFiling(usage, noticeUsage(usage, []).drafts);
  const ids: string[] = [];
  for (const d of file.filter((x) => x.body_kind === 'arrange')) {
    /* EACH PAGE IN THE FORM `prepare` FILES IT, a declaration with its kind: the arranger is the record's, not this test's. */
    const pages = (d.body.pages as { id: string; body: unknown }[]).map((p) => ({ ...p, kind: 'page' }));
    const got = api.kernel.propose({ question: d.question, body_kind: d.body_kind, body: { ...d.body, pages, ...lapsing(d) } } as never, 'slash');
    assert.ok(got.ok, JSON.stringify(got));
    ids.push((got.value as { id: string }).id);
  }
  assert.equal(ids.length, 1);
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', ids[0]!)!.body) as { rank?: unknown; lapses?: unknown };
  const offer = recommend({ nowMs: NOW, pages: [], lists: usage.lists })[0]!;
  assert.equal(offer.key, 'page:visits');
  assert.equal(body.rank, filedRank(offer.rank));
  assert.equal(body.lapses, LAST_DAY);

  /* THE SLASH PAGE SAYS ITS DAY, and the one count now holds it: the pen's two and this one, so nothing more files. */
  const seen = (await api.slash({}, owner)) as { ok: boolean; value: { waiting: { id: string; lapses?: string }[] } };
  assert.equal(seen.value.waiting.find((w) => w.id === ids[0])?.lapses, LAST_DAY);
  const after = readUsage(sql, api.kernel, NOW);
  assert.equal(after.arranging, 1);
  assert.equal(waitingCount({ ...after, pen: { held: [], dismissed: [], waiting: 2 } }), WAITING_MOST);

  /* A DAY PASSING TAKES NOTHING BACK BY ITSELF: read a month on, it is still open. */
  const later = await createRecordApi({ sql, clock: fixedClock(NOW + 30 * DAY) });
  await later.slash({}, owner);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 1);
  sql.close();
});

test('the kernel\'s scale keeps the queue\'s order, and only an arrangement with a day carries it', () => {
  assert.ok(filedRank(TIER.shape + WITHIN_MOST) <= FILED_RANK_MOST, 'within what the kernel takes');
  assert.ok(filedRank(Number.MAX_SAFE_INTEGER) <= FILED_RANK_MOST);
  assert.equal(filedRank(0), 0);
  for (const [a, b] of [[TIER.shape, TIER.page], [TIER.page, TIER.block], [TIER.block, TIER.column], [TIER.column, TIER.icon], [TIER.icon, 0]] as const)
    assert.ok(filedRank(a) > filedRank(b + WITHIN_MOST), 'a tier is never level with one below it');
  assert.ok(filedRank(TIER.page + 500) > filedRank(TIER.page + 10));
  assert.deepEqual(lapsing({ body_kind: 'pack', rank: 4000, lapses: LAST_DAY }), {});
  assert.deepEqual(lapsing({ body_kind: 'arrange' }), {});
  /* ONE NUMBER: Slash's own cap is the queue's. */
  assert.equal(SLASH_OPEN_CAP, WAITING_MOST);
});

const thing = (seq: number, name: string, met: number, linked: number): EntityUse => ({
  kind: 'project',
  list: 'things',
  listName: 'Projects',
  seq,
  name,
  title: 'name',
  met,
  linked,
  links: [{ list: 'tasks', name: 'Tasks', field: 'thing', many: false, rows: linked }],
  facts: [{ field: 'state', label: 'State', as: 'fact' }],
  lead: { field: 'state', label: 'state' },
});

test('a named thing earns its page once, from recommend alone, in its order and with its day', () => {
  const lanternfish = thing(1, PROJECTS[0], 0, NAMED_PAGE.linked);
  const copperleaf = thing(2, PROJECTS[1], NAMED_PAGE.met + 3, 0);
  const under = thing(3, PROJECTS[3], NAMED_PAGE.met - 1, NAMED_PAGE.linked - 1);
  const lists = [list('things', 'Projects', 0), list('tasks', 'Tasks', 0)];
  /* LANTERNFISH TWICE in the reading is one page offered, not two. */
  const usage = reading({ lists, entities: [lanternfish, copperleaf, lanternfish, under] });
  const drafts = entityDrafts(usage);
  assert.deepEqual(
    drafts.map((d) => (d.body.pages as { body: { title: string } }[])[0]!.body.title),
    [PROJECTS[1], PROJECTS[0]],
    'the stronger first, as the recommender ranks them, and the one under the bar not at all',
  );
  const offers = recommend({ nowMs: NOW, pages: [], named: [lanternfish, copperleaf, under] });
  assert.deepEqual(
    drafts.map((d) => [d.rank, d.lapses]),
    offers.map((o) => [o.rank, o.lapses]),
    'each draft is the recommender\'s offer, its rank and its day',
  );
  assert.ok(drafts.every((d) => d.lapses === LAST_DAY));

  /* A PAGE A TEMPLATE MADE FOR ITS ROW IS ITS PAGE, as the recommender reads it: no draft. */
  const made = { slug: 'about-lanternfish', title: 'About Lanternfish', pack: null, registers: ['tasks'], opens90: 0, opens30: 0, openDays30: 0, titled: false, declaredAt: '', row: { list: 'things', seq: 1 } };
  assert.deepEqual(
    entityDrafts(reading({ lists, entities: [lanternfish], made: [made as never] })),
    [],
  );
});

test('the described press is held by the one count, and its sentence keeps its words', () => {
  const presses = describedPresses<unknown>();
  const said = `${WAITING_MOST} of Slash's questions are already waiting on Decide, so nothing was drafted from what you described. Answer one of them, then ask again.`;
  const none = () => false;
  /* THE PEN'S TWO AND ONE ON DECIDE ARE THREE, though Slash itself has only one open. */
  assert.equal(presses.held('A desk for the week', waitingCount({ pen: { held: [], dismissed: [], waiting: 2 }, arranging: 1 }), none), said);
  assert.equal(presses.held('A desk for the week', waitingCount({ pen: { held: [], dismissed: [], waiting: 2 }, arranging: 0 }), none), null);
  assert.equal(presses.held('A desk for the week', waitingCount({}), none), null);
  assert.doesNotMatch(said, /—/u);
});
