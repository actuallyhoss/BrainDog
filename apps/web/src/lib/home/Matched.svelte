<!--
  Matched for you, as one line at the foot of the board (as `page/Changed.svelte` is for what the rules
  changed): "3 people matched for you this week", and Review, which opens who they were under the line, inside the
  same tile.

  A MATCH THE RECORD MADE ON ITS OWN WAS ONE COUNT ON ONE PAGE. Nothing listed who was matched to whom, so a wrong one
  could not be found or read. Each line here is the record's own: who was matched, into whom, and why in one sentence.

  A WRONG ONE IS PUT BACK FROM ITS OWN LINE. Each match the record can split carries Undo. A press changes nothing: it
  shows the record's plan in one sentence of names ("Puts back Teodor Vance and T. Vance as two people.") with Put back
  and Keep. Put back takes the line away at once, says who came back, and asks the record who is matched now.

  NO UNDO WHERE THE RECORD CANNOT GIVE TWO BACK. The plan is asked when the list opens, never when Home loads, and a
  match whose plan gives nobody back (an older record, a reader who is not the owner) is listed with no button.

  NOTHING IS DRAWN FOR NOBODY: not a heading, not an empty state. Five are listed and the rest are counted.

  Review, Undo, Put back and Keep are rectangles, 40 tall with the 44 hit box under a thumb (`ui/Button.svelte`). Undo
  is the quiet weight, never the accent: it opens a question, and Put back is the one that acts.
-->
<script lang="ts">
  import { since } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { undoWords } from '$lib/record/undo-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { matchedLine, matchedShown, putBack, readMatched, undoMatch, type MatchPlan, type MatchedRow } from './matched.ts';

  let { rows, now = Date.now() }: { rows: readonly MatchedRow[]; now?: number } = $props();

  const words = {
    review: 'Review',
    hide: 'Hide',
    undo: 'Undo',
    putBack: 'Put back',
    keep: 'Keep',
    more: (n: number) => (n === 1 ? 'And one more before these.' : `And ${String(n)} more before these.`),
  } as const;

  /* WHO IS MATCHED NOW: the record's answer after a put back, and Home's own before one. A match put back is gone from
     the line and the list at once, by its batch, since the record puts a batch back whole. */
  let fresh = $state.raw<readonly MatchedRow[] | null>(null);
  let gone = $state.raw<ReadonlySet<string>>(new Set());
  const live = $derived((fresh ?? rows).filter((r) => !gone.has(r.batch)));

  const line = $derived(matchedLine(live, now));
  const list = $derived(matchedShown(live));
  let open = $state(false);

  /* ── Undo ──────────────────────────────────────────────────────────────── */

  /* THE PLAN OF EACH MATCH LISTED, by its batch, and only the ones the record can put back. `asked` is who was asked
     already, so a draw never asks twice. */
  let plans = $state.raw<ReadonlyMap<string, MatchPlan>>(new Map());
  const asked = new Set<string>();
  /** The batch whose plan is on screen with Put back and Keep, or `null`. */
  let asking = $state<string | null>(null);
  let busy = $state(false);

  async function ask(row: MatchedRow) {
    const { batch } = row;
    const plan = await undoMatch(apiBase(), row);
    const next = new Map(plans);
    if (plan) next.set(batch, plan);
    else next.delete(batch);
    plans = next;
    if (!plan && asking === batch) asking = null;
  }

  /* ASKED WHEN THE LIST OPENS, for the five it lists, and for one that comes into view when another is put back. */
  $effect(() => {
    if (!open) return;
    for (const row of list.shown) {
      if (row.batch === '' || asked.has(row.batch)) continue;
      asked.add(row.batch);
      void ask(row);
    }
  });

  async function back(row: MatchedRow) {
    const read = plans.get(row.batch);
    if (!read || busy) return;
    busy = true;
    try {
      const out = await putBack(apiBase(), row, read.plan);
      if (out.from === 'again') {
        /* IT MOVED BETWEEN THE READ AND THE PRESS: nothing was put back, and the plan is read again where it stands. */
        toasts.push(undoWords.moved, { intent: 'warn' });
        await ask(row);
        return;
      }
      asking = null;
      if (out.from === 'refused') return void toasts.push(out.fix, { intent: 'warn' });
      gone = new Set([...gone, row.batch]);
      toasts.push(out.said, { intent: 'good' });
      /* AND THE RECORD IS ASKED AGAIN, so the count and the five are its own and not this screen's sum. */
      const again = await readMatched(apiBase());
      fresh = again.value;
    } finally {
      busy = false;
    }
  }
</script>

{#if line}
  <section class="matched" aria-labelledby="matched-h" data-matched>
    <div class="m-head">
      <IconWell name="history" />
      <h2 class="m-said" id="matched-h">{line}</h2>
      <Button size="sm" aria-expanded={open} aria-controls="matched-list" onclick={() => (open = !open)}>{open ? words.hide : words.review}</Button>
    </div>
    <div id="matched-list" hidden={!open}>
      {#if open}
        <ul class="m-list">
          {#each list.shown as row (row.key)}
            {@const plan = plans.get(row.batch)}
            <li class="m-row">
              <div class="m-main">
                <div class="m-text">
                  <p class="m-line" dir="auto">{row.line}</p>
                  {#if row.evidence || row.when}
                    <p class="m-why">
                      {#if row.evidence}<span dir="auto">{row.evidence}</span>{/if}
                      {#if row.when}<time datetime={row.when}>{since(row.when, now)}</time>{/if}
                    </p>
                  {/if}
                </div>
                {#if plan && asking !== row.batch}
                  <Button size="sm" aria-label="{words.undo}: {row.line}" data-matched-undo onclick={() => (asking = row.batch)}>{words.undo}</Button>
                {/if}
              </div>
              {#if plan && asking === row.batch}
                <div class="m-ask" role="group" aria-label="{words.undo}: {row.line}">
                  <p class="m-sure" role="status" dir="auto">{plan.say}</p>
                  <div class="m-do">
                    <Button size="sm" onclick={() => (asking = null)}>{words.keep}</Button>
                    <Button size="sm" weight="primary" disabled={busy} onclick={() => void back(row)}>{words.putBack}</Button>
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        {#if list.more > 0}<p class="m-more">{words.more(list.more)}</p>{/if}
      {/if}
    </div>
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .matched {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .m-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .m-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .m-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .m-row {
    padding-block: var(--sp-3);
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .m-row + .m-row {
    border-block-start: 1px solid var(--rule);
  }

  .m-row:last-child {
    padding-block-end: 0;
  }

  /* THE WORDS AND THEIR UNDO ON ONE LINE, the button at the end; it drops under the words where they need the width. */
  .m-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
  }

  .m-text {
    flex: 1 1 16rem;
    min-inline-size: 0;
  }

  /* THE PLAN AND ITS TWO ANSWERS: beside the sentence where there is room, and under it on a phone (390). */
  .m-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
    margin-block-start: var(--sp-2);
  }

  .m-sure {
    flex: 1 1 16rem;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .m-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .m-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .m-why {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-3);
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .m-more {
    margin: var(--sp-3) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  @media (forced-colors: active) {
    .matched {
      border: 1px solid CanvasText;
    }
  }
</style>
