/**
 * Creating a record, and the sweep that keeps it from growing forever.
 *
 * NAMING IS PROVISIONING. On the hosted product `env.RECORD.idFromName(slug)` is the whole of making
 * a customer exist — there is no control-plane call, no id to store, no half-created tenant left
 * behind by a signup that failed at the wrong moment. What is left for this file is the four rows
 * that say WHICH record the object is: its own name, the owner as a person, the owner's membership,
 * and the header a `.brain` file carries so the file knows what it is a copy of.
 *
 * IT IS ONE TRANSACTION, and it has to be. A record with a `record` row and no owner is a record
 * nobody can open; a record with an owner and no `record` row cannot say its own timezone, so every
 * digest it renders is in the wrong day. Neither is a state worth writing recovery code for when
 * the alternative is a `BEGIN`.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';

/**
 * `34-GRAMMARS` line 348's slug, and it is the Directory's byte for byte.
 *
 * THE TWO MUST AGREE OR ONE OF THEM IS UNREACHABLE. A name the Directory writes and this refuses is
 * a record with a resolvable slug and no record row behind it; a name this accepts and the Directory
 * refuses is a record nothing can address. They are two copies because the two halves are provisioned
 * by two different objects, and the copy is the price of that.
 */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

/** The wrapped key material, which the kernel stores and never reads. */
export type WrappedKey = { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string; wrapped_by?: 'kek' | 'passphrase' };

export type CreateRecordArgs = {
  /** `rec_` + a 26-character ULID. The id every other document already uses. Never `self`. */
  id: string;
  slug: string;
  name: string;
  /** IANA. It drives every digest, and a record that cannot say it renders days in the wrong one. */
  tz: string;
  locale: string;
  owner: { id: string; email?: string | null; name?: string | null };
  /** The record, connector and signing keys, wrapped. Absent until there is something to wrap. */
  keys?: Partial<Record<'record' | 'connector' | 'signing', WrappedKey>>;
};

export type Provisioned = { id: string; slug: string };

export function createRecord(
  sql: Sql,
  now: number,
  formatVersion: number,
  args: CreateRecordArgs,
  transaction: <T>(fn: () => T) => T,
  mint: () => string,
): Result<Provisioned> {
  if (!REC_ID.test(args.id))
    return no<Provisioned>('VALUE_MALFORMED', `A record id is rec_ plus a 26-character ULID. ${args.id} is not.`, { at: 'id' });
  if (!SLUG.test(args.slug))
    return no<Provisioned>(
      'VALUE_MALFORMED',
      `A slug starts with a letter, is two to thirty-two characters of lower-case letters, digits and hyphens, and does not end with one. ${args.slug} is not.`,
      { at: 'slug' },
    );
  if (!args.name.trim()) return no<Provisioned>('REQUIRED_MISSING', 'A record has a name a person would say.', { at: 'name' });
  /* THE TIMEZONE IS CHECKED AGAINST THE RUNTIME'S OWN DATA, never against a list shipped here: a
     table of zones is a table that is wrong the next time a government moves one. */
  if (!isZone(args.tz)) return no<Provisioned>('VALUE_MALFORMED', `${args.tz} is not an IANA timezone.`, { at: 'tz' });

  const existing = sql.one<{ id: string; slug: string }>('SELECT id, slug FROM record WHERE singleton = 1');
  /* AN OBJECT IS ADDRESSED, NOT CREATED, so a second create is the ordinary case — a retried signup,
     a queue that delivered twice, a record just restored from a file. It is the same record or it is
     a mistake, and the difference is worth a sentence rather than a silent overwrite of a name. */
  if (existing && existing.id !== args.id)
    return no<Provisioned>(
      'ALREADY_KNOWN',
      `This object already holds ${existing.slug} (${existing.id}). A record is created once, and this is not it.`,
      { at: 'id' },
    );

  const at = instant(now);

  return transaction(() => {
    /* THE SAME ID STILL WRITES ITS OWNER. This returned early on a matching id and skipped the whole
       transaction, so "restore this file and make me the owner" reported `ok` and wrote no `person`
       and no `member` row — the new owner was locked out of a record that said it had been created
       for them. The name, slug, timezone and locale are re-stated too: a create that names them and
       silently keeps the file's is the same failure a step later. */
    sql.exec(
      `INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (singleton) DO UPDATE SET slug = excluded.slug, name = excluded.name, locale = excluded.locale, tz = excluded.tz`,
      args.id,
      args.slug,
      args.name,
      args.locale,
      args.tz,
      formatVersion,
      at,
    );

    /* The owner as a person, which is a MIRROR of the Directory row rather than the row itself:
       actors and `member.person_id` resolve here, and a record that cannot name its own owner
       renders every event as an id. */
    sql.exec(
      'INSERT OR REPLACE INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)',
      args.owner.id,
      args.owner.email ?? null,
      args.owner.name ?? null,
    );
    sql.exec(
      "INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES (?, '*', 'owner', NULL)",
      args.owner.id,
    );
    /* AND THE GRANT IS AN EVENT, like every other grant. `invite` writes `access.grant` per register
       and `removeMember` writes `access.revoke`; only the founding owner — the one person who has
       held the level longest — arrived with no row saying how. The audit view could answer "when did
       this person get owner" for everybody except them, and every record's event log began with an
       owner already in place. 45 §723: target the owner, field `*`, `to_v` owner.

       BY THEMSELVES, because there is nobody else yet: a record is created for its owner, and an
       actor the record cannot name would render as an id for ever. */
    sql.exec(
      'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      mint(),
      at,
      args.owner.id,
      'access.grant',
      `person:${args.owner.id}`,
      'person',
      '*',
      'owner',
    );

    for (const [purpose, key] of Object.entries(args.keys ?? {})) {
      if (!key) continue;
      /* `DO NOTHING`, NOT `OR REPLACE`. `createRecord` re-runs its whole transaction when the id
         matches — the same id still writes its owner — so a second call carrying fresh keys silently
         overwrote the record DEK, and every `grant.ciphertext` sealed under the old one became
         permanently unopenable. `12 §6.1` names that outcome: it reads exactly like corruption, on
         the one screen where "the data is gone" and "the key changed" need different answers.

         A KEY IS WRITTEN ONCE. Rotation is `rewrapped_at` and an UPDATE, which is a different verb
         with a different audit trail; there is no path on which creating a record is how you replace
         its keys. */
      sql.exec(
        `INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)
         ON CONFLICT (purpose) DO NOTHING`,
        purpose,
        key.wrapped,
        key.nonce,
        key.wrapped_by ?? 'kek',
        key.kek_id,
      );
    }

    /* THE HEADER A FILE CARRIES. `dog_meta` is what makes an exported `.brain` say which record it is a
       copy of, and when. Written here rather than at export, because a fact about the record that is
       computed at export time is a fact the file cannot be checked against. */
    for (const [key, value] of [
      ['record_id', args.id],
      ['record_slug', args.slug],
      ['record_name', args.name],
      ['tz', args.tz],
      ['locale', args.locale],
      ['created_at', at],
    ] as const)
      sql.exec('INSERT OR REPLACE INTO dog_meta (key, value) VALUES (?, ?)', key, value);

    /* THE HOURLY SWEEP, as a schedule row rather than a cron. One alarm per customer means the
       record wakes itself; a sweeper that walked every tenant would wake records with nothing to do
       in order to ask them. */
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'purge', 'sweep', '{}', 'pending', 0)
       ON CONFLICT (kind, key) DO NOTHING`,
      mint(),
      instant(now + 3_600_000),
    );

    /* AND THE WEEKLY ANALYSIS, HERE, BESIDE IT. It was armed on the first `install` — which reads as
       reasonable and is wrong twice over: 09 §2 sources `analyse` from the self-improvement detector
       rather than from declarations, and 45 §5.9's detectors read `observation`, which is what a
       record accrues from USE. A record whose registers arrived through `import` or `restore` never
       calls `install`, so it would never have been observed at all.

       A WEEK OUT, and the first fire refuses: 45 §5.9's activity floor wants twenty live rows, three
       distinct event days and a record fourteen days old. Refusing and re-arming is what the
       governors are for, and it costs one row. */
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'analyse', 'weekly', '{}', 'pending', 0)
       ON CONFLICT (kind, key) DO NOTHING`,
      mint(),
      instant(now + 7 * 86_400_000),
    );

    return ok({ id: args.id, slug: args.slug });
  });
}

/** What this record calls itself, or `null` before anybody has said. */
export const recordIdentity = (sql: Sql) =>
  sql.one<{ id: string; slug: string; name: string; tz: string; locale: string; created_at: string }>(
    'SELECT id, slug, name, tz, locale, created_at FROM record WHERE singleton = 1',
  ) ?? null;

function isZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/* ── the sweep ───────────────────────────────────────────────────────────── */

export type Purged = { rows: number; observations: number };

/**
 * The hourly sweep: rows deleted long enough ago to be gone, and counters older than anyone asks.
 *
 * A SOFT DELETE IS NOT A DELETE, AND IT IS NOT FOREVER EITHER. A row deleted today is restorable
 * because deleting the wrong invoice is a thing people do; a row deleted thirty days ago is a row
 * whose owner has moved on, and keeping it means a record grows without bound and every scan pays
 * for it. Thirty days is the window in which "undo" is a real word.
 *
 * ITS EVENTS ARE KEPT, and its number is never reissued. The history of a row outlives the row —
 * that is the whole reason `event` has no foreign key to `entry` — and the counter travels in the
 * export so a purged `#7` is not handed to something else next week.
 *
 * A HUNDRED AT A TIME, in one transaction per run. The alternative is a sweep that holds a write
 * lock for however long the backlog is, on the one thread the record has.
 */
export function purge(
  sql: Sql,
  cutoffMs: number,
  nowMs: number,
  transaction: <T>(fn: () => T) => T,
  mint: () => string,
  limit = 100,
): Purged {
  const cutoff = instant(cutoffMs);

  return transaction(() => {
    const doomed = sql.all<{ id: string; rowid: number; register: string }>(
      'SELECT id, rowid, register FROM entry WHERE deleted_at IS NOT NULL AND deleted_at < ? ORDER BY deleted_at LIMIT ?',
      cutoff,
      Math.max(0, Math.floor(limit)),
    );

    for (const row of doomed) {
      /* EXPLICITLY, all three. Foreign keys are off on every adapter this runs on, so a cascade
         would never fire — and the two shadow tables would keep answering about a row that is gone,
         which is a search result that opens nothing. */
      sql.exec('DELETE FROM entry_vec WHERE id = ?', row.id);
      sql.exec('DELETE FROM entry_fts WHERE rowid = ?', row.rowid);
      sql.exec('DELETE FROM entry WHERE id = ?', row.id);
      /* THE LIST IT WAS IN STAYS IN ITS HISTORY: a row event carries no list, so once the row is gone this is the only
         place that says which list its writes were to, and counts read from the log (Spark's ninety days) still add up. */
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v) VALUES (?, ?, 'system', 'purge', ?, 'entry', 'register', ?, NULL)",
        mint(),
        instant(nowMs),
        `entry:${row.id}`,
        JSON.stringify(row.register),
      );
    }

    /* Four hundred days of daily counters, pruned rather than rolled up: a rolled-up figure answers
       a question nobody asked, and the detectors that read this table read days. */
    const old = new Date(nowMs - 400 * 86_400_000).toISOString().slice(0, 10);
    const before = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM observation WHERE day < ?', old)?.n ?? 0);
    if (before > 0) sql.exec('DELETE FROM observation WHERE day < ?', old);

    if (doomed.length > 0 || before > 0)
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'purge', NULL, NULL, ?)",
        mint(),
        instant(nowMs),
        `${doomed.length} rows and ${before} daily counters removed`,
      );

    return { rows: doomed.length, observations: before };
  });
}
