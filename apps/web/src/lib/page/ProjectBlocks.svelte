<!--
  A project's page, in one shape: the brief, the next step, money, people, agents, then what it runs on (`project.ts`).

  SAME PLACES EVERY TIME, and a block with nothing to say is not drawn at all. Under each block that has rows behind it
  sits "Show the data", a small button that opens those rows, so the page says it in a line and the rows are one press
  away. Two columns from 640px, one stacked in the same order on a phone. Money is a small bar and the amount in words,
  never a number to press, and what it runs on is names only.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import NextStep from '$lib/page/NextStep.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { blocksOf, runsOnSet, spans, type Block, type DataRow, type Facts } from '$lib/record/project.ts';

  let {
    facts,
    nextHref = null,
    data,
    format,
    omit = [],
  }: {
    facts: Facts;
    /** Blocks another part of the page says already: a project's page says its brief in its hero and its money in row 2. */
    omit?: readonly Block[];
    /** Where the next step opens, when it came from a task. */
    nextHref?: string | null;
    /** The rows behind each block. A block with none has no button. */
    data: Partial<Record<Block, readonly DataRow[]>>;
    format: (minor: number, currency: string) => string;
  } = $props();

  const blocks = $derived(blocksOf(facts).filter((b) => !omit.includes(b)));
  const span = $derived(spans(blocks));
  const uid = $props.id();

  const WORDS: Record<Block, { title: string; icon: IconName }> = {
    brief: { title: 'The brief', icon: 'doc' },
    next: { title: 'Next step', icon: 'task' },
    money: { title: 'Money', icon: 'money' },
    crew: { title: 'Who is on it', icon: 'link' },
    workers: { title: 'Who is working', icon: 'session' },
    'runs-on': { title: 'What it runs on', icon: 'plug' },
  };
  const MONEY: Record<'in' | 'out' | 'owed', string> = { in: 'In this month', out: 'Out this month', owed: 'Still to come in' };

  /* WHICH BLOCKS HAVE THEIR ROWS OPEN, kept for this view only. */
  let open = $state<ReadonlySet<Block>>(new Set());
  const toggle = (b: Block) => {
    const next = new Set(open);
    if (!next.delete(b)) next.add(b);
    open = next;
  };
</script>

{#snippet rows(list: readonly DataRow[], label: string)}
  <ul class="items" aria-label={label}>
    {#each list as r (r.key)}
      <li>
        {#if r.href}
          <a class="item item-link" href={at(r.href)}><span class="item-main"><span class="item-title" dir="auto">{r.title}</span>{#if r.detail}<span class="item-detail">{r.detail}</span>{/if}</span></a>
        {:else}
          <span class="item"><span class="item-main"><span class="item-title" dir="auto">{r.title}</span>{#if r.detail}<span class="item-detail">{r.detail}</span>{/if}</span></span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet disclosure(b: Block)}
  {@const list = data[b] ?? []}
  {#if list.length > 0}
    <button type="button" class="more" aria-expanded={open.has(b)} aria-controls="{uid}-{b}" onclick={() => toggle(b)}>
      {open.has(b) ? 'Hide the data' : 'Show the data'}<Icon name="chevron" size="s" />
    </button>
    {#if open.has(b)}<div id="{uid}-{b}">{@render rows(list, WORDS[b].title)}</div>{/if}
  {/if}
{/snippet}

<div class="blocks">
  {#each blocks as b (b)}
    <div class="block" data-block={b} data-span={span[b]}>
      <Tile icon={WORDS[b].icon} title={WORDS[b].title}>
        {#if b === 'brief'}
          <!-- ONE PARAGRAPH: the brief's sentences are one thought, not a stack of lines. -->
          <p class="said">{facts.brief.join(' ')}</p>
        {:else if b === 'next'}
          <NextStep next={{ text: facts.next ?? '', row: null, href: nextHref }} />
        {:else if b === 'money'}
          <ul class="money">
            {#each facts.money as m (m.key)}
              <li>
                <span class="money-name">{MONEY[m.key]}</span>
                <span class="money-amount num">{format(m.value, m.currency)}</span>
                <span class="bar" aria-hidden="true"><span class="bar-fill" data-key={m.key} style:inline-size="{Math.max(4, Math.round(m.share * 100))}%"></span></span>
              </li>
            {/each}
          </ul>
        {:else if b === 'crew'}
          <p class="said">{facts.people.map((p) => p.title).join(', ')}</p>
        {:else if b === 'workers'}
          <!-- EACH AGENT BY ITS MAKER'S MARK AND THE NAME A PERSON READS, as Today's Working now draws it ("claude ," was
               the handle in lower case, and a flex gap set the comma apart: a review). One line of text
               beside the face, so the comma sits against the name. -->
          {#each facts.agents.now as w (w.key)}
            <p class="said agent"><AgentFace agent={w.agent} run={w.run} live={w.live} size="s" /><span class="agent-said"><b>{w.name}</b>{#if w.doing}<span class="quiet">, {w.doing}</span>{/if}</span></p>
          {/each}
          {#if facts.agents.runs.length > 0}<p class="quiet">{facts.agents.runs.length === 1 ? '1 run on it' : `${facts.agents.runs.length} runs on it`}</p>{/if}
        {:else}
          {@const set = runsOnSet(facts.runsOn)}
          {#each set.groups as g (g.kind)}
            <div class="kind">
              {#if g.kind}<span class="kind-name">{g.kind}</span>{/if}
              <ul class="names" aria-label={g.kind || WORDS[b].title}>
                {#each g.names as n (n)}<li dir="auto">{n}</li>{/each}
              </ul>
            </div>
          {/each}
          {#if set.more > 0}<p class="quiet">and {set.more} more</p>{/if}
        {/if}
        {@render disclosure(b)}
      </Tile>
    </div>
  {/each}
</div>

<style>
  /* TWO COLUMNS FROM 640px, ONE BELOW, in the order the blocks are listed. A block alone in its pair takes both. */
  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
  }

  /* NO MARGIN: the renderer's global `.block` adds 24px under it, and the grid's gap is the only space between two. */
  .block {
    margin: 0;
    min-inline-size: 0;
  }

  @media (width >= 640px) {
    .blocks {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .block[data-span='2'] {
      grid-column: 1 / -1;
    }
  }

  .said {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .agent {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .agent-said {
    min-inline-size: 0;
  }

  .agent-said b {
    font-weight: 500;
  }

  .agent-said .quiet {
    font-size: inherit;
  }

  /* WHAT IT RUNS ON: a small label for each kind, its names wrapped beside it, a few and then "and N more". */
  .kind {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    margin-block-end: var(--sp-2);
  }

  .kind:last-of-type {
    margin-block-end: 0;
  }

  .kind-name {
    flex: none;
    min-inline-size: 64px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .names {
    display: flex;
    flex: 1 1 260px;
    flex-wrap: wrap;
    gap: var(--sp-1);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .names li {
    padding: var(--sp-0) var(--sp-2);
    border-radius: var(--r-xs);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .money {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .money li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-1) var(--sp-3);
    align-items: baseline;
  }

  .money-name {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .money-amount {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .bar {
    grid-column: 1 / -1;
    block-size: 6px;
    border-radius: var(--r-pill);
    background: var(--tile-2);
    overflow: hidden;
  }

  .bar-fill {
    display: block;
    block-size: 100%;
    border-radius: var(--r-pill);
    background: var(--ink);
  }

  .bar-fill[data-key='out'],
  .bar-fill[data-key='owed'] {
    background: var(--ink-3);
  }

  /* THE DISCLOSURE IS A QUIET WORD, not a button row: it sits at the foot of its block, and its chevron turns when open. */
  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 32px;
    margin-block-start: var(--sp-2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  /* A finger needs the full target the layout gate measures. */
  @media (pointer: coarse) {
    .more {
      min-block-size: var(--tap);
    }
  }

  .more :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .more[aria-expanded='true'] :global(svg) {
    transform: rotate(var(--open-turn, 90deg));
  }

  @media (hover: hover) and (pointer: fine) {
    .more:hover {
      color: var(--ink);
    }
  }

  .items {
    display: flex;
    flex-direction: column;
    margin: var(--sp-2) calc(-1 * var(--sp-2)) 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    min-block-size: var(--row-h);
    padding: var(--row-pad-y) var(--sp-2);
    border-radius: var(--r-ctl);
    color: inherit;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .item-link:hover {
      background: var(--row-wash, var(--tile-2));
    }
  }

  .item-main {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .item-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  .item-detail {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }
</style>
