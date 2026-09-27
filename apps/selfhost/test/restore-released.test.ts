/**
 * Two lines of the self-host that nothing held: the names a restore refusal gives for a record already served here, and
 * the poll that leases nothing from a record this build refuses.
 *
 * `init --from` REFUSES A COPY OF A RECORD THIS DIRECTORY ALREADY SERVES, AND NAMES IT BY THE NAMES IT STILL ANSWERS TO
 * (`src/restore.ts`, `knows(record)`). A renamed record keeps its old name as a tombstone, `released_at` set, so that no
 * link that still says it reads another record. A tombstone is not a name the record is served under, and a refusal
 * telling somebody to "serve that one" under a name that answers nothing sends them to a 404. The filter that keeps
 * tombstones out had no test; without it the refusal would name the tombstone beside the live name, and would name
 * released names for a record that has no live one.
 *
 * AND `poll` LEASES NOTHING FROM A RECORD THIS BUILD REFUSES (`src/server.ts`, its first line). The doors already answer
 * such a record with its refusal alone; the poller is the other way in, and a job leased and delivered from a file whose
 * tables this build cannot vouch for is mail sent on behalf of a record that answers nobody. Without that line the job
 * below would be leased and handed to the deliverer, because nothing else in `poll` asks.
 *
 * THE COPY IS BUILT AS `restore-members.test.ts` BUILDS IT, `kernel.export({ redactGrants: false, actor: 'system' })`
 * over a signed record, and `initFrom` runs in this process, because what is asked is the sentence it answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Signer } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { initFrom } from '../src/restore.ts';
import { openSqlite, start } from '../src/server.ts';
import { signerFor } from '../src/sign.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const ADA = 'p_01JZ8QK3F7R2M9V4XN6TCB5HA0';
const NOW = (): number => Date.UTC(2026, 8, 23, 3, 17);

/** A record Ada owns, exported whole, as the file `init --from` is handed. */
async function copyOf(work: string): Promise<string> {
  const sql = openSqlite(':memory:');
  const store = await openKeyStore(join(work, 'kek'));
  let signer: Signer | null = null;
  const api = await createRecordApi({ sql, clock: { now: NOW }, sign: async (b) => (signer ? signer(b) : null) });
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: ADA, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  signer = await signerFor(sql, store, REC);
  const exported = await api.kernel.export({ redactGrants: false, actor: 'system' });
  assert.ok(exported.ok, JSON.stringify(exported));
  sql.close();
  const file = join(work, 'copy.brainl');
  writeFileSync(file, `${exported.value.join('\n')}\n`);
  return file;
}

function scratch(t: { after: (f: () => void) => void }): string {
  const work = mkdtempSync(join(tmpdir(), 'braindog-restore-released-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  return work;
}

/**
 * This host's Directory, already serving the record: named `old-studio` first and renamed `the-studio`, so it holds one
 * live name and one tombstone. `then` does anything further to it before it is closed.
 */
function served(data: string, then: (dirSql: ReturnType<typeof openSqlite>) => void = () => {}): void {
  mkdirSync(data, { recursive: true });
  const dirSql = openSqlite(join(data, 'directory.sqlite'));
  try {
    const directory = createDirectory(dirSql, { now: NOW });
    assert.ok(directory.person$('ada@example.com', 'Ada').ok);
    assert.ok(directory.provision({ slug: 'old-studio', email: 'ada@example.com', record: REC, plan: 'selfhost' }).ok);
    assert.ok(directory.rename('old-studio', 'the-studio').ok);
    assert.deepEqual(
      directory.namesOf(REC).map((n) => [n.slug, n.released_at === null]),
      [
        ['old-studio', false],
        ['the-studio', true],
      ],
      'the Directory does not hold one tombstone and one live name, so this measures nothing',
    );
    then(dirSql);
  } finally {
    dirSql.close();
  }
}

test('A RECORD ALREADY SERVED HERE IS REFUSED UNDER THE NAME IT ANSWERS TO, and never under a name it gave up', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  served(data);

  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.equal(out.ok, false);
  const said = String(out.said);
  assert.match(said, new RegExp(`^${REC} is already served here as the-studio\\. `), said);
  assert.ok(!said.includes('old-studio'), `the refusal sent somebody to a name that answers nothing: ${said}`);
});

/* A RECORD STILL SERVED WITH EVERY NAME RELEASED IS A STATE NO DIRECTORY METHOD LEAVES: `rename` claims the new name as it
   releases the old one, and `close` ends the record, which `knows` then answers false for. A hand edit leaves it, and the
   refusal has a sentence for it, which is only reached while the released names are kept out. */
test('A RECORD SERVED HERE WITH EVERY NAME RELEASED IS REFUSED AS ONE WITH NO NAME, and not under the names it gave up', async (t) => {
  const work = scratch(t);
  const file = await copyOf(work);
  const data = join(work, 'data');
  served(data, (dirSql) => dirSql.exec('UPDATE dir_slug SET released_at = ? WHERE record = ?', '2026-09-23T00:00:00.000Z', REC));

  const out = await initFrom({ data, slug: 'drill', from: file, kekFile: join(work, 'kek'), now: NOW, say: () => {} });
  assert.equal(out.ok, false);
  const said = String(out.said);
  assert.match(said, new RegExp(`^${REC} is already served here as a record with no name\\. `), said);
  assert.ok(!said.includes('studio'), `a released name was offered as the one to serve: ${said}`);
});

test('A RECORD THIS BUILD REFUSES HAS NOTHING LEASED OR DELIVERED BY THE POLL, and its job waits', async (t) => {
  const work = scratch(t);
  const file = join(work, 'record.brain');

  /* A JOB QUEUED WHILE THE BUILD STILL READ THE FILE. */
  const first = await start({ file, port: 0, pollMs: 0 });
  let job = '';
  try {
    job = first.api.kernel.outbox('notify.email', { to: 'p_self', subject: 'Invoice 41' });
  } finally {
    await first.close();
  }

  /* A LEDGER ROW FROM A NEWER BUILD, which is what a rollback past a migration leaves (`test/healthz.test.ts`). */
  const sql = openSqlite(file);
  sql.exec("INSERT INTO migration (version, applied_at, checksum) VALUES (9999, '2026-09-23T00:00:00.000Z', 'from-a-newer-build')");
  sql.close();

  const delivered: string[] = [];
  const running = await start({
    file,
    port: 0,
    pollMs: 0,
    delivers: ['notify.email'],
    deliver: async (row) => void delivered.push(row.kind),
  });
  try {
    assert.equal(running.api.kernel.refused()?.code, 'SCHEMA_NEWER', 'the build did not refuse the file, so this measures nothing');
    await running.poll();
    await running.scheduler.wake();
    assert.deepEqual(delivered, [], 'a job was delivered from a record this build refuses');
    const row = running.sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM outbox WHERE id = ?', job);
    assert.equal(row?.state, 'pending', 'the job was leased from a record this build refuses');
    assert.equal(Number(row?.attempts), 0, 'a job nobody may lease counted an attempt');
  } finally {
    await running.close();
  }
});
