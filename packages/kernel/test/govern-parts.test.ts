/**
 * An arrangement accepted in part.
 *
 * THE PARTS TAKEN ARE APPLIED AS ONE, AND THE REST STAYS THE SAME QUESTION. An accept may name the install, settings,
 * entries and declarations it takes; what it leaves waits on the owner under the same id and cause, with its history.
 * What was taken and would not apply comes back to that question whole, so nothing is ever half taken, and a part
 * another part needs is refused alone with both named as the owner reads them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { partsOf } from '../src/govern.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

/** Three parts that need nothing of each other: an install, a settings change and the entries for one list. */
const THREE = {
  question: 'Arrange this BrainDog for work?',
  body_kind: 'arrange' as const,
  body: {
    why: ['They started a job this week.'],
    packs: { install: ['work'] },
    settings: [{ pack: 'usecase-student', values: { voice_home: 'Today' } }],
    rows: [{ register: 'obligations', fields: { what: 'Rent' } }, { register: 'obligations', fields: { what: 'Phone' } }],
    names: { 'register.obligations': 'Bills' },
  },
};

type Held = { status: string; body: string; cause: string | null };
const held = (sql: NodeSql, id: string): Held => sql.one<Held>('SELECT status, body, cause FROM suggestion WHERE id = ?', id)!;
const ids = (body: string) => partsOf(JSON.parse(body) as Record<string, unknown>).map((p) => p.id);

test('TWO OF THREE PARTS TAKEN: the two are applied as one, and the third waits as the same question', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(THREE, 'S1'));
  const before = held(sql, made.id);
  assert.deepEqual(ids(before.body), ['install:work', 'setting:usecase-student', 'rows:obligations']);

  const out = value<{ decision: string; status: string; apply?: { kind: string; body: Record<string, unknown> } }>(
    k.decide(made.id, { decide: { option: 'accept', reason: 'the job, not the bills yet', parts: ['install:work', 'setting:usecase-student'] } }, 'p_owner'),
  );
  assert.equal(out.status, 'open');
  assert.match(out.decision, /^D\d+$/u);
  assert.deepEqual(out.apply?.body.packs, { install: ['work'] });
  assert.deepEqual(out.apply?.body.settings, THREE.body.settings);
  assert.equal(out.apply?.body.rows, undefined, 'the part left behind was handed to apply');
  assert.deepEqual(out.apply?.body.why, THREE.body.why);

  /* THE SAME QUESTION, holding only the entries, with its cause. */
  const after = held(sql, made.id);
  assert.equal(after.status, 'open');
  assert.equal(after.cause, before.cause);
  assert.deepEqual(ids(after.body), ['rows:obligations']);
  assert.equal((JSON.parse(after.body) as { rows: unknown[] }).rows.length, 2);
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'note'", `suggestion:${made.id}`);
  assert.equal(note?.note, '2 parts of this were accepted, and the rest still wait here.');
  assert.doesNotMatch(note!.note, /row|—/u);

  /* AND THE REST IS ANSWERED LATER AS ANY QUESTION IS: naming no parts takes every part it still holds. */
  value(k.keepApplied(out.decision, { installed: ['work'] }, 'p_owner'));
  const rest = value<{ status: string; apply?: { body: Record<string, unknown> } }>(k.decide(made.id, { decide: { option: 'accept', reason: 'now the bills', parts: [] } }, 'p_owner'));
  assert.equal(rest.status, 'resolved');
  assert.equal((rest.apply?.body.rows as unknown[]).length, 2);
  sql.close();
});

test('A FAILURE IN ONE TAKEN PART APPLIES NOTHING: the taken parts come back to the question whole', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(THREE, 'S1'));
  const before = held(sql, made.id);

  /* AT THE GATE: one part it does not hold beside one it does, and nothing is decided or narrowed. */
  const unknown = refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['install:work', 'install:nosuch'] } }, 'p_owner'));
  assert.equal(unknown.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(unknown.allowed, ['install:work', 'setting:usecase-student', 'rows:obligations']);
  assert.deepEqual(held(sql, made.id), before);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM decision')!.n, 0);

  /* AFTER IT: the settings would not apply, so the install taken with them does not stand alone either. */
  const out = value<{ decision: string }>(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['install:work', 'setting:usecase-student'] } }, 'p_owner'));
  value(k.reopen(made.id, 'The settings for Usecase student would not apply, so nothing was kept.'));
  const back = held(sql, made.id);
  assert.equal(back.status, 'open');
  assert.equal(back.cause, before.cause);
  assert.deepEqual(ids(back.body).sort(), ids(before.body).sort());
  const body = JSON.parse(back.body) as Record<string, unknown>;
  assert.deepEqual(body.packs, { install: ['work'] });
  assert.equal((body.rows as unknown[]).length, 2);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'obligations'")!.n, 0, 'the gate wrote an entry itself');
  assert.ok(k.governanceRow('decision', out.decision), 'the decision stands: somebody did answer');

  /* AND A SECOND REOPEN HAS NOTHING TO PUT BACK. */
  assert.equal(refusal(k.reopen(made.id)).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

test('A PART ANOTHER PART NEEDS IS REFUSED ALONE, naming both in words', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'Keep the money book?',
        body_kind: 'arrange',
        body: {
          why: ['They take payments now.'],
          packs: { enable: ['stripe'] },
          settings: [{ pack: 'stripe', values: { book: 'Main' } }],
          pages: [{ id: 'page.money', kind: 'page', body: { title: 'Money', lead: 'Kept in {{config:book}}.' } }],
        },
      },
      'S1',
    ),
  );
  const before = held(sql, made.id);
  const parts = partsOf(JSON.parse(before.body) as Record<string, unknown>);
  assert.deepEqual(
    parts.map((p) => [p.id, p.name, p.needs]),
    [
      ['enable:stripe', 'turning on Stripe', []],
      ['page:money', 'the Money page', ['setting:stripe']],
      ['setting:stripe', 'the settings for Stripe', ['enable:stripe']],
    ],
  );

  const page = refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['page:money'] } }, 'p_owner'));
  assert.equal(page.code, 'REQUIRED_MISSING');
  assert.equal(page.fix, 'The Money page cannot be taken without the settings for Stripe. Take both, or leave both for later.');
  const setting = refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['setting:stripe', 'page:money'] } }, 'p_owner'));
  assert.equal(setting.fix, 'The settings for Stripe cannot be taken without turning on Stripe. Take both, or leave both for later.');
  for (const fix of [page.fix, setting.fix]) assert.doesNotMatch(fix, /row|—|stripe\b|page[.:]money/u);
  assert.deepEqual(held(sql, made.id), before, 'a refused accept changed the question');

  /* THE ONE THE OTHERS NEED MAY GO FIRST. */
  const first = value<{ status: string }>(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['enable:stripe'] } }, 'p_owner'));
  assert.equal(first.status, 'open');
  assert.deepEqual(ids(held(sql, made.id).body), ['page:money', 'setting:stripe']);
  sql.close();
});

test('THE IDS ARE THE ONES THE RECORD FILES: settings sent with an install are that install, and its requires hold', () => {
  const body = {
    packs: { install: ['work'] },
    plan: [{ pack: 'work', version: '1.0.0' }],
    settings: [{ pack: 'work', values: { voice_home: 'Today' } }],
    rows: [{ register: 'obligations', fields: { what: 'Rent' } }],
    parts: [
      { id: 'install:work', kind: 'install', label: 'Add Work tools', pack: 'work' },
      { id: 'rows:obligations', kind: 'rows', label: 'Additions to Bills', register: 'obligations', requires: ['install:work'] },
    ],
  };
  assert.deepEqual(
    partsOf(body).map((p) => [p.id, p.name, p.needs]),
    [
      ['install:work', 'the Work tools plugin', []],
      ['rows:obligations', 'the entries for Bills', ['install:work']],
    ],
  );
});

test('AN ACCEPT NAMING NO PARTS, OR EVERY PART, TAKES THE WHOLE ARRANGEMENT AS IT ALWAYS DID', async () => {
  const { k, sql } = await record();
  for (const parts of [undefined, ['install:work', 'setting:usecase-student', 'rows:obligations']]) {
    const made = value<{ id: string }>(k.propose({ ...THREE, cause: `whole-${String(parts?.length ?? 0)}` }, 'S1'));
    const out = value<{ status: string; apply?: { body: unknown } }>(
      k.decide(made.id, { decide: { option: 'accept', reason: 'all of it', ...(parts ? { parts } : {}) } }, 'p_owner'),
    );
    assert.equal(out.status, 'resolved');
    assert.deepEqual(out.apply?.body, JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', made.id)!.body));
    assert.equal(held(sql, made.id).status, 'resolved');
  }
  /* AND parts GOES ONLY WITH ACCEPT ON AN ARRANGEMENT. */
  const pack = value<{ id: string }>(k.propose({ question: 'Add Work?', body_kind: 'pack', body: { install: 'work' } }, 'S1'));
  assert.equal(refusal(k.decide(pack.id, { decide: { option: 'accept', reason: 'x', parts: ['install:work'] } }, 'p_owner')).at, 'parts');
  sql.close();
});

test('AN ARRANGEMENT MAY PATCH AN ENTRY, checked as a rowset update is, and the patch is a part of its own list', async () => {
  const { k, sql } = await record();
  const rent = value<{ id: string; version: number }>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  const patch = (at: string, version: unknown) => ({
    question: 'Rename the rent?',
    body_kind: 'arrange' as const,
    body: { why: ['The landlord changed.'], rows: [{ register: 'obligations', at, version, patch: { what: 'Rent, new flat' }, before: { what: 'Rent' } }] },
  });
  const made = value<{ id: string }>(k.propose(patch(rent.id, rent.version), 'S1'));
  assert.deepEqual(ids(held(sql, made.id).body), ['rows:obligations']);
  assert.equal(refusal(k.propose({ ...patch('nosuch', 1), cause: 'other' }, 'S1')).at, 'body.rows[0].at');
  assert.equal(refusal(k.propose({ ...patch(rent.id, 0), cause: 'other-2' }, 'S1')).at, 'body.rows[0].version');
  sql.close();
});

test('THE OWNER TAKING PART IS NOT A JOIN: the agent that asked may still take back the rest', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_1', 'p_owner', 'ht_1', 'propose', '2026-10-01T00:00:00.000Z')");
  const asker = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'claude-1', host: 'h', repo: 'braindog' } } as never;
  const made = value<{ id: string }>(k.propose(THREE, asker));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'x', parts: ['install:work'] } }, 'p_owner'));
  assert.deepEqual({ ...value<{ id: string; state: string }>(k.withdraw(asker, { id: made.id })) }, { id: made.id, state: 'withdrawn' });
  sql.close();
});
