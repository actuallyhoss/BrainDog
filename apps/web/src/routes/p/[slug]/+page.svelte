<!--
  A declared page: many bound queries, arranged. A page is a ROW, not a file — which is what makes
  "the Money page" something a freelancer never sees and a studio does (06).

  One request per page load, never one per block. The record object IS the query engine and storage
  is in-process, so N block queries cost N in-thread SQLite calls and ZERO network hops. Fanning out
  per block would be N round trips (22 §5).

  Per-block error boundaries: six queries, six independent failures, and one broken query never
  blanks a page. A block-level failure announces with `role="status"`, not `role="alert"` — ten
  simultaneous assertive announcements is a denial of service on a screen-reader user (19 §6).
-->
<script lang="ts">
  import { money, parse, relative } from 'braindog-render';
  import { Block, Table } from 'braindog-render/svelte';
  import { page as state } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { CURRENCY, NOW, display, page as readPage, values, type BlockResult } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const slug = $derived(state.params.slug ?? '');
  const result = $derived(readPage(slug));
  const showSource = $derived(state.url.searchParams.get('src') === '1');
  const resolved = values();

  /** Every `{{path}}` is resolved server-side and handed over; a missing value is an em dash. */
  const opts = { resolve: (path: string) => resolved[path] ?? null };

  /**
   * A page block becomes a Block segment through the dialect, so a declared page and a write-up take
   * one code path from the first `<figure>` down.
   *
   * The heading is DELIBERATELY not passed through. The block bar above already names the block and
   * says where its rows came from; a figcaption repeating it is the same sentence twice, in two
   * different typographic registers.
   */
  function toSegment(block: BlockResult) {
    const head = `${block.kind}${block.tone ? ` |  | ${block.tone}` : ''}`;
    const rows = block.metrics
      ? block.metrics.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`)
      : block.kind === 'bar'
        ? barRows(block)
        : block.kind === 'timeline'
          ? timelineRows(block)
          : block.kind === 'board'
            ? boardRows(block)
            : block.body
              ? [block.body]
              : [];
    return parse(['```' + head, ...rows, '```'].join('\n'));
  }

  /** A bar over a register groups its rows and sums them — the one place the page does arithmetic. */
  function barRows(block: BlockResult): string[] {
    const totals = new Map<string, number>();
    for (const e of block.entries) {
      const key = display(block.register ?? '', 'party', e.fields.party) ?? 'Nobody in particular';
      totals.set(key, (totals.get(key) ?? 0) + Number(e.fields.amount ?? 0));
    }
    const sorted = [...totals].sort((a, b) => b[1] - a[1]);
    return sorted.map(([party, total]) => `${party} | ${money(total, CURRENCY)} | `);
  }

  function timelineRows(block: BlockResult): string[] {
    return block.entries
      .slice(0, 10)
      .map((e) => {
        const iso = String(e.fields.renews ?? '');
        const days = (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000;
        const tone = days < 0 ? ' | bad' : days < 21 ? ' | warn' : '';
        return `${relative(iso, NOW)} | ${e.fields.name} | ${e.fields.provider}${tone}`;
      });
  }

  function boardRows(block: BlockResult): string[] {
    return block.entries.map((e) => `${String(e.fields.state).replace(/_/g, ' ')} | ${e.fields.what} | ${e.fields.thing ? display('tasks', 'thing', e.fields.thing) : ''}`);
  }

  const declaration = $derived(
    result
      ? [
          `page: ${result.page.page}`,
          `title: ${result.page.title}`,
          result.page.nav ? `nav: { section: ${result.page.nav.section}, order: ${result.page.nav.order} }` : '',
          `requires: [${result.page.requires.join(', ')}]`,
          '',
          'blocks:',
          ...result.page.blocks.flatMap((b) => [
            `  - kind: ${b.kind}`,
            b.heading ? `    heading: ${b.heading}` : '',
            b.source ? `    source: ${b.source}` : '',
            b.where ? `    where: ${b.where}` : '',
            b.empty ? `    empty: "${b.empty}"` : '',
            b.limit ? `    limit: ${b.limit}` : '',
          ]),
        ]
          .filter(Boolean)
          .join('\n')
      : '',
  );
</script>

{#if !result}
  <div class="page">
    <Empty kind="error" title="Couldn't load {slug}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead kicker={result.page.nav?.section} title={result.page.title}>
    {#snippet actions()}
      <Button weight="bare" href="?src={showSource ? '0' : '1'}">
        <Icon name="copy" size="s" />
        {showSource ? 'Page' : 'Source'}
        <Kbd keys="⇧E" />
      </Button>
    {/snippet}
  </PageHead>

  <div class="page">
    {#if showSource}
      <!-- The declaration as diffable text. A page is a row, so this is the row (19 §2). -->
      <pre class="source"><code>{declaration}</code></pre>
    {:else}
      {#each result.blocks as block, i}
        <!-- `drawn: false` means the server evaluated `when:` and said no. A page that shows a
             warning that does not apply teaches people to ignore warnings (06 §1). -->
        {#if block.drawn}
          <section class="block-slot" id="b-{i + 1}" aria-labelledby="h-{i + 1}">
            <header class="block-bar">
              <h2 class="block-name" id="h-{i + 1}">{block.heading ?? block.kind}</h2>
              {#if block.register}
                <a class="block-source" href="/r/{block.register}">
                  {block.register}
                  {#if block.where}<span class="block-where">{block.where}</span>{/if}
                  <Kbd keys="o" />
                </a>
              {/if}
            </header>

            {#if block.kind === 'table'}
              {#if block.rows.length === 0}
                <!-- Never hidden and never centred: the page's shape is information, and a page that
                     silently shrinks teaches that blocks come and go (19 §6). -->
                <p class="block-empty">{block.empty}</p>
              {:else}
                <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} />
              {/if}
            {:else}
              {#each toSegment(block) as segment}
                {#if segment.type === 'block'}<Block block={segment} {opts} />{/if}
              {/each}
            {/if}
          </section>
        {/if}
      {/each}
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1180px;
  }

  .block-bar {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-2);
  }

  .block-name {
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  /* Every block header names its source, and `o` opens that register PRE-FILTERED to the block's
     own `where:`. That is the down half of the two-altitude ladder, and nothing may break it. */
  .block-source {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .block-source:hover {
    color: var(--ink2);
  }

  .block-where {
    color: var(--dim);
    opacity: 0.8;
  }

  .block-empty {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .source {
    margin: 0;
    padding: var(--sp-4);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-ui);
    line-height: 1.7;
    overflow-x: auto;
  }

  /* `#b-4` must not scroll underneath the sticky header. Paid once, per anchor. */
  .block-slot {
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
