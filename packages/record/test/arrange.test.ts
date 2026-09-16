/**
 * Arranging a record by proposal (`loop/research-spark.md` S12): what a token reads, what it may ask for,
 * and what only the owner's press applies.
 *
 * THE DOOR IS WHAT IS HELD HERE. A token reads the arrangement and files questions; it never installs, turns
 * a pack or changes a setting. A member who may decide other questions may not accept one of these. And
 * what the owner is shown is the record's own reading, never the proposer's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

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
  assert.deepEqual(wrong.allowed, ['page', 'proposals']);
  assert.equal(refusal(await api.arrangement({ pages: 'x' } as never, agent)).code, 'FIELD_UNKNOWN');

  /* THE KINDS ARE THE ONES THE LINT REFUSES AGAINST, and the example is a page that installs over Work. */
  value(await api.kernel.install([{ id: 'register.tasks', kind: 'register', body: WORK.declarations[0] as never }]));
  const bad = refusal(await api.kernel.install([{ id: 'page.x', kind: 'page', body: { page: 'x', title: 'X', blocks: [{ kind: 'nope' }] } as never }]));
  assert.deepEqual([...page.block.kind].filter((k) => !k.startsWith('block.')).sort(), [...(bad.allowed ?? [])].sort());
  value(await api.kernel.install([page.example]));
  sql.close();
});

test('A TOKEN PROPOSES INSTALLING A USE CASE, IS SHOWN WHAT IT WOULD DO, AND ONLY THE OWNER INSTALLS IT', async () => {
  const { api, sql } = await record();
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
