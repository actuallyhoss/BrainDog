<!--
  The header of every body surface: a title, a count, one primary action, and the filters.

  The title is `page.title` else `register.name` — NEVER an id. `register`, `predicate` and
  `projection` are internal vocabulary and where a draft leaked them into UI copy, that is a defect
  (19 §9).

  The count says `n of N`, and when examples are in the figure it says so: a metric counts example
  rows and admits it, because the alternative is a money page reading "Due in 30 days · EGP 0"
  directly above a table containing one obligation due in 30 days (19 §6).
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import Define from './Define.svelte';
  import type { Noun } from '$lib/define.svelte.ts';
  import type { IconName } from './icons.ts';
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    total,
    atLeast,
    kicker,
    actions,
    id,
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
    kicker?: string | undefined;
    id?: string | undefined;
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
</script>

<div bind:this={mark} aria-hidden="true"></div>
<header class="head" data-under={under ? '' : undefined}>
  <div class="head-main">
    <div class="head-titles">
      {#if kicker}<p class="kicker">{kicker}</p>{/if}
      <!-- The `dir="auto"` is on a SPAN around the title, not on the `h1`, and the difference is
           the whole rule: the title came from whoever typed it, the id chip beside it is ours. An
           Arabic title in an English paragraph puts its own full stop on the wrong end and has to
           be fixed — but `.title` is a flex row, so putting the attribute on the `h1` resolved the
           FLEX direction too and swung our own id chip to the other side of the heading. Chrome
           keeps the UI's direction; data follows its own. See the note in `blocks.css`. -->
      <div class="title-row">
        <h1 class="title">
          <!-- ONLY WITH A HUE. A page about one thing wears that thing's coloured mark; a grey glyph
               before every other heading only repeated the rail and read as admin navigation. -->
          {#if icon && hue !== undefined}
            <span class="title-icon" style="--hue:{hue}">
              <Icon name={icon} size="l" />
            </span>
          {/if}
          <span dir="auto">{title}</span>
          {#if id}<span class="title-id">{id}</span>{/if}
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
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px);
    /* Transparent rather than absent, so the head does not grow a pixel when the rule appears. */
    border-block-end: 1px solid transparent;
    transition: border-color var(--d-state) var(--ease-out);
  }

  .head[data-under] {
    border-block-end-color: var(--line);
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
    margin-block-end: 2px;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* Geist at 20/600, the one title size on every screen (DESIGN-SYSTEM 2.2). It was Poppins at 24
     everywhere except Home, which overrode it: two type systems in one product.

     A BLOCK AND NOT A FLEX ROW, so a title that wraps is text that wraps. As a flex row the title's
     span became a box as wide as the line, and a two-line title on a phone left its `#1` stranded at
     the far edge of an empty column. Inline, the id follows the last word it belongs to. */
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

  .title-id {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    font-weight: 400;
    letter-spacing: 0;
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
    .head {
      /* The palette launcher is a fixed header button at this width, so the title clears it.
         AND THE NOTCH. `app.html` sets `viewport-fit=cover`, so at scroll top the `h1` of every
         screen in the product was behind the status bar. Padding rather than an inset, so the
         head's own translucent blurred background fills the notch strip the way a native screen
         does, and so it costs nothing on a device where the inset is zero. */
      padding: calc(var(--sp-3) + env(safe-area-inset-top)) var(--gutter) var(--sp-2);
      padding-inline-end: 56px;
    }

    .head-main {
      flex-wrap: wrap;
      align-items: baseline;
    }

    /**
     * THE TITLE TAKES ITS OWN WIDTH, AND WHAT FOLLOWS IT WRAPS ONLY IF IT HAS TO.
     *
     * Below 900px this forced the title onto a line of its own whenever the head carried an action,
     * on the argument that a control needs a row of its own at phone width. Measured at 390 in the
     * production build, that stranded the register's count alone at the left of a second row with
     * `New item` in the middle of it, while `Money`, `38` and the button together are about 230px
     * of a 322px line. Home's date is the case the rule was for, and it still gets its second row:
     * `flex-basis: auto` is the title's own width, so an action that does not fit beside it wraps,
     * and `margin-inline-start: auto` below puts it at the end of the line it lands on.
     *
     * An earlier pass took the same rule off heads that carry only a count, for the same reason.
     */
    .head-titles {
      flex: 1 1 auto;
    }


    .head-actions {
      flex-basis: 100%;
    }

    /* AND THE SHORTCUT HINT GOES, because below 900px there is no keyboard to press it with. It is
       the widest thing in the button and it is advice nobody on a phone can take. */
    .head-actions :global(kbd) {
      display: none;
    }
  }
</style>
