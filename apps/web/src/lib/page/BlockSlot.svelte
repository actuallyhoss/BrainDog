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
  import { tick } from 'svelte';
  import { at as inApp } from '../at.ts';
  import { Block, Degraded, Markdown, Table, Text } from 'braindog-render/svelte';
  import { EMPTY_KEEP, inline, text } from 'braindog-render';
  import QueueAnswer from './QueueAnswer.svelte';
  import { compactOf, queueWords } from './queue-answer.ts';
  import { doorOf } from './door.ts';
  import { queueMore } from 'braindog-render';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { said as voiceSaid } from '$lib/voice.svelte.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { draw, saidPlainly, walkTables } from '$lib/record/blocks.ts';
  import { joinsWithOr, registerHref } from '$lib/record/where.ts';
  import { rowHref } from '$lib/record/row-href.ts';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { fileAt, namedResolverOf, type LiveBlock, type Walked } from '$lib/record/page-live.ts';
  import { glyphSet, glyphSetNow, isGlyph, pathOf } from '$lib/ui/icons.ts';
  import { agentKindOf, liveOf } from '../ui/face.ts';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Actions from './panels/Actions.svelte';
  import ActionRows from './panels/ActionRows.svelte';
  import Reporting from './panels/Reporting.svelte';
  import RunPanel from './panels/RunPanel.svelte';
  import { panelOf } from './panels/panel-of.ts';
  import { openInPlace, type Opening } from './group-open.ts';
  import type { Writes } from './page-writes.ts';
  import type { Picked } from './picked.svelte.ts';
  import type { Row } from 'braindog-render';
  import AddStep from './AddStep.svelte';
  import Hole from './Hole.svelte';
  import { foldOf } from './home.ts';
  import { headCount, headIcon, headTone } from './tile-head.ts';
  import HomeRows from '$lib/home/HomeRows.svelte';
  import { lateDoors, lateWhere, lateWords, linesIn, moneyListOf, type WithRows } from '$lib/home/home-rows.ts';
  import { words } from './words.ts';
  import { blockWords } from '$lib/record/block-edit.ts';

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
    rows = null,
    verbs = null,
    pick = null,
    walk = null,
    compact = false,
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
    /** The block name's heading level: 2 under a page's title, 3 under a preview's own heading. */
    level?: 2 | 3;
    /** Whether a long list folds in place under "N more", as it does on a home (`home.ts` `foldOf`). */
    fold?: boolean;
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
    verbs?: { onopen: (row: Row) => void; onmenu: (row: Row, anchor: HTMLElement) => void } | null;
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
  } = $props();

  /* A `{{path}}` IS ANSWERED BY THE RECORD on the block's `values`; a missing value is marked. `now` is the clock the
     rows were read against, so `{{ago:}}` agrees with the dates beside it. A HOLE IS PRESSABLE WHERE THE PAGE WRITES
     (`Hole.svelte`): it opens the place the value lives, or offers to find it out. On an inert page it stays a mark. */
  /* A FIGURE IN A SENTENCE READS AS MONEY, `£7,200.00` and not `GBP 7,200.00`, as the cells beside it do. */
  /* THE PAGE'S HEADLINE LINE SAYS WHOLE UNITS: "Cash is EGP 1,086,213", the way a person says it,
     where it said "EGP 1,086,213.41" (`money.ts` `symbolText`, DIRECTION §37). */
  const said = (text: string | null): string | null => (text === null ? null : symbolText(text, homeCurrency(), block.kind === 'note' && block.lead === true));

  /* ── the fold ──────────────────────────────────────────────────────────────
     A LONG LIST ON A HOME SHOWS ITS FIRST ROWS AND FOLDS THE REST in place, one press away, as Today folds what needs
     you; nothing is cut and nobody is sent to another screen for the ninth row. Once opened it stays open. */
  let open = $state(false);
  const folded = $derived(fold ? foldOf(block.kind, block.rows.length, open) : null);

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

  const opts = $derived({
    /* A PATH THAT NAMES NOTHING OF THE RECORD IS ANSWERED `UNNAMED` (the kernel's `unnamed`), never a dash: the author's
       words in prose, and no figure in a chip, a tile or a bar. */
    resolve: (path: string) => {
      const v = namedResolverOf(block.values, block.unnamed)(path);
      return typeof v === 'string' || v === null || v === undefined ? said(v ?? null) : v;
    },
    now,
    /* THE RECORD'S HOME CURRENCY, so every amount the drawers write is the one writer's (`money.ts`): `null` on a
       record with none. */
    home: homeCurrency(),
    /* A forecast's knobs and its readout: arithmetic over the walk already on the page, kept in memory. */
    scenario: true,
    /* AND A LENGTH PAST THE WALK'S REACH, which the record is asked to walk (`walkFor`). */
    ...(walk ? { walk: walkFor } : {}),
    /* EVERY LINK THE RENDERER DRAWS, under the app: the record writes `/decide`, and the tab is on `/app/<slug>`. */
    href: inApp,
    /* `{{ref:tasks#241}}` IS A LINK TO THAT ROW: its own page where its list made one, else its screen (`row-href.ts`).
       Record-relative, and `href` above puts it under the app. No `dayHref`: no page of this record draws a calendar. */
    link: rowHref,
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
    /* A RUN'S FACE, ON A CARD OF RUNS: the run and whether it is working, gone quiet or stopped, so
       `Cards.svelte` draws the run's glyph in the `who` cell instead of a plain initial. */
    ...((block.source === 'sessions.live' || block.source === 'sessions.working') && block.entries
      ? { runs: block.entries.map((e, n) => ({ run: `S${e.seq}`, agent: typeof e.fields.agent === 'string' ? e.fields.agent : null, live: liveOf(e.fields.state, block.quiet?.[n] === true) })) }
      : block.runFaces
        ? /* AND ON A CARD WHOSE `who` THE BLOCK ANSWERED AS A RUN (`page-live.ts` `runFaces`): what a project runs on. */
          { runs: block.runFaces }
        : {}),
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
  const source = $derived(listNamed(block.register));

  /* The panel the host draws under this block, by the name the section gives it (`panel-of.ts`). */
  const panel = $derived(panelOf(block));

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

  /* THE TILE'S HEADING ROW, THE SAME ON EVERY TILE (DIRECTION §39): its glyph, or its kind's where it names none, and
     how many it holds where it is a list a person counts (`tile-head.ts`). */
  const glyph = $derived(headIcon(block.kind, block.icon, isGlyph));
  const count = $derived(headCount({ kind: block.kind, total: block.total, refused: !!drawn.refusal || block.cannot !== undefined }));

  /* HOME'S OWN LIST, where Home drew the block as one (`home/home-rows.ts`): what is late as one list, what comes up by
     day. Its well says late in the red, as a block whose rows are late does anywhere (`headTone`). */
  const homeRows = $derived((block as WithRows).homeRows);
  const tone = $derived(
    headTone({ kind: block.kind, icon: block.icon, tone: block.tone, where: block.where, late: homeRows?.kind === 'late' }),
  );
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
  const drawing = $derived<Opening<(typeof drawn.segments)[number]>[]>(grouped ?? drawn.segments.map((segment) => ({ kind: 'segment', segment })));
  /* WHETHER THE BLOCK IS DRAWN AS MORE THAN ONE RUN OF ROWS. Such a block is read run by run: each run is handed its
     place, and a row is marked as arrived only when no other run of the block held it (`marked` in `page-writes.ts`).
     A BLOCK WHOSE GROUPS OPEN IN PLACE STILL MARKS NONE: the cards a press unfolds are new to their run and were in no
     other, so by place they would read as arrived on every unfold. */
  const several = $derived(drawing.filter((item) => item.kind === 'segment' && item.segment.type === 'block').length > 1);
  const runAt = (run: number): boolean | number => (several ? (grouped ? true : run) : false);
</script>

{#if block.heading}
  <!-- A PAGE'S LEAD QUESTION HAS NO VISIBLE BAR outside arranging: the question is the heading a reader sees, and the bar
       ("Waiting on you") is kept for a screen reader, clipped, not removed, so the region keeps its name in the
       heading list. While arranging it shows, since that is the label a block is moved by. -->
  <header class="block-bar" data-quiet={block.kind === 'queue' && (block as { lead?: unknown }).lead === true && !arranging ? '' : undefined}>
    <!-- THE TILE'S HEADING ROW: the block's own glyph in its well when it declares one, the name, and the door to where
         its rows live at the right. AN AUTHORED HEADING IS READ AS TEXT, so `{{icon:rocket}} shipped` draws the rocket
         rather than its braces. -->
    {#if glyph && isGlyph(glyph)}<IconWell name={glyph} {tone} />{/if}
    <svelte:element this={level === 3 ? 'h3' : 'h2'} class="block-name"
      ><span id="{ids}h-{i + 1}"><Text nodes={inline(block.heading, { icon })} opts={{ icon }} /></span>{#if count !== null}<span class="block-count num">{count}</span>{/if}</svelte:element
    >
    {#if source}
      <!-- THE LIST'S NAME, not its id, and A DOOR THAT WAITS FOR THE POINTER (DIRECTION §35: secondary controls appear on
           hover or focus). "Tasks" at the top right of every tile on Work was chrome on every tile, said five times. The
           predicate stays, because without it a reader has no way to know the list is filtered and may take a block of
           four rows for the whole list; the clause that names the page they are on is dropped. AS A GLYPH, AND THE
           CLAUSE IS STILL THERE: the tooltip and a screen reader get the whole clause. -->
      <a class="block-source tap" href={inApp(openHref(block) ?? `/r/${block.register}`)} title={whereOf(block) || undefined}>
        {source}
        {#if whereOf(block)}
          <Icon name="filter" size="s" />
          <span class="block-where"><span class="block-where-lead">{copy.filter}</span> {whereOf(block)}</span>
        {/if}
      </a>
    {/if}
  </header>
{:else}
  <!-- A BLOCK WITH NO AUTHORED `heading:` DRAWS NO HEADING. It printed its kind's name, and where the kind had none its
       dialect id, so Decide's lead question sat under "queue" and Today's dates under "deadlines": the system's word
       where the page has nothing to say. The region still has a name, for a screen reader only, in the kind's words. -->
  <svelte:element this={level === 3 ? 'h3' : 'h2'} class="block-unnamed" id="{ids}h-{i + 1}"
    >{copy.kindNames[block.kind] ?? blockWords.kindNames[block.kind] ?? words.unnamed}</svelte:element
  >
{/if}

<!-- Never hidden and never centred: the page's shape is information, and a page that silently shrinks teaches that
     blocks come and go (19 §6). ONE surface for every kind, so "nothing matched" and "this block is broken" are told
     apart. -->
{#if block.cannot}
  <p class="block-cannot">{block.cannot}</p>
{:else if block.actions?.length && !block.refusals.length}
  <ActionRows rows={block.actions} {now} />
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
    {#if part.table}<Table columns={part.table.columns} rows={part.table.rows} total={part.table.total} label={headingText} href={inApp} home={homeCurrency()} />{/if}
  {/each}
{:else if block.kind === 'table' && !block.answer}
  <!-- THE ROWS THAT ARRIVED SINCE IT WAS LAST DRAWN ARE MARKED, as a list's are, where the page can write. -->
  {@const all = writes ? writes.arrivedTable(i, block.rows, block) : block.rows}
  <Table columns={block.columns} rows={folded ? all.slice(0, folded.shown) : all} total={block.total} label={headingText} href={inApp} home={homeCurrency()} scope={block.scopeCells} {icon} />
  {#if folded}<button type="button" class="block-more tap" onclick={(e) => void unfold(e, folded?.shown ?? 0)}>{words.more(folded.more)}</button>{/if}
{:else if block.kind === 'queue' && block.queue && block.queue.length > 0 && writes}
  <!-- A QUESTION IS ANSWERED WHERE IT IS SHOWN (`QueueAnswer.svelte`): one card a question, and the count of what is left is still the door to Decide. -->
  <!-- COMPACT, AT MOST THREE (`queue-answer.ts` `compactOf`): the question and its answers, and the rest a count on Decide. -->
  {@const asked = compact ? compactOf(block.queue, block.total) : { shown: block.queue, more: block.total - block.queue.length }}
  <div class="queue" data-compact={compact ? '' : undefined}>
    <!-- THE LEAD QUESTION IS DRAWN WHOLE when the block says `lead:`, with what accepting it would put on the screen. -->
    {#each asked.shown as question, n (question.id)}<QueueAnswer
        {question}
        onanswered={() => {}}
        pick={block.queue.length > 1 ? pick : null}
        lead={(block as { lead?: unknown }).lead === true && n === 0}
        {n}
        {compact}
      />{/each}
    {#if asked.more > 0}<a class="queue-more" href={inApp('/decide')}>{compact ? queueWords.moreOnDecide(asked.more) : queueMore(asked.more)}</a>{/if}
  </div>
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
      {@const more = fold ? foldOf(segment.kind, shown.rows.length, open) : null}
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
      />
      {#if more}<button type="button" class="block-more tap" onclick={(e) => void unfold(e, more.shown)}>{words.more(more.more)}</button>{/if}
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
{/if}

<!-- WHAT A PRESSED HOLE DOES (`opts.hole`), where the page writes. Nothing is drawn until one is pressed. -->
{#if writes}<Hole bind:this={holes} row={param ? { register: param.register, seq: param.seq } : null} />{/if}

<!-- THE PANEL THE HOST DRAWS UNDER A SECTION THAT NAMES ONE (`panel-of.ts`), for the row the page is about, and only
     the one it names: the project's scheduled actions under `panel: actions`, the key its numbers are sent with under
     `panel: reporting`. The actions panel drew the key as well, so a founder's project page, which names both, drew
     the key twice. Not while arranging, since a list that fetches is not a block to move, and not on an inert page,
     since the key's panel makes one. -->
{#if panel && param && writes && !arranging}
  <!-- BY THE ROW, `things#1`, and not by its title: the record resolves each action's project to its row. -->
  {#if panel === 'actions'}<Actions project={{ spoken: `${param.register}#${param.seq}`, title: param.title }} />
  {:else if panel === 'run'}
    <!-- A RUN'S PAGE, drawn for one row of the list of runs: what it did and its way back, by its handle (`S42`). -->
    {#if param.register === 'session'}<RunPanel run={`S${param.seq}`} title={param.title} onchanged={writes.reread} />{/if}
  {:else}<Reporting register={param.register} seq={param.seq} title={param.title} />{/if}
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
  {@const door = to && source ? to : block.register ? null : doorOf(block)}
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
  {:else if door}
    <a class="block-more tap" href={inApp(door)}>{words.more(block.total - block.shown)}</a>
  {:else}
    <p class="block-slice" role="status">{words.more(block.total - block.shown)}</p>
  {/if}
{/if}

<style>
  /* THE TILE'S HEADING ROW (`ui/Tile.svelte`'s): the well, the name at `--t-row` 600, and the source as the
     meta at the right, one well high, with the tile's 16 under it. No rule under it: the name is what says a block
     starts here. */
  .block-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--well);
    margin-block-end: var(--sp-4);
  }

  .block-name {
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  /* HOW MANY IT HOLDS, beside the name in the quiet ink, as `ui/Tile.svelte` says a count: one step lighter, never a
     pill and never red. */
  .block-count {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Every block header names its source, and `o` opens that list PRE-FILTERED to the block's own `where:`. That is the
     down half of the two-altitude ladder, and nothing may break it. */
  .block-source {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-sm);
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  .block-source:hover {
    color: var(--ink);
  }

  /* THE DOOR WAITS FOR THE POINTER OR THE KEYBOARD to reach its tile (DIRECTION §35), and fades rather than folds, so
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
  }

  @media not ((hover: hover) and (pointer: fine)) {
    .block-source {
      display: none;
    }
  }

  /* A CHART'S FOLD OF POINTS WAITS FOR ITS CHART (DIRECTION §35, §37). "Points on this chart" stood under every line on
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

  /* THE CLAUSE IS FOR A SCREEN READER AND THE TOOLTIP. The glyph says the list is narrowed; the words are kept out of
     sight rather than printed as a debug line under the heading. */
  .block-where {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The word, quieter than the clause it introduces: it is a label and the clause is the fact. */
  .block-where-lead {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The same weight and colour as the list grid's own cap line, because it is the same sentence about the same thing
     seen from the page rather than from the list. Left-aligned rather than centred: it sits under content of every
     shape, and a centred line under a two-row `spec` block reads as a caption for it. */
  .block-cannot {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .block-slice {
    margin: 0;
    padding-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE DOOR TO THE REST IS A QUIET LINK, not the red underline the browser's link colour gave it: "Open Money for the
     rest" under the forecast read as a warning on a healthy page. The second ink with a hairline
     under it says it can be pressed, and red stays for what is wrong. */
  .block-slice > a {
    color: var(--ink2);
    text-decoration: underline;
    text-decoration-color: var(--edge);
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
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    text-decoration: underline;
    text-decoration-color: var(--edge);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  /* AS A DOOR, it is as wide as its words, so the row beside it is not a link too. */
  a.block-more {
    display: inline-block;
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

  /* An input's refusal, under the inputs it is about, in the size the slice line under a block is said in. */
  .block-said {
    margin: 0;
    padding-block-start: var(--sp-2);
    font-size: var(--t-sm);
  }

  /* THE QUERY A BLOCK WAS DRAWN FROM IS PROVENANCE, and on a phone it competes with the block's own heading. It is a
     desktop affordance, as the source link in the page's head is. */
  @media (width < 900px) {
    .block-where {
      display: none;
    }
  }
</style>
