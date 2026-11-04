<!--
  The record being made, after the press: "watch the record build". The same tiles the build was
  drawn in before the press, each now saying where it is: "Making", "Made", or, where the record refused it, "Not made"
  and the record's own sentence for why.

  NOTHING HERE IS GUESSED. `states` is read from the record: what add-ons it holds while `setup` runs, and the call's own
  answer once it comes back (`makingStates` in `building.ts`). The page that mounts this reads the record every 400 ms
  (`watchHeld`) and hands the reading down; this component only draws it. Both /start and sign-up mount it, with the
  same two props.

  NO COUNT, NO BAR, NO "N OF M", and no part that is off: a tile says its own state and that is all there is to say.
  A refusal is the deeper red with the words "Not made" beside it, never the colour alone.

  FLAT TILES ON THE BOARD: opaque, no border, no shadow, radius 16. One column on a phone, as many as fit on a wide
  screen, the full width of the frame.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { making as words, type Making, type MakingPart } from './building.ts';

  let {
    parts,
    states,
  }: {
    /** The parts that are on, in the order they were heard (`stepsOf`). */
    parts: readonly MakingPart[];
    /** Each part's state by its id (`makingStates`). A part with none yet is being made. */
    states: Readonly<Record<string, Making>>;
  } = $props();

  const stateOf = (id: string): Making => states[id] ?? 'making';
  /** The record has answered, and refused a part: nothing is still being made, and one tile at least says why not. */
  const part = $derived(parts.some((p) => typeof stateOf(p.id) === 'object') && !parts.some((p) => stateOf(p.id) === 'making'));

  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  onMount(() => {
    void tick().then(() => heading?.focus());
  });
</script>

<section class="making" aria-labelledby="making-h">
  <header class="head">
    <h1 class="name" id="making-h" tabindex="-1" bind:this={heading}>{part ? words.partTitle : words.title}</h1>
    <p class="making-line">{part ? words.partLine : words.line}</p>
  </header>
  <!-- READ ALOUD AS EACH TILE CHANGES, one tile at a time: a tile is whole to a screen reader, its name and its state. -->
  <ul class="tiles" aria-live="polite">
    {#each parts as p (p.id)}
      {@const s = stateOf(p.id)}
      {@const refused = typeof s === 'object'}
      <li class="tile" data-forming="part" data-part={p.id} data-state={refused ? 'refused' : s} aria-atomic="true">
        <div class="tile-head">
          <IconWell name={p.icon} tone={refused ? 'danger' : 'ink'} />
          <span class="tile-name">{p.name}</span>
          <span class="state">
            {#if s === 'making'}<span class="dot" aria-hidden="true"></span>{/if}
            {refused ? words.notMade : s === 'made' ? words.made : words.making}
          </span>
        </div>
        {#if refused}
          <p class="why">{s.refused}</p>
        {:else if p.why && p.why.length > 0}
          <p class="heard"><q>{p.why[0]}</q></p>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .making {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .head {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .name {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-page);
    font-weight: 600;
    line-height: var(--lead-page);
  }

  .name:focus {
    /* focus-ok: the heading takes focus only by script (tabindex -1) as the screen arrives, so a reader is told where
       it is; nobody tabs to it, and a ring round the title would read as a control. */
    outline: none;
  }

  .making-line {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(24px * var(--type, 1));
  }

  /* AS MANY TILES AS FIT, each at least a phone's width of words: one column at 390, three or four at 1440. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: calc(20px * var(--dense, 1));
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .tile-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    min-block-size: var(--well);
  }

  .tile-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .tile[data-state='made'] .state {
    color: var(--ink);
    font-weight: 500;
  }

  .tile[data-state='refused'] .state {
    color: var(--red);
    font-weight: 600;
  }

  .dot {
    inline-size: var(--dot);
    block-size: var(--dot);
    flex: none;
    border-radius: var(--r-ctl);
    background: var(--live);
  }

  .why,
  .heard {
    margin: 0;
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .why {
    color: var(--ink);
  }

  .heard {
    color: var(--ink-2);
  }
</style>
