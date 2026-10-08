<!--
  `steps path`: the stones in the list's order, each marked done, next or later, and the count of the open steps the
  short view left out (`src/path.ts`). `path` in `src/html.ts` is this file's twin, and `src/dynamic-forms.test.ts`
  and `src/parity.test.ts` compile both and hold them to one tree.

  THE LIST'S OWN CLASSES, THE MARK AN ATTRIBUTE. A host that styles `steps` already draws a path as a numbered list,
  and the connecting line, the muted done stones and the marked next one are rules on `data-mark`, never a colour
  here. The next stone says "Next" in words because finding it without reading every row is what the form is for.

  A SHORT VIEW, WHERE THE PATH HAS ONE (`pathShort`), IS DRAWN FIRST: its stones, and how many more there are for when
  there is room. The switch to every stone is this component's alone, two buttons whose pressed state says which view
  is on, because it is state in a component and `toHTML` has none; everything else is the tree `toHTML` draws.

  A STONE IS A TOGGLE ONLY WHERE THE HOST CAN WRITE IT. With `onpath`, each stone's marker is a 44px box named for its
  step, which hands the host the row and the state it now shows, and wears "Not saved" until the host redraws the path
  with it, as a ticked `todo` does (`src/ticks.ts`). Without `onpath` the done mark is a picture of one, named "done",
  the branch `List` makes for a box nobody can press.
-->
<script lang="ts">
  import { TONES, WORKING_GLYPH, WORKING_LABEL, inline, takeWorking, text, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { PATH_DONE, PATH_EVERYTHING, PATH_NEXT, PATH_STEP, PATH_VIEWS, pathMore, pathPlan, pathRest, pathShort } from '../src/path.ts';
  import { nextTicks, tickState } from '../src/ticks.ts';
  import { emptied, keepsNought } from '../src/html.ts';
  import Text from './Text.svelte';

  let {
    block,
    opts = {},
    onpath,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put a stone's new state. Its absence is what keeps every stone a picture. */
    onpath?: ((row: Row, done: boolean) => void) | undefined;
  } = $props();

  /* THE PACKAGE'S OWN WORD for a stone pressed and not yet written back, as `List` says it for a box. */
  const UNSAVED = 'Not saved';

  /* A STONE WITH NO STEP IS NOT DRAWN, unless the block keeps its noughts (`pathPlan`); a path left with none says the
     host's `empty:` line, or nothing (`emptied`), as `toHTML` draws it. */
  const plan = $derived(pathPlan(block.rows, keepsNought(block, opts)));
  const left = $derived(emptied(block, opts));
  const short = $derived(pathShort(plan));
  /** Whether the reader asked for every stone. Local, and starting on the short view, which is the point of one. */
  let everything = $state(false);
  const stones = $derived(short && !everything ? plan.stones.filter((s) => s.short) : plan.stones);

  /**
   * This session's presses, by the stone's place among every stone, held beside the document's marks rather than
   * merged into them, and dropped when the fence changes, for the reason `List` drops its ticks: a place is a fact
   * about one document.
   */
  let pressed = $state(new Map<number, boolean>());
  let drawn = $state('');
  $effect(() => {
    if (block.raw === drawn) return;
    drawn = block.raw;
    pressed = new Map();
  });

  function press(at: number, row: Row, done: boolean) {
    const next = !tickState(done, pressed.get(at)).done;
    pressed = nextTicks(pressed, at, next, done);
    onpath?.(row, next);
  }
</script>

{#if typeof left === 'string'}
  <p class="block-empty">{left}</p>
{:else if left === undefined}
{#if short}
  <div class="path-switch" role="group" aria-label={PATH_VIEWS}>
    <button type="button" class="path-view" aria-pressed={!everything} onclick={() => (everything = false)}>{plan.name}</button>
    <button type="button" class="path-view" aria-pressed={everything} onclick={() => (everything = true)}>{PATH_EVERYTHING}</button>
  </div>
{/if}
<ol class="list" data-kind="steps" data-form="path">
  {#each stones as stone}
    {@const title = takeWorking(stone.row.cells[0] ?? '')}
    {@const at = plan.stones.indexOf(stone)}
    {@const state = tickState(stone.mark === 'done', pressed.get(at))}
    <li class="item" data-mark={stone.mark} data-short={stone.short ? '' : undefined}>
      {#if onpath}
        <!-- `role="checkbox"` because what it does is set a state, and its name is the step, never "not done". `tap` is
             the 44px hit box around a marker drawn smaller. -->
        <span class="item-marker"
          ><button
            type="button"
            role="checkbox"
            class="path-stone tap"
            aria-checked={state.done}
            aria-label={text(inline(title.text ?? '', opts)) || PATH_STEP}
            data-done={state.done ? 'yes' : 'no'}
            onclick={() => press(at, stone.row, stone.mark === 'done')}>{state.done ? TONES.good.glyph : ''}</button
          >{#if stone.mark === 'next' && !state.done}<span class="path-next">{PATH_NEXT}</span>{/if}</span
        >
      {:else if stone.mark === 'done'}
        <span class="item-marker" role="img" aria-label={PATH_DONE}>{TONES.good.glyph}</span>
      {:else if stone.mark === 'next'}
        <span class="item-marker"><span class="path-next">{PATH_NEXT}</span></span>
      {:else}
        <span class="item-marker"></span>
      {/if}
      <!-- `working: true`'s dot, on the step an agent is on, as every other list row draws it. -->
      <span class="item-title"
        >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
          nodes={inline(title.text ?? '', opts)}
          {opts}
        /></span
      >
      <span class="item-detail"><Text nodes={inline(stone.row.cells[1] ?? '', opts)} {opts} /></span>
      {#if state.unsaved}
        <span class="item-state" data-intent="warn"><span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span> {UNSAVED}</span>
      {/if}
    </li>
  {/each}
</ol>
{#if short && !everything}<p class="path-rest">{pathRest(plan.stones.length - stones.length)}</p>{/if}
{#if plan.more > 0}<p class="path-more">{pathMore(plan.more)}</p>{/if}
{/if}
