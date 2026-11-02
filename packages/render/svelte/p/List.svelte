<!--
  `list` — title · detail · optional state marker. Kinds: `todo`, `steps`, `timeline`.

  `steps` is ordered, so it is an `<ol>`: numbered markers are appropriate here because the content
  actually is a sequence and the order carries information. `todo` and `timeline` are not.

  THE BOX ON A `todo` IS THE CONTROL IT LOOKS LIKE, WHERE THE HOST CAN ACT ON IT.

  It was `role="img"` on every surface, so ticking a task off cost four gestures and a screen
  change, from a screen already showing the task and a box drawn next to it: a 16 x 16 select box on
  a different route, a bulk action bar that shifted the table 63px, a menu and a value. Fifth of the
  ten things the friction pass measured as costing the most, and the only one of the ten whose
  shortest possible path was already drawn on the screen it was measured on.

  AND A PICTURE OF ONE WHERE IT CANNOT. `ontick` is the host saying it has somewhere to put the
  answer; with no callback the box is exactly what it was, an image with the state it shows as its
  name. That is `19 §6`'s rule, that a control which cannot act is absent rather than greyed out,
  and it is the same branch `Text` makes for a hole: a checkbox that does nothing when pressed is
  worse than a picture of one, because it also spends a tab stop and a promise.

  EVERY ROW CARRIES ITS KEY, AND THE HOST'S CURSOR IS DRAWN AS A HOVER IS (`../../src/cursor.ts`). `cursor` names the
  row the host is on and marks it `data-focused`; `onrowfocus` tells the host when Tab or a click lands in a row, so
  its j/k walk starts from where the reader is. `choose` answers the queue's question under the cursor with an option.
  With neither passed, nothing on the screen changes.

  A TASK OPENS AND HAS A MENU ONLY WHERE THE HOST HAS ONE. With `onopen` a todo's title is a button that hands the host
  its row, which docks it in a panel; with `onmenu` a quiet trailing control (`data-calm`, shown on hover or focus)
  hands it the row and itself to anchor a menu to. With neither the row is exactly `toHTML`'s, the same branch the box
  makes: a control that cannot act is absent.

  A ROW'S OWN ACTIONS sit at its end, through `Actions` at the row's size, only where the host hands both the
  block's `row_actions` and `act`. On `todo`, `timeline` and a plain list; the kinds with drawers of their own above
  (feed, queue, agents, roadmap, path) do not draw them yet.
-->
<script lang="ts">
  import { inline, takeWorking, text, TONES, WORKING_GLYPH, WORKING_LABEL, type Block, type RenderOptions, type Row } from '../../src/index.ts';
  import { kindSpec } from '../../src/kind-spec.ts';
  import { moveTick, nextTicks, tickState } from '../../src/ticks.ts';
  import { TODO_META_JOIN, todoLines, todoTitle } from '../../src/todo.ts';
  import {
    TIMELINE_CHIP,
    TIMELINE_UNDER,
    timelineCell,
    timelineChip,
    UNFILED_HINT,
    timelineDayHead,
    timelineDays,
    timelineDetails,
    timelineIn,
    timelineWordy,
    timelineNets,
    timelineRich,
    timelineTitle,
    timelineUnder,
  } from '../../src/timeline.ts';
  import { glyphName, glyphPath, glyphWaits } from '../../src/inline.ts';
  import { rowAt, rowKey } from '../../src/cursor.ts';
  import Agents from '../Agents.svelte';
  import Feed from '../Feed.svelte';
  import Queue from '../Queue.svelte';
  import Path from '../Path.svelte';
  import Roadmap from './Roadmap.svelte';
  import type { RoadmapDrop } from './roadmap-drag.ts';
  import Text from '../Text.svelte';
  import Actions from '../Actions.svelte';
  import { pointed, type Point } from '../menu-at.ts';
  import type { OnAct } from '../../src/actions.ts';

  let {
    block,
    opts = {},
    ontick,
    onact,
    onreschedule,
    cursor,
    onrowfocus,
    onopen,
    onmenu,
    onselect,
    selected,
    rowActions,
    act,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** Where a task's title opens it. Its absence is what keeps the title words. */
    onopen?: ((row: Row) => void) | undefined;
    /** Where a task's menu opens, with the control pressed to anchor it to. Its absence is what keeps the control away. */
    /** The row's menu, at its "…", or at `point` where a right-click or a held thumb opened it. */
    onmenu?: ((row: Row, anchor: HTMLElement, point?: Point) => unknown) | undefined;
    /** A queue's: where a question is chosen or let go for one answer in bulk, and which the host holds as chosen. */
    onselect?: ((row: Row, on: boolean) => void) | undefined;
    selected?: readonly string[] | undefined;
    /** The host's place to put the answer. Its absence is what keeps the box an image. */
    ontick?: ((row: Row, done: boolean) => void) | undefined;
    /** The same for a queue: where an answer goes. Its absence is what keeps an option a word. */
    onact?: ((row: Row, option: string) => void) | undefined;
    /** The same for a roadmap: where a dropped bar goes. Its absence is what keeps every bar a picture. */
    onreschedule?: ((row: Row, drop: RoadmapDrop) => void) | undefined;
    /** The key of the row the host's cursor is on (`rowKey`), drawn `data-focused`. */
    cursor?: string | null | undefined;
    /** Where the host hears that focus moved into a row, with its key and the row. */
    onrowfocus?: ((key: string, row: Row) => void) | undefined;
    /**
     * EACH ROW'S DECLARED ACTIONS (the block's `row_actions`) and where a press goes, with the row it was on.
     * Drawn at the row's end only when both are handed; with either absent the row is exactly `toHTML`'s.
     */
    rowActions?: readonly unknown[] | null | undefined;
    act?: OnAct | undefined;
  } = $props();

  const acts = $derived(act !== undefined && Array.isArray(rowActions) && rowActions.length > 0);

  /** The queue this list hands its question to, so `choose` can reach it. */
  let queue = $state<{ choose(i: number, key?: string | null): boolean } | undefined>(undefined);

  /**
   * ANSWER THE QUEUE'S QUESTION WITH ITS OPTION `i` (0 is the first, which the key `1` presses), the question under
   * `key`, or under the host's cursor, or the first. False where this is not a queue or nothing was answered.
   */
  export function choose(i: number, key?: string | null): boolean {
    return queue?.choose(i, key) ?? false;
  }

  const days = $derived(block.kind === 'timeline' ? timelineDays(block.rows) : []);
  /* A TIMELINE'S AMOUNTS AS ONE SET: pence on every one where one has them (`timelineDetails`). */
  const details = $derived(block.kind === 'timeline' ? timelineDetails(block.rows, opts.now, opts.home) : []);
  const grouped = $derived(days.some((d) => d !== null));
  const nets = $derived(block.kind === 'timeline' ? timelineNets(days, details) : []);
  const rich = $derived(block.kind === 'timeline' && timelineRich(block.rows));


  /** One listener on the list, so a row reports focus however deep the control that took it. */
  function focused(e: FocusEvent) {
    const key = (e.target as Element | null)?.closest?.('[data-row]')?.getAttribute('data-row');
    const row = key == null ? undefined : rowAt(block.rows, key);
    if (key != null && row) onrowfocus?.(key, row);
  }

  /* THE STRINGS ARE LOCAL, because `packages/render` depends on nothing and the app's copy file is
     neither reachable from here nor allowed to be. Every other word this package draws is the
     author's; these two are the package's own, and they are the only two. */
  /** The mark a ticked row wears. Two words, past tense, and never a claim about a save. */
  const UNSAVED = 'Not saved';
  /** The accessible name of a box on a row whose title is empty. A control is never unnamed. */
  const TASK = 'Task';
  /** The accessible name of a task's menu control, before the task it is for. */
  const MORE = 'More for';

  /**
   * This session's answers, held BY POSITION beside the document's rather than merged into it.
   *
   * A `todo` row has no key in the dialect, so a position is the only identity there is, and a
   * position is a fact about one document. See `../../src/ticks.ts` for the two rules this keeps.
   */
  let ticks = $state(new Map<number, boolean>());
  /** Roving tabindex: exactly one box is reachable by Tab, every other is -1. */
  let at = $state(0);
  /* The boxes themselves, so a key can move the focus it just moved the tabindex to. A plain array
     and not `$state`: nothing reads these during render. Filled by an attachment, because `bind:this` to
     a plain array warns on every render in dev. */
  let boxes: (HTMLButtonElement | null)[] = [];

  /**
   * THE LEDGER BELONGS TO ONE FENCE, and is dropped when that fence changes.
   *
   * Same shape, and the same reason, as the register list dropping its receipts when the question
   * changes: a mark held by position over rows that are now different rows is a mark about a screen
   * the reader is no longer looking at. It is also what makes a tick that the host DID write
   * disappear quietly, since the row comes back authored `[x]` and the document is the truth again.
   */
  let drawn = $state('');
  $effect(() => {
    if (block.raw === drawn) return;
    drawn = block.raw;
    ticks = new Map();
    at = 0;
  });

  /* A CHIP'S GLYPH THAT ONLY THE SET HOLDS IS ASKED AGAIN ONCE THE SET LANDS, as `Section.svelte`'s well waits on it: a
     chip that asked once would keep its letter for good. A host that still has no drawing then keeps the letter. */
  let landed = $state(0);
  $effect(() => {
    if (!rich) return;
    const waits = block.rows.some((r) => {
      const g = timelineChip(r.cells[TIMELINE_CHIP], '').glyph;
      const glyph = (g && glyphName(g) !== null ? g : null) ?? (opts.partLook?.(text(inline(r.cells[TIMELINE_UNDER[0]] ?? '', opts)))?.glyph ?? null);
      return glyph !== null && glyphWaits(glyph, opts);
    });
    if (waits) void opts.iconSet?.().then(() => landed++, () => {});
  });

  function tick(i: number, row: Row) {
    const next = !tickState(row.done, ticks.get(i)).done;
    ticks = nextTicks(ticks, i, next, row.done === true);
    ontick?.(row, next);
  }

  /* Arrows, `Home` and `End`, and nothing else. Enter and Space are the button's own activation,
     which is the whole reason the box is a `<button>` and not a span with a handler on it: the
     platform's contract needs no keymap entry and cannot drift from one. */
  function key(e: KeyboardEvent, i: number) {
    const to = moveTick(i, e.key, block.rows.length);
    if (to === null) return;
    e.preventDefault();
    at = to;
    boxes[to]?.focus();
  }
</script>

<!-- A ROW'S OWN ACTIONS, AT ITS END: the first shown and the rest in its one menu, each press handed its row. -->
{#snippet rowActs(row: Row)}{#if acts}<div class="item-acts"><Actions actions={rowActions} {row} onact={act} size="row" /></div>{/if}{/snippet}

<!-- `feed` is on this primitive and groups its rows, so it has a drawer of its own, as `cards` does on `grid`, and so
     does `roadmap`, which draws its rows on a time axis rather than as a list of them, and `steps path`. -->
{#if block.kind === 'feed'}
<Feed {block} {opts} {cursor} {onrowfocus} />
{:else if block.kind === 'agents'}
<Agents {block} {opts} />
{:else if block.kind === 'queue'}
<Queue bind:this={queue} {block} {opts} {onact} {cursor} {onrowfocus} {onselect} {selected} />
{:else if block.kind === 'roadmap'}
<Roadmap {block} {opts} {onreschedule} />
{:else if block.kind === 'steps' && block.form === 'path'}
<!-- A path reads its third cell as a mark and its last row as a count, so it is drawn by its own component, and a
     plain `steps` block below still prints that cell as the state it was written as. -->
<Path {block} {opts} />
{:else}
<svelte:element
  this={kindSpec(block.kind, opts.kinds)?.ordered ? 'ol' : 'ul'}
  class="list"
  data-kind={block.kind}
  data-days={grouped ? '' : undefined}
  onfocusin={onrowfocus ? focused : undefined}
>
  {#each block.rows as row, i}
    {@const rowId = rowKey(row, i)}
    {#if block.kind === 'todo'}
      {@const state = tickState(row.done, ticks.get(i))}
      <!-- `working: true`'s dot, on the cell `blocks.ts` marked, which for a todo is its own name. -->
      {@const title = takeWorking(row.cells[0] ?? '')}
      {@const parts = todoTitle(title.text ?? '')}
      {@const lines = todoLines(row.cells, opts.now, row.done === true)}
      {@const meta = lines.meta}
      {@const named = text(inline(title.text ?? '', opts)) || TASK}
      <li class="item" data-menu-host={onmenu ? '' : undefined} data-arrived={row.arrived ? '' : undefined} data-row={rowId} data-focused={cursor === rowId ? '' : undefined}>
        {#if ontick}
          <!-- `role="checkbox"` and not a bare button: what it does is set a state, not run a verb,
               and `aria-checked` is the only way a screen reader is told which state it is in
               before pressing it. The NAME is the task, because "not done" was the name of the
               image and a control named after its own state is a control that reads as
               "not done, checkbox, not checked" and never says what it is about.

               `tap` is the invisible 44px hit box. The drawn box is 17px, which is a target this
               product's own floor refuses, and the friction pass counted 46 of 85 controls under
               24px on the register screen. It costs no layout: the hit area is a pseudo-element. -->
          <button
            type="button"
            role="checkbox"
            class="item-marker tap"
            aria-checked={state.done}
            aria-label={named}
            data-done={state.done ? 'yes' : 'no'}
            tabindex={i === at ? 0 : -1}
            {@attach (el) => {
              boxes[i] = el;
              return () => {
                if (boxes[i] === el) boxes[i] = null;
              };
            }}
            onfocus={() => (at = i)}
            onclick={() => tick(i, row)}
            onkeydown={(e) => key(e, i)}>{state.done ? '✓' : ''}</button
          >
        {:else}
          <span class="item-marker" data-done={row.done ? 'yes' : 'no'} role="img" aria-label={row.done ? 'done' : 'not done'}
            >{row.done ? '✓' : ''}</span
          >
        {/if}
        {#if onopen}
          <!-- THE TITLE OPENS THE TASK, as a button inside the title's own span, so the row's tracks do not move when a
               host passes `onopen`. A link in the title is drawn as its words here: two targets on one line of text is
               a press that lands on the wrong one. Tab reaches it on the one row the box's roving tabindex is on, as it
               does the menu's control, so a long list is still one stop and not two a task. -->
          <span class="item-title"
            ><button type="button" class="item-open" tabindex={i === at ? 0 : -1} onfocus={() => (at = i)} onclick={() => onopen?.(row)}
              >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}{#if parts.rest}<span
                  class="item-words"
                  >{text(inline(parts.head, opts))}<span class="item-title-rest">{' '}{text(inline(parts.rest, opts))}</span></span
                >{:else}{text(inline(title.text ?? '', opts))}{/if}</button
            ></span
          >
        {:else}
          <span class="item-title"
            >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}{#if parts.rest}<span
                class="item-words"
                ><Text nodes={inline(parts.head, opts)} {opts} /><span class="item-title-rest">{' '}<Text nodes={inline(parts.rest, opts)} {opts} /></span></span
              >{:else}<Text nodes={inline(title.text ?? '', opts)} {opts} />{/if}</span
          >
        {/if}
        <!-- MONEY IN IS MARKED AS THE LEDGER MARKS IT (recheck of 30 October, 18): a bill's "−£9,190" and an invoice's
             "+£4,800" read alike in grey. -->
        <span class="item-detail" data-sign={timelineIn(lines.detail) ? 'in' : undefined}><Text nodes={inline(lines.detail, opts)} {opts} /></span>
        <!-- THE THIRD AND FOURTH CELLS, when the row carries either, as one quiet line: when it falls due and who
             changed it last, on Work's Waiting on you. Outside the box's name on purpose, which stays the task. And
             before the unsaved mark, so a reader hears the row's facts before what this session did to it. -->
        {#if meta.length}
          <span class="item-meta"
            >{#each meta as part, n}{#if n > 0}{TODO_META_JOIN}{/if}<Text nodes={inline(part, opts)} {opts} />{/each}</span
          >
        {/if}
        <!-- THE ROW STAYS, WEARING WHAT HAPPENED TO IT, AND THE WAY BACK IS THE BOX.
             Thirteen of eighty-five human writes in the record this product is modelled on reversed
             the write immediately before them, twelve of those inside five seconds, because the row
             vanished and the only way to check you had hit the right one was to do the opposite and
             look. Nothing here removes or reorders a ticked row. No confirmation dialog either, on
             purpose: it asks before anything has happened, when the reader knows the least they ever
             will, and the answer is always yes.

             AND IT SAYS NOTHING WAS WRITTEN. The data layer behind this is a synchronous mock over a
             seed, so the mark wears `warn` and the words in the same spirit as the register list's
             receipt chip. The state slot has been in this primitive's header since it was written
             and `todo` had never used it, so this costs no track and no rule. -->
        {#if state.unsaved}
          <span class="item-state" data-intent="warn">
            <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
            {UNSAVED}
          </span>
        {/if}
        {@render rowActs(row)}
        {#if onmenu}
          <!-- LAST, AND QUIET: three dots that wait for the pointer or the keyboard to reach the row (`data-calm`), named
               for the task, with the 44px hit box the tick has. -->
          <button
            type="button"
            class="item-more tap"
            data-calm=""
            aria-haspopup="menu"
            aria-label="{MORE} {named}"
            tabindex={i === at ? 0 : -1}
            onfocus={() => (at = i)}
            {@attach pointed((p) => onmenu?.(row, document.body, p))}
            onclick={(e) => onmenu?.(row, e.currentTarget)}
            ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"
              ><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg
            ></button
          >
        {/if}
      </li>
    {:else if block.kind === 'timeline'}
      {@const title = takeWorking(timelineTitle(row.cells[1]))}
      {@const day = days[i] ?? null}
      {@const net = nets[i] ?? null}
      {@const said = details[i] ?? ''}
      <!-- A GROUPED TIMELINE SAYS EACH DAY ONCE, as a small heading over its rows, and the rows under it leave their own
           date blank (`../../src/timeline.ts`). The heading is an item, so the list stays a list of its children. It says
           the weekday, and the day's net at its end where the day's lines are in one currency (`timelineNets`). -->
      {#if day !== null}<li class="item-day num"
          ><span class="item-day-name"><Text nodes={inline(timelineDayHead(day, opts.now), opts)} {opts} /></span
          >{#if net}<span class="item-day-net">{net}</span>{/if}</li
        >{/if}
      {#if rich}
        <!-- THE MONEY ROW (`timelineRich`): the chip, the title, the amount, and under them the quiet line and the amount
             restated in the home currency where the host can say it (`opts.approx`). `html.ts` draws the same tree. -->
        {@const chip = timelineChip(row.cells[TIMELINE_CHIP], text(inline(title.text ?? '', opts)), text(inline(row.cells[TIMELINE_UNDER[0]] ?? '', opts)))}
        {@const own = chip.glyph && glyphName(chip.glyph) !== null ? chip.glyph : null}
        {@const look = !own && !chip.unfiled && opts.partLook ? opts.partLook(text(inline(row.cells[TIMELINE_UNDER[0]] ?? '', opts))) : null}
        {@const art = (own ?? look?.glyph) ? (void landed, glyphPath((own ?? look?.glyph)!, opts)) : null}
        {@const approx = said && opts.approx ? opts.approx((row.cells[2] ?? '').trim()) : null}
        <li class="item" data-menu-host={onmenu ? 'self' : undefined} {@attach onmenu && pointed((p) => onmenu?.(row, document.body, p))} data-rich="" data-intent={row.tone} data-arrived={row.arrived ? '' : undefined} data-row={rowId} data-focused={cursor === rowId ? '' : undefined}>
          <span class="item-chip" data-slot={chip.colour ?? look?.slot ?? undefined} data-unfiled={chip.unfiled ? '' : undefined} title={chip.unfiled ? UNFILED_HINT : undefined} aria-hidden="true"
            >{#if art}<svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"><path d={art}></path></svg
              >{:else}{chip.unfiled ? '?' : chip.letter}{/if}</span
          >
          <span class="item-title"
            >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
              nodes={inline(title.text ?? '', opts)}
              {opts}
            />{#if row.tone}{' '}<span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}</span
          >
          <span class="item-detail" data-sign={timelineIn(said) && !chip.between ? 'in' : undefined}><Text nodes={inline(said, opts)} {opts} /></span>
          <span class="item-under"><Text nodes={inline(timelineUnder(row.cells, opts.now, grouped), opts)} {opts} /></span>
          {#if approx}<span class="item-approx num">{approx}</span>{/if}
          {@render rowActs(row)}
        </li>
      {:else}
      <!-- A DETAIL OF WORDS IS MARKED (`timelineWordy`), so a phone puts it under its title (`kinds/timeline.css`). -->
      <li class="item" data-menu-host={onmenu ? 'self' : undefined} {@attach onmenu && pointed((p) => onmenu?.(row, document.body, p))} data-intent={row.tone} data-arrived={row.arrived ? '' : undefined} data-row={rowId} data-focused={cursor === rowId ? '' : undefined} data-wordy={timelineWordy(said) ? '' : undefined}>
        <!-- The date cell goes through the inline renderer like every other cell. It did not, and a
             timeline written with `{{ago:…}}` — which is how you write one that stays true — printed
             its own source. -->
        <span class="item-marker num">{#if !grouped}<Text nodes={inline(timelineCell(row.cells[0], opts.now), opts)} {opts} />{/if}</span>
        <!-- The glyph sits with the TITLE, not at the far edge of the row. A tone belongs to the
             thing it qualifies, and five hundred pixels away it belongs to nothing — the same
             finding the stat cell's layout is built on (13 §2.3). -->
        <span class="item-title"
          >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
            nodes={inline(title.text ?? '', opts)}
            {opts}
          />{#if row.tone}{' '}<span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}</span
        >
        <!-- Each cell as it is said (`timelineCell`): a day this year without its year, an amount of nothing not at all. -->
        <span class="item-detail" data-sign={timelineIn(said) ? 'in' : undefined}><Text nodes={inline(said, opts)} {opts} /></span>
        {@render rowActs(row)}
      </li>
      {/if}
    {:else}
      {@const title = takeWorking(row.cells[0] ?? '')}
      <li class="item" data-menu-host={onmenu ? 'self' : undefined} {@attach onmenu && pointed((p) => onmenu?.(row, document.body, p))} data-arrived={row.arrived ? '' : undefined} data-row={rowId} data-focused={cursor === rowId ? '' : undefined}>
        <span class="item-title"
          >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text nodes={inline(title.text ?? '', opts)} {opts} /></span
        >
        <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
        <span class="item-state"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
        {@render rowActs(row)}
      </li>
    {/if}
  {/each}
</svelte:element>
{/if}

<style>
  /* A ROW WITH ITS OWN ACTIONS TAKES A TRACK at the end of its first line for them, after the state and before a task's
     menu, so nothing else on the row moves. Here and not in the skin, because only this component draws the slot. Global, so
     no scoping class lands on a row `toHTML` draws too and the two trees stay equal. */
  :global(.list > .item:has(> .item-acts)) {
    grid-template-areas:
      'marker title state acts'
      '. detail detail detail'
      '. meta meta meta';
    grid-template-columns: auto minmax(min(16ch, 100%), 1fr) auto auto;
  }

  :global(.list > .item:has(> .item-acts):not(:has(> .item-marker))) {
    grid-template-areas:
      'title state acts'
      'detail detail detail'
      'meta meta meta';
    grid-template-columns: minmax(min(16ch, 100%), 1fr) auto auto;
  }

  :global(.list > .item:has(> .item-acts):has(> .item-more)) {
    grid-template-areas:
      'marker title state acts more'
      '. detail detail detail detail'
      '. meta meta meta meta';
    grid-template-columns: auto minmax(min(16ch, 100%), 1fr) auto auto auto;
  }

  :global(.list > .item > .item-acts) {
    grid-area: acts;
    align-self: center;
  }

  /* A LEDGER'S MONEY ROW (`data-rich`) KEEPS ITS CHIP AND ITS TWO LINES, with the actions across both at its end. */
  :global(.list > .item[data-rich]:has(> .item-acts)) {
    grid-template-areas:
      'chip title detail acts'
      'chip under approx acts';
    grid-template-columns: calc(var(--well) + var(--sp-1)) minmax(0, 1fr) auto auto;
  }
</style>
