<!--
  Rows as cards, which is what a list looks like below 640px.

  A PHONE IS NOT A NARROW DESKTOP, and which fields a card shows comes from the register's own
  `mobile:` declaration rather than from a media query: the register knows what matters about its own
  rows better than a breakpoint does (13 §10, 50 §5.2 step 10).

  TWO LINES, AND WHAT A DOT MEANS IS SAID BESIDE IT (design SYS-6, DSN-7). Line one is the project's
  mark, the title and the figure. Line two is the dot and its word, the date that word is about, and
  one detail, with nothing after it: "Overdue · 3 Sep · Kiln", "Paid · 2 Sep". The dot sat beside
  "Money out" once, so what it meant was never said, and the row's number ended the line in the id
  face; the number is gone from the card, since a person opens a row by its title.

  ONE BODY AT A TIME. Above 640px this does not exist and the table does; below it, the other way
  round. There is never a moment where both are half-visible, and the table is one `v` away.

  IT IS A COMPONENT BECAUSE TWO SURFACES SHOW ROWS. A register and a saved view are the same list
  with a different predicate, and only the register had cards, so a saved view on a phone kept the
  desktop table and its own horizontal scrollbar. Two surfaces, one device, two behaviours, from one
  of them having been written second.

  AND A CARD CAN CARRY THE ROW'S VERBS. The table has a row menu, a selected state and a sort on
  every column header; a card had a link and nothing else, so a register on a phone was a list you
  could read and open and do nothing else to: peek, copy, archive, select and set-state all lived
  behind keys, on the one device with no keyboard. `13 §10` says authoring is a desktop act, and
  that is right; but *choosing a row and acting on it* is not authoring, it is the list working.

  BOTH EXTRAS ARE OPTIONAL PROPS, so a saved view stays a list of links until somebody decides what
  a verb means there. A component that assumes its second caller wants everything the first one did
  is how the table ended up on a phone in the first place.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import type { Snippet } from 'svelte';
  import { day, leadingCode, shortDay, symbolFigure, TONES } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { dirOf, display, identityFor, toneOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { isMoney, type Entry } from '$lib/record/schema.ts';
  import type { Names } from '$lib/record/remote.ts';
  import Money from './Money.svelte';

  let {
    register,
    entries,
    href,
    picked,
    action,
    note,
    now = Date.now(),
    names,
  }: {
    register: string;
    entries: readonly Entry[];
    href?: (e: Entry) => string;
    /** Which rows are selected, by `seq`. Omitted where a surface has no bulk verbs. */
    picked?: ReadonlySet<number>;
    /** The trailing control on each card: the caller's, because the verbs are the caller's. */
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
    /** The record's instant, which dates each card's tone and bands. This browser's where nobody says; it was the seed's 3 September 2026, so under an unsaid clock a live invoice due on the 10th was still not overdue on the 25th. */
    now?: number;
    /** The record's own names and marks for the refs on these rows. Absent on the sample, which names them from its own rows. */
    names?: Names | undefined;
  } = $props();

  /**
   * THE LIST AS THE RECORD DECLARES IT, when this build does not ship it. A use case's own list (Assignments, Datapoints)
   * drew its count and no card at all on a phone, because the card plan was read from the build's table only. The
   * record is asked once (`remote.ts` `learn`), and the cards are drawn when it answers.
   */
  let learnt = $state(0);
  const decl = $derived(learnt >= 0 ? REGISTERS[register] : undefined);
  $effect(() => {
    const asked = register;
    if (REGISTERS[asked]) return;
    void Promise.all([import('@braindog/client'), import('$lib/record/remote.ts')])
      .then(([{ createClient }, remote]) => remote.learn((id) => createClient({ base: apiBase() }).schema(id), asked, new Map()))
      .then(() => {
        if (REGISTERS[asked]) learnt += 1;
      })
      .catch(() => undefined);
  });
  const to = $derived(href ?? ((e: Entry) => `/r/${register}/${e.seq}`));

  /**
   * THE ROW'S TONE, LATE OR CLOSE AND NOTHING ELSE.
   *
   * A register declares a `deadline:` field and `toneOf` turns "past it" into `bad`, "within two
   * weeks" into `warn` and "done" into `good`. The card draws the first two. A finished row is the
   * calm state (design-brief §10): "Paid" and "Cleared" carry no colour, and a green dot on every one
   * of them said nothing the word did not.
   *
   * A DOT WITH ITS WORD, AND NO COLOURED EDGE. `13 §5.1`: "Colour never carries meaning alone." The
   * dot has a name for a screen reader and the word beside it for everybody else; the bar that used
   * to run down the card had neither, and on a list with no box round it read as an alert.
   */
  const lateness = (e: Entry): 'bad' | 'warn' | undefined => {
    const tone = toneOf(register, e, now);
    return tone === 'bad' || tone === 'warn' ? tone : undefined;
  };

  /* THE CARD'S OWN WORDS FOR A DEADLINE, as short as a second line has room for. The row page says
     how many days late ("Overdue by 38 days", `[seq]/said.ts`); a card in a list says that it is. */
  const words = {
    overdue: 'Overdue',
    dueToday: 'Due today',
    dueTomorrow: 'Due tomorrow',
    dueIn: (days: number): string => `Due in ${days} days`,
  } as const;

  const DAY = /^\d{4}-\d{2}-\d{2}$/u;
  const DAY_MS = 86_400_000;

  /* How far off a close deadline is, in calendar days as the row page counts them. */
  const dueSaid = (iso: string, tone: 'bad' | 'warn'): string => {
    if (tone === 'bad') return words.overdue;
    const days = Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS) - Math.floor(now / DAY_MS);
    return days <= 0 ? words.dueToday : days === 1 ? words.dueTomorrow : words.dueIn(days);
  };

  /* A stored day as a card says it: "2 Sep" in the year it is read in, "2 Sep 2025" outside it. */
  const daySaid = (iso: unknown): string | null => {
    if (typeof iso !== 'string' || !DAY.test(iso)) return null;
    return iso.slice(0, 4) === String(new Date(now).getUTCFullYear()) ? shortDay(iso) : day(iso);
  };

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
  const markFor = (e: Entry) => identityFor(register, e.fields, names);

  /* A declared value is set in sentence case by the stylesheet, as the filter pills are. */
  const isEnum = (field: string) => decl?.fields.find((f) => f.id === field)?.type === 'enum';
  /* And spelled as a word: the stylesheet can raise a first letter, and it cannot make `saas` SaaS.
     FROM THE STORED VALUE AND NOT FROM WHAT `display` SAID, through `valueSaid` as the form draws it. This ran
     `copy.valueWord` over the label, which is the identity for every value label the seed ships (none starts lower
     case), so no card drawn today changes. It was not for every label an owner can type: `valueWord` of `iPhone repairs` is `IPhone repairs`,
     measured, though the `::first-letter` rule below raises that same letter on screen, so only the text changes. What
     this buys is one function for a value's word on the form and the card, so the two cannot drift
     (`enum-label-sites.test.ts`). */
  const worded = (field: string, value: unknown, said: string) => {
    const f = decl?.fields.find((x) => x.id === field);
    return f?.type === 'enum' && typeof value === 'string' && said ? valueSaid(f, value) : said;
  };

  /* The tick's accessible name. `copy.ts` holds every sentence (`50 §3`) and this is one. */
  const selectedLabel = copy.selected;

  /* A FIGURE IS A QUANTITY, and the first of the card's two fields that is one ends the title's line. */
  const FIGURES = new Set(['money', 'int', 'decimal']);
  const figure = $derived(decl?.mobile.slice(1).find((f) => FIGURES.has(decl.fields.find((d) => d.id === f)?.type ?? '')));
  /* THE DATE THE TONE IS ABOUT, which is the field `toneOf` reads: the one `day` declared `deadline:`. */
  const dated = $derived(decl?.fields.find((f) => f.type === 'day' && f.deadline)?.id);
  /* ONE DETAIL, the first declared card field that is none of the others and has something to say. */
  const detailFields = $derived(
    decl ? decl.mobile.slice(1).filter((f) => f !== figure && f !== dated && f !== decl.state && f !== decl.finished) : [],
  );

  /* A field's words on this card: a declared value by its label (`worded`), anything else as `display` says it. */
  const saidOf = (e: Entry, f: string): string => worded(f, e.fields[f], display(register, f, e.fields[f], now, names) ?? '');

  /**
   * THE SECOND LINE: `● word · date · detail` (design SYS-6).
   *
   * THE WORD IS THE TONE'S WHEN THE ROW IS LATE OR CLOSE ("Overdue", "Due in 3 days"), and otherwise the
   * row's own state ("Open", "Paid"), so the dot is never beside a word that says something else. The
   * date is the deadline, or on a finished row the day it finished, which the record writes into the
   * list's `finished` field ("Paid · 2 Sep"): a due date beside "Paid" would read as the day it was
   * paid. A finished row on a list that declares no such field says its word alone.
   */
  const lineOf = (e: Entry) => {
    const tone = lateness(e);
    const due = dated ? e.fields[dated] : undefined;
    const state = decl?.state;
    const done = Boolean(state && decl?.done?.includes(String(e.fields[state] ?? '')));
    const word = tone && typeof due === 'string' ? dueSaid(due, tone) : state ? saidOf(e, state) || null : null;
    const date = done ? (decl?.finished ? daySaid(e.fields[decl.finished]) : null) : daySaid(due);
    const detail = detailFields.find((f) => saidOf(e, f) !== '');
    return { tone, word, date, detail };
  };

  /* ONE LEADING SLOT, KEPT ON EVERY CARD when any card has a mark or a word: the mark in it on the first
     line, the dot on the second, and the words of both lines start at one x. */
  const slotted = $derived(Boolean(decl?.state || dated) || entries.some((e) => markFor(e) !== null));
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
      {@const title = display(register, decl.mobile[0], e.fields[decl.mobile[0]], now, names)}
      {@const line = lineOf(e)}
      <li class="card-line" data-picked={picked?.has(e.seq) ? '' : undefined}>
        <a class="card" href={at(to(e))}>
          <!-- THE TITLE FIRST, in the document as well as on the screen, so a screen reader hears
               what the row is before anything about it. ONE THING LEADS IT, the project's mark, in a
               slot every card keeps when any card in the list has one, so the titles share an edge.
               The tone and the mark both led it once, two dots before a word. -->
          <span class="card-title" dir={dirOf(register, decl.mobile[0])} data-whole={figure ? undefined : ''} data-slot={slotted ? '' : undefined}>
            {#if markFor(e)}
              {@const it = markFor(e)!}
              <span
                class="card-mark thing-glyph"
                data-shape={it.mark}
                style={it.retired ? undefined : `--hue:${it.hue}`}
                data-retired={it.retired ? '' : undefined}
                role="img"
                aria-label={it.name}></span>
            {/if}
            <!-- A TITLE NOBODY SET SAYS SO, in the dim ink the grid gives a missing value. An empty
                 first line would read as a card that failed to draw. -->
            {#if title === null}<span class="card-missing">Not set</span>{:else}{title}{/if}
          </span>
          <!-- THE FIGURE ENDS THE FIRST LINE, where the eye goes down a list of amounts, drawn by
               `Money` as every amount is: the home currency as "£2,400.00", another with its code
               after it, a negative with a true minus. -->
          {#if figure}
            {@const value = e.fields[figure]}
            <span class="card-figure" dir={dirOf(register, figure)}>
              {#if isMoney(value)}<Money minor={value.amount} currency={value.currency} />{:else}{display(register, figure, value, now, names) ?? ''}{/if}
            </span>
          {/if}
          <!-- THE DOT AND ITS WORD, THE DATE THE WORD IS ABOUT, AND ONE DETAIL. `data-intent` is on the
               line and not on the dot, because what resolves `--tone-fill` for the dot is `blocks.css`'s
               intent map, and an element with an intent holds its named glyph (`a11y.mjs`). A calm word
               has a quiet dot with no name, since the word says all there is. -->
          <span class="card-b" data-slot={slotted ? '' : undefined} data-intent={line.tone}>
            {#if line.tone}
              <span class="glyph" role="img" aria-label={TONES[line.tone].label}>{TONES[line.tone].glyph}</span>
            {:else if line.word}
              <span class="glyph" aria-hidden="true"></span>
            {/if}
            {#if line.word}<span class="card-word" data-late={line.tone ? '' : undefined}>{line.word}</span>{/if}
            {#if line.date}{#if line.word}<span aria-hidden="true">{' · '}</span>{/if}<span class="card-date">{line.date}</span>{/if}
            {#if line.detail}
              {@const f = line.detail}
              {#if line.word || line.date}<span aria-hidden="true">{' · '}</span>{/if}<span dir={dirOf(register, f)} data-enum={isEnum(f) ? '' : undefined}>{@render amount(saidOf(e, f))}</span>
            {/if}
          </span>
          {#if picked?.has(e.seq)}
            <!-- A GLYPH, NOT A TINT. `13 §5.1`: colour never carries meaning alone, and "this row is one
                 of the four the bar above is about" is the meaning most worth not losing. -->
            <span class="card-pick"><span class="picked-tick" role="img" aria-label={selectedLabel}>✓</span></span>
          {/if}
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

    /* ONE HAIRLINE BETWEEN ROWS, in the soft line a row takes at every width (design-brief §5). */
    .cards li + li {
      border-block-start: 1px solid var(--line-soft);
    }

    /* THE CARD AND ITS VERB SHARE A LINE. `align-items: stretch` so the menu button is the height of
       the card rather than of its own glyph: a 44px control beside a 56px card leaves 12px of dead
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
      border-block-start: 1px solid var(--line-soft);
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
      align-content: center;
      /* The card's two lines are 4px apart (design-brief §3, Space). */
      gap: var(--sp-1) var(--sp-3);
      /* A two-line row: 44px on both axes and then some, so the whole card is the target. */
      min-block-size: var(--row-h-2);
      /* Next to no inline padding: there is no box for the text to be inset from. */
      padding: var(--sp-2) var(--sp-1);
      color: var(--ink);
      font-size: var(--t-md);
      text-decoration: none;
    }

    /* THE TITLE IS ONE LINE (design-brief §5, a card at 390), and what does not fit ends in an
       ellipsis. The line under it says what state the row is in and when, so the end of a long title
       is the part a person can most afford to lose, and a card that grows to three lines pushes the
       next row's word and date off the screen. */
    .card-title {
      grid-column: 1;
      grid-row: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    /* The slot is the mark's width and its gap, and what sits in it hangs there, so a title that
       wraps keeps its edge and a line with nothing in the slot keeps it too. */
    [data-slot] {
      position: relative;
      padding-inline-start: calc(8px + var(--sp-2));
    }

    .card-title .card-mark {
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: calc((1lh - 8px) / 2);
      margin: 0;
    }

    /* THE DOT HANGS IN THE SLOT the mark takes on the line above, so the word starts where the title
       does and the dot sits just before it. */
    .card-b .glyph {
      position: absolute;
      inset-inline-start: 1px;
      /* The line is one line, so the middle of the box is the middle of the line. */
      inset-block-start: 50%;
      translate: 0 -50%;
    }

    /* A CALM WORD'S DOT IS QUIET, in the ink open, paid and cleared are drawn in (design-brief §10).
       Only an intent on the line gives the dot a colour, through `blocks.css`'s intent map. */
    .card-b:not([data-intent]) .glyph {
      background: var(--dim);
    }

    /* A LATE OR CLOSE WORD IS READ FIRST, in the second ink and not the tone's colour: the dot beside
       it is the colour channel, and red text on a hovered row fails its contrast pair. */
    .card-word[data-late] {
      color: var(--ink2);
      font-weight: 500;
    }

    /* A state word is the record's value, raised to sentence case by the stylesheet as the pills are. */
    .card-word {
      display: inline-block;
    }

    .card-word::first-letter {
      text-transform: uppercase;
    }

    .card-missing {
      color: var(--dim);
      font-weight: 400;
    }

    /* The figure is never cut and never wraps: `Money` keeps sign, symbol and digits on one line. */
    .card-figure {
      grid-column: 2;
      grid-row: 1;
      color: var(--ink);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      text-align: end;
      white-space: nowrap;
    }

    /* A card with no figure gives its title the whole first line. */
    .card-title[data-whole] {
      grid-column: 1 / -1;
    }

    /* The whole width, but for a selected row's tick at its end. */
    .card-b {
      grid-column: 1 / -1;
      grid-row: 2;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--dim);
      font-size: var(--t-sm);
      font-variant-numeric: tabular-nums;
    }

    /* NOTHING ENDS THE SECOND LINE BUT THE TICK of a selected row. The row's number stood here, in the
       id face, on every card (design SYS-6: no "#" on a phone). */
    .card-pick {
      grid-column: 2;
      grid-row: 2;
      align-self: center;
      font-size: var(--t-sm);
      text-align: end;
    }

    .card:has(.card-pick) .card-b {
      grid-column: 1;
    }

    /* Sentence case in the stylesheet, so the text stays the record's own word for search and for a
       screen reader. */
    .card-b [data-enum] {
      display: inline-block;
    }

    .card-b [data-enum]::first-letter {
      text-transform: uppercase;
    }
  }
</style>
