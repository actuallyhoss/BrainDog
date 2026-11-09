<!--
  One block of a declared page: its name and where its rows live, then what it draws, then the panel the host draws
  under it and the line that says it is a slice. The same markup wherever a declared page is drawn: on `/p/<slug>`, in
  Home's body and in a preview, because `PageBody.svelte` draws every block through this one file.

  PER-BLOCK ERROR BOUNDARIES. Six queries, six independent failures, and one broken query never blanks a page. A
  block-level failure announces with `role="status"`, not `role="alert"`: ten simultaneous assertive announcements is a
  denial of service on a screen-reader user (19 §6).

  A KIND REGISTERED IN `kinds/index.ts` IS ASKED FIRST, inside `draw` (`blocks.ts`), which answers that kind's segments
  from the record's own answer. Such a block carries `answer`, and the grid below is never drawn over it, whatever its
  kind is called.

  WRITES ARE HANDED IN WHOLE OR NOT AT ALL. `writes` is the page's `Writes` (`page-writes.ts`), or `null` on a page that
  is inert; a block handed no callback draws no control, which is the renderer's rule (a control that cannot act is
  absent, not greyed).
-->
<script lang="ts">
  /* `at` IS THE BLOCK INDEX WHERE THE PAGE BODY LAYS BLOCKS OUT, so the address helper goes by another name here too. */
  import { tick, untrack } from 'svelte';
  import { live as liveRecord } from '$lib/data/live.svelte.ts';
  import { apiBase, at as inApp } from '../at.ts';
  import { whoseOf } from './drawn-pictures.ts';
  import { cardEditsOf, cardWrite, drawnWrite } from './card-writes.ts';
  import { Block, Degraded, Markdown, Table, Text } from 'braindog-render/svelte';
  import { EMPTY_KEEP, KINDS, KPIS_KIND, currencyOfFigure, exponentOf, inline, moneyWhole, readFigure, signedOf, text } from 'braindog-render';
  import { approxOf } from '$lib/money/rates.ts';
  import { held as heldRates } from '$lib/money/rates.svelte.ts';
  import { looks as moneyLooks } from '$lib/money/looks.svelte.ts';
  import LedgerCards, { cardsOf as linesOf } from '$lib/money/LedgerCards.svelte';
  import { linesSaid } from '$lib/money/ledger-lines.ts';
  import { pictureSrc } from '$lib/picture/picture.ts';
  import { logoOf, wantLogos } from '$lib/picture/pictures.svelte.ts';
  import { recordToday } from '$lib/record/zone.ts';
  import { kpiHref, kpisIn } from './kpis-in.ts';
  import QueueAnswer from './QueueAnswer.svelte';
  import { compactOf, queueWords } from './queue-answer.ts';
  import { alikeOf, type QueueEntry } from './alike.ts';
  import AlikeCard from './AlikeCard.svelte';
  import { doorOf } from './door.ts';
  import { queueMore } from 'braindog-render';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { said as voiceSaid } from '$lib/voice.svelte.ts';
  import { decl as fieldDecl, homeCurrency, labelOf } from '$lib/record/api.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { draw, saidPlainly, walkTables } from '$lib/record/blocks.ts';
  import { joinsWithOr, registerHref } from '$lib/record/where.ts';
  import { rowHref } from '$lib/record/row-href.ts';
  import { dayHref } from '$lib/record/day-href.ts';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { agedText, fileAt, namedResolverOf, type LiveBlock, type Walked } from '$lib/record/page-live.ts';
  import { glyphSet, glyphSetNow, isGlyph, pathOf } from '$lib/ui/icons.ts';
  import { agentKindOf, liveOf } from '../ui/face.ts';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Figure from '$lib/ui/Figure.svelte';
  import { PANEL_WHO, panelOf } from './panels/panel-of.ts';
  import { openInPlace, type Opening } from './group-open.ts';
  import type { Writes } from './page-writes.ts';
  import type { Picked } from './picked.svelte.ts';
  import type { DrawnAct, Row, WidgetSize } from 'braindog-render';
  import { refOfHref } from '$lib/send/send.ts';
  import { listOfBlock, partRow, type FiguredBlock } from '$lib/things/part-row.ts';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import AddStep from './AddStep.svelte';
  import Hole from './Hole.svelte';
  import { foldOf } from './home.ts';
  import { LONG_AT, LONG_STEP, longFoldOf, longWords } from './fold.ts';
  import { headCount, headIcon } from './tile-head.ts';
  import HomeRows from '$lib/home/HomeRows.svelte';
  import { lateDoors, lateWhere, lateWords, linesIn, moneyListOf, type WithRows } from '$lib/home/home-rows.ts';
  import { words } from './words.ts';
  import { blockWords } from '$lib/record/block-edit.ts';
  import ProjectCard from '$lib/ui/ProjectCard.svelte';
  import KpisBlock from '$lib/kpis/KpisBlock.svelte';
  import { agentsOn, cardFactsOf, cardsOf, trendsOf, withWorked, type CardDecl } from '$lib/home/project-cards.ts';
  import { withKpis, type KpiAnswered } from '$lib/home/card-kpi.ts';
  import { knowProjects } from './known-project.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { valueSaid } from '$lib/voice.ts';
  import { seenWords } from '$lib/record/blocks.ts';
  import { flip } from 'svelte/animate';
  import { arrive, depart, dismiss, lineIn, listMotion, ms, play, settleOn, springy, still } from '$lib/motion/index.ts';
  import { isProject } from '$lib/record/project.ts';
  import { workingNow } from '$lib/home/waits.svelte.ts';
  import { deskCards, type Desk } from '$lib/home/desk-part.ts';
  import { getContext } from 'svelte';
  import { SHAPE_KEY, type ShapeBox } from './shape-key.ts';
  import { partsOf } from './kinds/project.ts';
  import { MediaQuery } from 'svelte/reactivity';
  import { drawnOf } from './kinds/drawn.ts';
  import { goto, invalidateAll } from '$app/navigation';
  import { landed } from '$lib/home/tile-landed.ts';
  import { partLanded } from './part-landed.ts';

  let {
    block,
    i,
    ids = '',
    writes,
    param,
    arranging = false,
    now,
    level = 2,
    fold = false,
    long = false,
    rows = null,
    verbs = null,
    pick = null,
    walk = null,
    compact = false,
    slug = null,
    widget = null,
  }: {
    block: LiveBlock;
    /** The block's declared index, which its id, its heading's id and its held rows are keyed by. */
    i: number;
    /** What every id this block writes starts with, so two readers on one screen never share one. */
    ids?: string;
    /** The page's writes, or `null` where the page is inert. */
    writes: Writes | null;
    /** The row the page is drawn for, on a page expanded from a template: the host's panels are drawn for it. */
    param: { register: string; seq: number; title: string } | undefined;
    /** Whether the page is being arranged. A panel that fetches is not a block to move, so none is drawn then. */
    arranging?: boolean;
    /** The record's clock the page was read against, which "today", "late" and `{{ago:}}` are told against. */
    now: number;
    /** The size of the board frame this block is drawn in as a widget, or `null` off a board. */
    widget?: WidgetSize | null;
    /** The block name's heading level: 2 under a page's title, 3 under a preview's own heading. */
    level?: 2 | 3;
    /** Whether a long list folds in place under "N more", as it does on a home (`home.ts` `foldOf`). */
    fold?: boolean;
    /** Whether a list of many rows shows thirty and adds thirty a press, on a page at its own address (`fold.ts` `longFoldOf`). */
    long?: boolean;
    /**
     * The row cursor a home walks, handed to the renderer (`braindog-render`'s `cursor.ts`): the key of the row it is on
     * in this block, or `null`, and the call a primitive makes when Tab or a click lands in one of its rows. `null`
     * where nothing walks rows.
     */
    rows?: { cursor: string | null; onrowfocus: (row: string) => void } | null;
    /**
     * A ROW'S TWO VERBS BEYOND ITS TICK, handed to the renderer: open it in the page's docked panel, and open its menu at
     * the control pressed. `null` where the page does not host rows (a home, a preview), and the markup is then what
     * it always was.
     */
    verbs?: { onopen: (row: Row) => void; onmenu: (row: Row, anchor: HTMLElement, point?: { x: number; y: number; height: number }) => boolean } | null;
    /** The page's choice of questions to answer at once, which a queue of two or more questions adds to. */
    pick?: Picked | null;
    /**
     * Reads the page again with a forecast walked as far as a reader picked, past where it reaches unasked (`PageBody`'s
     * `onwalk`). `null` where the page is not read again.
     */
    walk?: ((length: Walked) => void) | null;
    /**
     * Whether a queue's questions are drawn compact, the question and its answers and nothing else: on a home, and where
     * the page is about something else and sets them aside (`asks.ts`).
     */
    compact?: boolean;
    /** The page's address, which the block's own menu reads the page by and writes its look under; else the route's. */
    slug?: string | null;
  } = $props();

  /* ── the block's own menu ──────────────────────────────────────────────────
     MOVE, WIDTH, COLUMN AND HIDE FROM THE BLOCK'S HEAD, the owner's on a page that writes and is not being
     arranged, for a block with a key a look may name. BEHIND `?menu` until the board of a tile's head is agreed, since a
     control in every head changes every declared screen; Edit layout stays the way in until then. LOADED BY `import()`,
     so neither it nor its styles reach the entry chunk. */
  const menuSlug = $derived(slug ?? (route.params as { slug?: string }).slug ?? null);
  const menuOn = $derived(
    writes !== null &&
      !arranging &&
      menuSlug !== null &&
      route.url.searchParams.has('menu') &&
      (route.data as { me?: { owner?: unknown } }).me?.owner === true &&
      /^[a-z][a-z0-9_-]{0,47}$/u.test(block.key ?? ''),
  );

  /* A `{{path}}` IS ANSWERED BY THE RECORD on the block's `values`; a missing value is marked. `now` is the clock the
     rows were read against, so `{{ago:}}` agrees with the dates beside it. A HOLE IS PRESSABLE WHERE THE PAGE WRITES
     (`Hole.svelte`): it opens the place the value lives, or offers to find it out. On an inert page it stays a mark. */
  /* A FIGURE IN A SENTENCE READS AS MONEY, `£7,200.00` and not `GBP 7,200.00`, as the cells beside it do. */
  /* THE PAGE'S HEADLINE LINE SAYS WHOLE UNITS: "Cash is EGP 1,086,213", the way a person says it,
     where it said "EGP 1,086,213.41" (`money.ts` `symbolText`). AND SO DOES EVERY SENTENCE, as `moneyWhole` says a
     sentence is a display figure: Zakat's tile said "EGP 40,873" over a step that said "EGP 40,872.50" of the same sum. */
  const said = (text: string | null): string | null => (text === null ? null : symbolText(text, homeCurrency(), block.kind === 'note'));

  /* ── the fold ──────────────────────────────────────────────────────────────
     A LONG LIST ON A HOME SHOWS ITS FIRST ROWS AND FOLDS THE REST in place, one press away, as Today folds what needs
     you; nothing is cut and nobody is sent to another screen for the ninth row. Once opened it stays open. */
  let open = $state(false);
  /* AND A LONG ONE ON A PAGE, thirty at a time (`fold.ts`): the Ledger drew 142 lines, 12,400px, at once. */
  let longShown = $state(LONG_AT);
  const folded = $derived(fold ? foldOf(block.kind, block.rows.length, open) : long ? longFoldOf(block.kind, block.rows.length, longShown) : null);
  /**
   * "Show 30 more" pressed: the next thirty open under the last row read, and the focus goes to the first of them. THEY
   * COME IN, NOT APPEAR (UI pass, 1 Nov): the rows a press adds fade up 4px over `--d-rows` together, so the eye reads
   * where the old list ended and the new rows began; nothing waits on it, and under reduced motion they are simply there.
   */
  const longer = (e: MouseEvent, from: number) => {
    const list = (e.currentTarget as HTMLElement).previousElementSibling;
    void unfold(e, from, () => (longShown += LONG_STEP)).then(() => {
      if (!list || still()) return;
      const all = [...list.querySelectorAll<HTMLElement>(ROWS)].filter((el, _, every) => !every.some((o) => o !== el && o.contains(el)));
      for (const row of all.slice(from)) play(row, { opacity: [0, 1], transform: ['translateY(4px)', 'none'] }, { duration: ms('--d-rows', 180) });
    });
  };

  /* THE ROWS OF A LIST OR A TABLE as drawn: the renderer's rows, a plain list's items, a table's body rows, and cards. */
  const ROWS = '[data-row], .list > li.item, .rowgroup > [role="row"], .cards-item';

  /**
   * "N more" pressed. The button goes once the list is open, so the focus is handed to the first row that opened rather
   * than dropped to the page: `from` is how many rows were shown before, in the drawing just above the button.
   */
  async function unfold(e: MouseEvent, from: number, opening: () => void = () => (open = true)) {
    const above = (e.currentTarget as HTMLElement).previousElementSibling;
    opening();
    await tick();
    const all = above ? [...above.querySelectorAll<HTMLElement>(ROWS)] : [];
    const row = all.filter((el) => !all.some((o) => o !== el && o.contains(el)))[from];
    /* A TABLE IS A GRID, whose stops are its cells, so the row's first cell takes the focus there; A CARD IS NAMED BY ITS
       LINK, which takes it. */
    const to =
      row?.getAttribute('role') === 'row'
        ? (row.querySelector<HTMLElement>('[role="gridcell"], [role="cell"]') ?? row)
        : row?.classList.contains('cards-item')
          ? (row.querySelector<HTMLElement>('a[href]') ?? row)
          : row;
    if (!to) return;
    if (!to.hasAttribute('tabindex')) to.tabIndex = -1;
    to.focus();
  }

  /* A GLYPH NAMED IN TEXT IS DRAWN BY THE HOST, because the renderer ships no glyph art (05 §3): the path for a name this
     build draws, or nothing, and the renderer then keeps its named, empty slot. A name in the set that has not arrived
     yet draws nothing for now, as an `Icon` does. */
  const icon = (name: string): string | null => (isGlyph(name) ? (pathOf(name, glyphSetNow()) ?? null) : null);

  /* THE HEADING AS A TABLE'S ACCESSIBLE NAME: its words without a glyph's braces (`text` drops an icon to nothing). */
  const headingText = $derived(block.heading ? text(inline(block.heading)).trim() : undefined);

  /* What a pressed hole does, drawn below where the page writes; nothing of it is on screen until one is pressed. */
  let holes = $state<{ press: (path: string | null) => void }>();

  /* Where each file the block holds is served, record-relative (`page-live.ts` `fileAt`), read by `opts.file` below. */
  const filed = $derived(fileAt(block));

  /* A CARD'S LINE TYPED ON IN PLACE: by column, the field a box writes (`card-writes.ts` `cardEditsOf`), and
     the page's writer as the card's `write`, only where the page writes and the reader may write the list. The row
     writer loads on the first edit, as `typeInto`'s does, so a page nobody types on never pulls it in. A LIST WHOSE
     DECLARATION THIS TAB HAS NOT LEARNED YET (`REGISTERS` fills as the record answers `schema`) is read off the block's
     own entries: a field every card holds as words, or none, is text. */
  const cardEdits = $derived(
    block.kind === 'cards'
      ? cardEditsOf(block.columns ?? [], (id) => {
          const known = REGISTERS[block.register ?? '']?.fields.find((d) => d.id === id);
          if (known) return known;
          return (block.entries ?? []).every((e) => e.fields[id] === undefined || e.fields[id] === null || typeof e.fields[id] === 'string') ? { type: 'text' } : undefined;
        })
      : [],
  );
  const cardLabel = (field: string): string => {
    const said = block.columns?.find((c) => c.field === field)?.label;
    const f = REGISTERS[block.register ?? '']?.fields.find((d) => d.id === field);
    const named = typeof said === 'string' && said !== '' ? said : (f?.label ?? field.replaceAll('_', ' '));
    return named.charAt(0).toUpperCase() + named.slice(1);
  };
  const cardWriter = $derived(
    writes && cardEdits.some((f) => f !== null)
      ? cardWrite(
          {
            update: async (register, seq, patch, version) => (await import('$lib/record/rows-write.ts')).rowWriter(apiBase()).update(register, seq, patch, version),
            held: (seq, field) => block.entries?.find((e) => e.seq === seq)?.fields[field],
            label: cardLabel,
            reread: writes.reread,
          },
          block.register,
          may(route.data as unknown as Shell, 'write', block.register),
        )
      : null,
  );

  const opts = $derived({
    /* A PATH THAT NAMES NOTHING OF THE RECORD IS ANSWERED `UNNAMED` (the kernel's `unnamed`), never a dash: the author's
       words in prose, and no figure in a chip, a tile or a bar. */
    resolve: (path: string) => {
      const v = namedResolverOf(block.values, block.unnamed)(path);
      if (!(typeof v === 'string' || v === null || v === undefined)) return v;
      const text = said(v ?? null);
      /* IN PROSE, A FIGURE STATED A WHILE AGO SAYS ITS AGE beside it, as a tile does (`agedText`). A chip's or a tile's
         figure stays the figure alone: the tile says its own age. */
      return text === null ? null : (KINDS as Record<string, { prose?: boolean } | undefined>)[block.kind]?.prose === true ? agedText(text, block.valuesAsOf?.[path], recordToday()) : text;
    },
    now,
    /* THE RECORD'S HOME CURRENCY, so every amount the drawers write is the one writer's (`money.ts`): `null` on a
       record with none. */
    home: homeCurrency(),
    /* A FOREIGN AMOUNT RESTATED IN THE HOME CURRENCY, `≈ EGP 51,744`, at the record's own rates (`approxOf`); nothing where
       the amount is at home or no rate reaches it. The rates are asked of the record the first time one is wanted. */
    approx: (figure: string): string | null => {
      const home = homeCurrency();
      /* THE CURRENCY BY ITS CODE OR BY ITS SIGN ALONE (`currencyOfFigure`): another currency is drawn by its own sign now,
         "$1,950" with no "USD" after it, and a reader that wanted the code said no "≈" under any payout in dollars. */
      const currency = home ? currencyOfFigure(figure, home) : null;
      if (!home || !currency) return null;
      const read = readFigure(figure.trim());
      const f = { minor: read ? Number(read.minor) : Math.round(signedOf(figure) * 10 ** exponentOf(currency)), currency };
      heldRates.ask();
      /* A LEAD FIGURE IN THE HOME CURRENCY (Money's Cash now) IS SAID ONCE MORE IN EACH OTHER CURRENCY THE RECORD HOLDS A
         RATE FOR, under it ("≈ $13,187"), as a finance app restates its headline: the rest of a tile's figures are not. */
      const b = block as { lead?: unknown; metrics?: { id?: unknown; value?: unknown; trend?: unknown[] }[] };
      const m = b.lead === true ? b.metrics?.find((x) => x.id === 'cash-now') : undefined;
      const cash = typeof m?.value === 'number' ? m.value : typeof m?.trend?.[0] === 'number' ? m.trend[0] : undefined;
      if (typeof cash === 'number' && f.currency.toUpperCase() === home.toUpperCase() && Math.abs(Number(f.minor) - cash) < 100) {
        const others = [...new Set(heldRates.rates.flatMap((r) => [r.currency, r.base]))].filter((c) => c && c.toUpperCase() !== home.toUpperCase()).sort();
        const told = others
          .map((c) => approxOf(Number(f.minor), home, c, heldRates.rates, recordToday()))
          .map((x) => (x ? moneyWhole(x.minor, x.currency, home)?.text : null))
          .filter((t): t is string => !!t);
        return told.length > 0 ? `≈ ${told.join(' · ')}` : null;
      }
      const at = approxOf(Number(f.minor), f.currency, home, heldRates.rates, recordToday());
      const said = at ? moneyWhole(at.minor, at.currency, home)?.text : null;
      return said ? `≈ ${said}` : null;
    },
    /* MONEY'S CHIPS: a bar of categories and a ledger line wear the category's glyph and colour, a bar of accounts the
       account's (`$lib/money/looks.svelte.ts`). Read off the block's own source, so a bar of anything else draws plain. */
    partLook: (label: string) => {
      const s = typeof (block as { source?: unknown }).source === 'string' ? (block as { source: string }).source : '';
      if (block.kind === 'timeline') return /transactions/u.test(s) ? moneyLooks.category(label) : null;
      const heading = typeof block.heading === 'string' ? block.heading : '';
      if (/categor|spent|where-it-went|budget/u.test(s) || (/categor/iu.test(heading) && !/who/iu.test(heading))) return moneyLooks.category(label);
      if (/account/u.test(s)) return moneyLooks.account(label);
      if (/paid most|how often|payee|who was paid/iu.test(heading)) return moneyLooks.payee(label);
      return null;
    },
    /* WHO WAS PAID, AS THEIR LOGO (People 4.8.0, the payee logos Cash Fish shows): a ledger line's payee among the
       organisations that keep a logo, by name or by the bank line each was met by (`$lib/picture/pictures.svelte.ts`). */
    logo: (payee: string) => {
      if (block.kind !== 'timeline' || !/transactions/u.test(typeof (block as { source?: unknown }).source === 'string' ? (block as { source: string }).source : '')) return null;
      wantLogos();
      const sha = logoOf(payee);
      return sha === null ? null : pictureSrc(sha);
    },
    /* A forecast's knobs and its readout: arithmetic over the walk already on the page, kept in memory. */
    scenario: true,
    /* AND A LENGTH PAST THE WALK'S REACH, which the record is asked to walk (`walkFor`). */
    ...(walk ? { walk: walkFor } : {}),
    /* EVERY LINK THE RENDERER DRAWS, under the app: the record writes `/decide`, and the tab is on `/<slug>`. */
    href: inApp,
    /* `{{ref:tasks#241}}` IS A LINK TO THAT ROW: its own page where its list made one, else its screen (`row-href.ts`).
       Record-relative, and `href` above puts it under the app. */
    link: rowHref,
    /* AND IT IS SAID BY ITS ROW'S NAME (31 October, AG21), where the record named it or this tab has read its list:
       "Tracked as #3" stood in Kiln's note where the task's name belonged. */
    refName: (spoken: string) => {
      const m = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u.exec(spoken);
      if (!m) return null;
      const known = (block as { names?: ReadonlyMap<string, string> }).names?.get(spoken);
      return known ?? TITLES.get(m[1]!)?.get(Number(m[2])) ?? null;
    },
    /* `{{date:2026-11-03}}` IS A LINK TO THAT DAY ON THE CALENDAR, on a record whose pages hold one (`day-href.ts`);
       on any other the renderer is answered `null` and draws the date plain. */
    dayHref: (iso: string) => dayHref((route.data as unknown as Partial<Shell>).pages, iso),
    /* A HOLE IS A BUTTON only where something answers the press. */
    ...(writes ? { hole: (path: string | null) => holes?.press(path) } : {}),
    icon,
    iconSet: glyphSet,
    /* A BLOCK LEFT WITH NOTHING IS NOT DRAWN (`emptied`), unless its author wrote `empty: keep`: a ledger wants its
       noughts. The lead's own `empty:` line stays the page's (`home.ts`), so no other line is handed down here. */
    empty: () => (block.empty === EMPTY_KEEP ? EMPTY_KEEP : null),
    /* AN AGENT'S MARK, ON A CARD'S OR A FEED ROW'S FACE: the maker's drawing for the name a cell gives (`Claude`,
       `Cursor`), from the same set the app's faces draw, or nothing, and the renderer keeps the initial. */
    agentMark: (name: string) => {
      const k = agentKindOf(name);
      return isMarked(k) ? AGENT_MARKS[k] : null;
    },
    /* A FIGURE IS A DOOR, and the address is the metric's own: `hrefFor` derives it from the same predicate the figure
       is computed over, so a tile and the list it opens cannot disagree. */
    cellHref: (n: number) => block.metrics?.[n]?.href ?? null,
    /* WHERE A ROW APPLIES, AS A CHIP, in a card grid's scope facts (`page-live.ts` `scopeCells`). */
    ...(block.scopeCells ? { scope: block.scopeCells } : {}),
    /* A CARD'S LINE A PERSON TYPES ON, where the page can write its list: absent, every line is text. */
    ...(cardWriter ? { write: drawnWrite(cardWriter), edits: cardEdits } : {}),
    /* A RUN'S FACE, ON A CARD OF RUNS: the run and whether it is working, gone quiet or stopped, so
       `Cards.svelte` draws the run's glyph in the `who` cell instead of a plain initial. */
    ...((block.source === 'sessions.live' || block.source === 'sessions.working') && block.entries
      ? { runs: block.entries.map((e, n) => ({ run: `S${e.seq}`, agent: typeof e.fields.agent === 'string' ? e.fields.agent : null, live: liveOf(e.fields.state, block.quiet?.[n] === true), presence: block.presence?.[n] })) }
      : block.runFaces
        ? /* AND ON A CARD WHOSE `who` THE BLOCK ANSWERED AS A RUN (`page-live.ts` `runFaces`): what a project runs on. */
          { runs: block.runFaces }
        : {}),
    /* AND EACH RUN'S HELPERS, beside a block of runs at work (`sessions.working`), so its card says "9 helpers". */
    ...(block.source === 'sessions.working' && block.helpers ? { helpers: block.helpers } : {}),
    /* A PICTURE IS SERVED BY THE RECORD THE PAGE IS ON: a gallery tile's or a card's file, found in what the
       block already holds (`fileAt`) and placed under this record's address. A file the block does not hold answers
       nothing, and the tile draws its caption. */
    file: (row: string, field: string) => {
      const path = filed(row, field);
      return path === null ? null : inApp(path);
    },
  });

  /**
   * WHERE THE BLOCK'S ROWS LIVE, at the block's own predicate.
   *
   * The provenance link and the `o` key both went to `/r/<register>` bare, so a block printing a filter directly above
   * the link sent the reader to every row of the list: shown a filter, told the list is a slice, and handed a door to a
   * different set of rows. `registerHref` returns the bare list when it could not read the predicate, which is the
   * honest answer: a URL narrowed by the half of a sentence that parsed is a list that looks filtered and is not.
   */
  const openHref = (b: { register?: string | undefined; where?: string | undefined }): string | null =>
    b.register ? registerHref(b.register, b.where) : null;

  /** How many days a forecast's walk ran: as far as it reached, else the length it opened on, else the block's. */
  const walkedDays = (b: LiveBlock): number =>
    typeof b.walk?.reach === 'number' ? b.walk.reach : typeof b.walk?.horizon === 'number' ? b.walk.horizon : typeof b.horizon === 'number' ? b.horizon : 180;

  /**
   * A LENGTH PICKED PAST HOW FAR THE WALK REACHES IS WALKED, not cut to it. The kernel walks two years at most unasked
   * (`WALK_UNASKED`), so five years on Cash ahead is asked for when somebody picks it: the page is read again walking
   * that far, and the chart stays as it is until the longer walk lands. A length the walk already reaches, or one the
   * block does not offer, asks nothing, since the record would only walk what it walked.
   */
  function walkFor(length: Walked) {
    if (!walk || (block.kind !== 'forecast' && block.source !== 'forecast.runway')) return;
    if (!(block.horizons ?? []).includes(length)) return;
    if (length !== 'last' && length <= walkedDays(block)) return;
    walk(length);
  }

  /**
   * The predicate a reader sees, MINUS the clause that names the page they are already on.
   *
   * "thing is Kiln" under a heading on the Kiln page is the one fact the reader cannot be missing, and the rest of the
   * predicate has to stay or a block of four rows reads as the whole list. A resolved page knows its own parameter, so
   * the comparison is exact. A SENTENCE JOINED BY `, or` IS SAID WHOLE: taking the page's subject out of an or-group
   * would leave a dangling "or" and read as a narrower filter than the block draws.
   */
  const whereOf = (b: { register?: string | undefined; where?: string | undefined }): string =>
    saidPlainly(
      b.register ?? '',
      joinsWithOr(b.where ?? '')
        ? (b.where ?? '')
        : (b.where ?? '')
            .split(',')
            .map((c) => c.trim())
            /* The page's own subject, in either spelling: by name through a `thing` ref, or by spoken id through an
               agent run's `project`. Printing either says the page's name back to it. */
            .filter(
              (c) =>
                c &&
                !(param && [`thing is ${param.title}`, `project is ${param.register}#${param.seq}`].some((s) => s.toLowerCase() === c.toLowerCase())),
            )
            .join(', '),
    );

  /**
   * WHETHER A FIELD OF AN `inputs` BLOCK MAY BE TYPED INTO, which is whether the reader may write its list.
   *
   * A READER WHO MAY ONLY READ WAS DRAWN INPUT BOXES: the boxes took every keystroke and each write
   * came back refused. The level is the record's, answered in `boot` and read through `may`, so a box is drawn only
   * where a write can land, and a reader who may not write sees the values as text.
   */
  const typable = $derived(
    writes !== null && block.kind === 'inputs' && may(route.data as unknown as Shell, 'write', block.register),
  );

  /**
   * THE NAME OF THE LIST A BLOCK'S ROWS LIVE IN, as the record calls it, or `null` where it is no list a person has.
   * A SOURCE THE RECORD ANSWERS ACROSS ITS LISTS (`deadlines`) IS NOT ONE, and it printed its id as the door's words and
   * opened a list that does not exist: it gets no door, and no "Open … for the rest".
   */
  const lists = $derived((route.data as unknown as Partial<Shell>).lists ?? []);
  const listNamed = (id: string | undefined): string | null =>
    id ? (REGISTERS[id]?.name ?? lists.find((l) => l.id === id)?.name ?? null) : null;
  /* NO DOOR TO A LIST OF ONE ROW, THE ONE THE PAGE IS ABOUT (audit 2 B17): an account's "About this account" opened with
     the bare word "Accounts", a door to a list filtered to that account, which "Show the data" already opens. */
  const source = $derived(/^\s*seq is (?:\d+|\{\{seq\}\})\s*$/u.test(block.where ?? '') ? null : listNamed(block.register));

  /* The panel the host draws under this block, by the name the section gives it (`panel-of.ts`). */
  const panel = $derived(panelOf(block));
  /* WHETHER THE READER OWNS THE RECORD, as the shell says it (`me.owner`), the flag the block's own menu reads too. */
  const owns = $derived((route.data as { me?: { owner?: unknown } }).me?.owner === true);
  /* WHO A BOARD WIDGET'S PICTURES ARE KEPT FOR: the person the shell names, on this BrainDog (`drawn-pictures.ts`). */
  const drawnWhose = $derived(whoseOf(apiBase(), (route.data as { me?: { person?: unknown } }).me?.person as string | null | undefined));
  /* A PANEL ABOUT THE RECORD AND NO ROW (`needs: none`, the look editor, the model Slash uses) stands under its section
     on any page, for the people its level names: anyone for `read`, a page that writes for `write`, the owner alone for
     `owner`. Never while arranging, since a panel is not a block to move. */
  const hosted = $derived(
    panel !== null &&
      PANEL_WHO[panel].needs === 'none' &&
      !arranging &&
      (PANEL_WHO[panel].level === 'read' || (PANEL_WHO[panel].level === 'write' ? writes !== null : owns))
      ? panel
      : null,
  );
  /* WHERE IT WAS SEEN SAYS WHETHER IT DREW (`Seen.svelte` `ondrew`): false on a refusal or an answer that is not one thing. Its section is a heading over the panel, so it is then left out rather than a heading over nothing. */
  let seenDrew = $state<boolean | null>(null);

  /* WHAT THE BLOCK'S LIST HOLDS, when it holds nothing yet. 19 §6 names five empty states and says collapsing them into
     one is the failure; a filter that matched nothing and a list with nothing in it are different facts, and the
     second is the one somebody can act on. The list's size is known only when the block reads all of it. */
  const held = $derived(block.register && !block.where ? REGISTERS[block.register] : undefined);
  const emptied = $derived(
    held
        ? {
            rows: block.total,
            name: held.name,
            ...(held.holds ? { holds: held.holds } : {}),
            /* WHERE THE FIRST ROW WOULD GO, and `19 §6` says the action for this state is **Add one** rather than "go
               and look". `?new=1` opens the list's own create form. The block's own filter is deliberately NOT
               carried: the list is empty, and narrowing an empty list is the last thing anybody needs. NOT ON AN
               AGENT'S RUNS, which an agent starts and a person does not type in. */
            ...(block.register === 'session' ? {} : { add: { href: `/r/${block.register}?new=1`, label: voiceSaid('add_first') } }),
          }
        : undefined,
  );
  const drawn = $derived(draw(block, emptied));

  /* A DRAWN BLOCK'S COMPONENT, its rows and the height it starts at (`kinds/drawn.ts`), drawn in its sandbox by
     `DrawnFrame.svelte`, which arrives with the first block that needs it. Opening one of its rows goes where a row's
     link goes, and only for a row the frame was handed (`drawnAsk`). */
  const sketch = $derived(drawnOf(block, (id) => listNamed(id)));
  /* A CHART WITH NO "…" OF ITS OWN STANDS FOR THE LIST IT READS, and a bar on a grouped figure for the row it is the bar of. */
  const barRows = $derived(((block as FiguredBlock).parts?.groups?.length ?? 0) > 0);
  const chartThing = $derived.by(() => {
    /* TODAY'S MONEY TILES STAND FOR MONEY: a right-click on Cash ahead's figure got WebKit's Look Up and Translate. */
    if (!menuOn && (block.key === 'cash' || block.key === 'week-money')) return '/p/money';
    if (menuOn || !(block.kind === 'lines' || barRows)) return null;
    const list = listOfBlock(block as FiguredBlock);
    return list ? `/r/${list}` : null;
  });
  let barAt = $state.raw<MenuAt | null>(null);
  let barHref = $state<string | null>(null);
  let barName = $state('');
  const barHost = ownMenu((p) => {
    const label = document.elementFromPoint(p.x, p.y)?.closest('.prop-row')?.querySelector('.prop-label')?.textContent?.trim() ?? '';
    void (label ? partRow(block as FiguredBlock, label).catch(() => null) : Promise.resolve(null)).then((href) => {
      barName = label;
      barHref = href ?? chartThing ?? (menuOn ? null : `/r/${listOfBlock(block as FiguredBlock) ?? ''}`);
      if (barHref) barAt = p;
    });
  });

  function openDrawn(ref: string) {
    const to = rowHref(ref);
    if (to !== null) void goto(inApp(to));
  }
  /* AND A ROW ITS VIEW ADDS OR CHANGES (add-ons phase 4), on a page that writes and is not being arranged: the record
     checks it against this block's own `acts:` by its declared index and writes it as the reader, then the page is
     read again so the new row shows. A board's widget and a preview write nothing. */
  const drawnActs = $derived(writes !== null && !arranging && widget === null && menuSlug !== null ? menuSlug : null);
  async function actDrawn(act: DrawnAct): Promise<unknown> {
    if (drawnActs === null) return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This view cannot write here.' } };
    const { createClient } = await import('@braindog/client');
    const got = await createClient({ base: apiBase() }).drawnAct({ page: drawnActs, block: i, ...('create' in act ? { create: act.create } : { update: act.update }) });
    /* THE PAGE'S OWN READ AGAIN (`writes.reread`), as a capture does: `invalidateAll` reran the load, and the page's blocks
       are read by the live reader, so a table beside the view kept its rows until the next visit. */
    if ((got as { ok?: boolean }).ok) await (writes !== null ? writes.reread() : invalidateAll());
    return got;
  }

  /* THE TILE'S HEADING ROW, THE SAME ON EVERY TILE: its glyph, or its kind's where it names none, and
     how many it holds where it is a list a person counts (`tile-head.ts`). */
  /* A `kpis` BLOCK'S KEY NUMBERS, as the drawer takes them. */
  const kpis = $derived(block.kind === KPIS_KIND ? kpisIn(block as { kpis?: unknown }) : []);
  const glyph = $derived(headIcon(block.kind, block.icon, isGlyph));
  /* A BLOCK MAY SAY A HEAD COUNT OF ITS OWN (`counted`): Today's Needs you counts an agent's question with its rows. */
  const counted = $derived((block as { counted?: number }).counted ?? block.total);

  /* HOME'S OWN LIST, where Home drew the block as one (`home/home-rows.ts`): what is late as one list, what comes up by
     day. THE HEADING'S WELL IS NEUTRAL on every tile: a heading names a group, and a group is not late or good;
     the rows that are late say so in their own red. */
  const homeRows = $derived((block as WithRows).homeRows);
  const homeFold = $derived(homeRows && fold ? foldOf('todo', linesIn(homeRows), open) : null);

  /**
   * WHERE "N MORE" UNDER HOME'S LATE LIST OPENS: the half that was cut, each half its own door.
   *
   * The joined list is drawn on the tasks' block with the count of both (`default-home.ts` `lateTile`), so its door went
   * to Tasks whichever half ran past its limit: seven bills more, and a press that opened a list with none of them. It
   * was then guessed from the tasks' limit, which a task drawn in a block above or ticked since made wrong. The list
   * says each half's own count now (`home-rows.ts` `LateMore`), so nothing is guessed: tasks cut open the tasks at the
   * block's own filter, money cut opens the money, and both cut are two doors, each named by its list.
   *
   * THE MONEY OPENS FILTERED TO WHAT IS LATE where its list's address can say that (`lateWhere`), since "7 more" under
   * Late that opened every bill ever kept was a door to somewhere else. It is read across lists, so it has a door only
   * where every money line shown lives in one list; from several there is no one door, said by drawing none. `null` is
   * every other block, whose door is its own.
   */
  const lateSlice = $derived.by(() => {
    const doors = lateDoors(homeRows);
    if (!doors || doors.length === 0 || homeRows?.kind !== 'late') return null;
    const list = moneyListOf(homeRows.lines);
    const named = list ? listNamed(list) : null;
    const own = openHref(block);
    return doors.map((d) => {
      const name = d.half === 'todo' ? source : named;
      const href = d.half === 'todo' ? (own && source ? own : null) : list && named ? registerHref(list, lateWhere(REGISTERS[list])) : null;
      return { half: d.half, href, said: doors.length > 1 && name ? lateWords.moreIn(d.more, name) : words.more(d.more) };
    });
  });

  /* WHAT THE PAGE HOLDS TICKED on Home's late list, so a refusal or an Undo takes the tick back (`heldDone`). */
  const homeDone = $derived(writes && homeRows?.kind === 'late' && block.register ? writes.heldDone(i, block.register) : undefined);

  /** Ticks the task numbered `seq` done, through the row the renderer would have drawn for it. */
  function tickAt(seq: number) {
    const w = writes;
    const seg = drawn.segments.find((s) => s.type === 'block');
    if (!w || seg?.type !== 'block') return;
    const row = seg.rows.find((r) => r.ref?.seq === seq);
    if (row) w.tickTask(block, row, true, i, seg.rows);
  }

  /* ── a folded group, opened in place ───────────────────────────────────────
     A CARD BLOCK IN GROUPS FOLDS EACH LONG GROUP behind "Show all 4 people at Brightwell" (`blocks.ts` `groupedSegments`),
     which went to the organisation's page. It opens here instead (`group-open.ts`): the block drawn a second time with
     nothing folded, and the groups pressed taken from that drawing. The organisation's name over a group is still the
     door to its page. NOT ON A BLOCK THAT IS A SLICE of its list, whose groups hold only the cards it was sent: there the
     line still opens the organisation's page, where they all are. */
  let groupsOpen = $state.raw<ReadonlySet<string>>(new Set());
  const grouped = $derived(
    block.kind === 'cards' && block.group && block.fold && block.total <= block.shown && !drawn.refusal
      ? openInPlace(drawn.segments, draw({ ...block, fold: false }, emptied).segments, groupsOpen)
      : null,
  );
  /* ── a wall of charts, folded ──────────────────────────────────────────────
     A BLOCK OF LINES SHOWS ITS FIRST ROW OF CHARTS AND FOLDS THE REST IN PLACE, the measures reported once with them, one
     press away: a project's Numbers was twelve near-identical charts over a list of
     seventeen readings, 4,032px of page, with the news at the top and its money seventeenth. Nothing is cut; the press
     says how many more there are, and once open it stays open. Numbers that stopped arriving are tiles that say their
     age (`staleTilesText`), four of them before the fold. A block with two charts or four tiles or fewer, and a list of
     four readings or fewer, is drawn whole. */
  const LINES_SHOWN = 2;
  const TILES_SHOWN = 4;
  const ONCE_SHOWN = 4;
  const linesFold = $derived.by(() => {
    if (block.kind !== 'lines' || open || grouped) return null;
    const rowsOf = (kind: string) => drawn.segments.reduce((n, s) => n + (s.type === 'block' && s.kind === kind ? s.rows.length : 0), 0);
    const charts = drawn.segments.filter((s) => s.type === 'block' && s.kind === 'lines').length;
    const tiles = rowsOf('stat');
    const once = rowsOf('spec');
    const cut = charts > LINES_SHOWN || tiles > TILES_SHOWN;
    const onceShown = cut ? 0 : Math.min(once, ONCE_SHOWN);
    const hidden = Math.max(0, charts - LINES_SHOWN) + Math.max(0, tiles - TILES_SHOWN) + (once - onceShown);
    return hidden > 0 ? { charts: LINES_SHOWN, tiles: TILES_SHOWN, once: onceShown, more: hidden } : null;
  });
  const linesShown = (segments: typeof drawn.segments): typeof drawn.segments => {
    const fold = linesFold;
    if (!fold) return segments;
    let charts = 0;
    const left = { stat: fold.tiles, spec: fold.once };
    return segments.flatMap((s): (typeof drawn.segments)[number][] => {
      if (s.type !== 'block') return [s];
      if (s.kind === 'lines') return ++charts <= fold.charts ? [s] : [];
      if (s.kind !== 'stat' && s.kind !== 'spec') return [s];
      const room = left[s.kind];
      left[s.kind] = Math.max(0, room - s.rows.length);
      return room > 0 ? [{ ...s, rows: s.rows.slice(0, room) }] : [];
    });
  };
  const drawing = $derived<Opening<(typeof drawn.segments)[number]>[]>(grouped ?? linesShown(drawn.segments).map((segment) => ({ kind: 'segment', segment })));
  /* ── projects as cards ─────────────────────────────────────────────────────
     A CARDS BLOCK OVER THE PROJECTS LIST IS DRAWN AS THE ONE PROJECT CARD (`ui/ProjectCard.svelte`), the card Today's desk
     draws (the plan of 20 October: one card everywhere). The list is found by what it declares (`scopes`), never by its
     name; the block's own rows, order and limit stand, and its line is read off its drawing (`trendsOf`). Not a block in
     groups, which draws its groups' heads. */
  /* ── the desk's own tiles ───────────────────────────────────────────────
     A BLOCK OF TODAY'S BODY THAT THE DESK DRAWS AS ITS OWN TILE (`home/desk-part.ts`): what is late with a button a
     line, who is working, and the projects' row of cards, each the desk's component over the block's own answer. The
     block's bar is kept for a screen reader, as a lead question's is, since the tile says its own name. */
  const desk = $derived((block as { desk?: Desk }).desk ?? null);
  /* ── a row of a project's shape ──────────────────────────────────────────
     A `project` BLOCK IS A ROW OF THE PROJECT'S OWN SHAPE (`ProjectPart.svelte`): its hero, path, money, work,
     people, what it runs on or its agents, drawn from the one read of the project the page holds (`shape-key.ts`). Its
     bar is kept for a screen reader, as the desk's is, since each part's tile says its own name. */
  const parts = $derived(partsOf(block));
  const shapeBox = getContext<ShapeBox | undefined>(SHAPE_KEY);
  /* A PHONE SHOWS THREE LATE LINES AT REST, a desk four. */
  const phone = new MediaQuery('(width < 600px)', false);

  /* HOW MUCH OF EACH CARD'S WORK IS LATE, read as its page reads it (`card-late.ts`), again when the record moves. */
  let lates = $state.raw<ReadonlyMap<number, number>>(new Map());
  /* A BLOCK THAT GROUPS THE PROJECTS BY THEIR LANE IS STILL THE ONE CARD, in a section for each lane (`laneGroups`); only a
     grouping by something else keeps the grouped drawing. */
  const byLane = (d: { state?: string | undefined } | undefined): boolean => !block.group || (d !== undefined && block.group === d.state);
  const cardSeqs = $derived.by(() => {
    const list = block.register;
    const d = list ? REGISTERS[list] : undefined;
    if (block.kind !== 'cards' || !byLane(d) || !list || !d || !isProject(d)) return '';
    const seqs = (block.entries ?? []).flatMap((e) => (typeof e.seq === 'number' ? [e.seq] : []));
    return seqs.length > 0 ? `${list}:${seqs.join(',')}` : '';
  });
  $effect(() => {
    const said = cardSeqs;
    void liveRecord.version;
    /* THE DESK'S CARDS READ THEIR OWN (`ProjectCards.svelte`). */
    if (said === '' || desk !== null) return;
    untrack(() => {
      const [list, seqs] = said.split(':') as [string, string];
      void import('$lib/home/card-late.ts')
        .then((m) => m.latesOf(apiBase(), list, seqs.split(',').map(Number)))
        .then((got) => {
          if (said === cardSeqs) lates = got;
        })
        .catch(() => {});
    });
  });
  /* WHO WORKED ON EACH LAST, from the runs (`card-life.ts`), for each card's live line, again when the record moves. */
  let lasts = $state.raw<ReadonlyMap<number, { agent: string; name: string; said: string }>>(new Map());
  /* AND THE DAY EACH ROW LAST CHANGED, which a block's rows do not carry: what a card with nothing else is quiet since. */
  let moved = $state.raw<ReadonlyMap<number, string>>(new Map());
  $effect(() => {
    const said = cardSeqs;
    void liveRecord.version;
    if (said === '' || desk !== null) return;
    untrack(() => {
      const list = said.split(':')[0]!;
      const title = REGISTERS[list]?.title ?? 'name';
      const named = (block.entries ?? []).flatMap((e) =>
        typeof e.seq === 'number' && typeof e.fields === 'object' && e.fields !== null
          ? [{ seq: e.seq, id: typeof (e as { id?: unknown }).id === 'string' ? (e as { id: string }).id : null, name: String((e.fields as Record<string, unknown>)[title] ?? '').trim() }]
          : [],
      );
      void import('$lib/home/card-life.ts')
        .then((m) => Promise.all([m.readLastRuns(apiBase(), list, named), m.readMoved(apiBase(), list)]))
        .then(([got, days]) => {
          if (said !== cardSeqs) return;
          lasts = got;
          moved = days;
        })
        .catch(() => {});
    });
  });
  /* THE KEY NUMBER EACH CARD LEADS WITH (`card-kpis.ts`), read beside the cards and again when the record moves; a card
     whose project keeps none says what it did. */
  let leads = $state.raw<readonly KpiAnswered[]>([]);
  $effect(() => {
    const said = cardSeqs;
    void liveRecord.version;
    if (said === '') return;
    untrack(() => {
      void import('$lib/home/card-kpis.ts')
        .then((m) => m.readLeads(apiBase()))
        .then((got) => {
          if (said === cardSeqs) leads = got;
        })
        .catch(() => {});
    });
  });
  const projectCards = $derived.by(() => {
    const list = block.register;
    const d = list ? REGISTERS[list] : undefined;
    if (desk !== null || block.kind !== 'cards' || !byLane(d) || drawn.refusal || !list || !d || !isProject(d)) return null;
    const rows = (block.entries ?? []).flatMap((e) =>
      typeof e.seq === 'number' && typeof e.fields === 'object' && e.fields !== null ? [{ seq: e.seq, fields: e.fields, ...(typeof (e as { id?: unknown }).id === 'string' ? { id: (e as { id: string }).id } : {}) }] : [],
    );
    const { cards: plain } = cardsOf({ ...(d as unknown as CardDecl), id: list }, rows, rows.length, true, true);
    if (plain.length === 0) return null;
    /* WHO WORKED ON EACH LAST AND WHEN, BY THE RECORD'S ONE FIGURE where the block read it (Z7 of 25 October), the time
       Today's cards say; the runs read beside the cards only where it read none. */
    const cards = withWorked(withKpis(plain, leads, { home: homeCurrency(), now }), block.entries, block.lastWorked, now);
    const seg = drawn.segments.find((x) => x.type === 'block' && x.kind === 'cards');
    const trends = seg && seg.type === 'block' ? trendsOf(seg.rows) : new Map();
    const facts = seg && seg.type === 'block' ? cardFactsOf(seg.rows) : new Map();
    const working = workingNow();
    return cards.map((c) => {
      const f = c.figure ? fieldDecl(list, c.figure.field) : undefined;
      const said = facts.get(c.seq);
      return { card: { ...c, late: lates.get(c.seq) ?? said?.late ?? 0, worked: c.told ? (c.worked ?? null) : (said?.worked ?? null), last: c.told ? (c.last ?? null) : (lasts.get(c.seq) ?? null), moved: moved.get(c.seq) ?? null }, label: f ? labelOf(f) : '', trend: trends.get(c.seq) ?? null, agents: agentsOn(c.name, working) };
    });
  });
  /* AND PROJECT CARDS ON A BOARD, which wear the tile's heading there: a one-row frame shows one card, and the count says
     how many it holds. */
  const count = $derived(
    headCount({ kind: block.kind, total: counted, refused: !!drawn.refusal || block.cannot !== undefined, key: typeof block.key === 'string' ? block.key : undefined }) ??
      (widget !== null && projectCards && Number.isInteger(counted) && counted > 0 ? counted : null),
  );
  /* THE PROJECTS PAGE'S BOARD (`ProjectsBoard.svelte`): a cards block over the projects list keyed `board` is drawn as
     the one board, its headline, its money, its week, its list and its parked, in place of a grid of cards. */
  const board = $derived(block.key === 'board' && projectCards !== null && !arranging ? (block.register ?? null) : null);
  /* THE DESK'S ROW OF CARDS, by the desk's own rule (`deskCards`), each leading with its project's key number. */
  const deskProjects = $derived.by(() => {
    if (desk?.kind !== 'projects') return null;
    const got = deskCards(block, now);
    return got ? { cards: withKpis(got.cards, leads, { home: homeCurrency(), now }), more: got.more } : null;
  });
  $effect(() => {
    if (deskProjects) knowProjects(apiBase(), deskProjects.cards);
  });
  /* EACH CARD'S PAGE CAN NOW OPEN IN ITS PROJECT'S OWN SHAPE (`known-project.ts`). */
  $effect(() => {
    if (projectCards) knowProjects(apiBase(), projectCards.map((x) => x.card));
  });

  /* ── the lane bar ──────────────────────────────────────────────────────────
     THE CARDS' OWN HEADING IS A SEGMENTED LANE BAR (proj F5): "In play 3", then each lane the cards hold with its count,
     Parked last. In play is every lane but parked; a lane shows its own. The block's heading stays, for a screen reader. */
  let lane = $state('play');
  const LANE_ORDER = ['earning', 'building', 'parked'];
  const lanes = $derived.by(() => {
    if (!projectCards || block.group) return [];
    /* ONLY OVER EVERY PROJECT (live check of 30 October, 6): a tile drawing 4 of 18 counted its lanes over the 4, "In play
       4 · Earning 1 · Building 3" beside "Projects 18". Where the block holds fewer than it counts, it draws no lane bar,
       and its "N more" says the rest. */
    const total = (block as { counted?: number }).counted ?? block.total;
    if (typeof total === 'number' && total > projectCards.length) return [];
    const list = block.register ? REGISTERS[block.register] : undefined;
    const state = list?.state ? list.fields.find((x) => x.id === list.state) : undefined;
    const counts = new Map<string, number>();
    for (const p of projectCards) counts.set(p.card.lane, (counts.get(p.card.lane) ?? 0) + 1);
    const inPlay = projectCards.filter((p) => p.card.lane !== 'parked').length;
    const named = [...counts.keys()].sort((a, b) => (LANE_ORDER.indexOf(a) + 1 || 9) - (LANE_ORDER.indexOf(b) + 1 || 9));
    return [
      { id: 'play', label: 'In play', count: inPlay },
      ...named.map((id) => ({ id, label: state ? valueSaid(state as Parameters<typeof valueSaid>[0], id) : id, count: counts.get(id) ?? 0 })),
    ];
  });
  /* A CARD COMING INTO A LANE rises into place on the spring (`arrive`, the record forming); one leaving sinks and fades
     (`depart`), and the cards beside them slide on the same spring (`springy`). */
  const cardIn = arrive;
  const cardOut = depart;
  /* THE LANE DRAWN: the one chosen while it holds a card, else the first that does, so nothing in play shows the parked. */
  const shownLane = $derived(lanes.some((l) => l.id === lane && l.count > 0) ? lane : (lanes.find((l) => l.count > 0)?.id ?? 'play'));
  /* IN SECTIONS, WHEN THE BLOCK GROUPS BY LANE: each lane that holds a card, earning and building first, its head saying
     how many ("Earning · 3 projects"), the parked last. Nothing is moved: a card stays in the lane its record holds. */
  const laneGroups = $derived.by(() => {
    if (!projectCards || !block.group) return [];
    const list = block.register ? REGISTERS[block.register] : undefined;
    const state = list?.state ? list.fields.find((x) => x.id === list.state) : undefined;
    const ids = [...new Set(projectCards.map((p) => p.card.lane))].sort((a, b) => (LANE_ORDER.indexOf(a) + 1 || 9) - (LANE_ORDER.indexOf(b) + 1 || 9));
    return ids.map((id) => {
      const cards = projectCards.filter((p) => p.card.lane === id);
      const name = id === '' ? '' : state ? valueSaid(state as Parameters<typeof valueSaid>[0], id) : id;
      return { id, name, cards, said: seenWords.count(cards.length, 'project', 'projects') };
    });
  });
  const laneCards = $derived(projectCards ? projectCards.filter((p) => (shownLane === 'play' ? p.card.lane !== 'parked' : p.card.lane === shownLane)) : []);

  /* WHETHER THE BLOCK IS DRAWN AS MORE THAN ONE RUN OF ROWS. Such a block is read run by run: each run is handed its
     place, and a row is marked as arrived only when no other run of the block held it (`marked` in `page-writes.ts`).
     A BLOCK WHOSE GROUPS OPEN IN PLACE STILL MARKS NONE: the cards a press unfolds are new to their run and were in no
     other, so by place they would read as arrived on every unfold. */
  const several = $derived(drawing.filter((item) => item.kind === 'segment' && item.segment.type === 'block').length > 1);
  const runAt = (run: number): boolean | number => (several ? (grouped ? true : run) : false);

  /**
   * A TABLE ROW'S MENU WHERE IT IS RIGHT-CLICKED OR HELD: the page's row menu for the record row it opens, which the
   * row's own address names (a row read across lists opens the row it stands for). `false` for a row that opens none.
   */
  const tableMenu =
    (rows: readonly { key: string; href?: string | null | undefined }[]) =>
    (key: string, point: { x: number; y: number; height: number }): boolean => {
      const href = rows.find((r) => r.key === key)?.href;
      const ref = href ? refOfHref(href) : null;
      if (!ref || !verbs) return false;
      const at = ref.indexOf('#');
      /* The menu reads the row by its list and number; what it writes reads the version the page holds. */
      const row: Row = { cells: [], ref: { register: ref.slice(0, at), seq: Number(ref.slice(at + 1)), version: 0 } };
      return verbs.onmenu(row, document.body, point);
    };

  /**
   * WHAT A TABLE'S ROW MAY HAVE PRESSED ON IT (`row_actions`, polish-i PI4), drawn in its last column and handed to the
   * page's one `act` with the record row its key names (`register#seq`), at the version the page read: Subscriptions'
   * "Mark as a subscription" on each repeating payment, one write a row with its Undo. Only where the page can write.
   */
  const tableActions = $derived.by(() => {
    const said = (block as { row_actions?: unknown }).row_actions;
    return writes && Array.isArray(said) && said.length > 0 ? (said as readonly unknown[]) : undefined;
  });
  const tableAct = (action: Parameters<Writes['act']>[0], row?: unknown, value?: unknown): unknown => {
    const key = row && typeof row === 'object' ? (row as { key?: unknown }).key : undefined;
    const at = typeof key === 'string' ? key.lastIndexOf('#') : -1;
    const seq = typeof key === 'string' && at > 0 ? Number(key.slice(at + 1)) : NaN;
    const register = typeof key === 'string' && at > 0 ? key.slice(0, at) : '';
    const ref = register !== '' && Number.isInteger(seq) ? { register, seq, version: block.entries.find((e) => e.seq === seq)?.version ?? 0 } : null;
    return writes?.act(action, ref ? { ...(row as object), ref } : row, value, { block, at: i, before: [] });
  };
</script>

{#if block.heading}
  <!-- A PAGE'S LEAD QUESTION HAS NO VISIBLE BAR outside arranging: the question is the heading a reader sees, and the bar
       ("Waiting on you") is kept for a screen reader, clipped, not removed, so the region keeps its name in the
       heading list. While arranging it shows, since that is the label a block is moved by. -->
  <!-- A PART THAT DRAWS ITS OWN TITLED TILE (the desk's, the projects' cards, a project's parts) names the region here and
       is not a second heading: a screen reader heard a hidden "Late 7" beside the tile's "Late and urgent 6" (audit Q11). -->
  <!-- ON A BOARD, PROJECT CARDS WEAR THE TILE'S HEADING (1 Nov): their lane bar is no name, and a one-row frame hides it,
       so Maya's "Projects in play" stood with no heading at all. The lanes stay under it where the frame has room. -->
  {@const titled = !arranging && ((projectCards && (board || (lanes.length > 1 && widget === null))) || desk !== null || parts !== null)}
  <header class="block-bar" data-quiet={(block.kind === 'queue' && (block as { lead?: unknown }).lead === true && !arranging) || titled ? '' : undefined}>
    <!-- THE TILE'S HEADING ROW: the block's own glyph in its well when it declares one, the name, and the door to where
         its rows live at the right. AN AUTHORED HEADING IS READ AS TEXT, so `{{icon:rocket}} shipped` draws the rocket
         rather than its braces. -->
    {#if glyph && isGlyph(glyph)}<IconWell name={glyph} />{/if}
    <!-- THE HERO'S BAR IS NO HEADING outside arranging (Q60 of 29 October): its "Overview" stood as an H2 before the
         project's own name, the page's H1. It still names the region. Nor is a titled part's (`titled`, Q11). -->
    <svelte:element this={parts?.includes('hero') && !arranging ? 'p' : titled ? 'span' : level === 3 ? 'h3' : 'h2'} class="block-name"
      ><span id="{ids}h-{i + 1}">{#if titled && typeof (desk as { heading?: unknown } | null)?.heading === 'string'}{(desk as { heading: string }).heading}{:else}<Text nodes={inline(block.heading, { icon })} opts={{ icon }} />{/if}</span>{#if count !== null && !titled}<span class="block-count num" data-needs-n={block.kind === 'queue' ? '' : undefined}><Figure value={count} /></span>{/if}</svelte:element
    >
    {#if source}
      <!-- THE LIST'S NAME, not its id, and A DOOR THAT WAITS FOR THE POINTER (secondary controls appear on
           hover or focus). "Tasks" at the top right of every tile on Work was chrome on every tile, said five times. The
           predicate stays, because without it a reader has no way to know the list is filtered and may take a block of
           four rows for the whole list; the clause that names the page they are on is dropped. AS A GLYPH, AND THE
           CLAUSE IS STILL THERE for the eye. A SCREEN READER HEARS WHERE THE LINK GOES, "Open these in Tasks", not the
           filter's own words, which read as code out loud (audit 2026-10-30, 31). -->
      <a class="block-source tap" href={inApp(openHref(block) ?? `/r/${block.register}`)} aria-label={whereOf(block) ? copy.openThese(source) : copy.openList(source)}>
        {source}
        {#if whereOf(block)}
          <!-- NO HIDDEN CLAUSE (live check of 30 October, 21): it was out of sight and out of the reader's hearing, so it
               reached nobody, and it held record words ("Filter seq is 3", "account is accounts#3"). The glyph says
               the list is narrowed, and the link's name says where it goes. -->
          <Icon name="filter" size="s" />
        {/if}
      </a>
    {/if}
    {#if menuOn && writes && menuSlug}
      {@const reread = writes.reread}
      {#await import('./BlockMenu.svelte') then { default: BlockMenu }}
        <BlockMenu block={block as LiveBlock & { key: string }} slug={menuSlug} name={headingText ?? ''} {reread} />
      {/await}
    {/if}
  </header>
{:else if block.kind !== 'note' && (block as { lead?: unknown }).lead !== true}
  <!-- A BLOCK WITH NO AUTHORED `heading:` DRAWS NO HEADING. It printed its kind's name, and where the kind had none its
       dialect id, so the lead question in Needs you sat under "queue" and Today's dates under "deadlines": the system's word
       where the page has nothing to say. The region still has a name, for a screen reader only, in the kind's words.
       NOT A HEADING (Q60 of the 29 Oct audit): an out-of-sight "Note" heading on every unnamed block filled a screen
       reader's list of headings with "Note, Figures, Note", so it is the name arranging labels the block by, and no more. -->
  <span class="block-unnamed" id="{ids}h-{i + 1}">{copy.kindNames[block.kind] ?? blockWords.kindNames[block.kind] ?? words.unnamed}</span>
{/if}

<!-- Never hidden and never centred: the page's shape is information, and a page that silently shrinks teaches that
     blocks come and go (19 §6). ONE surface for every kind, so "nothing matched" and "this block is broken" are told
     apart. -->
{#if parts !== null && !arranging && !block.refusals.length}
  <!-- THE ROW, its component fetched as the row is drawn, so a page that is no project's carries none of it. -->
  {#if shapeBox?.hold}
    {@const hold = shapeBox.hold}
    <!-- AT ONCE WHERE ITS CODE HAS LANDED (`part-landed.ts`), so the hero draws with the hold and moves nothing under it. -->
    {#await partLanded.part ?? import('./ProjectPart.svelte').then((m) => m.default) then ProjectPart}<ProjectPart {hold} {parts} />{/await}
  {/if}
{:else if desk && !arranging && !block.refusals.length}
  <!-- THE DESK'S OWN TILE, its component fetched as the tile is drawn, so a page that is not Today carries none of it. -->
  <div class="desk-part" data-desk={desk.kind}>
    {#if desk.kind === 'late'}
      <!-- AT ONCE WHERE ITS CODE HAS LANDED (`tile-landed.ts`), so it draws with the page and moves nothing under it. -->
      <!-- AND WHILE IT IS ON ITS WAY, ITS ROOM (`LateHold`, which Today puts in hand as it loads): the same tile and lines
           with nothing to press, so code that misses the reader's wait moves nothing under it (nojump, 2 Nov). -->
      {#await landed.late ?? import('$lib/home/LateNow.svelte').then((m) => m.default)}
        {#if landed.hold}{@const LateHold = landed.hold}<LateHold lines={desk.lines} heading={desk.heading} more={desk.more} most={phone.current ? Math.min(3, desk.most) : desk.most} writes={(list) => may(route.data as unknown as Shell, 'write', list)} />{/if}
      {:then LateNow}
        <LateNow lines={desk.lines} heading={desk.heading} more={desk.more} most={phone.current ? Math.min(3, desk.most) : desk.most} writes={(list) => may(route.data as unknown as Shell, 'write', list)} onfinished={() => void writes?.reread()} />
      {/await}
    {:else if desk.kind === 'working'}
      {#await landed.working ?? import('$lib/home/WorkingNow.svelte').then((m) => m.default) then WorkingNow}<WorkingNow rows={desk.rows} />{/await}
    {:else if desk.kind === 'projects' && deskProjects && block.register}
      {#await import('$lib/home/ProjectCards.svelte') then { default: ProjectCards }}
        <ProjectCards cards={deskProjects.cards} more={deskProjects.more} list={block.register} name={desk.name} working={workingNow()} />
      {/await}
    {/if}
  </div>
{:else if block.cannot}
  <p class="block-cannot">{block.cannot}</p>
{:else if block.actions?.length && !block.refusals.length}
  <!-- BY `import()`: only a project's page lends a section its actions, and `readHeld` (`panels.ts`) fetches this with them. -->
  {#await import('./panels/ActionRows.svelte') then { default: ActionRows }}<ActionRows rows={block.actions} {now} />{/await}
{:else if block.kind === KPIS_KIND && !block.refusals.length && (kpis.length > 0 || (writes !== null && param !== undefined && (block as { for?: unknown }).for === 'project'))}
  <!-- THE KEY NUMBERS ARE DRAWN FROM THE BLOCK'S `kpis`, not from rows (`kpis-in.ts`), and pressed to change one
       (`lib/kpis/KpisBlock.svelte`): Today's few as rows, a project's own as its tiles. A reader who may not write is
       taken to the number's project instead. A project's page that may add one draws its foot with none kept yet;
       anywhere else none kept is the empty state below. -->
  <KpisBlock {block} {kpis} {writes} {param} {now} href={(k) => {
    const to = kpiHref(k);
    return to === null ? null : inApp(to);
  }} />
{:else if sketch && !block.refusals.length}
  <!-- A DRAWN COMPONENT, in its sandbox: never in the page, and handed only its own rows and the theme. -->
  {#await import('./DrawnFrame.svelte') then { default: DrawnFrame }}<DrawnFrame code={sketch.code} data={sketch.data} start={sketch.start} title={headingText} onopen={openDrawn} onact={drawnActs === null ? null : actDrawn} size={widget} picture={widget !== null} whose={drawnWhose} />{/await}
{:else if drawn.refusal}
  {@const act = drawn.refusal.action}
  <Empty compact kind={drawn.refusal.kind} title={drawn.refusal.title} body={drawn.refusal.body} lines={drawn.refusal.lines} icon={drawn.refusal.authored ? icon : undefined}>
    {#snippet actions()}
      {#if act}<Button href={act.href}>{act.label}</Button>{/if}
    {/snippet}
  </Empty>
{:else if homeRows}
  <HomeRows rows={homeRows} shown={homeFold?.shown ?? Infinity} done={homeDone} ontick={writes && block.kind === 'todo' ? tickAt : undefined} />
  {#if homeFold}<button type="button" class="block-more tap" onclick={(e) => void unfold(e, homeFold?.shown ?? 0)}>{words.more(homeFold.more)}</button>{/if}
{:else if block.kind === 'table' && !block.answer && walkTables(block)}
  <!-- A TABLE OVER A WALK DRAWN ONCE PER CURRENCY: each currency's rows under its code, and why, once. -->
  {#each walkTables(block) ?? [] as part}
    {#each part.said as segment}{#if segment.type === 'markdown'}<div class="document"><Markdown {segment} {opts} /></div>{/if}{/each}
    {#if part.table}<Table columns={part.table.columns} rows={part.table.rows} total={part.table.total} label={headingText} href={inApp} home={homeCurrency()} {now} />{/if}
  {/each}
{:else if block.kind === 'table' && !block.answer}
  <!-- THE ROWS THAT ARRIVED SINCE IT WAS LAST DRAWN ARE MARKED, as a list's are, where the page can write. -->
  {@const all = writes ? writes.arrivedTable(i, block.rows, block) : block.rows}
  <!-- LEDGER LINES AS CARDS OR AS THE LEDGER (Money's account page, as Coin Fish's two views): a day at a time with each
       line's chip, or the grid with its running balance in a column. The choice is kept on this device. -->
  {@const linesPlan = /transactions/u.test(String((block as { source?: unknown }).source ?? '')) ? linesOf(block.columns) : null}
  {#if linesPlan}
    <div class="lines-view">
      <Segmented role="group" aria-label={words.linesView}>
        <button type="button" class="segment" data-on={moneyLooks.view === 'cards' ? '' : undefined} aria-pressed={moneyLooks.view === 'cards'} onclick={() => moneyLooks.choose('cards')}>{words.linesCards}</button>
        <button type="button" class="segment" data-on={moneyLooks.view === 'ledger' ? '' : undefined} aria-pressed={moneyLooks.view === 'ledger'} onclick={() => moneyLooks.choose('ledger')}>{words.linesLedger}</button>
      </Segmented>
    </div>
  {/if}
  {#if linesPlan && moneyLooks.view === 'cards'}
    <LedgerCards columns={block.columns} rows={folded ? all.slice(0, folded.shown) : all} plan={linesPlan} home={homeCurrency()} {now} />
  {:else}
  <!-- AND THE LEDGER VIEW SAYS WHO WAS PAID AS THE CARDS DO (`ledger-lines.ts`): words, not the bank's capitals. -->
  {@const shown = folded ? all.slice(0, folded.shown) : all}
  <Table columns={block.columns} rows={linesPlan ? linesSaid(shown, linesPlan.title) : shown} total={block.total} label={headingText} href={inApp} home={homeCurrency()} {now} scope={block.scopeCells} rowin={lineIn} rowout={dismiss} settle={springy} {icon} onmenu={writes && verbs ? tableMenu(all) : undefined} rowActions={tableActions} act={tableActions ? tableAct : undefined} />
  {/if}
  {#if folded}<button type="button" class="block-more tap" data-long={long && !fold ? '' : undefined} onclick={(e) => (fold ? void unfold(e, folded?.shown ?? 0) : longer(e, folded?.shown ?? 0))}>{fold ? words.more(folded.more) : longWords(folded.more)}</button>{/if}
{:else if block.kind === 'queue' && block.queue && block.queue.length > 0 && writes}
  <!-- A QUESTION IS ANSWERED WHERE IT IS SHOWN (`QueueAnswer.svelte`): one card a question, and the count of what is left is still the door to Decide. -->
  <!-- COMPACT, AT MOST THREE (`queue-answer.ts` `compactOf`): the question and its answers, and the rest a count on Decide. -->
  <!-- A COMPACT QUEUE THAT SAYS HOW MANY IT SHOWS (`most`, Today's Needs you on a phone) shows that many. -->
  <!-- A QUEUE COMPACT BY ITS OWN SAY (`compact: true`, Decide's queue under its lead) opens its rest in place, as a whole one does. -->
  {@const inPlace = (block as { compact?: unknown }).compact === true}
  {@const asked = compact && !inPlace ? compactOf(block.queue, block.total, typeof block.most === 'number' ? block.most : undefined) : { shown: block.queue, more: block.total - block.queue.length }}
  {@const every = compact ? asked.shown.map((q): QueueEntry => ({ kind: 'one', q })) : alikeOf(asked.shown)}
  <!-- A QUEUE THAT SAYS HOW MANY IT SHOWS (`most`, Needs you's groups) shows that many cards and opens the rest in place. -->
  {@const most = (!compact || inPlace) && typeof block.most === 'number' && !open && every.length > block.most ? block.most : null}
  {@const entries = most === null ? every : every.slice(0, most)}
  <!-- AN ANSWERED QUESTION LETS GO AND THE REST CLOSE THE GAP, and a new one rises into place (`listMotion`): its card
       sits in an `{#if}`, where a card's own `out:` never plays. -->
  <div class="queue" data-compact={compact ? '' : undefined} {@attach listMotion('.qa, .alike')}>
    <!-- THE LEAD QUESTION IS DRAWN WHOLE when the block says `lead:`, with what accepting it would put on the screen. -->
    <!-- QUESTIONS OF ONE CAUSE ARE ONE CARD outside a compact queue (`alike.ts`). -->
    {#each entries as entry, n (entry.kind === 'one' ? entry.q.id : entry.lead.id)}{#if entry.kind === 'many'}<AlikeCard lead={entry.lead} rest={entry.rest} onanswered={() => {}} />{:else}{@const question = entry.q}<QueueAnswer
        {question}
        file={opts.file}
        onanswered={() => {}}
        pick={block.queue.length > 1 && (!compact || inPlace) ? pick : null}
        lead={(block as { lead?: unknown }).lead === true && n === 0}
        {n}
        {compact}
      />{/if}{/each}
    {#if asked.more > 0}<a class="queue-more" data-needs-n href={inApp('/decide')}>{compact ? queueWords.moreOnDecide(asked.more) : queueMore(asked.more)}</a>{/if}
  </div>
  {#if most !== null}<button type="button" class="block-more tap" data-queue-more onclick={(e) => void unfold(e, most)}>{words.more(every.length - most)}</button>{/if}
{:else if board}
  <!-- WHILE THE BOARD'S CODE COMES THE SLOT SAYS IT IS STILL READING, as the board says itself once it reads (`Waiting`),
       so what stands under it on the page (`Changed.svelte`) waits unseen rather than being drawn and pushed down. -->
  {#await import('$lib/home/ProjectsBoard.svelte')}<span hidden aria-busy="true" data-board-reading></span>{:then { default: ProjectsBoard }}<ProjectsBoard list={board} entries={(block.entries ?? []) as never} />{/await}
{:else if projectCards}
  <!-- THE CARDS ON THE BOARD, NOT IN A TILE (proj F5): the slot's fill and padding go (`:has(> .project-cards)` below),
       its heading is the lane bar, and the cards take the one grid every screen lays them in. -->
  {#if lanes.length > 1}
    <div class="lane-bar">
      <Segmented role="group" aria-label={headingText ?? 'Lanes'} full>
        {#each lanes as l (l.id)}
          <button type="button" class="segment" data-free data-on={shownLane === l.id ? '' : undefined} aria-pressed={shownLane === l.id} onclick={() => (lane = l.id)}
            >{l.label} <span class="num">{l.count}</span></button
          >
        {/each}
      </Segmented>
    </div>
  {/if}
  {#if block.group}
    <div class="project-lanes">
      {#each laneGroups as g (g.id)}
        <section class="project-lane" aria-label={g.name || undefined}>
          {#if g.name}<h3 class="lane-head"><span class="lane-name">{g.name}</span> <span class="lane-count">· {g.said}</span></h3>{/if}
          <ul class="project-cards">
            {#each g.cards as p (p.card.key)}<li class="pc-cell" {@attach settleOn(p.card.draft)} in:cardIn out:cardOut animate:flip={springy()}><ProjectCard card={p.card} label={p.label} trend={p.trend} agents={p.agents} /></li>{/each}
          </ul>
        </section>
      {/each}
    </div>
  {:else}
    <ul class="project-cards">
      {#each laneCards as p (p.card.key)}<li class="pc-cell" {@attach settleOn(p.card.draft)} in:cardIn out:cardOut animate:flip={springy()}><ProjectCard card={p.card} label={p.label} trend={p.trend} agents={p.agents} /></li>{/each}
    </ul>
  {/if}
{:else}
  {#each drawing as item, run}
    {#if item.kind === 'open'}
      <!-- THE REST OF A GROUP, ONE PRESS AWAY, opened where it is; the focus goes to the first card it opened, which
           comes after the ones the group showed folded. -->
      <button
        type="button"
        class="block-more tap"
        onclick={(e) => {
          const from = (e.currentTarget as HTMLElement).previousElementSibling?.querySelectorAll('.cards-item').length ?? 0;
          void unfold(e, from, () => (groupsOpen = new Set(groupsOpen).add(item.group)));
        }}>{item.label}</button
      >
    {:else}
    {@const segment = item.segment}
    {#if segment.type === 'block'}
      <!-- A ROW SOMEBODY JUST TICKED OR MOVED IS WHERE THEY LEFT IT, and each gesture is handed the rows as drawn,
           because that is the list its place is found in. THE PRIMITIVE DRAWS A CONTROL ONLY FOR A CALLBACK IT IS
           HANDED, so a board, a checklist, a roadmap and a queue are each read-only exactly where `writes` is null. -->
      <!-- `w` IS A CONSTANT so each callback below keeps the narrowing it was built under. -->
      {@const w = writes}
      {@const shown = w ? w.keptSegment(i, segment, block, runAt(run)) : segment}
      {@const more = fold ? foldOf(segment.kind, shown.rows.length, open) : long ? longFoldOf(segment.kind, shown.rows.length, longShown) : null}
      {#if barRows}<ItemMenu label={barName} bind:at={barAt} href={barHref} />{/if}
      {#snippet drawnBlock()}
      <Block
        cursor={rows?.cursor ?? null}
        onrowfocus={rows?.onrowfocus}
        block={more ? { ...shown, rows: shown.rows.slice(0, more.shown) } : shown}
        {opts}
        onmove={w ? (row, to) => w.moveCard(block, row, to, i, shown.rows) : undefined}
        ontick={w ? (row, done) => w.tickTask(block, row, done, i, shown.rows) : undefined}
        onreschedule={w ? (row, drop) => void w.rescheduleBar(block, row, drop, i, shown.rows) : undefined}
        oncapture={w && w.capturable(block) ? w.captureLine : undefined}
        oninput={w && typable ? w.typeInto : undefined}
        onpath={w ? (row, done) => w.onpath(block, row, done, i, shown.rows) : undefined}
        onopen={w ? verbs?.onopen : undefined}
        onmenu={w ? verbs?.onmenu : undefined}
        act={w ? (action, row, value) => w.act(action, row, value, { block, at: i, before: shown.rows }) : undefined}
      />
      {/snippet}
      <!-- ONLY A BLOCK WHOSE ROWS HAVE A MENU OF THEIR OWN IS WRAPPED. EVERY OTHER STAYS THE SLOT'S OWN CHILD: the page's and each screen's rules are written against `.block-slot > .block`, and wrapped they all stopped matching at once, on 5 Nov: folds read their name twice and lost their one-line look. -->
      {#if barRows || chartThing}<div class="block-holds" data-thing={chartThing ?? undefined} {@attach barRows ? barHost : null}>{@render drawnBlock()}</div>{:else}{@render drawnBlock()}{/if}
      {#if more}<button type="button" class="block-more tap" data-long={long && !fold ? '' : undefined} onclick={(e) => (fold ? void unfold(e, more.shown) : longer(e, more.shown))}>{fold ? words.more(more.more) : longWords(more.more)}</button>{/if}
      {#if w && segment.kind === 'steps' && w.stepable(block)}<AddStep {block} writes={w} />{/if}
      <!-- WHAT THE RECORD REFUSED ABOUT A FIELD IS SAID UNDER ITS BLOCK, named by the field's label, until that field is
           written. -->
      {#if segment.kind === 'inputs' && w}
        {#each shown.rows as r}
          {@const fix = w.saidOf(r)}
          {#if fix}<p class="block-said" role="status" data-intent="bad">{r.cells[1]}: {fix}</p>{/if}
        {/each}
      {/if}{:else if segment.type === 'degraded'}<Degraded {segment} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} {opts} /></div>{/if}
    {/if}
  {/each}
  {#if linesFold}<button type="button" class="block-more tap" data-lines-more onclick={() => (open = true)}>{words.moreNumbers(linesFold.more)}</button>{/if}
{/if}

<!-- WHAT A PRESSED HOLE DOES (`opts.hole`), where the page writes. Nothing is drawn until one is pressed. -->
{#if writes}<Hole bind:this={holes} row={param ? { register: param.register, seq: param.seq } : null} />{/if}

<!-- THE PANEL THE HOST DRAWS UNDER A SECTION THAT NAMES ONE (`panel-of.ts`), for the row the page is about, and only
     the one it names: the project's scheduled actions under `panel: actions`, the key its numbers are sent with under
     `panel: reporting`. The actions panel drew the key as well, so a founder's project page, which names both, drew
     the key twice. Not while arranging, since a list that fetches is not a block to move, and not on an inert page,
     since the key's panel makes one. -->
<!-- WHERE IT WAS SEEN (`panel: seen`) ONLY READS, so it is drawn for any page drawn for a row, one that does not write
     as well, and never while arranging. IT IS LOADED BY `import()`, so neither it nor its styles reach the entry chunk. -->
{#if panel === 'seen' && param && !arranging}
  {#await import('./panels/Seen.svelte') then { default: Seen }}<Seen register={param.register} seq={param.seq} {now} ondrew={(d) => (seenDrew = d)} />{/await}{#if seenDrew === false}<span data-seen-none hidden></span>{/if}
{:else if (panel === 'actions' || panel === 'reporting' || panel === 'run') && param && writes && !arranging}
  <!-- BY THE ROW, `things#1`, and not by its title: the record resolves each action's project to its row. -->
  <!-- LOADED BY `import()` AS SEEN AND JOB ARE: both are a row's page's and never Today's, which draws no row. -->
  <!-- ACTIONS ONLY FOR SOMEBODY WHO READS THE WHOLE RECORD, as `actions` asks: a contractor on one project was refused it. -->
  {#if panel === 'actions'}{#if may(route.data as unknown as Shell, 'read')}{#await import('./panels/Actions.svelte') then { default: Actions }}<Actions project={{ spoken: `${param.register}#${param.seq}`, title: param.title }} />{/await}{/if}
  {:else if panel === 'run'}
    <!-- A RUN'S PAGE, drawn for one row of the list of runs: what it did and its way back, by its handle (`S42`). -->
    {#if param.register === 'session'}{#await import('./panels/RunPanel.svelte') then { default: RunPanel }}<RunPanel run={`S${param.seq}`} title={param.title} onchanged={writes.reread} />{/await}{/if}
  {:else}{#await import('./panels/Reporting.svelte') then { default: Reporting }}<Reporting register={param.register} seq={param.seq} title={param.title} />{/await}{/if}
{:else if panel === 'job' && param && writes && !arranging}
  <!-- THE JOBS FOR THIS ROW AND A WAY TO START ONE (`panel: job`), a row panel, so the hosted branch never draws it. -->
  {#await import('./panels/Job.svelte') then { default: Job }}<Job project={{ spoken: `${param.register}#${param.seq}`, title: param.title }} />{/await}
{:else if hosted}
  <!-- A PANEL ABOUT THE RECORD (`panels/index.ts`), on any page: the screen part as its own screen mounts it, handed
       whether the reader owns the record. The registry and the panel are both reached by `import()`, so neither is in
       the entry chunk. -->
  <!-- WHILE ITS CODE ARRIVES THE SLOT SAYS IT IS STILL READING (`aria-busy`), so nobody, a look included, takes the
       empty tile for the panel. -->
  {#await import('./panels/index.ts').then((m) => m.PANEL_LOADERS[hosted]())}<span data-seen-none hidden aria-busy="true"></span>{:then { default: Hosted }}<Hosted owner={owns} />{/await}
{/if}

<!--
  AND IT SAYS THAT IT IS A SLICE.

  `limit:` cuts the rows a block draws, and a block cut short under a heading reads as the complete answer to the
  question it asks: invisible at nine rows and a lie at four hundred. ONE LINE FOR EVERY KIND, and not the `table`
  primitive's own `cap`, which would cover a third of the cut blocks and leave the rest silent in a way that looks
  deliberate. IT IS A `status`, NOT AN ASIDE: the count changes when the rows do, and somebody who cannot see the list
  end short is exactly who needs to be told it did.

  EXCEPT WHERE THE BLOCK ALREADY SAID IT, BETTER. A `queue` ends in its own count of what is left and that count is a
  door, so this line under it would be the same fact twice, and the second telling the one with nowhere to press.
-->
<!-- WHILE A LIST IS FOLDED, its "N more" is the line under it; the slice it is of is said once it is open.
     THE CUT IS SAID AS THE FOLD SAYS IT, "20 more", and where the rest has a list to open it is the door there. "Showing
     1 of 21. Open Tasks for the rest" under one row of Today was a sentence about the page, read before the row. A
     BLOCK OVER NO LIST OPENS WHERE `o` DOES (`door.ts`), so "12 more" under what changed is Activity and not a count
     with nowhere to press. A FORECAST KEEPS ITS SENTENCE: its rows are days walked, and "120 more" would not say they
     are days, AND IT COUNTS THEM OVER THE DAYS THE RECORD WALKED (`walk.reach`), which since a walk opens on a shorter
     length than it runs to is further than the length it opened on: "of 1,825 over 90 days" counted five years under a
     three-month label. -->
{#if !drawn.refusal && !block.cannot && block.kind !== 'queue' && block.total > block.shown && !folded && !homeFold}
  {@const to = openHref(block)}
  {@const door = to && source ? to : block.register && block.register !== 'deadlines' ? null : doorOf(block)}
  {#if lateSlice}
    <!-- THE LATE LIST'S OWN DOORS, the half that was cut and both where both were. -->
    <div class="block-doors">
      {#each lateSlice as d (d.half)}
        {#if d.href}<a class="block-more tap" href={inApp(d.href)}>{d.said}</a>{:else}<p class="block-slice" role="status">{d.said}</p>{/if}
      {/each}
    </div>
  {:else if block.source === 'forecast.runway'}
    <p class="block-slice" role="status">
      {copy.ofWhichWalked(block.shown, block.total, walkedDays(block))}.{#if to && source}{' '}
        <a class="tap" href={inApp(to)}>{copy.openTheRest(source)}</a>
      {/if}
    </p>
  {:else if door && block.key === 'faces' && headingText}
    <!-- TODAY'S PEOPLE END ON THEIR LIST'S DOOR, "All people →", at the tile's foot. -->
    <a class="block-more block-all tap" href={inApp(door)}>{copy.allOf(headingText)}<Icon name="arrow" size="s" /></a>
  {:else if door && source && block.register}
    <!-- A LIST'S DOOR SAYS HOW MANY THE LIST HOLDS AND WHERE (P21): "All 36 in Ledger →", where "30 more" left a sum. -->
    <a class="block-more block-all tap" href={inApp(door)}>{copy.allIn(block.total, source)}<Icon name="arrow" size="s" /></a>
  {:else if door}
    <a class="block-more tap" href={inApp(door)}>{words.more(block.total - block.shown)}<Icon name="arrow" size="s" /></a>
  {:else}
    <p class="block-slice" role="status">{words.more(block.total - block.shown)}</p>
  {/if}
{/if}

<style>
  .block-holds {
    display: contents;
  }

  /* A `panel: seen` SECTION WHOSE PANEL DREW NOTHING is left out whole, tile and heading. */
  :global(.block-slot:has(> [data-seen-none])) {
    display: none;
  }
  /* A PANEL STILL READING HOLDS WHAT COMES AFTER IT OUT OF SIGHT (nojump, 2 Nov). Its slot is left out while it reads
     (above), and then it either stays out or fills; the blocks after it were drawn meanwhile and jumped down when it
     filled (Agents on a phone, each of Working now, Up next and Recent runs). They keep their place in the layout but
     are not drawn until every panel above them has answered, and never longer than 2.5s, so a read that hangs hides
     nothing for good. */
  /* AND SO DOES THE PROJECTS BOARD WHILE IT READS (jumps, 2 Nov): its bars stand 235px and the board lands about 1050px
     on a desk, so on Portfolio "Waiting on you" was drawn under the bars and pushed off screen (CLS 0.085). The board's
     height turns on what each project holds, so no count can hold it; what is under it waits unseen instead. */
  :global(.block-slot:has(> [data-seen-none][aria-busy='true']) ~ .block-slot),
  :global(.block-slot:has([data-board-reading]) ~ .block-slot) {
    visibility: hidden;
    animation: slot-shown 0s linear 2.5s forwards;
  }
  @keyframes -global-slot-shown {
    to {
      visibility: visible;
    }
  }
  /* THE TILE'S HEADING ROW (`ui/Tile.svelte`'s): the well, the name at `--fs-body` 600, and the source as the
     meta at the right, one well high, with the tile's 16 under it. No rule under it: the name is what says a block
     starts here. */
  .block-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--well);
    /* THE ONE CARD HEAD (rhythm, 3 Nov), as `Tile`'s: a 28 row, its 14/20 name centred, 12 to what it names. */
    margin-block-end: var(--card-head-gap);
  }

  /* THE HEADING'S GLYPH IS BARE (ops style, 3 Nov), as `Tile`'s is: 18px of quiet ink, no well behind it. */
  .block-bar > :global(.well) {
    inline-size: var(--head-glyph);
    block-size: var(--head-glyph);
    border-radius: 0;
    background: none;
    color: var(--ink-3);
  }

  .block-bar > :global(.well .icon[data-size]) {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  /* ONE HEAD FOR EVERY TILE OF ROWS (Money's tiles): the name at the left, the total or the door to the list at the right,
     and a hairline under it, so a run of tiles reads as one grammar. Only over a tile of rows, cards, a split or a bar; a
     ledger's rows (`data-rich`) already carry theirs (`timeline.css`). TWO SELECTORS, because a `:has` inside a `:has`
     is no selector: written as one, the timeline's clause was dropped and Coming up stood with no hairline beside a
     tile that had one. A bar is `.prop`; there is no `.bar`, so Spent this month and Accounts had none either. */
  :global(.block-slot:has(> .block-bar):has(> .block :is(.cards-grid, .split, .prop)) > .block-bar),
  :global(.block-slot:has(> .block > .list[data-kind='timeline']):not(:has(> .block > .list > .item[data-rich])) > .block-bar) {
    padding-block-end: 0;
    margin-block-end: var(--card-head-gap);
    /* NO LINE UNDER A CARD'S HEAD (ops style, 3 Nov): the head is told from its rows by its weight and the air. */
    border-block-end: 0;
  }

  /* IT NEVER GIVES WAY TO WHAT IS BESIDE IT, ONLY TO THE ROW ITSELF: shrunk with the door by a fraction of a pixel,
     "Your work this week 2" broke over two lines in a quarter of the board. It keeps its words' width up to the row's,
     less its well, and wraps only past that. */
  .block-name {
    flex: 1 0 auto;
    max-inline-size: calc(100% - var(--well) - var(--sp-3));
    min-inline-size: 0;
    margin: 0;
    /* A NAME THAT WRAPS TAKES ITS COUNT WITH ITS LAST WORDS (audit 6f AF21): "Your work this week" in a quarter of the
       board put its "2" on a line of its own. */
    text-wrap: balance;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(20px * var(--type, 1));
  }

  /* HOW MANY IT HOLDS, beside the name in the quiet ink, as `ui/Tile.svelte` says a count: one step lighter, never a
     pill and never red. */
  .block-count {
    /* ITS OWN RUN, or a number after Latin words joins them in a right-to-left page and the margin lands on its far side. */
    unicode-bidi: isolate;
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Every block header names its source, and `o` opens that list PRE-FILTERED to the block's own `where:`. That is the
     down half of the two-altitude ladder, and nothing may break it. */
  /* IT GIVES WAY BEFORE THE NAME DOES (1 Nov): the door waits unseen for the pointer, yet it held its width, so in a
     narrow tile "Your work this week" broke over two lines beside a gap. It shrinks first, clipped, and the name keeps
     its one line. */
  .block-source {
    display: flex;
    flex: 0 1000 auto;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  .block-source:hover {
    color: var(--ink);
  }

  /* THE DOOR WAITS FOR THE POINTER OR THE KEYBOARD to reach its tile, and fades rather than folds, so
     the heading row never moves under the pointer. ON TOUCH THERE IS NO HOVER TO WAIT FOR, so it is not drawn: a
     phone opens a row by pressing it, and Open the rest under a cut list is still there. */
  @media (hover: hover) and (pointer: fine) {
    .block-source {
      opacity: 0;
      transition:
        opacity var(--d-state) var(--ease-out),
        color var(--d-state) var(--ease-out);
    }

    :global(.block-slot:is(:hover, :focus-within)) .block-source,
    .block-source:focus-visible {
      opacity: 1;
    }

    /* A DOOR THE KEYBOARD LANDS ON HAS A WIDTH. It shrinks first, down to nothing beside a long heading, so a keyboard
       reader's focus landed on a link 0px wide. While it holds focus it stands over the end of the heading row, whole,
       on the tile's own ground, and the heading underneath does not move. */
    .block-source:focus-visible {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      z-index: var(--z-raise);
      overflow: visible;
      padding-inline-start: var(--sp-2);
      background: var(--tile);
    }

    :global(.block-bar:has(.block-source:focus-visible)) {
      position: relative;
    }
  }

  @media not ((hover: hover) and (pointer: fine)) {
    .block-source {
      display: none;
    }
  }

  /* A CHART'S FOLD OF POINTS WAITS FOR ITS CHART. "Points on this chart" stood under every line on
     a page, one caption a chart, and a page of measures read as a page of the same words. The fold stays where a
     keyboard and a screen reader reach it, and the pointer's readout says each point on the chart itself, so it fades
     in while the pointer or the keyboard is on that chart and stays while it is open. It fades rather than folds, so
     nothing moves under the pointer. A day grid's fold (`heat`) is the same fold under the same names, and waits the
     same way. */
  @media (hover: hover) and (pointer: fine) {
    :global(.block-slot .lines-numbers > .lines-toggle) {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.block-slot .block:is(:hover, :focus-within) .lines-numbers > .lines-toggle),
    :global(.block-slot .lines-numbers[open] > .lines-toggle) {
      opacity: 1;
    }
  }

  /* ON TOUCH THERE IS NO HOVER TO WAIT FOR, so the fold is kept out of sight, as the source's door above is: a finger
     reads each point by drawing along the chart (`touch-action: pan-y` on the plot), and a screen reader still finds the
     fold and opens it, which brings it into view. A phone of measures was a 44px "Points on this chart" under each one. */
  @media not ((hover: hover) and (pointer: fine)) {
    :global(.block-slot .lines-numbers:not([open], :focus-within)) {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* A BLOCK WITH NO HEADING IS NAMED FOR A SCREEN READER AND DRAWS NOTHING: the region's name, out of sight. */
  .block-unnamed,
  .block-bar[data-quiet] {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    min-block-size: 0;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A HEADING KEPT FOR A SCREEN READER HOLDS NO STOP FOR THE KEYBOARD: focus landed on a link nobody could see, on every
     quiet tile of Today. The tile's own "more" is the way in. */
  .block-bar[data-quiet] .block-source {
    display: none;
  }


  /* The same weight and colour as the list grid's own cap line, because it is the same sentence about the same thing
     seen from the page rather than from the list. Left-aligned rather than centred: it sits under content of every
     shape, and a centred line under a two-row `spec` block reads as a caption for it. */
  .block-cannot {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .block-slice {
    margin: 0;
    padding-block-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE DOOR TO THE REST IS A QUIET LINK, not the red underline the browser's link colour gave it: "Open Money for the
     rest" under the forecast read as a warning on a healthy page. The second ink with a hairline
     under it says it can be pressed, and red stays for what is wrong. */
  .block-slice > a {
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: var(--rule-strong);
    text-underline-offset: 3px;
  }

  .block-slice > a:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }

  /* "N MORE" IS THE SLICE LINE'S QUIET LINK, pressed rather than followed: the second ink, a hairline under it. */
  .block-more {
    display: block;
    margin: 0;
    padding: var(--sp-2) 0 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    text-decoration: underline;
    text-decoration-color: var(--rule-strong);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  /* AS A DOOR, it is as wide as its words, so the row beside it is not a link too. THE BOARD'S QUIET "MORE" (30 October):
     the word and its arrow in the second ink, never underlined, as every widget's and "All people →" are. */
  a.block-more {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-1);
    text-decoration: none;
  }

  /* THE LIST'S DOOR, "All people →": the tile link's own look, 13/500 in the second ink with its arrow, no underline. */
  a.block-all {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-1);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  /* TWO DOORS UNDER ONE LIST sit on one line with room between them, and fold under each other where they do not fit. */
  .block-doors {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-5);
  }

  .block-more:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }

  /* "SHOW 30 MORE" UNDER A LONG LIST IS A CONTROL, NOT A FOOTNOTE (UI pass, 1 Nov): the list's width, a quiet fill, the
     control's height, so a thumb finds it and the eye reads where the list stops. A press is a fill change. */
  .block-more[data-long] {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    margin-block-start: var(--sp-3);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill, var(--r-ctl));
    background: var(--soft-fill, var(--tile-2));
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    transition: background-color var(--d-press, 70ms) ease-out;
  }

  .block-more[data-long]:hover {
    background: var(--soft-fill-hover, var(--hover));
  }

  .block-more[data-long]:active {
    background: var(--rule);
  }

  @media (pointer: coarse) {
    .block-more[data-long] {
      min-block-size: 44px;
    }
  }

  /* An input's refusal, under the inputs it is about, in the size the slice line under a block is said in. */
  .block-said {
    margin: 0;
    padding-block-start: var(--sp-2);
    font-size: var(--fs-meta);
  }


  /* THE DESK'S OWN TILE IS ITS OWN TILE: the slot draws no fill round it, and the tile fills the slot's height. */
  /* A ROW OF A PROJECT'S SHAPE IS ITS PARTS' OWN TILES: the slot draws no fill round them, and a row with nothing to
     show (the agents' runs read unseen) takes no room on the board. */
  :global(.block-slot.block-slot:has(> .shape-row)) {
    padding: 0;
    background: none;
    box-shadow: none;
  }

  :global(.block-slot.block-slot:has(> .shape-row[data-empty])) {
    display: none;
  }

  :global(.block-slot.block-slot:has(> .desk-part)) {
    padding: 0;
    background: none;
    box-shadow: none;
    container-type: inline-size;
  }

  .desk-part {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    block-size: 100%;
  }

  .desk-part > :global(*) {
    flex: 1;
  }

  /* THE CARDS STAND ON THE BOARD (proj F5): a slot holding them is no tile, so a card is the white card Today draws and
     never a grey one inside a white one. */
  :global(.block-slot.block-slot:is(:has(> .project-cards), :has(> .project-lanes), :has(> .projects-board))) {
    padding: 0;
    background: none;
    box-shadow: none;
    container-type: inline-size;
  }

  /* AS WIDE AS ITS LANES at a desk, so the bar is a control and not a rule across the page; a phone's is the page's
     width (`Segmented`'s `full`). */
  /* A LANE'S HEAD HAS THE SPACE ANY SECTION HEAD HAS: 24 between lanes and 12 under its head (the 4px steps), never against the card above. */
  .project-lanes {
    display: grid;
    gap: var(--sp-5);
  }

  .lane-head {
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  .lane-count {
    color: var(--ink-3);
    font-weight: 400;
  }

  .lane-bar {
    display: flex;
    min-inline-size: 0;
    margin-block-end: var(--sp-3);
  }

  .lane-bar > :global(*) {
    min-inline-size: 0;
  }

  @media (width < 640px) {
    .lane-bar > :global(*) {
      flex: 1;
    }
  }

  /* ONE GRID FOR THE ONE CARD (proj section 4), a tile gap apart. Fewer cards than columns leave the row short. COUNTED BY THE ROOM
     THE CARDS HAVE, not the window's, since the sidebar of frame B takes some of it: a card never narrower than its
     figure row (about 330), so four from 1,360, three from 1,020, two from 600, one below. */
  .project-cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pc-cell {
    display: grid;
    min-inline-size: 0;
  }

  @container (width >= 600px) {
    .project-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (width >= 1020px) {
    .project-cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (width >= 1360px) {
    .project-cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
