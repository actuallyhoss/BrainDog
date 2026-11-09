<!--
  Rows as cards, which is what a list looks like below 640px.

  A PHONE IS NOT A NARROW DESKTOP, and which fields a card shows comes from the register's own
  `mobile:` declaration rather than from a media query: the register knows what matters about its own
  rows better than a breakpoint does (13 §10, 50 §5.2 step 10).

  TWO LINES, AND WHAT A DOT MEANS IS SAID BESIDE IT. Line one is the title and the figure. Line two is
  the dot and its word, the date that word is about, and one detail, with nothing after it: "Overdue ·
  3 Sep · Kiln", "Paid · 2 Sep · Portage". The project's shape that led the title went: it
  said "some project" to nobody who had not learnt the shapes, and the project's name ends line two
  where the list names no other detail. The dot sat beside
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

  WHAT CAME LATER IS DRAWN IN THE SAME TWO LINES. Where the row applies, its scope chip, takes the
  detail slot at the end of line two; the holder's face after a hand ends line two where a selected row's tick does;
  a list of people leads each card with the person's face. None of them is a third line.
-->
<script module lang="ts">
  import type { RegisterDecl } from '$lib/record/schema.ts';

  /**
   * Whether a list's rows are people, so each is led by a face rather than a project's mark.
   *
   * BY THE GLYPH THE LIST DECLARES, which is the declaration's own word for what it holds, and not by its id: a list is
   * never known here by the name a pack gave it. The list's grid and a row's page ask the same question of this.
   */
  export const ofPeople = (decl: Pick<RegisterDecl, 'icon'> | undefined): boolean => decl?.icon === 'people';
</script>

<script lang="ts">
  /* A DOUBLE CLICK ON A CARD RENAMES ITS ROW, on the page the card opens (`things/rename.ts`). */
  import { renames } from '$lib/things/rename.ts';
  import { page } from '$app/state';
  import { apiBase, at } from '../at.ts';
  import type { Snippet } from 'svelte';
  import { dateSaid, leadingCode, symbolFigure } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { dirOf, display, identityFor, labelOf, orsOf, tableOf, toneOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { agentKey, agentName, handFor } from '$lib/record/hand.ts';
  import { scopeFieldOf, scopeOf, type Scope } from '$lib/record/scope-move.ts';
  import { isMoney, type Entry } from '$lib/record/schema.ts';
  import { amountField, wayOf } from '$lib/record/money-way.ts';
  import type { Names } from '$lib/record/remote.ts';
  import { flip } from 'svelte/animate';
  import { sameEntries } from '$lib/record/same-entries.ts';
  import Face from './Face.svelte';
  import Money from './Money.svelte';
  import ScopeChip from './ScopeChip.svelte';
  import StateDot from './StateDot.svelte';
  import { rowIn, rowOut, settle } from './motion.ts';
  import { recordToday } from '../record/zone.ts';

  let {
    register,
    entries,
    href,
    picked,
    menuHost,
    arrived,
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
    /** A card's `data-menu-host`, so a right-click or a held thumb opens its "…" (or, by selector, another menu). */
    menuHost?: ((seq: number) => string) | undefined;
    /** Which rows just arrived, by `seq`: each wears the neutral 1.5s wash, as the table's row does (VERIFY H24). */
    arrived?: ReadonlySet<number>;
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

  /* THE ROWS AS LAST DRAWN, kept while a new answer draws the same (`sameEntries`): the keyed list moves nothing then. */
  let drawnEntries: readonly Entry[] = [];
  const steady = $derived.by(() => {
    if (!sameEntries(entries, drawnEntries)) drawnEntries = entries;
    return drawnEntries;
  });

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
    /* NOT A LIST THE RECORD DOES NOT HOLD (leftovers 4): `/r/<no such list>` on a phone asked the record for its
       declaration and logged the refusal as an error, under the page that already says there is no such list. */
    const held = (page.data as { index?: { registers?: { id: string }[] } }).index?.registers;
    if (held && !held.some((r) => r.id === asked)) return;
    void Promise.all([import('@braindog/client'), import('$lib/record/remote.ts')])
      .then(([{ createClient }, remote]) => remote.learn((id) => createClient({ base: apiBase() }).schema(id), asked, new Map()))
      .then(() => {
        if (REGISTERS[asked]) learnt += 1;
      })
      .catch(() => undefined);
  });
  const to = $derived(href ?? ((e: Entry) => `/r/${register}/${e.seq}`));

  /*
   * WHERE A ROW APPLIES IS A WORD OF THE CARD'S SECOND LINE, its project's dot and name, and never a control at the
   * card's end. The chip that moved the row stood there, as wide as "Marlow & Co ⌄", and left a task's title less than
   * half a phone's width ("Chase Halden on 2…"). A row moves from its own page, whose line under the name holds the same
   * chip as the press, and from the table.
   */

  /**
   * THE ROW'S HOLDER, AFTER A HAND: a person by their People row's own name, read as any other ref field is
   * (`display`, so the record's `names` resolve it exactly as `card-figure` above does), or an agent by the name it
   * signs with. `null` on a list with no `hand:` and on a row nobody has been handed.
   */
  const hand = $derived(decl ? handFor(decl) : null);
  function holderOf(e: Entry): { name: string; kind: 'person' | 'agent' } | null {
    if (!hand) return null;
    if (hand.person && e.fields[hand.person] != null) {
      const name = display(register, hand.person, e.fields[hand.person], now, names);
      return name ? { name, kind: 'person' } : null;
    }
    if (hand.agent && typeof e.fields[hand.agent] === 'string' && e.fields[hand.agent] !== '') {
      return { name: agentName(agentKey(e.fields[hand.agent])), kind: 'agent' };
    }
    return null;
  }

  /**
   * THE ROW'S TONE, LATE OR CLOSE AND NOTHING ELSE.
   *
   * A register declares a `deadline:` field and `toneOf` turns "past it" into `bad`, "within two
   * weeks" into `warn` and "done" into `good`. The card draws the first two. A finished row is the
   * calm state: "Paid" and "Cleared" carry no colour, and a green dot on every one
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

  /* THE CARD'S OWN WORDS FOR A DEADLINE, the table's words (money F6): "64 days late", never "Overdue", so a phone and a
     laptop say one thing about one bill. */
  const words = {
    late: (days: number): string => `${days} ${days === 1 ? 'day' : 'days'} late`,
    dueToday: 'Due today',
    dueTomorrow: 'Due tomorrow',
    dueIn: (days: number): string => `Due in ${days} days`,
  } as const;

  const DAY = /^\d{4}-\d{2}-\d{2}$/u;
  const DAY_MS = 86_400_000;

  /* How far off a close deadline is, in calendar days as the row page counts them. */
  const dueSaid = (iso: string, tone: 'bad' | 'warn'): string => {
    /* FROM THE RECORD'S DAY (AH22). */
    const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${recordToday(now)}T00:00:00Z`)) / DAY_MS);
    if (tone === 'bad') return days < 0 ? words.late(-days) : words.dueToday;
    return days <= 0 ? words.dueToday : days === 1 ? words.dueTomorrow : words.dueIn(days);
  };

  /* A stored day as a card says it: "2 Sep" in the year it is read in, "2 Sep 2025" outside it. */
  const daySaid = (iso: unknown): string | null => {
    if (typeof iso !== 'string' || !DAY.test(iso)) return null;
    return dateSaid(iso, now);
  };

  /**
   * AND THE THING THE ROW BELONGS TO, BY NAME: the project a row is about, said at the end of line two where the list
   * puts no other detail there. It led the title as a coloured shape, which told nobody which project without a key.
   */
  const markFor = (e: Entry) => identityFor(register, e.fields, names);

  /**
   * WHERE THE ROW STANDS, FOR ITS DOT: grey once the list calls its state finished, and the working
   * accent while it is still to do. A late or close row's dot is the tone's, through `data-intent`, and wins over this.
   */
  const finishedOf = (e: Entry): boolean => Boolean(decl?.state && decl.done?.includes(String(e.fields[decl.state] ?? '')));

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

  /**
   * THE CARD LEADS WITH WHAT THE LIST'S TABLE LEADS WITH, WHERE IT DECLARES ONE (leftovers8): the Ledger's table opens on
   * who the money went to, and its card on a phone led with the description, which an import fills with the category.
   * The table's first column of words, read as the table reads it: its field, else each `or` in turn. A list that
   * declares no table leads with its card's first field, as before.
   */
  const lead = $derived.by(() => {
    if (!decl || !Array.isArray(decl.table)) return null;
    return tableOf(decl).find((c) => c.field === decl.title || decl.fields.find((f) => f.id === c.field)?.type === 'text') ?? null;
  });
  const titleField = $derived(lead?.field ?? decl?.mobile[0] ?? '');
  const titleOf = (e: Entry): string | null => {
    let said = display(register, titleField, e.fields[titleField], now, names);
    for (const or of lead ? orsOf(lead) : []) if (said === null) said = display(register, or, e.fields[or], now, names);
    return said;
  };

  /* A FIGURE IS A QUANTITY, and the first of the card's two fields that is one ends the title's line. */
  const FIGURES = new Set(['money', 'int', 'decimal']);
  const figure = $derived(decl?.mobile.slice(1).find((f) => FIGURES.has(decl.fields.find((d) => d.id === f)?.type ?? '')));
  /* THE DATE THE TONE IS ABOUT, which is the field `toneOf` reads: the one `day` declared `deadline:`. */
  const dated = $derived(decl?.fields.find((f) => f.type === 'day' && f.deadline)?.id);
  /* THE FIELD THAT SAYS WHERE A ROW APPLIES, whose chip is drawn in the detail slot rather than its name
     as text. Read through `decl` so a list the record taught this file after mount is asked again. */
  const scoped = $derived(decl ? scopeFieldOf(register)?.id : undefined);
  /* ONE DETAIL, the first declared card field that is none of the others and has something to say. */
  const detailFields = $derived(
    decl
      ? decl.mobile.slice(1).filter((f) => f !== figure && f !== dated && f !== decl.state && f !== decl.finished && f !== scoped)
      : [],
  );

  /**
   * A FIGURE THAT IS NOT A PAYMENT SAYS WHAT IT IS (design section 4, Lists: "a labelled rate").
   *
   * On a list with a state or a deadline the figure is the amount the row is about, and its line under it says what is
   * happening to it. On a list with neither, People's rate or an account's balance, "£620.00" alone at the end of a
   * name is a number nobody can place, so the field's own label stands before it, quieter than the figure.
   */
  const figureLabel = $derived.by(() => {
    if (!decl || !figure || decl.state || dated) return null;
    const f = decl.fields.find((d) => d.id === figure);
    return f ? labelOf(f) : null;
  });

  /* A LIST OF PEOPLE IS LED BY FACES, one per card in the slot a project's mark takes elsewhere. */
  const faced = $derived(ofPeople(decl));

  /* A field's words on this card: a declared value by its label (`worded`), anything else as `display` says it. */
  const saidOf = (e: Entry, f: string): string => worded(f, e.fields[f], display(register, f, e.fields[f], now, names) ?? '');

  /**
   * THE SECOND LINE: `● word · date · detail`.
   *
   * THE WORD IS THE TONE'S WHEN THE ROW IS LATE OR CLOSE ("Overdue", "Due in 3 days"), and otherwise the
   * row's own state ("Open", "Paid"), so the dot is never beside a word that says something else. The
   * date is the deadline, or on a finished row the day it finished, which the record writes into the
   * list's `finished` field ("Paid · 2 Sep"): a due date beside "Paid" would read as the day it was
   * paid. A finished row on a list that declares no such field says its word alone.
   *
   * THE SCOPE CHIP TAKES THE DETAIL SLOT. It was a line of its own under the card, a third line with a
   * hairline over it, and on Tasks the project was said twice, as the detail's text and again as the chip. Where the
   * list puts its scope field on the card, the chip is that detail; where it does not, the chip fills the slot only
   * when no declared detail has anything to say, so a person's role is not traded for where they were met.
   */
  const lineOf = (e: Entry) => {
    const tone = lateness(e);
    const due = dated ? e.fields[dated] : undefined;
    const state = decl?.state;
    const done = Boolean(state && decl?.done?.includes(String(e.fields[state] ?? '')));
    const word = tone && typeof due === 'string' ? dueSaid(due, tone) : state ? saidOf(e, state) || null : null;
    /* AND THE STATE, WHEN THE DEADLINE TOOK ITS PLACE AND IT IS NOT THE FIRST ONE ("64 days late · Part paid"): the phone
       says what the laptop's Status column says. */
    const held = state ? String(e.fields[state] ?? '') : '';
    const first = state ? decl?.fields.find((f) => f.id === state)?.values?.[0] : undefined;
    const also = tone && state && !done && held !== '' && held !== first ? saidOf(e, state) || null : null;
    /* A WORD THAT ALREADY SAYS WHEN ("Due tomorrow", "4 days late") takes the date's place, so the line has room for
       the project rather than the same day said twice. */
    const date = done ? (decl?.finished ? daySaid(e.fields[decl.finished]) : null) : tone && typeof due === 'string' ? null : daySaid(due);
    const text = detailFields.find((f) => saidOf(e, f) !== '');
    const place: Scope | null | undefined = scoped === undefined ? undefined : scopeOf(register, e.fields, names);
    const chip = place !== undefined && (decl?.mobile.includes(scoped ?? '') === true || text === undefined);
    /* THE PROJECT'S NAME, where nothing else fills the detail and the project is not already the chip. */
    const thing = !chip && text === undefined ? (markFor(e)?.name ?? null) : null;
    /* AND WHO IT IS FOR, AFTER WHERE IT APPLIES (leftovers 2 Nov, 12): the field that travels with the scope (a task's
       Client beside its Project, `qualifies`) is said on the card as the laptop's list says it in the next column. */
    const forWhom = qualified && (chip || thing !== null || text !== undefined) ? saidOf(e, qualified) || null : null;
    return { tone, word, also, date, detail: chip ? undefined : text, place: chip ? (place ?? null) : undefined, chip, thing, forWhom };
  };

  /* THE FIELD THAT TRAVELS WITH THE SCOPE (`qualifies`), said after it on the second line. */
  const qualified = $derived(scoped ? decl?.fields.find((f) => f.qualifies === scoped && f.type === 'ref')?.id : undefined);

  /* ONE LEADING SLOT, KEPT ON EVERY CARD when any card has a face or a word: the face in it on the first line, the
     dot on the second, and the words of both lines start at one x. */
  const slotted = $derived(faced || Boolean(decl?.state || dated));

  /**
   * THE DOT BESIDE THE WORD (`StateDot`, 2.A.6): red and filled only for a late row, whose word says "late"; a row due
   * soon keeps the open ring and says when in ink; otherwise the row's state, a ring while open, half filled when part of
   * it is done, slate once finished.
   */
  const dotOf = (e: Entry, tone: 'bad' | 'warn' | undefined): 'late' | 'open' | 'part' | 'done' => {
    if (tone === 'bad') return 'late';
    if (finishedOf(e)) return 'done';
    const value = decl?.state ? String(e.fields[decl.state] ?? '') : '';
    return /^part(?:$|[_\s-])/iu.test(value) ? 'part' : 'open';
  };

  /* THE FIGURE SAYS WHICH WAY IT WENT where it is the amount the list leads with and the list says a way. */
  const signs = $derived(figure !== undefined && amountField(decl)?.id === figure);

  /* THE FIGURES ARE ONE SET: every one without pence where all are whole, and every one with two places where any
     has pence, so the column reads digit under digit. */
  const pence = $derived.by(() => {
    if (!figure) return false;
    return entries.some((e) => {
      const v = e.fields[figure];
      return isMoney(v) && v.amount % 100 !== 0;
    });
  });
</script>

<!-- An amount is drawn with its currency's symbol, or with its code set quiet where it has none. -->
{#snippet amount(said: string)}
  {@const symbol = symbolFigure(said)}
  {@const coded = leadingCode(said)}
  {#if symbol}{symbol}{:else if coded}<span class="amount-code">{coded.currency}</span> {coded.rest}{:else}{said}{/if}
{/snippet}

{#if decl}
  <ul class="cards" data-faced={faced ? '' : undefined}>
    {#each steady as e (e.seq)}
      {@const title = titleOf(e)}
      {@const line = lineOf(e)}
      {@const holder = holderOf(e)}
      <!-- A CARD ADDED OR TAKEN AWAY ARRIVES AND LEAVES WITH THE LIST'S MOTION (motion F7.1), and the cards beside it
           close the gap: no card under it jumps. -->
      <li class="card-line" data-row-seq={e.seq} data-menu-host={menuHost?.(e.seq)} data-picked={picked?.has(e.seq) ? '' : undefined} in:rowIn out:rowOut animate:flip={settle()}>
        <a class="card" href={at(to(e))} data-arrived={arrived?.has(e.seq) ? '' : undefined} {@attach renames(to(e))}>
          <!-- THE TITLE FIRST, in the document as well as on the screen, so a screen reader hears
               what the row is before anything about it. ONE THING LEADS IT, the project's mark or, on a
               list of people, the person's face, in a slot every card keeps when any card in the list has
               one, so the titles share an edge. The tone and the mark both led it once, two dots before a word. -->
          <span class="card-title" dir={dirOf(register, titleField)} data-whole={figure ? undefined : ''} data-slot={slotted ? '' : undefined} data-own={title === null ? undefined : ''}>
            {#if faced}
              <!-- `aria-hidden` inside `Face`, because the name it is drawn from is the title beside it. -->
              <span class="card-face"><Face name={title ?? ''} kind="person" size="s" /></span>
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
              {#if figureLabel}<span class="card-figure-label">{figureLabel}</span>{/if}
              <!-- AND WHICH WAY IT WENT, as Money's page says it: "−EGP 279.03" out and "+EGP 600.00" in. -->
              {#if isMoney(value)}{@const way = signs ? wayOf(decl, e.fields) : null}{#if way === 'in'}+{/if}<Money minor={way === 'out' ? -Math.abs(value.amount) : value.amount} currency={value.currency} form={pence ? 'exact' : 'auto'} approx />{:else}{display(register, figure, value, now, names) ?? ''}{/if}
            </span>
          {/if}
          <!-- THE DOT AND ITS WORD, THE DATE THE WORD IS ABOUT, AND ONE DETAIL. `data-intent` is on the
               line and not on the dot, because what resolves `--tone-fill` for the dot is `blocks.css`'s
               intent map, and an element with an intent holds its named glyph (`a11y.mjs`). A calm word
               has a quiet dot with no name, since the word says all there is. -->
          <span class="card-b" data-slot={slotted ? '' : undefined} data-tone={line.tone} data-stand={decl.state ? (finishedOf(e) ? 'done' : 'open') : undefined}>
            {#if line.word}
              <span class="card-dot"><StateDot state={dotOf(e, line.tone)} /></span>
            {/if}
            {#if line.word}<span class="card-word" data-late={line.tone ? '' : undefined}>{line.word}</span>{/if}
            {#if line.also}<span aria-hidden="true">{' · '}</span><span class="card-state">{line.also}</span>{/if}
            {#if line.date}{#if line.word}<span aria-hidden="true">{' · '}</span>{/if}<span class="card-date">{line.date}</span>{/if}
            {#if line.chip}
              <!-- WHERE THE ROW APPLIES, AS THE DETAIL: the project's dot and its name, a word of the line after its
                   separator, as the bills' cards say "27 Jul · Marlow & Co". -->
              {#if line.word || line.date}<span aria-hidden="true">{' · '}</span>{/if}<ScopeChip scope={line.place ?? null} inline />
            {:else if line.detail}
              {@const f = line.detail}
              {#if line.word || line.date}<span aria-hidden="true">{' · '}</span>{/if}<span dir={dirOf(register, f)} data-enum={isEnum(f) ? '' : undefined}>{@render amount(saidOf(e, f))}</span>
            {:else if line.thing}
              {#if line.word || line.date}<span aria-hidden="true">{' · '}</span>{/if}<span dir="auto">{line.thing}</span>
            {/if}
            {#if line.forWhom}<span aria-hidden="true">{' · '}</span><span class="card-for" dir="auto">{line.forWhom}</span>{/if}
          </span>
          <!-- THE END OF LINE TWO: the holder's face after a hand, then a selected row's tick. The face had
               a third grid row of its own, which made a handed row a card of three lines. -->
          {#if holder || picked?.has(e.seq)}
            <span class="card-end">
              {#if holder}<span class="card-holder" role="img" aria-label={holder.name}><Face name={holder.name} kind={holder.kind} size="s" /></span>{/if}
              <!-- A GLYPH, NOT A TINT. `13 §5.1`: colour never carries meaning alone, and "this row is one
                   of the four the bar above is about" is the meaning most worth not losing. -->
              {#if picked?.has(e.seq)}<span class="picked-tick" role="img" aria-label={selectedLabel}>✓</span>{/if}
            </span>
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

    /* ONE HAIRLINE BETWEEN ROWS, in the soft line a row takes at every width. */
    /* TOLD APART BY AIR, NOT RULES (RHYTHM 4, cleanup 3 Nov): rows 2 apart, and the wash under a press shows the row. */
    .cards li + li {
      margin-block-start: var(--sp-0);
    }

    .card-line {
      border-radius: var(--r-ctl);
      transition: background-color var(--d-state) var(--ease-out);
    }

    .card-line:active:not([data-picked]) {
      background: var(--hover);
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
      border-block-start: 1px solid var(--rule);
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
      background: var(--chosen);
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
      /* The card's two lines are 2px apart, a row's title to its meta (`--row-stack`). */
      gap: var(--row-stack) var(--sp-3);
      /* A two-line row: 44px on both axes and then some, so the whole card is the target. */
      min-block-size: var(--row-h-2);
      /* Next to no inline padding: there is no box for the text to be inset from. */
      padding: var(--row-pad-y) var(--sp-1);
      color: var(--ink);
      font-size: var(--fs-row);
      line-height: var(--lead-row);
      text-decoration: none;
    }

    /* THE TITLE TAKES TWO LINES BEFORE IT GIVES WAY, and what does not fit ends in an ellipsis. One line cut a task to
       "Chase Halden on 2…" once the project's chip shared it; two say the task, and the line under them still says
       what state the row is in and when, so a card is never more than three lines. */
    .card-title {
      grid-column: 1;
      grid-row: 1;
      display: -webkit-box;
      min-inline-size: 0;
      overflow: hidden;
      overflow-wrap: anywhere;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      font-weight: 500;
    }

    /* The slot is the dot's width and its gap, and what sits in it hangs there, so a title that
       wraps keeps its edge and a line with nothing in the slot keeps it too. */
    [data-slot] {
      position: relative;
      padding-inline-start: calc(8px + var(--sp-2));
    }

    /* THE DOT HANGS IN THE SLOT the mark takes on the line above, so the word starts where the title
       does and the dot sits just before it. */
    .card-b .card-dot {
      position: absolute;
      inset-inline-start: 1px;
      /* ON THE FIRST LINE'S MIDDLE: a line that wraps kept the dot between its two lines. */
      inset-block-start: calc(var(--lead-meta, 18px) / 2);
      translate: 0 -50%;
    }

    .card-b .card-dot {
      display: flex;
    }

    /* A LATE WORD IS RED AND READ FIRST, "64 days late" beside the red dot (money F6): `--red` clears 4.5 on the tile
       and on the hover wash in both schemes. A row due soon says when in ink, at the same weight, beside its ring. */
    .card-b[data-tone='bad'] .card-word {
      color: var(--red);
      font-weight: var(--fw-medium);
    }

    .card-b[data-tone='warn'] .card-word {
      color: var(--ink);
      font-weight: var(--fw-medium);
    }

    /* A state word is the record's value, raised to sentence case by the stylesheet as the pills are. */
    .card-word {
      display: inline-block;
    }

    .card-word::first-letter {
      text-transform: uppercase;
    }

    .card-missing {
      color: var(--ink-3);
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
      color: var(--ink-3);
      font-size: var(--fs-meta);
      line-height: var(--lead-meta);
      font-variant-numeric: tabular-nums;
    }

    /* NOTHING ENDS THE SECOND LINE BUT WHO HOLDS THE ROW AND THE TICK of a selected row. The row's number
       stood here, in the id face, on every card (no "#" on a phone), and the holder's face had
       a third row of its own (no third line). */
    .card-end {
      grid-column: 2;
      grid-row: 2;
      align-self: center;
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--sp-2);
      font-size: var(--fs-meta);
      line-height: var(--lead-meta);
    }

    .card:has(.card-end) .card-b {
      grid-column: 1;
    }

    /* WHO A ROW IS FOR NEVER CUTS: where the line has no room for it, it goes under, whole. */
    .card-b:has(.card-for) {
      white-space: normal;
      text-overflow: clip;
    }

    .card-for {
      white-space: nowrap;
    }

    .card-holder {
      display: inline-flex;
    }

    /* A FACE IN THE LEADING SLOT, on a list of people: the slot widens to the face so both lines still start at
       one x, and the face sits in the middle of the title's line as the mark does. */
    .cards[data-faced] [data-slot] {
      padding-inline-start: calc(20px + var(--sp-2));
    }

    .card-face {
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: calc((1lh - 20px) / 2);
      display: flex;
    }

    /* ON ONE NEUTRAL TINT, as on every list of people: the name beside it says who. */
    .card .card-face :global(.face[data-kind='person']) {
      background: var(--tile-2);
      color: var(--ink-2);
    }

    /* THE FIGURE'S NAME, quieter and smaller than the figure it names, on the figure's own line. */
    .card-figure-label {
      margin-inline-end: var(--sp-1);
      color: var(--ink-3);
      font-size: var(--fs-meta);
      font-weight: 400;
    }

    /* THE SCOPE CHIP AS A WORD OF THE LINE: the line's height and not a control's, since on a card it is not one,
       and the gap a separator would have taken before it. */
    .card-b :global(.scope-chip) {
      min-block-size: 0;
      padding-block: 0;
      vertical-align: baseline;
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
