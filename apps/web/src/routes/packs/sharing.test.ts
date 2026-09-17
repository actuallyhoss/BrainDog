/**
 * Sharing a use case, as `/packs`, `/packs/browse` and `/packs/share` draw it (`sharing.ts`): the plan read in the
 * screen's words, the install going pack by pack through `planPack` and `installPack`, and what stops it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../lib/copy.ts';
import type { PackState } from '../../lib/record/packs.ts';
import { afterInstall, drawnOrder, installShared, keepVoice, offerFor, olderThan, offeredVersion, planShared, readAddress, readOnHost, rowTitle, sharedPlanOf, speakingStates, switchTo, voiceQuestion, type SharingClient } from './sharing.ts';

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
    fetchUseCase: log('fetchUseCase'),
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

test('A MODULE THE RECORD LACKS IS SENT AS THE APP BUILDS IT', async () => {
  const { client, calls } = stub();
  const text = JSON.stringify({ usecase: 'study', version: '1.0.1', title: 'Study', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: ['people', 'work'] });
  const out = await planShared(client, { text, source: 'local' }, [state('work')], async (id) => ({ pack: id }));
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0]?.[1].modules, { people: { pack: 'people' } });
});

test('AN ADDRESS IS READ ONLY OVER HTTPS, WITH NOTHING SENT, AND NO FURTHER THAN THE SIZE', async () => {
  assert.deepEqual(await readAddress('http://example.com/a.json'), { ok: false, fix: copy.shareAddressHttps });
  assert.deepEqual(await readAddress('not an address'), { ok: false, fix: copy.shareAddressNotOne });
  let sent: RequestInit | undefined;
  const fetcher = (async (_url: URL, init?: RequestInit) => {
    sent = init;
    return new Response('{"usecase":"x"}');
  }) as typeof fetch;
  assert.deepEqual(await readAddress('https://example.com/a.json', fetcher), { ok: true, text: '{"usecase":"x"}' });
  assert.equal(sent?.credentials, 'omit');
  const big = (async () => new Response('x'.repeat(400 * 1024))) as typeof fetch;
  assert.equal((await readAddress('https://example.com/a.json', big)).ok, false);
  const blocked = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  assert.deepEqual(await readAddress('https://example.com/a.json', blocked), { ok: false, fix: copy.shareAddressUnread('example.com') });
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
    fetchUseCase: async ({ url }) =>
      url.includes('10.0.0.1')
        ? { ok: false as const, refusal: { code: 'PULL_ORIGIN_REFUSED', fix: '10.0.0.1 is a private or local address, so nothing was read from it.' } }
        : ok({ url, text: '{"usecase":"x"}', bytes: 15 }),
  });
  assert.deepEqual(await readOnHost(client, 'https://files.example.org/study.usecase.json'), { ok: true, text: '{"usecase":"x"}' });
  assert.deepEqual(await readOnHost(client, 'https://10.0.0.1/a.json'), { ok: false, fix: '10.0.0.1 is a private or local address, so nothing was read from it.', code: 'PULL_ORIGIN_REFUSED' });
  assert.deepEqual(await readOnHost(client, 'http://files.example.org/a.json'), { ok: false, fix: copy.shareAddressHttps, code: null });
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
  const rows: Record<string, { seq: number; fields: Record<string, unknown> }[]> = {
    assignments: [{ seq: 1, fields: { what: 'Problem set 1: probability', tags: ['example'] } }],
    courses: [{ seq: 4, fields: { name: 'Introduction to statistics', tags: ['example'] } }],
  };
  const updates: unknown[] = [];
  const client = {
    list: async ({ register }: { register: string }) => ok({ rows: rows[register] ?? [] }),
    update: async (args: { register: string; seq: number; patch: Record<string, unknown> }) => (updates.push(args), ok({})),
  };
  const plan = { ...sharedPlanOf(ANSWER)!, usecase: { ...sharedPlanOf(ANSWER)!.usecase, id: 'student' }, nav: ['/r/courses', '/r/assignments'] };
  const out = await afterInstall(client, plan, ['/p/money', '/r/assignments']);
  assert.deepEqual(out.nav, ['/r/courses', '/r/assignments', '/p/money']);
  assert.ok(out.links >= 1, 'no example was linked');
  assert.deepEqual(updates[0], { register: 'assignments', seq: 1, patch: { course: 'courses#4' } });
  assert.equal((await afterInstall(client, { ...plan, nav: [] }, [])).nav, null);
});

test('SWITCHING TO A USE CASE THAT CAN SPEAK SETS IT TO, and keeps the others on beside it', async () => {
  const { client, calls } = stub();
  assert.deepEqual(await switchTo(client, 'team', [state('usecase-student'), state('usecase-team')], true), { ok: true });
  assert.deepEqual(calls, [
    ['enablePack', { id: 'usecase-team' }],
    ['setPackConfig', { id: 'usecase-team', values: { speaks: true } }],
    ['setPackConfig', { id: 'usecase-team', values: { speaks: true } }],
    ['setPackConfig', { id: 'usecase-student', values: { speaks: false } }],
  ]);
});

test('A SECOND USE CASE ASKS WHOSE VOICE IS KEPT, and the answer is kept whichever id sorts first', async () => {
  const student = [state('usecase-student')];
  assert.equal(voiceQuestion([], 'personal'), null, 'nothing speaks yet, so nothing to ask');
  assert.equal(voiceQuestion(student, 'student'), null, 'the one speaking is the one installed');
  assert.deepEqual(voiceQuestion(student, 'personal'), { now: 'student', rule: 'speaks' });
  assert.deepEqual(voiceQuestion(student, 'team'), { now: 'student', rule: 'beside' });

  /* BESIDE, THOUGH PERSONAL SORTS FIRST: Student is set to speak and Personal set not to. */
  const beside = stub();
  await keepVoice(beside.client, student, 'personal', 'beside');
  assert.deepEqual(new Map(beside.calls.map(([, a]) => [a.id, (a.values as Record<string, unknown>).speaks])), new Map([['usecase-personal', false], ['usecase-student', true]]));
  /* TAKING IT OVER. */
  const take = stub();
  await keepVoice(take.client, student, 'personal', 'speaks');
  assert.deepEqual(new Map(take.calls.map(([, a]) => [a.id, (a.values as Record<string, unknown>).speaks])), new Map([['usecase-personal', true], ['usecase-student', false]]));

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

test('AN UPDATE FROM BEFORE THE LOG CARRIES A GOAL TYPED PROGRESS INTO ONE ROW, and an install carries nothing', async () => {
  const rows: Record<string, { seq: number; fields: Record<string, unknown> }[]> = { goals: [{ seq: 2, fields: { what: 'Swim 20 lengths', done: 12 } }] };
  const writes: unknown[] = [];
  const client = {
    list: async ({ register }: { register: string }) => ok({ rows: rows[register] ?? [] }),
    update: async (args: { register: string; seq: number; patch: Record<string, unknown> }) => (writes.push(['update', args]), ok({})),
    create: async (args: { register: string; fields: Record<string, unknown> }) => (writes.push(['create', args]), ok({})),
  };
  const base = sharedPlanOf(ANSWER)!;
  const personal = (installed: string | null) => ({ ...base, usecase: { ...base.usecase, id: 'personal' }, packs: base.packs.map((p) => ({ ...p, installedVersion: installed })) });
  assert.equal((await afterInstall(client, personal(null), [], '2026-09-17')).carried, 0);
  assert.equal((await afterInstall(client, personal('1.2.0'), [], '2026-09-17')).carried, 0);
  const out = await afterInstall(client, personal('1.0.0'), [], '2026-09-17');
  assert.equal(out.carried, 1);
  assert.deepEqual(writes.slice(0, 2), [
    ['create', { register: 'goal_log', fields: { what: 'So far, before the log', goal: 'goals#2', amount: 12, on: '2026-09-17' } }],
    ['update', { register: 'goals', seq: 2, patch: { done: null } }],
  ]);
});
