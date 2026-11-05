/**
 * The record's doors for a file: an operation grant opens one ADMIN door, an import can replace the record it came
 * from, the signing key can be asked for, and a restore can hand the object back to a host that reopens it.
 *
 * WHAT WAS MEASURED BEFORE ANY OF IT. An `import` device grant, approved and exchanged, was verified by nothing, and
 * `admin()` refused every bearer, so the CLI had no way in on the Cloud but a browser. A record `createRecord` made was
 * never empty (two schedule rows, a person, an event, a member), so `import` answered it `IMPORT_NOT_EMPTY` and a copy
 * could not be put back into the record it was taken from. Nothing answered the signing key. And `restore` wrote
 * `restore.pitr` into the object it was running in, which on the Cloud is the object PITR is about to throw away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Snapshot, Snapshots } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ROUTES } from '../../host/src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { testSigner } from '../../kernel/test/signer.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const NOW = Date.UTC(2026, 8, 23, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Things', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

async function record(o: { id?: string; snapshots?: Snapshots; sign?: boolean } = {}) {
  const sql = openSqlite();
  let now = NOW;
  const api = await createRecordApi({
    sql,
    clock: { now: () => now },
    ...(o.sign === false ? {} : { sign: testSigner() }),
    ...(o.snapshots === undefined ? {} : { snapshots: o.snapshots }),
  });
  const made = await api.createRecord({ id: o.id ?? REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await api.kernel.install([THINGS])).ok);
  const things = async (): Promise<string[]> => {
    const out = (await api.list({ register: 'things' }, owner)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as { rows: { fields: { what: string } }[] }).rows.map((r) => r.fields.what).sort();
  };
  const add = async (what: string) => assert.ok((await api.create({ register: 'things', fields: { what } }, owner)).ok);
  const exported = async (): Promise<string[]> => {
    const out = (await api.export({}, owner)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as string[];
  };
  const count = (kind: string): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE kind = ?', kind)?.n ?? 0);
  return { api, sql, things, add, exported, count, advance: (ms: number) => void (now += ms) };
}

/** The `dog_manifest` block of a file: what each table holds, which a round trip must leave as it was. */
const manifestOf = (lines: readonly string[]): string[] => {
  const at = lines.findIndex((l) => l.startsWith('#table dog_manifest '));
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    out.push(line);
  }
  return out;
};

/** A grant of this reach, approved by the owner in a fresh session and exchanged: the bearer the CLI holds. */
async function bearerFor(api: Awaited<ReturnType<typeof record>>['api'], reach: string): Promise<string> {
  const started = await api.deviceStart({ reach, label: 'test-box · braindog-cli' }, '203.0.113.7');
  if (!started.ok) return assert.fail(JSON.stringify(started));
  const looked = await api.deviceLook({ user_code: started.value.user_code }, { ...owner, provedAt: NOW });
  if (!looked.ok) return assert.fail(JSON.stringify(looked));
  assert.ok((await api.deviceApprove({ user_code: started.value.user_code, handle: looked.value.handle }, { ...owner, provedAt: NOW })).ok);
  const polled = await api.devicePoll({ device_code: started.value.device_code });
  if (!polled.ok || polled.value.pending) return assert.fail(JSON.stringify(polled));
  return polled.value.bearer;
}

test('AN IMPORT GRANT OPENS THE IMPORT DOOR ONCE, AND NO OTHER DOOR, NOT EVEN EXPORT', async () => {
  const r = await record();
  await r.add('kept');
  const file = await r.exported();

  const bearer = await bearerFor(r.api, 'import');
  const grant = await r.api.operationGrant(bearer);
  if (!grant.ok) return assert.fail(JSON.stringify(grant));
  assert.equal(grant.value.method, 'import');
  assert.equal(grant.value.person, 'p_owner');

  /* What a host builds from the grant: the approver, at the level they hold now, and the one method. */
  const held = r.api.kernel.access(grant.value.person)!;
  const ctx: CallContext = { principal: { kind: 'person', id: grant.value.person, level: held.level }, credentialed: true, operation: grant.value.method };

  /* The mutation this holds: an import grant that admits export. */
  const exported = (await r.api.export({}, ctx)) as Out;
  assert.equal(exported.ok, false, 'an import grant exported the record');
  assert.equal(exported.refusal?.code, 'FORBIDDEN');
  for (const [name, out] of [
    ['listTokens', await r.api.listTokens(ctx)],
    ['boot', await r.api.boot(ctx)],
    ['list', await r.api.list({ register: 'things' }, ctx)],
    ['create', await r.api.create({ register: 'things', fields: { what: 'slipped in' } }, ctx)],
  ] as const)
    assert.equal((out as Out).ok, false, `an import grant reached ${name}`);

  const imported = (await r.api.import({ lines: file, replace: true }, ctx)) as Out;
  assert.ok(imported.ok, JSON.stringify(imported));

  /* Spent: the second presentation is refused before any door is asked. */
  const again = await r.api.operationGrant(bearer);
  assert.equal(again.ok, false, 'a spent grant was admitted twice');

  /* And a grant for a person below owner opens nothing, whatever it names. */
  const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, credentialed: true, operation: 'import' };
  assert.equal(((await r.api.import({ lines: file, replace: true }, writer)) as Out).ok, false);
});

test('A REPLACING IMPORT PUTS THE RECORD BACK AS ITSELF: its rows, its tokens kept, its export events kept, a copy taken first', async () => {
  const taken: { label: string; things: number }[] = [];
  let r!: Awaited<ReturnType<typeof record>>;
  const port: Snapshots = {
    take: async (label) => {
      taken.push({ label, things: Number(r.sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'things'")?.n) });
      return { id: `${label}-1`, at: new Date(NOW).toISOString(), bytes: 1 };
    },
    list: async () => [],
    restore: async () => {},
    prune: async () => {},
  };
  r = await record({ snapshots: port });
  await r.add('kept');
  const file = await r.exported();
  await r.add('written after the copy');
  const token = await r.api.createToken({ scope: 'read', label: 'an agent' }, owner);
  if (!token.ok) return assert.fail(JSON.stringify(token));
  const exports = r.count('export');

  /* Without `replace`, the rule is the rule it always was. */
  const plain = (await r.api.import({ lines: file }, owner)) as Out;
  assert.equal(plain.refusal?.code, 'IMPORT_NOT_EMPTY');
  assert.deepEqual(taken, [], 'a refused import took a copy');

  const replaced = (await r.api.import({ lines: file, replace: true }, owner)) as Out;
  assert.ok(replaced.ok, JSON.stringify(replaced));
  assert.deepEqual(await r.things(), ['kept']);
  assert.deepEqual(taken, [{ label: 'before-restore', things: 2 }], 'the copy was not of the record as it was');

  assert.ok((await r.api.kernel.verifyToken((token.value as { bearer: string }).bearer, 'api')).ok, 'a token minted before the import stopped working');
  assert.equal(r.count('export'), exports, 'the record forgot what had left it');
  assert.deepEqual(manifestOf(await r.exported()), manifestOf(file), 'the record is not the file it was put back from');
});

test('A REPLACING IMPORT OF ANOTHER RECORD, OR OF A DAMAGED FILE, CHANGES NOTHING AND TAKES NO COPY', async () => {
  const taken: string[] = [];
  const port: Snapshots = {
    take: async (label) => (taken.push(label), { id: `${label}-1`, at: new Date(NOW).toISOString(), bytes: 1 }),
    list: async () => [],
    restore: async () => {},
    prune: async () => {},
  };
  const r = await record({ snapshots: port });
  await r.add('mine');
  const stranger = await record({ id: OTHER });
  await stranger.add('theirs');

  const other = (await r.api.import({ lines: await stranger.exported(), replace: true }, owner)) as Out;
  assert.equal(other.ok, false);
  assert.equal(other.refusal?.code, 'OUT_OF_BOUNDS');
  assert.equal(other.refusal?.at, 'record.id');
  assert.ok(other.refusal?.fix.includes(OTHER) && other.refusal.fix.includes(REC), other.refusal?.fix);

  const file = await r.exported();
  const damaged = file.map((l) => (l.includes('"mine"') ? l.replace('"mine"', '"yours"') : l));
  const broken = (await r.api.import({ lines: damaged, replace: true }, owner)) as Out;
  assert.equal(broken.ok, false);

  assert.deepEqual(await r.things(), ['mine']);
  assert.deepEqual(taken, []);

  /* `replace` is a boolean, and a string that looks like one is not taken for it. */
  const loose = (await r.api.import({ lines: file, replace: 'true' as never }, owner)) as Out;
  assert.equal(loose.refusal?.code, 'VALUE_MALFORMED');
});

/**
 * WHAT THE CHECKER MEASURED AGAINST THE FIRST REPAIR. `replace` cleared every travelling table and filled it from the
 * file, and the file's own `record` row was its only question. But the header travels whatever else does, so a
 * `sections: ['data']` export carries that row, and replacing with one answered `ok` with the record's two declarations
 * and its owner's `member` row gone: `list` of Things then answered REGISTER_UNKNOWN. And the export door's default
 * is redacted, which leaves `vault_key` out and blanks every grant's bytes, so replacing with the file an export hands
 * out by default answered `ok` with the record's two `vault_key` rows, its record key and its signing key, gone.
 */
test('A REPLACING IMPORT OF A FILE THAT LEAVES A SECTION OR THE SEALED BYTES BEHIND CHANGES NOTHING AND TAKES NO COPY', async () => {
  const taken: string[] = [];
  const port: Snapshots = {
    take: async (label) => (taken.push(label), { id: `${label}-1`, at: new Date(NOW).toISOString(), bytes: 1 }),
    list: async () => [],
    restore: async () => {},
    prune: async () => {},
  };
  const r = await record({ snapshots: port });
  await r.add('mine');
  const shape = () => ({
    declarations: Number(r.sql.one<{ n: number }>('SELECT count(*) AS n FROM declaration')?.n),
    members: Number(r.sql.one<{ n: number }>('SELECT count(*) AS n FROM member')?.n),
    keys: Number(r.sql.one<{ n: number }>('SELECT count(*) AS n FROM vault_key')?.n),
  });

  const partial = (await r.api.export({ sections: ['data'] }, owner)) as Out;
  assert.ok(partial.ok, JSON.stringify(partial));
  const held = shape();
  const part = (await r.api.import({ lines: partial.value as string[], replace: true }, owner)) as Out;
  assert.equal(part.ok, false, 'a file of the data section alone replaced the whole record');
  assert.equal(part.refusal?.code, 'OUT_OF_BOUNDS');
  assert.ok(part.refusal?.fix.includes('governance'), part.refusal?.fix);
  assert.deepEqual(shape(), held);

  r.sql.exec(
    "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES ('record', ?, ?, 'kek', 'kek_2f')",
    new Uint8Array([9]),
    new Uint8Array([1]),
  );
  const keyed = shape();
  const redacted = (await r.api.import({ lines: await r.exported(), replace: true }, owner)) as Out;
  assert.equal(redacted.ok, false, 'a redacted file replaced a record that holds a key');
  assert.equal(redacted.refusal?.code, 'OUT_OF_BOUNDS');
  assert.deepEqual(shape(), keyed);
  assert.deepEqual(await r.things(), ['mine']);
  assert.deepEqual(taken, []);

  /* The whole file, the sealed bytes with it, is still taken, and the key comes back as it was. */
  const full = (await r.api.export({ redactGrants: false, kek_id: 'kek_2f' }, owner)) as Out;
  assert.ok(full.ok, JSON.stringify(full));
  const whole = (await r.api.import({ lines: full.value as string[], replace: true }, owner)) as Out;
  assert.ok(whole.ok, JSON.stringify(whole));
  assert.deepEqual(shape(), keyed);
  assert.deepEqual(taken, ['before-restore']);
});

test('THE SIGNING KEY IS THE ONE AN EXPORT IS SIGNED WITH, and a record with no signer answers null', async () => {
  const r = await record();
  const file = await r.exported();
  const at = file.findIndex((l) => l.startsWith('#table dog_sig '));
  const [, keyId, publicKey] = JSON.parse(file[at + 1]!) as string[];
  assert.deepEqual(await r.api.signingKey(), { key_id: keyId, public_key: publicKey });

  const bare = await record({ sign: false });
  assert.equal(await bare.api.signingKey(), null);
});

test('A PORT THAT REOPENS THE OBJECT WRITES NO restore.pitr ITSELF, AND restored WRITES IT ON THE REOPENED ONE', async () => {
  const kept: Snapshot = { id: 'nightly-2026-09-22', at: '2026-09-22T03:00:00.000Z', bytes: 9141 };
  const asked: string[] = [];
  const port: Snapshots & { reopens: true } = {
    reopens: true,
    take: async (label) => ({ id: `${label}-2026-09-23`, at: new Date(NOW).toISOString(), bytes: 1 }),
    list: async () => [kept],
    restore: async (id) => void asked.push(id),
    prune: async () => {},
  };
  const r = await record({ snapshots: port });

  const out = (await r.api.restore({ bookmark: kept.id }, owner)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  const { ended, ...said } = out.value as { ended?: unknown };
  assert.deepEqual(said, { bookmark: kept.id, at: kept.at, kept: 'before-restore-2026-09-23' });
  assert.ok(ended !== null && typeof ended === 'object', 'a reopening restore carried nothing it had ended');
  assert.deepEqual(asked, [kept.id]);
  assert.equal(r.count('restore.pitr'), 0, 'the object PITR is about to replace was written to');

  const written = await r.api.restored({ bookmark: kept.id, kept: 'before-restore-2026-09-23', by: 'p_owner' });
  assert.ok(written.ok, JSON.stringify(written));
  assert.equal(r.count('restore.pitr'), 1);
  const row = r.sql.one<{ actor: string; to_v: string; note: string }>("SELECT actor, to_v, note FROM event WHERE kind = 'restore.pitr'");
  assert.deepEqual({ ...row }, {
    actor: 'p_owner',
    to_v: JSON.stringify(kept.id),
    note: `restored to ${kept.id} by p_owner; what it held before is kept as before-restore-2026-09-23`,
  });
});


test("THE THREE NEW DOORS ARE THE HOST'S OWN: they exist, and no route reaches them", async () => {
  const r = await record();
  const routed = new Set(ROUTES.map((route) => route.name));
  /* `mintChild` too (sharing plan 2.9): an app's hourly key, minted under a parent only a host holds. */
  for (const name of ['operationGrant', 'signingKey', 'restored', 'mintChild'] as const) {
    assert.equal(typeof r.api[name], 'function', name);
    assert.equal(routed.has(name), false, `${name} is routed, and it is INTERNAL`);
  }
});
