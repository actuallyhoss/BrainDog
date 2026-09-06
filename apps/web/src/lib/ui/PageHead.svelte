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
  import type { IconName } from './icons.ts';
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    total,
    kicker,
    actions,
    id,
    icon,
    hue,
  }: {
    title: string;
    /** The glyph the register or page already declares. The rail draws it; the page dropped it. */
    icon?: IconName | undefined;
    /** The frozen hue of the row this page is about, when it is about one. */
    hue?: number | undefined;
    count?: number | undefined;
    total?: number | undefined;
    kicker?: string | undefined;
    id?: string | undefined;
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
    </div>
    {#if count !== undefined}
      <p class="count num">
        {count.toLocaleString('en')}{#if total !== undefined && total !== count}<span class="of">
            of {total.toLocaleString('en')}</span
          >{/if}
      </p>
    {/if}
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  /* Sticky, and `--sticky` is what `scroll-padding-block` is set from, so keyboard focus never
     lands underneath it (WCAG 2.4.11). Paid once, in app.css. */
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
      /* The palette launcher is a fixed header button at this width, so the title clears it. */
      padding: var(--sp-3) var(--sp-3) var(--sp-2);
      padding-inline-end: 56px;
    }

    .head-main {
      flex-wrap: wrap;
      align-items: baseline;
    }

    .head-titles {
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
