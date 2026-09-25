<!--
  `steps path`: the stones in the list's order, each marked done, next or later, and the count of the open steps the
  short view left out (`src/path.ts`). `path` in `src/html.ts` is this file's twin, and `src/dynamic-forms.test.ts`
  compiles both and holds them to one tree.

  THE LIST'S OWN CLASSES, THE MARK AN ATTRIBUTE. A host that styles `steps` already draws a path as a numbered list,
  and the connecting line, the muted done stones and the marked next one are rules on `data-mark`, never a colour
  here. The next stone says "Next" in words because finding it without reading every row is what the form is for.

  NO TICK YET. A stone is the place a tick would go, and writing the list's done field from it is the host's (as
  `todo`'s box is), so until a host passes a callback for it the done mark is a picture of one, named "done", the
  branch `List` makes for a box nobody can press.
-->
<script lang="ts">
  import { TONES, WORKING_GLYPH, WORKING_LABEL, inline, takeWorking, type Block, type RenderOptions } from '../src/index.ts';
  import { PATH_DONE, PATH_NEXT, pathMore, pathPlan } from '../src/path.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(pathPlan(block.rows));
</script>

<ol class="list" data-kind="steps" data-form="path">
  {#each plan.stones as { row, mark }}
    {@const title = takeWorking(row.cells[0] ?? '')}
    <li class="item" data-mark={mark}>
      {#if mark === 'done'}
        <span class="item-marker" role="img" aria-label={PATH_DONE}>{TONES.good.glyph}</span>
      {:else if mark === 'next'}
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
      <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
    </li>
  {/each}
</ol>
{#if plan.more > 0}<p class="path-more">{pathMore(plan.more)}</p>{/if}
