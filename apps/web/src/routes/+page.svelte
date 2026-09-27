<!--
  Home. Two questions, answered without a filter: WHAT NEEDS YOU, and WHAT HAPPENED WHILE YOU WERE
  NOT LOOKING.

  The second half depends on one small piece of design that is easy to get wrong: the read mark is
  one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug: For
  You had never once drawn its second half, because the screen advanced the mark on open and then
  asked for everything since it (19 §6).

  The look is `loop/DESIGN-BRIEF.md` §4: a quiet ledger where the only colour is the state of the
  money and the count of what is waiting to be decided.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { homePage, said } from '$lib/voice.svelte.ts';
  import { homeSlugOf } from '$lib/voice.ts';
  import { homeCurrency, actorOf } from '$lib/record/api.ts';
  import type { News } from '$lib/record/news-live.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import type { LivePageDecl } from '$lib/record/page-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { moneyInText, symbolText } from '$lib/record/money.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { actor } from '$lib/record/names.ts';
  import DeclaredHome from '$lib/ui/DeclaredHome.svelte';
  import ClearExamples from '$lib/ui/ClearExamples.svelte';
  import { untrack } from 'svelte';

  import { closed, drew, opened } from '../lib/ui/screen.svelte.ts';

  let { data } = $props();

  /**
   * THE DAY WHERE THE PERSON IS, on a live record: Home read Wednesday 16 September at two in the morning of the 17th,
   * because it named the day in UTC. The record's own `tz` is not read, because every host provisions `UTC` and nobody
   * sets it, so it cannot be told from a zone somebody chose.
   */
  const today = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));

  /**
   * "Since you were away" grows with WRITES rather than with rows, so on a record anybody uses it is
   * unbounded, and Home is not the log. The cap is small on purpose and its overflow is a door to
   * `/audit`, the surface that exists to hold the rest.
   */
  const NEWS_CAP = 8;

  /* THE MARK IS THE RECORD'S (`member.seen_at`), and `whatsNew` answers only what is after it. A mark kept on this
     device filtered the sample's feed, which had no record to keep one; it went with the sample (DIRECTION 26). */
  let feed = $state<News | null>(null);

  /**
   * HOME AS THE RECORD DECLARES IT (`loop/research-spark.md` S13). A use case names its Home as the page
   * `home-<use case>`; a record with no use case draws the house Home's own page, `home`, when a pack declares one. What
   * leads, figures included, is that page's to say: Home asks no figure of its own, because every figure it could name
   * belongs to a pack (shell.md USE-2). A record that holds neither page draws what needs you and what is new, and
   * nothing is drawn in the page's place until the record has said which.
   *
   * ONLY A PAGE THE RECORD HOLDS IS ASKED FOR. A use case may declare no Home page (a reading club shared as a file), and
   * asking for `home-<use case>` anyway logged a refusal on every Home load. `boot` names every page, so the use case's
   * page is asked for when it is there, then the house one when that is, and otherwise none.
   */
  const declares = $derived(homeSlugOf(homePage(), data.pages));
  /* THE PAGE AS WELL AS ITS BLOCKS: `layout` is a key of the page, not of a block, so a use case's Home draws its rail
     only when the wrapper is handed the page. */
  let declared = $state<{ blocks: LiveBlock[]; now: number; page: LivePageDecl } | null>(null);
  let asking = $state(false);
  /* THE SHELL'S FEED IS SPOKEN THE WAY `readHome` SPEAKS ITS OWN, so a sentence holding an amount does not change its
     spelling ("GBP 2,400.00", then "£2,400.00") when the fresh answer lands (design.md §5, DSN-4). */
  const news = $derived(feed ?? { items: data.whatsNew.map((item) => ({ ...item, text: moneyInText(item.text) })), upTo: data.upTo, sinceCapped: data.sinceCapped });

  const fresh = $derived(news.items);
  const capped = $derived(news.sinceCapped);

  $effect(() => {
    /* A RECORD THAT REFUSED `boot` REFUSES THESE TOO, and each of them is a refusal written into its
       log. Home asked for the declared page, the figures and the feed on every load a refused
       reader gave it, and threw all three answers away. */
    if (data.refused) return;
    const me = data.me.person;
    const slug = declares;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    asking = slug !== null;
    const page = slug === null ? Promise.resolve(null) : import('$lib/record/page-live.ts').then((m) => m.pageReader(apiBase()).read(slug)).catch(() => null);
    void page
      .then((got) => {
        declared = got?.from === 'live' ? { blocks: got.page.blocks, now: got.now, page: got.page.page } : null;
        asking = false;
        return import('$lib/record/news-live.ts').then((m) => m.readHome(apiBase(), me));
      })
      .then((out) => {
        if (out.from !== 'live') return;
        feed = out.news;
        ok = true;
      })
      .finally(() => closed(ok, at));
  });

  /* HOME'S WRITES ARE ON, SO A LANDED ONE READS THE PAGE AGAIN, without blanking it: a captured row appears, and a
     conflict is answered over the rows the record holds now rather than the ones Home read on arrival. */
  async function rereadHome() {
    const slug = declares;
    if (slug === null) return;
    const got = await import('$lib/record/page-live.ts').then((m) => m.pageReader(apiBase()).read(slug)).catch(() => null);
    if (got?.from === 'live' && slug === declares) declared = { blocks: got.page.blocks, now: got.now, page: got.page.page };
  }

  function markRead() {
    /* Cleared here at once; a mark that did not land leaves the record's where it was, so the same
       lines come back on the next visit rather than being lost. */
    const upTo = news.upTo;
    feed = { items: [], upTo, sinceCapped: false };
    void import('$lib/record/news-live.ts').then((m) => m.markAll(apiBase(), upTo));
  }

  /* WHAT NEEDS YOU IS THE QUESTIONS WAITING. The obligations due this week and the services lapsing were drawn here from
     the sample's rows and never from a record's, so with the sample gone (DIRECTION 26) Home draws neither until it
     reads them from the record. */
  const needCount = $derived(data.questions.length);

  /* WHERE A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD LANDS (`landing.ts`), and `null` for everybody else. */
  const lands = $derived(landing(data));

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so, through `data-screen` on
   * `<main id="main">`. A screen that starts fetching brackets its reads with `opened()` and
   * `closed()`, and a call still out takes the attribute away whatever this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(said('home'))}</title></svelte:head>

<!-- `display: contents`, so the sticky head still sticks to the panel and Home can set its title
     at the page-title size without changing every other screen's head. -->
<div class="home-head">
  <PageHead title={today}>
    {#snippet actions()}
      <!-- NOTHING AT ALL WHEN THERE IS NOTHING TO DECIDE: a count of nothing, as a link to a page
           whose empty state is the same answer, is noise. `/decide` stays in the rail and on `g d`. -->
      {#if data.open > 0}
        <a class="to-decide tap" href={at('/decide')}>
          <span class="to-decide-n num">{data.open}</span>
          <span>{copy.toDecide}</span>
        </a>
      {/if}
    {/snippet}
  </PageHead>
</div>

<div class="page">
  <div class="primary">
    {#if data.refused}
      <!--
        THE RECORD WOULD NOT ANSWER THIS READER, WHICH IS NOT THE SAME THING AS AN EMPTY RECORD.

        Measured on a self-host holding 19 lists and 230 rows: a colleague invited with `Adds only`,
        and one invited to a single list, accept through the product's own link and land here.
        `boot` answers 403 `LEVEL_REQUIRED`, "This needs read, and you have append access. Ask an
        owner to raise your access.", the shell carries it (`boot-live.ts` `refused`), and until it
        did this screen took its "never started" branch: "Nothing in the record yet." over 230 rows,
        with one control, `Start here`, which leads to the four tiles that set up a brand new
        record. The record's own sentence stands here instead, the way `/slash` already says what
        the record said, and there is no action, because the reader cannot do anything about it from
        this screen and the sentence names the person who can.
      -->
      <!-- AND A RECORD THAT COULD NOT BE REACHED IS NOT A REFUSAL (design SYS-8, DSN-12): the one offline sentence with
           Retry, and the client's own reason under Details rather than as the title. -->
      {#if data.refused.code === 'UNREACHABLE'}
        <Empty kind="error" title={copy.readOffline} detail={data.refused.fix}>
          {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.readRetry}</Button>{/snippet}
        </Empty>
      {:else}
        <Empty kind="no-permission" title={data.refused.fix} />
      {/if}
    {:else}
    <!-- THE EXAMPLES SETTING UP PLANTED, offered once they are all that is left to explain, and loudly once rows of the owner's own sit beside them. -->
    {#if data.live}<ClearExamples />{/if}
    <!-- THE DECLARED PAGE LEADS, figures and all, when the record holds one; Home draws no figure of its own. -->
    {#if declared}
      <DeclaredHome blocks={declared.blocks} now={declared.now} page={declared.page} reread={rereadHome} />
    {/if}

    <!-- A DECLARED HOME SAYS WHAT IS DUE ITSELF, so this is only the questions waiting, and only when there are some. -->
    {#if !asking && (!declared || data.questions.length > 0)}
    <Section title={said('needs_you')} count={needCount}>
      {#if data.questions.length === 0 && lands}
        <!--
          A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD IS TOLD WHICH LIST IS THEIRS, and is never told the
          record is empty. Measured through the real seed (`loop/research-invite-landing.md` finding 1): a
          bookkeeper invited to one empty list took the arm below at `anything === 0` and read "Nothing in
          the record yet." with `Start here` over a record of 230 rows, and every tile `/start` then offered
          was refused by the record. Their list answered the whole time, and nothing pointed at it.
        -->
        <Empty
          kind="cleared"
          title={lands.kind === 'list' ? copy.yourList(lands.name) : copy.yourLists(new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(lands.lists.map((l) => l.name)))}
          body={copy.yourListBody}
        >
          {#snippet actions()}
            {#if lands.kind === 'list'}
              <Button weight="primary" href={lands.href}>{copy.openList(lands.name)}</Button>
            {:else}
              {#each lands.lists as l (l.href)}<Button weight="quiet" href={l.href}>{copy.openList(l.name)}</Button>{/each}
            {/if}
          {/snippet}
        </Empty>
      {:else if data.questions.length === 0}
        {@const anything = data.index.registers.reduce((n, r) => n + r.count, 0) + data.open}
        <!-- Two nothings: a record never started, and a record worked through. Only the first gets
             an action, because on the second there is nothing to do and that is the message. -->
        <Empty
          kind={anything === 0 ? 'no-data-yet' : 'cleared'}
          title={anything === 0 ? copy.recordEmpty : said('nothing_needs_you')}
          body={anything === 0 ? copy.recordEmptyBody : undefined}
        >
          {#snippet actions()}
            {#if anything === 0}<Button weight="primary" href="/start">{copy.startHere}</Button>{/if}
          {/snippet}
        </Empty>
      {:else}
        <!--
          THE QUESTIONS WAITING, each with the faint kind icon the lapsing services and the obligations
          due beside it once had, when those were the sample's rows. Ids are not printed here: `y`
          copies one and the row's own screen shows it.
        -->
        <ul class="ledger needs">
          {#each data.questions as q}
            {@const pick = q.options?.find((o) => o.recommended)}
            <li>
              <a class="line need" href={at(`/decide/${q.id}`)}>
                <span class="need-kind"><Icon name="decide" size="m" /></span>
                <span class="line-title">{q.title}</span>
                <span class="need-amount"></span>
                <span class="need-when num">{since(q.opened, data.now)}</span>
                <span class="need-detail">
                  {symbolText(q.cost ?? '', homeCurrency())}{#if pick}{q.cost ? ' ' : ''}{copy.suggestedAnswer} <span class="need-pick">{pick.title}</span>{/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </Section>
    {/if}
    {/if}
  </div>

  <!-- AND NOT "Nothing new since you last looked." EITHER, over a record that would not answer:
       `whatsNew` is part of `boot`, so a reader who was refused has not been told there is nothing
       new, they have been told nothing at all. The one sentence above is the whole screen. -->
  {#if !data.refused}
  <aside class="secondary">
    <Section title={said('since_away')} count={fresh.length}>
      {#snippet aside()}
        {#if fresh.length > 0}
          <button type="button" class="mark" onclick={markRead}>{copy.markAllRead}</button>
        {/if}
      {/snippet}
      {#if fresh.length === 0}
        <Empty kind="cleared" title={said('nothing_new')} />
      {:else}
        <ul class="feed">
          {#each fresh.slice(0, NEWS_CAP) as item}
            {@const who = actorOf(item.by)}
            <li>
              <a class="event" href={at(item.href)}>
                <!-- The agent that wrote it, named. Never a sparkle badge: disclosed AI use costs
                     trust without buying anything (19 §6). -->
                <span class="avatar"><Face name={who} you={who === 'you'} kind={actor(item.by).kind} size="s" /></span>
                <span class="event-by">{who.charAt(0).toUpperCase() + who.slice(1)}</span>
                <span class="event-when num">{since(item.at, data.now)}</span>
                <span class="event-text">{item.text}</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if capped || fresh.length > NEWS_CAP}
          <a class="more tap" href={at('/audit')}>
            {capped ? copy.andMore : copy.moreInTheLog(fresh.length - NEWS_CAP)}
            <Icon name="arrow" size="s" />
          </a>
        {/if}
      {/if}
    </Section>
  </aside>
  {/if}
</div>

<style>
  /* ── the head ─────────────────────────────────────────────────────────── */

  .home-head {
    display: contents;
  }

  /* A ghost link, not a figure: the words at the small size, the count in `warn`. */
  .to-decide {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    /* The padding hangs past both edges, so the words end where the column's times end on a laptop
       and start on the gutter on a phone, where the link wraps under the date. */
    margin-inline: calc(-1 * var(--sp-2));
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .to-decide:hover {
    background: var(--s2);
    color: var(--ink);
  }

  .to-decide-n {
    color: var(--warn);
    font-weight: 500;
  }

  /* ── the columns ──────────────────────────────────────────────────────── */

  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--sp-7);
    max-inline-size: var(--page-max);
    /* The head's own inline padding, so the first column starts under the title. */
    padding: var(--sp-5) var(--gutter) var(--sp-9);
  }

  .primary,
  .secondary {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    min-inline-size: 0;
  }

  /* ── what needs you ───────────────────────────────────────────────────── */

  /* Rows sit on the panel with a soft hairline between them and nothing around them. */
  .needs {
    margin-inline: calc(-1 * var(--sp-3));
  }

  .needs > li + li > .need {
    border-block-start: 1px solid var(--line-soft);
  }

  .need {
    display: grid;
    grid-template-columns: var(--icon-m) minmax(0, 1fr) auto 72px;
    grid-template-areas:
      'kind title amount when'
      '. detail detail detail';
    align-items: baseline;
    column-gap: var(--sp-3);
    row-gap: 0;
    min-block-size: var(--row-h-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink);
    text-decoration: none;
  }

  .need:hover {
    background: var(--s2);
  }

  .need-kind {
    grid-area: kind;
    align-self: center;
    display: grid;
    place-items: center;
  }

  /* An icon at rest is `faint` (brief 4.3). Set on the stroke, because it is a drawing and not
     text, and `faint` is not for text at this size. */
  .need-kind :global(svg) {
    stroke: var(--faint);
  }

  .need:hover .need-kind :global(svg) {
    stroke: var(--ink2);
  }

  .need .line-title {
    grid-area: title;
    overflow: hidden;
    font-size: var(--t-base);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .need-amount {
    grid-area: amount;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-align: end;
  }

  .need-when {
    grid-area: when;
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
    white-space: nowrap;
  }

  .need-detail {
    grid-area: detail;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .need-pick {
    color: var(--ink2);
  }

  /* ── since you were away ──────────────────────────────────────────────── */

  /* NO GAP: the hairline between events is the separation, and a flex gap inherited on top of each
     event's own padding put 40px between one sentence and the next. */
  .feed {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .feed li + li .event {
    border-block-start: 1px solid var(--line-soft);
  }

  .event {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-2);
    row-gap: 2px;
    padding-block: var(--sp-3);
    color: var(--ink2);
    /* A STEP BELOW THE MAIN COLUMN. The feed is what happened while you were away and the column
       beside it is what needs you; at 14px in ink, each news sentence outranked the titles of the
       things waiting on a decision, and three of them filled the height of four of those. */
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    text-decoration: none;
  }

  .event:hover .event-text {
    color: var(--ink);
  }

  /* The same face History and a row's history draw, so an actor is one shape wherever it turns up. */
  .avatar {
    grid-column: 1;
    grid-row: 1;
    display: grid;
    place-items: center;
  }

  .event-by {
    grid-column: 2;
    grid-row: 1;
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .event-when {
    grid-column: 3;
    grid-row: 1;
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
    white-space: nowrap;
  }

  .event-text {
    grid-column: 2 / -1;
    grid-row: 2;
    color: var(--ink2);
    text-wrap: pretty;
  }

  /* A verb in a section head, not a button: it must not compete with the rows under it. The target
     is the padding around the words, 44px on a coarse pointer through `--ctl-h`. */
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    margin-inline-end: calc(-1 * var(--sp-2));
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-xs);
    cursor: pointer;
  }

  .mark:hover {
    background: var(--s2);
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .mark {
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }
  }

  /* A DOOR, SO A TARGET. */
  .more {
    display: inline-flex;
    align-items: center;
    align-self: start;
    min-block-size: var(--ctl-h-sm);
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .more:hover {
    color: var(--ink);
  }

  /* ── narrower ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN below this: the declared page first, then what needs you, then the feed, which is the
     reading order a phone should have had all along. */
  @media (width < 1180px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* On a phone a row's age drops under its amount so the title keeps the width. */
  @media (width < 640px) {
    .need {
      grid-template-columns: var(--icon-m) minmax(0, 1fr) auto;
      grid-template-areas:
        'kind title amount'
        '. detail when';
    }

    .need-when {
      min-inline-size: 0;
    }
  }

  @media (pointer: coarse) {
    .need {
      min-block-size: max(var(--row-h-2), var(--tap));
    }
  }
</style>
