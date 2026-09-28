<!--
  Overview, which was Home. Four questions, answered without a filter: WHAT NEEDS YOU, WHO IS WORKING, WHAT IS COMING,
  and WHAT HAPPENED WHILE YOU WERE NOT LOOKING.

  NOT THE LANDING ANY MORE. Every record opens on Today (`routes/+page.svelte`), and this page, the use case's own Home
  with its figures and tables, is kept at `/?overview` and reached from More.

  ONE PAGE, THROUGH THE ONE READER (modules C8, contracts §11 X19). Home draws the speaking use case's `home-<id>` page,
  else the record's `home` page, else the house page `DEFAULT_HOME` (`lib/home/default-home.ts`), which the record draws
  with `previewPage`. All three go through `PageView` with `mode: 'home'`, so a question is answered where it is shown,
  a row is ticked where it is drawn, and a line is captured without leaving. Home drew the house page a second way, as
  its own list of questions and its own feed, and a use case's page a third way through a wrapper; both are gone.

  THE READ MARK is one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug: For You had never once
  drawn its second half, because the screen advanced the mark on open and then asked for everything since it (19 §6).

  IT LISTENS. A write from an agent, a rule or another tab moves the record's version, and Home reads its page again
  without a reload and without blanking it (`listen`, PGS-10).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { homePage, said } from '$lib/voice.svelte.ts';
  import { VOICE_LINES, homeSlugOf } from '$lib/voice.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ClearExamples from '$lib/ui/ClearExamples.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { countsOf, defaultHome, homeBlocks, leadOf, quiet, type HomeVoice } from '$lib/home/default-home.ts';
  import { words } from '$lib/home/words.ts';
  import { untrack } from 'svelte';
  import { typing } from '$lib/a11y/keys.svelte.ts';

  import { closed, drew, opened } from '../ui/screen.svelte.ts';

  let { data }: { data: Shell } = $props();

  /**
   * THE DAY WHERE THE PERSON IS, on a live record: Home read Wednesday 16 September at two in the morning of the 17th,
   * because it named the day in UTC. The record's own `tz` is not read, because every host provisions `UTC` and nobody
   * sets it, so it cannot be told from a zone somebody chose. A quiet line over the title now, not the title itself.
   */
  const today = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));

  /* THE TITLE IS THE VOICE'S WORD FOR HOME WHEN A USE CASE SAYS ONE, else the record's own name: a date is not a name. */
  const title = $derived.by(() => {
    const voiced = said('home');
    return voiced !== VOICE_LINES.home ? voiced : data.index.name.trim() || voiced;
  });

  /* THE CALM SENTENCE IS THE VOICE'S when a use case words it, and otherwise Home's own. */
  const nothing = $derived(said('nothing_needs_you') !== VOICE_LINES.nothing_needs_you ? said('nothing_needs_you') : words.nothingNow);

  /* THE HOUSE PAGE'S HEADINGS IN THE VOICE THAT SPEAKS, read before the page is asked for so a voice that lands after
     the first read asks it again in its own words. */
  const voice = $derived<HomeVoice>({
    rightNow: said('right_now'),
    needsYou: said('needs_you'),
    sinceAway: said('since_away'),
    workingNow: said('working_now'),
    comingUp: said('coming_up'),
    overdue: said('overdue'),
    nothingWaiting: said('nothing_waiting'),
    nothingDue: said('nothing_due'),
  });

  /**
   * ONLY A PAGE THE RECORD HOLDS IS ASKED FOR. A use case may declare no Home page (a reading club shared as a file), and
   * asking for `home-<use case>` anyway logged a refusal on every Home load. `boot` names every page, so the use case's
   * page is asked for when it is there, then the house one when that is, and otherwise the record draws `DEFAULT_HOME`.
   */
  const declares = $derived(homeSlugOf(homePage(), data.pages));

  /** The record's answer for Home's page, `null` while it is out or when this host cannot draw the house page. */
  let got = $state<Opened | null>(null);
  /** Whether the first read has come back, so a host that cannot draw the house page is told from one still reading. */
  let settled = $state(false);
  /** A read of Home's own is out: `listen` waits for it rather than asking again on top of it. */
  let reading = false;

  /** Home's page, from whichever of the three sources the record holds. */
  async function readBody(slug: string | null, spoken: HomeVoice): Promise<Opened | null> {
    if (slug !== null) {
      const m = await import('$lib/record/page-live.ts');
      return m.pageReader(apiBase()).read(slug);
    }
    /* THE HOUSE PAGE IS DRAWN BY THE RECORD, never installed: `previewPage` answers the body as `page` answers an
       installed one, each block held to the reader, and writes nothing. `drawnOf` is the one reader of that answer. */
    const m = await import('../../routes/decide/[id]/proposed.ts');
    const drawn = await m.drawnOf(defaultHome(spoken), apiBase());
    if (drawn.from === 'live') return { from: 'live', page: { page: { page: 'home', title: '' }, blocks: drawn.blocks }, now: drawn.now };
    if (drawn.from === 'refused') return { from: 'refused', fix: drawn.fix };
    return null;
  }

  $effect(() => {
    /* A RECORD THAT REFUSED `boot` REFUSES THIS TOO, and each refusal is written into its log. */
    if (data.refused) return;
    const slug = declares;
    const spoken = voice;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    reading = true;
    void readBody(slug, spoken)
      .then((out) => {
        if (slug !== declares) return;
        got = out;
        ok = out?.from === 'live';
      })
      .catch(() => {})
      .finally(() => {
        reading = false;
        settled = true;
        closed(ok, at);
      });
  });

  /* A LANDED WRITE, AND A NEW VERSION OF THE RECORD, READ THE PAGE AGAIN without blanking it: a captured row appears,
     an answered question goes, and a conflict is answered over the rows the record holds now. */
  async function reread() {
    if (data.refused) return;
    const slug = declares;
    reading = true;
    try {
      const out = await readBody(slug, untrack(() => voice));
      if (slug === declares && out?.from === 'live') got = out;
    } catch {
      /* The page as it was read stays; the next version asks again. */
    } finally {
      reading = false;
    }
  }

  /* THE SAME BUSY RULE AS `/p/[slug]` (PGS-10): a re-read waits for a field being typed into and for a card's write
     still out (`aria-busy`), on top of Home's own read already being out. */
  listen(reread, () => reading || typing() || document.querySelector('main [aria-busy="true"]') !== null);

  const live = $derived(got?.from === 'live' ? got : null);
  const blocks = $derived(live ? homeBlocks(live.page.blocks, live.now, voice) : []);
  /* THE LEAD LINE IS BUILT FROM THE PAGE'S OWN COUNTS, so it can never disagree with the blocks under it. */
  const lead = $derived(live ? leadOf(countsOf(live.page.blocks)) : null);
  /* NOTHING PINNED, WAITING, DUE OR WORKING: one calm sentence, and only what changed under it. A host that cannot draw
     the house page at all is calm too, rather than blank. */
  const calm = $derived((live !== null && quiet(live.page.blocks)) || (settled && got === null));

  /* THE PAGE AS HOME DRAWS IT, handed to the reader whole, so the reader's writes index the blocks it draws. */
  const drawn = $derived.by((): Opened | null => {
    if (!got || got.from !== 'live') return got;
    return { ...got, page: { ...got.page, blocks: calm ? blocks.filter((b) => b.kind === 'feed') : blocks } };
  });
  const slug = $derived(live?.page.page.page ?? declares ?? 'home');

  /* A RECORD WITH NO LISTS AT ALL goes to the prompt (MOD-6, `+layout.ts`); this is what is left if it is reached anyway. */
  const empty = $derived(data.index.registers.length === 0 && data.open === 0);

  /* WHERE A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD LANDS (`landing.ts`), and `null` for everybody else. */
  const lands = $derived(landing(data));

  /**
   * THE MARK IS STAMPED WHEN THE READER LEAVES, and only when Home drew what is new: a use case's page with no feed has
   * shown nothing to mark read. `pagehide` covers a closed tab, and the effect's end covers leaving for another screen.
   * A mark that did not land leaves the record's where it was, so the same lines come back rather than being lost.
   */
  const feeds = $derived(blocks.some((b) => b.kind === 'feed' && b.source === 'activity'));
  let stamped = false;
  function stamp() {
    if (stamped || data.refused || !feeds) return;
    stamped = true;
    const upTo = data.upTo;
    void import('$lib/record/news-live.ts').then((m) => m.markAll(apiBase(), upTo)).catch(() => {});
  }
  $effect(() => {
    const leave = () => stamp();
    addEventListener('pagehide', leave);
    return () => {
      removeEventListener('pagehide', leave);
      untrack(stamp);
    };
  });

  /**
   * THIS SCREEN SAYS WHEN IT HAS DRAWN through `data-screen` on `<main id="main">`. The page read is bracketed with
   * `opened()` and `closed()`, and a call still out takes the attribute away whatever this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<!-- `display: contents`, so the sticky head still sticks to the panel. -->
<div class="home-head">
  <PageHead {title} kicker={today}>
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
  {#if data.refused}
    <!--
      THE RECORD WOULD NOT ANSWER THIS READER, WHICH IS NOT THE SAME THING AS AN EMPTY RECORD. A colleague invited with
      `Adds only` is refused `boot` with the record's own sentence, which names the person who can help, so it stands
      here alone with no action. And a record that could not be reached is not a refusal (design SYS-8, DSN-12): the one
      offline sentence with Retry, and the client's own reason under Details.
    -->
    {#if data.refused.code === 'UNREACHABLE'}
      <Empty kind="error" title={copy.readOffline} detail={data.refused.fix}>
        {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.readRetry}</Button>{/snippet}
      </Empty>
    {:else}
      <Empty kind="no-permission" title={data.refused.fix} />
    {/if}
  {:else if empty}
    <Empty kind="no-data-yet" title={said('record_empty')}>
      {#snippet actions()}<Button weight="primary" href="/start">{said('start_here')}</Button>{/snippet}
    </Empty>
  {:else}
    <!-- THE EXAMPLES SETTING UP PLANTED, offered once they are all that is left to explain. -->
    {#if data.live}<ClearExamples />{/if}

    {#if calm && lands}
      <!--
        A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD IS TOLD WHICH LIST IS THEIRS, and is never told the record is
        empty (`loop/research-invite-landing.md` finding 1).
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
    {:else if calm}
      <!-- ONE CALM SENTENCE AND ONE LINE ON WHAT FILLS THIS PAGE, never what a business is made of. -->
      <Empty kind="cleared" title={nothing} body={said('fills_with')} />
    {:else if lead}
      <p class="lead">{lead}</p>
    {/if}

    {#if drawn !== null || !settled}
      <div class="body">
        <PageView {slug} got={drawn} mode="home" {reread} />
      </div>
    {/if}
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

  /* ── the page ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN, the page's own: its blocks carry their spans and its rail, and Home adds no column of its own beside it. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--page-max);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  .body {
    min-inline-size: 0;
  }

  /* THE LEAD IS A SENTENCE, NOT A HEADING: the page title already names the page, and this says what is in it. */
  .lead {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    line-height: var(--lh-tight);
    text-wrap: pretty;
  }

  /* A QUESTION WRAPS TO TWO LINES AND NO MORE on Home, so five of them fit above the fold; its own card on Decide says
     it whole. */
  .body :global(.queue-question) {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* ONE LINE PER EVENT in what changed: Home is not the log, and the row is the door to the rest of the sentence. */
  .body :global(.feed-what) {
    overflow: hidden;
    overflow-wrap: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── narrower ─────────────────────────────────────────────────────────── */

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE THE FIGURES ARE TWO BY TWO, rather than a stack of four rows pushing what needs you off the screen. */
  @media (width < 640px) {
    .body :global(.grid:has(> .cell:nth-child(2))) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
