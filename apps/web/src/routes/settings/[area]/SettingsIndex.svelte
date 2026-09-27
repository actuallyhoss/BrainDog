<!--
  The settings index: every area as a row, in its group (DSN-13).

  ONE INDEX AT BOTH WIDTHS. Below 900px it is the whole of `/settings`, a list of 56px rows with a
  chevron that each open an area on a page of its own. From 900px up it stands beside the area that
  is open, as the rail stands beside a page, and the open area's row is the current one. It is the
  same list in both places, the same groups, rows and order, so a person who learns where an area
  sits on one screen finds it there on the other.

  WHAT A ROW SAYS UNDER ITS NAME IS FOR THE PHONE. There the index is all a person sees, and the line
  is how they tell the areas apart before opening one. Beside an open area the index is as narrow as
  the rail, where the line could only be drawn cut, and the area it describes is already on screen,
  so from 900px up a row is its glyph and its name, as a rail row is.

  The rows come from `AREAS` in `+page.svelte`, which is the registry; the groups and the areas a
  phone is not offered come from `place.ts`.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { ONLY_WIDE, grouped, type AreaRow } from './place.ts';

  let { areas, current }: { areas: readonly AreaRow[]; current?: string | undefined } = $props();

  const groups = $derived(grouped(areas));
</script>

<nav class="index" aria-label={copy.settings}>
  {#each groups as g (g.id)}
    <div class="group">
      <h2 class="group-title">{g.title}</h2>
      <ul class="area-rows">
        {#each g.areas as a (a.id)}
          <!-- `wide-only` is one of `settings.css`'s shared rules: the row is not drawn below 900px. -->
          <li class={ONLY_WIDE.has(a.id) ? 'wide-only' : undefined}>
            <a class="area-row" href={at(`/settings/${a.id}`)} aria-current={a.id === current ? 'page' : undefined}>
              <span class="area-icon"><Icon name={a.icon} size="m" /></span>
              <span class="words">
                <span class="name">{a.label}</span>
                {#if a.line}<span class="area-line">{a.line}</span>{/if}
              </span>
              <span class="go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  .index {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* A LABEL OVER ITS ROWS, NOT A SECTION TITLE. The group names the rows under it; the page's own
     sections are the area's, and a heading as loud as theirs would compete with them at 1440. */
  .group-title {
    margin: 0 0 var(--sp-2);
    padding-inline: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* CLASS NAMES OF ITS OWN, because `.rows`, `.row` and `.glyph` are `blocks.css`'s and `.line` is
     `rows.css`'s, all global. A scoped rule only overrides the properties it names, so every other
     property of theirs reached these elements: the glyph took the size of a block's intent dot
     (`--dot`), and the line under a name took a ledger row's height and padding. */
  .area-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* BESIDE AN AREA, A ROW IS ITS GLYPH AND ITS NAME, as a rail row is, at a control's height, which is
     44 under a thumb. Two columns and not three with the chevron's hidden: a hidden item leaves its
     track, and the gap before the track, taking room from the name. The whole row is the target. */
  .area-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .area-icon {
    display: inline-flex;
    color: var(--dim);
  }

  .words {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  /* THE ELLIPSIS ON THE TEXT ITSELF, a guard for a name longer than any the registry holds today: it is
     cut where somebody can see it is cut, and never wraps a row to another line. */
  .name {
    display: block;
    overflow: hidden;
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: var(--lh-tight);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* NOT DRAWN BESIDE AN AREA (the file's head says why), and the chevron with it: the chevron says
     "opens a page", which is only true where the index is a page of its own. */
  .area-line,
  .go {
    display: none;
    color: var(--dim);
  }

  .go:dir(rtl) {
    scale: -1 1;
  }

  /* THE CURRENT AREA IS THE ONE "HERE" THE PRODUCT HAS: the `--selected` ground and an ink glyph, as the
     rail's current row, and never the accent (design D-1). */
  .area-row[aria-current='page'] {
    background: var(--selected);
  }

  .area-row[aria-current='page'] .area-icon {
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .area-row:not([aria-current]):hover {
      background: var(--hover-wash);
    }
  }

  /* ON A PHONE THE INDEX IS THE PAGE: icon, name and its line, then the chevron, in a row never shorter
     than a two-line row (`--row-h-2`), with a hairline between rows and none around them. The line
     keeps to one line with an ellipsis as its guard; the registry keeps each line short enough that
     the guard is not what a reader sees. */
  @media (width < 900px) {
    .area-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-block-size: var(--row-h-2);
    }

    .area-rows > li + li {
      border-block-start: 1px solid var(--line-soft);
    }

    .name {
      font-size: var(--t-md);
    }

    .area-line {
      display: block;
      overflow: hidden;
      font-size: var(--t-sm);
      line-height: var(--lh-tight);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .go {
      display: inline-flex;
    }
  }
</style>
