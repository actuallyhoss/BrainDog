<!--
  The title row of every body surface: the title and its count, the toolbar at the right, and under them the
  one sentence that says what the screen means.

  The title is `page.title` else `register.name`, NEVER an id. `register`, `predicate` and
  `projection` are internal vocabulary and where a draft leaked them into UI copy, that is a defect
  (19 §9). NOR DOES AN ID FOLLOW IT: the head took an `id` and printed it after every title, which
  is how "SG5" came to sit after a question on Decide. A person reads a name here, and an id lives
  in a row's Details and in "Copy link".

  The count says `n of N`, and when examples are in the figure it says so: a metric counts example
  rows and admits it, because the alternative is a money page reading "Due in 30 days · EGP 0"
  directly above a table containing one obligation due in 30 days (19 §6).

  THE SENTENCE is the page's intelligence kept in one line: 16/24 in `--ink2`, and the phrase that needs him in `--danger`.
  Handed as words (`sentence`, with `needs` naming the phrase inside it) or as a snippet, where the phrase is marked
  `data-needs`. It scrolls away with the page; the title row does not.

  TWO SHAPES, ONE ON EACH SIDE OF 900px.

  From 900px up the title row sits on the ground, 44 tall, 12 from the top of the work. Once the page scrolls it stays
  where it is and becomes a compact glass bar over what passes under it: the title steps down to 17, and the bar's glass
  arrives over `--d-move`, the step the panel moves on. The row keeps its height, so the page under it never jumps and a page an inch taller than the window
  cannot flicker between the two states.

  Toolbar controls are glass pills and circles, 36 high and 6 apart, and the one primary is ink: a quiet
  `Button` in the toolbar is drawn as glass here, and inside the compact bar it drops its own glass, because glass never
  holds glass.

  Below 900px the head is a phone's. A `--sticky` (52px) bar stays at the top: the back link on a
  detail page (a chevron and the parent's name), the title on one line once the large title has
  scrolled away, and a 44px glass search circle. Under it the large title and the actions scroll away
  with the page. The bar is clear over the ground and turns to glass once anything has scrolled under it.

  A KICKER WITH `back` IS A LINK. A detail page's kicker named its parent ("Money", "Decide",
  "Settings") as a `<p>`, and on a phone, with no rail, the only way back was the browser. With
  `back` the kicker links there at 1440 and is the bar's back link on a phone.

  EVERY GLASS HERE IS ON A PSEUDO-ELEMENT. A `backdrop-filter` makes its element the box every fixed descendant is
  placed against, and a menu in the toolbar is a fixed panel in a browser without popovers.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import Define from './Define.svelte';
  import { at, here } from '../at.ts';
  import { copy } from '../copy.ts';
  import { palette } from '../palette/open.svelte.ts';
  import { page } from '$app/state';
  import type { Noun } from '$lib/define.svelte.ts';
  import type { IconName } from './icons.ts';
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    total,
    atLeast,
    kicker,
    back,
    sentence,
    needs,
    actions,
    icon,
    hue,
    define,
    led = false,
    over = false,
  }: {
    title: string;
    /** The glyph the register or page declares, drawn beside the title only when `hue` is given. */
    icon?: IconName | undefined;
    /** The frozen hue of the row this page is about, when it is about one. */
    hue?: number | undefined;
    count?: number | undefined;
    total?: number | undefined;
    /**
     * Whether `count` is a floor rather than the answer.
     *
     * `50 §5.2` step 6: *"`Matches n of N` is exact when `cursor === null`, else `200+ of N`."* A
     * grid holding the first page of a longer answer knows two numbers — how many it has and how
     * many there are — and printing the first as though it were the second is the quiet lie paging
     * introduces. The `+` is the whole of the difference.
     */
    atLeast?: boolean | undefined;
    /** The parent's name on a detail page, or the section a page sits in. */
    kicker?: string | undefined;
    /**
     * Where the kicker's parent is, as an app path (`'/decide'`, `` `/r/${list}` ``). Given, the
     * kicker is a link there at 1440 and the back link in the phone's bar; left out, the kicker is
     * words only and the phone's bar has no back link.
     */
    back?: string | undefined;
    /**
     * The screen's one sentence under the title: words, or a snippet whose urgent phrase is marked
     * `data-needs`. "Four things need you, and the backup vendor is 2 days late."
     */
    sentence?: string | Snippet | undefined;
    /** The phrase inside a `sentence` given as words that needs him, drawn in `--danger`. */
    needs?: string | undefined;
    /**
     * A load-bearing noun this heading is the first sight of, explained once and never again.
     *
     * `19 §6`. The clause goes UNDER the `h1` and never inside it: a heading is an address in the
     * document outline and a name in the accessibility tree, and a definition appended to it makes
     * both longer for everybody, for ever, to teach one word once.
     */
    define?: Noun | undefined;
    /** The toolbar: glass controls 36 high and 6 apart, and at most one ink primary. */
    actions?: Snippet | undefined;
    /**
     * A lead tile draws this head on a wide screen (`LeadHead.svelte`), so from 900px up this one is not drawn. The
     * phone's bar, title and sentence are unchanged.
     */
    led?: boolean | undefined;
    /**
     * The page opens on a tile that holds its sentence (`PageView`): from 900px up the name and the tools ride over the
     * top of that tile as its label row, and the kicker and the definition step aside. The `h1` stays the page's heading.
     */
    over?: boolean | undefined;
  } = $props();

  /* THE COMPACT BAR ARRIVES ONCE SOMETHING HAS SCROLLED UNDER THE HEAD. A zero-height mark where the head starts leaves
     the scroller the moment the head sticks, which is the moment the bar starts meaning something. */
  let mark = $state<HTMLElement>();
  let under = $state(false);

  $effect(() => {
    if (!mark) return;
    const io = new IntersectionObserver((seen) => {
      const last = seen.at(-1);
      if (last) under = !last.isIntersecting;
    });
    io.observe(mark);
    return () => io.disconnect();
  });

  /**
   * WHETHER THE LARGE TITLE HAS GONE UNDER THE PHONE'S BAR, which is when the bar says the title.
   *
   * The root is the screen less the bar's own height at its top, so the title counts as gone the
   * moment its last line slides under the bar rather than once it has left the screen. Only a title
   * that left UPWARDS counts: `rootBounds` is that shrunken screen, and a heading below it has not
   * been scrolled past. From 900px up the bar is not drawn, its height is zero and nothing reads
   * `past`.
   */
  let bar = $state<HTMLElement>();
  let heading = $state<HTMLElement>();
  let past = $state(false);

  $effect(() => {
    if (!bar || !heading) return;
    const io = new IntersectionObserver(
      (seen) => {
        const last = seen.at(-1);
        if (last) past = !last.isIntersecting && last.boundingClientRect.top < (last.rootBounds?.top ?? 0);
      },
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` },
    );
    io.observe(heading);
    return () => io.disconnect();
  });

  /* THE SEARCH BUTTON IS NOT DRAWN ON `/search`, which is the search: two ways to one place side by
     side read as two places. Compared inside the record, as the tab bar compares (`lib/at.ts`). */
  const searching = $derived(here(page.url.pathname) === '/search');

  /* THE KICKER OVER THE TITLE IS DROPPED WHEN IT SAYS THE TITLE AGAIN: Work's section is Work, and "Work" over "Work"
     is a breadcrumb that names where you already are. The phone's back link keeps it, since that is a way out. */
  const crumb = $derived(kicker && kicker.trim().toLowerCase() !== title.trim().toLowerCase() ? kicker : undefined);

  /* THE SENTENCE AS WORDS, cut round the phrase that needs him, when it holds that phrase. */
  const said = $derived.by(() => {
    if (typeof sentence !== 'string') return null;
    const at = needs ? sentence.indexOf(needs) : -1;
    return at < 0 || !needs ? { before: sentence, needs: '', after: '' } : { before: sentence.slice(0, at), needs, after: sentence.slice(at + needs.length) };
  });
</script>

<div bind:this={mark} aria-hidden="true"></div>
<!--
  THE PHONE'S BAR, hidden from 900px up. It is not inside `.head` because it has to stay when the
  head scrolls away, and a sticky element sticks only inside its parent's box.

  Its title repeats the `h1` for the eye once the `h1` has gone, so it is hidden from a screen
  reader, which has already met the heading and would hear the title twice.
-->
<div class="head-bar" bind:this={bar} data-under={under ? '' : undefined} data-past={past ? '' : undefined}>
  {#if kicker && back}
    <a class="back tap" href={at(back)}>
      <span class="back-mark"><Icon name="chevron" size="l" /></span><span class="back-name">{kicker}</span>
    </a>
  {/if}
  <p class="bar-title" dir="auto" aria-hidden="true">{title}</p>
  {#if !searching}
    <button type="button" class="find tap" aria-label={copy.paletteLabel} onclick={() => (palette.open = true)}>
      <Icon name="search" size="l" />
    </button>
  {/if}
</div>
{#if crumb}
  <!-- Over the title and scrolling with the page: the row that stays is the title's. -->
  {#if back}
    <a class="kicker kicker-link tap" href={at(back)} data-led={led ? '' : undefined} data-over={over ? '' : undefined}>{crumb}</a>
  {:else}
    <p class="kicker" data-led={led ? '' : undefined} data-over={over ? '' : undefined}>{crumb}</p>
  {/if}
{/if}
<!-- THE HEAD AND ITS SENTENCE ARE ONE WHITE TILE ON A WIDE SCREEN, when the page says a sentence. Under 900px, and on a
     page with no sentence, the wrapper has no box of its own. -->
<div class="lead-wrap" data-said={sentence ? '' : undefined} data-led={led ? '' : undefined}>
<header class="head" data-under={under ? '' : undefined} data-kicked={crumb ? '' : undefined} data-said={sentence ? '' : undefined} data-led={led ? '' : undefined} data-over={over ? '' : undefined}>
  <div class="head-main">
    <!-- The `dir="auto"` is on a SPAN around the title, not on the `h1`: the title came from
         whoever typed it, the glyph beside it is ours. An Arabic title in an English paragraph
         puts its own full stop on the wrong end and has to be fixed, and the attribute on the
         `h1` would resolve the direction of our own glyph too. Chrome keeps the UI's direction;
         data follows its own. See the note in `blocks.css`. -->
    <div class="title-row">
      <h1 class="title" bind:this={heading}>
        <!-- ONLY WITH A HUE. A page about one thing wears that thing's coloured mark; a grey glyph
             before every other heading only repeated the rail and read as admin navigation. -->
        {#if icon && hue !== undefined}
          <span class="title-icon" style="--hue:{hue}">
            <Icon name={icon} size="l" />
          </span>
        {/if}
        <span dir="auto">{title}</span>
      </h1>
      <!--
        A COUNT OF NOTHING OVER AN EMPTY STATE IS THE SAME FACT TWICE, and the zero is the half that
        says nothing. So a bare zero goes and a zero with a total beside it stays: `0 of 38` is a
        filter that matched nothing over a list that holds thirty-eight rows, which is a fact somebody
        needs (19 §6). The test is on the total's VALUE, because the register sets its denominator to
        the matched count while a filter is on, and both halves zero is the state with nothing to say.
      -->
      {#if count || total}
        <p class="count num">
          {(count ?? 0).toLocaleString('en')}{#if atLeast}<span class="more-sign">+</span>{/if}{#if total !== undefined && (atLeast || total !== count)}<span
              class="of">&nbsp;of {total.toLocaleString('en')}</span
            >{/if}
        </p>
      {/if}
    </div>
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>
{#if sentence}
  <p class="sentence" data-led={led ? '' : undefined}>
    {#if said}{said.before}{#if said.needs}<span class="needs" data-needs>{said.needs}</span>{/if}{said.after}{:else if typeof sentence !== 'string'}{@render sentence()}{/if}
  </p>
{/if}
</div>
<!--
  THE DEFINITION IS READ ONCE, SO IT DOES NOT RIDE IN THE STICKY HEAD. `19 §6` gives the definition its place, the
  first time the word appears; it does not give it the top of the screen for as long as the page is open. Out here it
  is read where it is met and scrolls away with the list, and it still shows once and never again.
-->
{#if define}<p class="head-define" data-led={led ? '' : undefined} data-over={over ? '' : undefined}><Define noun={define} /></p>{/if}

<style>
  /* Same size as the figure, dimmed: it modifies the number rather than being part of it. */
  .more-sign {
    color: var(--dim);
  }

  /* No margin of its own: it is either there or it is not, and a head that reserved the space
     would leave a gap on every screen after the first. */
  .head-define {
    margin: 0;
    padding: var(--sp-2) var(--gutter) 0;
    max-inline-size: calc(var(--measure) + var(--gutter) * 2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE PHONE'S BAR IS A PHONE'S. The rule below 900px draws it. */
  .head-bar {
    display: none;
  }

  /* The section or the parent over the title, in meta: 13 in `--dim`, sentence case. */
  .kicker {
    display: block;
    inline-size: fit-content;
    margin: 0;
    padding: var(--inset) var(--gutter) 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    text-decoration: none;
  }

  /* A LINK IN THE KICKER'S OWN VOICE: quiet until it is pointed at, when it says it goes somewhere
     with ink and the house underline (`--link`, design 6.2). Never the accent. */
  @media (hover: hover) and (pointer: fine) {
    .kicker-link:hover {
      color: var(--link);
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  /**
   * THE TITLE ROW: 12 from the top of the work, a 44px line, and sticky. Sticky, and `--sticky` is what
   * `scroll-padding-block` is set from, so keyboard focus never lands underneath it (WCAG 2.4.11).
   *
   * `--z-sheet`, the same token `TabBar.svelte` uses for its own fixed chrome: this is chrome that has to stay above the
   * content scrolling under it.
   */
  .head {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sheet);
    box-sizing: border-box;
    max-inline-size: var(--page-max);
    padding: var(--inset) var(--gutter) var(--sp-2);
  }

  /* NO BOX OF ITS OWN, except on a wide screen with a sentence (below): the head sticks to the scroller, not to this. */
  .lead-wrap {
    display: contents;
  }

  /* A kicker already stands between the row and the top of the work. */
  .head[data-kicked] {
    padding-block-start: var(--sp-1);
  }

  /* THE COMPACT BAR'S GLASS, 56 tall round the 44px row, reaching 14 past the title and the toolbar at each end. It is
     there at rest, invisible, and arrives over `--d-move`: the row itself never changes height. */
  .head::before {
    content: '';
    position: absolute;
    inset-block: 6px 2px;
    inset-inline: calc(var(--gutter) - 14px);
    z-index: -1;
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e2);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--d-move) var(--ease-out);
  }

  .head[data-under]::before {
    opacity: 1;
  }

  .head-main {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: 44px;
  }

  .title-row {
    display: flex;
    flex: 1;
    align-items: baseline;
    column-gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* `t-title`, 28/34 at 600 and −0.02em, and 17 in the compact bar. A BLOCK AND NOT A FLEX ROW, so a title
     that wraps is text that wraps, with its glyph inline before the first word. */
  .title {
    display: block;
    min-inline-size: 0;
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: calc(34 / 28);
    letter-spacing: -0.02em;
    text-wrap: balance;
    transition: font-size var(--d-move) var(--ease-out);
  }

  .head[data-under] .title {
    overflow: hidden;
    font-size: var(--t-group);
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The thing's own frozen hue, same lightness and chroma as its mark in the grid. A page about
     Kiln is headed in Kiln's colour, which is the one colour here that names something. */
  .title-icon {
    display: inline-grid;
    place-items: center;
    margin-inline-end: var(--sp-2);
    vertical-align: -0.1em;
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* Beside the title on its baseline, a step down in `--dim` (`t-group`), and quieter still in the compact bar. */
  .count {
    flex: none;
    margin: 0;
    color: var(--dim);
    font-size: var(--t-group);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    transition: font-size var(--d-move) var(--ease-out);
  }

  .head[data-under] .count {
    font-size: var(--t-base);
  }

  /* THE SPACE IS A CHARACTER, AND IT HAS TO BE. A margin is not a separator: it is a gap where one should be, and the
     text a screen reader announces and a copy-paste carries read `10of 38` with it. */
  .of {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE TOOLBAR: 6 apart. A FLEX CHILD DOES NOT SHRINK BELOW ITS CONTENT UNLESS IT IS TOLD TO, and without the floor
     the row kept its widest button's width at every viewport and pushed the header off a 320px window. */
  .head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-inline-size: 0;
  }

  /* A QUIET CONTROL IN THE TOOLBAR IS A WHITE PILL ON THE BOARD. */
  .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])) {
    background: var(--bg);
    border-color: transparent;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  /* AND IN THE COMPACT BAR IT DROPS ITS FILL, a segmented track as well: the bar is white already. */
  .head[data-under] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
  .head[data-under] .head-actions :global(.segmented) {
    background: transparent;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass']):hover:not(:disabled)) {
      background: var(--hover-wash);
    }

    .head[data-under] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass']):hover:not(:disabled)) {
      background: var(--hover-wash);
    }
  }

  /* THE SENTENCE: 16/24 in `--ink2` under the title, and the phrase that needs him in `--danger`. */
  .sentence {
    margin: 0;
    padding: 0 var(--gutter);
    max-inline-size: calc(var(--measure) + var(--gutter) * 2);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.5;
  }

  .sentence :global([data-needs]) {
    color: var(--danger-text);
    font-weight: 500;
  }

  /**
   * ON A WIDE SCREEN THE SENTENCE IS THE HEADLINE. The page's name steps down to a label over it, with its count, and
   * the sentence is set at 40/600 in ink: the screen opens on what is true today rather than on a word the nav already
   * says. Scrolled, the compact bar keeps the name, as before.
   */
  @media (width >= 900px) {
    /* A LEAD TILE DRAWS THE HEAD HERE, so this one steps aside. `display: none` takes its `h1` out of the outline too,
       and the tile's own is the page's heading. */
    [data-led] {
      display: none;
    }

    /* THE LEAD TILE: white, 12 in from the gutter, holding the page's name, its toolbar and the sentence. The head does
       not stick inside it; the top bar is always in view and the tile scrolls with the page. */
    .lead-wrap[data-said] {
      display: block;
      box-sizing: border-box;
      max-inline-size: calc(var(--page-max) - var(--gutter) * 2);
      margin: var(--sp-2) var(--gutter) 0;
      padding: var(--sp-3) var(--sp-5) var(--sp-5);
      background: var(--bg);
      border-radius: var(--r-lg);
    }

    .lead-wrap[data-said] .head {
      position: static;
      padding: 0;
    }

    .lead-wrap[data-said] .head::before {
      display: none;
    }

    .lead-wrap[data-said] .sentence {
      padding: 0;
    }

    /* ON THE WHITE TILE a quiet control takes the tile's inner fill, since white on white is no control at all. */
    .lead-wrap[data-said] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
    .lead-wrap[data-said] .head-actions :global(.segmented) {
      background: var(--s1);
    }

    .lead-wrap[data-said][data-led] {
      display: none;
    }

    /* OVER THE LEAD TILE: the row is the tile's first `--head-over`, pulled up over it by as much as it is tall, so the
       page's name and tools read as the tile's label row and the headline under them is the page's. It scrolls with
       the tile; the top bar is what stays. */
    .kicker[data-over],
    .head-define[data-over] {
      display: none;
    }

    .head[data-over] {
      position: relative;
      display: flex;
      align-items: center;
      block-size: var(--head-over);
      margin-block: var(--sp-3) calc(-1 * (var(--head-over) + var(--sp-3)));
      padding: 0 calc(var(--gutter) + var(--sp-5));
    }

    .head[data-over]::before {
      display: none;
    }

    .head[data-over] .head-main {
      flex: 1;
    }

    .head[data-over] .title {
      color: var(--ink2);
      font-size: var(--t-md);
      font-weight: 500;
      letter-spacing: 0;
    }

    .head[data-over] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
    .head[data-over] .head-actions :global(.segmented) {
      background: var(--s1);
    }

    .head[data-said] .title {
      overflow: visible;
      white-space: normal;
      color: var(--ink2);
      font-size: var(--t-md);
      font-weight: 500;
      letter-spacing: 0;
    }

    .head[data-said] .count {
      font-size: var(--t-md);
    }

    .head[data-said] + .sentence {
      max-inline-size: 24em;
      margin-block: var(--sp-1) 0;
      color: var(--ink);
      font-size: var(--t-3xl);
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: -0.025em;
      text-wrap: pretty;
    }

    .head[data-said] + .sentence :global([data-needs]) {
      font-weight: 600;
    }
  }

  @media (width < 900px) {
    /**
     * THE BAR: `--sticky` tall below the notch, and nothing sticky on a phone is taller.
     *
     * AND THE NOTCH IS PAID HERE, ONCE. `app.html` sets `viewport-fit=cover`, so the top of every
     * screen is under the status bar; padding rather than an inset, so the bar's glass fills the
     * notch strip the way a native screen does, and it costs nothing where the inset is zero.
     * The large title below it pays nothing, because it starts under the bar.
     */
    .head-bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sheet);
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      block-size: calc(var(--sticky) + env(safe-area-inset-top));
      /* A gutter less 4px at each end, so the search circle's edge sits just inside the gutter line. */
      padding: env(safe-area-inset-top) calc(var(--gutter) - var(--sp-1)) 0;
    }

    /* CLEAR OVER THE GROUND, GLASS ONCE ANYTHING HAS SCROLLED UNDER IT: the page slides under the bar from the first
       pixel scrolled, and the one-line title in it has to read over whatever passes. */
    .head-bar::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: var(--glass);
      box-shadow: var(--glass-edge);
      backdrop-filter: var(--glass-blur);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--d-move) var(--ease-out);
    }

    /* SAFARI'S GLASS, in a block of its own and reading the skin's one value, for the reason `Panel.svelte` gives. */
    @supports (-webkit-backdrop-filter: none) {
      .head-bar::before {
        -webkit-backdrop-filter: var(--glass-blur);
      }
    }

    .head-bar[data-under]::before {
      opacity: 1;
    }

    /* The back link: a chevron and the parent's name, 44px tall, never more than two fifths of the
       bar, so the title beside it keeps room to be read. */
    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      flex: 0 1 auto;
      min-inline-size: 0;
      max-inline-size: 40%;
      min-block-size: var(--tap);
      padding-inline-end: var(--sp-2);
      color: var(--ink);
      font-size: var(--t-md);
      font-weight: 500;
      text-decoration: none;
    }

    /* The shared chevron points on; a back link points the other way, in the reading direction. */
    .back-mark {
      display: inline-grid;
      flex: none;
      scale: -1 1;
    }

    .back-mark:dir(rtl) {
      scale: none;
    }

    .back-name {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* The title on one line at 17/24, and only once the large one has gone under the bar. */
    .bar-title {
      flex: 1 1 auto;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      font-size: var(--t-group);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0;
      transition: opacity var(--d-move) var(--ease-out);
    }

    .head-bar[data-past] .bar-title {
      opacity: 1;
    }

    /* THE ASK FIELD, AS A PHONE HOLDS IT: a 44px glass circle at the top right, and plain once the bar
       itself is glass. */
    .find {
      display: grid;
      place-items: center;
      flex: none;
      margin-inline-start: auto;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: var(--glass);
      border: 0;
      border-radius: var(--r-pill);
      box-shadow: var(--glass-edge), var(--e2);
      color: var(--ink);
      cursor: pointer;
      transition:
        background var(--d-state) var(--ease-out),
        box-shadow var(--d-state) var(--ease-out);
    }

    .head-bar[data-under] .find {
      background: transparent;
      box-shadow: none;
    }

    /* THE LARGE TITLE and what goes with it scroll away with the page; only the bar stays. No glass here: the bar is
       the phone's compact form. */
    .head {
      position: static;
      z-index: auto;
      padding: var(--sp-1) var(--gutter) var(--sp-2);
    }

    .head::before {
      display: none;
    }

    .kicker {
      padding-block-start: 0;
    }

    /* The phone's large title, 30/36. It is never the compact one: that is the bar's. */
    .title,
    .head[data-under] .title {
      overflow: visible;
      font-size: var(--t-figure);
      line-height: calc(36 / 30);
      letter-spacing: -0.02em;
      white-space: normal;
    }

    .head[data-under] .count {
      font-size: var(--t-group);
    }

    /**
     * THE SENTENCE IS THE HEADLINE ON A PHONE TOO, at `--t-title` in ink, as it is at 40 from 900px up: on a phone it
     * dropped to body size under a 30px title, so the one line that says what is true today read as a caption to the
     * page's name. The name steps down to the label over it, as it does on a wide screen, and the bar still says the
     * name once both have scrolled away. A head `over` a lead tile steps down the same way: its headline is the tile's
     * (`PageBody`), set at the same size.
     */
    .head[data-said] .title,
    .head[data-over] .title {
      color: var(--ink2);
      font-size: var(--t-md);
      font-weight: 500;
      line-height: 1.5;
      letter-spacing: 0;
    }

    .head[data-said] .count,
    .head[data-over] .count {
      font-size: var(--t-md);
    }

    /* OVER A HEADLINE THE DEFINITION STEPS ASIDE, as it does from 900px up: a grey clause between the name and the
       headline split the one line the screen opens on from the label over it. */
    .head-define[data-over] {
      display: none;
    }

    .head[data-said] + .sentence {
      color: var(--ink);
      font-size: var(--t-title);
      font-weight: 600;
      line-height: calc(34 / 28);
      letter-spacing: -0.02em;
      text-wrap: pretty;
    }

    .head[data-said] + .sentence :global([data-needs]) {
      font-weight: 600;
    }

    /* The bar carries the way back on a phone, so the kicker's link is not said twice. */
    .kicker-link {
      display: none;
    }

    /* The toolbar keeps its glass on a phone: nothing glass is behind it here. */
    .head[data-under] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
    .head[data-under] .head-actions :global(.segmented) {
      background: var(--glass);
      box-shadow: var(--glass-edge);
      backdrop-filter: var(--glass-blur);
    }

    @supports (-webkit-backdrop-filter: none) {
      .head[data-under] .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
      .head[data-under] .head-actions :global(.segmented) {
        -webkit-backdrop-filter: var(--glass-blur);
      }
    }

    /**
     * THE TITLE TAKES ITS OWN WIDTH, AND THE TOOLBAR WRAPS ONLY IF IT HAS TO, to the end of whichever line it lands on.
     */
    .head-main {
      flex-wrap: wrap;
    }

    .title-row {
      flex: 1 1 auto;
    }

    .head-actions {
      margin-inline-start: auto;
    }

    /* AND THE SHORTCUT HINT GOES, because below 900px there is no keyboard to press it with. It is
       the widest thing in the button and it is advice nobody on a phone can take. */
    .head-actions :global(kbd) {
      display: none;
    }
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .head::before {
      border: 1px solid CanvasText;
    }
  }
</style>
