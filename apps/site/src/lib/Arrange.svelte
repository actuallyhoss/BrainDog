<!--
  The proof that the record rearranges itself, drawn rather than photographed.

  Five near-identical screenshots of a navigation rail is five downloads of the same picture with
  three words changed in each. This is the rail itself, drawn once, with the five arrangements
  swapped through it — which is both smaller and more honest, because what differs between the use
  cases is exactly the list of rows and nothing else.

  IT IS A REAL TAB CONTROL, not five buttons and a `{#if}`. `role="tablist"`, arrow keys, a roving
  `tabindex`, and one panel per case wired to its own tab — so a keyboard reaches the five
  arrangements the way it reaches any other tabs, and a screen reader is told which of them it is
  looking at. The selected option is marked by weight and by a lifted ground, never by hue alone.

  EVERY PANEL IS RENDERED AND ONLY ONE IS VISIBLE, stacked in a single grid cell. That is what
  makes the cross-fade possible, and it is also what keeps the rail one height: the box is as tall
  as the longest arrangement from the first paint, so choosing a different one moves nothing on the
  page. The ones not chosen are `visibility: hidden`, which takes them out of the tab order and out
  of the accessibility tree as well as out of sight.

  THE TAB IDS ARE THE USE-CASE IDS (`uc-personal`, `uc-student`, …). `loop/DIRECTION.md` §11 is the
  owner's word that this product is for everyone, and `test/content.test.ts` holds the page to it by
  looking each use case up by that id. The tablist needs an id per tab regardless, so the check
  stays pointed at a real control rather than at something kept alive for it.
-->
<script lang="ts">
  /** One use case, as `copy.ts` writes it: an id, what to call it, and the rail it arranges. */
  type Case = { id: string; label: string; holds: readonly string[] };

  /* NO DEFAULTS ON THE TWO STRINGS A READER SEES. `head` and `label` are copy, and all of this
     site's copy lives in `copy.ts` where the content test can scan it. A default here would be a
     second, invisible copy deck: a call site that forgot `label` would ship a different accessible
     name for the control and nothing would fail. Required props make that a type error instead. */
  let {
    cases,
    head,
    label,
  }: {
    /** `site.arrange.cases`. The first is selected. */
    cases: readonly Case[];
    /** The row at the top of the rail, where the real sidebar puts the record you are in. */
    head: string;
    /** The accessible name of the segmented control, for a reader who cannot see it is one. */
    label: string;
  } = $props();

  let selected = $state(0);

  /* The five buttons, so an arrow key can move focus as well as selection — a roving `tabindex`
     without a focus move is a control that announces the wrong thing. */
  let tabs: (HTMLButtonElement | null)[] = $state([]);

  /**
   * The one way in. Pointer and keyboard both come through here, because the focus move is not
   * optional: the roving `tabindex` puts `0` on the selected tab and `-1` on the rest, so if
   * selection moves without focus following it, focus is sitting on a tab the control has just
   * taken out of the tab order. Most browsers focus a button on click and would have hidden that
   * from us; Safari on macOS does not focus a clicked button by default, and there the bug is
   * visible.
   */
  function choose(i: number) {
    selected = i;
    tabs[i]?.focus();
  }

  /**
   * LEFT AND RIGHT, NOT UP AND DOWN. The tablist carries no `aria-orientation`, so it is
   * horizontal, and the WAI-ARIA Authoring Practices tabs pattern gives a horizontal tablist the
   * left and right arrows and keeps up and down for a vertical one. Claiming up and down anyway
   * would cost a keyboard user the page scroll for as long as one of these five pills holds
   * focus, which is a real loss in exchange for a second way of doing what left and right already
   * do. Home and End stay: they are in the pattern and they collide with nothing.
   *
   * `preventDefault` is reached only after a key has matched, so every key this control does not
   * claim is left to the browser.
   */
  function onkeydown(event: KeyboardEvent) {
    const n = cases.length;
    if (n === 0) return;

    const steps: Record<string, number> = {
      ArrowRight: (selected + 1) % n,
      ArrowLeft: (selected - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };

    const at = steps[event.key];
    if (at === undefined) return;
    event.preventDefault();
    choose(at);
  }
</script>

<div class="arrange">
  <div class="strip">
    <div class="in">
      <!-- THE SEGMENT COUNT COMES FROM THE LIST, so adding a sixth use case to `copy.ts` widens the
           grid rather than overflowing a five-column rule written in the stylesheet. -->
      <div class="tabs" role="tablist" aria-label={label} style="--tab-count: {cases.length}">
        {#each cases as c, i (c.id)}
          <button
            bind:this={tabs[i]}
            class="tab"
            type="button"
            role="tab"
            id="uc-{c.id}"
            aria-controls="uc-{c.id}-rail"
            aria-selected={i === selected}
            tabindex={i === selected ? 0 : -1}
            onclick={() => choose(i)}
            {onkeydown}
          >
            <span class="tab-label">{c.label}</span>
            <!-- THE COUNT IS `holds.length` AND NOT A TYPED NUMBER, so it cannot disagree with the
                 list under it. `copy.ts` is the one place a case's parts are written down, and a
                 second place saying how many there are is a second place to be wrong. -->
            <span class="tab-count num">{c.holds.length} parts</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="in rail-wrap">
    <div class="rail">
      <p class="rail-head">{head}</p>
      <div class="stack">
        {#each cases as c, i (c.id)}
          <div
            class="panel"
            class:on={i === selected}
            role="tabpanel"
            id="uc-{c.id}-rail"
            aria-labelledby="uc-{c.id}"
            tabindex="0"
          >
            <ul class="holds">
              {#each c.holds as hold}
                <li class="hold"><span class="mark" aria-hidden="true"></span><span class="name">{hold}</span></li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* BLOCK FLOW AND NOT A COLUMN FLEX, and the reason is worth writing down because it cost a
     rebuild to see: `.in` carries `margin-inline: auto`, and an auto margin on a flex item in the
     cross axis absorbs the free space instead of stretching, so the rail came out shrink-to-fit at
     257px of a 1,136px column and centred. In normal flow the same two rules give the column its
     full width. */
  .arrange {
    inline-size: 100%;
  }

  .rail-wrap {
    margin-block-start: var(--sp-6);
  }

  /**
   * THE CONTROL IS A STRIP ACROSS THE SCREEN, and that is the whole of why this component is now
   * a child of the band rather than of the band's column.
   *
   * `loop/research-site-reference.md` §5 counts the layouts each reference uses before it repeats
   * one: FirstLook ten in ten, and brain.dog one in six. The first pass got that to about five in
   * seven because three bands were still the same armature, copy on the left and a widget on the
   * right. A control that runs the full width of the viewport, under two hairlines that run with
   * it, is a shape no other band on this page has, and it costs two rules rather than a new
   * component. The same file counts 64 to 145 hairlines per page on PostHog and 68 on Linear
   * against one for the whole of our old document, so two more full-bleed ones are a gain and not
   * a decoration.
   *
   * The BUTTONS stay inside `.in`. The strip's rules are the page's edge; the things a reader
   * points at belong in the same 1,200px column everything else on the site is set in.
   */
  .strip {
    border-block: 1px solid var(--line);
    background: var(--s1);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
  }

  .tab {
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* The count is a second line only once the control is a row of segments. In the pill form below
     760px there is no room for it and the label alone is the control. */
  .tab-count {
    display: none;
  }

  .tab:hover {
    background: var(--hover-wash);
    border-color: var(--edge);
    color: var(--ink);
  }

  /* CHOSEN, SAID THREE WAYS AND NONE OF THEM A HUE: heavier, on a lifted ground, inside an ink
     edge. Colour alone would leave the control unreadable to a reader who cannot see the
     difference between two greys. */
  .tab[aria-selected='true'] {
    background: var(--s1);
    border-color: var(--ink);
    color: var(--ink);
    font-weight: 600;
  }

  /**
   * FIVE SEGMENTS OF THE COLUMN, WHERE THERE IS ROOM FOR FIVE.
   *
   * 760px is the measured floor. A segment is a fifth of the column less its own 32px of padding,
   * so at 760 it holds 107px of label and the longest of the five, `Solo founder`, measures about
   * 92px at 16px in the UI face. At 700 the same sum gives 95px against 92, which is a two-pixel
   * margin on a font the reader may have overridden, and a label that does not fit does not wrap:
   * `white-space: nowrap` is on the button above. Below 760 the control goes back to pills that
   * wrap, and below 640 to the one line that scrolls.
   *
   * A segment is not a pill, so the selected one is marked by a 2px rule along its top edge as
   * well as by its ground and its weight, and the unselected ones carry the same rule in
   * `transparent` so nothing moves when the choice changes.
   */
  @media (width >= 760px) {
    .tabs {
      display: grid;
      grid-template-columns: repeat(var(--tab-count, 5), minmax(0, 1fr));
      gap: 0;
      padding-block: 0;
    }

    .tab {
      display: flex;
      flex-direction: column;
      align-items: start;
      justify-content: center;
      gap: var(--sp-1);
      min-block-size: 64px;
      padding: var(--sp-3) var(--sp-4);
      background: transparent;
      border: 0;
      border-inline-start: 1px solid var(--line);
      border-block-start: 2px solid transparent;
      border-radius: 0;
      font-size: var(--t-base);
    }

    .tab:first-child {
      border-inline-start: 0;
    }

    .tab:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }

    .tab[aria-selected='true'],
    .tab[aria-selected='true']:hover {
      background: var(--bg);
      border-block-start-color: var(--ink);
      color: var(--ink);
    }

    .tab-count {
      display: block;
      color: var(--dim);
      font-family: var(--font-id);
      font-size: var(--t-xs);
      font-weight: 400;
    }
  }

  /**
   * THE RAIL, AND THE 240px CAP IS GONE.
   *
   * It was `max-inline-size: var(--rail)`, which is the record app's own sidebar proportion, and
   * the argument for it was that this drawing should be the app's rail rather than a list. The
   * argument was right about the ROWS and wrong about the BOX, and
   * `loop/research-site-reference.md` measured the cost: the band this component sits in used 529
   * of 1,440 pixels, 37 per cent, with the right two thirds of it empty, and 21 per cent of that
   * band's rows carried no ink at all. A 240px box in a 1,136px column is not a sidebar, it is a
   * sidebar-shaped hole.
   *
   * What makes it read as a rail is unchanged and is where it always was: the `Switch record`
   * line above a hairline, rows at `--rail-item-h`, a mark where the app draws a glyph, a sunk
   * ground inside a hairline. Those are the app's proportions. The width of the box is the page's
   * business, and the page now gives it a column to fill.
   */
  .rail {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    padding: var(--sp-2);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* The one cell every arrangement is drawn in, so the box is the height of the longest of them
     and choosing another moves nothing on the page. */
  .stack {
    display: grid;
  }

  .panel {
    grid-area: 1 / 1;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--d-state) var(--ease-out),
      visibility var(--d-state) var(--ease-out);
  }

  .on {
    opacity: 1;
    visibility: visible;
  }

  /* THE ROW THE REAL SIDEBAR PUTS AT ITS TOP, where `Switch record` sits: what you are in, above
     a hairline, before the list of where you can go. One line, and it is the line that makes the
     box read as a rail rather than as bullets. */
  .rail-head {
    padding-inline: var(--sp-2);
    padding-block-end: var(--sp-1);
    margin-block-end: var(--sp-1);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 1;
  }

  /**
   * A GRID AND NOT A BALANCED MULTI-COLUMN, now that the rail is the width of the column.
   *
   * `columns: 2` filled a column downwards before it started the next one, which reads correctly
   * in a narrow box and wrongly in a wide one: at five columns a reader's eye goes across the row
   * and the list would have gone down. A grid lays the names in source order, left to right, and
   * an arrangement with fewer names than cells simply leaves the last cells empty rather than
   * rebalancing every column when the case changes.
   *
   * Five columns and not four or six, because the longest arrangement `copy.ts` declares holds ten
   * names, and ten across five is exactly two rows. Every other case is one row or two, so the box
   * is the same height whichever of the five is chosen and choosing one moves nothing below it.
   */
  .holds {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hold {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--rail-item-h);
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* Where the rail draws a glyph. There is no glyph to draw for a row that is only a name, and a
     column of bare words does not read as a rail, so it is a mark and not an icon. */
  .mark {
    flex: none;
    inline-size: var(--sp-2);
    block-size: var(--sp-2);
    background: var(--edge);
    border-radius: var(--r-sm);
  }

  .name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── The phone ───────────────────────────────────────────────────────── */

  /* RANGE SYNTAX, TO MATCH THE PAGE. `+page.svelte` breaks its grid at `width < 640px`, which
     excludes exactly 640; `max-width: 640px` includes it. The one-pixel disagreement was real: at
     a viewport of exactly 640 the page held its desk layout while this control turned into a
     snap-scroller. The page owns the number, so this file follows it. */
  @media (width < 640px) {
    /* One line of options that slides, rather than four lines of wrapped pills. */
    .tabs {
      flex-wrap: nowrap;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scroll-snap-type: x mandatory;
      padding-block-end: var(--sp-1);
    }

    .tab {
      min-block-size: var(--tap);
      scroll-snap-align: start;
    }

  }

  /* TWO COLUMNS ONCE THERE IS ROOM FOR TWO, AND FIVE ONCE THERE IS ROOM FOR FIVE. One column below
     640px, whatever the count: two columns of a ten-row rail inside 358px is two columns of
     ellipsis, because `Savings goals` and `Day to day` are both wider than 160px at 13px and
     `.name` truncates rather than wraps. At 1000px the column is 936px wide and a fifth of it is
     187px, which holds every name this record declares at its own size. */
  @media (width >= 640px) {
    .holds {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1000px) {
    .holds {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  /* The swap is a state change, and a state change still has to land — it just lands at once. */
  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
</style>
