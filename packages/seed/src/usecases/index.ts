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

import { normaliseUseCase, useCasePack, type UseCase } from '@braindog/declare';

import { BUSINESS } from './business.ts';
import { FOUNDER } from './founder.ts';
import { GUIDE } from './guide.ts';
import { STUDENT } from './student.ts';
import { TEAM } from './team.ts';

export type { UseCase } from '@braindog/declare';
export { VOICE_KEYS, labelsOf, voiceOf } from '@braindog/declare';

function checked(doc: unknown): UseCase {
  const out = normaliseUseCase(doc);
  if (!out.ok) throw new Error(`a starter use case is not legal: ${'refusal' in out ? `${out.refusal.code} at ${out.refusal.at}: ${out.refusal.fix}` : 'a conflict'}`);
  return out.value;
}

/** In the order a tie is broken: the most specific first, and the business setup last. */
export const USE_CASES: readonly UseCase[] = [checked(STUDENT), checked(FOUNDER), checked(TEAM), checked(GUIDE), checked(BUSINESS)];

export const useCase = (id: string): UseCase | undefined => USE_CASES.find((u) => u.usecase === id);

/** The pack document a use case installs, with its voice as settings, or `null`. */
export const useCaseDocument = (id: string): Record<string, unknown> | null => {
  const u = useCase(id);
  return u ? useCasePack(u) : null;
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

/** First-party packs in install order: every list a later one points at comes earlier. */
export const MODULE_ORDER = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'] as const;

/** The first-party packs to install for a use case: its own modules and any the sentence named, in order. */
export function modulesFor(u: UseCase, named: readonly string[] = []): string[] {
  const wanted = new Set([...u.modules, ...named]);
  return MODULE_ORDER.filter((id) => wanted.has(id));
}

/** The pages and rail sections a use case's own pack declares, for the proposal to say. */
export function pagesOf(u: UseCase): { page: string; title: string; section: string | null }[] {
  const declarations = (u.pack?.declarations ?? []) as Record<string, unknown>[];
  return declarations
    .filter((d) => typeof d.page === 'string')
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
