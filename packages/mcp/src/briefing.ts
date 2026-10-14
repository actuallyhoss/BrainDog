/**
 * `context`, as an agent reads it first: a card of five slots, and beside it the briefing cut to what a session acts on.
 *
 *     BrainDog · run S731 · project BrainDog · Claude Code on MacBook
 *     Next     Cut page answers to block summaries. (S729, Claude Code, 5h ago, check before acting)
 *     Waiting  2 on Mara: Change how copperleaf starts? · 3 bank texts the pattern couldn't read
 *     Who      Priya Raman (client), Teodor Vance (Copperleaf), Wren, +4 · for Brightwell
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
 * THE CARD IS THE RECORD'S NOW (`packages/record/src/card.ts`, AGT-B07): `context` sends `card`, and this prints it, then
 * the open work and the habits. The card composed here is only for a context that carries none, a test's or an old host's.
 *
 * PURE, as `brief.ts` is: the tools in `index.ts` read the record, and this decides what is said.
 */

import { alikeKey, handlesIn, nameOnly, namedIn, plainOf, rowLine, titleOf, unaddressed, type Decl, type Look, type Shaped } from './brief.ts';
import { agentOf, ago, callOf, clip, counted, grouped, runnerOf, ULID } from './words.ts';

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

/* `plainOf` AND `handlesIn` ARE `brief.ts`'s, where every other answer says a question too, and named here for the callers that read them here. */
export { handlesIn, plainOf };

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

type Group = { id: string; name: string; kind: Kind; decl: Decl | undefined; rows: Record<string, unknown>[]; inherited: Record<string, unknown>[]; truncated: boolean; everywhere: number | null };

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

/** The people the Who slot names, and how many more. */
const WHO_SHOWN = 3;

/**
 * A person's or an organisation's words as `context` sends them: a name, or a handle whose words this answer read.
 *
 * NEVER AN ADDRESS (audit 19, M11). The record keeps a person met by mail under their address until somebody says their
 * name, so `jo@kiln.example` came to the Who slot as a name. One beside a name goes and the name stays; an address alone
 * names nobody, and the slot says the people it can name.
 */
function wordsOf(value: unknown, look: Look): string | null {
  if (typeof value === 'string') {
    const said = value.trim();
    if (said === '' || ULID.test(said)) return null;
    /* A HANDLE IS SAID BY ITS WORDS OR NOT AT ALL: the slot names people, and `O3` names nobody. */
    if (/^(?:[A-Z]{1,4}[1-9][0-9]*|[a-z][a-z0-9_]*#[1-9][0-9]*)$/u.test(said)) {
      const title = look.title(said);
      return title === undefined ? null : nameOnly(title);
    }
    return nameOnly(said);
  }
  if (isObject(value)) return wordsOf(value.name ?? value.title, look);
  return null;
}

/** When somebody was last in touch, as a number to sort by, or `null` where `context` did not say. */
const touched = (p: Record<string, unknown>): number | null => {
  for (const k of ['in_touch', 'last_in_touch', 'touched_at']) {
    const at = typeof p[k] === 'string' ? Date.parse(p[k]) : NaN;
    if (Number.isFinite(at)) return at;
  }
  return null;
};

/**
 * The Who slot: the three people most recently in touch on this project, each with their role or organisation, how many
 * more, and the organisation the project is for.
 *
 *     Who      Priya Raman (client), Teodor Vance (Copperleaf), Wren, +4 · for Brightwell
 *
 * IT REPLACED "6 people met here" UNDER MORE. An agent about to write to somebody, or told "ask Priya", read a count and
 * had to list People to learn who that was. The record sends up to ten people linked to the project, the most recently
 * touched first (`context`'s `people`), with a name and, where the list says them, a role, an organisation and when they
 * were last in touch; the person whose record it is (`self`) is not somebody met. Nothing is said where nothing is
 * known, and no handle is said for a person, because the slot is read by a person through the agent.
 */
export function whoSaid(c: Record<string, unknown>, project: Record<string, unknown> | null, look: Look): string | null {
  /* THE ORGANISATIONS `context` SENDS (`organisations`, each `{ spoken, name, kind }`, the project's own first), read
     for two things: a person's organisation sent as a handle is said by its name from here when this answer read no
     words for it, and the project's own is what it is for. */
  const organisations = (Array.isArray(c.organisations) ? c.organisations : []).filter(isObject);
  const orgNames = new Map(organisations.flatMap((o) => (typeof o.spoken === 'string' && typeof o.name === 'string' && o.name.trim() !== '' ? [[o.spoken, o.name.trim()] as const] : [])));
  const said: Look = { ...look, title: (spoken) => look.title(spoken) ?? orgNames.get(spoken) };
  const people = (Array.isArray(c.people) ? c.people : []).filter(isObject).filter((p) => p.self !== true);
  const order = people.map((p, i) => ({ p, i, at: touched(p) }));
  /* THE DATED FIRST, NEWEST AT THE TOP, and anybody `context` sent no date for after them in the order it sent: a
     comparison that fell back to the order only between two undated people could put one above somebody in touch today. */
  order.sort((a, z) => (a.at === z.at ? a.i - z.i : a.at === null ? 1 : z.at === null ? -1 : z.at - a.at));
  const named = order
    .map(({ p }) => {
      const name = wordsOf(p.name, said) ?? wordsOf(titleOf(shapedOf(p).fields, undefined), said);
      if (name === null) return null;
      const about = wordsOf(p.role, said) ?? wordsOf(p.org, said) ?? wordsOf(p.organisation, said);
      return about && about.toLowerCase() !== name.toLowerCase() ? `${clip(name, 40)} (${clip(about, 30)})` : clip(name, 40);
    })
    .filter((n): n is string => n !== null);
  const total = typeof c.people_total === 'number' && c.people_total >= named.length ? c.people_total : named.length;
  const rest = total - Math.min(named.length, WHO_SHOWN);
  /* WHAT THE PROJECT IS FOR IS ITS OWN ORGANISATION: one the project names, else one `context` marks `linked`, else, from
     a record that marks none, the first it sent, which is the linked one when there is one. One marked not linked is
     only who its people are with, and they already say so beside their names. */
  const marked = organisations.some((o) => typeof o.linked === 'boolean');
  const own = marked ? organisations.filter((o) => o.linked === true) : organisations;
  const orgs = [project?.org, project?.organisation, ...own];
  const org = orgs.map((o) => wordsOf(o, said)).find((o): o is string => o !== null) ?? null;
  /* ONE THING FOR THE PEOPLE AND ONE FOR THE ORGANISATION, as every slot names at most three. */
  const who = [...named.slice(0, WHO_SHOWN), ...(rest > 0 ? [`+${grouped(rest)}`] : [])].join(', ');
  const parts = [...(who ? [who] : []), ...(org ? [`for ${clip(org, 40)}`] : [])];
  return parts.length === 0 ? null : parts.join(' · ');
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
      /* THE RECORD'S OWN COUNT OF WHAT APPLIES EVERYWHERE when it sends one (`capRegister`, AGT-B09): it sends five rows
         a list, so the rows it sent are not how many there are. */
      everywhere: typeof r.everywhere === 'number' && Number.isInteger(r.everywhere) && r.everywhere >= 0 ? r.everywhere : null,
    };
  });
  const registers = groups.map((g) => {
    /* A KEPT LIST IS ITS COUNT AND THE ROWS OF THIS PROJECT, never the ones that apply everywhere: the owner's 166 keys
       and 36 skills were the same rows in every session's briefing, and a key is asked for by name when it is needed. */
    if (g.kind === 'kept') {
      const everywhere = Math.max(g.everywhere ?? 0, g.inherited.length);
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
     bank texts one pattern could not read, two of them word for word, and the briefing printed each. By the same key
     `governance` groups by (`alikeKey`), so a name, an amount or a row's words that differ keep two questions two. */
  const merged = new Map<string, { id: string; question: string; alike: string[] }>();
  for (const w of asked) {
    const key = alikeKey(w, (h) => look.title(h)) || `#${String(w.id)}`;
    const held = merged.get(key);
    if (held) held.alike.push(String(w.id));
    else merged.set(key, { id: String(w.id), question: String(w.question), alike: [] });
  }
  const questions = [...merged.values()];
  const total = Math.max(b.waiting ?? 0, asked.length);
  /* HOW MANY THINGS WAIT, as far as this answer can tell them apart: the distinct questions among the ones it read, and
     every question past them, which it could not compare. */
  const distinct = questions.length + (total - asked.length);

  /* ── the learnings, in the order `braindog:learnings` reads them (AGT-C14): the kind the list declares first before the
     next (a method before a fact), this project's before everywhere's, then the newest. The kinds are the list's own,
     so no kind is named here, and a list that declares none is newest first as it was. The sort is stable. ──── */

  const learned = groups.filter((g) => g.kind === 'learned');
  const lessons = learned.flatMap((g) => {
    const kinds = g.decl?.fields.find((f) => f.id === 'kind' && f.type === 'enum' && f.retired !== true)?.values ?? [];
    const rank = (r: Record<string, unknown>): number => {
      const at = typeof r.kind === 'string' ? kinds.indexOf(r.kind) : -1;
      return at === -1 ? kinds.length : at;
    };
    return [...newest(g.rows), ...newest(g.inherited)].sort((a, z) => rank(a) - rank(z)).map((r) => ({ spoken: String(r.spoken), words: titleOf(shapedOf(r).fields, g.decl) }));
  });
  const shownLessons = lessons.filter((l) => l.words !== '').slice(0, LEARNED_SHOWN);

  /* ── the card ──────────────────────────────────────────────────────────── */

  const runner = Object.keys(mine).length > 0 ? runnerOf(mine) : null;
  /* THE PROJECT'S NAME IS A ROW'S WORDS, and one named for its folder or its owner's address was said as it was
     (audit 21, item 15): said as every other row's words are, and a project with none by its list's word and handle. */
  const projectWords = project && text(project.name) ? nameOnly(String(project.name)) : null;
  const projectName = project ? (projectWords ? plainOf(projectWords, look, false) : namedIn('', String(project.spoken), look)) : null;
  const head = [
    'BrainDog',
    mineSpoken ? `run ${mineSpoken}` : 'no run yet',
    projectName ? `project ${clip(projectName, 40)}` : 'no project',
    runner,
  ]
    .filter(Boolean)
    .join(' · ');
  const card: string[] = [clip(head, LINE_MOST)];

  if (handoff) {
    const about = [from, by, age === null ? null : ago(age), check ? 'check before acting' : null].filter(Boolean).join(', ');
    card.push(slot('Next', `${clip(plainOf(String(handoff.next), look), 180)} (${about})`));
  } else if (text(c.next)) card.push(slot('Next', clip(plainOf(String(c.next), look), 200)));

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

  const who = whoSaid(c, project, look);
  if (who) card.push(slot('Who', who));

  if (shownLessons.length > 0) card.push(slot('Learned', shownLessons.map((l) => clip(plainOf(l.words, look), 130)).join(' · ')));

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
  /* THE PEOPLE ARE THE WHO SLOT NOW, by name, and not a count under More. */
  const people = (Array.isArray(c.people) ? c.people : []).filter(isObject);
  /* ONE PHRASE OF COUNTS AND THE CALL THAT OPENS THEM, so this slot holds two things and not six. */
  if (more.length > 0) card.push(slot('More', `${spokenList(more.slice(0, 5))} · call ${callOf('context', { format: 'full' })}`));

  let said = card.join('\n');
  if (said.length > CARD_MOST) said = said.slice(0, CARD_MOST).replace(/\n[^\n]*$/u, '');
  /* THE RECORD'S OWN CARD WHEN IT SENT ONE (`card.ts`, AGT-B07), printed as it came, so the start hook, `context` and
     `braindog context` say one text made by one set of rules. It already says the runs in this tree and the red signs,
     so the lines below leave those out. The card composed above is for a record that sends none. */
  const told = text(c.card);
  if (told !== null) said = told;

  /* ── what follows the card ─────────────────────────────────────────────── */

  const lines: string[] = [];
  for (const r of told === null ? here : []) {
    const as = agentOf(r.agent, true);
    const same = text(mine.agent) === null || r.agent === mine.agent;
    lines.push(
      `Two sessions: ${as} (${String(r.spoken)}) is live in this folder too${typeof r.age_s === 'number' ? `, seen ${ago(r.age_s)}` : ''}${text(r.doing) ? `, ${clip(plainOf(String(r.doing), look), 60)}` : ''}. Two sessions in one working tree overwrite each other${same ? '; if that is not you, coordinate or stop' : '. Coordinate or stop'}.`,
    );
  }
  const ambiguous = Array.isArray(c.ambiguous) ? c.ambiguous.filter((a): a is string => typeof a === 'string') : [];
  /* ONE QUESTION, which the agent can put to the person as it stands: which of these this folder is. It was a statement
     of what the record could not tell, with the consequence after it, and nothing for anybody to answer. */
  if (ambiguous.length > 0) {
    const named = ambiguous.slice(0, 3).map((a) => namedIn(look.title(a) ?? '', a, look, 40));
    const rest = ambiguous.length - named.length;
    const choices = rest > 0 ? `${named.join(', ')} or one of ${grouped(rest)} more` : named.length === 1 ? named[0]! : `${named.slice(0, -1).join(', ')} or ${named.at(-1)!}`;
    lines.push(`Which project is this folder, ${choices}? Until one is set you work in no project.`);
  }
  /* THE RED SIGNS, each by name with its own sentence, so an agent starting work sees what the record says is wrong with
     itself (C07-f). The record has already held back what this key may not read (`quietSign`). */
  const signs = (Array.isArray(c.signs) ? c.signs : []).filter(isObject).filter((s) => typeof s.name === 'string' && typeof s.said === 'string');
  for (const s of told === null ? signs.slice(0, 3) : []) lines.push(`Red on this record: ${String(s.name)}. ${String(s.said)}`);
  for (const g of groups) {
    if (g.kind !== 'work') continue;
    const rows = [...g.rows, ...g.inherited];
    if (rows.length === 0) continue;
    const where = g.rows.length > 0 ? 'here' : 'everywhere';
    lines.push(`Open ${where} · ${g.name} · ${rows.length > WORK_SHOWN ? `${String(WORK_SHOWN)} of ${grouped(rows.length)}${g.truncated ? '+' : ''}` : grouped(rows.length)}`);
    /* A TASK'S WORDS CAN BE AN ADDRESS ("Reply to jo@kiln.example"), and the briefing is read, never a field to copy, so
       it goes here as it does from a step (audit 19, M11). `get` still answers a person's email field as written. */
    for (const r of rows.slice(0, WORK_SHOWN)) lines.push(unaddressed(rowLine(shapedOf(r), g.id, look)));
    if (rows.length > WORK_SHOWN) lines.push(`More: ${callOf('list', { register: g.id, where: openHere(g.decl, g.rows.length > 0 && project ? String(project.spoken) : null) })}`);
  }
  if (b.home) lines.push(`Home page: ${clip(b.home.title, 60)}. Read it at braindog:page/home.`);
  const tasks = groups.some((g) => g.id === 'tasks') || look.decl('tasks') !== undefined;
  const taught = teach({ session: mineSpoken, project: project ? String(project.spoken) : null, tasks });

  const value: Record<string, unknown> = {
    card: said,
    /* NO NULL IN A BRIEF ANSWER (`answer-hygiene.test.ts`): a card with no Next line sends no `card_next`, and a build
       whose command never said itself sends only whether it is behind. */
    ...(told !== null && text(c.card_next) ? { card_next: c.card_next } : {}),
    ...(told !== null && isObject(c.build) ? { build: { ...(text(c.build.cli) ? { cli: c.build.cli } : {}), behind: c.build.behind === true } } : {}),
    ...(b.home ? { home: b.home.slug } : {}),
    ...(session ? { session: { spoken: session.spoken, ...(text(session.state) ? { state: session.state } : {}), ...(runner ? { as: runner } : {}) } } : {}),
    ...(project ? { project: { spoken: project.spoken, name: project.name, ...(text(project.how) ? { how: project.how } : {}) } } : {}),
    ...(ambiguous.length > 0 ? { ambiguous } : {}),
    ...(signs.length > 0 ? { signs: signs.map((s) => ({ name: s.name, said: s.said })) } : {}),
    ...(handoff
      ? {
          handoff: {
            from,
            ...(by ? { by } : {}),
            ...(age === null ? {} : { age: ago(age), age_s: age }),
            next: unaddressed(String(handoff.next)),
            ...(tried.length > 0 ? { tried: tried.map(unaddressed) } : {}),
            ...(text(handoff.head) ? { head: handoff.head } : {}),
            ...(check ? { check: true } : {}),
          },
        }
      : {}),
    ...(here.length > 0 || elsewhere.length > 0 ? { live: { ...(here.length > 0 ? { same_repo: here.map(runOf) } : {}), ...(elsewhere.length > 0 ? { elsewhere: elsewhere.length } : {}) } } : {}),
    /* THE QUESTIONS AND THE STEP KEEP THEIR HANDLES HERE, which an agent acts on, and lose any address, which it never does. */
    ...(total > 0 ? { waiting: { count: total, shown: questions.map((q) => ({ id: q.id, question: unaddressed(q.question), ...(q.alike.length > 0 ? { alike: q.alike } : {}) })) } } : {}),
    registers,
    ...(people.length > 0 ? { people: people.slice(0, PEOPLE_MOST).map((p) => lean(p, false, KEPT_TEXT)) } : {}),
    ...(typeof c.faded === 'number' && c.faded > 0 ? { faded: c.faded } : {}),
    ...(text(c.next) ? { next: c.next } : {}),
    teach: taught,
  };
  return { value, text: [said, ...lines, ...taught].join('\n'), card: said };
}
