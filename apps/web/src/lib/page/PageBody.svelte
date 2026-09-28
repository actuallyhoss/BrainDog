<!--
  A declared page's blocks, laid out: the twelve-column flow and each block's `span`, the main column and the rail a
  `layout` asks for, the boxed runs a `box: true` section opens, and the block cursor `j` and `k` walk. Every block is
  drawn by `BlockSlot.svelte`; while the page is arranged, each carries its bar and takes a drag.

  ONE LAYOUT WHEREVER A DECLARED PAGE IS DRAWN. `/p/<slug>`, Home's body and a preview all lay their blocks out here, so
  a page Slash proposes with a rail is judged on Decide with its rail, and a use case's Home keeps its columns. It was
  `/p/` alone, and the other two drew a flat stack of blocks (`loop/finish/pages.md` R1).

  A PAGE IS A ROW, NOT A FILE, which is what makes "the Money page" something a freelancer never sees and a studio does
  (06). One request per page load, never one per block: the record answers every block in one read, and this only lays
  out what it answered.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { at as inApp } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { registerHref } from '$lib/record/where.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { COLUMNS, dropInto, nearestInArea, setAreaAt, type Slot } from '$lib/record/arrange.ts';
  import type { LiveBlock, LivePageDecl } from '$lib/record/page-live.ts';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import BlockSlot from './BlockSlot.svelte';
  import { boxesOf, layoutOf, mainSpan, slotOf, splitAreas, sticks, type Run } from './layout.ts';
  import type { Writes } from './page-writes.ts';

  let {
    mode,
    page,
    blocks,
    now,
    writes,
    arrangement = null,
    ids = '',
    level = 2,
  }: {
    /** `page` is `/p/<slug>`, with its keys; `home` and `preview` are drawn inside another screen, which owns the keys. */
    mode: 'page' | 'home' | 'preview';
    /** The page as the record answered it, whose `layout` says whether there is a rail. */
    page: LivePageDecl;
    /** Every block the page draws, declared then added, each at the index its slot keeps. */
    blocks: readonly LiveBlock[];
    now: number;
    /** The page's writes, or `null` where the page is inert. */
    writes: Writes | null;
    /** The page's arrangement while it can be arranged, or `null` where it cannot. */
    arrangement?: Arrangement | null;
    /** What every id this body writes starts with, so two bodies on one screen never share one. */
    ids?: string;
    /** The level each block's name is drawn at. */
    level?: 2 | 3;
  } = $props();

  const arranging = $derived(arrangement?.editing ?? false);

  /* ── the main column and the rail (brief D4) ──────────────────────────────
     A PAGE THAT DECLARES `layout` DRAWS TWO COLUMNS; every other page draws the one flow it always has, through the same
     markup, so nothing below changes for it. `layout.ts` says why the rail is a split of the one list and never a
     second list. */
  const layout = $derived(layoutOf(page));

  /**
   * The blocks in the order and at the widths currently in force, each carrying the index it had in the declaration.
   *
   * `slot.span` is authoritative whether or not the mode is open: it falls back to the declared span when there is no
   * arrangement. Reading `arranging ? slot.span : spanOf(block)` once meant Done kept the ORDER and silently threw away
   * every width: the layout you confirmed was not the layout you got.
   */
  const laid = $derived.by(() => {
    const slots = arrangement?.slots ?? blocks.map((b, i) => slotOf(b, i, layout));
    return slots.map((slot) => ({ slot, block: blocks[slot.i] })).filter((x): x is { slot: Slot; block: LiveBlock } => Boolean(x.block));
  });

  /** Every drawn pair with `at`, its index in `laid`, which is the index the arrangement moves by. */
  type Laid = { slot: Slot; block: LiveBlock; at: number };
  const pairs = $derived<Laid[]>(laid.map((x, at) => ({ ...x, at })));

  /** Each area's pairs, in declared order. The slot says where a block is, because a move to the rail is a slot's. */
  const split = $derived(splitAreas(pairs, layout, (x) => x.slot.area));

  /**
   * THE ORDER A READER MEETS THE BLOCKS IN, which is the main column and then the rail: the order the page draws them
   * in, the order a phone stacks them in, and so the order `j` and `k` walk. On a page with no rail it is `laid`.
   */
  const reading = $derived(layout ? [...split.main, ...split.rail] : pairs);

  /**
   * The runs an area draws in. A boxed section and the blocks after it share one surface while reading; while arranging
   * every block is loose, because a block being moved is a list item and a list item inside a surface inside the list
   * is a listitem whose parent is not the list.
   */
  const runsOf = (list: Laid[]): Run<Laid>[] => (arranging ? [{ box: false, items: list }] : boxesOf(list, (x) => x.block));

  /* WHETHER THE RAIL STAYS IN VIEW, measured, since `sticky: true` is honoured only while the rail fits (`sticks`). The
     room is the scrolling column's height under the page head, the same `--sticky` offset the rail sticks at. */
  let railEl = $state<HTMLElement | null>(null);
  let railHeight = $state(0);
  let room = $state(0);
  $effect(() => {
    const el = railEl;
    if (!el || !layout?.sticky) return;
    const scroller = el.closest('main') ?? document.documentElement;
    const root = getComputedStyle(document.documentElement);
    const px = (token: string) => Number.parseFloat(root.getPropertyValue(token)) || 0;
    const measure = () => {
      room = scroller.clientHeight - px('--sticky') - 2 * px('--sp-4');
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(scroller);
    return () => watch.disconnect();
  });
  const stuck = $derived(sticks(layout, railHeight, room));

  /** A block's element, by the id its slot writes. */
  const slotEl = (i: number): HTMLElement | null => document.getElementById(`${ids}b-${i + 1}`);

  /**
   * The other area, which is where the block's move button sends it.
   *
   * AND FOCUS GOES WITH THE BLOCK. The block leaves one column's keyed list and is made again in the other, so the button
   * just pressed is destroyed and keyboard focus fell to the page's body: the reader who moved a block to the rail had
   * to tab from the top of the page to find it again. Once the page has drawn the move, the same control on the moved
   * block takes focus, so a second press sends it back. `i` is the declared index its slot keeps, which is its id.
   */
  async function toOtherArea(at: number, from: 'main' | 'rail', i: number) {
    if (!arrangement?.slots) return;
    arrangement.slots = setAreaAt(arrangement.slots, at, from === 'rail' ? 'main' : 'rail');
    await tick();
    slotEl(i)?.querySelector<HTMLElement>('.area-move button')?.focus();
  }

  /**
   * One step up or down inside the block's own area. `to` is the position the bar asked for within that area; the
   * arrangement moves by `laid` index, so the step is found there. With no rail this is `at - 1` and `at + 1`.
   */
  function stepInArea(at: number, pos: number, to: number) {
    if (!arrangement) return;
    arrangement.move(at, nearestInArea(arrangement.slots ?? [], at, to < pos ? -1 : 1));
  }

  /** Held while a handle is down, so the drop target knows what is moving. */
  let dragging = $state<number | null>(null);

  /* WHERE IT WILL LAND. A drag with no target shown is a drag you have to complete to find out what it did, and then
     undo. The block under the pointer takes an edge on the side the block will arrive, so the answer is on screen before
     the reader lets go.

     Which edge depends on the block's own width, not on a fixed axis. A full-width block stacks, so top and bottom are
     what "before" and "after" mean and the pointer's Y decides. A block sharing its row reads left to right, so X
     decides. Using one axis for both puts the line on the short edge of half the blocks on the page. */
  let over = $state<{ at: number; edge: 'before' | 'after' } | null>(null);

  /* `stacked` IS WHETHER THE BLOCK HAS THE WHOLE ROW, which a full-width block does and every block in the rail does,
     since the rail is one stack whatever a block's span says. */
  function trackDrop(e: DragEvent, at: number, stacked: boolean) {
    if (!arranging || dragging === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const past = stacked ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    over = { at, edge: past ? 'after' : 'before' };
  }

  /* A DROP ON A BLOCK IN THE OTHER COLUMN MOVES THE HELD BLOCK INTO THAT COLUMN, at the edge it was let go on. With no
     rail it is the drag it always was: `dropInto` is `moveAt` at `dropIndex` when the two areas are the same. */
  function drop() {
    if (arrangement && dragging !== null && over && arrangement.slots) arrangement.slots = dropInto(arrangement.slots, dragging, over.at, over.edge);
    dragging = null;
    over = null;
  }

  /**
   * The block cursor, and the page-scope keys the keymap advertises: `j k`, `↵ Esc`, `o` and `y`.
   *
   * ONLY ON `/p/<slug>`. Home and a preview are drawn inside screens with keys of their own, and a bare `j` that walked
   * a page's blocks there would take the key from the screen it belongs to.
   *
   * It starts at -1, meaning NOWHERE. A cursor drawn on the first block before anybody has pressed a key is a selection
   * state nobody chose.
   */
  let cursor = $state(-1);

  function onkeydown(e: KeyboardEvent) {
    if (mode !== 'page') return;
    /* THE ONE TEST FOR WHETHER SOMEBODY IS TYPING, rather than a narrower copy of it: `typing()` covers an open select
       and a contenteditable block as well as a field. */
    if (typing()) return;
    if (e.metaKey || e.ctrlKey) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`. */
    if (covered()) return;
    /* ⇧E, the source, is the frame's (`PageView.svelte`); every other chord here is bare. */
    if (e.altKey || e.shiftKey || arranging) return;
    if (silenced(e)) return;

    /* THE READING ORDER, so on a page with a rail `j` walks the main column and then the rail, as the page draws them. */
    const list = reading;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, list.length - 1);
      focusBlock();
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      focusBlock();
    } else if (e.key === 'o') {
      const held = list[cursor]?.block;
      const to = held?.register ? registerHref(held.register, held.where) : null;
      if (to) {
        e.preventDefault();
        void goto(inApp(to));
      }
    } else if (e.key === 'y') {
      const slotIndex = list[cursor]?.slot.i;
      if (slotIndex !== undefined) {
        e.preventDefault();
        void copyBlockLink(slotIndex);
      }
    } else if (e.key === 'Enter') {
      /* ENTER THE BLOCK: move real focus inside it, so the block's own keys take over. `j`/`k` walk blocks and the
         letters are bare; once focus is inside a `role="grid"`, `j`/`k` walk ROWS and the same bare letters are the
         grid's. WCAG 2.1.4's focus exception is what makes bare single letters legal at all, and it is satisfied by
         focus actually being somewhere rather than by a variable saying it is. */
      const held = list[cursor];
      if (!held) return;
      e.preventDefault();
      enter(held.slot.i);
    } else if (e.key === 'Escape') {
      /* LEAVE IT. Focus returns to the document and the cursor stays where it was, so Escape is a step back out rather
         than a reset: a mode you leave by losing your place is a mode people stop entering. */
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
   * A `table` block's region is `tabindex="0"` and is the right target; a `bar`'s hole row is a button; a `note` has
   * nothing focusable at all and the block is simply scrolled to, because moving focus to a paragraph and announcing it
   * is worse than not moving. The block's BODY, not its bar: the bar carries a link to the list, which is the `o` key's
   * job and the opposite of entering.
   */
  function enter(slotIndex: number) {
    const section = slotEl(slotIndex);
    const body = section?.querySelector<HTMLElement>('.block, .table-region');
    const target =
      body?.matches('[tabindex]:not([tabindex="-1"])') === true
        ? body
        : (body?.querySelector<HTMLElement>('[role="grid"], a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? null);
    if (target) target.focus();
    else section?.scrollIntoView({ block: 'nearest' });
  }

  /** Scrolls the cursor into view under the sticky head. `.block-slot` already carries the margin. */
  function focusBlock() {
    const slot = reading[cursor]?.slot.i;
    if (slot !== undefined) slotEl(slot)?.scrollIntoView({ block: 'nearest' });
  }

  async function copyBlockLink(slotIndex: number) {
    const url = `${route.url.origin}${route.url.pathname}#${ids}b-${slotIndex + 1}`;
    try {
      await navigator.clipboard.writeText(url);
      toasts.push(copy.copied(copy.blockLink));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- ONE BLOCK, WHEREVER IT IS DRAWN. A snippet, so the main column, the rail and a boxed run draw the same markup, and a
     page with no rail draws exactly what it drew before. -->
{#snippet slotted({ slot, block, at }: Laid)}
  <!-- `rail` is whether the block is drawn in the rail; `pos` and `count` are its place in its own column, which is what
       Move up and Move down step through. -->
  {@const rail = layout !== null && slot.area === 'rail'}
  {@const peers = rail ? split.rail : layout ? split.main : pairs}
  {@const pos = peers.findIndex((x) => x.at === at)}
  {@const count = peers.length}
  {@const stacked = rail || slot.span >= COLUMNS}
  <!-- `drawn: false` means the record evaluated `when:` and said no. A page that shows a warning that does not apply
       teaches people to ignore warnings (06 §1). -->
  {#if block.drawn}
    <!-- A `div` that takes `region` or `listitem`, and NOT a `<section>`. A section is already a region landmark once it
         is named, and ARIA does not let one be a `listitem`, so while arranging every block would carry a role its
         element could not have. `div` and an explicit role say the same thing in both modes and, unlike swapping the
         tag, do not tear the node down and drop focus when the mode changes. -->
    <div
      class="block-slot"
      id="{ids}b-{slot.i + 1}"
      aria-labelledby="{ids}h-{slot.i + 1}"
      style="--span:{slot.span}"
      data-arranging={arranging ? '' : undefined}
      data-cursor={!arranging && mode === 'page' && reading[cursor]?.slot.i === slot.i ? '' : undefined}
      role={arranging ? 'listitem' : 'region'}
      data-dragging={dragging === at ? '' : undefined}
      data-drop={over && over.at === at && dragging !== at ? over.edge : undefined}
      data-stacked={stacked ? '' : undefined}
      draggable={arranging}
      ondragstart={() => (dragging = at)}
      ondragend={() => ((dragging = null), (over = null))}
      ondragover={(e) => trackDrop(e, at, stacked)}
      ondrop={(e) => {
        e.preventDefault();
        drop();
      }}
      onkeydown={(e) => {
        /* `⌥↑` / `⌥↓`, WCAG 2.5.7's single-pointer alternative, calling the same `move` the drag calls. No `tabindex`
           on the slot: keydown BUBBLES from whichever control inside it has focus, and a listitem that is itself a tab
           stop puts a stop in the sequence that does nothing when you land on it. */
        if (!arranging || !e.altKey) return;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          stepInArea(at, pos, pos - 1);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          stepInArea(at, pos, pos + 1);
        }
      }}
    >
      {#if arranging && arrangement}
        <!-- `a` IS A CONSTANT so the callbacks below keep the narrowing they were built under. -->
        {@const a = arrangement}
        <BlockBar
          kind={block.kind}
          span={slot.span}
          columns={block.columns.length}
          at={pos}
          {count}
          onmove={(to) => stepInArea(at, pos, to)}
          onspan={(span) => a.setSpan(at, span)}
          onedit={() => a.edit(at)}
          onremove={() => a.remove(at)}
          widths={!rail}
        />
        <!-- THE KEYBOARD'S WAY ACROSS, as Move up is its way along: a drag onto the other column does the same, and WCAG
             2.5.7 asks for the control that is not a drag. Only on a page with a rail, since a page without one has
             nowhere to send a block. -->
        {#if layout}
          <div class="area-move">
            <Button weight="bare" onclick={() => void toOtherArea(at, rail ? 'rail' : 'main', slot.i)}>
              <Icon name={rail ? 'back' : 'arrow'} size="s" />
              {rail ? copy.moveToMain : copy.moveToRail}
            </Button>
          </div>
        {/if}
      {/if}
      <BlockSlot {block} i={slot.i} {ids} {writes} param={page.param} {arranging} {now} {level} />
    </div>
  {/if}
{/snippet}

<!-- A COLUMN'S BLOCKS, run by run. A boxed section and the blocks after it are one surface, drawn only when one of them
     is drawn, so a box whose every block said no to `when:` leaves no empty panel behind. -->
{#snippet column(list: Laid[])}
  {#each runsOf(list) as run}
    {#if run.box}
      {#if run.items.some((x) => x.block.drawn)}
        <div class="box">
          {#each run.items as x (x.slot.i)}{@render slotted(x)}{/each}
        </div>
      {/if}
    {:else}
      {#each run.items as x (x.slot.i)}{@render slotted(x)}{/each}
    {/if}
  {/each}
{/snippet}

<!-- A LIST while arranging, and nothing while reading. The blocks become a reorderable list only in the mode where they
     are reorderable; announcing "list, 5 items" to somebody reading a page is describing the furniture. ON A PAGE WITH A
     RAIL EACH COLUMN IS ITS OWN LIST while arranging, named, and the page is neither. -->
<div class="page" data-mode={mode} role={arranging && !layout ? 'list' : undefined}>
  {#if layout}
    <!-- TWO COLUMNS, the main one a twelve-column flow of its own so a block's `span` keeps its meaning inside it, and
         the rail one stack. Each is drawn only while it holds a block, so a page whose every block is in one of them
         draws as one column rather than beside an empty part of the screen. -->
    {#if split.main.length > 0}
      <div
        class="area"
        data-area="main"
        style="--area-span:{mainSpan(layout)}"
        role={arranging ? 'list' : undefined}
        aria-label={arranging ? copy.mainColumn : undefined}
      >
        {@render column(split.main)}
      </div>
    {/if}
    {#if split.rail.length > 0}
      <div
        class="area"
        data-area="rail"
        style="--area-span:{layout.rail}"
        data-sticky={stuck ? '' : undefined}
        role={arranging ? 'list' : undefined}
        aria-label={arranging ? copy.sideRail : undefined}
        bind:this={railEl}
        bind:clientHeight={railHeight}
      >
        {@render column(split.rail)}
      </div>
    {/if}
  {:else}
    {@render column(pairs)}
  {/if}
</div>

<style>
  /* TWELVE COLUMNS, and `span` means something: a block's declared `span`, 1 to 12, is its share of the row.

     A FLOW, not a canvas. Blocks fill the row and wrap; there is no x, no y and no hole. 21 §3.1 rejected free placement
     on measured evidence: in Home Assistant's masonry a one-pixel height difference could move a card from the leftmost
     column to the rightmost, and people lost their spatial memory of where a control lived. A flow cannot do that: the
     order you declared is the order you get, at every width.

     `align-items: start` so a half-width block beside a tall one keeps its own height instead of stretching to match.

     THE CAP IS FOR THE PROSE, NOT FOR THE PAGE. The page gets the width a dashboard can use, `--page-max`, and running
     text keeps its own 72ch measure inside the block that has it, rather than every block paying for the one that reads
     like a paragraph. */
  .page {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-7) var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* INSIDE ANOTHER SCREEN THE PAGE TAKES THAT SCREEN'S COLUMN: Home's body and a preview already sit inside a gutter and
     a cap of their own, and a second one inside it would indent the blocks twice. */
  .page[data-mode='home'],
  .page[data-mode='preview'] {
    padding: 0;
    max-inline-size: none;
  }

  /* ── the main column and the rail (brief D4) ──────────────────────────────
     THE TWO COLUMNS ARE SPANS OF THE PAGE'S OWN TWELVE, so the rail's `4` is four of the same twelfths a block's span is
     counted in, and the gutter between the columns is the gutter between blocks. THE MAIN COLUMN IS A TWELVE-COLUMN FLOW
     OF ITS OWN, so `span: 6` there is half the main column, not half the page. THE RAIL IS ONE STACK, and a block's span
     means nothing in it: every block is the rail's width, one under another, each as tall as itself. `align-items:
     start` on `.page` keeps the rail its own height rather than the main column's, and a sticky rail depends on it. */
  .area {
    display: grid;
    grid-column: span var(--area-span, 12);
    align-items: start;
    gap: var(--sp-7) var(--sp-6);
    min-inline-size: 0;
  }

  .area[data-area='main'] {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  /* A RAIL WITH NOTHING IN IT IS NOT DRAWN, and the main column then takes the page rather than leaving a third of it
     empty beside itself. A MAIN COLUMN WITH NOTHING IN IT is not drawn either, and the rail takes the page the same way. */
  .area[data-area='main']:last-child,
  .area[data-area='rail']:first-child {
    grid-column: 1 / -1;
  }

  .area[data-area='rail'] {
    grid-template-columns: minmax(0, 1fr);
    /* Where it sticks, set whether or not it does: the same offset the settings page's sticky list uses, under the page
       head, and the offset this component subtracts when it measures whether the rail fits. */
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .area[data-area='rail'] .block-slot {
    grid-column: auto;
  }

  /* STICKY ONLY WHERE THERE ARE TWO COLUMNS. Under 900px the rail follows the main column, and a rail pinned at the top
     of a phone would cover the column it follows. */
  @media (width >= 900px) {
    .area[data-area='rail'][data-sticky] {
      position: sticky;
    }
  }

  /* A BOXED SECTION'S SURFACE: the section and the blocks after it, up to the next section, on one panel. The page is
     `--bg`, this is one step up at `--s1` with the hairline a lifted panel has, and the cards inside it sit a step above
     that. `--r-lg` because it holds `--r-md` cards with padding between. Inside it the blocks keep their spans, as
     twelfths of the box. */
  .box {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-5) var(--sp-6);
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .area[data-area='rail'] .box {
    grid-template-columns: minmax(0, 1fr);
  }

  /* While arranging, the block's way to the other column, under its bar and at its leading edge. */
  .area-move {
    display: flex;
    margin-block-end: var(--sp-2);
  }

  /* UNDER 900px THE RAIL FOLLOWS THE MAIN COLUMN, the app's one narrow breakpoint, for the reason the page's own single
     column gives below: the declared order is the one thing a narrow screen keeps. At 390 the page is 358px between the
     16px gutters, both columns take all of it, and the rail's blocks come after the main column's in the order they
     were declared. A box drops its inner columns and a step of padding. */
  @media (width < 900px) {
    .area,
    .area[data-area='main'],
    .area[data-area='rail'] {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr);
    }

    .box {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4);
    }
  }

  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses to shrink below its
       content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
    /* The landing line is positioned against this. */
    position: relative;
  }

  /* `#b-4` must not scroll underneath the sticky header. Paid once, per anchor. */
  .block-slot {
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The figure's own bottom margin is the LIST's spacing, and the grid already provides it. Both were applying, so every
     gap on a declared page was 48px where the token says 24. */
  .block-slot :global(.block) {
    margin-block-end: 0;
  }

  /* The cursor is a BAND on the leading edge, not a box around the block. A block is already a bordered card; a second
     border around it reads as two nested boxes rather than as "this one". IN THE FOCUS INK, NOT THE BRAND RED: the
     accent lives only on the mark, the record tile, /start, /signin and `::selection` (design D-1), and a red band
     beside a block reads as that block being late. */
  .block-slot[data-cursor] {
    outline: 2px solid var(--focus-in);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
  }

  /* ── arranging ────────────────────────────────────────────────────────────
     The block is outlined rather than lifted. A card that grows a shadow the moment a mode opens tells you the mode
     changed the page; an outline tells you the mode changed what you can do TO the page, which is the true thing. */
  .block-slot[data-arranging] {
    outline: 1px dashed var(--edge);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
    cursor: grab;
  }

  /* THE LANDING LINE. A 3px bar on the edge the held block will arrive at, drawn with a pseudo-element so it sits over
     the block's own border rather than moving it: a border that appears on hover reflows the grid under the pointer,
     which makes a drag feel like it is fighting you. `--z-raise` because it clears its own sibling inside one local
     stacking context, above it and below every overlay. */
  .block-slot[data-drop]::after {
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    background: var(--ink);
    border-radius: var(--r-pill);
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

  /* The one moving. Half-visible rather than hidden, so the row you are dragging out of does not collapse and re-lay-out
     under the pointer. */
  .block-slot[data-dragging] {
    opacity: 0.45;
    outline-style: solid;
    outline-color: var(--ink);
  }

  /* A PAGE BEING ARRANGED IS A PAGE WHOSE CONTENT IS NOT THE POINT, and the hierarchy is built by RAISING the controls
     rather than sinking the content through the contrast floor: the block recedes onto the sunk surface, its own borders
     soften, and the bar above it keeps full contrast, so the text stays readable, which it has to be to know which block
     you are holding. */
  .block-slot[data-arranging] :global(.block) {
    pointer-events: none;
  }

  .block-slot[data-arranging] :global(.block) > :global(*) {
    background: var(--sunk);
    border-color: color-mix(in srgb, var(--line) 55%, transparent);
  }

  /* ONE COLUMN below 900px, in declaration order. 13 §10 has two breakpoints and 05 §6 allows width to change LAYOUT but
     never size. Collapsing to one column keeps the only thing a span was ever encoding, which block comes after which,
     and that is precisely the property masonry lost. There is no second stored layout for narrow, because a second
     layout is a second thing to keep in sync and nobody ever does. */
  @media (width < 900px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .block-slot {
      grid-column: auto;
    }
  }

  /**
   * A STAT IN A NARROW SLOT STACKS ITS FIGURES, because a slot on this page is narrower than a phone long before the
   * window is, and every rule below this one is keyed to the VIEWPORT.
   *
   * `/p/portfolio` puts a two-figure stat in a four-column slot. Measured in Chromium on the shipped record, that block
   * is 267px wide in a 1180px window, 215px at 1024 and 174px at 900, which leaves each cell 117.7px, 91.7px and 71px.
   * `£22,600.00` draws 123px at `--t-xl`, so 5px, 31px and 52px of it were cut off: a money figure drawn short a digit,
   * on a laptop, on a screen whose whole job is to say how much.
   *
   * THE LAYOUT GATE CANNOT SEE THIS and never could. It reports an element only when it reaches past the window with
   * nothing scrolling above it, and a figure overflowing a 117px cell in the middle of the page does neither.
   *
   * STACKED RATHER THAN SHRUNK, AND NOTHING DROPPED. A figure longer than its tile already steps down inside it
   * (`blocks.css` reads `--chars`), and that mark is put on a figure only above ten characters, which `£22,600.00` is
   * exactly not. What this page has instead is room down the column: one figure a row draws the whole amount at the size
   * every other figure on the page reads at.
   *
   * 288px IS THE ROW'S OWN ARITHMETIC RATHER THAN A DEVICE, and it was 280 until the same figure was drawn on Linux. Two
   * cells of 123px with the 32px gap between them need 278px, and 280 left `£22,600.00` 0.8px in a 124px cell on
   * Windows. The same woff2 on a hosted ubuntu image draws about 1.6 per cent wider, 125.2px, which is past that cell.
   * `record/figure-fit.test.ts` asks for two per cent of room in the face the runner draws, so on Linux two cells need
   * 2 x 127.7 + 32 = 287.4px. 288 leaves each 128px: 3.9 per cent on Windows and about 2.2 on Linux. It stops at 288
   * because the phone is untouched at both ends of its range and has to stay so: the slot there is the page itself,
   * 358px at 390 and exactly 288px at 320, and the query is strictly less than, so neither stacks.
   *
   * AND THE THRESHOLD IS px WHERE EVERY OTHER QUERY IN THIS SYSTEM IS rem, because the width it guards is a px width:
   * `--t-xl` is 24px whatever the root font size is, so the figure stays 123px and a rem threshold would be the only
   * thing that moved. Written as `17.5rem` it was measured firing on a phone with the browser's own font size set to
   * Large, which undid the two-up strip a phone drew then for figures that were never in any danger.
   */
  @container (inline-size < 288px) {
    .block-slot :global(.grid:has(> .cell:nth-child(2))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* A BOARD ON A PHONE STACKS ITS LANES. A stat is not restacked here: under 480px of block it is rows, label on the
     left and figure on the right, drawn by blocks.css (DSN-8), and above that its own container steps decide. */
  @media (width < 640px) {
    .block-slot :global(.grid:not(:has(> .cell))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
