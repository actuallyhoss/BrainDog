/**
 * The record half of the suite: the real kernel, opened over each host's port, doing what a record does.
 *
 * Migrations applied in order, a row of every field type written and read back, versions and conflicts, a refusal that
 * writes nothing, search, the keychain's bytes, `attempt()`'s rollback, and the alarm and outbox through the host's own
 * scheduler. These are the paths where a difference between the two SQLites, or between the two ports' transactions,
 * would reach a person: a row stored differently, a search that finds different rows, an alarm set for another time.
 *
 * THE CLOCK IS FIXED IN 2031, so every alarm a case arms on a Durable Object is in the future and never fires under it.
 */

import { codeOf as refusalCode, conflicted, fixOf, type Result } from '@braindog/ports';
import { KERNEL_MIGRATION, MIGRATIONS, checksum, openRecord, type Kernel } from '@braindog/kernel';

import { applyMigrations } from '../../../kernel/src/migrate.ts';
import { attempt } from '../../../kernel/src/tx.ts';
import type { Assert, Case, Host } from './suite.ts';

const NOW = Date.UTC(2031, 0, 15, 12);
const DAY = 86_400_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const W = { actor: 'p_1' };

/** A clock a case can move. */
const clockAt = (ms: number) => {
  let at = ms;
  return { now: () => at, set: (next: number) => void (at = next) };
};

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The value of a result, or the case fails with the refusal in its sentence. */
function must<T>(t: Assert, r: Result<T>, what: string): T {
  if (!r.ok) t.fail(`${what} was refused: ${refusalCode(r)}: ${fixOf(r)}`);
  return (r as { ok: true; value: T }).value;
}

/** The refusal's code, or the case fails because the write went through. */
function refusedAs(t: Assert, r: Result<unknown>, what: string): string {
  if (r.ok) t.fail(`${what} was accepted`);
  return refusalCode(r);
}

/** A record opened over the host's port, with no `createRecord`: what a test of the write path needs. */
async function opened(h: Host) {
  const clock = clockAt(NOW);
  const k = await openRecord(h.sql, clock);
  return { k, clock };
}

/** A record opened and created, as a host's first sign-in leaves it. */
async function created(h: Host, t: Assert) {
  const { k, clock } = await opened(h);
  must(t, k.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }), 'createRecord');
  return { k, clock };
}

const install = async (t: Assert, k: Kernel, bodies: Record<string, unknown>[]) =>
  must(t, await k.install(bodies.map((b) => ({ id: `register.${String(b.id)}`, kind: 'register' as const, body: b as never }))), 'the install');

const PLACES = { id: 'places', name: 'Places', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };

/** One field of every type a create can write. `secret` is the keychain's alone, and `record-keychain-bytes` has it. */
const THINGS = {
  id: 'things',
  name: 'Things',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true, search: true },
    { id: 'longform', type: 'document' },
    { id: 'pieces', type: 'int' },
    { id: 'took', type: 'duration' },
    { id: 'ratio', type: 'decimal' },
    { id: 'amount', type: 'money' },
    { id: 'prices', type: 'list', of: 'money' },
    { id: 'weight', type: 'quantity' },
    { id: 'due', type: 'day' },
    { id: 'seen', type: 'instant' },
    { id: 'flag', type: 'bool' },
    { id: 'shade', type: 'enum', values: ['light', 'dark'] },
    { id: 'place', type: 'ref', to: 'places' },
    { id: 'scan', type: 'file' },
    { id: 'site', type: 'url' },
    { id: 'mail', type: 'email' },
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'extra', type: 'json' },
  ],
};

const OBLIGATIONS = {
  id: 'obligations',
  name: 'Obligations',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true, search: true },
    { id: 'party', type: 'text', search: true },
    { id: 'tags', type: 'list', of: 'text', search: true },
    { id: 'amount', type: 'money' },
    { id: 'ref', type: 'text', unique: true },
    { id: 'due', type: 'day', remind: ['-7d'] },
  ],
};

/** The stored `fields` of a row, as the column holds them. */
const stored = (h: Host, id: string): { fields: Record<string, unknown>; type: string } => {
  const row = h.sql.one<{ fields: string; t: string }>('SELECT fields, typeof(fields) AS t FROM entry WHERE id = ?', id)!;
  return { fields: JSON.parse(row.fields) as Record<string, unknown>, type: row.t };
};

const pick = (from: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, from[key]]));

export const RECORD_CASES: Case[] = [
  {
    id: 'record-migrations-in-order',
    area: 'migrations',
    says: 'an empty database takes every migration once, in order, with its checksum, and a second run applies nothing',
    async run(h, t) {
      const clock = clockAt(NOW);
      const first = await applyMigrations(h.sql, clock);
      const applied = must(t, first.result, 'the migrations').applied;
      t.deepEqual(applied, MIGRATIONS.map((m) => m.version), 'the migrations were not applied in order');
      t.equal(applied.length, KERNEL_MIGRATION, 'a migration was skipped');

      const ledger = h.sql.all<{ version: number; applied_at: string; checksum: string }>('SELECT version, applied_at, checksum FROM migration ORDER BY version');
      t.deepEqual(ledger.map((r) => r.version), applied, 'the ledger does not say what was applied');
      const sums = await Promise.all(MIGRATIONS.map((m) => checksum(m.sql)));
      t.deepEqual(ledger.map((r) => r.checksum), sums, "a ledger row's checksum is not its migration's");
      t.ok(ledger.every((r) => r.applied_at === new Date(NOW).toISOString()), 'a migration was stamped at another time');
      const format = h.sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'format'")?.value;
      t.equal(format, '1', 'the format is not where an export reads it');

      /* AND OPENED, WHICH IS WHAT A HOST DOES: nothing more is applied, and a second run is nothing at all. */
      await openRecord(h.sql, clock);
      const again = must(t, (await applyMigrations(h.sql, clock)).result, 'the second run').applied;
      t.deepEqual(again, [], 'a second run re-applied a migration');

      /* THE SCHEMA THEY LEFT, by name: the same tables, indexes and triggers on both hosts. The Durable Object's own
         `_cf_` tables and SQLite's autoindexes are the platform's and not the record's. */
      const schema = h.sql
        .all<{ type: string; name: string }>("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY type, name")
        .filter((r) => !r.name.startsWith('sqlite_') && !r.name.startsWith('_cf_'))
        .map((r) => `${r.type} ${r.name}`);
      for (const wanted of ['record', 'declaration', 'migration', 'counter', 'entry', 'event', 'schedule', 'outbox', 'entry_fts'])
        t.ok(schema.includes(`table ${wanted}`), `${wanted} is missing`);

      /* A RECORD WRITTEN BY A NEWER BUILD IS REFUSED, at the ledger row that says so, on both hosts. */
      h.sql.exec('INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, ?)', KERNEL_MIGRATION + 1, new Date(NOW).toISOString(), 'later');
      const newer = (await applyMigrations(h.sql, clock)).result;
      t.equal(refusedAs(t, newer, 'a record from a newer build'), 'SCHEMA_NEWER', 'a newer record was not refused as one');
      const at = newer.ok ? null : 'refusal' in newer ? (newer.refusal.at ?? null) : null;
      t.equal(at, `migration[${KERNEL_MIGRATION + 1}]`, 'the refusal does not name the migration');
      return { applied, schema };
    },
  },
  {
    id: 'record-every-field-type',
    area: 'record',
    says: 'a row with a field of every type is stored and read back in the same canonical form on both hosts',
    async run(h, t) {
      const { k } = await created(h, t);
      await install(t, k, [PLACES, THINGS]);
      const place = must(t, k.create('places', { name: 'Cairo office' }, W), 'the place');
      const sent = {
        what: 'Invoice 41 — brand system',
        longform: 'Line one\r\nLine two, with فاتورة',
        pieces: '12',
        took: 90,
        ratio: '0.125',
        amount: { amount: '4800', currency: 'gbp' },
        prices: [
          { amount: 100, currency: 'EGP' },
          { amount: 5, currency: 'JPY' },
          { amount: 250, currency: 'AED' },
          { amount: 1999, currency: 'USD' },
          { amount: 1, currency: 'EUR' },
          { amount: 7, currency: 'SAR' },
        ],
        weight: { value: '2.5', unit: ' kg ' },
        due: '2031-02-28',
        seen: '2031-01-10T09:30:00+02:00',
        flag: 'true',
        shade: 'dark',
        place: 'places#1',
        scan: { sha256: 'a'.repeat(64), mime: 'application/pdf', bytes: 2048, name: 'scan.pdf' },
        site: 'https://example.test/path?q=1',
        mail: 'Ada@Example.TEST',
        tags: ['urgent', 'design', 'مهم'],
        extra: { nested: { list: [1, 'two', null, true], n: 1.5 } },
      };
      const wanted = {
        what: 'Invoice 41 — brand system',
        longform: 'Line one\nLine two, with فاتورة',
        pieces: 12,
        took: 90,
        ratio: 0.125,
        amount: { amount: 4800, currency: 'GBP' },
        prices: sent.prices,
        weight: { value: 2.5, unit: 'kg' },
        due: '2031-02-28',
        seen: new Date(Date.parse(sent.seen)).toISOString(),
        flag: true,
        shade: 'dark',
        place: place.id,
        scan: sent.scan,
        site: 'https://example.test/path?q=1',
        mail: 'Ada@example.test',
        tags: sent.tags,
        extra: sent.extra,
      };
      const row = must(t, k.create('things', sent, W), 'the row of every type');
      const keys = Object.keys(wanted);
      t.deepEqual(pick(k.get('things#1')!.fields as Record<string, unknown>, keys), wanted, 'a field was read back in another form');
      const held = stored(h, row.id);
      t.equal(held.type, 'text', 'the fields column is not text');
      t.deepEqual(pick(held.fields, keys), wanted, 'a field was stored in another form');
      /* THE REF'S ROW ID IS MINTED, so the trace names it by the row it points at. */
      return { stored: { ...pick(held.fields, keys), place: 'places#1' } };
    },
  },
  {
    id: 'record-versions-and-conflicts',
    area: 'versions',
    says: 'a stale write is a conflict that names who moved the row and changes nothing; a current one goes through',
    async run(h, t) {
      const { k } = await created(h, t);
      await install(t, k, [OBLIGATIONS]);
      const start = k.version();
      const made = must(t, k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' } }, { actor: 'p_ada' }), 'the create');
      t.equal(made.version, 1, 'a new row is not at version 1');
      t.ok(k.version() > start, 'a create did not move the record version');
      const read = k.get('obligations#1')!;

      must(t, k.update('obligations', 'obligations#1', { amount: { amount: 50_000, currency: 'GBP' } }, { actor: 'p_bo' }), 'the first update');
      const afterBo = k.version();
      const stale = k.update('obligations', 'obligations#1', { what: 'Invoice 41, revised' }, { actor: 'p_ada', version: read.version });
      if (!conflicted(stale)) t.fail(`a stale write came back as ${stale.ok ? 'accepted' : refusalCode(stale)}`);
      const conflict = (stale as { conflict: { version: number; actor: string; current: unknown } }).conflict;
      t.equal(refusalCode(stale), 'VERSION_STALE', 'the conflict has another code');
      t.equal(conflict.actor, 'p_bo', 'the conflict does not say who moved the row');
      t.equal(conflict.version, 2, 'the conflict does not say where the row is');
      t.deepEqual((conflict.current as { fields: Record<string, unknown> }).fields.amount, { amount: 50_000, currency: 'GBP' }, 'the conflict hands back an old row');
      t.equal(k.get('obligations#1')!.fields.what, 'Invoice 41', 'a conflict applied its patch');
      t.equal(k.version(), afterBo, 'a conflict moved the record version');

      const current = must(t, k.update('obligations', 'obligations#1', { what: 'Invoice 41, revised' }, { actor: 'p_ada', version: 2 }), 'the current write');
      t.equal(current.version, 3, 'a current write did not bump the version');
      const history = k.history(made.id).map((e) => ({ kind: e.kind, actor: e.actor }));
      t.equal(history.length, 3, 'the history is not the three writes');
      return { versions: [made.version, 2, current.version], conflict: { code: refusalCode(stale), actor: conflict.actor, version: conflict.version }, history };
    },
  },
  {
    id: 'record-refusal-writes-nothing',
    area: 'record',
    says: 'a refused write leaves no row, no event, no number spent and no version moved',
    async run(h, t) {
      const { k } = await created(h, t);
      await install(t, k, [OBLIGATIONS]);
      const first = must(t, k.create('obligations', { what: 'first', ref: 'INV-1' }, W), 'the first row');
      const version = k.version();
      const events = h.sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
      const codes = [
        refusedAs(t, k.create('obligations', { what: 'twin', ref: 'INV-1' }, W), 'a second INV-1'),
        refusedAs(t, k.create('obligations', { amount: { amount: 1, currency: 'GBP' } }, W), 'a row with no title'),
        refusedAs(t, k.create('obligations', { what: 'float', amount: { amount: 4.5, currency: 'GBP' } }, W), 'a float amount'),
        refusedAs(t, k.create('obligations', { what: 'nowhere', amount: { amount: 1, currency: 'GPB' } }, W), 'a currency that does not exist'),
        refusedAs(t, k.update('obligations', 'obligations#1', { nope: 'x' }, W), 'a field that does not exist'),
      ];
      t.equal(k.count('obligations'), 1, 'a refused write left a row');
      t.equal(h.sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, events, 'a refused write left an event');
      t.equal(k.version(), version, 'a refused write moved the record version');
      t.equal(k.get('obligations#1')!.version, first.version, 'a refused update bumped the row');
      const next = must(t, k.create('obligations', { what: 'second', ref: 'INV-2' }, W), 'the second row');
      t.equal(next.seq, 2, `refused writes spent numbers: the next row is #${String(next.seq)}`);
      return { codes, next: next.seq };
    },
  },
  {
    id: 'record-size-caps',
    area: 'limits',
    says: 'a text past its cap is OUT_OF_BOUNDS on both hosts, and a document under its cap is stored whole',
    async run(h, t) {
      const { k } = await created(h, t);
      await install(t, k, [{ id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'body', type: 'document' }] }]);
      const over = refusedAs(t, k.create('notes', { what: 'x'.repeat(16_385) }, W), 'a text of 16,385 bytes');
      t.equal(over, 'OUT_OF_BOUNDS', 'a text past its cap was refused for something else');
      const body = 'paragraph of prose. '.repeat(25_000);
      const made = must(t, k.create('notes', { what: 'long', body }, W), 'a document of 500,000 bytes');
      t.equal((stored(h, made.id).fields.body as string).length, body.length, 'the document was not stored whole');
      return { over, body: body.length };
    },
  },
  {
    id: 'record-search',
    area: 'search',
    says: 'search finds a row by any searchable field, by prefix, across diacritics and Arabic, and follows updates and deletes',
    async run(h, t) {
      const { k } = await created(h, t);
      await install(t, k, [OBLIGATIONS]);
      must(t, k.create('obligations', { what: 'Café crème invoice', tags: ['urgent'] }, W), 'the first row');
      must(t, k.create('obligations', { what: 'فاتورة الكهرباء' }, W), 'the second row');
      must(t, k.create('obligations', { what: 'Invoice 41', party: 'Halden' }, W), 'the third row');
      const titles = (q: string) => k.search(q).map((hit) => String(k.get(hit.id)?.fields.what));
      const queries = ['cafe', 'crem', 'فاتو', 'inv', 'hal inv', 'urgent', 'nope', 'CAFÉ'];
      const found = Object.fromEntries(queries.map((q) => [q, titles(q)]));
      const sorted = (q: string) => [...(found[q] ?? [])].sort();
      t.deepEqual(sorted('cafe'), ['Café crème invoice'], 'a word without its accent did not find the row');
      t.deepEqual(sorted('CAFÉ'), ['Café crème invoice'], 'a word in capitals did not find the row');
      t.deepEqual(sorted('crem'), ['Café crème invoice'], 'a prefix did not find the row');
      t.deepEqual(sorted('فاتو'), ['فاتورة الكهرباء'], 'an Arabic prefix did not find the row');
      t.deepEqual(sorted('inv'), ['Café crème invoice', 'Invoice 41'], 'a prefix found the wrong rows');
      t.deepEqual(sorted('hal inv'), ['Invoice 41'], 'two words were not both required');
      t.deepEqual(sorted('urgent'), ['Café crème invoice'], 'a word inside a list was not found');
      t.deepEqual(sorted('nope'), [], 'a word nothing holds found a row');

      must(t, k.update('obligations', 'obligations#3', { party: null }, W), 'clearing the party');
      t.deepEqual(titles('halden'), [], 'a cleared value is still findable');
      must(t, k.update('obligations', 'obligations#2', { deleted_at: isoDay(NOW) }, W), 'the delete');
      t.deepEqual(titles('فاتو'), [], 'a deleted row is findable');
      must(t, k.update('obligations', 'obligations#2', { deleted_at: null }, W), 'the restore');
      t.deepEqual(titles('فاتو'), ['فاتورة الكهرباء'], 'a restored row is not findable');
      return { found };
    },
  },
  {
    id: 'record-keychain-bytes',
    area: 'values',
    says: "a grant's sealed bytes are stored as a BLOB and read back by the kernel as the same Uint8Array",
    async run(h, t) {
      const { k } = await created(h, t);
      const grant = {
        label: 'stats read',
        opens: 'stats.example.test',
        kind: 'api_token',
        ciphertext: Uint8Array.of(1, 2, 3, 0, 255),
        nonce: Uint8Array.of(9, 9),
        kdf: 'hkdf',
        wrapped_by: 'kek',
        kek_id: 'kek_fake',
      };
      must(t, k.bindGrant(grant as never, 'p_1'), 'bindGrant');
      t.equal(k.grants().length, 1, 'the grant is not there');
      const row = h.sql.one<{ ciphertext: unknown; nonce: unknown; t: string }>('SELECT ciphertext, nonce, typeof(ciphertext) AS t FROM grant')!;
      t.equal(row.t, 'blob', 'the ciphertext is not a BLOB');
      t.ok(row.ciphertext instanceof Uint8Array, `the kernel reads the ciphertext as ${Object.prototype.toString.call(row.ciphertext)}`);
      t.deepEqual(row.ciphertext, grant.ciphertext, 'the sealed bytes changed');
      t.deepEqual(row.nonce, grant.nonce, 'the nonce changed');
      return { ciphertext: row.ciphertext, nonce: row.nonce };
    },
  },
  {
    id: 'record-attempt-rollback',
    area: 'transactions',
    says: "attempt() undoes a refusal's own writes and nothing else, top level and nested, and a real throw goes up as itself",
    async run(h, t) {
      const { k } = await created(h, t);
      h.sql.exec('CREATE TABLE probe (x TEXT)');
      const rows = () => h.sql.all<{ x: string }>('SELECT x FROM probe ORDER BY rowid').map((r) => r.x);
      const clear = () => h.sql.exec('DELETE FROM probe');
      const NOPE: Result<never> = { ok: false, refusal: { code: 'NOPE', fix: 'no' } };

      const top = attempt(h.sql, k.transaction, () => (h.sql.exec("INSERT INTO probe (x) VALUES ('half')"), NOPE));
      t.equal(refusalCode(top), 'NOPE', 'the refusal came back as something else');
      t.deepEqual(rows(), [], 'a top-level refusal kept its write');

      const nested = k.transaction(() => {
        h.sql.exec("INSERT INTO probe (x) VALUES ('outer')");
        const r = attempt(h.sql, k.transaction, () => (h.sql.exec("INSERT INTO probe (x) VALUES ('inner')"), NOPE));
        h.sql.exec("INSERT INTO probe (x) VALUES ('after')");
        return r;
      });
      t.equal(refusalCode(nested), 'NOPE', 'the nested refusal came back as something else');
      t.deepEqual(rows(), ['outer', 'after'], 'a nested refusal took the wrong writes with it');
      clear();

      const kept = k.transaction(() => attempt(h.sql, k.transaction, () => (h.sql.exec("INSERT INTO probe (x) VALUES ('kept')"), { ok: true as const, value: 1 })));
      t.ok(kept.ok, 'a success came back refused');
      t.deepEqual(rows(), ['kept'], 'a nested success did not commit with its caller');
      clear();

      let threw: unknown = null;
      try {
        k.transaction(() =>
          attempt(h.sql, k.transaction, () => {
            h.sql.exec("INSERT INTO probe (x) VALUES ('thrown')");
            throw new TypeError('a real error');
          }),
        );
      } catch (e) {
        threw = e instanceof Error ? e.message : String(e);
      }
      t.equal(threw, 'a real error', 'a real throw did not go up as itself');
      t.deepEqual(rows(), [], 'a real throw kept its write');

      /* AND THE KERNEL'S OWN SEALING WRITE, the one that answered 500 on the Cloud, inside somebody else's transaction. */
      const bound = k.transaction(() =>
        k.bindGrant({ label: 'nested', opens: 'nested.example.test', kind: 'api_token', ciphertext: Uint8Array.of(4), nonce: Uint8Array.of(5), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' } as never, 'p_1'),
      );
      must(t, bound, 'bindGrant inside a transaction');
      t.equal(k.grants().length, 1, 'the nested grant is not there');
      return { top: refusalCode(top), nested: refusalCode(nested), threw };
    },
  },
  {
    id: 'record-alarm-and-outbox',
    area: 'outbox',
    says: "the host's alarm holds the earliest pending row or nothing, the doorbell rings for the outbox, and a lease is taken once",
    async run(h, t) {
      const { k, clock } = await opened(h);
      /* THE SIGNS' NIGHT IS ARMED AS EVERY RECORD OPENS, and this case counts only what it puts there itself. */
      h.sql.exec("DELETE FROM schedule WHERE kind = 'snapshot' AND key = 'signs'");
      await install(t, k, [OBLIGATIONS]);

      await k.tail(h.scheduler);
      t.equal(await h.scheduler.get(), null, 'a record with nothing to do armed an alarm');

      must(t, k.create('obligations', { what: 'Invoice 41', due: isoDay(NOW + 10 * DAY) }, W), 'the row with a due day');
      await k.tail(h.scheduler);
      const reminder = Date.parse(`${isoDay(NOW + 3 * DAY)}T12:00:00Z`);
      const armed = await h.scheduler.get();
      t.equal(armed, reminder, 'the alarm is not the reminder seven days before the due day');
      await k.tail(h.scheduler);
      t.equal(await h.scheduler.get(), reminder, 'a tail that changed nothing moved the alarm');

      const rang = h.wakes();
      const job = k.outbox('notify.email', { to: 'p_1', subject: 'Invoice 41' });
      await k.tail(h.scheduler);
      t.ok(h.wakes() > rang, 'the doorbell did not ring for the outbox');
      const leased = k.leaseOutbox(['notify.email'], 10).map((r) => r.id);
      t.deepEqual(leased, [job], 'the lease did not take the job');
      t.deepEqual(k.leaseOutbox(['notify.email'], 10), [], 'a second lease took the same job');
      must(t, k.ackOutbox({ id: job, state: 'done' }), 'the ack');
      const twice = refusedAs(t, k.ackOutbox({ id: job, state: 'done' }), 'a second ack');
      t.equal(twice, 'OUT_OF_BOUNDS', 'a second ack was refused for something else');

      clock.set(NOW + 4 * DAY);
      await k.drain(h.scheduler);
      t.equal(await h.scheduler.get(), null, 'a drained schedule left an alarm behind');
      const pending = h.sql.all("SELECT 1 FROM schedule WHERE kind = 'reminder' AND state = 'pending'").length;
      t.equal(pending, 0, 'the reminder was not drained');
      return { armed, leased: leased.length, twice };
    },
  },
];
