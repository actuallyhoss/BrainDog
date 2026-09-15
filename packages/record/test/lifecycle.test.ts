/**
 * The four owner acts that act on the whole record: a copy now, going back to one, erasing a person, deleting it all.
 *
 * WHAT IS ASSERTED IS WHO REACHES THEM AND WHAT A HOST WITHOUT THE PART SAYS. The copies are the host's, so a fake store
 * stands in for one here and `apps/selfhost/test/snapshots.test.ts` is where real files are written and put back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Snapshot, Snapshots } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 16, 12);
const MINUTE = 60_000;

const CONTACTS = {
  id: 'register.contacts',
  kind: 'register' as const,
  body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: string[] } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const code = (r: unknown): string => {
  const x = r as Out;
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal?.code ?? '';
};

function store() {
  const kept: Snapshot[] = [];
  const calls: string[] = [];
  let n = 0;
  const port: Snapshots = {
    async take(label) {
      const s = { id: `2026-09-16T12-00-${String(n++).padStart(2, '0')}Z-${label}`, at: '2026-09-16T12:00:00.000Z', bytes: 4096 };
      kept.unshift(s);
      calls.push(`take ${label}`);
      return s;
    },
    async list() {
      return [...kept];
    },
    async restore(id) {
      calls.push(`restore ${id}`);
      if (id.endsWith('-broken')) throw new Error('That copy was written by a different version of this record.');
    },
    async prune() {},
  };
  return { port, calls };
}

async function record(parts: { snapshots?: Snapshots; destroy?: () => Promise<void> } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, ...parts });
  assert.ok((await api.kernel.install([CONTACTS])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const events = (kind: string) => sql.all<{ note: string; to_v: string | null }>('SELECT note, to_v FROM event WHERE kind = ?', kind);
  return { api, sql, clock, events };
}

test('EACH IS AN OWNER IN A BROWSER: a token, even an owner\'s, and a writer are refused before the host is touched', async () => {
  const { port, calls } = store();
  let destroyed = false;
  const { api, sql } = await record({ snapshots: port, destroy: async () => void (destroyed = true) });
  const erase = { subjects: ['Someone Else'], basis: 'a request' };

  for (const ctx of [token, writer]) {
    const want = ctx === token ? 'NEEDS_BROWSER_SESSION' : 'LEVEL_REQUIRED';
    const codes = [
      code(await api.snapshot({}, ctx)),
      code(await api.snapshots(ctx)),
      code(await api.restore({ bookmark: 'x' }, ctx)),
      code(await api.erase(erase, ctx)),
      code(await api.deleteRecord({ slug: 'the-studio' }, ctx)),
    ];
    assert.ok(codes.every((c) => c === want || (ctx === writer && c === 'FORBIDDEN')), `${codes.join(', ')} for ${ctx.principal.kind}`);
  }
  assert.deepEqual(calls, []);
  assert.equal(destroyed, false);
  sql.close();
});

test('A HOST WITH NO STORE OF COPIES REFUSES NOT_IN_THIS_BUILD, says what does work, and writes nothing', async () => {
  const { api, sql } = await record();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n;
  for (const out of [
    await api.snapshot({}, owner),
    await api.snapshots(owner),
    await api.restore({ bookmark: '2026-09-16T12-00-00Z-now' }, owner),
    await api.deleteRecord({ slug: 'the-studio' }, owner),
  ]) {
    assert.equal(code(out), 'NOT_IN_THIS_BUILD');
    assert.ok(((out as Out).refusal?.fix ?? '').length > 30, 'a refusal with no sentence');
  }
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n, before);
  sql.close();
});

test('A SNAPSHOT IS TAKEN BY THE HOST, listed, and said in the log as an export', async () => {
  const { port, calls } = store();
  const { api, sql, events } = await record({ snapshots: port });
  const took = value<Snapshot>(await api.snapshot({}, owner));
  assert.match(took.id, /-now$/);
  assert.deepEqual(value<Snapshot[]>(await api.snapshots(owner)).map((s) => s.id), [took.id]);
  assert.equal(events('export').length, 1);
  assert.ok(events('export')[0]?.note.includes(took.id));

  assert.equal(code(await api.snapshot({ label: 'Not A Label' }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.snapshot({ label: 'nightly', extra: 1 } as never, owner)), 'FIELD_UNKNOWN');
  assert.deepEqual(calls, ['take now']);
  sql.close();
});

test('RESTORE KEEPS WHAT THE RECORD WAS FIRST, wants a recent sign-in, and names only a copy it keeps', async () => {
  const { port, calls } = store();
  const { api, sql, events } = await record({ snapshots: port });
  const copy = value<Snapshot>(await api.snapshot({}, owner));
  const broken = value<Snapshot>(await api.snapshot({ label: 'broken' }, owner));
  calls.length = 0;

  assert.equal(code(await api.restore({ bookmark: copy.id }, { ...owner, provedAt: NOW - 16 * MINUTE })), 'NEEDS_BROWSER_SESSION');
  assert.equal(code(await api.restore({} as never, owner)), 'REQUIRED_MISSING');
  const unknown = (await api.restore({ bookmark: 'nope' }, owner)) as Out;
  assert.equal(unknown.refusal?.code, 'OUT_OF_BOUNDS');
  assert.deepEqual(unknown.refusal?.allowed, [broken.id, copy.id]);
  assert.deepEqual(calls, [], 'a refused restore touched the host');

  const back = value<{ bookmark: string; kept: string }>(await api.restore({ bookmark: copy.id }, { ...owner, provedAt: NOW - 5 * MINUTE }));
  assert.equal(back.bookmark, copy.id);
  assert.match(back.kept, /-before-restore$/);
  assert.deepEqual(calls, ['take before-restore', `restore ${copy.id}`]);
  const pitr = events('restore.pitr');
  assert.equal(pitr.length, 1);
  assert.equal(pitr[0]?.to_v, JSON.stringify(copy.id));

  const failed = (await api.restore({ bookmark: broken.id }, owner)) as Out;
  assert.equal(failed.refusal?.code, 'OUT_OF_BOUNDS');
  assert.match(failed.refusal?.fix ?? '', /different version/);
  assert.equal(events('restore.pitr').length, 1, 'a restore that failed said it went back');
  sql.close();
});

test('DELETING THE RECORD WANTS ITS NAME TYPED and a recent sign-in, and only then asks the host', async () => {
  let destroyed = 0;
  const { api, sql } = await record({ destroy: async () => void destroyed++ });

  assert.equal(code(await api.deleteRecord({ slug: 'the-stud' }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.deleteRecord({ slug: '  ' }, owner)), 'REQUIRED_MISSING');
  assert.equal(code(await api.deleteRecord({ slug: 'the-studio' }, { ...owner, provedAt: NOW - 20 * MINUTE })), 'NEEDS_BROWSER_SESSION');
  assert.equal(destroyed, 0);

  assert.deepEqual(value(await api.deleteRecord({ slug: 'the-studio' }, owner)), { slug: 'the-studio', deleted: true });
  assert.equal(destroyed, 1);
  sql.close();
});

test('ERASE IS THE KERNEL\'S CASCADE BEHIND THE OWNER\'S DOOR, and the owner is not erasable', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'contacts', fields: { name: 'Mara Quill' } }, owner));
  const report = value<{ rows: number }>(await api.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request' }, owner));
  assert.ok(report.rows > 0);
  assert.equal(value<{ matched: number }>(await api.list({ register: 'contacts' } as never, owner)).matched, 0);
  assert.equal(code(await api.erase({ subjects: ['Anyone'], personId: 'p_1', basis: 'a request' }, owner)), 'LEVEL_REQUIRED');
  sql.close();
});
