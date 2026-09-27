<!--
  The bar over the list: the search box, the filters as pills, menus or one phone button, the list
  clauses a pill cannot draw, Clear, Save as a view and Display. And the phone's filter sheet, which
  is the same filters behind the one button.

  THE BAR APPEARS WHEN THERE IS SOMETHING TO SIFT, which is `shown`, the page's answer. Below eight
  rows it was a search box, six chips and a keyboard strip standing over a list you could already
  read, and on the first run it stood over the one row somebody had just typed.

  THE FILTER DRAWER IS GONE, AND THE CHIPS ARE THE FILTER. It rendered the same enum fields as the
  segmented controls in the toolbar, as checkboxes, behind a scrim, over the identical controls
  still visible underneath it. The bar wraps, so the chips are never hidden at any width. A drawer
  earns its place when there are more fields than fit, and on a phone that is what the sheet below
  is for.

  EVERYTHING IS THE PAGE'S BUT WHETHER THE SHEET IS OPEN. Which filters are on lives in the address,
  and the page reads it and writes it (`isOn`, `toggleFilter`, `dropFilter`, `setQuery`); the counts
  are the page's `facets`; `saveView` is the page's write. The sheet's open state is kept here
  because nothing but this bar opens it or reads it.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { labelOf } from '$lib/record/api.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ViewsMenu from './ViewsMenu.svelte';
  import type { Listed } from './list.ts';

  let {
    shown,
    register,
    name,
    q,
    filtered,
    enums,
    listed,
    facets,
    isOn,
    toggleFilter,
    dropFilter,
    setQuery,
    saveView,
    ondisplay,
  }: {
    /** Whether the list is big enough to sift, or is being sifted already. */
    shown: boolean;
    register: string;
    /** The list's own name, which the search box names itself by. */
    name: string;
    q: string;
    /** A search or a filter is on. */
    filtered: boolean;
    /** Every declared enum field a reader can sift on. */
    enums: readonly FieldDecl[];
    listed: readonly Listed[];
    facets: ReadonlyMap<string, ReadonlyMap<string, number>>;
    isOn: (field: string, value: string) => boolean;
    toggleFilter: (field: string, value: string) => void;
    dropFilter: (at: number) => void;
    setQuery: (value: string) => void;
    saveView: () => void;
    ondisplay: () => void;
  } = $props();

  /* The phone's filter sheet: every enum field and Clear, behind one button beside Display. */
  let filterOpen = $state(false);

  /* This part's own words: the phone's Filter button, named with what is chosen in it. */
  const words = { filterOn: (chosen: string): string => `${copy.filter}: ${chosen}` } as const;
</script>

{#if shown}
<div class="bar">
  <label class="field">
    <Icon name="search" size="s" />
    <!-- A NAME, NOT A PLACEHOLDER. The input sits in a `<label>` whose only other child is an
         `aria-hidden` icon, so its accessible name came from the placeholder alone, which
         disappears the moment somebody types, taking the name with it. Every search box in the
         product had the same shape. -->
    <input
      class="field-input"
      type="search"
      aria-label={copy.searchIn(name)}
      placeholder="Search {name.toLowerCase()}"
      value={q}
      oninput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  <!--
    THREE FIELDS OF PILLS DO NOT FIT ONE ROW. Services filters by kind, cycle and status, ten pills
    that measured 928px beside a 242px search in a 1126px bar at 1440, so the last group and
    Display wrapped to a second row, and on a phone the strip clipped its own last word. With
    three or more fields each field is one control instead: its name, the values chosen in it,
    and a menu of every value with its count. Two fields still fit, and stay pills, where every
    choice is visible without a press.
  -->
  <!--
    ON A PHONE THE FIELDS ARE ONE BUTTON AND A SHEET. Three field menus, Clear filters and Display
    measured past 390 on Services with one filter on, so Clear and Display were reached by
    scrolling the bar sideways, and a control nobody knows is there is a control that is not
    there. The sheet holds every field and Clear, and Display sits beside it.

    AND THE BUTTON IS 44px SQUARE, so the phone's bar is one row: search, Filter, Display (design
    SYS-6, DSN-7). It said "Filter" and every chosen value in words, which took a second line under
    the search box. How many values are on is the figure beside the glyph, and what they are is in
    its name for a screen reader and in the sheet it opens.
  -->
  {#if rowsAsCards() && enums.length}
    {@const chosen = enums.flatMap((f) => (f.values ?? []).filter((value) => isOn(f.id, value)).map((value) => valueSaid(f, value)))}
    <button
      type="button"
      class="sift sift-sheet tap"
      data-on={chosen.length ? '' : undefined}
      aria-haspopup="dialog"
      aria-label={chosen.length ? words.filterOn(chosen.join(', ')) : copy.filter}
      onclick={() => (filterOpen = true)}
    >
      <Icon name="filter" size="m" />
      {#if chosen.length}<span class="sift-count num" aria-hidden="true">{chosen.length}</span>{/if}
    </button>
  {:else if enums.length >= 3}
    {#each enums as f}
      {@const chosen = (f.values ?? []).filter((value) => isOn(f.id, value))}
      <Menu label={labelOf(f)}>
        {#snippet trigger()}
          <span class="sift" data-on={chosen.length ? '' : undefined}>
            <span class="sift-name">{labelOf(f)}</span>
            {#if chosen.length}<span class="sift-chosen">{chosen.map((value) => valueSaid(f, value)).join(', ')}</span>{/if}
            <span class="sift-open"><Icon name="chevron" size="s" /></span>
          </span>
        {/snippet}
        {#each f.values ?? [] as value}
          {@const on = isOn(f.id, value)}
          <button
            type="button"
            class="mi"
            role="menuitemcheckbox"
            aria-checked={on ? 'true' : 'false'}
            onclick={() => toggleFilter(f.id, value)}
          >
            <span class="mi-tick">{#if on}<Icon name="check" size="s" />{/if}</span>
            <span class="mi-name">{valueSaid(f, value)}</span>
            <span class="segment-n">{facets.get(f.id)?.get(value) ?? 0}</span>
          </button>
        {/each}
      </Menu>
    {/each}
  {:else}
    {#each enums as f}
      <div class="segmented" role="group" aria-label={labelOf(f)}>
        {#each f.values ?? [] as value}
          {@const on = isOn(f.id, value)}
          <!-- `aria-pressed`, BECAUSE THE STATE WAS ONLY A COLOUR. A raised white segment says
               "this filter is on" to whoever can see it and nothing at all to anybody else, and
               which filters are on is the whole of what the grid underneath is showing. `data-on`
               is the style hook; this is the fact. `RowForm`'s own segmented control has carried it
               since it was written, so the two were a pair that had drifted. -->
          <button
            type="button"
            class="segment"
            data-on={on ? '' : undefined}
            aria-pressed={on ? 'true' : 'false'}
            onclick={() => toggleFilter(f.id, value)}
          >
            <span class="segment-word">{valueSaid(f, value)}</span>
            <span class="segment-n">{facets.get(f.id)?.get(value) ?? 0}</span>
          </button>
        {/each}
      </div>
    {/each}
  {/if}

  <!-- A LIST CLAUSE, AS THE ONE CONTROL A LIST CAN HAVE. There is no declared set to draw pills
       from, so the clause is the chip and pressing it takes it off (the page's `listed` says why).
       It sits after the pills and before Clear because it is the narrowing a reader did not choose
       here: it arrived in the address, from a block, a metric or a saved view. -->
  {#each listed as c (c.at)}
    <button type="button" class="sift listed tap" data-on aria-pressed="true" onclick={() => dropFilter(c.at)}>
      <span class="sift-name">{c.field ? labelOf(c.field) : c.f.field} {c.f.op}</span>
      <span class="sift-chosen">{c.f.values[0] ?? ''}</span>
      <Icon name="close" size="s" />
    </button>
  {/each}

  {#if filtered && !(rowsAsCards() && enums.length)}
    <span class="bar-clear"><Button weight="bare" href="/r/{register}"><Icon name="close" size="s" />{copy.clearFilters}</Button></span>
  {/if}

  <!-- DISPLAY WAS A KEY AND NOTHING ELSE. `v` opens its sheet, the keymap sheet prints it, and
       on a phone neither of those is reachable, so which columns you see and what the list is
       sorted by were both unreachable on the device where the table that carries them is
       `display: none`. `19 §4` makes the key an accelerator OVER a visible control; there was
       no control to accelerate.

       IT IS IN THE BAR, which appears at eight rows. Below that there is nothing to sort and
       nothing worth hiding. -->
  <!-- AT THE END OF THE BAR, where a keyboard strip used to stand. It printed four bindings
       to every visitor on every visit, `j k` move, `p` peek, Enter open and archive: a screen
       explaining its own interface to people who had not asked. The bindings are untouched.
       The `?` sheet lists them by reading the registry, and the row menu prints each verb's
       key beside it, which is where somebody learning them is already looking. -->
  <!-- SAVE AS A VIEW, only while a filter or a search is on (`ViewsMenu` says why). It stands
       before Display because both are about the list as a whole, and Display stays last as the
       one that changes how it looks. On a phone with filters it lives in the filter sheet
       instead, beside Clear, for the reason Clear does. -->
  {#if filtered && !(rowsAsCards() && enums.length)}
    <span class="bar-save"><ViewsMenu {saveView} /></span>
  {/if}
  <!-- ITS NAME IS "Display" AT EVERY WIDTH. On a phone the word is hidden and the glyph is the
       44px control, and the word stays in the button for a screen reader and for the gates that
       press it by name. -->
  <span class="bar-end">
    <Button weight="bare" onclick={ondisplay}>
      <Icon name="settings" size="m" /><span class="bar-word">{copy.display}</span>
    </Button>
  </span>
</div>
{/if}

<!-- The phone's filter sheet. The same fields and values as the bar's menus, as the Display sheet's
     rows, each with its count, and Clear beside Done so undoing every filter is in the same place
     as setting one. -->
{#if rowsAsCards() && enums.length}
  <Sheet bind:open={filterOpen} title={copy.filter}>
    <div class="filter-groups">
      {#each enums as f}
        <fieldset class="filter-group">
          <legend class="filter-legend">{labelOf(f)}</legend>
          <div class="filter-values">
            {#each f.values ?? [] as value}
              {@const on = isOn(f.id, value)}
              <button
                type="button"
                class="filter-value"
                data-on={on ? '' : undefined}
                aria-pressed={on ? 'true' : 'false'}
                onclick={() => toggleFilter(f.id, value)}
              >
                <span class="filter-box" aria-hidden="true">{on ? '✓' : ''}</span>
                {valueSaid(f, value)}
                <span class="filter-n">{facets.get(f.id)?.get(value) ?? 0}</span>
              </button>
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>

    {#snippet footer()}
      <Button weight="primary" onclick={() => (filterOpen = false)}><Icon name="check" size="s" />{copy.done}</Button>
      {#if filtered}
        <Button weight="bare" href="/r/{register}"><Icon name="close" size="s" />{copy.clearFilters}</Button>
        <!-- The sheet closes first so the toast and the page it opens are not behind it. -->
        <ViewsMenu
          saveView={() => {
            filterOpen = false;
            saveView();
          }}
        />
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  /* THE SAME WRAP `/audit` TOOK, in a commit whose comment names the measurement: "Five of those
     in one unwrapping track reached 335px inside a 320px screen". The register's bar has the
     identical shape and was not fixed with it: at 320 `dropped` ran off the edge of `/r/tasks` and
     the app panel scrolled sideways by 30px. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /**
   * THE FILTERS ARE PILLS: one rounded track on a raised surface, and the chosen value a pill in it
   * on the selected ground with its word in ink (design D-2: pills for what you press and choose).
   * `controls.css` asks for the state to be a SHAPE and not a shade, and this keeps that. Scoped to
   * this screen, so every other segmented control keeps the shared rule.
   *
   * THE COUNT SITS BESIDE THE WORD AND QUIETER THAN IT, so a pill says what it holds before it is
   * pressed. The weight does not change when a pill is chosen, so the bar does not shift under the
   * pointer. Sentence case is the stylesheet's, on the first letter, so the word stays the one the
   * record stores and the empty state quotes.
   */
  .segmented {
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-weight: 500;
  }

  /* 44 under a thumb is `--ctl-h`'s; under a mouse the pill sits inside a track the height of the
     search box beside it. */
  @media (pointer: fine) {
    .segment {
      min-block-size: calc(var(--ctl-h) - 6px);
    }
  }

  /* `--selected`, which darkens in light, where `--s3` was a lighter pill on a light track that could
     not be found (design SYS-5). */
  .segment[data-on] {
    background: var(--selected);
    color: var(--ink);
    font-weight: 500;
  }

  .segment-word {
    display: inline-block;
  }

  .segment-word::first-letter {
    text-transform: uppercase;
  }

  .segment-n {
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  /* A FIELD AS ONE CONTROL, drawn as the pills' own track: the same surface, radius and height, its
     name in the second ink, and what is chosen in it in ink after the name. */
  .sift {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-weight: 500;
    white-space: nowrap;
  }

  /* Hover only where there is one: a phone keeps `:hover` on the last thing tapped. */
  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger):hover .sift {
      background: var(--hover-wash);
    }
  }

  .sift[data-on] {
    background: var(--selected);
  }

  .sift-chosen {
    color: var(--ink);
  }

  /* THE PHONE'S ONE FILTER CONTROL IS A 44px PILL with the glyph and, when values are on, how many.
     It is a real button, so it sheds the button's own box. */
  .sift-sheet {
    justify-content: center;
    gap: var(--sp-1);
    min-inline-size: var(--tap);
    padding: 0 var(--sp-2);
    border: 0;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .sift-count {
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A LIST CLAUSE IS A PILL THAT IS ALREADY ON, drawn in the same track as the rest of the bar so it
     reads as one of them rather than as a message. A repository is a URL and a handle is
     `git:jokonkwo`, so the element gives way with an ellipsis before it runs past a phone's edge. */
  .listed {
    min-inline-size: 0;
    border: 0;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .listed .sift-chosen {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .filter-n {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .sift-open {
    display: inline-flex;
    color: var(--dim);
    rotate: 90deg;
  }

  .mi-tick {
    display: inline-flex;
    inline-size: var(--sp-4);
    color: var(--ink);
  }

  /* THE SEARCH BOX IS A FIELD, with the radius every field has (design D-2), on the pills' surface. */
  .bar > .field {
    background: var(--s1);
    border-radius: var(--r-md);
  }

  /* Display ends the bar: it changes how the list looks, not what it holds. Save as a view, when it
     is drawn, stands just before it, and the two are pushed to the end together. */
  .bar-end {
    margin-inline-start: auto;
  }

  .bar-save {
    margin-inline-start: auto;
  }

  .bar-save + .bar-end {
    margin-inline-start: 0;
  }

  /* The menu rows: the same 34px and the same tint-on-hover as every menu row on this screen. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
  }

  .filter-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .filter-group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .filter-legend {
    margin-block-end: var(--sp-2);
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .filter-values {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A full-width row, not a chip. Eight values in a wrapped chip cloud is a shape you have to scan;
     a column of rows with the boxes aligned is a shape you can run your eye down. */
  .filter-value {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 34px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* 44 UNDER A THUMB, AND BOTH OF THESE WERE MEASURED AT 390 AND FOUND SHORT. `.filter-value` is
     358x34 and `.mi` is 34. Neither has ever been measured by `layout.mjs`, because both live
     inside a sheet or a menu the gate does not open, and the gate is right that a page at rest is
     what it measures. `13 §7` is the rule. */
  @media (pointer: coarse) {
    .filter-value,
    .mi {
      min-block-size: var(--tap);
    }
  }

  .filter-value:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .filter-value[data-on] {
    color: var(--ink);
    font-weight: 500;
  }

  .filter-box {
    display: grid;
    place-items: center;
    inline-size: 17px;
    block-size: 17px;
    flex: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-size: var(--t-xs);
    line-height: 1;
  }

  .filter-value[data-on] .filter-box {
    background: var(--on);
    border-color: var(--on);
  }

  @media (width < 640px) {
    /**
     * ONE ROW OF 44px CONTROLS: THE SEARCH BOX, FILTER AND DISPLAY (design SYS-6, DSN-7).
     *
     * The bar was two lines on a phone, the search box across the first and a sideways scroller of
     * Filter, its chosen values and Display across the second, under a capture line of its own, so
     * three rows of controls stood over the first card. The capture line went behind the head's "+"
     * and Filter became one square button, and what is left fits one row at 320: the search box
     * takes the width Filter and Display leave.
     *
     * WHAT DOES NOT FIT IS A SECOND LINE, AND ONLY WHILE THERE IS SOMETHING ON IT. A list clause from
     * the address, and Clear and Save on a list with no fields to filter, come after Display and wrap
     * under the row. The search box's floor leaves room for two square buttons and nothing more, so
     * they cannot squeeze it. `min-inline-size: 0` keeps the bar inside the panel, which is the 30px
     * sideways scroll the comment above `.bar` records fixing once.
     */
    .bar {
      min-inline-size: 0;
    }

    .bar > .field {
      flex: 1 1 0;
      min-inline-size: calc(100% - 2 * var(--tap) - 2 * var(--sp-2));
    }

    .listed,
    .bar-clear,
    .bar-save {
      order: 1;
      min-inline-size: 0;
    }

    .bar-save {
      margin-inline-start: 0;
    }

    .bar-save + .bar-end {
      margin-inline-start: auto;
    }

    /* DISPLAY IS ITS GLYPH, 44px square, and its word stays in the button for a screen reader. */
    .bar-end :global(.btn) {
      min-inline-size: var(--tap);
      padding-inline: 0;
    }

    .bar-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
