/**
 * A RUN AS A CONVERSATION, TOP TO BOTTOM (`RunPanel.svelte`, AGT-C12 build 5): who it was and where it worked, its
 * stretches (started, came back, ended), what it said it is doing, what it asked, its dead ends, what it noted, its
 * helpers, and the run whose step it took. The panel's own two parts, what it did (`run-lines.ts`) and the step it left (`api.ts`
 * `stepLeft`), sit between `doing` and `asked`, and after `tried`.
 *
 * A SECTION IS ABSENT WHEN IT HAS NOTHING TRUE TO SAY. A run that only started says who and one stretch, and no heading
 * stands over nothing.
 *
 * NAMES, NEVER HANDLES. A run is said by the app it ran in, a project by its name, a question by its words. What could
 * not be read is counted or said without a name ("another run"), and a working folder is never said: the place is the
 * repository's own short name and its branch.
 *
 * `runTalk` IS PURE: the row, what was read beside it (`readRunParts`), the clock and the reader's zone.
 */
import { createClient, type ClientOptions } from '@braindog/client';
import { gapSaid as gapBetween, runWho } from '../../record/api.ts';

/** A run's row as the record answers it: its number, its state and its fields. */
export type RunRow = { seq: number; state: unknown; fields: Readonly<Record<string, unknown>> };

/** One line of a run's history, as far as its stretches read it. */
export type TalkEvent = { ts: string; kind: string; from?: unknown; to?: unknown };

/** What became of a question the run asked. */
export type AskedStatus = 'open' | 'accepted' | 'declined' | 'answered' | 'withdrawn';

/** What was read beside the row. Every part is optional, and a part that could not be read is left out. */
export type RunParts = {
  /** The row's own history, oldest or newest first. */
  history?: readonly TalkEvent[];
  /** The name of the project the run was placed in. */
  project?: string | null;
  /** The questions it asked, each by its words where they could be read. */
  asked?: readonly { words: string | null; status: AskedStatus }[];
  /** Its helpers' fields, and how many it has in all where that is more than were read. */
  helpers?: readonly Readonly<Record<string, unknown>>[];
  helpersInAll?: number;
  /** The run whose step it took. */
  took?: { fields: Readonly<Record<string, unknown>> } | null;
  /** The words of the questions its notes name by handle (`SG242`), where they could be read. */
  questions?: ReadonlyMap<string, string>;
};

export type TalkKey = 'who' | 'stretches' | 'doing' | 'asked' | 'tried' | 'noted' | 'helpers' | 'took';
export type TalkSection = { key: TalkKey; heading: string; lines: string[] };

/**
 * The order the sections are said in, which never changes. What it noted is `noted`, not its field's own word, which
 * add-ons declare as a list of their own (`tools/gates/core-names.mjs`).
 */
export const TALK_ORDER = ['who', 'stretches', 'doing', 'asked', 'tried', 'noted', 'helpers', 'took'] as const satisfies readonly TalkKey[];

/** How many returns are each said before they are counted, and how many helpers, dead ends and notes are listed. */
const RETURNS_MOST = 3;
const HELPERS_MOST = 6;
const TRIED_MOST = 6;
const NOTES_MOST = 6;
const LINE_MOST = 240;

const n = (v: number): string => v.toLocaleString('en-GB');

/** Each section's heading. */
export const talkHeadings = {
  who: 'Who and where',
  stretches: 'When it worked',
  doing: 'What it said it is doing',
  asked: 'What it asked',
  tried: 'What it tried that did not work',
  noted: 'What it noted',
  helpers: 'Its helpers',
  took: 'Where it picked up',
} as const satisfies Record<TalkKey, string>;

export const talkWords = {
  anAgent: 'An agent',
  place: (who: string, place: string) => `${who}, in ${place}`,
  onBranch: (repo: string, branch: string) => `${repo} on ${branch}`,
  started: (at: string) => `Started ${at}`,
  back: (at: string) => `Came back ${at}`,
  backMany: (count: number, at: string) => `Came back ${n(count)} times, last at ${at}`,
  ended: (at: string) => `Ended ${at}`,
  status: { open: 'Open', accepted: 'Accepted', declined: 'Declined', answered: 'Answered', withdrawn: 'Taken back' } as const satisfies Record<AskedStatus, string>,
  questions: (count: number) => (count === 1 ? '1 question' : `${n(count)} questions`),
  moreQuestions: (count: number) => (count === 1 ? 'and 1 more question' : `and ${n(count)} more questions`),
  helperCount: (count: number) => (count === 1 ? '1 helper' : `${n(count)} helpers`),
  more: (count: number) => `and ${n(count)} more`,
  took: (who: string, gap: string | null) => `Took the step ${who} left${gap === null ? '' : ` ${gap} earlier`}`,
  anotherRun: 'another run',
  aQuestion: 'a question',
} as const;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const clip = (s: string): string => (s.length > LINE_MOST ? `${s.slice(0, LINE_MOST - 1).trimEnd()}…` : s);

/** A repository by its own short name: the last part of a path or an address, without `.git`. Never the path. */
function repoName(v: unknown): string {
  const last = text(v).replace(/[\\/]+$/u, '').split(/[\\/:]/u).at(-1) ?? '';
  return last.replace(/\.git$/u, '');
}

/** A branch as one word a person named, or nothing. */
const branchName = (v: unknown): string => (/^\S{1,60}$/u.test(text(v)) ? text(v) : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The zone a time is said in: the one named, else the browser's own, else UTC, as `braindog-render` counts a day. */
const zoneOf = (zone?: string): string => zone ?? ('window' in globalThis ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC');

/** An instant's day and time in a zone, as numbers. */
function partsAt(ms: number, zone: string): { day: number; month: number; year: number; time: string } | null {
  if (!Number.isFinite(ms)) return null;
  let made: Intl.DateTimeFormatPart[];
  try {
    made = new Intl.DateTimeFormat('en-GB-u-nu-latn-ca-gregory', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  } catch {
    return zone === 'UTC' ? null : partsAt(ms, 'UTC');
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string => made.find((p) => p.type === type)?.value ?? '';
  return { day: Number(part('day')), month: Number(part('month')), year: Number(part('year')), time: `${part('hour')}:${part('minute')}` };
}

/** When something happened, as a person reads a run: "09:12" on the reader's own day, "6 Oct, 09:12" on another. */
export function clockAt(iso: unknown, now: number, zone?: string): string | null {
  const at = typeof iso === 'string' ? partsAt(Date.parse(iso), zoneOf(zone)) : null;
  const today = partsAt(now, zoneOf(zone));
  if (at === null) return null;
  const sameDay = today !== null && at.day === today.day && at.month === today.month && at.year === today.year;
  return sameDay ? at.time : `${at.day} ${MONTHS[at.month - 1] ?? ''}, ${at.time}`;
}

/** How long before one instant another came, said short: "5 min", "2h", "3 days", in `api.ts`'s own words for a step's gap. */
const gapSaid = (from: unknown, to: unknown): string | null => (typeof from === 'string' && typeof to === 'string' ? gapBetween(from, to) : null);

/* ── what is the record's own name for a run, and not words an agent wrote ─────────────────────────────── */

const A_DAY = new RegExp(`^\\d{1,2} (?:${MONTHS.join('|')})$`, 'u');

/** The states a run comes back from, and the two it ends in (`kernel/session.ts` `REVIVED`, `FINISHED`). */
const REVIVED: readonly string[] = ['idle', 'handoff', 'done', 'abandoned'];
const FINISHED: readonly string[] = ['done', 'abandoned'];

/**
 * Whether a run's name is still the one the record gave it, so it says nothing of what the run is doing.
 *
 * THE RECORD'S OWN SHAPES AND ONLY THOSE (`kernel/session.ts` `recordNamed`): no name at all, "Claude Code in BrainDog"
 * after its project or its repository, "Claude run", either with the day it opened, and "braindog on main" or
 * "braindog" after its repository. "Claude in the loop" is an agent's own sentence and is kept.
 */
export function placeholderName(fields: Readonly<Record<string, unknown>>, project: string | null = null): boolean {
  const doing = text(fields.doing);
  if (doing === '') return true;
  const names = new Set([runWho(fields), runWho({ agent: fields.agent }), text(fields.client), 'Agent'].filter((v): v is string => typeof v === 'string' && v !== ''));
  const repo = text(fields.repo);
  const places = new Set([text(project), repo, repoName(fields.repo)].filter((p) => p !== ''));
  const cut = doing.lastIndexOf(', ');
  const dated = cut > 0 && A_DAY.test(doing.slice(cut + 2));
  const head = dated ? doing.slice(0, cut) : doing;
  for (const name of names) {
    if (head === `${name} run`) return true;
    if (!dated) for (const place of places) if (doing === `${name} in ${place}`) return true;
  }
  if (dated) return text(project) !== '' && head === text(project);
  for (const place of [repo, repoName(fields.repo)]) {
    if (place === '') continue;
    if (doing === place) return true;
    if (doing.startsWith(`${place} on `) && /^\S+$/u.test(doing.slice(place.length + 4))) return true;
  }
  return false;
}

/** A state as the history holds it: the word, with the quotes an older line kept it in taken off. */
const stateWord = (v: unknown): string => (typeof v === 'string' ? v.replace(/^"|"$/gu, '') : '');

/** The words a person wrote in a list of text, clipped, with what is not text left out. */
const said = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((t) => t !== '').map(clip) : []);

/**
 * A file path or a folder in a note: one that starts at a root, at home or here, or two slashes or more, or a last part
 * with a file ending. "and/or" is words.
 */
const isPath = (w: string): boolean =>
  /[\\/]/u.test(w) && (/^(?:~|\.{1,2}|[A-Za-z]:)?[\\/]/u.test(w) || (w.match(/[\\/]/gu)?.length ?? 0) >= 2 || /[\\/][^\\/]*\.[A-Za-z][A-Za-z0-9]{0,7}$/u.test(w));

/** A handle the record or a tool gave, never words: a ULID, a UUID, a long hash, `tools#8`, `S42`, `wf_3fa9c2`. */
const IDLIKE = /^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-f]{12,}|[a-z][a-z0-9_]*#[1-9][0-9]*|S[1-9][0-9]*|[a-z]+_(?=[0-9a-z]*[0-9])[0-9a-z]{6,})$/u;

/** A path's last plain words: the last part that holds a letter and is not a handle, its ending and joins said as spaces. */
function lastPlainWords(path: string): string {
  for (const part of path.split(/[\\/]+/u).reverse()) {
    const words = part.replace(/\.[A-Za-z0-9]{1,8}$/u, '').replace(/[-_.]+/gu, ' ').trim();
    if (/\p{L}/u.test(words) && !IDLIKE.test(part.replace(/\.[A-Za-z0-9]{1,8}$/u, ''))) return words;
  }
  return '';
}

/** One question by handle, or a run of them: `SG280-SG284` or `SG280-284`. */
const REF = String.raw`SG[1-9][0-9]*(?:\s*[-–]\s*(?:SG)?[1-9][0-9]*)?`;
/** Handles side by side, joined by commas, slashes or "and": one group, said as how many questions it names. */
const REFS = new RegExp(String.raw`\b${REF}(?:\s*(?:,\s*(?:and\s+)?|\/|\s+and\s+)${REF})*\b`, 'gu');
/** The longest a question's words run in a note before they are cut. */
const ASKED_MOST = 60;

/** How many questions one group of handles names: a run counts each in it, and a run that reads backwards counts one. */
function refCount(group: string): number {
  return [...group.matchAll(new RegExp(REF, 'gu'))].reduce((sum, m) => {
    const [from, to] = [...m[0].matchAll(/[1-9][0-9]*/gu)].map((x) => Number(x[0]));
    return sum + (to !== undefined && to > from! && to - from! < 100 ? to - from! + 1 : 1);
  }, 0);
}

/** The handles a note names one at a time, which are the ones said by their words. */
export function refsIn(note: string): string[] {
  return [...note.matchAll(REFS)].filter((m) => refCount(m[0]) === 1 && !/[-–]/u.test(m[0])).map((m) => m[0]);
}

/**
 * QUESTIONS BY THEIR WORDS, NEVER THEIR HANDLES (the audit of 25 October, Z24): a run's notes said "SG242 overlaps
 * SG286/SG287" and "SG262, SG263, SG278, SG280-SG284". One handle is its question's words in quotes, cut, or "a
 * question" where they could not be read; handles side by side are counted, "2 questions".
 */
export function refsSaid(note: string, questions?: ReadonlyMap<string, string>): string {
  return note.replace(REFS, (group) => {
    const count = refCount(group);
    if (count > 1) return talkWords.questions(count);
    const words = questions?.get(group.trim());
    if (!words) return talkWords.aQuestion;
    const cut = words.length > ASKED_MOST ? `${words.slice(0, ASKED_MOST - 1).trimEnd()}…` : words;
    return `“${cut.replace(/[?.]$/u, '')}”`;
  });
}

/** A note cut into its plain text and its questions: a question read by its words carries the page that asks it. */
export type NotePart = { text: string; href?: string };

/** The same words as `refsSaid`, in parts, so a question named once can be drawn as a link to its page. */
export function refsParts(note: string, questions?: ReadonlyMap<string, string>): NotePart[] {
  const out: NotePart[] = [];
  let at = 0;
  for (const m of note.matchAll(REFS)) {
    if (m.index > at) out.push({ text: note.slice(at, m.index) });
    const said = refsSaid(m[0], questions);
    out.push(refCount(m[0]) === 1 && questions?.get(m[0].trim()) ? { text: said, href: `/decide/${m[0].trim()}` } : { text: said });
    at = m.index + m[0].length;
  }
  if (at < note.length) out.push({ text: note.slice(at) });
  return out;
}

/**
 * A NOTE AS A PERSON READS IT: a path in it is said by its last plain words and a handle is left out, so a note that is
 * only a path reads "run notes and words" and one that is only an id says nothing and is not drawn.
 */
const noteSaid = (note: string, questions?: ReadonlyMap<string, string>): string =>
  refsSaid(note, questions)
    .split(/\s+/u)
    .map((word) => {
      const bare = word.replace(/^[("'`]+|[)"'`,.;:]+$/gu, '');
      if (IDLIKE.test(bare)) return '';
      return isPath(bare) ? lastPlainWords(bare) : word;
    })
    .filter((w) => w !== '')
    .join(' ');

/** A question's words, ended as a sentence, then what became of it: "Keep the archive? Open". */
const askedLine = (words: string, status: AskedStatus): string => `${/[.?!]$/u.test(words) ? words : `${words}.`} ${talkWords.status[status]}`;

function whoLines(row: RunRow, parts: RunParts): string[] {
  const who = runWho(row.fields) ?? talkWords.anAgent;
  const repo = repoName(row.fields.repo);
  const branch = branchName(row.fields.branch);
  /* THE PROJECT BY ITS NAME WHERE THE PAGE READ IT, before the repository's folder name (the audit of 25 October, Z23:
     "in braindog on master" for a run on BrainDog). */
  const where = text(parts.project) || repo;
  const place = where !== '' ? (branch !== '' && repo !== '' ? talkWords.onBranch(where, branch) : where) : '';
  return [place === '' ? who : talkWords.place(who, place)];
}

function stretchLines(row: RunRow, parts: RunParts, now: number, zone?: string): string[] {
  const lines: string[] = [];
  const started = clockAt(row.fields.started, now, zone);
  if (started !== null) lines.push(talkWords.started(started));
  const moves = [...(parts.history ?? [])].filter((e) => e.kind === 'state' && Number.isFinite(Date.parse(e.ts))).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const backs = moves.filter((e) => stateWord(e.to) === 'active' && REVIVED.includes(stateWord(e.from))).flatMap((e) => clockAt(e.ts, now, zone) ?? []);
  if (backs.length > RETURNS_MOST) lines.push(talkWords.backMany(backs.length, backs.at(-1)!));
  else for (const at of backs) lines.push(talkWords.back(at));
  const state = stateWord(row.state);
  if (FINISHED.includes(state)) {
    /* WHEN IT ENDED: the line that moved it there, else the last time it was heard from. */
    const ended = clockAt(moves.findLast((e) => stateWord(e.to) === state)?.ts ?? row.fields.last_seen, now, zone);
    if (ended !== null) lines.push(talkWords.ended(ended));
  }
  return lines;
}

function askedLines(parts: RunParts): string[] {
  const asked = parts.asked ?? [];
  const worded = asked.flatMap((q) => (text(q.words) === '' ? [] : [askedLine(clip(text(q.words)), q.status)]));
  const rest = asked.length - worded.length;
  if (worded.length === 0) return rest === 0 ? [] : [talkWords.questions(rest)];
  return rest === 0 ? worded : [...worded, talkWords.moreQuestions(rest)];
}

function helperLines(parts: RunParts): string[] {
  const helpers = parts.helpers ?? [];
  const count = Math.max(helpers.length, Number.isInteger(parts.helpersInAll) ? parts.helpersInAll! : 0);
  if (count === 0) return [];
  /* EACH BY WHAT IT DID: its own sentence, and nothing for a helper that never said one. */
  const did = helpers.flatMap((h) => (placeholderName(h, parts.project ?? null) ? [] : [clip(text(h.doing))]));
  const shown = did.slice(0, HELPERS_MOST);
  const more = did.length > HELPERS_MOST ? [talkWords.more(count - shown.length)] : [];
  return [talkWords.helperCount(count), ...shown, ...more];
}

function tookLines(row: RunRow, parts: RunParts): string[] {
  if (text(row.fields.took) === '') return [];
  const from = parts.took?.fields ?? null;
  const who = (from ? runWho(from) : null) ?? talkWords.anotherRun;
  return [talkWords.took(who, from ? gapSaid(from.next_at, row.fields.started) : null)];
}

/**
 * The run as its sections, in `TALK_ORDER`, each absent when it has nothing true to say. `now` is the clock and `zone`
 * the reader's, in which a time is said.
 */
export function runTalk(row: RunRow, parts: RunParts, now: number = Date.now(), zone?: string): TalkSection[] {
  const tried = said(row.fields.tried).map((t) => refsSaid(t, parts.questions));
  /* NEWEST FIRST: a run adds its notes at the end. */
  const notes = said(row.fields.notes).map((t) => noteSaid(t, parts.questions)).filter((t) => t !== '').reverse();
  const lines: Record<TalkKey, string[]> = {
    who: whoLines(row, parts),
    stretches: stretchLines(row, parts, now, zone),
    doing: placeholderName(row.fields, parts.project ?? null) ? [] : [clip(text(row.fields.doing))],
    asked: askedLines(parts),
    tried: tried.length > TRIED_MOST ? [...tried.slice(0, TRIED_MOST), talkWords.more(tried.length - TRIED_MOST)] : tried,
    noted: notes.length > NOTES_MOST ? [...notes.slice(0, NOTES_MOST), talkWords.more(notes.length - NOTES_MOST)] : notes,
    helpers: helperLines(parts),
    took: tookLines(row, parts),
  };
  return TALK_ORDER.flatMap((key) => (lines[key].length === 0 ? [] : [{ key, heading: talkHeadings[key], lines: lines[key] }]));
}

/* ── the reads ───────────────────────────────────────────────────────────── */

type Io = NonNullable<ClientOptions['fetch']>;
type Bag = Record<string, unknown>;

const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The most suggestions one read answers with, and how many such reads are made looking for a run's questions. */
const ASKED_PAGE = 200;
const ASKED_PAGES = 3;
const HELPERS_PAGE = 50;
/** The most questions a run's notes name one by one that are read for their words. */
const NAMED_MOST = 8;

/** A run's handle as its row says it, `S42`, or nothing. Never drawn. */
const seqOf = (handle: unknown): number | null => {
  const seq = Number(/^S([1-9][0-9]*)$/u.exec(text(handle))?.[1]);
  return Number.isInteger(seq) ? seq : null;
};

/** What became of a question, from how the record closed it. */
function statusOf(row: Bag): AskedStatus {
  if (row.status === 'open') return 'open';
  if (row.resolved_as === 'withdrawn') return 'withdrawn';
  /* A QUESTION THAT OFFERED CHOICES was answered with one of them, which is not a yes. */
  if (row.resolved_as === 'addressed') return isBag(row.body) && Array.isArray(row.body.options) ? 'answered' : 'accepted';
  return 'declined';
}

type Client = ReturnType<typeof createClient>;

/** A read that fails to nothing, so one refused read does not take the rest with it. */
const quietly = async <T>(read: () => Promise<T | undefined>): Promise<T | undefined> => {
  try {
    return await read();
  } catch {
    return undefined;
  }
};

/* A QUESTION BY ITS WORDS: an open one as the record lists what waits, a closed one as its decision kept it. */
async function wordsOf(client: Client, rows: readonly Bag[]): Promise<(r: Bag) => Promise<string | null>> {
  const waiting = rows.some((r) => r.status === 'open')
    ? await quietly(async () => {
        const booted = await client.boot();
        return booted.ok ? new Map((booted.value.waiting ?? []).map((w) => [w.id, w.question])) : undefined;
      })
    : undefined;
  return async (r: Bag): Promise<string | null> => {
    if (r.status === 'open') return text(waiting?.get(String(r.id))) || null;
    if (typeof r.decision !== 'string' || r.decision === '') return null;
    const id = r.decision;
    const got = await quietly(async () => client.governance({ register: 'decision', id }));
    return got?.ok && isBag(got.value) ? text(got.value.question) || null : null;
  };
}


/** The questions the notes name one by one, by their words (Z24), at most `NAMED_MOST` of them. */
export async function readQuestionWords(client: Client, notes: readonly string[]): Promise<Map<string, string> | undefined> {
  return quietly(async () => {
    const named = [...new Set(notes.flatMap(refsIn))].slice(0, NAMED_MOST);
    if (named.length === 0) return undefined;
    const got = await Promise.all(named.map((id) => quietly(async () => client.governance({ register: 'suggestion', id }))));
    const rows = got.map((g) => (g?.ok && isBag(g.value) ? g.value : null));
    const words = await wordsOf(client, rows.filter((r): r is Bag => r !== null));
    const out = new Map<string, string>();
    for (const [i, r] of rows.entries()) {
      const w = r === null ? null : await words(r);
      if (w) out.set(named[i]!, w);
    }
    return out;
  });
}

/**
 * What the panel says beside the run's own row, each read failing to nothing: its history, the name of its project,
 * the questions it asked, its helpers, and the run whose step it took. A part that could not be read is left out, and
 * `runTalk` says the rest.
 */
export async function readRunParts(base: string, row: RunRow, io?: Io): Promise<RunParts> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const handle = `S${row.seq}`;
  /* EACH READ ALONE, so one refused does not take the others with it. */
  const quiet = async <T>(read: () => Promise<T | undefined>): Promise<T | undefined> => {
    try {
      return await read();
    } catch {
      return undefined;
    }
  };

  const history = quiet(async () => {
    const out = await client.history('session', row.seq);
    return out.ok && Array.isArray(out.value) ? out.value.filter((e): e is TalkEvent => isBag(e) && typeof e.ts === 'string' && typeof e.kind === 'string') : undefined;
  });

  /* THE PROJECT BY ITS NAME: the row holds it as a spoken handle, and the list says which field is its name. */
  const project = quiet(async () => {
    const m = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u.exec(text(row.fields.project));
    if (!m) return undefined;
    const [decl, got] = await Promise.all([client.schema(m[1]!), client.get(m[1]!, Number(m[2]))]);
    const title = decl.ok && isBag(decl.value) && typeof decl.value.title === 'string' ? decl.value.title : null;
    const fields = got.ok && isBag(got.value) && isBag(got.value.fields) ? got.value.fields : null;
    const name = title !== null && fields !== null ? text(fields[title]) : '';
    return name === '' ? undefined : name;
  });

  const asked = quiet(async () => {
    const own: Bag[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < ASKED_PAGES; page += 1) {
      const out = await client.governance({ register: 'suggestion', status: 'all', limit: ASKED_PAGE, ...(cursor ? { cursor } : {}) });
      if (!out.ok || !Array.isArray(out.value)) return page === 0 ? undefined : wordsFor(own);
      const rows = out.value.filter(isBag);
      own.push(...rows.filter((r) => r.opened_by === handle));
      const last = rows.at(-1)?.id;
      if (rows.length < ASKED_PAGE || typeof last !== 'string' || last === cursor) break;
      cursor = last;
    }
    return wordsFor(own);
  });

  async function wordsFor(own: readonly Bag[]): Promise<RunParts['asked']> {
    if (own.length === 0) return [];
    const words = await wordsOf(client, own);
    /* OLDEST FIRST, as it asked them: the record lists the newest first. */
    return Promise.all([...own].reverse().map(async (r) => ({ words: await words(r), status: statusOf(r) })));
  }

  const questions = readQuestionWords(client, [...said(row.fields.notes), ...said(row.fields.tried)]);

  const helpers = quiet(async () => {
    const out = await client.list({ register: 'session', where: { field: 'parent', is: handle }, limit: HELPERS_PAGE });
    if (!out.ok || !isBag(out.value) || !Array.isArray(out.value.rows)) return undefined;
    const rows = out.value.rows.flatMap((r) => (isBag(r) && isBag(r.fields) ? [r.fields] : []));
    return { rows, inAll: typeof out.value.matched === 'number' ? out.value.matched : rows.length };
  });

  const took = quiet(async () => {
    const seq = seqOf(row.fields.took);
    if (seq === null) return undefined;
    const out = await client.get('session', seq);
    return out.ok && isBag(out.value) && isBag(out.value.fields) ? { fields: out.value.fields } : undefined;
  });

  const [h, p, a, hs, t, q] = await Promise.all([history, project, asked, helpers, took, questions]);
  return {
    ...(q === undefined ? {} : { questions: q }),
    ...(h === undefined ? {} : { history: h }),
    ...(p === undefined ? {} : { project: p }),
    ...(a === undefined ? {} : { asked: a }),
    ...(hs === undefined ? {} : { helpers: hs.rows, ...(hs.inAll > hs.rows.length ? { helpersInAll: hs.inAll } : {}) }),
    ...(t === undefined ? {} : { took: t }),
  };
}
