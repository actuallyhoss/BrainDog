<!--
  `feed` — what agents, rules and you did, grouped by who did it, a burst on one row (`src/feed.ts`).
  Drawn to the same tree as `html.ts`'s `feed`; `src/parity.test.ts` compiles this file and compares
  the two.

  The count leads each row, because the number is the part
  that decides whether a row is worth reading. A new row is told apart by words as well as by the
  accent: the group's head says how many are new, and a line says where the read ones begin.
-->
<script lang="ts">
  import { FEED_EARLIER, MISSING, TONES, counted, feedNew, feedPlan, initialOf, inline, markOf, text, type Block, type RenderOptions } from '../src/index.ts';
  import { RUN_OPEN, runFaceOf, type RunFace } from '../src/cards.ts';
  import { hrefFor } from '../src/html.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(feedPlan(block.rows));
  const said = (v: string | undefined): string => text(inline(v ?? '', opts));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
</script>

<!-- A RUN'S FACE, as `Cards.svelte`'s own `runFace` snippet draws one: every place a run is named draws
     the agent face, and a feed line's actor is a run wherever `sessions.live` names one. -->
{#snippet runFace(f: RunFace)}{@const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (opts.icon?.(f.glyph) ?? null)}<a
    class="cards-face cards-run"
    style="background:none"
    href={hrefFor(opts, `/r/session/${f.seq}`)}
    data-live={f.live}
    aria-label={RUN_OPEN}
    ><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style="--run-hue:{f.hue}"
      ><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--run-hue)) 30%, var(--bg))"
      ></circle>{#if f.live !== 'stopped'}<circle
          class="cards-run-ring"
          cx="18"
          cy="18"
          r="16.5"
          fill="none"
          stroke-width="2.5"
          stroke-dasharray={f.live === 'quiet' ? '4 3' : undefined}
          style="stroke:oklch(var(--mark-l) var(--mark-c) var(--run-hue))"
        ></circle>{/if}{#if d}<path
          d={d}
          transform="translate(9 9) scale(0.75)"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>{/if}</svg
    ></a
  >{/snippet}

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
            {@const run = runFaceOf(who, null, false)}
            <!-- A rule is a square mark and an agent or a person a round face: told apart by shape. -->
            {@const face = g.by === 'rule' ? markOf(said(who)) : initialOf(said(who))}
            {#if i === g.earlier}<li class="feed-seen">{FEED_EARLIER}</li>{/if}
            <li class="feed-row" data-new={fresh ? '' : undefined} data-intent={row.tone}>
              <span class="feed-count num">{#if counted(said(row.cells[2]))}<Text nodes={nodes(row.cells[2])} {opts} />{/if}</span>
              {#if run}{@render runFace(run)}{:else}<span class="feed-face" aria-hidden="true">{face ?? ''}</span>{/if}
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
