<!--
  `agents`: what each agent did, one group per agent, a burst on one row (`src/agents.ts`).
  Drawn to the same tree as `html.ts`'s `agents`, with `feed`'s classes; `src/parity.test.ts` compiles this file
  and compares the two.
-->
<script lang="ts">
  import { AGENTS_EARLIER, TONES, agentMarkFill, agentsPlan, feedBurst, initialOf, inline, text, type AgentMark, type Block, type RenderOptions } from '../src/index.ts';
  import { RUN_OPEN, runFaceOf, runMarkOf, type RunFace } from '../src/cards.ts';
  import { hrefFor } from '../src/html.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(agentsPlan(block.rows));
  const said = (v: string | undefined): string => text(inline(v ?? '', opts));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
  /** The mark the host draws for the name in a cell, or `null`, as `markFor` in `src/html.ts`. */
  const markFor = (name: string): AgentMark | null => (name.trim() && opts.agentMark ? opts.agentMark(name.trim()) : null);
</script>

<!-- AN AGENT'S FACE AS ITS MAKER'S MARK, as `Feed.svelte` draws one. -->
{#snippet agentFace(m: AgentMark, cls: string)}{@const fill = agentMarkFill(m.tone)}<span class={cls} data-agent="" aria-hidden="true"
    ><svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style={fill ?? undefined}
      ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
    ></span
  >{/snippet}

<!-- A RUN'S FACE, as `Cards.svelte`'s own `runFace` snippet draws one: every place a run is named draws
     the agent face, and this block groups its lines by who did them, which is a run wherever `sessions.live` names one. -->
{#snippet runFace(f: RunFace)}{@const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (opts.icon?.(f.glyph) ?? null)}{@const m = runMarkOf(f, opts.agentMark)}<a
    class="cards-face cards-run"
    style="background:none"
    href={hrefFor(opts, `/r/session/${f.seq}`)}
    data-live={f.live}
    aria-label={RUN_OPEN}
    ><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style="--run-hue:{f.hue}"
      ><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--run-hue)) 30%, var(--tile))"
      ></circle>{#if f.live !== 'stopped'}<circle
          class="cards-run-ring"
          cx="18"
          cy="18"
          r="16.5"
          fill="none"
          stroke-width="2.5"
          stroke-dasharray={f.live === 'quiet' ? '4 3' : undefined}
          style="stroke:oklch(var(--mark-l) var(--mark-c) var(--run-hue))"
        ></circle>{/if}{#if m}{@const fill = agentMarkFill(m.tone)}<path
          class="cards-run-agent"
          d={m.d}
          fill-rule={m.rule}
          clip-rule={m.rule}
          transform="translate(10.5 10.5) scale(0.625)"
          fill="currentColor"
          data-tone={m.tone}
          style={fill ?? undefined}
        ></path>{:else if d}<path
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
      {@const run = runFaceOf(g.who, null, false)}
      {@const face = initialOf(said(g.who))}
      {@const mark = markFor(said(g.who))}
      <div class="feed-group" data-by="agent">
        <h3 class="feed-head"><Text nodes={nodes(g.who)} {opts} /><span class="feed-tally num">{g.total}</span></h3>
        <ul class="feed-rows">
          {#each g.rows as row}
            <li class="feed-row" data-intent={row.tone}>
              <span class="feed-count num">{#if feedBurst(said(row.cells[1]))}<Text nodes={nodes(row.cells[1])} {opts} />{/if}</span>
              {#if run}{@render runFace(run)}{:else if mark}{@render agentFace(mark, 'feed-face')}{:else}<span class="feed-face" aria-hidden="true">{face ?? ''}</span>{/if}
              <span class="feed-what"
                >{#if (row.cells[2] ?? '').trim() === ''}{AGENTS_EARLIER}{:else}{#if said(g.who)}<span class="feed-who"><Text nodes={nodes(g.who)} {opts} /></span>{' '}{/if}<Text nodes={nodes(row.cells[2])} {opts} />{/if}{#if row.tone}<span
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
