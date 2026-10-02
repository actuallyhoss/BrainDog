<!--
  Today, declared: the page every record opens on (`routes/+page.svelte`), and `/?overview` too, which was a second Home.

  ONE PAGE, THROUGH THE ONE READER. Home draws the speaking use case's `home-<id>` page, else the record's `home` page,
  else Today's body (`todayHome` in `default-home.ts`), built from what the record holds and drawn by the record with
  `previewPage`. All three go through `PageView` with `mode: 'home'`, so a question is answered where it is shown, a
  task is ticked where it is drawn, and a line is captured without leaving. Today was a screen of its own; it is kept at
  `/?classic` (`Today.svelte`) until this one does all it did.

  CALM BEFORE RICH (DIRECTION §35). One line under the title, worked out from the blocks drawn (`sentenceOf`), with the
  phrase that needs the reader in red. When Slash wrote Home's line today the line is its (`home-line.ts`), red only
  where it says the rules' phrase word for word, and who said it shows on hover or focus; nothing more is drawn at rest.
  A block with nothing in it is not drawn, and a rail with nothing in it gives its width back to the main column.

  THE READ MARK is one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug: For You had never once
  drawn its second half, because the screen advanced the mark on open and then asked for everything since it (19 §6).

  IT LISTENS. A write from an agent, a rule or another tab moves the record's version, and Home reads its page again
  without a reload and without blanking it (`listen`).
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { homePage, said } from '$lib/voice.svelte.ts';
  import { VOICE_LINES, homeSlugOf } from '$lib/voice.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { may } from '$lib/record/may.ts';
  import { TASKS } from '$lib/work/list.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ClearExamples from '$lib/ui/ClearExamples.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { drawsAny, homeDrawn, railed, slashLineOf, todayHome, type Holds, type HomeVoice } from '$lib/home/default-home.ts';
  import { words } from '$lib/home/words.ts';
  import { cutLine, homeLineOf } from '$lib/home/home-line.ts';
  import { untrack } from 'svelte';
  import { typing } from '$lib/a11y/keys.svelte.ts';

  import { closed, drew, opened } from '../ui/screen.svelte.ts';

  let { data }: { data: Shell } = $props();

  /**
   * THE DAY WHERE THE PERSON IS, on a live record: Home read Wednesday at two in the morning of Thursday,
   * because it named the day in UTC. The record's own `tz` is not read, because every host provisions `UTC` and nobody
   * sets it, so it cannot be told from a zone somebody chose. A quiet line over the title, not the title itself.
   */
  const today = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));

  /* THE TITLE IS THE VOICE'S WORD FOR HOME WHEN A USE CASE SAYS ONE, else Today. */
  const title = $derived.by(() => {
    const voiced = said('home');
    return voiced !== VOICE_LINES.home ? voiced : copy.today;
  });

  /* THE CALM LINE IS THE VOICE'S when a use case words it, and otherwise Home's own. */
  const nothing = $derived(said('nothing_needs_you') !== VOICE_LINES.nothing_needs_you ? said('nothing_needs_you') : words.nothingNow);

  /* TODAY'S HEADINGS IN THE VOICE THAT SPEAKS, read before the page is asked for so a voice that lands after the first
     read asks it again in its own words. */
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

  /* WHAT TODAY'S BODY IS BUILT AROUND, read off the shell: a block over a list the record does not keep is not asked for. */
  const holds = $derived<Holds>({
    tasks: data.lists.some((l) => l.id === TASKS),
    adds: data.lists.some((l) => l.id === TASKS) && may(data, 'append', TASKS),
    money: data.pages.includes('money'),
  });

  /**
   * ONLY A PAGE THE RECORD HOLDS IS ASKED FOR. A use case may declare no Home page (a reading club shared as a file), and
   * asking for `home-<use case>` anyway logged a refusal on every Home load. `boot` names every page, so the use case's
   * page is asked for when it is there, then the record's `home` when that is, and otherwise Today's body is drawn.
   */
  const declares = $derived(homeSlugOf(homePage(), data.pages));

  /** The record's answer for Home's page, `null` while it is out or when this host cannot draw Today's body. */
  let got = $state<Opened | null>(null);
  /** Whether the first read has come back, so a host that cannot draw Today's body is told from one still reading. */
  let settled = $state(false);
  /** A read of Home's own is out: `listen` waits for it rather than asking again on top of it. */
  let reading = false;

  /** Home's page, from whichever of the three sources the record holds. */
  async function readBody(slug: string | null, spoken: HomeVoice, held: Holds): Promise<Opened | null> {
    if (slug !== null) {
      const m = await import('$lib/record/page-live.ts');
      return m.pageReader(apiBase()).read(slug);
    }
    /* TODAY'S BODY IS DRAWN BY THE RECORD, never installed: `previewPage` answers the body as `page` answers an installed
       one, each block held to the reader, and writes nothing. `drawnOf` is the one reader of that answer. */
    const body = todayHome(held, spoken);
    const m = await import('../../routes/decide/[id]/proposed.ts');
    const drawn = await m.drawnOf(body, apiBase());
    if (drawn.from === 'live')
      return { from: 'live', page: { page: { page: body.page, title: body.title, layout: body.layout }, blocks: drawn.blocks }, now: drawn.now };
    if (drawn.from === 'refused') return { from: 'refused', fix: drawn.fix };
    return null;
  }

  $effect(() => {
    /* A RECORD THAT REFUSED `boot` REFUSES THIS TOO, and each refusal is written into its log. */
    if (data.refused) return;
    const slug = declares;
    const spoken = voice;
    const held = holds;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    reading = true;
    void readBody(slug, spoken, held)
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

  /* A LANDED WRITE, AND A NEW VERSION OF THE RECORD, READ THE PAGE AGAIN without blanking it: a captured task appears,
     an answered question goes, and a conflict is answered over the rows the record holds now. */
  async function reread() {
    if (data.refused) return;
    const slug = declares;
    reading = true;
    try {
      const out = await readBody(
        slug,
        untrack(() => voice),
        untrack(() => holds),
      );
      if (slug === declares && out?.from === 'live') got = out;
    } catch {
      /* The page as it was read stays; the next version asks again. */
    } finally {
      reading = false;
    }
  }

  /* THE SAME BUSY RULE AS `/p/[slug]`: a re-read waits for a field being typed into and for a card's write
     still out (`aria-busy`), on top of Home's own read already being out. */
  listen(reread, () => reading || typing() || document.querySelector('main [aria-busy="true"]') !== null);

  const live = $derived(got?.from === 'live' ? got : null);
  /* THE PAGE AS HOME DRAWS IT: its line lifted into the head, each row once, and nothing drawn that holds nothing. */
  const shaped = $derived(live ? homeDrawn(live.page.blocks, live.now, voice) : null);

  /* THE ONE LINE, worked out from the blocks drawn, else the page's own line, else the calm one once the page is read. */
  const lead = $derived.by(() => {
    if (!shaped) return null;
    if (shaped.sentence) return shaped.sentence;
    return { text: shaped.lead ?? nothing, needs: '' };
  });

  /* AND THE MODEL'S LINE OVER IT when the record sent one written today; without one this is `lead` as it was. */
  const line = $derived(lead && shaped && live ? homeLineOf(lead, slashLineOf(shaped, declares === null), live.now) : null);
  const slashed = $derived(line?.by === 'slash' ? cutLine(line) : null);

  /* THE PAGE AS HOME DRAWS IT, handed to the reader whole, so the reader's writes index the blocks it draws. A rail with
     nothing beside it, or nothing in it, is one column. */
  const drawn = $derived.by((): Opened | null => {
    if (!got || got.from !== 'live' || !shaped) return got;
    if (railed(shaped.blocks)) return { ...got, page: { page: got.page.page, blocks: shaped.blocks } };
    const { layout: _rail, ...flat } = got.page.page;
    return { ...got, page: { page: flat, blocks: shaped.blocks } };
  });
  const slug = $derived(live?.page.page.page ?? declares ?? 'today');

  /* NOTHING TO DRAW AT ALL: the line says so, and nothing under it. A host that cannot draw Today's body is calm too. */
  const calm = $derived((shaped !== null && !drawsAny(shaped.blocks)) || (settled && got === null));

  /* A RECORD WITH NO LISTS AT ALL goes to the prompt (`+layout.ts`); this is what is left if it is reached anyway. */
  const empty = $derived(data.index.registers.length === 0 && data.open === 0);

  /* WHERE A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD LANDS (`landing.ts`), and `null` for everybody else. */
  const lands = $derived(landing(data));

  /**
   * THE MARK IS STAMPED WHEN THE READER LEAVES, and only when Home drew what is new: a use case's page with no feed has
   * shown nothing to mark read. `pagehide` covers a closed tab, and the effect's end covers leaving for another screen.
   * A mark that did not land leaves the record's where it was, so the same lines come back rather than being lost.
   */
  const feeds = $derived((live?.page.blocks ?? []).some((b) => b.kind === 'feed' && b.source === 'activity'));
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
  <PageHead {title} kicker={today} sentence={slashed ? slashSaid : lead?.text} needs={slashed ? undefined : lead?.needs || undefined} />
</div>

<!--
  THE MODEL'S LINE, in the head's own sentence: the same words in the same type, and the rules' red phrase where it says
  it. Who said it sits under the line, out of the flow and unseen until the line is hovered or focused, so the line at
  rest is the line and nothing else.
-->
{#snippet slashSaid()}
  {#if slashed}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <span class="home-line" tabindex="0"
      >{slashed.before}{#if slashed.needs}<span class="needs" data-needs>{slashed.needs}</span>{/if}{slashed.after}<span class="home-by">{words.byline}</span></span
    >
  {/if}
{/snippet}

<div class="page">
  {#if data.refused}
    <!--
      THE RECORD WOULD NOT ANSWER THIS READER, WHICH IS NOT THE SAME THING AS AN EMPTY RECORD. A colleague invited with
      `Adds only` is refused `boot` with the record's own sentence, which names the person who can help, so it stands
      here alone with no action. And a record that could not be reached is not a refusal: the one
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
        empty.
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
    {:else if settled && got === null}
      <!-- A HOST THAT CANNOT DRAW THE PAGE: the calm line, and what fills it, rather than a blank. -->
      <Empty kind="cleared" title={nothing} body={said('fills_with')} />
    {/if}

    {#if (drawn !== null && !calm) || !settled}
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

  /* THE LINE IS ITS SENTENCE'S ONE CHILD, so a block of its own changes nothing it draws; it holds who said it. */
  .home-line {
    position: relative;
    display: block;
    border-radius: var(--r-sm);
    outline-offset: 4px;
  }

  /* WHO SAID IT: 13 in `--dim`, under the line and out of the flow, so showing it moves nothing. Not drawn at rest. */
  .home-by {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 0;
    margin-block-start: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: 0;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }

  .home-line:is(:hover, :focus) .home-by {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .home-by {
      transition: none;
    }
  }

  /* ── the page ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN, the page's own: its blocks carry their spans and its rail, and Home adds no column of its own beside it. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  .body {
    min-inline-size: 0;
  }

  /* A QUESTION WRAPS TO THREE LINES AND NO MORE on Home; its own card on Decide says it whole. Two cut a question with
     a figure in it before the figure ("was due 4 days ago, £39. Did …") on a phone, and the figure is the question. */
  .body :global(.queue-question) {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
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
      padding: var(--sp-2) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE THE FIGURES ARE TWO BY TWO, rather than a stack of rows pushing what needs you off the screen. */
  @media (width < 640px) {
    .body :global(.grid:has(> .cell:nth-child(2))) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* ON A PHONE A QUESTION IS A STEP UNDER THE HEADLINE, not level with it: at 20 and 24 bold the questions under the
     28px line read as the headline, and the page opened on three of them. The first question keeps one step over the
     rest, as `queue lead` does at every width. */
  @media (width < 900px) {
    .body :global(.queue-question) {
      font-size: var(--t-group);
      font-weight: 600;
    }

    .body :global(.queue-lead > .queue-question) {
      font-size: var(--t-lg);
    }
  }
</style>
