<!--
  Home as a use case declares it (`loop/research-spark.md` S13): the blocks of its `home-<use case>` page, each under
  its own heading, in the column where the house Home draws its figures and what needs you.

  A LIVE PAGE IS DRAWN FROM THE ANSWER AND NOTHING ELSE, as `/p/<slug>` draws one: a block this build cannot draw
  says so in one line, a refusal is the record's sentence, and a list cut short says it is a slice with a way to
  the rest. Nothing here is arranged: Home is read, and the page itself is where it is arranged.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { Block, Degraded, Markdown, Table } from 'braindog-render/svelte';
  import '$lib/blocks-charts.css';
  import { copy } from '$lib/copy.ts';
  import { REGISTERS, homeCurrency } from '$lib/record/api.ts';
  import { draw } from '$lib/record/blocks.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { resolverOf, type LiveBlock } from '$lib/record/page-live.ts';
  import { registerHref } from '$lib/record/where.ts';
  import Section from './Section.svelte';
  import Empty from './Empty.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  let { blocks, now }: { blocks: readonly LiveBlock[]; now: number } = $props();

  const said = (text: string | null): string | null => (text === null ? null : symbolText(text, homeCurrency()));
  const optsFor = (block: LiveBlock) => ({
    resolve: (path: string) => said(resolverOf(block.values)(path)),
    now,
    cellHref: (i: number) => block.metrics?.[i]?.href ?? null,
    href: at,
  });
  const openHref = (block: LiveBlock): string | null => (block.register ? registerHref(block.register, block.where) : null);
</script>

{#each blocks as block, i (i)}
  {#if block.drawn}
    {@const held = block.register && !block.where ? REGISTERS[block.register] : undefined}
    {@const drawn = draw(
      block,
      held
        ? { rows: block.total, name: held.name, ...(held.holds ? { holds: held.holds } : {}), ...(block.register === 'session' ? {} : { add: { href: `/r/${block.register}?new=1`, label: copy.addOne } }) }
        : undefined,
    )}
    {@const to = openHref(block)}
    <Section title={block.heading ?? copy.kindNames[block.kind] ?? block.kind}>
      {#snippet aside()}
        {#if to && block.register}
          <a class="source tap" href={at(to)}>{REGISTERS[block.register]?.name ?? block.register}<Icon name="arrow" size="s" /></a>
        {/if}
      {/snippet}
      {#if block.cannot}
        <p class="note">{block.cannot}</p>
      {:else if drawn.refusal}
        {@const act = drawn.refusal.action}
        <Empty compact kind={drawn.refusal.kind} title={drawn.refusal.title} body={drawn.refusal.body} lines={drawn.refusal.lines}>
          {#snippet actions()}
            {#if act}<Button href={act.href}>{act.label}</Button>{/if}
          {/snippet}
        </Empty>
      {:else if block.kind === 'table'}
        <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} href={at} />
      {:else}
        {#each drawn.segments as segment}
          {#if segment.type === 'block'}<Block block={segment} opts={optsFor(block)} />{:else if segment.type === 'degraded'}<Degraded {segment} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} opts={{ href: at }} /></div>{/if}
        {/each}
      {/if}
      {#if !drawn.refusal && !block.cannot && block.total > block.shown}
        <p class="note" role="status">
          {copy.ofWhichDrawn(block.shown, block.total)}.{#if to}{' '}<a class="tap" href={at(to)}>{copy.openTheRest(REGISTERS[block.register!]?.name ?? block.register!)}</a>{/if}
        </p>
      {/if}
    </Section>
  {/if}
{/each}

<style>
  .source {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .source:hover {
    color: var(--ink);
  }

  .note {
    margin: 0;
    padding-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
