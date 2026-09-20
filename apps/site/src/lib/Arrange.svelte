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

  /**
   * WHERE A RAIL GOES TO TWO COLUMNS. Eleven rows in one stack is 350px of bulleted list next to
   * a page of dead space; it reads as a list and not as the app's sidebar. Above this count the
   * rows are laid in two columns, so the longest arrangement is about six rows tall and the four
   * shorter ones are not swimming in an empty box. The rail's WIDTH does not change: `--rail` is
   * the app's own proportion, and the whole claim of this component is that it is drawn to it.
   */
  const SPLIT = 6;

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
  <div class="tabs" role="tablist" aria-label={label}>
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
        {c.label}
      </button>
    {/each}
  </div>

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
          <ul class="holds" class:wide={c.holds.length > SPLIT}>
            {#each c.holds as hold}
              <li class="hold"><span class="mark" aria-hidden="true"></span><span class="name">{hold}</span></li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .arrange {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    inline-size: 100%;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
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

  /* THE RAIL, AT THE RECORD APP'S OWN PROPORTIONS: `--rail` wide, rows `--rail-item-h` tall, sunk
     ground, hairline, large radius. One grid cell, so every arrangement is stacked in the same
     place and the box is the height of the longest of them. */
  .rail {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    max-inline-size: var(--rail);
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

  .holds {
    margin: 0;
    padding: 0;
    list-style: none;
    column-gap: var(--sp-2);
  }

  /* Column-balanced rather than a fixed grid: the browser splits the list evenly without this
     component having to know how long each arrangement is. */
  .wide {
    columns: 2;
  }

  .hold {
    display: flex;
    break-inside: avoid;
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

    /* The rail keeps the record app's row height here too: these are rows of a drawing, not
       controls, so the 44px thumb rule is the segmented control's business and not theirs. */
    .rail {
      max-inline-size: 100%;
    }
  }

  /* The swap is a state change, and a state change still has to land — it just lands at once. */
  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
</style>
