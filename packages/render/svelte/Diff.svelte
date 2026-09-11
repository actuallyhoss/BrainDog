<!--
  `diff` — how a text changed from one version to the next (`src/diff.ts`). Drawn to the same tree as
  `html.ts`'s `diff`; `src/parity.test.ts` compiles this file and compares the two.

  A changed line is a `del` or an `ins`, and its mark is a glyph whose accessible name is the word, so
  a removed line is never told apart by colour alone. The lines wrap inside the block rather than
  scrolling, because a skill is prose and a phone has no room to scroll it sideways.
-->
<script lang="ts">
  import { DIFF_GLYPHS, DIFF_WORDS, diffFolded, diffPlan, type Block, type DiffLine, type RenderOptions } from '../src/index.ts';

  // `opts` is part of every primitive's signature and is not read here: the lines are verbatim.
  let { block }: { block: Block; opts?: RenderOptions | undefined } = $props();

  const plan = $derived(diffPlan(block.rows.map((r) => r.cells[0] ?? '')));
</script>

{#snippet line(l: DiffLine)}
  <svelte:element this={l.op === 'del' ? 'del' : l.op === 'add' ? 'ins' : 'div'} class="diff-line" data-op={l.op}
    >{#if l.op === 'same'}<span class="diff-mark" aria-hidden="true"></span>{:else}<span
        class="diff-mark"
        role="img"
        aria-label={DIFF_WORDS[l.op]}>{DIFF_GLYPHS[l.op]}</span
      >{/if}<span class="diff-text">{l.text}</span></svelte:element
  >
{/snippet}

<div class="diff">
  <p class="diff-sum">{plan.summary}</p>
  <div class="diff-lines">
    {#each plan.parts as part}
      {#if part.fold}
        <details class="diff-fold">
          <summary class="diff-toggle">{diffFolded(part.lines.length)}</summary>
          {#each part.lines as l}{@render line(l)}{/each}
        </details>
      {:else}
        {#each part.lines as l}{@render line(l)}{/each}
      {/if}
    {/each}
  </div>
</div>
