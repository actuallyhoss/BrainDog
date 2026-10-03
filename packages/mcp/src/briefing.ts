/**
 * `context`, as an agent reads it first: a card of five slots, and beside it the briefing cut to what a session acts on.
 *
 *     BrainDog · run S731 · project BrainDog · Claude Code on MacBook
 *     Next     Cut page answers to block summaries. (S729, Claude Code, 5h ago, check before acting)
 *     Waiting  2 on Sam: Update prism to match this Mac? · 3 bank texts the pattern couldn't read
 *     Learned  Money is minor units plus currency. Never add two currencies.
 *     More     3 dead ends, 5 learnings and 41 keys by name · call context {"format":"full"}
 *
 * WHAT IT REPLACED, MEASURED ON THE OWNER'S RECORD: `context` answered 16.6 KB, most of it the forty-one keys and the
 * skills that apply everywhere, each key with an object saying whether its value was sealed; the tools a session can use
 * listed as if they were open work; and a warning that two sessions shared one working tree, where the second was the
 * caller itself. The card is the part every session needs, at most 1,500 characters, three things a slot, each slot left
 * out when it has nothing to say. It is the agent research's fixed-slot card (`loop/reports/BrainDog agent and MCP
 * experience.md`, "Brief in five lines"), in the order it gives: who and where, next, waiting, learned, on demand.
 *
 * THE REST OF THE BRIEFING STAYS, LEANER. Work (a list that declares who holds a row or when it is finished) and
 * learnings are listed; every other list that says where its rows apply, keys and skills and tools among them, is a
 * count and the rows of this project only, because "what applies everywhere" is the same forty rows every session.
 *
 * PURE, as `brief.ts` is: the tools in `index.ts` read the record, and this decides what is said.
 */

import { named, rowLine, titleOf, type Decl, type Look, type Shaped } from './brief.ts';
import { agentOf, ago, callOf, clip, counted, deviceOf, gist, grouped, oneLine, runnerOf } from './words.ts';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

/** What the briefing is built from: the record's `context`, and the reads the tools made beside it. */
export type Briefing = {
  /** The record's own `context` answer. */
  context: Record<string, unknown>;
  look: Look;
  /** The caller's run as the record holds it, when it has one: what says which app and which machine. */
  mine?: Record<string, unknown> | undefined;
  /** The run that left the handoff, when one did: which app left the step. */
  left?: Record<string, unknown> | undefined;
  /** How many questions wait in all, where `context` lists the newest few. */
  waiting?: number | undefined;
  /** The page Home draws, by slug and title, or `null` where the record declares none. */
  home: { slug: string; title: string } | null;
};

/** The width of a slot's label, so the four read as a column: `Waiting  ` and `Next     `. */
const LABEL = 9;
/** The most one line of the card says, so five of them and their breaks stay inside `CARD_MOST`. */
const LINE_MOST = 290;
/** The most the card says. Measured, the owner's queue and handoff alone ran past it before every slot was cut. */
export const CARD_MOST = 1_500;
/** The most a slot names. */
const SLOT_MOST = 3;
/** A day, in seconds: a step older than this is checked before it is acted on. */
const DAY_S = 86_400;
/** The learnings the card names: the two newest that apply here. */
const LEARNED_SHOWN = 2;

/** The most rows of one list the lean briefing carries, by kind. */
const WORK_MOST = 10;
const LEARNED_MOST = 5;
const KEPT_MOST = 10;
const PEOPLE_MOST = 5;
/** The most characters one text of a kept row carries: a skill's trigger is a paragraph, and its name is what is read. */
const KEPT_TEXT = 160;
/** The work rows said after the card, of each list. */
const WORK_SHOWN = 5;

/** Things said as a person lists them: `a`, `a and b`, `a, b and c`. */
const spokenList = (items: readonly string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)!}`);

/** A slot: its label padded to the column, and its line cut at a word. The padding is added after the cut, which closes up spaces. */
const slot = (label: string, body: string): string => `${label.padEnd(LABEL)}${clip(body, LINE_MOST - LABEL)}`;

/**
 * Somebody's sentence with what a person should never be read taken out of it: a machine's own name becomes the kind of
 * machine it is, and a file's path becomes the file's name. A handle is turned into the words of its row where this
 * answer read them.
 *
 * THE QUESTIONS ARE WRITTEN BY THE RECORD'S OWN AUTOMATIONS, and one on the owner's record read "Change tools#8 to how
 * fly-prism is set up in ~/.claude.json on Maras-MacBook-Pro.local?", the machine's name, a path in his home
 * folder and a handle where its name was known. Where they are written is not this package; where they are read is.
 */
export function plainOf(said: string, look: Look, handles = true): string {
  let out = oneLine(said)
    .replace(/(?<![\w./\\-])[A-Za-z0-9][A-Za-z0-9-]*\.local(?![\w-]|\.\w)/gu, (host) => deviceOf(host) ?? 'this machine')
    .replace(/\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{4,}\b/gu, (host) => deviceOf(host) ?? 'this machine')
    .replace(/(?<=^|[\s("'])(?:~|\.{1,2})?\/[^\s,;)"']+/gu, (path) => path.replace(/\/+$/u, '').split('/').at(-1) || 'a folder');
  if (handles)
    out = out.replace(/\b[a-z][a-z0-9_]*#[1-9][0-9]*\b/gu, (handle) => {
      const words = look.title(handle);
      return words ? clip(words, 40) : handle;
    });
  return out;
}

/** The handles a question names, `tools#8`, so the tool can read their words before the card is said. */
export const handlesIn = (said: string): string[] => [...new Set(oneLine(said).match(/\b[a-z][a-z0-9_]*#[1-9][0-9]*\b/gu) ?? [])];

/** The number in a handle, for telling the newest of a list's rows: `LN12` is newer than `LN9`. */
const seqOf = (spoken: unknown): number => Number(/(\d+)$/u.exec(String(spoken ?? ''))?.[1] ?? 0);

/** A row `context` briefed, as a page's row: its handle, version and state, and its fields with the record's keys left out. */
function shapedOf(row: Record<string, unknown>): Shaped {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!['spoken', 'version', 'scope', 'state'].includes(k)) fields[k] = v;
  return {
    spoken: String(row.spoken ?? ''),
    ...(typeof row.version === 'number' ? { version: row.version } : {}),
    ...(typeof row.state === 'string' ? { state: row.state } : {}),
    fields,
  };
}

/**
 * A briefed row, lean: its handle, version and state, and its words, with nothing empty and nothing about a key's grant.
 *
 * THE GRANT'S STATE WENT, `{ sealed, opened, last_opened, last_by }` on every key, because what an agent does with a key
 * is ask for it by name (`braindog keys`), and whether it was sealed or who opened it last is the owner's to read in
 * the app. It was a fifth of the owner's briefing. `room` cuts a long text, a skill's trigger, at a word.
 */
function lean(row: Record<string, unknown>, everywhere: boolean, room = Infinity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'scope' || v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (isObject(v) && Object.hasOwn(v, 'sealed')) continue;
    out[k] = typeof v === 'string' && v.length > room ? clip(v, room) : v;
  }
  return everywhere ? { ...out, everywhere: true } : out;
}

/** The predicate for a list's open rows, on one project where there is one: what the closing line of "Open here" asks. */
function openHere(decl: Decl | undefined, project: string | null): unknown {
  const state = decl?.state;
  const done = decl?.done ?? [];
  const scope = decl?.fields.find((f) => f.scope !== undefined && f.retired !== true)?.id;
  const parts = [
    ...(state !== undefined && done.length > 0 ? [{ field: state, not_in: [...done] }] : []),
    ...(project !== null && scope !== undefined ? [{ field: scope, is: project }] : []),
  ];
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { all: parts };
}

/** What kind of list a briefed register is, read off its declaration. */
type Kind = 'work' | 'learned' | 'kept';
function kindOf(decl: Decl | undefined): Kind {
  /* WORK IS WHAT SOMEBODY HOLDS OR FINISHES, the two keys a list declares for it (`42 §4`): tasks are work, and a list
     of the tools an agent can start is not, however many of its rows are open. The owner's briefing listed five MCP
     servers under "Open in Tools" as though they were things to do. */
  if (decl?.hand !== undefined || decl?.finished !== undefined) return 'work';
  /* A LEARNING IS A ROW THE RECORD FADES, which is a row with `confirmed_on`: the record leaves one out of `context`
     ninety days after anybody last confirmed it (`FADES` in `packages/record/src/index.ts`). */
  if (decl?.fields.some((f) => f.id === 'confirmed_on' && f.type === 'day' && f.retired !== true)) return 'learned';
  return 'kept';
}

type Group = { id: string; name: string; kind: Kind; decl: Decl | undefined; rows: Record<string, unknown>[]; inherited: Record<string, unknown>[]; truncated: boolean };

/** Newest first, by the number in the handle. */
const newest = (rows: readonly Record<string, unknown>[]): Record<string, unknown>[] => [...rows].sort((a, z) => seqOf(z.spoken) - seqOf(a.spoken));

/**
 * The lines `context` teaches, cut to the ones that apply to this caller.
 *
 * THE NOTE LINE SAYS "WITH NO SPOKEN", and names the run only beside it. `log` with no row goes on the caller's own run
 * whichever run the record takes the caller to be, while a run named here was the record's guess at the caller's run,
 * and measured on the owner's machine the guess was a run from a folder file left by an earlier session.
 */
export function teach(c: { session: string | null; project: string | null; tasks: boolean }): string[] {
  return [
    `A note about nothing in particular goes on your own session${c.session ? ` (${c.session})` : ''}: log it with no spoken${c.session ? '' : ', which opens the session as handoff would'}.`,
    ...(c.tasks
      ? [
          `A task's lane is its agent field, and the person's own lane is where it is empty: list tasks where "agent is empty".`,
          /* NO EXAMPLE ID WHEN THE CALLER IS IN NO PROJECT: `things#1` was taught here once, and on the seed it is Kiln, so a
             copied sentence read 14 of Kiln's tasks as the project asked about. */
          `One project's tasks: list tasks where {"field":"thing","is":"${c.project ?? "<the project's spoken id>"}"}.`,
          `To add a note to a task, log on it, which keeps each line in its history and leaves the note field alone; an update that patches note replaces the whole note.`,
        ]
      : []),
  ];
}

/**
 * The briefing, lean, with its card, and the text an agent reads: the card, then what else applies here.
 */
export function briefed(b: Briefing): { value: Record<string, unknown>; text: string; card: string } {
  const c = b.context;
  const look = b.look;
  const session = isObject(c.session) && typeof c.session.spoken === 'string' ? c.session : null;
  const project = isObject(c.project) && typeof c.project.spoken === 'string' ? c.project : null;
  const handoff = isObject(c.handoff) && typeof c.handoff.next === 'string' ? c.handoff : null;
  const mine = b.mine ?? {};
  const left = b.left ?? {};
  const mineSpoken = session ? String(session.spoken) : null;

  /* ── the lists ─────────────────────────────────────────────────────────── */

  const groups: Group[] = (Array.isArray(c.registers) ? c.registers : []).filter(isObject).map((r) => {
    const decl = look.decl(String(r.id));
    return {
      id: String(r.id),
      name: decl?.name ?? String(r.name ?? r.id),
      kind: kindOf(decl),
      decl,
      rows: Array.isArray(r.rows) ? r.rows.filter(isObject) : [],
      inherited: Array.isArray(r.inherited) ? r.inherited.filter(isObject) : [],
      truncated: r.truncated === true,
    };
  });
  const registers = groups.map((g) => {
    /* A KEPT LIST IS ITS COUNT AND THE ROWS OF THIS PROJECT, never the ones that apply everywhere: the owner's 166 keys
       and 36 skills were the same rows in every session's briefing, and a key is asked for by name when it is needed. */
    if (g.kind === 'kept') {
      const everywhere = g.inherited.length;
      return {
        id: g.id,
        name: g.name,
        rows: g.rows.slice(0, KEPT_MOST).map((r) => lean(r, false, KEPT_TEXT)),
        ...(everywhere > 0 ? { everywhere } : {}),
        ...(g.truncated || g.rows.length > KEPT_MOST ? { more: true } : {}),
      };
    }
    const most = g.kind === 'work' ? WORK_MOST : LEARNED_MOST;
    const ordered = g.kind === 'learned' ? newest(g.rows) : g.rows;
    const also = g.kind === 'learned' ? newest(g.inherited) : g.inherited;
    const all = [...ordered.map((r) => lean(r, false)), ...also.map((r) => lean(r, true))];
    return {
      id: g.id,
      name: g.name,
      rows: all.slice(0, most),
      ...(g.truncated ? { more: true } : all.length > most ? { more: all.length - most } : {}),
    };
  });

  /* ── the runs ──────────────────────────────────────────────────────────── */

  const live = isObject(c.live) ? c.live : {};
  /* NEVER THE CALLER ITSELF. The record leaves the run it took the caller to be out of both lists; a run of the same app
     on the same folder is still said to be "if that is not you", because the record's guess can be another run, as it
     was on the owner's machine, where a folder file named a run three days finished. */
  const here = (Array.isArray(live.same_repo) ? live.same_repo : []).filter(isObject).filter((r) => r.spoken !== mineSpoken);
  const elsewhere = (Array.isArray(live.elsewhere) ? live.elsewhere : []).filter(isObject).filter((r) => r.spoken !== mineSpoken);
  const runOf = (r: Record<string, unknown>) => ({
    spoken: String(r.spoken),
    as: agentOf(r.agent, true),
    ...(text(r.state) ? { state: r.state } : {}),
    ...(text(r.doing) ? { doing: r.doing } : {}),
    ...(typeof r.age_s === 'number' ? { seen: ago(r.age_s) } : {}),
    ...(r.stale === true ? { stale: true } : {}),
    ...(r.quiet === true ? { quiet: true } : {}),
  });

  /* ── the handoff ───────────────────────────────────────────────────────── */

  const age = typeof handoff?.age_s === 'number' ? handoff.age_s : null;
  const from = handoff ? String(handoff.from ?? '') : '';
  /* THE APP THAT LEFT THE STEP, where this answer read its run, and the caller's own where it is the caller's. "An agent"
     says nothing beside the run's handle, so it is left out. */
  const leftBy = Object.keys(left).length > 0 ? left : from === mineSpoken ? mine : {};
  const by = handoff && Object.keys(leftBy).length > 0 && runnerOf(leftBy) !== agentOf(undefined, false) ? runnerOf(leftBy) : null;
  /* CHECKED BEFORE IT IS ACTED ON when it is a day old or another run left it: the tree under a step a day old has
     usually moved, and a step another session left was true of the tree as that session left it, which is the case the
     card's own example draws (S731 picking up S729's step). Only the caller's own step, read back after a pause, is
     taken as it stands. */
  const check = handoff !== null && ((age !== null && age > DAY_S) || from !== mineSpoken);
  const tried = Array.isArray(handoff?.tried) ? handoff.tried.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [];

  /* ── the questions ─────────────────────────────────────────────────────── */

  const asked = (Array.isArray(c.waiting) ? c.waiting : []).filter(isObject).filter((w) => typeof w.question === 'string');
  /* MERGED WHEN THEY READ THE SAME once ids and case are set aside (`gist`): the owner's queue held three questions about
     bank texts one pattern could not read, two of them word for word, and the briefing printed each. */
  const merged = new Map<string, { id: string; question: string; alike: string[] }>();
  for (const w of asked) {
    const key = gist(String(w.question)) || `#${String(w.id)}`;
    const held = merged.get(key);
    if (held) held.alike.push(String(w.id));
    else merged.set(key, { id: String(w.id), question: String(w.question), alike: [] });
  }
  const questions = [...merged.values()];
  const total = Math.max(b.waiting ?? 0, asked.length);
  /* HOW MANY THINGS WAIT, as far as this answer can tell them apart: the distinct questions among the ones it read, and
     every question past them, which it could not compare. */
  const distinct = questions.length + (total - asked.length);

  /* ── the learnings, newest first, this project's before everywhere's ──── */

  const learned = groups.filter((g) => g.kind === 'learned');
  const lessons = learned.flatMap((g) =>
    [...newest(g.rows), ...newest(g.inherited)].map((r) => ({ spoken: String(r.spoken), words: titleOf(shapedOf(r).fields, g.decl) })),
  );
  const shownLessons = lessons.filter((l) => l.words !== '').slice(0, LEARNED_SHOWN);

  /* ── the card ──────────────────────────────────────────────────────────── */

  const runner = Object.keys(mine).length > 0 ? runnerOf(mine) : null;
  const head = [
    'BrainDog',
    mineSpoken ? `run ${mineSpoken}` : 'no run yet',
    project ? `project ${clip(String(project.name ?? project.spoken), 40)}` : 'no project',
    runner,
  ]
    .filter(Boolean)
    .join(' · ');
  const card: string[] = [clip(head, LINE_MOST)];

  if (handoff) {
    const about = [from, by, age === null ? null : ago(age), check ? 'check before acting' : null].filter(Boolean).join(', ');
    card.push(slot('Next', `${clip(plainOf(String(handoff.next), look), 180)} (${about})`));
  } else if (text(c.next)) card.push(slot('Next', clip(String(c.next), 200)));

  if (questions.length > 0) {
    const shown = questions.slice(0, SLOT_MOST).map((q) => {
      /* THE WHOLE QUESTION, CUT AT A WORD: the record's own questions say the fact first and ask second ("Ledger Post,
         sending plan was due 4 days ago, GBP 39.00. Did it go through?"), so a first sentence was often no question. */
      const words = clip(plainOf(q.question, look), 90);
      return q.alike.length === 0 ? words : `${words} (${grouped(1 + q.alike.length)} alike)`;
    });
    const rest = distinct - shown.length;
    card.push(slot('Waiting', `${grouped(distinct)} on ${look.decider}: ${shown.join(' · ')}${rest > 0 ? ` · ${grouped(rest)} more` : ''}`));
  }

  if (shownLessons.length > 0) card.push(slot('Learned', shownLessons.map((l) => clip(plainOf(l.words, look, false), 130)).join(' · ')));

  const more: string[] = [];
  if (tried.length > 0) more.push(counted(tried.length, 'dead end'));
  /* A FLOOR WHERE THE RECORD STOPPED, as a kept list's count is: `22+ learnings` where it sent twenty of this project's. */
  if (lessons.length > 0) more.push(`${grouped(lessons.length)}${learned.some((g) => g.truncated) ? '+' : ''} ${lessons.length === 1 ? 'learning' : 'learnings'}`);
  for (const g of groups) {
    if (g.kind !== 'kept') continue;
    const n = g.rows.length + g.inherited.length;
    if (n === 0) continue;
    const keys = g.decl?.fields.some((f) => f.type === 'secret') === true;
    more.push(`${grouped(n)}${g.truncated ? '+' : ''} ${g.name.toLowerCase()}${keys ? ' by name' : ''}`);
  }
  const people = (Array.isArray(c.people) ? c.people : []).filter(isObject);
  if (people.length > 0) more.push(counted(people.length, 'person met here', 'people met here'));
  /* ONE PHRASE OF COUNTS AND THE CALL THAT OPENS THEM, so this slot holds two things and not six. */
  if (more.length > 0) card.push(slot('More', `${spokenList(more.slice(0, 5))} · call ${callOf('context', { format: 'full' })}`));

  let said = card.join('\n');
  if (said.length > CARD_MOST) said = said.slice(0, CARD_MOST).replace(/\n[^\n]*$/u, '');

  /* ── what follows the card ─────────────────────────────────────────────── */

  const lines: string[] = [];
  for (const r of here) {
    const as = agentOf(r.agent, true);
    const same = text(mine.agent) === null || r.agent === mine.agent;
    lines.push(
      `Two sessions: ${as} (${String(r.spoken)}) is live in this folder too${typeof r.age_s === 'number' ? `, seen ${ago(r.age_s)}` : ''}${text(r.doing) ? `, ${clip(String(r.doing), 60)}` : ''}. Two sessions in one working tree overwrite each other${same ? '; if that is not you, coordinate or stop' : '. Coordinate or stop'}.`,
    );
  }
  const ambiguous = Array.isArray(c.ambiguous) ? c.ambiguous.filter((a): a is string => typeof a === 'string') : [];
  if (ambiguous.length > 0)
    lines.push(`This folder matches ${ambiguous.slice(0, 3).map((a) => named(look.title(a) ?? '', a, 40)).join(', ')}, so you work in no project until one is set.`);
  for (const g of groups) {
    if (g.kind !== 'work') continue;
    const rows = [...g.rows, ...g.inherited];
    if (rows.length === 0) continue;
    const where = g.rows.length > 0 ? 'here' : 'everywhere';
    lines.push(`Open ${where} · ${g.name} · ${rows.length > WORK_SHOWN ? `${String(WORK_SHOWN)} of ${grouped(rows.length)}${g.truncated ? '+' : ''}` : grouped(rows.length)}`);
    for (const r of rows.slice(0, WORK_SHOWN)) lines.push(rowLine(shapedOf(r), g.id, look));
    if (rows.length > WORK_SHOWN) lines.push(`More: ${callOf('list', { register: g.id, where: openHere(g.decl, g.rows.length > 0 && project ? String(project.spoken) : null) })}`);
  }
  if (b.home) lines.push(`Home page: ${clip(b.home.title, 60)}. Read it at braindog:page/home.`);
  const tasks = groups.some((g) => g.id === 'tasks') || look.decl('tasks') !== undefined;
  const taught = teach({ session: mineSpoken, project: project ? String(project.spoken) : null, tasks });

  const value: Record<string, unknown> = {
    card: said,
    ...(b.home ? { home: b.home.slug } : {}),
    ...(session ? { session: { spoken: session.spoken, ...(text(session.state) ? { state: session.state } : {}), ...(runner ? { as: runner } : {}) } } : {}),
    ...(project ? { project: { spoken: project.spoken, name: project.name, ...(text(project.how) ? { how: project.how } : {}) } } : {}),
    ...(ambiguous.length > 0 ? { ambiguous } : {}),
    ...(handoff
      ? {
          handoff: {
            from,
            ...(by ? { by } : {}),
            ...(age === null ? {} : { age: ago(age), age_s: age }),
            next: handoff.next,
            ...(tried.length > 0 ? { tried } : {}),
            ...(text(handoff.head) ? { head: handoff.head } : {}),
            ...(check ? { check: true } : {}),
          },
        }
      : {}),
    ...(here.length > 0 || elsewhere.length > 0 ? { live: { ...(here.length > 0 ? { same_repo: here.map(runOf) } : {}), ...(elsewhere.length > 0 ? { elsewhere: elsewhere.length } : {}) } } : {}),
    ...(total > 0 ? { waiting: { count: total, shown: questions.map((q) => ({ id: q.id, question: q.question, ...(q.alike.length > 0 ? { alike: q.alike } : {}) })) } } : {}),
    registers,
    ...(people.length > 0 ? { people: people.slice(0, PEOPLE_MOST).map((p) => lean(p, false, KEPT_TEXT)) } : {}),
    ...(typeof c.faded === 'number' && c.faded > 0 ? { faded: c.faded } : {}),
    ...(text(c.next) ? { next: c.next } : {}),
    teach: taught,
  };
  return { value, text: [said, ...lines, ...taught].join('\n'), card: said };
}
