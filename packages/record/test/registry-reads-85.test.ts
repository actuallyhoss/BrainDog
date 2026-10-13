/**
 * The five reads the app, the command line and an agent ask by name: `briefing`, `exceptions`, `about`, `matched` and
 * `stale`. Each is one line in `src/methods/index.ts` and one in `host/src/routes/index.ts`, and this file holds both
 * tables to each other, because a read written and listed in only one of them answers nobody.
 *
 * Through the real record on a kernel in memory, and through the host's own `handlersFor`, which is what answers
 * `NOT_IN_THIS_BUILD` for a routed name the record has not got.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { ROUTES, handlersFor } from '../../host/src/index.ts';
import { EXTRA_ROUTES } from '../../host/src/routes/index.ts';

const DAY = 86_400_000;
/** Tuesday 13 October 2026, noon. The numbers last arrived on the 9th. */
const NOW = Date.UTC(2026, 9, 13, 12);

const READS = ['briefing', 'exceptions', 'about', 'matched', 'stale'] as const;
type Read = (typeof READS)[number];

/** What each is asked with. Only `about` needs to be told anything. */
const ASKED: Record<Read, unknown> = { briefing: {}, exceptions: {}, about: { name: 'Northbank' }, matched: {}, stale: {} };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', search: ['name'], scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never,
};

/** The list is `figures` inside and Numbers to its people. */
const NUMBERS = {
  id: 'register.figures',
  kind: 'register' as const,
  body: { id: 'figures', name: 'Numbers', title: 'label', fields: [{ id: 'label', type: 'text', required: true }, { id: 'value', type: 'int' }] } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text', label: 'Handles' },
      { id: 'keys', type: 'list', of: 'text', label: 'Keys' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** The owner's own key, minted to read and nothing more. */
const readKey: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' }, credentialed: true };
/** A member who reads Projects and nothing else: the numbers and the people are not there for them. */
const projectsOnly: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };
/** A member who reads Numbers and nothing else: the projects are not there for them. */
const numbersOnly: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'read' }, registers: ['figures'] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal | null => (out.ok ? null : (out as { refusal: Refusal }).refusal);

/**
 * A studio twenty days old: two projects, numbers that took one a day for ten days and none on the four days since,
 * Ilse asked about sixteen days ago and never answered, and Teodor met under two addresses and then again under
 * his first, so the record folded his two into one person by itself.
 */
async function studio() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, NUMBERS, PEOPLE] as never));
  const add = (register: string, fields: Record<string, unknown>) => value(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  add('things', { name: 'Northbank', repos: ['git@github.com:mara/northbank.git'] });
  add('things', { name: 'Fanline' });
  /* Sixteen days ago Ilse was met under two addresses, and the record asked whether they are one. Nobody answered. */
  clock.set(NOW - 16 * DAY);
  const meet = async (said: Record<string, unknown>) => value<{ undo?: string; question?: string }>(await api.meet(said as never, owner));
  await meet({ name: 'Ilse Brandt', email: 'ilseb@lanternfish.example', source: 'commit 1 in lanternfish' });
  assert.ok((await meet({ name: 'Ilse Brandt', email: 'ilse.b@pellucid.example', source: 'note from Monday' })).question, 'two addresses were not asked about');
  for (let ago = 13; ago >= 4; ago -= 1) {
    clock.set(NOW - ago * DAY - 2 * 3_600_000);
    add('figures', { label: `Sessions, day ${14 - ago}`, value: 100 + ago });
  }
  clock.set(NOW);
  await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 2 in lanternfish' });
  await meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  const met = await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' });
  assert.ok(met.undo, 'the strong rules did not fold the two');
  const handlers = handlersFor(api as never);
  /** One read, asked as the host asks it: by its routed name, through the handler the table wires to the record. */
  const ask = async (name: Read, ctx: CallContext, args: unknown = ASKED[name]): Promise<Result<unknown>> => {
    const handler = handlers[name];
    assert.equal(typeof handler, 'function', `${name} has no handler: it is in no route table`);
    return (await handler!(args as never, ctx as never)) as Result<unknown>;
  };
  return { api, sql, ask };
}

for (const name of READS) {
  test(`${name} IS IN THE RECORD'S TABLE AND ANSWERS ITS OWNER, never as a read this build has not got`, async () => {
    const { api, sql, ask } = await studio();
    assert.equal(typeof (api as unknown as Record<string, unknown>)[name], 'function', `${name} is not registered in methods/index.ts`);
    const out = await ask(name, owner);
    assert.notEqual(refusal(out)?.code, 'NOT_IN_THIS_BUILD', refusal(out)?.fix);
    assert.ok(out.ok, `${refusal(out)?.code}: ${refusal(out)?.fix}`);
    sql.close();
  });

  test(`${name} HAS ONE ROUTE ROW, READ+, THAT CHANGES NOTHING, and a key minted to read may call it`, async () => {
    const rows = ROUTES.filter((r) => r.name === name);
    assert.equal(rows.length, 1, `${name} has ${rows.length} rows in the host's table`);
    assert.equal(EXTRA_ROUTES.filter((r) => r.name === name).length, 1, `${name} is not listed in routes/index.ts once`);
    assert.equal(rows[0]!.group, 'READ+');
    assert.equal(rows[0]!.writes, false);
    assert.equal(rows[0]!.postRead, undefined, 'a plain read, sent as one');
    assert.doesNotMatch(rows[0]!.what, /—/u);
    const { sql, ask } = await studio();
    const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
    const asOwner = await ask(name, owner);
    const asKey = await ask(name, readKey);
    assert.ok(asKey.ok, `${refusal(asKey)?.code}: ${refusal(asKey)?.fix}`);
    /* `stale` alone answers a key by what that key asked, so only the other four are held to the owner's own answer. */
    if (name !== 'stale') assert.deepEqual(asKey, asOwner, 'a read key of the owner is answered as the owner is');
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before, 'a read wrote to the log');
    sql.close();
  });
}

/** Everything a member the numbers and the people are closed to must never be told: their names and what is on them. */
const CLOSED = /Numbers|figures|Sessions|People|Teodor|teodorv|Ilse|Brandt|ilseb|lanternfish|pellucid/u;

test('THE OWNER IS TOLD ALL OF IT: the numbers that stopped, the card for them, what Northbank is, who was folded and what waited', async () => {
  const { sql, ask } = await studio();
  const stopped = value<{ exceptions: { subject: string }[] }>(await ask('exceptions', owner));
  assert.deepEqual(stopped.exceptions.map((e) => e.subject), ['Numbers']);
  const brief = value<{ cards: { line: string }[] }>(await ask('briefing', owner));
  assert.ok(brief.cards.some((c) => /Numbers/u.test(c.line)), JSON.stringify(brief.cards));
  const what = value<{ is: { kind: string; name: string } | null }>(await ask('about', owner));
  assert.deepEqual([what.is?.kind, what.is?.name], ['project', 'Northbank']);
  const folds = value<{ matches: { from: string[] }[] } | null>(await ask('matched', owner));
  assert.deepEqual(folds?.matches.map((m) => m.from), [['Teodor Vance']]);
  /* And the question that has waited sixteen days is one stale line, with the one call that clears it. */
  const old = value<{ lines: { kind: string; said: string; count: number; clear: string }[]; count: number }>(await ask('stale', owner));
  assert.deepEqual(old.lines.map((l) => [l.kind, l.count]), [['questions', 1]]);
  assert.equal(old.count, 1);
  assert.match(old.lines[0]!.said, /Ilse Brandt/u);
  assert.match(old.lines[0]!.clear, /^decide /u);
  assert.doesNotMatch(JSON.stringify(old), /[0-9A-HJKMNP-TV-Z]{26}|\d{4}-\d{2}-\d{2}T|—/u, 'an id, a raw time or a dash');
  sql.close();
});

test('A MEMBER THE NUMBERS AND THE PEOPLE ARE CLOSED TO IS ANSWERED WITHOUT THEM, by every one of the five', async () => {
  const { sql, ask } = await studio();
  for (const name of READS) {
    const out = await ask(name, projectsOnly);
    assert.notEqual(refusal(out)?.code, 'NOT_IN_THIS_BUILD', `${name}: ${refusal(out)?.fix}`);
    assert.doesNotMatch(JSON.stringify(out), CLOSED, `${name} told a member of a list closed to them`);
  }
  /* What stopped and the briefing answer, and hold nothing from the lists they cannot read. */
  assert.deepEqual(value<{ exceptions: unknown[] }>(await ask('exceptions', projectsOnly)).exceptions, []);
  assert.deepEqual(value<{ cards: unknown[] }>(await ask('briefing', projectsOnly)).cards, []);
  /* The question is about people they cannot read, so it is not theirs to be told has waited. */
  assert.deepEqual(value<{ lines: unknown[]; count: number }>(await ask('stale', projectsOnly)), { lines: [], count: 0 });
  /* The people are a list they may not read, so who was folded is refused as reading that list is. */
  assert.equal((await ask('matched', projectsOnly)).ok, false);
  /* Their own list is still theirs: the project is answered. */
  assert.equal(value<{ is: { name: string } | null }>(await ask('about', projectsOnly)).is?.name, 'Northbank');
  sql.close();
});

test('A MEMBER THE PROJECTS ARE CLOSED TO ASKS WHAT NORTHBANK IS and is answered as for a name nobody has', async () => {
  const { sql, ask } = await studio();
  const closed = value<{ is: unknown; candidates: unknown[] }>(await ask('about', numbersOnly));
  const nobody = value<{ is: unknown; candidates: unknown[] }>(await ask('about', numbersOnly, { name: 'Nobody Has This Name' }));
  assert.deepEqual(closed, nobody);
  assert.equal(closed.is, null);
  /* And the numbers they do read are still said to them. */
  assert.deepEqual(value<{ exceptions: { subject: string }[] }>(await ask('exceptions', numbersOnly)).exceptions.map((e) => e.subject), ['Numbers']);
  sql.close();
});

test('SOMEBODY WHO READS NOTHING IS REFUSED BY ALL FIVE, before anything is read', async () => {
  const { sql, ask } = await studio();
  const nobody = { principal: { kind: 'person', id: 'p_9', level: null } } as unknown as CallContext;
  for (const name of READS) {
    const out = await ask(name, nobody);
    assert.equal(out.ok, false, `${name} answered somebody who reads nothing`);
    assert.notEqual(refusal(out)?.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(JSON.stringify(out), CLOSED);
  }
  sql.close();
});
