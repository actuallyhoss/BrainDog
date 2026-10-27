/**
 * The mirror: the record as a folder of plain files a person can read and git can diff.
 *
 * `README.md` names every list with its count and the day the folder was written; `<list>/README.md` says the list's
 * name, its fields in their declared order and its count; `<list>/<number>.md` is one live row: its fields first, as
 * plain values, then each document field under its own heading, byte for byte. A list whose rows have no number (a
 * series of points) is one `<list>/series.md`.
 *
 * FIXED ORDER AND FIXED NAMES, so two mirrors of an unchanged record are the same bytes. That is what makes a diff
 * mean something: a changed row is one changed file. Rows go by number, fields by the declaration, never by the order
 * a read answered in.
 *
 * NOTHING OF A GRANT. A `secret` field holds the id of the grant a key is sealed under, and the mirror writes only
 * that one is there. A field the declaration does not name, or names as retired, is never written, so nothing a row
 * carries reaches a file by passing through.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { exponentOf } from 'braindog-render';

/** One field as the declaration gives it: what the mirror needs of `FieldDecl`. */
export type MirrorField = {
  id: string;
  type: string;
  of?: string;
  label?: string;
  labels?: Readonly<Record<string, string>>;
  /** A `ref`'s list. */
  to?: string;
  retired?: boolean;
};

/** A list the reads opened, with its declaration; or one this sign-in may not read, with the record's reason. */
export type MirrorList =
  | { id: string; name: string; title: string; fields: readonly MirrorField[]; seq_prefix?: string }
  | { id: string; name: string; unread: string };

/** One row as `list` answers it. */
export type MirrorRow = { id: string; seq: number | null; fields: Record<string, unknown>; deleted_at?: string | null; created_at?: string };

/** The folder name a list is written under: its id, and only an id that is one plain path segment. */
const SAFE = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

/** A row file, or a list's points: the only files `writeMirror` ever removes. */
const ROW_FILE = /^([a-z0-9][a-z0-9_-]{0,63})\/(?:\d+|series)\.md$/u;

/** The line of the top README that says the day. `writeMirror` does not rewrite the README for that line alone. */
const WRITTEN = 'Written on ';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const read = (l: MirrorList): l is Extract<MirrorList, { fields: unknown }> => 'fields' in l;
const live = (fields: readonly MirrorField[]) => fields.filter((f) => f.retired !== true);
/** A field as a person reads it: its label, or its id said as words, `paid_so_far` as `Paid so far`. */
function nameOf(f: MirrorField): string {
  if (f.label !== undefined && f.label.trim() !== '') return f.label.trim();
  const words = f.id.replace(/_/gu, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** `1,299.00`: digits grouped in threes, so a figure reads the same on every machine whatever its locale. */
function grouped(whole: bigint): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** How many decimals a currency is written with: two for EGP, none for JPY, three for KWD. The renderer's table (`02 §3` rule 1), never CLDR's. */
export function decimalsOf(currency: string): number {
  return exponentOf(currency);
}

/** A money value as written: `EGP 1,299.00`, from integer minor units and its own currency, never converted. */
export function moneyText(amount: number, currency: string): string {
  const d = decimalsOf(currency);
  const minor = BigInt(Math.trunc(amount));
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const unit = 10n ** BigInt(d);
  const whole = grouped(abs / unit);
  const frac = d === 0 ? '' : `.${(abs % unit).toString().padStart(d, '0')}`;
  return `${currency} ${neg ? '-' : ''}${whole}${frac}`;
}

/** JSON with its keys in order, so the same value is the same text. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** What a reference says: the other row's list, its number and its title, by the rows this mirror read. */
type Spoken = (id: string) => string;

/** One plain value of a field of `type`, or null for a value that is not there. */
function plain(type: string, v: unknown, f: MirrorField, spoken: Spoken): string | null {
  if (v === null || v === undefined || v === '') return null;
  switch (type) {
    case 'money':
      return isObject(v) && typeof v.amount === 'number' && typeof v.currency === 'string' ? moneyText(v.amount, v.currency) : stable(v);
    case 'quantity':
      return isObject(v) && v.value !== undefined ? `${String(v.value)} ${String(v.unit ?? '')}`.trim() : stable(v);
    case 'bool':
      return v === true ? 'yes' : v === false ? 'no' : String(v);
    case 'enum':
      return typeof v === 'string' ? (f.labels?.[v] ?? v) : stable(v);
    case 'ref':
      return typeof v === 'string' ? spoken(v) : stable(v);
    case 'file':
      return isObject(v) ? `${typeof v.name === 'string' ? v.name : 'a file'} (${String(v.bytes ?? 0)} bytes)` : 'a file';
    case 'secret':
      /* THAT A KEY IS SEALED, AND NOTHING OF THE GRANT IT IS SEALED UNDER. */
      return 'sealed';
    case 'json':
      return stable(v);
    default:
      return typeof v === 'string' || typeof v === 'number' ? String(v) : stable(v);
  }
}

/** A field's value on one line: a list's elements joined, by the type of each. */
function valueOf(f: MirrorField, v: unknown, spoken: Spoken): string {
  if (f.type === 'list') {
    const items = Array.isArray(v) ? v.map((x) => plain(f.of ?? 'text', x, f, spoken)).filter((x): x is string => x !== null) : [];
    return items.length === 0 ? 'not set' : items.join(', ');
  }
  return plain(f.type, v, f, spoken) ?? 'not set';
}

/** `Label: value`, a value of several lines indented under its label so each line stays its own. */
const line = (label: string, value: string) => `${label}: ${value.replace(/\r?\n/gu, '\n  ')}`;

/** What a row is called: its title field, or its number. */
function titleOf(l: Extract<MirrorList, { fields: unknown }>, r: MirrorRow): string {
  const t = r.fields[l.title];
  return typeof t === 'string' && t.trim() !== '' ? t.trim().replace(/\s+/gu, ' ') : 'Untitled';
}

const numberOf = (l: Extract<MirrorList, { fields: unknown }>, seq: number) =>
  l.seq_prefix !== undefined && l.seq_prefix !== '' && l.seq_prefix !== '#' ? `${l.seq_prefix}${String(seq)}` : `#${String(seq)}`;

/** The fields of one row, then its documents. `heading` is the row's own first line. */
function rowText(l: Extract<MirrorList, { fields: unknown }>, r: MirrorRow, heading: string, spoken: Spoken): string {
  const fields = live(l.fields);
  const lines = [heading, ''];
  for (const f of fields) if (f.type !== 'document') lines.push(line(nameOf(f), valueOf(f, r.fields[f.id], spoken)));
  let text = `${lines.join('\n')}\n`;
  for (const f of fields) {
    if (f.type !== 'document') continue;
    const doc = r.fields[f.id];
    /* BYTE FOR BYTE: the dialect is already markdown, so it is written, not rendered. */
    const body = typeof doc === 'string' && doc !== '' ? doc : 'not set';
    text += `\n## ${nameOf(f)}\n\n${body}${body.endsWith('\n') ? '' : '\n'}`;
  }
  return text;
}

/** A list's count, said by its own name. */
const holds = (name: string, n: number) => `${name} holds ${String(n)}.`;

/** What kind of value a field holds, in words. */
const KINDS: Readonly<Record<string, string>> = {
  text: 'text', document: 'a document', int: 'a whole number', duration: 'a duration', decimal: 'a number', money: 'money',
  quantity: 'an amount and its unit', day: 'a day', instant: 'a moment', bool: 'yes or no', enum: 'a choice', file: 'a file',
  url: 'a web address', email: 'an email address', secret: 'a sealed key', json: 'structured data',
};

function kindOf(f: MirrorField, names: ReadonlyMap<string, string>): string {
  if (f.type === 'ref') return f.to !== undefined ? `a link to ${names.get(f.to) ?? f.to}` : 'a link';
  if (f.type === 'list') return f.of === 'ref' && f.to !== undefined ? `links to ${names.get(f.to) ?? f.to}` : `a list of ${KINDS[f.of ?? 'text'] ?? f.of ?? 'text'}`;
  return KINDS[f.type] ?? f.type;
}

/**
 * Every file of the mirror, by its path inside the folder, and the text it holds.
 *
 * `rowsOf` answers a read list's rows; a deleted one is skipped wherever it is. `day` is the day the folder is
 * written, `2026-10-14`, and is said only in the top README.
 */
export function mirrorFiles(lists: readonly MirrorList[], rowsOf: (list: string) => readonly MirrorRow[], day: string): Map<string, string> {
  const files = new Map<string, string>();
  /* A LIST WHOSE ID IS NOT ONE PLAIN PATH SEGMENT IS NOT WRITTEN, so nothing a declaration says can reach outside the folder. */
  const sorted = [...lists].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const names = new Map(sorted.map((l) => [l.id, l.name]));
  const rows = new Map<string, MirrorRow[]>();
  for (const l of sorted) if (read(l) && SAFE.test(l.id)) rows.set(l.id, rowsOf(l.id).filter((r) => r.deleted_at === null || r.deleted_at === undefined));

  /* WHAT A REFERENCE SAYS, by every live row read: a link to a row this sign-in did not read, or one deleted, says so. */
  const said = new Map<string, string>();
  for (const l of sorted) {
    if (!read(l)) continue;
    for (const r of rows.get(l.id) ?? []) said.set(r.id, r.seq === null ? `${l.name}, ${titleOf(l, r)}` : `${l.name} ${numberOf(l, r.seq)}, ${titleOf(l, r)}`);
  }
  const spoken: Spoken = (id) => said.get(id) ?? 'something this mirror does not hold';

  const top = ['# Your record', '', `${WRITTEN}${day}.`, ''];
  for (const l of sorted) {
    if (!read(l) || !SAFE.test(l.id)) {
      top.push(`- ${l.name}: not read. ${read(l) ? 'Its name is not one a folder can take.' : l.unread}`);
      continue;
    }
    const own = rows.get(l.id) ?? [];
    top.push(`- [${l.name}](${l.id}/README.md): ${String(own.length)}`);

    const fields = live(l.fields);
    const head = [`# ${l.name}`, '', holds(l.name, own.length), '', '## Fields', '', ...fields.map((f) => `- ${nameOf(f)}: ${kindOf(f, names)}`)];
    files.set(`${l.id}/README.md`, `${head.join('\n')}\n`);

    const numbered = own.filter((r): r is MirrorRow & { seq: number } => typeof r.seq === 'number').sort((a, b) => a.seq - b.seq);
    for (const r of numbered) files.set(`${l.id}/${String(r.seq)}.md`, rowText(l, r, `# ${titleOf(l, r)}\n\n${l.name} ${numberOf(l, r.seq)}`, spoken));

    /* POINTS HAVE NO NUMBER, so a series is one file in the order its points were made. */
    const points = own.filter((r) => typeof r.seq !== 'number').sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : (a.created_at ?? '') > (b.created_at ?? '') ? 1 : a.id < b.id ? -1 : 1));
    if (points.length > 0) files.set(`${l.id}/series.md`, [`# ${l.name}`, '', ...points.map((r) => rowText(l, r, `## ${r.created_at ?? titleOf(l, r)}`, spoken))].join('\n'));
  }
  files.set('README.md', `${top.join('\n')}\n`);
  return files;
}

/** Every file under `dir`, by its path inside `root` with `/` between folders. */
function filesUnder(root: string, dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    /* NOT INTO `.git` OR ANY FOLDER OF A DOT: nothing the mirror writes starts with one. */
    if (name.startsWith('.')) continue;
    const at = join(dir, name);
    if (statSync(at).isDirectory()) filesUnder(root, at, out);
    else out.push(relative(root, at).split(sep).join('/'));
  }
  return out;
}

/** The top README without the line that says the day. */
const undated = (text: string) => text.split('\n').filter((l) => !l.startsWith(WRITTEN)).join('\n');

/**
 * Writes the mirror into `folder` and answers how many files changed.
 *
 * ONLY WHAT CHANGED IS WRITTEN, and a row file whose row is gone is removed, inside a list this mirror read: a list
 * that was not read keeps its files, since nothing says its rows are gone. Nothing else in the folder is touched, so
 * a `.git` beside the files, or a note of the person's own, stays as it was.
 *
 * THE TOP README IS NOT REWRITTEN FOR ITS DAY ALONE. Its day is the day the folder last changed, so a night with
 * nothing new leaves every file as it was and git sees no change at all.
 */
export function writeMirror(folder: string, files: ReadonlyMap<string, string>): number {
  const root = resolve(folder);
  const inside = (path: string) => {
    const at = resolve(root, path);
    if (at !== root && !at.startsWith(`${root}${sep}`)) throw new Error('A mirror writes only inside its own folder.');
    return at;
  };
  let changed = 0;
  const was = (at: string) => (existsSync(at) ? readFileSync(at, 'utf8') : null);
  for (const [path, text] of files) {
    if (path === 'README.md') continue;
    const at = inside(path);
    if (was(at) === text) continue;
    mkdirSync(resolve(at, '..'), { recursive: true });
    writeFileSync(at, text);
    changed++;
  }
  const opened = new Set([...files.keys()].filter((p) => p.endsWith('/README.md')).map((p) => p.slice(0, -'/README.md'.length)));
  for (const path of filesUnder(root, root)) {
    const m = ROW_FILE.exec(path);
    if (!m || !opened.has(m[1]!) || files.has(path)) continue;
    rmSync(inside(path));
    changed++;
  }
  const top = files.get('README.md');
  if (top !== undefined) {
    const at = inside('README.md');
    const before = was(at);
    if (before !== top && (changed > 0 || before === null || undated(before) !== undated(top))) {
      mkdirSync(root, { recursive: true });
      writeFileSync(at, top);
      changed++;
    }
  }
  return changed;
}
