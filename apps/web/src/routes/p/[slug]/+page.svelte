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
  import { titleOf } from '$lib/title.ts';
  import { KINDS, isKind } from 'braindog-render';
  import { Block, Degraded, Table } from 'braindog-render/svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { REGISTERS, hueOf, iconFor, page as readPage, values, type BlockResult } from '$lib/record/api.ts';
  import { draw } from '$lib/record/blocks.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import AddBlock from '$lib/ui/AddBlock.svelte';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { COLUMNS, dropIndex, spanOf as declaredSpan } from '$lib/record/arrange.ts';
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
  const spanOf = (block: BlockResult) => declaredSpan(block.kind, block.span, block.columns.length);

  /* ── arranging ─────────────────────────────────────────────────────────────
     A MODE, not an always-on affordance. Drag handles on a page you are reading are noise, and an
     accidental drag that rewrites a row is the kind of edit nobody can attribute later. */
  const arrangement = new Arrangement();
  const arranging = $derived(arrangement.editing);

  /**
   * The block's predicate, minus the clause that restates the page.
   *
   * A project page filters every block by the same project, so every block header repeated `thing
   * is Kiln` under a heading on the page called Kiln. It is the one clause the reader is certainly
   * not missing, and it was the longest.
   */
  /**
   * The predicate a reader sees, MINUS the clause that names the page they are already on.
   *
   * "thing is Kiln" under a heading on the Kiln page is the one fact the reader cannot be missing,
   * and the rest of the predicate has to stay or a block of four rows reads as the whole register.
   *
   * The clause is now identified rather than guessed. This used to drop any clause whose text ENDED
   * with the page title, which is a string heuristic standing in for a fact the declaration did not
   * carry — and it was the admission that the name should never have been typed into the predicate.
   * A resolved page knows its own parameter, so the comparison is exact.
   */
  const param = $derived(result?.page.param);
  const whereOf = (block: { where?: string | undefined }): string =>
    (block.where ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c && !(param && c.toLowerCase() === `thing is ${param.title.toLowerCase()}`))
      .join(', ');

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

  /* WHERE IT WILL LAND. A drag with no target shown is a drag you have to complete to find out
     what it did, and then undo. The block under the pointer takes an accent edge on the side the
     block will arrive, so the answer is on screen before the reader lets go.

     Which edge depends on the block's own width, not on a fixed axis. A full-width block stacks,
     so top and bottom are what "before" and "after" mean and the pointer's Y decides. A block
     sharing its row reads left to right, so X decides. Using one axis for both puts the line on
     the short edge of half the blocks on the page. */
  let over = $state<{ at: number; edge: 'before' | 'after' } | null>(null);

  function trackDrop(e: DragEvent, at: number, span: number) {
    if (!arranging || dragging === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const stacked = span >= COLUMNS;
    const past = stacked ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    over = { at, edge: past ? 'after' : 'before' };
  }

  function drop() {
    if (dragging !== null && over) arrangement.move(dragging, dropIndex(dragging, over.at, over.edge));
    dragging = null;
    over = null;
  }

  let adding = $state(false);

  /**
   * The block cursor, and the five page-scope keys the keymap has always advertised.
   *
   * `j k`, `↵ Esc`, `o`, `y` and `⇧E` are registered in `keys.svelte.ts` and printed on `?`, and
   * not one of them did anything — the `<Kbd>` chips beside the block bars were advertisements for
   * bindings that did not exist. A keymap that lists a key which does nothing is worse than one
   * that omits it: the reader tries it, nothing happens, and now they distrust the whole sheet.
   *
   * It starts at -1, meaning NOWHERE. A cursor drawn on the first block before anybody has pressed
   * a key is a selection state nobody chose, and every page opened with a red band down its first
   * figure.
   */
  let cursor = $state(-1);

  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey) return;

    /* ⇧E toggles the declaration. Shift, not a bare `e`, because bare `e` means edit-in-place
       inside a grid and a key's meaning must be a function of the object in focus rather than of
       the page you happen to be on. */
    if (e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      void goto(`?src=${showSource ? '0' : '1'}`, { replaceState: true, noScroll: true });
      return;
    }
    if (e.altKey || e.shiftKey || showSource || arranging) return;

    const blocks = laid;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, blocks.length - 1);
      focusBlock();
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      focusBlock();
    } else if (e.key === 'o') {
      const register = blocks[cursor]?.block.register;
      if (register) {
        e.preventDefault();
        void goto(`/r/${register}`);
      }
    } else if (e.key === 'y') {
      const slotIndex = blocks[cursor]?.slot.i;
      if (slotIndex !== undefined) {
        e.preventDefault();
        void copyBlockLink(slotIndex);
      }
    } else if (e.key === 'Enter') {
      /* ENTER THE BLOCK: move real focus inside it, so the block's own keys take over.
         
         This is the whole reason the two altitudes exist. `j`/`k` walk blocks and the letters are
         bare; once focus is inside a `role="grid"`, `j`/`k` walk ROWS and the same bare letters are
         the grid's. WCAG 2.1.4's focus exception is what makes bare single letters legal at all, and
         it is satisfied by focus actually being somewhere rather than by a variable saying it is. */
      const held = blocks[cursor];
      if (!held) return;
      e.preventDefault();
      enter(held.slot.i);
    } else if (e.key === 'Escape') {
      /* LEAVE IT. Focus returns to the document and the cursor stays where it was, so Escape is a
         step back out rather than a reset — a mode you leave by losing your place is a mode people
         stop entering. */
      const inside = document.activeElement;
      if (inside instanceof HTMLElement && inside !== document.body) {
        e.preventDefault();
        inside.blur();
      }
    }
  }

  /**
   * The first thing inside a block that can take focus.
   *
   * A `table` block's region is `tabindex="0"` and is the right target; a `bar`'s hole row is a
   * button; a `note` has nothing focusable at all and the block is simply scrolled to, because
   * moving focus to a paragraph and announcing it is worse than not moving.
   */
  function enter(slotIndex: number) {
    const section = document.getElementById(`b-${slotIndex + 1}`);
    /* The block's BODY, not its bar. The bar carries a link to the register, which is the first
       focusable descendant of the section — so an unscoped query put `↵` on "open the register",
       which is the `o` key's job and the opposite of entering. */
    const body = section?.querySelector<HTMLElement>('.block, .table-region');
    const target =
      body?.matches('[tabindex]:not([tabindex="-1"])') === true
        ? body
        : (body?.querySelector<HTMLElement>(
            '[role="grid"], a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? null);
    if (target) target.focus();
    else section?.scrollIntoView({ block: 'nearest' });
  }

  /** Scrolls the cursor into view under the sticky head. `.block-slot` already carries the margin. */
  function focusBlock() {
    const slot = laid[cursor]?.slot.i;
    if (slot !== undefined) document.getElementById(`b-${slot + 1}`)?.scrollIntoView({ block: 'nearest' });
  }

  async function copyBlockLink(slotIndex: number) {
    const url = `${route.url.origin}${route.url.pathname}#b-${slotIndex + 1}`;
    try {
      await navigator.clipboard.writeText(url);
      toasts.push(copy.copied(copy.blockLink));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

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
      ...(template ?? { rows: [], entries: [], matched: [], total: 0, drawn: true, stale_at: '' }),
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

<svelte:head><title>{titleOf(result?.page?.title)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !result}
  <div class="page">
    <Empty kind="error" heading title="Couldn't load {slug}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(result.page.icon, 'doc')} hue={hueOf(result.page.identity)} kicker={result.page.nav?.section} title={result.page.title}>
    {#snippet actions()}
      {#if arranging}
        <Button weight="quiet" onclick={() => (adding = true)}>
          <Icon name="plus" size="s" />
          {copy.addBlock}
        </Button>
        <Button weight="bare" onclick={() => arrangement.cancel()}><Icon name="close" size="s" />{copy.arrangeCancel}</Button>
        <Button weight="primary" onclick={commitArrange}><Icon name="check" size="s" />{copy.arrangeDone}</Button>
      {:else}
        <Button weight="bare" href="?src={showSource ? '0' : '1'}">
          <Icon name="code" size="s" />
          {showSource ? 'Page' : 'Source'}
          <Kbd keys="⇧E" />
        </Button>
        <!-- ARRANGING IS A DESKTOP SURFACE. 13 §10: "Authoring: read and approve, do not author. The
             page builder and pack builder are desktop surfaces." A drag-to-reorder mode on a phone
             is a mode where every gesture competes with the scroll, and the button is absent rather
             than disabled — a control that exists and refuses is worse than one that does not. -->
        {#if !showSource}
          <span class="arrange-slot">
            <Button weight="quiet" onclick={beginArrange}>
              <Icon name="grid" size="s" />
              {copy.arrange}
            </Button>
          </span>
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
      <!-- `tabindex="0"`: it is a long scrolling code block, and a scrolling box a keyboard cannot
           focus is a box a keyboard cannot read. Named, so tabbing into it says what it is. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="source" tabindex="0" aria-label={copy.declarationOf(result.page.title)}><code
          >{declaration}</code></pre>
    {:else}
      {#each laid as { slot, block }, at (slot.i)}
        <!-- `drawn: false` means the server evaluated `when:` and said no. A page that shows a
             warning that does not apply teaches people to ignore warnings (06 §1). -->
        {#if block.drawn}
          {@const drawn = draw(block)}
          <!-- A `div` that takes `region` or `listitem`, and NOT a `<section>`. A section is already
               a region landmark once it is named, and ARIA does not let one be a `listitem` — so
               while arranging, every block on the page carried a role its element could not have.
               `div` + an explicit role says the same thing in both modes and, unlike swapping the
               tag, does not tear the node down and drop focus when the mode changes. -->
          <div
            class="block-slot"
            id="b-{slot.i + 1}"
            aria-labelledby="h-{slot.i + 1}"
            style="--span:{slot.span}"
            data-arranging={arranging ? '' : undefined}
            data-cursor={!arranging && !showSource && at === cursor ? '' : undefined}
            role={arranging ? 'listitem' : 'region'}
            data-dragging={dragging === at ? '' : undefined}
            data-drop={over && over.at === at && dragging !== at ? over.edge : undefined}
            data-stacked={slot.span >= COLUMNS ? '' : undefined}
            draggable={arranging}
            ondragstart={() => (dragging = at)}
            ondragend={() => ((dragging = null), (over = null))}
            ondragover={(e) => trackDrop(e, at, slot.span)}
            ondrop={(e) => {
              e.preventDefault();
              drop();
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
                columns={block.columns.length}
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
                <!-- THE REGISTER'S NAME, not its id. This line is provenance a person reads, and
                     it was printing `obligations` where the rest of the product says Obligations —
                     the data model's spelling, on every block, on every page.

                     The predicate stays, because without it a reader has no way to know the list is
                     filtered and may take a block of four rows for the whole register. But the
                     clause that names the page you are already on is dropped: "thing is Kiln" under
                     a heading on the Kiln page is the one fact the reader cannot be missing. -->
                <a class="block-source" href="/r/{block.register}">
                  {REGISTERS[block.register]?.name ?? block.register}
                  {#if whereOf(block)}<span class="block-where">{whereOf(block)}</span>{/if}
                  <Kbd keys="o" />
                </a>
              {/if}
            </header>

            <!-- Never hidden and never centred: the page's shape is information, and a page that
                 silently shrinks teaches that blocks come and go (19 §6). ONE surface for all
                 sixteen kinds, so "nothing matched" and "this block is broken" are told apart. -->
            {#if drawn.refusal}
              <Empty
                compact
                kind={drawn.refusal.kind}
                title={drawn.refusal.title}
                body={drawn.refusal.body}
                lines={drawn.refusal.lines}
              />
            {:else if block.kind === 'table'}
              <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} />
            {:else}
              {#each drawn.segments as segment}
                {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
              {/each}
            {/if}
          </div>
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
  /* THE CAP IS FOR THE PROSE, NOT FOR THE PAGE. It used to be 1180px flat, which fitted a 1440
     laptop exactly and then stopped: at 1920 it left 496px of the main column empty, and at 2560 it
     left 1136px — half the screen, on a page whose whole job is to put four things side by side.

     A limit is still right, because a twelfth of 2560px is not a column anybody scans, and a table
     row two and a half thousand pixels wide is a row the eye loses on the way back. But the thing
     that actually needs a measure is running text, and `.measure` already caps that at 72ch inside
     the block that has it. So the page gets the width a dashboard can use and prose keeps its own
     limit, rather than every block on every page paying for the one that reads like a paragraph. */
  .page {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1560px;
  }

  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses
       to shrink below its content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
    /* The landing line is positioned against this. */
    position: relative;
  }

  /* A hairline under every block header. It is the cheapest structure available: it says where a
     block starts without drawing a box around it, so the page keeps its flatness and stops reading
     as one long list. The source link sits on the same line, so the rule also ties the two halves
     of the header together instead of leaving them floating at opposite ends of the block. */
  .block-bar {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-4);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  /* A BLOCK NAME IS A HEADING AND SHOULD LOOK LIKE ONE. At `--t-ui` and weight 500 in `--ink2` it
     was the same size, weight and colour as the body text underneath it, so a page of six blocks
     read as one undifferentiated column and the eye had nothing to jump between. It is the second
     level of the page's hierarchy — under the page title, over everything in the block — and now
     it is sized and weighted like it. */
  .block-name {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  /* Every block header names its source, and `o` opens that register PRE-FILTERED to the block's
     own `where:`. That is the down half of the two-altitude ladder, and nothing may break it. */
  .block-source {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .block-source:hover {
    color: var(--ink);
  }

  /* TWO ALTITUDES, BUILT UPWARD FROM THE FLOOR. The register name is the louder half and the
     predicate the quieter one, and the obvious way to say that — `--dim` on both, then
     `opacity: 0.8` on the predicate — put it under the contrast floor in light. `--dim` is solved
     to CLEAR that floor, so any opacity on top of it spends the whole margin the theme just
     bought; the theme was right and this call site was wrong. Raising the register name says the
     same thing and costs nothing, because the ceiling has room and the floor does not. */
  .block-where {
    color: var(--dim);
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

  /* The cursor is a BAND on the leading edge, not a box around the block. A block is already a
     bordered card; a second border around it reads as two nested boxes rather than as "this one".
     The same 2px inset the register grid uses for its focused row, for the same reason. */
  .block-slot[data-cursor] {
    box-shadow: inset 3px 0 0 0 var(--accent);
    border-radius: var(--r-sm);
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

  /* THE LANDING LINE. A 3px accent bar on the edge the held block will arrive at, drawn with an
     outline-style pseudo-element so it sits over the block's own border rather than moving it —
     a border that appears on hover reflows the grid under the pointer, which makes a drag feel
     like it is fighting you. `inset-inline` / `inset-block` so it mirrors under rtl for free. */
  .block-slot[data-drop]::after {
    content: '';
    position: absolute;
    z-index: 1;
    background: var(--accent);
    border-radius: 999px;
    pointer-events: none;
  }

  /* Side by side: a vertical line on the leading or trailing edge. */
  .block-slot[data-drop='before']::after,
  .block-slot[data-drop='after']::after {
    inset-block: calc(var(--sp-2) * -1);
    inline-size: 3px;
  }

  .block-slot[data-drop='before']::after {
    inset-inline-start: calc(var(--sp-3) * -1);
  }

  .block-slot[data-drop='after']::after {
    inset-inline-end: calc(var(--sp-3) * -1);
  }

  /* Full width: it stacks, so the line goes across the top or the bottom instead. */
  .block-slot[data-stacked][data-drop='before']::after,
  .block-slot[data-stacked][data-drop='after']::after {
    inset-inline: calc(var(--sp-2) * -1);
    inset-block: auto;
    inline-size: auto;
    block-size: 3px;
  }

  .block-slot[data-stacked][data-drop='before']::after {
    inset-block-start: calc(var(--sp-3) * -1);
  }

  .block-slot[data-stacked][data-drop='after']::after {
    inset-block-end: calc(var(--sp-3) * -1);
  }

  /* The one moving. Half-visible rather than hidden, so the row you are dragging out of does not
     collapse and re-lay-out under the pointer. */
  .block-slot[data-dragging] {
    opacity: 0.45;
    outline-style: solid;
    outline-color: var(--accent);
  }

  /* A page being arranged is a page whose content is not the point, and the obvious way to say so —
     `opacity: 0.65` on the block — put every word in it under the contrast floor. In a mode a
     person is actively working in, for as long as they are in it.

     It is the same mistake as `.block-where`, and the same fix: build the hierarchy by RAISING the
     controls rather than sinking the content through the floor. The block recedes onto the sunk
     surface, its own borders soften, and the control bar above it keeps full contrast — so the
     blocks read as objects being moved rather than as text you are meant to be reading, and the
     text stays readable, which it has to be to know which block you are holding.

     The gate only caught this once transitions were killed. Before that, axe kept measuring the
     opacity mid-transition and reporting a pass, which is a gate agreeing with itself. */
  .block-slot[data-arranging] :global(.block) {
    pointer-events: none;
  }

  .block-slot[data-arranging] :global(.block) > :global(*) {
    background: var(--sunk);
    border-color: color-mix(in srgb, var(--line) 55%, transparent);
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

    .arrange-slot {
      display: none;
    }

    /* The query a block was drawn from is PROVENANCE, and on a phone it is two lines of monospace
       above every block competing with the block's own heading. It is a desktop affordance for the
       same reason the source link beside it is. */
    .block-where {
      display: none;
    }
  }

  /* A stat's cells are declared, so the block cannot infer how many to draw (05 §4) — but the HOST
     may restack what it was given, and three figures across a 358px phone breaks `GBP 4,050.00`
     into two lines. Home already does this for its own stat; a declared page needs it too. */
  @media (width < 640px) {
    .block-slot :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
    }

    .block-slot :global(.cell + .cell) {
      border-inline-start: 0;
      border-block-start: 1px solid var(--line);
    }
  }

  /* No keyboard to press it with, so no chord to advertise.
     
     BOTH QUERIES, because they answer different questions and neither is sufficient. `pointer:
     coarse` is the honest test — 05 §6, size follows the pointer and never the width — but a
     touchscreen laptop reports coarse with a keyboard attached, and a phone in a headless browser
     may not report it at all. The width query is the blunt one that catches the phone. */
  @media (pointer: coarse), (width < 640px) {
    .block-source :global(.kbd) {
      display: none;
    }
  }
</style>
