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

  THE `lead` FORM DRAWS THE FIRST QUESTION WHOLE: what its agents recommend, why, and what accepting it changes, a line
  each (`does`), above its ways to answer. The rest are the cards they always were.

  ONLY THE FIRST CARD SAYS WHY UNDER EACH WAY TO ANSWER. Every other card is its question and its pills, and its reasons
  (the question's why and each option's because) sit in a `details` that starts shut (`queueReasoned`).

  A QUESTION CAN BE CHOSEN FOR AN ANSWER IN BULK ONLY WHERE THE HOST TAKES ONE. With `onselect` each card leads with a
  box named for its question; without it there is no box, and the markup is `toHTML`'s. Which are chosen is the host's
  to say in `selected` (by `rowKey`) where it holds that, and this card's own otherwise, dropped when the fence changes.
-->
<script lang="ts">
  import { QUEUE_RECOMMENDED, hrefFor, inline, queueMore, queuePlan, symbolText, text, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { QUEUE_DOES, QUEUE_REASONS, fileSrc, queueReasoned, queueSuggested, queueWays, type QueueShows } from '../src/queue.ts';
  import { CHOICE_KEYS, choiceOf, rowAt, rowKey } from '../src/cursor.ts';
  import Text from './Text.svelte';

  let {
    block,
    opts = {},
    onact,
    cursor,
    onrowfocus,
    onselect,
    selected,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put the answer: the question's row, and the id of the option pressed. */
    onact?: ((row: Row, option: string) => void) | undefined;
    /** Where the host hears a question chosen or let go for one answer in bulk. Its absence is what keeps the box away. */
    onselect?: ((row: Row, on: boolean) => void) | undefined;
    /** The keys (`rowKey`) of the questions the host holds as chosen, where it holds them rather than this card. */
    selected?: readonly string[] | undefined;
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

  /* THIS CARD'S OWN CHOICE, where the host holds none, belonging to one fence as `List`'s ticks do. */
  let mine = $state(new Set<string>());
  let drawn = $state('');
  $effect(() => {
    if (block.raw === drawn) return;
    drawn = block.raw;
    mine = new Set();
  });
  const isOn = (key: string): boolean => (selected ? selected.includes(key) : mine.has(key));
  function pick(row: Row, key: string) {
    const on = !isOn(key);
    if (!selected) {
      const next = new Set(mine);
      if (on) next.add(key);
      else next.delete(key);
      mine = next;
    }
    onselect?.(row, on);
  }

  const plan = $derived(queuePlan(block.rows));
  const tiles = $derived(block.form === 'tiles');
  const lead = $derived(block.form === 'lead');
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
  /** A file visual's address, only where the host gave one of its own (`fileSrc`). */
  const src = (shows: QueueShows): string | null => ('file' in shows ? fileSrc(opts.file?.(shows.file.row, shows.file.field)) : null);
</script>

{#snippet visual(shows: QueueShows | null)}{#if shows && 'swatch' in shows}<span class="queue-visual" data-shows="swatch" aria-hidden="true"
      >{#each shows.swatch as colour}<span class="queue-swatch" style="--swatch:{colour}"></span>{/each}</span
    >{:else if shows && 'figure' in shows}<span class="queue-visual" data-shows="figure"><span class="queue-figure num">{shows.figure}</span></span
    >{:else if shows && src(shows)}<span class="queue-visual" data-shows="file"><img class="queue-file" src={hrefFor(opts, src(shows)!)} alt="" /></span
    >{/if}{/snippet}

{#snippet options(item: (typeof plan.items)[number], reasoned: boolean)}
  {@const keyed = Boolean(onact) && cursor != null && cursor === keyOf(item.row)}
  <ul class="queue-options">
    {#each item.options as o, n}
      <li class="queue-option" data-recommended={o.recommended ? '' : undefined} data-choice={n < CHOICE_KEYS ? n + 1 : undefined}>
        {@render visual(o.shows)}
        {#if onact}
          <!-- The number key that answers sits inside the pill, so it takes no track of the three every option shares. -->
          <!-- THE RECOMMENDATION IS A MARK INSIDE ITS PILL, after the words, so it adds no line under the button;
               `kinds/queue.css` drops the stand-in dot once the word is inside. The space keeps "Paid Recommended"
               two words in the button's name, since an inline span adds none. -->
          <button type="button" class="queue-act" onclick={() => onact?.(item.row, o.key)}
            >{#if keyed && n < CHOICE_KEYS}<kbd class="queue-key" aria-hidden="true">{n + 1}</kbd>{/if}{o.label}{#if o.recommended}{' '}<span
                class="queue-rec">{QUEUE_RECOMMENDED}</span
              >{/if}</button
          >
        {:else}
          <span class="queue-label">{o.label}</span>
          {#if o.recommended}<span class="queue-rec">{QUEUE_RECOMMENDED}</span>{/if}
        {/if}
        {#if reasoned && o.because}<span class="queue-because" data-calm=""><Text nodes={nodes(o.because)} {opts} /></span>{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<!-- The band is a label and not an argument: after the ways to answer, at the end of the options row, as `html.ts`'s
     `queue`, because it says how careful an answer should be rather than being the card. On the by-line it floated
     alone in an empty band (visual review 4). `call` draws nothing: every question in the queue is the reader's call. -->
{#snippet cost(item: (typeof plan.items)[number])}{#if item.costLabel && item.cost !== 'call'}<span class="queue-cost" data-cost={item.cost}
      >{item.costLabel}</span
    >{/if}{/snippet}

{#if plan.items.length === 0}
  <p class="queue-empty">{plan.empty}</p>
{:else}
  <div class="queue" onfocusin={onrowfocus ? focused : undefined}>
    {#each plan.items as item, n}
      {@const whole = lead && n === 0}
      <!-- ONLY THE CARD A PERSON ANSWERS NEXT SAYS WHY EACH WAY, as `html.ts`'s `queue`: every other card is its question
           and its pills, its reasons in a fold that opens on demand (`queueReasoned`). -->
      {@const reasoned = tiles || queueReasoned(n)}
      {@const because = item.options.filter((o) => o.because)}
      {@const suggested = tiles || whole ? item.options.find((o) => o.recommended) : undefined}
      {@const key = keyOf(item.row)}
      {@const on = onselect ? isOn(key) : false}
      <article
        class={tiles ? 'queue-card queue-tile' : whole ? 'queue-card queue-lead' : 'queue-card'}
        data-intent={item.row.tone}
        data-row={key}
        data-focused={cursor === key ? '' : undefined}
        data-selected={on ? '' : undefined}
      >
        {#if onselect}
          <!-- The box `List` draws for a task, named for the question alone, so "Raise the retainer?, checkbox, not
               checked" is what a reader hears. The 44px hit area is the `tap` pseudo-element and costs no layout. -->
          <button
            type="button"
            role="checkbox"
            class="queue-select tap"
            aria-checked={on}
            aria-label={text(nodes(item.question)) || item.id}
            onclick={() => pick(item.row, key)}>{on ? '✓' : ''}</button
          >
        {/if}
        {#if suggested && tiles}{@render visual(suggested.shows)}{/if}
        <p class="queue-by">
          <span class="queue-who" data-calm=""><Text nodes={nodes(item.who)} {opts} /></span><span class="queue-when" data-calm=""
            ><Text nodes={nodes(item.when)} {opts} /></span
          >
        </p>
        <!-- A QUESTION IS A CARD'S HEADLINE, its money said short (`£39`, not `£39.00 GBP`), as the mirror says it. -->
        <h3 class="queue-question"><Text nodes={nodes(symbolText(item.question, true))} {opts} /></h3>
        {#if suggested}<p class="queue-suggested">{queueSuggested(suggested.label)}</p>{/if}
        {#if item.why && reasoned}<p class="queue-why"><Text nodes={nodes(item.why)} {opts} /></p>{/if}
        {#if whole && item.does.length}
          <ul class="queue-does" aria-label={QUEUE_DOES}>
            {#each item.does as line}<li class="queue-does-line"><Text nodes={nodes(line)} {opts} /></li>{/each}
          </ul>
        {/if}
        {#if tiles}
          <details class="queue-ways">
            <summary class="queue-ways-toggle">{queueWays(item.options.length)}</summary>
            {@render options(item, true)}
          </details>
          {@render cost(item)}
        {:else}
          {@render options(item, reasoned)}
          {@render cost(item)}
          {#if !reasoned && (because.length || item.why)}
            <details class="queue-ways queue-reasons">
              <summary class="queue-ways-toggle">{QUEUE_REASONS}</summary>
              {#if item.why}<p class="queue-why"><Text nodes={nodes(item.why)} {opts} /></p>{/if}
              {#if because.length}
                <ul class="queue-reasons-list">
                  {#each because as o}<li class="queue-reason"><span class="queue-reason-label">{o.label}</span> <Text nodes={nodes(o.because)} {opts} /></li>{/each}
                </ul>
              {/if}
            </details>
          {/if}
        {/if}
      </article>
    {/each}
    {#if plan.more > 0}
      {#if plan.moreHref}<a class="queue-more" href={hrefFor(opts, plan.moreHref)}>{queueMore(plan.more)}</a>{:else}<p class="queue-more">{queueMore(plan.more)}</p>{/if}
    {/if}
  </div>
{/if}
