/**
 * `braindog keys list [--project <name>] [--everywhere] [--json] [--host <host>]`: the Keys index, one line a key
 * (AGT-D08, RQ-AGT-434). Its name, what it opens, where it applies, "sealed" or where it is kept, and the day it expires.
 *
 * WHETHER THAT DAY IS PAST IS THE RECORD'S TO SAY. Today is a day in the record's zone, and this machine's UTC date is
 * another day for some hours of every night, so the record is asked which keys are past theirs (`pastOf`).
 *
 * NEVER A VALUE AND NEVER A GRANT'S ID. A key's row holds, under its secret field, the id of the grant the vault sealed
 * the value in, or what is already known of that grant. This command reads that field for one thing, whether anything
 * is there, and keeps a yes or a no. The rows it hands on, to a person or under `--json`, are built here from five
 * named facts and whether the fifth is past, so a field the record adds later, or anything somebody left in a row, is never printed by passing through.
 * Nor is a row's own id or its number: a person knows a key by its name.
 *
 * READS ONLY, UNDER THE LOGIN, IN PAGES OF FIFTY. It opens no key, so it needs no vault grant, and it sends no session
 * headers, so it names no run and starts no work (as `signs` does). Fifty a read because a read of a hundred keys has
 * answered INTERNAL on the Cloud (RQ-AGT-243), and the pages are followed to the end so a record with 166 keys says 166.
 *
 * THE LIST IS READ BY ITS DECLARATION, the field that is a secret, the one that scopes, the one that is a deadline,
 * with the Agents add-on's own names as the fallback for a record too old to say.
 */

import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, target, type Target } from './http.ts';
import { looksLikeToken } from './install.ts';
import { machine, refuse, type Saying } from './json.ts';
import type { KeysIo } from './keys.ts';

const USAGE = 'braindog keys list takes [--project <name>] or [--everywhere], [--json] and [--host <host>], and nothing else.';

/** The list a key's row lives in. */
const KEYS = 'credentials';

/** How many keys one read asks for. */
export const KEYS_PAGE = 50;

/** The most pages one list is read for: 10,000 keys, far past any record, so a cursor that never ends does. */
const PAGES = 200;

/** Where a key of no project applies, and a project this read could not name. */
const EVERYWHERE = 'Everywhere';
const SOME_PROJECT = 'A project';

/**
 * One key as this command hands it on: five facts, `sealed` and `kept` being the two halves of the fourth, and
 * `expired`, whether the fifth is past. A program reading the document is told, because the day alone would leave it
 * to judge by a clock of its own.
 */
export type KeyRead = { name: string; opens: string; applies: string; sealed: boolean; kept: string | null; expires: string | null; expired: boolean };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The fields of the Keys list this command reads, by id. */
type Shape = { title: string; opens: string; project: string; projects: string; secret: string; where: string; expires: string; state: string; done: string[] };

/* THE LIST OF PROJECTS HAS NO NAME HERE: it is the list the declaration's own scoped link points at, and a Keys list
   that links to none has keys of no project (`core-names`: the command spells no list a use case declares). */
const AGENTS: Shape = { title: 'label', opens: 'opens', project: 'project', projects: '', secret: 'value', where: 'where', expires: 'expires', state: 'state', done: ['retired'] };

/** The shape as the list's own declaration says it, each part the Agents add-on's when the declaration does not say. */
export function shapeOf(decl: unknown): Shape {
  if (!isObject(decl) || !Array.isArray(decl.fields)) return AGENTS;
  const fields = decl.fields.filter(isObject);
  const one = (is: (f: Record<string, unknown>) => boolean): Record<string, unknown> | undefined => fields.find((f) => f.retired !== true && is(f));
  const scoped = one((f) => f.type === 'ref' && isObject(f.scope));
  return {
    title: text(decl.title) || AGENTS.title,
    opens: AGENTS.opens,
    project: text(scoped?.id) || AGENTS.project,
    projects: text(scoped?.to) || AGENTS.projects,
    secret: text(one((f) => f.type === 'secret')?.id) || AGENTS.secret,
    where: AGENTS.where,
    expires: text(one((f) => f.type === 'day' && f.deadline === true)?.id) || AGENTS.expires,
    state: text(decl.state) || AGENTS.state,
    done: Array.isArray(decl.done) ? decl.done.filter((d): d is string => typeof d === 'string') : AGENTS.done,
  };
}

/**
 * WHETHER A VALUE IS SEALED BEHIND A ROW, AND NOTHING ELSE OF WHAT THE FIELD HOLDS. A `list` answers the grant's id
 * there, and `context` answers what is known of the grant; a row pointing at no grant is an index entry, its key kept
 * somewhere the row names (`keysOf` in the web Vault reads it the same two ways).
 */
const sealedIn = (v: unknown): boolean => (isObject(v) ? v.sealed === true : typeof v === 'string' && v !== '');

/**
 * WORDS A PERSON TYPED, WITH ANYTHING SHAPED LIKE A KEY LEFT OUT. What a key opens and where it is kept are free text,
 * and "kept at sk-live-..." typed there was said back whole, in the line and in the document: `printable` takes out
 * control characters only. Each piece between the marks a sentence, a path or a URL puts around one is asked the
 * question `install` and `doctor` ask (`looksLikeToken`), and a piece that is one is said as `[hidden]`. A long word
 * that mixes letters and digits is hidden too, which is the side to be wrong on.
 *
 * ASKED OF THE WORDS AS THEY WILL BE PRINTED, so `printable` comes first: a character nobody sees, typed inside a
 * value, hid its shape from the question and was then taken out for the line, which said the value whole. And the
 * marks a note puts around a value (a code mark, a star, a bar) are marks here too, or a short value kept its mark
 * and passed.
 */
const HIDDEN = '[hidden]';
export const withoutKeys = (words: string): string =>
  printable(words)
    .split(/([\\/=:?&"',;\s()[\]{}<>`*|]+)/)
    .map((piece, i) => (i % 2 === 1 || piece === '' || !looksLikeToken(piece.replace(/[.!]+$/, '')) ? piece : HIDDEN))
    .join('');

/**
 * WHICH KEYS ARE PAST THEIR DAY: the rows the record named when it was asked, or, when it could not say, the day to
 * judge each by, `2026-10-13`.
 */
export type Past = ReadonlySet<string> | string;

/** The keys as they are handed on: retired ones left out, by name. `names` is each project's name by its row. */
export function readKeys(rows: readonly unknown[], names: ReadonlyMap<string, string>, past: Past, shape: Shape = AGENTS): KeyRead[] {
  return rows
    .flatMap((r): KeyRead[] => {
      if (!isObject(r) || !isObject(r.fields)) return [];
      const f = r.fields;
      if (shape.done.includes(text(f[shape.state]))) return [];
      const project = text(f[shape.project]);
      const sealed = sealedIn(f[shape.secret]);
      const expires = text(f[shape.expires]) || null;
      return [
        {
          name: text(f[shape.title]) || 'A key with no name',
          opens: withoutKeys(text(f[shape.opens])),
          applies: project === '' ? EVERYWHERE : (names.get(project) ?? SOME_PROJECT),
          sealed,
          kept: sealed ? null : withoutKeys(text(f[shape.where])) || null,
          expires,
          expired: expires !== null && (typeof past === 'string' ? expires.slice(0, 10) < past : typeof r.id === 'string' && past.has(r.id)),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day as a person reads it, `2026-11-02` as `2 November 2026`; anything else the record sent is said as it is. */
function dayOf(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${String(Number(m[3]))} ${month} ${m[1]!}` : day;
}

/** One key's line. A key past its day says "expired", a word and never a colour. */
export function keyLine(k: KeyRead): string {
  const day = k.expires === null ? 'no expiry day' : `${k.expired ? 'expired' : 'expires'} ${dayOf(k.expires)}`;
  const kept = k.sealed ? 'sealed' : k.kept === null ? 'kept nowhere named' : `kept at ${k.kept}`;
  return [k.name, k.opens === '' ? 'opens nothing named' : `opens ${k.opens}`, k.applies, kept, day].join(' · ');
}

/** "Crumb.gg", "Crumb.gg and Lanternfish", "Crumb.gg, Lanternfish and Glaze". */
const listed = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`);

/** The one sentence for the whole: how many, and how many of them are sealed here. `where` is "" for every key. */
export function countLine(keys: readonly KeyRead[], where: string): string {
  if (keys.length === 0) return where === '' ? 'Your record holds no keys yet.' : `No key ${where === EVERYWHERE ? 'applies everywhere' : `applies to ${where}`}.`;
  const sealed = keys.filter((k) => k.sealed).length;
  const parts = [...(sealed > 0 ? [`${String(sealed)} sealed`] : []), ...(sealed < keys.length ? [`${String(keys.length - sealed)} kept elsewhere`] : [])];
  const place = where === '' ? '' : where === EVERYWHERE ? ' that apply everywhere' : ` in ${where}`;
  return `${String(keys.length)} ${keys.length === 1 ? 'key' : 'keys'}${place}: ${parts.join(', ')}.`;
}

type Reader = { call: (name: string, args?: Record<string, unknown>) => Promise<Result<unknown>> };

/** Every row of one list, read fifty at a time to the end, or the answer that stopped it. */
async function readAll(client: Reader, register: string, where?: string): Promise<Result<unknown[]>> {
  const rows: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page++) {
    const got = await client.call('list', { register, limit: KEYS_PAGE, ...(where === undefined ? {} : { where }), ...(cursor ? { cursor } : {}) });
    if (!got.ok) return got;
    const value = isObject(got.value) ? got.value : {};
    if (Array.isArray(value.rows)) rows.push(...(value.rows as unknown[]));
    cursor = typeof value.cursor === 'string' && value.cursor !== '' ? value.cursor : null;
    if (cursor === null) break;
  }
  return { ok: true, value: rows };
}

const DAY_MS = 86_400_000;
const two = (n: number): string => String(n).padStart(2, '0');

/** The day it is on this machine, in the zone the machine keeps: `2026-10-13`. */
export function dayHere(now: number): string {
  const d = new Date(now);
  return `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const UNSAID = 'Your record did not say which keys are past their day, so each is judged by the date on this machine.';

/**
 * WHICH KEYS ARE PAST THEIR DAY, ASKED OF THE RECORD AND NOT WORKED OUT HERE. Today is a day in the record's zone, and
 * no read under a login alone answers that zone. The record reads `today` in a filter on its own clock, though, so
 * the filter is the question: the keys whose day is `before today`. It was this machine's UTC date, and a key whose
 * day was the 13th read "expires" until three in the morning of the 14th in Cairo.
 *
 * AN ANSWER IS BELIEVED ONLY IF IT COULD BE TRUE. No zone is more than a day from UTC, so a key the record calls past
 * while its day is tomorrow's UTC date or later was not picked by the filter: the host answered every key. That, and a
 * host that refuses the sentence, leave the day on this machine, which is the reader's own, and one sentence saying so.
 */
function pastOf(asked: Result<unknown[]>, expires: string, now: number): Past | null {
  if (!asked.ok) return null;
  const ceiling = new Date(now + DAY_MS).toISOString().slice(0, 10);
  const ids = new Set<string>();
  for (const r of asked.value) {
    if (!isObject(r) || typeof r.id !== 'string') continue;
    const day = isObject(r.fields) ? text(r.fields[expires]).slice(0, 10) : '';
    if (day !== '' && !(day < ceiling)) return null;
    ids.add(r.id);
  }
  return ids;
}

/** The sentence for a record that will not answer, by why. */
const refusalLine = (r: Result<unknown>, to: Target): string => (refused(r) && r.refusal.code === 'UNREACHABLE' ? `${to.key} did not answer.` : printable(fixOf(r)));

/**
 * `braindog keys list`, and the exit code: 0 read, 1 refused, 3 unreachable.
 *
 * THE LINES GO TO STANDARD OUTPUT AND THE COUNT TO STANDARD ERROR, so what a program reads is one line a key and
 * nothing else. Under `--json` the document is `{ keys: [...] }`, the same keys in the same order.
 */
export async function keysList(args: string[], io: KeysIo): Promise<number> {
  let values: { project?: string | undefined; everywhere?: boolean | undefined; json?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: { project: { type: 'string' }, everywhere: { type: 'boolean' }, json: { type: 'boolean' }, host: { type: 'string' } },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const wanted = values.project?.trim();
  if ((wanted !== undefined && values.everywhere === true) || wanted === '') {
    io.say(USAGE);
    return 1;
  }
  const print = io.out ?? ((line: string) => void process.stdout.write(`${line}\n`));
  /* `--json` REACHED THIS VERB UNANSWERED when nobody is waiting for the answer, so the one document is made here, the
     same way (`machine` in `json.ts`) and with nothing else on standard output. */
  const own = values.json === true && io.answer === undefined ? machine(io.say) : null;
  const sinks: Saying & { out: (line: string) => void } = own ?? { say: io.say, answer: io.answer, out: print };
  const code = await read(values.host, wanted, values.everywhere === true, sinks, io);
  if (own) print(JSON.stringify(own.envelope(code)));
  return code;
}

async function read(host: string | undefined, wanted: string | undefined, everywhere: boolean, sinks: Saying & { out: (line: string) => void }, io: KeysIo): Promise<number> {
  const now = io.now?.() ?? Date.now();
  let to: Target;
  try {
    to = target(host, io.env, io.file, now);
  } catch (e) {
    sinks.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /* NO SESSION HEADERS, so the read names no run and the record has no run to open or move. */
  const signal = AbortSignal.timeout(budgetOf(io.env));
  const client: Reader = clientFor(to, async () => ({}), io.signal ? AbortSignal.any([signal, io.signal]) : signal);

  const decl = await client.call('schema', { register: KEYS });
  const shape = shapeOf(decl.ok ? decl.value : null);
  const none: Result<unknown[]> = { ok: true, value: [] };
  const [held, projects, home, late] = await Promise.all([
    readAll(client, KEYS),
    shape.projects === '' ? none : readAll(client, shape.projects),
    shape.projects === '' ? none : client.call('schema', { register: shape.projects }),
    readAll(client, KEYS, `${shape.expires} before today`),
  ]);
  if (!held.ok) return refuse(sinks, held, refusalLine(held, to));

  const title = home.ok && isObject(home.value) ? text(home.value.title) || 'name' : 'name';
  const names = new Map<string, string>();
  for (const r of projects.ok ? projects.value : []) if (isObject(r) && typeof r.id === 'string' && isObject(r.fields) && text(r.fields[title]) !== '') names.set(r.id, text(r.fields[title]));

  /* BY THE PROJECT'S ROW AND NOT ITS PRINTED NAME, so two projects of one name are both kept and neither is "Everywhere". */
  let rows = held.value;
  let where = '';
  const of = (r: unknown): string => (isObject(r) && isObject(r.fields) ? text(r.fields[shape.project]) : '');
  if (everywhere) {
    rows = rows.filter((r) => of(r) === '');
    where = EVERYWHERE;
  } else if (wanted !== undefined) {
    if (!projects.ok) return refuse(sinks, projects, refusalLine(projects, to));
    const ids = new Set([...names].filter(([, name]) => name.toLowerCase() === wanted.toLowerCase()).map(([id]) => id));
    if (ids.size === 0) {
      /* THE NAME TYPED IS NOT SAID BACK (`keys.ts`): a value pasted in its place would be printed to stderr. */
      const yours = printable([...new Set(names.values())].sort((a, b) => a.localeCompare(b)));
      sinks.say(`No project of yours has that name. ${yours.length === 0 ? 'Your record holds no projects yet.' : `Yours are ${listed(yours)}.`}`);
      return 1;
    }
    rows = rows.filter((r) => ids.has(of(r)));
    where = names.get([...ids][0]!) ?? SOME_PROJECT;
  }

  const past = pastOf(late, shape.expires, now);
  const keys = printable(readKeys(rows, names, past ?? dayHere(now), shape));
  sinks.answer?.({ value: { keys } });
  for (const k of keys) sinks.out(keyLine(k));
  /* SAID ONLY WHEN A DAY IS ON A LINE, because a list with no expiry days was judged by nothing. */
  if (past === null && keys.some((k) => k.expires !== null)) sinks.say(UNSAID);
  sinks.say(countLine(keys, printable(where)));
  return 0;
}
