/**
 * `braindog export --mirror <folder> [--host <host>]` (AGT-A13): the whole record, read as an agent reads it and
 * written as the mirror's plain files (`mirror.ts`).
 *
 * THE LISTS ARE THE RECORD'S OWN INDEX, never a list of lists here: `boot` names every list this sign-in may read,
 * `schema` gives each one's fields in declared order, and `list` pages through its rows fifty at a time to the end,
 * the size `keys list` reads at because a read of a hundred has answered INTERNAL on the Cloud (RQ-AGT-243). A list
 * added to the record tomorrow is in tomorrow's mirror without a line changed here.
 *
 * THE MACHINE'S OWN SIGN-IN, AND NO APPROVAL. It reads, so it needs no operation grant and asks for no six digits:
 * a script can run it every night. It holds what that sign-in may read, and a list it may not is named in the top
 * README as not read, with the record's reason. It sends no session headers, so it names no run (as `signs` does).
 *
 * IT WRITES ONLY INSIDE THE FOLDER NAMED, and of that folder only its own files (`writeMirror`).
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { fixOf, type Result } from '@braindog/ports';

import { budgetOf, clientFor, target, type Target } from './http.ts';
import { refuse, type Saying } from './json.ts';
import { dayHere } from './keys-list.ts';
import { mirrorFiles, writeMirror, type MirrorField, type MirrorList, type MirrorRow } from './mirror.ts';

const USAGE = 'braindog export --mirror takes the folder to write and [--host <host>], and nothing else.';

/** How many rows one read asks for. */
export const MIRROR_PAGE = 50;

/** The most pages one list is read for, 100,000 rows: a cursor that never ends stops, and the list says so. */
const PAGES = 2_000;

/** How many lists are read at once. */
const AT_ONCE = 4;

export type MirrorIo = Saying & {
  env: Record<string, string | undefined>;
  cwd: string;
  /** The hosts file. */
  file: string;
  out: (line: string) => void;
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
};

type Reader = { call: (name: string, args?: Record<string, unknown>) => Promise<Result<unknown>> };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The fields of a list's declaration as the mirror reads them, in the order declared. */
function fieldsOf(decl: Record<string, unknown>): MirrorField[] {
  const out: MirrorField[] = [];
  for (const f of Array.isArray(decl.fields) ? decl.fields : []) {
    if (!isObject(f) || text(f.id) === '' || text(f.type) === '') continue;
    out.push({
      id: text(f.id),
      type: text(f.type),
      ...(text(f.of) === '' ? {} : { of: text(f.of) }),
      ...(text(f.label) === '' ? {} : { label: text(f.label) }),
      ...(text(f.to) === '' ? {} : { to: text(f.to) }),
      ...(isObject(f.labels) ? { labels: Object.fromEntries(Object.entries(f.labels).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
      ...(f.retired === true ? { retired: true } : {}),
    });
  }
  return out;
}

/** One row as the mirror needs it, or null for anything that is not one. */
function rowOf(r: unknown): MirrorRow | null {
  if (!isObject(r) || typeof r.id !== 'string' || !isObject(r.fields)) return null;
  return {
    id: r.id,
    seq: typeof r.seq === 'number' ? r.seq : null,
    fields: r.fields,
    deleted_at: typeof r.deleted_at === 'string' ? r.deleted_at : null,
    ...(typeof r.created_at === 'string' ? { created_at: r.created_at } : {}),
  };
}

/** One list read whole: its declaration and every live row, or the reason it was not read. */
async function readList(client: Reader, id: string, name: string): Promise<{ list: MirrorList; rows: MirrorRow[] }> {
  const unread = (why: string) => ({ list: { id, name, unread: why }, rows: [] });
  const decl = await client.call('schema', { register: id });
  if (!decl.ok) return unread(fixOf(decl));
  if (!isObject(decl.value)) return unread('Its fields could not be read.');
  const d = decl.value;
  const rows: MirrorRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; ; page++) {
    if (page === PAGES) return unread(`Only its first ${String(PAGES * MIRROR_PAGE)} could be read.`);
    const got = await client.call('list', { register: id, limit: MIRROR_PAGE, ...(cursor ? { cursor } : {}) });
    if (!got.ok) return unread(fixOf(got));
    const value = isObject(got.value) ? got.value : {};
    for (const r of Array.isArray(value.rows) ? value.rows : []) {
      const row = rowOf(r);
      if (row && row.deleted_at === null) rows.push(row);
    }
    cursor = typeof value.cursor === 'string' && value.cursor !== '' ? value.cursor : null;
    if (cursor === null) break;
  }
  const seq_prefix = text(d.seq_prefix);
  return {
    list: { id, name: text(d.name) || name, title: text(d.title), fields: fieldsOf(d), ...(seq_prefix === '' ? {} : { seq_prefix }) },
    rows,
  };
}

/** The lists the record's own index names: `boot`'s, by id and name. */
function indexOf(boot: unknown): { id: string; name: string }[] {
  const regs = isObject(boot) && Array.isArray(boot.registers) ? boot.registers : [];
  return regs.filter(isObject).filter((r) => text(r.id) !== '').map((r) => ({ id: text(r.id), name: text(r.name) || text(r.id) }));
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Every list of the index read, a few at a time, answered in the index's order. */
export async function readRecord(client: Reader): Promise<Result<{ lists: MirrorList[]; rows: Map<string, MirrorRow[]> }>> {
  const boot = await client.call('boot');
  if (!boot.ok) return boot;
  const index = indexOf(boot.value);
  const read: { list: MirrorList; rows: MirrorRow[] }[] = new Array(index.length);
  let next = 0;
  const worker = async () => {
    while (next < index.length) {
      const i = next++;
      read[i] = await readList(client, index[i]!.id, index[i]!.name);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, index.length) }, worker));
  return { ok: true, value: { lists: read.map((r) => r.list), rows: new Map(read.map((r) => [r.list.id, r.rows])) } };
}

/**
 * `braindog export --mirror <folder>`, and the exit code: 0 written, 1 refused, 3 unreachable.
 *
 * ONE LINE ON STANDARD OUTPUT: the lists, how many they hold between them, and how many files changed since the folder
 * was last written, then the lists not read, by name. No path and no host is said. Under `--json` the value is
 * `{ lists, held, changed, unread }`.
 */
export async function exportMirror(args: string[], io: MirrorIo): Promise<number> {
  let values: { mirror?: string | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { mirror: { type: 'string' }, host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const folder = values.mirror?.trim();
  if (folder === undefined || folder === '' || folder.startsWith('-')) {
    io.say(USAGE);
    return 1;
  }
  const now = io.now?.() ?? Date.now();
  let to: Target;
  try {
    to = target(values.host, io.env, io.file, now);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /* A BUDGET FOR EACH READ AND NOT ONE FOR THE WHOLE, so a record of many pages is read to the end. */
  const budget = budgetOf(io.env);
  const client: Reader = {
    call: (name, a) => {
      const signal = AbortSignal.timeout(budget);
      return clientFor(to, async () => ({}), io.signal ? AbortSignal.any([signal, io.signal]) : signal).call(name, a);
    },
  };
  const got = await readRecord(client);
  if (!got.ok) return refuse(io, got);
  const { lists, rows } = got.value;
  const files = mirrorFiles(lists, (id) => rows.get(id) ?? [], dayHere(now));
  let changed: number;
  try {
    changed = writeMirror(resolve(io.cwd, folder), files);
  } catch (e) {
    io.say(e instanceof Error ? `The mirror could not be written: ${e.message}` : 'The mirror could not be written.');
    return 1;
  }
  const opened = lists.filter((l) => 'fields' in l);
  const unread = lists.filter((l) => !('fields' in l)).map((l) => l.name);
  const held = opened.reduce((n, l) => n + (rows.get(l.id)?.length ?? 0), 0);
  const tail = unread.length === 0 ? '' : ` Not read: ${unread.join(', ')}.`;
  io.out(`Mirrored ${plural(opened.length, 'list', 'lists')}, ${String(held)} in all. ${plural(changed, 'file', 'files')} changed since the folder was last written.${tail}`);
  io.answer?.({ value: { lists: opened.length, held, changed, unread } });
  return 0;
}
