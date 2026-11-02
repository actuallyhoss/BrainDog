<!--
  The machines and profiles agents run on, the Agents page's quiet foot (`panel: machines`): each machine by name, how
  many agents are at work on it and how many wait on him, and the Claude Code profiles its runs are under as chips; a
  machine he runs on with nothing open now says so. Each is said as a person says it (`machineSaid`), its own name kept
  for the hover. Where a run's machine was nowhere else on the page, it is here.

  FROM THE RECORD'S OWN READS, never a count of its own: who is at work and who waits is `presence`, as the Working tile
  and the page's line read it (`atWorkOf`, `waitingOf`), and the machines and profiles he has run on lately are the
  places `instructionList` offers the composer, read for the owner alone.

  QUIET ON PURPOSE: counts in the third ink, profiles as quiet chips, no press. A HOST PANEL loaded by `import()` from
  `BlockSlot.svelte` only; with no machine to name the tile is left out whole.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { listen } from '../listen.svelte.ts';
  import { NO_PLACES, atWorkOf, control, told, waitingOf, type LiveRun, type Places } from '$lib/record/instruct.ts';
  import { machinesOf } from './machines.ts';

  let { owner = false }: { owner?: boolean } = $props();

  const words = {
    profiles: 'Profiles',
    seats: (machine: string) => `Profiles on ${machine}`,
  } as const;

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let places = $state.raw<Places>(NO_PLACES);
  let read = $state(false);

  async function load(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), owner ? io.threads(1) : Promise.resolve(null)]);
    if (p.ok) rows = p.value;
    if (t?.ok) places = t.places ?? NO_PLACES;
    read = true;
  }

  onMount(() => {
    void load();
    return told.on(() => void load());
  });
  listen(load, () => false);

  const machines = $derived(machinesOf(atWorkOf(rows), waitingOf(rows), places));
</script>

{#if !read || machines.lines.length === 0}
  <!-- NOTHING TO NAME, OR NOT READ YET: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew nothing). -->
  <span data-seen-none hidden aria-busy={!read ? 'true' : undefined}></span>
{:else}
  <div class="machines">
    <!-- ONE CELL A MACHINE, ON ONE GRID: its name, its counts and its profiles each on a row the cells share, so names,
         counts and chips line up across the tile whatever each cell holds. -->
    <ul class="machine-list">
      {#each machines.lines as m (m.key)}
        <li class="machine" data-quiet={m.quiet ? '' : undefined}>
          <span class="machine-name" title={m.title ?? undefined}><Icon name="monitor" size="s" /><span class="machine-said">{m.name}</span></span>
          <span class="machine-n">{m.said}</span>
          {#if m.seats.length > 0}
            <ul class="chips" aria-label={words.seats(m.name)}>
              {#each m.seats as seat (seat)}<li class="chip" dir="auto" title={seat}>{seat}</li>{/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
    {#if machines.profiles.length > 0}
      <div class="profiles">
        <span class="profiles-head">{words.profiles}</span>
        <ul class="chips" aria-label={words.profiles}>
          {#each machines.profiles as seat (seat)}<li class="chip" dir="auto" title={seat}>{seat}</li>{/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .machines {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE CELLS SHARE THREE ROWS (subgrid): the name, the counts, the chips, so every cell's parts sit level. */
  .machine-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
    gap: var(--sp-3) var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .machine {
    display: grid;
    grid-row: span 3;
    grid-template-rows: subgrid;
    gap: var(--sp-1);
    min-inline-size: 0;
    color: var(--ink-3);
  }

  .machine-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: 22px;
  }

  .machine-name :global(svg) {
    flex: none;
    color: var(--ink-3);
  }

  .machine-said {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .machine[data-quiet] .machine-name {
    color: var(--ink-2);
    font-weight: var(--fw-regular, 400);
  }

  .machine-n {
    padding-inline-start: calc(var(--icon-s) + var(--sp-2));
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* A PROFILE IS A CHIP, as Settings › Agents draws one: the quiet fill, the control's radius, its name as it is spelt. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-content: start;
    gap: var(--sp-1);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .machine .chips {
    padding-inline-start: calc(var(--icon-s) + var(--sp-2));
  }

  /* ONE LINE A CHIP: a long profile name ends in an ellipsis, its whole name on the hover. */
  .chip {
    box-sizing: border-box;
    max-inline-size: 100%;
    padding-inline: var(--sp-2);
    overflow: hidden;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 24px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* EVERY PROFILE, ON ONE ROW UNDER A HAIRLINE: the word, then its chips. */
  .profiles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .profiles-head {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }
</style>
