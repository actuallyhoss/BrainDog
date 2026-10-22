/**
 * Sharing a use case, as `/packs`, `/packs/browse` and `/packs/share` draw it (`sharing.ts`): the plan read in the
 * screen's words, the install going pack by pack through `planPack` and `installPack`, and what stops it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../../lib/record/fixtures/fill.ts';
import { copy } from '../../lib/copy.ts';
import type { PackState } from '../../lib/record/packs.ts';
import { words } from './words.ts';
import { afterInstall, drawnOrder, installShared, moduleTitle, movesOf, nothingElse, oneOf, relabelled, keepVoice, offerFor, olderThan, offeredVersion, planShared, readOnHost, rowTitle, sharedPlanOf, speakingStates, switchTo, voiceQuestion, type SharingClient } from './sharing.ts';
import { speaking } from '../../lib/voice.ts';

const COURSES_DOC = {
  pack: 'usecase-study',
  version: '1.0.1',
  declarations: [
    { register: 'courses', name: 'Modules' },
    { page: 'studies', title: 'Studies' },
  ],
};

const ANSWER = {
  usecase: { usecase: 'study', title: 'Study', version: '1.0.1', summary: 'Courses.', author: 'Halden' },
  enable: ['people'],
  packs: [
    {
      id: 'usecase-study',
      role: 'usecase',
      version: '1.0.1',
      installed_version: '1.0.0',
      direction: 'upgrade',
      adds: ['register.courses', 'page.studies'],
      changes: [],
      retires: [],
      conflicts: [],
      examples: 1,
      calls_out: [],
      approve: [],
      doc: COURSES_DOC,
    },
  ],
  approve: [],
};

type Call = [string, Record<string, unknown>];
const ok = (value: unknown) => ({ ok: true as const, value });

function stub(over: Partial<SharingClient> = {}): { client: SharingClient; calls: Call[] } {
  const calls: Call[] = [];
  const log = (name: string) => async (args: Record<string, unknown>) => {
    calls.push([name, args]);
    return ok(name === 'planPack' ? { diff: { planHash: '7.abc', approve: [] } } : name === 'planUseCase' ? ANSWER : {});
  };
  const client = {
    planUseCase: log('planUseCase'),
    exportUseCase: log('exportUseCase'),
    planPack: log('planPack'),
    installPack: log('installPack'),
    enablePack: log('enablePack'),
    disablePack: log('disablePack'),
    fetchShared: log('fetchShared'),
    packConfig: log('packConfig'),
    setPackConfig: log('setPackConfig'),
    ...over,
  } as SharingClient;
  return { client, calls };
}

test('THE PLAN READS IN NAMES FROM THE DOCUMENT IT INSTALLS, and an update says where it comes from', () => {
  const plan = sharedPlanOf(ANSWER);
  assert.ok(plan);
  assert.deepEqual(plan.packs[0]?.adds, [
    { kind: 'list', name: 'Modules' },
    { kind: 'page', name: 'Studies' },
  ]);
  assert.equal(plan.packs[0]?.installedVersion, '1.0.0');
  assert.deepEqual(plan.enable, ['people']);
  assert.equal(sharedPlanOf({ packs: 'no' }), null);
});

test('INSTALL TURNS MODULES ON, THEN PLANS AND INSTALLS EACH PACK WITH ITS OWN HASH', async () => {
  const { client, calls } = stub();
  const out = await installShared(client, sharedPlanOf(ANSWER)!);
  assert.equal(out.ok, true);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['enablePack', 'planPack', 'installPack'],
  );
  assert.equal(calls[2]?.[1].planHash, '7.abc');
  assert.deepEqual(out.done, ['people', 'usecase-study']);
});

test('A PACK THAT NOW CALLS OUT A LINE THE PLAN DID NOT SHOW IS NOT INSTALLED', async () => {
  const { client, calls } = stub({ planPack: async () => ok({ diff: { planHash: '8.def', approve: ['CALLS OUT api.example.com'] } }) });
  const out = await installShared(client, sharedPlanOf(ANSWER)!);
  assert.equal(out.ok, false);
  assert.equal(out.stale, true);
  assert.equal(out.fix, copy.shareStale);
  assert.ok(!calls.some((c) => c[0] === 'installPack'));
});

test("A REFUSED INSTALL SAYS THE RECORD'S SENTENCE AND WHAT ALREADY WENT IN", async () => {
  const { client } = stub({ installPack: async () => ({ ok: false as const, refusal: { code: 'PROVIDES_CONFLICT', fix: 'courses is held by school.' } }) });
  const out = await installShared(client, sharedPlanOf(ANSWER)!);
  assert.deepEqual([out.ok, out.fix, out.done], [false, 'courses is held by school.', ['people']]);
});

const state = (id: string, off = false): PackState => ({ id, version: '1.0.0', disabled_at: off ? '2026-09-17' : null, registers: [] });

test('A CARD OFFERS INSTALL, SWITCH, OR SAYS IT IS IN USE', () => {
  const states = [state('usecase-student'), state('usecase-team', true)];
  assert.equal(offerFor('student', states, true), 'in-use');
  assert.equal(offerFor('team', states, true), 'switch');
  assert.equal(offerFor('guide', states, true), 'install');
  assert.equal(offerFor('business', states, false), 'switch');
  assert.equal(offerFor('business', [], false), 'in-use');
  /* A USE CASE OF MODULES ALONE IS INSTALLED UNTIL EVERY MODULE IS HERE AND ON. */
  assert.equal(offerFor('business', [state('portfolio')], false, ['portfolio', 'people']), 'install');
  assert.equal(offerFor('business', [state('portfolio'), state('people', true)], false, ['portfolio', 'people']), 'install');
  assert.equal(offerFor('business', [state('portfolio'), state('people')], false, ['portfolio', 'people']), 'in-use');
});

test('SWITCHING TURNS THE CHOSEN ONE ON AND THE ONE SPEAKING OFF, when the pack has no speaks setting', async () => {
  const { client, calls } = stub({ setPackConfig: async () => ({ ok: false as const, refusal: { code: 'FIELD_UNKNOWN', fix: 'no' } }) });
  assert.deepEqual(await switchTo(client, 'team', [state('usecase-student'), state('usecase-team', true)], true), { ok: true });
  assert.deepEqual(calls, [
    ['enablePack', { id: 'usecase-team' }],
    ['disablePack', { id: 'usecase-student' }],
  ]);
});

test('A FILE IS READ HERE FIRST: a credential in it is refused before the record is asked', async () => {
  const { client, calls } = stub();
  const text = JSON.stringify({ usecase: 'x', version: '1.0.0', summary: ['sk', 'live', 'Q'.repeat(24)].join('_') });
  const out = await planShared(client, { text, source: 'local' }, [], async () => null);
  assert.equal(out.ok, false);
  assert.equal(calls.length, 0);
});

test('A MODULE THE RECORD LACKS IS SENT AS THE APP BUILDS IT, EVERY SIBLING IN THE SAME BATCH ALREADY HELD FOR IT', async () => {
  const { client, calls } = stub();
  const text = JSON.stringify({
    usecase: 'study', version: '1.0.1', title: 'Study', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: ['portfolio', 'people', 'work'],
  });
  const seen: Record<string, readonly string[]> = {};
  const out = await planShared(client, { text, source: 'local' }, [state('work')], async (id, installed) => {
    seen[id] = installed.map((p) => p.id);
    return { pack: id };
  });
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0]?.[1].modules, { portfolio: { pack: 'portfolio' }, people: { pack: 'people' } });
  /* PEOPLE'S DOCUMENT IS BUILT AS THOUGH PORTFOLIO WERE ALREADY HERE, neither installed yet, so "Met in" is not stripped
     for going in beside it in the same batch (`sharing.ts` `withBatch`): a founder's People and Portfolio install
     together, and People's link to Portfolio's list must not be judged as though Portfolio were still absent. */
  assert.ok(seen.people?.includes('portfolio'), 'a sibling new in this same batch is held while the others are built');
});

test('THE SHARE FORM OFFERS A PATCH OR A MINOR ON FROM THE LATER OF INSTALLED AND LAST SHARED, AND NAMES A ROW BY ITS TITLE', () => {
  assert.equal(offeredVersion('1.0.0', null), '1.0.1');
  assert.equal(offeredVersion(null, null), '1.0.0');
  assert.equal(offeredVersion('1.1.1', '1.1.2'), '1.1.3', 'a second share does not offer the same number again');
  assert.equal(offeredVersion('1.1.1', '1.1.2', 'minor'), '1.2.0');
  assert.equal(offeredVersion('2.0.0', '1.9.9'), '2.0.1');
  assert.deepEqual(drawnOrder([{ href: '/p/studies' }], [{ id: 'courses' }, { id: 'assignments' }]), ['/p/studies', '/r/courses', '/r/assignments']);
  assert.equal(rowTitle({ state: 'to_do', what: 'Essay' }), 'Essay');
});

test('ON A LIVE RECORD AN ADDRESS IS READ BY THE HOST, AND ITS REFUSAL COMES BACK WITH ITS CODE', async () => {
  const { client, calls } = stub({
    fetchShared: async ({ url }) =>
      url.includes('10.0.0.1')
        ? { ok: false as const, refusal: { code: 'PULL_ORIGIN_REFUSED', fix: '10.0.0.1 is a private or local address, so nothing was read from it.' } }
        : ok({ url, text: '{"usecase":"x"}', bytes: 15 }),
  });
  assert.deepEqual(await readOnHost(client, 'https://files.example.org/study.usecase.json'), { ok: true, text: '{"usecase":"x"}' });
  assert.deepEqual(await readOnHost(client, 'https://10.0.0.1/a.json'), { ok: false, fix: '10.0.0.1 is a private or local address, so nothing was read from it.', code: 'PULL_ORIGIN_REFUSED' });
  assert.deepEqual(await readOnHost(client, 'http://files.example.org/a.json'), { ok: false, fix: copy.shareAddressHttps, code: null });
  /* A `git:` ADDRESS GOES TO THE HOST AS IT WAS TYPED, which turns it into the raw file; one that is not the shape is said here. */
  assert.deepEqual(await readOnHost(client, 'git:someone/kit@main:kit.usecase.json'), { ok: true, text: '{"usecase":"x"}' });
  assert.deepEqual(await readOnHost(client, 'git:someone'), { ok: false, fix: words.gitNotOne, code: null });
  assert.equal(calls.length, 0, 'the stub logged a call it was not given');
});

test('A FILE WITH A BLOCK THIS BUILD DOES NOT DRAW IS SAID PLAINLY, WITH ITS CODE KEPT', async () => {
  const { client, calls } = stub();
  const text = JSON.stringify({
    usecase: 'evil', version: '1.0.0', title: 'Evil', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: [],
    pack: { pack: 'usecase-evil', requires: { format: 1, primitives: 1, packs: {} }, declarations: [{ page: 'evil', title: 'Evil', blocks: [{ kind: 'iframe', span: 12 }] }] },
  });
  const out = await planShared(client, { text, source: 'url' }, [], async () => null);
  assert.equal(out.ok, false);
  assert.equal((out as { code: string }).code, 'KIND_UNKNOWN');
  assert.match((out as { fix: string }).fix, /^This setup uses a block this version of BrainDog does not have: iframe\./u);
  assert.equal(calls.length, 0);
});

test('AFTER AN INSTALL THE EXAMPLES ARE LINKED AND THE FILE ORDER LEADS THE READER ARRANGEMENT', async () => {
  /* THE GUIDE'S PLAN, HANDED IN AS THE FILE CARRIES IT (`UseCase.links`): since the guide lost its example rows its own
     table names none (`links.ts`), and a shared file's links are what the install links. */
  const rows: Record<string, { seq: number; fields: Record<string, unknown> }[]> = {
    steps: [{ seq: 1, fields: { what: 'Write one sentence about what this is and who it is for', tags: ['example'] } }],
    milestones: [{ seq: 4, fields: { what: 'Say what it is and who it is for', tags: ['example'] } }],
  };
  const updates: unknown[] = [];
  const client = {
    list: async ({ register }: { register: string }) => ok({ rows: rows[register] ?? [] }),
    update: async (args: { register: string; seq: number; patch: Record<string, unknown> }) => (updates.push(args), ok({})),
  };
  const links = [{ register: 'steps', title: 'Write one sentence about what this is and who it is for', field: 'milestone', to: 'milestones', target: 'Say what it is and who it is for' }];
  const plan = { ...sharedPlanOf(ANSWER, [], links)!, usecase: { ...sharedPlanOf(ANSWER)!.usecase, id: 'guide' }, nav: ['/r/milestones', '/r/steps'] };
  const out = await afterInstall(client, plan, ['/p/money', '/r/steps']);
  assert.deepEqual(out.nav, ['/r/milestones', '/r/steps', '/p/money']);
  assert.ok(out.links >= 1, 'no example was linked');
  assert.deepEqual(updates[0], { register: 'steps', seq: 1, patch: { milestone: 'milestones#4' } });
  assert.equal((await afterInstall(client, { ...plan, nav: [] }, [])).nav, null);
});

test('SWITCHING TO A USE CASE THAT CAN SPEAK SETS IT TO, and keeps the others on beside it', async () => {
  const { client, calls } = stub();
  assert.deepEqual(await switchTo(client, 'team', [state('usecase-student'), state('usecase-team')], true), { ok: true });
  /* ONE CHANGE: both settings carry the same batch, so the feed reads them together. */
  const batch = (calls[1]?.[1] as { batch?: string }).batch;
  assert.match(String(batch), /^[0-9A-HJKMNP-TV-Z]{26}$/u);
  assert.deepEqual(calls, [
    ['enablePack', { id: 'usecase-team' }],
    ['setPackConfig', { id: 'usecase-team', values: { speaks: true }, batch }],
    ['setPackConfig', { id: 'usecase-student', values: { speaks: false }, batch }],
  ]);
});

test('A SECOND USE CASE ASKS WHOSE VOICE IS KEPT, and the answer is kept whichever id sorts first', async () => {
  const student = [state('usecase-student')];
  assert.equal(voiceQuestion([], 'personal'), null, 'nothing speaks yet, so nothing to ask');
  assert.equal(voiceQuestion(student, 'student'), null, 'the one speaking is the one installed');
  assert.deepEqual(voiceQuestion(student, 'personal'), { now: 'student', rule: 'speaks' });
  assert.deepEqual(voiceQuestion(student, 'team'), { now: 'student', rule: 'beside' });

  /* THE ANSWER IS WRITTEN DOWN WHOLE: the one speaking set to, every other one on set not to, whichever id sorts first. */
  const written = async (states: Parameters<typeof keepVoice>[1], adding: string, choice: 'speaks' | 'beside') => {
    const s = stub();
    await keepVoice(s.client, states, adding, choice);
    return s.calls.map(([, a]) => [a.id, (a.values as Record<string, unknown>).speaks]);
  };
  assert.deepEqual(await written(student, 'personal', 'beside'), [['usecase-student', true], ['usecase-personal', false]]);
  assert.deepEqual(await written(student, 'personal', 'speaks'), [['usecase-student', false], ['usecase-personal', true]]);
  assert.deepEqual(await written(student, 'team', 'beside'), [['usecase-student', true], ['usecase-team', false]]);
  assert.deepEqual(await written(student, 'team', 'speaks'), [['usecase-student', false], ['usecase-team', true]]);
  /* ONE ALREADY CHOSEN TO SPEAK IS SET NOT TO when another takes the voice over. */
  const chosen = [{ ...state('usecase-student'), speaks: true }];
  assert.deepEqual(voiceQuestion(chosen, 'personal'), { now: 'student', rule: 'beside' });
  assert.deepEqual(await written(chosen, 'personal', 'speaks'), [['usecase-student', false], ['usecase-personal', true]]);
  assert.deepEqual(await written(chosen, 'personal', 'beside'), [['usecase-personal', false]], 'only what differs is written');

  /* READ BACK, THE RULE SPEAKS AS CHOSEN, and a card offers Switch to the one put beside. */
  const held: Record<string, boolean> = { 'usecase-personal': false, 'usecase-student': true };
  const reading = stub({ packConfig: async ({ id }) => ok({ values: { speaks: held[id] } }) });
  const both = await speakingStates(reading.client, [state('usecase-personal'), state('usecase-student')]);
  assert.equal(offerFor('student', both, true), 'in-use');
  assert.equal(offerFor('personal', both, true), 'switch');
  assert.equal(offerFor('personal', [state('usecase-personal'), state('usecase-student')], true), 'in-use', 'unread, the rule by id');
});

test('A USE CASE HELD AT AN EARLIER VERSION IS OFFERED AS AN UPDATE, not said to be in use', () => {
  const held = [{ ...state('usecase-personal'), version: '1.0.0' }];
  assert.equal(offerFor('personal', held, true, [], '1.2.0'), 'update');
  assert.equal(offerFor('personal', held, true, [], '1.0.0'), 'in-use');
  assert.equal(offerFor('personal', [{ ...state('usecase-personal'), version: '1.3.0' }], true, [], '1.2.0'), 'in-use', 'a later copy is not taken back');
  assert.equal(offerFor('personal', held, true), 'in-use', 'no version offered, nothing to compare');
  assert.equal(olderThan('1.9.0', '1.10.0'), true);
  assert.equal(olderThan('2.0.0', '1.10.0'), false);
});

test('AFTER AN UPDATE THE TAB ONLY LINKS: what an older version kept typed is carried by the record', async () => {
  const rows: Record<string, { seq: number; fields: Record<string, unknown> }[]> = { goals: [{ seq: 2, fields: { what: 'Swim 20 lengths', done: 12 } }] };
  const writes: unknown[] = [];
  const client = {
    list: async ({ register }: { register: string }) => ok({ rows: rows[register] ?? [] }),
    update: async (args: { register: string; seq: number; patch: Record<string, unknown> }) => (writes.push(['update', args]), ok({})),
  };
  const base = sharedPlanOf(ANSWER)!;
  const personal = { ...base, usecase: { ...base.usecase, id: 'personal' }, packs: base.packs.map((p) => ({ ...p, installedVersion: '1.0.0' })) };
  const out = await afterInstall(client, personal, []);
  assert.equal(Object.hasOwn(out, 'carried'), false);
  assert.equal(writes.some((w) => JSON.stringify(w).includes('"done":null')), false, 'the tab emptied a typed number itself');
});

test('AN UPDATE THAT BRINGS ONLY ITS VERSION SAYS NOTHING ELSE CHANGES, and one that adds a list or installs does not', () => {
  const bare = { ...ANSWER, enable: [], packs: [{ ...ANSWER.packs[0]!, adds: [], examples: 0 }] };
  assert.equal(nothingElse(sharedPlanOf(bare)!), true);
  assert.equal(nothingElse(sharedPlanOf(ANSWER)!), false, 'it adds a list and a page and turns People on');
  assert.equal(nothingElse(sharedPlanOf({ ...bare, packs: [{ ...bare.packs[0]!, installed_version: null, direction: 'install' }] })!), false);
  assert.equal(nothingElse(sharedPlanOf({ ...bare, packs: [{ ...bare.packs[0]!, direction: 'reinstall' }] })!), false, 'the same version says so in its own words');
  assert.equal(nothingElse(sharedPlanOf({ ...bare, packs: [{ ...bare.packs[0]!, changes: ['register.courses'] }] })!), false);
});

/* THE RECORD TAKES A HANDED LIST OUT OF `retires` AND FILES IT UNDER `hands` (`@braindog/record` `usecase.ts`), and this
   screen read `retires` alone, so a list an update passed to another pack was on no line at all: not taken away, and not
   said as moving either. Needs you says it in `arranged.ts`, and the shared plan says it in the same words. */
test('A LIST AN UPDATE HANDS TO ANOTHER PACK IS SAID AS MOVING THERE, on a line of its own and not among what it takes away', () => {
  const doc = { pack: 'usecase-study', version: '1.0.2', declarations: [{ page: 'studies', title: 'Studies' }] };
  const handing = {
    ...ANSWER,
    enable: [],
    packs: [{ ...ANSWER.packs[0]!, adds: [], examples: 0, retires: ['page.old'], hands: [{ id: 'register.reading', to: 'people' }], doc }],
  };
  const plan = sharedPlanOf(handing)!;
  assert.deepEqual(plan.packs[0]?.retires, ['old']);
  assert.deepEqual(plan.packs[0]?.hands, [{ name: 'Reading', to: 'People' }]);
  assert.deepEqual(movesOf(plan), [copy.arrangeMovesTo('Reading', 'People')]);
  /* AN UPDATE THAT ONLY HANDS SOMETHING ON STILL DOES SOMETHING, so it is not "Nothing else changes". */
  assert.equal(nothingElse(sharedPlanOf({ ...handing, packs: [{ ...handing.packs[0]!, retires: [] }] })!), false);
  assert.deepEqual(sharedPlanOf(ANSWER)!.packs[0]?.hands, [], 'a plan that hands nothing on has no line for it');
});

test("A MODULE ALREADY HERE IS OFFERED IN THE ADDED USE CASE'S WORDS, and left as it is when the person says no", async () => {
  const { client, calls } = stub();
  const text = JSON.stringify({ usecase: 'study', version: '1.0.1', title: 'Study', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: ['people', 'work'] });
  const off = { ...state('work'), disabled_at: '2026-09-01T00:00:00.000Z' };
  await planShared(client, { text, source: 'local' }, [state('people'), off], async (id) => ({ pack: id }), async (id) => ({ pack: id, worded: true }));
  assert.deepEqual(calls[0]?.[1].modules, { people: { pack: 'people', worded: true } }, 'a module that is off was offered new words, or one that is on was not');

  const base = sharedPlanOf(ANSWER)!;
  const plan = { ...base, enable: [], packs: [{ ...base.packs[0]!, id: 'money-core', role: 'module' as const, installedVersion: '1.0.0' }, base.packs[0]!] };
  assert.deepEqual(relabelled(plan).map((p) => p.id), ['money-core']);
  const no = stub();
  assert.deepEqual((await installShared(no.client, plan, false)).done, ['usecase-study']);
  const yes = stub();
  assert.deepEqual((await installShared(yes.client, plan)).done, ['money-core', 'usecase-study']);
  assert.equal(copy.shareRelabel(['money-core'], 'Personal'), "Update money-core to Personal's words and targets");
});

test('A FIGURE IN A PLAN IS SAID BY ITS NAME, and one the document does not name by its id', () => {
  const doc = { declarations: [{ metric: 'out-30d', name: 'Going out, 30 days' }] };
  const plan = sharedPlanOf({ ...ANSWER, packs: [{ ...ANSWER.packs[0], adds: ['metric.out-30d', 'metric.nameless'], changes: ['metric.out-30d'], doc }] })!;
  assert.deepEqual(plan.packs[0]?.adds.map((a) => a.name), ['Going out, 30 days', 'nameless']);
  assert.deepEqual(plan.packs[0]?.changes, ['Going out, 30 days']);
});

test('A PLAN NAMES A MODULE BY ITS TITLE AND A PAGE FOR EACH ROW BY ITS LIST, never money-core or {{name}}', () => {
  const doc = {
    declarations: [
      { register: 'organisations', name: 'Organisations', title: 'name', fields: [] },
      { page: 'organisation', title: '{{name}}', for: { register: 'organisations' }, blocks: [] },
      { page: 'home-founder', title: '{{config:voice_home}}', blocks: [] },
    ],
    config: { voice_home: { type: 'text', default: 'Today' } },
  };
  const plan = sharedPlanOf({
    ...ANSWER,
    packs: [
      { ...ANSWER.packs[0], id: 'money-core', role: 'module', installed_version: null, adds: [], doc: {} },
      { ...ANSWER.packs[0], adds: ['register.organisations', 'page.organisation', 'page.home-founder'], doc },
    ],
  })!;
  assert.equal(plan.packs[0]?.title, 'Money');
  assert.equal(plan.packs[1]?.title, plan.usecase.title);
  assert.deepEqual(plan.packs[1]?.adds.map((a) => a.name), ['Organisations', 'A page for each organisation', 'Today']);
  /* A LIST THE DOCUMENT DOES NOT DECLARE is named by the pack in the plan that does, or by this build. */
  const each = { declarations: [{ page: 'thing', title: '{{name}}', for: { register: 'things' }, blocks: [] }] };
  const across = sharedPlanOf({ ...ANSWER, packs: [{ ...ANSWER.packs[0], id: 'portfolio', role: 'module', installed_version: null, adds: [], doc: { declarations: [{ register: 'things', name: 'Ventures', title: 'name', fields: [] }] } }, { ...ANSWER.packs[0], adds: ['page.thing'], doc: each }] })!;
  assert.deepEqual(across.packs[1]?.adds.map((x) => x.name), ['A page for each venture']);
  const built = sharedPlanOf({ ...ANSWER, packs: [{ ...ANSWER.packs[0], adds: ['page.thing'], doc: each }] })!;
  assert.deepEqual(built.packs[0]?.adds.map((x) => x.name), ['A page for each project']);
  assert.equal(moduleTitle('no-such-module'), 'No such module');
  assert.deepEqual(['Studies', 'Organisations', 'Classes', 'Status', 'Steps'].map(oneOf), ['study', 'organisation', 'class', 'status', 'step']);
  assert.deepEqual(['People', 'Key people', 'Children'].map(oneOf), ['person', 'key person', 'child'], 'a plural with no s');
});

test('WITH THREE USE CASES ON, ADDING ONE BESIDE NEVER CHANGES WHO SPEAKS, and exactly one speaks after every door', async () => {
  const ids = ['usecase-art', 'usecase-guide', 'usecase-personal', 'usecase-student', 'usecase-team'];
  /* Every way the two already on can hold the setting, and every use case added beside or taking over. */
  const values = [undefined, null, true, false] as const;
  for (const a of values)
    for (const b of values) {
      const states = [
        { ...state('usecase-personal'), ...(a === undefined ? {} : { speaks: a }) },
        { ...state('usecase-student'), ...(b === undefined ? {} : { speaks: b }) },
      ];
      const before = speaking(states)!;
      for (const adding of ['art', 'team', 'guide']) {
        for (const choice of ['beside', 'speaks'] as const) {
          const s = stub();
          await keepVoice(s.client, states, adding, choice);
          const held = new Map<string, boolean | null | undefined>([...states.map((p) => [p.id, (p as { speaks?: boolean | null }).speaks] as const), [`usecase-${adding}`, null]]);
          for (const [, args] of s.calls) held.set(String(args.id), (args.values as Record<string, boolean>).speaks);
          const after = ids.filter((id) => held.has(id)).map((id) => ({ id, disabled_at: null, speaks: held.get(id) ?? null }));
          const now = speaking(after);
          assert.equal(now, choice === 'beside' ? before : `usecase-${adding}`, `${choice} ${adding} over ${JSON.stringify(states)}`);
          /* WRITTEN DOWN: exactly one set to speak, so a fourth arriving by any id cannot move it. */
          assert.deepEqual(after.filter((p) => p.speaks === true).map((p) => p.id), [now]);
          assert.equal(speaking([...after, { id: 'usecase-aaa', disabled_at: null }]), now, 'a later use case sorting first took the voice');
        }
      }
    }
});

test('A MONEY RULE WITH NO NAME IS SAID BY THE NAME THIS BUILD GIVES IT, and a module by its own', () => {
  const plan = sharedPlanOf({
    usecase: { usecase: 'personal', title: 'Personal', version: '1.0.0' },
    packs: [{ id: 'money-core', role: 'module', version: '1.0.0', doc: { declarations: [{ rule: 'invoice-late' }] }, adds: ['rule.invoice-late', 'rule.somebody-else'] }],
  });
  assert.equal(plan?.packs[0]?.title, 'Money');
  assert.deepEqual(plan?.packs[0]?.adds, [
    { kind: 'other', name: 'Chase late payments' },
    { kind: 'other', name: 'somebody-else' },
  ]);
  assert.equal(moduleTitle('usecase-team'), 'Team board');
});
