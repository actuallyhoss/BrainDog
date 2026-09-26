<!--
  The changelog, and it opens with the state of the product.

  14 §5 calls this "the single highest-leverage community artefact for a solo product: proof of
  life". Proof of life is only proof if it is true, so the first thing on the page is the status.

  IT SAID "NOTHING HAS SHIPPED YET" FOR SIX DAYS AFTER SOMETHING DID. The app has been deployed from
  this repository on every push since 2026-09-08, from two hostnames, and the newest entry under that
  sentence was dated 2026-09-03. A changelog that is stale is worse than no changelog: the artefact
  whose entire job is to prove the thing is alive was the best evidence on the site that it was not.

  Entries are the repository's own, dated, in its own words, and drawn from its commit subjects,
  which are already written as release notes.

  THE TITLE IS THE ENTRY AND THE BODY IS THE EVIDENCE, at most three sentences of it. Measured on
  the built page, this page was 4,458 words against 389 for the home page and 131 for pricing: 87
  per cent of every word on brain.dog, all 75 of its sentences over 25 words, and a Flesch-Kincaid
  grade of 10.2. A stranger who opens a changelog is skimming for what shipped, and thirty-eight
  paragraphs averaging 103 words, the longest of them 238, is the wall of text he has rejected
  twice. The bodies now carry the number that was measured and stop: 1,893 words on the page, 36
  words to a body, a grade of 6.4, and no sentence over 25 words. Nothing was deleted from the
  history. Every entry, every date and every kind is still here.

  WHERE THE CUT WORDS WENT. Each body kept the fact and dropped the argument for it, because the
  argument is in the design documents and in the commit, where somebody who wants it will look. A
  reversal's earlier answer is one of those: worth a paragraph in a design document, not worth a
  paragraph on a page whose job is proof of life.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link
  to one would be a 404 with a promise attached.

  THE NUMBERS IN THE PARAGRAPH ABOVE WERE TAKEN BEFORE THE FIVE MISSING DAYS WERE WRITTEN. Counted
  again on the built page on 2026-09-21, after nineteen entries were added: 3,135 words against
  1,893, and 39 words to a body against 36, with no sentence over 25 words. The reading grade is
  deliberately not restated. The 6.4 above came from a tool this pass does not have, and a second
  figure from a different syllable counter would not be comparable to it, which is worse than
  leaving the first one standing as the record of what was measured when.

  AND THE ENTRIES HAVE LEFT THIS FILE, which is the only structural change since. They are
  `./entries.ts`, each one naming the commits it is drawn from, because while they were literals in
  a component the only thing that could tell whether this page was still true was a person opening
  it, and that is precisely the check that failed for six days. `../../../scripts/changelog.mjs`
  holds them against `git log` now: the dates are derived from the commits rather than typed, a day
  the repository committed on and this page says nothing about is a finding, and so is a body over
  three sentences. The rule deciding which commits earn an entry is written at the top of
  `entries.ts`, where somebody arguing with it can find it. That pass added 31 entries on days that
  already existed and made the page LONGER, which is a deliberate reversal of the cut recorded
  above: four of the seventeen days were carrying one entry each against 90, 90, 44 and 25 commits,
  and a page a stranger can skim through is worth less than nothing if what he skims under-reports
  the week.

  WHAT THAT COST, COUNTED ON THE ENTRIES THEMSELVES AND NOT ON THE BUILT PAGE. This pass did not
  build the site, and a figure measured a different way would not be comparable to the 3,135 above,
  which is the reason the reading grade is left alone one paragraph up. Titles and bodies together:
  4,327 words over 88 entries against 2,864 over 57. The bodies did not grow to get there, which is
  the part worth measuring rather than asserting: 37.5 words to a body against 38.9, and the longest
  body added is 43 words where the longest already on the page is 51. All 57 earlier entries are
  still here by title and none of them was edited to make room.
-->
<script lang="ts">
  import type { Hue } from '$lib/icons.ts';
  import { site } from '$lib/copy.ts';
  import { ENTRIES, type Entry } from './entries.ts';

  const LABEL = { shipped: 'shipped', changed: 'changed', fixed: 'fixed' } as const;

  /* The word is the meaning and the hue agrees with it: green for new work, blue for a repair, amber
     for a change of course. Three kinds and three hues, so the colour a reader learns from the first
     two is never contradicted by a grey third. */
  const HUE: Record<Entry['kind'], Hue> = { shipped: 'earn', fixed: 'info', changed: 'warn' };

  /**
   * GROUPED BY DAY, because twenty-two identical rows are not a list a person reads.
   *
   * Every entry carried its own date in its own 14ch gutter, and six of them say 2026-09-10. So
   * the column that exists to tell you WHEN was printing the same string six times in a row down
   * the left edge, and the page had no unit larger than one paragraph: no way to see that a day
   * happened, no way to skim to a day, nothing between the heading and the whole log.
   *
   * The entries arrive in date order from `entries.ts` and this preserves that order exactly
   * rather than sorting: the order is editorial, most-important-first inside a day, and a sort by
   * date would silently reshuffle it. That the dates descend is check 5 of `changelog.mjs`, so a
   * day reopened after it ended is a finding rather than a second heading nobody notices.
   */
  const DAYS: { date: string; entries: Entry[] }[] = [];
  for (const entry of ENTRIES) {
    const last = DAYS.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else DAYS.push({ date: entry.date, entries: [entry] });
  }

  /** How many of each kind, counted from `entries.ts` so the numbers cannot drift from it. */
  const KINDS = ['shipped', 'fixed', 'changed'] as const;
  const COUNT: Record<Entry['kind'], number> = { shipped: 0, changed: 0, fixed: 0 };
  for (const entry of ENTRIES) COUNT[entry.kind] += 1;
</script>

<svelte:head>
  <!-- ITS OWN SENTENCE, in copy.ts. The description was STATUS.body at 522 characters, which a
       search result and a shared card both cut mid-paragraph. -->
  <title>{site.meta.changelog.title}</title>
  <meta name="description" content={site.meta.changelog.description} />
  <link rel="canonical" href="https://brain.dog/changelog" />
  <meta property="og:url" content="https://brain.dog/changelog" />
  <meta property="og:title" content={site.meta.changelog.title} />
  <meta property="og:description" content={site.meta.changelog.description} />
</svelte:head>

<!-- THE HEAD GETS ITS OWN GROUND, which is the same move the home and pricing pages make and for
     the same measured reason: with one surface for the whole document, nothing tells a reader
     where the standing state of the product stops and the history starts. Here the split is
     already in the content (one block about now, then eighteen days about the past), so it costs
     one attribute. -->
<section class="band" data-ground="sunk">
  <div class="head">
    <h1 class="title">{site.changelog.title}</h1>
  <p class="lede">{site.changelog.lede}</p>
  <!-- THE COUNTS ARE COUNTED, from the list below, so they cannot drift from it. -->
  <p class="counts">
    <span class="count-all">{site.changelog.count(ENTRIES.length, DAYS.length)}</span>
    {#each KINDS as kind}
      <span class="kind" data-hue={HUE[kind]}><span class="dot"></span>{COUNT[kind]} {LABEL[kind]}</span>
    {/each}
  </p>

</div>
</section>

<div class="band" data-ground="page">
  <div class="log">
    {#each DAYS as day}
    <section class="day">
      <!-- A machine-readable date beside a human one, as a heading, because it is what the entries
           under it belong to, and it holds its place while they scroll past. -->
      <h2 class="day-date"><time class="num" datetime={day.date}>{day.date}</time></h2>
      <ol class="entries">
        {#each day.entries as entry}
          <li class="entry" data-hue={HUE[entry.kind]}>
            <h3 class="entry-title">
              <span class="kind" data-hue={HUE[entry.kind]}><span class="dot"></span>{LABEL[entry.kind]}</span>{entry.title}
            </h3>
            <p class="entry-body">{entry.body}</p>
          </li>
        {/each}
      </ol>
    </section>
    {/each}
  </div>
</div>

<style>
  .head,
  .log {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  /* The band pays for the air above and below; the column inside it pays for nothing. It was
     `clamp(56px, 7vw, 104px)` on the head alone, which put the standing state of the product a
     third of a screen further down than the home page's first band. */
  .band {
    padding-block: var(--sp-8);
  }

  /* The seam, as on the other two pages. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .title {
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .lede {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: clamp(17px, 0.4vw + 15px, 20px);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
  }

  .count-all {
    margin-inline-end: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .log {
    padding-block-end: var(--sp-8);
  }

  .day {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .day-date {
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
    align-self: start;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  /* A RAIL DOWN THE DAY, and a quiet mark on it for each entry, so a day reads as a short run of
     things that happened rather than a stack of paragraphs. The kind's colour is on its label. */
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin: 0;
    padding-inline: var(--sp-5) 0;
    border-inline-start: 1px solid var(--line);
    list-style: none;
  }

  .entry {
    position: relative;
  }

  .entry::before {
    content: '';
    position: absolute;
    inset-block-start: 0.6em;
    inset-inline-start: calc(var(--sp-5) * -1 - 3px);
    inline-size: 6px;
    block-size: 6px;
    /* THE KIND'S HUE ON THE RAIL, AND NOT A SECOND DOT BESIDE THE WORD. An entry drew a grey mark
       on the rail and a coloured dot sixty pixels right of it on the same line: two dots for one
       entry. The word still carries the kind for a reader who does not see the colour. */
    background: var(--hue);
    border-radius: var(--r-pill);
    box-shadow: 0 0 0 3px var(--bg);
  }

  .entry .dot {
    display: none;
  }

  /* A label on the title's own line: the word is in the ink and the hue is only a dot, so the kind
     reads the same to somebody who does not see green. */
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0;
    vertical-align: 0.1em;
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-pill);
  }

  .entry-title {
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  .entry-body {
    max-inline-size: 74ch;
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .day {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
      padding-block: var(--sp-5);
    }

    /* Not sticky on a phone: a pinned date on a 390px screen is a line of reading area spent on a
       string the reader can scroll back four inches to find. */
    .day-date {
      position: static;
    }
  }

  @media (width < 640px) {
    .head,
    .log {
      padding-inline: var(--sp-4);
    }

    .lede {
      font-size: var(--t-md);
    }

    .entries {
      padding-inline-start: var(--sp-4);
    }

    .entry::before {
      inset-inline-start: calc(var(--sp-4) * -1 - 3px);
    }
  }
</style>
