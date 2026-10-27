/**
 * `.brain` — the whole record as one file, the file a customer can take with them, and `.brainl` its
 * canonical dump.
 *
 * THE THREE SECTIONS ARE NAMED FOR WHAT THEY HOLD: Data, Origin and Governance. They spelled the old
 * extension, `.dog`, and that is the one thing they could not keep — `.dog` now names a PAGE's
 * source, one page to one file (`apps/web/src/lib/dog/source.ts`), so the record took the name it had
 * always been describing. Nothing else about the design moved: the sections, what travels, the
 * manifest and the signature are what they were.
 *
 * THE BYTES KEEP THE OLD SPELLING, DELIBERATELY. The dump's magic line is `#dogl <n>`, the header
 * tables are `dog_meta`, `dog_section`, `dog_manifest` and `dog_sig`, and `application_id` is `DOG!`.
 * Those are inside files that already exist and are checked by readers that already ship, so
 * renaming them is a format revision (`03 §7`) bought for nothing. What a file is CALLED and how a
 * reader RECOGNISES it are two different facts, and only the first one changed.
 *
 * THIS IS THE PRODUCT'S STRONGEST PROMISE and the reason it is a format rather than an export
 * button: a record is a thing you have, not a thing you rent. So the file has to be readable by
 * something other than us, checkable by somebody who does not trust us, and complete enough to open
 * somewhere else — which is three requirements, and each one shows up in the design.
 *
 * READABLE: one line per row, JCS arrays under a `#table` header. `sed`, `sha256sum` and nothing
 * else can verify a table, because a table's row lines joined by LF are exactly what its manifest
 * entry hashes. A zip of JSON would have needed a tool.
 *
 * THREE SECTIONS, ADDRESSABLE SEPARATELY, which is what makes the useful operations cheap: data
 * without origin is a clean handover, origin without data is an audit, governance alone is a pack.
 * `local` never travels — a lockout counter and a device grant are facts about one machine.
 *
 * THE SHAPE IS READ FROM THE SCHEMA, not listed here. `PRAGMA table_info` gives the columns in DDL
 * order and the primary key; `dog_section` says where each table belongs. A list in this file would
 * be a second copy of the schema, and the copy that drifted would be the one that decides what a
 * customer's file contains.
 */

import type { Param, Refusal, Row, Sql } from '@braindog/ports';

import { FORMAT_VERSION, execScript } from './migrate.ts';
import { SEAT_KERNEL_REGISTERS } from './migrations/0044_seat.ts';
import { SIGNS_KEY } from './signs.ts';
import { RENAME_SLASH } from './migrations/0016_slash.ts';
import { isShape } from './shape.ts';
import { Sha256 } from './sha256.ts';

export type Section = 'header' | 'data' | 'origin' | 'governance' | 'local';

/** The header first, then the three that travel. `local` is absent on purpose. */
export const TRAVELS: readonly Section[] = ['header', 'data', 'origin', 'governance'];

export type TableShape = { name: string; section: Section; columns: string[]; pk: string[]; where?: string };

/**
 * Rows a table holds that do not travel, by table. One entry, and it earns its special case.
 *
 * AN `export` EVENT IS A FACT ABOUT THIS INSTALLATION'S COPIES, not about the business — the same
 * argument the `local` section already makes for tokens, device grants and failed logins. It has to
 * be written, because 12 §6's first rule is that a keychain whose reads are not audited cannot answer
 * *"did anything get out"*, and an export is the one read that copies every credential at once.
 *
 * AND IT CANNOT BE IN THE FILE, because then no two exports of an unchanged record are the same
 * bytes — the first one changes the record, and *"has anything changed since my last copy"* stops
 * being `diff` and becomes a tool. Both promises are kept by writing the event to the record and
 * leaving it out of the copy: the question it answers is asked of the live record, which is the only
 * place it can be asked honestly anyway.
 */
const LOCAL_ROWS: Readonly<Record<string, string>> = {
  event: "kind NOT IN ('export', 'import')",
};

/**
 * Every table, in the order it is written: header, data, origin, governance — and within a section,
 * the order the schema declares them, which is the order of the DDL.
 */
export function tables(sql: Sql): TableShape[] {
  const sections = new Map(
    sql.all<{ table_name: string; section: Section }>('SELECT table_name, section FROM dog_section').map((r) => [
      r.table_name,
      r.section,
    ]),
  );

  const real = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rootpage")
    .map((r) => r.name)
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_'));

  const out: TableShape[] = [];
  for (const section of TRAVELS)
    for (const name of real) {
      if (sections.get(name) !== section) continue;
      const info = sql.all<{ name: string; pk: number }>(`PRAGMA table_info(${name})`);
      const columns = info.map((c) => c.name);
      const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      const where = LOCAL_ROWS[name];
      out.push({ name, section, columns, pk: pk.length ? pk : columns.slice(0, 1), ...(where ? { where } : {}) });
    }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RFC 4648 §4, padded. A blob is the one value JSON has no word for. */
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

function unbase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0;
  let acc = 0;
  let at = 0;
  for (const c of clean) {
    acc = (acc << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 255;
    }
  }
  return out;
}

/** One value, as the format writes it. */
export function encode(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return { b64: base64(value) };
  return value;
}

/**
 * One value, as the format reads it, `at` being the `table.column` it goes into.
 *
 * AN OBJECT WITHOUT `b64` IS REFUSED, AND IT IS WHAT THE WORKER WROTE FOR EVERY BLOB. A Durable Object hands a BLOB
 * back as an `ArrayBuffer`, `encode` passed that through, and `JSON.stringify` wrote it as `{}`: every grant's
 * ciphertext and every wrapped key in every hosted export and nightly copy until the adapter in
 * `apps/worker/src/index.ts` was repaired. Those copies are signed and their manifests hash the `{}`, so nothing before
 * this line can tell them from a whole file. Taken as it stood, a Durable Object stored the text `[object Object]`
 * where a wrapped key was and answered `ok`, and `node:sqlite` threw a driver's sentence that named a parameter number.
 * Refused here, both hosts say the same thing and name the column.
 */
export function decode(value: unknown, at?: string): string | number | null | Uint8Array {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'b64' in (value as Record<string, unknown>))
    return unbase64(String((value as { b64: string }).b64));
  if (typeof value === 'object')
    throw new BadLine(
      `${at ?? 'A column'} holds ${JSON.stringify(value)} where the format writes bytes as {"b64": ...}, so the bytes are not in this file. The Cloud wrote every BLOB this way until its export was repaired, and a copy it made before then holds no keychain.`,
      at,
    );
  return value as string | number;
}

/** One table's rows, as lines. Joined by LF, these are exactly what its manifest entry hashes. */
export function projection(sql: Sql, table: TableShape, redactGrants = false): string[] {
  const cols = table.columns.join(', ');
  const order = table.pk.join(', ');
  const blank = redactGrants ? (SEALED[table.name] ?? null) : null;
  return sql
    .all<Record<string, unknown>>(
      `SELECT ${cols} FROM ${table.name}${table.where ? ` WHERE ${table.where}` : ''} ORDER BY ${order}`,
    )
    .map((row) => lineOf(table, row, blank));
}

/** One row as the file holds it, a sealed column blanked when `blank` names it. `projection`'s and `streamBrainl`'s. */
function lineOf(table: TableShape, row: Record<string, unknown>, blank: ReadonlySet<string> | null): string {
  return JSON.stringify(table.columns.map((c) => (blank?.has(c) ? null : encode(row[c]))));
}

/**
 * The columns a redacted export leaves out, by table.
 *
 * AN EXPORT IS THE ONE READ THAT COPIES EVERY GRANT AT ONCE. `openGrant` is deliberately unrouted —
 * the host's own comment says routing it would make a credential reachable by anything holding a
 * token — and `export` is routed and carried the same `ciphertext` and `nonce` for every grant in
 * the record, plus the WRAPPED RECORD KEY and its salt. Wrapped by a KEK that is bytes held
 * elsewhere, that is a copy of the safe without the key; wrapped by a passphrase, it is an offline
 * cracking package with the salt attached.
 *
 * THE ROW STAYS AND THE BYTES GO, which is what makes a redacted export still an export: the labels,
 * what each key opens, its kind, its rotation dates and its scopes all travel, so the file is a
 * complete account of the business with a hole where the secrets were. Somebody restoring it re-adds
 * the credentials, which is the operation they were going to have to do anyway.
 */
const SEALED: Readonly<Record<string, ReadonlySet<string>>> = {
  grant: new Set(['ciphertext', 'nonce', 'prev_ciphertext', 'prev_nonce']),
};

/**
 * Tables a redacted export leaves out entirely.
 *
 * `vault_key.wrapped` IS `NOT NULL`, so blanking it produced a file that could not be imported — a
 * default export that every keychain-provisioned record could make and no record could restore, which
 * is a worse failure than the one being fixed. The row is the wrapped record key and its salt and
 * there is nothing left of it once those are gone, so the honest redaction is the row's absence: an
 * import into a fresh record provisions its own key, which is the operation somebody restoring was
 * going to perform anyway.
 */
const SEALED_TABLES: ReadonlySet<string> = new Set(['vault_key']);

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));

/**
 * The longest text an import carries inside a row's one JSON array; a longer one binds on its own. At six bytes a
 * character escaped, a full row of `DO_LIMITS.column` such texts is about 600 KB, well inside `DO_LIMITS.length`.
 */
const INLINE_TEXT = 1024;

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let out = '';
  for (const byte of new Uint8Array(bytes)) out += HEX[byte];
  return out;
}

/**
 * Write the manifest, then the file.
 *
 * THERE IS NO `exported_at`. A timestamp in the file would mean two exports of an unchanged record
 * produce different bytes, and then "has this changed since I last took a copy" needs a tool instead
 * of `diff`. When the file is signed, the time lives in the signature, which is where a time that is
 * about the ACT rather than the CONTENT belongs.
 */
export async function exportBrainl(
  sql: Sql,
  transaction: <T>(fn: () => T) => T,
  opts: { sections?: readonly Section[]; redactGrants?: boolean } = {},
): Promise<string[]> {
  const wanted = new Set<Section>(opts.sections ?? TRAVELS);
  wanted.add('header');

  const all = tables(sql);
  const body = all.filter((t) => wanted.has(t.section) && t.name !== 'dog_manifest' && t.name !== 'dog_sig');

  const redact = opts.redactGrants === true;
  const rows = new Map<string, string[]>();
  for (const table of body) rows.set(table.name, redact && SEALED_TABLES.has(table.name) ? [] : projection(sql, table, redact));

  const sums = await Promise.all(body.map(async (t) => [t.name, await sha256((rows.get(t.name) ?? []).join('\n'))] as const));

  transaction(() => {
    sql.exec('DELETE FROM dog_manifest');
    for (const [name, sha] of sums)
      sql.exec('INSERT INTO dog_manifest (table_name, rows, sha256) VALUES (?, ?, ?)', name, (rows.get(name) ?? []).length, sha);
    sql.exec('DELETE FROM dog_sig');
  });

  /* `dog_sig` LAST, whatever section it sits in — so a signer appends one line to the end of the
     file rather than splicing into the middle of it. That is the whole reason its position is fixed
     rather than following the section order. */
  const ordered = [...all.filter((t) => t.name !== 'dog_sig'), ...all.filter((t) => t.name === 'dog_sig')];

  const lines: string[] = ['#dogl 1'];
  for (const table of ordered) {
    if (!wanted.has(table.section)) continue;
    lines.push(`#table ${table.name} ${table.columns.join(',')}`);
    /* The kernel writes no row under `dog_sig`: signing needs a private key it must never see. The
       manifest is projected AFTER it was written, so the file describes itself. */
    if (table.name === 'dog_sig') continue;
    for (const line of table.name === 'dog_manifest' ? projection(sql, table) : (rows.get(table.name) ?? []))
      lines.push(line);
  }
  return lines;
}

/**
 * The lines of a file, grouped by the table they belong to.
 *
 * IT IS A SECOND READER, and deliberately so: `importBrainl`'s walk decides what to WRITE and this one
 * decides what the file SAYS ABOUT ITSELF. A checksum computed by the same pass that skips rows,
 * drops columns and takes defaults would hash what the reader made of the file rather than the file,
 * which is the one thing a checksum must not do.
 */
function grouped(lines: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let at: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('#table ')) {
      const name = line.slice('#table '.length).split(' ')[0] ?? '';
      /* A HEADER WITH NO ROWS UNDER IT IS STILL A TABLE, and its hash is the hash of the empty
         string. Skipping it would let somebody delete every row of a table and still match, because
         the manifest names the table and the absence is what has to be caught. */
      at = out.get(name) ?? [];
      out.set(name, at);
      continue;
    }
    if (line.startsWith('#')) continue;
    at?.push(line);
  }
  return out;
}

/** What the file's own `dog_manifest` claims, by table. */
function claimed(lines: readonly string[]): Map<string, { rows: number; sha: string }> {
  const out = new Map<string, { rows: number; sha: string }>();
  for (const line of grouped(lines).get('dog_manifest') ?? []) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(row)) continue;
    const [name, rows, sha] = row as [unknown, unknown, unknown];
    if (typeof name === 'string' && typeof sha === 'string') out.set(name, { rows: Number(rows) || 0, sha });
  }
  return out;
}

/**
 * Which section each table is in, ACCORDING TO THE FILE.
 *
 * `41 §5.11` step 2 forgives a manifest row whose table is missing when that table's section is
 * `local` -- the section that does not travel -- and the file carries its own `dog_section` map for
 * exactly this. Reading the section out of the reader's schema instead would be answering a question
 * about the file with a fact about the reader.
 */
function sections(lines: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of grouped(lines).get('dog_section') ?? []) {
    try {
      const [name, section] = JSON.parse(line) as [unknown, unknown];
      if (typeof name === 'string' && typeof section === 'string') out.set(name, section);
    } catch {
      /* A damaged `dog_section` row is not a section. That table's own checksum catches it. */
    }
  }
  return out;
}

/** The two tables that describe the file rather than travel in it, and so carry no manifest row. */
const UNHASHED: ReadonlySet<string> = new Set(['dog_manifest', 'dog_sig']);

/**
 * The bytes a signature is over.
 *
 * `03 §4`: the canonical projection of `dog_manifest`, ordered by `table_name`. It is the manifest
 * and nothing else because the manifest already covers every row in the file — a hash per table,
 * checked by `checkBrainl` — so signing 64 bytes per table proves the whole file without the signer
 * reading it twice.
 *
 * READ OUT OF THE FILE, NOT OUT OF A DATABASE. A verifier has the lines and nothing else, and a
 * signer that hashed the rows it had in memory would sign something it had not written. The
 * projection is already sorted: `dog_manifest`'s primary key is `table_name`.
 */
export function manifestBytes(lines: readonly string[]): Uint8Array<ArrayBuffer> {
  const rows = grouped(lines).get('dog_manifest') ?? [];
  return owned(new TextEncoder().encode(rows.join('\n')));
}

/**
 * The same bytes, over a buffer that is definitely not shared.
 *
 * WEBCRYPTO'S `BufferSource` IS `ArrayBufferView<ArrayBuffer>`, and both `TextEncoder.encode` and
 * `unbase64` are typed over `ArrayBufferLike` — which includes `SharedArrayBuffer`, which WebCrypto
 * will not take. The kernel compiles under `es2024`, where that distinction does not exist, and the
 * web app compiles this same file under `dom`, where it does: one file, two libs, and this is the
 * only place they disagree. A copy of a few hundred bytes, once per file.
 */
function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/**
 * What a signer hands back. The kernel never sees the private half.
 *
 * `signedAt` COMES FROM THE SIGNER because it is a fact about the ACT and not about the content, and
 * the signer is the one with a clock. It is also the one line of a file that differs between two
 * exports of an unchanged record — which `exportBrainl`'s own header anticipates, and is the price of
 * `dog_sig.signed_at` being `NOT NULL`.
 */
export type Signature = { keyId: string; publicKey: string; sig: string; signedAt: string };

/** `(bytes) => a signature`, or `null` from a deployment that holds no signing key. */
export type Signer = (bytes: Uint8Array) => Promise<Signature | null>;

/**
 * Put the signature on the end of a file.
 *
 * IT IS A FUNCTION OVER LINES, WHICH IS WHY IT CAN LIVE HERE. The kernel must never hold a private
 * key — `12 §6` puts the key hierarchy in the host, and `exportBrainl`'s own comment says the kernel
 * writes no row under `dog_sig` for exactly that reason. So the shape is: the kernel makes the
 * bytes, the host signs them, and this joins the two. Nothing here can sign anything.
 *
 * `dog_sig` IS ALREADY LAST. `exportBrainl` orders it that way whatever section it sits in, so this
 * appends one line rather than splicing into the middle of a file whose hashes are already fixed.
 */
export async function signBrainl(lines: readonly string[], sign: Signer): Promise<string[]> {
  const at = lines.findIndex((l) => l.startsWith('#table dog_sig '));
  if (at < 0) return [...lines];

  const signed = await sign(manifestBytes(lines));
  if (!signed) return [...lines];

  return [...lines.slice(0, at + 1), sigLine(signed), ...lines.slice(at + 1)];
}

/** The one `dog_sig` row, in the table's own column order: `alg, key_id, public_key, sig, signed_at`. */
const sigLine = (signed: Signature): string => JSON.stringify(['ed25519', signed.keyId, signed.publicKey, signed.sig, signed.signedAt]);

/** A `.brain` read front to back and never held whole: what `streamBrainl` answers. */
export type StreamedBrainl = {
  /** Bytes in the whole file, counted before the first is read. */
  length: number;
  /** Each table the manifest names, with the rows it says the table holds. */
  tables: { name: string; rows: number }[];
  /** Fills `out` with exactly the next `out.length` bytes of the file. */
  read(out: Uint8Array): void;
};

/** A streamed copy that saw the record change between its two reads, so the file it was writing is not one moment. */
export class RecordChanged extends Error {
  override readonly name = 'RecordChanged';
}

/** How far one read reaches: keys read ahead, and characters of rows brought back at once (always one row). */
export type PageSize = { look: number; slice: number };

const PAGE: PageSize = { look: 8192, slice: 2 * 1024 * 1024 };

const LF = new Uint8Array([10]);

/**
 * `keys` past `last` (`>`), or up to it (`<=`), in `ORDER BY keys`, which puts NULL first. A row value against the one
 * JSON array `last` binds as, read back by position, because an index can seek on that and no statement grows a mark
 * per key (`param-sweep.test.ts`). Spelled out with `IS` when a value is NULL, which compares as NULL, or is not one
 * JSON carries; `<=` only ever bounds a WITHOUT ROWID key, which SQLite holds NOT NULL.
 */
function beyond(keys: readonly string[], last: readonly Param[], op: '>' | '<='): { where: string; params: Param[] } {
  if (last.every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) {
    const read = keys.map((_, i) => `json_extract(j, '$[${String(i)}]')`).join(', ');
    return { where: `(${keys.join(', ')}) ${op} (SELECT ${read} FROM (SELECT ? AS j))`, params: [JSON.stringify(last)] };
  }
  const params: Param[] = [];
  const from = (i: number): string => {
    const key = keys[i] ?? '';
    const value = last[i] ?? null;
    const end = i === keys.length - 1;
    if (value !== null) params.push(value);
    const over = value === null ? (op === '>' ? `${key} IS NOT NULL` : end ? `${key} IS NULL` : '0') : `${key} ${end ? op : op === '>' ? '>' : '<'} ?`;
    if (end) return over;
    if (value !== null) params.push(value);
    const same = value === null ? `${key} IS NULL` : `${key} = ?`;
    return `(${over} OR (${same} AND ${from(i + 1)}))`;
  };
  return { where: from(0), params };
}

/**
 * Every row of `table` as its line, in `projection`'s order, and never the whole table at once: the keys and sizes of
 * the next `look` rows, then the rows, as many as fit in `slice`. A rowid table is fetched by rowid, which a full-text
 * table can look up and cannot range over, and the rowid is the last key, so rows sharing a key keep one order.
 */
function* rowsOf(sql: Sql, table: TableShape, blank: ReadonlySet<string> | null, page: PageSize): Generator<string, void, undefined> {
  const named = (name: string): string => `"${name}"`;
  const ddl = sql.one<{ sql: string | null }>('SELECT sql FROM sqlite_master WHERE name = ?', table.name)?.sql ?? '';
  const rowid = !/\bWITHOUT\s+ROWID\b/iu.test(ddl);
  const keys = [...table.pk.map(named), ...(rowid ? ['rowid'] : [])];
  const order = keys.join(', ');
  const from = `FROM ${named(table.name)}`;
  const only = table.where ? `(${table.where})` : null;
  const cols = table.columns.map(named).join(', ');
  const picked = keys.map((key, i) => `${key} AS __k${String(i)}`).join(', ');
  const size = table.columns.map((c) => `coalesce(length(${named(c)}), 0)`).join(' + ');
  const keyOf = (row: Row): Param[] => keys.map((_, i) => row[`__k${String(i)}`] ?? null);
  const sizeOf = (row: Row | undefined): number => Number(row?.__size ?? 0);
  let last: Param[] | null = null;
  for (;;) {
    const after = last === null ? null : beyond(keys, last, '>');
    const where = [only, after?.where ?? null].filter((w): w is string => w !== null);
    const looked = sql.all<Row>(
      `SELECT ${picked}, ${size} AS __size ${from}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ${String(page.look)}`,
      ...(after?.params ?? []),
    );
    for (let i = 0; i < looked.length; ) {
      let end = i + 1;
      let chars = sizeOf(looked[i]);
      while (end < looked.length && chars + sizeOf(looked[end]) <= page.slice) chars += sizeOf(looked[end++]);
      const slice = looked.slice(i, end);
      const low = i > 0 ? keyOf(looked[i - 1]!) : last;
      const above = rowid || low === null ? null : beyond(keys, low, '>');
      const top = rowid ? null : beyond(keys, keyOf(slice[slice.length - 1]!), '<=');
      const rows = rowid
        ? sql.all<Record<string, unknown>>(
            `SELECT ${cols} ${from} WHERE rowid IN (SELECT value FROM json_each(?))${only ? ` AND ${only}` : ''} ORDER BY ${order}`,
            `[${slice.map((row) => String(row[`__k${String(keys.length - 1)}`])).join(',')}]`,
          )
        : sql.all<Record<string, unknown>>(
            `SELECT ${cols} ${from} WHERE ${[only, above?.where ?? null, top?.where ?? null].filter((w): w is string => w !== null).join(' AND ')} ORDER BY ${order}`,
            ...(above?.params ?? []),
            ...(top?.params ?? []),
          );
      for (const row of rows) yield lineOf(table, row, blank);
      i = end;
    }
    if (looked.length < page.look) return;
    last = keyOf(looked[looked.length - 1]!);
  }
}

/**
 * The file `exportBrainl` and `signBrainl` make, joined by LF, as bytes read front to back: the same bytes, never whole.
 *
 * THE ROWS ARE READ TWICE, because the manifest comes before the rows it hashes. The first read awaits nothing, so the
 * manifest is one moment of the record; the second is the copy, each table hashed again and held to the first, and a
 * table that changed in between throws `RecordChanged` rather than finish a file that is two moments.
 */
export async function streamBrainl(
  sql: Sql,
  transaction: <T>(fn: () => T) => T,
  opts: { sections?: readonly Section[]; redactGrants?: boolean; sign?: Signer | undefined; page?: PageSize | undefined } = {},
): Promise<StreamedBrainl> {
  const page = opts.page ?? PAGE;
  const wanted = new Set<Section>(opts.sections ?? TRAVELS);
  wanted.add('header');
  const all = tables(sql);
  const body = all.filter((t) => wanted.has(t.section) && t.name !== 'dog_manifest' && t.name !== 'dog_sig');
  const redact = opts.redactGrants === true;
  const rowsIn = (t: TableShape): Iterable<string> =>
    redact && SEALED_TABLES.has(t.name) ? [] : rowsOf(sql, t, redact ? (SEALED[t.name] ?? null) : null, page);
  const encoder = new TextEncoder();

  const first = new Map<string, { rows: number; bytes: number; sha: string }>();
  for (const table of body) {
    const hash = new Sha256();
    let rows = 0;
    let bytes = 0;
    for (const line of rowsIn(table)) {
      const encoded = encoder.encode(line);
      if (rows > 0) hash.update(LF);
      hash.update(encoded);
      bytes += encoded.length;
      rows++;
    }
    /* A PAGE THAT MISSED A ROW WOULD STILL MAKE A FILE THAT VERIFIES, so the count is held to the table's own. */
    const held = redact && SEALED_TABLES.has(table.name) ? 0 : (sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${table.name}"${table.where ? ` WHERE ${table.where}` : ''}`)?.n ?? 0);
    if (Number(held) !== rows) throw new Error(`The copy read ${String(rows)} of the ${String(held)} rows ${table.name} holds, so it stopped before writing anything.`);
    first.set(table.name, { rows, bytes, sha: hash.hex() });
  }

  transaction(() => {
    sql.exec('DELETE FROM dog_manifest');
    for (const [name, sum] of first) sql.exec('INSERT INTO dog_manifest (table_name, rows, sha256) VALUES (?, ?, ?)', name, sum.rows, sum.sha);
    sql.exec('DELETE FROM dog_sig');
  });

  const ordered = [...all.filter((t) => t.name !== 'dog_sig'), ...all.filter((t) => t.name === 'dog_sig')];
  const shape = all.find((t) => t.name === 'dog_manifest');
  const manifest = shape ? projection(sql, shape) : [];
  const signed = opts.sign && all.some((t) => t.name === 'dog_sig') ? await opts.sign(manifestBytes(['#table dog_manifest', ...manifest])) : null;
  const sig = signed ? sigLine(signed) : null;
  const head = (t: TableShape): string => `#table ${t.name} ${t.columns.join(',')}`;

  const size = (line: string): number => encoder.encode(line).length;
  let length = size('#dogl 1');
  for (const table of ordered) {
    if (!wanted.has(table.section)) continue;
    length += 1 + size(head(table));
    if (table.name === 'dog_sig') length += sig === null ? 0 : 1 + size(sig);
    else if (table.name === 'dog_manifest') for (const line of manifest) length += 1 + size(line);
    else length += (first.get(table.name)?.rows ?? 0) + (first.get(table.name)?.bytes ?? 0);
  }

  const changed = (what: string): RecordChanged =>
    new RecordChanged(`The record changed while it was being copied (${what}), so that copy was stopped: a copy is one moment of the record or nothing.`);

  function* pieces(): Generator<Uint8Array, void, undefined> {
    yield encoder.encode('#dogl 1');
    for (const table of ordered) {
      if (!wanted.has(table.section)) continue;
      yield LF;
      yield encoder.encode(head(table));
      if (table.name === 'dog_sig') {
        if (sig !== null) yield* [LF, encoder.encode(sig)];
        continue;
      }
      if (table.name === 'dog_manifest') {
        for (const line of manifest) yield* [LF, encoder.encode(line)];
        continue;
      }
      const was = first.get(table.name);
      const hash = new Sha256();
      let rows = 0;
      for (const line of rowsIn(table)) {
        const encoded = encoder.encode(line);
        if (rows > 0) hash.update(LF);
        hash.update(encoded);
        rows++;
        yield LF;
        yield encoded;
      }
      if (rows !== was?.rows || hash.hex() !== was.sha) throw changed(table.name);
    }
  }

  const source = pieces();
  let piece: Uint8Array = new Uint8Array(0);
  let at = 0;
  let sent = 0;
  return {
    length,
    tables: body.map((t) => ({ name: t.name, rows: first.get(t.name)?.rows ?? 0 })),
    read(out) {
      if (sent + out.length > length) throw new RangeError(`${String(out.length)} bytes were asked of a copy with ${String(length - sent)} left.`);
      for (let n = 0; n < out.length; ) {
        if (at === piece.length) {
          const next = source.next();
          if (next.done) throw changed(`it ended ${String(length - sent - n)} bytes short of the ${String(length)} it was counted at`);
          piece = next.value;
          at = 0;
          continue;
        }
        const take = Math.min(piece.length - at, out.length - n);
        out.set(piece.subarray(at, at + take), n);
        at += take;
        n += take;
      }
      sent += out.length;
      if (sent === length && (at < piece.length || !source.next().done)) throw changed(`it ran past the ${String(length)} bytes it was counted at`);
    },
  };
}

/** `03 §4`: the first 16 hex of SHA-256 over the public key. */
export async function keyIdOf(publicKey: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', owned(publicKey));
  let out = '';
  for (const byte of new Uint8Array(digest)) out += HEX[byte];
  return out.slice(0, 16);
}

/** base64url, which is how `03 §4` writes a key and a signature. */
export function b64url(bytes: Uint8Array): string {
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array<ArrayBuffer> {
  return owned(unbase64(text.replace(/-/g, '+').replace(/_/g, '/')));
}

/**
 * Was this file produced by the instance whose key it carries?
 *
 * WHAT THE SIGNATURE CLAIMS IS NARROW, and `03 §4` says so: *this file was produced by that
 * instance, and no row has changed since*. It does not claim the contents are true, and it does not
 * vouch for a third party's file. Pinning the key to one you fetched independently is
 * `braindog verify --key`'s job; the key the file carries proves integrity and nothing more.
 *
 * NO ROW IS `SIGNATURE_INVALID`, NOT `unsigned`. `41 §5.11` step 3 is explicit, and the reason is
 * that the alternative is a file anybody can produce: strip the signature, edit a row, recompute the
 * manifest, and an importer that accepted unsigned files would take it. The checksum is what stops
 * damage; the signature is what stops an author.
 */
async function signatureOf(
  lines: readonly string[],
  pin: string | undefined,
): Promise<Checked> {
  /* `at` IS THE PART OF `dog_sig` AT FAULT, not the row. Four faults live in that one line and they
     are four repairs (re-export, deploy a build that knows the algorithm, put back a header somebody
     edited, get another copy), and a caller told only `dog_sig` has to read the sentence to
     tell them apart. Where the fault is the row itself (missing, doubled, not JSON) there is no part
     to name and `at` is the row. */
  const no = (fix: string, at = 'dog_sig') => ({ ok: false as const, refusal: { code: 'SIGNATURE_INVALID', at, fix } });

  const rows = grouped(lines).get('dog_sig') ?? [];
  if (rows.length !== 1)
    return no(
      rows.length === 0
        ? 'This file carries no signature. Export it again from a record whose signing key is set up, and it will.'
        : `This file carries ${rows.length} signatures and a file has one.`,
    );

  let row: unknown;
  try {
    row = JSON.parse(rows[0]!);
  } catch {
    return no('The signature line is not readable. The file is damaged.');
  }
  if (!Array.isArray(row)) return no('The signature line is not a row. The file is damaged.');
  const [alg, keyId, publicKey, sig] = row as [unknown, unknown, unknown, unknown];
  if (alg !== 'ed25519')
    return no(`This file is signed with ${String(alg)} and this build checks ed25519.`, 'dog_sig.alg');
  if (typeof keyId !== 'string' || typeof publicKey !== 'string' || typeof sig !== 'string')
    return no('The signature line is missing its key or its signature.');

  const key = unb64url(publicKey);
  /* THE `key_id` IS RECOMPUTED FROM THE KEY, not read. `48 §5.6` step 4: a mismatch is
     `SIGNATURE_INVALID`, because a file that names one key and carries another is a file whose
     header is a claim about a key nobody checked. */
  if ((await keyIdOf(key)) !== keyId)
    return no(
      'The key id in this file is not the id of the key beside it. The header has been edited.',
      'dog_sig.key_id',
    );

  /* A PINNED KEY IS COMPARED BY ITS ID, AND THEN IT, NOT THE FILE'S, IS THE ONE THE SIGNATURE MUST
     VERIFY UNDER. The hole this closes, measured: one row edited, the manifest recomputed and the file
     signed again by a stranger's fresh key passed every check above, because every check above asks the
     file about itself. The id comparison is what names the fault (`dog_sig.key_id`, and both ids in the
     sentence, because a rotated key and a stranger's key are two different repairs). Verifying under
     the pinned bytes rather than the file's is what keeps a 64-bit id from being the whole of the
     proof. */
  let under = key;
  if (pin !== undefined) {
    const named = unb64url(pin);
    const wanted = await keyIdOf(named);
    if (wanted !== keyId)
      return no(
        `This file was signed by key ${keyId}, and the key you named is ${wanted}. It was not produced by the instance that holds that key, or that key has been replaced since.`,
        'dog_sig.key_id',
      );
    under = named;
  }

  let held: Awaited<ReturnType<typeof crypto.subtle.importKey>>;
  try {
    held = await crypto.subtle.importKey('raw', under, { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return no('The public key in this file is not an Ed25519 key.', 'dog_sig.public_key');
  }

  const good = await crypto.subtle.verify('Ed25519', held, unb64url(sig), manifestBytes(lines));
  if (!good)
    return no(
      'The signature does not match this file. It was produced somewhere else, or a row has changed since it was written.',
      'dog_sig.sig',
    );
  return { ok: true, pinned: pin !== undefined };
}

/**
 * What `checkBrainl` answers.
 *
 * `pinned` SAYS WHOSE WORD THE YES IS. Without a key the file vouched for itself, which proves no row
 * changed since it was signed and nothing about who signed it; `48 §5.6` prints that as "key from the
 * file, pass --key to pin", and a caller cannot print it without being told which case it is in.
 */
export type Checked = { ok: true; pinned: boolean } | { ok: false; refusal: Refusal };

/**
 * `key`: the key a file must have been signed by, raw Ed25519 public bytes in base64url, as `03 §4` writes one.
 * `shape`: the file may be a shape copy, opened on a scratch record or a self-host started to allow it. A shape copy
 * carries no signature by design (`shape.ts`), so with this set its signature is not asked for and its manifest still is.
 */
export type CheckOptions = { key?: string | undefined; shape?: boolean | undefined };

/**
 * The refusal for a shape copy put back where it may not go, or `null`.
 *
 * A SHAPE COPY IS A RECORD'S STRUCTURE WITH EVERY VALUE SCRAMBLED, and it opens like any export. Put back over
 * a real record it would replace every name, amount and note with gibberish that reads as his, which is the one thing a
 * copy made to share must never do. So an import refuses it unless it was asked for: a scratch record (the look's
 * `openShape`) or a self-host started with `--allow-shape`. Read off the file's own mark, the same one the gate reads.
 */
export function shapeRefusal(lines: readonly string[], allow = false): Refusal | null {
  if (allow || !isShape(lines)) return null;
  return {
    code: 'IMPORT_SHAPE',
    fix: 'This file is a shape copy, with every word and number in it scrambled, so it opens only on a scratch record and never over a real one. Put back an export of the record instead.',
  };
}

/**
 * Does this file still say what it said when it was written?
 *
 * `41 §5.11` STEP 2, AND IT WAS NOT THERE. Every export computes a SHA-256 per table and writes it
 * into `dog_manifest`; every import ignored it. A truncated download, a row deleted in a text editor,
 * one digit changed in an amount -- all of them imported cleanly and became the record. The manifest
 * was a claim nothing checked, which reads exactly like a manifest that works.
 *
 * IT ANSWERS BEFORE ANYTHING IS WRITTEN. A half-imported record is worse than a refused one, and the
 * refusal has to be able to name the table so somebody knows what they are looking at.
 */
export async function checkBrainl(lines: readonly string[], options: CheckOptions = {}): Promise<Checked> {
  /* A SHAPE COPY NOT ASKED FOR IS REFUSED FIRST, BY NAME. Every reader runs this check before it writes (the record's
     `import`, a self-host's restore, the app's check of a picked file), and without this line each of them answered a
     shape copy with `SIGNATURE_INVALID`, which sends a person looking for a key when the file is the wrong kind. */
  const shaped = shapeRefusal(lines, options.shape === true);
  if (shaped) return { ok: false, refusal: shaped };
  /* THE FORMAT, FROM LINE ONE. `03 §11`: a file from a newer build is refused rather than read,
     because reading it means writing rows whose columns this build does not know into a record it
     then calls a complete copy. The `dog_meta` check inside the writer finds the same fact later,
     and later is after the transaction has opened. */
  /**
   * `FILE_MALFORMED`, WHICH `30 §6` GAINED FOR THE HOLE `33 §9` LEFT OPEN.
   *
   * The import row of `33 §9` enumerates three refusals — `SIGNATURE_INVALID` for a manifest that
   * does not verify, `CHECKSUM_MISMATCH` for rows that do not match it, `FORMAT_NEWER_THAN_READER`
   * for a `user_version` above this reader's — and has no name at all for the commonest way a file
   * arrives wrong: it is not a `.brainl`. Neither of the first two can be said honestly here. Nothing
   * has been checksummed when there is no header to say what the file claims to be, and a person
   * told `CHECKSUM_MISMATCH` goes looking for a manifest that was never read.
   *
   * SO THE CODE IS `FILE_MALFORMED` and it sits beside those three in format and lifecycle, spelled
   * the way `PACK_MALFORMED`, `BODY_MALFORMED` and `VALUE_MALFORMED` are spelled: the artefact, then
   * what is wrong with it. The name it replaced, `MALFORMED_FILE`, was the same two words in the
   * other order and in no registry — which is how one file can carry a code nobody else can find.
   */
  const first = lines.find((l) => l.trim() !== '')?.trim() ?? '';
  if (!first.startsWith('#dogl '))
    return {
      ok: false,
      refusal: {
        code: 'FILE_MALFORMED',
        /* `dogl` IS THE HEADER, AND IT IS WHAT IS WRONG. The fixture for this code said `record`,
           which is where the file was going rather than what is damaged about it, and `40 §6` had
           no address for this code at all. `#dogl` is a header of the same kind as `#table`, so it
           addresses the same way `dog_sig` and `dog_manifest` do. */
        at: 'dogl',
        fix: 'A .brainl file begins with `#dogl <version>`, and this one does not. Re-export it from the record it came from.',
      },
    };
  const format = Number(first.slice('#dogl '.length).trim());
  if (!Number.isInteger(format) || format < 1)
    return {
      ok: false,
      refusal: {
        code: 'FILE_MALFORMED',
        at: 'dogl',
        fix: `The first line does not name a format version. The file is damaged.`,
      },
    };
  if (format > FORMAT_VERSION)
    return {
      ok: false,
      refusal: {
        code: 'FORMAT_NEWER_THAN_READER',
        /* THE FIRST LINE, NOT `dog_meta.format`. The fixture named the `dog_meta` row and this
           check never reads it: the comparison is against the `#dogl` header, and a person sent to
           `dog_meta` goes looking at a row that was not consulted. There is a `dog_meta.format`
           check, further down the import, and it answers a different code. */
        at: 'dogl',
        fix: `This file is format ${format} and this build reads ${FORMAT_VERSION}. Upgrade BrainDog, and it will open.`,
      },
    };

  const held = grouped(lines);
  const says = claimed(lines);
  if (says.size === 0)
    return {
      ok: false,
      refusal: {
        code: 'CHECKSUM_MISMATCH',
        fix: 'This file carries no manifest, so there is nothing to check it against. Re-export it from the record it came from.',
      },
    };

  const where = sections(lines);

  /* EVERY TABLE IN THE FILE, hashed the way the exporter hashed it: its rows joined by LF.
     EACH ARM BELOW CARRIES `dog_manifest.<table>`, WHICH `40 §6` HAS ALWAYS SPECIFIED AND NOTHING
     HAS EVER PRODUCED. The table name was already in the sentence, so the fact was there and only a
     caller reading English could reach it; a file is thousands of lines and `at` is the one field a
     tool can branch on. The no-manifest arm above deliberately carries none: there is no manifest
     to address, and naming a row that is not in the file is how the `fields.<id>` drift happened. */
  for (const [name, rows] of held) {
    if (UNHASHED.has(name)) continue;
    const claim = says.get(name);
    if (!claim)
      return {
        ok: false,
        refusal: {
          code: 'CHECKSUM_MISMATCH',
          at: `dog_manifest.${name}`,
          fix: `The file carries a ${name} table that its own manifest does not list. It has been edited since it was written.`,
        },
      };
    const sum = await sha256(rows.join('\n'));
    if (sum !== claim.sha)
      return {
        ok: false,
        refusal: {
          code: 'CHECKSUM_MISMATCH',
          at: `dog_manifest.${name}`,
          fix: `${name} does not match the checksum in the file's own manifest. The file is damaged or has been edited; re-export it from the record it came from.`,
        },
      };
    /* THE COUNT TOO. It is written beside the hash, and a manifest whose two halves disagree is a
       file assembled by something that was not an export. */
    if (claim.rows !== rows.length)
      return {
        ok: false,
        refusal: {
          code: 'CHECKSUM_MISMATCH',
          at: `dog_manifest.${name}`,
          fix: `The manifest says ${name} has ${claim.rows} rows and the file carries ${rows.length}.`,
        },
      };
  }

  /* AND EVERY TABLE THE MANIFEST NAMES IS IN THE FILE, unless its section is `local` and does not
     travel. Without this, deleting a whole table from a file passes: there is nothing left in the
     file to hash, so there is nothing to compare. */
  for (const [name, claim] of says) {
    if (held.has(name)) continue;
    if (where.get(name) === 'local') continue;
    return {
      ok: false,
      refusal: {
        code: 'CHECKSUM_MISMATCH',
        at: `dog_manifest.${name}`,
        fix: `The manifest lists ${name} with ${claim.rows} rows and the file does not carry it. A table has been removed since it was written.`,
      },
    };
  }

  /* AND THE SIGNATURE LAST, over the manifest every one of those hashes is in. The order is the
     cheap check first: a damaged file names its table, and only a file that is internally consistent
     is worth an Ed25519 verify. */
  /* A SHAPE COPY ASKED FOR IS NOT SIGNED, and never was: a signature says which record made these bytes, and these are
     no record's. Asked for or not, its manifest was checked above like any file's. */
  if (options.shape === true && isShape(lines)) return { ok: true, pinned: false };
  return signatureOf(lines, options.key);
}

export type ImportReport = { tables: number; rows: number };

/**
 * Read a file into an EMPTY record, and refuse otherwise.
 *
 * Merging two records is not an import, it is a decision about which of two facts is true, made per
 * row, by somebody who knows. A tool that guessed would be wrong quietly, which for a record of what
 * somebody is owed is the worst failure available.
 *
 * The rows are copied, not replayed: the events keep their original actors and ids, because a copy
 * of a record that says every fact was written by whoever imported it is not a copy.
 */
export function importBrainl(
  sql: Sql,
  transaction: <T>(fn: () => T) => T,
  lines: Iterable<string>,
  { shape = false }: { shape?: boolean } = {},
): { ok: true; value: ImportReport } | { ok: false; refusal: Refusal } {
  const shapes = new Map(tables(sql).map((t) => [t.name, t]));
  /* MATERIALISED ONCE. `lines` is an `Iterable`, and a generator read twice is empty the second
     time — so the header scan below would have eaten a streamed file and left the import with
     nothing to read. */
  const all = [...lines];
  /* A SHAPE COPY IS REFUSED HERE, BEFORE ANYTHING ELSE IS READ, because every import of a file into a record passes
     through this function and a caller that forgot to ask is the case this exists for. `shape` is the caller saying
     the record is a scratch one, or a self-host started with `--allow-shape`. */
  const shaped = shapeRefusal(all, shape);
  if (shaped) return { ok: false, refusal: shaped };
  /* A file says which record it is by carrying that record's own row, and the tables that name who
     may open it ride on that. */
  const carriesRecord = all.some((l) => l.startsWith('#table record '));

  /* A FILE FROM A NEWER BUILD IS NOT READ, IT IS REFUSED. Reading it would mean writing rows whose
     columns this build does not know into a record it then claims is a complete copy — and the
     customer would find out by opening a record with a table missing from it. The reverse is fine:
     an older file has fewer columns, and the positional read already handles that. */
  const readsFormat = Number(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'format'")?.value ?? 1);

  /* EMPTY MEANS EVERY TABLE THE FILE WOULD TOUCH, not just `entry`.
     Counting entries alone let a record that held registers, decisions and grants but no rows call
     itself empty — and then the first `declaration` line cleared `declaration` while the target's
     own decisions and grants survived beside the file's. That is exactly the per-row merge the
     refusal below says nobody should make, performed silently and half-way. */
  const held = notEmpty(sql, shapes);
  if (held)
    return {
      ok: false,
      refusal: {
        /* `IMPORT_NOT_EMPTY` IS THE REGISTRY'S NAME FOR THIS EXACT SENTENCE — `30 §6`, format and
           lifecycle, *"`import` into a record that has rows, §5 — a refusal, 422"*, and `41 §6`
           gives the fix as *"Import into a new record."* `RECORD_NOT_EMPTY` was a second name for a
           code that already existed, and it mattered more than a synonym usually does: `30 §6`'s
           HTTP row names `IMPORT_NOT_EMPTY` by hand as one of the two refusals a caller might
           mistake for a 409, so a caller reading that row and branching on it never matched. */
        code: 'IMPORT_NOT_EMPTY',
        fix: `An import opens a file into an empty record, and this one already holds ${held}. Merging two records is a decision per row, and it is not this tool’s to make.`,
      },
    };

  let table: TableShape | null = null;
  let header: string[] = [];
  let rows = 0;
  const touched = new Set<string>();

  let out: ImportReport;
  try {
    out = read();
  } catch (e) {
    /* A FILE IS UNTRUSTED INPUT. A truncated line, a row that violates a constraint, a column whose
       value is the wrong type — all of them arrived here as a thrown Error, which a caller reading
       `Result` never sees coming. The transaction had already rolled back; the only thing missing
       was a sentence saying so. */
    /* ONE CODE, TWO SENTENCES, AND THE TERNARY WAS HIDING THE SECOND ONE. The two arms carried
       `MALFORMED_FILE` and `IMPORT_FAILED` — neither in `30 §6`, and `IMPORT_FAILED` appeared
       NOWHERE ELSE in the tree, because the refusals gate's own pattern anchored a code to the
       quote immediately after `code:` and a ternary puts an expression there. A code invisible to
       the gate that counts codes is the failure `tools/gates` exists to catch, made by the tool, and
       the pattern is widened in the same change that removes this one.
       BOTH ARMS ARE `FILE_MALFORMED`. A truncated line and a row the record cannot hold are the same
       answer to the caller — this file did not go in, nothing was written, get another copy — and
       `30 §6` puts several sentences under one code wherever the repair is one repair. */
    return {
      ok: false,
      refusal: {
        code: 'FILE_MALFORMED',
        /* THE LINE THAT THREW KNOWS WHERE IT WAS, and only `BadLine` does. An adapter error from
           further down is a row the record could not hold rather than a place in the file, so it
           carries none rather than blaming whichever table was open at the time. */
        ...(e instanceof BadLine && e.at !== undefined ? { at: e.at } : {}),
        fix:
          e instanceof BadLine
            ? `${e.message} The file is damaged; re-export it from the record it came from.`
            : `The file could not be read into this record: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`,
      },
    };
  }

  return { ok: true, value: out };

  function read(): ImportReport {
  return transaction(() => {
    for (const raw of all) {
      const line = raw.trimEnd();
      if (!line) continue;

      if (line.startsWith('#dogl')) continue;
      if (line.startsWith('#table ')) {
        const [name, columns] = line.slice('#table '.length).split(' ');
        table = shapes.get(name ?? '') ?? null;
        header = (columns ?? '').split(',').filter(Boolean);
        continue;
      }
      if (line.startsWith('#')) continue;
      if (!table || header.length === 0) continue;
      /* THREE HEADER TABLES ARE SKIPPED AND ONE IS NOT, and the difference is what each is about.
         `dog_manifest` describes the FILE, and writing it over the record being built from that file
         would put a hash of the wrong rows in the next export. `dog_section` is the schema's own map
         of itself, rebuilt by the migration. `dog_sig` is a signature over bytes that are not these.

         `dog_meta` is the record's IDENTITY — its id, its slug, its name, its timezone — and opening
         a file into an empty record means becoming that record. An earlier shape skipped the whole
         header, so a record opened from a file could not say what it was called and rendered every
         digest in UTC.

         `migration` travels too and is not imported, for a third reason: the ledger is a fact about
         the database it is in — which migrations were applied to THESE bytes, and when. The target
         applied its own before it could read a file at all, and adopting somebody else's would be
         claiming a history that did not happen here. */
      if (SKIPPED.has(table.name)) continue;
      /* A MEMBERSHIP WITHOUT THE RECORD IT IS ABOUT IS NOT A MEMBERSHIP. A file that carries the
         governance section and no `record` row is a pack or an audit copy, and adopting its members
         would hand somebody an owner-level grant on a record they were never given. */
      if (NEEDS_IDENTITY.has(table.name) && !carriesRecord) continue;

      const values = parseRow(line, table.name);
      if (table.name === 'dog_meta') {
        const [key, value] = values as [string, string];
        if (key === 'format' && Number(value) > readsFormat)
          /* THE ROW THE `format-newer-than-reader` FIXTURE NAMED, and it answers a different code
             ON PURPOSE. A file that is genuinely from a newer build says so on line one and is
             refused there, `FORMAT_NEWER_THAN_READER`, repair: upgrade. Getting past line one and
             then meeting a `dog_meta.format` row above the reader means the file's two statements
             of its own format DISAGREE, which is damage rather than newness, and no upgrade fixes
             it. The sentence used to be `FORMAT_NEWER_THAN_READER`'s word for word, so a person
             holding this refusal was told to upgrade a build that was never behind. The code stays
             `FILE_MALFORMED`; the words are now about the file in front of them. The catch below
             adds "The file is damaged; re-export it from the record it came from." */
          throw new BadLine(
            `This file's first line and its dog_meta format row disagree: the row says format ${value}, and this build reads ${readsFormat}.`,
            'dog_meta.format',
          );
      }

      /* AN EMPTY RECORD IS NOT AN EMPTY DATABASE. The migration seeds rows — the two counters, the
         section map — and the file supersedes them: a `counter` from the seed would restart the
         numbering the file is carrying, and #7 would be issued twice. So the first line for a table
         clears it. `entry` is already empty by the check above; this is about the seed. */
      if (!touched.has(table.name)) sql.exec(`DELETE FROM ${table.name}`);

      /* THE FILE'S COLUMNS, not this build's. A file written by an older version has fewer, and
         reading it positionally against today's list would put a value in the wrong column —
         silently, and in a record of what somebody is owed. */
      const known = header.filter((c) => table!.columns.includes(c));
      const cells = known.map((c) => decode(values[header.indexOf(c)], `${table!.name}.${c}`));
      /* THE ROW'S SHORT VALUES ARE ONE BOUND JSON ARRAY, each column read out of it by its place, so a wide table binds
         one parameter and not one per column, inside the Durable Object's hundred (`DO_LIMITS.variableNumber`). JSON has
         no bytes, so a BLOB keeps its own parameter. So does a long text: one bound value is held to `DO_LIMITS.length`,
         and a row's long texts escaped into one array could pass it where each alone did not. A table has at most
         `DO_LIMITS.column` columns, so a row of only those binds no more than that. They come first because their marks
         stand before the one the subquery binds. */
      const own = (v: unknown): boolean => v instanceof Uint8Array || (typeof v === 'string' && v.length > INLINE_TEXT);
      const bound = cells.filter(own);
      const inline = bound.length < cells.length;
      const reads = cells.map((v, i) => (own(v) ? '?' : `json_extract(r, '$[${i}]')`));
      sql.exec(
        `INSERT INTO ${table.name} (${known.join(', ')}) SELECT ${reads.join(', ')}${inline ? ' FROM (SELECT ? AS r)' : ''}`,
        ...bound,
        ...(inline ? [JSON.stringify(cells.map((v) => (own(v) ? null : v)))] : []),
      );
      touched.add(table.name);
      rows++;
    }
    /* THE FILE'S DECLARATIONS REPLACED THE TABLE, and a file written before migration 2 carries no
       kernel `register.session`, and one written before migration 22 carries 2's, without the app a
       run is in. This record's ledger says both have run, so nothing else would ever put the row
       right. Migration 22's seat is keyed on its checksum, so it changes nothing when the file
       already holds it. */
    /* OR ITS ROWS: a file that brings runs and no declarations still needs each run's `started`, which the seat fills.
       MIGRATION 44'S SEAT, which is 42's carried forward, as 42's was 28's: it seats `register.instructions` too, so a file
       written before 42 carries 28's runs list and no instructions list, and one written before 44 carries 42's, and the
       import would otherwise leave the record on an older list of either. */
    if (touched.has('declaration') || touched.has('entry')) execScript(sql, SEAT_KERNEL_REGISTERS);

    /* AND A FILE WRITTEN BEFORE MIGRATION 16 CARRIES THE ASSISTANT'S OLD NAME in the rows it brings, for the same
       reason: this record's ledger says the rename ran, so nothing else would rename them. The declaration bodies need
       SHA-256 and are renamed by the caller once this transaction commits (`renameDeclarations`). */
    execScript(sql, RENAME_SLASH);

    /**
     * AND `dog_meta.keys` IS RECOMPUTED, because it is the one header row that is not identity.
     *
     * The header travels whatever else does and is adopted whole, for the reason written at the
     * skip above: opening a file into an empty record means becoming that record. `keys` was added
     * to answer a question the header could not otherwise answer — a `vault_key` row travels
     * SEALED, so "no keys" and "keys I cannot open" look alike from outside — and it is a count of
     * rows in another table rather than a fact about who this record is. `vault_key` is in
     * `NEEDS_IDENTITY`, so a `sections: ['data']` file carries the claim and leaves the thing
     * claimed behind: a fresh record with an empty keychain, saying it holds three keys. That is worse
     * than the silence the row replaced, because somebody acts on it.
     *
     * RECOMPUTED AND NOT SKIPPED. An absent row is ambiguous between "no keys" and "written by a
     * build that never wrote the row", which is the ambiguity the row exists to end. By here the
     * target's own `vault_key` holds whatever the file put there, if anything, so it is the only
     * thing that knows and it is asked.
     *
     * CORRECTED AND NEVER MINTED, which is the difference between this and one more `INSERT OR
     * REPLACE`. `provision` writes the row when a record is made; a file from a build older than
     * that carries none, and adding one here would mean an export of the imported record no longer
     * matched the file it came from. The round trip is the only proof this reader is complete, and
     * a correction that changes what a file says about itself is not a correction.
     */
    if (sql.one("SELECT 1 AS x FROM dog_meta WHERE key = 'keys'")) {
      const held = sql.all<{ purpose: string }>('SELECT purpose FROM vault_key ORDER BY purpose').map((r) => r.purpose);
      sql.exec("UPDATE dog_meta SET value = ? WHERE key = 'keys'", held.length === 0 ? 'none' : held.join(','));
    }
    return { tables: touched.size, rows };
  });
  }
}

/**
 * The tables in the file that are about the FILE rather than about the record.
 *
 * `dog_meta` is deliberately not here: see the note at the skip.
 */
const SKIPPED = new Set(['dog_section', 'dog_manifest', 'dog_sig', 'migration']);

/** Thrown when a row line is not a JSON array, so the transaction rolls back and the caller gets a sentence. */
/** A line of the file this reader cannot take, carrying where in the file it was. */
class BadLine extends Error {
  /* THE ADDRESS TRAVELS WITH THE THROW because the catch cannot recover it. By the time the error
     reaches the boundary the loop has moved on, and a refusal that named the table the reader
     happened to be holding would be right by accident and wrong the moment the throw moves. */
  readonly at: string | undefined;
  constructor(message: string, at?: string) {
    super(message);
    this.at = at;
  }
}

function parseRow(line: string, table: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new BadLine(`A row under #table ${table} is not JSON.`, table);
  }
  if (!Array.isArray(parsed)) throw new BadLine(`A row under #table ${table} is not an array of values.`, table);
  return parsed;
}

/**
 * What this record already holds, in the words a person would use — or `null` when it holds nothing.
 *
 * The seed is not content: the migrations write `dog_section`, `dog_meta`, two counters at 1 and the
 * kernel's `register.session` declaration, and a record that has only those has never been written to.
 */
const SEEDED = new Set(['migration', 'record', 'entry_fts', 'entry_vec']);

/**
 * Tables that say WHO may open this record, and therefore only travel with the record itself.
 *
 * A governance-only export carried them, and `notEmpty` waves the `record` row through as identity
 * — so importing one record's governance into another made the source's owner an owner of the
 * target, in a file that was never about that record. A section is a way to leave data behind, not
 * a way to hand somebody a membership.
 */
const NEEDS_IDENTITY = new Set(['member', 'person', 'vault_key']);

function notEmpty(sql: Sql, shapes: Map<string, TableShape>): string | null {
  const found: string[] = [];
  for (const [name, shape] of shapes) {
    /* `record` is identity rather than content — one row saying what this record is called. Opening
       a file into an empty record adopts the file's identity, which is the point; the seeded
       counters are likewise not content. `migration` is a fact about this database and never
       imported at all, and the two shadow tables are derived from `entry`. The kernel's own
       declaration row is seed in the same way, and so is the vital signs' nightly row, armed as any record opens
       (`armSigns` in `index.ts`), which the file's own schedule clears when it carries one. */
    if (shape.section === 'header' || SEEDED.has(name)) continue;
    const n = Number(
      sql.one<{ n: number }>(
        name === 'counter'
          ? "SELECT count(*) AS n FROM counter WHERE next > 1 OR name NOT IN ('decision', 'suggestion')"
          : name === 'declaration'
            ? "SELECT count(*) AS n FROM declaration WHERE pack_id IS NOT 'kernel'"
            : name === 'schedule'
              ? `SELECT count(*) AS n FROM schedule WHERE NOT (kind = 'snapshot' AND key = '${SIGNS_KEY}')`
              : `SELECT count(*) AS n FROM ${name}`,
      )?.n ?? 0,
    );
    if (n > 0) found.push(`${n} ${name}`);
  }
  return found.length ? found.join(', ') : null;
}
