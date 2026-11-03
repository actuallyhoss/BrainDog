/**
 * The Kennel's second look at a submission, and what it says to records after a version is listed (DESIGN.md §4.1, §8;
 * PHASES.md Lane H). Rules only, no storage, as `kennel.ts` is: a host hands in what it read and writes what comes back.
 *
 *   - READABLE SOURCE. A script or a drawn view whose code is minified or obfuscated is refused, said plainly, because
 *     the operator reviews what an add-on does by reading it, and a person's agent reads it again on Decide.
 *   - LOOKALIKE NAMES. An id or a title a letter or two from one already listed is flagged for the operator, never
 *     refused: a near name is often honest. A flagged version from a trusted publisher waits for review too.
 *   - WIDER REACH. A trusted publisher's version lists at once only when it reaches nothing the version before it did
 *     not (`reachAdded`). Its first version always waits.
 *   - ADVISORIES. The operator's word on a listed add-on: `warn` puts one card on Needs you, `disable` turns it off and
 *     puts one card saying why. Records read the file beside the index. The owner may turn it back on knowingly.
 *   - KEY STATEMENTS. An author's signed rotation or revocation, published for every record to read with the index.
 *   - REPORTS. Anybody signed in may say an add-on is wrong; the operator reads them beside the review list.
 *   - THE PRE-REVIEW NOTE. A model's one note for the reviewer: what it says, what it reaches, what does not match. It
 *     is shown and never decides.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { CatalogueIndex, EntryKind, Reach } from './catalogue.ts';
import { isRevocation, isRotation, verifiedStatements, verifyRevocation, verifyRotation, type KeyRevocation, type KeyRotation } from './signing.ts';

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const chars = (s: string): number => [...s].length;
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/u;

/* ── readable source ────────────────────────────────────────────────────── */

/** The longest line a readable script holds: hand-written code reaches about 600 (a long pattern in the Gmail add-on), minified code thousands. A data: picture in a drawn view is not counted. */
export const LINE_MOST = 1_000;
/** Past this many characters, a script of very few lines is one squeezed onto them. */
const SQUEEZED_FROM = 3_000;
/** The most characters a readable script's lines average, once it is long enough to judge. */
const AVERAGE_MOST = 160;
/** The longest run of encoded text a script may carry: past it, the script carries code or data nobody can read. */
const ENCODED_MOST = 512;

/** Every piece of code a file carries, by where it is: each script's `source` and each drawn view's `code`. */
export function codeIn(doc: unknown): { at: string; what: 'script' | 'view'; text: string }[] {
  const out: { at: string; what: 'script' | 'view'; text: string }[] = [];
  const walk = (v: unknown, at: string): void => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${at}[${String(i)}]`));
      return;
    }
    if (!isMap(v)) return;
    if (v.kind === 'drawn' && typeof v.code === 'string') out.push({ at: `${at}.code`, what: 'view', text: v.code });
    /* A SCRIPT IS NAMED BY `script` BESIDE ITS `source`, flat in a pack file or under `body` in a declaration. A metric or a
       block's `source` is a list it reads, never code. */
    if (typeof v.source === 'string' && typeof v.script === 'string') out.push({ at: `${at}.source`, what: 'script', text: v.source });
    for (const [k, x] of Object.entries(v)) if (k !== 'source' && k !== 'code') walk(x, at === '' ? k : `${at}.${k}`);
  };
  walk(doc, '');
  return out;
}

/**
 * Why this code is not readable, as the end of a sentence, or `null`. Heuristics, each said plainly: a line too long
 * to read, a script squeezed onto a few lines, names in the `_0x1f2e` shape obfuscators write, text written as escape
 * codes, code built from text at run time, and long runs of encoded text.
 */
export function unreadable(text: string, what: 'script' | 'view'): string | null {
  /* A DRAWN VIEW MAY HOLD ITS PICTURES INLINE, as data: addresses (the renderer's rule), so those are read as one word. */
  const plain = what === 'view' ? text.replace(/data:[a-z]+\/[a-z0-9.+-]+(?:;[a-z0-9=-]+)*,[^"')\s]*/giu, 'data:') : text;
  const lines = plain.split(/\r?\n/u);
  const long = lines.findIndex((l) => chars(l) > LINE_MOST);
  if (long !== -1) return `line ${String(long + 1)} is ${String(chars(lines[long]!))} characters long, and a readable line is at most ${String(LINE_MOST)}`;
  if (chars(plain) > SQUEEZED_FROM && lines.length <= 3) return `it is ${String(chars(plain))} characters on ${String(lines.length)} lines, which reads as minified`;
  /* A MINIFIER THAT WRAPS ITS LINES still writes them full: hand-written code averages well under a hundred characters a line. */
  const average = chars(plain) / lines.length;
  if (chars(plain) > SQUEEZED_FROM && average > AVERAGE_MOST) return `its lines average ${String(Math.round(average))} characters, which reads as minified`;
  const hexNames = plain.match(/\b_0x[0-9a-f]{3,}\b/giu)?.length ?? 0;
  if (hexNames >= 3) return 'it names things like _0x1a2b, the way an obfuscator writes code';
  const escapes = plain.match(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/giu)?.length ?? 0;
  if (escapes >= 24) return 'it writes its text as escape codes, which hides what it says';
  if (/\beval\s*\(|\bnew\s+Function\s*\(|(?<![\w.])Function\s*\(\s*['"`]/u.test(plain)) return 'it builds code from text while it runs (eval or Function), so what it does cannot be read here';
  if (what === 'script' && new RegExp(`[A-Za-z0-9+/=_-]{${String(ENCODED_MOST)},}`, 'u').test(plain)) return `it carries a run of more than ${String(ENCODED_MOST)} characters of encoded text`;
  return null;
}

/** The first piece of code in a file that does not read, as the Kennel refuses it, or `null`. */
export function readableFault(doc: unknown): Refusal | null {
  for (const c of codeIn(doc)) {
    const why = unreadable(c.text, c.what);
    if (why !== null)
      return {
        code: 'PACK_MALFORMED',
        fix: `The Kennel lists code a person can read, and this ${c.what === 'script' ? 'script' : 'drawn view'} cannot be read: ${why}. Submit the source as you wrote it, not minified or packed.`,
        at: c.at,
      };
  }
  return null;
}

/* ── lookalike names ────────────────────────────────────────────────────── */

/** Edit distance with swaps of two neighbours counted once (optimal string alignment), stopped early past `most`. */
export function distance(a: string, b: string, most = 3): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      best = Math.min(best, v);
    }
    if (best > most) return most + 1;
  }
  return d[a.length]![b.length]!;
}

const foldName = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/gu, '');

/**
 * What a new id or title looks like among those listed, as lines for the operator: one per near name, at most three.
 * Within two edits (one for a name of five letters or fewer), or the same once spacing, case and dashes are folded.
 * An entry's own id is never its own lookalike.
 */
export function lookalikes(indexes: readonly CatalogueIndex[], id: string, title: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const near = (mine: string, theirs: string): boolean => {
    if (mine === '' || theirs === '') return false;
    if (mine === theirs) return true;
    const most = Math.min(mine.length, theirs.length) <= 5 ? 1 : 2;
    return distance(mine, theirs, most) <= most;
  };
  for (const index of indexes)
    for (const e of index.entries) {
      if (e.id === id || seen.has(e.id)) continue;
      const byId = near(foldName(id), foldName(e.id));
      const byTitle = near(foldName(title), foldName(e.title));
      if (!byId && !byTitle) continue;
      seen.add(e.id);
      out.push(byId ? `Its id ${id} is close to ${e.id}, listed as ${e.title}.` : `Its title is close to ${e.title} (${e.id}).`);
      if (out.length === 3) return out;
    }
  return out;
}

/* ── wider reach ────────────────────────────────────────────────────────── */

/**
 * What a version reaches that the version before it did not, in plain lines, or `[]` for nothing new. With no version
 * before, everything it reaches is new, and a version that reaches nothing at all still says it is a first version.
 */
export function reachAdded(before: Reach | null, after: Reach): string[] {
  if (before === null) return ['It is the first version listed.'];
  const added = (a: readonly string[] | undefined, b: readonly string[] | undefined): string[] => (b ?? []).filter((x) => !(a ?? []).includes(x));
  const out: string[] = [];
  const say = (what: string, xs: string[]): void => {
    if (xs.length > 0) out.push(`${what}: ${xs.join(', ')}.`);
  };
  say('Needs more modules', added(before.modules, after.modules));
  say('Adds lists', added(before.lists, after.lists));
  say('Adds pages', added(before.pages, after.pages));
  say('Adds automations', added(before.rules, after.rules));
  say('Teaches agents', added(before.skills, after.skills));
  const call = (c: Reach['calls_out'][number]): string => `${c.host ?? 'an address a key holds'}${c.key === null ? '' : ` with key ${c.key}`}`;
  say('Calls out to', added(before.calls_out.map(call), after.calls_out.map(call)));
  const use = (u: { id: string; writes: boolean }): string => `${u.writes ? 'changes' : 'reads'} ${u.id}`;
  const was = new Set((before.uses ?? []).flatMap((u) => (u.writes ? [use(u), use({ ...u, writes: false })] : [use(u)])));
  say('Of yours, now', (after.uses ?? []).map(use).filter((u) => !was.has(u)));
  return out;
}

/* ── advisories ─────────────────────────────────────────────────────────── */

export const ADVISORIES_FORMAT = 1;
export const ADVISORIES_FILE = 'advisories.json';
export const ADVICE_REASON_MOST = 280;
/** The most advisories the file keeps; a withdrawn one leaves it. */
export const ADVISORIES_MOST = 500;
export const SEVERITIES = ['low', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * The operator's word on one add-on. `versions` are exact versions, `<x.y.z` or `<=x.y.z`, or `*` for every version.
 * `at` is when it was said, and with the id it names the advisory, so a record acts on each one once.
 */
export type Advisory = { kind: EntryKind; id: string; versions: string[]; severity: Severity; action: 'warn' | 'disable'; reason: string; at: string };
export type Advisories = { format: typeof ADVISORIES_FORMAT; advisories: Advisory[] };

export const emptyAdvisories = (): Advisories => ({ format: ADVISORIES_FORMAT, advisories: [] });

const RANGE = /^(?:\*|<=?(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})|(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))$/u;

const cmp = (a: string, b: string): number => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** Whether an advisory speaks of this version. */
export function advisoryCovers(a: Pick<Advisory, 'versions'>, version: string): boolean {
  return a.versions.some((r) => (r === '*' ? true : r.startsWith('<=') ? cmp(version, r.slice(2)) <= 0 : r.startsWith('<') ? cmp(version, r.slice(1)) < 0 : r === version));
}

const isAdvisory = (v: unknown): v is Advisory =>
  isMap(v) &&
  (v.kind === 'pack' || v.kind === 'usecase') &&
  typeof v.id === 'string' &&
  ID.test(v.id) &&
  Array.isArray(v.versions) &&
  v.versions.length > 0 &&
  v.versions.every((r) => typeof r === 'string' && RANGE.test(r)) &&
  SEVERITIES.includes(v.severity as Severity) &&
  (v.action === 'warn' || v.action === 'disable') &&
  typeof v.reason === 'string' &&
  v.reason.trim() !== '' &&
  chars(v.reason) <= ADVICE_REASON_MOST &&
  typeof v.at === 'string' &&
  !Number.isNaN(Date.parse(v.at));

/**
 * The advisories file as stored or served, or `null` when it is not one. An advisory that does not read is dropped, so
 * one bad line never hides the rest from a record.
 */
export function readAdvisories(doc: unknown): Advisories | null {
  if (!isMap(doc) || doc.format !== ADVISORIES_FORMAT || !Array.isArray(doc.advisories)) return null;
  return {
    format: ADVISORIES_FORMAT,
    advisories: doc.advisories.filter(isAdvisory).map((a) => ({ kind: a.kind, id: a.id, versions: [...a.versions], severity: a.severity, action: a.action, reason: a.reason, at: a.at })),
  };
}

/** Two files as one, the first's first: a folder's own and the public Kennel's, each advisory once. */
export function mergeAdvisories(...files: (Advisories | null)[]): Advisories {
  const all = files.flatMap((f) => f?.advisories ?? []);
  return { format: ADVISORIES_FORMAT, advisories: all.filter((a, i) => all.findIndex((b) => b.kind === a.kind && b.id === a.id && b.at === a.at) === i) };
}

/** The operator's ask: say an advisory, or withdraw every one on an id. */
export type AdviseAsk =
  | { kind: EntryKind; id: string; versions: string[]; severity: Severity; action: 'warn' | 'disable'; reason: string }
  | { kind: EntryKind; id: string; action: 'withdraw' };

/** `POST advise`'s body. */
export function readAdvise(body: unknown): Result<AdviseAsk> {
  if (!isMap(body)) return no('BODY_MALFORMED', 'advise takes a JSON object: { kind, id, versions, severity, action, reason }.', { at: 'body' });
  if (body.kind !== 'pack' && body.kind !== 'usecase') return no('VALUE_MALFORMED', 'kind is pack or usecase.', { at: 'kind', allowed: ['pack', 'usecase'] });
  if (typeof body.id !== 'string' || !ID.test(body.id)) return no('VALUE_MALFORMED', 'id is lower-case letters, digits and dashes.', { at: 'id' });
  if (body.action === 'withdraw') return ok({ kind: body.kind, id: body.id, action: 'withdraw' });
  if (body.action !== 'warn' && body.action !== 'disable') return no('VALUE_MALFORMED', 'action is warn, disable or withdraw.', { at: 'action', allowed: ['warn', 'disable', 'withdraw'] });
  const versions = Array.isArray(body.versions) ? body.versions : typeof body.versions === 'string' ? [body.versions] : [];
  if (versions.length === 0 || !versions.every((r) => typeof r === 'string' && RANGE.test(r)))
    return no('VALUE_MALFORMED', 'versions are exact versions such as 1.2.0, a bound such as <1.3.0, or * for every version.', { at: 'versions' });
  const severity = body.severity ?? (body.action === 'disable' ? 'high' : 'low');
  if (!SEVERITIES.includes(severity as Severity)) return no('VALUE_MALFORMED', 'severity is low, high or critical.', { at: 'severity', allowed: [...SEVERITIES] });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason === '' || chars(reason) > ADVICE_REASON_MOST)
    return no('VALUE_MALFORMED', `reason says why, in at most ${String(ADVICE_REASON_MOST)} characters. The person whose plugin it is reads it as written.`, { at: 'reason' });
  return ok({ kind: body.kind, id: body.id, versions: versions as string[], severity: severity as Severity, action: body.action, reason });
}

/**
 * The advisories file after the operator's ask. The id must be one a reader can hold: listed in the Kennel or in the
 * bundled catalogue, since BrainDog's own add-ons need a switch too. A withdrawal of an id with none is refused.
 */
export function adviseIn(file: Advisories, indexes: readonly CatalogueIndex[], ask: AdviseAsk, now: Date): Result<{ file: Advisories; answer: { state: 'advised' | 'withdrawn'; kind: EntryKind; id: string; at?: string } }> {
  const entry = indexes.flatMap((i) => i.entries).find((e) => e.kind === ask.kind && e.id === ask.id);
  if (ask.action === 'withdraw') {
    const left = file.advisories.filter((a) => !(a.kind === ask.kind && a.id === ask.id));
    if (left.length === file.advisories.length) return no('VALUE_MALFORMED', `There is no advisory on ${ask.id} to withdraw.`, { at: 'id' });
    return ok({ file: { ...file, advisories: left }, answer: { state: 'withdrawn', kind: ask.kind, id: ask.id } });
  }
  if (entry === undefined) return no('REF_UNKNOWN', `Nothing is listed as ${ask.kind === 'pack' ? 'plugin' : 'use case'} ${ask.id}, so there is nothing to advise on.`, { at: 'id' });
  if (!entry.versions.some((v) => advisoryCovers(ask, v.version))) return no('VALUE_MALFORMED', `No listed version of ${entry.title} is in ${ask.versions.join(', ')}.`, { at: 'versions' });
  const at = now.toISOString();
  const advisory: Advisory = { kind: ask.kind, id: ask.id, versions: ask.versions, severity: ask.severity, action: ask.action, reason: ask.reason, at };
  return ok({ file: { ...file, advisories: [...file.advisories, advisory].slice(-ADVISORIES_MOST) }, answer: { state: 'advised', kind: ask.kind, id: ask.id, at } });
}

/* ── what a record does with them ───────────────────────────────────────── */

/** One thing a record holding an add-on is told: an advisory, or that the version it holds was yanked. */
export type Notice = {
  /** Names it once and for ever, so a record acts on it once, and an owner who turned the add-on back on is not overruled. */
  key: string;
  id: string;
  version: string;
  title: string;
  action: 'warn' | 'disable';
  from: 'advisory' | 'yank';
  severity: Severity;
  reason: string;
};

/**
 * What an index and its advisories say to one held add-on at one version: each advisory that covers it, and a yank of
 * that version, which only warns (its author took it back; the operator's advisory is what turns it off).
 */
export function noticesFor(index: CatalogueIndex, file: Advisories | null, kind: EntryKind, id: string, version: string): Notice[] {
  const entry = index.entries.find((e) => e.kind === kind && e.id === id);
  if (entry === undefined) return [];
  const out: Notice[] = [];
  for (const a of file?.advisories ?? [])
    if (a.kind === kind && a.id === id && advisoryCovers(a, version))
      out.push({ key: `advisory:${kind}:${id}:${a.at}`, id, version, title: entry.title, action: a.action, from: 'advisory', severity: a.severity, reason: a.reason });
  const yanked = entry.versions.find((v) => v.version === version)?.yanked;
  if (yanked) out.push({ key: `yank:${kind}:${id}@${version}`, id, version, title: entry.title, action: 'warn', from: 'yank', severity: 'low', reason: yanked.reason });
  return out;
}

/* ── key statements ─────────────────────────────────────────────────────── */

/**
 * The index with one signed key statement added: a rotation signed by the key it moves from, or a revocation signed by
 * the key it revokes. The key must be one the Kennel already knows (it signed a listed version, or is a listed entry's
 * publisher), so the index never fills with statements about keys nobody reads. Sent twice, it is said so.
 */
export async function keyStatementIn(index: CatalogueIndex, statement: unknown): Promise<Result<{ index: CatalogueIndex; answer: { state: 'rotated' | 'revoked'; key_id: string } }>> {
  const rotation = isRotation(statement);
  if (!rotation && !isRevocation(statement)) return no('VALUE_MALFORMED', 'statement is a key rotation or a key revocation, as `braindog addon key rotate` or `revoke` writes it.', { at: 'statement' });
  const verified = rotation ? await verifyRotation(statement) : await verifyRevocation(statement);
  if (!verified) return no('SIGNATURE_INVALID', 'This statement is not signed by the key it speaks for.', { at: 'statement' });
  const keyId = rotation ? (statement as KeyRotation).from_key_id : (statement as KeyRevocation).key_id;
  const known = index.entries.some((e) => (e.publisher?.kind === 'key' && e.publisher.id === keyId) || e.versions.some((v) => v.signature?.key_id === keyId));
  if (!known) return no('REF_UNKNOWN', `Key ${keyId} signed nothing listed in the Kennel, so there is nobody to tell.`, { at: 'statement' });
  const kept = await verifiedStatements(index.keys);
  if (rotation) {
    const r = statement as KeyRotation;
    if (kept.rotations.some((x) => x.from_key_id === r.from_key_id && x.to_key_id === r.to_key_id)) return no('ALREADY_KNOWN', `Key ${keyId} is already rotated to ${r.to_key_id}.`, { at: 'statement' });
    return ok({ index: { ...index, keys: { ...kept, rotations: [...kept.rotations, r] } }, answer: { state: 'rotated', key_id: keyId } });
  }
  const r = statement as KeyRevocation;
  if (kept.revocations.some((x) => x.key_id === r.key_id)) return no('ALREADY_KNOWN', `Key ${keyId} is already revoked.`, { at: 'statement' });
  return ok({ index: { ...index, keys: { ...kept, revocations: [...kept.revocations, r] } }, answer: { state: 'revoked', key_id: keyId } });
}

/** `POST key`'s body: `{ statement }`. */
export function readKeyStatement(body: unknown): Result<{ statement: unknown }> {
  if (!isMap(body) || !isMap(body.statement)) return no('BODY_MALFORMED', 'key takes a JSON object: { statement }.', { at: 'body' });
  return ok({ statement: body.statement });
}

/* ── reports ────────────────────────────────────────────────────────────── */

export const REPORTS_FORMAT = 1;
export const REPORTS_FILE = 'reports.json';
export const REPORTS_A_DAY = 5;
export const REPORTS_KEPT = 1_000;
export const REPORT_WHY_MOST = 1_000;
const DAY_MS = 86_400_000;

export type Report = { kind: EntryKind; id: string; version: string | null; why: string; by: string; at: string };
export type Reports = { format: typeof REPORTS_FORMAT; reports: Report[] };

export const emptyReports = (): Reports => ({ format: REPORTS_FORMAT, reports: [] });

export function readReports(doc: unknown): Reports | null {
  if (!isMap(doc) || doc.format !== REPORTS_FORMAT || !Array.isArray(doc.reports)) return null;
  return {
    format: REPORTS_FORMAT,
    reports: doc.reports.filter(
      (r): r is Report => isMap(r) && typeof r.id === 'string' && typeof r.why === 'string' && typeof r.by === 'string' && typeof r.at === 'string' && (r.version === null || typeof r.version === 'string'),
    ),
  };
}

/** `POST report`'s body: `{ kind, id, version?, why }`. */
export function readReport(body: unknown): Result<{ kind: EntryKind; id: string; version: string | null; why: string }> {
  if (!isMap(body)) return no('BODY_MALFORMED', 'report takes a JSON object: { kind, id, version?, why }.', { at: 'body' });
  if (body.kind !== 'pack' && body.kind !== 'usecase') return no('VALUE_MALFORMED', 'kind is pack or usecase.', { at: 'kind', allowed: ['pack', 'usecase'] });
  if (typeof body.id !== 'string' || !ID.test(body.id)) return no('VALUE_MALFORMED', 'id is lower-case letters, digits and dashes.', { at: 'id' });
  if (body.version !== undefined && body.version !== null && (typeof body.version !== 'string' || !VERSION.test(body.version)))
    return no('VALUE_MALFORMED', 'version is three numbers, as in 1.0.0, or left out.', { at: 'version' });
  const why = typeof body.why === 'string' ? body.why.trim() : '';
  if (why === '' || chars(why) > REPORT_WHY_MOST) return no('VALUE_MALFORMED', `why says what is wrong with it, in at most ${String(REPORT_WHY_MOST)} characters.`, { at: 'why' });
  return ok({ kind: body.kind, id: body.id, version: typeof body.version === 'string' ? body.version : null, why });
}

/** The reports file with one more, or why not: an id nothing lists, or the reporter's fifth today. */
export function reportIn(file: Reports, indexes: readonly CatalogueIndex[], ask: { kind: EntryKind; id: string; version: string | null; why: string }, by: string, now: Date): Result<{ file: Reports; answer: { state: 'reported'; kind: EntryKind; id: string } }> {
  const entry = indexes.flatMap((i) => i.entries).find((e) => e.kind === ask.kind && e.id === ask.id);
  if (entry === undefined) return no('REF_UNKNOWN', `Nothing is listed as ${ask.id}.`, { at: 'id' });
  if (ask.version !== null && !entry.versions.some((v) => v.version === ask.version)) return no('REF_UNKNOWN', `${entry.title} has no version ${ask.version}.`, { at: 'version' });
  const since = now.getTime() - DAY_MS;
  const today = file.reports.filter((r) => r.by === by && Date.parse(r.at) > since);
  if (today.length >= REPORTS_A_DAY)
    return no('RATE_LIMITED', `The Kennel takes ${String(REPORTS_A_DAY)} reports a day from one person. Send it again tomorrow.`, {
      at: 'by',
      retry_after: Math.max(1, Math.ceil((Math.min(...today.map((r) => Date.parse(r.at))) + DAY_MS - now.getTime()) / 1000)),
    });
  const report: Report = { kind: ask.kind, id: ask.id, version: ask.version, why: ask.why, by, at: now.toISOString() };
  return ok({ file: { ...file, reports: [...file.reports, report].slice(-REPORTS_KEPT) }, answer: { state: 'reported', kind: ask.kind, id: ask.id } });
}

/* ── the pre-review note ────────────────────────────────────────────────── */

/** The longest note kept. */
export const NOTE_MOST = 1_500;
/** The most of a file's code sent to the model; past it the note says it read only the start. */
export const NOTE_CODE_MOST = 24_000;

/** What a waiting submission carries for the reviewer beside the file: lookalike names, reach added, and the model's note. */
export type ReviewMarks = { flags?: string[]; added?: string[]; note?: { text: string; by: string; at: string } };

/** The instructions the model reads. It writes one note; it is told it decides nothing. */
export const PRE_REVIEW_INSTRUCTIONS = [
  'You help a person review a plugin submitted to the BrainDog plugin store. You decide nothing; the reviewer does.',
  'You are given what the plugin says about itself (title, summary, changes), what the store computed it reaches, and its code.',
  'Write one short note in plain words, at most 120 words, in three parts:',
  '1. What it says it does. 2. What it actually reaches: lists, keys, addresses it calls, what it writes. 3. Anything that does not match, or anything a careful reviewer should read closely, naming the line or the script.',
  'If nothing looks wrong, say so in one line. Never repeat a secret if you see one; say a key-shaped value is in the file.',
  'Answer as JSON: {"note": "..."}.',
].join('\n');

/** What the model is sent for one submission: the file's own words, the computed reach, and its code, cut to a size. */
export function preReviewInput(doc: unknown, reach: Reach | null): { says: Record<string, unknown>; reaches: Reach | null; code: { at: string; what: string; text: string }[]; cut: boolean } {
  const d = isMap(doc) ? doc : {};
  const says: Record<string, unknown> = {};
  for (const k of ['pack', 'usecase', 'title', 'summary', 'changes', 'author', 'version'] as const) if (d[k] !== undefined) says[k] = d[k];
  let left = NOTE_CODE_MOST;
  let cut = false;
  const code = codeIn(doc).flatMap((c) => {
    if (left <= 0) {
      cut = true;
      return [];
    }
    const text = c.text.slice(0, left);
    if (text.length < c.text.length) cut = true;
    left -= text.length;
    return [{ at: c.at, what: c.what, text }];
  });
  return { says, reaches: reach, code, cut };
}

/** The model's answer as the note kept, or `null` when it said nothing usable. */
export function noteOf(answer: unknown): string | null {
  const text = isMap(answer) && typeof answer.note === 'string' ? answer.note : typeof answer === 'string' ? answer : null;
  if (text === null) return null;
  const said = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, ' ').trim();
  return said === '' ? null : [...said].slice(0, NOTE_MOST).join('');
}

/** The review file with a note on one waiting submission, or unchanged when it no longer waits. */
export function withNote<R extends { pending: { entry: { kind: EntryKind; id: string }; version: { version: string } }[] }>(
  review: R,
  which: { kind: EntryKind; id: string; version: string },
  note: { text: string; by: string; at: string },
): R {
  return {
    ...review,
    pending: review.pending.map((p) => (p.entry.kind === which.kind && p.entry.id === which.id && p.version.version === which.version ? { ...p, note } : p)),
  };
}
