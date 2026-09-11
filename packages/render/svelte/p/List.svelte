<!--
  `list` — title · detail · optional state marker. Kinds: `todo`, `steps`, `timeline`.

  `steps` is ordered, so it is an `<ol>`: numbered markers are appropriate here because the content
  actually is a sequence and the order carries information. `todo` and `timeline` are not.

  THE BOX ON A `todo` IS THE CONTROL IT LOOKS LIKE, WHERE THE HOST CAN ACT ON IT.

  It was `role="img"` on every surface, so ticking a task off cost four gestures and a screen
  change, from a screen already showing the task and a box drawn next to it: a 16 x 16 select box on
  a different route, a bulk action bar that shifted the table 63px, a menu and a value. Fifth of the
  ten things the friction pass measured as costing the most, and the only one of the ten whose
  shortest possible path was already drawn on the screen it was measured on.

  AND A PICTURE OF ONE WHERE IT CANNOT. `ontick` is the host saying it has somewhere to put the
  answer; with no callback the box is exactly what it was, an image with the state it shows as its
  name. That is `19 §6`'s rule, that a control which cannot act is absent rather than greyed out,
  and it is the same branch `Text` makes for a hole: a checkbox that does nothing when pressed is
  worse than a picture of one, because it also spends a tab stop and a promise.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions, type Row } from '../../src/index.ts';
  import { moveTick, nextTicks, tickState } from '../../src/ticks.ts';
  import Feed from '../Feed.svelte';
  import Text from '../Text.svelte';

  let {
    block,
    opts = {},
    ontick,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put the answer. Its absence is what keeps the box an image. */
    ontick?: ((row: Row, done: boolean) => void) | undefined;
  } = $props();

  /* THE STRINGS ARE LOCAL, because `packages/render` depends on nothing and the app's copy file is
     neither reachable from here nor allowed to be. Every other word this package draws is the
     author's; these two are the package's own, and they are the only two. */
  /** The mark a ticked row wears. Two words, past tense, and never a claim about a save. */
  const UNSAVED = 'Not saved';
  /** The accessible name of a box on a row whose title is empty. A control is never unnamed. */
  const TASK = 'Task';

  /**
   * This session's answers, held BY POSITION beside the document's rather than merged into it.
   *
   * A `todo` row has no key in the dialect, so a position is the only identity there is, and a
   * position is a fact about one document. See `../../src/ticks.ts` for the two rules this keeps.
   */
  let ticks = $state(new Map<number, boolean>());
  /** Roving tabindex: exactly one box is reachable by Tab, every other is -1. */
  let at = $state(0);
  /* The boxes themselves, so a key can move the focus it just moved the tabindex to. A plain array
     and not `$state`: nothing reads these during render. */
  let boxes: (HTMLButtonElement | null)[] = [];

  /**
   * THE LEDGER BELONGS TO ONE FENCE, and is dropped when that fence changes.
   *
   * Same shape, and the same reason, as the register list dropping its receipts when the question
   * changes: a mark held by position over rows that are now different rows is a mark about a screen
   * the reader is no longer looking at. It is also what makes a tick that the host DID write
   * disappear quietly, since the row comes back authored `[x]` and the document is the truth again.
   */
  let drawn = $state('');
  $effect(() => {
    if (block.raw === drawn) return;
    drawn = block.raw;
    ticks = new Map();
    at = 0;
  });

  function tick(i: number, row: Row) {
    const next = !tickState(row.done, ticks.get(i)).done;
    ticks = nextTicks(ticks, i, next, row.done === true);
    ontick?.(row, next);
  }

  /* Arrows, `Home` and `End`, and nothing else. Enter and Space are the button's own activation,
     which is the whole reason the box is a `<button>` and not a span with a handler on it: the
     platform's contract needs no keymap entry and cannot drift from one. */
  function key(e: KeyboardEvent, i: number) {
    const to = moveTick(i, e.key, block.rows.length);
    if (to === null) return;
    e.preventDefault();
    at = to;
    boxes[to]?.focus();
  }
</script>

<!-- `feed` is on this primitive and groups its rows, so it has a drawer of its own, as `cards` does on `grid`. -->
{#if block.kind === 'feed'}
<Feed {block} {opts} />
{:else}
<svelte:element this={block.kind === 'steps' ? 'ol' : 'ul'} class="list" data-kind={block.kind}>
  {#each block.rows as row, i}
    {#if block.kind === 'todo'}
      {@const state = tickState(row.done, ticks.get(i))}
      <li class="item">
        {#if ontick}
          <!-- `role="checkbox"` and not a bare button: what it does is set a state, not run a verb,
               and `aria-checked` is the only way a screen reader is told which state it is in
               before pressing it. The NAME is the task, because "not done" was the name of the
               image and a control named after its own state is a control that reads as
               "not done, checkbox, not checked" and never says what it is about.

               `tap` is the invisible 44px hit box. The drawn box is 17px, which is a target this
               product's own floor refuses, and the friction pass counted 46 of 85 controls under
               24px on the register screen. It costs no layout: the hit area is a pseudo-element. -->
          <button
            type="button"
            role="checkbox"
            class="item-marker tap"
            aria-checked={state.done}
            aria-label={text(inline(row.cells[0] ?? '', opts)) || TASK}
            data-done={state.done ? 'yes' : 'no'}
            tabindex={i === at ? 0 : -1}
            bind:this={boxes[i]}
            onclick={() => tick(i, row)}
            onkeydown={(e) => key(e, i)}>{state.done ? '✓' : ''}</button
          >
        {:else}
          <span class="item-marker" data-done={row.done ? 'yes' : 'no'} role="img" aria-label={row.done ? 'done' : 'not done'}
            >{row.done ? '✓' : ''}</span
          >
        {/if}
        <span class="item-title"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
        <!-- THE ROW STAYS, WEARING WHAT HAPPENED TO IT, AND THE WAY BACK IS THE BOX.
             Thirteen of eighty-five human writes in the record this product is modelled on reversed
             the write immediately before them, twelve of those inside five seconds, because the row
             vanished and the only way to check you had hit the right one was to do the opposite and
             look. Nothing here removes or reorders a ticked row. No confirmation dialog either, on
             purpose: it asks before anything has happened, when the reader knows the least they ever
             will, and the answer is always yes.

             AND IT SAYS NOTHING WAS WRITTEN. The data layer behind this is a synchronous mock over a
             seed, so the mark wears `warn` and the words in the same spirit as the register list's
             receipt chip. The state slot has been in this primitive's header since it was written
             and `todo` had never used it, so this costs no track and no rule. -->
        {#if state.unsaved}
          <span class="item-state" data-intent="warn">
            <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
            {UNSAVED}
          </span>
        {/if}
      </li>
    {:else if block.kind === 'timeline'}
      <li class="item" data-intent={row.tone}>
        <!-- The date cell goes through the inline renderer like every other cell. It did not, and a
             timeline written with `{{ago:…}}` — which is how you write one that stays true — printed
             its own source. -->
        <span class="item-marker num"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <!-- The glyph sits with the TITLE, not at the far edge of the row. A tone belongs to the
             thing it qualifies, and five hundred pixels away it belongs to nothing — the same
             finding the stat cell's layout is built on (13 §2.3). -->
        <span class="item-title">
          <Text nodes={inline(row.cells[1] ?? '', opts)} {opts} />
          {#if row.tone}
            <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
          {/if}
        </span>
        <span class="item-detail"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      </li>
    {:else}
      <li class="item">
        <span class="item-title"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
        <span class="item-state"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      </li>
    {/if}
  {/each}
</svelte:element>
{/if}
