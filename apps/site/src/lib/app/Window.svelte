<!--
  The drawn app in the hero: an example record for each of five kinds of person, drawn as the new app draws a record
  (SYSTEM §5) by the product's own renderer.

  WHAT IT IS. On 22 September the owner asked for the screenshots to go and for the records in this window to open
  different pages, and on 26 September kept it while the bands under it were rebuilt (`loop/DIRECTION.md` §33). On 29
  September the app's look changed (§34), and the drawing changed with it: the ground and its light, the floating glass
  rail with its icon wells and Working now, the title row with its sentence and its toolbar, and the page's blocks as
  tiles with their charts. Every page is dialect text in `lib/examples/`, drawn by `Page.svelte` through
  `braindog-render/svelte`, so what a reader sees is what a record with those rows draws, and the Source switch in the
  toolbar shows the text it was drawn from.

  900PX AND WIDER IT IS A WINDOW: the cases as a glass segmented control over it, the rail (`Rail.svelte`), and the
  page area. BELOW 900PX IT IS A PHONE (`Phone.svelte`): the cases as glass chips above it, and the phone round the
  page. One tree serves both, laid out twice by the stylesheet, so a case chosen on one is the case chosen on the other.

  NO LAYOUT JUMP. Every case's panel sits in the one grid cell, the window's body is one height, and a page longer
  than it scrolls inside the window (or, on the phone, fades at its foot). Choosing a case, a page or a figure changes
  what is inside the box and never the box.

  IT IS A REAL TAB CONTROL for the cases: `role="tablist"`, arrow keys, Home and End, a roving `tabindex`, one panel
  per case wired to its own tab. The ids are `uc-<case>` and `uc-<case>-rail`, which `test/content.test.ts` and
  `test/window-static.test.ts` look each case up by. A press inside a page that takes the pressed control away (a
  figure that opens another page) moves focus to the new page's title, so a keyboard is never left on something gone.

  WITH SCRIPTING OFF IT IS FIVE HOMES, ONE AFTER ANOTHER. The `<noscript>` rule below lays every panel out in turn,
  hides the tabs, which do nothing without a script, and shows each panel's case name, which is in the markup already
  and `hidden` there, so a reader with scripting on never meets it.

  THE HOMES DRAW IN ONCE, on load, within 1.2s, and nothing moves under reduced motion. The first press anywhere ends
  it, so a page opened later arrives drawn.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';
  import { DRAWN_ON, EXAMPLES } from '../examples/index.ts';
  import type { Example, ExamplePage } from '../examples/types.ts';
  import Page from './Page.svelte';
  import Phone from './Phone.svelte';
  import Rail from './Rail.svelte';
  import { leadOf, questionsIn, workingIn } from './page.ts';

  const w = cases.drawn;

  let chosen = $state(0);
  /** The page each case shows, by case id. A case not in here shows its Home. */
  let shown = $state<Record<string, string>>({});
  /** The questions answered in each case, by case id, so Decide's count follows an answer. */
  let answered = $state<Record<string, string[]>>({});
  /** The one page showing its source, as `<case>/<page>`, so opening another page shows that page drawn. */
  let sourceOf = $state<string | null>(null);
  let first = $state(true);

  /* TRUE ONCE THE SCRIPT HAS RUN: the toolbar's switch does nothing without one, so it is drawn only then. */
  let live = $state(false);
  $effect(() => {
    live = true;
  });

  let tabs: (HTMLButtonElement | null)[] = $state([]);
  /* One per case from the start: a bound prop with a fallback refuses `undefined`, so no slot may start empty. */
  let headings: (HTMLElement | null)[] = $state(EXAMPLES.map(() => null));

  /* What each case's Decide asks, read once from its page, so the rail and the bar can count it. */
  const ASKED: readonly (readonly string[])[] = EXAMPLES.map((c) => questionsIn(c.pages.find((p) => p.id === 'decide')?.src ?? ''));
  /* Who is at work on each case's record, read once from its Agents page, for the rail's Working now. */
  const WORKING = EXAMPLES.map((c) => workingIn(c.pages.find((p) => p.id === 'agents')?.src ?? ''));

  const pageOf = (c: Example): ExamplePage | undefined => c.pages.find((p) => p.id === shown[c.id]) ?? c.pages[0];

  const waiting = (i: number, c: Example): number => (ASKED[i] ?? []).filter((id) => !(answered[c.id] ?? []).includes(id)).length;

  /** Choose a case, and keep the keyboard on its tab. */
  function choose(i: number) {
    chosen = i;
    first = false;
    tabs[i]?.focus();
  }

  /** Left and right, Home and End: the WAI-ARIA tabs pattern for a horizontal tablist. */
  function onkeydown(event: KeyboardEvent) {
    const n = EXAMPLES.length;
    if (n === 0) return;
    const steps: Record<string, number> = {
      ArrowRight: (chosen + 1) % n,
      ArrowLeft: (chosen - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const to = Object.hasOwn(steps, event.key) ? steps[event.key] : undefined;
    if (to === undefined) return;
    event.preventDefault();
    choose(to);
  }

  /**
   * OPEN A PAGE OF A CASE. From the rail or the bar, focus stays on the entry pressed, which is still there; from
   * inside the page, the control pressed is about to be replaced, so focus goes to the new page's title.
   */
  async function open(i: number, id: string, from: 'nav' | 'page') {
    const c = EXAMPLES[i];
    if (!c) return;
    first = false;
    shown = { ...shown, [c.id]: id };
    if (from === 'page') {
      await tick();
      headings[i]?.focus();
    }
  }

  function answer(c: Example, question: string) {
    first = false;
    answered = { ...answered, [c.id]: [...(answered[c.id] ?? []), question] };
  }

  /**
   * WHICH ENDS OF THE CHIP ROW STILL HAVE CASES BEHIND THEM, as `before`, `after`, both or neither.
   *
   * At 390 the row is narrower than its five chips, so some start out of view, and a row that simply ends at the edge
   * says there is nothing more. The fade and the arrow follow this. It starts as `after`, which is what every phone
   * width measures, so the served page draws the cue before any script has run; a window, where the five fit,
   * measures neither and its stylesheet never reads it.
   */
  let strip: HTMLDivElement | null = $state(null);
  let more = $state('after');

  function measure() {
    if (!strip) return;
    const x = Math.abs(strip.scrollLeft);
    const end = strip.scrollWidth - strip.clientWidth;
    more = [x > 4 ? 'before' : '', x < end - 4 ? 'after' : ''].filter(Boolean).join(' ');
  }

  /* A ResizeObserver calls back once as soon as it observes, so this is also the first measure. */
  $effect(() => {
    if (!strip) return;
    const seen = new ResizeObserver(measure);
    seen.observe(strip);
    return () => seen.disconnect();
  });
</script>

<!--
  THE SCRIPTING-OFF LAYOUT. A `<noscript>` in the head is ignored by any browser running scripts, and Svelte draws it
  empty on the client, so none of this reaches a reader who has the tabs. Every selector carries three classes or more,
  because the component's own `.panel.svelte-HASH` carries two and a tie would be decided by the order SvelteKit puts
  stylesheets in the head, not by this file.
-->
<svelte:head>
  <noscript>
    <style>
      .app .window .bar { display: none; }
      .app .window .tabs { display: none; }
      .app .window .stack { block-size: auto; }
      .app .stack .panel { grid-area: auto; visibility: visible; opacity: 1; }
      .app .stack .panel + .panel { margin-block-start: var(--sp-6); }
      .app .panel .case { display: block; }
    </style>
  </noscript>
</svelte:head>

<div class="app">
  <div class="window" role="group" aria-label={w.window}>
    <div class="bar">
      <div class="tabs" role="tablist" aria-label={w.tabs} data-more={more} bind:this={strip} onscroll={measure}>
        {#each EXAMPLES as c, i (c.id)}
          <button
            bind:this={tabs[i]}
            class="tab"
            type="button"
            role="tab"
            id="uc-{c.id}"
            aria-controls="uc-{c.id}-rail"
            aria-selected={i === chosen}
            tabindex={i === chosen ? 0 : -1}
            onclick={() => choose(i)}
            {onkeydown}
          >
            {#if isIconName(c.glyph)}<Icon name={c.glyph} size="m" />{/if}
            <span>{c.label}</span>
          </button>
        {/each}
      </div>
      <span class="more" aria-hidden="true"><Icon name="arrow" size="s" /></span>
    </div>

    <div class="screen">
      <div class="stack" data-first={first ? '' : undefined}>
        {#each EXAMPLES as c, i (c.id)}
          {@const page = pageOf(c)}
          {@const asking = waiting(i, c)}
          {@const to = w.moreFor[c.id]}
          {@const key = `${c.id}/${page?.id ?? ''}`}
          <div class="panel" class:on={i === chosen} role="tabpanel" id="uc-{c.id}-rail" aria-labelledby="uc-{c.id}">
            <p class="case" hidden>{c.label}</p>
            <div class="side">
              <Rail
                name={c.label}
                pages={c.pages}
                current={page?.id ?? ''}
                open={asking}
                working={WORKING[i] ?? []}
                pick={(id) => void open(i, id, 'nav')}
              />
            </div>
            {#if page}
              {#snippet tools()}
                {#if live}
                  <div class="switch" role="group" aria-label={w.view}>
                    <button type="button" class="seg tap" aria-pressed={sourceOf !== key} onclick={() => (sourceOf = null)}>{w.page}</button>
                    <button type="button" class="seg tap" aria-pressed={sourceOf === key} onclick={() => (sourceOf = key)}>{w.source}</button>
                  </div>
                {/if}
              {/snippet}
              <Phone
                title={page.title}
                sentence={leadOf(page.src)}
                pages={c.pages}
                current={page.id}
                open={asking}
                pick={(id) => void open(i, id, 'nav')}
                {tools}
                bind:heading={headings[i]}
              >
                <Page
                  src={page.src}
                  layout={page.layout ?? []}
                  links={page.links}
                  reads={page.reads}
                  interactive
                  tiles
                  view={sourceOf === key ? 'source' : 'page'}
                  now={DRAWN_ON}
                  canvas={page.id === 'automations'}
                  settled={answered[c.id] ?? []}
                  go={(id) => void open(i, id, 'page')}
                  onanswer={(question) => answer(c, question)}
                />
              </Phone>
            {/if}
            <a class="more-for" href={to.href}>{to.label}<Icon name="arrow" size="s" /></a>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <p class="caption">{w.caption}</p>
</div>

<style>
  /* ONE COLUMN THAT MAY SHRINK, so the chip row scrolls inside the phone's width rather than widening the page. */
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
  }

  /* ── Below 900px: the glass chips, and a phone under them ───────────────── */

  .window {
    position: relative;
  }

  .bar {
    position: relative;
    display: flex;
    align-items: center;
    margin-block-end: var(--sp-4);
  }

  /* THE ROW FADES AT WHICHEVER END STILL HAS CASES BEHIND IT, and `more` in the script says which. The mask reads
     only alpha, so the colour in it is any opaque token and never shows. */
  .tabs {
    --fade-start: 0px;
    --fade-end: 0px;
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-2) 2px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 2px;
    scrollbar-width: none;
    mask-image: linear-gradient(
      to right,
      transparent calc(var(--fade-start) / 2),
      var(--ink) var(--fade-start),
      var(--ink) calc(100% - var(--fade-end)),
      transparent calc(100% - var(--fade-end) / 2)
    );
  }

  .tabs[data-more~='before'] {
    --fade-start: var(--sp-7);
  }

  .tabs[data-more~='after'] {
    --fade-end: var(--sp-7);
  }

  /* A CASE AS A GLASS CHIP, and the chosen one in ink: a shape as well as a shade, with no hue. */
  .tab {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: 14px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: var(--glass-edge);
    backdrop-filter: var(--glass-blur);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    scroll-snap-align: start;
  }

  .tab[aria-selected='true'] {
    background: var(--ink);
    color: var(--on-ink);
  }

  /* THE ARROW, and only a narrow phone's: the one query below that shows it is where the five chips no longer fit. */
  .more {
    display: none;
  }

  .stack {
    display: grid;
  }

  /* `.panel` IS ALSO THE SKIN'S NAME FOR A NOTE'S CALLOUT, a filled box with padding, and the tests find the case
     panels by it. So the case panel says outright that it has no box of its own. */
  .panel {
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    font-size: inherit;
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    opacity: 0;
    visibility: hidden;
  }

  .on {
    opacity: 1;
    visibility: visible;
  }

  /* THE CASE'S NAME OVER ITS PANEL, drawn only by the scripting-off rule. NO `display` IN HERE: the element is
     `hidden`, and any author `display` would beat the UA's `[hidden]`. */
  .case {
    grid-area: case;
    margin: 0;
    padding: var(--sp-3) var(--sp-4) 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .side {
    display: none;
  }

  /* The toolbar's Page and Source switch: glass, the chosen half a tile-white pill (SYSTEM §5). */
  .switch {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
  }

  .seg {
    min-block-size: 30px;
    padding-inline: 14px;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .seg[aria-pressed='true'] {
    background: var(--bg);
    color: var(--ink);
    box-shadow: var(--e1);
  }

  /* A quiet link to the page written for this kind of person: ink, underlined at 40%, never a hue. */
  .more-for {
    display: inline-flex;
    align-self: center;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }

  .caption {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  @media (width < 640px) {
    /* The row's end is as wide as the fade, so the last chip can be scrolled clear of the arrow. */
    .tabs {
      padding-inline-end: var(--sp-7);
    }

    /* THE ARROW SAYS WHICH WAY THE REST ARE, and goes when the end is reached. It sits in the outer half of the fade,
       which is fully clear, and it is drawn and not pressed: a tap lands on the chip under it. */
    .tabs[data-more~='after'] + .more {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      display: grid;
      place-items: center;
      inline-size: calc(var(--sp-7) / 2);
      color: var(--ink2);
      pointer-events: none;
    }
  }

  /* ── 900px and wider: the window ───────────────────────────────────── */

  @media (width >= 900px) {
    /* THE CASES AS ONE GLASS SEGMENTED CONTROL, centred over the window. */
    .bar {
      justify-content: center;
    }

    .tabs {
      gap: 2px;
      padding: 4px;
      overflow-x: visible;
      border-radius: var(--r-pill);
      background: var(--glass);
      box-shadow: var(--glass-edge), var(--e2);
      backdrop-filter: var(--glass-blur);
      mask-image: none;
    }

    .tab {
      min-block-size: var(--ctl-h);
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }

    .tab[aria-selected='true'] {
      background: var(--bg);
      color: var(--ink);
      box-shadow: var(--e1);
      font-weight: 600;
    }

    /* THE SCREEN: the app's own ground and its light, floating over the site's at the top of the ladder, and held by
       the glass hairline pair, since the two grounds are one colour. */
    .screen {
      overflow: hidden;
      border-radius: var(--r-lg);
      background-color: var(--sunk);
      background-image: var(--ground-light);
      box-shadow: var(--glass-edge), var(--e3);
    }

    /* ONE HEIGHT FOR EVERY CASE AND EVERY PAGE, so the window is one size whatever is chosen. The rail floats one
       inset in on three sides; the title row, the sentence and the page sit beside it; the link sits under the rail. */
    /* The row is the stack's height and no more, so a long page scrolls inside the window instead of stretching it. */
    .stack {
      grid-template-rows: minmax(0, 1fr);
      block-size: 580px;
    }

    .panel {
      display: grid;
      grid-template-columns: 216px minmax(0, 1fr);
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas:
        'case case'
        'side head'
        'side body'
        'foot body';
      gap: 0;
      padding: var(--inset) 0 var(--inset) var(--inset);
    }

    .side {
      grid-area: side;
      display: flex;
      flex-direction: column;
      min-block-size: 0;
    }

    .side > :global(.rail) {
      flex: 1;
    }

    .more-for {
      grid-area: foot;
      align-self: stretch;
      justify-content: center;
      padding-block-start: var(--sp-2);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .tab[aria-selected='false']:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* THE HOMES DRAW IN ONCE: each tile rises into place, the last of them done inside 1.2s. */
  @media (prefers-reduced-motion: no-preference) {
    .stack[data-first] .panel :global(.page-cell) {
      animation: draw-in 560ms var(--ease-out) both;
    }

    .stack[data-first] .panel :global(.page-cell:nth-child(2)) {
      animation-delay: 90ms;
    }

    .stack[data-first] .panel :global(.page-cell:nth-child(3)) {
      animation-delay: 180ms;
    }

    .stack[data-first] .panel :global(.page-cell:nth-child(4)) {
      animation-delay: 270ms;
    }

    .stack[data-first] .panel :global(.page-cell:nth-child(5)) {
      animation-delay: 360ms;
    }

    .stack[data-first] .panel :global(.page-cell:nth-child(n + 6)) {
      animation-delay: 450ms;
    }
  }

  @keyframes draw-in {
    from {
      opacity: 0;
      transform: translateY(var(--sp-2));
    }
  }
</style>
