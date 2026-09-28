/**
 * The starter use cases, and the arranger that proposes one (`loop/research-spark.md` §3, tier A).
 *
 * DETERMINISTIC, BECAUSE A FRESH SELF-HOST HAS NO MODEL (19 §6). The arranger counts the signals each use
 * case listens for in what the person wrote, ranks the use cases by that count, and says which phrases
 * made each one. The same words always give the same ranking. It never installs anything: it answers a
 * proposal, and the person accepts it or picks another.
 *
 * IT IS SLASH'S FIRST TIER, NOT SLASH'S MODEL. `@braindog/slash` is the model engine of `docs/46` and is
 * loaded only when `SLASH_ENDPOINT` is set. Tiers B and C file the same proposal this answers.
 */

import { normaliseUseCase, useCasePack, type UseCase } from '@braindog/declare';

import { BUSINESS } from './business.ts';
import { dated, dayOf } from './dates.ts';
import { FOUNDER } from './founder.ts';
import { GUIDE, GUIDE_SETTINGS } from './guide.ts';
import { PERSONAL } from './personal.ts';
import { STUDENT } from './student.ts';
import { EARLIER_TICKETS, TEAM } from './team.ts';

export type { UseCase } from '@braindog/declare';
export { pollPack, type PolledMeasure, type PollSpec } from './founder-poll.ts';
export { VOICE_KEYS, labelsOf, voiceOf } from '@braindog/declare';

function checked(doc: unknown): UseCase {
  const out = normaliseUseCase(doc);
  if (!out.ok) throw new Error(`a starter use case is not legal: ${'refusal' in out ? `${out.refusal.code} at ${out.refusal.at}: ${out.refusal.fix}` : 'a conflict'}`);
  return out.value;
}

/**
 * In the order a tie is broken when the length of what was heard does not break it (`arrange` below): one person's own
 * life first, then the most specific, and the business setup last. Either way the other use case for one person is not
 * lost: "my budget, my running and my uni coursework" is Personal with Student's lists beside it (`alongside`), and the
 * record speaks in the voice of the use case proposed, which onboarding writes down.
 *
 * EACH ONE'S `version` IS HELD TO WHAT ITS PACK DECLARES by `test/usecase-versions.test.ts`, which fingerprints the
 * declarations and the settings of the document `useCaseDocument` builds below and refuses a word that moved with the
 * version left alone. It was written because nothing did: renaming the founder's thirty-day tile with `FOUNDER.version`
 * left at 1.3.2 kept all 182 tests in this package green, and the only thing holding that version up was a comment
 * arguing for it (`loop/research-batch-three-audit.md` finding 6). Raising a version there means giving the new one its
 * own entry in that file; rewording a label under a version nobody has released means appending a line that says which
 * change moved it, the way `test/pack-versions.test.ts` has asked of the first-party packs since `5ccb06ad`.
 */
export const USE_CASES: readonly UseCase[] = [checked(PERSONAL), checked(STUDENT), checked(FOUNDER), checked(TEAM), checked(GUIDE), checked(BUSINESS)];

export const useCase = (id: string): UseCase | undefined => USE_CASES.find((u) => u.usecase === id);

/**
 * The pack document a use case installs, with its voice as settings, or `null`. A day in an example row written
 * `+3d` is counted from `today` (`dates.ts`), so the example is due that week whenever the record is made.
 */
export const useCaseDocument = (id: string, today: string = dayOf(Date.now()), holds?: readonly string[]): Record<string, unknown> | null => {
  const u = useCase(id);
  const doc = u ? useCasePack(u) : null;
  if (!doc) return null;
  /* A LIST AN OLDER VERSION DECLARED IS KEPT FOR A RECORD THAT HOLDS IT, so an update leaves no row without its list. */
  const kept = (KEPT[u!.usecase] ?? []).filter((d) => holds?.includes(String(d.register)));
  if (kept.length > 0) doc.declarations = [...((doc.declarations as unknown[] | undefined) ?? []), ...kept];
  /* A SETTING OF THE USE CASE'S OWN beside its voice and labels, such as whether the guide starts the next milestone itself. */
  const own = SETTINGS[u!.usecase];
  if (own) doc.config = { ...((doc.config as Record<string, unknown> | undefined) ?? {}), ...own };
  return dated(doc, today);
};

/** The settings a use case's pack declares beside its voice and labels, by use case. */
const SETTINGS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = { guide: GUIDE_SETTINGS };

/** The lists each use case's older versions declared and its current one does not, by use case. */
const KEPT: Readonly<Record<string, readonly Record<string, unknown>[]>> = { team: [EARLIER_TICKETS] };

export type Span = { at: number; text: string };
export type Ranked = { usecase: UseCase; score: number; why: Span[] };
export type Arrangement = { pick: UseCase | null; ranked: Ranked[] };

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every place a use case's signals appear, longest signal first, never two over one stretch. */
const heard = (said: string, u: UseCase): Span[] => signalsIn(said, u.signals);

/**
 * Every place any of `signals` appears in what was said, as whole words, longest signal first, never two over one
 * stretch, in sentence order. The one reading of a signal, so the first run hears a pack's words exactly as the arranger
 * hears a use case's (`apps/web/src/lib/shape.ts`).
 */
export function signalsIn(said: string, signals: readonly string[]): Span[] {
  const lower = said.toLowerCase();
  const out: Span[] = [];
  for (const signal of [...signals].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
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
 * a tie to whichever heard more of the sentence, then catalogue order, and the first one proposed when
 * anything was heard at all.
 *
 * A TIE GOES TO THE LONGER THING SAID, because a long phrase is a specific one and a short word is one
 * any sentence uses. Catalogue order alone gave every one-to-one tie to Personal, and the Solo founder
 * card's own summary, "The organisations you run, the money across them, and the numbers your projects
 * report.", typed back, was Personal: "money" against "organisations" (`loop/research-first-sign-in.md`
 * §3, friction 3). Now it is 13 letters to 5 and Solo founder.
 *
 * NOT THE WORD HEARD FIRST, WHICH WAS TRIED. It fixed the summary and sent "I want to start an Etsy shop
 * and have no idea where to begin" to Small business, because "shop" comes before "where to begin"
 * (`apps/web/src/lib/shape.test.ts`). By length that is 14 to 4 and the guide, as it was. Catalogue order
 * still settles a tie of equal length, such as "my budget, my running and my uni coursework" (13 each,
 * Personal with Student beside it), and ranks everything nothing was heard for.
 */
export function arrange(said: string, catalogue: readonly UseCase[] = USE_CASES): Arrangement {
  const ranked = catalogue
    .map((usecase, i) => ({ usecase, why: heard(said, usecase), i }))
    .map(({ usecase, why, i }) => ({ usecase, score: why.length, why, i, said: why.reduce((n, w) => n + w.text.length, 0) }))
    .sort((a, b) => b.score - a.score || b.said - a.said || a.i - b.i)
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
  /* WHICHEVER WAY THE IDS SORT: onboarding writes the voice down (`declare` `voiceWrites`), so the use case proposed keeps
     the voice it promised with Personal beside Student as much as with Student beside Personal. */
  const ids = (u: UseCase): Set<string> =>
    new Set(((u.pack?.declarations ?? []) as Record<string, unknown>[]).flatMap((d) => [d.register, d.page, d.metric].filter((x): x is string => typeof x === 'string')));
  const taken = ids(proposed);
  const out: UseCase[] = [];
  for (const r of arranged.ranked) {
    const u = r.usecase;
    if (u === proposed || r.score === 0 || u.audience !== 'individual' || u.pack === null) continue;
    const mine = ids(u);
    if ([...mine].some((id) => taken.has(id))) continue;
    for (const id of mine) taken.add(id);
    out.push(u);
  }
  return out;
}

/** First-party packs in install order: every list a later one points at comes earlier. */
export const MODULE_ORDER = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'] as const;

/**
 * The packs to install for a use case: its own modules and any the sentence named, the first-party ones in install order
 * and then any other catalogue pack in the order it was named.
 *
 * A CATALOGUE PACK IS KEPT, since a use case may stand on any pack (`@braindog/declare` `MODULES`, shell.md USE-3). It
 * goes after the first-party ones because it may point at their lists and they never point at its.
 */
export function modulesFor(u: UseCase, named: readonly string[] = []): string[] {
  const wanted = new Set([...u.modules, ...named]);
  const first = new Set<string>(MODULE_ORDER);
  return [...MODULE_ORDER.filter((id) => wanted.has(id)), ...[...wanted].filter((id) => !first.has(id))];
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
