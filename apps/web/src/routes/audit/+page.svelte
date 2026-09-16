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
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import { day as fmtDay, since, stamp } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { AUDIT, DECIDED, DOM_CAP, NOW, PAGES, QUESTIONS, REGISTERS, actorOf, entry } from '$lib/record/api.ts';
  import { CapLine } from 'braindog-render/svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  /* THE URL IS NOT TYPED. `?kind=` carries whatever somebody pasted, and the words this screen
     shows come from a map over the forty — so the string is checked against the vocabulary before
     it is used as a place in it, rather than indexing the map with a stranger and rendering
     `undefined.word`. `isEventKind` is the kernel's own guard, beside the list. */
  import { isEventKind } from '@braindog/kernel';
  import type { AuditEvent, EventKind } from '$lib/record/schema.ts';
  import { untrack } from 'svelte';

  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

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
  let live = $state<{ events: AuditEvent[]; names: Map<string, string>; cursor: number | null } | null>(null);
  let refused = $state<string | null>(null);
  const LOG = $derived(route.data.live ? (live?.events ?? []) : AUDIT);
  const clock = $derived(route.data.live ? Date.now() : NOW);

  $effect(() => {
    if (!route.data.live) return;
    const me = route.data.me.person;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    void import('$lib/record/news-live.ts')
      .then((m) => m.readLog(location.origin, me))
      .then((out) => {
        if (out.from === 'live') {
          live = out;
          ok = true;
        } else if (out.from === 'refused') refused = out.fix;
      })
      .finally(() => closed(ok, at));
  });

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
      const out = await m.readLog(location.origin, route.data.me.person, undefined, had.cursor);
      if (out.from === 'live') live = { events: [...had.events, ...out.events], names: new Map([...had.names, ...out.names]), cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * WHAT IT WAS DONE TO. A spoken id stays a spoken id — `services#6` is the product's own way of
   * naming a row out loud, and `19 §2` is explicit that a row has a number you can say. What does
   * not stay is `page.money`, which is a DECLARATION id: the page has a title, every other screen
   * uses it, and this was the one place printing the key instead.
   */
  /** The half of a `45 §5.1` target a person says out loud: `suggestion:SG31` is `SG31`. */
  const spoken = (target: string): string =>
    /^(?:suggestion|decision|prediction):(.+)$/.exec(target)?.[1] ?? target;

  const targetOf = (target: string): string => {
    const page = /^page\.([a-z0-9_-]+)$/.exec(target);
    if (page) return PAGES[page[1]!]?.title ?? target;
    /* `45 §5.1`'s governance shape: `<kind>:<spoken id>` — `suggestion:SG31`, `decision:D41`.
       The spoken id is the half a person says out loud and the half every other screen prints; the
       prefix is there so the ledger's `target` column is unambiguous across tables, and printing it
       here would be printing the schema at somebody who asked what happened. */
    return spoken(target);
  };

  /**
   * WHAT THE THING IS CALLED, WHICH THE LINE KNEW AND DID NOT SAY.
   *
   * Every line read "Created services#6" while the note beside it said "Object storage, from the
   * Fenwick invoice": the record had the name and printed the key, so a stranger reading the log
   * got a column of registers and numbers and had to open each one to learn what it was.
   *
   * THE NAME LEADS AND THE SPOKEN ID STAYS, after it and in the id face. This is one of the places
   * somebody wants a number they can say (`19 §2`), so it is still on every line that has one; it
   * has stopped being the only thing the line says. A page has no id to follow its title, because
   * `page.money` is a declaration's key and `targetOf` already prints the title instead.
   *
   * `null` when nothing is known by that id any more, and the line prints the id alone, which is
   * what it did before rather than an empty name.
   */
  const nameOf = (target: string): string | null => {
    if (route.data.live) return live?.names.get(target) ?? null;
    const row = /^([a-z0-9_-]+)#(\d+)$/.exec(target);
    if (row) {
      const reg = REGISTERS[row[1]!];
      const found = reg ? entry(row[1]!, Number(row[2])) : undefined;
      const title = reg && found ? String(found.fields[reg.title] ?? '') : '';
      return title || null;
    }
    const id = spoken(target);
    return [...QUESTIONS, ...DECIDED].find((q) => q.id === id)?.title ?? null;
  };

  /**
   * Where a target goes when you click it.
   *
   * Every `target` in this log is already a SPOKEN ID — `services#6`, `SG31`, `page.money` — which
   * is the whole point of having them, so the resolver at `/[id]` takes almost all of them without
   * a table here. `page.x` is the exception: a declaration is not a row, and it has its own route.
   *
   * `encodeURIComponent`, and not because of spaces. `#` in a URL starts the FRAGMENT, so
   * `/services#6` navigates to `/services` and scrolls to an anchor that does not exist. The
   * resolver decodes it on the other side.
   */
  const href = (target: string): string => {
    const page = /^page\.([a-z0-9_]+)$/.exec(target);
    if (page) return `/p/${page[1]}`;
    /* AND THE PREFIX COMES OFF THE LINK TOO, or it is a link to nothing. `/suggestion:SG31` is not
       a route — the spoken-id resolver takes `SG31`, which is the id the rest of the product uses.
       The prefix belongs to the ledger's storage, not to the address bar. */
    return `/${encodeURIComponent(spoken(target))}`;
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
  const actors = $derived([...new Set(LOG.map((e) => e.by))]);
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

  const matched = $derived(
    LOG.filter((e) => (!who || e.by === who) && (!what || e.kind === what) && (!when || e.at.slice(0, 10) === when)),
  );
  /* THE LOG GROWS WITH WRITES, NOT WITH ROWS, so on a record of any size this is the longest list in
     the product — and it was the one rendering every entry it held. `13 §4.3`'s cap, and the line
     that admits it. */
  const shown = $derived(matched.slice(0, DOM_CAP));

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
  <!-- A CHOICE APPEARS WHEN THERE IS ONE TO MAKE. Two actors and two kinds is a filter; one of
       either is a fact about the record, and a segmented control over it changes nothing. -->
  {#if actors.length > 1 || kinds.length > 1 || days.length > 1}
    <div class="bar">
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
              {#if who === a}<Icon name="check" size="s" />{/if}{actorOf(a)}
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

      {#if who || what || when}
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
    <Empty kind="error" title={refused} />
  {:else if route.data.live && !live}
    <!-- Bars while the live log is on its way, rather than a blank panel under the title. -->
    <Waiting />
  {:else if matched.length === 0 && (!route.data.live || live)}
    <Empty
      kind={LOG.length === 0 ? 'no-data-yet' : 'no-results'}
      title={LOG.length === 0 ? copy.auditNone : copy.noneMatching(LOG.length, 'entries')}
      query={LOG.length === 0
        ? undefined
        : [who ? actorOf(who) : '', isEventKind(what) ? kindOf(what).word : what].filter(Boolean).join(' · ')}
      body={LOG.length === 0 ? copy.auditHolds : undefined}
    >
      {#snippet actions()}
        {#if who || what}<Button href="/audit">{copy.clearFilters}</Button>{/if}
      {/snippet}
    </Empty>
  {/if}

  <ul class="ledger">
    {#each shown as e}
      {@const who = actorOf(e.by)}
      <li>
        <div class="line line-short">
          <!-- ITS OWN COLUMN, NOT `.seq`. That one is 12ch of monospace for spoken ids, and
               `rows.css` says in as many words that anything longer needs a span of its own — so
               "renewal rule" arrived as `the renewal r…`. An actor is a name. -->
          <!-- A face beside the name, so the log reads as who passed through rather than as a
               column of names. -->
          <span class="who">
            <Face name={who} you={who === 'you'} size="s" />
            <span class="who-name">{who}</span>
          </span>
          <span class="line-main">
            <!-- The target is a LINK, and that is not decoration. This page was a list of spans:
                 nothing in it could be reached by Tab, so the one scrolling container in the app
                 had no focusable descendant and a keyboard user could not scroll the log at all
                 (WCAG 2.1.1). Making the row's subject reachable is the fix that a reader also
                 wanted anyway — an audit line names a row, and the next question is always what
                 that row says now. -->
            <!-- AND A NIGHTLY BACKUP IS ABOUT NO ROW. `target` is nullable in the DDL and the
                 ledger now has kinds that use the nullability, so the link is drawn when there is
                 something to link to and the verb stands alone when there is not — rather than an
                 empty anchor, which is a keyboard stop that goes nowhere and reads as nothing. -->
            <span class="line-title"><span class="kind"><Icon name={kindOf(e.kind).icon} size="s" />{kindOf(e.kind).word}</span>
              {#if e.target}{@const name = nameOf(e.target)}<a class="target tap" href={href(e.target)}
                  >{#if name}<bdi class="target-name">{name}</bdi> <span class="target-id">{targetOf(e.target)}</span
                    >{:else}{targetOf(e.target)}{/if}</a
                >{/if}</span>
          </span>
          <span class="line-amount note">{e.note}</span>
          <!--
            HOW LONG AGO, WITH THE MOMENT BEHIND IT.

            The band is what makes a log scannable. The minute and the version, which the footer says
            is how you name a moment, are its tooltip: stacked under it they made every entry three
            lines tall for two numbers somebody wants once they have found the line.
          -->
          <span class="line-when">
            <time datetime={e.at} title="{stamp(e.at)} · v{e.version.toLocaleString('en')}">{since(e.at, clock)}</time>
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
  {#if LOG[0]}
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
    max-inline-size: 1100px;
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

  /* The number you can say, after the name and quieter than it: the face the product keeps for
     ids, in the dim ink, so the eye reads the name first and finds the id when it wants it. */
  .target-id {
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
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
</style>
