<!--
  One part of the BrainDog being built, as its tile: what it is, why it is on, what the person's own words put in it, and
  the switch that keeps it.

  EVERY LINE IS THE PROPOSAL'S. The meta says why the part is on: a phrase asked for it, a use case stands on it, the
  person turned it on, or it waits on the question beside it (the one red here, because it needs him). "You said" quotes
  the phrases. The rows are the entries the sentence filled, which are what "Make it mine" writes; the line under them is
  what the part's lists are called, read off the part itself.

  A PURE LIST TILE, NO FIGURE: nothing here is a number the record holds yet, so there is no chart to draw.

  THE SWITCH STAYS IN ONE PLACE. The screen draws a tile while a part is on and a ground row while it is off, and puts
  focus back on the switch after a press (`data-keep`), so a keyboard is never dropped at the top of the page.
-->
<script lang="ts">
  import Face from '$lib/ui/Face.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { firstRun } from '$lib/first-run.ts';
  import { words, type Part } from './building.ts';

  let {
    part,
    live = false,
    busy = false,
    arrived = false,
    fresh = new Set<string>(),
    locale,
    onflip,
  }: {
    part: Part;
    /** While the sentence is still being typed: no switch yet, since nothing has been read. */
    live?: boolean;
    busy?: boolean;
    /** Turned on by the last thing said, which tints it for a moment. */
    arrived?: boolean;
    /** Entries the last thing said added, by key. */
    fresh?: ReadonlySet<string>;
    locale: string;
    onflip?: ((id: string) => void) | undefined;
  } = $props();

  const meta = $derived(
    part.state === 'waiting' ? words.waiting : part.state === 'held' && part.held ? firstRun.keepNeeded(part.held) : part.state === 'hand' ? words.byHand : part.why.length > 0 ? words.fromWords : '',
  );

  /** "1 Oct", in the person's own order of day and month. */
  function day(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
    } catch {
      return iso;
    }
  }
</script>

{#snippet toggle()}
  {#if !live}
    <button
      type="button"
      class="switch"
      role="switch"
      data-keep={part.id}
      aria-checked={part.on}
      aria-label={firstRun.keepSwitch(part.name)}
      aria-describedby="keep-{part.id}"
      disabled={part.held !== null || busy}
      onclick={() => onflip?.(part.id)}><span class="switch-track"></span></button
    >
  {/if}
{/snippet}

{#if part.on}
  <Tile icon={part.icon} title={part.name} count={part.entries.length > 0 ? part.entries.length : undefined} data-arrived={arrived ? '' : undefined} data-part={part.id}>
    {#snippet actions()}
      {#if meta}<span class="part-meta" data-needs={part.state === 'waiting' ? '' : undefined}>{meta}</span>{/if}
      {@render toggle()}
    {/snippet}
    <!-- NO "YOU SAID" LINE (UI pass 1 Nov): "from your words" at the card's head says it, and the phrase itself is beside
         it twice already, in what was heard and on the build panel; three cards each said it again. -->
    {#if part.entries.length > 0}
      <ul class="entries" aria-label={firstRun.mineEntries}>
        {#each part.entries as e (e.key)}
          <li class="entry" data-arrived={fresh.has(e.key) ? '' : undefined}>
            {#if e.kind === 'project'}
              <Face name={e.title} of="project" size="s" />
            {:else if e.kind === 'person'}
              <Face name={e.title} kind="person" size="s" />
            {:else}
              <IconWell name="obligation" size="m" />
            {/if}
            <span class="entry-main">
              <span class="entry-title">{e.title}</span>
              <span class="entry-detail">{e.detail}{#if e.due}, {words.due(day(e.due))}{/if}</span>
            </span>
            {#if e.amount}<span class="entry-amount num"><Money minor={e.amount.minor} currency={e.amount.currency} home={e.amount.currency} /></span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="part-reading" id="keep-{part.id}">{part.blurb}{#if part.lists.length > 1}{' '}{words.keeps(part.lists)}{/if}</p>
  </Tile>
{:else}
  <div class="keep" data-part={part.id}>
    <IconWell name={part.icon} size="m" />
    <span class="keep-main">
      <span class="keep-name">{part.name}</span>
      <span class="keep-blurb" id="keep-{part.id}">{part.blurb}</span>
    </span>
    {@render toggle()}
  </div>
{/if}

<style>
  .part-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .part-meta[data-needs] {
    color: var(--red);
    font-weight: 500;
  }

  .entries {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW INSIDE THE TILE: 44 tall, a face or a well, the name and one detail, and the amount at the right. A row that
     the last thing said added takes the arrival tint, which fades over a second and a half. */
  .entry {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    margin-inline: calc(-1 * var(--sp-2));
    padding-inline: var(--sp-2);
    border-radius: var(--r-pop);
    transition: background-color 1500ms var(--ease-out);
  }

  .entry[data-arrived] {
    background: var(--arrived);
    transition: none;
  }

  .entry + .entry {
    border-block-start: 1px solid var(--rule);
  }

  .entry-main {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .entry-title {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .entry-amount {
    flex: none;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .part-reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* A PART THAT IS OFF IS A ROW ON THE GROUND, not a tile: it holds nothing yet. Its switch sits beside its words,
     never across the screen from them. */
  .keep {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--rule);
  }

  .keep-main {
    display: grid;
    min-inline-size: 0;
  }

  .keep-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  .keep-blurb {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
