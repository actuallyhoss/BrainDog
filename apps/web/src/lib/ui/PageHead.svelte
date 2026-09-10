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
    /** The glyph the register or page already declares. The rail draws it; the page dropped it. */
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
</script>

<header class="head">
  <div class="head-main">
    <div class="head-titles">
      {#if kicker}<p class="kicker">{kicker}</p>{/if}
      <!-- The `dir="auto"` is on a SPAN around the title, not on the `h1`, and the difference is
           the whole rule: the title came from whoever typed it, the id chip beside it is ours. An
           Arabic title in an English paragraph puts its own full stop on the wrong end and has to
           be fixed — but `.title` is a flex row, so putting the attribute on the `h1` resolved the
           FLEX direction too and swung our own id chip to the other side of the heading. Chrome
           keeps the UI's direction; data follows its own. See the note in `blocks.css`. -->
      <h1 class="title">
        <!-- Every register and page declares an icon, the rail has always drawn it, and the page's
             own header threw it away — so the one heading that names the thing you are looking at
             was the only place it did not appear. -->
        {#if icon}
          <span
            class="title-icon"
            data-hued={hue === undefined ? undefined : ''}
            style={hue === undefined ? undefined : `--hue:${hue}`}
          >
            <Icon name={icon} size="l" />
          </span>
        {/if}
        <span dir="auto">{title}</span>
        {#if id}<span class="title-id">{id}</span>{/if}
      </h1>
      {#if define}<p class="head-define"><Define noun={define} /></p>{/if}
    </div>
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
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>

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
  }

  .head {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-5) var(--sp-3);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px);
    border-block-end: 1px solid var(--line);
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

  .kicker {
    margin-block-end: 1px;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--t-xl);
    letter-spacing: -0.026em;
  }

  .title-icon {
    display: grid;
    place-items: center;
    align-self: center;
    color: var(--dim);
  }

  /* The thing's own frozen hue, same lightness and chroma as its mark in the grid. A page about
     Kiln is headed in Kiln's colour, which is the one colour here that names something. */
  .title-icon[data-hued] {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .title-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-md);
    font-weight: 400;
    letter-spacing: -0.02em;
  }


  .count {
    color: var(--ink2);
    font-size: var(--t-lg);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
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
      padding: calc(var(--sp-3) + env(safe-area-inset-top)) var(--sp-3) var(--sp-2);
      padding-inline-end: 56px;
    }

    .head-main {
      flex-wrap: wrap;
      align-items: baseline;
    }

    /**
     * THE TITLE TAKES THE WHOLE LINE ONLY WHEN SOMETHING HAS TO GO UNDER IT.
     *
     * This was `.head-titles { flex-basis: 100% }` for every head below 900px, so everything after
     * the title wrapped. That is right when there are actions, which need a row of their own at
     * phone width, and it was applied just as hard when the only thing after the title was a
     * count. Measured at 390: Inbox, Vault, Audit and Search each drew a 91px head whose second
     * line held one number, `6` or `14`, alone at the left edge, where the same head at 1440 is
     * 59px with the count beside the title. A whole line of the smallest screen spent on a digit.
     *
     * `:has(.head-actions)` so a head that carries a control keeps its second row, which is the
     * register's `New item` and Home's `to decide`, and a head that carries only a count keeps it
     * on the title's line, right-aligned, the way every wider screen already draws it.
     */
    .head-main:has(.head-actions) .head-titles {
      flex-basis: 100%;
    }


    .head-actions {
      margin-inline-start: auto;
    }

    /* AND THE SHORTCUT HINT GOES, because below 900px there is no keyboard to press it with. It is
       the widest thing in the button and it is advice nobody on a phone can take. */
    .head-actions :global(kbd) {
      display: none;
    }

    .title {
      font-size: var(--t-lg);
    }
  }
</style>
