/**
 * A script that declares `reads:` reads on the self-host, and never reads a secret field (`loop/BACKLOG.md`, Scripts).
 *
 * RED BEFORE THIS FILE'S CHANGE, AND WITH A SENTENCE THAT WAS NOT TRUE. `scriptRunner` handed QuickJS a `CtxHost` with
 * no `list` and no `get`, and `runInQuickJs` answers a missing `list` the way it answers a register outside `reads`, so
 * a script declaring `reads: ["clients"]` and calling `ctx.record.list('clients')` was refused as
 * "reads-clients read clients, which is not in its reads." The Worker had wired both since Brief 5; the self-host had
 * not, so one declaration ran on the Cloud and was refused at home.
 *
 * A SECRET FIELD NAMES WHERE A KEY IS SEALED, AND A SCRIPT HAS NO USE FOR THAT. `list` and `get` as the record answers
 * them carry the grant id a `secret` field holds, and a script's writes go into rows and its log onto an event, so
 * whatever it is handed can be copied somewhere the owner never approved it going. The field is taken off every row
 * before the sandbox sees it, on both hosts, because both build their reads from `@braindog/host/script`.
 *
 * THE WHOLE PATH, as `script.test.ts` runs it: installed, due, polled, leased, run in QuickJS, and the write applied.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const CLIENTS = {
  id: 'register.clients',
  kind: 'register',
  body: {
    id: 'clients',
    name: 'Clients',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'token', type: 'secret' },
    ],
  },
};

const SEEN = {
  id: 'register.seen',
  kind: 'register',
  body: {
    id: 'seen',
    name: 'Seen',
    title: 'said',
    fields: [{ id: 'said', type: 'text', required: true }],
  },
};

/** A script that reads `reads` and writes everything it was handed into one row, so the row is what it saw. */
const reader = (name: string, reads: string[], source: string, limits?: { cpu_ms: number }) => ({
  id: `script.${name}`,
  kind: 'script',
  body: { script: name, runs: { every: '1h' }, egress: [], keys: [], reads, writes: ['seen'], source, ...(limits === undefined ? {} : { limits }) },
});

const LISTS = `export default async function run(ctx) {
  const rows = await ctx.record.list('clients');
  const one = await ctx.record.get('clients#1');
  ctx.write('seen', { said: JSON.stringify({ rows, one }) });
}`;

/** A record with two clients, one of them pointing at a grant, and `scripts` due now. */
async function selfhost(scripts: ReturnType<typeof reader>[]) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-script-reads-'));
  const sent: string[] = [];
  const send: Send = async (url) => (sent.push(url.href), new Response('{}'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send, resolve: async () => [] },
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  assert.ok((await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'studio', email: 'ada@example.test', record: REC }).ok);
  const k = running.api.kernel;
  const grant = k.bindGrant(
    { label: 'acme', opens: 'api.acme.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' },
    person.value.id,
  );
  assert.ok(grant.ok, JSON.stringify(grant));
  const installed = await k.install([CLIENTS, SEEN, ...scripts] as never);
  assert.ok(installed.ok, JSON.stringify(installed));
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };
  for (const name of ['Acme', 'Bolt']) assert.ok((await running.api.create({ register: 'clients', fields: { name } }, owner)).ok);
  /* THE VAULT DOOR IS THE ONLY WRITER OF A SECRET FIELD, and it needs a key store this test does not stand up. The
     column is set the way `depositGrant` leaves it: the grant's id, and nothing else. */
  const grantId = (grant.value as { id: string }).id;
  running.sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', ?) WHERE register = 'clients' AND json_extract(fields, '$.name') = 'Acme'", grantId);
  running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(Date.now() - 1_000).toISOString());

  return {
    running,
    grantId,
    sent,
    seen: () => running.sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'seen'").map((r) => (JSON.parse(r.fields) as { said: string }).said),
    run: (name: string) => {
      const [event] = running.sql.all<{ note: string; to_v: string | null }>(
        'SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid',
        `declaration:script.${name}`,
      );
      return { note: event?.note ?? 'no run event', outcome: (JSON.parse(event?.to_v ?? '{}') as { outcome?: string }).outcome };
    },
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('A SCRIPT THAT DECLARES reads: LISTS AND GETS ITS REGISTER on the self-host, rather than being told it does not read it', async () => {
  const s = await selfhost([reader('reads-clients', ['clients'], LISTS)]);
  try {
    await s.running.poll();
    const run = s.run('reads-clients');
    assert.equal(run.outcome, 'ok', run.note);
    assert.doesNotMatch(run.note, /which is not in its reads/);

    const [said] = s.seen();
    const { rows, one } = JSON.parse(said ?? '{}') as { rows: { fields: { name: string } }[]; one: { fields: { name: string } } };
    assert.deepEqual(rows.map((r) => r.fields.name).sort(), ['Acme', 'Bolt']);
    assert.equal(one.fields.name, 'Acme', 'the spoken id clients#1 is the first client written');
    assert.deepEqual(s.sent, [], 'a script that fetches nothing sent something');
  } finally {
    await s.close();
  }
});

test("A SECRET FIELD IS NOT HANDED TO A SCRIPT'S READS, by list or by get, so the grant it names cannot be copied into a row", async () => {
  const s = await selfhost([reader('reads-clients', ['clients'], LISTS)]);
  try {
    /* THE WITNESS THAT THE FIELD IS THERE TO LEAK: the stored row carries the grant id, and the record's `list`
       hands it to any reader of the register, which is what a script's reads are built on. */
    const owned = s.running.sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'clients'");
    assert.match(JSON.stringify(owned), new RegExp(s.grantId));

    await s.running.poll();
    const run = s.run('reads-clients');
    assert.equal(run.outcome, 'ok', run.note);
    const [said] = s.seen();
    assert.ok(said, 'the script wrote nothing');
    assert.doesNotMatch(said, new RegExp(s.grantId));
    assert.doesNotMatch(said, /"token"/);
  } finally {
    await s.close();
  }
});

/**
 * A FILTER ON A SECRET FIELD WOULD HAND BACK WHAT TAKING THE FIELD OFF THE ROW WITHHELD. `where` reaches the record's
 * `list` as the script wrote it, and `starts` takes a `secret` (`TEXTUAL` in `@braindog/where`), so a script that asks
 * one character at a time which rows start with what it has so far reads the grant id out of the answer's length.
 * Measured by the checker on September 22nd: this script wrote the Acme grant's id, whole, into `seen` while the row it
 * was handed carried no `token` at all. The filter is refused before the record is asked.
 */
test('A FILTER ON A SECRET FIELD IS REFUSED, so the grant id cannot be read back one prefix at a time', async () => {
  /* HALVING THE ALPHABET WITH `any`, because one `starts` per character spent the default 200 ms of CPU a third of
     the way in. `LIKE` folds ASCII case, so the id comes back upper-cased, and the comparison below folds it too. */
  const probe = `export default async function run(ctx) {
  const abc = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_-'.split('');
  let known = '';
  const hit = async (cs) => (await ctx.record.list('clients', { any: cs.map((c) => ({ field: 'token', starts: known + c })) })).length > 0;
  for (let i = 0; i < 40; i++) {
    let cs = abc;
    if (!(await hit(cs))) break;
    while (cs.length > 1) {
      const half = cs.slice(0, cs.length >> 1);
      cs = (await hit(half)) ? half : cs.slice(cs.length >> 1);
    }
    known += cs[0];
  }
  ctx.write('seen', { said: known });
}`;
  const s = await selfhost([reader('probes-token', ['clients'], probe, { cpu_ms: 1_000 })]);
  try {
    await s.running.poll();
    const run = s.run('probes-token');
    for (const said of s.seen()) assert.notEqual(said.toLowerCase(), s.grantId.toLowerCase(), 'the script read the grant id back through a filter');
    assert.equal(run.outcome, 'refused', run.note);
    assert.match(run.note, /filtered clients on token, which is a secret/);
    assert.deepEqual(s.seen(), []);
  } finally {
    await s.close();
  }
});

test('A READ OUTSIDE reads IS STILL REFUSED, OR ANSWERS NOTHING, now that the self-host can read at all', async () => {
  const s = await selfhost([
    reader('reads-seen', ['seen'], `export default async function run(ctx) {\n  await ctx.record.list('clients');\n}`),
    reader(
      'gets-across',
      ['seen'],
      `export default async function run(ctx) {\n  const row = await ctx.record.get('clients#1');\n  ctx.write('seen', { said: JSON.stringify(row) });\n}`,
    ),
  ]);
  try {
    await s.running.poll();
    const listed = s.run('reads-seen');
    assert.equal(listed.outcome, 'refused', listed.note);
    assert.match(listed.note, /read clients, which is not in its reads/);

    /* A `get` OF A ROW IN ANOTHER REGISTER ANSWERS AS A ROW THAT IS NOT THERE, which is how the record answers any
       caller that may not read it, so the register's existence is not confirmed either. The first case above reads
       the same `clients#1` as Acme, so the `null` here is the ceiling and not a spoken id the record cannot parse.
       The first version of this case expected a refusal and got a clean run: measured, not assumed. */
    const got = s.run('gets-across');
    assert.equal(got.outcome, 'ok', got.note);
    assert.deepEqual(s.seen(), ['null']);
  } finally {
    await s.close();
  }
});
