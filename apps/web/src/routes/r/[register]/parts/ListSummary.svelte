<!--
  The list's figures, above its rows: ONE TILE (DIRECTION 39), the list's number on the left with the line that says
  what it means, and on the right where it sits, one line per state (or per largest row) with its count, its share of
  the number and a thin bar of that share. No tile holds a number without its reading.

  BY STATE IS HOW THE LIST DIVIDES, read from the declaration: each state that holds rows, in the list's own order, its
  bar in the accent while it is still to do and grey once it is finished (DIRECTION 39), so the part that asks for
  something reads first. THE NUMBER is the list's number column added up; on a list with no state its largest rows
  share it out instead. A list with neither has no tile.

  A FIGURE IS DRAWN ONLY WHEN IT SAYS SOMETHING (DIRECTION 39). The number needs three rows that hold one before it is a
  figure of the list rather than two day rates added together, and the lines need two parts before they compare
  anything; with less, the tile is the number and its line.

  ONLY OVER THE WHOLE LIST, which is the page's to know (`whole`): a total of the rows in hand, printed as the list's,
  is a false count. The split by state also goes while the list is filtered, where it would only restate the filter.
  Not drawn below 900px, where the rows themselves come first.
-->
<script lang="ts">
  import { labelOf } from '$lib/record/api.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { valueSaid } from '$lib/voice.ts';
  import { byStateOf, figureOf, figureSaid, figureSplit, stateReading, standOf, type Stand } from './list.ts';

  let {
    decl,
    entries,
    now,
    byState,
    headSaid = false,
    titleOf,
  }: {
    decl: RegisterDecl;
    /** The rows the figures are over: the whole list, with nothing typed or archived on this screen in it. */
    entries: readonly Entry[];
    now: number;
    /** Whether the split by state may be drawn: the list is whole and unfiltered. */
    byState: boolean;
    /** Whether the sentence under the list's title is drawn, which already says what is open and what is late. */
    headSaid?: boolean;
    /** A row's title as the list says it, for the largest rows. */
    titleOf: (e: Entry) => string;
  } = $props();

  /* This part's own words. */
  const words = {
    byState: 'By state',
    largest: 'Largest',
    share: (n: number) => `${n}%`,
  } as const;

  const stateField = $derived(decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined);
  /** A state's own label, as the filters and the lanes say it. */
  const stateLabel = (value: string): string => (stateField ? valueSaid(stateField, value) : value);
  const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  const states = $derived(byState ? byStateOf(decl, entries) : null);
  /* THREE ROWS HOLDING A VALUE BEFORE THE NUMBER IS THE LIST'S: two contractors' day rates added up is not a figure. */
  const fig = $derived.by(() => {
    const f = figureOf(decl, entries);
    return f && f.seen >= 3 ? f : null;
  });
  const split = $derived(fig && !states ? figureSplit(decl, fig, entries, stateLabel, titleOf) : null);

  type Line = { key: string; label: string; count: number | null; value: number | null; stand: Stand | null; tint: boolean };

  /**
   * THE LINES ON THE RIGHT: each state that holds rows, with its count and, where the list has a number, that state's
   * part of it; else the number's largest rows. A share is of the number where there is one, else of the rows.
   */
  const lines = $derived.by((): Line[] => {
    if (states) {
      return states
        .filter((p) => p.count > 0)
        .map((p) => {
          const held = entries.filter((e) => String(e.fields[decl.state!] ?? '') === p.value);
          return {
            key: p.value,
            label: sentenceCase(stateLabel(p.value)),
            count: p.count,
            value: fig ? held.reduce((n, e) => n + (fig.valueOf(e) ?? 0), 0) : null,
            stand: standOf(decl, p.value, false),
            tint: false,
          };
        })
        /* THE FIRST PART STILL TO DO IN THE ACCENT, the others in its tint, so two open states are told apart. */
        .map((l, at, all) => ({ ...l, tint: l.stand === 'open' && all.findIndex((x) => x.stand === 'open') !== at }));
    }
    return (split?.items ?? []).map((i, at) => ({ key: `${at}`, label: i.label, count: null, value: i.value, stand: null, tint: at > 0 }));
  });
  const whole = $derived(fig ? fig.total : lines.reduce((n, l) => n + (l.count ?? 0), 0));
  const shareOf = (l: Line): number => (whole > 0 ? ((fig ? l.value : l.count) ?? 0) / whole : 0);

  const reading = $derived(
    [states ? stateReading(decl, states, entries, now, stateLabel, headSaid) : null, split?.reading ?? null].filter(Boolean).join(' '),
  );
  const lead = $derived(fig !== null || reading !== '');
  const shown = $derived(lines.length >= 2 || fig !== null);
</script>

{#if shown}
  <Tile
    class="list-figures"
    icon={fig ? (fig.field.type === 'money' ? 'money' : 'observe') : 'board'}
    title={fig ? labelOf(fig.field) : words.byState}
    count={fig ? undefined : entries.length}
  >
    <div class="sum" data-split={lead && lines.length >= 2 ? '' : undefined}>
      <!-- THE LEFT HALF: the number and its line, or on a list with no number, the line alone at the headline's size.
           Where the head already said the line and there is no number, there is no left half, and the lines take the
           tile rather than leaving a third of it empty. -->
      {#if lead}
        <div class="sum-lead">
          {#if fig}
            <p class="figure num">
              {#if fig.currency}<Money minor={fig.total} currency={fig.currency} />{:else}{figureSaid(fig, fig.total)}{/if}
            </p>
          {/if}
          {#if reading}<p class="reading" data-alone={fig ? undefined : ''}>{reading}</p>{/if}
        </div>
      {/if}
      {#if lines.length >= 2}
        <ul class="sum-lines" aria-label={states ? words.byState : words.largest}>
          {#each lines as l (l.key)}
            {@const share = shareOf(l)}
            <li class="sum-line" data-stand={l.stand ?? undefined} data-tint={l.tint ? '' : undefined}>
              <span class="sum-name">{#if l.stand}<span class="sum-dot" aria-hidden="true"></span>{/if}<span class="sum-label" dir="auto">{l.label}</span></span>
              <span class="sum-count num">{l.count ?? ''}</span>
              <span class="sum-value num">
                {#if fig && l.value !== null}{#if fig.currency}<Money minor={l.value} currency={fig.currency} />{:else}{figureSaid(fig, l.value)}{/if}{:else}{words.share(Math.round(share * 100))}{/if}
              </span>
              <span class="sum-bar" aria-hidden="true"><span class="sum-fill" style:inline-size="{Math.max(share * 100, share > 0 ? 1.5 : 0)}%"></span></span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </Tile>
{/if}

<style>
  /* THE NUMBER AND ITS LINE ON THE LEFT, THE PARTS ON THE RIGHT, and on a narrow tile one under the other. */
  .sum {
    display: grid;
    gap: var(--sp-4) var(--sp-7);
    align-items: start;
  }

  .sum[data-split] {
    grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
  }

  .sum-lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE TILE'S FIGURE, 22 AT 600 (DIRECTION 39): read beside its heading, not shouted over it. */
  .figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: var(--lh-figure);
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE WRITTEN LINE, in the body size and the second ink, and at the headline's size where it stands alone. */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .reading[data-alone] {
    color: var(--ink);
    font-size: var(--fs-head);
    line-height: var(--lh-head);
  }

  /**
   * ONE LINE PER PART, ON ONE GRID: the name with its state's dot, the count, the figure right-aligned in tabular
   * figures, and the bar of its share taking what is left. The lines share their columns (`subgrid`), so the counts and
   * the figures stand in columns down the tile.
   */
  .sum-lines {
    display: grid;
    grid-template-columns: minmax(0, max-content) max-content max-content minmax(64px, 1fr);
    column-gap: var(--sp-4);
    row-gap: var(--sp-2);
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sum-line {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    min-block-size: 24px;
  }

  .sum-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .sum-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sum-dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    background: var(--status-working);
    border-radius: var(--r-round);
  }

  .sum-line[data-stand='done'] .sum-dot {
    background: var(--status-done);
  }

  .sum-count {
    color: var(--dim);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .sum-value {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  /* THE SHARE, A THIN BAR ON ITS TRACK: the accent for the first part still to do, its tint for the next, grey once
     done. */
  .sum-bar {
    display: block;
    block-size: 8px;
    overflow: hidden;
    background: var(--chart-track);
    border-radius: var(--r-round);
  }

  .sum-fill {
    display: block;
    block-size: 100%;
    background: var(--chart-1);
    border-radius: inherit;
    transition: inline-size var(--d-recompose) var(--ease-standard);
  }

  .sum-line[data-tint] .sum-fill {
    background: var(--chart-2);
  }

  .sum-line[data-stand='done'] .sum-fill {
    background: var(--chart-other);
  }

  @media (prefers-reduced-motion: reduce) {
    .sum-fill {
      transition: none;
    }
  }

  @media (width < 1100px) {
    .sum[data-split] {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE ROWS COME FIRST ON A PHONE: the list is what the screen is for. */
  @media (width < 900px) {
    :global(section.tile.list-figures) {
      display: none;
    }
  }
</style>
