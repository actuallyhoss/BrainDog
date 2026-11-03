<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).

  AND IT IS A QUEUE, CLEARED FROM THE KEYBOARD. `j` and `k` move a cursor,
  Enter opens the one under it, `e` files it in the chosen list, Delete archives it, `x` selects it so
  several are filed or archived at once, and Esc clears the selection. A row leads with its subject,
  then who sent it and the first words of what they said, then when (rule 7).

  ARRIVALS SIT ON THE GROUND, GROUPED BY THE DAY THEY CAME: Today, Yesterday, then
  each day by name, newest first, with no box round them. The cursor walks the rows in the order they are drawn, so
  `j` never jumps between days. A row leads with a round check that selects it, and its verbs show on the cursor row
  with the keys that do the same.

  WHAT IS ALIKE IS LEARNED ONCE. Arrivals that share the kernel's own shape (`shapes.ts`) are gathered above the days,
  one row a sender: at three or more alike the row offers to ask Slash for a pattern, which files a `pattern` proposal
  on Decide, and any group can be made into a rule by hand. The proposals already waiting on Decide lead the screen,
  since one accepted pattern files every arrival like its samples from then on. Arrives, learned once, filed.

  AND WHAT LEFT IT IS STILL HERE. Waiting, Filed and Archived are one series of the same arrivals, chosen in the
  toolbar. The record's tally is the title row's sentence and the figure tile, what your rules filed this week.

  AN INBOX NOTHING HAS EVER REACHED IS ONE TILE (`nothingEver`): what it is for and the press that adds a way in, in
  place of the two tiles and the empty state under them, which said the one fact three times over. The series switch
  goes with them, since all three series are empty.

  OTHERWISE TWO TILES OPEN THE BOARD, in every series: "What comes in", each way in as a 56px row with its well, its last arrival
  and a fortnight's arrivals as a line, and the figure beside it. So an inbox with nothing waiting still says how things
  reach it and whether the rules are working, rather than one sentence on a bare board. Every filing and
  archiving, a person's or an agent's, names who did it and can be put back, through `triage`'s `back`.

  UNDER THEM, WHAT EACH PATTERN DID (`patterns.ts`): the record's report of the fortnight, per pattern what it filed and
  what it held and why, and the messages it held as repeats, each with "It is a second one", which files it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { titleOf } from '$lib/title.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';
  import type { InboxItem } from '$lib/record/schema.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import Sparkline from '$lib/viz/Sparkline.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { ALIKE, SAMPLES_MOST, groupsOf, type Group } from './shapes.ts';
  import { builderPath } from '$lib/pattern/draft.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { recordNow } from '$lib/record/boot-live.ts';
  import Face from '$lib/ui/Face.svelte';
  import { actor, listName } from '$lib/record/names.ts';
  import type { Pattern, Series, SettledItem, Tally } from './series.ts';
  import { daysOf, figureOf, sentenceOf, whoFiledOf } from './days.ts';
  import { SOURCE_DAYS, UNSIGNED_HELP, countSaid, drawsLine, lastSaid, lineSaid, nothingEver, quietOf, sourcesOf } from './sources.ts';
  import { addressCommand } from '$lib/record/inbound-write.ts';
  import { bareOrigin } from '../settings/[area]/settings-state.svelte.ts';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import { panelOf, type PatternReport } from './patterns.ts';
  import type { Review } from './review.ts';

  /**
   * THIS UNIT'S OWN WORDS, beside the one screen that says them. The press's cost is not named: the door meters it, and a
   * sentence here that named the allowance would be wrong the day the door moves it.
   */
  const words = {
    /** A refused read, in a person's words: the record's own sentence waits behind Read details. */
    refusedTitle: 'The messages could not be listed',
    refusedBody: 'Nothing was changed. This sign-in may not be allowed to read the messages, so open the inbox in the app to see them.',
    refusedBelow: ' What the rules did is below.',
    /** The press that asks for a rule drafted from a sender's alike messages (today F14): no internal name in it. */
    askPattern: 'Suggest a rule',
    asking: 'Drafting a rule',
    /** And making the rule by hand from them, the quiet second. */
    makeOne: 'Make one myself',
    /** The head's "⋯" on a phone, where Select waits. */
    more: 'More on Inbox',
    unfiled: 'Slash drafted nothing to decide from these.',
    unreached: 'BrainDog could not reach Slash. Nothing was drafted.',
    series: 'Show',
    whoFiled: 'Who filed it',
    comesIn: 'What comes in',
    setUp: 'Add a way in',
    rulesWeek: 'Your rules',
    seeRules: 'Automations',
    partial: 'Newest arrivals only',
    /* THE FIX FOR MAIL A FORWARDER UNSIGNED, in the docs (sec-follow M2). */
    unsignedFix: 'How to keep forwarded mail signed',
    /* THE PICKER WITH NO LIST CHOSEN, and the press that asks for one (AF2). */
    chooseList: 'Choose a list',
    chooseFirst: 'Choose a list to file it in first.',
    learn: 'Could file themselves',
    learnWhy: 'Messages alike from one sender are learned once, as a rule, and the rest are filed as they arrive.',
    alikeFrom: (n: number, from: string) => `${n} alike from ${from}`,
    newest: (subject: string, when: string) => `Newest: ${subject} · ${when}`,
    patternWhy: 'Drafted by Slash, waiting in Needs you',
    file: 'File',
    archive: 'Archive',
    fileNamed: (subject: string) => `File “${subject}”`,
    archiveNamed: (subject: string) => `Archive “${subject}”`,
    waiting: 'Waiting',
    filed: 'Filed',
    archived: 'Archived',
    patterns: 'Patterns to decide',
    putBack: 'Put back',
    putBackDone: 'Put back in the inbox.',
    filedIn: 'Filed in',
    by: (who: string) => `by ${who}`,
    filedBy: (who: string) => `Filed by ${who}`,
    byRule: 'Filed by a rule',
    archivedBy: (who: string) => `Archived by ${who}`,
    archivedPlain: 'Archived',
    noneFiled: 'Nothing has been filed yet',
    noneFiledWhy: 'What you or an agent files from the inbox, and what a rule files as it arrives, is listed here.',
    noneArchived: 'Nothing has been archived',
    noneArchivedWhy: 'What you or an agent archives from the inbox is kept here, and can be put back.',
    patternsDid: 'What each pattern did',
    heldMark: 'Held',
    needsMark: 'Needs you',
    repeats: 'Held as repeats',
    repeatsWhy: 'A message that looks like one already filed is held. If it is a real second payment, file it.',
    second: 'It is a second one',
    secondNamed: (subject: string) => `File “${subject}” as a second one`,
    secondFiled: 'Filed as a second one.',
    secondWaits: 'Taken as a second one. It waits for you in the inbox.',
    toReview: 'To review',
    toReviewWhy: 'BrainDog read these and was not sure enough to file them. Nothing is written until you say.',
    fileIn: (list: string) => `File in ${list}`,
    somethingElse: 'Something else',
    ignore: 'Ignore',
    reviewFiled: 'Filed.',
    reviewIgnored: 'Ignored.',
    reviewElse: 'Pick where it goes below.',
  };

  /**
   * THE INBOX IS THE RECORD'S, its newest page, and nothing of the sample is mixed into it. Until the
   * page arrives the screen draws no rows and no empty state, and a refusal is the record's own
   * sentence: a read that found no record drew the sample's arrivals here until the sample left, and
   * says so in the record's words now.
   *
   * `unrouted` IS A HOST OLDER THAN THIS READ: there is a record, and no list to draw from it.
   */
  let live = $state<{ items: InboxItem[]; cursor: number | null } | null>(null);
  /* THE DOUBTFUL ARRIVALS WITH A SUGGESTED FILING (To review), and the arrivals they hold, which the plain list leaves out. */
  let reviews = $state.raw<readonly Review[]>([]);
  const heldHere = $derived(new Set(reviews.flatMap((r) => r.raws)));
  let reviewing = $state<string | null>(null);
  async function rereadReviews() {
    const m = await import('./review.ts');
    reviews = await m.readToReview(apiBase());
  }
  /** The suggestion answered; a record that wants a sentence with a No or a Yes is given the plain one. */
  async function answerReview(r: Review, option: 'accept' | 'reject', reason: string) {
    const m = await import('$lib/record/decide-write.ts');
    const first = await m.answerQuestion(apiBase(), r.id, option);
    return first.from === 'refused' && first.wants === 'reason' ? m.answerQuestion(apiBase(), r.id, option, reason) : first;
  }
  /** The main button files it as suggested; Something else sets the suggestion aside and opens the arrival; Ignore archives it. */
  async function settleReview(r: Review, how: 'file' | 'else' | 'ignore') {
    if (reviewing !== null) return;
    reviewing = r.id;
    try {
      const out = await answerReview(r, how === 'file' ? 'accept' : 'reject', how === 'file' ? 'Filed from To review.' : 'Not what it is.');
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      if (how === 'ignore') {
        const w = await import('$lib/record/inbox-write.ts');
        for (const raw of r.raws) await w.archiveArrival(apiBase(), raw);
      }
      reviews = reviews.filter((x) => x.id !== r.id);
      if (how === 'else') open = r.raws[0] ?? null;
      toasts.push(how === 'file' ? words.reviewFiled : how === 'ignore' ? words.reviewIgnored : words.reviewElse);
      await rereadWaiting();
      void retally();
      void invalidateAll();
    } finally {
      reviewing = null;
    }
  }
  let refused = $state<string | null>(null);
  let unrouted = $state(false);
  const INBOX = $derived(live?.items ?? []);
  /* THE SHAPE OF EVERY ARRIVAL READ, by id, replaced whole so that the groups follow it. */
  let shapes = $state.raw<ReadonlyMap<string, string>>(new Map());
  const groups = $derived(groupsOf(INBOX.slice(0, DOM_CAP), shapes));
  /* THE ROWS BY DAY, and the alike groups that could be learned once. `shown` is the rows in the order the days draw
     them, which is the order the cursor walks and the next row opens in. */
  const days = $derived(daysOf(INBOX.filter((i) => !heldHere.has(i.id)).slice(0, DOM_CAP), recordNow()));
  const alike = $derived(groups.filter((g) => g.items.length > 1));
  const shown = $derived(days.flatMap((d) => d.items));
  const place = $derived(new Map(shown.map((item, i) => [item.id, i])));
  /* ON THE RECORD'S CLOCK, so "7w ago" is never the browser's date against a record's morning. */
  const clock = $derived(recordNow());
  /* THE WINDOW'S WIDTH: under 640 the head is a phone's (today F14), its switch under the sentence and Select in a "⋯". */
  let viewWidth = $state(1024);
  const phone = $derived(viewWidth < 640);
  const answered = $derived(live !== null);

  let open = $state<string | null>(null);
  /* AN ARRIVAL'S VERBS AT THE POINTER: a right-click or a held thumb on it, or `⇧F10` (`ownMenu`). */
  let menuItem = $state<InboxItem | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);

  /**
   * WHAT EACH WAITING ARRIVAL IS, the record's line under its title ("Payment, EGP 420, Quietcart", "From Mara Okafor").
   * Asked once the rows are drawn, in one call for the newest not yet asked, and never waited on: a row draws its title
   * at once and the line joins it. A host that does not answer draws no line, and is not asked again.
   */
  let hintLines = $state.raw<ReadonlyMap<string, string>>(new Map());
  const hintsAsked = new Set<string>();
  let hintsOff = false;
  function askHints(items: readonly InboxItem[]) {
    if (hintsOff) return;
    const ids = items.map((i) => i.id).filter((id) => !hintsAsked.has(id)).slice(0, 50 /* `HINTS_MOST` */);
    if (ids.length === 0) return;
    for (const id of ids) hintsAsked.add(id);
    void import('./hints.ts')
      .then((m) => m.linesFor(apiBase(), ids))
      .then((read) => {
        if (read === null) hintsOff = true;
        else if (read.size > 0) hintLines = new Map([...hintLines, ...read]);
      })
      .catch(() => (hintsOff = true));
  }

  $effect(() => {
    /* UNTRACKED, ALL OF IT. The effect read `route.data.live`, so the `invalidateAll` after every filing re-ran the
       read and put the open row and the cursor back on the first arrival. And it reads the pending count it writes.
       It reads no `route.data.live` at all now: a shell that was not live was the sample's, and asking regardless is
       how any shell's Inbox ends in the record's answer or its sentence rather than in bars that never stop. */
    const at = untrack(opened);
    let ok = false;
    void import('./shapes.ts')
      .then((m) => m.readShaped(apiBase()))
      .then(({ read: out, shapes: read }) => {
        if (out.from === 'live') {
          shapes = read;
          live = { items: out.items, cursor: out.cursor };
          open = out.items[0]?.id ?? null;
          ok = true;
          askHints(out.items);
          void rereadReviews();
        } else if (out.from === 'unrouted') {
          unrouted = true;
          ok = true;
        } else refused = out.fix;
      })
      .finally(() => closed(ok, at));
    /* THE TALLY AND THE PATTERNS ARE READ BESIDE THE ARRIVALS AND OUTSIDE THEIR BRACKET: the arrivals are the screen, and
       a record that answers neither of these still draws them. */
    void retally();
    void import('./series.ts')
      .then((m) => m.readPatterns(apiBase()))
      .then((read) => (patterns = read));
    void import('./series.ts')
      .then((m) => m.readArrivals(apiBase(), Date.now(), SOURCE_DAYS))
      .then((read) => (arrivals = read));
    void rereadPatterns();
  });

  /* WHAT COMES IN, BY THE WAY IT CAME, from every arrival of the fortnight whatever became of it. `null` until read, and
     a read that failed draws no tile rather than three quiet rows that would be a guess. */
  let arrivals = $state.raw<{ lines: { channel: string; ts: string; reason?: string | null }[]; partial: boolean } | null>(null);
  const ways = $derived(arrivals ? sourcesOf(arrivals.lines, clock) : null);

  /**
   * WHAT EACH PATTERN DID, the record's report of the fortnight drawn as one tile under "What comes in", and the messages
   * it held as repeats, each with the press that files it as a second one. A report the record does not answer
   * draws no tile, and a press answers in place: the line says it was filed, or says the record's own sentence.
   */
  let report = $state.raw<PatternReport | null>(null);
  const panel = $derived(panelOf(report));
  let repeats = $state<(InboxItem & { reason: string })[]>([]);
  let seconding = $state<string | null>(null);
  let seconded = $state<Record<string, { text: string; refused: boolean }>>({});

  async function rereadPatterns() {
    const m = await import('./patterns.ts');
    /* THE REPORT IS AN OWNER'S READ (`inboxPatterns`), so a colleague's Inbox never asks for it and draws no tile (collab
       pass 3: a 403 on every open of it at Can decide, Can edit and Can view). */
    const owner = (page.data as { me?: { owner?: unknown } }).me?.owner === true;
    const [read, held] = await Promise.all([owner ? m.readReport(apiBase()) : Promise.resolve(null), m.readRepeats(apiBase())]);
    report = read;
    /* A REPEAT ALREADY ANSWERED STAYS, saying what became of it, until the screen is opened again. */
    const kept = repeats.filter((r) => seconded[r.id] !== undefined && !held.some((h) => h.id === r.id));
    repeats = [...held, ...kept].sort((a, b) => b.arrived.localeCompare(a.arrived));
  }

  async function second(item: InboxItem) {
    if (seconding !== null) return;
    seconding = item.id;
    try {
      const m = await import('$lib/record/inbox-write.ts');
      const out = await m.fileAsSecond(apiBase(), item.id);
      if (out.from === 'written') {
        seconded = { ...seconded, [item.id]: { text: out.state === 'matched' ? words.secondFiled : words.secondWaits, refused: false } };
        void retally();
        void rereadPatterns();
        if (out.state !== 'matched') void rereadWaiting();
      } else {
        seconded = { ...seconded, [item.id]: { text: out.fix, refused: true } };
      }
    } finally {
      seconding = null;
    }
  }

  /**
   * THE SERIES AND THE TALLY. What waits is the screen's first series; filed and archived are the record's `matched` and
   * `ignored`, read when chosen, so an Inbox opened to clear it pays for nothing more than what waits.
   */
  type View = 'waiting' | Series;
  let view = $state<View>('waiting');
  let tally = $state<Tally | null>(null);
  /* THE SENTENCE AND THE TILE, from the record's tally and nothing counted here. The oldest arrival drawn decides the
     red: what has waited more than two days needs him. */
  const sentence = $derived(sentenceOf(tally, INBOX.at(-1)?.arrived ?? null, clock));
  const whoFiled = $derived(whoFiledOf(tally));
  const figure = $derived(figureOf(tally));
  let patterns = $state<Pattern[]>([]);
  /* NOTHING HAS EVER COME IN, by the record's own tally, so the board is the one tile that says so. A pattern waiting
     on Decide is something to show, so it keeps the board. */
  const never = $derived(patterns.length === 0 && nothingEver(tally, ways, INBOX.length));
  /* THE ONE STEP TO AN ADDRESS, by the host: a self-host's is printed by one command on its machine. */
  const quiet = $derived(
    quietOf(
      route.data.host === 'cloud' || route.data.host === 'self-host' ? route.data.host : undefined,
      typeof route.data.index?.slug === 'string' && typeof location !== 'undefined' ? addressCommand(bareOrigin(), route.data.index.slug) : null,
    ),
  );
  let series = $state<{ state: Series; items: SettledItem[]; cursor: number | null } | null>(null);
  let seriesFix = $state<string | null>(null);
  let seriesOlder = $state(false);
  const me = $derived(String(route.data.me?.person ?? ''));
  /* THE THREE SEGMENTS, each with the record's count for it once the tally is in. */
  const segments = $derived<readonly { v: View; label: string; n: number | undefined }[]>([
    { v: 'waiting', label: words.waiting, n: tally?.waiting },
    { v: 'matched', label: words.filed, n: tally?.filed },
    { v: 'ignored', label: words.archived, n: tally?.archived },
  ]);

  /* WHETHER THE TALLY HAS ANSWERED, with a count or without one. An empty inbox waits on it before it draws, since the
     tally is what tells one nothing ever reached from one that was cleared, and drawing the second first would be a
     board that redraws itself a moment later. */
  let tallied = $state(false);
  async function retally() {
    try {
      const m = await import('./series.ts');
      const read = await m.readTally(apiBase());
      if (read) tally = read;
    } finally {
      tallied = true;
    }
  }

  async function show(next: View) {
    if (next === view) return;
    view = next;
    series = null;
    seriesFix = null;
    if (next === 'waiting') return;
    try {
      const m = await import('./series.ts');
      const out = await m.readSeries(apiBase(), next);
      /* A SERIES CHOSEN WHILE THIS ONE WAS READ is the one drawn, and this answer is dropped. */
      if (view !== next) return;
      if (out.from === 'live') {
        series = { state: next, items: out.items, cursor: out.cursor };
        if (out.tally) tally = out.tally;
      } else if (out.from === 'refused') seriesFix = out.fix;
      else series = { state: next, items: [], cursor: null };
    } catch {
      if (view === next) seriesFix = copy.recordNotReached;
    }
  }

  async function loadOlderSeries() {
    const had = series;
    if (!had || had.cursor === null || seriesOlder) return;
    seriesOlder = true;
    try {
      const m = await import('./series.ts');
      const out = await m.readSeries(apiBase(), had.state, had.cursor);
      if (out.from === 'live' && series?.state === had.state) series = { ...had, items: [...had.items, ...out.items], cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      seriesOlder = false;
    }
  }

  /** A list as a person says it: the name the shell holds for it, or its id in words. */
  const listOf = (id: string): string => lists.find((l) => l.id === id)?.name ?? listName(id);

  /**
   * PUT BACK, through `triage`'s `back` and the kernel's `returnArrival`. A filing names the version of the row it made,
   * so a row somebody edited since is the record's conflict and nothing moves; an archiving has no row.
   *
   * ONE AT A TIME, as every write here is: a second press while the first is out would be a second return.
   */
  let backing = $state<string | null>(null);
  async function putBack(id: string, version: number | null) {
    if (backing !== null) return;
    backing = id;
    try {
      const m = await import('$lib/record/inbox-write.ts');
      const out = await m.putBack(apiBase(), id, version);
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      toasts.push(words.putBackDone);
      if (series) series = { ...series, items: series.items.filter((i) => i.id !== id) };
      await rereadWaiting();
      void retally();
      void invalidateAll();
    } finally {
      backing = null;
    }
  }

  /** What waits, read again from its first page, so an arrival put back is drawn where it arrived. */
  async function rereadWaiting() {
    const m = await import('./shapes.ts');
    const { read: out, shapes: read } = await m.readShaped(apiBase());
    if (out.from !== 'live') return;
    shapes = read;
    live = { items: out.items, cursor: out.cursor };
    if (open !== null && !out.items.some((i) => i.id === open)) open = null;
    askHints(out.items);
  }

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. What arrives is added under what is drawn, and a refusal here is
   * said under the list, with the arrivals already drawn left where they are.
   */
  let older = $state(false);
  let olderFix = $state<string | null>(null);
  async function loadOlder() {
    const had = live;
    if (!had || had.cursor === null || older) return;
    older = true;
    olderFix = null;
    try {
      const m = await import('./shapes.ts');
      const { read: out, shapes: read } = await m.readShaped(apiBase(), had.cursor);
      if (out.from === 'live') {
        shapes = new Map([...shapes, ...read]);
        live = { items: [...had.items, ...out.items], cursor: out.cursor };
        askHints(out.items);
      } else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * THE LIST A FILED EMAIL GOES INTO, and the one chosen last time.
   *
   * It opened on the first list in the record, which on a live record is Agent runs,
   * so the likeliest press filed an invoice as an agent's run. The choice is remembered on this
   * device, as a convenience and nothing more: a browser that forgets it opens on the first list again.
   */
  const INTO = 'braindog.inbox.into';
  /* AN AGENT'S OWN LISTS ARE NOT WHERE AN EMAIL GOES (AF2): Agent runs, Instructions, Learnings, Skills, Keys and Tools
     were offered among the money lists, and with no list chosen the red button said "File it in Instructions". They are
     left out of the picker: the lists the kernel keeps for itself, the Agents module's, and the keychain's. */
  const AGENTS = new Set(['session', 'instructions', 'credentials', ...(moduleOf('agents')?.registers ?? [])]);
  const lists = $derived<readonly { id: string; name: string }[]>(
    ((route.data.lists ?? route.data.index?.registers ?? []) as readonly { id: string; name: string; kernel?: boolean }[]).filter((l) => !AGENTS.has(l.id) && l.kernel !== true),
  );
  let into = $state(untrack(() => {
    try {
      return localStorage.getItem(INTO) ?? '';
    } catch {
      return '';
    }
  }));
  /* NO GUESS IN RED (AF2): with no list chosen on this device the picker opens on none and asks, and filing waits for a
     choice. The first list was a guess, and the likeliest press filed a bank alert wherever the guess fell. */
  const target = $derived(lists.some((l) => l.id === into) ? into : '');
  /** Open the picker the press was nearest, when filing is asked for before a list is chosen. */
  async function askWhere() {
    toasts.push(words.chooseFirst, { intent: 'warn' });
    await tick();
    /* THE ONE IN VIEW: the open row's on a phone, the selection's bar, else the toolbar's. */
    const select = [...document.querySelectorAll<HTMLSelectElement>('.body .file-select, .batch .file-select, .file-into[data-where="bar"] .file-select')].find((el) => el.getClientRects().length > 0);
    select?.focus();
    try {
      select?.showPicker?.();
    } catch {
      /* A browser that will not open it from here leaves it focused. */
    }
  }
  function choose(id: string) {
    into = id;
    try {
      localStorage.setItem(INTO, id);
    } catch {
      /* A browser that stores nothing opens on the first list next time. */
    }
  }

  /**
   * ON A LIVE RECORD THE TWO GESTURES WRITE. Filing puts the arrival in the chosen list, titled by its
   * subject; archiving keeps its bytes. Either way it leaves the list here, the next one takes its
   * place under the cursor, and the next one opens if this one was open. A refusal is the record's own
   * sentence, and the arrival stays where it is.
   */
  let busy = $state(false);

  /** One arrival through the record: `true` when it left the inbox. */
  async function write(item: InboxItem, gesture: 'file' | 'archive'): Promise<{ ok: boolean; row?: string; version?: number }> {
    const m = await import('$lib/record/inbox-write.ts');
    const out =
      gesture === 'file' ? await m.fileArrival(apiBase(), item.id, target) : await m.archiveArrival(apiBase(), item.id);
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return { ok: false };
    }
    return { ok: true, ...(out.row ? { row: out.row } : {}), ...(out.version === undefined ? {} : { version: out.version }) };
  }

  /** Take arrivals off the list here, and keep the cursor and the open row on what comes next. */
  function leave(ids: ReadonlySet<string>) {
    const had = live;
    if (!had) return;
    const at = shown.findIndex((i) => ids.has(i.id));
    /* THE NEXT ONE IS THE NEXT DRAWN, which inside a group is the next alike and not the next to arrive. */
    const rest = shown.filter((i) => !ids.has(i.id));
    const items = had.items.filter((i) => !ids.has(i.id));
    live = { items, cursor: had.cursor };
    if (open !== null && ids.has(open)) open = rest[Math.max(0, at)]?.id ?? rest[at - 1]?.id ?? null;
    if (cursor >= items.length) cursor = items.length - 1;
  }

  async function settle(item: InboxItem, gesture: 'file' | 'archive') {
    if (busy) return;
    if (gesture === 'file' && target === '') return void (lists.length === 0 ? toasts.push(copy.inboxNoLists, { intent: 'warn' }) : askWhere());
    busy = true;
    const filedIn = listOf(target);
    try {
      const out = await write(item, gesture);
      if (!out.ok) return;
      leave(new Set([item.id]));
      /* EVERY FILING AND ARCHIVING CAN BE PUT BACK FROM ITS TOAST. A filing is put back at the version its row was made
         at, so a host too old to send one offers no Undo rather than one the record would refuse. */
      const version = gesture === 'archive' ? null : (out.version ?? undefined);
      /* BY THE LIST'S NAME, as the picker shows it, taken before the write so a change of list meanwhile says the right one. */
      const text = gesture === 'archive' ? copy.inboxArchived : copy.inboxFiled(filedIn);
      toasts.push(text, version === undefined ? {} : { undo: () => void putBack(item.id, version) });
      /* AND THE RAIL FOLLOWS, as it does after a decision: its Inbox count, and the list a first row just put on it. */
      void retally();
      void invalidateAll();
      await focusCursor();
    } finally {
      busy = false;
    }
  }

  /* ── the cursor ──────────────────────────────────────────────────────────── */
  let cursor = $state(-1);

  async function focusCursor() {
    await tick();
    const item = shown[cursor];
    if (!item) return;
    const el = document.getElementById(`arrival-${item.id}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  function move(to: number) {
    if (shown.length === 0) return;
    cursor = Math.max(0, Math.min(to, shown.length - 1));
    void focusCursor();
  }

  /* ── a selection ─────────────────────────────────────────────────────────── */
  let picked = $state(new Set<string>());
  /* SELECTING, ON A PHONE: nothing hovers there to reveal the checks, so `Select` shows them at a thumb's size, as
     Needs you does. At a desk the checks are always drawn and `x` picks the cursor's row. */
  let selecting = $state(false);
  const picking = $derived(picked.size > 0 || selecting);
  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    picked = next;
  }

  async function settlePicked(gesture: 'file' | 'archive') {
    const items = shown.filter((i) => picked.has(i.id));
    if (busy || items.length === 0) return;
    if (gesture === 'file' && target === '') return void (lists.length === 0 ? toasts.push(copy.inboxNoLists, { intent: 'warn' }) : askWhere());
    busy = true;
    const gone = new Set<string>();
    try {
      for (const item of items) if ((await write(item, gesture)).ok) gone.add(item.id);
    } finally {
      busy = false;
    }
    leave(gone);
    picked = new Set([...picked].filter((id) => !gone.has(id)));
    if (gone.size) {
      toasts.push(gesture === 'file' ? copy.inboxBatchFiled(gone.size) : copy.inboxBatchArchived(gone.size));
      void retally();
      void invalidateAll();
    }
  }

  /**
   * ASK SLASH FOR A PATTERN FROM ONE GROUP. The newest alike go as the samples, as many as the door takes, and the record
   * reads them itself: nothing a stranger wrote is sent from here. What comes back is a `pattern` proposal filed on
   * Decide, which is where this goes next; nothing is installed until it is accepted there.
   *
   * ONE PRESS AT A TIME, across every group: a second press while a draft is out would be a second model call for the
   * same question. The door meters the press and refuses it in its own sentence when the month is spent.
   */
  let asking = $state<string | null>(null);
  async function askPattern(group: Group) {
    if (asking !== null) return;
    asking = group.shape;
    try {
      const { createClient } = await import('@braindog/client');
      const out = await createClient({ base: apiBase() }).slashPattern(group.items.slice(0, SAMPLES_MOST).map((i) => i.id));
      if (!out.ok) return void toasts.push('refusal' in out ? out.refusal.fix : words.unreached, { intent: 'warn' });
      if (out.value.filed === null) return void toasts.push(words.unfiled, { intent: 'warn' });
      await goto(at(`/decide/${encodeURIComponent(out.value.filed)}`));
    } catch {
      toasts.push(words.unreached, { intent: 'warn' });
    } finally {
      asking = null;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    /* A KEY THE SHELL ALREADY TOOK, `g` then a letter, is not this page's too. */
    if (e.defaultPrevented || covered() || typing()) return;
    /* THE QUEUE'S KEYS ARE FOR WHAT WAITS. Filed and archived are read, and each is put back by its own button. */
    if (view !== 'waiting') return;
    if (e.metaKey || e.ctrlKey || e.altKey || shown.length === 0) return;
    if (e.key === 'Escape' && picked.size > 0) {
      e.preventDefault();
      picked = new Set();
      return;
    }
    const item = shown[cursor];
    if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
      e.preventDefault();
      void settle(item, 'archive');
      return;
    }
    if (silenced(e)) return;
    if (e.key === 'j') {
      e.preventDefault();
      move(cursor + 1);
    } else if (e.key === 'k') {
      e.preventDefault();
      move(cursor < 0 ? 0 : cursor - 1);
    } else if (e.key === 'e' && item) {
      e.preventDefault();
      void settle(item, 'file');
    } else if (e.key === 'x' && item) {
      e.preventDefault();
      toggle(item.id);
    }
  }

  /** The first words of what was said, for the row's detail line. */
  const firstWords = (body: string) => body.replace(/\s+/gu, ' ').trim();

  /**
   * THE READ ABOVE IS BRACKETED WITH `opened()` AND `closed()`, and a call still out takes the
   * attribute away whatever this line says, so the claim is only made once the answer is in.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(said('inbox'))}</title></svelte:head>
<svelte:window {onkeydown} bind:innerWidth={viewWidth} />

<ItemMenu label={menuItem?.subject ?? words.waiting} bind:at={point}>
  {#if menuItem}
    {@const item = menuItem}
    <button role="menuitem" type="button" disabled={busy} onclick={() => settle(item, 'file')}><Icon name="check" size="s" /><span class="mi-name">{words.file}</span></button>
    <button role="menuitemcheckbox" type="button" aria-checked={picked.has(item.id)} onclick={() => toggle(item.id)}><Icon name="check" size="s" /><span class="mi-name">{copy.select}</span></button>
    <hr />
    <button role="menuitem" type="button" disabled={busy} onclick={() => settle(item, 'archive')}><Icon name="archive" size="s" /><span class="mi-name">{words.archive}</span></button>
  {/if}
</ItemMenu>

{#snippet fileInto(where: 'bar' | 'row')}
  <!-- THE LIST A FILING GOES INTO, a pill in the toolbar, where it stays in view while the list scrolls. A phone's head
       scrolls away with the page, so there the open row and the selection's bar carry it too. -->
  {#if lists.length > 0}
    <label class="file-into" data-where={where}>
      <span class="file-label">{copy.inboxFileInto}</span>
      <select class="file-select" value={target} disabled={busy} onchange={(e) => choose(e.currentTarget.value)}>
        {#if target === ''}<option value="" disabled>{words.chooseList}</option>{/if}
        {#each lists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

{#snippet toolbar()}
  {#if answered && !unrouted && !refused}
    {#if !phone}
      {#if !never}{@render seriesSwitch(false)}{/if}
      {#if view === 'waiting' && INBOX.length > 0}
        <!-- WHERE A FILING GOES, AND SELECTING, ONLY WHILE SOMETHING WAITS: over an empty inbox both are controls for
             nothing. -->
        {@render fileInto('bar')}
        <span class="select-toggle">
          <Button
            aria-pressed={selecting}
            onclick={() => {
              selecting = !selecting;
              if (!selecting) picked = new Set();
            }}>{selecting ? copy.decideSelectDone : copy.decideSelect}</Button
          >
        </span>
      {/if}
    {:else if view === 'waiting' && INBOX.length > 0}
      <!-- ON A PHONE SELECT WAITS IN THE "⋯" (today F14), and where a filing goes is said in the open row. -->
      <Menu label={words.more} align="end">
          {#snippet trigger()}<span class="head-more"><Icon name="more" size="m" /><span class="isr">{words.more}</span></span>{/snippet}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={selecting}
            onclick={() => {
              selecting = !selecting;
              if (!selecting) picked = new Set();
            }}>{copy.decideSelect}</button
          >
        </Menu>
    {/if}
  {/if}
{/snippet}

{#snippet seriesSwitch(full: boolean)}
  <!-- FILED AND UNFILED AS ONE SERIES, three states of the same arrivals, so what was filed stays where it can be seen and
       put back rather than vanishing from the screen it left. The chosen one is the white pill. On a phone it is a row of
       three equal segments under the sentence. -->
  <Segmented class="series" role="group" aria-label={words.series} {full}>
    {#each segments as s (s.v)}
      <button
        type="button"
        class="segment"
        aria-pressed={view === s.v}
        data-on={view === s.v ? '' : undefined}
        onclick={() => show(s.v)}
      >{s.label}{#if s.n}<span class="segment-n num">{s.n}</span>{/if}</button>
    {/each}
  </Segmented>
{/snippet}

{#snippet underHead()}
  {#if answered && !unrouted && !refused && !never}
    {@render seriesSwitch(true)}
  {/if}
{/snippet}

<PageHead
  icon="mail"
  title={said('inbox')}
  count={answered && !unrouted && !refused ? INBOX.length : undefined}
  atLeast={live !== null && live.cursor !== null}
  sentence={sentence?.text}
  needs={sentence?.needs}
  actions={toolbar}
  below={phone ? underHead : undefined}
/>

<div class="page">
  {#if !refused && (!answered || unrouted)}
    <!-- Bars before the first answer, and nothing from a host that has no inbox to read. -->
    <!-- NOT ON A PHONE, where the head is the sentence alone and gives its held line back when the inbox has nothing to
         say: the bars stood under it and moved up 60px. The page lands where it stays instead. -->
    {#if !answered && !phone}<Waiting />{/if}
  {:else if !refused && INBOX.length === 0 && !tallied}
    <Waiting />
  {:else if !refused && never}
    <!-- ONE TILE, AND THE ONE THING TO DO: nothing has reached this record's inbox by any way, so the ways in, the
         rules' figure and what waits would each say nothing, three times. -->
    <div class="clear">
      <Empty kind="no-data-yet" glyph="mail" title={quiet.title} body={quiet.why}>
        {#snippet actions()}
          {#if quiet.command}
            <!-- A SELF-HOST'S ONE THING TO DO IS THE ADDRESS (T22): what prints it is the tile's hero, in mono with its
                 Copy, and the other ways in are a quiet press under it, never the red. Never drawn on a hosted record. -->
            <div class="quiet-how"><CodeLine text={quiet.command} /></div>
            <Button weight="quiet" href="/settings/ingest">{quiet.add}</Button>
          {:else}
            <Button weight="primary" href="/settings/ingest">{quiet.add}</Button>
          {/if}
        {/snippet}
      </Empty>
    </div>
  {:else}
    <div class="inbox">
      {#if ways || figure}
        <!-- THE TWO TILES THAT SAY HOW THINGS ARRIVE, side by side from a desk's width and stacked on a phone. -->
        <div class="top" data-pair={ways && figure ? '' : undefined}>
          {#if ways}
            <Tile icon="download" title={words.comesIn} meta={arrivals?.partial ? words.partial : undefined} href={arrivals?.partial ? undefined : '/settings/ingest'} hrefLabel={words.setUp}>
              <ul class="ways">
                {#each ways as w (w.channel)}
                  <li class="way">
                    <IconWell name={w.icon} size="l" tone={w.total > 0 ? 'action' : undefined} />
                    <span class="way-main">
                      <span class="way-name">{w.name}</span>
                      <span class="way-last">{lastSaid(w, (iso) => since(iso, clock))}</span>
                      {#if w.signed && !w.unsigned}<span class="way-last">{w.signed}</span>{/if}
                    </span>
                    <span class="way-trend">
                      {#if drawsLine(w)}<Sparkline values={w.days} width={140} height={32} summary={lineSaid(w)} />{/if}
                      <!-- A WAY NOTHING EVER CAME BY SAYS SO ONCE, under its name, and no count repeats it. -->
                      {#if w.last !== null}<span class="way-count num">{countSaid(w.total)}</span>{/if}
                    </span>
                    <!-- THE SENDERS WHOSE MAIL ISN'T SIGNED, AND THE FIX, ON A LINE OF THEIR OWN UNDER THE ROW (AF1): clipped to the
                         row's one line it said "Mail from Monzo, …" and "How to keep forw…", and lost both the names and the fix. -->
                    {#if w.unsigned}
                      <p class="way-unsigned">{w.unsigned} <a class="tap" href={UNSIGNED_HELP} target="_blank" rel="noopener noreferrer">{words.unsignedFix}</a></p>
                    {/if}
                  </li>
                {/each}
              </ul>
            </Tile>
          {/if}
          {#if figure}
            <!-- THE FIGURE, said at none too, and the whole as one bar once there is a whole to split. -->
            <Tile icon="refresh" title={words.rulesWeek} href="/automations" hrefLabel={words.seeRules}>
              <p class="figure num">{figure.figure.toLocaleString('en-GB')}<span class="figure-unit">{figure.unit}</span></p>
              {#if whoFiled}<Stacked parts={whoFiled.parts} subject={words.whoFiled} />{/if}
              <p class="reading">{figure.reading}</p>
            </Tile>
          {/if}
        </div>
      {/if}

      {#if panel || repeats.length > 0}
        <!-- WHAT EACH PATTERN DID, under the ways in: per pattern what it filed and held in the fortnight, each held
             reason in words, and the repeats it held, each with the press that files it as a second one. A held or
             needs-you line carries its word as well as its red. -->
        <Tile icon="filter" title={words.patternsDid}>
          {#if panel}
            <p class="did-sentence num">{panel.sentence}</p>
            {#each panel.doors as d (d.key)}
              <div class="did-door">
                {#if panel.doors.length > 1}<h3 class="did-door-name">{d.name}</h3>{/if}
                <ul class="did">
                  {#each d.patterns as p (p.key)}
                    <li class="did-line">
                      <span class="did-head">
                        <span class="did-name">{p.name}</span>
                        <span class="did-counts num">{p.counts}</span>
                      </span>
                      {#each p.held as why, i (i)}
                        <span class="did-why"><span class="did-mark">{words.heldMark}</span>{why}</span>
                      {/each}
                      {#if p.waiting}
                        <span class="did-why"><span class="did-mark">{words.needsMark}</span>{p.waiting}</span>
                      {/if}
                    </li>
                  {/each}
                  {#if d.unread}
                    <li class="did-line"><span class="did-why did-unread">{d.unread}</span></li>
                  {/if}
                </ul>
              </div>
            {/each}
          {/if}
          {#if repeats.length > 0}
            <div class="did-door">
              <h3 class="did-door-name">{words.repeats}</h3>
              <p class="did-why did-plain">{words.repeatsWhy}</p>
              <ul class="did">
                {#each repeats as r (r.id)}
                  {@const answer = seconded[r.id]}
                  <li class="did-line repeat">
                    <span class="repeat-main">
                      <span class="did-head">
                        <span class="did-name">{r.subject}</span>
                        <span class="did-counts num">{since(r.arrived, clock)}</span>
                      </span>
                      <span class="did-why did-plain">{r.reason}</span>
                      {#if answer}
                        <span class="did-why" data-refused={answer.refused ? '' : undefined} role="status">{answer.text}</span>
                      {/if}
                    </span>
                    {#if !answer || answer.refused}
                      <Button size="sm" aria-label={words.secondNamed(r.subject)} disabled={seconding !== null} onclick={() => second(r)}>{words.second}</Button>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </Tile>
      {/if}

      <div class="main">
        {#if view !== 'waiting'}
          {@render settledSeries()}
        {:else}
          {#if patterns.length > 0}
            <!-- PATTERNS FIRST: one accepted pattern files every arrival like its samples from then on, so it is worth
                 more than any one arrival below it. Each opens its question on Decide, where it is accepted or not. -->
            <Tile class="section" data-surface="tile" title={words.patterns} count={patterns.length || undefined}>
              <div class="section-body">
                <ul class="ledger ledger-lead">
                  {#each patterns as p (p.id)}
                    <li>
                      <a class="line line-tall pattern" href={at(`/decide/${encodeURIComponent(p.id)}`)}>
                        <IconWell name="decide" size="l" />
                        <span class="line-main">
                          <span class="line-title">{p.title}</span>
                          <span class="line-detail">{words.patternWhy}</span>
                        </span>
                        <span class="pattern-go" aria-hidden="true"><Icon name="chevron" size="m" /></span>
                      </a>
                    </li>
                  {/each}
                </ul>
              </div>
            </Tile>
          {/if}
          {#if refused}
            <!-- THE ARRIVALS WERE REFUSED, the rest of the screen was not: the tiles above and the patterns still draw. -->
            <Empty kind="error" title={words.refusedTitle} body={words.refusedBody + (ways || figure || panel || repeats.length > 0 || patterns.length > 0 ? words.refusedBelow : "")} detail={refused}>
              {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
            </Empty>
          {:else}
            {@render waitingSeries()}
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet settledSeries()}
  {#if seriesFix}
    <Empty kind="error" compact title={seriesFix} />
  {:else if series === null}
    <Waiting />
  {:else if series.items.length === 0}
    {#if series.state === 'matched'}
      <Empty kind="no-data-yet" compact title={words.noneFiled} body={words.noneFiledWhy} />
    {:else}
      <Empty kind="no-data-yet" compact title={words.noneArchived} body={words.noneArchivedWhy} />
    {/if}
  {:else}
    {@const state = series.state}
    <!-- THE SAME ROWS, BY THE DAY EACH WAS SETTLED, led by whoever settled it: the face of the person or the agent's run,
         or the glyph of what happened when a rule did it. A rule's filing is said to be a rule's and offers no Put
         back, since the record keeps a rule's filing to its list. -->
    <div class="days">
      {#each daysOf(series.items.map((i) => ({ ...i, arrived: i.settled?.at ?? i.arrived })), clock) as d (d.day)}
        <Tile class="section" data-surface="tile" title={d.label} count={d.items.length || undefined}>
          <div class="section-body">
            <ul class="ledger ledger-lead arrivals">
              {#each d.items as item (item.id)}
                {@const s = item.settled}
                {@const who = s ? actor(s.by, me || null) : null}
                <li>
                  <div class="line line-tall settled-line">
                    <span class="line-mark">
                      {#if who}<Face name={who.name} you={who.kind === 'you'} kind={who.kind} size="l" />{:else}<IconWell name={state === 'matched' ? 'check' : 'archive'} size="l" />{/if}
                    </span>
                    <span class="line-main">
                      <span class="line-title">{item.subject}</span>
                      <span class="line-detail settled-detail">
                        {#if state === 'matched'}
                          {#if s?.row}
                            <span>{words.filedIn}
                              {#if s.row.seq !== null && !s.row.archived}<a class="settled-list" href={at(`/r/${encodeURIComponent(s.row.register)}/${s.row.seq}`)}>{listOf(s.row.register)}</a>{:else}{listOf(s.row.register)}{/if}
                              {words.by(who?.name ?? '')}</span>
                          {:else}
                            <span>{who ? words.filedBy(who.name) : words.byRule}</span>
                          {/if}
                        {:else}
                          <span>{who ? words.archivedBy(who.name) : words.archivedPlain}</span>
                        {/if}
                        <span class="from">{item.from}</span>
                      </span>
                    </span>
                    <span class="line-when">{since(s?.at ?? item.arrived, clock)}</span>
                    {#if s}
                      <span class="settled-verb">
                        <Button size="sm" disabled={backing !== null} onclick={() => putBack(item.id, s.row?.version ?? null)}>{words.putBack}</Button>
                      </span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </Tile>
      {/each}
    </div>
    {#if series.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlderSeries} disabled={seriesOlder}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}
  {/if}
{/snippet}

{#snippet waitingSeries()}
  {#if INBOX.length === 0}
    <!--
      AN EMPTY INBOX IS TWO DIFFERENT FACTS. A record with no connector has never had anything arrive,
      and a record that has one has cleared it. A record cannot tell these apart from the inbox alone,
      so it says what is true in both, with the door to a connector; and where something waits on
      Decide, the door there too. Only the sample knew its own sources and drew the two apart.

      NEITHER DOOR IS INK. An empty inbox is good news, and the filled pill was the loudest shape on it,
      so both are the quiet secondary.
    -->
    <div class="clear">
      <Empty kind="no-data-yet" glyph="mail" title={said('inbox_clear')} body={copy.inboxClearWhy}>
        {#snippet actions()}
          {#if Number(route.data.open ?? 0) > 0}<Button href="/decide">{copy.inboxOpenDecide}</Button>{/if}
          <Button href="/settings/ingest">{copy.inboxConnect}</Button>
        {/snippet}
      </Empty>
    </div>
  {:else}
    {#if reviews.length > 0}
      <!-- TO REVIEW: what BrainDog read and would file, one line each. The suggested filing is the one primary. -->
      <Tile class="section" data-surface="tile" title={words.toReview} count={reviews.length || undefined}>
        <div class="section-body">
          <p class="why">{words.toReviewWhy}</p>
          <ul class="ledger ledger-lead">
            {#each reviews as r (r.id)}
              <li>
                <div class="line line-tall alike-line">
                  <span class="line-main">
                    <span class="line-title">{r.line}</span>
                  </span>
                  <span class="alike-verbs">
                    <Button size="sm" weight="primary" disabled={reviewing !== null} onclick={() => settleReview(r, 'file')}>{words.fileIn(listOf(r.register))}</Button>
                    <Button size="sm" disabled={reviewing !== null} onclick={() => settleReview(r, 'else')}>{words.somethingElse}</Button>
                    <Button size="sm" weight="bare" disabled={reviewing !== null} onclick={() => settleReview(r, 'ignore')}>{words.ignore}</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </Tile>
    {/if}
    {#if alike.length > 0}
      <!-- LEARNED ONCE. Each sender with two or more alike is one row: how many, from whom, and the newest of them.
           Asking Slash waits for the record's threshold for a pattern, since it spends a model call; making the rule by
           hand is offered for any group, because pointing at two alike messages costs nothing
           and already shows what the rule would read. Both are quiet: filing is the screen's one primary. -->
      <Tile class="section" data-surface="tile" title={words.learn} count={alike.length || undefined}>
        <div class="section-body">
          <p class="why">{words.learnWhy}</p>
          <ul class="ledger ledger-lead">
            {#each alike as group (group.shape)}
              {@const newest = group.items[0]}
              <li>
                <div class="line line-tall alike-line">
                  <IconWell name="learning" size="l" />
                  <span class="line-main">
                    <span class="line-title">{words.alikeFrom(group.items.length, newest?.from ?? '')}</span>
                    {#if newest}<span class="line-detail">{words.newest(newest.subject, since(newest.arrived, clock))}</span>{/if}
                  </span>
                  <span class="alike-verbs">
                    {#if group.items.length >= ALIKE}
                      <Button size="sm" disabled={asking !== null} onclick={() => askPattern(group)}>
                        {asking === group.shape ? words.asking : words.askPattern}
                      </Button>
                    {/if}
                    <Button size="sm" weight="bare" href={builderPath(group.items.slice(0, SAMPLES_MOST).map((i) => i.id))}>{words.makeOne}</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </Tile>
    {/if}

    <!-- ONE TILE FOR ALL THAT WAITS (today F14), each day a quiet subhead over its rows and no rule above it. -->
    <Tile class="section" data-surface="tile" title={words.waiting} count={INBOX.length || undefined}>
      <div class="section-body">
        {#each days as d (d.day)}
          <h3 class="day-h">{d.label}</h3>
            <ul class="ledger arrivals" data-picking={picking ? '' : undefined}>
              {#each d.items as item (item.id)}
                {@const i = place.get(item.id) ?? -1}
                <li class="arrival" data-cursor={i === cursor ? '' : undefined} data-open={open === item.id ? '' : undefined} {@attach ownMenu((p) => ((cursor = i), (menuItem = item), (point = p)))}>
                  <!-- THE LEADING MARK IS THE CHECK THAT SELECTS IT: a 20px ring, ink with its tick once picked. -->
                  <button
                    type="button"
                    class="pick line-check tap"
                    role="checkbox"
                    aria-checked={picked.has(item.id)}
                    aria-label={item.subject}
                    data-on={picked.has(item.id) ? '' : undefined}
                    onclick={() => toggle(item.id)}
                  ><Icon name="check" size="s" /></button>
                  <!-- THE SUBJECT LEADS, then who sent it and the first of what they said, then when. The
                       sender's domain led the row in a column of its own and was said again under the
                       subject. -->
                  <button
                    type="button"
                    id="arrival-{item.id}"
                    class="line line-tall"
                    aria-expanded={open === item.id}
                    onclick={() => {
                      cursor = i;
                      open = open === item.id ? null : item.id;
                    }}
                  >
                    <span class="line-main">
                      <span class="line-title">{item.subject}</span>
                      {#if hintLines.get(item.id)}<span class="hint">{hintLines.get(item.id)}</span>{/if}
                      <span class="line-detail"><span class="from">{item.from}</span>{#if open !== item.id && item.body}<span class="gist">{firstWords(item.body)}</span>{/if}</span>
                    </span>
                    <span class="line-when">{since(item.arrived, clock)}</span>
                  </button>
                  <!-- THE ROW'S VERBS, WITH THE KEYS THAT DO THE SAME: shown on the cursor row and under the pointer, and
                       left out of the tab order, since `e` and Delete are the keyboard's way and the open row's buttons
                       are a tab away. -->
                  <span class="line-verbs arrival-verbs">
                    <Button size="sm" kbd="e" tabindex={-1} aria-label={words.fileNamed(item.subject)} disabled={busy} onclick={() => ((cursor = i), settle(item, 'file'))}>{words.file}</Button>
                    <Button size="sm" weight="bare" kbd="Delete" tabindex={-1} aria-label={words.archiveNamed(item.subject)} disabled={busy} onclick={() => ((cursor = i), settle(item, 'archive'))}>{words.archive}</Button>
                  </span>

                  {#if open === item.id}
                    <div class="body">
                      <!-- Plain text. Never the renderer, never {@html}, never a link the record made. -->
                      <p class="raw">{item.body}</p>

                      <!-- FILING IS THE PRIMARY, and archiving follows it in words. -->
                      <div class="actions">
                        {@render fileInto('row')}
                        <!-- RED ONLY ONCE A LIST IS CHOSEN: before, the press asks where (AF2). -->
                        <Button weight={target ? 'primary' : undefined} disabled={busy} onclick={() => settle(item, 'file')}>{target ? copy.fileItIn(listOf(target)) : copy.fileIt}</Button>
                        <Button weight="bare" disabled={busy} onclick={() => settle(item, 'archive')}>{copy.archiveArrival}</Button>
                      </div>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
        {/each}
      </div>
    </Tile>
    <CapLine shown={Math.min(INBOX.length, DOM_CAP)} total={INBOX.length} />
    {#if live && live.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}

    {#if picked.size > 0}
      <!-- THE SELECTION'S BAR: glass chrome floating at the foot of the view, so opening it moves nothing. -->
      <div class="batch" role="region" aria-label={copy.inboxSelected(picked.size)}>
        <span class="batch-n num">{copy.inboxSelected(picked.size)}</span>
        {@render fileInto('row')}
        <Button weight={target ? 'primary' : undefined} disabled={busy} onclick={() => settlePicked('file')}>{copy.inboxFileSelected(picked.size)}</Button>
        <Button weight="bare" disabled={busy} onclick={() => settlePicked('archive')}>{copy.inboxArchiveSelected(picked.size)}</Button>
        <Button weight="bare" onclick={() => ((picked = new Set()), (selecting = false))}>{copy.clearSelection}</Button>
      </div>
    {/if}
  {/if}
{/snippet}

<style>
  /* THE SELF-HOST'S FOLD, under the one button: its summary a quiet line, and the command the tile's width when open. */
  /* ITS OWN LINE UNDER THE BUTTON: the empty tile's actions take the tile's width here, so the fold wraps under them. */
  .clear :global(.empty-actions) {
    align-self: stretch;
    justify-content: flex-start;
  }

  .quiet-how {
    flex-basis: 100%;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }


  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* ── the toolbar ──────────────────────────────────────────────────────── */

  .segment-n {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* THE LIST A FILING GOES INTO, as a glass pill in the toolbar: its word in the quiet ink, and the select inside it
     drawn as words with the house chevron, so the two read as one control. */
  .file-into {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h);
    max-inline-size: 100%;
    padding-inline-start: var(--sp-4);
    border-radius: var(--r-pill, 999px);
  }

  /* A GLASS CAPSULE IN THE CONTROL LINE (ops 4.1): the control fill, its blur and its 0.5px edge, no border. */
  .file-into[data-where='bar'] {
    background: var(--g-fill, var(--tile));
    backdrop-filter: var(--g-bf, none);
    box-shadow: inset 0 0 0 0.5px var(--g-line, var(--rule-strong));
  }


  /* GLASS NEVER HOLDS GLASS: once the title row is the compact glass bar, the pills in it drop their own. The series
     is the part's element (`Segmented`), not this file's, so its rule is global or it reaches nothing. */
  :global(.head[data-under]) .file-into[data-where='bar'],
  :global(.head[data-under] .series) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .file-label {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .file-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 24ch;
    background-color: transparent;
    border-radius: var(--r-pill, 999px);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .file-into[data-where='bar'] .file-select {
    padding-inline-start: 0;
  }

  /* IN THE OPEN ROW AND THE SELECTION'S BAR the select is a field, the soft well beside its word, and it is drawn only
     on a phone, where the toolbar has scrolled away with the page. */
  .file-into[data-where='row'] {
    display: none;
    padding-inline-start: 0;
  }

  .file-into[data-where='row'] .file-select {
    background-color: var(--tile-2);
    border-radius: var(--r-field, 12px);
  }

  /* `Select` IS A PHONE'S AND A THUMB'S, for the reason `selecting` gives. */
  .select-toggle {
    display: none;
  }

  /* THE "⋯" IN A PHONE'S HEAD: a quiet square, a tap wide. Its name is said to a screen reader and not drawn. */
  /* A GLASS CIRCLE NOW (ops 4.1), drawn at the page tier and a tap wide under the thumb. */
  .head-more {
    display: inline-grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    background: var(--g-fill, var(--tile-2));
    backdrop-filter: var(--g-bf, none);
    border-radius: var(--r-pill, 999px);
    box-shadow: inset 0 0 0 0.5px var(--g-line, transparent);
    color: var(--ink-2);
  }

  .isr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── the layout ───────────────────────────────────────────────────────── */

  /* THE BOARD: the two tiles that say how things arrive, then the series under them at the board's whole width. */
  .inbox {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* SIDE BY SIDE FROM A DESK'S WIDTH, eight columns to four, measured on the page's own width so a docked panel narrows
     it; one column on a phone, the ways in first. */
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    align-items: stretch;
  }

  @container (inline-size >= 860px) {
    .top[data-pair] {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
  }

  /* A WAY IN IS A 56PX ROW: its well, its name over when the last thing came, and at the right the fortnight as a line
     with its count under it. A hairline between rows, inside the tile. */
  .ways {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .way {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: 56px;
  }

  .way + .way {
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .way-main {
    display: flex;
    flex-direction: column;
    gap: var(--row-stack);
    min-inline-size: 0;
  }

  .way-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ui);
  }

  .way-unsigned {
    grid-column: 2 / -1;
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-wrap: pretty;
  }

  .way-last {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .way-trend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .way-trend :global(.viz-trend) {
    inline-size: 140px;
  }

  .way-count {
    min-inline-size: 11ch;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }

  /* WHAT EACH PATTERN DID: the fortnight's sentence, then a line a pattern, its name and counts on one line and each held
     reason under it, led by its word in the deeper red. A hairline between lines, inside the tile, as the ways in. */
  .did-sentence {
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .did-door + .did-door {
    margin-block-start: var(--sp-4);
  }

  .did-door-name {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lead-ui);
  }

  .did {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .did-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: var(--sp-3);
    min-inline-size: 0;
  }

  .did-line + .did-line {
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .did-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .did-name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ui);
  }

  .did-counts {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .did-why {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .did-plain,
  .did-unread {
    color: var(--ink-3);
  }

  .did-why[data-refused] {
    color: var(--red);
  }

  .did-mark {
    margin-inline-end: var(--sp-2);
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* A REPEAT: its words on the left and the press on the right, the press under them on a phone. */
  .repeat {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
  }

  .repeat-main {
    display: flex;
    flex: 1 1 18rem;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  /* AN EMPTY INBOX IS A TILE ON THE BOARD like everything else on it: `Empty`'s own, at most 640 wide on the start
     edge. A second tile round it stretched it across the page and dropped its own. */
  /* THE EMPTY TILE STARTS AT THE TOP LEFT (T23), at the page's gutter like every page's first tile, not floating in
     the middle of a blank page. */
  .clear {
    display: contents;
  }

  .clear :global(.empty:not(.compact)) {
    align-items: flex-start;
    margin-inline: 0;
    text-align: start;
  }

  .main,
  .days {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  /* THE FIGURE (`t-figure`), with what it counts beside it in the meta step. */
  .figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: var(--lead-figure);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
    letter-spacing: 0;
  }

  /* THE ONE LINE THAT READS THE CHART. */
  .reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .why {
    margin: 0 0 var(--sp-2);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ── patterns and what could be learned ──────────────────────────────── */

  /* A PATTERN IS A ROW THAT OPENS ITS QUESTION: the well, the question over where it waits, and the way there. */
  .pattern {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
  }

  .pattern-go {
    display: inline-flex;
    color: var(--ink-3);
  }

  .alike-line {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
  }

  .alike-verbs {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  /* ── an arrival ───────────────────────────────────────────────────────── */

  /**
   * AN ARRIVAL IS ITS CHECK, ITS ROW, ITS VERBS, AND ITS BODY WHEN OPEN. The check and the row are two buttons side by
   * side, so the wash is the list item's, round the lot: the cursor row and a hovered one take `--hover`, and a
   * picked one `--red-tint`. The row button draws no fill of its own, or the two would stack.
   */
  /* EACH DAY A QUIET SUBHEAD IN THE ONE TILE (today F14): 13/600 in the quiet ink, 16 above, no rule. */
  .day-h {
    margin: var(--sp-4) 0 var(--sp-1);
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: var(--lead-meta);
  }

  .day-h:first-child {
    margin-block-start: 0;
  }

  /* ONE GRID FOR AN OPEN ROW AND A SHUT ONE (today F14): the check, the words, and the time at the end of the third
     column always, so every row's time and hairline end at the same place. */
  /* AN ARRIVAL IS AN OPS INBOX ROW (4.15): the row wash, rounded 10, and no hairline between two rows. */
  .arrival {
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 72px;
    align-items: center;
    padding-inline: var(--sp-3);
    margin-block: 1px;
    border-radius: var(--r-ctl);
    scroll-margin-block: var(--sp-7);
    transition: background var(--d-state) var(--ease-out);
  }

  .arrival[data-cursor] {
    background: var(--row-wash);
  }

  .arrival > .line::after {
    display: none;
  }

  .arrival:has(.pick[data-on]) {
    --row-wash: var(--chosen);
    background: var(--chosen);
  }

  @media (hover: hover) and (pointer: fine) {
    .arrival:hover {
      background: var(--row-wash);
    }

    /* The hairlines either side of a washed row step aside, as the shared rows' do. */
    .arrival:hover > .line::after,
    .arrival:hover + .arrival > .line::after {
      opacity: 0;
    }
  }

  .arrival:has(.pick[data-on]) > .line::after,
  .arrival:has(.pick[data-on]) + .arrival > .line::after {
    opacity: 0;
  }

  /* THE CHECK STARTS WHERE THE DAY'S SUBHEAD DOES. */
  .arrival > .pick {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }

  /* The row is a `<button>`, at every width: it opens and closes. SUBJECT AND DETAIL, THEN WHEN, over the second and
     third columns, so the time is the third's. */
  .arrival > .line {
    grid-column: 2 / 4;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr) 72px;
    column-gap: var(--sp-3);
    inline-size: 100%;
    padding-inline: var(--sp-3) 0;
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }

  /* THE ROW'S VERBS FLOAT AT THE END OF ITS WORDS, before the time, on the row's own wash, so they move nothing when
     they show. */
  .arrival > .line-verbs {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: calc(var(--sp-3) + 72px + var(--sp-3));
    padding-inline-start: var(--sp-3);
    background-color: var(--tile);
    background-image: linear-gradient(var(--row-wash), var(--row-wash));
    transform: translateY(-50%);
  }

  /* An open row says its verbs in full in its body, so the row's own go. */
  .arrival[data-open] > .line-verbs {
    display: none;
  }

  /* THE CURSOR IS THE FOCUS RING, and only while it is the keyboard's. */
  .arrival .line:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .from {
    color: var(--ink-2);
  }

  .gist::before {
    content: '·';
    margin-inline: var(--sp-2);
  }

  /* WHAT THE RECORD READ IT AS, under the subject: muted, at the body's size, one line. */
  .hint {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE BODY SITS UNDER THE SUBJECT, on the ground: space opens it, not a slab. Its buttons stay in the words' column. */
  .body {
    grid-column: 2;
    grid-row: 2;
    min-inline-size: 0;
    padding: 0 0 var(--sp-5) var(--sp-3);
  }

  .raw {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    /* A body is text somebody else wrote, line breaks included, and one unbroken token must not
       push the card wider than the screen. */
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  /* THEY WRAP. A row of actions that does not fit is wrapped, never cut. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ── a filed or archived arrival ─────────────────────────────────────── */

  /* READ, NOT OPENED: its row is text, led by who settled it, and Put back is the one thing it does. */
  .settled-line {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    cursor: default;
  }

  .settled-detail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
  }

  .settled-list {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  .settled-verb {
    display: inline-flex;
  }

  /* ── the selection's bar ─────────────────────────────────────────────── */

  /* GLASS CHROME, FLOATING: the strong glass for legibility over the rows passing under it, its
     hairline pair and the floating shadow, and a pill's ends. */
  .batch {
    position: sticky;
    inset-block-end: var(--sp-4);
    z-index: var(--z-raise);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline: auto;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
    /* FLOATING CHROME, SO GLASS (ops 4.12's toast surface): the regular material, its edge and the popover shadow. */
    background: var(--glass-regular, var(--tile));
    backdrop-filter: var(--glass-filter, none);
    border-radius: var(--r-chrome, var(--r-tile));
    border: 0;
    box-shadow: var(--glass-edge, none), var(--elev-popover, none);
  }


  .batch-n {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* The page below is one control, the height every control is on this pointer. */
  .older {
    display: flex;
    justify-content: center;
  }

  .foot {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-align: center;
  }

  @media (forced-colors: active) {
    .batch,
    .file-into[data-where='bar'] {
      border: 1px solid CanvasText;
    }
  }

  /* ── a thumb ─────────────────────────────────────────────────────────── */

  @media (width < 900px), (pointer: coarse) {
    .select-toggle {
      display: inline-flex;
    }
  }

  /**
   * UNDER A THUMB THE CHECKS SHOW ONLY WHILE SELECTING, at a thumb's size, reached through the 44px square `.tap`
   * draws round each (`::before`, which the layout gate measures). Otherwise the
   * row takes the whole width, and a tap opens it. The row's verbs are the open row's buttons here.
   */
  @media (pointer: coarse) {
    .arrival {
      grid-template-columns: auto minmax(0, 1fr) 72px;
      padding-inline-start: 0;
    }

    .arrival > .pick {
      display: none;
      position: relative;
      inline-size: 24px;
      block-size: 24px;
      margin-inline: var(--sp-3) 0;
    }

    .arrivals[data-picking] .arrival > .pick {
      display: inline-grid;
    }

    .arrival > .line-verbs {
      display: none;
    }
  }

  @media (width < 900px) {
    .batch {
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
    }

    .file-into[data-where='row'] {
      display: flex;
    }
  }

  /* AT 390 AN ARRIVAL IS ONE CARD: the time beside the subject, two lines of what was said under it, and File and
     Archive full-width pills under the body, with the list it files into a full-width field above them. */
  @media (width < 640px) {
    .arrival > .line-verbs {
      display: none;
    }

    .arrival .line-main {
      grid-column: 1;
      grid-row: 1;
    }

    .arrival .line-when {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    /* AN OPEN ROW'S BODY AND BUTTONS TAKE THE CARD'S WIDTH ON A PHONE, under the time as well. */
    .body {
      grid-column: 1 / -1;
      padding-inline-start: 0;
    }

    .arrival .line-detail {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }

    .actions {
      flex-direction: column;
      align-items: stretch;
    }

    .actions :global(.btn) {
      inline-size: 100%;
    }

    .file-into[data-where='row'] {
      flex-direction: column;
      align-items: stretch;
      gap: var(--sp-2);
    }

    .file-into[data-where='row'] .file-select {
      max-inline-size: none;
      inline-size: 100%;
    }

    /* THE LEAD AND THE WORDS KEEP THEIR COLUMNS on a card: the shared card layout would put the words under the lead. */
    .pattern,
    .alike-line,
    .settled-line {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    }

    .pattern .line-main,
    .alike-line .line-main,
    .settled-line .line-main {
      grid-column: 2;
      grid-row: 1;
    }

    .alike-verbs {
      grid-column: 2 / -1;
      grid-row: 2;
      justify-content: flex-start;
    }

    .settled-line .line-when {
      grid-column: 3;
      grid-row: 1;
      align-self: start;
    }

    .settled-verb {
      grid-column: 2 / -1;
      grid-row: 2;
    }

    .batch {
      inline-size: auto;
      margin-inline: 0;
    }

    /* ON A PHONE A WAY IN KEEPS ITS COUNT, and the line under 640 is drawn narrower. */
    .way-trend :global(.viz-trend) {
      inline-size: 72px;
    }

    .way-count {
      min-inline-size: 0;
    }
  }
</style>
