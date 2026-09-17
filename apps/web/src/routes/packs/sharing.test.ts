/**
 * Sharing a use case, as `/packs`, `/packs/browse` and `/packs/share` draw it (`sharing.ts`): the plan read in the
 * screen's words, the install going pack by pack through `planPack` and `installPack`, and what stops it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../lib/copy.ts';
import type { PackState } from '../../lib/record/packs.ts';
import { installShared, nextPatch, offerFor, planShared, readAddress, rowTitle, sharedPlanOf, switchTo, type SharingClient } from './sharing.ts';

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
});

test('SWITCHING TURNS THE CHOSEN ONE ON AND THE ONE SPEAKING OFF', async () => {
  const { client, calls } = stub();
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

test('THE SHARE FORM OFFERS THE NEXT PATCH, AND NAMES A ROW BY ITS TITLE', () => {
  assert.equal(nextPatch('1.0.0'), '1.0.1');
  assert.equal(nextPatch(null), '1.0.0');
  assert.equal(rowTitle({ state: 'to_do', what: 'Essay' }), 'Essay');
});
