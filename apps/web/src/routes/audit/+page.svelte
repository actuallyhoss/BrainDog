<!--
  Every write, by whom, against which version.

  Of four comparable products surveyed, three ship a MUTABLE history: one has a "Clear revision
  history" button whose result cannot be retrieved, one lets authors delete published updates, and
  one never claims append-only. This one is append-only BY CONSTRUCTION, because there is one write
  path, not because a policy says so (20 §9).

  Which is why there is no delete control on this screen and no filter that can hide a row. A
  history you can edit is a history, and a history you cannot is a record.

  THE SHAPE (SYSTEM §5 to §7, `loop/design/SCREENS.md` Activity): the title and its sentence, the three filters in
  the toolbar, the stream on the ground grouped by hour, and beside it three tiles, each with its chart and the one
  line that says what the chart means: who worked in the last day, what changed, and the busy hours of the week.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import { day as fmtDay } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { CapLine } from 'braindog-render/svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import HeatGrid from '$lib/viz/HeatGrid.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import Swimlanes from '$lib/viz/Swimlanes.svelte';
  import { runOf } from '$lib/ui/face.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { ARRIVED_MS } from '$lib/data/optimistic.ts';
  /* THE URL IS NOT TYPED. `?kind=` carries whatever somebody pasted, and the words this screen
     shows come from a map over the forty, so the string is checked against the vocabulary before
     it is used as a place in it, rather than indexing the map with a stranger and rendering
     `undefined.word`. `isEventKind` is the kernel's own guard, beside the list. */
  import { isEventKind } from '@braindog/kernel';
  import type { AuditEvent, EventKind } from '$lib/record/schema.ts';
  import type { Cursor } from '@braindog/client';
  import { untrack } from 'svelte';

  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  /* WHO, IN WORDS. This screen's three person-shaped slots (the actor on a line, the `by` filter, and
     the target of an access row) all printed raw `p_` ids on a record with more than one person on
     it. `who.ts` holds the reason and the measurement. */
  import { actorSaid, offeredActors, targetSaid } from './who.ts';
  /* WHAT THE LOG SAYS, IN WORDS AND IN FIGURES: the sentence, the bands, a row by its title and list, a burst as one
     line, and the three tiles' counts and readings. `lines.ts` holds each rule and why. */
  import {
    awaySaid,
    below,
    burstsOf,
    busyOf,
    busySaid,
    clockOf,
    dayOf,
    dayWord,
    fold,
    GROUP_TONES,
    groupWords,
    historyWords,
    hourGroups,
    HOURS,
    isAgent,
    keyOf,
    LANE_SPAN_MS,
    lanesOf,
    lanesSaid,
    listOf,
    reaches,
    tallyOf,
    tallySaid,
    thingOf,
  } from './lines.ts';
  /* A FIELD PUT ON OR TAKEN OFF A LIST, IN WORDS, from the same helper Home's feed says it with. STATIC, and the lead's
     `readUnseen` with it: one module both imported and imported lazily is neither split nor shared, only warned about. */
  import { declaredOf, readUnseen } from '$lib/record/history-live.ts';

  /**
   * What an event kind is called, and what it looks like — all forty of them.
   *
   * THIS COMMENT USED TO SAY THESE WERE *"the write path's own vocabulary"*, and that sentence is
   * why seven invented strings sat here for as long as they did: they read like a schema, so nobody
   * checked them against one. `entry.create`, `entry.update`, `entry.archive`, `question.open`,
   * `question.decide`, `declaration.set` and `pack.install` are not kinds. The write path's
   * vocabulary is `30 §2`'s forty, closed by a `CHECK` the database enforces, and not one of those
   * seven would survive an `INSERT`.
   *
   * `Record<EventKind, …>` RATHER THAN `Record<string, …>`, and the fallback is gone with it. A
   * `?? { word: k.replace(/[.]/g, ' ') }` turns any string into a plausible-looking English word,
   * which is exactly how a ledger full of kinds the record cannot write rendered as a tidy screen
   * for months. A forty-first kind is a kernel migration (`30 §2` rule 1); it should also be a
   * compile error here, because a kind nobody has named in English is a row this screen cannot
   * explain.
   *
   * The word is the verb, first, then what it was done to — "Created services#6". `Page changed`
   * read as a verb phrase once the target became a title ("Page changed Overview"), which is the
   * whole reason the column is ordered that way.
   */
  const KIND: Record<EventKind, { word: string; icon: IconName }> = {
    /* Rows */
    create: { word: 'Created', icon: 'plus' },
    edit: { word: 'Changed', icon: 'edit' },
    state: { word: 'Moved', icon: 'arrow' },
    link: { word: 'Linked', icon: 'link' },
    tag: { word: 'Tagged', icon: 'tag' },
    untag: { word: 'Untagged', icon: 'tag' },
    delete: { word: 'Deleted', icon: 'trash' },
    restore: { word: 'Restored', icon: 'back' },
    purge: { word: 'Purged', icon: 'trash' },
    note: { word: 'Noted', icon: 'doc' },
    /* Governance */
    decide: { word: 'Decided', icon: 'check' },
    supersede: { word: 'Superseded', icon: 'history' },
    suggest: { word: 'Asked', icon: 'decide' },
    resolve: { word: 'Closed', icon: 'check' },
    predict: { word: 'Predicted', icon: 'observe' },
    score: { word: 'Scored', icon: 'observe' },
    /* Declarations */
    install: { word: 'Installed', icon: 'packs' },
    uninstall: { word: 'Uninstalled', icon: 'packs' },
    upgrade: { word: 'Upgraded', icon: 'packs' },
    declare: { word: 'Changed the page', icon: 'doc' },
    retire: { word: 'Retired', icon: 'archive' },
    /* Credentials — `30 §2` rule 2: every read is an event, with its actor. */
    'grant.add': { word: 'Stored a credential', icon: 'vault' },
    'grant.read': { word: 'Read a credential', icon: 'vault' },
    'grant.rotate': { word: 'Rotated a credential', icon: 'vault' },
    'grant.revoke': { word: 'Revoked a credential', icon: 'vault' },
    /* `Attached` AND IT WAS `Bound`. `bind` came off the button that does this — `copy.ts` says
       "Put this on a page" now, and gives the reason: nothing in the product ever says what
       binding is. The kind stays `grant.bind`, which is a kind the record writes; the log's verb
       is read by a person going back over what happened to their credentials. */
    'grant.bind': { word: 'Attached a credential', icon: 'vault' },
    /* Ingest */
    arrive: { word: 'Arrived', icon: 'inbox' },
    match: { word: 'Matched', icon: 'inbox' },
    /* `an email` AND IT WAS `an arrival`. An arrival is what the record calls a thing that came in
       through an ingest, and the reader going down this log is looking for the day something read
       their mail. `copy.ts` renamed the word off the inbox's own button for the same reason. */
    extract: { word: 'Read an email', icon: 'inbox' },
    propose: { word: 'Proposed', icon: 'decide' },
    pull: { word: 'Fetched', icon: 'refresh' },
    /* Access */
    'access.grant': { word: 'Gave access', icon: 'people' },
    'access.revoke': { word: 'Took access away', icon: 'people' },
    'share.open': { word: 'Opened a link', icon: 'link' },
    'share.close': { word: 'Closed a link', icon: 'link' },
    /* Lifecycle */
    export: { word: 'Backed up', icon: 'archive' },
    import: { word: 'Imported', icon: 'download' },
    erase: { word: 'Erased', icon: 'trash' },
    migrate: { word: 'Migrated', icon: 'refresh' },
    'restore.pitr': { word: 'Put the record back', icon: 'back' },
  };

  const kindOf = (k: EventKind) => KIND[k];

  /**
   * ON A LIVE RECORD THE LOG IS THE RECORD'S, its newest page, and nothing of the sample is mixed into it: the names are
   * what the record called each target, a row's title or a question from its governance row. Until the page arrives the
   * screen draws no lines and no empty state, and a refusal is the record's own sentence.
   */
  let live = $state<{ events: AuditEvent[]; names: Map<string, string>; cursor: Cursor | null } | null>(null);
  let refused = $state<string | null>(null);
  /* THE SAMPLE'S LOG AND ITS 3 SEPTEMBER CLOCK WERE THE OTHER HALF OF THESE TWO LINES, behind `route.data.live`, which
     every shell sets `true` since wave A (`no-sample-b4.test.ts` says why it is no witness). */
  const LOG = $derived(live?.events ?? []);

  /**
   * NOW, WHICH MOVES. The lanes end at it and draw their now line there, a line under a minute old is an agent's live
   * one, and "Today" is the day it is in. It moves when the log is read again and once a minute besides, so a screen
   * left open does not go on calling yesterday today.
   */
  let clock = $state(Date.now());
  $effect(() => {
    const tick = setInterval(() => (clock = Date.now()), 60_000);
    return () => clearInterval(tick);
  });

  /**
   * WHO THE READER IS, AND WHAT THE RECORD TOLD THEM THE OTHERS ARE CALLED.
   *
   * Both are already in the shell (`boot.names`, kept by `layoutOf`), so this screen adds no call to
   * say a colleague's name. `readLog`'s own `names` map is a different fact and stays where it is:
   * it holds what each TARGET is titled, a row's title or a question, keyed by `services#6`, and it
   * never has a person in it.
   *
   * Measured on a record driven with eight people on it: `boot.names` came back `{}` for every one
   * of them, because nothing in the product writes `member.name` (`packages/kernel/src/members.ts`
   * takes a `name` on `invite` and no caller sends one). So today every line below goes down the
   * "Someone on this record" branch, which is the honest reading of a record that does not know.
   */
  const me = $derived(route.data.me.person);
  const names = $derived<ReadonlyMap<string, string>>(new Map(Object.entries(route.data.names ?? {})));

  $effect(() => {
    if (!route.data.live) return;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    void import('$lib/record/news-live.ts')
      .then((m) => m.readLog(apiBase(), me))
      .then((out) => {
        if (out.from === 'live') {
          live = out;
          ok = true;
        } else if (out.from === 'refused') refused = out.fix;
      })
      .finally(() => closed(ok, at));
  });

  /**
   * WHAT IS NEW SINCE THE READER LAST LOOKED, which the title's sentence says: how many things, and how many of them
   * the agents did.
   *
   * A SENTENCE, NOT THE SCREEN. The log below is what Activity is for, so a refusal here draws no sentence and settles
   * nothing: the call closes as answered, and the log's own read is the one that says the record could not be reached.
   */
  let unseen = $state<{ actors: string[]; capped: boolean } | null>(null);
  $effect(() => {
    if (!route.data.live) return;
    const at = untrack(opened);
    void readUnseen(apiBase())
      .then((out) => {
        if (out.from === 'live') unseen = { actors: out.actors, capped: out.capped };
      })
      .catch(() => undefined)
      .finally(() => closed(true, at));
  });
  const lead = $derived(unseen ? awaySaid(unseen.actors, me, names, unseen.capped) : undefined);

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. A log longer than one page says so with a control instead of stopping at two hundred
   * lines without a word. What arrives is added under what is drawn, and the filters apply to everything read so far.
   * A refusal here is said under the list, and the lines already drawn stay.
   */
  let older = $state(false);
  let olderFix = $state<string | null>(null);
  async function loadOlder() {
    if (!live || live.cursor === null || older) return;
    const from = live.cursor;
    older = true;
    olderFix = null;
    try {
      const m = await import('$lib/record/news-live.ts');
      const out = await m.readLog(apiBase(), me, undefined, from);
      /* UNDER WHAT IS HELD NOW, which a line arriving meanwhile may have added to. */
      if (out.from === 'live' && live)
        live = { events: below(live.events, out.events), names: new Map([...live.names, ...out.names]), cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * THE LOG LISTENS. When the record moves (the shell's version poll, `lib/data/live.svelte.ts`), the newest page is read
   * again and what arrived goes on top, tinted for a second and a half (SYSTEM §8): an agent's line appears under the
   * reader's eye rather than on the next visit. Never while an older page is on its way, which it would land under.
   */
  let fresh = $state<ReadonlySet<string>>(new Set());
  let fading: ReturnType<typeof setTimeout> | null = null;
  $effect(() => () => {
    if (fading !== null) clearTimeout(fading);
  });

  listen(
    async () => {
      if (!route.data.live || !live) return;
      const at = opened();
      try {
        const m = await import('$lib/record/news-live.ts');
        const out = await m.readLog(apiBase(), me);
        if (out.from !== 'live' || !live) return;
        const f = fold(live.events, out.events);
        live = f.joined
          ? { events: f.events, names: new Map([...live.names, ...out.names]), cursor: live.cursor }
          : { events: out.events, names: out.names, cursor: out.cursor };
        clock = Date.now();
        if (f.added.length > 0) {
          fresh = new Set(f.added);
          if (fading !== null) clearTimeout(fading);
          fading = setTimeout(() => ((fresh = new Set()), (fading = null)), ARRIVED_MS);
        }
      } finally {
        closed(true, at);
      }
    },
    () => older,
  );

  /**
   * WHAT IT WAS DONE TO, IN WORDS AND NEVER AS A KEY.
   *
   * Every line read "Created services#6": a column of lists and numbers a stranger had to open one by one. A row is its
   * title now, with its list said at the line's trailing edge; the number stays in the address the line links to and in
   * the row's own Details, which is where somebody who wants to say it goes (design.md SYS-3).
   *
   * A PERSON FIRST, because an `access.grant` line's target IS somebody and `targetSaid` says them
   * by name with no link: there is no person route in this build. Everything else is `thingOf`'s,
   * with the title the record sent beside the line (`readLog`'s `names`). `null` is a target with
   * nothing to say that is not an id, and the verb then stands alone.
   */
  const thingFor = (target: string): { text: string; href: string | null; list: string | null } | null => {
    const person = targetSaid(target, me, names);
    if (person) return { text: person.name, href: null, list: null };
    return thingOf(target, live?.names.get(target) ?? null);
  };

  /**
   * WHO, WHAT KIND OF CHANGE, AND WHICH DAY. The questions this screen exists to answer, in the toolbar.
   *
   * IN THE URL, LIKE EVERY OTHER FILTER IN THIS PRODUCT. `19 §5`: what defines which rows you are
   * looking at must be shareable, and "what did the renewal rule do" is exactly the thing somebody
   * pastes into a message.
   *
   * AND THEY APPEAR WHEN THERE IS SOMETHING TO CHOOSE BETWEEN. One actor is not a filter; it is a
   * fact, and a control offering it is a control that cannot change anything.
   */
  /* AND A CHOICE HAS TO SAY WHICH ONE IT MEANS. Once an actor is said by name rather than by id, two
     people the record has no name for carry the same four words, and seven identical choices each
     filtering to one of seven is a control that lies about what it does. `offeredActors` withholds
     the offer, never the filter: a `?by=` somebody pasted still narrows the log (`19 §5`). */
  const actors = $derived(offeredActors([...new Set(LOG.map((e) => e.by))], me, names));
  const kinds = $derived([...new Set(LOG.map((e) => e.kind))]);
  const perKind = $derived(LOG.reduce((m, e) => m.set(e.kind, (m.get(e.kind) ?? 0) + 1), new Map<EventKind, number>()));

  /* A SEGMENTED CONTROL WHERE THE NAMES ARE FEW AND SHORT, as the board draws "Everyone | claude | codex", and a menu
     where they are not: seven names in a strip is a toolbar wider than the title. */
  const segmented = $derived(actors.length <= 4 && actors.every((a) => actorSaid(a, me, names).name.length <= 14));

  const who = $derived(route.url.searchParams.get('by') ?? '');
  const what = $derived(route.url.searchParams.get('kind') ?? '');

  /**
   * THE DAY, WHICH IS THE ONE FILTER THIS SCREEN IS SENT FOR.
   *
   * The point-in-time restore setting says *"find the moment"* and links here. ONE DAY AND NOT A RANGE: a day is the
   * unit a person actually says, and the minute in each row's tooltip finishes the job. A `<select>` and not a
   * segmented control, because the number of days a log covers grows with use. On the reader's clock, like the bands
   * the stream is drawn in, so the day chosen and the band it draws are one day.
   */
  const days = $derived([...new Set(LOG.map((e) => dayOf(e.at)))].sort().reverse());
  const when = $derived(route.url.searchParams.get('on') ?? '');
  /* A DAY AS A PERSON SAYS IT, from its local noon so no clock change moves it into its neighbour. */
  const daySaid = (d: string): string => dayWord(new Date(`${d}T12:00`).getTime(), clock);

  /* ONE LIST, WHICH TODAY LINKS TO: "12 changes to Tasks since you were last here" opens here narrowed to Tasks. It has no
     control of its own, since a list is chosen from Today or pasted, and the pill in the toolbar says it and takes it off. */
  const list = $derived(route.url.searchParams.get('list') ?? '');
  const listName = $derived(route.data.lists?.find((l: { id: string; name: string }) => l.id === list)?.name ?? list);

  const matched = $derived(
    LOG.filter(
      (e) =>
        (!who || e.by === who) &&
        (!what || e.kind === what) &&
        (!when || dayOf(e.at) === when) &&
        (!list || listOf(e.target) === list),
    ),
  );
  /* THE LOG GROWS WITH WRITES, NOT WITH ROWS, so on a record of any size this is the longest list in
     the product. `13 §4.3`'s cap, and the line that admits it. */
  const shown = $derived(matched.slice(0, DOM_CAP));
  /* A BURST IS ONE LINE (`burstsOf`), folded from what is drawn, so the cap above still counts lines of the log and
     the cap line under the list still says how many of them there are. */
  const told = $derived(burstsOf(shown));
  /* AND THE LINES SIT IN BANDS ON THE GROUND: today's by the hour, an older day as one (`hourGroups`). */
  const bands = $derived(hourGroups(told, clock));

  /**
   * THE THREE TILES, and what each counts.
   *
   * WHO WORKED and BUSY HOURS count every line read, filtered or not: they say how the record has been, and a filter is
   * a question about part of it. WHAT CHANGED counts the lines the filters match, because its figure is the title's.
   *
   * EACH SAYS WHEN IT IS PARTIAL. There is no read of a time range yet, so a window the pages read so far do not reach
   * back through is counted over what was read, and the tile's foot says so: a quiet morning the log has not reached is
   * not a quiet morning.
   */
  const more = $derived(live !== null && live.cursor !== null);
  const lanes = $derived(lanesOf(LOG, clock, me, names));
  const tally = $derived(tallyOf(matched, me, names));
  const busy = $derived(busyOf(LOG, clock));
  const groupParts = $derived(tally.groups.map((g) => ({ label: groupWords[g.group], value: g.count, tone: GROUP_TONES[g.group] })));
  const topKinds = $derived(
    tally.kinds.slice(0, 5).map((k, i) => ({
      label: kindOf(k.kind).word,
      value: k.count,
      /* ONE BAR IN INK, the biggest, and only when it is the biggest alone. */
      tone: i === 0 && (tally.kinds[1]?.count ?? 0) < k.count ? 'ink' : undefined,
    })),
  );
  const tallyMeta = $derived.by(() => {
    const agents = tally.groups.find((g) => g.group === 'agent')?.count ?? 0;
    const yours = tally.groups.find((g) => g.group === 'you')?.count ?? 0;
    return [agents ? historyWords.byAgents(agents) : '', yours ? historyWords.byYou(yours) : ''].filter(Boolean).join(' · ') || undefined;
  });
  const tallyReading = $derived(
    tallySaid(
      tally.kinds.map((k) => ({ word: kindOf(k.kind).word, count: k.count, agents: k.agents })),
      tally.total,
    ),
  );
  const tiles = $derived(lanes.length > 0 || matched.length > 0 || busy.total > 0);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(route.url.searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    void goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  };

  /* THE MINUTE, ON THE SAME CLOCK AS THE ROW. The time on a line is the reader's, so its tooltip is too. */
  const stampOf = (iso: string): string => `${fmtDay(dayOf(iso))}, ${clockOf(iso)}`;

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. `Empty` says `empty` or `refused` for the states it draws;
   * this is the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.audit)}</title></svelte:head>

{#snippet tools()}
  <div class="tools">
    {#if list}
      <!-- THE ONE LIST IT WAS OPENED ON, as a pill that takes itself off. -->
      <Button weight="glass" onclick={() => setParam('list', '')} aria-label={historyWords.everyList(listName)}
        >{historyWords.onlyList(listName)}<Icon name="close" size="s" /></Button
      >
    {/if}

    {#if actors.length > 1}
      {#if segmented}
        <div class="segmented" role="group" aria-label={copy.auditWho}>
          <button type="button" class="segment" data-on={who === '' ? '' : undefined} aria-pressed={who === '' ? 'true' : 'false'} onclick={() => setParam('by', '')}
            >{historyWords.everyone}</button
          >
          {#each actors as a (a)}
            <button
              type="button"
              class="segment"
              data-on={who === a ? '' : undefined}
              aria-pressed={who === a ? 'true' : 'false'}
              onclick={() => setParam('by', who === a ? '' : a)}>{actorSaid(a, me, names).name}</button
            >
          {/each}
        </div>
      {:else}
        <Menu label={copy.auditWho} align="end">
          {#snippet trigger()}
            <span class="pill" data-on={who ? '' : undefined}>
              <Icon name="people" size="s" /><span class="pill-word">{who ? actorSaid(who, me, names).name : historyWords.everyone}</span><Icon
                name="chevronDown"
                size="s"
              />
            </span>
          {/snippet}
          <button type="button" class="mi" role="menuitem" aria-current={who === '' ? 'true' : undefined} onclick={() => setParam('by', '')}>
            <Icon name="people" size="s" /><span class="mi-name">{historyWords.everyone}</span>{#if who === ''}<Icon name="check" size="s" />{/if}
          </button>
          {#each actors as a (a)}
            {@const by = actorSaid(a, me, names)}
            <button type="button" class="mi" role="menuitem" aria-current={who === a ? 'true' : undefined} onclick={() => setParam('by', a)}>
              <Face name={by.name} you={by.you} kind={by.kind} size="s" /><span class="mi-name">{by.name}</span>{#if who === a}<Icon name="check" size="s" />{/if}
            </button>
          {/each}
        </Menu>
      {/if}
    {/if}

    {#if kinds.length > 1}
      <Menu label={copy.auditWhat} align="end">
        {#snippet trigger()}
          <span class="pill" data-on={what ? '' : undefined}>
            <Icon name={isEventKind(what) ? kindOf(what).icon : 'filter'} size="s" /><span class="pill-word"
              >{isEventKind(what) ? kindOf(what).word : historyWords.everyKind}</span
            ><Icon name="chevronDown" size="s" />
          </span>
        {/snippet}
        <button type="button" class="mi" role="menuitem" aria-current={what === '' ? 'true' : undefined} onclick={() => setParam('kind', '')}>
          <Icon name="filter" size="s" /><span class="mi-name">{historyWords.everyKind}</span><span class="mi-n num">{LOG.length}</span>
        </button>
        {#each kinds as k (k)}
          <button type="button" class="mi" role="menuitem" aria-current={what === k ? 'true' : undefined} onclick={() => setParam('kind', k)}>
            <Icon name={kindOf(k).icon} size="s" /><span class="mi-name">{kindOf(k).word}</span><span class="mi-n num">{perKind.get(k) ?? 0}</span>
          </button>
        {/each}
      </Menu>
    {/if}

    {#if days.length > 1}
      <select class="on-select" aria-label={copy.auditWhen} value={when} onchange={(e) => setParam('on', e.currentTarget.value)}>
        <option value="">{copy.auditAnyDay}</option>
        {#each days as d (d)}<option value={d}>{daySaid(d)}</option>{/each}
      </select>
    {/if}

    {#if who || what || when || list}
      <Button weight="bare" href="/audit"><Icon name="close" size="s" />{copy.clearFilters}</Button>
    {/if}
  </div>
{/snippet}

<PageHead
  icon="history"
  title={copy.audit}
  count={matched.length}
  total={LOG.length}
  sentence={lead}
  actions={actors.length > 1 || kinds.length > 1 || days.length > 1 || list ? tools : undefined}
/>

<div class="page">
  <!--
    THE SAME FIVE STATES EVERY OTHER LIST DRAWS. `19 §6` for `no-results` says quote the query verbatim, and a log with
    nothing in it, which is every record for about a minute, is `no-data-yet` and not the same sentence as a filter that
    missed.
  -->
  {#if refused}
    <Empty kind="error" title={refused}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if route.data.live && !live}
    <!-- Bars while the live log is on its way, rather than a blank page under the title. -->
    <Waiting />
  {/if}

  <div class="board">
    {#if tiles}
      <!-- THE TILES FIRST IN THE DOCUMENT, so a screen reader meets what the stream means before the stream; at 1440
           they stand in a column to its right, and on a phone above it. -->
      <div class="side">
        {#if lanes.length > 0}
          <Tile icon="session" title={historyWords.whoWorked} meta={historyWords.lastDay}>
            <Swimlanes {lanes} start={clock - LANE_SPAN_MS} end={clock} now={clock} subject={historyWords.lanesSubject} />
            <p class="reading">{lanesSaid(lanes)}</p>
            {#if !reaches(LOG, more, clock - LANE_SPAN_MS)}<p class="foot">{historyWords.stripRead(LOG.length)}</p>{/if}
          </Tile>
        {/if}

        {#if matched.length > 0}
          <Tile icon="history" title={historyWords.whatChanged} count={matched.length} meta={tallyMeta}>
            <Stacked parts={groupParts} subject={historyWords.groupsSubject} />
            <Bars items={topKinds} subject={historyWords.kindsSubject} />
            <p class="reading">{tallyReading}</p>
            {#if more}<p class="foot">{historyWords.stripRead(LOG.length)}</p>{/if}
          </Tile>
        {/if}

        {#if busy.total > 0}
          <Tile icon="clock" title={historyWords.busyHours} meta={historyWords.lastWeek}>
            <HeatGrid rows={busy.rows} cols={HOURS} values={busy.values} subject={historyWords.heatSubject} />
            <p class="reading">{busySaid(busy.values)}</p>
            {#if !reaches(LOG, more, busy.start)}<p class="foot">{historyWords.stripRead(LOG.length)}</p>{/if}
          </Tile>
        {/if}
      </div>
    {/if}

    <div class="feed">
      {#if !refused && matched.length === 0 && (!route.data.live || live)}
        <Empty
          kind={LOG.length === 0 ? 'no-data-yet' : 'no-results'}
          title={LOG.length === 0 ? copy.auditNone : copy.noneMatching(LOG.length, 'entries')}
          query={LOG.length === 0
            ? undefined
            : [who ? actorSaid(who, me, names).name : '', isEventKind(what) ? kindOf(what).word : what].filter(Boolean).join(' · ')}
          body={LOG.length === 0 ? copy.auditHolds : undefined}
        >
          {#snippet actions()}
            {#if who || what || when || list}<Button href="/audit">{copy.clearFilters}</Button>{/if}
          {/snippet}
        </Empty>
      {/if}

      {#each bands as band (band.key)}
        <Section title={band.title} count={band.lines.length}>
          <ul class="ledger">
            {#each band.lines as t (t.key)}
              {@const e = t.e}
              {@const by = actorSaid(e.by, me, names)}
              {@const declared = e.kind === 'declare' ? declaredOf(e.target, e.note) : null}
              {@const thing = t.many ?? (declared === null && e.target ? thingFor(e.target) : null)}
              {@const note = declared === null ? t.note : ''}
              <!-- AN AGENT'S LINE UNDER A MINUTE OLD WEARS THE ONE HUE THAT MEANS ALIVE; a row that came into being wears
                   the green of done. Nothing here is red: a log is history, not need. -->
              {@const tone = isAgent(by.kind) && clock - Date.parse(e.at) <= 60_000 ? 'live' : e.kind === 'create' ? 'earn' : undefined}
              <li data-arrived={fresh.has(keyOf(e)) ? '' : undefined}>
                <div class="line line-tall act">
                  <IconWell name={kindOf(e.kind).icon} size="l" {tone} />
                  <span class="line-main">
                    <!-- THE TARGET IS A LINK, AND THE WHOLE ROW IS ITS TARGET. Its hit box (`.tap`'s `::before`) is
                         placed against the row, so a press anywhere on the line opens what it names; the words stay
                         the link's name, and a keyboard reaches it in one stop (WCAG 2.1.1). A line about no row (a
                         nightly backup) or about a person (an access line) is not a link at all, rather than an
                         anchor that goes nowhere. -->
                    <!-- AND A FIELD PUT ON A LIST IS SAID AS ONE. `declaredOf` makes "Added domain to Projects" of the
                         line's target and note, and that sentence is the whole line, so the note is not said twice. -->
                    {#if declared !== null}<span class="line-title">{declared}</span>
                    {:else}<span class="line-title"
                        ><span class="verb">{kindOf(e.kind).word}</span>{#if thing}{' '}{#if thing.href}<a class="target tap" href={at(thing.href)}
                              ><bdi class="target-name">{thing.text}</bdi></a
                            >{:else}<bdi class="target-name">{thing.text}</bdi>{/if}{/if}</span
                      >{/if}
                    <span class="line-detail">
                      <!-- AN AGENT'S LINE WEARS ITS RUN (AGT-13): the run's hue, and a door to the run's handoff. -->
                      <span class="who"><Face name={by.name} you={by.you} kind={by.kind} run={runOf(e.by)} size="s" /></span>
                      <span class="detail-text"
                        >{by.name}{#if note}<span class="note" title={note}> · {note}</span>{/if}{#if thing?.list}<span class="where-inline">
                            · {thing.list}</span
                          >{/if}</span
                      >
                    </span>
                  </span>
                  <span class="where">{thing?.list ?? ''}</span>
                  <!-- THE MINUTE, AND BEHIND IT THE DAY AND THE VERSION. A burst's tooltip is its span, from its first line to
                       its newest; no version where the record sent none (a member held to named lists is sent `0`). -->
                  <span class="line-when">
                    <time
                      datetime={e.at}
                      title={t.count > 1
                        ? historyWords.between(stampOf(t.from), stampOf(e.at))
                        : e.version > 0
                          ? `${stampOf(e.at)} · v${e.version.toLocaleString('en')}`
                          : stampOf(e.at)}>{clockOf(e.at)}</time
                    >
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </Section>
      {/each}

      <CapLine shown={shown.length} total={matched.length} />
      {#if route.data.live && live && live.cursor !== null}
        <div class="older">
          <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
        </div>
      {/if}
      {#if olderFix}<p class="foot">{olderFix}</p>{/if}
      <!-- WHAT THE VERSION IS FOR: it is how you name a moment when you talk to somebody about it. Not for a reader who
           was sent no version, whose lines carry `version: 0` (`loop/research-history-cursor.md`). -->
      {#if LOG[0] && LOG[0].version > 0}
        <p class="foot">{copy.auditVersion(LOG[0].version.toLocaleString('en'))}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  /**
   * THE PAGE IS A CONTAINER, so the stream and its tiles decide their columns by the room the page actually has (the
   * rail and a docked panel both take from it), not by the window's width.
   */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* ONE COLUMN UNTIL THERE IS ROOM FOR TWO: the tiles over the stream, side by side where they fit. */
  .board {
    display: grid;
    grid-template-areas: 'side' 'feed';
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-5);
  }

  .side {
    grid-area: side;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: var(--inset);
    min-inline-size: 0;
  }

  .feed {
    grid-area: feed;
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* AT 1440 THE TILES ARE A 320 COLUMN AT THE STREAM'S RIGHT (SCREENS, Activity), 12 apart like any two tiles. */
  @container (width >= 860px) {
    .board {
      grid-template-areas: 'feed side';
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: var(--sp-6);
    }

    .side {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ON A PHONE ONE TILE, THE FIRST THAT HAS SOMETHING TO SAY, and the stream straight under it. */
  @media (width < 640px) {
    .side > :global(.tile:not(:first-child)) {
      display: none;
    }
  }

  /* THE ONE LINE UNDER EACH CHART that says what it means (SYSTEM §6), at body size in ink, at the tile's foot. */
  .reading {
    margin: 0;
    margin-block-start: auto;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .foot {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A TILE'S FOOT SITS UNDER ITS READING, a step closer than the tile's own gap. */
  .reading + .foot {
    margin-block-start: calc(var(--sp-2) - var(--sp-4));
  }

  .older {
    display: flex;
  }

  /* ── the toolbar ─────────────────────────────────────────────────────── */

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-inline-size: 0;
  }

  /* A MENU'S TRIGGER IS A GLASS PILL (SYSTEM §5): an icon, the word, and the chevron, 36 high. The focus ring follows
     the pill, since the button round it is the thing focused. */
  .tools :global(.menu-trigger) {
    border-radius: var(--r-pill);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h);
    max-inline-size: 28ch;
    padding: 0 var(--sp-3) 0 var(--sp-4);
    background: var(--glass);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A MENU WITH A CHOICE MADE IS THE CHOSEN SEGMENT'S SHAPE: the tile's fill, lifted, so a narrowed stream says so. */
  .pill[data-on] {
    background: var(--bg);
    box-shadow: var(--glass-edge), var(--e1);
  }

  .pill-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (hover: hover) and (pointer: fine) {
    .tools :global(.menu-trigger:hover .pill:not([data-on])) {
      background: var(--glass-strong);
    }
  }

  /* THE DAY IS A GLASS PILL TOO. `controls.css` gives every select its field fill and the house chevron; the fill is
     taken back here and the chevron kept. */
  .on-select {
    min-block-size: var(--ctl-h);
    background-color: var(--glass);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
  }

  /* GLASS NEVER HOLDS GLASS: once the title row is the compact glass bar, the controls in it drop their own. */
  :global(.head[data-under]) .pill,
  :global(.head[data-under]) .on-select,
  :global(.head[data-under]) .segmented {
    background-color: transparent;
    backdrop-filter: none;
    box-shadow: none;
  }

  /* A MENU ROW: an icon, the word, and how many lines of that kind were read, the chosen one ticked. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-base);
    text-align: start;
    cursor: pointer;
  }

  .mi[aria-current='true'] {
    color: var(--ink);
    font-weight: 500;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
    min-inline-size: 0;
  }

  .mi-n {
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

  /* ── a line of the stream ────────────────────────────────────────────── */

  /**
   * THE KIND'S WELL, WHAT WAS DONE AND BY WHOM, THE LIST, AND THE MINUTE. The row shape is `rows.css`'s (56 tall, a
   * title and a meta line, the wash, the hairline); the four columns are this screen's.
   */
  .act {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    gap: var(--sp-3);
  }

  .act .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .act .line-when {
    grid-column: 4;
    grid-row: 1;
  }

  /* THE VERB IN THE SECOND INK, WHAT IT WAS DONE TO IN INK: the thing is what a reader scans for. */
  .verb {
    color: var(--ink2);
  }

  .target {
    /* STATIC, so the hit box `.tap` draws is placed against the whole row (which `rows.css` positions), not the words. */
    position: static;
    color: var(--ink);
    text-decoration: none;
  }

  .target:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* THE WHOLE ROW WASHES UNDER THE POINTER, since the whole row is the link; and the hairlines beside it step aside. */
  @media (hover: hover) and (pointer: fine) {
    .ledger > li:has(.target:hover) > .line {
      background: var(--hover-wash);
    }

    .ledger > li:has(.target:hover) > .line::after,
    .ledger > li:has(.target:hover) + li > .line::after {
      opacity: 0;
    }
  }

  .line-detail {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
  }

  /* ABOVE THE ROW'S HIT BOX, so an agent's face stays the door to its run. The meta line's own height is set below. */
  .who {
    position: relative;
    z-index: var(--z-raise);
    display: inline-grid;
    flex: none;
  }

  /* THE FACE AT THE META LINE'S HEIGHT under a mouse. Under a thumb it keeps its size, because an agent's face is a door
     and a door a thumb presses is 44 however small it is drawn (`.tap`), which scaling it down would shrink too. */
  @media (pointer: fine) {
    .who :global(.agent-face) {
      zoom: 0.75;
    }

    .who :global(.face:not(.agent-face)) {
      zoom: 0.9;
    }
  }

  .detail-text {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .where {
    grid-column: 3;
    grid-row: 1;
    max-inline-size: 18ch;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .where-inline {
    display: none;
  }

  /* A TIME IN A FEED IS GEIST MONO (SYSTEM §3), tabular, in the quiet ink. */
  .line-when time {
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /**
   * ON A PHONE THE LIST GOES INTO THE META LINE and the row is three columns: the well, the words, the minute. The
   * title and the note wrap rather than cut, because on a phone a line has room to, and the note is what changed.
   */
  @media (width < 640px) {
    .act {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      align-items: start;
    }

    .act .line-when {
      grid-column: 3;
      grid-row: 1;
    }

    .where {
      display: none;
    }

    .where-inline {
      display: inline;
    }

    .line-detail {
      align-items: start;
    }

    .detail-text {
      white-space: normal;
    }
  }
</style>
