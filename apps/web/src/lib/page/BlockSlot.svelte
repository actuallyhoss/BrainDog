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
  import { at as inApp } from '../at.ts';
  import { Block, Degraded, Markdown, Table, Text } from 'braindog-render/svelte';
  import { inline, text } from 'braindog-render';
  import QueueAnswer from './QueueAnswer.svelte';
  import { queueMore } from 'braindog-render';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { said as voiceSaid } from '$lib/voice.svelte.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { draw, saidPlainly, walkTables } from '$lib/record/blocks.ts';
  import { joinsWithOr, registerHref } from '$lib/record/where.ts';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { fileAt, resolverOf, type LiveBlock } from '$lib/record/page-live.ts';
  import { glyphSetNow, isGlyph, pathOf } from '$lib/ui/icons.ts';
  import { liveOf } from '../ui/face.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Actions from './panels/Actions.svelte';
  import ActionRows from './panels/ActionRows.svelte';
  import Reporting from './panels/Reporting.svelte';
  import { panelOf } from './panels/panel-of.ts';
  import type { Writes } from './page-writes.ts';
  import AddStep from './AddStep.svelte';

  let {
    block,
    i,
    ids = '',
    writes,
    param,
    arranging = false,
    now,
    level = 2,
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
  } = $props();

  /* A `{{path}}` IS ANSWERED BY THE RECORD on the block's `values`; a missing value is marked. `now` is the clock the
     rows were read against, so `{{ago:}}` agrees with the dates beside it. No `hole` is handed over, so a value the
     record cannot answer is marked and not pressable: nobody can supply a declared figure from this screen. */
  /* A FIGURE IN A SENTENCE READS AS MONEY, `£7,200.00` and not `GBP 7,200.00`, as the cells beside it do. */
  const said = (text: string | null): string | null => (text === null ? null : symbolText(text, homeCurrency()));

  /* A GLYPH NAMED IN TEXT IS DRAWN BY THE HOST, because the renderer ships no glyph art (05 §3): the path for a name this
     build draws, or nothing, and the renderer then keeps its named, empty slot. A name in the set that has not arrived
     yet draws nothing for now, as an `Icon` does. */
  const icon = (name: string): string | null => (isGlyph(name) ? (pathOf(name, glyphSetNow()) ?? null) : null);

  /* THE HEADING AS A TABLE'S ACCESSIBLE NAME: its words without a glyph's braces (`text` drops an icon to nothing). */
  const headingText = $derived(block.heading ? text(inline(block.heading)).trim() : undefined);

  /* Where each file the block holds is served, record-relative (`page-live.ts` `fileAt`), read by `opts.file` below. */
  const filed = $derived(fileAt(block));

  const opts = $derived({
    resolve: (path: string) => said(resolverOf(block.values)(path)),
    now,
    /* A forecast's knobs and its readout: arithmetic over the walk already on the page, kept in memory. */
    scenario: true,
    /* EVERY LINK THE RENDERER DRAWS, under the app: the record writes `/decide`, and the tab is on `/app/<slug>`. */
    href: inApp,
    icon,
    /* A FIGURE IS A DOOR, and the address is the metric's own: `hrefFor` derives it from the same predicate the figure
       is computed over, so a tile and the list it opens cannot disagree. */
    cellHref: (n: number) => block.metrics?.[n]?.href ?? null,
    /* WHERE A ROW APPLIES, AS A CHIP, in a card grid's scope facts (`page-live.ts` `scopeCells`). */
    ...(block.scopeCells ? { scope: block.scopeCells } : {}),
    /* A RUN'S FACE, ON A CARD OF RUNS: the run and whether it is working, gone quiet or stopped, so
       `Cards.svelte` draws the run's glyph in the `who` cell instead of a plain initial. */
    ...(block.source === 'sessions.live' && block.entries
      ? { runs: block.entries.map((e, n) => ({ run: `S${e.seq}`, agent: typeof e.fields.agent === 'string' ? e.fields.agent : null, live: liveOf(e.fields.state, block.quiet?.[n] === true) })) }
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

  /* The panel the host draws under this block, by the name the section gives it (`panel-of.ts`). */
  const panel = $derived(panelOf(block));

  /* WHAT THE BLOCK'S LIST HOLDS, when it holds nothing yet. 19 §6 names five empty states and says collapsing them into
     one is the failure; a filter that matched nothing and a list with nothing in it are different facts, and the
     second is the one somebody can act on. The list's size is known only when the block reads all of it. */
  const held = $derived(block.register && !block.where ? REGISTERS[block.register] : undefined);
  const drawn = $derived(
    draw(
      block,
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
    ),
  );
</script>

<header class="block-bar">
  <!-- THE TILE'S HEADING ROW: the block's own glyph in its well when it declares one, the name, and where
       its rows live at the right. A BLOCK WITH NO AUTHORED `heading:` PRINTS ITS KIND'S NAME, never its dialect id: an
       id is what an agent writes into a declaration, a name is what a person reads. AN AUTHORED ONE IS READ AS TEXT, so
       `{{icon:rocket}} shipped` draws the rocket rather than its braces. -->
  {#if block.icon && isGlyph(block.icon)}<IconWell name={block.icon} />{/if}
  <svelte:element this={level === 3 ? 'h3' : 'h2'} class="block-name" id="{ids}h-{i + 1}"
    >{#if block.heading}<Text nodes={inline(block.heading, { icon })} opts={{ icon }} />{:else}{copy.kindNames[block.kind] ?? block.kind}{/if}</svelte:element
  >
  {#if block.register}
    <!-- THE LIST'S NAME, not its id. The predicate stays, because without it a reader has no way to know the list is
         filtered and may take a block of four rows for the whole list; the clause that names the page they are on is
         dropped. AS A GLYPH, AND THE CLAUSE IS STILL THERE: printed in full it read as a debug line and pushed a
         two-word heading onto two lines, so the filter glyph says the list is narrowed and the tooltip and a screen
         reader get the whole clause. -->
    <a class="block-source tap" href={inApp(openHref(block) ?? `/r/${block.register}`)} title={whereOf(block) || undefined}>
      {REGISTERS[block.register]?.name ?? block.register}
      {#if whereOf(block)}
        <Icon name="filter" size="s" />
        <span class="block-where"><span class="block-where-lead">{copy.filter}</span> {whereOf(block)}</span>
      {/if}
    </a>
  {/if}
</header>

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
{:else if block.kind === 'table' && !block.answer && walkTables(block)}
  <!-- A TABLE OVER A WALK DRAWN ONCE PER CURRENCY: each currency's rows under its code, and why, once. -->
  {#each walkTables(block) ?? [] as part}
    {#each part.said as segment}{#if segment.type === 'markdown'}<div class="document"><Markdown {segment} opts={{ href: inApp }} /></div>{/if}{/each}
    {#if part.table}<Table columns={part.table.columns} rows={part.table.rows} total={part.table.total} label={headingText} href={inApp} />{/if}
  {/each}
{:else if block.kind === 'table' && !block.answer}
  <!-- THE ROWS THAT ARRIVED SINCE IT WAS LAST DRAWN ARE MARKED, as a list's are, where the page can write. -->
  <Table columns={block.columns} rows={writes ? writes.arrivedTable(i, block.rows, block) : block.rows} total={block.total} label={headingText} href={inApp} scope={block.scopeCells} />
{:else if block.kind === 'queue' && block.queue && block.queue.length > 0 && writes}
  <!-- A QUESTION IS ANSWERED WHERE IT IS SHOWN (`QueueAnswer.svelte`): one card a question, and the count of what is left is still the door to Decide. -->
  <div class="queue">
    {#each block.queue as question (question.id)}<QueueAnswer {question} onanswered={() => {}} />{/each}
    {#if block.total > block.queue.length}<a class="queue-more" href={inApp('/decide')}>{queueMore(block.total - block.queue.length)}</a>{/if}
  </div>
{:else}
  {#each drawn.segments as segment}
    {#if segment.type === 'block'}
      <!-- A ROW SOMEBODY JUST TICKED OR MOVED IS WHERE THEY LEFT IT, and each gesture is handed the rows as drawn,
           because that is the list its place is found in. THE PRIMITIVE DRAWS A CONTROL ONLY FOR A CALLBACK IT IS
           HANDED, so a board, a checklist, a roadmap and a queue are each read-only exactly where `writes` is null. -->
      <!-- `w` IS A CONSTANT so each callback below keeps the narrowing it was built under. -->
      {@const w = writes}
      {@const shown = w ? w.keptSegment(i, segment, block) : segment}
      <Block
        block={shown}
        {opts}
        onmove={w ? (row, to) => w.moveCard(block, row, to, i, shown.rows) : undefined}
        ontick={w ? (row, done) => w.tickTask(block, row, done, i, shown.rows) : undefined}
        onreschedule={w ? (row, drop) => void w.rescheduleBar(block, row, drop, i, shown.rows) : undefined}
        oncapture={w && w.capturable(block) ? w.captureLine : undefined}
        oninput={w && typable ? w.typeInto : undefined}
        onpath={w ? (row, done) => w.onpath(block, row, done, i, shown.rows) : undefined}
      />
      {#if w && segment.kind === 'steps' && w.stepable(block)}<AddStep {block} writes={w} />{/if}
      <!-- WHAT THE RECORD REFUSED ABOUT A FIELD IS SAID UNDER ITS BLOCK, named by the field's label, until that field is
           written. -->
      {#if segment.kind === 'inputs' && w}
        {#each shown.rows as r}
          {@const fix = w.saidOf(r)}
          {#if fix}<p class="block-said" role="status" data-intent="bad">{r.cells[1]}: {fix}</p>{/if}
        {/each}
      {/if}{:else if segment.type === 'degraded'}<Degraded {segment} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} opts={{ href: inApp }} /></div>{/if}
  {/each}
{/if}

<!-- THE PANEL THE HOST DRAWS UNDER A SECTION THAT NAMES ONE (`panel-of.ts`), for the row the page is about, and only
     the one it names: the project's scheduled actions under `panel: actions`, the key its numbers are sent with under
     `panel: reporting`. The actions panel drew the key as well, so a founder's project page, which names both, drew
     the key twice. Not while arranging, since a list that fetches is not a block to move, and not on an inert page,
     since the key's panel makes one. -->
{#if panel && param && writes && !arranging}
  <!-- BY THE ROW, `things#1`, and not by its title: the record resolves each action's project to its row. -->
  {#if panel === 'actions'}<Actions project={{ spoken: `${param.register}#${param.seq}`, title: param.title }} />
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
{#if !drawn.refusal && !block.cannot && block.kind !== 'queue' && block.total > block.shown}
  {@const to = openHref(block)}
  <p class="block-slice" role="status">
    {block.source === 'forecast.runway'
      ? copy.ofWhichWalked(block.shown, block.total, typeof block.walk?.horizon === 'number' ? block.walk.horizon : typeof block.horizon === 'number' ? block.horizon : 180)
      : copy.ofWhichDrawn(block.shown, block.total)}.{#if to}{' '}
      <a class="tap" href={inApp(to)}>{copy.openTheRest(REGISTERS[block.register!]?.name ?? block.register!)}</a>
    {/if}
  </p>
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
