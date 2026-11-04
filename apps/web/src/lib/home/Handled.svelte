<!--
  What BrainDog did by itself today (today F6): a few lines of what it did without asking, when, the reason
  under each, and an Undo on each that puts that whole batch back.

  A PLACE, NOT A QUESTION. These already happened, with a mark; the only press here takes one back. On Needs you it is
  the strip under the questions (`head="strip"`), one line a thing.

  UNDO IS A WORD, NOT A ROW OF GREY BUTTONS: 13/500 in the accent's words, a thumb's height to press. A LINE PUT BACK
  STAYS where it was, struck through in the quiet ink and saying so ("Put back just now"), so the press is seen to have
  done something and nothing jumps; no toast says it again.

  "N MORE" OPENS THE REST IN PLACE, and the focus goes to the first line it opened. What the record itself held back past
  its own limit is said as "and 9 more", opening the full record of what BrainDog did (`/audit?by=braindog`).

  A LINE ABOUT WHAT AN AGENT FINISHED of what he told it (`toldHandled`) puts back what that run changed (Undo all over
  its receipts, `undoAll`), and has no Undo where it changed nothing in BrainDog.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import { undoDecision } from '$lib/record/undo-write.ts';
  import { undoAll } from '$lib/record/instruct.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { HANDLED_SHOWN, HANDLED_WORDS, type Handled } from './handled.ts';

  let {
    found,
    heading,
    head = 'tile',
  }: {
    found: Handled;
    /** The name where it is not Today's ("Handled" on Needs you). */
    heading?: string;
    /** `column`: a column's head over the tile as Money's and Quick's are. `strip`: Needs you's strip under its questions,
     *  the head in the tile and each thing one line (what, why after it, Undo at the end) where there is room. */
    head?: 'tile' | 'column' | 'strip';
  } = $props();

  const words = {
    putBack: 'Put back just now',
    more: (n: number) => `and ${n.toLocaleString('en-GB')} more`,
  } as const;

  /* THE DECISIONS PUT BACK FROM HERE: their lines stay, struck through, until the next read leaves them out. */
  let undone = $state.raw<ReadonlySet<string>>(new Set());
  let busy = $state<string | null>(null);
  let fix = $state('');
  let open = $state(false);
  let list = $state<HTMLUListElement | null>(null);

  const lines = $derived(open ? found.rows : found.rows.slice(0, HANDLED_SHOWN));
  const opens = $derived(found.rows.length - lines.length);
  const count = $derived(found.rows.length + found.more);
  const name = $derived(heading ?? HANDLED_WORDS.heading);

  /** The hour it happened, on the reader's clock: "08:10". */
  const clock = (iso: string | null): string => {
    if (!iso) return '';
    const t = new Date(iso);
    return Number.isFinite(t.getTime()) ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
  };

  /** "N more": the rest opens where it is, and the focus goes to the first line that opened, not to the page. */
  async function more() {
    const from = lines.length;
    open = true;
    await tick();
    list?.querySelectorAll<HTMLButtonElement>('[data-handled-undo]')[from]?.focus();
  }

  async function undo(decision: string) {
    if (busy !== null) return;
    busy = decision;
    fix = '';
    try {
      const receipts = found.rows.find((r) => r.decision === decision)?.told;
      if (receipts) {
        fix = await undoAll(apiBase(), receipts);
        undone = new Set([...undone, decision]);
        void reread();
        return;
      }
      const out = await undoDecision(apiBase(), decision);
      if (out.from === 'undone') {
        undone = new Set([...undone, decision]);
        void reread();
      } else fix = out.fix;
    } finally {
      busy = null;
    }
  }
</script>

{#if found.rows.length > 0}
  <section class="handled" aria-labelledby="handled-h" data-handled data-head={head}>
    <header class="h-head">
      <IconWell name="check" size="m" />
      <h2 class="h-title" id="handled-h">{name}<span class="h-count num">{count}</span></h2>
    </header>
    <div class="h-body">
      <ul class="h-list" bind:this={list}>
        {#each lines as row (row.decision)}
          {@const back = undone.has(row.decision)}
          <li class="h-line" data-undone={back ? '' : undefined}>
            <span class="h-at num">{clock(row.at)}</span>
            <span class="h-text">
              <span class="h-what" dir="auto" data-own>{row.line}</span>
              {#if back}<span class="h-why">{words.putBack}</span>{:else if row.why}<span class="h-why" dir="auto" data-own>{row.why}</span>{/if}
            </span>
            {#if !back && !row.withdrawn && (row.told === undefined || (row.told?.changes ?? 0) > 0)}
              <button type="button" class="h-undo tap" disabled={busy !== null} aria-busy={busy === row.decision} data-handled-undo onclick={() => void undo(row.decision)}
                >{HANDLED_WORDS.undo}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if fix}<p class="h-fix" role="status">{fix}</p>{/if}
      {#if opens > 0}
        <button type="button" class="h-open tap" data-handled-more onclick={() => void more()}>{HANDLED_WORDS.open(opens)}</button>
      {/if}
      {#if found.more > 0}<a class="h-rest tap" href={at('/audit?by=braindog')}>{words.more(found.more)}</a>{/if}
    </div>
  </section>
{/if}

<style>
  .handled {
    grid-column: 1 / -1;
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  /* ON NEEDS YOU THE HEAD STANDS OVER THE TILE, level with Money's and Quick's, and the lines are the tile. */
  .handled[data-head='column'] {
    padding: 0;
    background: none;
    border-radius: 0;
  }

  .handled[data-head='column'] > .h-body {
    padding: var(--sp-2) var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  /* NEEDS YOU'S STRIP (T16): one tile across the page, its head in it, one line a thing: the time, what, why after it in
     the quiet ink, and Undo at the end. Where the row is narrow the why goes under, as in a column. */
  .handled[data-head='strip'] {
    container-type: inline-size;
    gap: var(--sp-2);
    padding-block: var(--sp-4) var(--sp-2);
  }

  @container (inline-size >= 640px) {
    .handled[data-head='strip'] .h-line {
      align-items: baseline;
      padding: var(--sp-2) 0;
    }

    .handled[data-head='strip'] .h-text {
      flex-direction: row;
      align-items: baseline;
      gap: var(--sp-2);
    }

    .handled[data-head='strip'] .h-what {
      flex: none;
      max-inline-size: 60%;
    }

    .handled[data-head='strip'] .h-why {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow-wrap: normal;
    }
  }

  .h-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 28px;
  }

  .h-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 1.3;
  }

  .h-count {
    color: var(--ink-3);
    font-weight: 500;
  }

  .h-body {
    display: grid;
    min-inline-size: 0;
  }

  .h-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .h-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  /* THE TIME, WHAT, AND UNDO AT THE END. */
  .h-line {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--sp-3);
    padding: var(--sp-3) 0;
  }

  .h-at {
    padding-block-start: 2px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  .h-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .h-what {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
    transition: color var(--d-swap) var(--ease-out);
  }

  .h-why {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .h-line[data-undone] .h-what {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  .h-undo {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    margin-block: calc(-11px * var(--dense, 1));
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    /* INK, NOT RED (colour lane, 2 Nov): Undo is a quiet control, not something late or failing. */
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .h-undo:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    .h-undo:hover:not(:disabled) {
      background: var(--hover);
    }
  }

  .h-fix {
    margin: 0 0 var(--sp-2);
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* "N MORE", a quiet press under the lines: the second ink, a tap tall, no fill until the pointer is on it. */
  .h-open,
  .h-rest {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    margin-inline-start: calc(var(--sp-2) * -1);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .h-open:hover,
    .h-rest:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .h-what {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .handled {
      border: 1px solid CanvasText;
    }
  }
</style>
