/**
 * The starter use cases, and the arranger that proposes one (`loop/research-spark.md` §3, tier A).
 *
 * DETERMINISTIC, BECAUSE A FRESH SELF-HOST HAS NO MODEL (19 §6). The arranger counts the signals each use
 * case listens for in what the person wrote, ranks the use cases by that count, and says which phrases
 * made each one. The same words always give the same ranking. It never installs anything: it answers a
 * proposal, and the person accepts it or picks another.
 *
 * IT IS SPARK'S FIRST TIER, NOT SPARK'S MODEL. `@braindog/spark` is the model engine of `docs/46` and is
 * loaded only when `SPARK_ENDPOINT` is set. Tiers B and C file the same proposal this answers.
 */

import { normaliseUseCase, packIdOf, useCasePack, voiceWhenAdding, type UseCase } from '@braindog/declare';

import { BUSINESS } from './business.ts';
import { dated, dayOf } from './dates.ts';
import { FOUNDER } from './founder.ts';
import { GUIDE } from './guide.ts';
import { PERSONAL } from './personal.ts';
import { STUDENT } from './student.ts';
import { TEAM } from './team.ts';

export type { UseCase } from '@braindog/declare';
export { pollPack, type PolledMeasure, type PollSpec } from './founder-poll.ts';
export { VOICE_KEYS, labelsOf, voiceOf } from '@braindog/declare';

function checked(doc: unknown): UseCase {
  const out = normaliseUseCase(doc);
  if (!out.ok) throw new Error(`a starter use case is not legal: ${'refusal' in out ? `${out.refusal.code} at ${out.refusal.at}: ${out.refusal.fix}` : 'a conflict'}`);
  return out.value;
}

/**
 * In the order a tie is broken: one person's own life first, then the most specific, and the business setup last. Personal
 * leads because a sentence that is as much about a person's budget as their coursework is a person's record with their
 * studies beside it (`alongside`), and the record speaks in the voice of the use-case pack whose id sorts first.
 */
export const USE_CASES: readonly UseCase[] = [checked(PERSONAL), checked(STUDENT), checked(FOUNDER), checked(TEAM), checked(GUIDE), checked(BUSINESS)];

export const useCase = (id: string): UseCase | undefined => USE_CASES.find((u) => u.usecase === id);

/**
 * The pack document a use case installs, with its voice as settings, or `null`. A day in an example row written
 * `+3d` is counted from `today` (`dates.ts`), so the example is due that week whenever the record is made.
 */
export const useCaseDocument = (id: string, today: string = dayOf(Date.now())): Record<string, unknown> | null => {
  const u = useCase(id);
  const doc = u ? useCasePack(u) : null;
  return doc ? dated(doc, today) : null;
};

export type Span = { at: number; text: string };
export type Ranked = { usecase: UseCase; score: number; why: Span[] };
export type Arrangement = { pick: UseCase | null; ranked: Ranked[] };

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every place a use case's signals appear, longest signal first, never two over one stretch. */
function heard(said: string, u: UseCase): Span[] {
  const lower = said.toLowerCase();
  const out: Span[] = [];
  for (const signal of [...u.signals].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
    const words = new RegExp(`(?<![\\p{L}\\p{N}])${escape(signal)}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of lower.matchAll(words)) {
      const at = m.index ?? 0;
      const end = at + m[0].length;
      if (out.some((s) => at < s.at + s.text.length && s.at < end)) continue;
      out.push({ at, text: said.slice(at, end) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * What this BrainDog reads as being for: every use case ranked by how many of its signals were heard,
 * ties in catalogue order, and the first one proposed when anything was heard at all.
 */
export function arrange(said: string, catalogue: readonly UseCase[] = USE_CASES): Arrangement {
  const ranked = catalogue
    .map((usecase, i) => ({ usecase, why: heard(said, usecase), i }))
    .map(({ usecase, why, i }) => ({ usecase, score: why.length, why, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ usecase, score, why }) => ({ usecase, score, why }));
  const top = ranked[0];
  return { pick: top && top.score > 0 ? top.usecase : null, ranked };
}

/**
 * THE OTHER USE CASES A PERSON'S RECORD TAKES BESIDE THE ONE PROPOSED, for one person who said more than one thing about
 * their own life: "my budget, my running and my coursework" is Personal with Student's lists beside it. Only between use
 * cases for an individual that carry a pack, only when the sentence was heard saying so, and never two that declare the
 * same list or page, so neither install can refuse the other.
 */
export function alongside(arranged: Arrangement, proposed: UseCase | null): UseCase[] {
  if (!proposed || proposed.audience !== 'individual' || proposed.pack === null) return [];
  /* A RECORD SPEAKS IN THE VOICE OF ITS FIRST USE-CASE PACK BY ID (`voice.ts` `speaking`), so only a use case whose id
     sorts after the proposal's goes beside it: the voice the proposal promised is the one the record has. */
  const ids = (u: UseCase): Set<string> =>
    new Set(((u.pack?.declarations ?? []) as Record<string, unknown>[]).flatMap((d) => [d.register, d.page, d.metric].filter((x): x is string => typeof x === 'string')));
  const taken = ids(proposed);
  const out: UseCase[] = [];
  for (const r of arranged.ranked) {
    const u = r.usecase;
    if (u === proposed || r.score === 0 || u.audience !== 'individual' || u.pack === null) continue;
    if (voiceWhenAdding([{ id: packIdOf(proposed.usecase), disabled_at: null }], u.usecase) !== 'beside') continue;
    const mine = ids(u);
    if ([...mine].some((id) => taken.has(id))) continue;
    for (const id of mine) taken.add(id);
    out.push(u);
  }
  return out;
}

/** First-party packs in install order: every list a later one points at comes earlier. */
export const MODULE_ORDER = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'] as const;

/** The first-party packs to install for a use case: its own modules and any the sentence named, in order. */
export function modulesFor(u: UseCase, named: readonly string[] = []): string[] {
  const wanted = new Set([...u.modules, ...named]);
  return MODULE_ORDER.filter((id) => wanted.has(id));
}

/** The pages and rail sections a use case's own pack declares, for the proposal to say. Its Home is not one: it is Home. */
export function pagesOf(u: UseCase): { page: string; title: string; section: string | null }[] {
  const declarations = (u.pack?.declarations ?? []) as Record<string, unknown>[];
  return declarations
    /* A PAGE PER ROW is not one page yet: it appears with the rows it is about, so the proposal does not name it. */
    .filter((d) => typeof d.page === 'string' && d.page !== `home-${u.usecase}` && d.for === undefined)
    .map((d) => ({
      page: d.page as string,
      title: typeof d.title === 'string' ? d.title : (d.page as string),
      section: typeof (d.nav as { section?: unknown } | undefined)?.section === 'string' ? ((d.nav as { section: string }).section) : null,
    }));
}

/** The lists a use case's own pack declares, by id and name. */
export function listsOf(u: UseCase): { id: string; name: string }[] {
  const declarations = (u.pack?.declarations ?? []) as Record<string, unknown>[];
  return declarations
    .filter((d) => typeof d.register === 'string' && d.page === undefined && d.rule === undefined)
    .map((d) => ({ id: d.register as string, name: typeof d.name === 'string' ? d.name : (d.register as string) }));
}
