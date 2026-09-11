<!--
  `feed` — what agents, rules and you did, grouped by who did it, a burst on one row (`src/feed.ts`).
  Drawn to the same tree as `html.ts`'s `feed`; `src/parity.test.ts` compiles this file and compares
  the two.

  The count leads each row, as it does on the old tool's `You.svelte`, because the number is the part
  that decides whether a row is worth reading. A new row is told apart by words as well as by the
  accent: the group's head says how many are new, and a line says where the read ones begin.
-->
<script lang="ts">
  import { FEED_EARLIER, MISSING, TONES, counted, feedNew, feedPlan, initialOf, inline, markOf, text, type Block, type RenderOptions } from '../src/index.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(feedPlan(block.rows));
  const said = (v: string | undefined): string => text(inline(v ?? '', opts));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
</script>

{#if plan.groups.length === 0}
  <p class="feed-empty">{plan.empty}</p>
{:else}
  <div class="feed">
    {#each plan.groups as g}
      <div class="feed-group" data-by={g.by}>
        <h3 class="feed-head">{g.label}{#if g.fresh > 0}<span class="feed-new num">{feedNew(g.fresh)}</span>{:else}<span class="feed-tally num">{g.total}</span>{/if}</h3>
        <ul class="feed-rows">
          {#each g.rows as { row, fresh }, i}
            {@const who = row.cells[1] ?? ''}
            <!-- A rule is a square mark and an agent or a person a round face: told apart by shape. -->
            {@const face = g.by === 'rule' ? markOf(said(who)) : initialOf(said(who))}
            {#if i === g.earlier}<li class="feed-seen">{FEED_EARLIER}</li>{/if}
            <li class="feed-row" data-new={fresh ? '' : undefined} data-intent={row.tone}>
              <span class="feed-count num">{#if counted(said(row.cells[2]))}<Text nodes={nodes(row.cells[2])} {opts} />{/if}</span>
              <span class="feed-face" aria-hidden="true">{face ?? ''}</span>
              <span class="feed-what"
                ><span class="feed-who">{#if who}<Text nodes={nodes(who)} {opts} />{:else}{MISSING}{/if}</span> <Text
                  nodes={nodes(row.cells[3])}
                  {opts}
                />{#if row.tone}<span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}</span
              >
              <span class="feed-when"><Text nodes={nodes(row.cells[4])} {opts} /></span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}
