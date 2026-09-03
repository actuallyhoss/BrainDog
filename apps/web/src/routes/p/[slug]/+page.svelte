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
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { page as readPage, values, type BlockResult } from '$lib/record/api.ts';
  import { toSegments } from '$lib/record/blocks.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import AddBlock from '$lib/ui/AddBlock.svelte';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  const slug = $derived(route.params.slug ?? '');
  const result = $derived(readPage(slug));
  const showSource = $derived(route.url.searchParams.get('src') === '1');
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

  /* ── arranging ─────────────────────────────────────────────────────────────
     A MODE, not an always-on affordance. Drag handles on a page you are reading are noise, and an
     accidental drag that rewrites a row is the kind of edit nobody can attribute later. */
  const arrangement = new Arrangement();
  const arranging = $derived(arrangement.editing);

  /**
   * The blocks in the order and at the widths currently in force, each carrying the index it had in
   * the declaration.
   *
   * `slot.span` is authoritative whether or not the mode is open — it falls back to the declared
   * span when there is no arrangement. The template read `arranging ? slot.span : spanOf(block)`
   * once, which meant Done kept the ORDER and silently threw away every width: the layout you
   * confirmed was not the layout you got.
   */
  const laid = $derived.by(() => {
    const blocks = all;
    const slots = arrangement.slots ?? blocks.map((b, i) => ({ i, span: spanOf(b) }));
    return slots
      .map((slot) => ({ slot, block: blocks[slot.i] }))
      .filter((x): x is { slot: { i: number; span: number }; block: BlockResult } => Boolean(x.block));
  });

  function beginArrange() {
    arrangement.begin(all.map((b, i) => ({ i, span: spanOf(b) })));
  }

  /**
   * A block added here is resolved through the SAME page read as a declared one.
   *
   * `readPage` answers per block against live rows, so a seeded block gets real data the moment it
   * exists — which is what makes "already bound and already drawing" (21 §3.3) true rather than a
   * promise the picker makes and the page breaks.
   */
  function add(block: PageBlock) {
    extra = [...extra, block];
    arrangement.slots = [
      ...(arrangement.slots ?? (result?.blocks ?? []).map((b, i) => ({ i, span: spanOf(b) }))),
      { i: (result?.blocks.length ?? 0) + extra.length - 1, span: block.span ?? 12 },
    ];
    toasts.push(copy.blockAdded(block.kind), { intent: 'warn' });
  }

  /**
   * ONE write, one event batch, one undo — even for four moves.
   *
   * 02 §8 makes an `edit` one event row per changed FIELD, all sharing one `batch` ULID, and undo is
   * a query over that batch. Committing per drag would put four unrelated lines in the audit log
   * for one act of tidying, and leave no single thing to undo.
   */
  function commitArrange() {
    if (!arrangement.dirty) {
      arrangement.cancel();
      toasts.push(copy.arrangeNothing);
      return;
    }
    const undo = arrangement.commit();
    /* The layout STAYS. In the real client this is where `setDeclaration({ body })` goes; here the
       toast says plainly that nothing was written, because a mock that pretends to have saved is a
       mock that will be believed. */
    toasts.push(copy.arrangedNotSaved(result?.page.title ?? slug), { intent: 'warn', undo });
  }

  /** Held while a handle is down, so the drop target knows what is moving. */
  let dragging = $state<number | null>(null);

  let adding = $state(false);

  /** The register the page is mostly about — what a new block binds to before you narrow it. */
  const primary = $derived(result?.blocks.find((b) => b.register)?.register ?? 'obligations');

  /** Blocks added in this session. They live beside the declared ones and index past them. */
  let extra = $state<PageBlock[]>([]);

  /** Declared, then added. One list, so ordering and spans do not care which is which. */
  const all = $derived([...(result?.blocks ?? []), ...extra.map((b) => resolveExtra(b))]);

  /** An added block, run through the page read so it carries rows rather than a declaration. */
  function resolveExtra(block: PageBlock): BlockResult {
    const template = result?.blocks.find((b) => b.register === block.source?.replace('register.', ''));
    return {
      ...(template ?? { rows: [], entries: [], total: 0, drawn: true, stale_at: '' }),
      ...block,
      columns: (block.columns ?? []).map((c) => ({
        field: c.field,
        label: c.label ?? c.field,
        width: c.width ?? 'minmax(12ch,1fr)',
        align: c.align ?? ('start' as const),
        truncate: 'end' as const,
      })),
      metrics: undefined,
      register: block.source?.replace('register.', ''),
      drawn: true,
    } as BlockResult;
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
      {#if arranging}
        <Button weight="quiet" onclick={() => (adding = true)}>
          <Icon name="plus" size="s" />
          {copy.addBlock}
        </Button>
        <Button weight="bare" onclick={() => arrangement.cancel()}>{copy.arrangeCancel}</Button>
        <Button weight="primary" onclick={commitArrange}>{copy.arrangeDone}</Button>
      {:else}
        <Button weight="bare" href="?src={showSource ? '0' : '1'}">
          <Icon name="copy" size="s" />
          {showSource ? 'Page' : 'Source'}
          <Kbd keys="⇧E" />
        </Button>
        {#if !showSource}
          <Button weight="quiet" onclick={beginArrange}>
            <Icon name="grid" size="s" />
            {copy.arrange}
          </Button>
        {/if}
      {/if}
    {/snippet}
  </PageHead>

  <!-- A LIST while arranging, and nothing while reading. The blocks become a reorderable list only
       in the mode where they are reorderable; announcing "list, 5 items" to somebody reading a page
       is describing the furniture. -->
  <div class="page" role={arranging ? 'list' : undefined}>
    {#if showSource}
      <!-- The declaration as diffable text. A page is a row, so this is the row (19 §2). -->
      <pre class="source"><code>{declaration}</code></pre>
    {:else}
      {#each laid as { slot, block }, at (slot.i)}
        <!-- `drawn: false` means the server evaluated `when:` and said no. A page that shows a
             warning that does not apply teaches people to ignore warnings (06 §1). -->
        {#if block.drawn}
          <section
            class="block-slot"
            id="b-{slot.i + 1}"
            aria-labelledby="h-{slot.i + 1}"
            style="--span:{slot.span}"
            data-arranging={arranging ? '' : undefined}
            role={arranging ? 'listitem' : undefined}
            data-dragging={dragging === at ? '' : undefined}
            draggable={arranging}
            ondragstart={() => (dragging = at)}
            ondragend={() => (dragging = null)}
            ondragover={(e) => arranging && e.preventDefault()}
            ondrop={(e) => {
              e.preventDefault();
              if (dragging !== null) arrangement.move(dragging, at);
              dragging = null;
            }}
            onkeydown={(e) => {
              /* `⌥↑` / `⌥↓` — WCAG 2.5.7's single-pointer alternative, and it calls the same
                 `move` the drag calls rather than re-implementing it.
                 
                 No `tabindex` on the section: keydown BUBBLES from whichever control inside it has
                 focus — the handle, a width button, Move up. A listitem that is itself a tab stop
                 puts a stop in the sequence that does nothing when you land on it. */
              if (!arranging || !e.altKey) return;
              if (e.key === 'ArrowUp') { e.preventDefault(); arrangement.move(at, at - 1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); arrangement.move(at, at + 1); }
            }}
          >
            {#if arranging}
              <BlockBar
                kind={block.kind}
                span={slot.span}
                {at}
                count={laid.length}
                onmove={(to) => arrangement.move(at, to)}
                onspan={(span) => arrangement.setSpan(at, span)}
                onremove={() => arrangement.remove(at)}
              />
            {/if}
            <header class="block-bar">
              <h2 class="block-name" id="h-{slot.i + 1}">{block.heading ?? block.kind}</h2>
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

  <AddBlock bind:open={adding} {slug} register={primary} onadd={add} />
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

  /* ── arranging ────────────────────────────────────────────────────────────
     The block is outlined rather than lifted. A card that grows a shadow the moment a mode opens
     tells you the mode changed the page; an outline tells you the mode changed what you can do TO
     the page, which is the true thing. */
  .block-slot[data-arranging] {
    outline: 1px dashed var(--edge);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
    cursor: grab;
  }

  /* The one moving. Half-visible rather than hidden, so the row you are dragging out of does not
     collapse and re-lay-out under the pointer. */
  .block-slot[data-dragging] {
    opacity: 0.45;
    outline-style: solid;
    outline-color: var(--accent);
  }

  /* A page being arranged is a page whose content is not the point. Dimming the blocks themselves
     puts the controls in front without moving anything — no scale, no lift, no reflow. */
  .block-slot[data-arranging] :global(.block) {
    opacity: 0.65;
    pointer-events: none;
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
