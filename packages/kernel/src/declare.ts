/**
 * Installing a declaration, which is how a record learns what it holds.
 *
 * A DECLARATION ROW IS NEVER EDITED. A new version is a NEW ROW, and the previous one is stamped
 * `superseded_at` in the same transaction. That is not bookkeeping: a `.dog` export replays the
 * declarations to rebuild the schema, and a row that was edited in place cannot say what the record
 * looked like when a two-year-old event was written. The history of the shape is as load-bearing as
 * the history of the rows.
 *
 * THE CHECKSUM IS OVER CANONICAL BYTES. Two declarations that differ only in key order are the same
 * declaration, and reinstalling one must not make a version — otherwise every deploy bumps every
 * register and the version number stops meaning anything.
 *
 * THE INDEXES ARE PART OF THE INSTALL. A field declared `index:` or `unique:` gets a partial index
 * over the same `json_extract` path the predicate compiles to — the same string, from the same
 * function, because if they differ the index is simply never used and the only symptom is that the
 * record got slow.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { jsonPath } from '@braindog/where';

import type { Json } from './coerce.ts';
import { instant } from './migrate.ts';
import { checkInterval, type PullDecl } from './pull.ts';
import { spanMs } from './vault.ts';

/**
 * `34-GRAMMARS` §4. Checked before an id is inlined into an index name or a JSON path.
 *
 * A DOUBLE UNDERSCORE IS NOT AN IDENTIFIER, and the reason is one line below: `__` is the separator
 * in an index name (`entry_i_<register>__<field>`), so a register called `a__b` makes
 * `entry_i_a__b__code` mean two different things — and the code that decides which of a register's
 * indexes to drop then drops somebody else's. A name that cannot be parsed back is a name that will
 * be parsed back wrongly.
 */
const IDENT = /^(?!.*__)[a-z][a-z0-9_]{0,31}$/;

export const KINDS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest'] as const;
export type DeclKind = (typeof KINDS)[number];

export type Declaration = {
  /** `register.obligations` — the kind and the id, which is the form a person says. */
  id: string;
  kind: DeclKind;
  body: Record<string, Json>;
  pack?: string | undefined;
};

/**
 * RFC 8785 canonical JSON, which is the whole of what a checksum needs.
 *
 * Keys sorted, no whitespace, and `JSON.stringify`'s own number and string escaping — which is
 * already RFC 8785's for every value this record can hold, because a field is coerced before it is
 * stored and the coercers do not produce a number JSON cannot round-trip.
 */
export function jcs(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k] as Json)}`).join(',')}}`;
}

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));

export async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let out = '';
  for (const byte of new Uint8Array(bytes)) out += HEX[byte];
  return out;
}

/** The index names of `34-GRAMMARS` §4: `__` separates the register from the field. */
export const indexName = (kind: 'i' | 'u' | 'k', register: string, field?: string, part?: string): string =>
  `entry_${kind}_${register}__${field ?? ''}${part ? `__${part}` : ''}`;

/** A money value is an object, so it takes TWO indexes: one per half. Likewise a quantity. */
const PARTS: Record<string, string[]> = { money: ['amount', 'currency'], quantity: ['value', 'unit'] };

type FieldLike = { id: string; type: string; index?: boolean; unique?: boolean; retired?: boolean };

/**
 * The `CREATE INDEX` statements a register declaration implies.
 *
 * Partial, on `deleted_at IS NULL`, because every read the product makes is of live rows and an
 * index over the deleted ones is pages nobody touches. The path comes from `jsonPath`, the same
 * function the compiler uses — if the two ever differ the index is never used, and the symptom is
 * that the record got slow, a year later, with nothing pointing at the cause.
 */
export function indexesFor(register: string, fields: readonly FieldLike[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.retired || (!f.index && !f.unique)) continue;
    const parts = PARTS[f.type] ?? [''];
    for (const part of parts) {
      const path = `${jsonPath(f.id)}${part ? `.${part}` : ''}`;
      const name = indexName(f.unique ? 'u' : 'i', register, f.id, part || undefined);
      const unique = f.unique && !part ? 'UNIQUE ' : '';
      out.push(
        `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON entry (json_extract(fields, '${path}')) WHERE register = '${register}' AND deleted_at IS NULL`,
      );
    }
  }
  return out;
}

const bad = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

/**
 * What a declaration calls itself.
 *
 * A REGISTER SAYS `id`, A PAGE SAYS `page`, A METRIC SAYS `metric`, and all three are the same
 * field wearing the word a person would use in that document. Requiring `id` everywhere would mean
 * a page carrying its own name twice, and the copy that drifted would be the one nobody reads.
 */
export const ownId = (decl: Declaration): string =>
  String((decl.body.id as string | undefined) ?? (decl.body[decl.kind] as string | undefined) ?? '');

/** The five `09 §6` admits. Closed, and now actually used as one rather than exported and ignored. */
const CHANNELS = ['in-app', 'email', 'push', 'webhook', 'mcp'] as const;

/** At most twelve. A digest longer than that is a report, and nobody reads a report every Monday. */
const SECTION_CEILING = 12;

/**
 * A digest declaration, checked against `09 §6`.
 *
 * EVERY REFUSAL HERE IS ABOUT SOMETHING THAT WOULD OTHERWISE BE SILENT. A channel nobody delivers, a
 * webhook with nowhere to post, a `prose` value no host answers to — none of them throws, and each
 * one produces a digest that reports success and sends less than it says.
 */
function digestBody(decl: Declaration): Refusal | null {
  const body = decl.body as { channels?: unknown; sections?: unknown; prose?: unknown; webhook?: unknown };

  const channels = body.channels;
  if (!Array.isArray(channels) || channels.length === 0)
    return bad('DECLARATION_INVALID', `${decl.id} names no channel, so nothing it assembles would go anywhere.`, 'channels');
  if (channels.length > CHANNELS.length)
    return bad('DECLARATION_INVALID', `A digest has one to ${CHANNELS.length} channels, and ${decl.id} names ${channels.length}.`, 'channels');
  for (const c of channels)
    if (!(CHANNELS as readonly unknown[]).includes(c))
      return bad('DECLARATION_INVALID', `${String(c)} is not a channel.`, 'channels', CHANNELS as unknown as string[]);

  /* A URL A DIGEST POSTS TO IS EGRESS, AND EGRESS IS DECLARED OR IT DOES NOT HAPPEN (04 §7). The
     channel without the address installed cleanly and then posted nowhere, for ever. */
  if (channels.includes('webhook')) {
    const hook = body.webhook as { url?: unknown } | undefined;
    if (typeof hook?.url !== 'string' || !hook.url.startsWith('https://'))
      return bad(
        'DECLARATION_INVALID',
        `${decl.id} posts to a webhook and names no https address to post to. A URL a digest posts to is egress, and egress is declared.`,
        'webhook',
      );
  }

  if (body.sections !== undefined && (!Array.isArray(body.sections) || body.sections.length > SECTION_CEILING))
    return bad('DECLARATION_INVALID', `A digest carries at most ${SECTION_CEILING} sections.`, 'sections');

  /* `prose` IS ONLY EVER `spark` (42 §4.11). Anything else is a host nobody has, and the digest
     would wait behind a model that was never going to answer. */
  if (body.prose !== undefined && body.prose !== 'spark')
    return bad('DECLARATION_INVALID', `A digest's prose is written by spark or by nobody.`, 'prose', ['spark']);

  return null;
}

/**
 * Check a declaration before it is installed, because an id becomes SQL.
 *
 * The register id and every field id are inlined into index names and `json_extract` paths — the one
 * place in this package where an identifier is not a bound parameter — so the grammar check is the
 * security boundary, not a tidiness rule.
 */
export function validate(decl: Declaration): Refusal | null {
  if (!KINDS.includes(decl.kind))
    return bad('DECLARATION_INVALID', `${decl.kind} is not a kind of declaration.`, 'kind', KINDS);
  const own = ownId(decl);
  if (decl.id !== `${decl.kind}.${own}`)
    return bad(
      'DECLARATION_INVALID',
      `A declaration's id is its kind and its own id: ${decl.kind}.${String(own)}, not ${decl.id}.`,
      'id',
    );
  /**
    * A DIGEST'S KEYS ARE TYPED AND CLOSED (09 §6), AND NOTHING CHECKED THEM. `validate` deep-checked
    * registers and returned `null` for everything else — so `channels: ['mcp']` installed and then
    * fell through the send loop's if-chain with no `else`, and the schedule row was marked done and
    * re-armed while the receipt said it went. A `webhook` channel with no `webhook: { url }` did the
    * same. Both are the shape this codebase keeps producing: something complete-looking that reports
    * success and does nothing.
    */
  if (decl.kind === 'digest') return digestBody(decl);

  /* A CONNECTOR'S INTERVAL, CHECKED WHERE IT IS WRITTEN. `checkInterval` has existed with no
     production caller, so `every: '1m'` against a bank installed cleanly — and 25 §9 puts the floor
     at install precisely because one enforced at fire time is one somebody finds out about after
     they have written the declaration and waited for the first run. */
  if (decl.kind === 'ingest' && (decl.body as { channel?: unknown }).channel === 'pull') {
    const said = checkInterval(decl.body as unknown as PullDecl);
    if (!said.ok && 'refusal' in said)
      return bad('DECLARATION_INVALID', said.refusal.fix, said.refusal.at ?? 'every');
    return null;
  }

  /* A `once_per` THAT IS NOT A LIST THROWS AT FIRE TIME, INSIDE A WRITE. `onceKey` calls `.map` on
     it, and nothing checked the shape — so `once_per: 'row'` installed cleanly and then made every
     write to that register raise a `TypeError` out of the rules pass, out of `create`, out of the
     transaction. A declaration's shape is checked where it lands or it is checked by a customer. */
  if (decl.kind === 'rule') {
    /* AND A SPAN THIS RECORD CANNOT READ IS REFUSED WHERE IT IS WRITTEN. `{ schedule: { in: '2 weeks'
       } }` would install and then be dropped at fire time — and the row it was meant to chase is
       exactly the row somebody is trusting it to chase. */
    for (const action of ((decl.body as { then?: unknown }).then ?? []) as { schedule?: { in?: unknown } }[])
      if (action && typeof action === 'object' && action.schedule !== undefined) {
        const span = typeof action.schedule.in === 'string' ? spanMs(action.schedule.in) : null;
        if (span === null)
          return bad(
            'DECLARATION_INVALID',
            `${decl.id} schedules ${String(action.schedule.in)} ahead, and a span is a number and one of d, w, m or y — write 14d.`,
            'then',
          );
      }

    const once = (decl.body as { once_per?: unknown }).once_per;
    if (once !== undefined && (!Array.isArray(once) || once.some((k) => typeof k !== 'string')))
      return bad('DECLARATION_INVALID', `A rule's once_per is a list of field names, and ${decl.id}'s is not.`, 'once_per');
    return null;
  }
  if (decl.kind !== 'register') return null;

  const id = own;
  if (typeof id !== 'string' || !IDENT.test(id))
    return bad(
      'DECLARATION_INVALID',
      `A register id is lower-case letters, digits and single underscores, starting with a letter. ${String(id)} is not.`,
      'id',
    );

  const fields = decl.body.fields;
  if (!Array.isArray(fields) || fields.length === 0)
    return bad('DECLARATION_INVALID', `${id} declares no fields, so it can hold nothing.`, 'fields');

  const seen = new Set<string>();
  for (const raw of fields) {
    const f = raw as unknown as FieldLike;
    /* THE UNDERSCORE IS CHECKED FIRST, and the order is the whole value of the branch: `_rule` fails
       the identifier grammar too, so testing that first made this message unreachable and handed
       back a regex where a sentence belongs. A test caught it, which is what tests on refusal
       wording are for. */
    if (typeof f?.id === 'string' && f.id.startsWith('_'))
      return bad('DECLARATION_INVALID', `${f.id} starts with an underscore, which the kernel keeps for itself.`, f.id);
    if (typeof f?.id !== 'string' || !IDENT.test(f.id))
      return bad(
        'DECLARATION_INVALID',
        `A field id is lower-case letters, digits and single underscores, starting with a letter. ${String(f?.id)} is not.`,
        'fields',
      );
    if (seen.has(f.id)) return bad('DECLARATION_INVALID', `${id} declares ${f.id} twice.`, f.id);
    seen.add(f.id);
  }

  /* A `unique:` ON A PARTED TYPE WAS BUILT AS TWO PLAIN INDEXES. `money` and `quantity` are objects,
     so they index in two halves — and `f.unique && !part` is never true for either, which meant the
     UNIQUE came out of `indexesFor` as an ordinary index wearing the `entry_u_` name. The rule the
     declaration made was enforced nowhere, and the write path's clash check then bound the whole
     object as a parameter and threw a raw TypeError out of `create`, across the boundary this
     package promises nothing throws over. Refused at the declaration, where a sentence fits. */
  for (const raw of fields) {
    const f = raw as unknown as FieldLike;
    if (f.unique && PARTS[f.type])
      return bad(
        'DECLARATION_INVALID',
        `${id}.${f.id} is a ${f.type}, which the record stores in two halves — so it cannot be unique. Make a text field that carries what you mean by "the same one".`,
        f.id,
      );
  }

  const title = decl.body.title;
  if (typeof title !== 'string' || !seen.has(title))
    return bad('DECLARATION_INVALID', `${id} names ${String(title)} as its title, and has no such field.`, 'title', [...seen]);

  const state = decl.body.state;
  if (state !== undefined && (typeof state !== 'string' || !seen.has(state)))
    return bad('DECLARATION_INVALID', `${id} names ${String(state)} as its state, and has no such field.`, 'state', [...seen]);

  return null;
}

/**
 * Which register an index name belongs to, or `null` when it is not one of ours.
 *
 * `entry_<kind>_<register>__<field>[__<part>]`, split on the SEPARATOR rather than trimmed by a
 * prefix — `__` is what divides the register from the field, and a register id may itself contain a
 * single underscore.
 */
export function registerOfIndex(name: string): string | null {
  const m = /^entry_[iuk]_(.*)$/.exec(name);
  if (!m?.[1]) return null;
  const at = m[1].indexOf('__');
  return at <= 0 ? null : m[1].slice(0, at);
}

/** Thrown inside the transaction so it rolls back, and turned into a refusal outside it. */
class UniqueClash extends Error {
  /** `<register>.<field>` — the first word of the message, which is where the caller should look. */
  get at(): string {
    return this.message.split(' ')[0] ?? '';
  }
}

export type Installed = { id: string; version: number; changed: boolean };

/**
 * Install a batch of declarations, in one transaction.
 *
 * A BATCH, because a page that names a register and the register itself must arrive together or the
 * record is briefly inconsistent — and "briefly" is however long the second call takes to fail.
 */
export async function installDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  transaction: <T>(fn: () => T) => T,
): Promise<Result<Installed[]>> {
  const staged = await stageDeclarations(batch);
  /* PASSED THROUGH WHOLE. Rebuilding the envelope by hand dropped whichever arm the rebuild did
     not know about, and there are three of them now. */
  if (!staged.ok) return staged;
  return staged.value(sql, now, transaction);
}

/**
 * Validate and hash a batch, and hand back the WRITE as a synchronous function.
 *
 * THE HASHING IS THE ONLY ASYNC PART, and separating it is what lets a caller put the write inside
 * a transaction it already opened. An install that hashes inside its own transaction cannot be
 * joined to anything — and a pack install that could not join them retired one declaration and
 * installed another from a call that returned a refusal.
 */
export async function stageDeclarations(
  batch: readonly Declaration[],
): Promise<Result<(sql: Sql, now: number, transaction: <T>(fn: () => T) => T) => Result<Installed[]>>> {
  for (const decl of batch) {
    const wrong = validate(decl);
    if (wrong) return { ok: false, refusal: wrong };
  }
  const sums = await Promise.all(batch.map((d) => digest(jcs(d.body))));
  return ok((sql, now, transaction) => applyDeclarations(sql, now, batch, sums, transaction));
}

function applyDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  sums: readonly string[],
  transaction: <T>(fn: () => T) => T,
): Result<Installed[]> {
  const at = instant(now);

  try {
    return install();
  } catch (e) {
    if (e instanceof UniqueClash)
      return no<Installed[]>('UNIQUE_VIOLATION', `${e.message} Fix them, then install again.`, { at: e.at });
    throw e;
  }

  function install(): Result<Installed[]> {
  return transaction(() => {
    const out: Installed[] = [];

    for (const [i, decl] of batch.entries()) {
      const checksum = sums[i]!;
      /* EVERY LIVE ROW, retired or not. Filtering `retired = 0` here meant a retired declaration was
         never stamped `superseded_at` when its successor arrived, so a register retired and then
         reinstalled had TWO rows claiming to be current — and a `.dog` replay, which rebuilds the
         schema by reading them, could not say which shape a two-year-old event was written under. */
      const active = sql.one<{ version: number; checksum: string; retired: number }>(
        'SELECT version, checksum, retired FROM declaration WHERE id = ? AND superseded_at IS NULL ORDER BY version DESC LIMIT 1',
        decl.id,
      );

      /* THE SAME BYTES ARE NOT A NEW VERSION. Otherwise every deploy bumps every register and the
         version number stops being a fact about the shape. */
      /* UNLESS THE ACTIVE ROW IS RETIRED. Reinstalling a retired declaration is how a register comes
         back, and its bytes are usually identical to the ones it went away with — so the same-bytes
         short-circuit would have returned `changed: false` and left it retired, with its indexes
         still gone. A version is the honest answer there: the shape has a new period of being live. */
      if (active && active.checksum === checksum && !active.retired) {
        out.push({ id: decl.id, version: active.version, changed: false });
        continue;
      }

      const version = (
        sql.one<{ v: number | null }>('SELECT MAX(version) AS v FROM declaration WHERE id = ?', decl.id)?.v ?? 0
      ) + 1;

      if (active)
        sql.exec('UPDATE declaration SET superseded_at = ? WHERE id = ? AND version = ?', at, decl.id, active.version);

      sql.exec(
        'INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)',
        decl.id,
        version,
        decl.kind,
        decl.pack ?? null,
        jcs(decl.body),
        checksum,
        at,
      );

      if (decl.kind === 'register') {
        /* `ownId`, NOT `body.id`. A register may say `register: obligations` as well as `id:` —
           `ownId` has admitted both since it was written and `validate` checks through it — and
           reading the one key here meant the documented form installed with an UNDEFINED register:
           no indexes, and a state mirror update bound to nothing. */
        const register = ownId(decl);
        const fields = (decl.body.fields ?? []) as unknown as FieldLike[];

        /* DROPPED BEFORE THEY ARE CREATED. `CREATE INDEX IF NOT EXISTS` alone meant an index
           outlived the declaration that asked for it: take `unique:` off a field and the unique
           index kept refusing duplicates, retire the field entirely and both its indexes stayed.
           The record enforced a rule the declaration no longer makes.

           THE NAME IS PARSED, NOT PREFIX-MATCHED. Two attempts at this were wrong in the same
           direction. `LIKE 'entry_i_a__%'` is wrong because `_` is a LIKE wildcard; matching the
           string prefix in TypeScript is wrong because `__` is also the separator — a register id
           may contain an underscore, so `entry_i_a__b__code` (register `a__b`, field `b__code`?
           no: register `a__b`) starts with register `a`'s prefix. Installing `a` dropped `a__b`'s
           indexes, and the unchanged-checksum short-circuit meant reinstalling `a__b` never put
           them back: a silent full scan nobody could connect to either install. */
        for (const row of sql.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry'",
        ))
          if (registerOfIndex(row.name) === register) sql.exec(`DROP INDEX IF EXISTS ${row.name}`);

        /* A UNIQUE INDEX OVER ROWS THAT ALREADY CLASH is a refusal, not an exception. SQLite raises
           a constraint error at CREATE, which escaped `install` as a throw. */
        for (const f of fields) {
          if (!f.unique || f.retired) continue;
          const clash = sql.one<{ v: string; c: number }>(
            `SELECT json_extract(fields, '${jsonPath(f.id)}') AS v, count(*) AS c FROM entry WHERE register = ? AND deleted_at IS NULL AND v IS NOT NULL GROUP BY v HAVING c > 1 ORDER BY c DESC LIMIT 1`,
            register,
          );
          if (clash) throw new UniqueClash(`${register}.${f.id} cannot be unique: ${clash.c} rows already say ${JSON.stringify(clash.v)}.`);
        }

        for (const statement of indexesFor(register, fields)) sql.exec(statement);

        /* THE MIRROR IS RE-DERIVED, because `entry.state` is a copy of one field and a copy that is
           only written on write goes stale the moment the declaration names a different field. The
           index on `state` and a `where:` over the field itself would then answer differently, which
           is the worst kind of wrong: two readings of one record, both confident. */
        const stateField = typeof decl.body.state === 'string' ? decl.body.state : null;
        sql.exec(
          stateField
            ? `UPDATE entry SET state = json_extract(fields, '${jsonPath(stateField)}') WHERE register = ?`
            : 'UPDATE entry SET state = NULL WHERE register = ?',
          register,
        );
      }

      out.push({ id: decl.id, version, changed: true });
    }

    return ok(out);
  });
  }
}

/**
 * Retire a declaration: the row stays, and `retired` says it is no longer active.
 *
 * NOT A DELETE, and the reason is the same one that makes a new version a new row: an event written
 * two years ago is about a shape, and a record that cannot say what that shape was cannot read its
 * own history.
 */
export function retireDeclarations(sql: Sql, ids: readonly string[], transaction: <T>(fn: () => T) => T): Result<number> {
  return transaction(() => {
    let n = 0;
    for (const id of ids) {
      const hit = sql.one<{ version: number }>(
        'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0',
        id,
      );
      if (!hit) continue;
      sql.exec('UPDATE declaration SET retired = 1 WHERE id = ? AND version = ?', id, hit.version);
      /* AND ITS INDEXES GO WITH IT. A retired register whose unique index stayed behind went on
         refusing duplicates in a register that, as far as every reader is concerned, is not there —
         a refusal citing a rule nobody can look up. */
      if (id.startsWith('register.')) {
        const register = id.slice('register.'.length);
        for (const row of sql.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry'",
        ))
          if (registerOfIndex(row.name) === register) sql.exec(`DROP INDEX IF EXISTS ${row.name}`);
      }
      n++;
    }
    return n === 0 && ids.length > 0
      ? no<number>('DECLARATION_UNKNOWN', `None of ${ids.join(', ')} is installed.`)
      : ok(n);
  });
}
