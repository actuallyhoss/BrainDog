<!--
  Rows as cards, which is what a list looks like below 640px.

  A PHONE IS NOT A NARROW DESKTOP, and which three fields a card shows comes from the register's own
  `mobile:` declaration rather than from a media query — the register knows what matters about its own
  rows better than a breakpoint does (13 §10, 50 §5.2 step 10).

  ONE BODY AT A TIME. Above 640px this does not exist and the table does; below it, the other way
  round. There is never a moment where both are half-visible, and the table is one `v` away.

  IT IS A COMPONENT BECAUSE TWO SURFACES SHOW ROWS. A register and a saved view are the same list
  with a different predicate — and only the register had cards, so a saved view on a phone kept the
  desktop table and its own horizontal scrollbar. Two surfaces, one device, two behaviours, from one
  of them having been written second.

  AND A CARD CAN CARRY THE ROW'S VERBS. The table has a row menu, a selected state and a sort on
  every column header; a card had a link and nothing else, so a register on a phone was a list you
  could read and open and do nothing else to — peek, copy, archive, select and set-state all lived
  behind keys, on the one device with no keyboard. `13 §10` says authoring is a desktop act, and
  that is right; but *choosing a row and acting on it* is not authoring, it is the list working.

  BOTH EXTRAS ARE OPTIONAL PROPS, so a saved view stays a list of links until somebody decides what
  a verb means there. A component that assumes its second caller wants everything the first one did
  is how the table ended up on a phone in the first place.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { leadingCode, symbolFigure, TONES } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { NOW, REGISTERS, dirOf, display, identityFor, toneOf } from '$lib/record/api.ts';
  import type { Entry } from '$lib/record/schema.ts';

  let {
    register,
    entries,
    href,
    picked,
    action,
    note,
    now = NOW,
  }: {
    register: string;
    entries: readonly Entry[];
    href?: (e: Entry) => string;
    /** Which rows are selected, by `seq`. Omitted where a surface has no bulk verbs. */
    picked?: ReadonlySet<number>;
    /** The trailing control on each card — the caller's, because the verbs are the caller's. */
    action?: Snippet<[Entry]>;
    /**
     * A LINE UNDER THE CARD, FULL WIDTH, for something about the row rather than a control on it.
     *
     * The receipt went in `action` first, which is a 44px trailing slot sized for one icon, and a
     * chip plus a `Put back` button in it squeezed the title to one word a line. A receipt is not
     * a verb: it is the row saying what has happened to it, it is as wide as the sentence it
     * carries, and on a card the only place that shape fits is its own row.
     */
    note?: Snippet<[Entry]>;
    /** The record's instant, which dates each card's tone and bands. The seed's, where nobody says. */
    now?: number;
  } = $props();

  const decl = $derived(REGISTERS[register]);
  const to = $derived(href ?? ((e: Entry) => `/r/${register}/${e.seq}`));

  /**
   * THE ROW'S TONE, WHICH THE TABLE HAS ALWAYS DRAWN AND THE CARD NEVER DID.
   *
   * A register declares a `deadline:` field and `toRows` turns "past it" into `bad` and "done" into
   * `good`. On a phone that used to disappear, so an overdue invoice and a paid one were the same
   * card, on the surface where somebody is most likely to be looking for exactly that.
   *
   * A GLYPH AT THE HEAD OF THE TITLE, AND NO COLOURED EDGE. `13 §5.1`: "Colour never carries meaning
   * alone. The glyph is part of the intent token, not a choice at the call site." The glyph has a
   * name for a screen reader and a shape for anybody who does not see red; the bar that used to run
   * down the card had neither, and on a list with no box round it read as an alert.
   */
  const toneFor = (e: Entry) => toneOf(register, e, now);

  /**
   * AND THE THING THE ROW BELONGS TO, WHICH IS THE ONE COLOUR THIS PRODUCT HAS AND DOES NOT SPEND.
   *
   * `api.ts` states the rule in its own words: "One mark and one accent per thing, and colour
   * means WHICH PROJECT, everywhere." Everywhere was four places, and a list was not one of them,
   * so eight lists of rows that each belong to a project were eight blocks of grey with the
   * project's name repeated down a text column, or not shown at all.
   *
   * TWO CHANNELS, NOT ONE. The mark is a shape before it is a colour (`▲` for one project, `◆`
   * for another), which is `13 §5.1`'s requirement met by the mark itself rather than by adding
   * something beside it. The hue is the row's frozen accent and the one non-token colour the
   * rendered-DOM gate admits, at `L`/`C` chosen so every hue clears 3:1 on every surface.
   *
   * The label is the project's NAME and not its mark, because a screen reader reading "black
   * up-pointing triangle" has been told the shape and not the thing.
   *
   * IT SITS IN FRONT OF THE TITLE, as it does in the grid, so the colour is where the eye starts.
   */
  const markFor = (e: Entry) => identityFor(register, e.fields);

  /* A declared value is set in sentence case by the stylesheet, as the filter pills are. */
  const isEnum = (field: string) => decl?.fields.find((f) => f.id === field)?.type === 'enum';

  /* The tick's accessible name. `copy.ts` holds every sentence (`50 §3`) and this is one. */
  const selectedLabel = copy.selected;
</script>

<!-- An amount is drawn with its currency's symbol, or with its code set quiet where it has none. -->
{#snippet amount(said: string)}
  {@const symbol = symbolFigure(said)}
  {@const coded = leadingCode(said)}
  {#if symbol}{symbol}{:else if coded}<span class="amount-code">{coded.currency}</span> {coded.rest}{:else}{said}{/if}
{/snippet}

{#if decl}
  <ul class="cards">
    {#each entries as e (e.seq)}
      {@const title = display(register, decl.mobile[0], e.fields[decl.mobile[0]], now)}
      <li class="card-line" data-picked={picked?.has(e.seq) ? '' : undefined}>
        <a class="card" href={to(e)} data-intent={toneFor(e) ?? undefined}>
          <!-- THE TITLE FIRST, in the document as well as on the screen, so a screen reader hears
               what the row is before its number. The tone and the project lead it. -->
          <span class="card-title" dir={dirOf(register, decl.mobile[0])}>
            {#if toneFor(e)}
              <span class="glyph" role="img" aria-label={TONES[toneFor(e)!].label}>{TONES[toneFor(e)!].glyph}</span>
            {/if}
            {#if markFor(e)}
              {@const it = markFor(e)!}
              <span
                class="card-mark"
                style={it.retired ? undefined : `--hue:${it.hue}`}
                data-retired={it.retired ? '' : undefined}
                role="img"
                aria-label={it.name}>{it.mark}</span>
            {/if}
            <!-- A TITLE NOBODY SET SAYS SO, in the dim ink the grid gives a missing value. An empty
                 first line would read as a card that failed to draw. -->
            {#if title === null}<span class="card-missing">Not set</span>{:else}{title}{/if}
          </span>
          <span class="card-seq">
            {#if picked?.has(e.seq)}
              <!-- A GLYPH, NOT A TINT. `13 §5.1`: colour never carries meaning alone, and "this row
                   is one of the four the bar above is about" is the meaning most worth not losing. -->
              <span class="picked-tick" role="img" aria-label={selectedLabel}>✓</span>
            {/if}
            <!-- A ROW THAT HAS NO ID PRINTS NO ID. `pending` mints a negative sequence so a row
                 somebody typed can never collide with one the record has; `#-1` is that sentinel
                 with a minus sign in front of it, and it was going straight to the screen. -->
            {#if e.seq >= 0}#{e.seq}{/if}
          </span>
          <span class="card-b" dir={dirOf(register, decl.mobile[1])} data-enum={isEnum(decl.mobile[1]) ? '' : undefined}>
            {@render amount(display(register, decl.mobile[1], e.fields[decl.mobile[1]], now) ?? '')}
          </span>
          <span class="card-c" dir={dirOf(register, decl.mobile[2])} data-enum={isEnum(decl.mobile[2]) ? '' : undefined}>
            {@render amount(display(register, decl.mobile[2], e.fields[decl.mobile[2]], now) ?? '')}
          </span>
        </a>
        <!-- OUTSIDE THE ANCHOR, because a button inside a link is neither. The card stays the whole
             tap target for opening the row and this sits beside it. -->
        {#if action}{@render action(e)}{/if}
        {#if note}<div class="card-note">{@render note(e)}</div>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* THE THING'S HUE, WHICH IS THE ONLY COLOUR IN THIS FILE AND IS NOT A LITERAL. `oklch(L C h)`
     where `h` is the row's frozen accent and `L`/`C` are the theme's two mark constants, generated
     per scheme. A retired thing keeps its mark and loses its claim on a hue, so `--hue` is withheld
     AND `--dim` is set by the rule below: an unset `--hue` makes the whole `oklch()` invalid, and
     an invalid declaration is a dropped one, which would leave the mark inheriting the card's ink
     rather than reading as retired. The attribute is what says so; the missing property alone
     would not. */
  .card-mark {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
    font-size: var(--t-xs);
    line-height: 1;
  }

  .card-mark[data-retired] {
    color: var(--dim);
  }

  .cards {
    display: none;
  }

  @media (width < 640px) {
    /* NO BOX AND NO BAR. The cards are rows on the page's own ground with a hairline between them,
       the way the grid draws its rows: a raised card holding cards read as a form to fill in. */
    .cards {
      display: block;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cards li + li {
      border-block-start: 1px solid var(--line);
    }

    /* THE CARD AND ITS VERB SHARE A LINE. `align-items: stretch` so the menu button is the height of
       the card rather than of its own glyph — a 44px control beside a 56px card leaves 12px of dead
       edge that looks tappable and is not. */
    .card-line {
      display: flex;
      align-items: stretch;
      /* `wrap`, so `note` takes a line of its own under the card and the trailing control keeps
         the 44px it needs beside it. Without it a receipt shared the card's row and squeezed the
         title to one word a line. */
      flex-wrap: wrap;
    }

    .card-note {
      flex-basis: 100%;
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-2) var(--sp-3);
      border-block-start: 1px solid var(--line);
    }

    /* A NOTE THAT SAYS NOTHING TAKES NO ROOM. `note` is a snippet, and the register passes one for
       every card whether or not that row has a receipt, so the row drew under every card: a rule,
       sixteen pixels of padding, and then the next card's own rule, which is two hairlines between
       every pair of rows on a phone. The snippet draws elements only when there is something to
       say, so a note with none is empty. */
    .card-note:not(:has(*)) {
      display: none;
    }

    .card-line[data-picked] {
      background: var(--sunk);
    }

    .picked-tick {
      color: var(--ink);
    }

    /* The board's `.card` in `blocks.css` is a raised tile, and this link shares the class name, so
       it inherited a surface, a border and a radius and drew every row of a phone list as a box with
       its menu hanging outside it. A row here is a line on the page. */
    .card {
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      flex: 1;
      min-inline-size: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px var(--sp-3);
      /* 44px on both axes. A control grown only in height measures 38 x 44 and fails (13 §7). */
      min-block-size: 56px;
      /* Next to no inline padding: there is no box for the text to be inset from. */
      padding: var(--sp-2) var(--sp-1);
      /* `data-intent` stays on the card because it is what resolves `--tone` for the glyph, through
         `blocks.css`'s intent map, the one place an intent becomes a colour. */
      color: var(--ink);
      font-size: var(--t-ui);
      text-decoration: none;
    }

    .card-seq {
      grid-column: 2;
      grid-row: 1;
      color: var(--dim);
      font-family: var(--font-id);
      font-size: var(--t-xs);
      text-align: end;
    }

    /* THE TITLE WRAPS ON THE NARROWEST PHONE, because there is nothing else on its line to protect.
       At 390 the column is wide enough that nothing truncates; at 320 nine of the thirty-eight
       obligation cards lost their end — `Invoice 2026-041 — brand` — and the row number beside it,
       which is the only other thing on that line, is four characters. A card grows; that is the
       whole reason it is a card. */
    .card-title {
      grid-column: 1;
      grid-row: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    .card-title .glyph,
    .card-title .card-mark {
      margin-inline-end: var(--sp-1);
    }

    .card-missing {
      color: var(--dim);
      font-weight: 400;
    }

    @media (width < 400px) {
      .card-title {
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
      }
    }

    .card-b {
      grid-column: 1;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-sm);
      font-variant-numeric: tabular-nums;
    }

    .card-c {
      grid-column: 2;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-sm);
      font-variant-numeric: tabular-nums;
      text-align: end;
    }

    /* Sentence case in the stylesheet, so the text stays the record's own word for search and for a
       screen reader. */
    .card-b[data-enum]::first-letter,
    .card-c[data-enum]::first-letter {
      text-transform: uppercase;
    }
  }
</style>
