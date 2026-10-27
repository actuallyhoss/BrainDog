/**
 * Read-only links to one page: who may open one, for how long, closing for good, the one refusal a link that
 * does not open reads as, and `shareable`, the host's yes or no the Share sheet asks before it draws the press.
 *
 * TWO DOORS INTO THE SAME FOUR METHODS. `createRecordApi` holds the real guards, so the refusals are asked of it. The
 * host's answer (`shares`) reaches the methods only once `src/index.ts` hands it into `methodDeps`, so a link that does
 * open is made through `shares.ts`'s own `methods`, handed the same record and the host answer a test chooses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods, SHARE_DAYS, SHARES_OFF, type SharesAnswer } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { OWNER, PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const decider: CallContext = { principal: { kind: 'person', id: 'p_decider', level: 'decide' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } };
const link = (id: string, slug = 'board'): CallContext => ({ principal: { kind: 'share', id, slug } });

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `answered ${JSON.stringify(x.value)}`);
  return x.refusal!;
};

const JOBS = {
  id: 'register.jobs',
  kind: 'register',
  body: { id: 'jobs', name: 'Jobs', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'brief', type: 'ref', to: 'jobs' }] },
} as never;
const BOARD = {
  id: 'page.board',
  kind: 'page',
  body: { page: 'board', title: 'Board', requires: ['register.jobs'], blocks: [{ kind: 'table', source: 'register.jobs', columns: [{ field: 'name', label: 'Job' }], empty: 'No jobs yet.' }] },
} as never;

/** The owner's record with one page, and the link methods handed a host answer (none when `shares` is absent). */
async function harness(shares?: () => SharesAnswer) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([JOBS, BOARD]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const rows = PROJECTS.slice(0, 2).map((name) => value<{ id: string }>(api.kernel.create('jobs', { name }, { actor: 'p_owner' })).id);
  const ownerOnly = (ctx: CallContext) =>
    ctx.principal.kind === 'person' && ctx.principal.level === 'owner' ? null : { code: 'FORBIDDEN', fix: 'Only an owner may.', at: 'principal' };
  const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: ownerOnly, ...(shares === undefined ? {} : { shares }) } as unknown as RecordDeps);
  const opens = () => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'share.open'")!.n;
  return { sql, api, clock, direct, rows, opens };
}

const yes = (): SharesAnswer => ({ can: true });

test('a member who decides and a token are refused every link method, and nothing is opened', async () => {
  const { sql, api, opens } = await harness();
  for (const ctx of [decider, token]) {
    refused(await api.openShare({ slug: 'board' }, ctx));
    refused(await api.closeShare({ id: 'x' }, ctx));
    refused(await api.shares(undefined, ctx));
    refused(await api.shareable(undefined, ctx));
  }
  assert.equal(refused(await api.openShare({ slug: 'board' }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(opens(), 0);
  sql.close();
});

test('shareable says yes, says the host\'s no, and says no for a host that never answered', async () => {
  const none = await harness();
  assert.deepEqual(value(await none.api.shareable(undefined, owner)), { can: false, why: SHARES_OFF });
  const refusal = refused(await none.api.openShare({ slug: 'board' }, owner));
  assert.deepEqual([refusal.code, refusal.fix, refusal.at], ['NOT_IN_THIS_BUILD', SHARES_OFF, 'host']);
  assert.equal(none.opens(), 0, 'a link was opened on a host that never said it can sign one');
  none.sql.close();

  const on = await harness(yes);
  assert.deepEqual(value(await on.direct.shareable(undefined, owner)), { can: true });
  /* AN OWNER WHO IS NOT SIGNED IN is told so here, rather than shown a press `openShare` refuses. */
  assert.equal(value<SharesAnswer>(await on.direct.shareable(undefined, { ...owner, credentialed: false })).can, false);
  on.sql.close();

  const off = await harness(() => ({ can: false, why: 'Links wait for a key on this BrainDog.' }));
  assert.deepEqual(value(await off.direct.shareable(undefined, owner)), { can: false, why: 'Links wait for a key on this BrainDog.' });
  assert.equal(refused(await off.direct.openShare({ slug: 'board' }, owner)).fix, 'Links wait for a key on this BrainDog.');
  assert.equal(off.opens(), 0);
  off.sql.close();

  /* A HOST WHOSE ANSWER THROWS, OR IS NOT ONE, IS A NO. */
  for (const odd of [() => { throw new Error('no key'); }, () => ({ can: 'yes' }) as never, () => ({ can: false, why: '  ' })]) {
    const h = await harness(odd as () => SharesAnswer);
    assert.deepEqual(value(await h.direct.shareable(undefined, owner)), { can: false, why: SHARES_OFF });
    h.sql.close();
  }
});

test('a link opens for 30 days unless said, takes 1 and 90, and refuses 0 and 91', async () => {
  const { sql, direct } = await harness(yes);
  const plain = value<{ expires_at: string }>(await direct.openShare({ slug: 'board' }, owner));
  assert.equal(Date.parse(plain.expires_at), NOW + SHARE_DAYS * DAY);
  assert.equal(SHARE_DAYS, 30);
  for (const days of [1, 90]) assert.equal(Date.parse(value<{ expires_at: string }>(await direct.openShare({ slug: 'board', days }, owner)).expires_at), NOW + days * DAY);
  for (const days of [0, 91, 1.5, '30', -1]) {
    const r = refused(await direct.openShare({ slug: 'board', days }, owner));
    assert.deepEqual([r.code, r.at], ['OUT_OF_BOUNDS', 'days'], `took ${String(days)}`);
  }
  assert.deepEqual(refused(await direct.openShare({ slug: 'nowhere' }, owner)).code, 'PAGE_UNKNOWN');
  assert.deepEqual(refused(await direct.openShare({}, owner)).code, 'REQUIRED_MISSING');
  sql.close();
});

test('a second close answers as the first and writes nothing', async () => {
  const { sql, api, clock, direct } = await harness(yes);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'board' }, owner));
  const first = value<{ closed_at: string }>(await api.closeShare({ id }, owner));
  clock.advance(DAY);
  assert.deepEqual(value(await api.closeShare({ id }, owner)), { id, closed_at: first.closed_at });
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'share.close'")!.n, 1);
  assert.equal(refused(await api.closeShare({ id: 'nothing-like-it' }, owner)).code, 'REF_UNKNOWN');
  /* CLOSING IS FINAL: the list says it closed, and sharing again is a new link with a new id. */
  const [row] = value<{ id: string; closed_at: string | null }[]>(await api.shares(undefined, owner));
  assert.deepEqual([row!.id, row!.closed_at], [id, first.closed_at]);
  sql.close();
});

test('closed, past its day, a maker no longer an owner, and every other way in all read as the one refusal', async () => {
  const { sql, api, clock, direct } = await harness(yes);
  const open = async () => value<{ id: string }>(await direct.openShare({ slug: 'board', days: 2 }, owner)).id;
  const live = await open();
  value(await api.sharedPage(undefined, link(live)));
  const shut = refused(await api.sharedPage(undefined, link('01JAAAAAAAAAAAAAAAAAAAAAAA')));
  assert.equal(shut.code, 'PAGE_UNKNOWN');

  const closed = await open();
  value(await api.closeShare({ id: closed }, owner));
  const wrongPage = await open();
  const answers = [
    await api.sharedPage(undefined, link(closed)),
    await api.sharedPage(undefined, link(wrongPage, 'other')),
    await api.sharedPage(undefined, owner),
  ];
  clock.advance(2 * DAY);
  answers.push(await api.sharedPage(undefined, link(live)));
  clock.set(NOW);
  const later = await open();
  sql.exec("UPDATE member SET level = 'write' WHERE person_id = 'p_owner'");
  answers.push(await api.sharedPage(undefined, link(later)));
  sql.exec("UPDATE member SET level = 'owner' WHERE person_id = 'p_owner'");
  sql.exec("UPDATE person SET suspended_at = '2026-10-14T12:00:00.000Z' WHERE id = 'p_owner'");
  answers.push(await api.sharedPage(undefined, link(later)));
  for (const a of answers) assert.deepEqual(refused(a), shut);
  sql.close();
});

test('no answer holds a row id or a list id', async () => {
  const { sql, api, direct, rows } = await harness(yes);
  const opened = value<{ id: string }>(await direct.openShare({ slug: 'board' }, owner));
  const said = JSON.stringify([
    opened,
    value(await api.shares(undefined, owner)),
    value(await api.sharedPage(undefined, link(opened.id))),
    value(await api.closeShare({ id: opened.id }, owner)),
  ]);
  for (const id of rows) assert.ok(!said.includes(id), `an answer named the row ${id}`);
  assert.doesNotMatch(said, /register\.|"jobs"/u);
  sql.close();
});
