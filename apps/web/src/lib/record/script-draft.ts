/**
 * Writing a script in the app: `/scripts/new` and `/scripts/<id>`.
 *
 * THE SAME ROAD AN AGENT TAKES, AND NO NEW METHOD. A draft is tried with `scriptTry`, which runs it once in the host's
 * sandbox and writes nothing, and it is filed with `propose` as a `change` to `script.<id>`, exactly the body an agent's
 * `braindog:grammar/script` change carries. The owner accepts in the same press: the change is filed and then answered
 * with `decide`, so what he wrote here goes through the gate, the install diff and the decision log like anyone's, and
 * a member who is not the owner files it for the owner to read in Decide.
 *
 * WHAT IT SENDS OUT IS NEVER SAID HERE. The record works out the lines an accept approves from the body it was filed
 * with (`propose` in `kernel/src/govern.ts` drops any `egress` or `approve` the proposer wrote), so this file sends the
 * body and nothing about what it would fetch.
 *
 * AN INSTALLED SCRIPT'S SOURCE IS NOT ON ANY READ. `scripts` answers the header and never the source, since the source
 * quotes whatever its author wrote. The change that installed it does hold it, so the source is looked for in the
 * record's resolved proposals, newest first, and taken only from one whose header is the one installed now. A script
 * installed by a pack, or accepted past the pages walked, opens with its header and an empty source, and the screen
 * says so rather than drawing an old version as the live one.
 *
 * PURE, for the reason `scripts.ts` gives: `node --test` cannot import a `.svelte.ts` file.
 */

import { createClient, type ScriptRow } from '@braindog/client';

import type { Result } from '../data/read.ts';
import type { Fetch } from './boot-live.ts';
import { answerQuestion } from './decide-write.ts';

/** What the form holds. `egress` is the text a person typed, one origin to a line, and is split when it is sent. */
export type Draft = {
  script: string;
  title: string;
  every: string;
  /** `HH:MM` in the record's zone, or empty for a clock that repeats from its last run. Sent only on a clock of whole days. */
  at: string;
  door: string;
  rule: boolean;
  egress: string;
  keys: string[];
  reads: string[];
  writes: string[];
  source: string;
  /** Kept from the version opened, never drawn: a limit is an agent's to ask for, and an edit here keeps what was accepted. */
  limits?: Record<string, number>;
};

/** A door a script may be started by: its name and what it says it is. */
export type Door = { id: string; description: string };

/** What the form may offer: the Keychain's key labels, the doors, and the script ids already taken. `null` is not readable by this caller. */
export type Picks = { keys: string[] | null; doors: Door[] | null; taken: string[] };

/** One script opened for editing: the installed row, the draft drawn from it, and whether its source was found. */
export type Opened = { row: ScriptRow; draft: Draft; found: boolean };

/** What a trial answered, as the screen draws it. */
export type Tried =
  | { kind: 'ran'; writes: string[]; log: string; spent: string }
  | { kind: 'refused'; why: string; log: string; spent: string }
  | { kind: 'held'; say: string }
  | { kind: 'not-run'; why: string };

/** What sending answered: accepted and installed, filed for the owner, or refused with the record's sentence. */
export type Sent =
  | { kind: 'installed'; script: string }
  | { kind: 'filed'; script: string; question: string | null; why?: string }
  | { kind: 'refused'; fix: string };

/** A script's id, and a door's: the kernel's `NAME` in `kernel/src/script.ts`. */
const NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
/** An interval the record reads (`INTERVAL` in `kernel/src/pull.ts`). */
const INTERVAL = /^\d{1,4}[smhdw]$/u;
/** A clock a time of day may pin: whole days or weeks, as the kernel's `scriptBody` holds it. */
const WHOLE_DAYS = /^\d{1,4}[dw]$/u;
/** A time of day as the kernel's `timeOf` reads it. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** Whether a clock may be pinned to a time of day: the form offers the time only then. */
export const takesTime = (every: string): boolean => WHOLE_DAYS.test(every);
/** How many resolved proposals a page asks for: the record's largest page. */
const PAGE = 200;
/** How many pages the source is looked for in. Past them a script is old enough that its author can paste it again. */
const PAGES = 3;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const words = {
  newHeading: 'New script',
  parent: 'Scripts',
  missing: 'This script is not here',
  missingWhy: 'It may have been retired, or it touches a list you cannot read. Every script you can read is under Scripts.',
  header: 'What it is',
  title: 'Name',
  titleHelp: 'What a person reads in the list and in Needs you.',
  starts: 'What starts it',
  every: 'On a clock',
  everyNone: 'No clock',
  everyAs: { '15m': 'Every 15 minutes', '1h': 'Every hour', '6h': 'Every 6 hours', '1d': 'Every day' } as Record<string, string>,
  everyOther: (every: string) => `Every ${every}`,
  at: 'At a time of day',
  atHelp: "In your BrainDog's time zone. Leave it empty to run about a day after the last run.",
  door: 'When something arrives at',
  doorNone: 'No door',
  doorTyped: 'The name of the address it listens at',
  rule: 'An automation may start it',
  egress: 'Fetches from',
  egressHelp: 'One address to a line, such as https://api.example.com. It may fetch from nothing else.',
  keys: 'Keys it may send',
  keysNone: 'No key has a value in the Keychain yet.',
  keysNoneAdd: 'Add one there first.',
  keysShut: 'Only the owner, recently signed in, can pick keys from the Keychain.',
  reads: 'Lists it reads',
  writes: 'Lists it writes',
  listsNoneChosen: 'none yet, press to choose',
  listsChosen: (n: number, of: number) => `${n} of ${of}`,
  listsNone: 'There are no lists yet.',
  source: 'Source',
  sourceLabel: 'What it does, in JavaScript',
  sourceHelp: 'Tab indents. Press Escape, then Tab, to leave the box.',
  notFound: "This version's code isn't kept here, so the box starts empty. What you write replaces it.",
  input: 'What arrives, to try with',
  inputHelp: 'Optional. What a door would hand it, written as JSON.',
  inputBad: 'What arrives is not JSON the script could read, so nothing was tried.',
  tryIt: 'Try it',
  trying: 'Trying',
  tried: 'What a run would do',
  triedNone: 'Try it to see what one run would write and log. Nothing is written.',
  writesNone: 'It would write nothing.',
  wouldWrite: 'It would write',
  log: 'Log',
  logNone: 'It logged nothing.',
  refused: 'The run was refused',
  held: 'Not run',
  /* A SCRIPT OPENS ON WHAT IT DOES (24 October): its card first, and the form one press under it. */
  change: 'Change this script',
  install: 'Save and turn on',
  propose: 'Send to Needs you',
  sending: 'Sending',
  installed: (title: string) => `${title} is on.`,
  filed: (title: string) => `${title} is in Needs you for the owner to accept.`,
  openDecide: 'Open it in Needs you',
  proposeNew: (title: string) => `Add the script ${title}?`,
  proposeChange: (title: string) => `Change the script ${title}?`,
  accepted: 'Written and accepted in the app by its owner.',
  notSent: 'A change landed while this was being written, so nothing was sent. Open the script again to start from it.',
  notAccepted: (why: string) => `It is in Needs you, and it was not turned on: ${why}`,
  /* The checks the form makes before it asks the record, each said where it is wrong. */
  needTitle: 'Give it a name.',
  needStart: 'Say what starts it: a clock, a door or an automation.',
  needSource: 'Write what it does.',
  badEvery: (every: string) => `${every} is not a clock BrainDog reads. Write 15m, 1h, 6h or 1d.`,
  badAt: (at: string) => `${at} is not a time of day. Write it like 09:00.`,
  badDoor: 'A door is named in lower case letters, digits, hyphens and underscores, starting with a letter.',
  badOrigin: (line: string) => `${line} is not an address it may fetch from. Write one starting https://, with no path.`,
  spent: (fetches: number, ms: number) => `${fetches === 1 ? '1 fetch' : `${fetches.toLocaleString('en-GB')} fetches`}, ${ms.toLocaleString('en-GB')} ms`,
  create: (list: string) => `Add to ${list}`,
  update: (spoken: string) => `Change ${spoken}`,
};

/** An empty draft, for `/scripts/new`. */
export const blank = (): Draft => ({ script: '', title: '', every: '', at: '', door: '', rule: false, egress: '', keys: [], reads: [], writes: [], source: '' });

/** A script id in the kernel's grammar from whatever a person named it, and one no installed script already has. */
export function idFrom(title: string, taken: readonly string[]): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^[^a-z]+/u, '')
      .replace(/-+$/u, '')
      .slice(0, 28)
      .replace(/-+$/u, '') || 'script';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** The origins typed, one to a line, blank lines dropped. */
export const originsOf = (egress: string): string[] =>
  egress
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter((l) => l !== '');

/** An `https://` origin and nothing more, as the kernel compares them. */
function isOrigin(line: string): boolean {
  try {
    const u = new URL(line);
    return u.protocol === 'https:' && `${u.origin}` === line.replace(/\/+$/u, '');
  } catch {
    return false;
  }
}

/**
 * What is wrong with the draft before the record is asked, by where it is wrong. The record checks all of it again
 * (`scriptBody` in `kernel/src/script.ts`); these are only the mistakes a person makes while typing, said beside the field.
 */
export function faultsOf(d: Draft): { at: 'title' | 'starts' | 'egress' | 'source'; say: string }[] {
  const out: { at: 'title' | 'starts' | 'egress' | 'source'; say: string }[] = [];
  if (d.title.trim() === '') out.push({ at: 'title', say: words.needTitle });
  if (d.every === '' && d.door.trim() === '' && !d.rule) out.push({ at: 'starts', say: words.needStart });
  if (d.every !== '' && !INTERVAL.test(d.every)) out.push({ at: 'starts', say: words.badEvery(d.every) });
  if (takesTime(d.every) && d.at !== '' && !TIME.test(d.at)) out.push({ at: 'starts', say: words.badAt(d.at) });
  if (d.door.trim() !== '' && !NAME.test(d.door.trim())) out.push({ at: 'starts', say: words.badDoor });
  const wrong = originsOf(d.egress).find((l) => !isOrigin(l));
  if (wrong !== undefined) out.push({ at: 'egress', say: words.badOrigin(wrong) });
  if (d.source.trim() === '') out.push({ at: 'source', say: words.needSource });
  return out;
}

/**
 * WHETHER SAVE MAY BE PRESSED (24 October): never while it is sending or once filed and waiting, and never while
 * the code box is empty. It was held only while sending, so an installed script whose code is not kept here opened with
 * an empty box and a live "Save and turn on" that would file a script of no code.
 */
export const canSave = (d: Pick<Draft, 'source'>, o: { sending: boolean; waiting: boolean }): boolean => !o.sending && !o.waiting && d.source.trim() !== '';

/** The body the record holds, from the draft: the runs it names and nothing empty. */
export function bodyOf(d: Draft): Record<string, unknown> {
  const runs: Record<string, unknown> = {};
  if (d.every !== '') runs.every = d.every;
  if (takesTime(d.every) && d.at !== '') runs.at = d.at;
  if (d.door.trim() !== '') runs.door = d.door.trim();
  if (d.rule) runs.rule = true;
  return {
    script: d.script,
    title: d.title.trim(),
    runs,
    egress: originsOf(d.egress).map((l) => l.replace(/\/+$/u, '')),
    keys: [...d.keys],
    reads: [...d.reads],
    writes: [...d.writes],
    ...(d.limits ? { limits: { ...d.limits } } : {}),
    source: d.source,
  };
}

/**
 * The change `propose` files. `from_version` is the version the form opened, and 0 for a new script, so a second change
 * that landed while this one was being written is a conflict on Decide rather than a silent replacement (`propose`).
 */
export function proposalOf(d: Draft, fromVersion: number | null) {
  const id = `script.${d.script}`;
  const title = d.title.trim() || d.script;
  return {
    question: fromVersion === null ? words.proposeNew(title) : words.proposeChange(title),
    body_kind: 'change' as const,
    body: { declaration_id: id, to: { id, kind: 'script', body: bodyOf(d) }, from_version: fromVersion ?? 0 },
  };
}

/** A draft from an installed row and the body that installed it, when it was found. */
export function draftOf(row: ScriptRow, body: Record<string, unknown> | null): Draft {
  const limits = body && isObject(body.limits) ? (Object.fromEntries(Object.entries(body.limits).filter(([, v]) => typeof v === 'number')) as Record<string, number>) : null;
  return {
    script: row.script,
    title: row.title,
    every: row.runs.every ?? '',
    at: row.runs.at ?? '',
    door: row.runs.door ?? '',
    rule: row.runs.rule,
    egress: row.egress.join('\n'),
    keys: [...row.keys],
    reads: [...row.reads],
    writes: [...row.writes],
    source: body && typeof body.source === 'string' ? body.source : '',
    ...(limits && Object.keys(limits).length > 0 ? { limits } : {}),
  };
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/**
 * The body a resolved proposal carried for this script, if its header is the one installed now.
 *
 * THE HEADER MUST MATCH, because a rejected change is resolved too and is newest first beside the accepted one. A
 * proposal whose reach, keys and title are not the installed ones is some other version, and opening it as the live
 * source would put words in front of the owner that are not running.
 */
export function installedBody(row: ScriptRow, suggestions: readonly unknown[]): Record<string, unknown> | null {
  for (const s of suggestions) {
    if (!isObject(s) || s.body_kind !== 'change' || !isObject(s.body)) continue;
    const to = s.body.to;
    if (s.body.declaration_id !== `script.${row.script}` || !isObject(to) || !isObject(to.body)) continue;
    const b = to.body;
    if (typeof b.source !== 'string') continue;
    if ((typeof b.title === 'string' ? b.title : row.script) !== row.title) continue;
    if (!same(strings(b.reads), row.reads) || !same(strings(b.writes), row.writes) || !same(strings(b.keys), row.keys)) continue;
    if (!same(strings(b.egress).map((o) => o.replace(/\/+$/u, '')), row.egress.map((o) => o.replace(/\/+$/u, '')))) continue;
    return b;
  }
  return null;
}

/** One installed script opened for editing, with its source where the record's decisions still hold it. */
export async function openScript(base: string, script: string, io?: Fetch): Promise<Result<Opened | null>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const listed = await client.scripts();
  if (!listed.ok) return listed;
  const row = listed.value.find((r) => r.script === script);
  if (!row) return { ok: true, value: null };

  /* THE DECISIONS ARE EXTRA, as the history is on the list: a refused or unreached read opens the header alone. */
  let cursor: string | undefined;
  let body: Record<string, unknown> | null = null;
  for (let n = 0; n < PAGES && body === null; n += 1) {
    const page = await client.governance({ register: 'suggestion', status: 'resolved', limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!page.ok || !Array.isArray(page.value)) break;
    const rows = page.value as unknown[];
    body = installedBody(row, rows);
    const last = rows.at(-1);
    if (rows.length < PAGE || !isObject(last) || typeof last.id !== 'string') break;
    cursor = last.id;
  }
  return { ok: true, value: { row, draft: draftOf(row, body), found: body !== null } };
}

/**
 * What the form may offer. Each is read on its own, and a refusal is `null` for that one alone: the Keychain is the owner's
 * in a browser (`listGrants`, KEYCHAIN) and the doors are an admin's (`doors`), and a member who cannot read either can
 * still write a script by typing the door's name.
 */
export async function readPicks(base: string, io?: Fetch): Promise<Result<Picks>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const [grants, doors, scripts] = await Promise.all([client.listGrants(), client.call<unknown[]>('doors'), client.scripts()]);
  const keys = grants.ok
    ? [
        ...new Set(
          (Array.isArray(grants.value) ? grants.value : []).flatMap((g) => {
            const row = g as { label?: unknown; revoked_at?: unknown };
            return typeof row.label === 'string' && (row.revoked_at === null || row.revoked_at === undefined) ? [row.label] : [];
          }),
        ),
      ].sort((a, b) => a.localeCompare(b))
    : null;
  const doorList = doors.ok
    ? (Array.isArray(doors.value) ? doors.value : []).flatMap((d) =>
        isObject(d) && typeof d.id === 'string' ? [{ id: d.id, description: typeof d.description === 'string' ? d.description : '' }] : [],
      )
    : null;
  return { ok: true, value: { keys, doors: doorList, taken: scripts.ok ? scripts.value.map((s) => s.script) : [] } };
}

/** A write the sandbox asked for, as a sentence: which list gains a row, or which row changes. */
function writeSaid(w: unknown, listName: (id: string) => string): string | null {
  if (!isObject(w)) return null;
  if (w.op === 'create' && typeof w.register === 'string') return words.create(listName(w.register));
  if (w.op === 'update' && typeof w.spoken === 'string') return words.update(w.spoken);
  return null;
}

/** The sandbox's answer, whatever shape it arrived in, as the screen draws it. */
export function triedOf(raw: unknown, listName: (id: string) => string): Tried {
  if (!isObject(raw)) return { kind: 'not-run', why: words.held };
  if (isObject(raw.held)) return { kind: 'held', say: typeof raw.held.say === 'string' ? raw.held.say : words.held };
  const log = typeof raw.log === 'string' ? raw.log : '';
  const usage = isObject(raw.usage) ? raw.usage : {};
  const spent = words.spent(typeof usage.fetches === 'number' ? usage.fetches : 0, typeof usage.wall_ms === 'number' ? Math.round(usage.wall_ms) : 0);
  if (isObject(raw.refused)) return { kind: 'refused', why: typeof raw.refused.why === 'string' ? raw.refused.why : words.refused, log, spent };
  const writes = (Array.isArray(raw.writes) ? raw.writes : []).flatMap((w) => {
    const said = writeSaid(w, listName);
    return said === null ? [] : [said];
  });
  return { kind: 'ran', writes, log, spent };
}

/**
 * Run the draft once in the host's sandbox. It writes nothing and is counted as a run. `input` is the JSON a door would
 * hand it, typed by the person, or empty for none.
 */
export async function tryDraft(base: string, d: Draft, input: string, listName: (id: string) => string, io?: Fetch): Promise<Tried> {
  let given: unknown = null;
  if (input.trim() !== '') {
    try {
      given = JSON.parse(input) as unknown;
    } catch {
      return { kind: 'not-run', why: words.inputBad };
    }
  }
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<unknown>('scriptTry', { body: bodyOf(d), ...(given === null ? {} : { input: given }) });
  if (!out.ok) return { kind: 'not-run', why: 'refusal' in out ? out.refusal.fix : words.held };
  return triedOf(out.value, listName);
}

/**
 * File the draft, and for the owner accept it in the same press.
 *
 * TWO CALLS, AND THE FIRST STANDS ALONE. A filed change the accept then refuses (a key the Keychain does not hold, a
 * conflict with a change that landed first) is still in Decide, where its sentence and the owner's answer belong, so a
 * refused accept is said as filed with the record's reason and not as nothing done.
 */
export async function sendDraft(base: string, d: Draft, fromVersion: number | null, owner: boolean, io?: Fetch): Promise<Sent> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const filed = await client.call<{ id?: unknown }>('propose', proposalOf(d, fromVersion) as unknown as Record<string, unknown>);
  if (!filed.ok) return { kind: 'refused', fix: 'refusal' in filed ? filed.refusal.fix : words.notSent };
  const question = isObject(filed.value) && typeof filed.value.id === 'string' ? filed.value.id : null;
  if (!owner || question === null) return { kind: 'filed', script: d.script, question };
  const answered = await answerQuestion(base, question, 'accept', words.accepted, io);
  if (answered.from === 'written') return { kind: 'installed', script: d.script };
  return { kind: 'filed', script: d.script, question, why: answered.fix };
}

/**
 * Tab in the source box: indent or outdent every line the selection touches by two spaces, or insert two at the caret.
 *
 * ESCAPE LETS TAB LEAVE, which the screen keeps as a flag; this only does the text, so a test can hold it.
 */
export function indent(text: string, start: number, end: number, out: boolean): { text: string; start: number; end: number } {
  const INDENT = '  ';
  if (start === end && !out) return { text: text.slice(0, start) + INDENT + text.slice(end), start: start + 2, end: start + 2 };
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const block = text.slice(from, end);
  const lines = block.split('\n');
  let first = 0;
  let total = 0;
  const moved = lines.map((line, i) => {
    if (!out) {
      if (i === 0) first = 2;
      total += 2;
      return INDENT + line;
    }
    const cut = line.startsWith(INDENT) ? 2 : line.startsWith(' ') ? 1 : 0;
    if (i === 0) first = -cut;
    total -= cut;
    return line.slice(cut);
  });
  const next = text.slice(0, from) + moved.join('\n') + text.slice(end);
  return { text: next, start: Math.max(from, start + first), end: Math.max(from, end + total) };
}
