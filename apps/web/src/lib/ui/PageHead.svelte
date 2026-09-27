<!--
  The header of every body surface: a title, a count, one primary action, and the filters.

  The title is `page.title` else `register.name`, NEVER an id. `register`, `predicate` and
  `projection` are internal vocabulary and where a draft leaked them into UI copy, that is a defect
  (19 §9). NOR DOES AN ID FOLLOW IT: the head took an `id` and printed it after every title, which
  is how "SG5" came to sit after a question on Decide. A person reads a name here, and an id lives
  in a row's Details and in "Copy link" (design SYS-3).

  The count says `n of N`, and when examples are in the figure it says so: a metric counts example
  rows and admits it, because the alternative is a money page reading "Due in 30 days · EGP 0"
  directly above a table containing one obligation due in 30 days (19 §6).

  TWO SHAPES, ONE ON EACH SIDE OF 900px (design SYS-4, DSN-6).

  From 900px up the head is one sticky bar: the kicker over a 20px title, the count, and the actions
  at the right. It is opaque `--bg` at rest and turns translucent, with a hairline, only once
  something has scrolled under it; a head drawn translucent over nothing was a lighter band across
  the top of every screen.

  Below 900px the head is a phone's. A `--sticky` (52px) bar stays at the top: the back link on a
  detail page (a chevron and the parent's name), the title on one line once the large title has
  scrolled away, and a 44px search button, which is where the floating search disc went (none on
  `/search`, which is the search). Under it the large 24px title and the actions scroll away with
  the page. The old head stayed pinned whole at this width, and a decision's two-line title and its
  action row held 235px of an 844px screen with the content sliding under it.

  A KICKER WITH `back` IS A LINK. A detail page's kicker named its parent ("Money", "Decide",
  "Settings") as a `<p>`, and on a phone, with no rail, the only way back was the browser. With
  `back` the kicker links there at 1440 and is the bar's back link on a phone.
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
    actions,
    icon,
    hue,
    define,
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
     * A load-bearing noun this heading is the first sight of, explained once and never again.
     *
     * `19 §6`. The clause goes UNDER the `h1` and never inside it: a heading is an address in the
     * document outline and a name in the accessibility tree, and a definition appended to it makes
     * both longer for everybody, for ever, to teach one word once.
     */
    define?: Noun | undefined;
    actions?: Snippet | undefined;
  } = $props();

  /* THE HAIRLINE SHOWS ONLY ONCE SOMETHING HAS SCROLLED UNDER THE HEAD. At rest a rule under the
     title only boxed it. A zero-height mark where the head starts leaves the scroller the moment
     the head sticks, which is the moment an edge starts meaning something. */
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
<header class="head" data-under={under ? '' : undefined}>
  <div class="head-main">
    <div class="head-titles">
      {#if kicker && back}
        <a class="kicker kicker-link tap" href={at(back)}>{kicker}</a>
      {:else if kicker}
        <p class="kicker">{kicker}</p>
      {/if}
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
          says nothing. This was `count !== undefined`, and `0 !== undefined`, so `/vault` printed
          `Vault 0` over "No credential yet." and `/inbox` printed `Inbox 0` over its own sentence.
          `Section` had the identical line and the identical defect.

          AND `0 of 38` IS NOT THE SAME THING AT ALL. It is a filter that matched nothing over a list
          that holds thirty-eight rows, which is a fact somebody needs: `19 §6` is that a surface showing
          nothing must never be indistinguishable from a surface with nothing to show. So a bare zero
          goes and a zero with a total beside it stays, which is why this is not the one-line fix
          `Section` got.

          AND THE TEST IS ON THE TOTAL'S VALUE, NOT ON WHETHER IT WAS PASSED. The first attempt at this
          read `total !== undefined`, which let the bare zero straight back through: the register sets
          its denominator to the MATCHED count while a filter is on, so searching for something with no
          matches gives `count: 0, total: 0` and the head printed `Obligations 0` over "38 rows, none
          matching". Both halves zero is the state with nothing to say.
        -->
        {#if count || total}
          <p class="count num">
            {(count ?? 0).toLocaleString('en')}{#if atLeast}<span class="more-sign">+</span>{/if}{#if total !== undefined && (atLeast || total !== count)}<span
                class="of">&nbsp;of {total.toLocaleString('en')}</span
              >{/if}
          </p>
        {/if}
      </div>
    </div>
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>
<!--
  THE DEFINITION IS READ ONCE, SO IT DOES NOT RIDE IN THE STICKY HEAD.

  It sat inside `.head-titles`, which is inside a `position: sticky` header, so the one sentence
  this product shows a person the first time they meet a word stayed pinned to the top of the screen
  for the whole scroll. Measured at 390: the head of `/r/obligations` was 150px, 19 per cent of the
  788 above the tab bar, and 44px of it was "A list of one kind of thing, with the same fields on
  every row." `19 §6` gives the definition its place, the first time the word appears; it does not
  give it the top of the screen for as long as the page is open. Out here it is read where it is
  met and scrolls away with the list, and it still shows once and never again.
-->
{#if define}<p class="head-define"><Define noun={define} /></p>{/if}

<style>
  /* Same size as the figure, dimmed: it modifies the number rather than being part of it. */
  .more-sign {
    color: var(--dim);
  }

  /* Sticky, and `--sticky` is what `scroll-padding-block` is set from, so keyboard focus never
     lands underneath it (WCAG 2.4.11). Paid once, in app.css. */
  /* No margin of its own: it is either there or it is not, and a head that reserved the space
     would leave a gap on every screen after the first. */
  .head-define {
    margin: 0;
    /* The head's own inline padding, so the sentence starts under the title it defines now that it
       is outside the box that used to pad it. */
    padding: var(--sp-2) var(--gutter) 0;
    max-inline-size: calc(var(--measure) + var(--gutter) * 2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE PHONE'S BAR IS A PHONE'S. The rule below 900px draws it. */
  .head-bar {
    display: none;
  }

  .head {
    position: sticky;
    inset-block-start: 0;
    /* `--z-sheet`, the same token `TabBar.svelte` uses for its own fixed chrome: this is sticky
       page chrome that has to stay above the content scrolling under it, the identical need a
       sheet-covering bottom bar has, just spelled `position: sticky` instead of `fixed`. */
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    /* One gutter for the head and the content under it (DESIGN-SYSTEM 3.1), so a title and its
       list share a left edge. It was 24 here and 32 on every page. */
    padding: var(--sp-5) var(--gutter) var(--sp-3);
    /* OPAQUE AT REST (design SYS-5). Translucent over nothing, it was a lighter band across the top
       of every screen; it turns translucent below, once something has scrolled under it. */
    background: var(--bg);
    /* Transparent rather than absent, so the head does not grow a pixel when the rule appears. */
    border-block-end: 1px solid transparent;
    transition:
      border-color var(--d-state) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  .head[data-under] {
    border-block-end-color: var(--line);
  }

  /**
   * TRANSLUCENT ONCE SOMETHING IS UNDER IT, from 900px up and only under a fine pointer.
   *
   * 92, NOT 82: at 82 the words scrolling under a two-line head read through it between the
   * buttons, which is noise, not depth; the blur still softens what passes under.
   *
   * NOT UNDER A COARSE POINTER, because `backdrop-filter` makes the head the box a fixed descendant
   * is placed against. A menu in the head's actions opens as an action sheet under a coarse pointer;
   * `Menu.svelte` lifts it into the top layer, which no filter reaches, but in a browser without
   * popovers it is a fixed panel, and inside a filtered head it would sit at the bottom of the head
   * rather than of the screen. Below 900px the head is not sticky and nothing scrolls under it.
   */
  @media (width >= 900px) and (pointer: fine) {
    .head[data-under] {
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(12px);
    }
  }

  .head-main {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-4);
  }

  .head-titles {
    flex: 1;
    min-inline-size: 0;
  }

  /* Sentence case, and it was letterspaced caps. An eyebrow in capitals over every title is the
     house style of a report; the reference product has none, and the kicker reads as the words
     it is rather than as a label stamped on the page. */
  .kicker {
    display: block;
    inline-size: fit-content;
    margin-block-end: 2px;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  /* A LINK IN THE KICKER'S OWN VOICE: quiet until it is pointed at, when it says it goes somewhere
     with ink and the house underline (`--link`, design 6.2). Never the accent. */
  .kicker-link {
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .kicker-link:hover {
      color: var(--link);
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* Geist at 20/600 from 900px up, and the phone's large title at 24/600 below it (design 6.2).

     A BLOCK AND NOT A FLEX ROW, so a title that wraps is text that wraps, with its glyph inline
     before the first word. */
  .title {
    display: block;
    min-inline-size: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  /* The thing's own frozen hue, same lightness and chroma as its mark in the grid. A page about
     Kiln is headed in Kiln's colour, which is the one colour here that names something. */
  .title-icon {
    display: inline-grid;
    place-items: center;
    margin-inline-end: var(--sp-2);
    vertical-align: -0.15em;
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  /* Beside the title on its baseline, and quieter than it. At 20px on the far right it read as a
     second, unlabelled figure. */
  .count {
    color: var(--dim);
    font-size: var(--t-base);
    font-variant-numeric: tabular-nums;
  }

  /* THE SPACE IS A CHARACTER, AND IT HAS TO BE.

     Svelte collapses the whitespace at the start of the span, so this rendered `4of 38` at every
     width on every filtered register. It was fixed with `margin-inline-start` and a comment arguing
     that a `&nbsp;` "would be a character in the accessible name; this is not" — which is the
     failure stated as the fix. The pixels were right and the TEXT still read `10of 38`: that is
     what a screen reader announces, what find-in-page searches, and what a copy-paste carries. A
     margin is not a separator; it is a gap where one should be. */
  .of {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    /* A FLEX CHILD DOES NOT SHRINK BELOW ITS CONTENT UNLESS IT IS TOLD TO. Without this the actions
       row kept its widest button's width at every viewport and pushed the header off the side of a
       320px window — 399px of it — which the layout gate could not see, because the shell's scroll
       panel counted as containing it. */
    min-inline-size: 0;
  }


  @media (width < 900px) {
    /**
     * THE BAR: `--sticky` tall below the notch, and nothing sticky on a phone is taller.
     *
     * AND THE NOTCH IS PAID HERE, ONCE. `app.html` sets `viewport-fit=cover`, so the top of every
     * screen is under the status bar; padding rather than an inset, so the bar's own ground fills
     * the notch strip the way a native screen does, and it costs nothing where the inset is zero.
     * The large title below it pays nothing, because it starts under the bar.
     *
     * OPAQUE: the page slides under it from the first pixel scrolled, and the one-line title in it
     * has to read over whatever passes; and a filter here would be the box a menu's fixed action
     * sheet is placed against in a browser without popovers (see the `.head` rule above).
     */
    .head-bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sheet);
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      block-size: calc(var(--sticky) + env(safe-area-inset-top));
      /* A gutter less 12px at each end: the search button's 20px glyph sits 12px inside its 44px
         box, so its far edge lands on the gutter line the title below ends on. */
      padding: env(safe-area-inset-top) calc(var(--gutter) - var(--sp-3)) 0;
      background: var(--bg);
      border-block-end: 1px solid transparent;
      transition: border-color var(--d-state) var(--ease-out);
    }

    .head-bar[data-under] {
      border-block-end-color: var(--line);
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

    /* The title on one line, and only once the large one has gone under the bar. */
    .bar-title {
      flex: 1 1 auto;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      font-size: var(--t-md);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    .head-bar[data-past] .bar-title {
      opacity: 1;
    }

    .find {
      display: grid;
      place-items: center;
      flex: none;
      margin-inline-start: auto;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-pill);
      color: var(--ink);
      cursor: pointer;
    }

    /* The large title and what goes with it scroll away with the page; only the bar stays. */
    .head {
      position: static;
      z-index: auto;
      padding: var(--sp-2) var(--gutter) var(--sp-3);
      border-block-end: 0;
    }

    .title {
      font-size: var(--t-xl);
    }

    /* The bar carries the way back on a phone, so the kicker's link is not said twice. */
    .kicker-link {
      display: none;
    }

    .head-main {
      flex-wrap: wrap;
      align-items: baseline;
    }

    /**
     * THE TITLE TAKES ITS OWN WIDTH, AND WHAT FOLLOWS IT WRAPS ONLY IF IT HAS TO.
     *
     * `flex-basis: auto` is the title's own width, so an action that does not fit beside it wraps
     * to a line of its own, and `margin-inline-start: auto` puts the actions at the end of whichever
     * line they land on.
     */
    .head-titles {
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
</style>
