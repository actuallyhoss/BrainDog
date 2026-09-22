<!--
  The proof that the record rearranges itself, drawn rather than photographed.

  Five near-identical screenshots of a navigation rail is five downloads of the same picture with
  three words changed in each. This is the app's frame itself, drawn once, with the five
  arrangements swapped through it, which is both smaller and more honest than five photographs.

  A MINIATURE OF THE APP AND NOT A LIST OF NOUNS. Until 22 September this drew the rail alone: a
  box of names beside grey squares, the most text-like thing on the first screen after the
  headline (`loop/research-site-now.md`, change 1). Now each case draws a rail with the glyph the
  app draws beside each row, the page that case opens on, and two or three tiles that page shows
  on its first day, so a student sees an assignment falling due and a founder sees the bank
  balance. Every glyph in the rail is the one the seed declares for that page (`rail.ts`, checked
  by `arrange.test.ts`), and every tile's figure is read off the rows that setup installs
  (`copy.ts` says which). A drawing of the app that drew the wrong glyph would be a mock-up.

  IT IS A REAL TAB CONTROL, not five buttons and a `{#if}`. `role="tablist"`, arrow keys, a roving
  `tabindex`, and one panel per case wired to its own tab, so a keyboard reaches the five
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
  import Icon from './Icon.svelte';
  import { isIconName } from './icons.ts';
  import { RAIL } from './rail.ts';

  /**
   * One use case, as `copy.ts` writes it: an id, what to call it, the rail it arranges, the glyph
   * its tab and page title carry, and the tiles its first page shows. `holds[0]` is that page: it
   * is the case's Home, under the title the setup gives it.
   *
   * `glyph` AND `tiles` ARE REQUIRED, like `head` and `label` below and for the same reason: a case
   * that forgot them would draw an empty page, and a type error is where that should be found.
   */
  type Case = {
    id: string;
    label: string;
    glyph: string;
    holds: readonly string[];
    tiles: readonly { title: string; value: string; note?: string }[];
  };

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

  /* The five buttons, so an arrow key can move focus as well as selection: a roving `tabindex`
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
            <!-- THE GLYPH WHERE THE COUNT WAS. The segment's second line said `10 parts`, `5 parts`,
                 which is a figure about the product's own parts: the kind of counted stat §19 asks
                 the page to stop showing. The case's glyph says which record this is by shape
                 instead, and it is the same glyph as the page title in the panel it opens, so the
                 tab and what it shows match. -->
            {#if isIconName(c.glyph)}<span class="tab-glyph"><Icon name={c.glyph} size="m" /></span>{/if}
            <span class="tab-label">{c.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="in frame-wrap">
    <div class="frame">
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
            <div class="rail">
              <p class="rail-head">{head}</p>
              <ul class="holds">
                {#each c.holds as hold, j}
                  {@const glyph = RAIL[hold]}
                  <li class="hold" class:here={j === 0}>
                    {#if glyph}<Icon name={glyph} size="m" />{:else}<span class="mark" aria-hidden="true"></span>{/if}
                    <span class="name">{hold}</span>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="page">
              <p class="page-title">
                {#if isIconName(c.glyph)}<span class="page-glyph"><Icon name={c.glyph} size="l" /></span>{/if}
                <span>{c.holds[0]}</span>
              </p>
              <ul class="tiles">
                {#each c.tiles as tile (tile.title)}
                  <li class="tile">
                    <span class="tile-title">{tile.title}</span>
                    <span class="tile-value num">{tile.value}</span>
                    {#if tile.note}<span class="tile-note">{tile.note}</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
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

  .frame-wrap {
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

  /* The glyph sits before the label in a pill and above it in a segment, in the label's own colour,
     so the chosen tab's glyph darkens with its label and nothing else has to say which is chosen. */
  .tab {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .tab-glyph {
    display: inline-flex;
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
  }

  /**
   * THE FRAME: THE APP'S CANVAS, ITS RAIL, AND THE PAGE BESIDE IT.
   *
   * The box is `--sunk` inside a hairline, which is the app's own canvas one step below the page,
   * and `app.css` flips `--sunk` with the rest of this band so the frame stays made of the band's
   * two colours. The page sits on it at `--bg` inside its own hairline, the way the app lifts a
   * page off its canvas, so the one picture holds both of the app's grounds.
   *
   * THE RAIL IS THE APP'S PROPORTION AND THE PAGE TAKES THE REST. `--rail` is the record app's own
   * sidebar width, 240px, and the argument for drawing it at that width is the one this file used
   * to make about the whole box: it should be the app's rail and not a list. It was wrong about
   * the box, which `loop/research-site-reference.md` measured at 37 per cent of the band with the
   * right two thirds empty. It is right about the rail now that the page fills the two thirds.
   */
  .frame {
    inline-size: 100%;
    padding: var(--sp-2);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* The one cell every arrangement is drawn in, so the frame is the height of the longest of them
     and choosing another moves nothing on the page. */
  .stack {
    display: grid;
  }

  .panel {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: minmax(0, var(--rail)) minmax(0, 1fr);
    gap: var(--sp-2);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--d-enter) var(--ease-out),
      visibility var(--d-enter) var(--ease-out);
  }

  .on {
    opacity: 1;
    visibility: visible;
  }

  /* THE ROW THE REAL SIDEBAR PUTS AT ITS TOP, where `Switch record` sits: what you are in, above
     a hairline, before the list of where you can go. One line, and it is the line that makes the
     column read as a rail rather than as bullets. */
  .rail-head {
    padding-inline: var(--sp-2);
    padding-block: var(--sp-1);
    margin-block-end: var(--sp-1);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 1.5;
  }

  .holds {
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

  /* THE PAGE THE CASE OPENS ON, marked in the rail the way the app marks where you are: heavier, on
     the lifted ground, in full ink. Not a hue, for the reason the chosen tab above gives. */
  .here {
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }

  /* Only for a name `rail.ts` has no glyph for, which `arrange.test.ts` fails on, so a reader
     should never meet one. It keeps the row the width of its neighbours if one ever lands. */
  .mark {
    flex: none;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    background: var(--edge);
    border-radius: var(--r-sm);
  }

  .name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .page-title {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  /* The case's glyph in a chip, which is how the app heads a page that has one. */
  .page-glyph {
    display: inline-grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  /**
   * THREE FIXED COLUMNS ON A DESK, so a tile is the same width in every case. Two of the five cases
   * have two tiles and three have three, and a grid that stretched two tiles to half the page each
   * would resize every box under the cross-fade between Personal and Student. Here the third cell
   * of a two-tile page is simply empty, which is what an app page with two things on it looks like.
   *
   * The first pass was `repeat(auto-fill, minmax(12rem, 1fr))`, and the screenshot at 1440 showed
   * what that costs: three 196px tiles in an 846px page, with a quarter of the page's width empty
   * to their right. Fixed thirds fill it. Below 1000px it drops to two: at 860 the page is
   * 528px wide, a third of that less its gaps and padding leaves about 135px of text, and
   * `Northwind current account` needs about 165. Below 760 it is one.
   */
  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .tile-title {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  @media (width >= 760px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1000px) {
    .tiles {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* THE FIGURE IS THE LARGEST THING ON THE TILE, as it is on the app's own tiles: a reader looking
     at a home page reads the balance first and its label second. */
  .tile-value {
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .tile-note {
    color: var(--dim);
    font-size: var(--t-sm);
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

    /**
     * THE RAIL FOLDS TO ITS GLYPHS, the way the app's own rail does on a phone. A 240px rail
     * beside a page inside 358px leaves the page 100px, and a rail stacked over the page makes
     * Personal's ten rows the first 330px of the picture with the tiles below the fold. So the
     * rail keeps one column of glyphs and the names leave the eye but not the page: they are
     * clipped rather than `display: none`, so a screen reader still reads the rail in full.
     */
    .panel {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .rail-head {
      display: none;
    }

    .hold {
      justify-content: center;
      padding-inline: var(--sp-2);
    }

    .name {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .page {
      padding: var(--sp-4);
      gap: var(--sp-4);
    }

    .page-title {
      font-size: var(--t-lg);
    }

    .tiles {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /**
   * THE CROSS-FADE, AND A LIFT UNDER IT FOR A READER WHO HAS NOT ASKED FOR LESS MOTION.
   *
   * The fade is a state change: under `prefers-reduced-motion` it lands at once (below), and
   * `a11y.css` collapses every duration to 1ms besides. The lift is movement, so it is written
   * only inside `no-preference` rather than written everywhere and switched off, which is the
   * pattern `app.css` gives for `.btn-primary`: a transform left outside this query would be
   * absent under the collapse rather than damped, and a reader who asked for stillness would
   * still see the tiles jump the four pixels in one frame.
   */
  @media (prefers-reduced-motion: no-preference) {
    .panel .page {
      transform: translateY(var(--sp-1));
      transition: transform var(--d-enter) var(--ease-out);
    }

    .on .page {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
</style>
