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

  <!-- EVERYTHING AFTER THE SEARCH BOX, IN ONE BOX, so a phone can scroll the chips without
       scrolling the search away. On a laptop this is `display: contents` and the bar is the
       single row it always was. -->
  <div class="bar-rest">
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
    there. Filter names what is chosen, the sheet holds every field and Clear, and Display sits
    beside it: two controls that fit any phone, with nothing out of sight.
  -->
  {#if rowsAsCards() && enums.length}
    {@const chosen = enums.flatMap((f) => (f.values ?? []).filter((value) => isOn(f.id, value)).map((value) => valueSaid(f, value)))}
    <button
      type="button"
      class="sift sift-sheet tap"
      data-on={chosen.length ? '' : undefined}
      aria-haspopup="dialog"
      onclick={() => (filterOpen = true)}
    >
      <Icon name="filter" size="s" />
      <span class="sift-name">{copy.filter}</span>
      {#if chosen.length}<span class="sift-chosen">{chosen.join(', ')}</span>{/if}
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
    <Button weight="bare" href="/r/{register}"><Icon name="close" size="s" />{copy.clearFilters}</Button>
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
  <span class="bar-end">
    <!-- SAVE AS A VIEW, only while a filter or a search is on (`ViewsMenu` says why). It stands
         before Display because both are about the list as a whole, and Display stays last as the
         one that changes how it looks. On a phone with filters it lives in the filter sheet
         instead, beside Clear, for the reason Clear does. -->
    {#if filtered && !(rowsAsCards() && enums.length)}
      <ViewsMenu {saveView} />
    {/if}
    <Button weight="bare" onclick={ondisplay}>
      <Icon name="settings" size="s" />{copy.display}
    </Button>
  </span>
  </div>
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
    flex-wrap: wrap;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* NOT A BOX ABOVE 640px. The chips, Clear and Display are children of the bar exactly as they
     were before the phone needed them grouped; `contents` removes the wrapper from layout. */
  .bar-rest {
    display: contents;
  }

  /**
   * THE FILTERS ARE PILLS: one rounded track on a raised surface, and the chosen value a lighter pill
   * in it with its word in ink. `controls.css` asks for the state to be a SHAPE and not a shade, and
   * this keeps that, drawn round rather than as a box of boxes. Scoped to this screen, so every other
   * segmented control keeps the shared rule.
   *
   * THE COUNT SITS BESIDE THE WORD AND QUIETER THAN IT, so a pill says what it holds before it is
   * pressed. The weight does not change when a pill is chosen, so the bar does not shift under the
   * pointer. Sentence case is the stylesheet's, on the first letter, so the word stays the one the
   * record stores and the empty state quotes.
   */
  .segmented {
    background: var(--s1);
    border-radius: var(--r-sm);
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    border-radius: var(--r-sm);
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

  .segment[data-on] {
    background: var(--s3);
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
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-weight: 500;
    white-space: nowrap;
  }

  :global(.menu-trigger):hover .sift,
  .sift[data-on] {
    background: var(--s3);
  }

  .sift-chosen {
    color: var(--ink);
  }

  /* The phone's one filter control is a real button, so it sheds the button's own box, and what is
     chosen gives way with an ellipsis before Display is pushed off the screen. */
  .sift-sheet {
    min-inline-size: 0;
    border: 0;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .sift-sheet .sift-chosen {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A LIST CLAUSE IS A PILL THAT IS ALREADY ON, drawn in the same track as the rest of the bar so it
     reads as one of them rather than as a message. A repository is a URL and a handle is
     `git:jokonkwo`, so the element gives way with an ellipsis before Display is pushed off a phone,
     which is the same treatment the phone's own filter button gets and for the same reason. */
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

  /* The search box is a pill too, so the bar is one family of shapes. */
  .bar > .field {
    background: var(--s1);
    border-radius: var(--r-sm);
  }

  /* Display ends the bar: it changes how the list looks, not what it holds. */
  .bar-end {
    margin-inline-start: auto;
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
     * THE BAR STOPS WRAPPING AND STARTS SCROLLING, because wrapping put the first row of the list
     * below the fold on every phone in the product.
     *
     * Measured at 390 by 844, `/r/obligations` drew, in order: a note card, the heading, the
     * subtitle, the count, New item, the search box, two chip groups, Display, one sentence about
     * what the search box searches, the capture field, and one sentence about what a row may be
     * missing. Eleven things. The first invoice began at 700px and the reader had to scroll to
     * learn the screen had any rows on it at all.
     *
     * `flex-wrap: wrap` is right on a laptop, where the bar is one line and the wrap is the
     * safety net. On a phone every child is close to the full width, so wrap is not a safety net,
     * it is the layout: five rows of controls standing over the thing they control. A row of chips
     * that scrolls sideways is what a phone does with a filter bar, it costs one row instead of
     * five, and nothing is hidden, which is the difference between this and a drawer.
     *
     * The panel itself must not scroll sideways: `min-inline-size: 0` on the flex child is what
     * keeps the overflow inside the bar. Without it the bar sizes to its content and takes the app
     * with it, which is the 30px sideways scroll the comment above `.bar` records fixing once.
     */
    /**
     * AND THEN THE SEARCH BOX SCROLLED WITH THE CHIPS, WHICH IS WHY IT HAS A LINE OF ITS OWN NOW.
     *
     * The first version of this made the whole bar one sideways scroller and gave the search box a
     * floor. The floor was on the wrapper, so the input measured 62px and read `Searcl`; moving it
     * to the input gave 96px and `Search mor`. A floor cannot win, because the placeholder is
     * "Search" plus the register's own name and `Search services` is longer than `Search money`.
     * And the comment that gave the box its floor said it was "the one thing that never scrolls out
     * of reach", which was true only while nobody scrolled.
     *
     * So the search box takes the bar's first line at full width and the chips, Clear and Display
     * share a second line that is the only thing that scrolls. Two lines instead of the five that
     * wrapping gave, and the search box is always the whole width of the phone.
     */
    .bar {
      flex-wrap: wrap;
      min-inline-size: 0;
    }

    .bar > .field {
      flex: 1 1 100%;
    }

    .bar-rest {
      display: flex;
      flex: 1 1 100%;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--sp-2);
      min-inline-size: 0;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      /* Room for the shadow of the last chip, and a scroll that ends flush rather than clipped. */
      padding-block-end: var(--sp-1);
    }

    .bar-rest::-webkit-scrollbar {
      display: none;
    }

    .bar-rest > * {
      flex: 0 0 auto;
    }

    /* The one control allowed to shrink, so a long list of chosen values ends in an ellipsis
       inside the phone rather than past its edge. */
    .bar-rest > .sift-sheet,
    .bar-rest > .listed {
      flex: 0 1 auto;
    }
  }
</style>
