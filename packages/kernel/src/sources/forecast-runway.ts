/**
 * `forecast.runway`: a cash walk, from what is liquid today through the legs the block names.
 *
 * A COMPUTED SOURCE IS A READING OVER SEVERAL LISTS rather than a query against one, and what it reads is DECLARED on
 * the block: a forecast that knew the word "obligations" would be a forecast that works for one record. It reads the
 * lists its legs walk and the list its opening figure counts, which `registersOf` names. Moved out of `pages.ts`, where
 * it was an arm written in place, with its answer unchanged (`sources/index.ts`).
 */

import type { Runway } from '../forecast.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

function forecastBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { openingOf, walkReach, recordedOf, latenessOf, sellsOf, pastIn, fxOf } = kit;
  const opened = openingOf(deps, block.opening);
  if (opened.refusal) return { ...base, refusals: also(opened.refusal) };
  /* THE WALK GOES PAST `horizon:` TO THE LENGTHS THE KNOB OFFERS, within two years and a day unless a reader asked
     for a longer one (`walkReach`), and opens on `horizon:`. A walk of `horizon:` days and no further let the renderer
     offer no length past it, so Money's Cash ahead opened on a whole year to keep the year in reach (visual review 4).
     Each walk says both (`opensOn`), and every reading of it below is over the whole walk. */
  const reach = walkReach(block, deps.walk);
  const opensOn = (w: Runway): Runway =>
    typeof block.horizon === 'number' && w.horizon > block.horizon ? { ...w, horizon: block.horizon, reach: w.horizon } : w;
  /* AN OPENING IN ONE CURRENCY THAT IS NOT THE HOME ONE IS A BOOK'S OWN: Harbour says USD, so its cash is read in dollars
     (`scopeCurrency` in `metrics.ts`), and its walk is asked for in dollars too, a bill in pounds converted into them.
     Walked in the home currency, a book's dollars were refused as "movements in EGP", or drawn beside an empty walk. */
  const home = deps.ctx.fx?.().home ?? null;
  const into = home !== null && !opened.parts && opened.unit !== null && opened.unit !== home ? opened.unit : undefined;
  /* MONEY IN SEVERAL CURRENCIES WITH NO RATE BETWEEN THEM IS ONE WALK A CURRENCY, never a sentence instead of a walk:
     each walks that currency's part of the opening through that currency's movements, and a crossing day is a day in
     one currency. A converted opening is walked as one, and a movement it cannot convert still says which rate. */
  if (Array.isArray(block.from) && (opened.parts || opened.value !== null)) {
    const whole = opened.parts ? null : deps.runway(opened.value!, block.from, reach, undefined, into);
    /* AN OPENING IN THE HOME CURRENCY AND A MOVEMENT WITH NO RATE INTO IT: the home walk draws everything it can convert,
       and each currency with no rate walks on its own beside it, from nothing, so no movement is left out. */
    const lacking =
      whole && home !== null && !opened.parts && (opened.unit === null || opened.unit === home) && whole.missing?.length
        ? [...new Set(whole.missing.map((pair) => pair.split(' to ')[0]!))].sort()
        : [];
    const apart =
      opened.parts !== undefined ||
      lacking.length > 0 ||
      /* A WALK ASKED FOR IN A BOOK'S CURRENCY THAT CAME BACK IN ANOTHER, from a host that walks in the home one only or
         for want of a rate, is one walk a currency, each as it is, and never a walk converted out of the book's. */
      (into !== undefined && whole !== null && whole.currency !== into) ||
      (whole !== null && !opened.converted && ((whole.mixed.length > 0 && whole.steps.length === 0) || (opened.unit !== null && whole.currency !== null && opened.unit !== whole.currency)));
    if (apart) {
      const moving = whole ?? deps.runway(0, block.from, reach);
      const currencies = [...new Set([...(opened.parts?.map((p) => p.currency) ?? (opened.unit ? [opened.unit] : [])), ...(moving?.mixed ?? []), ...(moving?.currency ? [moving.currency] : [])])]
        .filter((c) => /^[A-Z]{3}$/u.test(c))
        .sort();
      const homeWalk = lacking.length ? deps.runway(opened.value!, block.from, reach, { except: lacking }) : null;
      const walks = lacking.length
        ? [
            ...(homeWalk ? [{ ...homeWalk, currency: homeWalk.currency ?? home }] : []),
            ...lacking.flatMap((c) => {
              const one = deps.runway(0, block.from!, reach, c);
              return one ? [one] : [];
            }),
          ]
        : (() => {
            const each = currencies.flatMap((c) => {
              const from = opened.parts ? (opened.parts.find((p) => p.currency === c)?.amount ?? 0) : opened.unit === c ? opened.value! : 0;
              const one = deps.runway(from, block.from!, reach, c);
              return one ? [one] : [];
            });
            /* A CURRENCY NOTHING IS HELD IN AND NOTHING MOVES IN IS NO WALK: the home one a book's walk was converted
               into, beside the dollars the book keeps. Every walk is kept when every one is empty, as it was. */
            const held = each.filter((w) => w.from !== 0 || w.steps.length > 0);
            return held.length > 0 ? held : each;
          })();
      if (walks.length > 0) {
        const recorded = recordedOf(deps, block);
        if ('refusal' in recorded) return { ...base, refusals: also(recorded.refusal) };
        const late = latenessOf(deps, block);
        if ('refusal' in late) return { ...base, refusals: also(late.refusal) };
        /* A SELL FIGURE IS CHECKED HERE AND OFFERED BY WALK, in `walkSells` (`pages.ts`). The host draws each walk with
           the block's own keys spread over it (`charted` in `apps/web/src/lib/record/blocks.ts`), so one `sells` on
           this block would be written under the dollar walk and the pound walk alike, each time as that walk's money.
           The call below stays, since it is what refuses a bad `sell:`. */
        const sold = sellsOf(deps, block, null);
        if ('refusal' in sold) return { ...base, refusals: also(sold.refusal) };
        const missing = [...new Set([...(opened.missing ?? []), ...(moving?.missing ?? [])])].sort();
        return {
          ...base,
          /* EACH WALK'S REMEMBERED CASH IS THE FIGURE AS IT WAS WRITTEN DOWN IN THAT WALK'S CURRENCY, so a walk in pounds
             draws the days its opening figure was pounds, and no walk joins a line in another currency at today. */
          walks: walks.map(opensOn).map((w) => (recorded.past ? { ...w, past: pastIn(recorded.past, w.currency) } : w)),
          walkFx: { home, missing },
          ...fxOf(deps),
          ...late,
          matched: walks.reduce((n, w) => n + w.steps.length, 0),
          refusals: also(...walks.flatMap((w) => w.refusals)),
        };
      }
    }
  }
  if (opened.value === null || !Array.isArray(block.from))
    return {
      ...base,
      refusals: also({
        code: 'REQUIRED_MISSING',
        fix: 'A cash walk names what is liquid today (`opening:`) and the legs it reads (`from:`). A runway seeded from a balance nobody declared is a forecast that looks like a fact.',
        at: 'opening',
      }),
    };
  /* `NOT_IN_THIS_BUILD` RATHER THAN `UNIMPLEMENTED`, and the distinction below it is the one that
     matters to whoever wrote the block: `08 §2.6` and `06 §3` PUBLISH these computed sources, so a
     block naming one is a correct declaration against a build that has not caught up — a deploy
     away, not an edit away. `SOURCE_UNKNOWN` in the reader in `pages.ts` is the other answer,
     for a word no document publishes at all. Both said `UNIMPLEMENTED` once and a person could not
     tell "wait" from "you made this up". */
  const walk = deps.runway(opened.value, block.from, reach, undefined, into);
  if (!walk)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not compute a cash walk.', at: 'source' }) };
  /* A BALANCE IN ONE CURRENCY AND MOVEMENTS IN ANOTHER ARE NOT ONE WALK. */
  if (opened.unit !== null && walk.currency !== null && opened.unit !== walk.currency)
    return {
      ...base,
      refusals: also({
        code: 'MIXED_CURRENCY',
        fix: `The opening balance is in ${opened.unit} and the movements are in ${walk.currency}. A cash walk adds them, so they need one currency.`,
        at: 'opening',
      }),
    };
  const recorded = recordedOf(deps, block);
  if ('refusal' in recorded) return { ...base, refusals: also(recorded.refusal) };
  const late = latenessOf(deps, block);
  if ('refusal' in late) return { ...base, refusals: also(late.refusal) };
  /* A WALK WITH NO MOVEMENT HAS NO CURRENCY OF ITS OWN, and is then in the money its opening figure is. */
  const sold = sellsOf(deps, block, walk.currency ?? opened.unit);
  if ('refusal' in sold) return { ...base, refusals: also(sold.refusal) };
  return {
    ...base,
    walk: opensOn(walk),
    ...(recorded.past ? { past: pastIn(recorded.past, walk.currency) } : {}),
    ...fxOf(deps),
    ...late,
    ...sold,
    matched: walk.steps.length,
    refusals: also(...walk.refusals),
  };
}

export const forecastRunway: Source = { read: forecastBlock };
