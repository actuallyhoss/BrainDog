<!--
  Today, declared: the page every record opens on (`routes/+page.svelte`), and `/?overview` too, which was a second Home.

  ONE PAGE, THROUGH THE ONE READER. Home draws the speaking use case's `home-<id>` page, else the record's `home` page,
  else Today's body (`todayHome` in `default-home.ts`), built from what the record holds and drawn by the record with
  `previewPage`. All three go through `PageView` with `mode: 'home'`, so a question is answered where it is shown, a
  task is ticked where it is drawn, and a line is captured without leaving. Today was a screen of its own, retired on
  24 October once this one did all it did; `/?classic` opens this one.

  CALM BEFORE RICH. One line under the title, worked out from the blocks drawn (`sentenceOf`), with the
  phrase that needs the reader in red. When Slash wrote Home's line today the line is its (`home-line.ts`), red only
  where it says the rules' phrase word for word, and who said it shows on hover or focus; nothing more is drawn at rest.
  A block with nothing in it is not drawn, and a rail with nothing in it gives its width back to the main column.

  THE READ MARK is one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug: For You had never once
  drawn its second half, because the screen advanced the mark on open and then asked for everything since it (19 §6).

  IT LISTENS. A write from an agent, a rule or another tab moves the record's version, and Home reads its page again
  without a reload and without blanking it (`listen`).

  TODAY'S OWN BODY IS THE DESK (roadmap slice 1a): what is late, what needs you, who is working and cash, the projects,
  then Arrivals, what is coming up and people, on one board. NO MORE FOLD AT ITS FOOT (frame A, 23 October): it pointed
  at the same things the tiles and the sidebar already hold. A page the person kept is drawn as they laid it out, with
  Arrivals over it.

  WHAT IS LATE, WHO IS WORKING AND THE PROJECTS ARE BLOCKS OF THE BODY (24 October): declared in `todayHome`,
  answered by the record, and drawn in their slots as the desk's own tiles (`desk-part.ts`, which this file marks the
  blocks with). Only Arrivals and the foot of Needs you are still Home's own, each drawn in its widget's cell.

  TODAY IS A BOARD OF WIDGETS (the widgets plan of 29 October): every tile a widget with a size, packed on four columns or
  two (`lib/board`), in the order the page declares or the phone's own, and rearranged in place by pressing and holding
  one, or Edit. The hand-written desk order and the phone's `order:` rules are gone.

  THE RECORD'S HOUSEKEEPING IS NOT HERE: what went stale, who it matched, what it found
  wrong in its own pages and notes, what the answers taught, what may be one, what has no colour and the imported rules
  are Settings › Health, read only when that opens. Today asks none of them, the walk of every page and note least of all.
-->
<script module lang="ts">
  /** Whether Today has been drawn once in this tab: its tiles come in on the first load only. */
  let enteredOnce = false;
  /** When this tab last drew Today from the record, so an open while that is kept draws it and not the local copy. */
  let drewAt = 0;
  /** How long after the first read the tiles still come in, so the desk's late parts land the same way. */
  const ENTER_HELD_MS = 900;
  /** Whether this tab's first Today has taken what `boot` said was new: only that read can, as `boot` is that old. */
  let bootNewsTaken = false;
  /* THE PAGE READER, LOADED BESIDE TODAY'S FIRST READ AND NOT IN FRONT OF IT (scope 2026-10-24 A19): it brings every
     block kind's code, and a static import put all of it on the cold open's path before Today's head could draw. Asked
     once, when this module is first evaluated, so it is on its way while the page is read; held for every later Today. */
  let pageViewIs: Promise<typeof import('$lib/page/PageView.svelte')> | null = null;
  /** The reader once landed, so a later Today draws it at once and not a turn after. */
  let pageViewHad: (typeof import('$lib/page/PageView.svelte'))['default'] | null = null;
  const pageViewOf = () => (pageViewIs ??= import('$lib/page/PageView.svelte').then((m) => ((pageViewHad = m.default), m)));
</script>

<script lang="ts">
  import { idle } from '$lib/ui/idle.ts';
  import { apiBase, at as inApp } from '$lib/at.ts';
  import { madeOf } from '$lib/home/made-counts.ts';
  import { stillShown, type WidgetSize } from 'braindog-render';
  import { recordToday, recordZone } from '$lib/record/zone.ts';
  import { partsOf } from '$lib/shell/headline.ts';
  import { barTitled, frame } from '$lib/shell/frame.svelte.ts';
  import { everyAsked, onAppendOnly, recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { heard, said } from '$lib/voice.svelte.ts';
  import { homeSlugOf } from '$lib/voice.ts';
  import type { LiveBlock, LivePageDecl, Opened } from '$lib/record/page-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { may } from '$lib/record/may.ts';
  import { live as moving } from '$lib/data/live.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import type ClearExamplesOf from '$lib/ui/ClearExamples.svelte';
  import type FirstDraftsOf from '$lib/start/FirstDrafts.svelte';
  import { draftsFor, draftsWaiting, firstDrafts } from '$lib/start/first-drafts.svelte.ts';
  import { assemble, ONCE_MS, todayFormedOnce } from '$lib/start/assembling.ts';
  import type PageViewOf from '$lib/page/PageView.svelte';
  import HeadCapture from '$lib/home/HeadCapture.svelte';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { readMarkOf, stampOf } from '$lib/page/read-mark.ts';
  import { markAll } from '$lib/record/mark-read.ts';
  import { holdsOf, voiceOf } from '$lib/page/home-arrange.ts';
  import {
    FIRST_TODAY_MOST,
    NEEDS_YOU_LIMIT_PHONE,
    TELL_LINE,
    drawsAny,
    homeDrawn,
    peopleOf,
    railed,
    slashLineOf,
    todayHome,
    quietHeld,
    STARTER_PACK,
    weekOf,
    type Holds,
    type HomeVoice,
    type HomeWaits,
    type WeekDecl,
  } from '$lib/home/default-home.ts';
  import { addedByHand, showTell, tellLists } from '$lib/home/first-today.ts';
  import { SLIM_MOST, keepTell, lastLines, readTell, slimShown, type TellKept, type ToldLine } from '$lib/home/tell-line.ts';
  import TellOne from '$lib/home/TellOne.svelte';
  import NeedsFoot from '$lib/home/NeedsFoot.svelte';
  import { sharedFrom, type SharedOut } from '$lib/home/shared-line.ts';
  import { desked as deskedOf, type Desked } from '$lib/home/desk-part.ts';
  import type WantMoreOf from '$lib/home/WantMore.svelte';
  import { read as readPref } from '$lib/pref.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import { learn } from '$lib/record/remote.ts';
  import { playedBy } from '$lib/start/parts.ts';
  import type { TellOptions } from '$lib/tell/read.ts';
  import { PEOPLE } from '$lib/who.ts';
  import { createClient, wrote, type Cursor, type EngineHealth, type EventLine, type SlashStatus } from '@braindog/client';
  import { quietLine } from '$lib/ui/engine-line.ts';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { still } from '$lib/ui/motion.ts';
  import { sentenceOf } from '$lib/home/today-tiles.ts';
  import { bandHeading, bandOf, greetingOf, inBriefOrder, lateOf, onceEach, unasked } from '$lib/home/today-brief.ts';
  import { verbOf } from '$lib/home/late-verb.ts';
  import { waitsNow, workingNow } from '$lib/home/waits.svelte.ts';
  import { toldNow } from '$lib/home/told-now.svelte.ts';
  import { answeredBy, doneToday, toldNeedOf } from '$lib/record/told-live.ts';
  import { words } from '$lib/home/words.ts';
  import { keptWordsNow } from '$lib/home/kept-words.ts';
  import { cutLine, homeLineOf } from '$lib/home/home-line.ts';
  import Board from '$lib/board/Board.svelte';
  import type EditCoverOf from '$lib/board/EditCover.svelte';
  import type DraftMarkOf from '$lib/board/DraftMark.svelte';
  import { BoardModel, boardWords } from '$lib/board/board.svelte.ts';
  import { restSize, rowsOf } from '$lib/board/rest-size.ts';
  import { leftBlock, phoneAsk, withLeft } from '$lib/home/phone-ask.ts';
  import { fitted, widgetsOf, type Phone } from '$lib/board/board-widgets.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { typing } from '$lib/a11y/keys.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';

  import { closed, drew, opened } from '../ui/screen.svelte.ts';
  import { keepPart, keptPart, tileOnce, TODAY_KEPT_MS } from '$lib/home/today-kept.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { holdPresses } from '$lib/data/held.svelte.ts';
  import { drewFirst, firstDrawn } from '$lib/data/first-drawn.ts';
  import { painted } from '$lib/data/timing.ts';
  import { when as keptWhen, words as keptWords } from '$lib/data/offline.ts';
  import { KEPT_SAY_MS } from './kept-frame.ts';
  import type { Near } from '$lib/data/local.ts';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';

  let { data }: { data: Shell } = $props();

  /* THE READER ONCE ITS CODE HAS LANDED (`pageViewOf`), drawn where it is the moment it has. */
  let PageView = $state.raw<typeof PageViewOf | null>(pageViewHad);
  /* AND ITS CODE IS PART OF THE SCREEN, held open until it lands: a read that answered first said Today was ready over a
     page with no body, which then took a long task to draw a moment later, and a press in that moment waited on it. */
  if (PageView === null) {
    const held = opened();
    void pageViewOf().then(
      (m) => {
        PageView = m.default;
        closed(true, held);
      },
      () => closed(false, held),
    );
  }

  /* WHAT HE HAS SHARED OUT, for the one line in Needs you's foot (`shared-line.ts`): asked once the screen is idle, an
     owner's alone, and never a part of `boot`, which an owner is answered as before sharing. */
  let sharedNow = $state<SharedOut | undefined>(undefined);
  $effect(() => {
    /* ON TODAY'S OWN BODY IT COMES WITH THE BODY, in the record's one read (`tilesBeside`). */
    if (!data.me?.owner || data.refused || data.stale || declares === null) return;
    void data.version;
    untrack(
      () =>
        void idle()
          .then(() => import('@braindog/client'))
          .then(({ createClient }) => createClient({ base: apiBase() }).call<unknown>('sharedOut'))
          .then((out) => (sharedNow = out.ok ? sharedFrom(out.value) : undefined))
          .catch(() => undefined),
    );
  });

  /**
   * THE DAY WHERE THE PERSON IS, on a live record: Home read Wednesday at two in the morning of Thursday,
   * because it named the day in UTC. The record's own `tz` is not read, because every host provisions `UTC` and nobody
   * sets it, so it cannot be told from a zone somebody chose. A quiet line over the title, not the title itself.
   */
  /* THE RECORD'S DAY, IN ITS ZONE (AH22), as every other "today" on this screen counts it. */
  const today = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: recordZone() }));

  /** The same day as `YYYY-MM-DD`, which the card reads "Friday" against. */
  const dayOn = (now: number): string => recordToday(now);

  /* TODAY IS TODAY ON EVERY RECORD: a use case adds words for new things and never renames
     one of the five places, so neither the title nor the calm line takes the voice's word ("Team", "Nothing needs your
     call"). */
  const title = copy.today;
  const nothing = words.nothingNow;

  /* TODAY'S HEADINGS IN THE VOICE THAT SPEAKS, read before the page is asked for so a voice that lands after the first
     read asks it again in its own words. Built by the same helper the arrange mode rebuilds Today's body with, so the
     body arranged is the body drawn. NEEDS YOU IS A PLACE AND KEEPS ITS NAME there, and so does its calm line. */
  const voice = $derived<HomeVoice>(voiceOf(said));

  /**
   * ONLY A PAGE THE PERSON KEPT IS DRAWN IN THE DESK'S PLACE. A use case's own `home-<id>` page never replaces the
   * desk: on his record the Solo founder's report page stood where Today should be, with its tables, a by-book chart and
   * "Needs your call", and no desk change since 19 October ever reached it. The desk draws on every record, and the use
   * case's page stays a page of the record, in the nav and the palette, and Today never links to it: the desk's foot
   * said "The Solo founder page" on his record, which sent him from Today to the page it had replaced (batch 4's look).
   * A page kept by hand, `home`, is still drawn as it was laid out, and only a page the record holds is asked for.
   */
  const declares = $derived(homeSlugOf(null, data.pages));

  /* ── a first Today: use case 6, steps 5 and 6 (planner-45, the onboarding target) ──────────────────── */

  /**
   * EVERY LIST THE RECORD HOLDS, the empty ones too, with how many entries each holds as `boot` counted them: what
   * `first-today.ts` reads. `index.registers` is the rail's and leaves the empty lists out.
   */
  const kept = $derived({
    registers: data.lists.map((l) => ({
      id: l.id,
      name: l.name,
      count: counted ? (counted.get(l.id) ?? 0) : (data.index.registers.find((r) => r.id === l.id)?.count ?? 0),
      ...(l.pack === undefined ? {} : { pack: l.pack }),
    })),
  });
  /** The device's own preferences: whether the next steps are hidden, and how her work arrives. Read again on Hide. */
  let prefs = $state(readPref());
  /* WHAT THE MAKING WROTE, which is not added by hand (AH19, `made-counts.ts`). */
  const madeWith = $derived(madeOf(data.index.slug));
  const added = $derived(addedByHand(kept, madeWith));
  /** The card was pressed here: it goes at once and the next steps take its place, before `boot` counts what it added. */
  let pressed = $state(false);
  /**
   * HOW MANY EACH LIST HOLDS, AS `boot` COUNTS THEM AGAIN after the press, each time the record moves: the shell's count
   * is the one it was loaded with, so without this an Undo of what the card added left Today on the next steps.
   */
  let counted = $state<Map<string, number> | null>(null);
  let counting = 0;
  $effect(() => {
    if (!pressed) return;
    void moving.version;
    const mine = ++counting;
    const base = apiBase();
    void import('$lib/record/boot-live.ts')
      .then((m) => m.rereadBoot(base))
      .then((got) => {
        if (mine === counting && got.from === 'live') counted = new Map(got.boot.registers.map((r) => [r.id, r.count]));
      })
      .catch(() => undefined);
  });
  const told = $derived(pressed && counted === null);

  /* ONLY WHO KEEPS THE RECORD AND MAY ADD TO IT: a colleague held to their own lists, or one who only reads, is not
     onboarded on somebody else's record. */
  const first = $derived(!data.refused && data.lists.length > 0 && landing(data) === null && may(data, 'append'));

  /* THE CARD, ON A RECORD WHERE NOTHING IS ADDED BY HAND YET, until it is pressed, and again once an Undo empties it. */
  const tell = $derived(first && !told && showTell(kept, { ...prefs, madeWith }));

  /*
   * AND ONCE SOMETHING IS IN, THE SLIM LINE (first-hour audit AH9, the call in QUEUE.md "Audit 31 Oct h"): the same
   * rules-only reader, so adding never spends an ask, for a week from when it was first offered here or until hidden,
   * with what was last added said under it (AH23). Not on a record kept for long: one that holds more than a first
   * week's worth by hand is not offered it, whatever this browser remembers.
   */
  /* PER PERSON, AND NOTHING WHILE SEEING AS SOMEBODY (RG11): the lines name who and what the last press added. */
  const tellWho = $derived(seeingAs() === null ? (data.me?.person ?? null) : null);
  let tellKept = $state<TellKept>({});
  let tellFor: string | null = null;
  $effect.pre(() => {
    const at = `${apiBase()} ${tellWho ?? ''}`;
    if (at !== tellFor) {
      tellFor = at;
      tellKept = readTell(apiBase(), tellWho);
    }
  });
  $effect(() => {
    if ((tell || first) && tellKept.from === undefined && added <= SLIM_MOST) tellKept = keepTell(apiBase(), tellWho, { from: Date.now() }, untrack(() => tellKept));
  });
  const slim = $derived(first && !tell && added <= SLIM_MOST && slimShown(tellKept, Date.now()));
  const lastTold = $derived(lastLines(tellKept, Date.now()));
  function keepTold(lines: ToldLine[]) {
    if (lines.length > 0) tellKept = keepTell(apiBase(), tellWho, { last: { at: Date.now(), lines } }, tellKept);
  }

  /* THE NEXT STEPS' OWN CODE, LOADED ON A FIRST TODAY ONLY (`want-more.ts`): it reads every use case this build ships, and
     a Today kept for months never draws a step. Asked once a first Today is known, so it lands a moment after the page.
     NOT WHERE NO STEP CAN DRAW (hidden, or more added than a first Today holds, as `steps` reads it): `first` holds on
     any record its keeper may add to, and the use cases were about 50 KB of a cold phone's Today for nothing. */
  let nextSteps = $state.raw<typeof import('$lib/home/want-more.ts') | null>(null);
  /* AND THE CARD THAT DRAWS THEM, WITH THEM: no step draws before both have landed. */
  let WantMore = $state.raw<typeof WantMoreOf | null>(null);
  $effect(() => {
    if (first && nextSteps === null && prefs.nextStepsHidden !== true && added <= FIRST_TODAY_MOST)
      void Promise.all([import('$lib/home/want-more.ts'), import('$lib/home/WantMore.svelte')]).then(
        ([m, c]) => ((WantMore = c.default), (nextSteps = m)),
        () => undefined,
      );
  });

  /* THE NEXT STEPS, under Today's blocks, on a first Today only: a record kept for months is not offered them, and its
     Today reads as it did. Gone for good once hidden (`nextStepsHidden`). */
  const steps = $derived.by(() => {
    if (!first || prefs.nextStepsHidden === true || added > FIRST_TODAY_MOST) return [];
    if (nextSteps === null) return [];
    return told ? nextSteps.madeSteps(kept.registers, prefs.arrivesBy) : nextSteps.wantMore(kept, { ...prefs, madeWith });
  });

  /**
   * WHAT THE RECORD DECLARES ITS LISTS TO BE, which the card reads a sentence against and Today's week is found in. A
   * tab learns a list's declaration when a reader first asks (`learn`); Home asks for the lists it has not learnt only
   * where it needs them: while the card shows, and where Today's own body is drawn. `learnt` moves when they land.
   */
  let learnt = $state(0);
  const asked = new Map<string, Promise<void>>();
  /* THE LOCAL COPY IS LOOKED IN FIRST (below), for a moment at most: what it holds of the lists is the declarations
     Today was last drawn under, so a warm open asks none of them before its first read. */
  let looked = $state(false);
  /* UNLESS TODAY IS THE TAB'S FIRST SCREEN AND EVERY LIST'S DECLARATION WAS ASKED BESIDE `boot` (`everyAsked`): a list
     learnt is answered from that one read and asks nothing, so Today is not held behind the look in the copy (finish W3:
     on a cold phone the look, with its code, was about 80 ms of the wait before Today was asked, for a copy that was not
     there). A later open learns as before, the copy first: by then the record may have moved past that read. */
  const every = everyAsked(apiBase()) && !firstDrawn();
  $effect(() => {
    if (data.refused || (declares !== null && !tell && !slim) || !(looked || every)) return;
    const missing = data.lists.map((l) => l.id).filter((id) => REGISTERS[id] === undefined);
    /* ALL OF THEM LEARNT ALREADY: said once, so a later read of the shell does not draw Today's body again for nothing.
       AND WITH THE COPY'S PUT BACK, Today is read on them at once, and the few the copy never holds (a list of keys) are
       asked beside it. */
    if (missing.length === 0 || restored.length > 0) {
      if (untrack(() => learnt) === 0) learnt = 1;
      if (missing.length === 0) return;
    }
    const client = createClient({ base: apiBase() });
    void Promise.all(missing.map((id) => learn(client.schema, id, asked))).finally(() => (learnt += 1));
  });
  /** The lists' declarations as this tab has learnt them, read again each time more land. */
  const decls = $derived.by((): WeekDecl[] => {
    void learnt;
    return data.lists.flatMap((l) => (REGISTERS[l.id] ? [REGISTERS[l.id]!] : []));
  });

  /** The record's week, on Today's own body only: a page the record declares draws what it declares. */
  const week = $derived(
    declares === null ? weekOf(decls, playedBy('meets'), new Set(data.lists.flatMap((l) => (l.pack?.startsWith(STARTER_PACK) ? [l.id] : [])))) : undefined,
  );
  /** The people the desk names a few of, on Today's own body only, the same way. */
  const people = $derived(declares === null ? peopleOf(decls, playedBy('meets')) : undefined);

  /* WHAT TODAY'S BODY IS BUILT AROUND, read off the shell, by that same mode's helper: a block over a list the record
     does not keep is not asked for. It carries one of the tasks list as the record words it (`one`), which names the
     line a task is typed into, read again when the voice is heard so a list renamed in Settings › Words renames the
     line too. And the record's week, where Today's own body is drawn over one. */
  const holds = $derived<Holds>({ ...holdsOf(data, heard()), ...(week ? { week } : {}), ...(people ? { people } : {}) });
  const one = $derived(holds.one);

  /** The entries of a list as this tab has named them, by the number a person can say. */
  const knownIn = (register: string | null | undefined) => [...(register ? (TITLES.get(register) ?? []) : [])].map(([seq, name]) => ({ seq, name }));

  /** The reader's name as the bar's face takes it: the record's name for them, else `boot`'s `me.name`. */
  const readerName = $derived.by(() => {
    const id = data.me?.person;
    const named = id && data.names && Object.hasOwn(data.names, id) ? (data.names[id] ?? '').trim() : '';
    return named || (data.me?.name ?? '').trim();
  });

  /** What the card reads a sentence against: the lists, her day, the record's currency, its people and accounts. */
  const tellOptions = $derived.by((): TellOptions => {
    void learnt;
    const lists = tellLists(kept, REGISTERS);
    const into = lists.flatMap((l) => l.fields.filter((f) => f.type === 'ref' && f.required && /account/i.test(`${f.id} ${f.label ?? ''}`)).map((f) => f.to));
    return {
      lists,
      today: dayOn(data.now),
      currency: data.index.currency,
      people: knownIn(playedBy('meets')),
      accounts: into.flatMap((to) => knownIn(to)),
      /* THE ORGANISATIONS KEPT, so the company somebody met is from is linked, never made twice (AM12). */
      orgs: knownIn(lists.find((l) => l.id === PEOPLE)?.fields.find((f) => f.type === 'ref' && f.id === 'org')?.to),
      titled: Object.fromEntries(lists.map((l) => [l.id, knownIn(l.id)])),
      /* WHO IS TELLING IT, never the one their money was paid to (AO12). */
      me: readerName,
    };
  });

  /** The record's answer for Home's page, `null` while it is out or when this host cannot draw Today's body. */
  let got = $state<Opened | null>(null);
  /** Whether the first read has come back, so a host that cannot draw Today's body is told from one still reading. */
  let settled = $state(false);
  /** A read of Home's own is out: `listen` waits for it rather than asking again on top of it. STATE, because the board
      asks Today whole again once it ends (the `phoneOnly` effect), and a plain flag never woke that effect again (R6). */
  let reading = $state(false);

  /**
   * WHAT WAS NEW WHEN HOME'S PAGE WAS LAST READ, which the mark is stamped with on leaving: the record's own cursor for
   * it, how many lines, and the number of the newest. The shell's cursor is as old as the tab, so a line that landed
   * while Home was open, and was drawn here when the page was read again, came back as new on the next visit.
   *
   * ASKED BEFORE THE PAGE READ IT GOES WITH, and kept only once that page is drawn, so the mark does not reach past
   * what this screen held. `null` until one has answered, and the shell's cursor is stamped then, as before.
   */
  type News = { upTo: Cursor | null; unseen: number; held: number; lines: readonly EventLine[] };
  let news: News | null = null;
  /* THE LINES THAT WERE NEW, kept beside the page for the desk's What landed (`landed.ts`). */
  let newLines = $state.raw<readonly EventLine[]>([]);
  /** Which read of the page is the latest: an older one's answer, landing late, is not the page on screen. */
  let pageRead = 0;
  /** The question the page was last asked, and whether that read failed (`readBody`'s effect). */
  let readKey: string | null = null;
  let readFailed = false;
  async function newsNow(): Promise<News | null> {
    try {
      const out = await createClient({ base: apiBase() }).whatsNew();
      if (!out.ok) return null;
      const held = out.value.events.reduce((top, e) => Math.max(top, e.rowid ?? 0), 0);
      return { upTo: out.value.upTo, unseen: out.value.events.length, held, lines: out.value.events };
    } catch {
      return null;
    }
  }
  /**
   * WHAT `boot` ALREADY SAID WAS NEW, for Today's first read on a shell the record answered (scope 2026-10-24 A16): the
   * same lines `whatsNew` would answer, so they are not asked twice. A shell drawn from the copy, or none, asks.
   */
  function newsFirst(): Promise<News | null> {
    const lines = data.newsLines;
    /* ONCE A TAB: `boot` is read as the tab opens and not again into the shell, so a later Today asks for itself. */
    if (bootNewsTaken || !data.live || data.stale || data.offline || lines === undefined) return newsNow();
    bootNewsTaken = true;
    const held = lines.reduce((top, e) => Math.max(top, e.rowid ?? 0), 0);
    return Promise.resolve({ upTo: data.upTo, unseen: lines.length, held, lines });
  }
  /** Keep what was new beside the page just drawn, unless a later read of the page has gone out since. */
  function keepNews(before: Promise<News | null>, mine: number, key: string | null = null): void {
    void before.then((now) => {
      if (now !== null && mine === pageRead) {
        news = now;
        newLines = now.lines;
        if (key !== null && got?.from === 'live') keepPart('body', key, { got, news: now } satisfies KeptBody);
      }
    });
  }

  /**
   * TODAY OPENED AGAIN DRAWS WHAT IT LAST DREW (`today-kept.ts`), and the read below goes on quietly behind it. The key
   * is every input of the read, so a page drawn for another voice or other lists is never drawn for this one.
   */
  type KeptBody = { got: Opened; news: News | null };
  const bodyKey = (slug: string | null, spoken: HomeVoice, held: Holds): string => JSON.stringify([apiBase(), slug, spoken, held]);

  /**
   * TODAY AS THIS BROWSER LAST DREW IT, from the local copy (`local-tab.ts`): drawn at once on an open this tab has drawn
   * nothing for, under the quiet mark, and replaced by the record's answer when it lands. Kept `always`, so it is only
   * ever drawn while the record is asked again. It carries the declarations of every list, so the lists are not asked
   * before the first read; they are asked again once Today has drawn (`verified`), in case one changed since.
   */
  const HOME_COPY = 'Home';
  /** How long the copy waits for the desk to land beside the page before it is kept without it. */
  const DESK_WAIT_MS = 5_000;
  /* A PHONE KEEPS ITS OWN, read without the widgets it hides (`phoneOnly`), so a wider screen never opens on it. */
  const copyKey = (slug: string | null, onPhone: boolean): string => JSON.stringify([apiBase(), slug, ...(onPhone ? ['phone'] : [])]);
  /** Whether an answer was read without the widgets the phone hides (`phone-ask.ts`). */
  const isPhoneOnly = (o: Opened | null): boolean => o?.from === 'live' && (o.page.page as { phoneOnly?: unknown }).phoneOnly === true;
  let fromCopy = $state(false);
  /* AND IT SAYS WHEN IT IS FROM while the record is asked again (`kept-frame.ts`), once that is more than a minute ago:
     what the copy holds is the money as the record last answered, and an old figure is never shown without saying so. */
  let keptLine = $state<string | null>(null);
  /** Whether the copy drew this open: the reads behind it are quiet, as the ones behind what the tab drew are. */
  let copyDrawn = false;
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => holdCopyMark());
  });
  /* TODAY DRAWN FROM THE RECORD IS KEPT AS A PICTURE for the next open to paint before the app has run (`kept-frame.ts`):
     once it has rested, and again as the phone leaves it, so the picture is the last one seen. */
  $effect(() => {
    if (!settled || fromCopy || got?.from !== 'live' || data.refused) return;
    const keepNow = () => {
      if (!untrack(() => boardModel.editing)) void import('./kept-frame.ts').then((m) => m.keepFrame()).catch(() => undefined);
    };
    const rest = setTimeout(keepNow, 3_000);
    const leaving = () => {
      if (document.visibilityState === 'hidden') keepNow();
    };
    document.addEventListener('visibilitychange', leaving);
    return () => {
      clearTimeout(rest);
      document.removeEventListener('visibilitychange', leaving);
    };
  });
  /* AND DRAWN FROM WHAT THIS TAB KEPT OF IT (`today-kept.ts`), its presses wait for the read behind it (`held.svelte.ts`):
     what it kept may be a question somebody has answered since. */
  let fromMemory = $state(false);
  $effect(() => {
    if (!fromMemory) return;
    return untrack(() => holdPresses());
  });
  /**
   * WHETHER THE PAGE UNDER THE HEAD IS DRAWN: once there is a page to draw, from memory, the copy or the record, or once
   * `PAGE_WAIT_MS` has gone without one, when its bars are drawn as before. A copy slower than its wait lands inside it.
   */
  const PAGE_WAIT_MS = 400;
  let waitedPage = $state(false);
  $effect(() => {
    const t = setTimeout(() => (waitedPage = true), PAGE_WAIT_MS);
    return () => clearTimeout(t);
  });
  const shown = $derived(got !== null || settled || waitedPage);
  /** The lists the copy put back, learnt again once the record's own Today has drawn. */
  let restored: string[] = [];
  /** What the copy holds: Today's page, and what was handled beside it, so nothing moves when it lands. */
  type CopyBody = KeptBody & { handled?: HandledFound | null };
  async function drawCopy(slug: string | null, near: Near<CopyBody>): Promise<void> {
    if (got !== null || declares !== slug || near.value.got.from !== 'live') return;
    if (near.value.handled !== undefined && handled === null) handled = near.value.handled;
    got = near.value.got;
    news = near.value.news;
    newLines = near.value.news?.lines ?? [];
    fromCopy = true;
    const now = Date.now();
    keptLine = now - near.kept >= KEPT_SAY_MS ? keptWords.updating(keptWhen(near.kept, now)) : null;
    /* WHAT THE COPY DREW IS THE SCREEN, as what this tab drew is: the read behind it is quiet and lands over it, so the
       screen settles now and does not wait for the record's answer (`fromMemory` below does the same). */
    copyDrawn = true;
    releaseReads();
    painted('Today', 'copy');
  }
  /* TODAY IS BEING READ FROM THE MOMENT IT OPENS: the copy is looked in and the lists learnt before its page is asked, and
     with nothing out meanwhile the screen read as settled over an empty page and gave its sentence's room back. Closed
     when the first read of the page closes. */
  let firstHeld: number | null = null;
  /** Whether the first read was bracketed: once a copy has closed it the bracket is not opened again over the screen. */
  let firstSpent = false;
  const firstClosed = (ok: boolean): void => {
    if (firstHeld === null) return;
    closed(ok, firstHeld);
    firstHeld = null;
  };
  $effect(() => () => firstClosed(true));
  /** The page's read in flight, so a copy drawn first can close its hold on the screen before the record answers. */
  let readHeld: { at: number; done: boolean } | null = null;
  function releaseReads(): void {
    firstClosed(true);
    if (readHeld !== null && !readHeld.done) {
      readHeld.done = true;
      closed(true, readHeld.at);
    }
  }
  $effect(() => {
    if (data.refused) {
      looked = true;
      return;
    }
    untrack(() => {
      if (firstHeld === null && !firstSpent && !settled) firstHeld = opened();
      firstSpent = true;
      /* THE READ'S OWN CODE IS FETCHED NOW, beside the look in the copy and the lists' declarations, and not after them:
         on a cold phone it was about 100 ms between the lists landing and Today being asked (finish W3). */
      void import('$lib/record/page-drawn.ts').catch(() => null);
      void import('./today-read.ts').catch(() => null);
      /* AND THE CODE OF THE TILES TODAY'S EARLY ANSWER SHOWS (`tile-code.ts`), which is in the tab long before that read. */
      if (declares === null) void import('./tile-code.ts').then((m) => m.askEarlyTiles(`${apiBase()}/api/today`, { base: apiBase(), owner: data.me?.owner === true }), () => null);
      const slug = declares;
      const before = new Set(Object.keys(REGISTERS));
      /* EVERY LIST LEARNT ALREADY (Today drawn before in this tab): nothing waits for the copy. */
      if (data.lists.every((l) => REGISTERS[l.id] !== undefined)) looked = true;
      /* AND WHAT THIS TAB DREW IS NEWER THAN THE COPY: it is drawn from memory (`today-kept.ts`), and the copy is not looked in. */
      if (got !== null || Date.now() - drewAt < TODAY_KEPT_MS) {
        looked = true;
        return;
      }
      void Promise.all([import('$lib/data/local-tab.ts'), import('$lib/data/plain.ts')])
        .then(([m, p]) => {
          const revive = (near: Near<unknown>): Near<CopyBody> => ({ ...near, value: p.revivedOf<CopyBody>(near.value) });
          return m.nearLocal<unknown>(HOME_COPY, copyKey(slug, narrow.current), apiBase(), (late) => void drawCopy(slug, revive(late))).then((near) => (near ? revive(near) : null));
        })
        .then(async (near) => {
          if (near) await drawCopy(slug, near);
          restored = data.lists.map((l) => l.id).filter((id) => !before.has(id) && REGISTERS[id] !== undefined);
        })
        .catch(() => undefined)
        .finally(() => (looked = true));
    });
  });
  /**
   * Keep the record's answer in the local copy, for the next open of this browser. A catch-up of the copy landing while
   * Today was read refuses it (the ticket moved); it is kept once the copy has caught up, if nothing has moved since.
   */
  function keepCopy(slug: string | null, out: Opened, said: News | null, mark: number, stamp: string): void {
    if (out.from !== 'live') return;
    /* WHO IT WAS READ FOR, AND WHAT THEY HELD: a grant that moved while it waited (the tab booted again onto a narrower
       share) keeps none of it, though the copy has been claimed again for the same person. */
    const readerOf = (): string => JSON.stringify([data.me.person, data.me.grant?.epoch ?? null, data.me.lens ?? null]);
    const reader = readerOf();
    void Promise.all([import('$lib/data/local-tab.ts'), import('$lib/data/local.ts'), import('$lib/data/plain.ts')]).then(async ([tab, l, p]) => {
      /* EVERY LIST'S DECLARATION GOES WITH IT, but a list the copy never keeps and one that holds a secret. */
      const lists = data.lists.map((x) => x.id).filter((id) => !l.NEVER_KEPT.has(id) && (REGISTERS[id] === undefined || !l.holdsSecret(REGISTERS[id])));
      /* WHAT WAS HANDLED GOES WITH IT AS IT LANDED, so the copy is the whole first screen and not the page alone, with
         the line pushing it down when it lands. The desk's tiles are blocks of the page, so they go with it. */
      await Promise.race([handledLanded, new Promise((done) => setTimeout(done, DESK_WAIT_MS))]);
      let ticket = mark;
      if (tab.localTicket() !== mark) {
        await tab.settledLocal();
        if (asOf() !== stamp || readerOf() !== reader || slug !== declares) return;
        ticket = tab.localTicket();
      }
      if (readerOf() !== reader) return;
      const kept: CopyBody = { got: out, news: said, handled: untrack(() => handled) };
      tab.keepLocal(HOME_COPY, copyKey(slug, isPhoneOnly(out) || untrack(() => narrow.current)), [l.EVERY, ...lists], p.plainOf(kept), ticket, {}, { always: true });
    });
  }
  /* THE LISTS THE COPY PUT BACK ARE ASKED AGAIN once Today has drawn, off its path, and Today reads again if one moved. */
  let verified = false;
  $effect(() => {
    if (!settled || fromCopy || verified || restored.length === 0) return;
    verified = true;
    const lists = restored;
    untrack(() => {
      void idle().then(() => {
        const client = createClient({ base: apiBase() });
        const fresh = new Map<string, Promise<void>>();
        const was = JSON.stringify(lists.map((id) => REGISTERS[id] ?? null));
        void Promise.all(lists.map((id) => learn(client.schema, id, fresh))).then(() => {
          if (JSON.stringify(lists.map((id) => REGISTERS[id] ?? null)) !== was) learnt += 1;
        });
      });
    });
  });

  /** Today's blocks as declared (kept, or the body it is drawn from), which the Inspector changes a widget from. */
  let declaredBlocks = $state.raw<Record<string, unknown>[]>([]);

  /** The slug a kept Today is kept at (`board-write.ts` `KEPT_TODAY`). */
  const KEPT_HOME = 'home';
  /** The records whose kept Today is read as a page: not a board, or a host without `today` by slug. */
  const pageKept = new Set<string>();

  /** A kept board drawn from the record's one `today` read, or `null` to read it as a page. */
  async function keptToday(slug: string, fresh: boolean): Promise<Opened | null> {
    const [m, t, tiles] = await Promise.all([import('$lib/record/page-drawn.ts'), import('./today-read.ts'), import('./tile-code.ts')]);
    const base = apiBase();
    let declared: Record<string, unknown> | null = null;
    let version: number | undefined;
    let answered: unknown = null;
    const drawn = await m.drawnOf({ page: slug, blocks: [] }, base, undefined, async (client) => {
      const asked = await t.askToday(client, base, {}, fresh, slug, [], untrack(() => narrow.current) ? 'phone' : 'wide');
      /* IN TODAY'S WORDS, where it was kept with older ones (`kept-words.ts`, A5). */
      const out = asked.ok ? { ...asked, value: keptWordsNow(asked.value) } : asked;
      if (out.ok) {
        tiles.askTiles((out.value as { blocks?: unknown }).blocks);
        answered = (out.value as { blocks?: unknown }).blocks;
        const said = out.value as { declared?: unknown; declared_version?: unknown };
        if (said.declared !== null && typeof said.declared === 'object' && !Array.isArray(said.declared)) declared = said.declared as Record<string, unknown>;
        if (typeof said.declared_version === 'number') version = said.declared_version;
      }
      return out;
    });
    const decl = declared as Record<string, unknown> | null;
    /* AND THE TILES' OWN FIRST READS, now the page has been read and before it draws (`tile-code.ts` `askReads`). */
    if (drawn.from === 'live') tiles.askReads(answered, { base, owner: data.me?.owner === true });
    if (drawn.from !== 'live' || decl === null || decl.board !== true) return null;
    const { blocks: kept, ...declOwn } = decl;
    declaredBlocks = Array.isArray(kept) ? (kept as Record<string, unknown>[]) : [];
    tilesBeside(base);
    return {
      from: 'live',
      page: { page: { ...(declOwn as unknown as LivePageDecl), page: slug, ...(version === undefined ? {} : { declared_version: version }) }, blocks: quietHeld(drawn.blocks) },
      now: drawn.now,
    };
  }

  /** Home's page, from whichever of the three sources the record holds. */
  async function readBody(slug: string | null, spoken: HomeVoice, held: Holds, fresh = false): Promise<Opened | null> {
    if (slug !== null) {
      /* A KEPT TODAY IS ONE READ: the record's `today`, by its slug, draws the kept page with every tile's part beside it,
         as it draws the body. A kept page that is not a board (arranged before boards), or a host without it, is read as
         any page is, and remembered, so it costs the one read after. */
      if (slug === KEPT_HOME && !pageKept.has(apiBase())) {
        const kept = await keptToday(slug, fresh);
        if (kept !== null) return kept;
        pageKept.add(apiBase());
      }
      const m = await import('$lib/record/page-live.ts');
      return m.pageReader(apiBase()).read(slug);
    }
    /* TODAY'S BODY IS DRAWN BY THE RECORD, never installed: `previewPage` answers the body as `page` answers an installed
       one, each block held to the reader, and writes nothing. `drawnOf` is the one reader of that answer. A host built
       before it reads what went quiet answers that one tile as a refusal, which is not drawn (`quietHeld`). */
    const body = todayHome(held, spoken);
    declaredBlocks = body.blocks as unknown as Record<string, unknown>[];
    /* A PHONE ASKS NO WIDGET ITS BOARD HIDES (`phone-ask.ts`): each comes back declared with nothing drawn, and the board
       on a wider screen or in the editor reads Today again whole (`phoneOnly`). */
    const trim = untrack(() => narrow.current && !boardModel.editing && !boardModel.phoneView);
    const { asked, left } = trim ? phoneAsk(body) : { asked: body, left: [] };
    /* THE SHAPE OF SCREEN IT IS ASKED ON, so the record remembers this body for the next open to ask beside `boot`
       (`app.html`): a phone's trimmed body, or a wider screen's whole one. A phone asking whole (the editor) says none. */
    const shape = trim ? 'phone' : untrack(() => narrow.current) ? undefined : 'wide';
    const leftOut = left as unknown as Record<string, unknown>[];
    /* AND THE DESK'S CARDS' OWN CODE WHILE THE RECORD DRAWS, so they are drawn with the page and take their parts from the
       same read: loaded after the page, the cards and their lines landed after the screen said it was ready. FETCHED
       BESIDE THE READ AND NEVER WAITED ON: their code is slower than the read, and waiting held the whole body back until
       it came, so the body landed as the reader moved on and a list's revisit after Today went from 30 ms to 100. */
    /* ONLY WHERE THE PROJECTS ARE ASKED: a phone leaves them out (`phoneAsk`), and their cards' code was about 40 KB of
       a cold phone's Today for a widget it does not draw. */
    if (asked.blocks.some((b) => (b as { key?: unknown }).key === 'projects')) void import('./ProjectCards.svelte').catch(() => null);
    /* WITH EVERY TILE'S PART BESIDE IT, in the record's one `today` read (`today-read.ts`), which the tiles take theirs from. */
    const [m, t, tiles] = await Promise.all([import('$lib/record/page-drawn.ts'), import('./today-read.ts'), import('./tile-code.ts')]);
    const base = apiBase();
    /* AND THE SHOWN TILES' OWN CODE THE MOMENT THE ANSWER SAYS WHICH THEY ARE (`tile-code.ts`), beside the page reader's. */
    let answered: unknown = null;
    let drawn = await m.drawnOf(asked, base, undefined, async (client) => {
      const out = await t.askToday(client, base, asked as unknown as Record<string, unknown>, fresh, null, leftOut, shape);
      if (out.ok) {
        tiles.askTiles((out.value as { blocks?: unknown }).blocks);
        answered = (out.value as { blocks?: unknown }).blocks;
      }
      return out;
    });
    /* A RECORD BUILT BEFORE BOARDS refuses a board's keys (`board: is not a key a page has`): Today is asked without them
       and laid out from its own body's sizes, so an app ahead of its record still opens Today (audit 30 Oct, item 2). */
    if (drawn.from === 'refused' && /\b(board|phone|size|draft|until)\b/u.test(drawn.fix)) {
      const { board: _b, phone: _p, ...plain } = asked as unknown as Record<string, unknown>;
      const blocks = ((plain.blocks ?? []) as Record<string, unknown>[]).map(({ size: _s, draft: _d, until: _u, ...own }) => own);
      const older = { ...plain, blocks };
      const again = await m.drawnOf(older as never, base, undefined, (client) => t.askToday(client, base, older, fresh, null, leftOut));
      if (again.from === 'live') {
        const sizes = new Map(((body as unknown as { blocks: Record<string, unknown>[] }).blocks ?? []).map((b) => [b.key, b.size] as const));
        drawn = { ...again, blocks: again.blocks.map((b) => (typeof b.key === 'string' && sizes.get(b.key) !== undefined ? { ...b, size: sizes.get(b.key) } : b)) as typeof again.blocks };
      } else drawn = again;
    }
    if (drawn.from === 'live') {
      /* AND THE TILES' OWN FIRST READS, now the page has been read and before it draws (`tile-code.ts` `askReads`). */
      tiles.askReads(answered, { base, owner: data.me?.owner === true });
      const at = drawn.now;
      const blocks = withLeft(drawn.blocks, body.blocks, left, (b) => leftBlock(b, at) as unknown as LiveBlock);
      return {
        from: 'live',
        page: { page: { page: body.page, title: body.title, ...(body.layout ? { layout: body.layout } : {}), ...(body.board ? { board: true } : {}), ...(body.phone ? { phone: body.phone } : {}), ...(left.length > 0 ? { phoneOnly: true } : {}) } as LivePageDecl, blocks: quietHeld(blocks) },
        now: drawn.now,
      };
    }
    if (drawn.from === 'refused') return { from: 'refused', fix: drawn.fix };
    return null;
  }

  $effect(() => {
    /* A RECORD THAT REFUSED `boot` REFUSES THIS TOO, and each refusal is written into its log. */
    if (data.refused) return;
    const slug = declares;
    /* TODAY'S OWN BODY WAITS FOR THE LISTS' DECLARATIONS, so a record that keeps a week opens on it and is not drawn twice. */
    if (slug === null && learnt === 0) return;
    /* NOR IS IT ASKED OVER A SHELL DRAWN FROM THE LAST COPY, which knows neither who reads nor in what words: on his
       record a warm open asked Today's body three times, twice over the copy's shell (not the owner's, the house's words)
       and once over the live `boot`, three bodies the record drew one after another, 5 s of its time with every other
       read waiting behind them. The copy has drawn the screen meanwhile, and the live `boot` asks it once. */
    if (data.stale === true) return;
    const spoken = voice;
    const held = holds;
    const key = bodyKey(slug, spoken, held);
    /* THE SAME QUESTION IS NOT ASKED TWICE: a live `boot` landing behind the copy hands this effect new objects with the
       same words in them, and asked the page again over the one already out. A read that failed is asked again. */
    if (key === readKey && !readFailed) return;
    readKey = key;
    readFailed = false;
    /* DRAWN FROM WHAT TODAY LAST DREW, the screen is settled at once, and the read is not bracketed: it lands over it. */
    /* NOT A PHONE'S COPY ON A BOARD WIDER THAN A PHONE: the key holds no width, and the copy holds four widgets empty. */
    const kept = untrack(() => got) === null ? keptPart<KeptBody>('body', key) : null;
    const was = kept !== null && isPhoneOnly(kept.got) && !untrack(() => narrow.current) ? null : kept;
    if (was) {
      got = was.got;
      news = was.news;
      newLines = was.news?.lines ?? [];
      settled = true;
      fromMemory = true;
      untrack(() => drew('ready'));
      /* WHAT THIS TAB DREW IS THE SCREEN: it is not held as reading for the quiet read behind it. UNTRACKED, as `drew`
         is: closing reads the pending count it writes, and the effect would run again on every call that closes. */
      untrack(() => firstClosed(true));
    }
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const viaCopy = was === null && copyDrawn;
    const at = was || viaCopy ? null : untrack(opened);
    const hold = at === null ? null : { at, done: false };
    readHeld = hold;
    let ok = false;
    reading = true;
    const mark = import('$lib/data/local-tab.ts').then((m) => m.localTicket(), () => 0);
    const stamp = untrack(asOf);
    const mine = ++pageRead;
    /* THE TAB'S FIRST READ OF TODAY TAKES WHAT `boot` SAID WAS NEW; a later one (another voice, lists learnt) asks. */
    const before = mine === 1 ? newsFirst() : newsNow();
    const first = new Promise<void>((done) => setTimeout(done, HANDLED_WAIT_MS));
    /* TODAY'S OWN BODY BRINGS WHAT WAS HANDLED WITH IT (`tilesBeside`), so it waits for nothing beside it. */
    void Promise.all([readBody(slug, spoken, held), slug === null || slug === KEPT_HOME ? null : Promise.race([handledLanded, first])])
      .then(([out]) => {
        if (slug !== declares) return;
        /* A QUIET READ THAT FAILS KEEPS WHAT IS DRAWN, as every quiet read does (`read.ts`): what this tab drew, and what
           the record answered it before, when Today is read again over lists learnt again. Replaced by a refusal or
           nothing, every tile left its cell until the next read. */
        if (out?.from !== 'live' && (was || (untrack(() => got)?.from === 'live' && !untrack(() => fromCopy)))) {
          readFailed = true;
          /* AND THE SCREEN IS NOT MARKED REFUSED over the page it keeps (review of 30 October, R7): it is closed as drawn,
             since it is, and the next read asks again (`readFailed`). */
          ok = true;
          return;
        }
        if (slug === null && out?.from === 'live') tilesBeside(apiBase());
        got = out;
        fromCopy = false;
        ok = out?.from === 'live';
        if (ok) boardLoading = false;
        readFailed = !ok;
        if (ok && out) keepPart('body', key, { got: out, news: null } satisfies KeptBody);
        if (ok) keepNews(before, mine, key);
        if (ok && out) {
          drewAt = Date.now();
          painted('Today', 'network');
          void Promise.all([before, mark]).then(([said, at]) => keepCopy(slug, out, said, at, stamp));
        }
        /* TODAY AS THE RECORD LAST DREW IT IS DRAWN, AND ASKED FOR AGAIN AT ONCE, drawn now (`fresh`), over it. */
        if (ok && (slug === null || (slug === KEPT_HOME && !pageKept.has(apiBase())))) void import('./today-read.ts').then((t) => (t.wasBehind(apiBase()) ? reread() : undefined));
      })
      .catch(() => {
        readFailed = true;
      })
      .finally(() => {
        reading = false;
        /* A READ THAT FAILED STILL ENDS THE BOARD'S WAIT: what is drawn is all there is to settle on. */
        boardLoading = false;
        settled = true;
        fromMemory = false;
        drewFirst();
        if (hold !== null && !hold.done) {
          hold.done = true;
          closed(ok, hold.at);
        }
        /* A READ BEHIND THE COPY STILL SAYS WHEN THE RECORD REFUSED IT. */
        if (viaCopy && !ok) closed(false, opened());
        firstClosed(true);
      });
    /* WHAT LANDED IS DRAWN AS SOON AS IT IS KNOWN, not only with the page under it, so Arrivals does not wait on a slow
       page. The mark still goes only with the page (`keepNews`). */
    if (was === null && untrack(() => got) === null)
      void before.then((now) => {
        if (now !== null && mine === pageRead && untrack(() => got) === null && untrack(() => newLines).length === 0) newLines = now.lines;
      });
  });

  /* A LANDED WRITE, AND A NEW VERSION OF THE RECORD, READ THE PAGE AGAIN without blanking it: a captured task appears,
     an answered question goes, and a conflict is answered over the rows the record holds now. */
  async function reread() {
    if (data.refused) return;
    const slug = declares;
    reading = true;
    const mine = ++pageRead;
    const spoken = untrack(() => voice);
    const held = untrack(() => holds);
    /* A home that draws no feed of the log has shown nothing new, and asks nothing. */
    const mark = import('$lib/data/local-tab.ts').then((m) => m.localTicket(), () => 0);
    const stamp = untrack(asOf);
    const before = untrack(() => feeds) ? newsNow() : null;
    try {
      const out = await readBody(slug, spoken, held, true);
      if (slug === declares && out?.from === 'live') {
        if (slug === null) tilesBeside(apiBase());
        got = out;
        fromCopy = false;
        drewAt = Date.now();
        void Promise.all([before, mark]).then(([said, at]) => keepCopy(slug, out, said ?? untrack(() => news), at, stamp));
        const key = bodyKey(slug, spoken, held);
        keepPart('body', key, { got: out, news: untrack(() => news) } satisfies KeptBody);
        if (before) keepNews(before, mine, key);
      }
    } catch {
      /* The page as it was read stays; the next version asks again. */
    } finally {
      reading = false;
    }
  }

  /* THE SAME BUSY RULE AS `/p/[slug]`: a re-read waits for a field being typed into and for a card's write
     still out (`aria-busy`), on top of Home's own read already being out. */
  listen(reread, () => reading || typing() || document.querySelector('main [aria-busy="true"]') !== null);

  /** After the card's press: it goes, the next steps come, and Today's body is read again, so what it added is drawn at once. */
  function toldOne(lines: ToldLine[] = []) {
    keepTold(lines);
    pressed = true;
    void reread();
  }

  const live = $derived(got?.from === 'live' ? got : null);

  /* WHAT WAITS AND WHO IS WORKING, AS `boot` SAYS IT: the rail's badge and this header say one number, and the
     working tile lists the runs `boot` says are working. `null` from a host older than the field. */
  const waits = $derived.by((): HomeWaits | null => {
    const w = waitsNow();
    return w === null ? null : { questions: w.questions, inbox: w.inbox, working: w.working, seqs: workingNow().map((r) => r.seq), told: toldNow().needs.length };
  });

  /* THE PAGE AS HOME DRAWS IT: its line lifted into the head, each row once, and nothing drawn that holds nothing. */
  const shaped = $derived(live ? homeDrawn(live.page.blocks, live.now, voice, one, waits, declares === null ? holds.week : undefined) : null);

  /* THE LINE `boot`'S COUNTS SAY BY THEMSELVES, for a page that draws nothing it can be counted from; `null` while nothing
     waits, which is the only time the calm line may be said. */
  const waitsLine = $derived(
    waits && (waits.questions > 0 || (waits.told ?? 0) > 0 || (waits.inbox ?? 0) > 0) ? sentenceOf({ needYou: waits.questions + (waits.told ?? 0), agents: waits.working, inbox: waits.inbox ?? 0 }) : null,
  );

  /* THE ONE LINE, worked out from the blocks drawn, else what `boot` says waits, else the page's own line, else the calm
     one once the page is read. */
  const lead = $derived.by(() => {
    if (!shaped) return null;
    if (shaped.sentence) return shaped.sentence;
    if (waitsLine) return waitsLine;
    return { text: shaped.lead ?? nothing, needs: '' };
  });

  /* AND THE MODEL'S LINE OVER IT when the record sent one written today; without one this is `lead` as it was. */
  const line = $derived(lead && shaped && live ? homeLineOf(lead, slashLineOf(shaped, declares === null), live.now) : null);
  const slashed = $derived(line?.by === 'slash' ? cutLine(line) : null);
  /** The red phrase that is the count of what needs you ("8 need you"), which opens Needs you. */
  const NEEDS_DOOR = /^\d[\d,]* needs? you$/u;

  /**
   * TODAY'S OWN BODY IS THE DESK (roadmap slice 1a, the 19 October look): what needs you, who is working and cash, the
   * projects, then Arrivals, what is coming up and people, on one twelve-column board. The rest of the page's blocks are
   * drawn as widgets of the board, each at its size.
   *
   * A PAGE THE PERSON KEPT IS THEIRS AND IS DRAWN AS THEY LAID IT OUT, every block of it.
   */
  /* AND TODAY KEPT AS A BOARD (the widgets plan of 29 October, §4): once he adds to it or arranges it, the record keeps it
     as `home` with `board: true`, and it is drawn as the board it is, not as a page laid out by hand. */
  const keptBoard = $derived(got?.from === 'live' && declares !== null && (got.page.page as { board?: unknown }).board === true);
  const board = $derived(declares === null || keptBoard);


  /**
   * THE TILES COME IN ONCE, ON THE APP'S FIRST LOAD (Today polish 11): a fade and a 4px rise as each lands, and never
   * on a way back, which the page change already moves. Held for the first read and a breath after it, then off, so a
   * tile that comes later (a reread) is simply there.
   */
  let entering = $state(false);
  afterNavigate((nav) => {
    if (nav.type === 'enter' && !enteredOnce && !still()) entering = true;
    enteredOnce = true;
  });
  /* HELD FROM THE FIRST PICTURE, not from the record's answer: a copy drawn first and the answer landing seconds later
     kept the arrival on, and a tile drawn again in that answer rose in a second time (live check of 30 October, 8). */
  const pictured = $derived(got !== null || settled);
  $effect(() => {
    if (!entering || !pictured) return;
    const off = setTimeout(() => (entering = false), ENTER_HELD_MS);
    return () => clearTimeout(off);
  });

  /* THE PAGE AS HOME DRAWS IT, handed to the reader whole, so the reader's writes index the blocks it draws. A rail with
     nothing beside it, or nothing in it, is one column. */
  /** The board and its editor, which the screen hands what it reads (`src`), so it follows without a step between. */
  const boardModel = new BoardModel();
  /** Whether Today still waits for the record's own answer, so the board holds its cells (`Board.svelte` `loading`). */
  let boardLoading = $state(true);
  const deskedRaw = $derived.by(() => {
    if (!got || got.from !== 'live' || !shaped) return null;
    /* THE LATE LIST IS THE LATE TILE'S on the board: the first late block of the page is drawn as the late tile, a line a
       thing with its button, and any other late block is marked not drawn at its place. */
    const lateAt = board ? (late?.at ?? []) : [];
    /* URGENT WORK AND WORK HANDED BACK STAND IN THE LATE BAND, under the late lines, each with its tick: their
       own tiles are not drawn, and with nothing late the first of them carries the band. */
    const bandAt = board ? band.at : [];
    const lateTile = bandShown.length > 0 ? (lateShown.length > 0 ? lateAt[0] : bandAt[0]) : undefined;
    const named = (id: string): string => data.lists.find((l) => l.id === id)?.name ?? '';
    const lateMost = DESK_SHOWS[boardModel.sizeNow('late')];
    const sized = (k: string): number => DESK_SHOWS[boardModel.sizeNow(k)];
    const desk = deskedOf(
      shaped.blocks.map((b, n): Desked<LiveBlock> => {
        if (n === lateTile) return { ...b, drawn: true, desk: { kind: 'late', lines: bandShown, heading: band.lines.length > 0 ? bandHeading(bandShown, late?.more ?? 0, words.band) : late?.heading || voice.overdue, more: late?.more ?? 0, most: board ? lateMost : phone.current ? 3 : 5 } };
        if (lateAt.includes(n) || bandAt.includes(n)) return { ...b, drawn: false };
        /* WHAT ARRIVED IS HOME'S OWN READING (`Landed.svelte`), drawn in the place of the feed it stands for. */
        if (board && b.key === 'arrivals') return { ...b, drawn: false };
        /* A VITAL SIGN READING RED IS SAID UNDER WHAT NEEDS YOU, in its tile (`signsSaid`), not as a tile of its own. */
        if (board && (b.key === 'signs' || b.key === 'signs-many')) return { ...b, drawn: false };
        return b;
      }),
      recordNow(),
      named,
    );
    /* WHO IS WORKING SHOWS WHAT ITS FRAME HOLDS; All agents has the rest. */
    if (!board) return desk;
    return desk.map((b) => (b.desk?.kind === 'working' && b.desk.rows.length > sized('working') ? { ...b, desk: { ...b.desk, rows: b.desk.rows.slice(0, sized('working')) } } : b));
  });

  /** How many lines of the desk's own tiles (what is late, who is working) each frame holds: theirs are tall lines. */
  const DESK_LAPTOP: Readonly<Record<import('braindog-render').WidgetSize, number>> = { small: 1, wide: 1, tall: 3, large: 3, full: 1 };
  /* A PHONE'S LINES WRAP, so its frames hold fewer. */
  const DESK_PHONE: Readonly<Record<import('braindog-render').WidgetSize, number>> = { small: 1, wide: 1, tall: 2, large: 2, full: 1 };
  const DESK_SHOWS = $derived(boardModel.onPhone ? DESK_PHONE : DESK_LAPTOP);

  /** The line a vital sign reading red says, under Needs you on the board: the note's own words, its link the place. */
  const signsSaid = $derived.by((): string | null => {
    if (!board || !shaped) return null;
    const b = shaped.blocks.find((x) => (x.key === 'signs' || x.key === 'signs-many') && x.drawn);
    const body = typeof (b as { body?: unknown } | undefined)?.body === 'string' ? (b as { body: string }).body : '';
    const said = body.replace(/\[([^\]]+)\]\([^)]*\)/u, '$1').replace(/\.$/u, '').trim();
    return b ? (said && !said.includes('{{') ? said : 'A vital sign needs a look') : null;
  });

  /** A block's widget on the board: the late band is Late's wherever it stands, the rest by their own key. */
  const boardKeyOf = (b: { key?: string | undefined; desk?: { kind: string } | undefined } | undefined): string | undefined => (b?.desk?.kind === 'late' ? 'late' : b?.key);

  /* ── the board (the widgets plan of 29 October) ─────────────────────────── */

  /** The reader's day, which a widget with a last day (`until`) is drawn up to and not after. */
  const boardDay = $derived(recordToday(recordNow()));
  /** Whether a block is still on the board today (`stillShown`): nothing is deleted, it is only not laid out. */
  const onBoardToday = (b: unknown): boolean => stillShown(b as Record<string, unknown>, boardDay);
  const boardWidgets = $derived(board && live ? widgetsOf(live.page.blocks.filter(onBoardToday).map((b) => ({ ...b, kind: b.kind }))) : []);
  const boardPhone = $derived(board && live ? (((live.page.page as { phone?: unknown }).phone ?? null) as Phone | null) : null);
  /* WHAT TAKES A CELL: a widget drawn, Needs you always (its foot is the tile when nothing is asked), and Arrivals while
     anything landed. */
  const boardShown = $derived.by((): ReadonlySet<string> => {
    const keys = new Set<string>();
    for (const b of deskedRaw ?? []) if (b.drawn) keys.add(boardKeyOf(b) ?? '');
    if (boardWidgets.some((w) => w.key === 'needs-you')) keys.add('needs-you');
    if (landed.length > 0) keys.add('arrivals');
    return keys;
  });
  /* ON THE BOARD WITH NOTHING TO SHOW NOW (Arrivals once seen, a list with no rows): named while the board is edited.
     Not a vital sign, which is said under Needs you and is never a tile of its own; not before Today has been read. */
  const boardQuiet = $derived.by((): ReadonlySet<string> => {
    if (!deskedRaw) return new Set();
    return new Set(boardWidgets.map((w) => w.key).filter((k) => !boardShown.has(k) && k !== 'signs' && k !== 'signs-many'));
  });
  const boardNames = $derived.by((): ReadonlyMap<string, string> => {
    const out = new Map<string, string>();
    for (const b of deskedRaw ?? []) {
      const k = boardKeyOf(b);
      const desk = (b as Desked<LiveBlock>).desk;
      const name = desk?.kind === 'late' ? desk.heading : typeof b.heading === 'string' ? b.heading : '';
      if (k && name && !out.has(k)) out.set(k, name);
    }
    out.set('arrivals', 'Arrivals');
    return out;
  });
  /** The board's widgets as the sheet reads them (`widgetGallery`'s `board`): what each reads, and whether it drew empty. */
  const sheetBoard = $derived.by((): Record<string, unknown>[] => {
    if (!board || !live) return [];
    const keys = new Set(boardWidgets.map((w) => w.key));
    /* A WIDGET THE PHONE DID NOT ASK FOR (`phoneOnly`) IS NOT EMPTY: nothing was drawn of it because nothing was asked. */
    const unasked = new Set(phoneOnly ? (boardPhone?.hidden ?? []) : []);
    return live.page.blocks.flatMap((b) => {
      const x = b as unknown as Record<string, unknown>;
      if (typeof x.key !== 'string' || !keys.has(x.key)) return [];
      /* EMPTY IS A LIST THAT HELD NO ROW, or a widget not drawn at all; a figure's own rows are not what it shows. */
      const listed = ['list', 'table', 'todo', 'queue', 'feed', 'cards', 'timeline', 'spec'].includes(String(x.kind));
      const out: Record<string, unknown> = { key: x.key, empty: !unasked.has(x.key) && (!boardShown.has(x.key) || (listed && Array.isArray(x.rows) && x.rows.length === 0)) };
      for (const k of ['heading', 'source', 'where', 'metric'] as const) if (typeof x[k] === 'string') out[k] = x[k];
      /* THE NAME IT IS DRAWN UNDER (Arrivals, not the body's "Since you were away"), so the sheet says what Today says. */
      const drawnAs = boardNames.get(x.key);
      if (drawnAs) out.heading = drawnAs;
      return [out];
    });
  });
  /** The widgets drawn as drafts, with their Keep bar: only for whoever may arrange Today, who alone is shown them. */
  const boardDrafts = $derived.by((): ReadonlySet<string> => {
    if (!mayArrange || !board || !live) return new Set();
    return new Set(
      live.page.blocks.flatMap((b) => {
        const x = b as unknown as { key?: unknown; draft?: unknown };
        return typeof x.key === 'string' && x.draft !== null && typeof x.draft === 'object' ? [x.key] : [];
      }),
    );
  });
  /**
   * EACH TILE AS TALL AS WHAT IT HOLDS, on a laptop at rest (`rest-size.ts`, first-hour audit E6): a large Needs you with
   * nothing asked, or a large list with one order in it, is laid one row tall. Read off the blocks as drawn, by the size
   * each was given, so it never feeds the size the rows are cut to.
   */
  const boardRest = $derived.by((): ReadonlyMap<string, WidgetSize> => {
    const out = new Map<string, WidgetSize>();
    if (!board || !deskedRaw || boardModel.onPhone) return out;
    const kinds = new Map(boardWidgets.map((w) => [w.key, w.kind] as const));
    const counted = new Map<string, number | null>();
    for (const b of deskedRaw) {
      const k = boardKeyOf(b);
      if (!k || !kinds.has(k) || counted.has(k)) continue;
      counted.set(k, b.drawn || k === 'needs-you' ? rowsOf(b as unknown as Parameters<typeof rowsOf>[0]) : null);
    }
    /* NEEDS YOU WITH NOTHING ASKED IS ITS FOOT ALONE, the calm line, and a red sign's line under it when there is one. A
       question is a tall line with its answers, so with any asked it keeps its frame. */
    const asked = counted.get('needs-you');
    if (kinds.has('needs-you')) counted.set('needs-you', asked === 0 || asked === null || asked === undefined ? (signsSaid ? 1 : 0) : null);
    /* WHAT LANDED BY THE LINES IT IS DRAWN AS: two writes an hour are one line each (`arrivalsOf`). */
    if (kinds.has('arrivals')) counted.set('arrivals', landedKit ? landedKit.arrivalsOf(landed).length : landed.length);
    for (const [k, rows] of counted) {
      const size = boardModel.sizeNow(k);
      const at = restSize(kinds.get(k)!, size, rows);
      if (at !== size) out.set(k, at);
    }
    return out;
  });
  /**
   * HOW MUCH EACH WIDGET HOLDS, for Today as the record lays it out (never a board he arranged, `keptBoard`): a hole at
   * the end of a row goes to the widget there with the most in it (`filled` in `pack.ts`), so Coming up nine bills deep
   * is drawn across the room People's four faces took.
   */
  const boardWeight = $derived.by((): ReadonlyMap<string, number> => {
    const out = new Map<string, number>();
    if (!board || declares !== null || !deskedRaw || boardModel.onPhone) return out;
    for (const b of deskedRaw) {
      const k = boardKeyOf(b);
      if (!k || out.has(k) || !b.drawn) continue;
      const rows = rowsOf(b as unknown as Parameters<typeof rowsOf>[0]);
      if (rows !== null) out.set(k, rows);
    }
    return out;
  });
  boardModel.src = { widgets: () => boardWidgets, phone: () => boardPhone, shown: () => boardShown, names: () => boardNames, drafts: () => boardDrafts, quiet: () => boardQuiet, rest: () => boardRest, weight: () => boardWeight };
  /* THE DRAFT IS KEPT ON THIS DEVICE UNDER THE RECORD IT IS FOR. */
  boardModel.draftKey = `bd_board_draft:${apiBase()}`;

  /* THE BLOCKS AS THE BOARD DRAWS THEM: each cut to what its frame shows, written in the order the board is read in
     (`pack.ts`), so Tab walks the picture. The reader indexes the blocks it is handed, so the order is made here. */
  const desked = $derived.by(() => {
    const raw = deskedRaw;
    if (!raw) return null;
    if (!board) return { blocks: raw };
    /* A WIDGET THE BOARD GIVES NO CELL (hidden on the phone) IS NOT DRAWN, rather than drawn in the first cell free. */
    const widgetKeys = new Set(boardWidgets.map((w) => w.key));
    const fit = raw.map((b) => {
      const k = boardKeyOf(b);
      if (k && b.drawn && ((widgetKeys.has(k) && boardModel.placeOf(k) === null) || !onBoardToday(b))) return { ...b, drawn: false };
      return k && b.drawn && b.kind !== undefined ? fitted(b, boardModel.sizeNow(k), boardModel.onPhone) : b;
    });
    const rank = new Map(boardModel.keys.map((k, i) => [k, i] as const));
    const at = (b: Desked<LiveBlock>): number => {
      const k = boardKeyOf(b);
      if (b.kind === 'capture' || (b.kind === 'note' && (b as { lead?: unknown }).lead === true)) return -1;
      return k !== undefined && rank.has(k) ? rank.get(k)! : 1000;
    };
    return { blocks: fit.map((b, i) => ({ b, i, r: at(b) })).sort((x, y) => x.r - y.r || x.i - y.i).map((x) => x.b) };
  });

  /** A block's cell on the board, by its index in what the reader is handed. */
  const placed = (i: number) => (board ? boardModel.placeOf(boardKeyOf(drawn?.from === 'live' ? (drawn.page.blocks[i] as Desked<LiveBlock>) : undefined)) : null);
  const drawn = $derived.by((): Opened | null => {
    if (!got || got.from !== 'live' || !desked) return got;
    const blocks = desked.blocks;
    if (railed(blocks)) return { ...got, page: { page: got.page.page, blocks } };
    const { layout: _rail, ...flat } = got.page.page;
    return { ...got, page: { page: flat, blocks } };
  });
  /* THE BOARD'S EDIT HANDLES AND A DRAFT WIDGET'S MARK, LOADED WHEN ONE IS DRAWN: a Today kept as it is never edits its
     board and seldom holds a draft, so their code is not on the cold open's path. */
  /* AND THE OFFER TO CLEAR THE EXAMPLES, which reads the record before it draws anything, so its code comes with that read. */
  let ClearExamples = $state.raw<typeof ClearExamplesOf | null>(null);
  $effect(() => {
    if (ClearExamples === null && data.live) void import('$lib/ui/ClearExamples.svelte').then((m) => (ClearExamples = m.default), () => undefined);
  });
  /* THE DRAFTS FROM WHAT THE PERSON WROTE AT SIGN-UP (1 Nov), read by the model once more after the build: drawn at the
     top of Today while it reads and until each is kept or let go. Its code comes only when there are drafts. */
  let FirstDrafts = $state.raw<typeof FirstDraftsOf | null>(null);
  $effect(() => {
    if (data.live) draftsFor(apiBase());
  });
  const drafting = $derived(Boolean(data.live) && draftsWaiting(apiBase()));
  /* THE FIRST TODAY AFTER A SIGN-UP IN THIS TAB ASSEMBLES, ONCE, as it draws (`assembling.ts`): its project cards and
     first lines rise into place. Any other open of Today draws as it is. */
  let formedOnce = false;
  $effect(() => {
    if (formedOnce || !shown || !data.live) return;
    const k = firstDrafts.now;
    if (k === null || k.base !== apiBase()) return;
    formedOnce = true;
    if (!todayFormedOnce(apiBase())) assemble(ONCE_MS);
  });
  $effect(() => {
    if (FirstDrafts === null && drafting) void import('$lib/start/FirstDrafts.svelte').then((m) => (FirstDrafts = m.default), () => undefined);
  });
  let EditCover = $state.raw<typeof EditCoverOf | null>(null);
  let DraftMark = $state.raw<typeof DraftMarkOf | null>(null);
  $effect(() => {
    if (EditCover === null && boardModel.editing) void import('$lib/board/EditCover.svelte').then((m) => (EditCover = m.default), () => undefined);
  });
  $effect(() => {
    if (DraftMark !== null || !mayArrange || drawn?.from !== 'live') return;
    if (drawn.page.blocks.some((b) => { const d = (b as { draft?: unknown }).draft; return d !== null && typeof d === 'object'; }))
      void import('$lib/board/DraftMark.svelte').then((m) => (DraftMark = m.default), () => undefined);
  });
  const slug = $derived(live?.page.page.page ?? declares ?? 'today');

  /* THE READER THE BODY IS DRAWN BY, whose writes the line in the head adds through (`PageView`'s `capture`). */
  let view = $state<{ capturable: (block: LiveBlock) => boolean; capture: (register: string, text: string, inherited: Record<string, string>) => void }>();

  /* THE LINE A TASK IS TYPED INTO, in the head beside the name, where the page has one and its list can take a line. */
  const capture = $derived(shaped?.capture && view?.capturable(shaped.capture) ? shaped.capture : null);

  /* BESIDE THE NAME FROM 900px, AND UNDER THE SENTENCE ON A PHONE (`PageHead`'s `below`): wrapped out of the name's
     row there, it stood between "Today" and the line that says what today holds. Drawn once, in one place or the other.
     NOT ON THE DESK ON A PHONE, where it pushed what needs you off the first screen: a task is added from the ask bar. */
  const wide = new MediaQuery('(width >= 900px)', true);
  /* A PHONE, where Needs you shows two questions and not three (today F8). */
  const phone = new MediaQuery('(width < 600px)', false);
  /* THE BOARD'S PHONE, two columns under 720px as `Board.svelte` lays it out, which asks Today without what it hides. */
  const narrow = new MediaQuery('(width < 720px)', false);
  /** Whether Today was read without the widgets the phone hides (`phone-ask.ts`). */
  const phoneOnly = $derived(isPhoneOnly(got));
  /* AND READ AGAIN WHOLE where they are wanted: the board wider than a phone, or the editor, where a hidden widget is
     taken out of the tray. Read quietly over what is drawn, as a new version is. */
  /* ONCE FOR EACH ANSWER DRAWN: a whole read that fails leaves `got` as it was, and is not asked again until another
     answer lands, or the effect, now woken by every read's end, would ask it again on every failure. */
  let wholeAsked: Opened | null = null;
  $effect(() => {
    if (!phoneOnly || (narrow.current && !boardModel.editing && !boardModel.phoneView)) return;
    /* NOT OVER A READ STILL OUT: it may have been asked narrow and trimmed, so this runs again when it ends (`reading` is
       state) and asks whole then if what landed is still the phone's (review of 30 October, R6). */
    if (reading) return;
    const now = untrack(() => got);
    if (now === wholeAsked) return;
    wholeAsked = now;
    untrack(() => void reread());
  });

  type HandledFound = import('./handled.ts').Handled;
  /* WHAT BRAINDOG DID BY ITSELF TODAY, said as one line at the foot of Needs you (today F6); nought says nothing. */
  let handled = $state.raw<HandledFound | null>(null);
  /* THE FIRST BODY WAITS FOR THE FIRST HANDLED READ, a short while at most (`HANDLED_WAIT_MS`), so the foot's line is in
     the first picture and never pushes the board down when it lands (CLS, today F1). */
  let handledHeard: () => void = () => {};
  const handledLanded = new Promise<void>((done) => (handledHeard = done));
  const HANDLED_WAIT_MS = 800;
  /**
   * THE VERSION A TILE IS ASKED ONCE AT (`tileOnce`): the record's, as the poll heard it, and this tab's writes. Read in
   * each effect, so a move of the record still asks every tile again.
   */
  const asOf = (): string => `${moving.version} ${wrote()}`;

  /**
   * WHETHER THE MODEL THAT WRITES IS QUIET (`engine-line.ts` `quietLine`): not answering, his key closed, or the
   * month spent. The engine is asked only where a model is behind Slash. While it answers, nothing is said.
   */
  let engine = $state.raw<{ health: EngineHealth | null; month: SlashStatus | null } | null>(null);
  /* ASKED ONCE A VISIT AND NOT ON EVERY MOVE OF THE RECORD (scope 2026-10-24 A16): whether the model answers is not moved
     by an agent's write, and every outside write asked both again. */
  /* AND ONLY ONCE TODAY'S OWN READ HAS LANDED: the record answers one call at a time, and the engine's health, read
     beside the body, held Today's body back behind it for up to three seconds on his record. */
  let engineAsked = false;
  let engineGone = false;
  $effect(() => () => (engineGone = true));
  $effect(() => {
    if (data.refused || page.data.slash !== true || !settled || engineAsked) return;
    engineAsked = true;
    const client = createClient({ base: apiBase() });
    void Promise.all([client.engineHealth().catch(() => null), client.slashStatus().catch(() => null)]).then(([out, month]) => {
      const v = out?.ok ? (out.value as EngineHealth | null) : null;
      const health = v !== null && typeof v === 'object' && 'health' in v ? v : null;
      if (!engineGone) engine = { health, month: month?.ok ? month.value : null };
    });
  });
  const quiet = $derived(quietLine(engine?.health ?? null, engine?.month ?? null, null));

  /**
   * WHAT BRAINDOG DID BY ITSELF TODAY, read beside the page and not after it, since its line is part of the first tile:
   * read late, it pushed the board down as it landed. Kept for the next visit like the desk (`today-kept.ts`).
   */
  $effect(() => {
    if (data.refused) return;
    const ver = asOf();
    const base = apiBase();
    let here = true;
    if (untrack(() => handled) === null) handled = keptPart<HandledFound>('handled', base);
    if (untrack(() => handled) !== null) handledHeard();
    /* ON TODAY'S OWN BODY IT COMES WITH THE BODY, in the record's one read (`tilesBeside`), and is not asked by itself:
       only its code is fetched now, so it is here when the body lands. */
    if (declares === null || (declares === KEPT_HOME && !pageKept.has(base))) return void import('./handled.ts').catch(() => undefined);
    void import('./handled.ts').then(
      async (m) => {
        const found = await tileOnce('handled', base, ver, () => m.loadHandled(base)).catch(() => null);
        if (here) keepPart('handled', base, (handled = found && found.rows.length > 0 ? found : null));
        handledHeard();
      },
      () => handledHeard(),
    );
    return () => {
      here = false;
    };
  });
  /**
   * WHAT WAS HANDLED AND WHAT IS SHARED OUT, BESIDE TODAY'S OWN BODY: the parts of the record's one `today` read
   * (`today-read.ts`) that are Home's own, taken as the body lands. A host without `today` holds none, and each is asked
   * by itself, as before.
   */
  function tilesBeside(base: string): void {
    const ver = asOf();
    /* THE BOARD'S LAST CELL, asked apart from Today's read once it has landed (`askOffer`), once a version. */
    void import('./today-read.ts')
      .then((t) => tileOnce('offer', base, ver, () => t.askOffer(createClient({ base }), base)))
      .catch(() => undefined);
    void import('./today-read.ts')
      .then((t) => t.todayHeld(base))
      .then(async (got) => {
        const m = await import('./handled.ts');
        const found = got ? m.handledOf({ ok: true, value: got.handled }) : await tileOnce('handled', base, ver, () => m.loadHandled(base)).catch(() => null);
        keepPart('handled', base, (handled = found && found.rows.length > 0 ? found : null));
        handledHeard();
        if (!data.me?.owner || data.stale) return;
        if (got) return void (sharedNow = sharedFrom(got.shared));
        const out = await createClient({ base }).call<unknown>('sharedOut').catch(() => null);
        sharedNow = out?.ok ? sharedFrom(out.value) : undefined;
      })
      .catch(() => handledHeard());
  }
  const handledCount = $derived(handled ? handled.rows.length + handled.more : 0);
  /* WHAT AGENTS ASKED HIM BACK AND WHAT THEY FINISHED TODAY, of what he told them, as the shell last read it (`told-now`). */
  const toldNeeds = $derived(toldNow().needs.map((t) => toldNeedOf(t, toldNow().agents)));
  const finishedBy = $derived(doneToday(toldNow().done, recordNow()).map((t) => answeredBy(t, toldNow().agents)));

  /* WHAT LANDED SINCE THE READER LAST LOOKED, a line each, from Home's own read of what is new (`landed.ts`), which the
     read mark is stamped from. ENOUGH LINES TO GROUP (`arrivalsOf`), which then shows the newest few. THE KERNEL'S OWN
     LISTS (runs, what he told them) are nothing he filed, by their declaration (`kernel`). */
  const LANDED_READ = 40;
  /* ITS CODE LOADS ONCE A LINE IS NEW, as it did inside the desk before the desk's tiles were blocks: a first open with
     nothing new waits for none of it, and Arrivals draws nothing for nothing anyway. */
  let landedKit = $state.raw<{ Part: typeof import('./Landed.svelte').default; landedOf: typeof import('./landed.ts').landedOf; arrivalsOf: typeof import('./landed.ts').arrivalsOf } | null>(null);
  $effect(() => {
    if (newLines.length > 0 && landedKit === null)
      void Promise.all([import('./Landed.svelte'), import('./landed.ts')]).then(([c, m]) => (landedKit = { Part: c.default, landedOf: m.landedOf, arrivalsOf: m.arrivalsOf }), () => undefined);
  });
  const landed = $derived.by(() => {
    if (landedKit === null) return [];
    const own = new Set(data.lists.filter((l) => (l as { kernel?: true }).kernel === true).map((l) => l.id));
    return landedKit.landedOf(newLines, new Map(data.lists.map((l) => [l.id, l.name])), data.me?.person ?? null, data.now, new Map(Object.entries(data.names ?? {})), LANDED_READ, own);
  });
  const selfName = $derived(data.me?.person && data.names && Object.hasOwn(data.names, data.me.person) ? (data.names[data.me.person] ?? null) : null);

  /* WHETHER THE PAGE DRAWS ITS NEEDS YOU QUESTIONS, so the foot is the tile's lower part, or the whole tile at nought. */
  const needsDrawn = $derived((desked?.blocks ?? []).some((b) => b.key === 'needs-you' && b.drawn));

  /* NOTHING TO DRAW AT ALL: the line says so, and nothing under it. A host that cannot draw Today's body is calm too. */
  const calm = $derived((shaped !== null && !drawsAny(shaped.blocks)) || (settled && got === null));

  /* WHETHER THE PAGE'S READER IS DRAWN. */
  const reader = $derived((drawn !== null && (!calm || Boolean(shaped?.capture))) || !settled);

  /* ── the board's editor, written ── */

  /** Steps laid on Today at once (a widget taken off, a draft kept or thrown away), said with `said` and its Undo. */
  async function boardStep(steps: import('$lib/board/steps.ts').Step[], said: string | null): Promise<void> {
    const { stepToday } = await import('$lib/board/add-today.ts');
    const out = await stepToday(apiBase(), steps);
    if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
    if (said !== null) toasts.push(said, { undo: () => void out.undo?.().then(() => reread()) });
    await reread();
  }

  /** The words a drafted widget's presses say. */
  const draftSaid = { kept: 'Kept on Today.', gone: 'Thrown away.', made: 'On Today as a draft. Keep it or throw it away.', again: 'Here is another.' } as const;

  /** A widget from the sheet, on Today at once with its Undo, and the board read again (§5.6). */
  async function boardAdd(block: Record<string, unknown>, size: import('braindog-render').WidgetSize): Promise<void> {
    const { addToToday, addWords } = await import('$lib/board/add-today.ts');
    const out = await addToToday(apiBase(), block, size);
    if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
    toasts.push(addWords.addedPlain, { intent: 'good', undo: () => void out.undo?.().then(() => reread()) });
    await reread();
  }

  /** Make your own (the sheet's W4): what he said, landed on Today as a draft he keeps or throws away. */
  async function boardMake(made: { block: Record<string, unknown>; size: import('braindog-render').WidgetSize; said: string }): Promise<void> {
    const { key: _k, ...own } = made.block;
    const draft = own.draft !== null && typeof own.draft === 'object' ? own.draft : { by: 'Slash', why: made.said };
    await boardStep([{ add: { ...own, size: made.size, draft }, before: null }], draftSaid.made);
  }

  /** A draft tried again: another from the same words, set where the first stood. */
  async function draftAgain(key: string, block: Record<string, unknown>): Promise<void> {
    const [{ composeOn }, { kept, draftOf }] = await Promise.all([import('$lib/board/compose.ts'), import('braindog-render/widget-compose')]);
    const mark = draftOf(block);
    if (mark === null) return;
    const made = await composeOn(apiBase(), mark.why, undefined, [kept(block)]);
    if ('fix' in made) return void toasts.push(made.fix, { intent: 'warn' });
    await boardStep([{ set: key, block: { ...made.block, draft: { ...mark, ...(made.cost ? { cost: made.cost } : {}) } } }], draftSaid.again);
  }

  /** A widget as Today declares it, with what the Inspector changed in this edit laid over it. */
  const declaredOf = (key: string): Record<string, unknown> | null => {
    const b = declaredBlocks.find((x) => x.key === key);
    return b ? { ...b, ...(boardModel.changed[key] ?? {}) } : null;
  };

  /** The widget the Inspector is open on, while editing. */
  const inspectedWidget = $derived.by(() => {
    const key = boardModel.inspected;
    if (key === null || !boardModel.editing) return null;
    const block = declaredOf(key);
    return block ? { key, block, size: boardModel.sizeNow(key) } : null;
  });
  boardModel.inspects = true;

  /**
   * Whether this reader may arrange Today: whoever keeps the record arranges the record's, and every other person signed
   * in arranges their own (W8), which the record keeps as theirs. Not while seeing as somebody, which writes nothing.
   */
  const mayArrange = $derived((Boolean(data.me?.owner) || (Boolean(data.me?.person) && seeingAs() === null)) && !data.refused && !data.stale);

  /**
   * DONE (§5.5): the steps between where the edit started and where it ended, written once as a new version of Today, with
   * "Today is arranged." and a 6 s Undo. The board keeps what was made on screen while the record takes it, so nothing
   * jumps back. A Today the record does not keep yet is kept from the body it is drawn from.
   */
  async function boardDone(): Promise<void> {
    const steps = boardModel.steps();
    if (steps.length === 0) return boardModel.cancel();
    boardModel.close();
    const base = apiBase();
    const [w, h] = await Promise.all([import('$lib/board/board-write.ts'), import('$lib/page/home-arrange.ts')]);
    const kept = declares !== null;
    const body = kept ? null : { ...h.whileHeld(JSON.parse(JSON.stringify(todayHome(untrack(() => holds), h.HOUSE_VOICE)))), page: w.KEPT_TODAY };
    const out = await w.writeBoard(base, w.KEPT_TODAY, steps, body, null);
    if (out.from !== 'written') {
      boardModel.landed();
      toasts.push(`${boardWords.editedNot} ${out.fix}`, { intent: 'bad' });
      return;
    }
    const before = out.before;
    const own = out.own === true;
    toasts.push(boardWords.edited, {
      undo: () => {
        void w.unwriteBoard(base, w.KEPT_TODAY, before, undefined, own).then(async () => {
          if (before === null) await h.reboot();
          void reread();
        });
      },
    });
    /* A TODAY JUST KEPT IS READ FROM WHERE IT IS KEPT: the shell learns the page, and the board draws from it. */
    if (!kept) await h.reboot();
    await reread();
    boardModel.landed();
  }

  /* A RECORD WITH NO LISTS AT ALL goes to the prompt (`+layout.ts`); this is what is left if it is reached anyway. */
  const empty = $derived(data.index.registers.length === 0 && data.lists.length === 0 && data.open === 0);

  /**
   * TODAY SPEAKS FIRST: on the board, over the tiles, a greeting by the time of day and his
   * name, and nothing more since 23 October: what is late and what needs him are the tiles' to say. The
   * head keeps only the phone's bar, and the date and the
   * sun glyph go: the tab already says where he is. Not on a first Today, which opens on its card, nor a kept page, which
   * is drawn as its owner laid it out.
   */
  const headed = $derived(board && !tell && !data.refused && !empty);

  /** The greeting, by the reader's name as the bar's face takes it: the record's name for them, else `boot`'s `me.name`. */
  const greeting = $derived(greetingOf(data.now, readerName));

  /* THE BAR SAYS THE GREETING, ONCE (29 October): its crumb ends on it in place of "Today", and the greeting here is the
     unseen `h1` wherever a bar is drawn. */
  $effect(() => {
    if (!headed) return;
    const said = greeting;
    frame.heading = said;
    return () => {
      if (frame.heading === said) frame.heading = '';
    };
  });

  /* TODAY'S LATE LIST, read off the page as Home shaped it: what the brief names, and the Late tile at the top of the
     desk shows with a button each, in the brief's order and less what a question in Needs you already asks about
     (`unasked`). ONE THING IS ONE LINE: a payment kept in two lists is said once, by the row a press can finish
     (`onceEach`). */
  const late = $derived(board && shaped ? lateOf(shaped.blocks) : null);
  const lateLines = $derived(late ? onceEach(late.lines, (line) => verbOf(line, (list) => may(data, 'write', list)) !== null) : []);
  const queued = $derived(shaped?.blocks.find((b) => b.key === 'needs-you')?.queue ?? []);
  const lateShown = $derived(inBriefOrder(unasked(lateLines, queued)));
  const band = $derived(board && shaped ? bandOf(shaped.blocks, { urgent: words.urgent, back: words.toCheck }, { urgent: words.urgentWhy, back: words.backWhy }, new Set(lateLines.map((l) => l.key))) : { lines: [], at: [] });
  const bandShown = $derived([...lateShown, ...unasked(band.lines, queued)]);

  /* WHERE A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD LANDS (`landing.ts`), and `null` for everybody else. */
  const lands = $derived(landing(data));

  /**
   * THE MARK IS STAMPED WHEN THE READER LEAVES, and only when Home drew what is new: a use case's page with no feed has
   * shown nothing to mark read. `pagehide` covers a closed tab, and the effect's end covers leaving for another screen.
   *
   * THROUGH THE ONE STAMP (`lib/page/read-mark.ts`), which Activity uses too: one mark a visit, and a mark that did not
   * land leaves the record's where it was and is tried at the next leave, so the same lines come back rather than
   * being lost.
   *
   * WITH THE NEWEST LINE THIS SCREEN DREW (`readMarkOf`), not the shell's cursor alone, which is as old as the tab: what
   * was new when the page was last read (`news`). Until that has answered the shell's cursor is the one sent. A shell
   * that held nothing new has no cursor, and no cursor is no mark: a bare one would mark lines this screen never held.
   *
   * THE RECORD IS NAMED WHEN THE SCREEN OPENS. By the time it ends the address is already the next screen's, and that
   * may be another record's.
   *
   * `markAll` IS HERE BEFORE THE READER LEAVES, imported with the screen. It used to be fetched inside the leave, and a
   * closing tab does not wait for a module: the request was never made, so what was new stayed new at the next visit.
   * Now the leave reaches the record in the same turn, and the client asks that the request outlive the page.
   */
  const feeds = $derived((live?.page.blocks ?? []).some((b) => b.kind === 'feed' && b.source === 'activity'));
  $effect(() => {
    const base = apiBase();
    const stamp = stampOf((upTo) => markAll(base, upTo));
    const leave = () => {
      if (data.refused || !feeds) return;
      const upTo = news ? readMarkOf(news.upTo ?? data.upTo, news.unseen, news.held) : readMarkOf(data.upTo, data.upTo === null ? 0 : 1);
      void stamp.leave(upTo);
    };
    addEventListener('pagehide', leave);
    return () => {
      removeEventListener('pagehide', leave);
      untrack(leave);
    };
  });

  /**
   * THIS SCREEN SAYS WHEN IT HAS DRAWN through `data-screen` on `<main id="main">`. The page read is bracketed with
   * `opened()` and `closed()`, and a call still out takes the attribute away whatever this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<!-- THE PAGE'S NAME WITH ITS ICON, as every place's header draws it, the day over it and the one line under it. On the
     desk the head is the greeting and the brief over the board (`headed`), and this keeps only the phone's bar. -->
<PageHead
  {title}
  icon="today"
  tiled={headed}
  kicker={today}
  sentence={tell ? TELL_LINE : slashed ? slashSaid : lead ? leadSaid : undefined}
  heldLines={board ? 3 : 1}
  heldText={waitsLine?.text ?? nothing}
  actions={capture && wide.current && !board ? headCapture : undefined}
  below={capture && !wide.current && !board ? headCapture : undefined}
/>

<!-- THE MODEL THAT WRITES IS QUIET: one quiet line under a kept page's head, and nothing while it answers. On the desk the
     same line stands under the brief. -->
{#if quiet && !headed}
  <p class="home-engine" role="status">{quiet}</p>
{/if}

<!-- THE LINE A TASK IS TYPED INTO, at the right of the name (one line of its own under the sentence on a phone). -->
{#snippet headCapture()}
  {#if capture}<HeadCapture block={capture} oncapture={(register, text, inherited) => view?.capture(register, text, inherited)} />{/if}
{/snippet}

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

<!--
  THE RULES' LINE (Today polish 7): its figures at 600, and the phrase that needs the reader in the red. "8 need you" is
  the door to Needs you; any other red phrase (what is late, on a calm day) is words.
-->
{#snippet leadSaid()}
  {#if lead}
    {#each partsOf(lead.text, lead.needs || undefined) as part, n (n)}{#if part.needs && NEEDS_DOOR.test(part.text)}<a class="home-needs tap" href={inApp('/decide')} data-needs>{part.text}</a>{:else if part.needs}<span data-needs>{part.text}</span>{:else if part.fig}<b class="home-fig">{part.text}</b>{:else}{part.text}{/if}{/each}
  {/if}
{/snippet}

<!-- ARRIVALS, what landed since the reader last looked, left out where nothing did. -->
{#snippet landedPart()}
  {#if landedKit}
    {@const Landed = landedKit.Part}
    <Landed rows={landed} review={waits?.inbox ?? 0} self={selfName} />
  {/if}
{/snippet}

<!-- THE FOOT OF NEEDS YOU: the late bills and what BrainDog did itself, or the whole tile with nothing to ask. -->
{#snippet needsFoot()}
  {#if shaped}
    <NeedsFoot alone={!needsDrawn} heading={voice.needsYou} late={late ? null : shaped.lateBills} handled={handledCount} told={toldNeeds} finished={finishedBy} shared={sharedNow} calm={words.nothingNeedsYou} />
  {/if}
{/snippet}

<!-- HOME'S OWN PARTS ON THE BOARD, each in its widget's cell: Needs you's foot when nothing is asked (the whole tile
     then), and what arrived, in the place of the feed it stands for. -->
{#snippet amid(i: number)}
  {@const b = drawn?.from === 'live' ? drawn.page.blocks[i] : undefined}
  {#if b?.key === 'needs-you' && !b.drawn}
    {@render part('needs-you', needsFoot)}
  {:else if b?.key === 'arrivals' && landed.length > 0}
    {@render part('arrivals', landedPart)}
  {/if}
{/snippet}

{#snippet part(key: string, body: import('svelte').Snippet)}
  {@const cell = boardModel.placeOf(key)}
  {#if cell}
    <div class="board-part" data-board-key={key} data-size={cell.size} style="grid-area:{cell.area}">
      {@render body()}
      {#if boardModel.editing && EditCover}<EditCover model={boardModel} {key} />{/if}
    </div>
  {/if}
{/snippet}

<!-- INSIDE A WIDGET'S TILE: Needs you's foot under its questions, and the board's handles while it is edited. -->
{#snippet inside(i: number)}
  {@const b = drawn?.from === 'live' ? (drawn.page.blocks[i] as Desked<LiveBlock>) : undefined}
  {@const key = boardKeyOf(b)}
  {#if b?.key === 'needs-you'}
    {#if signsSaid}<a class="signs-line" href={inApp('/p/health')}>{signsSaid}</a>{/if}
    {@render needsFoot()}
  {/if}
  {@const draft = (b as { draft?: unknown } | undefined)?.draft}
  {#if DraftMark && mayArrange && key && !boardModel.editing && draft !== null && typeof draft === 'object'}
    {@const own = declaredOf(key)}
    <DraftMark draft={draft as { by?: unknown; why?: unknown }} name={boardModel.nameOf(key)} onkeep={() => boardStep([{ keep: key }], draftSaid.kept)} ondiscard={() => boardStep([{ remove: key }], draftSaid.gone)} onagain={own ? () => draftAgain(key, own) : undefined} />
  {/if}
  {#if boardModel.editing && EditCover && key && boardModel.placeOf(key)}<EditCover model={boardModel} {key} />{/if}
{/snippet}

<!-- THE READER, the one for a board and for a page laid out by hand. -->
{#snippet readerPart()}
  {#if reader && PageView}
    {#if board}
      <PageView bind:this={view} {slug} got={drawn} mode="home" {reread} between={amid} {placed} {inside} />
    {:else}
      <PageView bind:this={view} {slug} got={drawn} mode="home" {reread} />
    {/if}
  {/if}
{/snippet}


<!-- NOT DRAWN UNTIL TODAY HAS SOMETHING TO DRAW (`shown`), a moment at most: a page of bars drawn first and then pushed
     down by the copy's desk and sentence was a jump on every warm open. Drawn at once, they arrive together. The wait is
     a mark at the page's end, so the page keeps its bare tag and the head's rules still reach it. -->
<div class="page">
  {#if data.refused}
    <!--
      THE RECORD WOULD NOT ANSWER THIS READER, WHICH IS NOT THE SAME THING AS AN EMPTY RECORD. A colleague invited with
      `Adds only` is refused `boot` with the record's own sentence, which names the person who can help, and under it the
      one thing that is hers to do: make her agent's key (`onAppendOnly`). And a record that could not be reached is not
      a refusal: the one offline sentence with Retry, and the client's own reason under Details.
    -->
    {#if data.refused.code === 'UNREACHABLE'}
      <Empty kind="error" title={copy.readOffline} detail={data.refused.fix}>
        {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{copy.readRetry}</Button>{/snippet}
      </Empty>
    {:else if onAppendOnly(data.refused)}
      <Empty kind="no-permission" title={data.refused.fix}>
        {#snippet actions()}<Button weight="primary" href="/settings/agents">{copy.inviteMakeAgentKey}</Button>{/snippet}
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
    {#if data.live && ClearExamples}<ClearExamples />{/if}

    <!-- WHAT THE MODEL FOUND IN THE SIGN-UP WORDS BEYOND THE BUILD, each a draft kept with one press (1 Nov). -->
    {#if drafting && FirstDrafts}<FirstDrafts options={tellOptions} />{/if}

    <!-- A FIRST TODAY OPENS ON THE CARD: one real thing, read into the entries it becomes, added on one press. -->
    {#if tell}<TellOne options={tellOptions} onadded={toldOne} />{:else if slim}<TellOne
        slim
        options={tellOptions}
        last={lastTold}
        onadded={(lines) => {
          keepTold(lines);
          void reread();
        }}
        onhide={() => (tellKept = keepTell(apiBase(), tellWho, { hidden: true }, tellKept))}
      />{/if}

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
      <Empty kind="cleared" title={waitsLine?.text ?? nothing} body={said('fills_with')} />
    {/if}

    <!-- A PAGE THE PERSON KEPT: Arrivals over it, as before, and their page under it as they laid it out. -->
    {#if !board}{@render landedPart()}{/if}

    <!--
      TODAY SPEAKS FIRST, AND ONLY TO GREET (23 October, his word: the sentence under it "summarizes everything that's
      already shown in the late"): the greeting is the screen's `h1`, and what is late, what needs him and who is working
      are the tiles under it, said once there and not twice.
    -->
    {#if headed}
      <header class="today-head" data-barred={barTitled() ? '' : undefined}>
        <h1 class="today-hi" tabindex="-1">{greeting}</h1>
      </header>
    {/if}

    <!--
      THE DESK (`board`): one twelve-column board that the desk's parts and the page's blocks are laid out on together,
      each where the 19 October desk puts it. A kept page is its own board.
    -->
    <!-- DRAWN FROM THE COPY, IT SAYS WHEN IT IS FROM until the record answers (`kept-frame.ts` lays the same line in). -->
    {#if fromCopy && keptLine}<p class="kept-line" role="status">{keptLine}</p>{/if}
    <div class="body" data-board={board ? '' : undefined} data-enter={entering ? '' : undefined}>
      <!-- A CALM PAGE WITH A LINE IN ITS HEAD STILL DRAWS ITS READER, which holds the writes the line adds through. -->
      {#if board}
        <!-- TODAY IS A BOARD OF WIDGETS (the widgets plan of 29 October): each in its cell, and the editor over them. -->
        <Board model={boardModel} loading={boardLoading} mayEdit={mayArrange} ondone={() => void boardDone()} onadd={boardAdd} onremove={(key) => boardStep([{ remove: key }], null)} onmake={boardMake} widgets={sheetBoard}>{@render readerPart()}</Board>
        {#if inspectedWidget}
          <!-- THE INSPECTOR (W4): what a tapped widget shows, in one sentence; its changes are kept with the edit's Done. -->
          {#await import('$lib/board/Inspector.svelte') then { default: Inspector }}<Inspector
            bind:open={() => boardModel.inspected !== null, (v) => { if (!v) boardModel.inspected = null; }}
            widget={inspectedWidget as never}
            sizes={boardModel.sizesFor(inspectedWidget.key)}
            phoneHidden={boardModel.phoneHidden(inspectedWidget.key)}
            onchange={(key, block) => boardModel.setBlock(key, block as Record<string, unknown>)}
            onsize={(key, size) => boardModel.sizeTo(key, size)}
            onhidephone={(key, hidden) => boardModel.hideOnPhone(key, hidden)}
            onremove={inspectedWidget.key === 'needs-you' || inspectedWidget.key === 'late' ? undefined : (key) => boardModel.hide(key)}
          />{/await}
        {/if}
        {#if mayArrange && !boardModel.editing && settled && shaped && drawsAny(shaped.blocks)}
          <div class="board-foot"><Button weight="quiet" size="sm" onclick={() => boardModel.enter()}>{boardWords.editToday}</Button></div>
        {/if}
      {:else}
        {@render readerPart()}
      {/if}
    </div>

    <!-- AND UNDER TODAY, THE NEXT STEPS, until they are hidden. -->
    {#if steps.length > 0 && WantMore}<WantMore {steps} onhide={() => (prefs = readPref())} />{/if}
  {/if}
  {#if !shown && !data.refused}<span class="page-wait" hidden></span>{/if}
</div>

<style>
  /* ── the head ─────────────────────────────────────────────────────────── */

  /* THE RULES' LINE (Today polish 7): its figures at 600 in the ink, and "8 need you" in the red at 600, the door to
     Needs you, underlined only under the pointer. */
  .home-fig {
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
  }

  .home-needs {
    color: var(--red);
    font-weight: var(--fw-semi);
    text-decoration: none;
    border-radius: var(--r-xs);
  }

  @media (hover: hover) and (pointer: fine) {
    .home-needs:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* THE LINE IS ITS SENTENCE'S ONE CHILD, so a block of its own changes nothing it draws; it holds who said it. */
  .home-line {
    position: relative;
    display: block;
    border-radius: var(--r-xs);
    outline-offset: 4px;
  }

  /* WHO SAID IT: 13 in `--ink-3`, under the line and out of the flow, so showing it moves nothing. Not drawn at rest. */
  .home-by {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 0;
    margin-block-start: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* THE QUIET LINE UNDER A KEPT PAGE'S HEAD, while the model that writes is not answering: meta, in the quiet ink. */
  .home-engine {
    margin: 0;
    padding: 0 var(--gutter);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* ── the head: the greeting and the brief ─────────────────────────── */

  /* ON THE BOARD, NOT ON A TILE (the approved look of 19 October): the greeting at 34/40 in the display face (28/34 on a
     phone, `--fs-hero`). */
  .today-head {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .today-hi {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: var(--fw-semi);
    line-height: 40px;
    letter-spacing: -0.01em;
  }

  /* THE BAR SAYS IT: the greeting stays the screen's `h1` for a screen reader and the focus a move lands, drawn nowhere. */
  .today-head[data-barred] {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .today-hi:focus:not(:focus-visible) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  @media (width < 640px) {
    .today-hi {
      line-height: 34px;
    }
  }

  /* ON A PHONE, the tiles read as the desk's phone board read them. */
  @media (width < 600px) {
    /* AT WORK, TWO SHORT LINES A RUN: who and when, then what it is doing cut at the line's end; the rest is on Agents.
       On one line the name and the time left the work four letters. */
    .body[data-board] :global([data-working] .run :is(.r-doing, .r-holds)) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .body[data-board] :global([data-working] .run) {
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas:
        'face who time do'
        'face doing doing do';
    }

    .body[data-board] :global([data-working] .run :is(.r-holds, .r-project)) {
      display: none;
    }

    .body[data-board] :global([data-working] .run .r-face) {
      align-self: center;
      padding-block-start: 0;
    }

    /* THE FIRST QUESTION IS ANSWERED WHERE IT STANDS, at most two lines with "Read all" for the rest. */
    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa:first-child .queue-question) {
      line-clamp: 2;
      -webkit-line-clamp: 2;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa :is(.dc-actions, .dr-actions)) {
      display: none;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .queue-card) {
      position: relative;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .queue-question) {
      overflow: hidden;
      line-clamp: 2;
      -webkit-line-clamp: 2;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .dc-read) {
      display: none;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .dc-open::after) {
      content: '';
      position: absolute;
      inset: 0;
    }

    /* THE LAST ROW CLOSES ON A HAIRLINE LIKE THE REST, and the door to the others is a row under it: a question with no
       line under its title otherwise ended in its own air and the link's, which read as a hole in the tile. */
    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa:last-of-type .queue-card) {
      padding-block-end: var(--sp-3);
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > a.queue-more) {
      display: flex;
      max-inline-size: none;
      border-block-start: 1px solid var(--rule);
    }
  }

  /* ── the page ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN, the page's own: its blocks carry their spans and its rail, and Home adds no column of its own beside it. */
  .page:has(> .page-wait) {
    display: none;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-7);
    min-inline-size: 0;
  }

  .body {
    min-inline-size: 0;
  }

  /* WHEN A COPY IS FROM, in the offline line's muted words. GLOBAL UNDER THE PAGE because `app.html` lays the same line
     into the kept picture (`kept-frame.ts`), where it carries no scoped class. */
  .page :global(.kept-line) {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* ── the board ─────────────────────────────────────────────────────────
     TODAY IS A BOARD OF WIDGETS (`lib/board/Board.svelte` lays it out, the widgets plan of 29 October): each tile in its
     cell at its size, the content fitting the cell. What is here is how each of Today's own tiles draws itself in a
     frame: Needs you with its foot under it, cash as one figure with its line and two beside it, the lists with their
     "N more" at their foot. */
  .body[data-board] {
    display: grid;
    gap: var(--sp-3);
    position: relative;
  }

  .board-foot {
    display: flex;
    justify-content: flex-end;
  }

  /* NEEDS YOU AND ITS FOOT ARE ONE TILE (today F3): the foot under its questions, at the tile's foot. */
  .body[data-board] :global(.block-slot[data-board-key='needs-you'] > [data-needs-foot]) {
    margin-block-start: auto;
    padding-block-start: var(--sp-1);
    /* THE TILE ALREADY HOLDS ITS INSET (audit 6f AF21): the foot's own put "BrainDog handled 1 today" and its rule 20px in
       from the questions' rules above it. */
    padding-inline: 0;
  }

  /* NEEDS YOU HOLDS TWO QUESTIONS ON A LAPTOP'S LARGE (Q17): each question without its well, so its buttons sit on its
     second line, and the foot's lines at a press's height, not a row's. */
  .body[data-board] :global(.board[data-cols='4'] .block-slot[data-board-key='needs-you'][data-size='large'] .dc-row > .dr-actions) {
    grid-row: 2;
    grid-column: 3;
    justify-self: end;
    margin: 0;
  }

  .body[data-board] :global(.board[data-cols='4'] .block-slot[data-board-key='needs-you'][data-size='large'] .dc-row > .dr-meta) {
    grid-column: 2;
    align-self: center;
  }

  .body[data-board] :global(.block-slot[data-board-key='needs-you'] > [data-needs-foot]) {
    padding-block-start: 0;
  }

  /* 32 TALL UNDER A MOUSE ONLY: under a thumb a line of the foot is a target, and keeps its 44. */
  @media (pointer: fine) {
    .body[data-board] :global(.block-slot[data-board-key='needs-you'] > [data-needs-foot] .nf-line) {
      min-block-size: 32px;
    }
  }

  .body[data-board] :global(.block-slot[data-board-key='needs-you'] > .signs-line) {
    padding-block-start: 0;
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  .body[data-board] :global(.board[data-cols='4'] .block-slot[data-board-key='needs-you'][data-size='large']) {
    padding-block-end: var(--sp-3);
  }

  .body[data-board] :global(.board-part) {
    min-inline-size: 0;
  }

  .body[data-board] :global(.board-part > *) {
    flex: 1;
    min-block-size: 0;
  }

  /* COMING UP'S "16 MORE" IS A LINK, said as a link is: 13/500 in ink, as wide as its words. */
  .body :global(.block-slot[data-key='coming-up'] > a.block-more) {
    align-self: flex-start;
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .body :global(.block-slot[data-key='coming-up'] > a.block-more:hover) {
    text-decoration: underline;
  }

  /* A VITAL SIGN READING RED, one line in the red under what needs you, the link to the place the signs are. */
  /* A 24px TARGET AT THE LEAST, ABOVE THE HIT BOX OF THE LINK OVER IT (audit 31 Oct i, AI5): it was a 20px line whose top
     8px were under the 44px box of "8 more in Needs you". */
  .signs-line {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    min-block-size: 24px;
    margin-block-start: auto;
    padding-block-start: var(--sp-2);
    color: var(--red);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .signs-line:hover {
    text-decoration: underline;
  }

  .signs-line + :global([data-needs-foot]) {
    margin-block-start: 0;
  }

  /* THE LATE TILE FILLS ITS FRAME, its lines at the top and its count at the foot. */
  .body[data-board] :global(.block-slot:has(> .desk-part[data-desk='late'])) {
    display: flex;
    flex-direction: column;
  }

  /* CASH, WIDE (§3.3): the cash now with its line on the left, coming in and going out stacked at the right. */
  /* THE SIDE A LITTLE WIDER (finish F49): at a third "To come in, next 30 days" wrapped beside its figure by a few pixels
     at 1512; now it holds one line there, and the cash's line wraps under its figure, where the frame has room. */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid) {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: var(--sp-5);
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:first-child) {
    grid-row: 1 / span 2;
    grid-column: 1;
    padding-block-end: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2)) {
    grid-column: 2;
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell + .cell) {
    border-block-start: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(3)) {
    border-block-start: 1px solid var(--rule);
  }

  /* ITS LINE IS THE LARGE CASH'S: in a wide frame the cash now, how long it lasts, and the two beside it. */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:first-child :is(.cell-trend, .cell-trend-ahead)) {
    display: none;
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2)) {
    padding-block: var(--sp-2);
  }

  /* AND HOW LONG IT LASTS, WHOLE (finish F49): one line cut it to "Lowest in the next 12 weeks: −£16,…", and a money
     figure is never cut. It wraps under the figure, where the frame has room for a second line. */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:first-child .cell-note) {
    white-space: normal;
    text-wrap: pretty;
  }

  /* AT THE BOARD'S SHORTEST ROW (a laptop window about 1280 wide, his call of 23 Oct): the row is 164 tall and the frame
     under the tile's name 80, where "Cash now" over its figure over two lines of how long it lasts took 104 and the last
     line was cut. Here the label stands on its figure's line, so the note keeps both its lines whole and no row grows;
     a figure too wide to stand beside it wraps back under it, never cut. Today's own short labels hold the side
     figures to one line each (`words.ts` `comingIn`, `goingOut`). Four columns only: a phone's row is its own. */
  @container board (max-width: 1150px) {
    .body[data-board] :global(.board:not([data-cols='2']) .block-slot[data-key='cash'][data-size='wide'] .grid > .cell:first-child) {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      column-gap: var(--sp-2);
      row-gap: var(--sp-1);
    }

    .body[data-board] :global(.board:not([data-cols='2']) .block-slot[data-key='cash'][data-size='wide'] .grid > .cell:first-child .cell-note) {
      flex-basis: 100%;
    }
  }

  .body[data-board] :global(.block-slot[data-board-key='needs-you'] > .signs-line) {
    margin-block-start: var(--sp-1);
  }



  /* UNDER A THUMB THE RED LINE IS A TARGET: its words centred in a 44 tall row, as the foot's lines under it are. */
  @media (pointer: coarse) {
    .signs-line {
      display: flex;
      align-items: center;
      min-block-size: var(--tap);
    }

    /* AND IT STARTS WHERE "7 MORE IN NEEDS YOU" ENDS: that link's 44 reaches 12 under its words, and the red line began 8
       inside it, so the more was 36 tall to a thumb (F34). */
    .body[data-board] :global(.block-slot[data-board-key='needs-you'] > .signs-line) {
      margin-block-start: var(--sp-3);
    }
  }

  /* THE PROJECTS IN A ROW (full): each card its name, its standing and its number, and the rest on Projects. */
  .body[data-board] :global(.block-slot[data-board-key='projects'][data-size='full'] :is(.pc-c, .pc-next, .pc-foot, .pc-move)) {
    display: none;
  }

  .body[data-board] :global(.block-slot[data-board-key='projects'] .desk-part) {
    flex: 1;
    min-block-size: 0;
    overflow: hidden;
  }

  /* THE KEY NUMBERS IN A ROW (full): each its figure and its line, the why under it on Numbers. */
  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] svg:not(.kpi-arrow)) {
    max-block-size: 32px;
  }

  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] :is(.kpi-stale, .kpi-stale-said, .kpi-target, .kpi-sofar, .kpi-against, .kpi-row-chart)) {
    display: none;
  }

  /* A ROW TALL: whose number, the number and which way it went, so the row fits and is never cut to a blank tile. */
  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] .kpi-row) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-block-size: 0;
    padding-block: 0;
  }

  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] .kpi-row) {
    position: relative;
  }

  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] .kpi-menu) {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    margin: 0;
  }

  .body[data-board] :global(.block-slot[data-board-key='numbers'][data-size='full'] .kb) {
    row-gap: var(--sp-2);
  }

  /* CASH, WIDE: each side figure on its label's line, so both fit a row's frame. Under its label, the two did not fit a
     laptop's shorter frame (tried for finish F49). */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2)) {
    display: flex;
    flex-wrap: nowrap;
    align-items: baseline;
    justify-content: space-between;
    column-gap: var(--sp-2);
  }

  /* NO NOTE BESIDE A SIDE FIGURE: "Converted at rates as of …" squeezed between the figure and the frame's edge and was
     cut to "Converted at rates as", with the label crushed to "To go out, next" (his record, 30 Oct). The rate's day is
     Money's to say, where the figure has room. */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2) .cell-note) {
    display: none;
  }

  /* ITS LABEL WRAPS BESIDE ITS FIGURE rather than being cut ("To come in, next 30 d…", audit 30 Oct, item 32). */
  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2) .cell-label) {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--fs-meta);
    line-height: 16px;
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2) .cell-figure) {
    flex: none;
    font-size: var(--fs-body);
  }

  .body[data-board] :global(.block-slot[data-key='cash'][data-size='wide'] .grid > .cell:nth-child(n + 2) :is(.glyph, .cell-note:empty)) {
    display: none;
  }

  /* A SMALL SHOWS ONE FIGURE, and nothing it cannot hold (§3.3). */
  .body[data-board] :global(.block-slot[data-size='small'] .grid > .cell:nth-child(n + 2)) {
    display: none;
  }

  .body[data-board] :global(.block-slot[data-size='small'] :is(.cell-trend, .cell-trend-ahead, .cell-note)) {
    display: none;
  }


  /* ── the tiles, as Today draws them (the Today polish of 20 October) ── */

  /* THE TILES COME IN ONCE, on the first load: a fade and a 4px rise, the first six one after another `--d-stagger`
     apart, so the last is still by 450ms (`motion.ts` `ARRIVAL`). A tile past the sixth is simply there. */
  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(-n + 6)) {
    animation: tile-in var(--d-page) var(--ease-out) both;
    animation-delay: calc(var(--arrive, 0) * var(--d-stagger));
  }

  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(2)) {
    --arrive: 1;
  }

  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(3)) {
    --arrive: 2;
  }

  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(4)) {
    --arrive: 3;
  }

  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(5)) {
    --arrive: 4;
  }

  .body[data-board][data-enter] :global(.home-page > .page > :nth-child(6)) {
    --arrive: 5;
  }

  @keyframes -global-tile-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .body[data-board][data-enter] :global(.home-page > .page > :nth-child(-n + 6)) {
      animation: none;
    }
  }

  /* NEEDS YOU'S COUNT IS THE ONLY RED IN A TILE'S HEAD (polish 5): red words, not a filled badge, which the top bar has. */
  .body[data-board] :global(.block-slot[data-key='needs-you'] > .block-bar .block-count) {
    color: var(--red);
    font-weight: var(--fw-semi);
  }

  /* A QUESTION ABOUT MONEY (polish 8): a neutral 32 well with its kind's glyph, the late word carrying the red; the title
     on one line at a desk, the amount at 15/600 on its baseline, and the answers on the second line at the right. */
  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row .dr-well .well) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row) {
    align-items: baseline;
  }

  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row > .dr-well) {
    align-self: center;
  }

  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row > .dr-amount) {
    font-size: var(--fs-body);
  }

  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-actions) {
    gap: var(--sp-2);
  }

  .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-actions > .dc-btn) {
    min-block-size: 36px;
  }

  @media (width >= 900px) {
    .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row > .dr-title) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-row > .dr-title > .dc-open) {
      display: inline;
    }
  }

  @media (pointer: coarse) {
    .body[data-board] :global(.block-slot[data-key='needs-you'] .dc-actions > .dc-btn) {
      min-block-size: var(--tap);
    }
  }

  /* CASH AHEAD, ONE SHAPE AT EVERY WIDTH (polish 1, 4): cash now over its line, the line the tile's width, and how
     long it lasts; then coming in and going out as two ruled rows, the label at the left and the figure at the right.
     At five of twelve the stat drew as tiles that wrapped going out under the rest. */
  .body[data-board] :global(.block-slot[data-key='cash'] .grid) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell) {
    grid-column: 1 / -1;
    grid-template-areas:
      'label glyph figure'
      'note note note';
    grid-template-columns: minmax(0, auto) auto minmax(auto, 1fr);
    grid-template-rows: none;
    align-items: baseline;
    column-gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-3) 0;
    border-radius: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell + .cell) {
    border-block-start: 1px solid var(--rule);
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:last-child) {
    padding-block-end: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell .cell-figure) {
    justify-self: end;
    font-size: var(--fs-head);
    text-align: end;
  }

  /* COMING IN AND GOING OUT CARRY THEIR SIGNS (VERIFY H6): "+£11,490" in the good green and "−£43,047" in ink, so the
     two figures are never read as the same kind of number. THE SIGN IS THE FIGURE'S OWN, written by the tile's cell
     (`sign` in `default-home.ts`, `signedFigure`), and the green follows it (`data-dir`). It was put on by the cell's
     place on screen (audit 31 Oct m, AM1): with no account Cash now draws nothing, going out stood second, and the rent
     read "+EGP 12,000" in green. */
  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell[data-dir='in'] .cell-figure) {
    color: var(--good);
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:first-child) {
    grid-template-areas:
      'label glyph'
      'figure figure'
      'trend trend'
      'note note';
    grid-template-columns: fit-content(100%) minmax(0, 1fr);
    padding-block-start: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:first-child .cell-figure) {
    justify-self: start;
    font-family: var(--font-display);
    font-size: var(--fs-page);
    text-align: start;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:first-child .cell-trend) {
    inline-size: 100%;
    block-size: 48px;
    margin-block: var(--sp-2) var(--sp-1);
  }

  /* THE WALK AHEAD (Money's Cash ahead, the same twelve weeks): the line the tile's width, today and its lowest point
     marked, and its two ends dated under it. */
  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:first-child .cell-trend-ahead) {
    inline-size: 100%;
    margin-block: var(--sp-2) var(--sp-1);
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:first-child .cell-trend-ahead > .cell-trend) {
    margin-block: 0;
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .cell-note:empty) {
    display: none;
  }

  /* THE RATES' DAY IS SAID ONCE ON A PHONE, under the cash figure: coming in and going out are converted at the same
     rates, and the same grey line three times was eight lines of nothing. */
  @media (width < 640px) {
    .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:nth-child(n + 2) .cell-note) {
      display: none;
    }
  }


  /* PEOPLE, ONE LINE EACH (today F17): the face, the name, and the organisation after it in the quiet ink, never a form's
     label and value. */
  .body[data-board] :global(.block-slot[data-key='faces'] .cards-item) {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    column-gap: var(--sp-2);
    min-inline-size: 0;
    text-align: start;
  }

  /* THE NAME TAKES THE TILE'S WIDTH and the organisation after it gives way first: a 60% cap cut "Amira Hadd…" with room. */
  .body[data-board] :global(.block-slot[data-key='faces'] .cards-head) {
    flex: none;
    max-inline-size: 100%;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-facts) {
    display: contents;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-fact) {
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-fact dt) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-fact dd) {
    display: inline;
    margin: 0;
  }

  /* ONE LINE A PERSON, 44 TALL (Today polish 10): the face at 28, the name at 15/500, and the organisation 8 after it in
     the quiet ink at 13, with no dot between. */
  .body[data-board] :global(.block-slot[data-key='faces'] .cards-grid) {
    gap: 0;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-item) {
    min-block-size: 44px;
    padding-block: 0;
    column-gap: var(--sp-2);
  }

  /* AND ONE MORE UNDER A THUMB FOR THE HAIRLINE, as the skin's own list of names (`cards.css`): the target is the line
     inside its border, so a 44px line was a 43px target. */
  @media (pointer: coarse) {
    .body[data-board] :global(.block-slot[data-key='faces'] .cards-item) {
      min-block-size: calc(var(--tap) + 1px);
    }
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-head) {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-face) {
    flex: none;
    inline-size: 28px;
    block-size: 28px;
  }

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-title) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
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

  /* A FIGURE'S LINE RUNS THE TILE'S WIDTH UNDER ITS FIGURE, where the tile draws the figure as a row (the rail, a
     phone): at the 120 it has beside a label it was a stub at the tile's left edge with two thirds of the row empty. */
  @container stat (inline-size < 480px) {
    .body :global(.block[data-kind='stat'] .cell-trend) {
      inline-size: 100%;
      block-size: 40px;
    }
  }

  /* ── narrower ─────────────────────────────────────────────────────────── */

  @media (width < 900px) {
    .page {
      padding: var(--sp-2) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE THE FIGURES ARE TWO BY TWO, rather than a stack of rows pushing what needs you off the screen.

     ONLY WHILE THE TILE HOLDS 480px, which is where a stat stops being tiles and becomes rows, the label on the left
     and the figure on the right (`kinds/stat.css`). Under that this rule still set two across, over the sheet's one
     column, so two rows stood on one line and ran into each other, one figure against the next label, at 390
     (the look of 13 October, fault C). */
  @media (width < 640px) {
    @container stat (inline-size >= 480px) {
      .body :global(.grid:has(> .cell:nth-child(2))) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  /* ON A PHONE A QUESTION IS A STEP UNDER THE HEADLINE, not level with it (today F8): 15/600, and the first one step
     over the rest at 17/600, so the first screen holds the line, two questions and the strip under them. */
  @media (width < 900px) {
    .body :global(.queue-question) {
      font-size: var(--fs-body);
      font-weight: 600;
      line-height: var(--lh-body, 22px);
    }

    .body :global(.queue > .qa:first-child .queue-question) {
      font-size: var(--fs-head);
      line-height: var(--lh-head, 24px);
    }
  }
</style>
