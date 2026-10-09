<!--
  The hub's rows: one list shape for automations, scheduled actions, scripts and runs.

  ROWS ON THE GROUND: `rows.css`'s ledger, a 56px row with a 32px icon well for what
  the thing is, its name, and under it what it is and where it stands; the right-hand column is its next turn or the
  time a run started. Nothing round the list, a hairline between its rows, and the rounded wash under the one pointed
  at. The caller puts it under a `Section` heading, grouped by kind or by day.

  ONE SHAPE FOR ALL FOUR because they sit one tab apart, and a failed script and a failed automation should not be two
  different reads.

  THE SECOND LINE IS NEVER CUT, and the " · " between what it is and the verdict is in its words, not drawn by the style,
  so a copy and a screen reader read the two apart. It is the verdict ("Paused. The key is not in the vault.") and an ellipsis took exactly
  the part that said what to do, so it wraps; the name gives way instead.

  A DOT FOR WHAT NEEDS A LOOK, AND ONLY THAT, leading the sentence that says it, so the dot never stands alone (a
  status is a 6px dot and its word). Red for a failure, amber for a pause, and a hollow ring for off.

  A ROW THE READER MAY TURN ON AND OFF ENDS IN A SWITCH (`toggle`), at the row's own edge so a column of them lines
  up. A switch cannot sit inside a link, so such a row is not one: its name is the link, and the link's hit box is
  stretched over the whole row (`.tap`, placed against the row), with the switch lifted over it. A press anywhere but
  the switch still opens the thing, and the switch is 44 under a thumb (`controls.css`).
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { HubRow } from './hub.ts';

  let {
    rows,
    dim = false,
    ontoggle,
    busy = null,
  }: {
    rows: readonly HubRow[];
    /** Draw the group quieter: the turned-off ones. */
    dim?: boolean;
    /** A row's switch was pressed: its key, and what it should now be. */
    ontoggle?: ((key: string, on: boolean) => void) | undefined;
    /** The key of the row whose switch is out to the record now; every switch waits while one is. */
    busy?: string | null;
  } = $props();
</script>

{#snippet body(r: HubRow, linked: boolean)}
  <IconWell name={r.icon ?? 'refresh'} size="l" />
  <span class="line-main">
    {#if linked && r.path}
      <a class="line-title name open tap" href={at(r.path)}>{r.name}</a>
    {:else}
      <span class="line-title name">{r.name}</span>
    {/if}
    <span class="line-detail meta">
      {#if r.what}<span class="what">{r.what}</span>{#if r.said}<span class="sep"> · </span>{/if}{/if}
      {#if r.said}<span class="said" data-dot={r.dot ?? undefined}>{r.said}</span>{/if}
    </span>
  </span>
  {#if r.aside}<span class="line-when aside" data-clock={r.clock ? '' : undefined}>{r.aside}</span>{/if}
{/snippet}

<ul class="ledger ledger-lead hub-rows" data-dim={dim ? '' : undefined}>
  {#each rows as r (r.key)}
    {@const t = r.toggle}
    <li>
      {#if t && ontoggle}
        <div class="row line line-tall switched" data-off={t.on ? undefined : ''}>
          {@render body(r, true)}
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={t.on}
            aria-label={t.label}
            disabled={busy !== null}
            onclick={() => ontoggle(r.key, !t.on)}><span class="switch-track"></span></button
          >
        </div>
      {:else if r.path}
        <a class="row tap line line-tall" href={at(r.path)}>{@render body(r, false)}</a>
      {:else}
        <div class="row line line-tall">{@render body(r, false)}</div>
      {/if}
      {#if r.fix}
        <a class="fix tap" href={at(r.fix.path)}>{r.fix.label}</a>
      {/if}
    </li>
  {/each}
</ul>

<style>
  /* THE LINK IS THE WHOLE ROW, and its words keep the ink they had rather than a link's. THE WELL, THE WORDS AND THE
     RIGHT-HAND COLUMN ON ONE LINE AT EVERY WIDTH: the shared card layout under 640 puts the words under the lead, and a
     hub row keeps its well beside both of its lines, as a search hit does. */
  .row {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    color: inherit;
    text-decoration: none;
  }

  .row .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .row .aside {
    grid-column: 3;
    grid-row: 1;
  }

  /* THE SECOND LINE WRAPS AND IS NEVER CLAMPED: what it is, then the verdict, with a dot before the verdict alone. The
     ledger's detail is one clipped line; here it is a sentence that has to be read to its end. */
  .meta {
    display: block;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  /* A ROW WITH A SWITCH: the same three columns and the switch as a fourth, at the row's own trailing edge. The row is
     as tall as any other, because the switch's 32px target fits inside the 56. */
  .switched {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
  }

  .switched .switch {
    grid-column: 4;
    grid-row: 1;
    z-index: var(--z-raise);
    /* THE TRACK ENDS ON THE ROW'S EDGE AT EVERY TARGET SIZE: under a thumb the button is 44 wide round a 36px track,
       and centred in it the track would sit four pixels inside the edge the rows above and below end on. */
    justify-items: end;
  }

  /* THE NAME IS THE LINK AND THE ROW IS ITS TARGET: static, so the hit box `.tap` draws is placed against the row
     (`rows.css` positions it), as Activity's rows do. The words keep the ink they had rather than a link's. */
  .open {
    position: static;
    color: inherit;
    text-decoration: none;
  }

  .open:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* OFF, AND STILL HERE: the name steps down to the second ink, as a turned-off add-on's does. Never red. */
  .switched[data-off] .name {
    color: var(--ink2);
  }

  .said[data-dot]::before {
    content: '';
    display: inline-block;
    box-sizing: border-box;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: 6px;
    border-radius: var(--r-pill);
    vertical-align: 0.1em;
  }

  .said[data-dot='bad']::before {
    background: var(--danger);
  }

  .said[data-dot='warn']::before {
    background: var(--warn);
  }

  /* OFF IS NOT A STATE THAT NEEDS ANYTHING, so it is a ring and not a fill, in the quiet ink. */
  .said[data-dot='off']::before {
    border: 1.5px solid var(--dim);
  }

  /* A TIME IN A FEED IS SET IN GEIST MONO; a next turn is words and keeps the UI face. */
  .aside[data-clock] {
    font-family: var(--font-id);
  }

  /* THE TURNED-OFF GROUP, QUIETER AND NOT RED: the name steps down to the second ink. */
  .hub-rows[data-dim] .line:not(.switched) .name {
    color: var(--ink2);
  }

  /* THE LINK THAT DOES WHAT THE SENTENCE ASKS, under the row and lined up with its words, not its well. */
  .fix {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    margin: 0 0 var(--sp-2) calc(var(--sp-3) + var(--well-l) + var(--sp-3));
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  @media (hover: hover) and (pointer: fine) {
    .fix:hover {
      text-decoration-color: currentColor;
    }

    /* A ROW THAT IS NOT ITSELF A LINK STILL TAKES THE WASH UNDER THE POINTER, and its hairlines step aside for it, as
       the shared rows' do. */
    .switched:hover {
      background: var(--hover-wash);
    }

    .hub-rows > li:has(> .switched:hover) > .line::after,
    .hub-rows > li:has(> .switched:hover) + li > .line::after {
      opacity: 0;
    }
  }

  @media (pointer: coarse) {
    .fix {
      min-block-size: var(--tap);
      margin-block-end: 0;
    }
  }
</style>
