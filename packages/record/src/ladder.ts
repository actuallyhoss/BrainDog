/**
 * The ladder of trust, the record's half ("staff who earn trust"): what an agent's write does at the rung
 * it stands on, when it is offered the next rung, and what takes it back down.
 *
 * WHAT THE KERNEL ALREADY SAYS IS READ, NEVER COPIED. A kind of change and its floor are `change-kind.ts`'s, the rung an
 * agent stands on is `rungOf`, the scope's ceiling over it is `ceilingOf`, and whether a filed question may be accepted
 * by the ladder is `ladderFault`, asked at the gate. This file decides only what the record does with those facts:
 *   - a write at Ask, on the floor, or from a run that read text from outside the record is filed as a question instead
 *   - a write at Do and tell or Do quietly is written, and counts as one more change kept
 *   - a learning added where its run is, or confirmed, is written at any rung, and counts towards none (`learnt`)
 *   - after `OFFER_AFTER` kept within `OFFER_DAYS`, with none undone, the owner is asked once whether it may climb
 *   - an undo, `DECLINES_DROP` declines in a row, an anomaly or a change of app takes it back to Ask
 *   - and so does the owner's own press, "Ask again", on a kind it was lifted on (`takeBack`).
 *
 * ONLY A GRANT THE RECORD HOLDS CLIMBS. A token principal is made by a host from the `token` row `verifyToken` read, so
 * every agent in production has one; a principal with no row is a host's own construction for a call of its own, and
 * nothing here can find what it was trusted with.
 *
 * WHAT IT KEEPS IS `local`. The rung is the kernel's `ladder` table (migration 25). What the table has no column for, the
 * times each change was kept, a decline run, an offer waiting, a run marked by untrusted text, is kept in `pref` under
 * names no person holds (`ladder:…`), which is local too and never travels in a `.brain` file. A record restored from a
 * file starts every agent at Ask, the safe end to be wrong at.
 */

import type { Sql } from '@braindog/ports';
import { fadeOf } from './agent-lists.ts';
import {
  LADDER_RULE,
  SLASH,
  ceilingOf,
  endedByCutOff,
  keysOfStamp,
  kindsOfWrite,
  ladderAgentOf,
  madeByIn,
  rungOf,
  shapeIn,
  type ChangeKind,
  type Kernel,
  type ListShape,
  type Rung,
  type Scope,
} from '@braindog/kernel';

/** How many changes of one kind kept unchanged before the next rung is offered. */
export const OFFER_AFTER = 10;
/** Over how many days those changes must have been kept. */
export const OFFER_DAYS = 14;
/** How many declines in a row of one kind take it back to Ask. */
export const DECLINES_DROP = 3;
/** More than this many writes by one run in `ANOMALY_MS` is an anomaly. */
export const ANOMALY_WRITES = 40;
export const ANOMALY_MS = 2 * 60_000;

/** The names in `pref` the ladder keeps its own facts under. None is a person's id, which all begin `p_`. */
const KEPT = (agent: string): string => `ladder:${agent}`;
const OFFERS = 'ladder:offers';
const MARKS = 'ladder:untrusted';
/** What the owner said of each import, by its run: his own, or outside text (`adopt`). */
const IMPORTS = 'ladder:imports';
/** How the client id of `braindog import`'s run begins, as the kernel's `metrics.ts` reads it (`apps/cli/src/import.ts`). */
const IMPORT_CLIENT = 'braindog-import-';
/** How many imports `importsFound` answers, newest first. */
const IMPORTS_SHOWN = 20;
/** The kernel's register of runs, and the states a run does not come back from (`session.ts`, `FINISHED`). */
const RUNS = 'session';
const RUN_ENDED = ['done', 'abandoned'] as const;
/** Why each kind was last taken back, one name an agent, since the `ladder` table has a column for when and none for why. */
const DROPPED = (agent: string): string => `ladder:dropped:${agent}`;

/** What takes a rung back, each as the sentence a person reads beside it (`standing`). */
const DROP_SAID = {
  undone: 'A change like this was undone.',
  declined: `${DECLINES_DROP} changes like this in a row were declined.`,
  burst: `It made more than ${ANOMALY_WRITES} changes in two minutes.`,
  app: 'It began writing from another app.',
  owner: 'You put it back to asking.',
} as const;
export type DropWhy = keyof typeof DROP_SAID;

/**
 * The verb of an attach: a name in a text put on the row it is, by the sentence it was seen in. It is the
 * kernel's `ATTACH` (`change-kind.ts`), said here until the kernel's index hands it out, and a test holds the two equal.
 */
export const ATTACH_VERB = 'attach';

/** The rest of a sentence for an attach, whoever makes it: what the owner is asked to let it do (`kindWords`). */
const ATTACH_SAID = 'put a name on the right person';

/**
 * What an offer still waiting is answered with when its kind is taken back: the reason as `standing` says it, and that
 * it asks again. An attach says what it will ask before, in its own words, and Slash is said by its name.
 */
const withdrawn = (agent: string, kind: string, why: DropWhy | undefined): string => {
  if (kind.slice(kind.indexOf(':') + 1) !== ATTACH_VERB) return 'A change of this kind was taken back, so it asks again before it does this.';
  const said = why === undefined ? 'A name it put on someone was taken back.' : DROP_SAID[why];
  return `${said} ${agent === SLASH ? 'Slash' : 'It'} asks again before it puts a name on anyone.`;
};


/** The migration that made the ladder, whose run lifted the write tokens already there (`seedLadder` in the kernel). */
const LADDER_ARRIVED = 25;
/** How long after that migration a rung it set can be dated: the lift runs in the same pass, moments later. */
const LIFT_WINDOW_MS = 60_000;
/** How far before a drop the undo that caused it is looked for: both are written in one transaction. */
const UNDO_WINDOW_MS = 5_000;

/** Where one agent stands on one kind, as a person reads it: the kind in words, never its key. */
export type StandingKind = { kind: string; rung: Rung; since: string; lifted: boolean; dropped: { at: string; why: string | null } | null };
/**
 * THE ONE NUMBER THE AGENT SIDE IS JUDGED BY ("the share of suggestions accepted unchanged, by kind of change"), over the
 * last `KEPT_SHARE_DAYS`: of the questions it filed that the owner answered, how many he took as filed. A no, a part
 * taken, or a yes undone after is answered and not unchanged. `share` is `accepted` over `answered`, `null` with none
 * answered. By kind too, each kind in words, dearest of a question's kinds first.
 */
export type KeptShare = { accepted: number; answered: number; share: number | null };
export type AgentKept = KeptShare & { days: number; kinds: (KeptShare & { kind: string })[] };
/** Where every agent stands: each by its name, never a grant's id. */
/**
 * `agent` is said once in an answer: a second grant under a name already said carries a number after it, in the order
 * the two were connected. `connected` is when the grant was made, and `null` for Slash, which no grant connects.
 * `asking` is what outside text the agent read, said in words, and when, while that keeps every change of its asking.
 */
export type Standing = {
  agents: { agent: string; connected: string | null; asking: { from: string; at: string } | null; kinds: StandingKind[]; kept?: AgentKept }[];
};

/** How far back the accepted-unchanged share reads. */
export const KEPT_SHARE_DAYS = 90;
/** The most questions one reading of the share reads, newest first. */
const KEPT_SHARE_READ = 5000;

/**
 * One import made into the record: the run it wrote as, said as a person reads a run (`S12`), when it first
 * wrote, how many rows it brought into each list by the list's name, and what the owner said of it: `true` his own,
 * `false` outside text, `null` not said yet.
 */
export type FoundImport = { run: string; at: string; lists: { list: string; rows: number }[]; rows: number; adopted: boolean | null };

/** The rungs in order, lowest first, and the one above each. */
const ORDER: readonly Rung[] = ['ask', 'tell', 'quiet'];
const above = (r: Rung): Rung | null => ORDER[ORDER.indexOf(r) + 1] ?? null;
const lower = (a: Rung, b: Rung): Rung => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/** One agent of `standing` as the ladder holds it: its grant (or Slash), and each kind's key and the rung its row holds. */
type Listed = { id: string; agent: string; connected: string | null; asking: { from: string; at: string } | null; kinds: (StandingKind & { key: string; held: Rung })[] };

/** One agent as a person reads it, with the grant and the keys set aside. */
const plain = (a: Listed, kept?: AgentKept): Standing['agents'][number] => ({
  agent: a.agent,
  connected: a.connected,
  asking: a.asking,
  kinds: a.kinds.map(({ key: _key, held: _held, ...k }) => k),
  ...(kept === undefined ? {} : { kept }),
});

/** A share out of its two counts. */
const shareOf = (accepted: number, answered: number): KeptShare => ({ accepted, answered, share: answered === 0 ? null : accepted / answered });

/**
 * One kind of change as the rest of a sentence, from the key a question was stamped with: a list's kinds as
 * `kindWords` says them, and the four a proposal has that a write does not in words of their own.
 */
export function stampWords(key: string, listName: (id: string) => string): string {
  if (key === 'call') return 'choose between options';
  if (key === 'addons') return 'change add-ons and settings';
  if (key === 'automation') return 'set up what runs on its own';
  if (key.startsWith('shape:')) return `change the fields of ${listName(key.slice('shape:'.length)).toLowerCase()}`;
  const cut = key.indexOf(':');
  if (cut <= 0) return key.replace(/[_-]+/gu, ' ');
  return kindWords({ key, list: key.slice(0, cut), verb: key.slice(cut + 1), floor: null }, listName);
}

/** The words a question is closed with as a no, beside a decision whose answer is `reject`. */
const SAID_NO: ReadonlySet<string> = new Set(['wont-fix', 'incorrect']);

/** One question as the share reads it: who filed it, its stamp, and how it was answered. */
type Answered = { by: string; kind: string; status: string; resolved_as: string | null; answer: string | null; in_part: number; undone: number };

/** A question's lines in the log, by its target, and the `decide` line before one of its `resolve` lines. */
const ON_Q = "'suggestion:' || s.id";
const DECIDED_Q = `FROM event r JOIN event d ON d.rowid = r.rowid - 1
  WHERE r.target = ${ON_Q} AND r.kind = 'resolve' AND d.kind = 'decide' AND d.target LIKE 'decision:%' AND json_valid(d.to_v)`;

/**
 * Whether the owner took a question as filed (`true`), answered it some other way (`false`), or has not answered it
 * (`null`), read as the engine's readings read Slash's (`engine-readings.ts`, `endingOf`): an undo and a part taken
 * are answers that changed it, `addressed` is a yes unless its decision said `reject`, and a withdrawn, moot or lapsed
 * question was never answered.
 */
function takenAsFiled(q: Answered): boolean | null {
  if (Number(q.undone) === 1 || q.resolved_as === 'undone') return false;
  if (Number(q.in_part) === 1) return false;
  if (q.status !== 'resolved') return null;
  if (q.resolved_as === 'addressed') return q.answer !== 'reject';
  return q.resolved_as !== null && SAID_NO.has(q.resolved_as) ? false : null;
}

/** What the ladder needs of the record. */
export type LadderDeps = { sql: Sql; kernel: Kernel; now: () => number };

/**
 * A token call as the ladder reads it: the grant, its scope, the run it writes as (when there is one yet), its app, and
 * the conversation it says it is (`client_id`, the host's session id), or `null` when it names none.
 *
 * `bypass` IS THE OWNER'S "LET AGENTS DO EVERYTHING WITHOUT ASKING" (`agents.bypass`), set only by the record from
 * `bypassOf` in `index.ts`, which the record works out for itself on every call and never takes from the caller. With
 * it, `gate` lets every write through at Do and tell, floors and outside text included, and counts it towards no rung.
 */
export type Caller = { token: string; scope: Scope; person: string; run: string | null; app: string | null; conv?: string | null; bypass?: true };

/** The record's per-agent memory of one kind: when each change was kept, newest last, and the declines in a row. */
type Kept = { kept: string[]; declines: number };

/** What a write at its rung does: write it, or file it as a question and say why in one line. */
export type Gate = { write: true; rung: Rung; kinds: ChangeKind[]; read?: string } | { write: false; why: string; kinds: ChangeKind[]; outside?: true };

const json = (text: string | undefined): unknown => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export function ladder(deps: LadderDeps) {
  const { sql, kernel } = deps;
  const iso = (ms = deps.now()): string => new Date(ms).toISOString();

  const prefRead = (holder: string, key: string): unknown =>
    json(sql.one<{ value: string }>('SELECT value FROM pref WHERE person_id = ? AND key = ?', holder, key)?.value);

  /** The grant a token principal stands for, or `null` when the record holds no row for it (see the head of this file). */
  const grantOf = (token: string): { scope: Scope; person: string } | null => {
    const row = sql.one<{ scope: string; person_id: string }>('SELECT scope, person_id FROM token WHERE id = ?', token);
    return row ? { scope: row.scope as Scope, person: row.person_id } : null;
  };

  /* ── untrusted text ─────────────────────────────────────────────────── */

  /**
   * Whether a run read text from outside the record ("untrusted text drops the run to Ask for the rest of
   * it"), and where from, or `null`.
   *
   * A MARK MADE BEFORE THE RUN OPENED IS THE CONVERSATION'S, and the run it opens next adopts it: a read opens no run, so
   * an agent whose first call reads the inbox has no run to mark yet, and its first write must still ask.
   *
   * AND ONLY THAT CONVERSATION'S (live 20 Oct). The mark was kept under the token alone, so one session of Claude Code
   * that read a bank text before it wrote marked the key, and the first write of every other session on that key, on
   * any day after, asked "This run read something that arrived from outside the record". A call that names its
   * conversation (`client_id`) is marked, and adopts, under that name; a call that names none still marks the whole key,
   * since nothing tells its sessions apart, and every call on the key reads that one.
   */
  const preRun = (c: Pick<Caller, 'token' | 'conv'>): string => (c.conv ? `token:${c.token}:${c.conv}` : `token:${c.token}`);
  const untrusted = (c: Pick<Caller, 'token' | 'run' | 'conv'>): string | null => {
    if (c.run !== null) {
      const own = prefRead(MARKS, c.run) as { from?: unknown } | undefined;
      if (own && typeof own.from === 'string') return own.from;
    }
    const keys = [...new Set([preRun(c), `token:${c.token}`])];
    for (const key of keys) {
      const held = prefRead(MARKS, key) as { from?: unknown } | undefined;
      if (!held || typeof held.from !== 'string') continue;
      if (c.run !== null) {
        kernel.setPref(MARKS, c.run, { from: held.from, at: iso() });
        kernel.setPref(MARKS, key, null);
      }
      return held.from;
    }
    return null;
  };

  /** Mark a run, or the conversation's next run, as having read untrusted text. The first source is kept. */
  const markUntrusted = (c: Pick<Caller, 'token' | 'run' | 'conv'>, from: string): void => {
    if (untrusted(c) !== null) return;
    kernel.setPref(MARKS, c.run ?? preRun(c), { from, at: iso() });
  };

  /** A mark as it is kept, or `null`: where the text came from, said in words, and when it was read. */
  const markOf = (key: string): { from: string; at: string } | null => {
    const m = prefRead(MARKS, key) as { from?: unknown; at?: unknown } | undefined;
    return m && typeof m.from === 'string' ? { from: m.from, at: typeof m.at === 'string' ? m.at : '' } : null;
  };

  /**
   * What keeps an agent asking about everything, for `standing`: the token's own mark, which its next run adopts, or the
   * mark on its newest run still open. READ-ONLY, unlike `untrusted`, which moves a token's mark onto its run: reading
   * where an agent stands must not change where it stands.
   */
  const askingOf = (token: string): { from: string; at: string } | null => {
    const held = markOf(`token:${token}`);
    if (held !== null) return held;
    const run = sql.one<{ id: string }>(
      `SELECT id FROM entry WHERE register = ? AND json_extract(fields, '$.token_id') = ? AND (state IS NULL OR state NOT IN (${RUN_ENDED.map(() => '?').join(', ')}))
       ORDER BY seq DESC LIMIT 1`,
      RUNS,
      token,
      ...RUN_ENDED,
    );
    return run === undefined ? null : markOf(kernel.nameOf(run.id));
  };

  /* ── imports, and whether the owner said each is his own ────────────── */

  /**
   * The runs `braindog import` wrote as, newest first: a run whose client id says import and which names no agent, as
   * the kernel's `makerOf` tells one apart (a named agent that happens to carry the prefix is still that agent).
   * `limit` bounds the answer; `importActors` asks for every one.
   */
  const importRuns = (limit: number): { id: string; run: string; opened: string }[] =>
    sql
      .all<{ id: string; created_at: string }>(
        `SELECT id, created_at FROM entry WHERE register = ? AND substr(json_extract(fields, '$.client_id'), 1, ?) = ?
           AND COALESCE(json_extract(fields, '$.agent'), '') IN ('', 'other')
         ORDER BY seq DESC LIMIT ?`,
        RUNS,
        IMPORT_CLIENT.length,
        IMPORT_CLIENT,
        limit,
      )
      .map((r) => ({ id: r.id, run: kernel.nameOf(r.id), opened: r.created_at }));

  /** What the owner said of one import: `true` his own, `false` outside text, `null` nothing yet. */
  const adoptedOf = (run: string): boolean | null => {
    const said = prefRead(IMPORTS, run) as { yes?: unknown } | undefined;
    return typeof said?.yes === 'boolean' ? said.yes : null;
  };

  /**
   * Every import made into the record, `IMPORTS_SHOWN` at most, newest first, each with what it brought in:
   * the rows its run created, counted by the list they are in, from the history its writes are signed in. ONE QUERY AN
   * IMPORT, bounded by the run's own signature. READ-ONLY. An import that created nothing is still one made, with none.
   */
  const importsFound = (): FoundImport[] => {
    const out: FoundImport[] = [];
    for (const r of importRuns(IMPORTS_SHOWN)) {
      const counted = sql.all<{ list: string; n: number; first: string | null }>(
        `SELECT n.register AS list, COUNT(*) AS n, (SELECT MIN(ts) FROM event WHERE actor = ?) AS first
           FROM event e JOIN entry n ON e.target_kind = 'entry' AND n.id = substr(e.target, 7)
          WHERE e.actor = ? AND e.kind = 'create' AND n.register <> ?
          GROUP BY n.register`,
        r.run,
        r.run,
        RUNS,
      );
      const lists = counted
        .map((c) => ({ list: kernel.register(c.list)?.name ?? c.list, rows: c.n }))
        .sort((a, b) => b.rows - a.rows || (a.list < b.list ? -1 : a.list > b.list ? 1 : 0));
      const first = counted[0]?.first ?? sql.one<{ ts: string | null }>('SELECT MIN(ts) AS ts FROM event WHERE actor = ?', r.run)?.ts ?? null;
      out.push({ run: r.run, at: first ?? r.opened, lists, rows: lists.reduce((s, l) => s + l.rows, 0), adopted: adoptedOf(r.run) });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  };

  /**
   * The owner's word on one import, by his own press: `yes` it is his own, `no` it is outside text.
   * Kept with when and by whom; it moves no rung and files nothing. `run` is one `importsFound` names (the method checks).
   */
  const adopt = (run: string, yes: boolean, by: string): void => kernel.setPref(IMPORTS, run, { yes, at: iso(), by });

  /**
   * The runs of every import the owner has not said is his own, by the name its writes are signed with (`S12`), for a
   * reading run to be marked by (the owner's to rule: nothing calls this on a read yet). Not limited to `IMPORTS_SHOWN`.
   */
  const importActors = (): string[] => importRuns(-1).filter((r) => adoptedOf(r.run) !== true).map((r) => r.run);

  /* ── the rung a write stands on ─────────────────────────────────────── */

  /** The rung an agent stands on for every kind at once: the lowest of them, held under the grant's scope. */
  const rungFor = (agent: string, scope: Scope, kinds: readonly ChangeKind[]): Rung => {
    let rung: Rung = 'quiet';
    for (const k of kinds) rung = lower(rung, rungOf(sql, agent, k));
    return ceilingOf(scope, rung) ?? 'ask';
  };

  /** The row a value names, by its id, whichever way it was said (`things#3`, a prefix, the id), or `null` for none. */
  const rowNamed = (said: unknown): string | null => (typeof said === 'string' && said.trim() !== '' ? (kernel.get(said.trim())?.id ?? said.trim()) : null);

  /**
   * Whether a write is a learning captured where its run is, or one confirmed, which pass at any rung ("Capturing a
   * learning needs nobody"): asked about, the first ten never got written, so no agent kept what it found out.
   *
   * A LEARNING IS READ FROM WHAT ITS LIST DECLARES, never from the list's name: a day the record fades rows by
   * (`fadeOf`, the same reading `context` and the card make). Any add-on's list that declares one is treated alike.
   *
   * CAPTURED WHERE THE RUN IS, AND NOWHERE ELSE. A new one that names no place is put in its run's project by the
   * kernel. One that names a place passes only when that is the project its run already stands in; before a run's
   * first write the ladder has no run to read that from, and a named place asks.
   *
   * CONFIRMED IS THE DAY AND NOTHING BESIDE IT. What a patch sends back as it already was is no change. Where it
   * applies, its words and its status are edits like any other and stand on their own rung, and a day more than one
   * ahead would keep a row from ever fading, so it asks too.
   */
  const learnt = (c: Caller, list: string, shape: ListShape | null, op: 'create' | 'update', patch: Record<string, unknown>, was: Record<string, unknown> | null): boolean => {
    const live = (shape?.fields ?? []).filter((f) => (f as { retired?: unknown }).retired !== true);
    const fade = fadeOf(kernel.registers().get(list) ?? { fields: shape?.fields ?? [] });
    if (fade === null || !live.some((f) => f.id === fade.field && f.type === 'day')) return false;
    const FADES = fade.field;
    const scoped = live.find((f) => f.scope !== undefined);
    if (op === 'create') {
      if (scoped === undefined || patch[scoped.id] === undefined) return true;
      if (c.run === null || scoped.type !== 'ref') return false;
      return rowNamed(patch[scoped.id]) === rowNamed(kernel.get(c.run)?.fields.project);
    }
    if (was === null) return false;
    const same = (key: string): boolean =>
      JSON.stringify(patch[key] ?? null) === JSON.stringify(was[key] ?? null) || (key === scoped?.id && scoped.type === 'ref' && rowNamed(patch[key]) === rowNamed(was[key]));
    const changed = Object.keys(patch).filter((key) => patch[key] !== undefined && !same(key));
    const day = patch[FADES];
    return changed.length === 1 && changed[0] === FADES && typeof day === 'string' && day.slice(0, 10) <= iso(deps.now() + 86_400_000).slice(0, 10);
  };

  /**
   * Whether a write only marks done the task in the run's own hand: the one `handoff` put on the run (`task`, by its
   * spoken name), moved to `done` and nothing else changed ("a task shows the agent's work").
   *
   * A RUN FINISHING ITS OWN WORK IS TOLD, NOT ASKED. Every kind asked until ten were kept, so on the owner's record twelve
   * tasks sat with agents and none was ever closed by one: each "done" waited in Needs you beside the questions that
   * matter. The floors and outside text are read before this, so a task with an amount, another person's row or a run
   * that read outside text still asks. A task the run did not take is not its own and climbs as before.
   */
  const ownDone = (c: Caller, shape: ListShape | null, kinds: readonly ChangeKind[], selfId: string | null): boolean => {
    if (c.run === null || selfId === null || shape?.state === undefined) return false;
    if (kinds.length === 0 || !kinds.every((k) => k.verb === 'move:done')) return false;
    const held = kernel.get(c.run)?.fields.task;
    return typeof held === 'string' && held.trim() !== '' && rowNamed(held) === selfId;
  };

  /**
   * What one write by an agent does at its rung (`Gate`). `self` is the row an update or a delete writes, whose maker the
   * `others` floor reads; a new row has none.
   */
  const gate = (c: Caller, list: string, op: 'create' | 'update' | 'delete', patch: Record<string, unknown>, selfId: string | null): Gate => {
    /* WHAT THE ROW HOLDS NOW, so a row sent back whole with its unchanged nulls is not read as clearing them. */
    const held = selfId === null ? undefined : sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', selfId)?.fields;
    const was = held === undefined ? null : (JSON.parse(held) as Record<string, unknown>);
    const shape = shapeIn(sql, list);
    const kinds = kindsOfWrite({ list, op, patch, shape, madeBy: selfId === null ? null : madeByIn(sql, selfId), person: c.person, was });
    const from = untrusted(c);
    /* THE OWNER LETS HIS AGENTS DO EVERYTHING WITHOUT ASKING (`Caller.bypass`): written at Do and tell, the floors and
       outside text included, and counted towards no rung, so no offer to climb is filed while he has said so already.
       A run that read text from outside says so beside the change (`read`), so the log keeps why it was not asked. */
    if (c.bypass === true) return { write: true, rung: 'tell', kinds: [], ...(from === null ? {} : { read: from }) };
    if (from !== null) return { write: false, kinds, why: `This run read ${from}, so its changes ask for the rest of it.`, outside: true };
    const floor = kinds.find((k) => k.floor !== null);
    if (floor) return { write: false, kinds, why: `${FLOOR_SAID[floor.floor!]}, which always asks.` };
    /* A LEARNING CAPTURED OR CONFIRMED NEEDS NOBODY (`learnt`), below the two lines above and never over them. It is
       answered as written and told, and with no kinds: `kept` counts what is handed to it towards the next rung, and
       a kind that never asked has no rung to be offered. */
    if (op !== 'delete' && learnt(c, list, shape, op, patch, was)) return { write: true, rung: 'tell', kinds: [] };
    /* AND SO DOES A RUN MARKING DONE THE TASK IN ITS OWN HAND (`ownDone`), at Do and tell, counted towards nothing. */
    if (op === 'update' && ownDone(c, shape, kinds, selfId)) return { write: true, rung: 'tell', kinds: [] };
    const rung = rungFor(c.token, c.scope, kinds);
    if (rung === 'ask') return { write: false, kinds, why: `An agent's changes of this kind ask until ${OFFER_AFTER} of them have been kept as they were, so this one waits for you.` };
    return { write: true, rung, kinds };
  };

  /**
   * Why an agent's note on a row may not be written, or `null`. A NOTE CHANGES NO VALUE, and Undo leaves notes where they
   * are, so it neither climbs nor asks: asking about every line an agent keeps would bury the person in questions about
   * nothing. Only the floor a note can reach holds it, a row another person made or a list of keys, and a note cannot
   * be filed as a question, so it is refused with what to do instead.
   */
  const noteFault = (c: Caller, list: string, selfId: string): string | null => {
    if (c.bypass === true) return null;
    const [k] = kindsOfWrite({ list, op: 'note', shape: shapeIn(sql, list), madeBy: madeByIn(sql, selfId), person: c.person });
    if (!k || (k.floor !== 'others' && k.floor !== 'keys')) return null;
    return `${FLOOR_SAID[k.floor]}, so an agent's note on it is not written. Say it as a question with propose instead.`;
  };

  /* ── kept, declined, dropped ────────────────────────────────────────── */

  const keptOf = (agent: string, kind: string): Kept => {
    const raw = prefRead(KEPT(agent), kind) as Partial<Kept> | undefined;
    return {
      kept: Array.isArray(raw?.kept) ? raw.kept.filter((t): t is string => typeof t === 'string') : [],
      declines: typeof raw?.declines === 'number' ? raw.declines : 0,
    };
  };
  const keepOf = (agent: string, kind: string, k: Kept): void =>
    kernel.setPref(KEPT(agent), kind, k.kept.length === 0 && k.declines === 0 ? null : { kept: k.kept.slice(-OFFER_AFTER), declines: k.declines });

  /** The ladder row for one kind, made at Ask when there is none, so its count has somewhere to be read from. */
  const rowFor = (agent: string, kind: string): { rung: Rung; dropped_at: string | null } => {
    const had = sql.one<{ rung: string; dropped_at: string | null }>('SELECT rung, dropped_at FROM ladder WHERE agent = ? AND kind = ?', agent, kind);
    if (had) return { rung: (ORDER as readonly string[]).includes(had.rung) ? (had.rung as Rung) : 'ask', dropped_at: had.dropped_at };
    sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'ask', 0, ?)", agent, kind, iso());
    return { rung: 'ask', dropped_at: null };
  };

  /**
   * Changes of these kinds by this agent were kept as they were: accepted whole by a person, or written at Do and tell
   * and not undone. Each counts once, and the tenth inside `OFFER_DAYS` offers the next rung (`offer`).
   */
  const kept = (agent: string, kinds: readonly ChangeKind[], names: { agent: string; list: (id: string) => string }): void => {
    for (const k of kinds) {
      if (k.floor !== null) continue;
      const was = keptOf(agent, k.key);
      const now = { kept: [...was.kept, iso()].slice(-OFFER_AFTER), declines: 0 };
      keepOf(agent, k.key, now);
      const row = rowFor(agent, k.key);
      const standing: Rung = row.dropped_at === null ? row.rung : 'ask';
      sql.exec('UPDATE ladder SET accepted_unchanged = ? WHERE agent = ? AND kind = ?', now.kept.length, agent, k.key);
      const oldest = now.kept[0];
      if (now.kept.length >= OFFER_AFTER && oldest !== undefined && Date.parse(oldest) >= deps.now() - OFFER_DAYS * 86_400_000)
        offer(agent, k, standing, names);
    }
  };

  /** Changes of these kinds by this agent were declined. `DECLINES_DROP` in a row takes each back to Ask. */
  const declined = (agent: string, kinds: readonly ChangeKind[]): void => {
    for (const k of kinds) {
      const was = keptOf(agent, k.key);
      const declines = was.declines + 1;
      if (declines >= DECLINES_DROP) drop(agent, [k.key], 'declined');
      else keepOf(agent, k.key, { kept: was.kept, declines });
    }
  };

  /**
   * Take an agent back to Ask on these kinds, or on every kind when `kinds` is `null`, and forget what it was kept for,
   * so climbing again starts from nothing. `why` is which of the five it was, kept for `standing` to say.
   *
   * AND AN OFFER STILL WAITING FOR ONE OF THEM IS WITHDRAWN. "You kept them all" stopped being true
   * the moment one was undone, declined a third time or written in a burst, and a yes to it would have set the rung the
   * drop just took away. It is answered as not done, signed by the ladder, so Decide shows it settled and never asks it.
   */
  const drop = (agent: string, kinds: readonly string[] | null, why?: DropWhy): void => {
    const at = iso();
    const keys = kinds ?? sql.all<{ kind: string }>('SELECT kind FROM ladder WHERE agent = ?', agent).map((r) => r.kind);
    for (const kind of keys) {
      /* WHY, KEPT BESIDE WHEN, for a kind that has a rung to lose. An undo says `undone`; a drop kept before it did
         left none, and `standing` still reads the undo itself for that one. */
      if (sql.one('SELECT 1 AS y FROM ladder WHERE agent = ? AND kind = ?', agent, kind)) kernel.setPref(DROPPED(agent), kind, why === undefined ? null : { why, at });
      sql.exec("UPDATE ladder SET rung = 'ask', accepted_unchanged = 0, since = ?, dropped_at = ? WHERE agent = ? AND kind = ?", at, at, agent, kind);
      kernel.setPref(KEPT(agent), kind, null);
    }
    const dropped = new Set(keys);
    for (const [id, o] of prefsOf(OFFERS)) {
      if (o.agent !== agent || (kinds !== null && (typeof o.kind !== 'string' || !dropped.has(o.kind)))) continue;
      if (kernel.governanceRow('suggestion', id)?.status === 'open')
        kernel.decide(id, { resolved_as: 'wont-fix', reason: withdrawn(agent, typeof o.kind === 'string' ? o.kind : '', why) }, LADDER_RULE);
      kernel.setPref(OFFERS, id, null);
    }
  };

  /**
   * More than `ANOMALY_WRITES` writes by one run in `ANOMALY_MS` is not an agent at work, and takes its grant back to Ask
   * on everything. A write is one row at one instant, however many fields it changed. Answers whether it dropped.
   */
  const anomaly = (agent: string, run: string | null): boolean => {
    if (run === null) return false;
    const n =
      sql.one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM (SELECT DISTINCT target, ts FROM event WHERE actor = ? AND ts >= ? AND target_kind = 'entry')",
        run,
        iso(deps.now() - ANOMALY_MS),
      )?.n ?? 0;
    if (n <= ANOMALY_WRITES) return false;
    drop(agent, null, 'burst');
    return true;
  };

  /**
   * Whether the app this token writes from now is another than the one its last run wrote from. A grant moving to
   * another app is a change of who holds it, and it takes it back to Ask on everything. An app that says nothing changes
   * nothing. Answers whether it dropped.
   */
  const clientChanged = (c: Caller, register: string): boolean => {
    if (c.app === null) return false;
    const before = sql.one<{ app: string | null }>(
      `SELECT json_extract(fields, '$.client') AS app FROM entry
       WHERE register = ? AND json_extract(fields, '$.token_id') = ? AND json_extract(fields, '$.client') IS NOT NULL ${c.run === null ? '' : 'AND seq <> ?'}
       ORDER BY rowid DESC LIMIT 1`,
      register,
      c.token,
      ...(c.run === null ? [] : [Number(c.run.replace(/^\D+/u, ''))]),
    )?.app;
    if (typeof before !== 'string' || before.trim().toLowerCase() === c.app.trim().toLowerCase()) return false;
    const any = sql.one<{ y: number }>("SELECT 1 AS y FROM ladder WHERE agent = ? AND rung <> 'ask' AND dropped_at IS NULL LIMIT 1", c.token);
    if (!any) return false;
    drop(c.token, null, 'app');
    return true;
  };

  /* ── offering the next rung ─────────────────────────────────────────── */

  /**
   * Ask the owner, once, whether an agent may make one kind of change a rung higher. Nothing is offered over the floor,
   * above Do quietly, or while the same offer waits. Who the agent is and which kind is kept beside the question and
   * never in its body, which every reader of the queue is handed, so no grant's id leaves the record.
   */
  const offer = (agent: string, k: ChangeKind, standing: Rung, names: { agent: string; list: (id: string) => string }): void => {
    const next = above(standing);
    if (next === null || k.floor !== null) return;
    const waiting = prefsOf(OFFERS).some(([id, o]) => o.agent === agent && o.kind === k.key && kernel.governanceRow('suggestion', id)?.status === 'open');
    if (waiting) return;
    const doing = kindWords(k, names.list);
    const who = names.agent;
    /* SLASH IS ASKED ABOUT BY ITS NAME, FIRST. It holds no grant a person connected, so "has made changes" names
       nothing he gave it: the question is what it may do, and the count is the questions it asked him. */
    const slash = agent === SLASH;
    const question =
      next === 'tell'
        ? slash
          ? `Let ${who} ${doing} without asking? It asked ${OFFER_AFTER} times and you kept every one.`
          : `${who} has made ${OFFER_AFTER} changes like this and you kept them all. Let it ${doing} without asking?`
        : slash
          ? `Let ${who} ${doing} without telling you? It did this ${OFFER_AFTER} times on its own and you kept every one.`
          : `${who} has done this ${OFFER_AFTER} times on its own and you kept them all. Let it ${doing} without telling you?`;
    /* AN ATTACH THAT LANDS IS LISTED under Matched for you with its Undo, so that is where the owner is told it is. */
    const attach = k.verb === ATTACH_VERB;
    const keeps = attach ? 'Each one is listed under Matched for you with its Undo.' : 'Every change keeps its Undo.';
    const filed = kernel.propose(
      {
        question,
        body_kind: 'options',
        body: {
          about: aboutOf(who),
          options: [
            {
              id: 'yes',
              label: next === 'tell' ? 'Do and tell' : 'Do quietly',
              because: next === 'tell' ? `It will ${doing} on its own and say so. ${keeps}` : `It will ${doing} on its own without a line each time. ${keeps}`,
            },
            { id: 'no', label: 'Keep asking', because: next === 'tell' ? `It asks before it does this, as now.` : `It keeps telling you each time, as now.` },
          ],
        },
      },
      LADDER_RULE,
    );
    if (filed.ok) kernel.setPref(OFFERS, filed.value.id, { agent, kind: k.key, rung: next });
  };

  const prefsOf = (holder: string): [string, { agent?: unknown; kind?: unknown; rung?: unknown }][] =>
    sql
      .all<{ key: string; value: string }>('SELECT key, value FROM pref WHERE person_id = ?', holder)
      .map((r) => [r.key, (json(r.value) ?? {}) as { agent?: unknown; kind?: unknown; rung?: unknown }]);

  /**
   * An offer answered: yes sets the rung it offered, no starts its count again, so it is offered once more only after
   * another `OFFER_AFTER` kept. Anything that is not an offer is left alone. Answers whether it was one.
   */
  const answered = (suggestion: string, option: string | null): boolean => {
    const o = prefRead(OFFERS, suggestion) as { agent?: unknown; kind?: unknown; rung?: unknown } | undefined;
    if (!o || typeof o.agent !== 'string' || typeof o.kind !== 'string' || typeof o.rung !== 'string') return false;
    kernel.setPref(OFFERS, suggestion, null);
    if (option === 'yes' && (ORDER as readonly string[]).includes(o.rung)) {
      rowFor(o.agent, o.kind);
      sql.exec('UPDATE ladder SET rung = ?, accepted_unchanged = 0, since = ?, dropped_at = NULL WHERE agent = ? AND kind = ?', o.rung, iso(), o.agent, o.kind);
      kernel.setPref(DROPPED(o.agent), o.kind, null);
    }
    kernel.setPref(KEPT(o.agent), o.kind, null);
    return true;
  };

  /** Who climbs for a question's filer: a grant, or Slash, and `null` for a person, a rule or the system. */
  const agentOfActor = (actor: string): string | null => (actor === SLASH ? SLASH : ladderAgentOf(sql, actor));

  /**
   * Who asked for what a batch the ladder landed wrote, and the kinds it asked for, or `null` for a batch that is not
   * one. SLASH'S QUESTION IS LANDED UNDER THE LADDER'S NAME (`LADDER_RULE`), since a model writes nothing but what it
   * proposes, so an Undo of an attach that landed alone finds no agent in its own lines: this is how the Undo still
   * takes Slash's rung back ("always undoable"). THE KINDS ARE THE QUESTION'S STAMP, worked out when it was
   * asked: read from its body now, the line it added is already there and an attach reads as the edit it is not.
   */
  const landed = (batch: string): { agent: string; kinds: string[] } | null => {
    const asked = sql.one<{ opened_by: string; kind: string | null }>(
      `SELECT s.opened_by AS opened_by, s.kind AS kind FROM event q JOIN suggestion s ON q.target = 'suggestion:' || s.id
        WHERE q.batch = ? AND q.kind = 'resolve' AND q.actor = ? LIMIT 1`,
      batch,
      LADDER_RULE,
    );
    if (asked === undefined) return null;
    const agent = agentOfActor(asked.opened_by);
    if (agent === null) return null;
    return { agent, kinds: keysOfStamp(asked.kind) };
  };

  /* ── where every agent stands, read back ────────────────────────────── */

  /**
   * Where every agent stands: each connected grant that may change the record, by the name its owner gave it,
   * with every kind it has a rung for, and Slash once it has one. READ-ONLY: it writes no row and makes none at Ask.
   *
   * AN AGENT WITH NO RUNG HAS NO KINDS, which reads as everything asks, and is listed because it is connected. A grant
   * revoked or run out is not listed at all: it can write nothing, so it stands nowhere. A kind whose list is gone is
   * left out, since there is nothing left to change in it.
   *
   * TWO KINDS OF KEY ARE NOT AGENTS, as `liveAgents` in the kernel counts them: a job's bearer (`job:`) and a report key
   * (`report:`), each labelled by code with an id and never named by its owner. A grant the operator's cut-off ended
   * (`validFrom`) is refused like a revoked one, so it is not listed either.
   *
   * TWO GRANTS OF ONE NAME ARE TOLD APART, since a name is all a person reads and two lines saying "Claude Code" with
   * different rungs say nothing about which is which. The older keeps the name and each later one carries its number
   * ("Claude Code 2"), counted past any name already said, so a grant named "Slash" never reads as Slash itself. Names
   * are compared as a person reads them, whatever their case or spacing. `connected` says when each was made.
   *
   * THE RUNG IS THE ONE A WRITE WOULD MEET: Ask once dropped, and never above the grant's scope (`ceilingOf`).
   *
   * `lifted` IS DATED, NOT STORED. The lift (`seedLadder`) sets Do and tell in the pass that made the table, so a rung
   * still at Do and tell since that moment is one it set; a yes to an offer needs ten changes kept first and is later.
   *
   * `why` IS WHAT `drop` WAS TOLD, and for an undo, which tells it nothing, the undo found in `undone` at that moment.
   * A drop from before the reason was kept answers `null`.
   */
  const standing = (validFrom?: string): Standing => {
    const shares = keptShares();
    return { agents: listed(validFrom).map((a) => plain(a, shares.get(a.id))) };
  };

  /**
   * The accepted-unchanged share of every agent that filed a question the owner answered in the last
   * `KEPT_SHARE_DAYS`, by its grant (or Slash), read from what each question was stamped with when it was filed
   * (`suggestion.kind`) and how it was answered. A question filed before the stamp, or by a person or a rule, counts
   * for nobody. READ-ONLY and bounded, newest first.
   */
  const keptShares = (): Map<string, AgentKept> => {
    const since = iso(deps.now() - KEPT_SHARE_DAYS * 86_400_000);
    const rows = sql.all<Answered>(
      `SELECT s.opened_by AS by, s.kind AS kind, s.status AS status, s.resolved_as AS resolved_as,
         (SELECT json_extract(d.to_v, '$.answer') ${DECIDED_Q} ORDER BY r.rowid DESC LIMIT 1) AS answer,
         (EXISTS (SELECT 1 ${DECIDED_Q} AND json_type(d.to_v, '$.rows') IS NOT NULL)
           OR EXISTS (SELECT 1 FROM event n WHERE n.target = ${ON_Q} AND n.kind = 'note' AND n.to_v LIKE 'taken:%')) AS in_part,
         EXISTS (SELECT 1 FROM event u WHERE u.target = ${ON_Q} AND u.actor <> 'system'
           AND ((u.kind = 'suggest' AND u.to_v IN ('reopened', '"reopened"')) OR (u.kind = 'resolve' AND u.to_v IN ('undone', '"undone"')))) AS undone
       FROM suggestion s
       WHERE s.kind IS NOT NULL AND s.opened_at >= ? AND s.opened_by NOT LIKE 'p\\_%' ESCAPE '\\'
       ORDER BY s.opened_at DESC, s.rowid DESC LIMIT ?`,
      since,
      KEPT_SHARE_READ,
    );
    const listName = (id: string): string => kernel.register(id)?.name ?? id;
    const agentOf = new Map<string, string | null>();
    const tally = new Map<string, { accepted: number; answered: number; kinds: Map<string, { accepted: number; answered: number }> }>();
    for (const q of rows) {
      const took = takenAsFiled(q);
      if (took === null) continue;
      if (!agentOf.has(q.by)) agentOf.set(q.by, agentOfActor(q.by));
      const agent = agentOf.get(q.by);
      if (agent === null || agent === undefined) continue;
      const key = keysOfStamp(q.kind)[0];
      if (key === undefined) continue;
      let t = tally.get(agent);
      if (!t) tally.set(agent, (t = { accepted: 0, answered: 0, kinds: new Map() }));
      const words = stampWords(key, listName);
      let k = t.kinds.get(words);
      if (!k) t.kinds.set(words, (k = { accepted: 0, answered: 0 }));
      t.answered += 1;
      k.answered += 1;
      if (took) {
        t.accepted += 1;
        k.accepted += 1;
      }
    }
    const out = new Map<string, AgentKept>();
    for (const [agent, t] of tally)
      out.set(agent, {
        ...shareOf(t.accepted, t.answered),
        days: KEPT_SHARE_DAYS,
        kinds: [...t.kinds].map(([kind, k]) => ({ kind, ...shareOf(k.accepted, k.answered) })).sort((a, b) => b.answered - a.answered || (a.kind < b.kind ? -1 : 1)),
      });
    return out;
  };

  /** `standing` with what a person never reads kept beside it: each agent's grant (or Slash) and each kind's key. */
  const listed = (validFrom?: string): Listed[] => {
    const at = iso();
    const arrived = sql.one<{ applied_at: string }>('SELECT applied_at FROM migration WHERE version = ?', LADDER_ARRIVED)?.applied_at;
    const from = arrived === undefined ? Number.NaN : Date.parse(arrived);
    const listName = (id: string): string => kernel.register(id)?.name ?? id;

    const kindsOf = (agent: string, scope: Scope | null): Listed['kinds'] => {
      const out: Listed['kinds'] = [];
      const rows = sql.all<{ kind: string; rung: string; since: string; dropped_at: string | null }>('SELECT kind, rung, since, dropped_at FROM ladder WHERE agent = ?', agent);
      for (const r of rows) {
        const cut = r.kind.indexOf(':');
        const list = cut > 0 ? r.kind.slice(0, cut) : null;
        if (list === null || !kernel.register(list)) continue;
        const held: Rung = r.dropped_at === null && (ORDER as readonly string[]).includes(r.rung) ? (r.rung as Rung) : 'ask';
        const rung = scope === null ? held : (ceilingOf(scope, held) ?? 'ask');
        const since = Date.parse(r.since);
        out.push({
          kind: kindWords({ key: r.kind, list, verb: r.kind.slice(cut + 1), floor: null }, listName),
          rung,
          since: r.since,
          lifted: r.dropped_at === null && r.rung === 'tell' && since >= from && since <= from + LIFT_WINDOW_MS,
          dropped: r.dropped_at === null ? null : { at: r.dropped_at, why: whyDropped(agent, r.kind, r.dropped_at) },
          key: r.kind,
          held,
        });
      }
      return out.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    };

    const agents: Listed[] = sql
      .all<{ id: string; scope: string; label: string | null; created_at: string }>(
        `SELECT id, scope, label, created_at FROM token
         WHERE scope <> 'read' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
           AND (label IS NULL OR (substr(label, 1, 4) <> 'job:' AND substr(label, 1, 7) <> 'report:'))
         ORDER BY created_at, rowid`,
        at,
      )
      .filter((t) => !endedByCutOff(validFrom, t.created_at))
      .map((t) => ({ id: t.id, agent: (t.label ?? '').trim() || 'Your agent', connected: t.created_at, asking: askingOf(t.id), kinds: kindsOf(t.id, t.scope as Scope) }));
    const slash = kindsOf(SLASH, null);
    /* SLASH'S NAME IS TAKEN FIRST, listed or not, so a grant's name does not move the day Slash earns a rung. A number
       another grant already has for its own name is passed over. */
    const fold = (name: string): string => name.replace(/\s+/gu, ' ').toLowerCase();
    const said = new Set([fold('Slash')]);
    const owned = new Set(agents.map((a) => fold(a.agent)));
    const met = new Map<string, number>();
    for (const a of agents) {
      const base = a.agent;
      let n = (met.get(fold(base)) ?? 0) + 1;
      let name = base;
      if (n > 1 || said.has(fold(base))) {
        n = Math.max(n, 2);
        while (said.has(fold(`${base} ${n}`)) || owned.has(fold(`${base} ${n}`))) n += 1;
        name = `${base} ${n}`;
      }
      met.set(fold(base), n);
      said.add(fold(name));
      a.agent = name;
    }
    if (slash.length > 0) agents.push({ id: SLASH, agent: 'Slash', connected: null, asking: null, kinds: slash });
    return agents;
  };

  /** Why one kind was taken back at `at`, as a sentence, or `null` when nothing kept says (see `standing`). */
  const whyDropped = (agent: string, kind: string, at: string): string | null => {
    const kept = prefRead(DROPPED(agent), kind) as { why?: unknown; at?: unknown } | undefined;
    if (kept && kept.at === at && typeof kept.why === 'string' && kept.why in DROP_SAID) return DROP_SAID[kept.why as DropWhy];
    const undone = sql.one(
      'SELECT 1 AS y FROM undone WHERE agent = ? AND at <= ? AND at >= ? AND (kinds IS NULL OR EXISTS (SELECT 1 FROM json_each(undone.kinds) WHERE value = ?)) LIMIT 1',
      agent,
      at,
      new Date(Date.parse(at) - UNDO_WINDOW_MS).toISOString(),
      kind,
    );
    return undone ? DROP_SAID.undone : null;
  };

  /**
   * The owner's own "Ask again" (its "undo"): an agent back to asking on one kind, said in the words
   * `standing` says it in, or on every kind it was lifted on when `kind` is `null`. It is `drop` with `owner` for why,
   * so `standing` says "You put it back to asking." and an offer waiting on that kind is withdrawn.
   *
   * BY NAME AND WORDS, AS A PERSON READ THEM, never a grant's id or a kind's key: the agent is the name `standing` gave
   * it (a second grant of one name with its number), compared as a person reads it, whatever its case or spacing.
   *
   * NOTHING ELSE MOVES. A kind already asking keeps its day and its count, so pressing twice changes nothing, and every
   * other agent and kind is left as it stood. Answers the agent as `standing` says it after, or which name was unknown.
   */
  const takeBack = (agentName: string, kind: string | null, validFrom?: string): { agent: Standing['agents'][number] } | { unknown: 'agent' | 'kind' } => {
    const fold = (said: string): string => said.trim().replace(/\s+/gu, ' ').toLowerCase();
    const found = listed(validFrom).find((a) => fold(a.agent) === fold(agentName));
    if (found === undefined) return { unknown: 'agent' };
    const named = kind === null ? found.kinds : found.kinds.filter((k) => fold(k.kind) === fold(kind));
    if (kind !== null && named.length === 0) return { unknown: 'kind' };
    const lifted = named.filter((k) => k.held !== 'ask').map((k) => k.key);
    if (lifted.length === 0) return { agent: plain(found) };
    drop(found.id, lifted, 'owner');
    const after = listed(validFrom).find((a) => a.id === found.id);
    return { agent: plain(after ?? found) };
  };

  return { standing, takeBack, importsFound, adopt, importActors, grantOf, untrusted, markUntrusted, gate, rungFor, noteFault, kept, declined, drop, anomaly, clientChanged, answered, agentOfActor, landed };
}

/** The floors as a person reads them, each the start of a sentence. */
const FLOOR_SAID: Record<string, string> = {
  delete: 'It takes something away',
  keys: 'It is about keys',
  money: 'It sets an amount of money',
  sharing: 'It changes who can see something',
  identity: 'It changes who someone is',
  others: 'It changes something another person made',
  addons: 'It changes an add-on',
  outside: 'It reaches outside BrainDog',
};

/** What a question of options is about, cut at a character so it fits the gate's 80 bytes (`checkBody`). */
export function aboutOf(said: string): string {
  let out = [...said.trim()];
  const bytes = (chars: string[]): number => new TextEncoder().encode(chars.join('')).length;
  while (out.length > 0 && bytes(out) > 80) out = out.slice(0, -1);
  return out.join('').trim();
}

/**
 * One kind of change as the rest of a sentence: "mark tasks done", "add tasks", "change projects". The list by the name
 * its owner gave it, lower case, as a sentence carries it. An attach is "put a name on the right person", whichever list
 * it puts it on, since the name is what the owner was asked about.
 */
export function kindWords(k: ChangeKind, listName: (id: string) => string): string {
  const list = k.list === null ? '' : listName(k.list).toLowerCase();
  if (k.verb === ATTACH_VERB) return ATTACH_SAID;
  if (k.verb.startsWith('move:')) return `mark ${list} ${k.verb.slice('move:'.length).replace(/[_-]+/gu, ' ')}`;
  switch (k.verb) {
    case 'add':
      return `add ${list}`;
    case 'tag':
      return `tag ${list}`;
    case 'note':
      return `add notes to ${list}`;
    case 'edit':
      return `change ${list}`;
    default:
      return `make changes like this to ${list}`;
  }
}
