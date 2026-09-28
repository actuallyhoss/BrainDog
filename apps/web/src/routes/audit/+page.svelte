<!--
  Every write, by whom, against which version.

  Of four comparable products surveyed, three ship a MUTABLE history: one has a "Clear revision
  history" button whose result cannot be retrieved, one lets authors delete published updates, and
  one never claims append-only. This one is append-only BY CONSTRUCTION, because there is one write
  path — not because a policy says so (20 §9).

  Which is why there is no delete control on this screen and no filter that can hide a row. A
  history you can edit is a history, and a history you cannot is a record.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import { day as fmtDay, since, stamp } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { CapLine } from 'braindog-render/svelte';
  import { Block } from 'braindog-render/svelte';
  import type { Block as Drawn } from 'braindog-render';
  import '@braindog/skin/blocks-charts.css';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { runOf } from '$lib/ui/face.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  /* THE URL IS NOT TYPED. `?kind=` carries whatever somebody pasted, and the words this screen
     shows come from a map over the forty — so the string is checked against the vocabulary before
     it is used as a place in it, rather than indexing the map with a stranger and rendering
     `undefined.word`. `isEventKind` is the kernel's own guard, beside the list. */
  import { isEventKind } from '@braindog/kernel';
  import type { AuditEvent, EventKind } from '$lib/record/schema.ts';
  import type { Cursor } from '@braindog/client';
  import { untrack } from 'svelte';

  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  /* WHO, IN WORDS. This screen's three person-shaped slots (the actor column, the `by` filter, and
     the target of an access row) all printed raw `p_` ids on a record with more than one person on
     it. `who.ts` holds the reason and the measurement. */
  import { actorSaid, offeredActors, targetSaid } from './who.ts';
  /* WHAT THE LOG SAYS, IN WORDS: the lead, the twelve weeks, a row by its title and list, and a burst as one line.
     `lines.ts` holds each rule and why. */
  import { burstsOf, heatRows, historyWords, listOf, sinceGroups, sinceSaid, thingOf } from './lines.ts';
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
  const clock = Date.now();

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
   * WHAT IS NEW SINCE THE READER LAST LOOKED, which the screen leads with: who signed it, counted.
   *
   * A LEAD, NOT THE SCREEN. The log below is what History is for, so a refusal here draws no lead and settles nothing:
   * the call closes as answered, and the log's own read is the one that says the record could not be reached.
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
  const lead = $derived(unseen ? sinceSaid(sinceGroups(unseen.actors, me, names), unseen.capped) : null);

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. A log longer than one page says so with a control instead of stopping at two hundred
   * lines without a word. What arrives is added under what is drawn, and the filters apply to everything read so far.
   * A refusal here is said under the list, and the lines already drawn stay.
   */
  let older = $state(false);
  let olderFix = $state<string | null>(null);
  async function loadOlder() {
    const had = live;
    if (!had || had.cursor === null || older) return;
    older = true;
    olderFix = null;
    try {
      const m = await import('$lib/record/news-live.ts');
      const out = await m.readLog(apiBase(), me, undefined, had.cursor);
      if (out.from === 'live') live = { events: [...had.events, ...out.events], names: new Map([...had.names, ...out.names]), cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * WHAT IT WAS DONE TO, IN WORDS AND NEVER AS A KEY.
   *
   * Every line read "Created services#6", and then "Created Object storage services#6" once the
   * record's title led: a column of lists and numbers a stranger had to open one by one, and a
   * `transactions#36` down the phone's History (modules.md M9). A row is now its title and its list,
   * "Object storage, in Services"; the number stays in the address the line links to and in the
   * row's own Details, which is where somebody who wants to say it goes (design.md SYS-3).
   *
   * A PERSON FIRST, because an `access.grant` line's target IS somebody and `targetSaid` says them
   * by name with no link: there is no person route in this build. Everything else is `thingOf`'s,
   * with the title the record sent beside the line (`readLog`'s `names`). `null` is a target with
   * nothing to say that is not an id, and the verb then stands alone.
   */
  const thingFor = (target: string): { text: string; href: string | null } | null => {
    const person = targetSaid(target, me, names);
    if (person) return { text: person.name, href: null };
    return thingOf(target, live?.names.get(target) ?? null);
  };

  /**
   * WHO, AND WHAT KIND OF CHANGE. The two questions this screen exists to answer.
   *
   * IT HAD NO CONTROLS AT ALL. Eight rows, a footer saying the record is at version 4,192, and
   * nothing on the page to reach any of the other four thousand — no search, no actor, no kind, no
   * range, no pagination. So the surface stated a number and then refused to let anybody use it,
   * which is worse than not stating it: "who changed obligations#1 last month" is the whole job of
   * an audit log and it could not be done.
   *
   * IN THE URL, LIKE EVERY OTHER FILTER IN THIS PRODUCT. `19 §5`: what defines which rows you are
   * looking at must be shareable, and "what did the renewal rule do" is exactly the thing somebody
   * pastes into a message.
   *
   * AND THEY APPEAR WHEN THERE IS SOMETHING TO CHOOSE BETWEEN. One actor is not a filter; it is a
   * fact, and a control offering it is a control that cannot change anything.
   */
  /* AND A CHIP HAS TO SAY WHICH ONE IT MEANS. Once an actor is said by name rather than by id, two
     people the record has no name for carry the same four words, and seven identical chips each
     filtering to one of seven is a control that lies about what it does. `offeredActors` withholds
     the offer, never the filter: a `?by=` somebody pasted still narrows the log (`19 §5`). */
  const actors = $derived(offeredActors([...new Set(LOG.map((e) => e.by))], me, names));
  const kinds = $derived([...new Set(LOG.map((e) => e.kind))]);

  const who = $derived(route.url.searchParams.get('by') ?? '');
  const what = $derived(route.url.searchParams.get('kind') ?? '');

  /**
   * THE DAY, WHICH IS THE ONE FILTER THIS SCREEN IS SENT FOR AND DID NOT HAVE.
   *
   * The point-in-time restore setting says *"find the moment"* and links here. What arrived was a
   * list filtered by actor and by kind, with no way to narrow by WHEN at all, on the surface whose
   * whole subject is when things happened. Somebody who knows it was the Tuesday before last had to
   * scroll.
   *
   * ONE DAY AND NOT A RANGE. `19 §5`'s rule is that a filter is what defines which rows you are
   * looking at and has to be shareable, and a day is the unit a person actually says: the ledger's
   * own rows are stamped to the minute now, so a day narrows to something readable and the minute in
   * each row's tooltip finishes the job. A range is two controls and a validity rule for a question nobody asked.
   *
   * AND IT APPEARS WHEN THERE IS SOMETHING TO CHOOSE BETWEEN, like the two beside it: a log whose
   * every entry is on one day has nothing to narrow.
   */
  const days = $derived([...new Set(LOG.map((e) => e.at.slice(0, 10)))].sort().reverse());
  const when = $derived(route.url.searchParams.get('on') ?? '');

  /* ONE LIST, WHICH TODAY LINKS TO: "12 changes to Tasks since you were last here" opens here narrowed to Tasks. It has no
     control of its own, since a list is chosen from Today or pasted, and the chip below says it and takes it off. */
  const list = $derived(route.url.searchParams.get('list') ?? '');
  const listName = $derived(route.data.lists?.find((l: { id: string; name: string }) => l.id === list)?.name ?? list);

  const matched = $derived(
    LOG.filter(
      (e) =>
        (!who || e.by === who) &&
        (!what || e.kind === what) &&
        (!when || e.at.slice(0, 10) === when) &&
        (!list || listOf(e.target) === list),
    ),
  );
  /* THE LOG GROWS WITH WRITES, NOT WITH ROWS, so on a record of any size this is the longest list in
     the product — and it was the one rendering every entry it held. `13 §4.3`'s cap, and the line
     that admits it. */
  const shown = $derived(matched.slice(0, DOM_CAP));
  /* A BURST IS ONE LINE (`burstsOf`), folded from what is drawn, so the cap above still counts lines of the log and
     the cap line under the list still says how many of them there are. */
  const told = $derived(burstsOf(shown));

  /* THE TWELVE WEEKS, over every line read so far and not only the filtered ones: the strip is how busy the record
     was, and a filter is a question about part of it. The render package's `heat` draws it, as every page's does. */
  const heat = $derived<Drawn>({ type: 'block', kind: 'heat', heading: historyWords.strip, rows: heatRows(LOG), raw: '', start: 0, end: 0 });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(route.url.searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    void goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  };

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.audit)}</title></svelte:head>

<PageHead icon="history" title={copy.audit} count={matched.length} total={LOG.length} />

<div class="page">
  <!-- THE LEAD SAYS WHAT IS NEW BEFORE THE LOG SAYS EVERYTHING: who signed the lines since the reader last looked,
       counted, in one line of context under the head (design-brief §5). -->
  {#if lead}<p class="since">{lead}</p>{/if}

  <!-- HOW BUSY THE RECORD HAS BEEN, twelve weeks by weekday. It counts what this screen has read, and says so while
       there is more below, because a quiet week the log has not reached yet is not a quiet week. -->
  {#if LOG.length > 0}
    <div class="strip">
      <Block block={heat} opts={{ now: clock }} />
      {#if live && live.cursor !== null}<p class="foot">{historyWords.stripRead(LOG.length)}</p>{/if}
    </div>
  {/if}

  <!-- A CHOICE APPEARS WHEN THERE IS ONE TO MAKE. Two actors and two kinds is a filter; one of
       either is a fact about the record, and a segmented control over it changes nothing. -->
  {#if actors.length > 1 || kinds.length > 1 || days.length > 1 || list}
    <div class="bar">
      {#if list}
        <span class="filter-label">{historyWords.onlyList(listName)}</span>
      {/if}
      {#if actors.length > 1}
        <div class="filter" role="group" aria-labelledby="f-who">
          <span class="filter-label" id="f-who">{copy.auditWho}</span>
          <span class="toggles">
          {#each actors as a}
            <button
              type="button"
              class="toggle"
              data-on={who === a ? '' : undefined}
              aria-pressed={who === a ? 'true' : 'false'}
              onclick={() => setParam('by', who === a ? '' : a)}
            >
              {#if who === a}<Icon name="check" size="s" />{/if}{actorSaid(a, me, names).name}
            </button>
          {/each}
          </span>
        </div>
      {/if}

      {#if kinds.length > 1}
        <div class="filter" role="group" aria-labelledby="f-what">
          <span class="filter-label" id="f-what">{copy.auditWhat}</span>
          <span class="toggles">
          {#each kinds as k}
            <button
              type="button"
              class="toggle"
              data-on={what === k ? '' : undefined}
              aria-pressed={what === k ? 'true' : 'false'}
              onclick={() => setParam('kind', what === k ? '' : k)}
            >
              {#if what === k}<Icon name="check" size="s" />{/if}{kindOf(k).word}
            </button>
          {/each}
          </span>
        </div>
      {/if}

      <!-- A `<select>` AND NOT A SEGMENTED CONTROL, because the number of days a log covers is
           unbounded and grows with use, which is the same argument `RowForm` makes for an enum of
           more than four values. The label is visible: a placeholder disappears exactly when
           somebody needs it (06 §8). -->
      {#if days.length > 1}
        <label class="filter on">
          <span class="filter-label">{copy.auditWhen}</span>
          <select class="on-select" value={when} onchange={(e) => setParam('on', e.currentTarget.value)}>
            <option value="">{copy.auditAnyDay}</option>
            {#each days as d}<option value={d}>{fmtDay(d)}</option>{/each}
          </select>
        </label>
      {/if}

      {#if who || what || when || list}
        <Button weight="bare" href="/audit"><Icon name="close" size="s" />{copy.clearFilters}</Button>
      {/if}
    </div>
  {/if}

  <!--
    THE SAME FIVE STATES EVERY OTHER LIST DRAWS, and this drew a grey sentence.

    `/audit?by=codex&kind=entry.create` gave a header reading `0 of 8` and one line — "Nothing in
    the log matches that." — which names neither the actor nor the kind. `19 §6` for `no-results`
    says quote the query verbatim, and the register gets it exactly right on the same record:
    `38 rows, none matching: zzzzz`, the term in a code chip, Clear filters inside the state.

    AND THE OTHER HALF WAS UNREACHABLE. `grep -c "<Empty"` on this file was 0, so a log with nothing
    in it — which is every record for about a minute — had the same sentence as a filter that missed:
    `no-data-yet` and `no-results` collapsed, which `19 §6` calls the failure.
  -->
  {#if refused}
    <Empty kind="error" title={refused}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if route.data.live && !live}
    <!-- Bars while the live log is on its way, rather than a blank panel under the title. -->
    <Waiting />
  {:else if matched.length === 0 && (!route.data.live || live)}
    <Empty
      kind={LOG.length === 0 ? 'no-data-yet' : 'no-results'}
      title={LOG.length === 0 ? copy.auditNone : copy.noneMatching(LOG.length, 'entries')}
      query={LOG.length === 0
        ? undefined
        : [who ? actorSaid(who, me, names).name : '', isEventKind(what) ? kindOf(what).word : what].filter(Boolean).join(' · ')}
      body={LOG.length === 0 ? copy.auditHolds : undefined}
    >
      {#snippet actions()}
        {#if who || what}<Button href="/audit">{copy.clearFilters}</Button>{/if}
      {/snippet}
    </Empty>
  {/if}

  <ul class="ledger">
    {#each told as t}
      {@const e = t.e}
      {@const by = actorSaid(e.by, me, names)}
      {@const declared = e.kind === 'declare' ? declaredOf(e.target, e.note) : null}
      <li>
        <div class="line line-short">
          <!-- ITS OWN COLUMN, NOT `.seq`. That one is 12ch of monospace for spoken ids, and
               `rows.css` says in as many words that anything longer needs a span of its own, so
               "renewal rule" arrived as `the renewal r…`. An actor is a name. -->
          <!-- A face beside the name, so the log reads as who passed through rather than as a
               column of names. -->
          <!-- AND THE FACE TOOK ITS INITIALS FROM AN ID. It was handed `actorOf(e.by)`, which gave
               a `p_` id straight back, so on a record with seven colleagues every face in the
               column was two characters of a ULID. It is handed the same words the column prints
               now, and the kind `actor` said beside them (`by.kind`), so a rule wears the rule
               glyph, an agent its face and the reader their own disc: a live record signs the
               reader's own writes with their id, and it is `news-live.ts` and `actor` between them
               that know the id is theirs. -->
          <span class="who">
            <!-- AN AGENT'S LINE WEARS ITS RUN (AGT-13): the run's hue, and a door to the run's handoff. -->
            <Face name={by.name} you={by.you} kind={by.kind} run={runOf(e.by)} size="s" />
            <span class="who-name">{by.name}</span>
          </span>
          <span class="line-main">
            <!-- The target is a LINK, and that is not decoration. This page was a list of spans:
                 nothing in it could be reached by Tab, so the one scrolling container in the app
                 had no focusable descendant and a keyboard user could not scroll the log at all
                 (WCAG 2.1.1). Making the row's subject reachable is the fix that a reader also
                 wanted anyway: an audit line names a row, and the next question is always what
                 that row says now. -->
            <!-- AND A NIGHTLY BACKUP IS ABOUT NO ROW. `target` is nullable in the DDL and the
                 ledger now has kinds that use the nullability, so the link is drawn when there is
                 something to link to and the verb stands alone when there is not, rather than an
                 empty anchor, which is a keyboard stop that goes nowhere and reads as nothing. -->
            <!-- AND A PERSON IS NOT A ROW. An access row's target IS somebody, so this printed
                 `Gave access p_01M1KJ7RG0TYYA0AX15QPGJJ4` and linked it to a route that resolves to
                 nothing. Measured on a record driven with eight people on it: all 8 of its
                 `access.grant` lines. A person is said in the words the rest of the product uses
                 for one, carries no spoken id (a `p_` id is not a number anybody says out loud),
                 and is not a link, because there is nowhere in this build to send a reader who
                 clicks a colleague. -->
            <!-- AND A BURST IS ONE LINE, "Created 14 rows in Payments", linked to the list it
                 filled; the rows themselves are one press away there, and fourteen lines of one
                 rule's work here buried what anybody did by hand (`burstsOf`). -->
            <!-- AND A FIELD PUT ON A LIST IS SAID AS ONE. A `declare` line read "Changed the page" with "Added domain."
                 beside it, which named the wrong thing and not the list; `declaredOf` makes "Added domain to Projects"
                 of the line's target and note, and that sentence is the whole line, so the note is not said twice. -->
            {#if declared !== null}<span class="line-title"><span class="kind"><Icon name={kindOf(e.kind).icon} size="s" />{declared}</span></span>
            {:else}<span class="line-title"><span class="kind"><Icon name={kindOf(e.kind).icon} size="s" />{kindOf(e.kind).word}</span>
              {#if t.many}<a class="target tap" href={at(t.many.href)}><bdi class="target-name">{t.many.text}</bdi></a
                >{:else if e.target}{@const thing = thingFor(e.target)}{#if thing?.href}<a class="target tap" href={at(thing.href)}
                    ><bdi class="target-name">{thing.text}</bdi></a
                  >{:else if thing}<bdi class="target-name">{thing.text}</bdi>{/if}{/if}</span>{/if}
          </span>
          <span class="line-amount note">{declared === null ? t.note : ''}</span>
          <!--
            HOW LONG AGO, WITH THE MOMENT BEHIND IT.

            The band is what makes a log scannable. The minute and the version, which the footer says
            is how you name a moment, are its tooltip: stacked under it they made every entry three
            lines tall for two numbers somebody wants once they have found the line.
          -->
          <span class="line-when">
            <!-- AND NO VERSION WHERE THE RECORD SENT NONE. A member held to named lists is sent no rowid, so `readLog`
                 gives her lines `version: 0`, and "v0" is a place in the log that is no place. -->
            <!-- A BURST'S TOOLTIP IS ITS SPAN, from its first line to its newest, since one minute
                 would name one of its lines and not the burst. -->
            <time
              datetime={e.at}
              title={t.count > 1
                ? historyWords.between(stamp(t.from), stamp(e.at))
                : e.version > 0
                  ? `${stamp(e.at)} · v${e.version.toLocaleString('en')}`
                  : stamp(e.at)}>{since(e.at, clock)}</time
            >
          </span>
        </div>
      </li>
    {/each}
  </ul>
  <CapLine shown={shown.length} total={matched.length} />
  {#if route.data.live && live && live.cursor !== null}
    <div class="older">
      <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
    </div>
  {/if}
  {#if olderFix}<p class="foot">{olderFix}</p>{/if}
  <!-- IT EXPLAINED THE DATA MODEL TO SOMEBODY WHO CAME TO SEE WHO CHANGED WHAT. "The log and the
       version are the same fact, so a version number is a place in this list" is true, and it is a
       sentence about how the record is built. What a reader needs from the number is what it is
       FOR: it is how you name a moment when you talk to somebody about it. -->
  <!-- AND NOT FOR A READER WHO WAS SENT NO VERSION. For a member invited to one list this said "version 4,192" off the
       rowid of her newest line, which is a count of every write on the record, hers or not
       (`loop/research-history-cursor.md`). She is sent none now, and her lines carry `version: 0`. -->
  {#if LOG[0] && LOG[0].version > 0}
    <p class="foot">{copy.auditVersion(LOG[0].version.toLocaleString('en'))}</p>
  {/if}
</div>

<style>
  .older {
    display: flex;
    margin-block: var(--sp-3);
  }

  /* WIDE ENOUGH FOR A NAME, in the reading face rather than the id face. It sits in the grid slot
     `.seq` would have taken, so the ledger's columns still line up down the page. */
  /* A NAME WRAPS ON A CARD TOO. `reply rule` and `renewal rule` are two words and the card's first
     column is 94px; truncating a four-actor filter's own labels leaves `reply r…` as the only thing
     saying who did it. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* `text-overflow` does nothing on a flex container, so the ellipsis is the name's own. */
  .who-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ONE LINE PER QUESTION, EACH WITH ITS NAME. The filters were two unlabelled bordered tracks, so a
     row of names and a row of verbs had to be told apart by reading them, and a track with nothing
     chosen looked like a control with a broken state. Now a label leads each line and a choice is a
     quiet toggle that takes a surface when it is on. */
  .bar {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-2) var(--sp-4);
    margin-block-end: var(--sp-4);
  }

  .filter {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
  }

  .filter-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .toggles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .on-select {
    justify-self: start;
  }

  /* On a phone the label sits over its line rather than beside it. */
  @media (width < 640px) {
    .bar {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .filter + .filter,
    .filter + :global(.btn) {
      margin-block-start: var(--sp-2);
    }

    /* ONE STRIP PER QUESTION, scrolled sideways, the way the settings areas are: fourteen wrapped
       pills took half a phone before the first entry of the log it filters. */
    .toggles {
      flex-wrap: nowrap;
      margin-inline: calc(var(--gutter) * -1);
      padding-inline: var(--gutter);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .toggle {
      flex: none;
      white-space: nowrap;
    }
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .toggle:hover:not([data-on]) {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .toggle[data-on] {
    padding-inline-start: var(--sp-2);
    background: var(--s2);
    border-color: var(--edge);
    color: var(--ink);
    font-weight: 500;
  }

  @media (pointer: coarse) {
    .toggle {
      min-block-size: var(--tap);
    }
  }

  /* THE LABEL IS VISIBLE AND IT IS BESIDE THE CONTROL, not inside it: a placeholder disappears
     exactly when a person needs it and fails contrast in most themes (06 §8). */
  .on-select {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    background: var(--s3);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
  }

  .bar > :global(.btn) {
    grid-column: 2;
    justify-self: start;
  }

  @media (width < 640px) {
    .bar > :global(.btn) {
      grid-column: 1;
    }
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max); /* One cap for every list page (DESIGN-SYSTEM 3.1, appendix C12). */
  }

  /* 20ch FOR THE ACTOR AND ITS FACE, because it is a name and not a spoken id. The ledger's default first column
     is 10ch of monospace, which "renewal rule" does not fit in — and once `rule.renewal` became
     English, every rule in the log truncated. */
  /**
   * A DESKTOP TRACK LIST IS A DESKTOP RULE, AND HAS TO SAY SO.
   *
   * `rows.css` turns a row into a two-line card below 640px. This override said nothing about width,
   * and it is more specific than the card rule — Svelte compiles `.ledger :global(.line)` to
   * `.ledger.svelte-xxx .line`, three classes against one — so it won at every size. The children
   * took their card placements and the parent kept four desktop tracks underneath them: computed at
   * 390, `144px 63px 0px 81px`, a zero-width track with a nowrap note in it.
   *
   * The cost is measurable. The longest note in the audit log was 19% visible — `added a n…` — and
   * `/decide` lost 227px of a 551px sentence. Eight entries, none readable, on the two screens whose
   * whole job is to say what changed and why. Every desktop screenshot looked correct.
   *
   * `@layer components` alone does NOT fix it: within one layer the more specific rule still wins.
   * The width query is what makes the two rules describe two different screens instead of arguing
   * about one.
   */
  /* THE WHAT AND THE NOTE SHARE WHAT IS LEFT EVENLY, and the what had 22ch of it. That was room for
     "Created services#6"; it is not room for "Created Object storage services#6", which is what the
     line says now that it names the thing, and the note beside it had 531px at 1440 while the
     name was being cut. */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 20ch minmax(0, 1fr) minmax(0, 1fr) 9ch;
    }
  }

  /* A word and a glyph, not an identifier. It is still the quiet half of the line, because the
     interesting part is what changed rather than the verb that changed it. */
  .kind {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .note {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* AND ON A CARD IT WRAPS, because a card has a line to spare and a truncated note is the one
     thing this screen must not do: the note IS what changed. */
  @media (width < 640px) {
    .note,
    .who-name {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }

    /* THE ACTOR GETS A LINE. On a card the row is two tracks, and `.who` is not one of the four
       cells the card layout places — so it fell into whatever was left, which was nothing: measured
       `clientWidth: 0` against 29px of text. Who did it is half of what this log says. */
    /* AND THE LINE IT GOT WAS ALREADY TAKEN. `.who` went across both tracks of row 1, and the note
       is `.line-amount`, which `rows.css` puts in row 1 column 2: measured at 390, `.who` at x 33
       to 357 on y 462 and the note at x 139 to 357 on y 463. "the assistant" and "Two services on
       the Fenwick invoice" were printed on top of each other, and any actor wider than about 106px
       did the same.

       SO ROW 1 IS WHO AND WHEN, row 2 is what was done to what, and row 3 is the note, which gets
       the whole width because it is the one thing on the line that must not be cut. */
    .who {
      grid-column: 1;
      grid-row: 1;
    }

    .line-when {
      grid-column: 2;
      grid-row: 1;
    }

    .note {
      grid-column: 1 / -1;
      grid-row: 3;
    }
  }

  /* It is a link, so it says so on hover and on focus — but not with a permanent underline, which
     at eight rows of monospace turns the column into a ladder. */
  .target {
    color: inherit;
    text-decoration: none;
    border-block-end: 1px solid transparent;
  }

  .target:hover,
  .target:focus-visible {
    border-block-end-color: currentColor;
  }

  /* THE LEAD IS THE ONE LINE OF CONTEXT UNDER THE HEAD, in the secondary ink so the head stays the
     title, at body size so it is read and not skimmed as a caption. */
  .since {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* THE STRIP SITS ON THE PAGE'S OWN RHYTHM. A block keeps a gap under itself for a page of blocks,
     and here the page's column gap already spaces it from the filters. */
  .strip {
    display: grid;
    gap: var(--sp-1);
  }

  .strip :global(.block) {
    margin: 0;
  }

  .foot {
    color: var(--dim);
    font-size: var(--t-xs);
  }


  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* BODY ON A PHONE IS THE PHONE'S BODY SIZE (design-brief §3). */
  @media (width < 640px) {
    .since {
      font-size: var(--t-md);
    }
  }
</style>
