/**
 * `context`, as an agent reads it first: the record's card, and beside it the briefing cut to what a session acts on.
 *
 * ONE CARD, THE RECORD'S (`packages/record/src/card.ts`, AGT-B07; "the same card from context", and
 * "keep MCP/HTTP/CLI one core", HD.316). `context` sends `card`, and this door prints it as it came, then the open work,
 * the Home page and the habits, none of which is a card. The door composes no card of its own: a second composer here
 * was a second set of rules, and the card a session read was whatever this package was built with. A host too old to
 * send one gets one line, `Connected to <record>. Call context.`, and nothing drawn in its place.
 *
 * THE REST OF THE BRIEFING STAYS, LEANER. Work (a list that declares who holds a row or when it is finished) and
 * learnings are listed; every other list that says where its rows apply, keys and skills and tools among them, is a
 * count and the rows of this project only, because "what applies everywhere" is the same forty rows every session.
 *
 * PURE, as `brief.ts` is: the tools in `index.ts` read the record, and this decides what is said.
 */

import { alikeKey, handlesIn, namedIn, pendingOf, plainOf, rowLine, unaddressed, type Decl, type Look, type Shaped } from './brief.ts';
import { agentOf, ago, callOf, clip, grouped, runnerOf, ULID } from './words.ts';

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
  /** The record as `boot` names it (`{ name, slug }`, or its name), for the one line a host with no card is told. */
  record?: unknown;
};

/** A day, in seconds: a step older than this is checked before it is acted on. */
const DAY_S = 86_400;

/** The most rows of one list the lean briefing carries, by kind. */
const WORK_MOST = 10;
const LEARNED_MOST = 5;
const KEPT_MOST = 10;
const PEOPLE_MOST = 5;
/** The most characters one text of a kept row carries: a skill's trigger is a paragraph, and its name is what is read. */
const KEPT_TEXT = 160;
/** The work rows said after the card, of each list. */
const WORK_SHOWN = 5;

/**
 * The one line a host with no card is told: which record answered, and the call that has the rest.
 *
 * THE RECORD'S NAME, NEVER AN ID: its name, else its slug as its address says it, else BrainDog. A ULID names nobody.
 */
export function connectedLine(record: unknown, c: Record<string, unknown> = {}): string {
  const named = [record, c.record].flatMap((r) => (isObject(r) ? [r.name, r.title, r.slug] : [r])).map((r) => (typeof r === 'string' ? r.trim() : '')).find((r) => r !== '' && !ULID.test(r));
  return `Connected to ${named === undefined ? 'BrainDog' : clip(unaddressed(named), 60)}. Call context.`;
}

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
          `One project's tasks: list tasks where {"field":"thing","is":"${c.project ?? "<the project's name>"}"}.`,
          `To add a note to a task, log on it, which keeps each line in its history and leaves the note field alone; an update that patches note replaces the whole note.`,
        ]
      : []),
  ];
}

/**
 * The briefing, lean, with the record's card, and the text an agent reads: that card as it came, then what else applies here.
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
      /* THE RECORD'S OWN COUNT OF WHAT APPLIES EVERYWHERE when it sends one (`capRegister`): it sends five rows
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

  /* ── the card ──────────────────────────────────────────────────────────── */

  const runner = Object.keys(mine).length > 0 ? runnerOf(mine) : null;
  const people = (Array.isArray(c.people) ? c.people : []).filter(isObject);
  /* THE RECORD'S CARD, PRINTED AS IT CAME (`card.ts`), so the start hook, `context` and `braindog context` say
     one text made by one set of rules. It already says the runs in this tree, the red signs and the Home page. A host
     that sends none is told the one line, and nothing is drawn in the card's place. */
  const told = text(c.card);
  const said = told ?? connectedLine(b.record, c);

  /* ── what follows the card ─────────────────────────────────────────────── */

  const lines: string[] = [];
  /* WHAT AN AGENT ACTING FOR A COLLEAGUE REACHES, one line the record said ("You act for Sam and can view Kiln.
     Amounts are hidden from you."), first after the card, so a list it expected and does not see is not taken for an empty one. A plan says
     it itself, as its Reach line. */
  const reach = text(c.reach);
  if (reach !== null && text(c.plan) === null) lines.push(reach);
  const ambiguous = Array.isArray(c.ambiguous) ? c.ambiguous.filter((a): a is string => typeof a === 'string') : [];
  /* ONE QUESTION, which the agent can put to the person as it stands: which of these this folder is. It was a statement
     of what the record could not tell, with the consequence after it, and nothing for anybody to answer. */
  if (ambiguous.length > 0) {
    const named = ambiguous.slice(0, 3).map((a) => namedIn(look.title(a) ?? '', a, look, 40));
    const rest = ambiguous.length - named.length;
    const choices = rest > 0 ? `${named.join(', ')} or one of ${grouped(rest)} more` : named.length === 1 ? named[0]! : `${named.slice(0, -1).join(', ')} or ${named.at(-1)!}`;
    lines.push(`Which project is this folder, ${choices}? Until one is set you work in no project.`);
  }
  /* AND AN AGENT WITH NO FOLDER IN NO PROJECT IS ASKED ONE THING (`Context.ask`): what the person is working on, which it
     sends back as `topic` and the record places its run by. Claude.ai and ChatGPT have no folder to place them. */
  const ask = text(c.ask);
  if (ask !== null) lines.push(ask);
  /* THE RED SIGNS ARE THE CARD'S (its `Signs` slot), so they are kept here for the agent that acts on one, never said again. */
  const signs = (Array.isArray(c.signs) ? c.signs : []).filter(isObject).filter((s) => typeof s.name === 'string' && typeof s.said === 'string');
  for (const g of groups) {
    if (g.kind !== 'work') continue;
    const rows = [...g.rows, ...g.inherited];
    if (rows.length === 0) continue;
    const where = g.rows.length > 0 ? 'here' : 'everywhere';
    lines.push(`Open ${where} · ${g.name} · ${rows.length > WORK_SHOWN ? `${String(WORK_SHOWN)} of ${grouped(rows.length)}${g.truncated ? '+' : ''}` : grouped(rows.length)}`);
    /* A TASK'S WORDS CAN BE AN ADDRESS ("Reply to jo@kiln.example"), and the briefing is read, never a field to copy, so
       it goes here as it does from a step. `get` still answers a person's email field as written. */
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
    ...(ask !== null ? { ask } : {}),
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
    ...(reach !== null ? { reach } : {}),
    teach: taught,
  };
  /**
   * THE PLAN, WHEN THE RECORD DREW ONE (`packages/record/src/context-plan.ts`, agents and MCP plan §3): what he told the
   * agent first, then the card, what it may do, its rules, who else is here, its lane, decisions and lessons, cut to its
   * budget, each cut section ending with the call that reads the rest. It takes the place of the open work after the
   * card, which is its lane now, and of the Home page line. The teaching lines are said once a run: on a call before the
   * run has written anything, which is its first. A host too old to draw one is answered as before.
   */
  const plan = text(c.plan);
  if (plan === null) return { value, text: [said, ...lines, ...taught].join('\n'), card: said };
  const toldNow = pendingOf(c.told);
  const stop = isObject(c.stop) ? c.stop : null;
  const planned: Record<string, unknown> = {
    ...value,
    ...(typeof c.stamp === 'string' ? { stamp: c.stamp } : {}),
    ...(toldNow.length > 0 ? { told: toldNow } : {}),
    ...(stop === null ? {} : { stop: { kind: stop.kind, id: stop.id, said: stop.said } }),
    ...(text(c.may) ? { may: c.may } : {}),
    ...(Array.isArray(c.retire) && c.retire.length > 0 ? { retire: c.retire } : {}),
  };
  const first = session === null ? taught : [];
  /* THE CARD IN THE ANSWER IS THE PLAN'S, the one its text prints, with no More line: this is context. */
  const planCard = text(c.plan_card) ?? said;
  return { value: { ...planned, card: planCard, teach: first }, text: [plan, ...lines.filter((l) => l.startsWith('Which project') || l === ask), ...first].join('\n'), card: planCard };
}
