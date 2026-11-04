/**
 * Decide's writes against the record: answering a question or a proposal, parking one until a day, and asking one of
 * yourself (`askYourself`, filed through `propose` like any other question).
 *
 * A ROUTE-ONLY MODULE, loaded by the two Decide screens, like `inbox-live.ts`: the client carries the route table as
 * a value. The fetch is handed in, so a test drives every branch without a socket.
 *
 * ONE VERB, `decide`. A suggestion is a governance row, and `30 §5` reads and writes those through the same verbs as
 * any other; the kernel resolves it, writes the `D<n>`, and installs what an accepted proposal carries. A proposal that
 * CALLS OUT needs nothing extra from here: the lines the press approves are the ones the record worked out when it was
 * filed, and the kernel copies them from the suggestion onto the decision event word for word. Sending them back would
 * let a browser say it approved lines the record never showed.
 *
 * THREE ANSWERS. `written` drops the shell's kept `boot`, so the rail's count follows once the layout reads again; it
 * says `open` when an arrangement was taken in part and the rest still waits as the same question.
 * `refused` is the record's own sentence, and that includes a host that did not answer and a session that ran out.
 * `conflict` is a row the proposal would change that moved since it was filed: the screen reads again and says so.
 *
 * A REFUSAL THAT ASKS FOR A REASON SAYS SO, as `wants: 'reason'`. A question answered where it is shown
 * (`lib/page/QueueAnswer.svelte`) sends the option alone and lets the kernel decide whether a reason is owed
 * (`govern.ts` `decide`, which refuses `REQUIRED_MISSING` at `reason` for every question except a light one a rule or
 * Slash opened). The card opens its one reason line on that answer and on no other, so it never asks for a
 * sentence the record would not have wanted.
 *
 * THERE WAS A FOURTH, `gone`, for a 401 or an unreachable host at an address with no slug, which is where the sample
 * was drawn. Neither Decide screen told it from `refused`, both print the `fix`, and with no sample an address with
 * no slug is a record like any other.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { dropOut, HOLD_MS, landedOut, outWaiting, pageGoing, REPLAY_MS, sentOut, type Out } from './answers-out.ts';
import { forget, type Fetch } from './boot-live.ts';

/**
 * `rows`: on accepting a proposal that adds several rows, the places of the ones ticked; the rest are declined.
 *
 * `parts`: on accepting an arrangement, the ids of the parts ticked (`arranged.ts` `ticksOf`); the kernel takes those and
 * the rest stay open as the same question (`govern.ts` `decide`). Left out, the whole of it is taken. An empty list is
 * none, which is not an accept, so it is refused here and never sent.
 *
 * `reason` ABSENT IS NOT `reason` EMPTY. Absent, nobody has been asked yet, and the record is sent the option alone so
 * the kernel says whether it wants one. Typed and blank, somebody was asked and wrote nothing, which is refused here.
 */
export type Verdict = { decide: { option: string; reason?: string; rows?: number[]; parts?: string[] } } | { defer: { until: string; why: string } };

export type Written =
  | { from: 'written'; decision: string | null; applied?: Record<string, string[]>; open?: true; said?: string }
  | { from: 'refused'; fix: string; wants?: 'reason' }
  | { from: 'conflict'; fix: string };

/** A verdict with nothing to send says so here, and the record is not asked. */
function missing(verdict: Verdict): string | null {
  if ('decide' in verdict) {
    const { option, reason, parts } = verdict.decide;
    if (parts !== undefined && parts.length === 0) return copy.arrangeTakeNone;
    return option === '' || (reason !== undefined && reason.trim() === '') ? copy.reasonRequired : null;
  }
  return verdict.defer.until === '' || verdict.defer.why.trim() === '' ? copy.reasonRequired : null;
}

const trimmed = (verdict: Verdict): Verdict =>
  'decide' in verdict
    ? {
        decide: {
          option: verdict.decide.option,
          ...(verdict.decide.reason !== undefined ? { reason: verdict.decide.reason.trim() } : {}),
          ...(verdict.decide.rows ? { rows: verdict.decide.rows } : {}),
          ...(verdict.decide.parts ? { parts: verdict.decide.parts } : {}),
        },
      }
    : { defer: { until: verdict.defer.until, why: verdict.defer.why.trim() } };

/**
 * THE RECORD'S REFUSAL OF AN ANSWER TO A QUESTION ALREADY CLOSED. To whoever is sending an answer again (`replayAnswers`,
 * or a tab whose timer was asleep) that is the answer landing: the question is closed, which is what was asked.
 */
const closedAlready = (refusal: { code: string; at?: string | undefined; fix?: string }): boolean => refusal.code === 'TRANSITION_ILLEGAL' && refusal.at === 'status' && / is resolved\b/u.test(refusal.fix ?? '');

/**
 * Send one verdict on suggestion `id`.
 *
 * SENT TO OUTLIVE THE PAGE (`outlive`), BECAUSE THIS IS WHAT THE PAGE SENDS AS IT GOES: a card's held answer on `pagehide`.
 * And written down first (`answers-out.ts`), so what the page never heard back about is sent again by the next one.
 */
export async function writeDecision(base: string, id: string, verdict: Verdict, io?: Fetch): Promise<Written> {
  const said = missing(verdict);
  if (said !== null) return { from: 'refused', fix: said };
  const sent = trimmed(verdict);
  sentOut(base, id, sent);
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ decision?: unknown; applied?: unknown; status?: unknown; skipped?: unknown; settled?: unknown }>('decide', { id, ...sent }, { outlive: true });
  /* WHAT GOES WRONG WHILE THE PAGE GOES IS NOT AN ANSWER ANYBODY HEARS: it stays listed, for the next page to send. */
  if (!out.ok && pageGoing()) return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : copy.decideConflict };
  if (out.ok) {
    forget();
    const decision = out.value && typeof out.value.decision === 'string' ? out.value.decision : null;
    /* TAKEN IN PART IT IS STILL OPEN, and is drawn with what is left of it. */
    if (out.value?.status === 'open') dropOut(base, id);
    else landedOut(base, id, decision);
    /* AN ACCEPTED ARRANGEMENT SAYS WHAT IT APPLIED, and the screen says it back. */
    const applied = out.value && typeof out.value.applied === 'object' && out.value.applied !== null ? (out.value.applied as Record<string, string[]>) : undefined;
    /* AND ONE TAKEN IN PART IS STILL OPEN, holding the parts left (`govern.ts` `decide`, `status: 'open'`). */
    const open = out.value && out.value.status === 'open';
    /* AND WHAT IT LEFT, IN THE RECORD'S WORDS: entries a pick did not write because they changed since it was asked
       (`skipped`), or the line a question closed in when none could be (`settled`). */
    const skipped = out.value?.skipped as { said?: unknown } | undefined;
    const said = typeof skipped?.said === 'string' ? skipped.said : typeof out.value?.settled === 'string' ? out.value.settled : undefined;
    return { from: 'written', decision, ...(applied ? { applied } : {}), ...(open ? { open: true as const } : {}), ...(said ? { said } : {}) };
  }
  if (!('conflict' in out) && closedAlready(out.refusal)) {
    forget();
    landedOut(base, id, null);
    return { from: 'written', decision: null };
  }
  dropOut(base, id);
  if ('conflict' in out) return { from: 'conflict', fix: copy.decideConflict };
  const wants = out.refusal.code === 'REQUIRED_MISSING' && out.refusal.at === 'reason';
  return { from: 'refused', fix: out.refusal.fix, ...(wants ? { wants: 'reason' as const } : {}) };
}

/** What `replayAnswers` says, in plain words. */
export const replayWords = {
  /** The answer could not be given, and the question is waiting again. */
  failed: (title: string | undefined, fix: string) => (title ? `Your answer to “${title}” didn’t go through, so it’s waiting again. ${fix}` : `One of your answers didn’t go through, so it’s waiting again. ${fix}`),
  /** Too long ago to send without asking. */
  old: (title: string | undefined) => (title ? `Your answer to “${title}” was never sent, so it’s waiting again.` : 'One of your answers was never sent, so it’s waiting again.'),
};

/** Whether `one` may still be taken back by the tab holding it, inside its own six seconds and a moment for its timer. */
const stillHeld = (one: Out, now: number): boolean => one.s === 'held' && now - one.at < HOLD_MS + 2_000;

/**
 * WHAT THE LAST PAGE PRESSED AND NEVER HEARD BACK ABOUT, sent again as this one opens. `tell` is told each that is settled.
 * Answers given by the last page that did land are refused as closed, which `writeDecision` reads as landed.
 */
export async function replayAnswers(
  base: string,
  tell: (one: { id: string; out: Written | null; say: string | null }) => void,
  now: number = Date.now(),
): Promise<void> {
  await Promise.all(
    outWaiting(base, now).map(async (one) => {
      if (stillHeld(one, now)) {
        /* ANOTHER TAB'S, OR A PAGE THAT DIED INSIDE THE HOLD WITH NO `pagehide`: looked at again once its time is up. */
        setTimeout(() => void replayAnswers(base, tell), HOLD_MS + 2_000 - (now - one.at) + 50);
        return;
      }
      if (now - one.at > REPLAY_MS || !one.v) {
        dropOut(base, one.id);
        return tell({ id: one.id, out: null, say: replayWords.old(one.t) });
      }
      const out = await writeDecision(base, one.id, one.v);
      tell({ id: one.id, out, say: out.from === 'written' ? null : replayWords.failed(one.t, out.fix) });
    }),
  );
}

/**
 * Answer one with an option, the reason where there is one, on accepting some rows of several, which, and on accepting
 * some parts of an arrangement, which.
 *
 * WITHOUT A REASON THE KERNEL DECIDES: the option goes alone, and a record
 * that wants a sentence answers `wants: 'reason'`, so the caller asks for one and sends again.
 */
export const answerQuestion = (base: string, id: string, option: string, reason?: string, io?: Fetch, rows?: number[], parts?: string[]): Promise<Written> =>
  writeDecision(base, id, { decide: { option, ...(reason !== undefined ? { reason } : {}), ...(rows ? { rows } : {}), ...(parts ? { parts } : {}) } }, io);

/**
 * What a group answer came back as: how many were written, the decision one Undo takes back (any of them, since they
 * share one batch), and each member the record refused with its own sentence.
 */
export type WrittenMany =
  | { from: 'written'; done: number; decision: string | null; refused: { id: string; fix: string }[] }
  | { from: 'refused'; fix: string }
  | { from: 'conflict'; fix: string };

/** Answer several the same way in one call (`decide { ids }`), so the record moves once and one Undo puts all back. */
export async function answerMany(base: string, ids: readonly string[], option: string, reason?: string, io?: Fetch): Promise<WrittenMany> {
  if (ids.length === 0 || option === '' || (reason !== undefined && reason.trim() === '')) return { from: 'refused', fix: copy.reasonRequired };
  const each: Verdict = { decide: { option, ...(reason !== undefined ? { reason: reason.trim() } : {}) } };
  for (const id of ids) sentOut(base, id, each);
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ decided?: unknown; refused?: unknown }>('decide', { ids: [...ids], decide: { option, ...(reason !== undefined ? { reason: reason.trim() } : {}) } }, { outlive: true });
  if (!out.ok && pageGoing()) return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : copy.decideConflict };
  if (out.ok) {
    forget();
    const decided = Array.isArray(out.value?.decided) ? (out.value.decided as { decision?: unknown }[]) : [];
    const refused = Array.isArray(out.value?.refused)
      ? (out.value.refused as { id?: unknown; fix?: unknown }[]).flatMap((r) => (typeof r.id === 'string' && typeof r.fix === 'string' ? [{ id: r.id, fix: r.fix }] : []))
      : [];
    const first = decided.find((d) => typeof d.decision === 'string')?.decision;
    const no = new Set(refused.map((r) => r.id));
    for (const id of ids) no.has(id) ? dropOut(base, id) : landedOut(base, id, typeof first === 'string' ? first : null);
    return { from: 'written', done: decided.length, decision: typeof first === 'string' ? first : null, refused };
  }
  for (const id of ids) dropOut(base, id);
  if ('conflict' in out) return { from: 'conflict', fix: copy.decideConflict };
  return { from: 'refused', fix: out.refusal.fix };
}

/** Park one until a day, with why it can wait. */
export const parkQuestion = (base: string, id: string, until: string, why: string, io?: Fetch): Promise<Written> =>
  writeDecision(base, id, { defer: { until, why } }, io);

/**
 * What an option IS, as the sheet collects it: its colours, a figure, or a file the record already holds. The kernel
 * checks every one again on filing (`govern.ts` `showsOf`), so this is the shape it reads and nothing looser.
 */
export type AskShows = { swatch: string[] } | { figure: string } | { file: { row: string; field: string } };

export type AskOption = { label: string; because: string; shows?: AskShows };

/**
 * A question the owner puts to themselves. `recommended` is the place of the one they suggest, or `null` for none;
 * `about` is the thing it is about when the sheet was opened from a page, so that page's queue can find it.
 */
export type Ask = { question: string; why: string; options: AskOption[]; recommended: number | null; about?: string };

/** `at` names what to fix where the sheet can point at it: `question`, or `option-<n>` counted from one. */
export type Asked = { from: 'filed'; id: string } | { from: 'refused'; fix: string; at?: string };

/** The sheet's own words: what it says when something it holds cannot be filed yet. */
export const askWords = {
  noQuestion: 'Write the question you want to answer.',
  noLabel: (n: number) => `Give option ${n} a name.`,
  tooFew: 'A choice is between at least two options.',
  tooMany: 'Six options is the most a question offers.',
  noFigure: (n: number) => `Write what option ${n} shows, or pick another way to show it.`,
  noFile: (n: number) => `Option ${n}'s file is not one BrainDog holds. Name the row that holds it, a slash, then its field.`,
} as const;

/** The most options a person offers here; the kernel takes more from an agent, and a sheet on a phone does not. */
export const ASK_MOST = 6;

/** A file named the way a person types it, `parts#2/photo`, read as the row and field the kernel keeps. */
export function fileOf(said: string): { row: string; field: string } | null {
  const m = /^([a-z][a-z0-9_]*#[1-9][0-9]*)\/([a-z][a-z0-9_]*)$/u.exec(said.trim());
  return m && m[1] && m[2] ? { row: m[1], field: m[2] } : null;
}

/** The first thing the sheet holds that cannot be filed, or `null`. The record is not asked about what is plainly missing. */
function askFault(ask: Ask): { fix: string; at: string } | null {
  if (ask.question.trim() === '') return { fix: askWords.noQuestion, at: 'question' };
  if (ask.options.length < 2) return { fix: askWords.tooFew, at: 'option-1' };
  if (ask.options.length > ASK_MOST) return { fix: askWords.tooMany, at: `option-${ASK_MOST + 1}` };
  for (const [i, o] of ask.options.entries()) {
    if (o.label.trim() === '') return { fix: askWords.noLabel(i + 1), at: `option-${i + 1}` };
    if (o.shows && 'figure' in o.shows && o.shows.figure.trim() === '') return { fix: askWords.noFigure(i + 1), at: `option-${i + 1}` };
  }
  return null;
}

/**
 * The `options` body the kernel reads (`govern.ts` `checkBody`): each option an id, a label and its because, the
 * suggested one marked, and why the question is asked in `context`, which is where the gate reads it from.
 *
 * THE IDS ARE PLACES, `o1` and on, because a person never reads them and two options named alike must still be two.
 */
function askBody(ask: Ask): Record<string, unknown> {
  const about = ask.about?.trim();
  return {
    ...(ask.why.trim() !== '' ? { context: ask.why.trim() } : {}),
    ...(about ? { about } : {}),
    options: ask.options.map((o, i) => ({
      id: `o${i + 1}`,
      label: o.label.trim(),
      because: o.because.trim(),
      ...(ask.recommended === i ? { recommended: true } : {}),
      ...(o.shows ? { shows: 'figure' in o.shows ? { figure: o.shows.figure.trim() } : o.shows } : {}),
    })),
  };
}

/**
 * File the owner's own `options` question through `propose`, where it waits on Decide like any other.
 *
 * IT IS FILED, NOT ANSWERED. Asking yourself is writing the question down so it is decided with a reason later, on the
 * gate, and not in the same breath it was asked. The rail's count follows because the kept boot is dropped here.
 */
export async function askYourself(base: string, ask: Ask, io?: Fetch): Promise<Asked> {
  const said = askFault(ask);
  if (said !== null) return { from: 'refused', ...said };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ id?: unknown }>('propose', { question: ask.question.trim(), body_kind: 'options', body: askBody(ask) });
  if (out.ok) {
    forget();
    return { from: 'filed', id: out.value && typeof out.value.id === 'string' ? out.value.id : '' };
  }
  if ('conflict' in out) return { from: 'refused', fix: copy.decideConflict };
  return { from: 'refused', fix: out.refusal.fix, ...(typeof out.refusal.at === 'string' ? { at: out.refusal.at } : {}) };
}
