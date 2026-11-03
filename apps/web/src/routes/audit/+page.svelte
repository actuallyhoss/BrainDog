<!--
  Every write, by whom, against which version.

  Of four comparable products surveyed, three ship a MUTABLE history: one has a "Clear revision
  history" button whose result cannot be retrieved, one lets authors delete published updates, and
  one never claims append-only. This one is append-only BY CONSTRUCTION, because there is one write
  path, not because a policy says so (20 §9).

  Which is why there is no delete control on this screen and no filter that can hide a row. A
  history you can edit is a history, and a history you cannot is a record.

  THE SHAPE, as the design system draws Activity: the title and its sentence, the filters as one segmented control in
  the toolbar, the stream as one tile a day with an hour subhead for each hour in it, and beside it three tiles, each
  with its chart and the one line that says what the chart means: who worked in the last day, what changed, and the
  busy hours of the week.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { handlesSaid, listName as declaredName, ruleNameSaid } from '$lib/record/names.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
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
  import Segmented from '$lib/ui/Segmented.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import Bars from '$lib/viz/Bars.svelte';
  import HeatGrid from '$lib/viz/HeatGrid.svelte';
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
  import { isEventKind } from '@braindog/kernel/constants';
  import type { AuditEvent, EventKind } from '$lib/record/schema.ts';
  import { markAll, type LogRead } from '$lib/record/news-live.ts';
  import type { Cursor } from '@braindog/client';
  import { onMount, tick, untrack } from 'svelte';

  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { opens, shuts } from '$lib/motion/open.ts';
  /* WHO, IN WORDS. This screen's three person-shaped slots (the actor on a line, the `by` filter, and
     the target of an access row) all printed raw `p_` ids on a record with more than one person on
     it. `who.ts` holds the reason and the measurement. */
  import { actorSaid, byMatches, didSaid, offeredActors, ranName, runsIn, targetSaid, whoWords } from './who.ts';
  /* WHAT THE LOG SAYS, IN WORDS AND IN FIGURES: the sentence, the bands, a row by its title and list, a burst as one
     line, and the three tiles' counts and readings. `lines.ts` holds each rule and why. */
  import {
    awaySaid,
    newestFirst,
    oneDecision,
    below,
    byWhoOf,
    burstsOf,
    sameMinute,
    minuteSaid,
    busyOf,
    busySaid,
    changesOf,
    clockOf,
    dayGroups,
    dayOf,
    dayWord,
    fold,
    historyWords,
    HOURS,
    isAgent,
    isBookkeeping,
    keepsBooks,
    keyOf,
    accessSaid,
    lineSaid,
    LANE_SPAN_MS,
    lanesOf,
    lanesSaid,
    whoPartsOf,
    whoSaid,
    type WhoPart,
    listOf,
    partOf,
    passOf,
    ranOf,
    ranSaid,
    rolledRuns,
    settledOf,
    tallyOf,
    tallySaid,
    thingOf,
    type ByWho,
    type Group,
    type Told,
  } from './lines.ts';
  /* A FIELD PUT ON OR TAKEN OFF A LIST, IN WORDS, from the same helper Home's feed says it with. STATIC, and the lead's
     `readUnseen` with it: one module both imported and imported lazily is neither split nor shared, only warned about. */
  import { declaredOf, readUnseen } from '$lib/record/history-live.ts';
  /* WHEN THE READER'S MARK MOVES: stamped as they leave, with the newest line this page held. The rule is every
     screen's (`lib/page/read-mark.ts`), and Home stamps through it too. */
  import { readMarkOf, seenAfter, stampOf as markStamp } from '$lib/page/read-mark.ts';

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
    /* `Ran` AND IT WAS `Fetched`: a rule or a script that ran is what a person reads. */
    pull: { word: 'Ran', icon: 'refresh' },
    /* Access */
    'access.grant': { word: 'Gave access', icon: 'people' },
    'access.revoke': { word: 'Took access away', icon: 'people' },
    /* MADE, NOT OPENED (AN21): "Opened a link" read as somebody having read it. The line names the page ("Shared Money
       with a link", `targetOf` in `news-live.ts`). */
    'share.open': { word: 'Shared', icon: 'link' },
    'share.close': { word: 'Stopped sharing', icon: 'link' },
    /* Lifecycle */
    /* `Exported` AND IT WAS `Backed up`: these lines are his own exports, and Settings › Backups lists them as that. */
    export: { word: 'Exported', icon: 'archive' },
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
     every shell now sets `true` (`no-sample-offline-screens.test.ts` says why it is no witness). */
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
  /* THE TITLES OF THE RULES AND SCRIPTS IN THE LOG, read once (`titlesOf`), so a line signed `rule:meet-payees` or
     `script:settle_matched_line@v4` is said by the name the Automations page gives it, never its id. */
  let titles = $state.raw<ReadonlyMap<string, string>>(new Map());
  const names = $derived<ReadonlyMap<string, string>>(new Map<string, string>([...(Object.entries(route.data.names ?? {}) as [string, string][]), ...titles]));
  /* THE READER'S OWN FACE IS THEIR OWN FIRST LETTER, never the "Y" of "You". */
  const myName = $derived((route.data.me as { name?: string }).name ?? null);
  $effect(() => {
    if (!route.data.live) return;
    void titlesOf(apiBase()).then((t) => (titles = t));
  });
  async function titlesOf(base: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
      const [{ createClient }, { rowsOf }, { readScripts }] = await Promise.all([import('@braindog/client'), import('$lib/flow/source.ts'), import('$lib/record/scripts.ts')]);
      const [rules, scripts] = await Promise.all([createClient({ base }).call<unknown>('automations'), readScripts(base)]);
      if (rules.ok) for (const r of rowsOf(rules.value)) out.set(`rule:${r.id}`, r.name);
      if (scripts.ok) for (const sc of scripts.value) if (sc.title.trim() !== '') out.set(`script:${sc.script}`, sc.title.trim());
    } catch {
      /* The ids in words stand. */
    }
    return out;
  }

  /**
   * THE LOG AS THE RECORD SENDS IT, AND ITS OWN BOOKS WITH IT WHILE EVERYTHING IS ON. The record leaves the sweep that
   * writes runs off and the agents' last-seen stamps out of the log unless it is asked for everything (`recentHistory`),
   * so those are asked for, not only unhidden here. The ask is `readLog`'s fifth argument; a `readLog` that takes four
   * sends the log without them, and the switch then shows what this page held back (`changesOf`).
   */
  type LogReader = (base: string, me: string | null, io: undefined, before: Cursor | null, everything: boolean) => Promise<LogRead>;
  async function logOf(before: Cursor | null, all: boolean): Promise<LogRead> {
    const read: LogReader = (await import('$lib/record/news-live.ts')).readLog;
    return read(apiBase(), me, undefined, before, all);
  }

  /* READ AGAIN WHEN EVERYTHING IS TURNED ON OR OFF, since the record answers the two differently. What is drawn stays
     until the new page lands, so the switch never blanks the log, and only the newest read is kept. */
  let asked = 0;
  $effect(() => {
    if (!route.data.live) return;
    const all = everything;
    const n = ++asked;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    void logOf(null, all)
      .then((out) => {
        if (n !== asked) return;
        if (out.from === 'live') {
          live = out;
          refused = null;
          ok = true;
        } else if (out.from === 'refused') refused = out.fix;
      })
      .finally(() => closed(ok || n !== asked, at));
  });

  /**
   * WHAT IS NEW SINCE THE READER LAST LOOKED, which the title's sentence says: how many things, and how many of them
   * the agents did.
   *
   * A SENTENCE, NOT THE SCREEN. The log below is what Activity is for, so a refusal here draws no sentence and settles
   * nothing: the call closes as answered, and the log's own read is the one that says the record could not be reached.
   */
  /* WHO WORKED OVER THE MONTH, the record's own figure (`activity-by-who`), read once after the log (AF12): its BrainDog part
     was drawn by no screen. A refusal or an older host draws nothing. */
  let byWho = $state.raw<WhoPart[] | null>(null);
  $effect(() => {
    if (!route.data.live) return;
    /* NOT OF SOMEBODY HELD TO A FEW LISTS (collab pass 4): the figure reads the whole log, and a contractor on one project
       was told 404 for it on every open. */
    if (!may(route.data as unknown as Shell, 'read')) return;
    untrack(() => {
      void import('@braindog/client')
        .then(({ createClient }) => createClient({ base: apiBase() }).metric('activity-by-who'))
        .then((out) => (byWho = whoPartsOf(out)))
        .catch(() => (byWho = null));
    });
  });
  let unseen = $state<{ actors: string[]; capped: boolean; byWho: ByWho | null; upTo?: Cursor | null } | null>(null);
  $effect(() => {
    if (!route.data.live) return;
    const at = untrack(opened);
    void readUnseen(apiBase())
      .then((out) => {
        /* AND THE RECORD'S OWN COUNT OF WHO, when the read carries it (`byWho`): `byWhoOf` takes nothing that is
           not a count, so a read older than it is counted here as before. */
        if (out.from === 'live') unseen = { actors: out.actors, capped: out.capped, byWho: byWhoOf((out as { byWho?: unknown }).byWho), upTo: out.upTo };
      })
      .catch(() => undefined)
      .finally(() => closed(true, at));
  });

  /**
   * THE MARK IS STAMPED WHEN THE READER LEAVES, as Home stamps it, and only when the sentence above said something was
   * new: `pagehide` covers a closed tab, and the screen's end covers leaving for another. Without it the mark moved only
   * on a home that draws a feed of the log, and this screen said the same lines were new every time it was opened.
   *
   * WITH THE NEWEST LINE THIS PAGE HELD, not the shell's cursor alone, which is as old as the tab (`readMarkOf`). A mark
   * that did not land leaves the record's where it was, so the same lines come back rather than being lost. One that
   * landed empties the sentence, for a tab that is hidden and then shown again.
   *
   * THE RECORD IS NAMED WHEN THE SCREEN OPENS. By the time it ends the address is already the next screen's, and that
   * may be another record's.
   */
  onMount(() => {
    const base = apiBase();
    /* Imported with the screen, never inside the leave: a closing tab does not wait for a module. */
    const stamp = markStamp((upTo) => markAll(base, upTo));
    const leave = () => {
      if (!route.data.live) return;
        const held = (live?.events ?? []).reduce((top, e) => Math.max(top, e.seq), 0);
      const upTo = readMarkOf(unseen?.upTo ?? route.data.upTo, unseen ? unseen.actors.length : null, held);
      void stamp.leave(upTo).then((landed) => {
        if (landed) unseen = seenAfter();
      });
    };
    addEventListener('pagehide', leave);
    return () => {
      removeEventListener('pagehide', leave);
      leave();
    };
  });

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
      const out = await logOf(from, everything);
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
   * again and what arrived goes on top, tinted for a second and a half: an agent's line appears under the
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
        const out = await logOf(null, everything);
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
   * the row's own Details, which is where somebody who wants to say it goes.
   *
   * A PERSON FIRST, because an `access.grant` line's target IS somebody and `targetSaid` says them
   * by name with no link: there is no person route in this build. Everything else is `thingOf`'s,
   * with the title the record sent beside the line (`readLog`'s `names`). `null` is a target with
   * nothing to say that is not an id, and the verb then stands alone.
   */
  /* A LIST BY THE NAME THE RAIL GIVES IT. The shell holds every list's name, and a line's list was said from its id
     where the declaration had not been read yet, so the rail's Instalments was "Installments" down this screen. */
  const shellLists = $derived(
    new Map(((route.data.lists ?? route.data.index?.registers ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])),
  );
  const listSaid = (id: string): string => shellLists.get(id) ?? declaredName(id);

  const thingFor = (target: string): { text: string; href: string | null; list: string | null } | null => {
    const person = targetSaid(target, me, names);
    if (person) return { text: person.name, href: null, list: null };
    return thingOf(target, live?.names.get(target) ?? null, listSaid);
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
  /**
   * CHANGES, AND NOT THE RECORD KEEPING ITS BOOKS, UNLESS ASKED FOR (`isBookkeeping`). On the owner's record 154 of the
   * newest 200 lines were the hourly sweep marking quiet runs abandoned, so what the agents had changed was buried
   * under the record noting that they had stopped. The rest are a press away, `Everything`, which is in the address
   * like every filter here, so "show me what the runs did" can be sent to somebody.
   *
   * EVERY CONTROL AND COUNT BELOW READS THE SAME LINES THE STREAM DRAWS, so a choice of who or what never offers
   * somebody whose every line is hidden, and the title's count is out of what is shown.
   */
  const everything = $derived(route.url.searchParams.has('everything'));
  /* NEWEST FIRST BY WHEN, AND THEN BY VERSION (`newestFirst`), before anything is grouped under an hour. */
  /* ONE LINE PER DECISION (`oneDecision`): a question's close is folded into the decision written beside it. */
  const kept = $derived(newestFirst(oneDecision(changesOf(LOG, everything))));
  const bookkept = $derived(LOG.filter((e) => isBookkeeping(e)).length);
  const hiddenNow = $derived(everything ? 0 : bookkept);
  /* THE SWITCH IS OFFERED WHERE THERE ARE BOOKS TO SHOW: lines this page held back, or a record holding agent runs,
     whose sweep and stamps the record itself leaves out until asked (`keepsBooks`). On from the shell's own lists, so it
     is in the toolbar from the first paint rather than arriving with the log. */
  const offerAll = $derived(everything || bookkept > 0 || keepsBooks(route.data.index?.registers));

  /* WHO EACH RUN IN THE LOG IS, by its handle, so the filter says a run as its line does. */
  const runs = $derived(runsIn(kept));
  const actors = $derived(offeredActors([...new Set(kept.map((e) => e.by))], me, names, runs));
  const kinds = $derived([...new Set(kept.map((e) => e.kind))]);
  const perKind = $derived(kept.reduce((m, e) => m.set(e.kind, (m.get(e.kind) ?? 0) + 1), new Map<EventKind, number>()));

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
  const days = $derived([...new Set(kept.map((e) => dayOf(e.at)))].sort().reverse());
  const when = $derived(route.url.searchParams.get('on') ?? '');
  /* A DAY AS A PERSON SAYS IT, from its local noon so no clock change moves it into its neighbour. */
  const daySaid = (d: string): string => dayWord(new Date(`${d}T12:00`).getTime(), clock);

  /* ONE LIST, WHICH TODAY LINKS TO: "12 changes to Tasks since you were last here" opens here narrowed to Tasks. It has no
     control of its own, since a list is chosen from Today or pasted, and the button in the toolbar says it and takes it off. */
  const list = $derived(route.url.searchParams.get('list') ?? '');
  const listName = $derived(list === '' ? '' : listSaid(list));

  const matched = $derived(
    kept.filter(
      (e) =>
        (!who || byMatches(e.by, who)) &&
        (!what || e.kind === what) &&
        (!when || dayOf(e.at) === when) &&
        (!list || listOf(e.target) === list),
    ),
  );
  /* THE LOG GROWS WITH WRITES, NOT WITH ROWS, so on a record of any size this is the longest list in
     the product. `13 §4.3`'s cap, and the line that admits it. */
  /* A PHONE-LENGTH FIRST SCREEN: the newest 30 lines, then "Show more" adds 30 of the same page. */
  let wanted = $state(30);
  /* A BURST IS ONE LINE (`burstsOf`), and a rule's quiet runs on one day are one line (`rolledRuns`), folded from
     everything that matched, so a line drawn and a line counted are the same line. */
  const lines = $derived(sameMinute(rolledRuns(burstsOf(matched, listSaid))));
  const told = $derived(lines.slice(0, Math.min(wanted, DOM_CAP)));
  /* ONE PRESS FOR MORE: more of what was read, then the older page under it. */
  const moreRead = $derived(told.length < lines.length && wanted < DOM_CAP);
  const moreOlder = $derived(!moreRead && route.data.live && live !== null && live.cursor !== null);
  function showMore(): void {
    if (moreRead) wanted += 30;
    else void loadOlder().then(() => (wanted += 30));
  }
  /* AND THE LINES SIT ONE TILE A DAY, each hour a subhead inside it (`dayGroups`). */
  const bands = $derived(dayGroups(told, clock));

  /**
   * ONE PASS OF BRAINDOG'S OWN UPDATE IS ONE LINE, AND WHAT IT DID IS CLOSED AT FIRST (`passOf`). A press opens
   * the steps under it and a second shuts them: unlike a run's "+9 more", the button stays, since it names the pass.
   * Kept by the pass line's key, which is its newest step's place in the log, so a page read again keeps it open.
   */
  let passesOpen = $state<ReadonlySet<string>>(new Set());
  function togglePass(key: string) {
    const next = new Set(passesOpen);
    if (!next.delete(key)) next.add(key);
    passesOpen = next;
  }

  /**
   * THE THREE TILES, and what each counts.
   *
   * WHO WORKED and BUSY HOURS count every change read, filtered or not: they say how the record has been, and a filter
   * is a question about part of it. The record's own books join them only with Everything on, so a sweep that wrote ten
   * runs off at three in the morning is not a busy hour. WHAT CHANGED counts the lines the filters match, because its
   * figure is the title's.
   *
   * NO FOOT SAYING HOW MANY LINES WERE READ. "Counted over the 200 newest entries read so far" stood under all three, a
   * line about the reader's paging where the tile says what the record did; Older entries under the stream is where the
   * rest of the log is.
   */
  const lanes = $derived(lanesOf(kept, clock, me, names));
  const tally = $derived(tallyOf(matched, me, names, listSaid));
  /* THE SAME COUNT OVER EVERYTHING READ, whatever the chips narrow, for the line under the title (`awaySaid`). */
  const whole = $derived(tallyOf(kept, me, names, listSaid));
  /* The line under the title, below `whole`, which it reads. */
  /* THE LIVE LOG IS STILL ON ITS WAY, and the page draws its bars. */
  const waiting = $derived(Boolean(route.data.live) && !live && !refused);
  /* NOT SAID FROM THE FIRST SIXTY WHILE THE WHOLE LOG IS COMING (leftovers8): "More than 60 changes since you were last
     here. Agents made 13 of the newest 60." took two lines on a phone and became "195 changes ... Agents made 8." a beat
     later, one line, and the page under it moved twice. */
  const lead = $derived(
    waiting ? undefined : (unseen ? awaySaid(unseen.actors, me, names, unseen.capped, unseen.byWho, { total: whole.total, agents: whole.groups.find((g) => g.group === 'agent')?.count ?? 0 }) : '') || undefined,
  );
  const busy = $derived(busyOf(kept, clock));
  const topKinds = $derived(
    tally.parts.slice(0, 5).map((k) => ({
      label: k.part,
      value: k.count,
      /* EVERY BAR IN THE SECOND INK (money F11): the kinds are counts side by side, and an accent's tint or one bar in
         black made one kind read as the thing to look at. */
      tone: 'var(--ink-2)',
    })),
  );
  /* EACH GROUP SAID BY WHO IT IS, so the parts add up to the whole above them: BrainDog's own rules (`rule:handled`,
     its own updates) are BrainDog's, as their lines say (`actor`), and were counted "by rules" with every other line
     that was not an agent's or yours, people's included (Z2, finish loop of 30 October). */
  const tallyMeta = $derived.by(() => {
    const n = (group: Group): number => tally.groups.find((g) => g.group === group)?.count ?? 0;
    const said = { agent: historyWords.byAgents, you: historyWords.byYou, person: historyWords.byPeople, rule: historyWords.byRules, record: historyWords.byBrainDog };
    const order: Group[] = ['agent', 'you', 'person', 'rule', 'record'];
    return order.flatMap((group) => (n(group) > 0 ? [said[group](n(group))] : [])).join(' · ') || undefined;
  });
  const tallyReading = $derived(
    tallySaid(
      tally.parts.map((k) => ({ word: k.part, count: k.count, agents: k.agents })),
      tally.total,
    ),
  );
  const tiles = $derived(lanes.length > 0 || byWho !== null || matched.length > 0 || busy.total > 0);
  /* ON A PHONE THE FILTERS ARE ONE "Filter" BUTTON IN THE HEAD, and a sheet holds them (money F11): the segmented control
     and its two menus wrapped into a box over the title row at 390. */
  let filtering = $state(false);
  const phone = $derived(rowsAsCards());

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
   * this line says. Not for the record's page, which says it once its own read has answered.
   */
  $effect(() => {
    drew('ready');
  });
</script>

<svelte:head><title>{titleOf(copy.audit)}</title></svelte:head>

{#snippet tools()}
  <div class="tools">
    {#if list}
      <!-- THE ONE LIST IT WAS OPENED ON, as a quiet rectangle that takes itself off. -->
      <Button weight="quiet" onclick={() => setParam('list', '')} aria-label={historyWords.everyList(listName)}
        >{historyWords.onlyList(listName)}<Icon name="close" size="s" /></Button
      >
    {/if}

    {#if offerAll || actors.length > 1 || kinds.length > 1 || days.length > 1}
      <!-- THE FILTERS ARE ONE SEGMENTED CONTROL: one `--tile-2` rectangle, each filter a segment in it, and a filter that
           narrows the stream wears the chosen segment's tile fill, so a narrowed stream says so at a glance. Who and
           what open their menus from their segment; the day is the native select, drawn as a segment.

           THE TRACK IS THE ONE PART (`Segmented.svelte`), as a list's view switch is, so it is drawn the way every
           other track is: flat, with the selection moving to the segment chosen next. More than one filter can narrow
           at once, so the track is given `many`: the part draws it no selection that moves, and every filter that is on keeps
           the same flat fill of its own. -->
      <Segmented many class="filters" role="group" aria-label={historyWords.filters}>
        {#if offerAll}
          <!-- THE RECORD'S OWN BOOKKEEPING, ON OR OFF. A switch and not a filter: it is how much of the log is drawn, and
               Clear filters leaves it as it is. -->
          <button
            type="button"
            class="segment"
            aria-pressed={everything}
            data-on={everything ? '' : undefined}
            onclick={() => setParam('everything', everything ? '' : '1')}>{historyWords.everything}</button
          >
        {/if}

        {#if actors.length > 1}
          <Menu label={copy.auditWho} align="end">
            {#snippet trigger()}
              <span class="segment seg-menu" data-on={who ? '' : undefined}>
                <span class="seg-word">{who ? actorSaid(who, me, names, runs.get(who) ?? null).name : historyWords.everyone}</span><Icon name="chevronDown" size="s" />
              </span>
            {/snippet}
            <button type="button" class="mi" role="menuitem" aria-current={who === '' ? 'true' : undefined} onclick={() => setParam('by', '')}>
              <Icon name="people" size="s" /><span class="mi-name">{historyWords.everyone}</span>{#if who === ''}<Icon name="check" size="s" />{/if}
            </button>
            {#each actors as a (a)}
              {@const by = actorSaid(a, me, names, runs.get(a) ?? null)}
              <button type="button" class="mi" role="menuitem" aria-current={who === a ? 'true' : undefined} onclick={() => setParam('by', a)}>
                <Face name={by.name} you={by.you} kind={by.kind} size="s" /><span class="mi-name">{by.name}</span>{#if who === a}<Icon name="check" size="s" />{/if}
              </button>
            {/each}
          </Menu>
        {/if}

        {#if kinds.length > 1}
          <Menu label={copy.auditWhat} align="end">
            {#snippet trigger()}
              <span class="segment seg-menu" data-on={what ? '' : undefined}>
                <span class="seg-word">{isEventKind(what) ? kindOf(what).word : historyWords.everyKind}</span><Icon name="chevronDown" size="s" />
              </span>
            {/snippet}
            <button type="button" class="mi" role="menuitem" aria-current={what === '' ? 'true' : undefined} onclick={() => setParam('kind', '')}>
              <Icon name="filter" size="s" /><span class="mi-name">{historyWords.everyKind}</span><span class="mi-n num">{kept.length}</span>
            </button>
            {#each kinds as k (k)}
              <button type="button" class="mi" role="menuitem" aria-current={what === k ? 'true' : undefined} onclick={() => setParam('kind', k)}>
                <Icon name={kindOf(k).icon} size="s" /><span class="mi-name">{kindOf(k).word}</span><span class="mi-n num">{perKind.get(k) ?? 0}</span>
              </button>
            {/each}
          </Menu>
        {/if}

        {#if days.length > 1}
          <select class="segment seg-select" data-on={when ? '' : undefined} aria-label={copy.auditWhen} value={when} onchange={(e) => setParam('on', e.currentTarget.value)}>
            <option value="">{copy.auditAnyDay}</option>
            {#each days as d (d)}<option value={d}>{daySaid(d)}</option>{/each}
          </select>
        {/if}
      </Segmented>
    {/if}

    {#if who || what || when || list}
      <Button weight="bare" href={everything ? '/audit?everything=1' : '/audit'}>{copy.clearFilters}</Button>
    {/if}
  </div>
{/snippet}

{#snippet filterOpen()}
  <Button weight="glass" data-filter-open aria-haspopup="dialog" onclick={() => (filtering = true)}><Icon name="filter" size="s" />{copy.filter}</Button>
  <Sheet bind:open={filtering} title={copy.filter}>
    <div class="sheet-tools">{@render tools()}</div>
  </Sheet>
{/snippet}

{#snippet entry(t: Told, sameTime = false)}
  {@const e = t.e}
  {@const by = actorSaid(e.by, me, names, e.run_by ?? null)}
  <!-- A RULE OR A SCRIPT THAT RAN LEADS WITH ITS TITLE ("Ran Meet payees"), and says what it is beside its face. -->
  {@const ran = ranOf(e)}
  {@const ranTitle = ran === null ? null : names.has(`${ran.kind}:${ran.id}`) ? ruleNameSaid(names.get(`${ran.kind}:${ran.id}`)!) : ranName(e.by)}
  <!-- ONE PASS OF BRAINDOG'S OWN UPDATE (`passOf`) says the record's sentence as its whole line, and names nothing of its own. -->
  {@const pass = passOf(e)}
  {@const settled = pass === null ? settledOf(e, me, names) : null}
  {@const declared = pass === null && e.kind === 'declare' ? declaredOf(e.target, e.note) : null}
  {@const thing = pass !== null ? null : ran !== null && ranTitle !== null ? { text: ranTitle, href: ran.href, list: null } : (t.many ?? (declared === null && e.target ? thingFor(e.target) : null))}
  <!-- THE LINE AS ONE SENTENCE (`lineSaid`): no second verb where the title already says what was done, a question in
       quotation marks, and a note that does not say the title again, its days said as a person says them. -->
  <!-- A RUN OR AN INSTRUCTION THE NOTE NAMES BY ITS HANDLE IS SAID IN WORDS ("Taken by S42." is "Took this."). -->
  {@const told = handlesSaid(t.note, e.by, e.run_by ?? null)}
  {@const said = lineSaid(
    kindOf(e.kind).word,
    thing?.text ?? null,
    declared === null && pass === null ? (ran !== null && ranTitle !== null && t.count === 1 ? ranSaid(told, ranTitle, ran.id) : told) : '',
    t.many === null && /^(?:suggestion|decision|prediction):/u.test(e.target ?? ''),
    clock,
  )}
  {@const note = said.note}
  <!-- SOMEBODY'S ACCESS IS ONE SENTENCE WITH THEM IN IT ("Gave you access"), not the verb beside their name. -->
  {@const access = pass === null && declared === null && e.target ? (targetSaid(e.target, me, names) ?? null) : null}
  {@const accessLine = access === null ? null : accessSaid(e.kind, access)}
  <!-- WHO DID IT, and before them who asked, where a question asked and answered in one moment is one line (`oneDecision`). -->
  {@const did = ran !== null ? (ran.kind === 'rule' ? historyWords.aRule : historyWords.aScript) : said.done ? didSaid(e.by, me, names, e.run_by ?? null, said.done) : by.name}
  {@const doer = e.asked ? whoWords.askedThen(actorSaid(e.asked, me, names).name, said.done ? did : didSaid(e.by, me, names, e.run_by ?? null, 'answered')) : did}
  <!-- AN AGENT'S LINE UNDER A MINUTE OLD WEARS THE ONE HUE THAT MEANS ALIVE, and every other well is neutral: "Created"
       wore the green of done on a hundred lines at once (money F11). Nothing here is red: a log is history, not need. -->
  {@const tone = isAgent(by.kind) && clock - Date.parse(e.at) <= 60_000 ? 'live' : undefined}
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
        {#if t.fold}<span class="line-title">{minuteSaid(e.kind, kindOf(e.kind).word, t.count)}</span>
        {:else if pass !== null}<span class="line-title">{pass.said}</span>
        {:else if declared !== null}<span class="line-title">{declared}</span>
        {:else if accessLine !== null}<span class="line-title">{accessLine}</span>
        {:else}<span class="line-title"
            >{#if said.verb}<span class="verb">{said.verb}</span>{/if}{#if thing}{said.verb ? ' ' : ''}{#if thing.href}<a class="target tap" href={at(thing.href)}
                  >{said.quoted ? '“' : ''}<bdi class="target-name" data-own>{thing.text}</bdi>{said.quoted ? '”' : ''}</a
                >{:else}{said.quoted ? '“' : ''}<bdi class="target-name" data-own>{thing.text}</bdi>{said.quoted ? '”' : ''}{/if}{/if}{#if e.kind === 'share.open'}{thing ? historyWords.withLink : historyWords.aLink}{:else if e.kind === 'share.close' && !thing}{historyWords.aLink}{/if}</span
          >{/if}
        <span class="line-detail">
          <!-- AN AGENT'S LINE WEARS ITS RUN: the run's hue, and a door to the run's handoff. -->
          <span class="who"><Face name={by.you && myName ? myName : by.name} you={by.you} kind={by.kind} run={runOf(e.by)} size="s" /></span>
          <span class="detail-text"
            >{settled ?? doer}{#if said.done && (settled !== null || ran !== null)}{' · '}{said.done}{/if}{#if note}<span class="note" title={note} data-own>{' · '}{note}</span>{/if}<!--
              WHERE IT HAPPENED, in the same run of quiet words, so it wraps with them on a phone: the list a row is in.
            -->{#if thing?.list}<span class="where-chip">{' · '}{thing.list}</span>{/if}</span
          >
        </span>
      </span>
      <!-- THE MINUTE, AND BEHIND IT THE DAY AND THE VERSION. A burst's tooltip is its span, from its first line to
           its newest; no version where the record sent none (a member held to named lists is sent `0`). -->
      <span class="line-when" data-same={sameTime ? '' : undefined}>
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
    <!-- WHAT ONE PASS DID, closed until asked for: each step a line of its own, as Activity draws any line, and each
         still undone on its own in the record. -->
    {#if t.fold}
      {@const open = passesOpen.has(t.key)}
      <div class="fold-row">
        <button type="button" class="fold tap" aria-expanded={open} onclick={() => togglePass(t.key)}
          >{open ? historyWords.hideEach : historyWords.showEach(t.count)}</button
        >
      </div>
      {#if open}
        <ul class="ledger steps" in:opens out:shuts>
          {#each t.fold as s (s.key)}{@render entry(s)}{/each}
        </ul>
      {/if}
    {:else if pass !== null}
      {@const open = passesOpen.has(t.key)}
      <div class="fold-row">
        <button type="button" class="fold tap" aria-expanded={open} onclick={() => togglePass(t.key)}
          >{open ? historyWords.hideSteps : historyWords.showSteps(pass.steps.length)}</button
        >
      </div>
      {#if open}
        <ul class="ledger steps" in:opens out:shuts>
          {#each pass.steps as s (s.key)}{@render entry(s)}{/each}
        </ul>
      {/if}
    {/if}
  </li>
{/snippet}

{#snippet sideTiles()}
  <div class="side">
    {#if lanes.length > 0 || byWho}
      <!-- THE AGENTS' LAST DAY AS LANES, AND THE MONTH BY WHO (AF12): the month's part is the record's figure, BrainDog's
           own work among it, its sentence saying its span. -->
      <Tile icon="session" title={historyWords.whoWorked} meta={lanes.length > 0 ? historyWords.lastDay : historyWords.lastMonth}>
        {#if lanes.length > 0}
          <Swimlanes {lanes} start={clock - LANE_SPAN_MS} end={clock} now={clock} subject={historyWords.lanesSubject} />
          <p class="reading">{lanesSaid(lanes)}</p>
        {/if}
        {#if byWho}
          <Stacked parts={byWho} subject={historyWords.whoSubject} />
          <p class="reading">{whoSaid(byWho)}</p>
        {/if}
      </Tile>
    {/if}

    {#if matched.length > 0}
      <Tile icon="history" title={historyWords.whatChanged} count={matched.length} meta={tallyMeta}>
        <Bars items={topKinds} subject={historyWords.kindsSubject} />
        <p class="reading">{tallyReading}</p>
      </Tile>
    {/if}

    <!-- A WEEK OF HOURS NEEDS A WEEK TO SHOW: with fewer than ten lines, or lines on one day only, the grid is one lit row and says nothing. -->
    {#if busy.total >= 10 && busy.values.filter((r) => r.some((v) => v > 0)).length >= 2}
      <Tile icon="clock" title={historyWords.busyHours} meta={historyWords.lastWeek}>
        <HeatGrid rows={busy.rows} cols={HOURS} values={busy.values} subject={historyWords.heatSubject} />
        <p class="reading">{busySaid(busy.values)}</p>
      </Tile>
    {/if}
  </div>
{/snippet}

<PageHead
  icon="history"
  title={copy.audit}
  count={matched.length}
  total={kept.length}
  sentence={lead}
  actions={actors.length > 1 || kinds.length > 1 || days.length > 1 || list || offerAll ? (phone ? filterOpen : tools) : undefined}
/>

<div class="page">
  <!--
    THE SAME FIVE STATES EVERY OTHER LIST DRAWS. `19 §6` for `no-results` says quote the query verbatim, and a log with
    nothing in it, which is every record for about a minute, is `no-data-yet` and not the same sentence as a filter that
    missed.
  -->
  {#if refused}
    <Empty kind="error" title={refused}>
      {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if waiting}
    <!-- Bars while the live log is on its way, rather than a blank page under the title. -->
    <Waiting />
  {/if}

  <!-- NOT DRAWN UNDER THE BARS (leftovers8): the board stood empty below them, 24px tall, and rose 260px up a phone's
       screen when they went (0.24 on a cold open). It comes in their place once the log is read. -->
  {#if !waiting}<div class="board">
    {#if tiles && !phone}
      <!-- THE TILES FIRST IN THE DOCUMENT, so a screen reader meets what the stream means before the stream; at 1440
           they stand in a column to its right. On a phone they come after the first day of the stream (money F11), so
           the screen opens on what changed and not on a chart of it. -->
      {@render sideTiles()}
    {/if}

    <div class="feed">
      {#if !refused && LOG.length > 0 && kept.length === 0 && (!route.data.live || live)}
        <!-- NOTHING BUT BOOKKEEPING IN WHAT WAS READ: the record has been keeping its books and nobody changed anything. -->
        <Empty kind="cleared" title={historyWords.onlyBooks} body={historyWords.hidden(bookkept)}>
          {#snippet actions()}<Button onclick={() => setParam('everything', '1')}>{historyWords.showThem(bookkept)}</Button>{/snippet}
        </Empty>
      {:else if !refused && matched.length === 0 && (!route.data.live || live)}
        <Empty
          kind={LOG.length === 0 ? 'no-data-yet' : 'no-results'}
          title={LOG.length === 0 ? copy.auditNone : copy.noneMatching(kept.length, 'entries')}
          query={LOG.length === 0
            ? undefined
            : [who ? actorSaid(who, me, names, runs.get(who) ?? null).name : '', isEventKind(what) ? kindOf(what).word : what].filter(Boolean).join(' · ')}
          body={LOG.length === 0 ? copy.auditHolds : undefined}
        >
          {#snippet actions()}
            {#if who || what || when || list}<Button href={everything ? '/audit?everything=1' : '/audit'}>{copy.clearFilters}</Button>{/if}
          {/snippet}
        </Empty>
      {/if}

      {#each bands as day, d (day.key)}
        {#if d === 1 && tiles && phone}{@render sideTiles()}{/if}
        <Tile class="section" data-surface="tile" title={day.title} count={day.count || undefined}>
          <div class="section-body">
            {#each day.hours as band (band.key)}
              <!-- THE HOUR IS A SUBHEAD INSIDE ITS DAY, in the meta step and tabular, so the times line up down the tile; with
                   room, it is the stream's first column, beside the hour's first line, and each line's minute beside it. -->
              <div class="hour-band">
              <h3 class="hour num">{band.title}</h3>
              <ul class="ledger">
                <!-- A MINUTE'S LINES UNDER ONE TIME (G28): the minute is said on its first line, not on every line of it. -->
                {#each band.lines as t, i (t.key)}{@render entry(t, i > 0 && clockOf(band.lines[i - 1]!.e.at) === clockOf(t.e.at))}{/each}
              </ul>
              </div>
            {/each}
          </div>
        </Tile>
      {/each}
      {#if bands.length === 1 && tiles && phone}{@render sideTiles()}{/if}

      <!-- WHAT THE STREAM LEAVES OUT, said once at its foot, and the press that shows it: the same switch as the toolbar's. -->
      {#if moreRead || moreOlder}
        <div class="older">
          <Button weight="quiet" onclick={showMore} disabled={older}>{historyWords.showMore}</Button>
        </div>
      {:else}
        <CapLine shown={told.length} total={lines.length} />
      {/if}

      <!-- WHAT THE STREAM LEAVES OUT, said once at its foot: the toolbar's Everything shows it, so it is no second press. -->
      {#if hiddenNow > 0 && matched.length > 0}
        <p class="foot hidden-line">{historyWords.hidden(hiddenNow)} {historyWords.hiddenWhere}</p>
      {/if}
      {#if olderFix}<p class="foot">{olderFix}</p>{/if}
    </div>
  </div>{/if}
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
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* ONE COLUMN UNTIL THERE IS ROOM FOR TWO: the tiles over the stream, side by side where they fit. */
  .board {
    display: grid;
    grid-template-areas: 'side' 'feed';
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--tile-gap);
  }

  .side {
    grid-area: side;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* THE STREAM IS A SIZE CONTAINER, so what is drawn in it answers the column and not the page. It used to be one
     through the feed block's rule in the shared sheet, which names the same class and now loads only with declared pages. */
  .feed {
    grid-area: feed;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
    container-type: inline-size;
  }

  /* AT 1440 THE TILES ARE A 320 COLUMN AT THE STREAM'S RIGHT, a tile's gap apart like any two tiles. */
  @container (width >= 860px) {
    .board {
      grid-template-areas: 'feed side';
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: var(--tile-gap);
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

  /* THE ONE LINE UNDER EACH CHART that says what it means, at body size in ink, at the tile's foot. */
  .reading {
    margin: 0;
    margin-block-start: auto;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .foot {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* A TILE'S FOOT SITS UNDER ITS READING, a step closer than the tile's own gap. */
  .reading + .foot {
    margin-block-start: calc(var(--sp-2) - var(--sp-4));
  }

  .older {
    display: flex;
  }

  /* ── a run folded, and what the stream leaves out ────────────────────── */

  /* "+9 MORE" SITS WHERE THE LINES IT HOLDS WILL BE, in from the well so it reads as the line above it continued, in the
     second ink. Pressing it puts them there; nothing above it moves. */
  .fold-row {
    display: flex;
    padding-inline-start: calc(var(--well-l) + var(--sp-3) + var(--sp-2));
  }

  /* WHAT ONE PASS OF THE UPDATE DID, opened under its line and set in by the well, so it reads as that line's and not
     as lines of their own beside it. NO BLEED of its own: `.ledger` reaches a step past its column on both sides, which
     inside a line already reaching out drew the steps' minutes a step right of every other and, on a phone, took back
     the whole indent. */
  .steps {
    margin-inline: 0;
    padding-inline-start: calc(var(--well-l) + var(--sp-3));
  }

  @media (width < 640px) {
    .steps {
      padding-inline-start: var(--sp-4);
    }
  }

  .fold {
    position: relative;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .fold:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .hidden-line {
    max-inline-size: var(--measure);
    line-height: var(--lh-body);
  }

  /* SAID AS A LINK IN THE SENTENCE, because it is part of it; a button, because it changes the view and goes nowhere. */

  /* ── the toolbar ─────────────────────────────────────────────────────── */

  /* THE PHONE'S "Filter", a thumb's 44 tall, and in its sheet the controls start at the edge rather than the end. */
  :global(.btn[data-filter-open]) {
    min-block-size: var(--tap);
  }

  .sheet-tools .tools {
    justify-content: flex-start;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE TRACK HOLDS ITS SEGMENTS IN ONE ROW and wraps only when the bar cannot hold it. A menu's trigger is a button
     round its segment, so it sits in the track as the segment it draws; the focus ring follows the segment's corner.
     The track is `Segmented`'s own element, so its rules reach it by this screen's name for it, under the toolbar. */
  .tools :global(.filters) {
    align-items: center;
  }

  .tools :global(.filters .menu-root) {
    display: inline-flex;
  }

  .tools :global(.filters .menu-trigger) {
    border-radius: calc(var(--r-ctl) - 2px);
  }

  .seg-menu {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    box-sizing: border-box;
    max-inline-size: 22ch;
  }

  /* A CHOSEN MENU SEGMENT IS FLAT, as the part's selection is: it sits inside its trigger and not on the track, so
     `controls.css` would give it the hairline and shadow of a track written by hand. */
  .seg-menu[data-on] {
    box-shadow: none;
  }

  .seg-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE DAY IS THE NATIVE SELECT, drawn as a segment: no fill of its own on the track until it narrows the stream, and
     the house chevron `controls.css` gives every select kept. */
  .seg-select {
    background-color: transparent;
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    padding-inline-end: var(--sp-6);
  }

  .seg-select[data-on] {
    background-color: var(--tile);
  }

  /* A MENU ROW: an icon, the word, and how many lines of that kind were read, the chosen one ticked. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: pointer;
  }

  .mi[aria-current='true'] {
    color: var(--ink);
    font-weight: 500;
  }

  .mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .mi:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }


  .mi-name {
    flex: 1;
    min-inline-size: 0;
  }

  .mi-n {
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* A LIST ROW'S HEIGHT, 44 (G28): the log's rows were 53 tall, two lines in the 56 of a tall row with its padding. */
  .act.line-tall {
    min-block-size: var(--tap);
    padding-block: var(--sp-1);
  }

  /* THE FEED'S ROWS ARE OPS CARD ROWS (4.15): no hairline between two lines, and the row wash, rounded, is the only
     thing a pointer adds. The lines sit 2px apart so two washes never touch. */
  .act {
    border-radius: 10px;
    margin-block: 1px;
  }

  .ledger > li + li > .act::after {
    display: none;
  }

  /* THE SAME MINUTE AS THE LINE ABOVE IS NOT SAID AGAIN (G28). */
  .act .line-when[data-same] time {
    visibility: hidden;
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
    color: var(--ink-2);
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
    /* ITS OWN TARGET, `> .line`: a step opened under a pass is a line of its own, and hovering it washes it alone. */
    .ledger > li:has(> .line .target:hover) > .line {
      background: var(--row-wash, var(--hover));
    }

    .ledger > li:has(> .line .target:hover) > .line::after,
    .ledger > li:has(> .line .target:hover) + li > .line::after {
      opacity: 0;
    }
  }

  .line-detail {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
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

  /* WHERE IT HAPPENED, right after who and what in the line's own quiet words: the list a row is in. A pill on every
     line of a long feed was chrome repeated thirty times. */
  .where-chip {
    color: var(--ink-3);
  }

  /* A TIME IN A FEED IS GEIST AT 13 WITH TABULAR FIGURES, in the quiet ink: the figures line up down the tile without a
     typewriter face beside the words. */
  .line-when time {
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-variant-numeric: tabular-nums;
  }

  /* AN HOUR'S SUBHEAD: the meta step at 500 in the quiet ink, a step above its first line and a breath more above any
     hour after the first, so the day reads as one tile with places in it. */
  .hour {
    margin: var(--sp-2) 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
    font-variant-numeric: tabular-nums;
  }

  .hour-band + .hour-band .hour {
    margin-block-start: var(--sp-4);
  }

  /**
   * WITH ROOM, THE STREAM READS AS THE DESIGN BOARD DRAWS IT: the hour in ink in a column of its own beside the first
   * line it holds, then each line's minute in the quiet ink, the kind's well, what was done and by whom, and the list
   * at the end. The hours run on as one list, a hairline between every two lines.
   */
  @container (width >= 640px) {
    /* ONE TIME COLUMN: every line says its own time, so the hour's subhead is not said again beside it. */
    .hour {
      display: none;
    }

    .hour-band + .hour-band {
      margin-block-start: var(--sp-1);
    }

    .act {
      grid-template-columns: 6ch var(--well-l) minmax(0, 1fr);
    }

    .act > :global(:first-child) {
      grid-column: 2;
      grid-row: 1;
    }

    .act .line-main {
      grid-column: 3;
    }

    .act .line-when {
      grid-column: 1;
    }

    .line-when time {
      color: var(--ink-3);
      font-family: var(--font-mono);
    }

    /* "SHOW ALL 7" STARTS ON THE WORDS' EDGE (skills pass 2 Nov): its indent counted the well and not the time column
       before it, so at a desk it stood in the minutes' column, half under the hour. The row's own font, so its `6ch` is
       the lines' `6ch`; the button's own padding is taken back, so its words and the lines' start on one x. */
    .fold-row {
      font-size: var(--fs-body);
      padding-inline-start: calc(6ch + var(--well-l) + 2 * var(--sp-3) - var(--sp-2));
    }
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

    .line-detail {
      align-items: start;
    }

    .detail-text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      white-space: normal;
    }
  }
</style>
