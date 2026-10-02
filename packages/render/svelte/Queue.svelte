<!--
  `queue` — what is waiting on a person: one card per question, who opened it, why, and the ways to
  answer it (`src/queue.ts`). Drawn to the same tree as `html.ts`'s `queue`; `src/parity.test.ts`
  compiles this file and compares the two.

  AND THE COUNT OF WHAT IS LEFT IS A DOOR WHERE THE EVALUATOR GAVE IT ONE, drawn as words where it did
  not. "5 more" with nowhere to press tells a reader there is more and then strands them; the address
  comes from the `more` row rather than from here, because a renderer that knew `/decide` would be a
  renderer with a route in it.

  THE OPTIONS ARE BUTTONS ONLY WHERE THE HOST CAN ACT ON THEM. With no `onact` they are the words
  themselves, which is the same branch `List` makes for a checkbox and `Text` makes for a hole: a
  control that cannot act is absent rather than greyed out (`19 §6`). A read-only queue is still worth
  drawing, because knowing what is waiting is most of what the block is for.

  NOTHING IS PRE-CHOSEN. The recommended option carries a word beside it and nothing else: no focus,
  no pressed state, no first position it did not already have. A question that arrives with its answer
  already picked is a question that gets pressed through.

  AN OPTION'S VISUAL IS ITS OWN BOX, and the `tiles` form leads each card with its recommended option's
  one, the ways to answer folded under it in a `details` that starts shut. A swatch is the one colour
  from the record this package writes, into `--swatch` on a chip inside that box and nowhere else
  (`05 §5`); `queue.ts` checked it is six hex digits before it got here.

  A NUMBER KEY ANSWERS. Each option carries `data-choice`, 1 to 9, and `choose(i)` answers the question under the host's
  cursor (or the first) with option `i`, so a host binds 1-9 without reaching into the markup. The key is drawn as a cap
  beside each option of that one question only, and only where the host walks a cursor and can act: a hint for a key
  that does nothing is noise, and on every card at once it is a chip cloud.
-->
<script lang="ts">
  import { QUEUE_RECOMMENDED, hrefFor, inline, queueMore, queuePlan, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { fileSrc, queueSuggested, queueWays, type QueueShows } from '../src/queue.ts';
  import { CHOICE_KEYS, choiceOf, rowAt, rowKey } from '../src/cursor.ts';
  import Text from './Text.svelte';

  let {
    block,
    opts = {},
    onact,
    cursor,
    onrowfocus,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put the answer: the question's row, and the id of the option pressed. */
    onact?: ((row: Row, option: string) => void) | undefined;
    /** The key of the question the host's cursor is on (`rowKey`), drawn `data-focused`. */
    cursor?: string | null | undefined;
    /** Where the host hears that focus moved into a question, with its key and row. */
    onrowfocus?: ((key: string, row: Row) => void) | undefined;
  } = $props();

  const keyOf = (row: Row): string => rowKey(row, block.rows.indexOf(row));

  /**
   * ANSWER WITH OPTION `i` (0 is the first, which the key `1` presses) the question under `key`, or under the host's
   * cursor, or the first where the host names none. False where the host cannot act or there is no such option.
   */
  export function choose(i: number, key: string | null = cursor ?? null): boolean {
    const chosen = onact ? choiceOf(block.rows, plan.items, i, key) : null;
    if (!chosen) return false;
    onact?.(chosen.row, chosen.option.key);
    return true;
  }

  function focused(e: FocusEvent) {
    const key = (e.target as Element | null)?.closest?.('[data-row]')?.getAttribute('data-row');
    const row = key == null ? undefined : rowAt(block.rows, key);
    if (key != null && row) onrowfocus?.(key, row);
  }

  const plan = $derived(queuePlan(block.rows));
  const tiles = $derived(block.form === 'tiles');
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
  /** A file visual's address, only where the host gave one of its own (`fileSrc`). */
  const src = (shows: QueueShows): string | null => ('file' in shows ? fileSrc(opts.file?.(shows.file.row, shows.file.field)) : null);
</script>

{#snippet visual(shows: QueueShows | null)}{#if shows && 'swatch' in shows}<span class="queue-visual" data-shows="swatch" aria-hidden="true"
      >{#each shows.swatch as colour}<span class="queue-swatch" style="--swatch:{colour}"></span>{/each}</span
    >{:else if shows && 'figure' in shows}<span class="queue-visual" data-shows="figure"><span class="queue-figure num">{shows.figure}</span></span
    >{:else if shows && src(shows)}<span class="queue-visual" data-shows="file"><img class="queue-file" src={hrefFor(opts, src(shows)!)} alt="" /></span
    >{/if}{/snippet}

{#snippet options(item: (typeof plan.items)[number])}
  {@const keyed = Boolean(onact) && cursor != null && cursor === keyOf(item.row)}
  <ul class="queue-options">
    {#each item.options as o, n}
      <li class="queue-option" data-recommended={o.recommended ? '' : undefined} data-choice={n < CHOICE_KEYS ? n + 1 : undefined}>
        {@render visual(o.shows)}
        {#if onact}
          <!-- The number key that answers sits inside the pill, so it takes no track of the three every option shares. -->
          <button type="button" class="queue-act" onclick={() => onact?.(item.row, o.key)}
            >{#if keyed && n < CHOICE_KEYS}<kbd class="queue-key" aria-hidden="true">{n + 1}</kbd>{/if}{o.label}</button
          >
        {:else}
          <span class="queue-label">{o.label}</span>
        {/if}
        {#if o.recommended}<span class="queue-rec">{QUEUE_RECOMMENDED}</span>{/if}
        {#if o.because}<span class="queue-because" data-calm=""><Text nodes={nodes(o.because)} {opts} /></span>{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if plan.items.length === 0}
  <p class="queue-empty">{plan.empty}</p>
{:else}
  <div class="queue" onfocusin={onrowfocus ? focused : undefined}>
    {#each plan.items as item}
      {@const suggested = tiles ? item.options.find((o) => o.recommended) : undefined}
      {@const key = keyOf(item.row)}
      <article class={tiles ? 'queue-card queue-tile' : 'queue-card'} data-intent={item.row.tone} data-row={key} data-focused={cursor === key ? '' : undefined}>
        {#if suggested}{@render visual(suggested.shows)}{/if}
        <!-- The band is a label and not an argument: last on the by-line, in the same register as who
             asked and when, because it answers "why is this card here" rather than being the card. -->
        <p class="queue-by">
          <span class="queue-who" data-calm=""><Text nodes={nodes(item.who)} {opts} /></span><span class="queue-when" data-calm=""
            ><Text nodes={nodes(item.when)} {opts} /></span
          >{#if item.costLabel}<span class="queue-cost" data-cost={item.cost}>{item.costLabel}</span>{/if}
        </p>
        <h3 class="queue-question"><Text nodes={nodes(item.question)} {opts} /></h3>
        {#if suggested}<p class="queue-suggested">{queueSuggested(suggested.label)}</p>{/if}
        {#if item.why}<p class="queue-why"><Text nodes={nodes(item.why)} {opts} /></p>{/if}
        {#if tiles}
          <details class="queue-ways">
            <summary class="queue-ways-toggle">{queueWays(item.options.length)}</summary>
            {@render options(item)}
          </details>
        {:else}
          {@render options(item)}
        {/if}
      </article>
    {/each}
    {#if plan.more > 0}
      {#if plan.moreHref}<a class="queue-more" href={hrefFor(opts, plan.moreHref)}>{queueMore(plan.more)}</a>{:else}<p class="queue-more">{queueMore(plan.more)}</p>{/if}
    {/if}
  </div>
{/if}
