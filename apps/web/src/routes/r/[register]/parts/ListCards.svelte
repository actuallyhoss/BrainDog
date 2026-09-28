<!--
  The list below 640px: CARDS over the register's three declared `mobile:` fields, and the table is
  one `v` away. A saved view is the same list with a different predicate and had only the table, so
  the two behaved differently on one device, which is what made `RowCards` a component rather than
  markup. This file hands it the list screen's two arms: the row's verbs and its receipt.

  ONE BODY AT A TIME, AND IN THE DOM RATHER THAN ONLY IN THE STYLESHEET. Both bodies were built at
  every width and one was hidden: at 2,614 rows the document held 4,001 rows and 102,681 nodes, two
  thousand of them cards no pixel was showing, and took eight seconds to settle. `13 §4.3` caps the
  DOM at 2,000 and it was being paid twice, once invisibly. `05 §6`'s rule is that a width query
  never changes a control's SIZE; which of two bodies exists is layout, which is exactly what width
  decides. The page chooses (`rowsAsCards()`), and hands this the rows already cut to the cap.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { display } from '$lib/record/api.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import RowCards from '$lib/ui/RowCards.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Receipt } from './list.ts';

  let {
    register,
    entries,
    now,
    names,
    selected,
    decl,
    more,
    receiptFor,
    openCardMenu,
  }: {
    register: string;
    /** The rows to draw, already cut to `DOM_CAP` by the page. */
    entries: readonly Entry[];
    now: number;
    names: Names | undefined;
    selected: ReadonlySet<number>;
    decl: RegisterDecl;
    /** There may be another page, so the list ends in a sentinel the page's observer watches. */
    more: boolean;
    receiptFor: (seq: number) => Receipt | undefined;
    openCardMenu: (seq: number, el: HTMLElement) => void;
  } = $props();
</script>

<RowCards {register} {entries} {now} {names} picked={selected}>
  {#snippet action(e)}
    <!-- THE ROW'S VERBS, REACHABLE BY THUMB. Every one of them existed and every one was a
         key: peek `p`, copy `y`, copy link `⇧Y`, archive `⌫`, select `x`. On the device
         with no keyboard that made a register a list you could read and open and nothing
         else, eight capabilities, none of them reachable. It opens the SAME row menu the
         keyboard opens, so there is one set of verbs rather than a touch copy of them, and
         each item still prints the key that replaces it. -->
    <!-- NAMED BY THE ROW'S TITLE, as the grid's own "…" is, and never by its number: "Actions for this
         row #12" was the one "#" left on a phone card once the card stopped printing it. -->
    <button
      type="button"
      class="card-more"
      aria-label={copy.moreOn(display(register, decl.title, e.fields[decl.title]) ?? copy.thisRow)}
      onclick={(ev) => openCardMenu(e.seq, ev.currentTarget)}
    >
      <!-- `m`, AND IT WAS `s`: a 12px box of a 24-unit path at `stroke-width: 1.6`, so each dot
           was 0.8 CSS pixels in `--dim`, on the only touch route to a row's eight verbs. In both
           schemes the column read as an empty cell beside the card. -->
      <Icon name="more" size="m" />
    </button>
  {/snippet}
  <!--
    THE RECEIPT, ON THE ARM THAT IS THE ONLY ONE A PHONE EVER SEES.

    `receiptFor` has been drawn by the grid since it was written. Below 640px the grid is
    not drawn and the cards are the one place, and they drew none of it: a row typed into the
    capture line on a phone appeared at the top of the list with no chip and no `Put back`, so
    the receipt that says what just happened to it was on the one body nobody was looking at.

    The same `Chip` and the same `undo` the grid renders, so there is one receipt and not
    a touch copy of one.
  -->
  {#snippet note(e)}
    {@const said = receiptFor(e.seq)}
    <!-- WHERE THE ROW APPLIES IS NOT HERE: `RowCards` draws the scope chip in the card's detail slot, so a scoped row
         is two lines like any other and a saved view's cards wear it too (design DSN-16). -->
    {#if said}
      {@const name = display(register, decl.title, e.fields[decl.title]) ?? copy.thisRow}
      <Chip label={said.mark} tone={said.intent} />
      {#if said.undo}
        <button
          type="button"
          class="card-undo tap"
          aria-label={copy.undoRowOf(name)}
          onmousedown={(ev) => ev.preventDefault()}
          onclick={(ev) => {
            ev.stopPropagation();
            said.undo?.();
          }}>{copy.undoRow}</button>
      {/if}
    {/if}
  {/snippet}
</RowCards>

<!-- A SENTINEL MEANS "THERE MAY BE MORE". The card list has its own for the reason `Table` has
     one: with the grid absent from the document there is nothing else for the page's observer to
     watch, and a phone would stop at page one with no way to ask for page two. A list whose answer
     arrived in one page has none, and neither does one at the cap: the cap line says why it
     stopped. `Table` takes the same signal as the absence of `onmore`. -->
{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  /**
   * THE CARD'S TRAILING CONTROL, which exists only where the cards do.
   *
   * `--ctl-h` for the width and the card's own height, so the target is the full height of the row
   * it acts on rather than a 44px button with dead edges above and below it. `13 §10`: the card IS
   * the row on this device, and half a row that does nothing when tapped is worse than no control.
   */
  @media (width < 640px) {
    /* THE `Put back` BESIDE A RECEIPT ON A CARD. `.verb` is the grid's, sized for a row 34px tall
       and a fine pointer; this one is under a thumb, so it takes `--tap` from `.tap` and reads as a
       word rather than as an icon. */
    .card-undo {
      display: inline-flex;
      align-items: center;
      padding: 0 var(--sp-2);
      background: none;
      border: 0;
      color: var(--ink2);
      font: inherit;
      font-size: var(--t-sm);
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }

    .card-more {
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--ctl-h);
      flex: none;
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-md);
      /* `--ink2`, and it was `--dim`: the one touch route to a row's eight verbs, drawn in the
         quietest ink the palette has, read as an empty cell beside every card. */
      color: var(--ink2);
      cursor: pointer;
    }

    /* A WASH ONLY UNDER A MOUSE: a tapped button on a phone kept it after the finger lifted (design brief 6.6,
       nothing hover-only and nothing stuck on hover). */
    @media (hover: hover) and (pointer: fine) {
      .card-more:hover {
        background: var(--hover-wash);
        color: var(--ink);
      }
    }
  }

  @media (width >= 640px) {
    .card-more {
      display: none;
    }
  }
</style>
