<!--
  `agents`: what each agent did, one group per agent, a burst on one row (`src/agents.ts`).
  Drawn to the same tree as `html.ts`'s `agents`, with `feed`'s classes; `src/parity.test.ts` compiles this file
  and compares the two.
-->
<script lang="ts">
  import { AGENTS_EARLIER, TONES, agentsPlan, counted, initialOf, inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(agentsPlan(block.rows));
  const said = (v: string | undefined): string => text(inline(v ?? '', opts));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
</script>

{#if plan.groups.length === 0}
  <p class="feed-empty">{plan.empty}</p>
{:else}
  <div class="feed">
    {#each plan.groups as g}
      {@const face = initialOf(said(g.who))}
      <div class="feed-group" data-by="agent">
        <h3 class="feed-head"><Text nodes={nodes(g.who)} {opts} /><span class="feed-tally num">{g.total}</span></h3>
        <ul class="feed-rows">
          {#each g.rows as row}
            <li class="feed-row" data-intent={row.tone}>
              <span class="feed-count num">{#if counted(said(row.cells[1]))}<Text nodes={nodes(row.cells[1])} {opts} />{/if}</span>
              <span class="feed-face" aria-hidden="true">{face ?? ''}</span>
              <span class="feed-what"
                >{#if (row.cells[2] ?? '').trim() === ''}{AGENTS_EARLIER}{:else}<Text nodes={nodes(row.cells[2])} {opts} />{/if}{#if row.tone}<span
                    class="glyph"
                    role="img"
                    aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span
                  >{/if}</span
              >
              <span class="feed-when"><Text nodes={nodes(row.cells[3])} {opts} /></span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}
