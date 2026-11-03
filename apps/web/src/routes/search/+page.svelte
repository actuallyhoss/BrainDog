<!--
  `/search?q=`: the structured fallback when the palette's ranked list was not enough.

  `19 §2` NAMES THIS A SPINE SCREEN AND THE ROUTE DIRECTORY HAD NONE. The palette caps its record
  hits and, with a round-robin handing one per source per round, a small cap across nine sources is
  often one row per list. Without somewhere to overflow to, that cap had to be silent, and it was:
  eight hits, no count, no "and N more", on the surface `19 §4` makes the primary way to reach a row.

  IT IS THE SAME QUERY, GROUPED RATHER THAN RANKED. The palette interleaves so the first screenful
  spans the record; this keeps each list whole with its own count, because a person who has come here
  has already decided the ranked answer was not the one they wanted.

  ONE TILE A LIST (money F12). Each list that matched is a tile with its name and count,
  and its rows sit in it: a 32px well with the glyph of what it is, the title with the matched letters at 600, and one
  line that tells it from the next (`second.ts`). Over the lists, the best match on its own. The row is drawn here and
  not through the palette's `Result`, which is an option inside glass.

  THE ANSWER IS THE RECORD'S, through `search-live.ts`, and a record that turns the search away says why.

  BEFORE ANYTHING IS TYPED IT OFFERS WHERE TO JUMP: the field across the board's whole width at 48, and under it a tile
  for each kind of place a person goes to most (a section's things in their colours, the people met lately with their
  faces, the lists with their icons, and what changed last). `jump.ts` reads each from the record; a kind with nothing in
  it draws no tile, and a record with nothing at all draws the empty state.

  THE QUERY IS IN THE URL because it is what you are looking at (`19 §5`), which also makes a result
  page a thing you can send somebody. The field writes it back with `replaceState`, throttled, for
  the reason the register's search box does: seven characters is not seven places you have been.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import type { SearchResult } from '$lib/record/api.ts';
  import { searcher, type Found, type Searcher } from '$lib/record/search-live.ts';
  import { shownState } from './shown.ts';
  import { bestOf, byMeaningOf, marked, meaningLine, sentenceOf } from './shown.ts';
  import { secondOf, type Second } from './second.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { daySaid } from '../r/[register]/[seq]/said.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import { money, readable, slotOf } from 'braindog-render';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { isGlyph, type IconName } from '$lib/ui/icons.ts';
  import { createClient } from '@braindog/client';
  import { paletteReader } from '$lib/record/palette-live.ts';
  import { readSide } from '$lib/shell/side-read.ts';
  import { shownName, splitOf } from '$lib/shell/side.ts';
  import { singularOf } from '$lib/voice.ts';
  import type { Recent } from '$lib/record/palette.ts';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { PER_TILE, listsOf, readDeclared, readPeople, thingsOf, type Place } from './jump.ts';

  /* THIS SCREEN'S OWN WORDS, beside it rather than in the copy aggregate, which this unit does not hold. */
  const words = {
    showAll: (n: number) => `Show all ${n.toLocaleString('en')}`,
    best: 'Best match',
    jumpTo: 'Jump to',
    lists: 'Lists',
    projects: 'Projects',
    recent: 'Changed lately',
    changes: (n: number) => `${n} changes`,
    entries: (n: number) => n.toLocaleString('en'),
  } as const;

  /* ── where to jump, before anything is typed ── */

  type Registers = { id: string; name: string; count: number; icon: IconName }[];
  const registers = $derived<Registers>(route.data.index?.registers ?? []);
  /* THE BOX NAMES WHAT IT SEARCHES, "Search The Studio" (P28), where it said "Search the record". */
  /* AND NOT "SEARCH MARA" (Q37 of 29 October): the record's name read as searching for a person. */
  const searchSaid = copy.searchRecord;
  const nav = $derived<{ title: string; href: string; section: string; row?: boolean; hue?: number; icon: IconName; register?: string }[]>(route.data.nav ?? []);
  /* EVERY PROJECT IN PLAY, read as the sidebar reads them (`readSide`), by name: the tile drew the 5 of 18 that have a
     page of their own. `null` until read, and a read that fails keeps the tile the rail's pages make. */
  let projects = $state.raw<Place[] | null>(null);
  const projectNames = $derived(new Set((projects ?? []).map((p) => p.title.trim().toLowerCase())));
  /* A THING NAMED AS A PROJECT, IN ANOTHER SECTION, SAYS WHAT IT IS: "Quartz (book)" under Money beside Quartz the
     project, by the one word of the list its row is in. */
  const twinOf = (p: Place): Place => {
    if (!projectNames.has(p.title.trim().toLowerCase())) return p;
    const list = registers.find((r) => r.id === nav.find((n) => n.href === p.href)?.register);
    return list ? { ...p, title: `${p.title} (${singularOf(list.name)})` } : p;
  };
  /* EACH SECTION OF THINGS WEARS ITS OWN PAGE'S GLYPH, the one the rail draws for it. */
  const things = $derived.by(() => {
    const projectAt = new Set((projects ?? []).map((p) => p.href));
    const out = thingsOf(nav).map((t) => {
      const page = nav.find((n) => n.section === t.section && n.row !== true);
      const ofProjects = projects !== null && (t.section.trim().toLowerCase() === 'projects' || t.items.some((i) => projectAt.has(i.href)));
      return ofProjects && projects
        ? { section: t.section, items: projects, total: projects.length, icon: page?.icon ?? ('projects' as IconName), all: page?.href }
        : { ...t, items: t.items.map(twinOf), icon: page?.icon ?? ('projects' as IconName), all: page?.href };
    });
    if (projects && projects.length > 0 && !out.some((t) => t.items === projects))
      out.unshift({ section: words.projects, items: projects, total: projects.length, icon: 'projects' as IconName, all: undefined });
    return out;
  });
  let read = $state.raw<{ icons: ReadonlyMap<string, IconName>; people: Place[]; met: { name: string; icon: IconName } | null; recent: Recent[] } | null>(null);
  const lists = $derived(listsOf(registers, read?.icons ?? new Map()));
  const people = $derived(read?.met ? read.people : []);
  const recent = $derived(read?.recent ?? []);
  /* ONE LINE A NAME IN A LIST (P28): two Ledger entries both called "Ledger Post" read as one row said twice, so they
     fold into the newest with how many; one name in two lists says which list each is. */
  const lately = $derived.by(() => {
    const out: { r: Recent; n: number; twice: boolean }[] = [];
    /* AND ONE LINE A SERIES (T25): "Halden licence, 4 of 4", "3 of 4" … and "Halden licence" itself were five rows for
       one thing changed. They fold into one, named for the series, opening the series itself where it is among them. */
    const seriesOf = (title: string): string => title.replace(/,\s*\d+\s+of\s+\d+$/u, '');
    for (const r of recent) {
      const key = seriesOf(r.title);
      const same = out.find((x) => seriesOf(x.r.title) === key && (x.r.list === r.list || x.r.title !== r.title));
      if (same) {
        same.n += 1;
        /* THE SERIES ITSELF OPENS, where it is among them, at the newest change's day. */
        if (r.title === key) same.r = { ...r, at: same.r.at };
      } else out.push({ r, n: 1, twice: false });
    }
    for (const x of out) if (x.n > 1) x.r = { ...x.r, title: seriesOf(x.r.title) };
    for (const x of out) x.twice = out.some((y) => y !== x && y.r.title === x.r.title);
    return out;
  });
  const jumps = $derived(things.length + (people.length > 0 ? 1 : 0) + (lists.length > 0 ? 1 : 0) + (recent.length > 0 ? 1 : 0));

  /* ASKED ONCE A VISIT, and only while nothing is typed: a person who arrives with a query wants its answer, not these.
     A read that fails leaves its tile out, and the lists and things the shell already holds still draw. */
  let asking = false;
  async function readJumps(held: Registers) {
    if (asking) return;
    asking = true;
    const client = createClient({ base: apiBase() });
    const [declared, lately] = await Promise.all([
      readDeclared(client, held.filter((r) => r.count > 0), isGlyph).catch(() => null),
      paletteReader(apiBase()).recent(held, PER_TILE).catch(() => [] as Recent[]),
    ]);
    const met = declared?.people ? await readPeople(client, declared.people).catch(() => [] as Place[]) : [];
    /* THE PROJECTS IN PLAY, IN A STEADY ORDER (by name), as the sidebar lists them. */
    const side = await readSide(apiBase(), held).catch(() => null);
    if (side)
      projects = splitOf(side.rows, side.lanes)
        .play.map((r): Place => ({ title: shownName(r.name), href: r.href, ...(r.hue === null ? {} : { hue: r.hue }) }))
        .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    /* A CHANGED ROW WEARS ITS LIST'S DECLARED GLYPH TOO, read in the same answers as the lists tile's. */
    const icons = declared?.icons ?? new Map<string, IconName>();
    /* THE PEOPLE TILE IS NAMED AND DRAWN AS THEIR LIST IS, whatever the record calls it. */
    const role = declared?.people ?? null;
    const list = role ? held.find((r) => r.id === role.register) : undefined;
    read = {
      icons,
      people: met,
      met: role && list ? { name: list.name, icon: icons.get(role.register) ?? list.icon } : null,
      recent: lately.map((r) => ({ ...r, icon: icons.get(r.target.split('#')[0] ?? '') ?? r.icon })),
    };
  }

  /* A READ THAT HANGS DOES NOT HOLD WHAT THE SHELL ALREADY HAS: after this long the tiles draw from it, as before. */
  let readLate = $state(false);
  const lateAt = setTimeout(() => (readLate = true), 2500);
  onDestroy(() => clearTimeout(lateAt));

  $effect(() => {
    if (shown === 'idle' && read === null) {
      const held = registers;
      untrack(() => void readJumps(held));
    }
  });

  const q = $derived(route.url.searchParams.get('q') ?? '');

  /* ONE READ PER ADDRESS, and the address is written at most every 150 ms below, so typing is not a
     request per key. An answer to a query that has since changed is dropped. The PAGE caps what it
     draws per list and says where the rest is; the record caps its own answer at a hundred. */
  let finder: Searcher | null = null;
  let answer = $state<Found | null>(null);
  /* WHICH QUERY `answer` WAS COMPUTED FOR. Without it a verdict computed for the last query is
     printed under the words in the box now: `copy.searchNone(q)` interpolates what is being typed
     into a conclusion about something else, and then tells the reader to check their spelling. */
  let answeredFor = $state<string | null>(null);
  let asked = 0;

  async function ask(want: string) {
    const mine = ++asked;
    const at = opened();
    finder ??= searcher(apiBase());
    const out = await finder.find(want);
    closed(mine !== asked || out.from !== 'refused', at);
    if (mine === asked) {
      answer = out;
      answeredFor = want;
    }
  }

  $effect(() => {
    const want = q;
    untrack(() => void ask(want));
  });

  const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };
  const found = $derived(answer && answer.from !== 'refused' ? answer.value : NOTHING);
  /* THE FIVE ARMS, DECIDED IN ONE PLACE. A list of hits is content and a reader can see it is about
     something, so hits from the last query stay while the next answer is out; a verdict is a claim
     about the words in the box, so it waits. `shown.ts` says which arm, and is where the rule is
     held to a test. */
  const shown = $derived(shownState(q, answer, answeredFor));

  /* THE SENTENCE AND THE TILE ARE THE ANSWER'S, and only once the answer on screen has hits: a verdict or a wait says
     nothing about where anything matched. `top` is the list with strictly the most, and no list on a tie. */
  const sentence = $derived(shown === 'hits' ? (sentenceOf(q, found) ?? undefined) : undefined);
  /* AND ONE QUIET LINE ABOUT MEANING, for an answer the screen is drawing: how many of the hits share no word with
     the query, or why nothing was searched by meaning. A record that does not say how it searched says nothing here. */
  const meaningSaid = $derived(
    shown === 'hits' || shown === 'none'
      ? meaningLine(q, { total: found.total, byMeaning: byMeaningOf(found) }, answer?.from === 'live' ? answer.meaning : undefined)
      : null,
  );
  /* THE BEST MATCH, over the lists in a tile of its own (money F12), and still in its list below. */
  const best = $derived(shown === 'hits' ? bestOf(found.hits, q) : null);

  /**
   * THE SECOND LINES THAT TELL HITS APART (`second.ts`). The record's search answers a row's list, number and title and
   * nothing else, so three "Kiln storefront payout" lines read the same; the rows on screen are read once per list,
   * after the answer, and each line then says its day and amount, or its list's Due cell. Read for the query they were
   * asked for, and dropped for any other.
   */
  let rowsFor = $state.raw<{ q: string; rows: ReadonlyMap<string, Entry> }>({ q: '', rows: new Map() });
  const ROW_HREF = /^\/r\/([a-z][a-z0-9_]*)\/([1-9]\d*)$/u;
  async function readSeconds(want: string, groups: SearchResult['groups']) {
    const by = new Map<string, number[]>();
    for (const g of groups)
      for (const h of g.hits.slice(0, PER_LIST)) {
        const m = ROW_HREF.exec(h.href);
        if (m) by.set(m[1]!, [...(by.get(m[1]!) ?? []), Number(m[2])]);
      }
    if (by.size === 0) return;
    const client = createClient({ base: apiBase() });
    const rows = new Map<string, Entry>();
    await Promise.all(
      [...by].map(async ([register, seqs]) => {
        const out = await client.list({ register, where: { field: 'seq', in: seqs }, limit: seqs.length }).catch(() => null);
        if (out?.ok) for (const r of out.value.rows as Entry[]) rows.set(`/r/${register}/${r.seq}`, r);
      }),
    );
    if (q === want) rowsFor = { q: want, rows };
  }
  $effect(() => {
    if (shown !== 'hits' || answeredFor === null) return;
    const want = answeredFor;
    const groups = found.groups;
    untrack(() => void readSeconds(want, groups));
  });
  const moneySaid = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), true);
  const secondFor = (href: string): Second | null => {
    const row = rowsFor.q === q ? rowsFor.rows.get(href) : undefined;
    const m = ROW_HREF.exec(href);
    return row && m ? secondOf(REGISTERS[m[1]!], row, recordNow(), moneySaid) : null;
  };

  /* TEN A LIST. Enough to recognise the one you meant, few enough that nine matching lists is a page
     rather than a scroll, and every list carries the way to its own remainder. */
  const PER_LIST = 10;

  /* THE GROUPS OPENED IN PLACE, by their heading. A list's remainder is its own screen, filtered by
     what was typed; the decisions and the pages have no such screen, and every one of them that
     matched is already in hand (`search-live.ts` matches both in full), so "Show all" draws the rest
     here instead.

     HELD WITH THE QUERY IT WAS OPENED FOR, because a group opened for one search is not a request to
     draw every decision the next search finds: typing a new word folds every group back to ten. */
  let whole = $state<{ q: string; kinds: ReadonlySet<string> }>({ q: '', kinds: new Set() });
  const isWhole = (kind: string): boolean => whole.q === q && whole.kinds.has(kind);
  function openGroup(kind: string) {
    whole = { q, kinds: new Set([...(whole.q === q ? whole.kinds : []), kind]) };
  }

  /* THROTTLED `replaceState`, which `19 §5` asks for by name: *"pushState for discrete intent so
     Back undoes a filter, throttled replaceState for typing"*. A history entry per keystroke makes
     Back a character-by-character rewind of something nobody thinks of as navigation.

     AND IT IS CANCELLED WHEN THE PAGE GOES. Typing here and clicking Home inside the 150 ms landed
     on `/?q=…`, the home screen wearing a query it has no box for. A pending write to a URL
     belongs to the page that scheduled it and to no other. */
  let pending: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(pending));

  let box = $state<HTMLInputElement | null>(null);

  /* Empties the box and the address, and leaves the caret in the box for the next try. */
  function clearSearch() {
    if (box) box.value = '';
    typed('');
    box?.focus();
  }

  function typed(value: string) {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const next = new URLSearchParams(route.url.searchParams);
      if (value) next.set('q', value);
      else next.delete('q');
      void goto(`?${next}`, { replaceState: true, noScroll: true, keepFocus: true });
    }, 150);
  }

  /**
   * DRAWN ONCE AN ANSWER HAS COME BACK, the record's or the sample's.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim. The read is bracketed by `opened()` and `closed()`, so a call still out takes
   * the attribute away whatever this line says.
   */
  $effect(() => {
    if (answer && answer.from !== 'refused') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(q || copy.search)}</title></svelte:head>

<!-- A TITLE AS A PERSON WRITES IT (`readable`: a bank's capitals in sentence case), the letters the query matched at 600. -->
{#snippet titled(title: string)}{#each marked(readable(title), q) as piece, i (i)}{#if piece.hit}<b class="matched">{piece.text}</b>{:else}{piece.text}{/if}{/each}{/snippet}

{#snippet second(hit: SearchResult['hits'][number])}
  {@const told = secondFor(hit.href)}
  {@const raw = told?.text ?? hit.why ?? (hit.detail || hit.kind)}
  <!-- THE SECOND LINE IN WORDS (30 October): a bank's capitals read as words, as the title above it does, and a bare
       number with nothing to say what it counts gives way to the list's name. -->
  <span class="line-detail" dir="auto" data-late={told?.late ? '' : undefined}>{raw.trim() !== '' && Number.isInteger(Number(raw.trim())) ? hit.kind : readable(raw)}</span>
{/snippet}

<!-- THE BEST MATCH'S MARK: a person's face where the hit is somebody, else the well its list draws. -->
{#snippet lead(hit: SearchResult['hits'][number])}
  {@const list = ROW_HREF.exec(hit.href)?.[1]}
  {#if list && (REGISTERS[list] as { meets?: unknown } | undefined)?.meets}<Face name={hit.title} size="m" />{:else}<IconWell name={hit.icon} size="l" />{/if}
{/snippet}

{#snippet meaningBelow()}<p class="reading">{meaningSaid}</p>{/snippet}

<!-- UNDER THE TITLE SENTENCE when there are hits; under the empty state, below, when there are none. -->
<PageHead icon="search" title={copy.search} {sentence} below={shown === 'hits' && meaningSaid ? meaningBelow : undefined} />

<div class="page">
  <!-- THE FIELD ACROSS THE BOARD, first under the sentence: 48 tall on the tile's own fill, as wide as the tiles under
       it, the glyph inside the label and the input taking the rest. It is the fallback when the rail's Ask was not
       enough, so it is here on every visit. -->
  <label class="field field-lg search-field">
    <Icon name="search" size="m" />
    <!-- A NAME, NOT A PLACEHOLDER: the placeholder disappears the moment somebody types, taking the
         accessible name with it. Every search box in the product has the same shape. -->
    <input
      bind:this={box}
      class="field-input"
      type="search"
      aria-label={searchSaid}
      placeholder={searchSaid}
      value={q}
      oninput={(e) => typed((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  {#if shown === 'idle'}
    <!-- NOT AN ERROR AND NOT A RESULT. Arriving here with no query is the ordinary way in from the
         nav, and `19 §6`'s `no-data-yet` is the state for a surface waiting on you rather than on
         the record. -->
    {#if read === null && !readLate}
      <!-- THE TILES WAIT FOR THEIR READS, AND DRAW ONCE, IN THEIR PLACES: drawn from what the shell held first, Projects and
           Lists stood at the top and were pushed down when Changed lately and People landed over them (0.41 of a phone's
           layout shift). Nothing is under them, so arriving whole moves nothing. -->
    {:else if jumps > 0}
      <section class="jump" aria-labelledby="jump-title">
        <h2 class="jump-title" id="jump-title">{words.jumpTo}</h2>
        <div class="jump-grid">
          {#if recent.length > 0}
            <!-- WHAT HE WAS JUST DOING LEADS (T26), two columns wide, then Money, Projects, People and the lists. -->
            <div class="lately">
            <Tile icon="clock" title={words.recent}>
              <ul class="places">
                {#each lately as { r, n, twice } (r.href)}
                  <li>
                    <a class="place" href={at(r.href)}>
                      <span class="place-lead" aria-hidden="true"><Icon name={r.icon} size="m" /></span>
                      <span class="place-name">{readable(r.title)}{#if n > 1}<span class="place-list">{' · '}{words.changes(n)}</span>{:else if twice}<span class="place-list">{' · '}{r.list}</span>{/if}</span>
                      <span class="place-n">{daySaid(r.at.slice(0, 10), recordNow())}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            </Tile>
            </div>
          {/if}
          {#each things as t (t.section)}
            <!-- A SECTION'S THINGS, EACH IN ITS OWN COLOUR, the dot the rail draws beside it. -->
            <Tile icon={t.icon} title={t.section}>
              {#snippet actions()}
                {#if t.total > t.items.length && t.all}<Button weight="bare" size="sm" href={at(t.all)}>{words.showAll(t.total)}</Button>{/if}
              {/snippet}
              <ul class="places">
                {#each t.items as p (p.href)}
                  <li>
                    <a class="place" href={at(p.href)}>
                      <span class="place-lead" aria-hidden="true">{#if p.hue !== undefined}<span class="hue" style:background="var(--cat-{slotOf(p.hue)}-fill)"></span>{:else}<Icon name={t.icon} size="m" />{/if}</span>
                      <span class="place-name">{p.title}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            </Tile>
          {/each}
          {#if people.length > 0 && read?.met}
            <Tile icon={read.met.icon} title={read.met.name}>
              <ul class="places">
                {#each people as p (p.href)}
                  <li>
                    <a class="place" href={at(p.href)}>
                      <span class="place-lead"><Face name={p.title} size="m" /></span>
                      <span class="place-name">{p.title}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            </Tile>
          {/if}
          {#if lists.length > 0}
            <Tile icon="rows" title={words.lists}>
              <ul class="places">
                {#each lists as l (l.href)}
                  <li>
                    <a class="place" href={at(l.href)}>
                      <span class="place-lead" aria-hidden="true"><Icon name={l.icon ?? 'rows'} size="m" /></span>
                      <span class="place-name">{l.title}</span>
                      <span class="place-n num">{words.entries(l.count)}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            </Tile>
          {/if}
        </div>
      </section>
    {:else}
      <div class="quiet"><Empty kind="no-data-yet" glyph="search" title={copy.searchWaiting} body={copy.searchWhere} /></div>
    {/if}
  {:else if shown === 'waiting'}
    <!-- Bars until the first answer, holding the shape the results will take. -->
    <Waiting />
  {:else if shown === 'refused' && answer?.from === 'refused'}
    <Empty kind="error" title={answer.fix}>
      {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if shown === 'none'}
    <Empty kind="no-results" title={copy.searchNone(q)} body={copy.searchNoneNext}>
      {#snippet actions()}
        <Button weight="primary" onclick={clearSearch}>{copy.searchClear}</Button>
        <Button weight="bare" href="/audit">{copy.searchInHistory}</Button>
      {/snippet}
    </Empty>
    {#if meaningSaid}<p class="reading">{meaningSaid}</p>{/if}
  {:else}
    <div class="results">
      <!-- THE BEST MATCH FIRST, ON ITS OWN (money F12): the one line most likely to be what was meant, at 56 with its mark,
           before the lists. "Where it matched" stood beside the lists as bars of what the headings already count. -->
      {#if best}
        <Tile title={words.best}>
          <a class="line hit best" href={at(best.href)}>
            {@render lead(best)}
            <span class="line-main">
              <span class="line-title" dir="auto">{@render titled(best.title)}</span>
              {@render second(best)}
            </span>
          </a>
        </Tile>
      {/if}

      <!-- A LIST WHOSE ONLY HIT IS THE BEST MATCH IS NOT DRAWN AGAIN under it (ui-work 2 Nov): "north" drew Northbound's
           late invoice as Best match and then as Needs you 1, the same line twice in two tiles. -->
      {#each found.groups.filter((g) => !(best && g.total === 1 && g.hits.length === 1 && g.hits[0]!.href === best.href)) as group (group.kind)}
        {@const all = isWhole(group.kind)}
        <!-- EACH LIST IN A TILE OF ITS OWN, its name and count the tile's heading and the way to the rest its action. -->
        <Tile title={group.kind} count={group.total.toLocaleString('en')}>
          {#snippet actions()}
            <!--
              EVERY CAPPED GROUP OFFERS THE REST, whether or not it has a screen of its own.

              This was `group.href && group.total > PER_LIST`, and the questions group's `href` is `null` by construction,
              because `/decide` is not a filtered list. So with fourteen matching decisions the page drew *Decide 14*, ten
              rows, and nothing: four rows dropped in silence, on the screen built because the palette dropped rows in
              silence. A list's rest is that list, filtered by what was typed; the decisions and the pages are all in hand,
              so theirs opens here, and the count on the button is what it will draw.
            -->
            {#if group.href && group.total > PER_LIST}
              <Button weight="bare" size="sm" href={group.href}>{words.showAll(group.total)}</Button>
            {:else if !group.href && !all && group.hits.length > PER_LIST}
              <Button weight="bare" size="sm" onclick={() => openGroup(group.kind)}>{words.showAll(group.hits.length)}</Button>
            {/if}
          {/snippet}
          <ul class="ledger ledger-lead hits">
            {#each all ? group.hits : group.hits.slice(0, PER_LIST) as hit (hit.href)}
              <li>
                <!-- THE ROW SAYS WHAT TELLS IT APART: its day and amount, or its Due cell (`second.ts`), else why it
                     matched, else the list it is in. -->
                <a class="line line-tall hit" href={at(hit.href)}>
                  <IconWell name={hit.icon} size="l" />
                  <span class="line-main">
                    <span class="line-title" dir="auto">{@render titled(hit.title)}</span>
                    {@render second(hit)}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </Tile>
      {/each}
    </div>
  {/if}
</div>

<style>
  .place-list {
    color: var(--ink-3);
    font-weight: 400;
  }

  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--page-head-gap, 24px);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
  }

  /* THE FIELD IS `controls.css`'s, with the ink ring on the wrapper while the input inside it has focus, drawn here at
     48 on the tile's own fill and as wide as the board, so it reads as the first tile rather than a box floating on it. */
  .search-field {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 48px;
    background: var(--tile);
    border-radius: var(--r-field, 12px);
  }

  /* ── where to jump ─────────────────────────────────────────────────────── */

  .jump {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A CAPS LABEL OVER EACH WAY TO JUMP (ops 2.3), on the text edge. */
  .jump-title {
    margin: 0;
    padding-inline: var(--title-inset, 12px);
    color: var(--ink-3);
    font: var(--t-caps, 500 11px / 16px var(--font-ui));
    letter-spacing: var(--track-caps, 0.025em);
    text-transform: uppercase;
  }

  /* FOUR ACROSS WHERE THERE IS ROOM, two on a narrow desk, one on a phone: the tiles keep a readable width and fill
     the row (`auto-fit`, so three tiles take the row rather than leaving a fourth's hole), measured on the page's own
     width so a docked panel narrows it. */
  .jump-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: var(--tile-gap);
    align-items: start;
  }

  /* FOUR ACROSS ON A WIDE PAGE, Changed lately two of them, and no tile left alone on the second row: with five tiles the
     last two take half the row each (T26). */
  .jump {
    container-type: inline-size;
  }

  @container (inline-size >= 1100px) {
    .jump-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .lately {
      grid-column: span 2;
    }

    .jump-grid:has(> .lately):has(> :global(:nth-child(5):last-child)) > :global(:nth-child(n + 4)) {
      grid-column: span 2;
    }
  }

  /* A PLACE IS A 36PX ROW, the rail's own height: its colour, face or glyph, its name, and what it holds at the end. */
  .places {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--sp-2));
    padding: 0;
    list-style: none;
  }

  .place {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--row-gap, 12px);
    min-block-size: var(--ctl-h, 36px);
    padding-inline: var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .place:hover {
      background: var(--row-wash, var(--hover));
    }
  }

  @media (pointer: coarse) {
    .place {
      min-block-size: var(--tap);
    }
  }

  .place-lead {
    display: inline-grid;
    place-items: center;
    color: var(--ink-2);
  }

  /* A PROJECT'S DOT IN ITS SLOT'S FILL, as Work's filters and the sidebar draw it: its own hue at the mark's lightness
     made one project two colours (colour lane, 2 Nov). */
  .hue {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
  }

  .place-name {
    overflow: hidden;
    font-size: var(--fs-body);
    line-height: var(--lead-ui, 20px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .place-n {
    max-inline-size: 14ch;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quiet {
    padding: var(--tile-pad);
    background: var(--tile);
    border: 1px solid var(--card-edge, transparent);
    border-radius: var(--r-tile);
    box-shadow: var(--shadow-card, none);
  }

  /* SIXTEEN PIXELS AT EVERY WIDTH, as every input in the product is, so a phone does not zoom the page
     when the field is pressed. */
  .search-field .field-input {
    font-size: var(--fs-body);
  }

  /* The ring is not deleted, it MOVES to the box that looks like the field (`controls.css`, `.field:focus-within`). */
  .field-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.field:focus-within` carries the state change for
       the box the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  /* ONE COLUMN OF TILES: the best match, then each list. */
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* THE ONE LINE THAT READS THE CHART, under it, and the quiet line about meaning in the same voice. */
  .reading {
    margin: 0;
    padding-inline: var(--title-inset, 12px);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE LETTERS THE QUERY MATCHED, at 600 in the title's own ink. */
  .matched {
    font-weight: 600;
  }

  /* THE BEST MATCH, one 56px line. */
  .best {
    min-block-size: var(--row-h-2, 56px);
    /* THE SAME 12 FROM WELL TO WORDS AS THE LISTS' ROWS BELOW (it was 16, so its title started 4px further in). */
    column-gap: var(--row-gap, 12px);
    /* AND ITS WELL ON THE SAME EDGE AS EVERY LIST'S BELOW IT (leftovers 4): a list's rows stand out by their padding so
       the wash under the pointer reaches the tile's edge, and the best match, not in one, stood 12 further in. */
    margin-inline: calc(-1 * var(--sp-3));
  }

  /* A LATE ROW'S DUE CELL, in red as its list says it. */
  .line-detail[data-late] {
    color: var(--red);
  }

  /* A HIT IS A ROW ON THE GROUND: its well, its title over its line, and the rounded wash under the pointer. The shared
     card layout under 640 puts the words under the lead; a hit keeps its well beside both lines at every width. */
  .hit {
    grid-template-columns: var(--well-l) minmax(0, 1fr);
  }

  @media (width < 640px) {
    .hit .line-main {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
