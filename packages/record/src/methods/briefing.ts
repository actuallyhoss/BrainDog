/**
 * The briefing, the read: `briefing` (READ+), what Today opens on (ENG-B12, "A model reads the record and says what
 * matters").
 *
 * BEFORE THIS NOTHING ANSWERED IT. Today opened on whatever its page drew first, which on the owner's record was three
 * renewals for the year after next, while a bill late since yesterday and the questions waiting sat lower down or on
 * another screen (`loop/research-direction-audit.md`). The cards and their sentences are `../briefing.ts`'s, which reads
 * no table; this file is the reading: it gathers what the record already holds into facts and hands them over.
 *
 * FOUR THINGS ARE GATHERED, EACH FROM WHERE IT IS ALREADY KEPT. What is late and what falls due inside seven days are
 * the rows of any list with a day declared `deadline: true`, not in one of the list's `done` states, as the `deadlines`
 * source reads them. What is asked is the open questions, one a cause with their count. What a run left is the open
 * steps the kernel marks `next` (`openHandoffs`). An exception and what changed since the reader looked are kinds the
 * cards know and nothing here gathers yet.
 *
 * WORKED OUT AT THE READ AND KEPT IN NO TABLE, so any record answers it today from what it holds, and `basis` says what
 * it was worked out from. With nothing kept the lines are the rules' own sentences (`by: 'rule'`).
 *
 * A MODEL'S CARDS ARE ANSWERED THE MOMENT ONE IS KEPT, AND ONLY WHILE THEY ARE STILL TRUE. The write (`../brief-write.ts`,
 * at 08:00, at 17:00 and when the basis moves) keeps what a model answered as one pref of the model's own holder, with
 * the basis it was written from. This read asks no model and writes nothing of the briefing: it gathers the caller's
 * own facts, and the kept answer stands only when its basis is the basis of those facts (`keptBrief`). So a bill paid a
 * minute ago is said by the rules at once and never by a stale card, and somebody who reads less than the facts were
 * gathered for has a basis of their own and is answered the rules' cards, never lines written about what they were not
 * shown. A kept card is still held to the facts handed over here (`briefOf`): its holes are filled from the record's
 * own figures and a handle this caller was not handed is left out. When the rules speak in a model's place, `said` is
 * the sentence why.
 *
 * EVERY FACT IS HELD TO THE CALLER BEFORE IT IS A FACT. A list closed to them gives no row, a narrowed grant gives the
 * rows it admits (the read goes through the grant's own rule), a question is one `sightOf` shows them and is called
 * what it calls it, and a run is one they may read. So no card, no count and no `basis` says what they were not shown.
 *
 * A FRESH RECORD IS ANSWERED NO CARD. Nothing is made up to fill the space, and a row with no name of its own is left
 * out rather than said by its number.
 */

import type { Result } from '@braindog/ports';
import { SLASH, localDays, openHandoffs, readableZone, sessionDeclaration, spoken, whereFor } from '@braindog/kernel';
import type { Entry, HandoffPlace, Json } from '@braindog/kernel';

import { BRIEF_KEPT, keptBrief } from '../brief-write.ts';
import { markFirst } from '../firsts.ts';
import { BRIEF_RANK, briefFrom, type Brief, type BriefFact } from '../briefing.ts';
import { hashOf } from '../headlines.ts';
import type { CallContext } from '../index.ts';
import { scrubbed } from '../scrub.ts';
import { exceptionsFor } from './exceptions.ts';
import type { RecordDeps } from './index.ts';

/**
 * What `briefing` answers: the cards, when they were worked out, the hash of the facts they were worked out from, and
 * `said`: the sentence why the rules wrote them where a model would have, or `null`.
 */
export type Briefing = Brief & { said: string | null };

/** The list runs are kept in, read out of the kernel's own declaration so there is one copy of its name. */
const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

/** How many days ahead a row falling due is worth a card: a week. */
export const BRIEF_DUE_DAYS = 7;

/** The most rows read for one deadline of one list, soonest first, and the most runs read for their steps. */
const READ_MOST = 100;

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** A day as the count of days since the epoch, so two days are a subtraction apart. */
const dayNumber = (day: string): number => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Text a person wrote, as one run of words with nothing a card may not show, or `null` when nothing is left. */
const said = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? scrubbed(v) : typeof v === 'number' ? String(v) : null);

/** A handle for the `n`th fact of a kind, in the order it was gathered: `late-003`. Never shown, and never an id. */
const handle = (kind: string, n: number): string => `${kind}-${String(n + 1).padStart(3, '0')}`;

/**
 * How pressing one fact is within its kind, as a part of one added to the kind's own rank and always under a half, so
 * no kind is passed by the one below it: `at` of `of`, the first the most pressing.
 */
const within = (at: number, of: number): number => (of <= 0 ? 0 : (0.4 * (of - at)) / of);

/**
 * Everything worth saying on this record now that this caller may read, as facts: what is late and what falls due, what
 * is asked, what runs left, and what stopped, in that order. The read below and the write that asks a model both call
 * it, so the two are worked out from the same facts and one basis. It guards nothing itself: each caller has its own.
 */
export function briefFactsFor(deps: RecordDeps, ctx: CallContext, nowMs: number): BriefFact[] {
  const { kernel, sql, readable, sightOf } = deps;

  /**
   * What is late and what falls due inside `BRIEF_DUE_DAYS`, across every list the caller may read: a row a day
   * declared `deadline: true` holds, not in one of the list's `done` states. Late is before the record's own today,
   * the most lately late first; due is today or after, the soonest first. A row is said once, by its soonest day.
   */
  const dated = (ctx: CallContext, nowMs: number): BriefFact[] => {
    const today = localDays(readableZone(kernel.identity()?.tz))(nowMs);
    const at = dayNumber(today);
    const last = new Date((at + BRIEF_DUE_DAYS) * DAY_MS).toISOString().slice(0, 10);
    const found = new Map<string, { row: Entry; day: string; title: string }>();
    for (const list of kernel.registers().values()) {
      if (readable(ctx, list.id) !== null) continue;
      const schema = kernel.schemaOf(list.id);
      if (!schema) continue;
      const days = Object.keys(schema.fields).filter((f) => schema.fields[f]!.deadline === true && schema.fields[f]!.type === 'day');
      const done = list.done ?? [];
      /* NOT FINISHED IS THE LIST'S OWN `done` STATES, as the `deadlines` source reads it. A row with no state is open. */
      const open = schema.state !== undefined && done.length > 0 ? [{ field: schema.state, not_in: [...done] }] : [];
      for (const field of days) {
        const got = kernel.list(
          { register: list.id, where: { all: [{ field, lte: last }, ...open] }, limit: READ_MOST, order: [{ field, dir: 'desc' }] },
          whereFor(ctx.wheres, list.id),
        );
        /* A LIST THAT CANNOT BE READ SAYS NOTHING, and the others are still said. */
        if (!got.ok) continue;
        for (const row of got.value.rows) {
          const day = row.fields[field];
          const title = said(row.fields[list.title]);
          if (typeof day !== 'string' || row.seq === null || title === null) continue;
          const held = found.get(row.id);
          if (held === undefined || day.slice(0, 10) < held.day) found.set(row.id, { row, day: day.slice(0, 10), title });
        }
      }
    }
    const all = [...found.values()];
    /* The most lately late first, then the soonest due, and the row's own name where two fall on one day. */
    const late = all.filter((f) => f.day < today).sort((a, b) => (a.day > b.day ? -1 : a.day < b.day ? 1 : a.title < b.title ? -1 : 1));
    const due = all.filter((f) => f.day >= today).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.title < b.title ? -1 : 1));
    return [
      ...late.map((f, n): BriefFact => ({
        h: handle('late', n),
        kind: 'late',
        title: f.title,
        figures: { days: String(at - dayNumber(f.day)) },
        /* BY ITS LIST AND ITS NUMBER THERE (`spoken`), which every screen can open: a list with a prefix of its own names
           a row by that prefix (`LN7`), which says nothing of the list to somebody who only has the card. */
        row: spoken(f.row.register, f.row.seq!),
        cause: null,
        rank: BRIEF_RANK.late + within(n, late.length),
      })),
      ...due.map((f, n): BriefFact => {
        const ahead = dayNumber(f.day) - at;
        /* A WEEK AHEAD IS TODAY'S OWN WEEKDAY, which would read as today, so it is said in days alone. */
        const when = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : ahead < 7 ? `on ${WEEKDAYS[new Date(dayNumber(f.day) * DAY_MS).getUTCDay()]!}` : null;
        return {
          h: handle('due', n),
          kind: 'due',
          title: f.title,
          figures: { days: String(ahead), ...(when === null ? {} : { when }) },
          row: spoken(f.row.register, f.row.seq!),
          cause: null,
          rank: BRIEF_RANK.due + within(n, due.length),
        };
      }),
    ];
  };

  /** The words a question was asked in, as the kernel's own signs read them: its `suggest` line's question or note. */
  const askedIn = (id: string): string | null => {
    const line = sql.one<{ said: string | null }>(
      "SELECT coalesce(to_v, note) AS said FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL ORDER BY rowid LIMIT 1",
      `suggestion:${id}`,
    );
    return typeof line?.said === 'string' ? scrubbed(line.said) : null;
  };

  /**
   * The open questions this caller is shown, the longest waiting first, each with the cause it shares.
   *
   * ONE A CAUSE IS THE CARDS' RULE (`briefCandidates`), AND WHAT TWO QUESTIONS SHARE IS READ AS THE KERNEL'S SIGN READS
   * IT. The record holds one open question to a cause it was stamped with, so two that are one question are found by
   * what the stamp misses: the same words (one asked again for each thing it touches, which is the pile the sign turns
   * red on), else the same thing asked about by the same kind of change. A question that shares neither keeps the cause
   * it was stamped with, and one with none stands alone. A question with no words is left out: there is nothing to say.
   */
  const asked = (ctx: CallContext): BriefFact[] => {
    const open = kernel.openSuggestions();
    if (!open.ok) return [];
    const shown = open.value
      .map((q) => ({ q, id: String(q.id ?? ''), opened: String(q.opened_at ?? '') }))
      .map((one) => ({ ...one, row: sightOf(ctx, `suggestion:${one.id}`), words: askedIn(one.id) }))
      .filter((one): one is typeof one & { row: string; words: string } => one.row !== null && one.words !== null)
      .sort((a, b) => (a.opened < b.opened ? -1 : a.opened > b.opened ? 1 : a.id < b.id ? -1 : 1));
    const folded = (words: string): string => words.toLowerCase().replace(/\s+/gu, ' ').trim();
    const sameWords = new Map<string, number>();
    for (const one of shown) sameWords.set(folded(one.words), (sameWords.get(folded(one.words)) ?? 0) + 1);
    return shown.map((one, n): BriefFact => {
      const body = one.q.body !== null && typeof one.q.body === 'object' && !Array.isArray(one.q.body) ? (one.q.body as Record<string, unknown>) : {};
      const about = typeof body.about === 'string' && body.about !== '' ? `about#${hashOf(`${String(one.q.body_kind ?? '')}|${body.about}`)}` : null;
      const stamped = typeof one.q.cause === 'string' && one.q.cause !== '' ? one.q.cause : null;
      return {
        h: handle('asked', n),
        kind: 'asked',
        title: one.words,
        figures: {},
        row: one.row,
        cause: (sameWords.get(folded(one.words)) ?? 0) > 1 ? `asked#${hashOf(folded(one.words))}` : (about ?? stamped),
        rank: BRIEF_RANK.asked + within(n, shown.length),
      };
    });
  };

  /**
   * The steps runs left that nobody has taken, the newest first: what the kernel marks `next` in each place a run
   * waits (`openHandoffs`), and only for a caller who may read runs, each run read again under their own grant.
   *
   * A RUN IS SAID BY WHAT IT WAS DOING, and by its agent's name where it said nothing, never by its number. Above the
   * rows falling due and below the questions, which is the order the cards' own kinds give them.
   */
  const steps = (ctx: CallContext, nowMs: number): BriefFact[] => {
    if (readable(ctx, SESSION) !== null) return [];
    const got = kernel.list({ register: SESSION, where: { field: 'state', is: 'handoff' }, limit: READ_MOST }, whereFor(ctx.wheres, SESSION));
    if (!got.ok) return [];
    const runs = new Map(got.value.rows.map((run) => [run.id, run] as const));
    const places = new Map<string, HandoffPlace>();
    /* WHERE EACH RUN WAITS, read off its own fields as the kernel's `runPlace` reads it: its project, and its repository. */
    const placed = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
    for (const run of runs.values()) {
      const place = { project: placed(run.fields.project), repo: placed(run.fields.repo) };
      places.set(JSON.stringify([place.project, place.repo]), place);
    }
    const left = new Map<string, { next: string; at: string }>();
    for (const place of places.values())
      for (const step of openHandoffs(sql, place, null, nowMs)) if (step.mark === 'next' && runs.has(step.id)) left.set(step.id, { next: step.next, at: step.left_at });
    const newest = [...left.entries()].sort((a, b) => (a[1].at > b[1].at ? -1 : a[1].at < b[1].at ? 1 : a[0] < b[0] ? -1 : 1));
    return newest.flatMap(([id, step], n): BriefFact[] => {
      const run = runs.get(id)!;
      const next = scrubbed(step.next);
      const title = said(run.fields.doing) ?? said(run.fields.agent);
      if (next === null || title === null) return [];
      return [{ h: handle('step', n), kind: 'step', title, figures: { next }, row: kernel.nameOf(id), cause: null, rank: BRIEF_RANK.step + 0.5 + within(n, newest.length) }];
    });
  };

  return [
    ...dated(ctx, nowMs),
    ...asked(ctx),
    ...steps(ctx, nowMs),
    /* AND WHAT STOPPED (`exceptionsFor`, ENG-B13), already held to the lists this caller reads whole. */
    ...(exceptionsFor(deps, ctx, nowMs) ?? []).map((e, n, all): BriefFact => ({ h: handle('exception', n), kind: 'exception', title: e.subject, figures: { when: e.since }, row: e.row?.id ?? '', cause: e.cause, rank: BRIEF_RANK.exception + within(n, all.length) })),
  ];
}

export function methods(deps: RecordDeps) {
  const { kernel, scoped, clock } = deps;

  return {
    /**
     * `{}`: what matters on this record now, as `{ cards, at, basis, said }`. Each card is one line a person reads, the
     * row it opens and who wrote the line: `slash` when a model's kept answer still stands for this caller's own facts,
     * else `rule`. `said` is why the rules wrote it when a model would have, or `null`. No card when nothing is
     * pressing. READ+, held to what the caller may read. It changes nothing but one thing, once: the first time it
     * answers a person or an agent a card, it keeps when as `first.brief` (`../firsts.ts`). The host's own reads,
     * a system principal, never do, so a check the host runs is not taken for somebody's first briefing.
     */
    async briefing(_args: unknown, ctx: CallContext): Promise<Result<Briefing>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const nowMs = clock.now();
      const facts = briefFactsFor(deps, ctx, nowMs);
      /* NO MODEL IS ASKED HERE. What one answered at the last write is read out of the model's own prefs, and it stands
         only for the basis it was written from: a moved basis, or another caller's, is answered by the rules. */
      const kept = keptBrief(kernel.prefsOf(SLASH)[BRIEF_KEPT], facts);
      const brief = briefFrom(kept === null ? null : { cards: kept.cards }, facts, new Date(nowMs).toISOString(), kept?.said ?? null);
      if (brief.cards.length > 0 && ctx.principal.kind !== 'system') markFirst(kernel, 'first.brief', nowMs);
      return { ok: true, value: { ...brief, said: brief.said ?? null } };
    },
  };
}
