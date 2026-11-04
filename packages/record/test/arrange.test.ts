/**
 * Arranging a record by proposal: what a token reads, what it may ask for, and what only the owner's press applies.
 *
 * THE DOOR IS WHAT IS HELD HERE. A token reads the arrangement and files questions; it never installs, turns
 * a pack or changes a setting. A member who may decide other questions may not accept one of these. And
 * what the owner is shown is the record's own reading, never the proposer's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { labelSetting, normaliseUseCase, useCasePack } from '@braindog/declare';
import { doesOf } from '@braindog/kernel';

import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };
const decider: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'decide' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};

/** A first-party-shaped module: one list and a page over it. */
const WORK = {
  pack: 'work',
  version: '1.0.0',
  summary: 'Tasks.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'tasks', name: 'Tasks', title: 'what', pack: 'work', fields: [{ id: 'what', type: 'text', required: true }, { id: 'state', type: 'enum', values: ['open', 'done'] }] },
    {
      page: 'work',
      title: 'Work',
      nav: { section: 'Work', order: 10 },
      requires: ['register.tasks'],
      blocks: [{ kind: 'table', source: 'register.tasks', span: 12, empty: 'Nothing yet.' }],
    },
  ],
};

/** A label whose setting name would pass 32 characters, so it is kept as `lk_<hash>`. */
const LONG_LABEL = 'courses.submission_state.handed_in_after_deadline';

const STUDY = (() => {
  const u = normaliseUseCase({
    usecase: 'study',
    version: '1.0.0',
    title: 'Study',
    summary: 'Courses and what is due.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: ['homework'],
    modules: ['work'],
    voice: { home: 'Today', needs_you: 'Coming up' },
    labels: { [LONG_LABEL]: 'Handed in late' },
    pack: {
      pack: 'usecase-study',
      version: '1.0.0',
      summary: 'Courses.',
      author: 'BrainDog',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      declarations: [
        { register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
        {
          page: 'studies',
          title: 'Studies',
          nav: { section: 'Studies', order: 10 },
          requires: ['register.courses'],
          blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
        },
      ],
    },
  });
  assert.ok(u.ok);
  return useCasePack(u.value)!;
})();

const CATALOGUE: CatalogueEntry[] = [
  { id: 'work', kind: 'pack', title: 'Work', summary: 'Tasks.', modules: [], doc: () => WORK },
  { id: 'usecase-study', kind: 'usecase', title: 'Study', summary: 'Courses and what is due.', modules: ['work'], doc: () => STUDY },
];

async function record(catalogue: CatalogueEntry[] = CATALOGUE) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue });
  return { api, sql };
}

const accept = (id: string) => ({ id, decide: { option: 'accept', reason: 'yes' } });

test('AN AGENT READS HOW THE RECORD IS ARRANGED IN ONE COMPACT ANSWER, and the grammar it proposes in', async () => {
  const { api, sql } = await record();
  const seen = value<{ packs: unknown[]; offer: { id: string; modules?: string[] }[]; voice: { pack: string | null }; pages: unknown[]; waiting: string[] }>(
    await api.arrangement({}, agent),
  );
  assert.deepEqual(seen.packs, []);
  assert.deepEqual(seen.offer.map((o) => o.id), ['work', 'usecase-study']);
  assert.deepEqual(seen.offer[1]?.modules, ['work']);
  assert.equal(seen.voice.pack, null);
  assert.ok(JSON.stringify(seen).length < 1500, `${JSON.stringify(seen).length} bytes`);

  const page = value<{ block: { kind: string[] }; example: { id: string; kind: 'page'; body: never } }>(await api.arrangement({ grammar: 'page' }, agent));
  assert.ok(value(await api.arrangement({ grammar: 'proposals' }, agent)));
  const wrong = refusal(await api.arrangement({ grammar: 'yaml' }, agent));
  assert.deepEqual(wrong.allowed, ['page', 'register', 'metric', 'rule', 'proposals', 'ingest', 'kinds', 'pack']);
  assert.equal(refusal(await api.arrangement({ pages: 'x' } as never, agent)).code, 'FIELD_UNKNOWN');

  /* THE KINDS ARE THE ONES THE LINT REFUSES AGAINST, and the example is a page that installs over Work. */
  value(await api.kernel.install([{ id: 'register.tasks', kind: 'register', body: WORK.declarations[0] as never }]));
  const bad = refusal(await api.kernel.install([{ id: 'page.x', kind: 'page', body: { page: 'x', title: 'X', blocks: [{ kind: 'nope' }] } as never }]));
  assert.deepEqual([...page.block.kind].filter((k) => !k.startsWith('block.')).sort(), [...(bad.allowed ?? [])].sort());
  value(await api.kernel.install([page.example]));
  sql.close();
});

test('A TOKEN PROPOSES INSTALLING A USE CASE, IS SHOWN WHAT IT WOULD DO, AND ONLY THE OWNER INSTALLS IT', async () => {
  /* THE ENTRY'S OWN STEP RUNS ONCE ITS PACK IS IN, reading the list it just made; one that throws leaves the install. */
  const after: string[] = [];
  const { api, sql } = await record(
    CATALOGUE.map((e) =>
      e.kind !== 'usecase'
        ? e
        : {
            ...e,
            afterInstall: async (io) => {
              after.push(`courses:${String((await io.rows('courses'))?.length)}`, `nothing:${String(await io.rows('nothing'))}`);
              throw new Error('a link that would not land');
            },
          },
    ),
  );
  const filed = value<{ id: string }>(
    await api.propose({ question: 'Set this BrainDog up for studying?', body_kind: 'pack', body: { install: 'study', approve: ['CALLS OUT evil.example'], plan: [] } } as never, agent),
  );
  const row = value<{ body: { install: string; packs: { install: string[] }; plan: { pack: string; adds: string[] }[]; approve: string[] } }>(
    await api.governance({ id: filed.id }, owner),
  );
  assert.equal(row.body.install, 'usecase-study');
  assert.deepEqual(row.body.packs.install, ['work', 'usecase-study'], 'the module goes in first');
  assert.ok(row.body.plan[1]?.adds.includes('page.studies'));
  assert.deepEqual(row.body.approve, [], 'the proposer wrote its own approval lines and they were kept');
  assert.equal(api.kernel.packStates().length, 0, 'a proposal installed something');

  /* NO TOKEN ANSWERS, AND NEITHER DOES A MEMBER WHO MAY ONLY DECIDE. */
  assert.ok(refusal(await api.decide(accept(filed.id), agent)));
  assert.equal(refusal(await api.decide(accept(filed.id), decider)).code, 'LEVEL_REQUIRED');
  assert.equal(api.kernel.packStates().length, 0);

  const done = value<{ applied: { installed: string[] } }>(await api.decide(accept(filed.id), owner));
  assert.deepEqual(done.applied.installed, ['work', 'usecase-study']);
  /* KEPT ON THE DECISION, so a reload and every other reader see what was applied, not only the tab that pressed. */
  const settled = value<{ decision: string }>(await api.governance({ id: filed.id }, owner));
  const decision = value<{ applied: { installed: string[] } | null }>(await api.governance({ register: 'decision', id: settled.decision } as never, owner));
  assert.deepEqual(decision.applied?.installed, ['work', 'usecase-study']);
  assert.deepEqual(after, ['courses:0', 'nothing:null']);
  assert.deepEqual(api.kernel.packStates().map((p) => p.id), ['usecase-study', 'work']);
  assert.equal(value<{ status: string }>(await api.governance({ id: filed.id }, owner)).status, 'resolved');
  sql.close();
});

test('THE VOICE, A PAGE AND A WHOLE ARRANGEMENT, EACH READ FIRST AND APPLIED ON ACCEPT', async () => {
  const { api, sql } = await record();
  /* No use case yet: the voice has nowhere to go, and the refusal says what to do. */
  const houseVoice = refusal(await api.propose({ question: 'Say Today?', body_kind: 'settings', body: { voice: { home: 'Today' } } } as never, agent));
  assert.equal(houseVoice.code, 'REQUIRED_MISSING');
  assert.match(houseVoice.fix, /Install a use case/);

  /* One arrangement: the use case, a page changed, and the voice. */
  const arranged = value<{ id: string }>(
    await api.propose(
      {
        question: 'Rearrange this BrainDog for studies?',
        body_kind: 'arrange',
        body: {
          why: ['They wrote that they are studying for exams.'],
          usecase: 'study',
          pages: [{ id: 'page.today', kind: 'page', body: { page: 'today', title: 'Today', requires: ['register.courses'], blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'Nothing today.' }] } }],
          voice: { home: 'Desk' },
        },
      } as never,
      agent,
    ),
  );
  const filed = value<{ body: { packs: { install: string[] }; pages: { was: number | null }[]; settings: { pack: string; values: object; before: object }[] } }>(
    await api.governance({ id: arranged.id }, owner),
  );
  assert.deepEqual(filed.body.packs.install, ['work', 'usecase-study']);
  assert.equal(filed.body.pages[0]?.was, null);
  assert.deepEqual(filed.body.settings[0], { pack: 'usecase-study', values: { voice_home: 'Desk' }, before: { voice_home: 'Today' } });

  const done = value<{ applied: Record<string, string[]> }>(await api.decide(accept(arranged.id), owner));
  assert.deepEqual(done.applied, { installed: ['work', 'usecase-study'], pages: ['page.today'], settings: ['usecase-study'] });
  const now = value<{ voice: { pack: string; said: Record<string, string> }; pages: { slug: string }[] }>(await api.arrangement({}, agent));
  assert.equal(now.voice.pack, 'usecase-study');
  assert.equal(now.voice.said.home, 'Desk');

  /* A page's declaration, read and changed. */
  const decl = value<{ id: string; version: number; body: { title: string } }>(await api.arrangement({ page: 'studies' }, agent));
  assert.equal(decl.id, 'page.studies');
  const moved = value<{ id: string }>(
    await api.propose({ question: 'Call it Courses?', body_kind: 'change', body: { declaration_id: decl.id, to: { id: decl.id, kind: 'page', body: { ...decl.body, title: 'Courses' } } } } as never, agent),
  );
  value(await api.decide(accept(moved.id), owner));
  assert.equal(value<{ body: { title: string } }>(await api.arrangement({ page: 'studies' }, agent)).body.title, 'Courses');

  /* And a voice change on its own. */
  const voiced = value<{ id: string }>(await api.propose({ question: 'Say Today again?', body_kind: 'settings', body: { voice: { home: 'Today' } } } as never, agent));
  value(await api.decide(accept(voiced.id), owner));
  assert.equal(value<{ voice: { said: Record<string, string> } }>(await api.arrangement({}, agent)).voice.said.home, 'Today');
  sql.close();
});

test('EVERY REFUSAL NAMES WHAT TO SEND INSTEAD', async () => {
  const { api, sql } = await record();
  const unknown = refusal(await api.propose({ question: 'x?', body_kind: 'pack', body: { install: 'crm' } } as never, agent));
  assert.equal(unknown.code, 'DECLARATION_UNKNOWN');
  assert.match(unknown.fix, /work, usecase-study/);

  const page = refusal(await api.arrangement({ page: 'nowhere' }, agent));
  assert.equal(page.code, 'PAGE_UNKNOWN');

  value(await api.decide(accept(value<{ id: string }>(await api.propose({ question: 'Study?', body_kind: 'pack', body: { install: 'study' } } as never, agent)).id), owner));
  const key = refusal(await api.propose({ question: 'x?', body_kind: 'settings', body: { voice: { homepage: 'x' } } } as never, agent));
  assert.equal(key.code, 'FIELD_UNKNOWN');
  assert.ok(key.allowed?.includes('home'));
  const twice = refusal(await api.propose({ question: 'x?', body_kind: 'pack', body: { install: 'work' } } as never, agent));
  assert.equal(twice.code, 'TRANSITION_ILLEGAL');
  const setting = refusal(await api.propose({ question: 'x?', body_kind: 'settings', body: { pack: 'usecase-study', values: { colour: 'red' } } } as never, agent));
  assert.equal(setting.code, 'FIELD_UNKNOWN');

  /* A page that would not install is refused when it is filed, not when the owner accepts it. */
  const blank = refusal(
    await api.propose({ question: 'x?', body_kind: 'arrange', body: { why: ['x'], pages: [{ id: 'page.blank', kind: 'page', body: { page: 'blank', title: 'Blank', blocks: [] } }] } } as never, agent),
  );
  assert.equal(blank.code, 'DECLARATION_INVALID');

  /* A host with no catalogue says to send the document. */
  const bare = await record([]);
  assert.match(refusal(await bare.api.propose({ question: 'x?', body_kind: 'pack', body: { install: 'work' } } as never, agent)).fix, /Send the pack document as doc/);
  value(await bare.api.propose({ question: 'Work?', body_kind: 'pack', body: { install: 'work', doc: WORK } } as never, agent));
  bare.sql.close();
  sql.close();
});

/** A small use case called `id`, holding one list of its own. */
const smallUseCase = (id: string, list: string) => {
  const u = normaliseUseCase({
    usecase: id,
    version: '1.0.0',
    title: id.charAt(0).toUpperCase() + id.slice(1),
    summary: `A ${id} list.`,
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    voice: { home: id },
    pack: {
      pack: `usecase-${id}`,
      version: '1.0.0',
      requires: { format: 1, primitives: 1, packs: {} },
      declarations: [{ register: list, name: list, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
    },
  });
  assert.ok(u.ok);
  return useCasePack(u.value)!;
};

test('A USE CASE GOES BESIDE THE ONE SPEAKING AND NEVER TAKES ITS VOICE, whichever way the ids sort, with three on', async () => {
  const { api, sql } = await record([
    ...CATALOGUE,
    { id: 'usecase-writing', kind: 'usecase', title: 'Writing', summary: 'Drafts.', modules: [], doc: () => smallUseCase('writing', 'drafts') },
    { id: 'usecase-art', kind: 'usecase', title: 'Art', summary: 'Sketches.', modules: [], doc: () => smallUseCase('art', 'sketches') },
    { id: 'usecase-diary', kind: 'usecase', title: 'Diary', summary: 'Entries.', modules: [], doc: () => smallUseCase('diary', 'entries') },
  ]);
  assert.equal(refusal(await api.propose({ question: 'Writing?', body_kind: 'arrange', body: { why: ['x'], alongside: ['writing'] } } as never, agent)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.propose({ question: 'Work?', body_kind: 'arrange', body: { why: ['x'], usecase: 'study', alongside: ['work'] } } as never, agent)).at, 'body.alongside[0]');

  /* ART SORTS BEFORE STUDY, and goes beside it all the same. */
  const filed = value<{ id: string }>(await api.propose({ question: 'Study, with art and writing beside?', body_kind: 'arrange', body: { why: ['They study, draw and write.'], usecase: 'study', alongside: ['art', 'writing'] } } as never, agent));
  const row = value<{ body: { alongside: string[]; packs: { install: string[] } } }>(await api.governance({ id: filed.id }, owner));
  assert.deepEqual(row.body.alongside, ['art', 'writing']);
  assert.deepEqual(row.body.packs.install, ['work', 'usecase-study', 'usecase-art', 'usecase-writing'], 'the one speaking goes in first');
  value(await api.decide(accept(filed.id), owner));
  type Config = { values: Record<string, unknown> };
  const speaks = async (id: string) => value<Config>(await api.packConfig({ id }, owner)).values.speaks;
  const voice = async () => value<{ voice: { pack: string } }>(await api.arrangement({}, agent)).voice.pack;
  assert.equal(await voice(), 'usecase-study', 'the voice moved to a use case put beside it');
  assert.deepEqual([await speaks('usecase-art'), await speaks('usecase-study'), await speaks('usecase-writing')], [false, true, false], 'the answer was not written down');

  /* A FOURTH, BY A PACK PROPOSAL, SORTING FIRST OF ALL: Decide is told who keeps the voice, and it is kept. */
  const diary = value<{ id: string }>(await api.propose({ question: 'Diary?', body_kind: 'pack', body: { install: 'diary' } } as never, agent));
  assert.equal(value<{ body: { keeps?: string } }>(await api.governance({ id: diary.id }, owner)).body.keeps, 'usecase-study');
  value(await api.decide(accept(diary.id), owner));
  assert.equal(await voice(), 'usecase-study');
  assert.equal(await speaks('usecase-diary'), false);

  /* AN ARRANGEMENT SETTING THE RECORD UP FOR ONE ALREADY ON MAKES IT SPEAK, and exactly one does. */
  const lead = value<{ id: string }>(await api.propose({ question: 'Writing first?', body_kind: 'arrange', body: { why: ['Mostly writing now.'], usecase: 'writing', packs: { disable: ['usecase-art'] } } } as never, agent));
  value(await api.decide(accept(lead.id), owner));
  assert.equal(await voice(), 'usecase-writing');
  assert.deepEqual([await speaks('usecase-diary'), await speaks('usecase-study'), await speaks('usecase-writing')], [false, false, true]);
  sql.close();
});

test('THE OWNER INSTALLING A USE CASE BESIDE ONE SPEAKING KEEPS THAT VOICE, even when the new id sorts first', async () => {
  const { api, sql } = await record([]);
  const put = async (doc: unknown) => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash }, owner));
  };
  await put(smallUseCase('writing', 'drafts'));
  await put(smallUseCase('study', 'lessons'));
  await put(smallUseCase('art', 'sketches'));
  const said = value<{ voice: { pack: string } }>(await api.arrangement({}, agent));
  assert.equal(said.voice.pack, 'usecase-writing');
  const held = await Promise.all(['usecase-art', 'usecase-study', 'usecase-writing'].map(async (id) => value<{ values: Record<string, unknown> }>(await api.packConfig({ id }, owner)).values.speaks));
  assert.deepEqual(held, [false, false, true]);

  /* THE ANSWER WRITTEN DOWN IS ONE CHANGE IN THE LOG: every line of one write shares its batch, and no other write's. */
  const lines = api.kernel.eventsBefore(null, 50).filter((e) => e.kind === 'edit' && e.target_kind === 'pack' && JSON.stringify(e.to).includes('speaks'));
  assert.ok(lines.length >= 3, JSON.stringify(lines));
  assert.ok(lines.every((e) => typeof e.batch === 'string' && e.batch.length === 26), 'a voice line was written with no batch');
  assert.ok(new Set(lines.map((e) => e.batch)).size >= 2, 'two installs were written as one change');

  /* AND THE APP'S OWN CALLS JOIN BY THE BATCH THEY SEND, which is a ULID or refused. */
  assert.equal(refusal(await api.setPackConfig({ id: 'usecase-art', values: { speaks: true }, batch: 'next to the last one' }, owner)).code, 'VALUE_MALFORMED');
  const batch = '01K5B3M2Q8ZC4XJ7N9TVRHW6YD';
  value(await api.setPackConfig({ id: 'usecase-art', values: { speaks: true }, batch }, owner));
  value(await api.setPackConfig({ id: 'usecase-writing', values: { speaks: false }, batch }, owner));
  assert.deepEqual(api.kernel.eventsBefore(null, 2).map((e) => e.batch), [batch, batch]);
  sql.close();
});

test('A LONG LABEL IS FILED WITH ITS TITLE, so Decide never says its hashed setting name', async () => {
  const { api } = await record();
  const hashed = labelSetting(LONG_LABEL);
  assert.match(hashed, /^lk_[0-9a-f]{8}$/u);
  const arranged = value<{ id: string }>(
    await api.propose(
      { question: 'Arrange for studies?', body_kind: 'arrange', body: { why: ['Studying.'], usecase: 'study', settings: [{ pack: 'usecase-study', values: { [hashed]: 'Late', voice_home: 'Desk' } }] } } as never,
      agent,
    ),
  );
  const filed = value<{ body: { settings: { titles?: Record<string, string> }[] } }>(await api.governance({ id: arranged.id }, owner));
  assert.deepEqual(filed.body.settings[0]?.titles, { [hashed]: 'Label: courses, submission state, handed in after deadline' });
});

test('A PROPOSAL UPDATES A USE CASE THAT IS ON TO THE NEWER VERSION OFFERED, through the same plan, with the carry step', async () => {
  let offered = '1.0.0';
  const carried: string[] = [];
  const doc = () => ({ ...smallUseCase('diary', 'entries'), version: offered });
  const { api, sql } = await record([
    ...CATALOGUE,
    {
      id: 'usecase-diary',
      kind: 'usecase',
      title: 'Diary',
      summary: 'Entries.',
      modules: [],
      doc,
      carry: async (_io, from) => {
        carried.push(from);
        return 0;
      },
    },
  ]);
  value(await api.decide(accept(value<{ id: string }>(await api.propose({ question: 'Diary?', body_kind: 'pack', body: { install: 'diary' } } as never, agent)).id), owner));
  assert.deepEqual(carried, [], 'a first install ran the carry step');

  /* THE SAME VERSION IS STILL REFUSED, and says so. */
  const same = refusal(await api.propose({ question: 'Again?', body_kind: 'pack', body: { install: 'diary' } } as never, agent));
  assert.equal(same.code, 'TRANSITION_ILLEGAL');
  assert.match(same.fix, /at 1\.0\.0, and no newer version is offered/u);

  offered = '1.2.0';
  const seen = value<{ updates?: { id: string; from: string; to: string }[] }>(await api.arrangement({}, agent));
  assert.equal(seen.updates, undefined, 'an entry with no version said is not built on every read');
  const filed = value<{ id: string }>(await api.propose({ question: 'Update Diary?', body_kind: 'pack', body: { install: 'diary' } } as never, agent));
  const row = value<{ body: { packs: { install: string[] }; plan: { pack: string; from?: string; version: string }[] } }>(await api.governance({ id: filed.id }, owner));
  assert.deepEqual(row.body.packs.install, ['usecase-diary']);
  assert.deepEqual(row.body.plan.map((p) => [p.pack, p.from, p.version]), [['usecase-diary', '1.0.0', '1.2.0']]);
  value(await api.decide(accept(filed.id), owner));
  const packs = value<{ packs: { id: string; version?: string }[] }>(await api.arrangement({}, agent)).packs;
  assert.equal(packs.find((p) => p.id === 'usecase-diary')?.version, '1.2.0');
  assert.deepEqual(carried, ['1.0.0'], 'the update did not run the carry step from the version it replaced');

  /* AN ARRANGEMENT NAMING IT UPDATES IT TOO, and one accepted after the pack is already there changes nothing. */
  offered = '1.3.0';
  const first = value<{ id: string }>(await api.propose({ question: 'Arrange?', body_kind: 'arrange', body: { why: ['Newer.'], usecase: 'diary' } } as never, agent));
  const second = value<{ id: string }>(await api.propose({ question: 'Update?', body_kind: 'pack', body: { install: 'diary' } } as never, agent));
  value(await api.decide(accept(first.id), owner));
  value(await api.decide(accept(second.id), owner));
  assert.deepEqual(carried, ['1.0.0', '1.2.0']);
  sql.close();
});

test('A PROPOSAL NAMING A USE CASE ALSO UPDATES AN OLDER MODULE UNDER IT, as installing a shared file does', async () => {
  let work = '1.0.0';
  const catalogue: CatalogueEntry[] = [{ ...CATALOGUE[0]!, doc: () => ({ ...WORK, version: work }) }, CATALOGUE[1]!];
  const { api, sql } = await record(catalogue);
  value(await api.decide(accept(value<{ id: string }>(await api.propose({ question: 'Study?', body_kind: 'pack', body: { install: 'study' } } as never, agent)).id), owner));
  assert.equal(refusal(await api.propose({ question: 'Again?', body_kind: 'pack', body: { install: 'study' } } as never, agent)).code, 'TRANSITION_ILLEGAL');

  work = '1.1.0';
  const filed = value<{ id: string }>(await api.propose({ question: 'Update Study?', body_kind: 'pack', body: { install: 'study' } } as never, agent));
  const row = value<{ body: { packs: { install: string[] }; plan: { pack: string; from?: string; version: string }[] } }>(await api.governance({ id: filed.id }, owner));
  assert.deepEqual(row.body.packs.install, ['work']);
  assert.deepEqual(row.body.plan.map((p) => [p.pack, p.from, p.version]), [['work', '1.0.0', '1.1.0']]);
  const done = value<{ applied: { installed: string[] } }>(await api.decide(accept(filed.id), owner));
  assert.deepEqual(done.applied.installed, ['work']);
  const packs = value<{ packs: { id: string; version?: string }[] }>(await api.arrangement({}, agent)).packs;
  assert.equal(packs.find((p) => p.id === 'work')?.version, '1.1.0');
  assert.equal(packs.find((p) => p.id === 'usecase-study')?.version, STUDY.version);
  sql.close();
});

test('A CATALOGUE THAT SAYS ITS VERSIONS LISTS THE UPDATES ON OFFER in the arrangement', async () => {
  const { api, sql } = await record([...CATALOGUE.map((e) => (e.id === 'work' ? { ...e, version: '1.0.0' } : e))]);
  value(await api.decide(accept(value<{ id: string }>(await api.propose({ question: 'Work?', body_kind: 'pack', body: { install: 'work' } } as never, agent)).id), owner));
  assert.equal(value<{ updates?: unknown }>(await api.arrangement({}, agent)).updates, undefined);
  sql.close();
  const later = await record([{ ...CATALOGUE[0]!, version: '1.1.0', doc: () => ({ ...WORK, version: '1.1.0' }) }]);
  /* Work 1.0.0 is installed by the owner, since a proposal installs what the catalogue offers. */
  const planned = value<{ diff: { planHash: string; approve: string[] } }>(await later.api.planPack({ doc: WORK, source: { kind: 'local' } } as never, owner));
  value(await later.api.installPack({ doc: WORK, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  assert.deepEqual(value<{ updates?: unknown }>(await later.api.arrangement({}, agent)).updates, [{ id: 'work', from: '1.0.0', to: '1.1.0' }]);
  later.sql.close();
});

test('A PROPOSAL IS FILED WITH THE NAMES THE RAIL WILL USE: a list by its label, the use case’s Home by its voice', async () => {
  const u = normaliseUseCase({
    usecase: 'desk',
    version: '1.0.0',
    title: 'Desk',
    summary: 'Tasks, called what a desk calls them.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: ['desk'],
    modules: ['work'],
    voice: { home: 'At my desk' },
    labels: { tasks: 'To do' },
    pack: {
      pack: 'usecase-desk',
      version: '1.0.0',
      summary: 'A desk.',
      author: 'BrainDog',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      declarations: [
        { register: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
        { page: 'home-desk', title: 'Home', requires: ['register.notes'], blocks: [{ kind: 'table', source: 'register.notes', span: 12, empty: 'Nothing yet.' }] },
      ],
    },
  });
  assert.ok(u.ok);
  const DESK = useCasePack(u.value)!;
  /* The host offers Work at whichever version this test says, as a catalogue does after an upgrade. */
  let work: Record<string, unknown> = WORK;
  const { api, sql } = await record([{ ...CATALOGUE[0]!, doc: () => work }, CATALOGUE[1]!, { id: 'usecase-desk', kind: 'usecase', title: 'Desk', summary: 'A desk.', modules: ['work'], doc: () => DESK }]);
  const filed = value<{ id: string }>(await api.propose({ question: 'A desk?', body_kind: 'pack', body: { install: 'desk', names: { 'register.tasks': 'Stolen' } } } as never, agent));
  const row = value<{ body: { names: Record<string, string> } }>(await api.governance({ id: filed.id }, owner));
  assert.equal(row.body.names['register.tasks'], 'To do', 'the list read by the build’s word, or the proposer’s');
  assert.equal(row.body.names['register.notes'], 'Notes');
  assert.equal(row.body.names['page.home-desk'], 'At my desk');
  assert.equal(row.body.names['page.work'], 'Work');

  /* ONCE IT IS IN AND THE VOICE STAYS, A LIST ALREADY HERE IS LEFT TO THE RAIL'S NAME WHEN DECIDE IS OPENED, which a later switch may change. */
  value(await api.decide(accept(filed.id), owner));
  work = { ...WORK, version: '1.0.1', declarations: [{ ...WORK.declarations[0], name: 'Jobs' }, WORK.declarations[1]] };
  const update = value<{ id: string }>(await api.propose({ question: 'Newer Work?', body_kind: 'pack', body: { install: 'work' } } as never, agent));
  const later = value<{ body: { names?: Record<string, string>; plan: unknown[] } }>(await api.governance({ id: update.id }, owner));
  assert.equal(later.body.names?.['register.tasks'], undefined, JSON.stringify(later.body));
  sql.close();
});

test('A SHARED USE-CASE FILE IS PROPOSED AS A QUESTION: read through readShared, planned with its modules, installed only by the owner', async () => {
  const { exportUseCase } = await import('@braindog/declare');
  const built = exportUseCase({
    usecase: 'club',
    version: '1.0.0',
    title: 'Reading club',
    summary: 'Books and meetings.',
    author: 'Halden',
    license: 'MIT',
    audience: 'other',
    tone: 'plain',
    modules: ['work'],
    voice: { home: 'Club night' },
    labels: {},
    declarations: [{ register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
    examples: [],
  });
  assert.ok(built.ok);
  const { api, sql } = await record();
  const filed = value<{ id: string }>(await api.propose({ question: 'Install Reading club?', body_kind: 'pack', body: { file: JSON.stringify(built.value) } } as never, agent));
  const row = value<{ body: Record<string, unknown> & { packs: { install: string[] }; names: Record<string, string> } }>(await api.governance({ id: filed.id }, owner));
  assert.equal(row.body.install, 'usecase-club');
  assert.equal(row.body.title, 'Reading club');
  assert.deepEqual(row.body.packs.install, ['work', 'usecase-club'], 'the module it names goes in first');
  assert.equal(row.body.names['register.library'], 'Books');
  assert.equal(row.body.file, undefined, 'the file was filed as sent, beside what the record read from it');
  assert.equal(api.kernel.packStates().length, 0, 'a proposal installed something');
  assert.ok(refusal(await api.decide(accept(filed.id), agent)));
  value(await api.decide(accept(filed.id), owner));
  assert.deepEqual(api.kernel.packStates().map((p) => p.id), ['usecase-club', 'work']);

  /* A FILE THE APP WOULD REFUSE IS REFUSED HERE TOO, at the file. */
  const leaky = { ...(built.value as Record<string, unknown>), summary: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc' };
  const no = refusal(await api.propose({ question: 'Leaky?', body_kind: 'pack', body: { file: leaky } } as never, agent));
  assert.equal(no.code, 'SECRET_IN_PACK');
  assert.match(String(no.at), /^body\.file/u);
  assert.equal(refusal(await api.propose({ question: 'Nothing?', body_kind: 'pack', body: { file: 42 } } as never, agent)).code, 'VALUE_MALFORMED');
  sql.close();
});

test('A PROPOSAL NEVER SENDS ITS OWN DOCUMENT FOR A PACK THE HOST OFFERS, so the owner is never shown the catalogue name over it', async () => {
  const { api, sql } = await record();
  /* A PROPOSER'S DOCUMENT WAS FILED UNDER THE CATALOGUE'S TITLE AND SUMMARY. A propose token sent its own usecase-study, with
     a page of its choosing and a later version, and Decide read "Study" and "Courses and what is due." over it. */
  const evil = {
    ...STUDY,
    version: '9.0.0',
    declarations: [
      ...(STUDY.declarations as Record<string, unknown>[]),
      { page: 'elsewhere', title: 'Elsewhere', nav: { section: 'Studies', order: 20 }, blocks: [{ kind: 'text', span: 12, text: 'Not what the catalogue offers.' }] },
    ],
  };
  for (const asked of ['study', 'usecase-study']) {
    const no = refusal(await api.propose({ question: 'Set this BrainDog up for studying?', body_kind: 'pack', body: { install: asked, doc: evil } } as never, agent));
    assert.equal(no.code, 'VALUE_MALFORMED');
    assert.equal(no.at, 'body.doc');
  }
  assert.equal(refusal(await api.propose({ question: 'Work?', body_kind: 'pack', body: { install: 'work', doc: { ...WORK, version: '2.0.0' } } } as never, agent)).at, 'body.doc');
  assert.equal(value<unknown[]>(await api.governance({}, owner)).length, 0, 'a proposal was filed');
  /* The pack the catalogue offers is still asked for by name, and a document for a pack the catalogue lacks is still taken. */
  value(await api.propose({ question: 'Set this BrainDog up for studying?', body_kind: 'pack', body: { install: 'study' } } as never, agent));
  value(await api.propose({ question: 'Notes?', body_kind: 'pack', body: { install: 'notes', doc: { ...WORK, pack: 'notes', declarations: [{ ...WORK.declarations[0], register: 'notes', pack: 'notes' }] } } } as never, agent));
  sql.close();
});

test('TURNING A PACK BACK ON SHOWS WHAT IT WILL CALL OUT AGAIN, and is refused when that is not what was shown', async () => {
  const { api, sql } = await record([]);
  const POINTS = {
    pack: 'points',
    version: '1.0.0',
    summary: 'Points.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'datapoints', name: 'Datapoints', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'value', type: 'decimal' }, { id: 'at', type: 'instant' }] }],
  };
  const POLL = {
    pack: 'poll-northwind',
    version: '1.0.0',
    summary: 'Polls api.example.com.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      { ingest: 'poll_northwind', channel: 'poll', url: 'https://api.example.com/metrics', every: '1h', map: { name: { value: 'MRR' }, value: { path: 'mrr', type: 'decimal' }, at: { arrived: true } }, writes: { register: 'datapoints' } },
    ],
  };
  const put = async (doc: unknown) => {
    const planned = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc } as never, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    return planned.diff.approve;
  };
  await put(POINTS);
  const approved = await put(POLL);
  assert.equal(approved.length, 1);
  value(await api.disablePack({ id: 'poll-northwind' } as never, owner));
  assert.deepEqual(api.kernel.actionOrigins(), []);

  /* THE OWNER WAS ASKED "TURN IT BACK ON?" WITH NOTHING ABOUT THE CALL. Accepting armed the poll of api.example.com again, and
     the proposal said nothing of it, where installing the same pack names the call before anything is armed. */
  for (const body of [{ enable: 'poll-northwind' }]) {
    const filed = value<{ id: string }>(await api.propose({ question: 'Turn the poll back on?', body_kind: 'pack', body } as never, agent));
    const row = value<{ body: { approve?: string[] } }>(await api.governance({ id: filed.id }, owner));
    assert.deepEqual(row.body.approve, approved);
    value(await api.decide({ id: filed.id, decide: { option: 'reject', reason: 'not now' } }, owner));
  }
  const arranged = value<{ id: string }>(await api.propose({ question: 'Turn it on?', body_kind: 'arrange', body: { why: ['The numbers stopped.'], packs: { enable: ['poll-northwind'] } } } as never, agent));
  assert.deepEqual(value<{ body: { approve?: string[] } }>(await api.governance({ id: arranged.id }, owner)).body.approve, approved);

  /* WHAT WAS SHOWN IS WHAT IS ARMED: a proposal filed without the line is refused, not accepted. */
  sql.exec("UPDATE suggestion SET body = json_remove(body, '$.approve') WHERE id = ?", arranged.id);
  const stale = refusal(await api.decide(accept(arranged.id), owner));
  assert.equal(stale.code, 'PLAN_STALE');
  assert.deepEqual(api.kernel.actionOrigins(), []);
  sql.close();
});

test('AN INSTALL THAT CALLS OUT FILES WHAT IT ARMS, so Decide says where it calls and how often, and one that calls nothing files none', async () => {
  const { api, sql } = await record([]);
  const base = { version: '1.0.0', author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } };
  const POINTS = { ...base, pack: 'points', summary: 'Points.', declarations: [{ register: 'datapoints', name: 'Datapoints', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'value', type: 'decimal' }, { id: 'at', type: 'instant' }] }] };
  const POLL = {
    ...base,
    pack: 'poll-northwind',
    summary: 'Polls api.example.com.',
    declarations: [
      { ingest: 'poll_northwind', channel: 'poll', url: 'https://api.example.com/metrics', every: '1h', map: { name: { value: 'MRR' }, value: { path: 'mrr', type: 'decimal' }, at: { arrived: true } }, writes: { register: 'datapoints' } },
    ],
  };
  type Filed = { body: { install?: string; calls_out?: Record<string, unknown>[] } };
  const quiet = value<{ id: string }>(await api.propose({ question: 'Add Points?', body_kind: 'pack', body: { install: 'points', doc: POINTS } } as never, agent));
  const none = value<Filed>(await api.governance({ id: quiet.id }, owner));
  assert.equal(none.body.install, 'points');
  assert.equal('calls_out' in none.body, false, 'an install that calls nothing filed calls');
  assert.equal(doesOf('install', none.body), '');
  value(await api.decide(accept(quiet.id), owner));

  const filed = value<{ id: string }>(await api.propose({ question: 'Add the poll?', body_kind: 'pack', body: { install: 'poll-northwind', doc: POLL } } as never, agent));
  const row = value<Filed>(await api.governance({ id: filed.id }, owner));
  assert.deepEqual(row.body.calls_out, [{ host: 'api.example.com', every: '1h', trigger: 'schedule', per_day: null, grant: null, change: 'new' }]);
  assert.equal(doesOf('install', row.body), 'Calls api.example.com every hour.');
  /* AND THE BODY AS FILED IS STILL THE ONE THE PRESS INSTALLS. */
  value(await api.decide(accept(filed.id), owner));
  assert.deepEqual(api.kernel.actionOrigins(), ['https://api.example.com']);
  sql.close();
});

test('AN ENTRY FOR A LIST THE SAME ARRANGEMENT INSTALLS IS TAKEN, read against the record as its add-ons leave it', async () => {
  const { api, sql } = await record();
  /* Nothing is installed: Courses and Tasks arrive with this arrangement, and the entries are for them. */
  const body = {
    why: ['They named a course and what is due for it.'],
    usecase: 'study',
    rows: [
      { register: 'courses', fields: { name: 'Anatomy' } },
      { register: 'tasks', fields: { what: 'Read chapter 4', state: 'open' } },
    ],
  };
  const arranged = value<{ id: string }>(await api.propose({ question: 'Set this up for studies?', body_kind: 'arrange', body } as never, agent));
  const filed = value<{ body: { rows: { register: string }[]; parts: { id: string; requires?: string[] }[] } }>(await api.governance({ id: arranged.id }, owner));
  assert.deepEqual(filed.body.rows.map((r) => r.register), ['courses', 'tasks']);
  assert.ok(filed.body.parts.some((p) => p.id === 'rows:courses'));

  /* A field the list will not have is refused against the list as planned, by its own fields. */
  const wrong = refusal(
    await api.propose({ question: 'Set this up?', body_kind: 'arrange', body: { ...body, rows: [{ register: 'courses', fields: { teacher: 'Dr Said' } }] } } as never, agent),
  );
  assert.equal(wrong.code, 'FIELD_UNKNOWN');
  assert.deepEqual(wrong.allowed, ['name']);
  /* And a list neither the record nor the arrangement holds is still unknown. */
  const none = refusal(await api.propose({ question: 'Set this up?', body_kind: 'arrange', body: { ...body, rows: [{ register: 'invoices', fields: { name: 'x' } }] } } as never, agent));
  assert.equal(none.code, 'REGISTER_UNKNOWN');

  const done = value<{ applied: { installed: string[]; rows: string[] } }>(await api.decide(accept(arranged.id), owner));
  assert.deepEqual(done.applied.installed, ['work', 'usecase-study']);
  assert.deepEqual(done.applied.rows, ['courses#1', 'tasks#1']);
  sql.close();
});

test("ON HIS WORD AN AGENT ACCEPTS AN ADD-ON (the owner's decision of 27 October), which a token alone never installs", async () => {
  const { api, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_owner', 'owner@vance-studio.example', 'Teodor')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  /* THE KEY THAT ASKS IS HIS, so what it asked is his to answer on his word (RK1). */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_1', 'p_owner', 'h1', 'propose', 'Claude', '2026-10-01T00:00:00.000Z')");
  /* ANOTHER OF HIS KEYS: the key that asked is never the one that answers (`wordAnswer`, audit 10k AK2). */
  const writer: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_owner', level: 'owner' }, session: { client_id: 'c1', agent: 'claude' } };
  const asked = value<{ id: string }>(await api.propose({ question: 'Add Work?', body_kind: 'pack', body: { install: 'work' } } as never, agent));
  refusal(await api.decide(accept(asked.id), writer));
  value(await api.instructionsMine({ answer: asked.id, option: 'accept', said: 'Yes, add Work.' } as never, writer));
  assert.equal(api.kernel.governanceRow('suggestion', asked.id)?.status, 'resolved');
  assert.ok(value<{ packs: { id: string }[] }>(await api.arrangement({}, agent)).packs.some((p) => p.id === 'work'));
  sql.close();
});
