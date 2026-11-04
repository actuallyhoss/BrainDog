/**
 * Who may ask what.
 *
 * The check is here and not in the router, because a check in the router is a check the CLI can be
 * pointed around and the self-host has no router at all. Every test below is about a caller getting
 * LESS than they asked for, which is the only direction that matters: a permission system that is
 * too generous fails silently, and the failure is somebody reading a record they were removed from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFUSAL_CODES, codeOf } from '@braindog/ports';

import { allows, createRecordApi, reaches, type CallContext, type Level, type Scope } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

/**
 * ONE SIGNING KEY FOR THIS FILE'S RECORDS. `41 §5.11` step 3 refuses a file with no `dog_sig` row,
 * and a real record has a key: a wrapped Ed25519 private half in `vault_key`, opened by the host
 * under its KEK. A record whose exports nothing can import is a record with no key, and that is a
 * state worth having a test for rather than the default every test runs in.
 */
const SIGNER = testSigner();

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      /* INDEXED, so the scan counter has one field on each side of the line to tell apart. */
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  /* THE CLOCK IS RETURNED, so a test that is about time can move it. It was created inline and
     dropped, which meant every event in every fixture carried one timestamp — fine for the tests
     that do not care, and silently fatal for the read mark, whose whole subject is which of two
     moments is later. */
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, sign: SIGNER });
  const out = await api.kernel.install([OBLIGATIONS, NOTES]);
  assert.ok(out.ok);
  return { api, sql, clock };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const person = (level: Level): CallContext => ({ principal: { kind: 'person', id: 'p_2', level } });
const token = (scope: Scope, level: Level = 'owner'): CallContext => ({
  principal: { kind: 'token', id: 't_1', scope, person: 'p_1', level },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; allowed?: readonly string[] } };
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal;
};

/* ── the two ladders ─────────────────────────────────────────────────────── */

test('THE EFFECTIVE PERMISSION IS THE INTERSECTION, never the maximum', () => {
  // A token says what its holder may do with their access, never what access they have. Getting
  // this backwards is how a colleague who was removed keeps writing through a token issued a year
  // ago — the exact failure a capability system is supposed to prevent.
  assert.equal(allows(token('write', 'owner'), 'write'), null);
  assert.equal(allows(token('write', 'read'), 'write')?.code, 'LEVEL_REQUIRED');
  assert.equal(allows(token('read', 'owner'), 'write')?.code, 'FORBIDDEN');
  assert.equal(allows(token('read', 'owner'), 'read'), null);
});

test('A SHORT SCOPE WAS `SCOPE_INSUFFICIENT`, A CODE IN NO REGISTRY, and it is `FORBIDDEN` with the remedy in the sentence', () => {
  /**
   * `allows` answered a token whose scope does not reach the need through a ternary,
   *
   *     code: short ? 'SCOPE_INSUFFICIENT' : 'LEVEL_REQUIRED'
   *
   * and driven, a read token on owner access asking to write was handed
   *
   *     {"code":"SCOPE_INSUFFICIENT","fix":"This needs write, and you have a read token on owner
   *      access. Ask the owner for a token with a wider scope.","allowed":["read"]}
   *
   * `30 §6` has no such code. It writes `FORBIDDEN` as *"a credential outside its scope, level or
   * ceiling"*, and settled the identical case for `PERSON_REQUIRED` by folding it into `FORBIDDEN`
   * with the remedy in the sentence. The sentence already carried the remedy; only the code moves.
   */
  const said = allows(token('read', 'owner'), 'write');
  assert.equal(said?.code, 'FORBIDDEN');
  assert.equal(said?.fix, 'This changes your BrainDog, and this token only reads. Ask the owner for a token with a wider scope.');
  assert.deepEqual(said?.allowed, ['read']);
  assert.ok((REFUSAL_CODES as readonly string[]).includes(said?.code ?? ''), `${said?.code} is outside 30 §6`);

  // A propose token keeps its own way through, in its own sentence under the same code.
  const propose = allows(token('propose', 'owner'), 'write');
  assert.equal(propose?.code, 'FORBIDDEN');
  assert.match(propose?.fix ?? '', /Send it as a proposal, or ask the owner for a write token\./);

  /* AND A LEVEL THAT IS SHORT IS STILL TOLD APART BY ITS CODE, because it is a different act: the
     owner raises a person's access, not a token's scope. */
  assert.equal(allows(token('write', 'read'), 'write')?.code, 'LEVEL_REQUIRED');
  assert.equal(allows(token('read', 'owner'), 'read'), null);
});

test('EVERY REFUSAL A CALLER CAN REACH NAMES SOMETHING THEY CAN DO NEXT', () => {
  /* A refusal that says what is wrong and not what to do is half a sentence, and the half the
     caller does not need. `PERSON_REQUIRED` has always read this way — "no token reaches it. A
     person has to do it, signed in" — and it is the shape the others now copy.

     ASSERTED AS A PROPERTY, not string by string. Any of these can be reworded; none of them may
     stop naming a next move, which is the thing that made them unusable. */
  const cases = [
    allows(token('propose', 'read'), 'write'),
    allows(token('read', 'owner'), 'write'),
    allows(token('write', 'read'), 'write'),
    allows({ principal: { kind: 'person', id: 'p_1', level: 'read' } } as CallContext, 'write'),
    allows({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: null } } as CallContext, 'read'),
    reaches({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'write' }, registers: ['services'] } as CallContext, 'obligations'),
  ];

  for (const r of cases) {
    assert.ok(r, 'a call that should have been refused was allowed');
    /* Ask somebody, send it another way, name something else, do it signed in — or be told what IS
       reachable, which ends the search rather than sending the caller back to ask. */
    assert.match(r.fix, /(Ask|Send|Name|has to do it|It reaches)/, `no next move: ${r.fix}`);
    assert.ok(r.fix.trim().endsWith('.'), `not a sentence: ${r.fix}`);
  }
});

test('A TOKEN SCOPED TO REGISTERS IS TOLD WHICH ONES, rather than that it holds nothing', () => {
  /* `You hold named registers in this record and nothing on the record itself` named no rule, no
     remedy and no next step, and sent `allowed: []` — so an agent an owner set up ten minutes ago
     could not tell whether to retry, to ask for something else, or to stop. */
  const scoped = {
    principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: null },
    registers: ['services', 'people'],
  } as CallContext;

  const out = allows(scoped, 'read')!;
  assert.equal(out.code, 'FORBIDDEN');
  assert.match(out.fix, /services, people/, 'the refusal does not say what the token does hold');
  assert.deepEqual([...(out.allowed ?? [])], ['services', 'people'], 'allowed was empty for a token that holds two');

  /* AND A CEILING NAMES ITS OWN CONTENTS TOO. The list was in `allowed` for a machine and nowhere
     in the sentence for a person, so a refusal that could have ended the search sent them back to
     the owner to ask what they had. */
  const wall = reaches(
    { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'write' }, registers: ['services'] } as CallContext,
    'obligations',
  )!;
  assert.match(wall.fix, /does not reach obligations\. It reaches services\./);
});

test('a person’s ladder is five rungs and a token’s is three, and no token reaches the top two', () => {
  // ADR-060: there is no `admin` scope. A decision needs a person, and so does anything owner-level —
  // and the refusal says exactly that, rather than "your scope is too small", which would send an
  // agent looking for a bigger token that does not exist.
  //
  // THE SENTENCE SAYS IT AND THE CODE IS `FORBIDDEN`, which is why the `fix` is asserted here too.
  // This asserted `PERSON_REQUIRED`, a code in no registry: `30 §6` writes `FORBIDDEN` as "a
  // credential outside its scope, level or ceiling" and already carries three distinct facts under
  // it, each told apart by its sentence. A code is what a caller branches on; "ask a person to sign
  // in" is what it acts on, and `10 §7` wants the first stable across versions.
  for (const level of ['read', 'append', 'write', 'decide', 'owner'] as const)
    for (const need of ['decide', 'owner'] as const) {
      const r = allows(token('write', level), need);
      assert.equal(r?.code, 'FORBIDDEN', `${level} / ${need}`);
      assert.match(r?.fix ?? '', /A person has to do it/);
    }
  assert.equal(allows(person('owner'), 'owner'), null);
  assert.equal(allows(person('decide'), 'owner')?.code, 'LEVEL_REQUIRED');
  assert.equal(allows(person('decide'), 'decide'), null);
});

test('the ladder is ordered, so a rung includes every rung under it', () => {
  assert.equal(allows(person('owner'), 'read'), null);
  assert.equal(allows(person('write'), 'append'), null);
  assert.equal(allows(person('read'), 'append')?.code, 'LEVEL_REQUIRED');
});

test('EXCEPT `append`, WHICH DOES NOT READ — the one rung that is not a prefix', () => {
  /* 20 §1: *"`create`, `propose` and `log` — and no read. The conservative half: an appender sees
     nothing, not even what it filed."* `append` included `read`, so a contractor invited to file
     expenses could list every register inside their ceiling. Somebody who needs to see what they
     filed gets a `read` grant on that register, which is the mechanism the sentence names. */
  assert.equal(allows(person('append'), 'append'), null);
  assert.equal(allows(person('append'), 'propose'), null);
  assert.equal(allows(person('append'), 'read')?.code, 'LEVEL_REQUIRED');
  // And every rung above it still reads, so this is not a hole in the ladder.
  for (const level of ['write', 'decide', 'owner'] as const) assert.equal(allows(person(level), 'read'), null, level);
});

test('a refusal says what you have and what it needs, and lists what you may do', () => {
  const r = allows(token('read', 'owner'), 'write');
  assert.match(r?.fix ?? '', /changes your BrainDog/);
  assert.match(r?.fix ?? '', /this token only reads/);
  assert.deepEqual(r?.allowed, ['read']);
});

test('a ceiling is a list of registers, and no ceiling is `*`', () => {
  assert.equal(reaches({ ...owner, registers: '*' }, 'anything'), null);
  assert.equal(reaches({ ...owner, registers: ['obligations'] }, 'obligations'), null);
  assert.equal(reaches({ ...owner, registers: ['obligations'] }, 'notes')?.code, 'FORBIDDEN');
});

/* ── through the surface ─────────────────────────────────────────────────── */

test('a read token reads and does not write', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));

  const reader = token('read');
  assert.ok(value<{ rows: unknown[] }>(await api.list({ register: 'obligations' }, reader)).rows.length === 1);
  assert.equal(refusal(await api.create({ register: 'obligations', fields: { what: 'x' } }, reader)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.update({ register: 'obligations', seq: 1, patch: { what: 'x' } }, reader)).code, 'FORBIDDEN');
  sql.close();
});

test('APPEND ADDS AND DOES NOT EDIT, because a wrong new row is visible and a wrong edit is not', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));

  const appender = person('append');
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, appender));
  assert.equal(refusal(await api.update({ register: 'obligations', seq: 1, patch: { what: 'x' } }, appender)).code, 'LEVEL_REQUIRED');
  assert.equal(api.kernel.count('obligations'), 2);
  sql.close();
});

test('a ceiling holds through every method that names a register', async () => {
  const { api, sql } = await record();
  const scoped: CallContext = { ...owner, registers: ['obligations'] };
  value(await api.list({ register: 'obligations' }, scoped));
  for (const call of [
    api.list({ register: 'notes' }, scoped),
    api.get({ register: 'notes', seq: 1 }, scoped),
    api.schema({ register: 'notes' }, scoped),
    api.create({ register: 'notes', fields: { body: 'x' } }, scoped),
    api.update({ register: 'notes', seq: 1, patch: { body: 'x' } }, scoped),
    api.history({ register: 'notes', seq: 1 }, scoped),
  ])
    assert.equal(refusal(await call).code, 'FORBIDDEN');
  sql.close();
});

test('and boot shows only the registers the caller may touch, because a list of names is information', async () => {
  const { api, sql } = await record();
  const all = value<{ registers: { id: string }[] }>(await api.boot(owner));
  assert.deepEqual(all.registers.map((r) => r.id).sort(), ['instructions', 'notes', 'obligations', 'session']);

  const scoped = value<{ registers: { id: string }[] }>(await api.boot({ ...owner, registers: ['obligations'] }));
  assert.deepEqual(scoped.registers.map((r) => r.id), ['obligations']);
  sql.close();
});

test('boot marks the lists the kernel declares itself, by declaration, so no screen counts them as filed', async () => {
  const { api, sql } = await record();
  const all = value<{ registers: { id: string; kernel?: true }[] }>(await api.boot(owner));
  const own = all.registers.filter((r) => r.kernel === true).map((r) => r.id).sort();
  /* THE SAME AS THE DECLARATIONS SAY: the kernel's pack, and nothing a pack or a person declared. */
  const declared = sql
    .all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'register' AND pack_id = 'kernel' AND superseded_at IS NULL AND retired = 0")
    .map((r) => r.id.slice('register.'.length))
    .sort();
  assert.deepEqual(own, declared);
  assert.ok(own.length >= 2, JSON.stringify(own));
  assert.ok(all.registers.some((r) => r.kernel === undefined), 'every list was marked the kernel\'s');
  sql.close();
});

/* ── a page made of figures ─────────────────────────────────── */

test('A PAGE MADE OF FIGURES NAMES THE REGISTERS BEHIND THEM, and it used to name none', async () => {
  /**
   * `05 §1` makes `table` the page-only kind that takes `source:`. A `stat` block has
   * `cells:` instead, and each cell names a metric whose own declaration carries the register. Both
   * the listing filter and the per-block blanking looked at `block.source` alone, so a page made
   * entirely of figures named no register, was treated as prose, was listed to everybody, and
   * handed its readings back.
   *
   * THE OTHER FOUR DOORS TO THE SAME NUMBER WERE ALREADY SHUT, which is what makes this the leak
   * rather than the design: with a ceiling of `notes`, `list` refuses, `metric` answers
   * `METRIC_UNKNOWN` on purpose so the name itself does not leak, and `boot` shows one register.
   * The fifth door handed over the figure and the page's title with it.
   */
  const { api, sql } = await record();
  const out = await api.kernel.install([
    {
      id: 'metric.owed',
      kind: 'metric' as const,
      body: {
        metric: 'owed',
        name: 'Owed',
        source: 'register.obligations',
        value: { count: 'what' },
        format: 'int',
        target: { lte: 99 },
        window: '30d',
      } as never,
    },
    {
      id: 'page.figures',
      kind: 'page' as const,
      body: {
        page: 'figures',
        title: 'Obligations, monthly',
        blocks: [{ kind: 'stat', cells: [{ metric: 'owed', label: 'Owed' }] }],
      } as never,
    },
  ]);
  assert.ok(out.ok);

  const narrow = { ...owner, registers: ['notes'] } as CallContext;

  /* The four doors that were already shut, asserted so the fifth is a leak rather than the rule. */
  assert.equal(refusal(await api.list({ register: 'obligations' }, narrow)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.metric({ metric: 'owed' }, narrow)).code, 'METRIC_UNKNOWN');
  assert.deepEqual(value<{ registers: { id: string }[] }>(await api.boot(narrow)).registers.map((r) => r.id), ['notes']);

  /* THE PAGE IS NOT LISTED. Its title is a sentence about what the record holds. */
  const listed = value<{ slug: string }[]>(await api.pages(narrow));
  assert.deepEqual(listed.filter((p2) => p2.slug === 'figures'), []);

  /* AND ITS FIGURES ARE NOT HANDED OVER even to a caller who asks for the slug directly. */
  const asked = await api.page({ slug: 'figures' }, narrow);
  if (asked.ok) {
    const blocks = (asked.value as { blocks: { readings?: { reading: unknown }[]; refusals?: unknown[] }[] }).blocks;
    for (const b of blocks) {
      assert.deepEqual(b.readings ?? [], [], 'a reading over a register the caller cannot read was drawn');
      assert.ok((b.refusals ?? []).length > 0, 'the block was blanked and said nothing about why');
    }
  }

  /* AND THE OWNER STILL SEES IT, so the filter is about the caller rather than about the page. One row first: a figure
     over an empty list holds nothing, and the page leaves an idle figure out for everybody (`drawn.ts`'s `told`). */
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const mine = value<{ slug: string }[]>(await api.pages(owner));
  assert.ok(mine.some((p2) => p2.slug === 'figures'), 'the owner lost a page of their own record');
  const read = value<{ blocks: { readings?: { reading: unknown }[] }[] }>(await api.page({ slug: 'figures' }, owner));
  assert.ok((read.blocks[0]?.readings ?? []).length > 0, 'the owner got no figures either');
  sql.close();
});

test('A PAGE OF WHAT AGENTS DID IS FOR WHOEVER MAY READ THE WHOLE RECORD, because the log names rows of every list', async () => {
  const { api, sql } = await record();
  assert.ok(
    (
      await api.kernel.install([
        {
          id: 'page.agent-work',
          kind: 'page' as const,
          body: { page: 'agent-work', title: 'Agent work', blocks: [{ kind: 'agents', source: 'activity', first: 5, empty: 'Nothing yet.' }] } as never,
        },
      ])
    ).ok,
  );
  assert.ok(api.kernel.create('notes', { body: 'Ship it' }, { actor: 'S3' }).ok);

  const narrow = { ...owner, registers: ['notes'] } as CallContext;
  /* HIDDEN, NOT SERVED BLANK. Since the kernel names what an activity block reads as the whole record, `page` answers
     a page made only of one exactly as `pages` lists it, so somebody invited to one list is told there is no such
     page rather than handed its title with the feed emptied. */
  assert.equal(refusal(await api.page({ slug: 'agent-work' }, narrow)).code, 'PAGE_UNKNOWN', 'the log was handed to somebody invited to one list');

  const mine = value<{ blocks: { feed?: { who: string; thing?: string }[]; refusals?: unknown[] }[] }>(await api.page({ slug: 'agent-work' }, owner));
  assert.deepEqual(mine.blocks[0]?.refusals, []);
  assert.deepEqual(mine.blocks[0]?.feed?.map((r) => [r.who, r.thing]), [['S3', 'Ship it']]);
  sql.close();
});

test('A FEED KNOWS WHERE ITS READER LAST LOOKED, and names a deleted row by what it was last called', async () => {
  const { api, sql, clock } = await record();
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok(
    (
      await api.kernel.install([
        { id: 'page.log', kind: 'page' as const, body: { page: 'log', title: 'Log', blocks: [{ kind: 'feed', source: 'activity', since: 'seen', empty: 'Nothing yet.' }] } as never },
      ])
    ).ok,
  );
  type Feed = { blocks: { seen?: string | null; feed?: { kind: string | null; target: string | null; thing?: string }[] }[] };

  /* NOBODY HAS LOOKED YET, so the mark is there and empty: the renderer's "not looked yet". */
  const made = value<{ seq: number }>(await api.create({ register: 'notes', fields: { body: 'Ship it' } }, owner));
  const first = value<Feed>(await api.page({ slug: 'log' }, owner));
  assert.ok('seen' in (first.blocks[0] ?? {}), 'a feed that marks what is new came back with no mark at all');
  assert.equal(first.blocks[0]?.seen, null);

  /* MARKED READ, the feed carries the caller's own mark, and only the caller's. */
  const marked = value<{ seen_at: string | null }>(await api.markRead(undefined, owner));
  clock.advance(60_000);
  assert.ok((await api.update({ register: 'notes', seq: made.seq, patch: { deleted_at: 'now' } }, owner)).ok);
  const after = value<Feed>(await api.page({ slug: 'log' }, owner));
  assert.equal(after.blocks[0]?.seen, marked.seen_at);
  assert.equal(value<Feed>(await api.page({ slug: 'log' }, { principal: { kind: 'person', id: 'p_9', level: 'owner' } })).blocks[0]?.seen, null);

  /* THE DELETE IS ON A ROW THAT IS GONE, and it is named as the row was, never `entry:<id>`. */
  const deleted = after.blocks[0]?.feed?.find((r) => r.kind === 'delete');
  assert.ok(deleted, 'the delete is not in the feed');
  assert.equal(deleted.thing, 'Ship it');
  assert.equal(deleted.target, `notes#${made.seq}`);
  sql.close();
});

/* ── who the record says did it ──────────────────────────────────────────── */

test('A TOKEN WRITES AS ITS RUN, never as itself and never as the person who holds it', async () => {
  // The history has to answer "who did this", and "t_1" is not a who. The token is how, and the run
  // it belongs to is who (30 §3): the person's own name on an agent's write would say they made it.
  const { api, sql } = await record();
  const row = value<{ id: string }>(
    await api.create({ register: 'obligations', fields: { what: 'a' } }, token('write')),
  );
  const events = value<{ actor: string }[]>(await api.history({ register: 'obligations', seq: 1 }, owner));
  assert.equal(events[0]?.actor, 'S1');
  assert.ok(row.id);
  sql.close();
});

/* ── nothing throws across this boundary ─────────────────────────────────── */

test('a refusal from the kernel comes back as a value, with its sentence intact', async () => {
  const { api, sql } = await record();
  const missing = refusal(await api.create({ register: 'obligations', fields: { amount: { amount: 1, currency: 'GBP' } } }, owner));
  assert.equal(missing.code, 'REQUIRED_MISSING');

  const gone = refusal(await api.schema({ register: 'atlantis' }, owner));
  assert.equal(gone.code, 'REGISTER_UNKNOWN');
  assert.ok(gone.allowed?.includes('obligations'));

  const badFilter = refusal(await api.list({ register: 'obligations', where: { field: 'nope', is: 1 } }, owner));
  assert.equal(badFilter.code, 'FIELD_UNKNOWN');
  sql.close();
});

test('the record’s version moves with a write and not with a read', async () => {
  const { api, sql } = await record();
  /* `.version`, BECAUSE `version` ANSWERS `33 §4`'s OBJECT. It returned a bare number, so the route
     carried the polling cursor and nothing else the contract names: `deploy-parity` reads `app` and
     `50 §5.13` step 3 reads `slash`, and both read a number. */
  const at = async (): Promise<number> => value<{ version: number }>(await api.version(owner)).version;

  const before = await at();
  value(await api.list({ register: 'obligations' }, owner));
  assert.equal(await at(), before);
  value(await api.create({ register: 'obligations', fields: { what: 'a' } }, owner));
  assert.ok((await at()) > before);
  sql.close();
});

test('and it says what this build is and what is serving it, which nothing asked before', async () => {
  /* `33 §4` line 356: `{ version, format, kernel, primitives, app, slash: boolean }`. A record cannot
     know its own build — it is the same code under a Worker, a test and the CLI — so the host tells
     it, and a host that was not told says `null` rather than the empty string it was handed. */
  const sql = openSqlite();
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    sign: SIGNER,
    build: { app: '2026-09-09+abc1234', slash: true },
  });
  const v = value<Record<string, unknown>>(await api.version(owner));
  assert.deepEqual(Object.keys(v).sort(), ['app', 'format', 'kernel', 'primitives', 'slash', 'version']);
  assert.equal(v.app, '2026-09-09+abc1234');
  assert.equal(v.slash, true);
  assert.equal(v.format, 1);
  assert.equal(v.primitives, 1);
  assert.ok(typeof v.kernel === 'number' && v.kernel >= 1);
  sql.close();

  const bare = openSqlite();
  const untold = await createRecordApi({ sql: bare, clock: fixedClock(NOW), sign: SIGNER, build: { app: '', slash: false } });
  assert.equal(value<{ app: string | null }>(await untold.version(owner)).app, null, 'an empty build is a name, not a silence');
  bare.close();
});

test('AND `boot` SAYS WHICH HOST IS SERVING IT, when the host said, and nothing when it did not', async () => {
  /* BILLING INFERRED THE SELF-HOST FROM A 404 ON THE MAIL DOOR, because `boot` named the record and the caller and
     nothing about the host, and the only host fact the app could read was which routes answered. The field is copied
     from `Build`, so a host that was not asked has no key at all rather than a value it never gave: `version` answers
     its six keys exactly, and this is not one of them. */
  for (const host of ['self-host', 'cloud'] as const) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(NOW), sign: SIGNER, build: { app: '', slash: false, host } });
    assert.equal(value<{ host?: string }>(await api.boot(owner)).host, host);
    assert.deepEqual(Object.keys(value<Record<string, unknown>>(await api.version(owner))).sort(), ['app', 'format', 'kernel', 'primitives', 'slash', 'version']);
    sql.close();
  }
  for (const build of [{ app: '', slash: false }, undefined]) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(NOW), sign: SIGNER, ...(build ? { build } : {}) });
    assert.ok(!('host' in value<object>(await api.boot(owner))), `a host that never said is not a host, build ${JSON.stringify(build)}`);
    sql.close();
  }
});

test('AND `boot` SAYS WHAT INSTANT IT ANSWERED AS OF', async () => {
  /* A record is opened with an injected clock so a fixture can pin one instant, and the sample
     record this product demonstrates itself with is exactly such a fixture: its rows are dated
     relative to a pinned day. A reader dating them against its own clock puts every band, deadline
     tone and window some number of days out and gets no error while doing it. */
  const { api, sql } = await record();
  assert.equal(value<{ now: string }>(await api.boot(owner)).now, new Date(NOW).toISOString());
  sql.close();
});

/* ── the decision gate ───────────────────────────────────── */

const PROPOSAL = {
  question: 'File the two invoices that arrived overnight?',
  body_kind: 'rowset' as const,
  body: { register: 'obligations', rows: [{ what: 'Invoice 41', state: 'open' }] },
};

test('AN AGENT MAY ASK AND MAY NOT ANSWER, and that is not a scope anybody can be issued', async () => {
  /* ADR-060: no token reaches `decide`. An agent that can propose and not write is an agent whose
     mistakes are a queue rather than a diff — and one that could answer its own question would be
     an agent with a rubber stamp. */
  const { api, sql } = await record();

  const made = await api.propose(PROPOSAL, token('propose'));
  assert.ok(made.ok, 'propose is the rung the token ladder has for exactly this');

  const id = (made as { value: { id: string } }).value.id;
  for (const scope of ['read', 'propose', 'write'] as const) {
    const tried = await api.decide({ id, decide: { option: 'accept', reason: 'go on' } }, token(scope));
    assert.equal(tried.ok, false, `a ${scope} token decided`);
    /* AND THE SENTENCE NAMES A PERSON, not a bigger token — `SCOPE_INSUFFICIENT` would send whoever
       read it looking for a scope that does not exist, so the `fix` is asserted beside the code. */
    assert.equal((tried as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
    assert.match((tried as { refusal: { fix: string } }).refusal.fix, /A person has to do it/);
  }
  assert.equal(api.kernel.count('obligations'), 0);

  // A person at `decide` answers it, and the rows land.
  const done = await api.decide({ id, decide: { option: 'accept', reason: 'both are ours' } }, person('decide'));
  assert.ok(done.ok, done.ok ? '' : (done as { refusal: { fix: string } }).refusal.fix);
  assert.equal(api.kernel.count('obligations'), 1);
  sql.close();
});

test('THE QUEUE SAYS WHAT EACH SUGGESTION ASKS, and an answer with no verdict says which verdicts there are', async () => {
  const { api, sql } = await record();
  const made = await api.propose(PROPOSAL, token('propose'));
  const id = (made as { value: { id: string } }).value.id;

  const open = value<{ id: string; question: string }[]>(await api.governance({}, token('read')));
  assert.equal(open.find((r) => r.id === id)?.question, PROPOSAL.question);
  assert.equal(value<{ question: string }>(await api.governance({ id }, owner)).question, PROPOSAL.question);

  const empty = await api.decide({ id } as never, owner);
  assert.equal(codeOf(empty), 'REQUIRED_MISSING');
  const fix = (empty as { refusal: { fix: string } }).refusal.fix;
  assert.doesNotMatch(fix, /undefined/);
  assert.match(fix, /decide/);
  assert.match(fix, /defer/);
  assert.match(fix, /resolved_as/);
  sql.close();
});

test('and a read token can see the queue, because a proposal nobody can see was never made', async () => {
  const { api, sql } = await record();
  await api.propose(PROPOSAL, owner);

  const open = await api.governance({}, token('read'));
  assert.ok(open.ok);
  assert.equal((open as { value: unknown[] }).value.length, 1);

  // And a person at `read` too — the gate is about answering, not about looking.
  assert.ok((await api.governance({ register: 'decision' }, person('read'))).ok);
  sql.close();
});

/* ── packs ───────────────────────────────────────────────────── */

const PACK = (over: Record<string, unknown> = {}) => ({
  pack: 'studio-books',
  version: '1.0.0',
  summary: 'What a small studio owes.',
  author: 'Halden',
  license: 'MIT',
  declarations: [
    {
      register: 'invoices',
      name: 'Invoices',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'due', type: 'day', index: true },
        { id: 'tags', type: 'list', of: 'text' },
      ],
    },
  ],
  seeds: [{ register: 'invoices', fields: { what: 'Invoice 41', due: '2026-10-01' } }],
  ...over,
});

test('A PACK IS PLANNED, APPROVED AND INSTALLED, and the plan is what happened', async () => {
  /* Installing a pack changes what a record IS. The honest way to do that is to say exactly what
     will change and let a person approve it — and the hash is what makes approving it mean
     something. */
  const { api, sql } = await record();

  const planned = value<{ diff: { planHash: string; adds: { id: string }[]; seeds: { count: number } } }>(
    await api.planPack({ doc: PACK() }, owner),
  );
  assert.deepEqual(planned.diff.adds.map((a) => a.id), ['register.invoices']);
  assert.equal(planned.diff.seeds.count, 1);
  assert.equal(api.kernel.register('invoices'), undefined, 'planning installed something');

  const done = value<{ pack: string; declarations: number; seeds: number }>(
    await api.installPack({ doc: PACK(), planHash: planned.diff.planHash }, owner),
  );
  assert.equal(done.pack, 'studio-books');
  assert.equal(done.declarations, 1);
  assert.equal(done.seeds, 1);

  assert.ok(api.kernel.register('invoices'), 'the register did not arrive');
  assert.deepEqual(
    value<{ id: string; version: string }[]>(await api.packs(owner)).map((p) => ({ id: p.id, version: p.version })),
    [{ id: 'studio-books', version: '1.0.0' }],
  );

  // The seed is a row like any other, and it wears the marker that says it is an example.
  assert.equal(api.kernel.count('invoices'), 1);
  assert.deepEqual(api.kernel.get('invoices#1')?.fields.tags, ['example']);

  // Its index is real, which is the half of an install nobody checks.
  assert.ok(sql.all("SELECT 1 FROM sqlite_master WHERE name = 'entry_i_invoices__due'").length, 'the declared index is not there');

  // And the plan is stale the moment the record moves.
  const again = await api.installPack({ doc: PACK(), planHash: planned.diff.planHash }, owner);
  assert.equal(again.ok, false);
  assert.equal((again as { refusal: { code: string } }).refusal.code, 'PLAN_STALE');
  sql.close();
});

test('and taking it out keeps the rows, which is the whole reason it is safe to try one', async () => {
  const { api, sql } = await record();
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: PACK() }, owner));
  value(await api.installPack({ doc: PACK(), planHash: planned.diff.planHash }, owner));
  value(await api.create({ register: 'invoices', fields: { what: 'Invoice 42' } }, owner));

  const out = value<{ declarations: number; rows_kept: Record<string, number> }>(await api.uninstallPack({ id: 'studio-books' }, owner));
  assert.equal(out.declarations, 1);
  assert.deepEqual(out.rows_kept, { invoices: 2 });
  assert.deepEqual(value<unknown[]>(await api.packs(owner)), []);
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'invoices' AND deleted_at IS NULL").length, 2, 'the rows went with the pack');
  assert.equal(sql.all("SELECT 1 FROM sqlite_master WHERE name = 'entry_i_invoices__due'").length, 0, 'the index outlived the declaration');
  sql.close();
});

test('AND A PACK DOES NOT TAKE OVER A DECLARATION SOMEBODY WROTE IN THE APP', async () => {
  /* `plan` tested `already.pack_id && already.pack_id !== mine`, and a declaration set from the app
     has `pack_id: null`, so a hand-written page fell through into `changes`. The owner approved a
     diff that said "1 change", the install rewrote their page, and the uninstall then DELETED it,
     because by that point the row was claimed by the pack. The sentence above `setDeclaration`
     promises the opposite in as many words: it belongs to no pack, so a later uninstall of anything
     cannot take it, and a pack that claims the same id is a `PROVIDES_CONFLICT` rather than a silent
     overwrite. Both halves were false. */
  const { api, sql } = await record();
  value(
    await api.setDeclaration(
      { body: { page: 'home', title: 'MY HAND-WRITTEN PAGE', blocks: [{ kind: 'note', body: 'Mine.' }] } },
      owner,
    ),
  );
  assert.equal(api.kernel.declarations().find((d) => d.id === 'page.home')?.pack_id, null);

  const intruder = PACK({
    declarations: [{ page: 'home', title: 'THE PACK OWNS IT NOW', blocks: [{ kind: 'note', body: 'Theirs.' }] }],
    seeds: [],
  });
  const planned = value<{ diff: { planHash: string; conflicts: { id: string; pack: string }[]; changes: unknown[] } }>(
    await api.planPack({ doc: intruder }, owner),
  );
  assert.deepEqual(
    planned.diff.conflicts,
    [{ id: 'page.home', pack: '(this record)' }],
    'the plan offered somebody else’s page as one of the pack’s own changes',
  );
  assert.deepEqual(planned.diff.changes, []);

  const tried = await api.installPack({ doc: intruder, planHash: planned.diff.planHash }, owner);
  assert.equal((tried as { refusal?: { code: string } }).refusal?.code, 'PROVIDES_CONFLICT');

  /* AND IT IS STILL THEIRS, with their words in it and no pack able to retire it. */
  const still = api.kernel.declarations().find((d) => d.id === 'page.home');
  assert.equal(still?.pack_id, null, 'the pack took the declaration');
  assert.match(String(still?.body), /MY HAND-WRITTEN PAGE/);
  sql.close();
});

test('AND NO TOKEN CHANGES WHAT A RECORD IS, whatever its scope', async () => {
  /* ADR-060: there is no `admin` scope to issue. The refusal names the thing that IS missing rather
     than a bigger token somebody would then go looking for. */
  const { api, sql } = await record();
  for (const scope of ['read', 'propose', 'write'] as const) {
    const tried = await api.planPack({ doc: PACK() }, token(scope));
    assert.equal(tried.ok, false, `a ${scope} token planned a pack`);
    assert.equal((tried as { refusal: { code: string } }).refusal.code, 'NEEDS_BROWSER_SESSION');
  }
  // Nor a person below owner, in a browser or not.
  const below = await api.installPack({ doc: PACK(), planHash: 'x' }, person('decide'));
  assert.equal((below as { refusal: { code: string } }).refusal.code, 'LEVEL_REQUIRED');

  // But reading which packs are installed is a read.
  assert.ok((await api.packs(token('read'))).ok);
  sql.close();
});

/* ── the four a caller needs and could not ask for ───────────────── */

test('AN AGENT CAN ASK WHAT IT MAY DO, instead of finding out by being refused', async () => {
  /* An agent that cannot ask works the answer out one refusal at a time, in front of whoever is
     watching, and the answer it works out that way is a guess it acts on for three more turns. */
  const { api, sql } = await record();

  const me = value<{ kind: string; level: string; scope: string | null; may: string[]; registers: string[] | null }>(
    await api.whoami(owner),
  );
  assert.equal(me.kind, 'person');
  assert.equal(me.level, 'owner');
  assert.equal(me.scope, null);
  assert.deepEqual(me.may, ['read', 'propose', 'append', 'write', 'decide', 'owner']);
  assert.equal(me.registers, null, 'all of them and none of them must not be one value');

  /* THE INTERSECTION, not the token's scope. A write token held by somebody with read access reads,
     and reporting the scope alone would be reporting the half that is not binding. */
  const held = value<{ scope: string | null; person: string | null; may: string[] }>(await api.whoami(token('write', 'read')));
  assert.equal(held.scope, 'write');
  assert.equal(held.person, 'p_1');
  assert.deepEqual(held.may, ['read']);

  const scoped = value<{ registers: string[] | null }>(await api.whoami({ ...owner, registers: ['obligations'] }));
  assert.deepEqual(scoped.registers, ['obligations']);
  sql.close();
});

test('A NOTE IS A `note`, AND IT DOES NOT MOVE THE ROW', async () => {
  /* IT WENT THROUGH `update` WITH AN EMPTY PATCH, so a log entry was a WRITE: it bumped the row's
     version, and anybody holding the version they read then got a spurious `VERSION_STALE` on their
     next real change — for a call that changed no field. 30 §2 gives it its own kind: `note`, "the
     one row a person or an agent writes on purpose". */
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));
  const before = api.kernel.version();

  assert.ok((await api.log({ register: 'obligations', seq: 1, note: 'Chased by phone.' }, owner)).ok);
  assert.equal(
    sql.one<{ note: string; actor: string }>("SELECT note, actor FROM event WHERE kind = 'note' ORDER BY rowid DESC LIMIT 1")?.note,
    'Chased by phone.',
  );
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'edit'").length, 0, 'a note was written as an edit');
  assert.equal(api.kernel.get('obligations#1')?.fields.state, 'open', 'a note changed a field');
  assert.ok(api.kernel.version() > before, 'the ledger did not move at all, so nothing can see the note');

  /* AND IT IS `append`, NOT `write`. 20 §1 puts `log` in the append half beside `create` and
     `propose`. BUT A NOTE IS ABOUT A ROW, AND A ROW IS WRITTEN ONLY WHERE IT IS READ: an appender
     who reads nothing is answered as for a row that is not there, so a note cannot test which numbers exist. With read
     on the list beside it, she notes. */
  assert.deepEqual(
    await api.log({ register: 'obligations', seq: 1, note: 'From an appender.' }, person('append')),
    await api.log({ register: 'obligations', seq: 999, note: 'From an appender.' }, person('append')).then((r) => JSON.parse(JSON.stringify(r).replace('#999', '#1'))),
  );
  assert.ok((await api.log({ register: 'obligations', seq: 1, note: 'From an appender.' }, { ...person('append'), levels: { obligations: 'write' } })).ok);
  assert.equal((await api.log({ register: 'obligations', seq: 1, note: 'x' }, person('read'))).ok, false);
  assert.equal((await api.log({ register: 'obligations', seq: 1, note: '  ' }, owner)).ok, false);
  assert.equal((await api.log({ register: 'obligations', seq: 1, note: 'x'.repeat(281) }, owner)).ok, false);
  sql.close();
});

test('A READ MARK BELONGS TO A PERSON, and is never an event', async () => {
  /* An agent polling a record has no attention to mark, and letting a token move it would mean a
     person coming back to a record their own agent had marked as read. */
  const { api, sql, clock } = await record();
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  /* TWO EVENTS AT LEAST, AND AT TWO DIFFERENT TIMES.
     The first draft of this made two writes under `fixedClock`, so every event carried the same
     `ts` — and "a smaller `upTo` does not move the mark back" was asserted over a ladder with no
     rungs. Dropping the `MAX()` guard altogether left it green. A mark measured in time needs the
     clock to have moved, or the test is about a list of one value. */
  assert.ok((await api.create({ register: 'obligations', fields: { what: 'One' } }, owner)).ok);
  clock.advance(60_000);
  assert.ok((await api.create({ register: 'obligations', fields: { what: 'Two' } }, owner)).ok);
  const before = sql.all('SELECT 1 FROM event').length;

  const out = value<{ seen_at: string | null; upTo: number }>(await api.markRead(undefined, owner));
  assert.ok(out.seen_at, 'nothing was marked');
  /* THE RECORD'S CLOCK, AND IT IS AN EVENT'S. The mark is guarded by `MAX()`, so a value stamped
     from a wall clock ahead of the record's would be a mark no later read could ever move. `45
     §5.2` avoids that entirely by naming an event and taking that event's own `ts`; this used
     `clock.now()` and carried a comment about the hazard it had made for itself. */
  const newest = sql.one<{ ts: string; rowid: number }>('SELECT rowid, ts FROM event ORDER BY rowid DESC LIMIT 1');
  assert.ok(newest, 'the record has no events, so the mark below is measured against nothing');
  assert.equal(out.upTo, newest.rowid, 'no argument means everything, which is what the button says');
  assert.equal(out.seen_at, newest.ts, "the mark is the event's own time, not the clock's");
  assert.equal(sql.all('SELECT 1 FROM event').length, before, 'a read became a write to the record');

  /* `45 §5`'S OWN REGRESSION CASE, which could not be written against a method with no `upTo`:
     *"`upTo: 40` then `upTo: 30` → `seen_at` stays at event 40's `ts`."* A phone that was asleep
     for a week and wakes up reporting where it had got to must not move the mark backwards. */
  const older = sql.one<{ ts: string; rowid: number }>('SELECT rowid, ts FROM event ORDER BY rowid ASC LIMIT 1');
  assert.ok(older && older.rowid !== newest.rowid, 'one event only, so there is no ladder to walk back down');
  const back = value<{ seen_at: string | null }>(await api.markRead({ upTo: older.rowid }, owner));
  assert.equal(back.seen_at, newest.ts, 'a smaller upTo moved the mark back');

  /* AND AN `upTo` THAT NAMES NOTHING LEAVES IT ALONE. SQLite's scalar `max()` returns NULL if any
     argument is NULL, so `45 §5.2`'s literal SQL sets `seen_at` to NULL for an event that is not
     there — a replayed call after a restore, a client one migration behind — and **erases the
     mark**, which is the failure the `MAX()` is written to prevent, arriving through the guard. */
  const gone = value<{ seen_at: string | null }>(await api.markRead({ upTo: 999_999 }, owner));
  assert.equal(gone.seen_at, newest.ts, 'an unknown event erased the mark');

  const tried = await api.markRead(undefined, token('write'));
  assert.equal(tried.ok, false);
  // `FORBIDDEN`, with the reason in the sentence — a read mark belongs to a person and a token is
  // not one, which is `30 §6`'s "outside its scope, level or ceiling" said about the principal.
  assert.equal((tried as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
  assert.match((tried as { refusal: { fix: string } }).refusal.fix, /belongs to a person/);
  sql.close();
});

test('and what the digest would say is asked for without sending it', async () => {
  const { api, sql } = await record();
  assert.deepEqual(value<unknown[]>(await api.digestToday({}, token('read'))), [], 'a record with no digest declared says nothing');
  sql.close();
});

test('AND A DIGEST IS HELD TO THE CALLER’S CEILING, like the list it is made of', async () => {
  /* `boot` hides a register a caller cannot reach and `list` refuses it — and then a digest section
     over that register handed the rows across. */
  const { api, sql } = await record();
  assert.ok(
    (
      await api.kernel.install([
        {
          id: 'digest.monday',
          kind: 'digest',
          body: {
            digest: 'monday',
            name: 'Monday',
            schedule: { at: '08:00' },
            channels: ['in-app'],
            sections: [
              { heading: 'Obligations', source: 'register.obligations' },
              { heading: 'Notes', source: 'register.notes' },
            ],
          } as never,
        },
      ])
    ).ok,
  );
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'the keychain combination' } }, owner));

  const all = value<{ sections: { heading: string }[] }[]>(await api.digestToday({}, owner));
  assert.deepEqual(all[0]?.sections.map((s) => s.heading), ['Obligations', 'Notes']);

  const held = value<{ sections: { heading: string }[]; carrying: number }[]>(
    await api.digestToday({}, { ...owner, registers: ['obligations'] }),
  );
  assert.deepEqual(held[0]?.sections.map((s) => s.heading), ['Obligations'], 'a section handed over a register the caller cannot list');
  assert.equal(held[0]?.carrying, 1);
  sql.close();
});

/* ── one declaration, and the whole record as a file ────────────── */

test('A DECLARATION SET FROM THE APP GETS THE LINT A PACK GETS', async () => {
  /* A rule edited in a text box and a rule installed from a file are the same declaration. Letting
     the in-app path skip the checks means the two disagree about what is legal, with the app being
     the one that lets a broken rule through. */
  const { api, sql } = await record();

  const good = await api.setDeclaration(
    { body: { rule: 'chase', register: 'obligations', when: 'state is open', once_per: ['entry'], then: [{ notify: { say: 'x' } }] } },
    owner,
  );
  assert.ok(good.ok, good.ok ? '' : (good as { refusal: { fix: string } }).refusal.fix);

  // The same refusals a pack would earn, by the same code.
  const unreadable = await api.setDeclaration({ body: { rule: 'broken', register: 'obligations', when: 'colour is red', then: [] } }, owner);
  assert.equal(unreadable.ok, false);
  const secret = await api.setDeclaration({ body: { ingest: 'hsbc', channel: 'pull', auth: { token: 'sk-live-41' } } }, owner);
  assert.equal((secret as { refusal: { code: string } }).refusal.code, 'SECRET_IN_PACK');
  const nameless = await api.setDeclaration({ body: { name: 'x' } }, owner);
  assert.equal((nameless as { refusal: { code: string } }).refusal.code, 'PACK_MALFORMED');

  // It belongs to no pack, so no uninstall can take it.
  assert.equal(api.kernel.declarations().find((d) => d.id === 'rule.chase')?.pack_id, null);

  // And no token sets one, whatever its scope.
  assert.equal((await api.setDeclaration({ body: {} }, token('write'))).ok, false);
  sql.close();
});

test('TAKE YOUR RECORD AND GO, and it comes back in', async () => {
  /* A `.brain` file IS the record. A product whose export is a dump nobody can re-import has an
     export button and not an exit. */
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', amount: { amount: 41_00, currency: 'GBP' }, state: 'open' } }, owner));
  value(await api.log({ register: 'obligations', seq: 1, note: 'Chased by phone.' }, owner));

  const lines = value<string[]>(await api.export({}, owner));
  assert.ok(lines.length > 0);

  /* EMPTY MEANS EMPTY, declarations included: the file carries the shape as well as the rows, and
     a record that already had a shape would be two shapes merged by primary key. */
  const blank = openSqlite();
  const fresh = { api: await createRecordApi({ sql: blank, clock: fixedClock(NOW), sign: SIGNER }), sql: blank };
  const back = await fresh.api.import({ lines }, owner);
  assert.ok(back.ok, back.ok ? '' : (back as { refusal: { code: string; fix: string } }).refusal.fix);

  assert.equal(fresh.api.kernel.get('obligations#1')?.fields.what, 'Invoice 41');
  assert.deepEqual(fresh.api.kernel.get('obligations#1')?.fields.amount, { amount: 41_00, currency: 'GBP' });

  // And out again identically, which is the property that makes the file worth keeping.
  const again = value<string[]>(await fresh.api.export({}, owner));
  assert.deepEqual(again.filter((l) => !l.startsWith('dog_sig')), lines.filter((l) => !l.startsWith('dog_sig')));

  // An import into a record that already holds rows is a merge nobody asked for.
  assert.equal((await api.import({ lines }, owner)).ok, false);
  assert.equal((await api.import({}, owner)).ok, false);

  // And no token takes the record off the machine.
  assert.equal((await api.export({}, token('write'))).ok, false);
  sql.close();
  fresh.sql.close();
});

/* ── agent tokens ───────────────────────────────────────── */

test('THE SECRET EXISTS ONCE, IN THE ANSWER, and is stored nowhere', async () => {
  /* What the record keeps is `sha256(secret)`, so a copy of the database is a copy of hashes and not
     a set of working keys. A product that can show you a token you made last month is a product
     whose database is a keyring. */
  const { api, sql } = await record();
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );

  const made = value<{ id: string; bearer: string; expires_at: string }>(
    await api.createToken({ scope: 'propose', label: 'the drafting agent' }, owner),
  );
  assert.match(made.bearer, /^rec_01JZ8QK3F7R2M9V4XN6TCB5HAD\./);
  assert.ok(made.bearer.length > 40);

  // The row holds a hash and the listing shows neither it nor the secret.
  const rows = sql.all<{ hash: string }>('SELECT hash FROM token');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.hash.length, 64);
  assert.equal(made.bearer.includes(rows[0]!.hash), false);

  const listed = value<Record<string, unknown>[]>(await api.listTokens(owner));
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.scope, 'propose');
  assert.equal(listed[0]?.label, 'the drafting agent');
  assert.equal('hash' in listed[0]!, false, 'the listing carries the hash');

  // And ninety days by default, said rather than assumed.
  assert.equal(Date.parse(made.expires_at) - NOW, 90 * 86_400_000);
  sql.close();
});

test('AND A BEARER IS THE ONLY WAY ONE IS RECOGNISED', async () => {
  const { api, sql } = await record();
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const made = value<{ id: string; bearer: string }>(await api.createToken({ scope: 'write' }, owner));

  const seen = value<{ id: string; person_id: string; scope: string }>(await api.kernel.verifyToken(made.bearer, 'mcp'));
  assert.equal(seen.id, made.id);
  assert.equal(seen.person_id, 'p_1');
  assert.equal(seen.scope, 'write');
  assert.equal(sql.one<{ last_surface: string }>('SELECT last_surface FROM token')?.last_surface, 'mcp');

  /* THE SAME ANSWER EITHER WAY. A different sentence for "a token, but not for this record" would
     tell whoever is guessing which half they got right. */
  for (const bad of ['nonsense', 'rec_other.abc', `${made.bearer}x`, 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.', ''])
    assert.equal((await api.kernel.verifyToken(bad)).ok, false, `${bad} verified`);

  // Revoked is gone, and revoking twice says the same as revoking once.
  value(await api.revokeToken({ id: made.id }, owner));
  assert.equal((await api.kernel.verifyToken(made.bearer)).ok, false, 'a revoked token still works');
  assert.ok((await api.revokeToken({ id: made.id }, owner)).ok);
  assert.equal((await api.revokeToken({ id: 'nothing' }, owner)).ok, false);
  sql.close();
});

test('and there is no `admin` scope to ask for, nor a token that mints one', async () => {
  const { api, sql } = await record();
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  assert.equal((await api.createToken({ scope: 'admin' as never }, owner)).ok, false);
  assert.equal((await api.createToken({ scope: 'write', days: 400 }, owner)).ok, false);
  assert.equal((await api.createToken({ scope: 'write', days: 0 }, owner)).ok, false);

  // And no token mints a token, which is how one would otherwise outlive its own revocation.
  assert.equal((await api.createToken({ scope: 'read' }, token('write'))).ok, false);
  assert.equal((await api.listTokens(token('read'))).ok, false);
  sql.close();
});

/* ── who is on the record ────────────────────────────────── */

const studio = async () => {
  const made = await record();
  assert.ok(
    made.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com' } }).ok,
  );
  return made;
};

test('A LEVEL PER REGISTER, or inviting a bookkeeper means showing them everything', async () => {
  /* And what people do then is not invite the bookkeeper. */
  const { api, sql } = await studio();

  const bo = value<{ person_id: string; level: string; email: string | null; scoped: { register: string; level: string }[] }>(
    await api.invite({ person: 'p_2', email: 'bo@example.com', name: 'Bo', level: 'read', registers: { obligations: 'write' } }, owner),
  );
  assert.equal(bo.level, 'read');
  assert.deepEqual(bo.scoped, [{ register: 'obligations', level: 'write' }]);
  assert.equal(bo.email, 'bo@example.com');

  const all = value<{ person_id: string }[]>(await api.members(owner));
  assert.deepEqual(all.map((m) => m.person_id).sort(), ['p_1', 'p_2']);

  /* ONE EVENT PER REGISTER, because `access.grant` is how anybody later answers "when did they get
     to see this", and one event naming a list is a string somebody has to parse. */
  const grants = sql
    .all<{ field: string; to_v: string }>("SELECT field, to_v FROM event WHERE kind = 'access.grant' ORDER BY rowid")
    .map((e) => `${e.field}:${e.to_v}`);
  /* AND THE FOUNDING OWNER IS ONE OF THEM, first. The record's own creation grants `*:owner`, and it
     was the only grant in the product with no event behind it — so the audit could say when everybody
     got their access except the person who has held theirs longest. */
  assert.deepEqual(grants, ['*:owner', '*:read', 'obligations:write']);
  sql.close();
});

test('AND AN INVITATION IS THE WHOLE OF WHAT SOMEBODY HOLDS, not a patch', async () => {
  const { api, sql } = await studio();
  value(await api.invite({ person: 'p_2', level: 'read', registers: { obligations: 'write', notes: 'read' } }, owner));

  const again = value<{ scoped: { register: string }[] }>(await api.invite({ person: 'p_2', level: 'read', registers: { obligations: 'write' } }, owner));
  assert.deepEqual(again.scoped.map((r) => r.register), ['obligations'], 'a register left out was left standing');
  assert.equal(
    sql.one<{ field: string }>("SELECT field FROM event WHERE kind = 'access.revoke'")?.field,
    'notes',
    'a register taken away was taken away quietly',
  );
  sql.close();
});

test('and a record keeps one owner, whichever way you try to leave it without one', async () => {
  const { api, sql } = await studio();

  assert.equal((await api.invite({ person: 'p_1', level: 'write' }, owner)).ok, false, 'the last owner was demoted');
  assert.equal((await api.removeMember({ person: 'p_1' }, owner)).ok, false, 'the last owner was removed');

  value(await api.invite({ person: 'p_2', level: 'owner' }, owner));
  value(await api.removeMember({ person: 'p_1' }, owner));
  assert.deepEqual(value<{ person_id: string }[]>(await api.members(owner)).map((m) => m.person_id), ['p_2']);

  /* THE PERSON ROW STAYS. Every event they ever wrote names them, and a history whose actors cannot
     be resolved reads as a list of identifiers. */
  assert.equal(sql.all("SELECT 1 FROM person WHERE id = 'p_1'").length, 1);

  // Removing somebody who is not there is the state they asked for.
  assert.ok((await api.removeMember({ person: 'p_9' }, owner)).ok);
  sql.close();
});

test('and no token invites anybody, and a register nobody has is refused', async () => {
  const { api, sql } = await studio();
  assert.equal((await api.invite({ person: 'p_2', level: 'read' }, token('write'))).ok, false);
  assert.equal((await api.invite({ person: 'p_2', level: 'admin' as never }, owner)).ok, false);
  assert.equal((await api.invite({ person: 'p_2', level: 'read', registers: { ghosts: 'read' } }, owner)).ok, false);
  assert.equal(sql.all("SELECT 1 FROM member WHERE person_id = 'p_2'").length, 0, 'a refused invitation left a row');

  /* AND NO TOKEN LISTS THE COLLEAGUES EITHER. This asserted the opposite, on the argument that a
     colleague list is not a secret — but the list carries every member's EMAIL ADDRESS, which is
     not the same fact as who is on the record, and `ROUTES` has called this method ADMIN all along
     (45 §5.6: an owner, in a browser, and no token of any kind). */
  assert.equal(refusal(await api.members(token('read'))).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

/* ── what a host asks before it lets anybody in ────────────────── */

test('THE RECORD SAYS WHAT SOMEBODY MAY DO INSIDE IT, and removing them stops them', async () => {
  /* The level used to come from the Directory, which `invite` and `remove` never write — so removal
     did not revoke and a bookkeeper given `read` on the payroll register wrote to it. */
  const { api, sql } = await studio();
  /* NO LEVEL ON THE RECORD, which is how somebody is invited to ONE register and nothing else. */
  value(await api.invite({ person: 'p_2', registers: { obligations: 'read' } }, owner));

  const bo = api.kernel.access('p_2')!;
  assert.equal(bo.level, null, 'a register-scoped invitation gave a record-wide level');
  assert.deepEqual(bo.registers, ['obligations'], 'the ceiling was not armed, so one register meant every one');
  assert.deepEqual(bo.levels, { obligations: 'read' });

  // The whole record, for somebody who holds it.
  assert.deepEqual(api.kernel.access('p_1'), { level: 'owner', registers: null, levels: {} });

  // And nothing at all for somebody who is not on it, before AND after they are taken off.
  assert.equal(api.kernel.access('p_9'), null);
  value(await api.removeMember({ person: 'p_2' }, owner));
  assert.equal(api.kernel.access('p_2'), null, 'removal did not revoke');
  sql.close();
});

test('and somebody with only a named register holds nothing on the record itself', async () => {
  // "No access to the record" and "read on the record" are different, and a listing that showed
  // them the same would have somebody revoke the wrong one.
  const { api, sql } = await studio();
  /* THE PERSON ROW TOO. `access()` used to return `member` rows for a person who is not in the
     record, which made a stray membership a level — see `members.test.ts`'s *"A `member` ROW WITH NO
     PERSON IS NOT A LEVEL"*. This fixture was written against that fail-open and is a scoped member
     now rather than a ghost. */
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_3', 'three@example.test', 'Three')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_3', 'obligations', 'write')");

  const listed = value<{ person_id: string; level: string | null }[]>(await api.members(owner));
  assert.equal(listed.find((m) => m.person_id === 'p_3')?.level, null);
  /* `null` ON THE RECORD. This used to promote the highest SCOPED level to the record-wide one —
     the wrong direction and the expensive one, because `keychain()` and `admin()` read
     `principal.level` and neither consults the ceiling: owner of one register was owner of the
     record. `read` was a second wrong answer in the other direction, because `append` is the one
     rung whose point is that it does not read, and every method that names no register asks for
     `read` with nothing to scope it. The per-register level still travels, which is where a scoped
     grant does its work. */
  assert.deepEqual(api.kernel.access('p_3'), { level: null, registers: ['obligations'], levels: { obligations: 'write' } });
  sql.close();
});

test('AND OWNER OF ONE REGISTER IS NOT OWNER OF THE RECORD', async () => {
  /* The keychain holds what every credential in the business opens. `invite({ registers: { payroll:
     'owner' } })` is a legitimate thing to write, and it used to hand over the credential index,
     the export, `invite`, `createToken` and `setDeclaration` with it. */
  const { api, sql } = await studio();
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_9', 'nine@example.test', 'Nine')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_9', 'obligations', 'owner')");
  const held = api.kernel.access('p_9');
  assert.equal(held?.level, null, 'owner of one register was owner of the record');
  assert.equal(held?.levels.obligations, 'owner', 'and the scoped level has to survive, or the feature is decorative');
  sql.close();
});

test('AND AN EXPORT OF NOTHING IS NOT AN EXPORT', async () => {
  /* `sections: "data"` — the easy JSON mistake — and `sections: []` both came back `ok` with a
     structurally valid `.brain` file containing every table header and no rows: a backup of nothing
     that looks like a backup. */
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));

  for (const sections of ['data', [], ['DATA'], [123], ['local'], {}])
    assert.equal((await api.export({ sections } as never, owner)).ok, false, `${JSON.stringify(sections)} was allowed`);

  const good = value<string[]>(await api.export({ sections: ['header', 'data'] }, owner));
  assert.ok(good.some((l) => l.includes('Invoice 41')));

  // And a line that is not a line is a refusal rather than a throw.
  assert.equal((await api.import({ lines: [null] } as never, owner)).ok, false);
  assert.equal((await api.import({ lines: [1] } as never, owner)).ok, false);
  sql.close();
});

/* ── what leaves, and who may take it ──────────────────────────────────── */

test('AN EXPORT DOES NOT CARRY THE SEALED BYTES, and ADMIN is not the keychain', async () => {
  /* `openGrant` is unrouted on the grounds that routing it would make a credential reachable by
     anything holding a token — and `export` is routed and carried the same `ciphertext` for every
     grant in the record, plus the wrapped record key and its salt. Wrapped by a KEK that is bytes
     held elsewhere, that is a copy of the safe; wrapped by a passphrase, it is an offline cracking
     package with the salt attached. */
  const { api, sql } = await record();
  sql.exec(
    `INSERT INTO grant (id, label, kind, opens, ciphertext, nonce, kdf, wrapped_by, kek_id, created_at)
     VALUES ('g1', 'Bank', 'password', 'the bank', ?, ?, 'hkdf', 'kek', 'k1', ?)`,
    new Uint8Array([7, 8, 0, 255]),
    new Uint8Array([1, 2, 3]),
    new Date().toISOString(),
  );

  const out = value<string[]>(await api.export({}, owner));
  const file = out.join('\n');
  assert.ok(file.includes('Bank'), 'the label has to travel, or a redacted export is not an export');
  assert.ok(file.includes('the bank'), 'and what the key opens, which is the whole index');
  assert.ok(!file.includes('BwgA'), 'the sealed bytes left in an ADMIN export');
});

test('and the full file needs the wrapping key named, which ADMIN does not clear', async () => {
  /* An earlier version gated this on `keychain(ctx)`, which is the SAME PREDICATE as `admin(ctx)` —
     both refuse a token and then ask for owner — so it was not a second bar at all: every caller who
     reached the check had already passed it, and the flag was the whole of the permission. This test
     asserted a token was refused, which `admin` does one line earlier, so it passed with the entire
     fix reverted. It uses an OWNER now, which is the caller the hole was about. */
  const { api, sql } = await record();
  sql.exec(
    "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES ('record', ?, ?, 'kek', 'kek_2f')",
    new Uint8Array([9]),
    new Uint8Array([1]),
  );

  const bare = await api.export({ redactGrants: false }, owner);
  assert.equal((bare as { refusal?: { code: string } }).refusal?.code, 'WRONG_KEY');
  assert.equal((await api.export({ redactGrants: false, kek_id: 'kek_ff' }, owner) as { refusal?: { code: string } }).refusal?.code, 'WRONG_KEY');

  // And with the key named, the bytes travel.
  const full = value<string[]>(await api.export({ redactGrants: false, kek_id: 'kek_2f' }, owner));
  assert.ok(full.some((l) => l.includes('vault_key')), 'the wrapped key did not travel to a caller who named it');
  sql.close();
});

test('A REDACTED EXPORT IMPORTS, which is what makes it an export', async () => {
  /* Blanking `vault_key.wrapped` produced a file that could not be read back — the column is
     `NOT NULL`, so every keychain-provisioned record made a default export no record could restore.
     That is a worse failure than the one it was fixing. */
  const { api, sql } = await record();
  sql.exec(
    "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES ('record', ?, ?, 'kek', 'kek_2f')",
    new Uint8Array([9]),
    new Uint8Array([1]),
  );

  const lines = value<string[]>(await api.export({}, owner));

  // An EMPTY record, which is the only thing an import opens into.
  const into = openSqlite();
  const fresh = await createRecordApi({ sql: into, clock: fixedClock(NOW), sign: SIGNER });
  const back = await fresh.import({ lines }, owner);
  assert.ok((back as { ok: boolean }).ok, `a redacted export would not import: ${JSON.stringify(back).slice(0, 220)}`);
  assert.equal(into.all('SELECT 1 FROM vault_key').length, 0, 'the wrapped key travelled in a redacted file');
  into.close();
  sql.close();
});

test('AND AN EXPORT IS AN EVENT, because it is the read that gets the most out', async () => {
  /* `openGrant` writes `grant.read` for ONE credential; `export` copies every one of them and wrote
     nothing at all. 12 §6's first rule is that a keychain whose reads are not audited cannot answer
     "did anything get out". */
  const { api, sql } = await record();
  value(await api.export({}, owner));
  const said = sql.one<{ actor: string; note: string }>("SELECT actor, note FROM event WHERE kind = 'export'");
  assert.ok(said, 'the whole record was copied and the log says nothing');
  assert.match(said.note, /grants redacted/);
  sql.close();
});

test('A METHOD THAT NAMES NO REGISTER IS ABOUT THE RECORD, and a scoped member holds none of it', async () => {
  /* `access` promoted a scoped level to a record-wide one, then to `read` — and `boot`, `search`,
     `page`, `metric` and `governance` all ask for `read` with nothing to scope them. So a
     contractor invited to file expenses could list every register in the record and search across
     them, which is the whole of what `append` means not to allow. */
  const { api, sql } = await studio();
  value(await api.invite({ person: 'p_5', registers: { obligations: 'append' } }, owner));

  const held = api.kernel.access('p_5')!;
  assert.equal(held.level, null, 'a register-scoped invitation gave a record-wide level');
  const them: CallContext = {
    principal: { kind: 'person', id: 'p_5', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
  };

  /* THE METHODS THAT ARE ABOUT THE RECORD REFUSE. Somebody who holds only named registers holds
     none of the record, and these two are about the record, and about the other people in it, rather
     than about rows. `whoami` refuses as `boot` does (final polish, 2 Nov), so a device asks one and hears what the other would say. */
  for (const [name, call, code] of [
    ['members', () => api.members(them), 'FORBIDDEN'],
    ['whoami', () => api.whoami(them), 'LEVEL_REQUIRED'],
  ] as const) {
    const out = await call();
    assert.equal((out as { refusal?: { code: string } }).refusal?.code, code, name);
  }

  /* AND THE ONES THAT ARE ABOUT ROWS ANSWER, filtered. Refusing these outright made every ceiling
     filter in them dead code — which is how a ceiling stops being enforced by being enforced twice —
     and made a scoped member unable to see even their own registers' figures. */
  assert.equal(refusal(await api.boot(them)).code, 'LEVEL_REQUIRED', 'append reads, and it must not');
  assert.equal(refusal(await api.markRead(undefined, them)).code, 'LEVEL_REQUIRED', 'somebody who may only file has read nothing to mark');

  /* AND A SCOPED READER SEES THEIR OWN REGISTERS AND NOT THE OTHERS. Refusing this outright made
     every ceiling filter in these methods dead code — which is how a ceiling stops being enforced by
     being enforced twice — and made a scoped member unable to see even their own registers. */
  value(await api.invite({ person: 'p_11', registers: { obligations: 'read' } }, owner));
  const reader = api.kernel.access('p_11')!;
  const they: CallContext = {
    principal: { kind: 'person', id: 'p_11', level: reader.level },
    ...(reader.registers === null ? {} : { registers: reader.registers }),
    levels: reader.levels,
  };
  const seen = value<{ registers: { id: string }[] }>(await api.boot(they));
  assert.deepEqual(seen.registers.map((r) => r.id), ['obligations'], 'a scoped reader saw the wrong set of registers');

  /* AND A SCOPED READER MAY MARK WHAT THEY HAVE READ. `whatsNew` answers them, so refusing this left
     their first screen showing the same "since you were away" lines for ever, with a button under
     them that refused every press. The row comes first because a mark only reaches an event they can
     see: before it, the newest event was the owner's grant line, and answering its time was the leak. */
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const own = value<{ seen_at: string | null }>(await api.markRead(undefined, they));
  assert.ok(own.seen_at, 'a scoped reader could not say they had read');

  // And the register they WERE invited to is still theirs to write into.
  assert.equal(refusal(await api.list({ register: 'obligations' }, them)).code, 'LEVEL_REQUIRED', 'append does not read');
  assert.ok((await api.create({ register: 'obligations', fields: { what: 'Filed' } }, them)).ok, 'append could not append');
  sql.close();
});

/**
 * Two registers with a `search:` field on them, because `search` matches a row's PROJECTION and the
 * fixtures at the top of this file declare no searchable field at all. A register nothing may read
 * is invisible to the query without one, so the same test written over those fixtures would pass
 * whether or not the reader filters by level, which is the shape of test that is worse than none.
 */
const SEARCHABLE = [
  {
    id: 'register.ledger',
    kind: 'register' as const,
    body: { id: 'ledger', name: 'Ledger', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never,
  },
  {
    id: 'register.journal',
    kind: 'register' as const,
    body: { id: 'journal', name: 'Journal', title: 'body', fields: [{ id: 'body', type: 'text', required: true, search: true }] } as never,
  },
];

test('AN `append` GRANT READS NOTHING, and every reader that named no register let it read', async () => {
  /* `reaches` consults the CEILING and `ctx.levels` carries the LEVEL, and every register-less
     reader filtered with the first one. So a register somebody may only file rows into came back in
     `boot` with its name and its row count, in `search` with a row's title out of it, in `pages` as
     a title that is a sentence about what the record holds, on the page itself as a drawn block,
     and as a figure. `list` refused that same register in the same breath, and a pair of answers
     that disagree is what says which of them is wrong. `append` is the one level whose entire point
     is that it does not read. */
  const { api, sql } = await studio();
  assert.ok(
    (
      await api.kernel.install([
        ...SEARCHABLE,
        {
          id: 'page.jotted',
          kind: 'page',
          body: { page: 'jotted', title: 'Jotted', blocks: [{ kind: 'table', source: 'register.journal' }] } as never,
        },
        {
          id: 'metric.jotted',
          kind: 'metric',
          body: {
            metric: 'jotted',
            name: 'Jotted',
            source: 'register.journal',
            value: { count: 'body' },
            format: 'int',
            target: { lte: 99 },
            window: '30d',
          } as never,
        },
        {
          id: 'digest.monday',
          kind: 'digest',
          body: {
            digest: 'monday',
            name: 'Monday',
            schedule: { at: '08:00' },
            channels: ['in-app'],
            sections: [{ heading: 'Journal', source: 'register.journal' }],
          } as never,
        },
      ])
    ).ok,
  );
  value(await api.create({ register: 'ledger', fields: { what: 'payroll invoice' } }, owner));
  value(await api.create({ register: 'journal', fields: { body: 'payroll salary secret' } }, owner));

  value(await api.invite({ person: 'p_12', registers: { ledger: 'write', journal: 'append' } }, owner));
  const held = api.kernel.access('p_12')!;
  const them: CallContext = {
    principal: { kind: 'person', id: 'p_12', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
  };

  /* THE ANSWER `list` GIVES IS THE ONE EVERY READER BELOW HAS TO AGREE WITH, and the appending half
     still appends, or this is a test of a grant that does nothing. */
  assert.equal(refusal(await api.list({ register: 'journal' }, them)).code, 'LEVEL_REQUIRED');
  assert.ok((await api.create({ register: 'journal', fields: { body: 'Filed' } }, them)).ok, 'append could not append');

  const seen = value<{ registers: { id: string; count: number }[] }>(await api.boot(them));
  assert.deepEqual(seen.registers.map((r) => r.id), ['ledger'], 'boot named a register the caller may only file into');

  /* AND THE COUNT IS SCOPED THE WAY THE HITS ARE, which is the half worth asserting here: `matched` is
     built inside the same query under the same register ceiling, so a caller who may read one register is
     never told how many rows matched in the ones they may not. A count that leaked would be the same
     disclosure as a title travelling, in a number rather than in words. */
  const found = value<{ hits: { register: string; title: string }[]; matched: Record<string, number> }>(await api.search({ q: 'payroll' }, them));
  assert.deepEqual(found.hits.map((h) => h.register), ['ledger'], 'search answered out of a register `list` refuses');
  assert.equal(found.hits.some((h) => h.title.includes('secret')), false, 'the title of an unreadable row travelled');
  assert.deepEqual(Object.keys(found.matched), ['ledger'], 'the count named a register this caller may not read');

  const listed = value<{ slug: string }[]>(await api.pages(them));
  assert.equal(listed.some((p) => p.slug === 'jotted'), false, 'a page title is a sentence about the register it draws from');

  /* `page` answers as `pages` lists: a page hidden from the list is refused by its slug too, the way a missing one is. */
  assert.equal(refusal(await api.page({ slug: 'jotted' }, them)).code, 'PAGE_UNKNOWN', 'a page over a register they may only file into was served');

  assert.equal(refusal(await api.metric({ metric: 'jotted' }, them)).code, 'METRIC_UNKNOWN');
  assert.deepEqual(
    value<{ sections: unknown[] }[]>(await api.digestToday({}, them))[0]?.sections,
    [],
    'a digest section handed the rows across',
  );

  /* AND THE OWNER STILL SEES ALL OF IT, or this is a filter that hides the record from everybody. */
  assert.deepEqual(
    value<{ hits: { register: string }[] }>(await api.search({ q: 'payroll' }, owner)).hits.map((h) => h.register).sort(),
    ['journal', 'ledger'],
  );
  sql.close();
});

test('AND AN `append` GRANT ON A SECOND REGISTER DOES NOT TAKE AWAY THE READ ON THE FIRST', async () => {
  /* `scoped` took the index-max level across the grants, `append` sorts above `read` in `LEVELS`,
     and `LEVEL_REACH.append` deliberately excludes `read`. So the moment somebody holding `read` on
     one register was also invited to file rows into a second, `boot`, `pages`, `page`, `metric`,
     `search` and the digest all began refusing `LEVEL_REQUIRED` while `list` on the register they
     still held `read` on went on working. The app could not start for a caller whose data it would
     happily serve, and the refusal named the level they had just been given. The question is
     register-blind, so the honest form of it is whether ANY grant reaches the need. */
  const { api, sql } = await studio();
  const ctxFor = (person: string): CallContext => {
    const has = api.kernel.access(person)!;
    return {
      principal: { kind: 'person', id: person, level: has.level },
      ...(has.registers === null ? {} : { registers: has.registers }),
      levels: has.levels,
    };
  };

  value(await api.invite({ person: 'p_13', registers: { obligations: 'read' } }, owner));
  assert.deepEqual(
    value<{ registers: { id: string }[] }>(await api.boot(ctxFor('p_13'))).registers.map((r) => r.id),
    ['obligations'],
    'a reader of one register could not open the record at all',
  );

  /* ONE GRANT ADDED AND NOTHING TAKEN AWAY, which is the whole of the claim. */
  value(await api.invite({ person: 'p_13', registers: { obligations: 'read', notes: 'append' } }, owner));
  const them = ctxFor('p_13');
  assert.deepEqual(
    value<{ registers: { id: string }[] }>(await api.boot(them)).registers.map((r) => r.id),
    ['obligations'],
    'being given the right to file expenses took away the reading they already held',
  );
  value(await api.search({ q: 'payroll' }, them));
  value(await api.pages(them));
  value(await api.digestToday({}, them));
  value(await api.list({ register: 'obligations' }, them));

  // And the second grant is still an append, which is the half that must not widen.
  assert.equal(refusal(await api.list({ register: 'notes' }, them)).code, 'LEVEL_REQUIRED');
  sql.close();
});

test('A COLLEAGUE LIST IS AN OWNER QUESTION, because it carries every colleague\u2019s email', async () => {
  /* `members` was routed ADMIN in `ROUTES` and guarded `guard(ctx, "read")` in the one place
     authorisation happens, so a member invited to READ ONE REGISTER could list every colleague's
     email address. Thirteen of the fourteen ADMIN routes call `admin`; this one called `guard`, and
     `router-groups` was green throughout because that gate compares the route table against `30 §5`
     and never against the code. The `guards` gate compares them now. */
  const { api, sql } = await studio();
  value(await api.invite({ person: 'p_9', email: 'sam@example.com', level: 'read' }, owner));
  const held = api.kernel.access('p_9')!;
  const them: CallContext = {
    principal: { kind: 'person', id: 'p_9', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
  };

  assert.ok(refusal(await api.members(them)).code, 'a record-wide reader listed every member');
  const mine = value<{ email: string | null }[]>(await api.members(owner));
  assert.ok(mine.some((m) => m.email === 'sam@example.com'), 'the owner cannot see what the reader could');

  /* AND NO TOKEN REACHES IT AT ALL, which is the other half of what ADMIN means (45 §5.6): an
     agent's bearer is not a browser session, however much its holder owns. */
  assert.equal(refusal(await api.members(token('write', 'owner'))).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

/* \u2500\u2500 a read does not write a row the reader chose \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

test('A READ COUNTS A REGISTER THIS RECORD HAS, and it counted whatever the caller sent', async () => {
  /* `guard` admits a reader with a record-wide `read` for any name, so `list` observed the string it
     was given before `kernel.list` had ever looked at it: `?register=<anything>` inserted a row
     keyed by the caller's own text and kept it for four hundred days. The signal is "which of MY
     registers has nobody opened" (24 §4.2), and a name that is not one of them is not an answer to
     it. Two facts in one: a read stops being a write the reader controls, and the count stops being
     diluted by names the record does not have. */
  const { api, sql } = await record();
  await api.list({ register: 'atlantis' }, owner);
  assert.equal(
    sql.all("SELECT 1 FROM observation WHERE kind = 'register.read' AND subject = 'atlantis'").length,
    0,
    'a register nobody declared was counted as read',
  );

  value(await api.list({ register: 'obligations' }, owner));
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'register.read' AND subject = 'obligations'").length, 1);
  sql.close();
});

test('and a page is counted when it draws, not when it is asked for', async () => {
  /* Same shape one route over: `page` observed `args.slug` before `kernel.page` had said whether
     there is such a page. "A page nobody opens" is a question about the pages this record declares. */
  const { api, sql } = await record();
  await api.page({ slug: 'atlantis' }, owner);
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'page.render'").length, 0, 'a page nobody declared was counted');
  sql.close();
});

test('A FILTER ON AN UNINDEXED FIELD IS COUNTED AS A SCAN', async () => {
  /* `query.scan` is one of the four detectors the observe loop ships with — the one with the most
     carefully derived threshold, two hundred in thirty days, from the point where an index stops
     being a liability and starts paying for itself — and nothing in the product emitted the signal,
     so it could never fire. */
  const { api, sql } = await record();
  value(await api.list({ register: 'obligations', where: { field: 'what', contains: 'Invoice' } }, owner));

  const seen = sql.one<{ subject: string; n: number }>("SELECT subject, n FROM observation WHERE kind = 'query.scan'");
  assert.equal(seen?.subject, 'obligations.what', 'a filter on an unindexed field went uncounted');

  // And a filter on an INDEXED one is not a scan, which is the half that keeps the count honest.
  value(await api.list({ register: 'obligations', where: { field: 'state', is: 'open' } }, owner));
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'query.scan'").length, 1);
  sql.close();
});

test('and a refused read is not evidence about anything', async () => {
  // The count is after the guard: somebody who may not read this register has not scanned it.
  const { api, sql } = await record();
  await api.list({ register: 'obligations', where: { field: 'what', contains: 'x' } }, token('read', 'read'));
  await api.list({ register: 'obligations', where: { field: 'what', contains: 'x' } }, person('append'));
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'query.scan'").length, 1, 'only the permitted read counted');
  sql.close();
});

test('A SUSPENDED PERSON HOLDS NOTHING, which is what suspending is for', async () => {
  /* The column was a thing the interface could show and the ladder could not enforce: `access` read
     only `member`, `verifyToken` joined nothing, and nothing anywhere ever set it. Suspending
     somebody is what you do when you cannot yet decide whether to remove them, and it has to
     actually stop them while you decide. */
  const { api, sql } = await studio();
  value(await api.invite({ person: 'p_7', level: 'write' }, owner));
  assert.equal(api.kernel.access('p_7')?.level, 'write');

  /* THROUGH THE PRODUCT, not through raw SQL. The column was written as NULL by `invite` and by
     provisioning and by nothing else, so once the ladder learned to read it, it was a check behind a
     switch nobody could flip. */
  value(await api.suspendMember({ person: 'p_7', suspended: true }, owner));
  assert.equal(api.kernel.access('p_7'), null, 'a suspended person still held their access');

  // And it reaches their agents: a token is a capability handed to an agent BY a person.
  assert.equal(api.kernel.access('p_7'), null);

  // Starting them again restores what they held, which is the difference from removing them.
  value(await api.suspendMember({ person: 'p_7', suspended: false }, owner));
  assert.equal(api.kernel.access('p_7')?.level, 'write', 'suspension lost what they held');

  // The last owner cannot be suspended, for the reason they cannot be removed.
  assert.equal(refusal(await api.suspendMember({ person: 'p_1', suspended: true }, owner)).code, 'LEVEL_REQUIRED');
  sql.close();
});

test('AND A METRIC OVER A REGISTER YOU CANNOT SEE DOES NOT EXIST', async () => {
  /* Answering METRIC_UNKNOWN for a name nobody declared and FORBIDDEN for one over a register you
     cannot reach is an enumeration oracle: one probe per guess tells you which figures this business
     keeps. `boot` hides register names on the grounds that a list of names is itself information,
     and this handed the same list back a name at a time. */
  const { api, sql } = await studio();
  value(await api.invite({ person: 'p_8', registers: { notes: 'read' } }, owner));
  const mine = api.kernel.access('p_8')!;
  const scoped: CallContext = {
    principal: { kind: 'person', id: 'p_8', level: mine.level },
    ...(mine.registers === null ? {} : { registers: mine.registers }),
    levels: mine.levels,
  };

  const hidden = await api.metric({ metric: 'overdue' }, scoped);
  const absent = await api.metric({ metric: 'no-such-figure' }, scoped);
  assert.equal((hidden as { refusal?: { code: string } }).refusal?.code, 'METRIC_UNKNOWN');
  assert.equal(
    (hidden as { refusal?: { fix: string } }).refusal?.fix.replace('overdue', 'X'),
    (absent as { refusal?: { fix: string } }).refusal?.fix.replace('no-such-figure', 'X'),
    'the two answers differ, so one probe per guess enumerates the figures',
  );
  sql.close();
});

test('A FIGURE GROUPED BY A REF NAMES THE ROWS IT POINTS AT, so a member who may not open that list is not answered it', async () => {
  /* Each part of a figure grouped by a ref is labelled with the title of the row its key is (`groupNames`), so the
     figure reads the list the ref points at as much as its own. `metric` and `figures` asked of the figure's own lists
     alone, and a member invited to Accounts was answered Held by book with a part labelled 'Secret Venture', the title
     of a book on a list she cannot open. */
  const { api, sql } = await studio();
  value(
    await api.kernel.install([
      { id: 'register.books', kind: 'register', body: { id: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
      {
        id: 'register.accounts',
        kind: 'register',
        body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }, { id: 'book', type: 'ref', to: 'books' }] },
      },
      {
        id: 'metric.held-by-book',
        kind: 'metric',
        body: { metric: 'held-by-book', name: 'Held by book', source: 'register.accounts', value: { sum: 'balance' }, group_by: 'book', format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' },
      },
      {
        id: 'metric.held',
        kind: 'metric',
        body: { metric: 'held', name: 'Held', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' },
      },
    ] as never),
  );
  const book = value<{ id: string }>(await api.create({ register: 'books', fields: { name: 'Secret Venture' } }, owner));
  value(await api.create({ register: 'accounts', fields: { name: 'Current', balance: { amount: 10_000, currency: 'GBP' }, book: book.id } }, owner));
  type Read = { groups?: { label?: string }[] };
  assert.deepEqual(
    value<Read>(await api.metric({ metric: 'held-by-book' }, owner)).groups?.map((g) => g.label),
    ['Secret Venture'],
    'the owner was not answered the part by its book, so the checks below prove nothing',
  );

  value(await api.invite({ person: 'p_9', registers: { accounts: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const scoped: CallContext = {
    principal: { kind: 'person', id: 'p_9', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
  };
  /* THE SAME ACCOUNTS UNGROUPED ARE HERS, so what holds the grouped figure back is the list its parts are named from. */
  value(await api.metric({ metric: 'held' }, scoped));
  const asked = await api.metric({ metric: 'held-by-book' }, scoped);
  assert.equal(refusal(asked).code, 'METRIC_UNKNOWN');
  assert.ok(!JSON.stringify(asked).includes('Secret Venture'), 'the title of a book on a list the member cannot open');
  const listed = value<{ id: string }[]>(await api.figures(scoped)).map((f) => f.id);
  assert.ok(listed.includes('held') && !listed.includes('held-by-book'), `figures listed what metric holds back: ${listed.join(', ')}`);
  sql.close();
});

test('A PROPOSED ROWSET IS HELD TO THE CEILING, in both directions', async () => {
  /* `propose` took no register and `checkBody` only asks whether the named one exists — so a
     `propose` token scoped to one register could put another's rows in the queue an owner reads.
     And `governance` named no register either, so every other scoped member could then read them:
     a `rowset` body carries up to two hundred field-value objects verbatim. */
  const { api, sql } = await studio();
  /* THE SHAPE `access` ACTUALLY RETURNS, not one hand-written to make the test pass. A ceiling and a
     record-wide level never co-occur — a `'*'` row means no ceiling — so a test that invents both
     proves nothing about a caller the product can build. */
  value(await api.invite({ person: 'p_6', registers: { notes: 'write' } }, owner));
  const held = api.kernel.access('p_6')!;
  const scoped: CallContext = {
    principal: { kind: 'person', id: 'p_6', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
  };

  const tried = await api.propose(
    { question: 'Add these?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Payroll' }] } } as never,
    scoped,
  );
  assert.equal((tried as { refusal?: { code: string } }).refusal?.code, 'FORBIDDEN', 'a scoped caller proposed rows for a register it cannot see');

  // And an owner's proposal about that register does not come back to them through the queue.
  value(
    await api.propose(
      { question: 'Add these?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Payroll' }] } } as never,
      owner,
    ),
  );
  assert.equal(value<unknown[]>(await api.governance({ register: 'suggestion' }, owner)).length, 1);
  assert.deepEqual(value<unknown[]>(await api.governance({ register: 'suggestion' }, scoped)), [], 'the rows leaked through the gate');

  /* AND ONE BY ID TOO. The list path was filtered and this was not, and the ids are sequential —
     `SG1`, `SG2` — so one extra query parameter walked the whole queue. */
  assert.equal(value(await api.governance({ register: 'suggestion', id: 'SG1' }, scoped)), null);
  assert.ok(value(await api.governance({ register: 'suggestion', id: 'SG1' }, owner)));
  sql.close();
});

test('A PAGE LIST IS SCOPED, because a title is a sentence about what the record holds', async () => {
  /* `boot` filters its register list on the grounds that a list of names is itself information, and
     `pages()` returned every page a record declares to anybody with `read` on anything. "Payroll,
     monthly" tells a bookkeeper invited to one register that there is a payroll register — the exact
     inference `boot` exists to prevent, one method along. */
  const { api, sql } = await record();
  /* Three pages: one over each register, and one that draws from neither. */
  value(
    await api.kernel.install([
      { id: 'page.money', kind: 'page', body: { page: 'money', title: 'Money', blocks: [{ kind: 'table', source: 'register.obligations' }] } },
      { id: 'page.jotted', kind: 'page', body: { page: 'jotted', title: 'Jotted', blocks: [{ kind: 'table', source: 'register.notes' }] } },
      { id: 'page.about', kind: 'page', body: { page: 'about', title: 'About', blocks: [{ kind: 'note', body: 'Nothing but words.' }] } },
    ] as never),
  );

  const seen = async (ctx: CallContext) =>
    (value(await api.pages(ctx)) as { slug: string; title: string }[]).map((p) => p.slug).sort();

  const all = await seen(owner);
  assert.ok(all.length > 0, 'the record declares no pages, so this test proves nothing');

  /* A caller who reaches nothing but `obligations` sees the pages that draw from it, and no others. */
  const scoped = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['obligations'] } as CallContext;
  const some = await seen(scoped);
  assert.ok(!some.includes('jotted'), 'a caller who cannot reach notes was told there is a page of them');
  assert.ok(some.includes('money'), 'a caller lost the page over the one register they hold');
  assert.ok(some.includes('about'), 'a page bound to no register is prose, and prose is for anybody who may read');

  /* AND THE REGISTER LIST DOES NOT TRAVEL. It is what the filter is for, and shipping it would hand
     back the names the filter exists to withhold. */
  const rows = value(await api.pages(owner)) as Record<string, unknown>[];
  for (const p of rows) assert.deepEqual(Object.keys(p).sort(), ['about', 'slug', 'title'], 'a page carried more than its name and the row it is about');
  /* A PAGE SOMEBODY WROTE IS ABOUT NO ROW, so Settings > Pages lists it as theirs. */
  assert.ok(rows.every((p) => p.about === null), JSON.stringify(rows));
  sql.close();
});

test("A PAGE'S FIGURES GO WHERE ITS ROWS GO, and a caller scoped away from their register gets none", async () => {
  /* `page()` blanks the rows and readings of a block over a register the caller may not read. The kernel now also
     answers a block's `{{path}}` figures in `values`, and a figure is a register's content one number wide, so a block
     scoped away from its register must lose those too. */
  const { api, sql } = await record();
  value(
    await api.kernel.install([
      {
        id: 'metric.open-count',
        kind: 'metric',
        body: { metric: 'open-count', name: 'Open', source: 'register.obligations', where: 'state is open', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' } as never,
      },
      {
        id: 'page.desk',
        kind: 'page',
        body: {
          page: 'desk',
          title: 'Desk',
          requires: ['register.obligations', 'register.notes'],
          blocks: [
            { kind: 'note', heading: 'Open: {{open-count}}', body: 'The first is {{obligations#1.amount}}.' },
            { kind: 'table', source: 'register.notes' },
          ],
        } as never,
      },
    ]),
  );
  value(await api.create({ register: 'obligations', fields: { what: 'Rent', amount: { amount: 120_000, currency: 'GBP' }, state: 'open' } }, owner));

  type Page = { blocks: { values?: Record<string, unknown> }[] };
  const mine = value<Page>(await api.page({ slug: 'desk' }, owner));
  assert.deepEqual(mine.blocks[0]?.values?.['open-count'], 1, 'the owner lost the figure, so the check below proves nothing');

  const scoped: CallContext = { ...token('read'), registers: ['notes'] };
  const theirs = value<Page>(await api.page({ slug: 'desk' }, scoped));
  assert.deepEqual(theirs.blocks[0]?.values ?? {}, {}, 'a figure from a register outside the ceiling');
  assert.ok(!JSON.stringify(theirs).includes('120000'), 'an amount from a register outside the ceiling');
  sql.close();
});

/* ── invitations ─────────────────────────────────────────────────────────── */

/** A created record on a host that says whether it can take invitations. */
const inviting = async (invitations?: () => string | null) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, sign: SIGNER, ...(invitations === undefined ? {} : { invitations }) });
  assert.ok((await api.kernel.install([OBLIGATIONS, NOTES])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com' } }).ok);
  return { api, sql, clock };
};

test('AN INVITATION BY ADDRESS is an owner in a browser: never a token, never a member, never a credential-less caller', async () => {
  const { api } = await inviting(() => null);
  const ask = { email: 'bo@example.com', level: 'read' as const };

  assert.equal(refusal(await api.invite(ask, token('write'))).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.invite(ask, token('read'))).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.invite(ask, person('write'))).code, 'LEVEL_REQUIRED');
  assert.equal(refusal(await api.invite(ask, { ...owner, credentialed: false })).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.invitations(token('write'))).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.revokeInvite({ id: 'i_x' }, token('write'))).code, 'NEEDS_BROWSER_SESSION');
  assert.deepEqual(value(await api.invitations(owner)), [], 'a refused invitation was minted');

  /* AN ADMIN, a person at the decide level in a browser, may invite, and never to the owner's rung. */
  assert.equal(refusal(await api.invite({ email: 'cy@example.com', level: 'owner' }, person('decide'))).code, 'FORBIDDEN');
  assert.deepEqual(value(await api.invitations(owner)), [], 'an Admin minted an owner');
  value(await api.invite(ask, person('decide')));
  assert.equal(value<unknown[]>(await api.invitations(owner)).length, 1, 'an Admin could not invite');
});

test('A HOST WITH NO SIGN-IN MINTS NO LINK, and says why in its own words', async () => {
  const bare = await inviting();
  const out = refusal(await bare.api.invite({ email: 'bo@example.com', level: 'read' }, owner));
  assert.equal(out.code, 'NOT_IN_THIS_BUILD');
  assert.match(out.fix, /sign-in/);

  const worker = await inviting(() => 'Sign-in needs SESSION_SECRET.');
  assert.deepEqual(refusal(await worker.api.invite({ email: 'bo@example.com', level: 'read' }, owner)).fix, 'Sign-in needs SESSION_SECRET.');
  assert.deepEqual(value(await worker.api.invitations(owner)), []);
});

test('BOOT SAYS WHETHER ANYBODY SIGNS IN, from the answer invitations already gives', async () => {
  /* An open self-host answered /account/records 401 on every load, which is what an ended session says,
     and the switcher offered a sign-in on a host with none. */
  assert.equal(value<{ signIn: boolean }>(await (await inviting()).api.boot(owner)).signIn, false, 'a host that never said is one without sign-in');
  assert.equal(value<{ signIn: boolean }>(await (await inviting(() => 'Sign-in needs SESSION_SECRET.')).api.boot(owner)).signIn, false);
  assert.equal(value<{ signIn: boolean }>(await (await inviting(() => null)).api.boot(owner)).signIn, true);
});

test('MINT, LOOK, ACCEPT, AND THE LINK IS SPENT: the whole of an invitation through the record', async () => {
  const { api } = await inviting(() => null);
  const minted = value<{ invitation: { id: string; email: string }; token: string }>(
    await api.invite({ email: 'bo@example.com', level: 'write' }, owner),
  );
  assert.deepEqual(value<{ id: string }[]>(await api.invitations(owner)).map((i) => i.id), [minted.invitation.id]);
  assert.ok(!JSON.stringify(value(await api.invitations(owner))).includes(minted.token.split('.')[1] ?? '?'), 'the listing carries the link');

  assert.deepEqual(value<{ email: string }>(await api.acceptInvite({ token: minted.token })).email, 'bo@example.com');
  value(await api.acceptInvite({ token: minted.token, person: { id: 'p_2', email: 'bo@example.com' } }));
  assert.equal(api.kernel.access('p_2')?.level, 'write');
  assert.equal(refusal(await api.acceptInvite({ token: minted.token, person: { id: 'p_2', email: 'bo@example.com' } })).code, 'UNAUTHORIZED');

  const again = value<{ invitation: { id: string }; token: string }>(await api.invite({ email: 'cy@example.com', level: 'read' }, owner));
  value(await api.revokeInvite({ id: again.invitation.id }, owner));
  assert.equal(refusal(await api.acceptInvite({ token: again.token, person: { id: 'p_3', email: 'cy@example.com' } })).code, 'UNAUTHORIZED');
  assert.equal(api.kernel.access('p_3'), null);
});

test('THE NUMBERS A LIST HOLDS ARE BLANKED like its rows for a caller who may not read it', async () => {
  const { api, sql } = await record();
  const out = await api.kernel.install([
    {
      id: 'register.points',
      kind: 'register' as const,
      body: { id: 'points', name: 'Points', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'value', type: 'decimal' }, { id: 'at', type: 'instant' }] } as never,
    },
    {
      id: 'page.numbers',
      kind: 'page' as const,
      /* AND A TABLE OVER NOTES, so the caller invited to Notes alone opens the page and is answered the lines block held. */
      body: { page: 'numbers', title: 'Numbers', blocks: [{ kind: 'lines', source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }] }, { kind: 'table', source: 'register.notes', columns: [{ field: 'body' }] }] } as never,
    },
  ]);
  assert.ok(out.ok);
  /* A LINE IS TWO READINGS OR MORE, and a measure read once is answered as its latest reading (`measureLines`). */
  for (const [name, amount, at] of [['Revenue', 4000, NOW - 86_400_000], ['Revenue', 4200, NOW], ['Churn', 3, NOW]] as const)
    value(await api.create({ register: 'points', fields: { name, value: amount, at: new Date(at).toISOString() } }, owner));
  type Drawn = { blocks: { measures?: { name: string }[]; latest?: { measure: string }[]; refusals?: unknown[] }[] };
  const [drawn] = value<Drawn>(await api.page({ slug: 'numbers' }, owner)).blocks;
  assert.deepEqual([drawn?.measures?.map((m) => m.name), drawn?.latest?.map((l) => l.measure)], [['Revenue'], ['Churn']]);
  const asked = await api.page({ slug: 'numbers' }, { ...owner, registers: ['notes'] } as CallContext);
  assert.ok(asked.ok, JSON.stringify(asked));
  const [b] = (asked.value as Drawn).blocks;
  assert.deepEqual(b?.measures, [], 'a series over a list the caller cannot read was handed over');
  assert.equal(b?.latest, undefined, 'a reading off a list the caller cannot read was handed over');
  assert.ok((b?.refusals ?? []).length > 0);
  sql.close();
});
