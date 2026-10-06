/**
 * The ladder of trust, the record's half (DIRECTION §37, "staff who earn trust"): what an agent's write does at the rung
 * it stands on, when it is offered the next rung, and what takes it back down.
 *
 * WHAT THE KERNEL ALREADY SAYS IS READ, NEVER COPIED. A kind of change and its floor are `change-kind.ts`'s, the rung an
 * agent stands on is `rungOf`, the scope's ceiling over it is `ceilingOf`, and whether a filed question may be accepted
 * by the ladder is `ladderFault`, asked at the gate. This file decides only what the record does with those facts:
 *   - a write at Ask, on the floor, or from a run that read text from outside the record is filed as a question instead
 *   - a write at Do and tell or Do quietly is written, and counts as one more change kept
 *   - after `OFFER_AFTER` kept within `OFFER_DAYS`, with none undone, the owner is asked once whether it may climb
 *   - an undo, `DECLINES_DROP` declines in a row, an anomaly or a change of app takes it back to Ask.
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
import {
  LADDER_RULE,
  SLASH,
  ceilingOf,
  kindsOfWrite,
  ladderAgentOf,
  madeByIn,
  rungOf,
  shapeIn,
  type ChangeKind,
  type Kernel,
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

/** The rungs in order, lowest first, and the one above each. */
const ORDER: readonly Rung[] = ['ask', 'tell', 'quiet'];
const above = (r: Rung): Rung | null => ORDER[ORDER.indexOf(r) + 1] ?? null;
const lower = (a: Rung, b: Rung): Rung => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/** What the ladder needs of the record. */
export type LadderDeps = { sql: Sql; kernel: Kernel; now: () => number };

/** A token call as the ladder reads it: the grant, its scope, the run it writes as (when there is one yet) and its app. */
export type Caller = { token: string; scope: Scope; person: string; run: string | null; app: string | null };

/** The record's per-agent memory of one kind: when each change was kept, newest last, and the declines in a row. */
type Kept = { kept: string[]; declines: number };

/** What a write at its rung does: write it, or file it as a question and say why in one line. */
export type Gate = { write: true; rung: Rung; kinds: ChangeKind[] } | { write: false; why: string; kinds: ChangeKind[] };

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
   * Whether a run read text from outside the record (DIRECTION §37: "untrusted text drops the run to Ask for the rest of
   * it"), and where from, or `null`.
   *
   * A MARK MADE BEFORE THE RUN OPENED IS THE TOKEN'S, and the run it opens next adopts it: a read opens no run, so an agent
   * whose first call reads the inbox has no run to mark yet, and its first write must still ask.
   */
  const untrusted = (c: Pick<Caller, 'token' | 'run'>): string | null => {
    if (c.run !== null) {
      const own = prefRead(MARKS, c.run) as { from?: unknown } | undefined;
      if (own && typeof own.from === 'string') return own.from;
    }
    const held = prefRead(MARKS, `token:${c.token}`) as { from?: unknown } | undefined;
    if (!held || typeof held.from !== 'string') return null;
    if (c.run !== null) {
      kernel.setPref(MARKS, c.run, { from: held.from, at: iso() });
      kernel.setPref(MARKS, `token:${c.token}`, null);
    }
    return held.from;
  };

  /** Mark a run, or the token's next run, as having read untrusted text. The first source is kept. */
  const markUntrusted = (c: Pick<Caller, 'token' | 'run'>, from: string): void => {
    if (untrusted(c) !== null) return;
    kernel.setPref(MARKS, c.run ?? `token:${c.token}`, { from, at: iso() });
  };

  /* ── the rung a write stands on ─────────────────────────────────────── */

  /** The rung an agent stands on for every kind at once: the lowest of them, held under the grant's scope. */
  const rungFor = (agent: string, scope: Scope, kinds: readonly ChangeKind[]): Rung => {
    let rung: Rung = 'quiet';
    for (const k of kinds) rung = lower(rung, rungOf(sql, agent, k));
    return ceilingOf(scope, rung) ?? 'ask';
  };

  /**
   * What one write by an agent does at its rung (`Gate`). `self` is the row an update or a delete writes, whose maker the
   * `others` floor reads; a new row has none.
   */
  const gate = (c: Caller, list: string, op: 'create' | 'update' | 'delete', patch: Record<string, unknown>, selfId: string | null): Gate => {
    /* WHAT THE ROW HOLDS NOW, so a row sent back whole with its unchanged nulls is not read as clearing them. */
    const held = selfId === null ? undefined : sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', selfId)?.fields;
    const was = held === undefined ? null : (JSON.parse(held) as Record<string, unknown>);
    const kinds = kindsOfWrite({ list, op, patch, shape: shapeIn(sql, list), madeBy: selfId === null ? null : madeByIn(sql, selfId), person: c.person, was });
    const from = untrusted(c);
    if (from !== null) return { write: false, kinds, why: `This run read ${from}, so its changes ask for the rest of it.` };
    const floor = kinds.find((k) => k.floor !== null);
    if (floor) return { write: false, kinds, why: `${FLOOR_SAID[floor.floor!]}, which always asks.` };
    const rung = rungFor(c.token, c.scope, kinds);
    if (rung === 'ask') return { write: false, kinds, why: `Changes like this ask until ${OFFER_AFTER} of them have been kept as they were.` };
    return { write: true, rung, kinds };
  };

  /**
   * Why an agent's note on a row may not be written, or `null`. A NOTE CHANGES NO VALUE, and Undo leaves notes where they
   * are, so it neither climbs nor asks: asking about every line an agent keeps would bury the person in questions about
   * nothing. Only the floor a note can reach holds it, a row another person made or a list of keys, and a note cannot
   * be filed as a question, so it is refused with what to do instead.
   */
  const noteFault = (c: Caller, list: string, selfId: string): string | null => {
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
      if (declines >= DECLINES_DROP) drop(agent, [k.key]);
      else keepOf(agent, k.key, { kept: was.kept, declines });
    }
  };

  /**
   * Take an agent back to Ask on these kinds, or on every kind when `kinds` is `null`, and forget what it was kept for,
   * so climbing again starts from nothing.
   *
   * AND AN OFFER STILL WAITING FOR ONE OF THEM IS WITHDRAWN (research-audit-20 M2). "You kept them all" stopped being true
   * the moment one was undone, declined a third time or written in a burst, and a yes to it would have set the rung the
   * drop just took away. It is answered as not done, signed by the ladder, so Decide shows it settled and never asks it.
   */
  const drop = (agent: string, kinds: readonly string[] | null): void => {
    const at = iso();
    const keys = kinds ?? sql.all<{ kind: string }>('SELECT kind FROM ladder WHERE agent = ?', agent).map((r) => r.kind);
    for (const kind of keys) {
      sql.exec("UPDATE ladder SET rung = 'ask', accepted_unchanged = 0, since = ?, dropped_at = ? WHERE agent = ? AND kind = ?", at, at, agent, kind);
      kernel.setPref(KEPT(agent), kind, null);
    }
    const dropped = new Set(keys);
    for (const [id, o] of prefsOf(OFFERS)) {
      if (o.agent !== agent || (kinds !== null && (typeof o.kind !== 'string' || !dropped.has(o.kind)))) continue;
      if (kernel.governanceRow('suggestion', id)?.status === 'open')
        kernel.decide(id, { resolved_as: 'wont-fix', reason: 'A change of this kind was taken back, so it asks again before it does this.' }, LADDER_RULE);
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
    drop(agent, null);
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
    drop(c.token, null);
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
    const question =
      next === 'tell'
        ? `${who} has made ${OFFER_AFTER} changes like this and you kept them all. Let it ${doing} without asking?`
        : `${who} has done this ${OFFER_AFTER} times on its own and you kept them all. Let it ${doing} without telling you?`;
    const filed = kernel.propose(
      {
        question,
        body_kind: 'options',
        body: {
          about: aboutOf(who),
          options: [
            {
              id: 'yes',
              label: next === 'tell' ? 'Let it, and tell me' : 'Let it, quietly',
              because: next === 'tell' ? `It will ${doing} on its own and say so. Every change keeps its Undo.` : `It will ${doing} on its own without a line each time. Every change keeps its Undo.`,
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
    }
    kernel.setPref(KEPT(o.agent), o.kind, null);
    return true;
  };

  /** Who climbs for a question's filer: a grant, or Slash, and `null` for a person, a rule or the system. */
  const agentOfActor = (actor: string): string | null => (actor === SLASH ? SLASH : ladderAgentOf(sql, actor));

  return { grantOf, untrusted, markUntrusted, gate, rungFor, noteFault, kept, declined, drop, anomaly, clientChanged, answered, agentOfActor };
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
  outside: 'It reaches outside the record',
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
 * its owner gave it, lower case, as a sentence carries it.
 */
export function kindWords(k: ChangeKind, listName: (id: string) => string): string {
  const list = k.list === null ? '' : listName(k.list).toLowerCase();
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
