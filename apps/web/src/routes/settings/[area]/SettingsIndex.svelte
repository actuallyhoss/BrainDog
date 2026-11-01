<!--
  The chooser beside an open area: every area as a row, in its group.

  THE INDEX ITSELF IS A DECLARED PAGE NOW (`place.ts` `SETTINGS_INDEX`, drawn by `PageView` at `/settings`). This is
  what stands beside an area once one is open, as the rail stands beside a page, and the open area's row is the current
  one. It draws the groups the index declares, in its order, under the names it gives (`place.ts` `groupsOf`), so a
  person who arranged their index finds the same order here. And it is what `/settings` draws when the record cannot
  draw the declared page, so the index is never missing.

  A LIST ON THE GROUND, NOT A CARD. Each group is a group on the ground: its title at
  `--fs-head` with a hairline under it, and the rows under that with no box round them. A row is the rail's own shape
  at 1440, 36 tall with its glyph and the name at 14/500, and the current row is the rail's "here", drawn as the rail
  draws it: the tile's own fill under the row, the glyph in the working accent and the name at 600 in ink. It was a
  tinted wash under an ink well, a second way of saying "you are here" two columns from the rail's. Never the mark's
  red. Beside an open area it is quieter still (`data-beside`): 200 wide, the group titles at the meta step, each row
  32 tall at 13, and its glyph bare, without a well, as the rail's are.

  WHAT A ROW SAYS UNDER ITS NAME IS FOR THE PHONE. There this list is all a person sees, and the line is how they tell
  the areas apart before opening one. Beside an open area the list is as narrow as the rail, where the line could only
  be drawn cut, and the area it describes is already on screen, so from 900px up a row is its glyph and its name.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { ONLY_WIDE, rowsOf, type AreaGroup } from './place.ts';

  let { groups, current }: { groups: readonly AreaGroup[]; current?: string | undefined } = $props();
</script>

<nav class="index" aria-label={copy.settings} data-beside={current === undefined ? undefined : ''}>
  {#each groups as g, i (i)}
    <div class="group">
      <h2 class="group-title">{g.title}</h2>
      <ul class="area-rows">
        {#each rowsOf(g) as a (a.href)}
          <!-- `wide-only` is one of `settings.css`'s shared rules: the row is not drawn below 900px. -->
          <li class={a.id !== undefined && ONLY_WIDE.has(a.id) ? 'wide-only' : undefined}>
            <a class="area-row" href={at(a.href)} aria-current={a.id !== undefined && a.id === current ? 'page' : undefined}>
              <span class="area-icon"><IconWell name={a.icon} /></span>
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

  /* A GROUP ON THE GROUND: its title at `--fs-head`, 17 on 24 at 600, and one hairline under it. The rows
     start a step under the line, so the wash of the first one never touches it. */
  .group-title {
    margin: 0 0 var(--sp-2);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  /* CLASS NAMES OF ITS OWN, because `.rows`, `.row` and `.glyph` are `blocks.css`'s and `.line` is
     `rows.css`'s, all global. A scoped rule only overrides the properties it names, so every other
     property of theirs reached these elements: the glyph took the size of a block's intent dot
     (`--dot`), and the line under a name took a ledger row's height and padding.

     THE ROWS REACH A STEP PAST THE TITLE'S EDGE, as a list on the ground does (`rows.css` `.ledger`), so the wells
     line up under the group's title and the rounded wash still has somewhere to be. */
  .area-rows {
    display: grid;
    gap: 2px;
    margin: 0 calc(-1 * var(--sp-1));
    padding: 0;
    list-style: none;
  }

  /* BESIDE AN AREA, A ROW IS THE RAIL'S: 36 tall, its glyph in a 28px well, the name 14/500 in the second
     ink. Two columns and not three with the chevron's hidden: a hidden item leaves its track, and the gap before the
     track, taking room from the name. The whole row is the target, and 44 under a thumb. */
  .area-row {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--rail-item-h);
    padding-inline: var(--sp-1) var(--sp-2);
    border-radius: var(--r-pop);
    color: var(--ink-2);
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* THE WELL AT REST IS THE GROUND'S WHITE (`settings.css`), and the current row's glyph takes the accent; the change
     between them is the row's own 90ms. */
  .area-icon {
    display: inline-flex;
  }

  .area-icon :global(.well) {
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  /* THE ELLIPSIS ON THE TEXT ITSELF, a guard for a name longer than any the registry holds today: it is
     cut where somebody can see it is cut, and never wraps a row to another line. */
  .name {
    display: block;
    overflow: hidden;
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* NOT DRAWN BESIDE AN AREA (the file's head says why), and the chevron with it: the chevron says
     "opens a page", which is only true where the index is a page of its own. */
  .area-line,
  .go {
    display: none;
    color: var(--ink-3);
  }

  .go:dir(rtl) {
    scale: -1 1;
  }

  /* THE CURRENT AREA IS "HERE", DRAWN AS THE RAIL DRAWS ITS OWN: the tile's fill under the row, the glyph in ink with
     no fill behind it, and the name at 600 in ink. One selection in the product, not two. INK, NOT RED (design pass
     1 Nov, M27): Look B keeps red for what is wrong or late, never for what is chosen, as the checkboxes went (M6). */
  .area-row[aria-current='page'] {
    background: var(--tile);
    color: var(--ink);
  }

  /* TWO CLASSES AND THE ATTRIBUTE, so this outranks the ground's white well (`settings.css`) wherever the row is. */
  .area-row[aria-current='page'] .area-icon :global(.well.well) {
    background: transparent;
    color: var(--ink);
  }

  .area-row[aria-current='page'] .name {
    font-weight: 600;
  }

  @media (hover: hover) and (pointer: fine) {
    .area-row:not([aria-current]):hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .area-row {
      min-block-size: var(--tap);
    }
  }

  /* BESIDE AN OPEN AREA THE LIST IS QUIET: 200 wide, each group's title at the meta step in the quiet ink with no rule
     under it, and each row 32 tall with a 24px well and its name at 13, so the area beside it is what the eye lands on. */
  @media (width >= 900px) {
    .index[data-beside] {
      gap: var(--sp-4);
    }

    .index[data-beside] .group-title {
      margin: 0 0 var(--sp-1);
      padding: 0;
      border: 0;
      color: var(--ink-3);
      font-size: var(--fs-meta);
      font-weight: var(--fw-medium);
      line-height: 18px;
    }

    .index[data-beside] .area-row {
      grid-template-columns: 24px minmax(0, 1fr);
      column-gap: var(--sp-2);
      min-block-size: 32px;
      border-radius: var(--r-ctl);
    }

    /* BARE GLYPHS BESIDE AN AREA, as the rail's are: a white well on every row was twenty boxes down the column. */
    .index[data-beside] .area-icon :global(.well.well) {
      inline-size: 24px;
      block-size: 24px;
      border-radius: var(--r-xs);
      background: transparent;
    }

    .index[data-beside] .area-icon :global(.well .icon[data-size]) {
      inline-size: 16px;
      block-size: 16px;
    }

    .index[data-beside] .name {
      font-size: var(--fs-meta);
      line-height: 18px;
    }
  }

  /* ON A PHONE THE INDEX IS THE PAGE: a 32px well, the name at the phone's body size and its line under it,
     then the chevron, in a row 60 tall, with a hairline between rows under the words and none around them. The line
     keeps to one line with an ellipsis as its guard; the registry keeps each line short enough that the guard is not
     what a reader sees. */
  @media (width < 900px) {
    .area-rows {
      gap: 0;
    }

    .area-rows > li {
      position: relative;
    }

    .area-rows > li + li::after {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline: calc(var(--sp-1) + var(--well-l) + var(--sp-3)) var(--sp-2);
      block-size: 1px;
      background: var(--rule);
      pointer-events: none;
    }

    .area-row {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      column-gap: var(--sp-3);
      min-block-size: 60px;
      color: var(--ink);
    }

    .area-icon :global(.well) {
      inline-size: var(--well-l);
      block-size: var(--well-l);
    }

    .name {
      font-size: var(--fs-body);
      line-height: 22px;
    }

    .area-line {
      display: block;
      overflow: hidden;
      font-size: var(--fs-meta);
      line-height: 18px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .go {
      display: inline-flex;
    }
  }
</style>
