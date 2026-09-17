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
  import { titleOf } from '$lib/title.ts';
  import { MISSING, relative, since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { homePage, said } from '$lib/voice.svelte.ts';
  import { homeSlugOf } from '$lib/voice.ts';
  import * as pref from '$lib/pref.ts';
  import { homeCurrency, identityFor, NOW, ROWS, actorOf, metric, type Metric } from '$lib/record/api.ts';
  import type { News } from '$lib/record/news-live.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import { amountOf, currencyOf, drawn, symbolText } from '$lib/record/money.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import DeclaredHome from '$lib/ui/DeclaredHome.svelte';
  import ClearExamples from '$lib/ui/ClearExamples.svelte';
  import { untrack } from 'svelte';

  import { closed, drew, opened } from '../lib/ui/screen.svelte.ts';

  let { data } = $props();

  /**
   * THE DAY WHERE THE PERSON IS, on a live record: Home read Wednesday 16 September at two in the morning of the 17th,
   * because it named the day in UTC. The record's own `tz` is not read, because every host provisions `UTC` and nobody
   * sets it, so it cannot be told from a zone somebody chose. The sample's frozen day stays in UTC, so it reads the
   * same everywhere.
   */
  const today = $derived(
    new Date(data.now).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(data.live ? {} : { timeZone: 'UTC' }),
    }),
  );

  const days = (iso: unknown) =>
    typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

  const NEEDS_CAP = 6;

  /**
   * "Since you were away" grows with WRITES rather than with rows, so on a record anybody uses it is
   * unbounded, and Home is not the log. The cap is small on purpose and its overflow is a door to
   * `/audit`, the surface that exists to hold the rest.
   */
  const NEWS_CAP = 8;

  /**
   * THE MARK IS AN INSTANT, NOT A FLAG. A timestamp is one string, it survives a new arrival
   * correctly, and it is what the real record already uses (`member.seen_at`). Unset means
   * everything is new, which is what a first visit should be.
   */
  let seen = $state(pref.read().seen);

  /* ON A LIVE RECORD THE MARK IS THE RECORD'S, and `whatsNew` answers only what is after it. */
  let feed = $state<News | null>(null);
  let tiles = $state<Metric[] | null>(null);

  /**
   * HOME AS THE RECORD'S USE CASE DECLARES IT (`loop/research-spark.md` S13). A use case names its Home as the page
   * `home-<use case>`, and that page is drawn here in place of the house figures, which read Money and asked a
   * student's record for three figures it refuses. A record with no use case draws the house Home's own page, `home`,
   * which Money declares. `null` is the sample, which draws the Home below unchanged; a record that holds neither page
   * draws the Home below too. Nothing is drawn in its place until the record has said which.
   *
   * ONLY A PAGE THE RECORD HOLDS IS ASKED FOR. A use case may declare no Home page (a reading club shared as a file), and
   * asking for `home-<use case>` anyway logged a refusal on every Home load. `boot` names every page, so the use case's
   * page is asked for when it is there, then the house one when that is, and otherwise none.
   */
  const declares = $derived(data.live ? homeSlugOf(homePage(), data.pages) : null);
  let declared = $state<{ blocks: LiveBlock[]; now: number } | null>(null);
  let asking = $state(false);
  const news = $derived(data.live ? (feed ?? { items: data.whatsNew, upTo: data.upTo, sinceCapped: data.sinceCapped }) : null);

  const fresh = $derived(news ? news.items : data.whatsNew.filter((item) => !seen || item.at > seen));
  const capped = $derived(news ? news.sinceCapped : data.sinceCapped);

  $effect(() => {
    if (!data.live) return;
    const me = data.me.person;
    const slug = declares;
    const lists = data.lists;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    asking = slug !== null;
    const page = slug === null ? Promise.resolve(null) : import('$lib/record/page-live.ts').then((m) => m.pageReader(location.origin).read(slug)).catch(() => null);
    void page
      .then((got) => {
        declared = got?.from === 'live' ? { blocks: got.page.blocks, now: got.now } : null;
        asking = false;
        /* THE FIGURES ARE ASKED FOR ONLY WHEN NO PAGE SAYS WHAT LEADS, so a record without Money's `home` is not asked twice. */
        return import('$lib/record/news-live.ts').then((m) => m.readHome(location.origin, me, undefined, m.homeFigures(lists, declared !== null)));
      })
      .then((out) => {
        if (out.from !== 'live') return;
        tiles = out.tiles;
        feed = out.news;
        ok = true;
      })
      .finally(() => closed(ok, at));
  });

  function markRead() {
    if (news) {
      /* Cleared here at once; a mark that did not land leaves the record's where it was, so the same
         lines come back on the next visit rather than being lost. */
      const upTo = news.upTo;
      feed = { items: [], upTo, sinceCapped: false };
      void import('$lib/record/news-live.ts').then((m) => m.markAll(location.origin, upTo));
      return;
    }
    /* The newest item's own instant, not the wall clock, so an arrival written a second later is
       not swallowed by the mark. */
    const newest = data.whatsNew.reduce((a, item) => (item.at > a ? item.at : a), '');
    if (!newest) return;
    seen = newest;
    pref.write({ seen: newest });
  }

  /* NOT YET READ FROM A LIVE RECORD: the obligations due this week and the services lapsing are the
     sample's rows, so a live Home draws neither rather than somebody else's. */
  const dueSoon = $derived(
    data.live
      ? []
      : (ROWS.obligations ?? [])
          .filter((e) => (e.fields.state === 'open' || e.fields.state === 'part') && days(e.fields.due) <= 7)
          .sort((a, b) => String(a.fields.due).localeCompare(String(b.fields.due))),
  );

  const lapsing = $derived(data.live ? [] : (ROWS.services ?? []).filter((e) => e.fields.state === 'lapsing'));
  const shown = $derived(dueSoon.slice(0, NEEDS_CAP));
  const hidden = $derived(dueSoon.length - shown.length);
  const needCount = $derived(data.questions.length + lapsing.length + dueSoon.length);

  const cells = $derived(data.live ? (tiles ?? []) : ['owed-to-you', 'due-30d', 'overdue'].map((id) => metric(id)));

  /**
   * A QUALIFIER'S STATE PHRASE, and only that phrase, takes the metric's tone.
   *
   * "should be nothing, up 15% on the 30 days before" colours "up 15%". A note with no such phrase
   * says its state with the 6px dot in front of it instead, so a figure over its target still says
   * so without the figure itself turning red.
   */
  const STATE = /\b(?:up|down) [\d.,]+%|\boverdue\b|\blapsing\b/iu;
  function qualifier(note: string) {
    const text = symbolText(note, homeCurrency()).replaceAll(' · ', ', ');
    const m = STATE.exec(text);
    return m
      ? { before: text.slice(0, m.index), phrase: m[0], after: text.slice(m.index + m[0].length) }
      : { before: text, phrase: '', after: '' };
  }

  /* Home writes a row's second line from what the row already holds, never from a new store. */
  const nameOf = (register: string, fields: Readonly<Record<string, unknown>>) => identityFor(register, fields)?.name ?? '';
  const joined = (...parts: unknown[]) => parts.filter((p) => typeof p === 'string' && p !== '').join(' · ');

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
        <a class="to-decide tap" href="/decide">
          <span class="to-decide-n num">{data.open}</span>
          <span>{copy.toDecide}</span>
        </a>
      {/if}
    {/snippet}
  </PageHead>
</div>

<div class="page">
  <div class="primary">
    <!-- THE EXAMPLES SETTING UP PLANTED, offered once they are all that is left to explain, and loudly once rows of the owner's own sit beside them. -->
    {#if data.live}<ClearExamples />{/if}
    <!--
      THE FIGURES LEAD. A person opens this to find out where the money is. All of them are one size:
      no figure is louder than another, and state lives in the qualifier line under each.
    -->
    {#if declared}
      <DeclaredHome blocks={declared.blocks} now={declared.now} />
    {:else if cells.length > 0 && !asking}
      <Section title={said('right_now')}>
        <!-- Up to four across; three figures take thirds rather than leaving a fourth track empty. -->
        <div class="stats" style="--cols:{Math.min(4, Math.max(3, cells.length))}">
          {#each cells as m (m.id)}
            {@const parts = drawn(m.value, homeCurrency())}
            {@const q = qualifier(m.note)}
            {@const toned = m.tone === 'bad' || m.tone === 'warn' || m.tone === 'good'}
            <svelte:element this={m.href ? 'a' : 'div'} class="stat" href={m.href} data-intent={m.tone}>
              <span class="stat-label">{m.label}</span>
              <span class="stat-figure num">
                {#if !m.value}{MISSING}{:else if parts}{parts.lead}{parts.whole}<span class="stat-minor"
                    >{parts.fraction}</span
                  >{#if parts.iso}<span class="stat-code">{parts.iso}</span>{/if}{:else}{m.value}{/if}
              </span>
              <span class="stat-note">
                {#if toned && !q.phrase && m.tone !== 'good'}<span class="dot" aria-hidden="true"></span>{/if}{q.before}{#if q.phrase}<span
                    class="stat-state">{q.phrase}</span
                  >{/if}{q.after}
              </span>
            </svelte:element>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- A DECLARED HOME SAYS WHAT IS DUE ITSELF, so this is only the questions waiting, and only when there are some. -->
    {#if !asking && (!declared || data.questions.length > 0)}
    <Section title={said('needs_you')} count={needCount}>
      {#if data.questions.length === 0 && shown.length === 0 && lapsing.length === 0}
        {@const anything =
          (data.live
            ? data.index.registers.reduce((n, r) => n + r.count, 0)
            : Object.values(ROWS).reduce((n, list) => n + list.length, 0)) + data.open}
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
          THREE KINDS OF ROW IN ONE LIST: a decision, a lapsing service and an obligation. The faint
          kind icon says which before the words do, and it is the same ink for all of them; the shape
          says the kind. Ids are not printed here: `y` copies one and the row's own screen shows it.
        -->
        <ul class="ledger needs">
          {#each data.questions as q}
            {@const pick = q.options?.find((o) => o.recommended)}
            <li>
              <a class="line need" href="/decide/{q.id}">
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

          {#each lapsing as s}
            <li>
              <a class="line need" href="/r/services/{s.seq}">
                <span class="need-kind"><Icon name="service" size="m" /></span>
                <span class="line-title">{s.fields.name} is lapsing</span>
                <span class="need-amount"><Money minor={amountOf(s.fields.cost) ?? 0} currency={currencyOf(s.fields.cost) ?? ''} /></span>
                <!-- A lapse is a warning and not a failure: the service still runs and there is time
                     to renew it. The dot and the word carry it together, never the colour alone. -->
                <span class="need-when num" data-intent="warn">
                  <span class="dot" aria-hidden="true"></span>{relative(String(s.fields.renews), NOW)}
                </span>
                <span class="need-detail">{joined(nameOf('services', s.fields), s.fields.note)}</span>
              </a>
            </li>
          {/each}

          {#each shown as e}
            {@const late = days(e.fields.due) < 0}
            {@const owed = e.fields.direction === 'owed_to_me'}
            <li>
              <a class="line need" href="/r/obligations/{e.seq}">
                <span class="need-kind"><Icon name="obligation" size="m" /></span>
                <span class="line-title">{e.fields.what}</span>
                <span class="need-amount">
                  <Money minor={amountOf(e.fields.amount) ?? 0} currency={currencyOf(e.fields.amount) ?? ''} />
                </span>
                <span class="need-when num" data-intent={late ? 'bad' : undefined}>
                  {#if late}<span class="dot" aria-hidden="true"></span>{/if}{relative(String(e.fields.due), NOW)}
                </span>
                <span class="need-detail">
                  {joined(owed ? copy.owedToYou : copy.youOwe, nameOf('obligations', e.fields), e.fields.note)}
                </span>
              </a>
            </li>
          {/each}
        </ul>

        {#if hidden > 0}
          <a class="more tap" href="/r/obligations?f=state:in:open,part&f=due:before:today">
            {hidden} more past their date
            <Icon name="arrow" size="s" />
          </a>
        {/if}
      {/if}
    </Section>
    {/if}
  </div>

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
              <a class="event" href={item.href}>
                <!-- The agent that wrote it, named. Never a sparkle badge: disclosed AI use costs
                     trust without buying anything (19 §6). -->
                <span class="avatar"><Face name={who} you={who === 'you'} size="s" /></span>
                <span class="event-by">{who.charAt(0).toUpperCase() + who.slice(1)}</span>
                <span class="event-when num">{since(item.at, data.now)}</span>
                <span class="event-text">{item.text}</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if capped || fresh.length > NEWS_CAP}
          <a class="more tap" href="/audit">
            {capped ? copy.andMore : copy.moreInTheLog(fresh.length - NEWS_CAP)}
            <Icon name="arrow" size="s" />
          </a>
        {/if}
      {/if}
    </Section>
  </aside>
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
    /* The head's own inline padding, so the figures start under the title. */
    padding: var(--sp-5) var(--gutter) var(--sp-9);
  }

  .primary,
  .secondary {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    min-inline-size: 0;
  }

  /* ── right now ────────────────────────────────────────────────────────── */

  .stats {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: var(--sp-6);
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    color: var(--ink);
    text-decoration: none;
  }

  .stat-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  a.stat:hover .stat-label {
    color: var(--ink2);
  }

  .stat-figure {
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 500;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .stat-minor {
    color: var(--dim);
  }

  .stat-code {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 400;
    letter-spacing: 0;
  }

  .stat-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .stat[data-intent='bad'] {
    --tone: var(--danger);
  }

  .stat[data-intent='warn'] {
    --tone: var(--warn);
  }

  .stat[data-intent='good'] {
    --tone: var(--earn);
  }

  .stat-state {
    color: var(--tone, var(--dim));
  }

  .dot {
    display: inline-block;
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--tone, var(--dim));
    vertical-align: 0.1em;
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

  .need-when[data-intent='bad'] {
    --tone: var(--danger);
    color: var(--danger);
  }

  .need-when[data-intent='warn'] {
    --tone: var(--warn);
    color: var(--warn);
  }

  .need-when .dot {
    margin-inline-end: var(--sp-1);
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

  /* ONE COLUMN below this: the figures first, then what needs you, then the feed, which is the
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

  /* On a phone the figures go two across, and a row's age drops under its amount so the title keeps
     the width. */
  @media (width < 640px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5) var(--sp-4);
    }

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
