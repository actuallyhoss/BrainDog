<!--
  A shared page, `/s#<token>`: one page of a record, read-only, for whoever holds the link.

  A SHARE LINK IS A CAPABILITY URL (19 §5): signed, read-only, scoped to one page, and closed for good when its owner
  closes it. THE TOKEN IS IN THE FRAGMENT, which no browser sends to a host and no log keeps, and it is read once and
  wiped from the address bar (`reading.ts` `takeShared`), as an invitation is. The record answers it through
  `sharedPage`, asked with the link and no other credential (`share-write.ts` `readShared`), and the answer is the page
  as its owner could read it now, one level deep: no row's id, no list's name, no link into the record and nothing that
  writes.

  SO THIS DRAWS ITS OWN BLOCKS AND NOT `PageBody`'s. A shared block carries the owner's words, the columns' labels, each
  drawn field as a typed cell and the figures, and every one of them is drawn in the record's language and zone, which
  the answer carries, so a stranger's device never decides how an amount or a day reads.

  THE LOOK IS THE BOARD'S: a flat bar with the mark, the name and what the link is; the page's name at 28
  and one sentence at 17; the owner's blocks as flat tiles on twelve columns, and "Made with BrainDog" at the foot.

  NO RAIL AND NO PALETTE: the root layout draws `/s` bare. A LINK THAT DOES NOT OPEN SAYS THE PAGE IS NOT SHARED AND NOT
  WHY: closed, run out, a page that is gone and a forged link are one answer at the record, so they are one sentence here.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { dateSaid, parse } from 'braindog-render';
  import { Block, Markdown, Table } from 'braindog-render/svelte';
  /* THE KINDS' AND THE CHARTS' SHEETS, as a declared page loads them (`PageView`), so a note's bar is bars here too. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import { titleOf } from '$lib/title.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { readShared, words, type SharedProject, type SharedRead } from '$lib/record/share-write.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Lockup from '$lib/ui/Lockup.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { openOutside } from '$lib/shell.ts';
  /* The href stays for the context menu and screen readers; the click goes through the one door. */
  const outside = (e: MouseEvent) => {
    e.preventDefault();
    openOutside('https://brain.dog');
  };
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { areasOf, headOf, noteOpts, plainSaid, shownBlocks, takeShared, type Shown, type Where } from './reading.ts';
  import { MediaQuery } from 'svelte/reactivity';
  import { boardRail, leadChartAt } from '$lib/page/layout.ts';
  import { drawingOf } from './drawing.ts';
  import { isGlyph, pathOf, glyphSet, glyphSetNow } from '$lib/ui/icons.ts';
  import { agentKindOf } from '$lib/ui/face.ts';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';

  /* THE ONE WORD THIS SCREEN ADDS: the action under a dead link. The rest are `share-write.ts`'s. */
  /* AND SIGN IN BESIDE IT (the lists review, L41): somebody who has a BrainDog of their own was offered only the site. */
  const shareWords = { whatItIs: 'See what BrainDog is', signIn: 'Sign in' };

  /* THE LINK, HELD IN THIS PAGE'S MEMORY ONLY: never in the address, never printed, never logged. */
  let token = '';
  let got = $state<SharedRead | null>(null);
  let now = $state(Date.now());

  async function read() {
    const at = opened();
    got = null;
    /* `/s` names no record (`RECORDLESS` in `lib/at.ts`), so `apiBase()` answers the bare origin here. */
    const out = await readShared(apiBase(), token);
    now = Date.now();
    got = out;
    /* A LINK THAT DOES NOT OPEN IS AN ANSWER, not a failure: the record was asked and said no, and the screen draws that
       as its designed empty state. Only a record nobody reached refuses the screen. */
    closed(out.from !== 'unreached', at);
  }

  /* ONCE, ON ARRIVAL: the fragment is taken and the address wiped before anything is asked. */
  $effect(() => {
    token = takeShared(location.hash, () => history.replaceState(history.state, '', `${location.pathname}${location.search}`));
    untrack(() => void read());
  });

  $effect(() => {
    if (got?.from === 'live') drew('ready');
  });

  /* THE RECORD'S CLOCK, LANGUAGE AND ZONE: "3d ago" is counted from when the owner's record was read, in its zone. */
  const where = $derived.by((): Where => {
    if (got?.from !== 'live') return { language: 'en', zone: 'UTC', now, home: null };
    const t = got.page.read_at === null ? Number.NaN : Date.parse(got.page.read_at);
    return { language: got.page.language, zone: got.page.zone, now: Number.isFinite(t) ? t : now, home: got.page.home };
  });

  const head = $derived(got === null ? null : headOf(got));

  /* A DAY IN THE RECORD'S ZONE, said as the app says one ("14 Nov"), for a project's work and what happened on it. */
  const daySaid = (iso: string): string => {
    const day = /^\d{4}-\d{2}-\d{2}$/u.test(iso)
      ? iso
      : (() => {
          const t = Date.parse(iso);
          if (!Number.isFinite(t)) return iso.slice(0, 10);
          const parts = new Intl.DateTimeFormat('en-CA', { timeZone: where.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
          const get = (k: string) => parts.find((x) => x.type === k)?.value ?? '';
          return `${get('year')}-${get('month')}-${get('day')}`;
        })();
    return dateSaid(day, where.now);
  };
  const openCount = (pr: SharedProject): number => pr.work.reduce((n, w) => n + w.open.length + w.more, 0);

  /* TWO COLUMNS FROM 900 UP, as the owner's page (`PageBody.svelte`'s `wide`). */
  const wide = new MediaQuery('(width >= 900px)', true);

  /* WHAT THE PAGE DRAWS: its opening line under its name, and each block that has something to show (`shownBlocks`). */
  const shown = $derived(got?.from === 'live' ? shownBlocks(got.page.blocks, where) : { lead: null, blocks: [] as Shown[] });

  /**
   * THE OWNER'S NOTE, DRAWN AS THE APP DRAWS IT: the same parser and the same blocks a project's page uses, so a fence is
   * its chart, its chips or its steps and never its source. A fence the renderer could not read is left out, since its
   * source is for the owner to mend and not for whoever holds the link. Nothing in it links into the record (`noteOpts`):
   * a link the owner wrote to a path of the record is drawn as its words. The answer names no other page's link, so no
   * path is linked as one that is shared too.
   */
  const segmentsOf = (body: string) => parse(body, { page: true }).filter((s) => s.type !== 'degraded');
  /* AND AS THE APP'S BLOCKS ARE HANDED THEM (`BlockSlot.svelte`): a glyph by its name, and an agent's mark on a card's
     face ("Claude"), from the same set the app's faces draw. Neither reads the record. */
  const opts = $derived({
    ...noteOpts(where),
    icon: (name: string): string | null => (isGlyph(name) ? (pathOf(name, glyphSetNow()) ?? null) : null),
    iconSet: glyphSet,
    agentMark: (name: string) => {
      const k = agentKindOf(name);
      return isMarked(k) ? AGENT_MARKS[k] : null;
    },
  });
</script>

<svelte:head>
  <title>{titleOf(got?.from === 'live' ? got.page.title : 'Shared')}</title>
  <!-- THE LINK IS THE CREDENTIAL, and a `Referer` would carry it to wherever the reader goes next. -->
  <meta name="referrer" content="no-referrer" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet blockBody(s: Shown)}
  {@const b = s.block}
  {@const cols = s.columns}
  {#if b.refused}<p class="part-note">{b.refused}</p>{/if}
  {#if b.body}
    <div class="document note">
      {#each segmentsOf(b.body) as segment, n (n)}
        {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'markdown'}<Markdown {segment} {opts} />{/if}
      {/each}
    </div>
  {/if}

  <!-- THE FIGURES, THE CARDS AND THE LISTS AS THE APP DRAWS THEM (SL1, `drawing.ts`): the renderer's own `stat`, `cards`,
       `todo`, `roadmap` and the rest through `Block`, and a list with columns through its `Table`, a card a row on a phone.
       Nothing in them is pressable or leads into the record: no row carries a reference and no callback is handed. -->
  {@const d = drawingOf(s, where)}
  {#each d.segments as segment, n (n)}
    {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} {opts} /></div>{/if}
  {/each}

  {#if d.authored}
    <table class="sheet">
      <tbody>
        {#each b.authored as cells, n (n)}
          <tr>{#each cells as c, k (k)}<td class="sheet-cell">{plainSaid(c, where)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- NO `home`: every amount is already said as the app says it (`tableOf`), whole where its column is, and the table
       writing it again against the home currency put the pence back on every line ("EGP 1,350.00"). -->
  {#if d.table}
    <Table columns={d.table.columns} rows={d.table.rows} total={d.table.rows.length} label={b.heading ?? copy.kindNames[b.kind]} now={where.now} />
  {/if}
  {#if s.rows.length > 0 && s.matched > s.rows.length}<p class="part-note">{words.sharedMore(s.matched - s.rows.length)}</p>{/if}
{/snippet}

{#snippet tiles(list: Shown[], at: string)}
  {#each list as s, i (i)}
    {#if s.block.kind === 'section'}
      <!-- A SECTION IS THE NAME OF WHAT FOLLOWS IT, as on the owner's page: a heading on the board, not a tile. -->
      <h2 class="section-head">{s.block.heading}</h2>
    {:else}
      {@const b = s.block}
      <section class="part tile" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-${at}${i}` : undefined} aria-label={b.heading ? undefined : copy.kindNames[b.kind]}>
        {#if b.heading}<h2 class="part-head" id="shared-{at}{i}">{b.heading}</h2>{/if}
        {@render blockBody(s)}
      </section>
    {/if}
  {/each}
{/snippet}

<div class="shared">
  <!-- FLAT, ON THE BOARD: the mark, the name, and what this link is in words. -->
  <header class="bar">
    <Lockup />
    <!-- ONLY OVER A PAGE THAT IS SHARED (today F15): a dead link says so in its body, under no chip saying it is shared. -->
    {#if got?.from === 'live'}<span class="what"><Icon name="eye" size="s" /><span class="what-word">{words.sharedChip}</span></span>{/if}
  </header>

  {#if got === null || head === null}
    <Waiting head />
  {:else if got.from === 'shut'}
    <!-- NO REASON, AND ONE ACTION: the person holding a dead link cannot mend it from here, so the one thing offered is
         where it came from, the product, rather than an empty end. -->
    <div class="gone">
      <Empty kind="no-permission" heading glyph="link" title={head.title} body={head.line}>
        {#snippet actions()}<Button href="https://brain.dog" onclick={outside}>{shareWords.whatItIs}</Button><Button weight="bare" href="/signin">{shareWords.signIn}</Button>{/snippet}
      </Empty>
    </div>
  {:else if got.from === 'unreached'}
    <!-- THE TRANSPORT'S WORDS FOLD UNDER DETAILS, never as the sentence: they are for whoever reports the fault. -->
    <div class="gone">
      <Empty kind="error" heading title={head.title} detail={got.why}>
        {#snippet actions()}<Button onclick={() => void read()}>{words.sharedRetry}</Button>{/snippet}
      </Empty>
    </div>
  {:else}
    {@const p = got.page}
    {@const pr = p.project}
    {@const leadLine = shown.lead ?? (pr ? words.projectOpen(openCount(pr), pr.work[0]?.one ?? 'task', pr.work[0]?.many ?? 'tasks', pr.name) : null)}
    <article class="page" aria-labelledby="shared-title" lang={p.language}>
      <div class="head">
        <h1 class="title" id="shared-title">{head.title}</h1>
        {#if leadLine}<p class="lead">{leadLine}</p>{/if}
        <p class="until">{head.line}</p>
      </div>

      {#if pr}
        <!-- A PAGE OF ONE PROJECT (collab pass 2, 2 Nov): what a stranger may read of it, as the owner's page lays it out:
             where it stands and its work on the left, what happened and its note beside them; one column on a phone. -->
        <div class="proj">
          <div class="proj-main">
            {#if pr.lane || pr.about || pr.next}
              <Tile lead icon="thing" title={words.projectStands} meta={pr.lane ?? undefined}>
                {#if pr.about}<p class="proj-about">{pr.about}</p>{/if}
                {#if pr.next}
                  <div class="proj-next">
                    <span class="proj-label">{words.projectNext}</span>
                    <p class="proj-step"><span class="proj-tick" aria-hidden="true"><Icon name="circle" size="s" /></span><span>{pr.next}</span></p>
                  </div>
                {/if}
              </Tile>
            {/if}
            {#each pr.work as w, wi (wi)}
              <Tile icon="task" title={words.projectOpenHead(w.list)} count={w.open.length + w.more > 0 ? words.projectOpenCount(w.open.length + w.more) : undefined}>
                {#if w.open.length === 0}
                  <p class="proj-quiet">{words.projectNoneOpen(w.many)}</p>
                {:else}
                  <ul class="proj-rows">
                    {#each w.open as t, ti (ti)}
                      <li class="proj-row">
                        <span class="proj-tick" aria-hidden="true"><Icon name="circle" size="s" /></span>
                        <span class="proj-what"><span class="proj-title">{t.title}</span>{#if t.state}<span class="proj-meta">{t.state}</span>{/if}</span>
                        {#if t.due}<span class="proj-when num">{words.projectDue(daySaid(t.due))}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                  {#if w.more > 0}<p class="proj-quiet">{words.sharedMore(w.more)}</p>{/if}
                {/if}
                {#if w.done.length > 0}
                  <div class="proj-done">
                    <h3 class="proj-label">{words.projectDone}</h3>
                    <ul class="proj-rows">
                      {#each w.done as t, ti (ti)}
                        <li class="proj-row is-done">
                          <span class="proj-tick good" aria-hidden="true"><Icon name="check" size="s" /></span>
                          <span class="proj-what"><span class="proj-title">{t.title}</span></span>
                          {#if t.on}<span class="proj-when num">{daySaid(t.on)}</span>{/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </Tile>
            {/each}
          </div>
          {#if pr.happened.length > 0 || pr.notes || pr.money.length > 0}
            <div class="proj-rail">
              {#if pr.money.length > 0}
                {@const [first, ...rest] = pr.money}
                <!-- ITS MONEY, only on a link that carries money (leftovers 4): the owner's Money tile, its first figure
                     large and the rest as lines, every amount said by the record. -->
                <Tile icon="money" title={words.projectMoney}>
                  <p class="proj-figure"><span class="proj-big num">{first!.said}</span><span class="proj-figure-label">{first!.label.toLowerCase()}</span></p>
                  {#if rest.length > 0}
                    <ul class="proj-rows">
                      {#each rest as m (m.key)}
                        <li class="proj-line proj-money"><span class="proj-said">{m.label}</span><span class="proj-amount num">{m.said}</span></li>
                      {/each}
                    </ul>
                  {/if}
                </Tile>
              {/if}
              {#if pr.happened.length > 0}
                <Tile icon="history" title={words.projectHappened}>
                  <ul class="proj-rows">
                    {#each pr.happened as h, hi (hi)}
                      <li class="proj-line"><span class="proj-day num">{daySaid(h.at)}</span><span class="proj-said">{h.said}</span></li>
                    {/each}
                  </ul>
                </Tile>
              {/if}
              {#if pr.notes}
                <Tile icon="doc" title={words.projectNotes}>
                  <div class="document note">
                    {#each segmentsOf(pr.notes) as segment, n (n)}
                      {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'markdown'}<Markdown {segment} {opts} />{/if}
                    {/each}
                  </div>
                </Tile>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if pr && shown.blocks.length === 0}
        <!-- The project said it all: no line saying the page has nothing. -->
      {:else if p.empty || shown.blocks.length === 0}
        <section class="part tile"><p class="part-body">{p.empty ?? words.sharedNothing}</p></section>
      {:else}
        {@const areas = areasOf(shown.blocks, p.layout)}
        {#if areas.rail === null || p.layout === null}
          <div class="blocks">{@render tiles(areas.main, 'm')}</div>
        {:else}
          <!-- THE OWNER'S SIDE RAIL, KEPT (SB3): two columns from 900 up, the board's own two thirds and a third
               (`boardRail`), and one under it with the rail first, as the owner's page reads on a phone, the chart the
               main column opens on before it (`leadChartAt`). In the markup, so Tab meets them as the eye does. -->
          {@const spans = boardRail(p.layout)}
          {@const lead = wide.current ? -1 : leadChartAt(areas.main.map((s) => ({ kind: s.block.kind, drawn: true, lead: s.block.lead })))}
          <div class="areas" style:--main={spans.main} style:--rail={spans.rail}>
            {#if wide.current}
              <div class="blocks area-main">{@render tiles(areas.main, 'm')}</div>
              <div class="blocks area-rail">{@render tiles(areas.rail, 'r')}</div>
            {:else}
              {#if lead >= 0}<div class="blocks">{@render tiles(areas.main.slice(lead, lead + 1), 'l')}</div>{/if}
              <div class="blocks area-rail">{@render tiles(areas.rail, 'r')}</div>
              <div class="blocks area-main">{@render tiles(lead >= 0 ? areas.main.filter((_, n) => n !== lead) : areas.main, 'm')}</div>
            {/if}
          </div>
        {/if}
      {/if}
    </article>
  {/if}

  <footer class="made">
    <a class="made-link" href="https://brain.dog" rel="noreferrer" onclick={outside}><Mark height={14} />{words.sharedMade}</a>
  </footer>
</div>

<style>
  /* THE WHOLE WINDOW ON THE BOARD: the gutter at the sides (16 on a phone), clear of the notch and the home indicator.
     No cap and no centred column: the blocks run on twelve columns to the gutters. */
  .shared {
    display: grid;
    align-content: start;
    gap: var(--sp-6);
    box-sizing: border-box;
    min-block-size: 100dvh;
    padding: calc(var(--inset) + env(safe-area-inset-top)) var(--gutter) calc(var(--sp-5) + env(safe-area-inset-bottom));
    background: var(--board);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* `Waiting` pays the gutter itself when it draws a head, and the column already has. */
  .shared :global(.waiting.head) {
    padding-inline: 0;
  }

  /* ── The bar: flat, on the board, no fill of its own, no blur, no shadow, no border ───────── */

  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 52px;
  }

  /* WHAT THE LINK IS, IN WORDS at the bar's end, in the second ink: not a pill, since pills are only for counts. */
  .what {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    margin-inline-start: auto;
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    white-space: nowrap;
  }

  /* AT 320 THE WORDS GIVE WAY BEFORE THE BAR DOES. */
  .what-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── The page's head: its name at 28 and one sentence at 17 ───────────────────────────── */

  .page {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .head {
    display: grid;
    gap: var(--sp-1);
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-page);
    font-weight: var(--fw-semi);
    line-height: calc(34 / 28);
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  /* THE PAGE'S OPENING LINE, its owner's one sentence about it, under its name; when the link stops is quieter under it. */
  .lead {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink);
    font-size: var(--fs-head);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .until {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-head);
    line-height: 24px;
  }

  .lead + .until {
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* A SECTION'S NAME, on the board over the tiles it names, as the owner's page sets it. */
  .section-head {
    grid-column: 1 / -1;
    margin: var(--sp-4) 0 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
  }

  /* THE NOTE, AT A READING MEASURE: the renderer's blocks at the tile's width, its own headings under the tile's, never
     over them, as a project's note is set on its row. */
  .note {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .note :global(:is(p, ul, ol)) {
    max-inline-size: 68ch;
    margin: 0;
  }

  .note :global(:is(h1, h2, h3)) {
    margin: var(--sp-3) 0 0;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    letter-spacing: 0;
    line-height: 22px;
  }

  .note :global(:is(h1, h2, h3):first-child) {
    margin-block-start: 0;
  }

  /* ── The blocks: flat tiles, radius 16, no border and no shadow ───────────────────────── */

  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .tile {
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  /* THE RENDERER'S BLOCK SITS IN THE TILE AS IT DOES IN A BLOCK'S SLOT: the tile's gap spaces it, and the margin a block
     keeps between blocks of a running document would leave a hole under the last row. */
  .part > :global(.block) {
    margin-block: 0;
  }

  /* A TILE OF ONE FIGURE AND ITS LINE ("Over time") IS A CHART, as the app draws it on Money (`money/look.css`, AL6): the
     label and the figure over a line the tile's width, its first day and Today under the line. The link drew the line
     about 120px wide at the tile's far end with its days beside the label. */
  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid:has(> .cell:only-child > .cell-trend) > .cell) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'label glyph'
      'figure figure'
      'trend trend'
      'axis axis'
      'note note';
    align-items: start;
    inline-size: 100%;
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .cell-label) {
    grid-area: label;
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .cell-figure) {
    grid-area: figure;
    justify-self: start;
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .cell-trend) {
    grid-area: trend;
    inline-size: 100%;
    block-size: 140px;
    margin-block-start: var(--sp-3);
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .cell-trend-days) {
    grid-area: axis;
    display: flex;
    justify-content: space-between;
    margin-block-start: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .cell-note) {
    grid-area: note;
  }

  .part > :global(.block[data-kind='stat']:not([data-form='lead']) > .grid > .cell:only-child > .glyph) {
    grid-area: glyph;
  }

  .part-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .part-body {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .part-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* ── A shared project (collab pass 2): two columns from 900 up, the rail a third; rows with hairlines between ── */

  .proj {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    align-items: start;
  }

  .proj-main,
  .proj-rail {
    display: grid;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .proj {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
  }

  .proj-about {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .proj-next {
    display: grid;
    gap: var(--sp-1);
  }

  .proj-label {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    line-height: 18px;
  }

  .proj-step {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: 22px;
  }

  .proj-rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .proj-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2, 52px);
    padding-block: var(--sp-2);
  }

  .proj-row + .proj-row,
  .proj-line + .proj-line {
    border-block-start: 1px solid var(--rule);
  }

  .proj-tick {
    display: inline-grid;
    place-items: center;
    color: var(--ink-3);
  }

  .proj-tick.good {
    color: var(--good);
  }

  .proj-what {
    display: grid;
    min-inline-size: 0;
  }

  .proj-title {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .is-done .proj-title {
    color: var(--ink-2);
  }

  .proj-meta,
  .proj-when,
  .proj-day {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .proj-when {
    white-space: nowrap;
  }

  .proj-done {
    display: grid;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
  }

  .proj-quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .proj-line {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    column-gap: var(--sp-3);
    padding-block: var(--sp-3);
  }

  .proj-said {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .proj-day {
    padding-block-start: 2px;
  }

  /* ITS MONEY: the first figure at the tile's figure size with its words after it, the rest as lines, amounts right. */
  .proj-figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
    margin: 0;
  }

  .proj-big {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: 26px;
    white-space: nowrap;
  }

  .proj-figure-label {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .proj-line.proj-money {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .proj-amount {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    text-align: end;
    white-space: nowrap;
  }

  /* ── Tables: hairlines between the rows and none round the table ──────────────────────── */

  .sheet {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .sheet-cell {
    padding: var(--sp-3);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .sheet tr + tr .sheet-cell {
    border-block-start: 1px solid var(--rule);
  }

  .sheet-cell:first-child {
    padding-inline-start: 0;
  }

  .sheet-cell:last-child {
    padding-inline-end: 0;
  }

  /* ── A link that does not open ────────────────────────────────────────────────────────── */

  .gone {
    justify-self: center;
    inline-size: min(56ch, 100%);
    padding-block-start: var(--sp-7);
  }

  /* ── The foot ─────────────────────────────────────────────────────────────────────────── */

  .made {
    display: flex;
    justify-content: center;
    padding-block-start: var(--sp-5);
  }

  /* A link out of a shared page is the first thing a stranger to this product ever presses: 44 on both axes. */
  .made-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .made-link:hover {
      color: var(--ink);
      text-decoration: underline;
    }
  }

  /* THE PHONE: the page's name at its phone size. */
  @media (width < 900px) {
    .title {
      font-size: var(--fs-page-phone);
      line-height: calc(28 / 22);
    }
  }

  /* THE TWO COLUMNS: one under the other on a phone, the rail first. */
  .areas {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    align-items: start;
  }

  @media (width >= 900px) {
    .blocks {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .part {
      grid-column: span var(--span);
    }

    .areas {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .area-main {
      grid-column: span var(--main);
    }

    /* THE RAIL IS ONE STACK, and a block's span means nothing in it, as on the owner's page. */
    .area-rail {
      grid-column: span var(--rail);
      grid-template-columns: minmax(0, 1fr);
    }

    .area-rail > .part {
      grid-column: 1 / -1;
    }
  }

  /* FORCED COLOURS DROP THE TILES' FILL, so each keeps an edge to be told by. */
  @media (forced-colors: active) {
    .tile {
      outline: 1px solid CanvasText;
    }
  }
</style>
