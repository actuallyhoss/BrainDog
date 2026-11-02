<!--
  `cards` — one card per row after the first, which names what each column is on a card
  (`src/cards.ts`). Drawn to the same tree as `html.ts`'s `cards`; `src/parity.test.ts` compiles this
  file and compares the two.

  The host lays the cards out with `auto-fill` over a minimum width, so a narrow container is one
  column without a breakpoint, and a lane of one card keeps a card's width instead of stretching.
-->
<script lang="ts">
  import {
    CARDS_NONE,
    MISSING,
    TONES,
    agentMarkFill,
    cardLayout,
    cardsCount,
    initialOf,
    inline,
    isQuiet,
    headlineFigure,
    leadingCode,
    symbolFigure,
    markOf,
    ringDash,
    ringOf,
    text,
    type AgentMark,
    type Block,
    type RenderOptions,
    type Row,
  } from '../src/index.ts';
  /* From the module and not the root, which does not export it: the word is this drawer's and `html.ts`'s alone. */
  import { CARDS_NEXT, RUN_OPEN, cardTrend, helpersOf, isDimmed, markGlyphOf, runFaceOf, runMarkOf, type Helpers, type RunCell, type RunFace } from '../src/cards.ts';
  import { cellNamesNothing, glyphPath, glyphWaits } from '../src/inline.ts';
  import { hueOf } from '../src/cards.ts';
  import { pictureSrc } from '../src/gallery.ts';
  import { hrefFor, runSlotStyle, trendNewest, written } from '../src/html.ts';
  import { slotOf } from '../src/slot.ts';
  import { AMOUNT_SPACE } from '../src/money.ts';
  import { CARD_EDIT_PAUSE, editAfter, type CardEdit } from '../src/card-edit.ts';
  import { mostOf, showAllSaid, type MostKeys } from '../src/most.ts';
  import Text from './Text.svelte';
  import PartChip from './p/PartChip.svelte';

  /**
   * What a scope cell draws its chip from, as `p/Table.svelte` takes it, written out here for the reason given there.
   * The host hands it in `opts` beside the block, since a card grid reaches this file through `Block` and `Grid`, which
   * pass `opts` on whole.
   */
  type ScopeCells = { columns: readonly number[]; everywhere: string; glyph: string | null; marks: ReadonlyMap<string, { mark: string | null; hue: number | null }> };

  /**
   * A LINE TYPED ON IN PLACE IS HANDED IN `opts` TOO, for the reason a scope is: `edits` is, by the header's
   * columns, the field a box writes and its own max (`cardEdit`, `src/card-edit.ts`), and `write` is the page's writer,
   * which answers the record's sentence when it refuses and nothing when the line was kept. With no `write`, a reader who
   * cannot write and the mirror alike, every line is text, as `toHTML` draws it.
   */
  type CardWrite = (row: Row, field: string, value: string) => Promise<string | null | undefined | void> | string | null | undefined | void;

  /* A BLOCK OF RUNS COMES WITH ITS RUNS: the host hands one a row, which the `who` face is drawn from. */
  let {
    block,
    opts = {},
  }: {
    block: Block;
    opts?: RenderOptions & {
      scope?: ScopeCells | undefined;
      runs?: readonly (RunCell | null)[] | undefined;
      helpers?: readonly Helpers[] | undefined;
      edits?: readonly (CardEdit | null)[] | undefined;
      write?: CardWrite | undefined;
    };
  } = $props();

  const L = $derived(cardLayout(block.rows[0]?.cells ?? []));
  const rows = $derived(block.rows.slice(1));

  /* A LONG BLOCK DRAWS ITS FIRST SIX (`mostOf`) and a "Show all" under them, which opens the rest in place and keeps
     them open while the page is: `html.ts` draws the same six and says how many it left out. */
  const most = $derived(mostOf(block as Block & MostKeys, rows.length));
  let all = $state(false);
  const drawnCards = $derived(all ? rows : rows.slice(0, most.shown));

  /* WHERE A ROW APPLIES IS A FACT THAT IS DRAWN AS A CHIP: a fact in a column the host names as a scope. */
  const scoped = (i: number): boolean => opts.scope?.columns.includes(i) ?? false;

  const label = (i: number): string => L.labels[i] ?? '';
  /** The word before a project in a card's meta line. */
  const CARDS_ON = 'on';
  const said = (r: Row, i: number): string => (i < 0 ? '' : text(inline(r.cells[i] ?? '', opts)));
  const nodes = (r: Row, i: number) => inline(r.cells[i] ?? '', opts);
  /* A ROW'S MARK IS A PICTURE WHERE IT NAMES ONE (`markOf`), and a picture only the set holds is asked again once the
     set lands, as `Section` waits on it: `gift` and `store` have no drawing in the host's hand until the set's chunk
     arrives. Until then, and for a host with no drawing at all, the named slot stays empty, as `toHTML` leaves it. */
  let landed = $state(0);
  $effect(() => {
    const waits = rows.some((r) => {
      const g = L.mark >= 0 ? markGlyphOf(markOf(said(r, L.mark), said(r, L.name))) : null;
      return g !== null && glyphWaits(g, opts);
    }) || [...(opts.scope?.marks ?? new Map()).entries()].some(([name, m]) => {
      const g = m.mark ? markGlyphOf(markOf(m.mark, name)) : null;
      return g !== null && glyphWaits(g, opts);
    });
    if (waits) void opts.iconSet?.().then(() => landed++, () => {});
  });
  const markArt = (glyph: string): string | null => {
    void landed;
    return glyphPath(glyph, opts);
  };

  /** The mark the host draws for the name in a cell, or `null`, as `markFor` in `src/html.ts`. */
  const markFor = (name: string): AgentMark | null => (name.trim() && opts.agentMark ? opts.agentMark(name.trim()) : null);

  /* ── A LINE TYPED ON IN PLACE ── */

  /** The words under a card when the record would not keep what was typed and gave no sentence of its own. */
  const NOT_KEPT = 'That line was not kept. The old one is back.';
  const EMPTY_LINE = 'Add a line';
  const EMPTY_NAME = 'Add a name';

  /* A BOX ONLY OVER A ROW THE HOST CAN NAME, since the writer is handed the row and writes by its ref. */
  const boxOf = (r: Row, i: number): CardEdit | null => (i >= 0 && opts.write && r.ref ? (opts.edits?.[i] ?? null) : null);
  /* KEYED BY THE ROW'S REF AND THE COLUMN, never by its place, since a write reads the page again and the cards move. */
  const cardKey = (r: Row, n: number): string => (r.ref ? `${r.ref.register}#${r.ref.seq}` : `#${n}`);
  const boxKey = (r: Row, n: number, i: number): string => `${cardKey(r, n)}.${i}`;
  /* A box is named for a screen reader by its column's label, or by the card it is on. */
  const boxName = (r: Row, i: number): string => label(i) || (i === L.name ? 'Name' : said(r, L.name) ? `Line under ${said(r, L.name)}` : 'Line');

  /**
   * What was typed into a box: the text, the line as it was drawn when the typing began (`from`, which Escape puts back),
   * the line drawn under it now (`since`), and what was last written (`sent`), so a second pause over the same words
   * sends nothing.
   */
  type Draft = { text: string; from: string; since: string; sent?: string | undefined };
  let drafts = $state<Record<string, Draft>>({});
  /** The sentence said under a card, by `cardKey`, until something is typed on it again. */
  let refused = $state<Record<string, string>>({});
  /** The box being typed into. Any other is readonly, so a tap that only meant to land on a phone opens no keyboard. */
  let armed = $state<string | null>(null);
  /** The pause each box is waiting out, and the write it ends in, so a card that goes mid-pause still sends it. */
  const waits = new Map<string, { at: number; handle: ReturnType<typeof setTimeout>; run: () => void }>();
  /** How the last press on a box landed: by touch, and on a box already focused. */
  let pressed: { key: string; touch: boolean; focused: boolean } | null = null;

  /* WHILE A BOX IS BEING TYPED INTO, WHAT WAS TYPED; once left, what was typed until the record draws a new line. */
  const shown = (key: string, cell: string): string => {
    const d = drafts[key];
    return d && (armed === key || d.since === cell) ? d.text : cell;
  };

  function hush(key: string) {
    const w = waits.get(key);
    if (w) clearTimeout(w.handle);
    waits.delete(key);
  }

  /** Writes what the box holds, if the pause is over and it says something new. */
  function send(r: Row, n: number, i: number, e: CardEdit, ms: number) {
    const key = boxKey(r, n, i);
    const d = drafts[key];
    hush(key);
    if (!d || !opts.write) return;
    const step = editAfter(d.sent ?? d.since, d.text, ms, e.max);
    if (step.wait > 0) return wait(r, n, i, e, Date.now() - (CARD_EDIT_PAUSE - step.wait));
    if (step.send === null) return;
    put(r, n, key, e.field, step.send);
  }

  function put(r: Row, n: number, key: string, field: string, value: string) {
    const ck = cardKey(r, n);
    const write = opts.write;
    if (!write) return;
    if (drafts[key]) drafts[key] = { ...drafts[key]!, sent: value };
    delete refused[ck];
    /* A REFUSAL IS SAID UNDER THE CARD AND THE OLD LINE IS PUT BACK, which is the line the record still holds. */
    const back = (fix: string) => {
      refused[ck] = fix;
      delete drafts[key];
    };
    Promise.resolve()
      .then(() => write(r, field, value))
      .then(
        (fix) => {
          if (typeof fix === 'string' && fix.trim()) back(fix.trim());
        },
        () => back(NOT_KEPT),
      );
  }

  function wait(r: Row, n: number, i: number, e: CardEdit, at = Date.now()) {
    const key = boxKey(r, n, i);
    hush(key);
    const run = () => send(r, n, i, e, Date.now() - at);
    waits.set(key, { at, handle: setTimeout(run, Math.max(0, CARD_EDIT_PAUSE - (Date.now() - at))), run });
  }

  function typed(r: Row, n: number, i: number, e: CardEdit, cell: string, text: string) {
    const key = boxKey(r, n, i);
    const d = drafts[key];
    drafts[key] = { text, from: d?.from ?? cell, since: cell, sent: d?.sent };
    delete refused[cardKey(r, n)];
    wait(r, n, i, e);
  }

  /* ESCAPE PUTS THE OLD LINE BACK: dropped before the pause, and written back over what a pause already wrote. */
  function undo(r: Row, n: number, i: number, e: CardEdit) {
    const key = boxKey(r, n, i);
    const d = drafts[key];
    hush(key);
    delete drafts[key];
    if (d?.sent !== undefined && d.sent !== d.from.trim()) put(r, n, key, e.field, d.from.trim());
  }

  /* A PRESS BY TOUCH ON A BOX NOT YET FOCUSED ONLY LANDS ON IT, and the second opens it (the risk PGS-C15 names: a line
     pressed by mistake on a phone). A mouse, a pen and the keyboard open it at once. */
  function press(ev: PointerEvent, key: string) {
    pressed = { key, touch: ev.pointerType === 'touch', focused: document.activeElement === ev.currentTarget };
  }
  function focused(key: string) {
    if (!(pressed?.key === key && pressed.touch && !pressed.focused)) armed = key;
  }
  function tapped(ev: MouseEvent, key: string) {
    if (armed === key || !pressed || pressed.key !== key || !pressed.focused) return;
    armed = key;
    const box = ev.currentTarget as HTMLInputElement;
    box.readOnly = false;
    box.focus();
  }
  function left(r: Row, n: number, i: number, e: CardEdit) {
    const key = boxKey(r, n, i);
    if (armed === key) armed = null;
    pressed = null;
    send(r, n, i, e, Infinity);
  }
  function keyed(ev: KeyboardEvent, r: Row, n: number, i: number, e: CardEdit) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      (ev.currentTarget as HTMLInputElement).blur();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      undo(r, n, i, e);
      (ev.currentTarget as HTMLInputElement).blur();
    }
  }

  /* A CARD THAT GOES MID-PAUSE STILL SENDS WHAT WAS TYPED, as leaving the box would. */
  $effect(() => () => {
    for (const w of [...waits.values()]) {
      clearTimeout(w.handle);
      w.run();
    }
    waits.clear();
  });
</script>

<!-- AN AGENT'S FACE AS ITS MAKER'S MARK, as `agentFaceHtml` in `src/html.ts` draws one: the host's path, filled in the
     maker's tone, in the face slot a letter used to fill. Hidden, because the agent is named in words beside it. -->
{#snippet agentFace(m: AgentMark, cls: string)}{@const fill = agentMarkFill(m.tone)}<span class={cls} data-agent="" aria-hidden="true"
    ><svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style={fill ?? undefined}
      ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
    ></span
  >{/snippet}

<!-- A LINE TYPED ON IN PLACE: a box that looks like the text it replaces, the same type and no box until it is focused,
     when the board's field outline shows (`a11y.css`). Readonly until it is opened, so a tap that only lands opens no
     keyboard. Its `maxlength` is a loose bound; `editAfter` holds the field's own max in the bytes the record counts. -->
{#snippet box(r: Row, n: number, i: number, e: CardEdit, empty: string)}{@const key = boxKey(r, n, i)}{@const cell = said(r, i)}<input
    class="cards-edit"
    type="text"
    value={shown(key, cell)}
    maxlength={e.max}
    readonly={armed !== key}
    placeholder={empty}
    aria-label={boxName(r, i)}
    autocomplete="off"
    enterkeyhint="done"
    data-armed={armed === key ? '' : undefined}
    onpointerdown={(ev) => press(ev, key)}
    onfocus={() => focused(key)}
    onclick={(ev) => tapped(ev, key)}
    oninput={(ev) => typed(r, n, i, e, cell, ev.currentTarget.value)}
    onblur={() => left(r, n, i, e)}
    onkeydown={(ev) => keyed(ev, r, n, i, e)}
  />{/snippet}

<!-- WHERE A ROW APPLIES, IN THE CARD'S META LINE (agents F7): "on ● Kiln", the project's dot in its hue and its
     name, as words and not a fact in the label column, where "on" sat 96px from "Kiln". A row for every project says
     "Everywhere". The dot is hidden from a screen reader, which reads "on Kiln". -->
{#snippet scopeLine(cells: ScopeCells, said: string)}{@const everywhere = said === cells.everywhere}{@const m = everywhere ? undefined : cells.marks.get(said)}<p class="cards-scope">{#if everywhere}<span class="scope-name">{said}</span>{:else}{CARDS_ON}{' '}<span class="cards-scope-dot" style={m?.hue === null || m?.hue === undefined ? undefined : `--hue:${m.hue}`} data-slot={m?.hue === null || m?.hue === undefined ? undefined : slotOf(m.hue)} aria-hidden="true"></span><span class="scope-name">{said}</span>{/if}</p>{/snippet}

{#snippet labelled(i: number)}{#if label(i)}<span class="cards-label">{label(i)}</span>{/if}{/snippet}


<!-- A RUN'S FACE, as `apps/web`'s `AgentFace` draws one: the kind's glyph on a disc washed in the run's
     hue, ringed in that hue while the run is open, solid while it works and dashed once it has gone quiet, and a door to
     the run's page. The hue is written on the drawing alone, so the card's own `--hue` is left as it was. -->
{#snippet runFace(f: RunFace)}{@const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (opts.icon?.(f.glyph) ?? null)}{@const m = runMarkOf(f, opts.agentMark)}<a
    class="cards-face cards-run tap"
    style="background:none"
    href={hrefFor(opts, `/r/session/${f.seq}`)}
    data-live={f.live}
    aria-label={RUN_OPEN}
    ><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style={runSlotStyle(f.hue)}
      ><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:var(--run-wash)"
      ></circle>{#if f.live !== 'stopped'}<circle
          class="cards-run-ring"
          cx="18"
          cy="18"
          r="16.5"
          fill="none"
          stroke-width="2.5"
          stroke-dasharray={f.live === 'quiet' ? '4 3' : undefined}
          style="stroke:var(--run-ring)"
        ></circle>{/if}{#if m}{@const fill = agentMarkFill(m.tone)}<path
          class="cards-run-agent"
          d={m.d}
          fill-rule={m.rule}
          clip-rule={m.rule}
          transform="translate(10.5 10.5) scale(0.625)"
          fill="currentColor"
          data-tone={m.tone}
          style={fill ?? undefined}
        ></path>{:else if d}<path
          d={d}
          transform="translate(9 9) scale(0.75)"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>{/if}</svg
    ></a
  >{/snippet}

{#if rows.length === 0}
  <p class="cards-empty">{CARDS_NONE}</p>
{:else}
  <!-- AS MANY COLUMNS AS FIT, AND NEVER MORE THAN THERE ARE CARDS (`cardsCount`), so three cards fill the row. -->
  <ul class="cards-grid" data-cards={cardsCount(drawnCards.length)}>
    {#each drawnCards as r, n}
      {@const mark = L.mark >= 0 ? markOf(said(r, L.mark), said(r, L.name)) : null}
      {@const markGlyph = markGlyphOf(mark)}
      {@const run = L.name >= 0 || L.who >= 0 ? runFaceOf(said(r, L.nameIsWho ? L.name : L.who), opts.runs?.[n], isQuiet(L, r.cells)) : null}
      {@const face = L.nameIsWho ? initialOf(said(r, L.name)) : null}
      {@const nameMark = L.nameIsWho ? markFor(said(r, L.name)) : null}
      <!-- A CARD'S FIGURE IS A TILE'S, said short as `amount(headlineFigure(...))` in the mirror says it: `£18,400`. -->
      <!-- A figure that names nothing is left out, as `toHTML` leaves it (`cellNamesNothing`): the card keeps the rest. -->
      {@const shows = L.figure >= 0 && !cellNamesNothing(r.cells[L.figure], opts)}
      <!-- TOLD THE RECORD'S HOME, THE ONE WRITER SAYS IT (`written`, html.ts), as `Grid.svelte` draws a stat's figure. -->
      {@const w = L.figure >= 0 ? written(r.cells[L.figure] ?? '', opts, 'read') : null}
      {@const short = w ? w.text : L.figure >= 0 ? headlineFigure(r.cells[L.figure] ?? '', opts.home) : ''}
      {@const symbol = w ? (w.codePlace === 'before' ? null : w.text) : L.figure >= 0 ? symbolFigure(short) : null}
      {@const coded = !w && L.figure >= 0 ? leadingCode(short) : null}
      <!-- `.amount` holds the code and its first figure on one line; ` · US$21,300` after it wraps (`figureEnd`, html.ts). -->
      {@const end = coded ? coded.rest.search(/\s|$/u) : 0}
      <!-- A TREND IS DRAWN WITH ITS NAME AND ITS NEWEST VALUE, OR NOT AT ALL (`cardTrend`): a bare line said nothing. -->
      {@const t = L.trend >= 0 ? cardTrend(said(r, L.trend), label(L.trend)) : null}
      <!-- A RUN TOO SHORT TO DRAW STILL SAYS ITS NEWEST NUMBER where the card has no figure of its own (`trendNewest`). -->
      {@const newest = !t && L.figure < 0 && L.trend >= 0 ? trendNewest(said(r, L.trend), label(L.trend)) : null}
      {@const m = L.ring >= 0 ? ringOf(said(r, L.ring)) : null}
      {@const whoFace = L.who >= 0 ? initialOf(said(r, L.who)) : null}
      {@const whoMark = L.who >= 0 ? markFor(said(r, L.who)) : null}
      {@const hue = L.hue >= 0 ? hueOf(said(r, L.hue)) : null}
      {@const picture = L.picture >= 0 ? pictureSrc(r.cells[L.picture] ?? '', opts.file) : null}
      <!-- The reply and the next step as boxes, where the host hands this page a writer and the column says edit. -->
      {@const re = boxOf(r, L.reply)}
      {@const ne = boxOf(r, L.next)}
      {@const helped = helpersOf(opts.helpers, n)}
      <!-- The lead is the first card of a `cards lead` block and no other, told rather than inferred (05 §4). The hue is a
           number the host draws the mark in, and a cell that is not one writes no style; the picture leads the card
           where the host serves the file, hidden from a screen reader because the title under it names the card. -->
      <li
        class="cards-item"
        data-lead={block.form === 'lead' && n === 0 ? '' : undefined}
        data-intent={r.tone}
        data-quiet={isDimmed(L, r.cells, opts.runs?.[n]) ? '' : undefined}
        style={hue === null ? undefined : `--hue:${hue}`}
        data-slot={hue === null ? undefined : slotOf(hue)}
      >
        {#if picture}<img class="cards-picture" src={hrefFor(opts, picture)} alt="" loading="lazy" />{/if}
        <div class="cards-head">
          {#if mark}<span class="cards-mark" data-glyph={markGlyph ?? undefined} aria-hidden="true"
              >{#if markGlyph}{@const d = markArt(markGlyph)}{#if d}<svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"><path {d}></path></svg
                  >{/if}{:else}{mark}{/if}</span
            >
          {:else if L.nameIsWho && run}{@render runFace(run)}
          {:else if nameMark}{@render agentFace(nameMark, 'cards-face')}
          {:else if face}<span class="cards-face" aria-hidden="true">{face}</span>
          {:else if opts.partLook && L.name >= 0 && r.cells[L.name]}{@const look = opts.partLook(said(r, L.name))}{#if look}<PartChip glyph={look.glyph} slot={look.slot} letter={said(r, L.name).slice(0, 1).toLocaleUpperCase('en')} {opts} />{/if}{/if}
          {#if L.name >= 0}{@const te = boxOf(r, L.name)}<h3 class="cards-title">{#if te}{@render box(r, n, L.name, te, EMPTY_NAME)}{:else if r.cells[L.name]}<Text nodes={nodes(r, L.name)} {opts} />{:else}{MISSING}{/if}</h3>{/if}
          {#if r.tone}<span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span>{/if}
          {#if L.when >= 0 && r.cells[L.when]}<span class="cards-when"><Text nodes={nodes(r, L.when)} {opts} /></span>{/if}
        </div>
        <!-- The reply is the line under the head, and an empty one draws nothing, as in `toHTML`; one typed on in place is
             a box even while empty, since the box is where the line is written. -->
        {#if re}<p class="cards-reply">{@render box(r, n, L.reply, re, EMPTY_LINE)}</p>
        {:else if L.reply >= 0 && r.cells[L.reply]}<p class="cards-reply"><Text nodes={nodes(r, L.reply)} {opts} /></p>{/if}
        <!-- A RUN'S HELPERS ARE SAID UNDER ITS SENTENCE, in the reply's quieter voice (`helpersOf`), as in `toHTML`. -->
        {#if helped}<p class="cards-reply" data-helpers="">{helped}</p>{/if}
        {#each L.facts.filter((i) => scoped(i) && r.cells[i]) as i (i)}{@render scopeLine(opts.scope!, r.cells[i] ?? '')}{/each}
        {#if shows || newest || t || (L.ring >= 0 && r.cells[L.ring])}
          <div class="cards-body">
            {#if shows}
              <span class="cards-figure"
                ><span class="cards-value num"
                  >{#if !r.cells[L.figure]}{MISSING}{:else if symbol}{symbol}{:else if w}<span class="amount"
                    >{w.minus}<span class="amount-code">{w.code}</span>{AMOUNT_SPACE}{w.whole}{w.fraction}</span
                  >{:else if coded}<span class="amount"
                    >{coded.sign}<span class="amount-code">{coded.currency}</span>
                    <Text nodes={inline(coded.rest.slice(0, end), opts)} {opts} /></span
                  ><Text nodes={inline(coded.rest.slice(end), opts)} {opts} />{:else}<Text nodes={inline(short, opts)} {opts} />{/if}</span
                >{@render labelled(L.figure)}</span
              >
            {/if}
            {#if newest}<span class="cards-figure"><span class="cards-value num">{newest.last}</span><span class="cards-label">{newest.label}</span></span>{/if}
            {#if t}
              <!-- A word-sized line, so it is named by its numbers and is not a tab stop. -->
              <span class="cards-trended"><svg
                class="cards-trend"
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                role="img"
                aria-label="{t.label}: {t.said.join(', ')}"
              >
                <path class="cards-trend-line" d={t.d} vector-effect="non-scaling-stroke"></path>
                <path class="cards-trend-end" d={t.end} vector-effect="non-scaling-stroke"></path>
              </svg><span class="cards-value num">{t.last}</span><span class="cards-label">{t.label}</span></span>
            {/if}
            {#if L.ring >= 0 && r.cells[L.ring]}
              <span class="cards-ring"
                >{#if m !== null}<svg class="cards-ring-mark" viewBox="0 0 36 36" aria-hidden="true"
                    ><circle class="cards-ring-track" cx="18" cy="18" r="16" pathLength="100"></circle><circle
                      class="cards-ring-fill"
                      cx="18"
                      cy="18"
                      r="16"
                      pathLength="100"
                      stroke-dasharray={ringDash(m)}
                      transform="rotate(-90 18 18)"
                    ></circle></svg
                  >{/if}<span class="cards-value num"><Text nodes={nodes(r, L.ring)} {opts} /></span
                >{@render labelled(L.ring)}</span
              >
            {/if}
          </div>
        {/if}
        <!-- A FACT NOBODY WROTE IS NOT DRAWN: "Met in —" on a person met in no project said a field was missing where
             there was nothing to say. A card with no fact written draws no list at all. -->
        {#if L.facts.some((i) => !scoped(i) && (r.cells[i] || boxOf(r, i)))}
          <dl class="cards-facts">
            {#each L.facts as i}
              {@const fe = scoped(i) ? null : boxOf(r, i)}
              {#if !scoped(i) && (r.cells[i] || fe)}
                <!-- ITS WHOLE WORDS ON THE POINTER, for a surface that cuts a fact short (Today's people, two lines). -->
                <div class="cards-fact" title={fe ? undefined : said(r, i) || undefined}>
                  <dt>{label(i)}</dt>
                  <dd>{#if fe}{@render box(r, n, i, fe, EMPTY_LINE)}{:else}<Text nodes={nodes(r, i)} {opts} />{/if}</dd>
                </div>
              {/if}
            {/each}
          </dl>
        {/if}
        <!-- "Next:" over nothing would say there is a step nobody wrote down, so an empty next draws no line. -->
        {#if ne}<p class="cards-next" data-edit="">{CARDS_NEXT}: {@render box(r, n, L.next, ne, EMPTY_LINE)}</p>
        {:else if L.next >= 0 && r.cells[L.next]}<p class="cards-next">{CARDS_NEXT}: <Text nodes={nodes(r, L.next)} {opts} /></p>{/if}
        {#if L.who >= 0 && r.cells[L.who]}
          <div class="cards-who">
            {#if run}{@render runFace(run)}{:else if whoMark}{@render agentFace(whoMark, 'cards-face')}{:else if whoFace}<span class="cards-face" aria-hidden="true">{whoFace}</span>{/if}
            <span class="cards-name"><Text nodes={nodes(r, L.who)} {opts} /></span>
          </div>
        {/if}
        <!-- WHAT THE RECORD WOULD NOT KEEP IS SAID UNDER THE CARD, in its own words, and the old line is back above it. -->
        {#if refused[cardKey(r, n)]}<p class="cards-said" role="alert">{refused[cardKey(r, n)]}</p>{/if}
      </li>
    {/each}
  </ul>
  {#if !all && most.more > 0}
    <button type="button" class="cards-all" onclick={() => (all = true)}>{showAllSaid(rows.length)}</button>
  {/if}
{/if}

<style>
  /* A LINE TYPED ON IN PLACE LOOKS LIKE THE LINE IT REPLACES: its type, its colour and no box, until it is focused,
     when it takes the board's field and the focus outline every field wears (`a11y.css`). Pulled out by its own padding,
     so the words sit where the text did. GLOBAL, since a scoped rule marks every element whose class is not fixed, the
     agent's face among them, and the mirror's tree would differ by the mark. The names are this drawer's alone. */
  :global(.cards-edit) {
    display: block;
    inline-size: calc(100% + 2 * var(--sp-1));
    min-inline-size: 0;
    margin: 0;
    margin-inline: calc(-1 * var(--sp-1));
    padding: 0;
    padding-inline: var(--sp-1);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-overflow: ellipsis;
  }

  :global(.cards-edit::placeholder) {
    color: var(--ink-2);
  }

  :global(.cards-edit[data-armed]) {
    background: var(--tile-2);
    text-overflow: clip;
  }

  :global(.cards-next[data-edit]) {
    display: flex;
    gap: 0.25em;
    align-items: baseline;
  }

  :global(.cards-next[data-edit] .cards-edit) {
    flex: 1;
    inline-size: auto;
    margin-inline-start: 0;
  }

  /* A BOX IS A CONTROL, so on a finger it is the tap's height, as every control is. */
  @media (pointer: coarse) {
    :global(.cards-edit) {
      min-block-size: var(--tap);
    }
  }

  /* "SHOW ALL" IS A RECTANGLE A THUMB CAN HIT, under the grid, in the body's ink as every "more" is (Q36 of 29
     October: red read as a warning). Global, as the rules above are, so the scoped hash marks no card. */
  :global(.cards-all) {
    display: block;
    min-block-size: var(--tap);
    /* HUNG A STEP INTO THE TILE'S PADDING, as every list's rows are, so its words start on the cards' edge and only its
       wash reaches past it. */
    margin: var(--sp-2) 0 0 calc(-1 * var(--sp-3));
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  :global(.cards-all:hover) {
    background: var(--tile-2);
  }

  :global(.cards-said) {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }
</style>
