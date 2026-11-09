<!--
  `feed` — what agents, rules and you did, grouped by who did it, a burst on one row (`src/feed.ts`).
  Drawn to the same tree as `html.ts`'s `feed`; `src/parity.test.ts` compiles this file and compares
  the two.

  The count leads each row, because the number is the part that decides whether a row is worth reading, and only
  where it is a burst of more than one (`feedBurst`): a `1` in front of every line said nothing. An agent wears its
  maker's mark where the host draws one, and a rule wears no letter. A new row is told apart by words as well as by
  the accent: the group's head says how many are new, and a line says where the read ones begin. A feed of one group
  draws no head, and a name the bank sent in capitals is written as a person writes it (`feedCased`).

  A feed the host parted by day (`day | Today`) is drawn under a heading a day instead, its lines in the order they came
  and each with its own actor's mark, so the actor is read off the line (`by`) and never off the group. A line that
  stands for a run's work says its fold after its words ("and 39 more").
-->
<script lang="ts">
  import { FEED_EARLIER, MISSING, TONES, agentMarkFill, feedBurst, feedNew, feedPlan, initialOf, inline, text, type AgentMark, type Block, type RenderOptions } from '../src/index.ts';
  import { FEED_DAY, feedCasedNodes, feedFold } from '../src/feed.ts';
  import { RUN_OPEN, runFaceOf, runMarkOf, type RunFace } from '../src/cards.ts';
  import { hrefFor } from '../src/html.ts';
  import { rowAt, rowKey, rowKeys } from '../src/cursor.ts';
  import type { Row } from '../src/parse.ts';
  import Text from './Text.svelte';

  let {
    block,
    opts = {},
    cursor,
    onrowfocus,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The key of the line the host's cursor is on (`rowKey`), drawn `data-focused`. */
    cursor?: string | null | undefined;
    /** Where the host hears that focus moved into a line, with its key and row. */
    onrowfocus?: ((key: string, row: Row) => void) | undefined;
  } = $props();

  function focused(e: FocusEvent) {
    const key = (e.target as Element | null)?.closest?.('[data-row]')?.getAttribute('data-row');
    const row = key == null ? undefined : rowAt(block.rows, key);
    if (key != null && row) onrowfocus?.(key, row);
  }

  const plan = $derived(feedPlan(block.rows));
  /* EACH LINE KEYED BY ITS ROW'S OWN KEY (`rowKeys`), so a line the record added is a new element a host can move in. */
  const lineKeys = $derived(new Map(rowKeys(block.rows).map((k, i) => [block.rows[i], k] as const)));
  const said = (v: string | undefined): string => text(inline(v ?? '', opts));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
  /** The mark the host draws for the name in a cell, or `null`, as `markFor` in `src/html.ts`. */
  const markFor = (name: string): AgentMark | null => (name.trim() && opts.agentMark ? opts.agentMark(name.trim()) : null);
</script>

<!-- AN AGENT'S FACE AS ITS MAKER'S MARK, as `agentFaceHtml` in `src/html.ts` draws one: the host's path, filled in the
     maker's tone, in the face slot a letter used to fill. Hidden, because the agent is named in words beside it. -->
{#snippet agentFace(m: AgentMark, cls: string)}{@const fill = agentMarkFill(m.tone)}<span class={cls} data-agent="" aria-hidden="true"
    ><svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style={fill ?? undefined}
      ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
    ></span
  >{/snippet}

<!-- A RUN'S FACE, as `Cards.svelte`'s own `runFace` snippet draws one: every place a run is named draws
     the agent face, and a feed line's actor is a run wherever `sessions.live` names one. -->
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
  <div class="feed" onfocusin={onrowfocus ? focused : undefined}>
    {#each plan.groups as g}
      <div class="feed-group" data-by={g.by}>
        <!-- A DAY'S HEAD COUNTS ONLY WHAT IS NEW, and the lines above the first day have no name to head them. -->
        {#if !plan.lone && g.label !== ''}<h3 class="feed-head">{g.label}{#if g.fresh > 0}<span class="feed-new num">{feedNew(g.fresh)}</span>{:else if g.by !== FEED_DAY}<span class="feed-tally num" data-calm="">{g.total}</span>{/if}</h3>{/if}
        <ul class="feed-rows">
          {#each g.rows as { row, fresh, by }, i (lineKeys.get(row) ?? i)}
            {@const who = row.cells[1] ?? ''}
            {@const run = runFaceOf(who, null, false)}
            <!-- A RULE WEARS NO FACE AT ALL, an agent its maker's mark where the host draws one, and a person their initial. -->
            {@const mark = by === 'rule' ? null : markFor(said(who))}
            {@const face = by === 'rule' ? null : initialOf(said(who))}
            {@const more = feedFold(row.cells)}
            {@const key = rowKey(row, block.rows.indexOf(row))}
            {#if i === g.earlier}<li class="feed-seen">{FEED_EARLIER}</li>{/if}
            <li class="feed-row" data-new={fresh ? '' : undefined} data-intent={row.tone} data-row={key} data-focused={cursor === key ? '' : undefined}>
              <span class="feed-count num">{#if feedBurst(said(row.cells[2]))}<Text nodes={nodes(row.cells[2])} {opts} />{/if}</span>
              {#if run}{@render runFace(run)}{:else if mark}{@render agentFace(mark, 'feed-face')}{:else if by !== 'rule'}<span class="feed-face" aria-hidden="true">{face ?? ''}</span>{/if}
              <!-- A RULE THAT WORDED ITS OWN LINE SENDS NO WHO, and draws none, as `html.ts`'s `feed`. -->
              <span class="feed-what"
                >{#if who || by !== 'rule'}<span class="feed-who">{#if who}<Text nodes={nodes(who)} {opts} />{:else}{MISSING}{/if}</span>{' '}{/if}<Text
                  nodes={feedCasedNodes(nodes(row.cells[3]))}
                  {opts}
                />{#if row.tone}<span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}{#if more}{' '}<span class="feed-more"
                    ><Text nodes={nodes(more)} {opts} /></span
                  >{/if}</span
              >
              <span class="feed-when" data-calm=""><Text nodes={nodes(row.cells[4])} {opts} /></span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}
