/**
 * SLASH'S TONE IS ONLY EVER HIS WORDS (`src/slash.ts` `toneFault`, `ownWords`).
 *
 * The aim: "spark basically organizes and designs the tone of your braindog to fit your exact product". What
 * was true before: a model's voice line or label was filed as a `settings` draft with no check that the words were his,
 * and `reach.ts` `toneKept` was built and called by nothing. These pin the hold: a label is kept only in words of his own
 * titles and first lines, a voice line only with no digit, and what is dropped is said in the dropped line. Every name is
 * invented (`fixtures/names.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SlashModel } from '../src/index.ts';
import { LINE_NUMBERED, NEVER_WROTE, OWN_WORDS_MOST, fromModel, ownWords, toneFault, type OwnReading } from '../src/slash.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { COMPANIES, PROJECTS } from '../../../fixtures/names.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

const [LANTERN, COPPER, , QUIET] = PROJECTS;
const [BRIGHT] = COMPANIES;

/** A list as the reading holds it, by its name and how many rows it has. */
const list = (id: string, name: string, rows: number) => ({
  id,
  name,
  pack: null,
  rows,
  added30: 0,
  addedDays30: 0,
  writes90: 0,
  reads90: 0,
  agentWrites30: 0,
  declaredAt: '2026-08-01T09:00:00.000Z',
});

/** A page as the reading holds it: titled in his words or standing in by its slug. */
const page = (slug: string, title: string, titled: boolean, opens30: number) => ({
  slug,
  title,
  titled,
  pack: null,
  registers: [],
  opens30,
  openDays30: opens30,
  opens90: opens30,
  lastOpened: null,
  declaredAt: '2026-08-01T09:00:00.000Z',
});

/** A record twenty days old with his own lists, a page he titled, a word he set and a company he met often. */
const READING: OwnReading = {
  at: new Date(T0 + 20 * DAY).toISOString(),
  firstWrite: new Date(T0).toISOString(),
  ageDays: 20,
  lists: [list('tasks', `${LANTERN} launches`, 4), list('stock', `${QUIET} stock`, 9)],
  pages: [page('desk', `${COPPER} desk`, true, 6), page('made-row', 'made-row', false, 40)],
  tone: { pack: 'usecase-team', settings: { label_tasks: { title: null, default: 'Tasks', value: 'Errands' }, voice_home: { title: null, default: 'Hello', value: null } } },
  entities: [{ name: BRIGHT } as never],
  skills: ['weekly close'],
};

const answer = (values: Record<string, unknown>, body: Record<string, unknown> = { pack: 'usecase-team', values }) => ({
  drafts: [{ question: 'Say it your way?', body_kind: 'settings', body }],
});

test('HIS OWN WORDS are his titles and first lines from the reading: titled pages first, then lists, his set words, who he met and his skills', () => {
  assert.deepEqual(ownWords(READING), [`${COPPER} desk`, `${QUIET} stock`, `${LANTERN} launches`, 'Errands', BRIGHT, 'weekly close']);
  /* A PAGE STANDING IN BY ITS SLUG IS NOT HIS WORD, and neither is the use case's own default he never changed. */
  assert.ok(!ownWords(READING).includes('made-row'));
  assert.ok(!ownWords(READING).includes('Hello'));
  /* AT MOST FORTY, and only the first line of each. */
  const many = { ...READING, lists: Array.from({ length: 60 }, (_, i) => list(`l${i}`, `${QUIET} shelf ${i}\nsecond line`, 60 - i)) };
  const own = ownWords(many);
  assert.equal(own.length, OWN_WORDS_MOST);
  assert.ok(own.every((w) => !w.includes('second line')));
});

test('A LABEL IN HIS OWN WORDS IS KEPT, folded and in any order, and filed as the settings draft it was', () => {
  const out = fromModel(answer({ label_tasks: `${QUIET} launches`, one_tasks: 'errands' }), 'test model', 3, undefined, false, { usage: READING });
  assert.deepEqual(out.dropped, []);
  assert.equal(out.drafts.length, 1);
  assert.deepEqual(out.drafts[0]?.body, { pack: 'usecase-team', values: { label_tasks: `${QUIET} launches`, one_tasks: 'errands' } });
  assert.equal(out.drafts[0]?.body_kind, 'settings');
});

test('A LABEL WITH ONE WORD HE NEVER WROTE DROPS THE WHOLE DRAFT, and the dropped line says which', () => {
  const out = fromModel(answer({ label_tasks: `${QUIET} launches`, label_stock: 'Gizmo shelf' }), 'test model', 3, undefined, false, { usage: READING });
  assert.deepEqual(out.drafts, []);
  assert.deepEqual(out.dropped, [`Proposal 1 was dropped, because ${NEVER_WROTE} ("Gizmo shelf").`]);
});

test('A VOICE LINE HOLDING A DIGIT IS DROPPED, in a setting or in body.voice, and one without is kept whatever its words', () => {
  const numbered = fromModel(answer({ voice_since_away: 'You have 3 errands waiting' }), 'test model', 3, undefined, false, { usage: READING });
  assert.deepEqual(numbered.drafts, []);
  assert.deepEqual(numbered.dropped, [`Proposal 1 was dropped, because ${LINE_NUMBERED} ("You have 3 errands waiting").`]);

  const voiced = fromModel(answer({}, { voice: { home: 'Good morning, 2 things today' } }), 'test model', 3, undefined, false, { usage: READING });
  assert.deepEqual(voiced.drafts, []);
  assert.match(voiced.dropped[0] ?? '', /a line held a number/u);

  const plain = fromModel(answer({ voice_since_away: 'Since you last looked' }), 'test model', 3, undefined, false, { usage: READING });
  assert.deepEqual(plain.dropped, []);
  assert.equal(plain.drafts.length, 1);
});

test('BOTH FAULTS ARE SAID IN ONE LINE; a value put back to the default and a setting that is not tone are left alone', () => {
  const both = toneFault({ pack: 'usecase-team', values: { label_tasks: 'Widgets', voice_home: 'Hi 2 you' } }, 2, ownWords(READING));
  assert.equal(both, `Proposal 2 was dropped, because ${NEVER_WROTE} ("Widgets"), and ${LINE_NUMBERED} ("Hi 2 you").`);
  assert.equal(toneFault({ pack: 'usecase-team', values: { label_tasks: null, speaks: true } }, 1, []), null);
  /* AN ADD-ON'S SETTINGS INSIDE A PACK DRAFT ARE HELD THE SAME WAY. */
  assert.match(toneFault({ usecase: 'team', settings: [{ pack: 'usecase-team', values: { label_tasks: 'Widgets' } }] }, 1, ownWords(READING)) ?? '', /never wrote/u);
  /* A KEY OR AN ADDRESS THE MODEL WROTE IS NOT REPEATED BACK in the dropped line. */
  assert.doesNotMatch(toneFault({ pack: 'p', values: { label_tasks: 'mail ines@orchardline.example' } }, 1, []) ?? '', /ines@/u);
});

test('WITH NO READING HANDED OVER, NO LABEL IS KEPT: nothing is his to stand on, so nothing is put in his mouth', () => {
  const out = fromModel(answer({ label_tasks: `${QUIET} launches` }), 'test model');
  assert.deepEqual(out.drafts, []);
  assert.match(out.dropped[0] ?? '', /never wrote/u);
});

test('THROUGH THE PRESS: a model label in a word he never wrote and a numbered line are dropped, said, and nothing is filed', async () => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const model: SlashModel = {
    name: 'test model',
    draft: async () => ({
      drafts: [
        { question: 'Call Tasks something new?', body_kind: 'settings', body: { pack: 'usecase-team', values: { label_tasks: 'Gizmos' } } },
        { question: 'Greet you with a count?', body_kind: 'settings', body: { pack: 'usecase-team', values: { voice_home: 'You have 4 to do' } } },
      ],
    }),
  };
  const api = await createRecordApi({ sql, clock, slashModel: model });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'kiln-books', name: 'Kiln Books', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([{ id: 'register.tasks', kind: 'register', body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never }])).ok);
  for (const day of [0, 3, 6, 9, 12]) {
    clock.set(T0 + day * DAY);
    assert.ok((await api.create({ register: 'tasks', fields: { what: `${LANTERN} batch ${day}` } }, OWNER)).ok);
  }
  clock.set(T0 + 20 * DAY);
  const out = (await api.slashPropose({}, OWNER)) as { ok: boolean; value: { filed: unknown[]; dropped: string[] } };
  assert.ok(out.ok);
  assert.ok(out.value.dropped.some((d) => d.includes(NEVER_WROTE) && d.includes('"Gizmos"')), JSON.stringify(out.value.dropped));
  assert.ok(out.value.dropped.some((d) => d.includes(LINE_NUMBERED) && d.includes('"You have 4 to do"')), JSON.stringify(out.value.dropped));
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE opened_by = 'slash' AND body LIKE '%Gizmos%'").length, 0);
  sql.close();
});
