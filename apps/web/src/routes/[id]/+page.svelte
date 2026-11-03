<!--
  The spoken-id resolver: `/D41`, `/SG31`, `/tasks#7`.

  Resolved by the SHELL, not by a server 302: no server renders a request here (50 §13 D17). It
  asks the record and replaces the address with the canonical one, so Back does not bounce.

  `brain.dog/D41` is a sentence one person can say to another and a string an agent can emit with no
  lookup. It is the cheapest legibility win available (19 §5).

  The one exception is the display default `#`: `#125` NEVER resolves bare, because every register
  has a `#1`. Type `tasks#125`.

  THE RECORD, AND ONLY THE RECORD. It looked ids up in the in-browser sample alone, so on a live record
  `/SG5` answered "Nothing answers to SG5" for a question that exists. A question is read through
  `governance` as `/decide` reads it and a row through `get` with the spoken id. `UNREACHABLE` and
  `UNAUTHORIZED` then sent it to the sample's question or row of the same id, a fictional studio's,
  until the sample was removed.

  AND ONLY WHAT IS SHAPED LIKE A SPOKEN ID IS ASKED ABOUT. Every one-segment address inside a record
  lands here, so `/moneyy` was answered "Nothing answers to “moneyy”" and told how ids are spelt, as
  if the person had been reading one out. A string that is not an id's shape was never an id: it is
  an address that leads nowhere, and it gets the same not-found screen as any other.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import NotFound from '$lib/ui/NotFound.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { nearest, shellPlaces } from '$lib/record/nearest.ts';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /* A MALFORMED ESCAPE IS STILL AN ADDRESS, and `decodeURIComponent` throws on one (`/%E0`), which took the whole
     screen down to the error page for what is only a mistyped path. */
  const decoded = (said: string): string => {
    try {
      return decodeURIComponent(said);
    } catch {
      return said;
    }
  };

  /**
   * What was said, from the address as the browser holds it now.
   *
   * THE `#n` OF `tasks#7` IS THE ADDRESS'S FRAGMENT, NOT PART OF ITS PATH. Typed into the bar it never reaches
   * `params.id`, so the one spelling this page's header promises arrived as `tasks` and was answered as an address
   * that leads nowhere. A fragment that is only a number is put back after a list's name, the one shape `QUALIFIED`
   * below reads; any other fragment is a place on a page and is not part of an id.
   */
  const spoken = (): string => {
    const path = decoded(page.params.id ?? '');
    const hash = page.url.hash;
    return /^[a-z][a-z0-9_]*$/u.test(path) && /^#\d+$/u.test(hash) ? `${path}${hash}` : path;
  };

  const raw = $derived(spoken());

  /* This page's own words. None of the titles ends in a full stop: a title is not a sentence. */
  const words = {
    bareTitle: (said: string): string => `“${said}” could be in any of your lists`,
    bareBody: 'A number on its own does not say which list it is in. Search for the thing by what it says instead.',
    spokenTitle: (said: string): string => `Nothing answers to “${said}”`,
    spokenBody: 'Nothing here goes by that name. Search for it by what it says instead.',
    opening: (said: string): string => `Opening ${said}`,
  } as const;

  const BARE = /^#?\d+$/;
  const PREFIXED = /^[A-Za-z]{1,3}\d+$/;
  const QUALIFIED = /^([a-z][a-z0-9_]*)#(\d+)$/;

  /**
   * The three shapes a spoken id takes, and what this page does with each: `bare` is a number that names no one list,
   * `spoken` is asked of the record, and `address` is a path that was never an id and leads nowhere.
   */
  const shape = $derived(BARE.test(raw) ? 'bare' : PREFIXED.test(raw) || QUALIFIED.test(raw) ? 'spoken' : 'address');

  /**
   * A refusal as this page reads it. `detail` is the transport's own words when the client keeps them apart from its
   * sentence (`unreachable()`); until then they are inside `fix`, and the fold below shows whichever it has.
   */
  type Refusal = { code: string; fix: string; detail?: string | undefined };
  type Wire = { ok: true; value: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

  /**
   * A refusal of a question is the record's own sentence, and so is a record that could not be asked at all.
   *
   * A ROW'S OTHER REFUSALS ARE "NOTHING ANSWERS", which is what `get` refusing a spoken id nobody can name means. But
   * `UNAUTHORIZED` and `UNREACHABLE` are not an answer about the id: nothing was looked up, so "Nothing answers to
   * tasks#3" would be a claim about a row nobody asked about. They drew the sample's row until the sample left; now they
   * are said, like any refusal of a question.
   */
  const unasked = (code: string): boolean => code === 'UNAUTHORIZED' || code === 'UNREACHABLE';
  const missed = (out: Wire, quote: boolean): { to: null; refusal: Refusal | null } => ({
    to: null,
    refusal: 'refusal' in out && (quote || unasked(out.refusal.code)) ? out.refusal : null,
  });

  /** Where an id goes on the record behind this host. */
  async function resolved(said: string): Promise<{ to: string | null; refusal: Refusal | null }> {
    const client = createClient({ base: apiBase() });
    if (/^(?:SG|D)\d+$/iu.test(said)) {
      const id = said.toUpperCase();
      const out = await client.governance({ register: id.startsWith('D') ? 'decision' : 'suggestion', id });
      if (!out.ok) return missed(out, true);
      return { to: out.value ? `/decide/${id}` : null, refusal: null };
    }
    /* A ROW THE READER CANNOT NAME is not found, in the words this page already has for that. */
    const out = await client.call<{ register?: string; seq?: number | null } | null>('get', { spoken: said });
    if (!out.ok) return missed(out, false);
    const row = out.value;
    return { to: row?.register && typeof row.seq === 'number' ? `/r/${row.register}/${row.seq}` : null, refusal: null };
  }

  let done = $state(false);
  let refusal = $state<Refusal | null>(null);
  /* A LOOKUP STILL OUT AFTER 150ms SAYS WHAT IT IS OPENING (money F15), inside the shell: the screen was blank while
     the record was asked, which read as a page that had failed to draw. Under 150ms nothing is drawn, so a quick
     answer does not flash. */
  let slow = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(slowTimer));

  /**
   * Ask the record, when there is something to ask.
   *
   * A NUMBER ON ITS OWN AND AN ADDRESS THAT IS NOT AN ID ARE ANSWERED HERE, with no call: the record has nothing to say
   * about either, and a call made anyway would hold the screen unsettled for a question with no answer.
   */
  async function resolve(said: string, asked: 'bare' | 'spoken' | 'address') {
    done = false;
    refusal = null;
    if (asked !== 'spoken') {
      done = true;
      return;
    }
    const began = opened();
    slow = false;
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => (slow = true), 150);
    const out = await resolved(said);
    clearTimeout(slowTimer);
    if (spoken() !== said) return closed(true, began);
    /* AN ID THAT RESOLVES NEVER SAYS IT SETTLED HERE: closing the read first set `data-screen` on an empty page for the
       moment before the move, and a picture taken then was a blank board (VERIFY P8). The move clears the claim, and
       the screen it lands on makes its own. */
    if (out.to) {
      /* A MOVE ANOTHER NAVIGATION OVERTOOK IS MADE AGAIN. A shell drawn from the last copy reloads its `boot` once the
         live one answers (`invalidate` in `+layout.svelte`), and a reload of the screen still here drops a `goto` in
         flight without a word: `/SG10` opened in a new tab sat on a blank "SG10" for good, measured on every pass of
         the a11y gate until a reload. So the move is asked again while the reader is still on this id, and the third
         time it is a full load, which nothing can overtake. */
      const to = out.to;
      for (let tries = 0; tries < 2; tries++) {
        const moved = await goto(at(to), { replaceState: true }).then(
          () => true,
          () => false,
        );
        if (!moved) return closed(false, began);
        if (page.route.id !== '/[id]' || spoken() !== said) return;
      }
      location.replace(at(to));
      return;
    }
    closed(out.refusal === null, began);
    refusal = out.refusal;
    done = true;
  }

  $effect(() => {
    const said = raw;
    const asked = shape;
    untrack(() => void resolve(said, asked));
  });

  /**
   * DRAWN ONCE THE RECORD HAS ANSWERED THAT NOTHING IS THERE. The read is bracketed by `opened()` and
   * `closed()`, so a call still out takes `data-screen` away whatever this says, and an id that
   * resolves hands the claim to the screen it goes to.
   */
  $effect(() => {
    if (done && !refusal) drew('ready');
  });

  /* THE HEADING OF EACH NOT-FOUND, which is also the tab's title. An address that is not an id has none of its own:
     `NotFound` says its own title, and the tab says the address. */
  const missing = $derived(shape === 'bare' ? words.bareTitle(raw) : shape === 'spoken' ? words.spokenTitle(raw) : copy.noPageCalled(raw));

  /* THE PAGES AND LISTS THE RAIL OFFERS, NEAREST TO WHAT WAS TYPED FIRST (`record/nearest.ts`). */
  const shell = $derived(page.data as { nav?: { title: string; href: string }[]; index?: { registers?: { id: string; name: string }[] } });
  const near = $derived(shape === 'address' ? nearest(raw, shellPlaces(shell.nav ?? [], shell.index?.registers ?? [])) : []);
</script>

<!-- A REFUSAL IS NOT "NOTHING ANSWERS" IN THE TAB EITHER. With the sample gone a 401 draws the record's sentence
     in the body, and the title still claimed `Nothing answers to “tasks#3”` over it, about a row nobody looked up. -->
<svelte:head><title>{titleOf(done && !refusal ? (missing ?? raw) : raw)}</title></svelte:head>

{#if !done && slow && shape === 'spoken'}
  <!-- THE HEAD'S PLACE AND ONE TILE'S, while the record is asked: what is opening, at the body size in the quiet ink. -->
  <div class="page opening" role="status">
    <p class="opening-said">{words.opening(raw)}</p>
    <div class="opening-tile" aria-hidden="true"></div>
  </div>
{:else if done && refusal?.code === 'UNREACHABLE'}
  <div class="page">
    <!-- THE RECORD WAS NOT ASKED, SO THE SCREEN SAYS THAT AND OFFERS THE ONE THING THAT HELPS. The client's sentence
         carries the socket's words ("200 with a body that is not JSON"), and those are for whoever reports the
         fault, so they fold under Details and Retry asks again. -->
    <Empty kind="error" heading title={copy.readOffline} detail={refusal?.detail ?? refusal?.fix}>
      {#snippet actions()}<Button weight="primary" onclick={() => void resolve(raw, shape)}>{copy.readRetry}</Button>{/snippet}
    </Empty>
  </div>
{:else if done && refusal}
  <div class="page">
    <Empty kind="error" heading title={copy.readRefused} body={refusal?.fix}>
      {#snippet actions()}<Button href="/">{copy.today}</Button>{/snippet}
    </Empty>
  </div>
{:else if done}
  <PageHead title={shape === 'bare' || shape === 'spoken' ? (missing ?? raw) : copy.noPageCalled(raw)} headless />
  <div class="page">
    <!-- A NUMBER AND AN ID SAY NO MORE THAN WHAT WAS TYPED. The bodies used to teach the spelling of an id
         ("obligations#4", "SG31"), which is a developer's notation on a screen anybody reaches; what helps a person
         who has a thing's number and not its name is Search, which finds it by what it says. -->
    {#if shape === 'bare'}
      <NotFound title={missing ?? raw} body={words.bareBody} />
    {:else if shape === 'spoken'}
      <NotFound title={missing ?? raw} body={words.spokenBody} />
    {:else}
      <!-- AN ADDRESS THAT WAS NEVER AN ID IS A PAGE THAT IS NOT HERE, said by what was typed, with the nearest pages. -->
      <NotFound title={copy.noPageCalled(raw)} near={near} />
    {/if}
  </div>
{/if}

<style>
  /* ON THE GROUND AND NOTHING ELSE: no tile and no chart, only the state, its glyph level with where a
     title row's title would stand (12 from the top of the work, as the head's) and at the page's gutter, so an address
     that led nowhere reads as a quiet screen of the app rather than a page of its own. `Empty` keeps its words at the
     measure; the column is not capped here. */
  .page {
    padding: var(--inset) var(--gutter) var(--sp-8);
  }

  .opening {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .opening-said {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .opening-tile {
    block-size: 120px;
    background: var(--tile);
    border-radius: var(--r-tile);
  }
</style>
