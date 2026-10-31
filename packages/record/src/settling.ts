/**
 * Who suggested, who drafted and who settled: the one fact a line of the log says about a suggestion.
 *
 * THE CLIENT TYPED FIVE KEYS AND NO HOST SENT THEM. Activity and a row's history read "Slash suggested · Mara accepted,
 * drafted by the model" off `suggested_by`, `drafted_by`, `answer_label`, `settled_by` and `undone`
 * (`apps/web/src/lib/record/history-live.ts`), and the record's log read said none of them, so every screen fell back to
 * the bare name of whoever signed the line. Here they are read once, for every screen and every agent.
 *
 * WHICH LINES. A `decide` on a decision that settled a question, and a `resolve` or `suggest` on a question, carry who
 * suggested it (`suggestion.opened_by`) and who drafted it (`suggestion.drafted_by`: `rules`, a model's name, or `null`
 * where the record never kept that), and a `decide` the chosen option's own words. A row's event written by an
 * accepted question carries those two and `settled_by`, the actor of the decision, because the row line is signed by
 * the rule that let it land; and an event that took one back carries `undone: true`, with `settled_by` whoever undid
 * it. Every other line carries none of the keys, not even as `null`.
 *
 * FOUND THROUGH THE BATCH, as the kernel finds them. `decide` writes its `decide` and the question's `resolve` as two
 * adjacent lines (`govern.ts`'s `SETTLED`), and everything the answer wrote shares the decide's batch; an undo writes the
 * question's `suggest reopened` or `resolve undone` in its own batch beside the rows it put back (`undo.ts`).
 *
 * ONE READ A PAGE, NEVER ONE A LINE: three queries for any number of lines, each handed its ids through `json_each`, as a
 * Durable Object allows a hundred bound values and a page holds two hundred lines and their steps.
 */

import type { Sql } from '@braindog/ports';
import { ASKED_KEY } from '@braindog/kernel';

/** The keys one line carries. `answer_label` only on a `decide`; `settled_by` and `undone` only on a row's event. */
export type Settled = {
  suggested_by: string;
  drafted_by: string | null;
  answer_label?: string | null;
  settled_by?: string;
  undone?: true;
  /** On a line that took a question back, and its rows: who had answered it (`rule:ladder` when Slash's rung let it land). */
  answered_by?: string;
  /** Who kept a change that landed alone. Typed for the day a keep is logged; nothing writes it yet. */
  kept_by?: string;
};

type Own = { id: string; kind: string; target: string | null; batch: string | null; settles: string | null; to_v: string | null };
type Governed = { kind: string; target: string; actor: string; to_v: string | null; batch: string; settles: string | null };

/** The question a `decide` settled: the `resolve` written on the line after it, as the kernel's `SETTLED` joins them. */
const SETTLES = "(SELECT substr(r.target, 12) FROM event r WHERE r.rowid = e.rowid + 1 AND r.kind = 'resolve' AND r.target LIKE 'suggestion:%')";

/** `undo.ts` writes the word bare and `govern.ts` as JSON text, so both are read. */
const TOOK_BACK = new Set(['reopened', 'undone', '"reopened"', '"undone"']);

const after = (target: string | null, prefix: string): string | null => (target !== null && target.startsWith(prefix) ? target.slice(prefix.length) : null);

/**
 * The chosen option's own words, from a body that offers options; `null` for an answer no option names (a rowset's
 * `accept`), or a body erased. Read off the body and not its kind, so the core spells no kind's name.
 */
function labelOf(body: string, answer: string): string | null {
  try {
    const options = (JSON.parse(body) as { options?: unknown }).options;
    const found = Array.isArray(options) ? options.find((o) => (o as { id?: unknown })?.id === answer) : undefined;
    const label = (found as { label?: unknown } | undefined)?.label;
    return typeof label === 'string' && label.trim() !== '' ? label.trim() : null;
  } catch {
    return null;
  }
}

/** The keys for each line that has them, by the line's event id. A line missing from the map says nothing. */
export function settlingOf(sql: Sql, lines: readonly { id: string }[]): Map<string, Settled> {
  const out = new Map<string, Settled>();
  if (lines.length === 0) return out;
  /* THE LINES AS THE LOG HOLDS THEM, not as the caller was handed them: `lineOf` hands a scoped reader `q.<id>` for a
     question's number, and a synthetic line keeps its event's id. */
  const own = sql.all<Own>(
    `SELECT e.id AS id, e.kind AS kind, e.target AS target, e.batch AS batch, e.to_v AS to_v, CASE WHEN e.kind = 'decide' THEN ${SETTLES} END AS settles
       FROM event e WHERE e.id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(lines.map((l) => l.id)),
  );
  const batches = [...new Set(own.flatMap((l) => (l.batch !== null && after(l.target, 'entry:') !== null ? [l.batch] : [])))];
  const governed =
    batches.length === 0
      ? []
      : sql.all<Governed>(
          `SELECT e.kind AS kind, e.target AS target, e.actor AS actor, e.to_v AS to_v, e.batch AS batch, CASE WHEN e.kind = 'decide' THEN ${SETTLES} END AS settles
             FROM event e WHERE e.batch IN (SELECT value FROM json_each(?))
              AND ((e.kind = 'decide' AND e.target LIKE 'decision:%') OR (e.kind IN ('suggest', 'resolve') AND e.target LIKE 'suggestion:%'))
            ORDER BY e.rowid`,
          JSON.stringify(batches),
        );
  /* WHAT EACH BATCH DID TO A QUESTION: took it back, or settled it. A batch that took one back is an undo, whatever else
     it holds; otherwise the first decide that settled a question is the batch's answer. */
  const byBatch = new Map<string, { suggestion: string; by: string; undone: boolean }>();
  for (const g of governed) {
    const back = g.kind !== 'decide' && g.to_v !== null && TOOK_BACK.has(g.to_v) ? after(g.target, 'suggestion:') : null;
    const held = byBatch.get(g.batch);
    if (back !== null && held?.undone !== true) byBatch.set(g.batch, { suggestion: back, by: g.actor, undone: true });
    else if (g.kind === 'decide' && g.settles !== null && held === undefined) byBatch.set(g.batch, { suggestion: g.settles, by: g.actor, undone: false });
  }
  /* EACH LINE'S QUESTION, and the decision a `decide` names for its option's words. */
  const asks = new Map<string, { suggestion: string; decision?: string; by?: string; undone?: boolean; back?: boolean }>();
  for (const l of own) {
    if (l.kind === 'decide' && l.settles !== null) {
      const decision = after(l.target, 'decision:');
      if (decision !== null) asks.set(l.id, { suggestion: l.settles, decision });
    } else if (l.kind === 'resolve' || l.kind === 'suggest') {
      const suggestion = after(l.target, 'suggestion:');
      if (suggestion !== null) asks.set(l.id, { suggestion, ...(l.to_v !== null && TOOK_BACK.has(l.to_v) ? { back: true } : {}) });
    } else if (l.batch !== null && after(l.target, 'entry:') !== null) {
      const settled = byBatch.get(l.batch);
      if (settled) asks.set(l.id, { suggestion: settled.suggestion, by: settled.by, undone: settled.undone });
    }
  }
  if (asks.size === 0) return out;
  const decisions = [...new Set([...asks.values()].flatMap((a) => (a.decision === undefined ? [] : [a.decision])))];
  const facts = sql.all<{ id: string; opened_by: string; drafted_by: string | null; body: string; answer: string | null }>(
    `SELECT s.id AS id, s.opened_by AS opened_by, s.drafted_by AS drafted_by, s.body AS body, NULL AS answer
       FROM suggestion s WHERE s.id IN (SELECT value FROM json_each(?))
     UNION ALL SELECT d.id, NULL, NULL, NULL, d.answer FROM decision d WHERE d.id IN (SELECT value FROM json_each(?))`,
    JSON.stringify([...new Set([...asks.values()].map((a) => a.suggestion))]),
    JSON.stringify(decisions),
  );
  const asked = new Map(facts.filter((f) => f.answer === null).map((f) => [f.id, f]));
  /* WHO HAD ANSWERED A QUESTION THAT WAS TAKEN BACK: the actor of the newest decide that settled it. */
  const takenBack = [...new Set([...asks.values()].flatMap((a) => (a.undone === true || a.back === true ? [a.suggestion] : [])))];
  const answeredBy = new Map(
    takenBack.length === 0
      ? []
      : sql
          .all<{ suggestion: string; actor: string }>(
            `SELECT substr(r.target, 12) AS suggestion, e.actor AS actor FROM event e JOIN event r ON r.rowid = e.rowid + 1
              WHERE e.kind = 'decide' AND e.target LIKE 'decision:%' AND r.kind = 'resolve'
                AND r.target IN (SELECT 'suggestion:' || value FROM json_each(?))
              ORDER BY e.rowid`,
            JSON.stringify(takenBack),
          )
          .map((r) => [r.suggestion, r.actor] as const),
  );
  const answers = new Map(facts.filter((f) => f.answer !== null).map((f) => [f.id, f.answer as string]));
  for (const [id, a] of asks) {
    const s = asked.get(a.suggestion);
    if (!s || typeof s.opened_by !== 'string') continue;
    const said: Settled = { suggested_by: s.opened_by, drafted_by: typeof s.drafted_by === 'string' && s.drafted_by !== '' && !s.drafted_by.startsWith(ASKED_KEY) ? s.drafted_by : null };
    if (a.decision !== undefined) {
      const answer = answers.get(a.decision);
      said.answer_label = answer === undefined ? null : labelOf(s.body, answer);
    }
    if (a.by !== undefined) said.settled_by = a.by;
    if (a.undone === true) said.undone = true;
    const answerer = a.undone === true || a.back === true ? answeredBy.get(a.suggestion) : undefined;
    if (answerer !== undefined) said.answered_by = answerer;
    out.set(id, said);
  }
  return out;
}

/** The lines with their keys spread on, a pass's steps too; a line with none comes back as it was. */
export function withSettling<T extends { id: string; steps?: unknown }>(sql: Sql, lines: readonly T[]): T[] {
  const steps = lines.flatMap((l) => (Array.isArray(l.steps) ? (l.steps as { id: string }[]) : []));
  const keys = settlingOf(sql, [...lines, ...steps]);
  if (keys.size === 0) return [...lines];
  const put = <L extends { id: string; steps?: unknown }>(l: L): L => {
    const said = keys.get(l.id);
    const own = said === undefined ? l : { ...l, ...said };
    return Array.isArray(l.steps) ? { ...own, steps: (l.steps as { id: string }[]).map(put) } : own;
  };
  return lines.map(put);
}
