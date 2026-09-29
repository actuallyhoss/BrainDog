<!--
  The list's figures, above its rows: at most two tiles side by side, each with its chart and the one line saying what
  the chart means (SYSTEM §6, §7). No tile holds a number without a chart, and no chart goes without its reading.

  "BY STATE" is how the list divides, one stacked bar of its rows counted by state: the open states in the greys with
  the first in ink, the finished one in `--earn`, and none in red. THE NUMBER is the list's number column added up,
  the figure, and where that number sits: split by state when the list has one, else its largest rows.

  ONLY OVER THE WHOLE LIST, which is the page's to know (`whole`): a total of the rows in hand, printed as the list's,
  is a false count. "By state" also goes while the list is filtered, where it would only restate the filter. Neither
  is drawn below 900px, where the rows themselves come first.
-->
<script lang="ts">
  import { labelOf } from '$lib/record/api.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { valueSaid } from '$lib/voice.ts';
  import Bars from '$lib/viz/Bars.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import { byStateOf, figureOf, figureSaid, figureSplit, stateReading } from './list.ts';

  let {
    decl,
    entries,
    now,
    byState,
    titleOf,
  }: {
    decl: RegisterDecl;
    /** The rows the figures are over: the whole list, with nothing typed or archived on this screen in it. */
    entries: readonly Entry[];
    now: number;
    /** Whether "By state" may be drawn: the list is whole and unfiltered. */
    byState: boolean;
    /** A row's title as the list says it, for the largest rows. */
    titleOf: (e: Entry) => string;
  } = $props();

  /* This part's own words. */
  const words = {
    byState: 'By state',
    parts: (subject: string, said: string[]) => `${subject}: ${said.join(', ')}`,
  } as const;

  const stateField = $derived(decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined);
  /** A state's own label, as the pills and the lanes say it. */
  const stateLabel = (value: string): string => (stateField ? valueSaid(stateField, value) : value);
  /** A label inside a count, "3 chased": its first letter lowered only where the rest of the word is lower case. */
  const inCount = (label: string): string => (/^[A-Z][a-z]/u.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

  const states = $derived(byState ? byStateOf(decl, entries) : null);
  const stateParts = $derived.by(() => {
    if (!states) return [];
    const earned = decl.done?.[0];
    return states
      .filter((p) => p.count > 0)
      .map((p) => ({ label: `${p.count} ${inCount(stateLabel(p.value))}`, value: p.count, tone: p.value === earned ? 'earn' : undefined }));
  });

  const fig = $derived(figureOf(decl, entries));
  const split = $derived(fig ? figureSplit(decl, fig, entries, stateLabel, titleOf) : null);
  const bars = $derived.by(() => {
    if (!split) return [];
    const top = Math.max(...split.items.map((i) => i.value));
    let marked = false;
    return split.items.map((i) => {
      const lead = !marked && i.value === top;
      if (lead) marked = true;
      return { ...i, tone: lead ? 'ink' : undefined };
    });
  });
</script>

{#if stateParts.length > 0 || (fig && split)}
  <div class="summary" data-two={stateParts.length > 0 && fig && split ? '' : undefined}>
    {#if states && stateParts.length > 0}
      <Tile icon="board" title={words.byState} count={entries.length}>
        <Stacked parts={stateParts} summary={words.parts(decl.name, stateParts.map((p) => p.label))} />
        <p class="reading">{stateReading(decl, states, entries, now, stateLabel)}</p>
      </Tile>
    {/if}
    {#if fig && split}
      <Tile icon={fig.field.type === 'money' ? 'money' : 'observe'} title={labelOf(fig.field)}>
        <p class="figure num">
          {#if fig.currency}<Money minor={fig.total} currency={fig.currency} />{:else}{figureSaid(fig, fig.total)}{/if}
        </p>
        <Bars items={bars} subject={labelOf(fig.field)} format={(n) => figureSaid(fig, n)} />
        <p class="reading">{split.reading}</p>
      </Tile>
    {/if}
  </div>
{/if}

<style>
  /* SIDE BY SIDE WHILE BOTH FIT, 12 apart (SYSTEM §4), and one tile takes the whole width. */
  .summary {
    display: grid;
    gap: var(--sp-3);
  }

  .summary[data-two] {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  }

  /* `t-figure`: 30/34 at 600 and −0.02em (SYSTEM §3). */
  .figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-figure);
    font-weight: 600;
    line-height: calc(34 / 30);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE WRITTEN LINE under the chart, in the body size. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* THE ROWS COME FIRST ON A PHONE (SYSTEM §9): the list is what the screen is for. */
  @media (width < 900px) {
    .summary {
      display: none;
    }
  }
</style>
