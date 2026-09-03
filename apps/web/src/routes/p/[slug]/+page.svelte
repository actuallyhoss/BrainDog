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
  import { KINDS, isKind } from 'braindog-render';
  import { Block, Table } from 'braindog-render/svelte';
  import { page as state } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { page as readPage, values, type BlockResult } from '$lib/record/api.ts';
  import { toSegments } from '$lib/record/blocks.ts';
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
   * The declared span, clamped to what the KIND can survive.
   *
   * A declaration arrives from a pack, and a pack is a thing a stranger wrote — so a `table` that
   * says `span: 2` is a table somebody will read as broken. The renderer's own table knows the
   * floor per kind (13 §4.1's three width classes), and the page honours it rather than drawing
   * eight columns in a sixth of a page. The ARRANGE control refuses below the floor instead of
   * clamping, because a control that silently corrects you teaches nothing; this clamp is for
   * declarations that never went through that control.
   */
  const spanOf = (block: BlockResult) => {
    const floor = isKind(block.kind) ? KINDS[block.kind].minSpan : 4;
    return Math.min(12, Math.max(floor, block.span ?? 12));
  };

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
            b.span && b.span !== 12 ? `    span: ${b.span}` : '',
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
          <section
            class="block-slot"
            id="b-{i + 1}"
            aria-labelledby="h-{i + 1}"
            style="--span:{spanOf(block)}"
          >
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
              {#each toSegments(block) as segment}
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
  /* TWELVE COLUMNS, and `span` finally means something.
     
     The declaration has carried `span: 1–12, default 12` since 06 §1.1 and nothing has ever read
     it — every block rendered full width regardless. This is that key, rendered.

     A FLOW, not a canvas. Blocks fill the row and wrap; there is no x, no y and no hole. 21 §3.1
     rejected free placement on measured evidence — in Home Assistant's masonry a one-pixel height
     difference could move a card from the leftmost column to the rightmost, and people lost their
     spatial memory of where a control lived. A flow cannot do that: the order you declared is the
     order you get, at every width, forever.

     `align-items: start` so a half-width block beside a tall one keeps its own height instead of
     stretching to match — a stat tile stretched to the height of the table next to it is a stat
     tile with a hundred pixels of nothing under the figure. */
  .page {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1180px;
  }

  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses
       to shrink below its content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
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

  /* The figure's own bottom margin is the LIST's spacing, and the grid already provides it. Both
     were applying, so every gap on a declared page was 48px where the token says 24. */
  .block-slot :global(.block) {
    margin-block-end: 0;
  }

  /* ONE COLUMN below 900px, in declaration order.
     
     The corpus never wrote this rule down, so here it is with its reason. 13 §10 has two
     breakpoints and 05 §6 allows width to change LAYOUT but never size. Collapsing to one column
     keeps the only thing a span was ever encoding — which block comes after which — and that is
     precisely the property masonry lost. There is no second stored layout for narrow, because a
     second layout is a second thing to keep in sync and nobody ever does. */
  @media (width < 900px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .block-slot {
      grid-column: auto;
    }
  }
</style>
