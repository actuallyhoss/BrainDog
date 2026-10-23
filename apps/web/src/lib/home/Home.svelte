<!--
  Today, declared: the page every record opens on (`routes/+page.svelte`), and `/?overview` too, which was a second Home.

  ONE PAGE, THROUGH THE ONE READER. Home draws the speaking use case's `home-<id>` page, else the record's `home` page,
  else Today's body (`todayHome` in `default-home.ts`), built from what the record holds and drawn by the record with
  `previewPage`. All three go through `PageView` with `mode: 'home'`, so a question is answered where it is shown, a
  task is ticked where it is drawn, and a line is captured without leaving. Today was a screen of its own; it is kept at
  `/?classic` (`Today.svelte`) until this one does all it did.

  CALM BEFORE RICH. One line under the title, worked out from the blocks drawn (`sentenceOf`), with the
  phrase that needs the reader in red. When Slash wrote Home's line today the line is its (`home-line.ts`), red only
  where it says the rules' phrase word for word, and who said it shows on hover or focus; nothing more is drawn at rest.
  A block with nothing in it is not drawn, and a rail with nothing in it gives its width back to the main column.

  THE READ MARK is one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug: For You had never once
  drawn its second half, because the screen advanced the mark on open and then asked for everything since it (19 §6).

  IT LISTENS. A write from an agent, a rule or another tab moves the record's version, and Home reads its page again
  without a reload and without blanking it (`listen`).

  TODAY'S OWN BODY IS THE DESK (roadmap slice 1a): what needs you, who is working and cash, the projects, then Arrivals,
  what is coming up and people, on one board, and everything else behind one More. A page the person kept is drawn as
  they laid it out, with the desk over it, and only the tiles around it fold.

  ONE READ OF ITS OWN STANDS BESIDE THE PAGE, behind More: the briefing, what matters today as the record wrote it,
  asked for beside the page and never by its read, fetched with its own part, and drawn for a record that answers any.

  THE RECORD'S HOUSEKEEPING IS NOT HERE (the audit of 22 October, U3): what went stale, who it matched, what it found
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
</script>

<script lang="ts">
  import { idle } from '$lib/ui/idle.ts';
  import { apiBase, at as inApp } from '$lib/at.ts';
  import { partsOf } from '$lib/shell/headline.ts';
  import { onAppendOnly, recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { heard, homePage, said } from '$lib/voice.svelte.ts';
  import { homeSlugOf } from '$lib/voice.ts';
  import { useCaseName } from '@braindog/seed/usecases/names';
  import type { LiveBlock, Opened } from '$lib/record/page-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { may } from '$lib/record/may.ts';
  import { live as moving } from '$lib/data/live.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ClearExamples from '$lib/ui/ClearExamples.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import HeadCapture from '$lib/home/HeadCapture.svelte';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { readMarkOf, stampOf } from '$lib/page/read-mark.ts';
  import { markAll } from '$lib/record/news-live.ts';
  import { holdsOf, voiceOf } from '$lib/page/home-arrange.ts';
  import {
    FIRST_TODAY_MOST,
    NEEDS_YOU_LIMIT_PHONE,
    TELL_LINE,
    deskFolded,
    drawsAny,
    homeDrawn,
    peopleOf,
    railed,
    slashLineOf,
    todayHome,
    quietHeld,
    weekOf,
    type Holds,
    type HomeVoice,
    type HomeWaits,
    type WeekDecl,
  } from '$lib/home/default-home.ts';
  import { addedByHand, showTell, tellLists } from '$lib/home/first-today.ts';
  import TellOne from '$lib/home/TellOne.svelte';
  import NeedsFoot from '$lib/home/NeedsFoot.svelte';
  import { sharedFrom, type SharedOut } from '$lib/home/shared-line.ts';
  import WorkingNow from '$lib/home/WorkingNow.svelte';
  import { workingRows } from '$lib/home/desk.ts';
  import WantMore from '$lib/home/WantMore.svelte';
  import { read as readPref } from '$lib/pref.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import { learn } from '$lib/record/remote.ts';
  import { playedBy } from '$lib/start/parts.ts';
  import type { TellOptions } from '$lib/tell/read.ts';
  import { createClient, wrote, type Cursor, type EngineHealth, type EventLine, type SlashStatus } from '@braindog/client';
  import { quietLine } from '$lib/ui/engine-line.ts';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { still } from '$lib/ui/motion.ts';
  import { sentenceOf } from '$lib/home/today-tiles.ts';
  import { greetingOf, inBriefOrder, lateOf, onceEach, unasked } from '$lib/home/today-brief.ts';
  import { verbOf } from '$lib/home/late-verb.ts';
  import LateNow from '$lib/home/LateNow.svelte';
  import { waitsNow, workingNow } from '$lib/home/waits.svelte.ts';
  import { toldNow } from '$lib/home/told-now.svelte.ts';
  import { answeredBy, doneToday, toldNeedOf } from '$lib/record/told-live.ts';
  import { words } from '$lib/home/words.ts';
  import { cutLine, homeLineOf } from '$lib/home/home-line.ts';
  import { anchorsFor, inPicture, type Placed } from '$lib/home/desk-order.ts';
  import type { BriefingRow } from '$lib/home/briefing.ts';
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { typing } from '$lib/a11y/keys.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';

  import { closed, drew, holdQuiet, opened } from '../ui/screen.svelte.ts';
  import { keepPart, keptPart, tileOnce, TODAY_KEPT_MS } from '$lib/home/today-kept.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { holdPresses } from '$lib/data/held.svelte.ts';
  import { drewFirst } from '$lib/data/first-drawn.ts';
  import { painted } from '$lib/data/timing.ts';
  import type { Near } from '$lib/data/local.ts';

  let { data }: { data: Shell } = $props();

  /* WHAT HE HAS SHARED OUT, for the one line in Needs you's foot (`shared-line.ts`): asked once the screen is idle, an
     owner's alone, and never a part of `boot`, which an owner is answered as before sharing. */
  let sharedNow = $state<SharedOut | undefined>(undefined);
  $effect(() => {
    if (!data.me?.owner || data.refused || data.stale) return;
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
  const today = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));

  /** The same day as `YYYY-MM-DD`, which the card reads "Friday" against. */
  const dayOn = (now: number): string => {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /* TODAY IS TODAY ON EVERY RECORD (the audit of 22 October, U1): a use case adds words for new things and never renames
     one of the five places, so neither the title nor the calm line takes the voice's word ("Team", "Nothing needs your
     call"). */
  const title = copy.today;
  const nothing = words.nothingNow;

  /* TODAY'S HEADINGS IN THE VOICE THAT SPEAKS, read before the page is asked for so a voice that lands after the first
     read asks it again in its own words. Built by the same helper the arrange mode rebuilds Today's body with, so the
     body arranged is the body drawn. NEEDS YOU IS A PLACE AND KEEPS ITS NAME there, and so does its calm line (U1). */
  const voice = $derived<HomeVoice>(voiceOf(said));

  /**
   * ONLY A PAGE THE PERSON KEPT IS DRAWN IN THE DESK'S PLACE (U1). A use case's own `home-<id>` page never replaces the
   * desk: on his record the Solo founder's report page stood where Today should be, with its tables, a by-book chart and
   * "Needs your call", and no desk change since 19 October ever reached it. The desk draws on every record, and the use
   * case's page stays a page of the record, one link away (`useCasePage`). A page kept by hand, `home`, is still drawn as
   * it was laid out, and only a page the record holds is asked for.
   */
  const declares = $derived(homeSlugOf(null, data.pages));

  /**
   * THE USE CASE'S OWN PAGE, held and not drawn here: the one link the desk keeps to it, by the use case's name ("Solo
   * founder"). `null` where the record holds none, or where a page kept by hand is drawn instead of the desk.
   */
  const useCasePage = $derived.by(() => {
    const slug = homePage();
    if (slug === null || declares !== null || !data.pages.includes(slug)) return null;
    return { href: `/p/${slug}`, name: useCaseName(slug.replace(/^home-/u, '')) };
  });

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
    })),
  });
  const added = $derived(addedByHand(kept));

  /** The device's own preferences: whether the next steps are hidden, and how her work arrives. Read again on Hide. */
  let prefs = $state(readPref());
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
  const tell = $derived(first && !told && showTell(kept, prefs));

  /* THE NEXT STEPS' OWN CODE, LOADED ON A FIRST TODAY ONLY (`want-more.ts`): it reads every use case this build ships, and
     a Today kept for months never draws a step. Asked once a first Today is known, so it lands a moment after the page. */
  let nextSteps = $state.raw<typeof import('$lib/home/want-more.ts') | null>(null);
  $effect(() => {
    if (first && nextSteps === null) void import('$lib/home/want-more.ts').then((m) => (nextSteps = m), () => undefined);
  });

  /* THE NEXT STEPS, under Today's blocks, on a first Today only: a record kept for months is not offered them, and its
     Today reads as it did. Gone for good once hidden (`nextStepsHidden`). */
  const steps = $derived.by(() => {
    if (!first || prefs.nextStepsHidden === true || added > FIRST_TODAY_MOST) return [];
    if (nextSteps === null) return [];
    return told ? nextSteps.madeSteps(kept.registers, prefs.arrivesBy) : nextSteps.wantMore(kept, prefs);
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
  $effect(() => {
    if (data.refused || (declares !== null && !tell) || !looked) return;
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
  const week = $derived(declares === null ? weekOf(decls, playedBy('meets')) : undefined);
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
    };
  });

  /** The record's answer for Home's page, `null` while it is out or when this host cannot draw Today's body. */
  let got = $state<Opened | null>(null);
  /** Whether the first read has come back, so a host that cannot draw Today's body is told from one still reading. */
  let settled = $state(false);
  /** A read of Home's own is out: `listen` waits for it rather than asking again on top of it. */
  let reading = false;

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
  const copyKey = (slug: string | null): string => JSON.stringify([apiBase(), slug]);
  let fromCopy = $state(false);
  /** Whether the copy drew this open: the reads behind it are quiet, as the ones behind what the tab drew are. */
  let copyDrawn = false;
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => holdCopyMark());
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
  /** What the copy holds: Today's page, and the desk and what was handled beside it, so nothing moves when they land. */
  type CopyBody = KeptBody & { desk?: DeskCards | null; handled?: HandledFound | null };
  async function drawCopy(slug: string | null, near: Near<CopyBody>): Promise<void> {
    if (got !== null || declares !== slug || near.value.got.from !== 'live') return;
    /* THE DESK'S OWN PART FIRST, so the page and the desk above it are drawn in one frame. */
    const part = near.value.desk && desk === null ? await import('./Desk.svelte').catch(() => null) : null;
    if (got !== null || declares !== slug) return;
    if (part && desk === null) desk = { cards: near.value.desk ?? null, Part: part.default };
    if (near.value.handled !== undefined && handled === null) handled = near.value.handled;
    got = near.value.got;
    news = near.value.news;
    newLines = near.value.news?.lines ?? [];
    fromCopy = true;
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
          return m.nearLocal<unknown>(HOME_COPY, copyKey(slug), apiBase(), (late) => void drawCopy(slug, revive(late))).then((near) => (near ? revive(near) : null));
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
      /* THE DESK AND WHAT WAS HANDLED GO WITH IT AS THEY LANDED, so the copy is the whole first screen and not the page
         alone, with the desk pushing it down when it lands. */
      await Promise.race([Promise.all([deskLanded, handledLanded]), new Promise((done) => setTimeout(done, DESK_WAIT_MS))]);
      let ticket = mark;
      if (tab.localTicket() !== mark) {
        await tab.settledLocal();
        if (asOf() !== stamp || readerOf() !== reader || slug !== declares) return;
        ticket = tab.localTicket();
      }
      if (readerOf() !== reader) return;
      const kept: CopyBody = { got: out, news: said, desk: untrack(() => desk?.cards ?? null), handled: untrack(() => handled) };
      tab.keepLocal(HOME_COPY, copyKey(slug), [l.EVERY, ...lists], p.plainOf(kept), ticket, {}, { always: true });
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

  /** Home's page, from whichever of the three sources the record holds. */
  async function readBody(slug: string | null, spoken: HomeVoice, held: Holds): Promise<Opened | null> {
    if (slug !== null) {
      const m = await import('$lib/record/page-live.ts');
      const asking = m.pageReader(apiBase()).read(slug);
      bodyAsked = true;
      return asking;
    }
    /* TODAY'S BODY IS DRAWN BY THE RECORD, never installed: `previewPage` answers the body as `page` answers an installed
       one, each block held to the reader, and writes nothing. `drawnOf` is the one reader of that answer. A host built
       before it reads what went quiet answers that one tile as a refusal, which is not drawn (`quietHeld`). */
    const body = todayHome(held, spoken);
    const m = await import('../../routes/decide/[id]/proposed.ts');
    const asking = m.drawnOf(body, apiBase());
    bodyAsked = true;
    const drawn = await asking;
    if (drawn.from === 'live')
      return {
        from: 'live',
        page: { page: { page: body.page, title: body.title, ...(body.layout ? { layout: body.layout } : {}) }, blocks: quietHeld(drawn.blocks) },
        now: drawn.now,
      };
    if (drawn.from === 'refused') return { from: 'refused', fix: drawn.fix };
    return null;
  }

  $effect(() => {
    /* A RECORD THAT REFUSED `boot` REFUSES THIS TOO, and each refusal is written into its log. */
    if (data.refused) return;
    const slug = declares;
    /* TODAY'S OWN BODY WAITS FOR THE LISTS' DECLARATIONS, so a record that keeps a week opens on it and is not drawn twice. */
    if (slug === null && learnt === 0) return;
    const spoken = voice;
    const held = holds;
    const key = bodyKey(slug, spoken, held);
    /* THE SAME QUESTION IS NOT ASKED TWICE: a live `boot` landing behind the copy hands this effect new objects with the
       same words in them, and asked the page again over the one already out. A read that failed is asked again. */
    if (key === readKey && !readFailed) return;
    readKey = key;
    readFailed = false;
    /* DRAWN FROM WHAT TODAY LAST DREW, the screen is settled at once, and the read is not bracketed: it lands over it. */
    const was = untrack(() => got) === null ? keptPart<KeptBody>('body', key) : null;
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
    const before = newsNow();
    const first = new Promise<void>((done) => setTimeout(done, HANDLED_WAIT_MS));
    void Promise.all([readBody(slug, spoken, held), Promise.race([Promise.all([handledLanded, deskLanded]), first])])
      .then(([out]) => {
        if (slug !== declares) return;
        /* A QUIET READ THAT FAILS KEEPS WHAT IS DRAWN, as every quiet read does (`read.ts`). */
        if (was && out?.from !== 'live') return;
        got = out;
        fromCopy = false;
        ok = out?.from === 'live';
        readFailed = !ok;
        if (ok && out) keepPart('body', key, { got: out, news: null } satisfies KeptBody);
        if (ok) keepNews(before, mine, key);
        if (ok && out) {
          drewAt = Date.now();
          painted('Today', 'network');
          void Promise.all([before, mark]).then(([said, at]) => keepCopy(slug, out, said, at, stamp));
        }
      })
      .catch(() => {
        readFailed = true;
      })
      .finally(() => {
        reading = false;
        settled = true;
        bodyAsked = true;
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
    /* WHAT LANDED IS DRAWN WITH THE DESK IT STANDS IN, not with the page under it: on a first open the desk's projects
       were drawn, then the page, and the lines put in between them pushed the page down as it drew. The mark still goes
       only with the page (`keepNews`). */
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
      const out = await readBody(slug, spoken, held);
      if (slug === declares && out?.from === 'live') {
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
  function toldOne() {
    pressed = true;
    void reread();
  }

  const live = $derived(got?.from === 'live' ? got : null);

  /* WHAT WAITS AND WHO IS WORKING, AS `boot` SAYS IT (EXP-E07): the rail's badge and this header say one number, and the
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
   * projects, then Arrivals, what is coming up and people, on one twelve-column board, and EVERYTHING ELSE FOLDED BEHIND
   * ONE MORE: the rest of the page's blocks (`deskFolded`), the briefing, and every tile Home draws around the page.
   *
   * A PAGE THE PERSON KEPT IS THEIRS AND IS DRAWN AS THEY LAID IT OUT, every block of it; only the tiles Home draws around
   * it fold. More is per visit: shut each time Today opens.
   */
  const board = $derived(declares === null);
  let moreOpen = $state(false);


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
  $effect(() => {
    if (!entering || !settled) return;
    const off = setTimeout(() => (entering = false), ENTER_HELD_MS);
    return () => clearTimeout(off);
  });

  /* THE PAGE AS HOME DRAWS IT, handed to the reader whole, so the reader's writes index the blocks it draws. A rail with
     nothing beside it, or nothing in it, is one column. On the desk, what it does not show at rest is folded. */
  const desked = $derived.by(() => {
    if (!got || got.from !== 'live' || !shaped) return null;
    /* ON A PHONE NEEDS YOU SHOWS FOUR, the first with its buttons and the rest rows a tap opens (the style below), and
       its count still says how many wait: the rest are "N more". AND THE LATE LIST IS THE LATE TILE'S on the desk, at
       the top with a button each, so the page's own late block is marked not drawn at its place and More does not say
       it again. */
    const lateAt = new Set(board ? (late?.at ?? []) : []);
    const blocks =
      board && (phone.current || lateAt.size > 0)
        ? shaped.blocks.map((b, n) =>
            lateAt.has(n) ? { ...b, drawn: false } : phone.current && b.key === 'needs-you' && b.queue ? { ...b, queue: b.queue.slice(0, NEEDS_YOU_LIMIT_PHONE), most: NEEDS_YOU_LIMIT_PHONE } : b,
          )
        : shaped.blocks;
    /* ON THE DESK THE DOCUMENT HOLDS THE TILES IN THE ORDER THEY ARE SEEN (`desk-order.ts`), so Tab walks the picture. The
       reader indexes the blocks it is handed, so the order is made here, before it. */
    if (!board) return { blocks, folded: 0 };
    const folded = deskFolded(blocks, moreOpen);
    return { blocks: inPicture(folded.blocks), folded: folded.folded };
  });
  const drawn = $derived.by((): Opened | null => {
    if (!got || got.from !== 'live' || !desked) return got;
    const blocks = desked.blocks;
    if (railed(blocks)) return { ...got, page: { page: got.page.page, blocks } };
    const { layout: _rail, ...flat } = got.page.page;
    return { ...got, page: { page: flat, blocks } };
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

  /**
   * THE BRIEFING BESIDE THE PAGE (`briefing.ts`), with the part that draws it: what matters today as the record wrote it,
   * and whether its written brief is paused, which the head says in its one quiet line (U7). `null` until it has
   * answered, and an answer of none draws nothing.
   *
   * BESIDE THE PAGE READ AND NEVER IN IT, asked the moment the page's own read has gone out, so the record answers the
   * page first. It is the one read left beside the page: what went stale, who was matched and the rest of the record's
   * housekeeping are Settings › Health (U3), and nothing of theirs is asked here.
   *
   * FETCHED WHEN ASKED FOR, the reader and its part alike: this screen is the front door, and nothing here is added to
   * what it loads first. No read of it can fail the screen, since it answers none for a host without the call, a reader
   * it refuses and a line that dropped. ASKED AGAIN WHEN THE RECORD MOVES, and what is drawn stays until the new answer
   * lands.
   */
  type BriefingPart = typeof import('./Briefing.svelte').default;
  type HandledFound = import('./handled.ts').Handled;
  type DeskPart = typeof import('./Desk.svelte').default;
  type DeskCards = import('./desk-read.ts').Cards;
  let brief = $state.raw<{ cards: readonly BriefingRow[]; foot: string | null; paused: string | null; Part: BriefingPart } | null>(null);
  /* WHAT BRAINDOG DID BY ITSELF TODAY, said as one line at the foot of Needs you (today F6); nought says nothing. */
  let handled = $state.raw<HandledFound | null>(null);
  /* THE FIRST BODY WAITS FOR THE FIRST HANDLED READ, a short while at most (`HANDLED_WAIT_MS`), so the foot's line is in
     the first picture and never pushes the board down when it lands (CLS, today F1). */
  let handledHeard: () => void = () => {};
  const handledLanded = new Promise<void>((done) => (handledHeard = done));
  /* AND FOR THE DESK'S FIRST READ, the projects' row, which pushed what is under it down as it landed. */
  let deskHeard: () => void = () => {};
  const deskLanded = new Promise<void>((done) => (deskHeard = done));
  const HANDLED_WAIT_MS = 800;
  /* WHETHER THE BRIEFING HAS ANSWERED, so More says one count and not a count that grows by one as it lands (VERIFY P3). */
  let briefHeard = $state(false);
  /**
   * THE VERSION A TILE IS ASKED ONCE AT (`tileOnce`): the record's, as the poll heard it, and this tab's writes. Read in
   * each effect, so a move of the record still asks every tile again.
   */
  const asOf = (): string => `${moving.version} ${wrote()}`;
  /* WHETHER THE PAGE'S OWN READ HAS GONE OUT, so the briefing is asked after it and the record answers the page first. */
  let bodyAsked = $state(false);
  $effect(() => {
    if (data.refused || !bodyAsked) return;
    const ver = asOf();
    const base = apiBase();
    let here = true;
    /* WHAT TODAY LAST DREW OF IT, drawn at once (`today-kept.ts`); the read lands over it. */
    type Briefed = NonNullable<typeof brief>;
    const was = untrack(() => brief) ?? keptPart<Briefed>('brief', base);
    brief = was;
    if (was) briefHeard = true;
    /* BRACKETED AS A READ OF THIS SCREEN, so the screen is not measured with it still on its way, and closed as fine
       whatever came back: the briefing never refuses the screen. */
    const at = was || copyDrawn ? null : untrack(opened);
    /* THE QUIET MARK IS NOT TOLD while it is still to be asked, copy drawn or not (`quiet`). */
    const quietAgain = holdQuiet();
    const briefing = Promise.all([import('./briefing.ts'), import('./Briefing.svelte')]).then(async ([m, part]) => {
      const out = await tileOnce('briefing', base, ver, () => m.readBriefingSaid(base));
      if (here) keepPart('brief', base, (brief = { cards: out.value.rows, foot: m.footOf(out.value), paused: out.value.paused, Part: part.default }));
    });
    void briefing
      .catch(() => undefined)
      .then(() => {
        if (here) briefHeard = true;
        if (at !== null) closed(true, at);
        quietAgain();
      });
    return () => {
      here = false;
      quietAgain();
    };
  });

  /**
   * WHETHER THE MODEL THAT WRITES IS QUIET, said once under the brief (`engine-line.ts` `quietLine`, U7): not answering,
   * his key closed, the record's own written brief paused because the model did not answer, or the month spent. The
   * engine is asked only where a model is behind Slash; the briefing's word on its brief is read beside the page anyway.
   * While it answers, nothing is said.
   */
  let engine = $state.raw<{ health: EngineHealth | null; month: SlashStatus | null } | null>(null);
  $effect(() => {
    if (data.refused || page.data.slash !== true) return;
    void moving.version;
    let here = true;
    const client = createClient({ base: apiBase() });
    void Promise.all([client.engineHealth().catch(() => null), client.slashStatus().catch(() => null)]).then(([out, month]) => {
      const v = out?.ok ? (out.value as EngineHealth | null) : null;
      const health = v !== null && typeof v === 'object' && 'health' in v ? v : null;
      if (here) engine = { health, month: month?.ok ? month.value : null };
    });
    return () => {
      here = false;
    };
  });
  const quiet = $derived(quietLine(engine?.health ?? null, engine?.month ?? null, brief?.paused ?? null));

  /**
   * THE DESK ABOVE THE PAGE: who is working, the live projects as cards, and what landed (`Desk.svelte`). Fetched with its
   * reader beside the page's own read and not after it, since it is what Today opens on. A read that fails draws no
   * cards, and the desk then draws what it still has.
   */
  let desk = $state.raw<{ cards: DeskCards | null; Part: DeskPart } | null>(null);
  /* A PROJECTS LIST THE TAB HAS LEARNT, so a little height is held for the desk until it lands and the page below does not
     jump. Nothing is held for a record with no projects list, or before its lists are known. */
  const deskExpected = $derived.by(() => {
    void learnt;
    return desk === null && data.lists.some((l) => (REGISTERS[l.id] as { scopes?: unknown } | undefined)?.scopes !== undefined);
  });
  $effect(() => {
    if (data.refused) return;
    const ver = asOf();
    const base = apiBase();
    let here = true;
    /* THE DESK AS TODAY LAST DREW IT, at once (`today-kept.ts`), and read again behind it. */
    if (untrack(() => desk) === null) desk = keptPart<NonNullable<typeof desk>>('desk', base);
    if (untrack(() => desk) !== null) deskHeard();
    void Promise.all([import('./desk-read.ts'), import('./Desk.svelte')]).then(
      async ([m, part]) => {
        const lists = data.lists;
        const cards = await tileOnce('desk', base, ver, () => m.readCards(base, lists, asked)).catch(() => null);
        if (here) keepPart('desk', base, (desk = { cards, Part: part.default }));
        deskHeard();
      },
      () => deskHeard(),
    );
    return () => {
      here = false;
    };
  });

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
  const handledCount = $derived(handled ? handled.rows.length + handled.more : 0);
  /* WHAT AGENTS ASKED HIM BACK AND WHAT THEY FINISHED TODAY, of what he told them, as the shell last read it (`told-now`). */
  const toldNeeds = $derived(toldNow().needs.map((t) => toldNeedOf(t, toldNow().agents)));
  const finishedBy = $derived(doneToday(toldNow().done, recordNow()).map((t) => answeredBy(t, toldNow().agents)));

  /**
   * WHO IS WORKING, FROM `boot` AND AT ONCE (today F1): Today's own body declares no table of runs, so nothing is drawn
   * twice and nothing fades out over the board; the tile stands from the first paint, its project dots coloured once the
   * desk's cards land. On the record's own clock (`recordNow`), so "for 32 min" is the record's time.
   */
  const workingTile = $derived.by(() => {
    const hues = new Map((desk?.cards?.cards ?? []).map((c) => [c.name, c.hue] as const));
    return workingRows(workingNow(), hues, recordNow());
  });

  /* WHETHER THE PAGE DRAWS ITS NEEDS YOU QUESTIONS, so the foot is the tile's lower part, or the whole tile at nought. */
  const needsDrawn = $derived((desked?.blocks ?? []).some((b) => b.key === 'needs-you' && b.drawn));

  /* NOTHING TO DRAW AT ALL: the line says so, and nothing under it. A host that cannot draw Today's body is calm too. */
  const calm = $derived((shaped !== null && !drawsAny(shaped.blocks)) || (settled && got === null));

  /* WHETHER THE PAGE'S READER IS DRAWN. The briefing is no longer the board's first tile: it is behind More with the
     rest, and the head's sentence says what it led with. */
  const reader = $derived((drawn !== null && (!calm || Boolean(shaped?.capture))) || !settled);

  /* THE BRIEFING IS DRAWN WHATEVER ITS MODEL DOES (U2): every card the rules wrote is the record speaking, and a paused
     model decides only that no prose of its own is shown, which the record already leaves out. */
  const briefShown = $derived((brief?.cards.length ?? 0) > 0);

  /* WHAT MORE HOLDS: the page's blocks the desk folds, and the briefing where it has a card. */
  const extras = $derived(briefShown ? 1 : 0);
  const folds = $derived((desked?.folded ?? 0) + extras);
  /* WHERE THE DESK'S OWN PARTS AND MORE'S LINE STAND AMONG THE PAGE'S TILES, so the document is in the picture's order. */
  const anchors = $derived(anchorsFor(board ? (desked?.blocks ?? []) : [], board && reader));
  const moreWords = { open: 'More', shut: 'Show less' } as const;

  /**
   * `j` PAST THE LAST ROW THE DESK SHOWS OPENS MORE, and the walk goes on into what it holds. The rows folded behind More
   * (the late and urgent tasks, the work handed back) are the ones `x` ticks, and a key that walks every row of Today
   * could not reach them while they were folded. Read after the page's own handler has moved the cursor: if it did not
   * move, there was no row further on. Not while a box has the caret, a layer is open, or after `g`.
   */
  let goAt = 0;
  function walkOn(e: KeyboardEvent) {
    if (e.key === 'g') goAt = Date.now();
    if (e.key !== 'j' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (!board || moreOpen || folds === 0 || Date.now() - goAt < 1000 || typing()) return;
    const on = e.target;
    if (on instanceof HTMLElement && on.closest('input, textarea, select, [contenteditable], [role="grid"], dialog')) return;
    if (document.querySelector('dialog[open]') !== null) return;
    const was = document.querySelector('[data-row-cursor]');
    setTimeout(() => {
      if (!moreOpen && document.querySelector('[data-row-cursor]') === was) moreOpen = true;
    });
  }

  /* A RECORD WITH NO LISTS AT ALL goes to the prompt (`+layout.ts`); this is what is left if it is reached anyway. */
  const empty = $derived(data.index.registers.length === 0 && data.lists.length === 0 && data.open === 0);

  /**
   * TODAY SPEAKS FIRST (the audit of 22 October, U2): on the board, over the tiles, a greeting by the time of day and his
   * name, then two or three sentences that name what is late and what needs him (`today-brief.ts`), and one quiet line
   * while the model that writes is not answering (`quiet`, U7). The head keeps only the phone's bar, and the date and the
   * sun glyph go: the tab already says where he is. Not on a first Today, which opens on its card, nor a kept page, which
   * is drawn as its owner laid it out.
   */
  const headed = $derived(board && !tell && !data.refused && !empty);

  /** The greeting, by the reader's name as the bar's face takes it: the record's name for them, else `boot`'s `me.name`. */
  const greeting = $derived.by(() => {
    const id = data.me?.person;
    const named = id && data.names && Object.hasOwn(data.names, id) ? (data.names[id] ?? '').trim() : '';
    return greetingOf(data.now, named || (data.me?.name ?? '').trim());
  });

  /* TODAY'S LATE LIST, read off the page as Home shaped it: what the brief names, and the Late tile at the top of the
     desk shows with a button each, in the brief's order and less what a question in Needs you already asks about
     (`unasked`). ONE THING IS ONE LINE: a payment kept in two lists is said once, by the row a press can finish
     (`onceEach`). */
  const late = $derived(board && shaped ? lateOf(shaped.blocks) : null);
  const lateLines = $derived(late ? onceEach(late.lines, (line) => verbOf(line, (list) => may(data, 'write', list)) !== null) : []);
  const queued = $derived(shaped?.blocks.find((b) => b.key === 'needs-you')?.queue ?? []);
  const lateShown = $derived(inBriefOrder(unasked(lateLines, queued)));

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

<!-- WHAT MATTERS TODAY, with who wrote it, drawn once: by the page's reader, or here where none draws the blocks. -->
{#snippet briefed()}
  {#if brief}<brief.Part cards={brief.cards} foot={quiet !== null && brief.foot === brief.paused ? null : brief.foot} />{/if}
{/snippet}

<!-- THE DESK'S OWN PARTS: who is working, the live projects as cards and what landed, each left out where it has nothing.
     Height is held while it is on its way where the record has projects. -->
{#snippet deskPart(part: 'all' | 'working' | 'projects' | 'landed' = 'all')}
  {#if part === 'working'}
    <!-- WHO IS WORKING, from `boot`, standing from the first paint. -->
    <WorkingNow rows={workingTile} />
  {:else if desk}
    {@const Desk = desk.Part}
    <Desk cards={desk.cards} working={workingNow()} lines={newLines} lists={data.lists} names={data.names} me={data.me?.person ?? null} now={data.now} {part} review={waits?.inbox ?? 0} />
  {:else if deskExpected && (part === 'all' || part === 'projects')}
    <div class="desk-held" aria-hidden="true"></div>
  {/if}
{/snippet}

<!-- THE LINE THAT OPENS EVERYTHING ELSE: a plain line that says how many, and opens them in place. -->
{#snippet moreLine()}
  {#if (folds > 0 && desked) || useCasePage}
    <div class="desk-foot">
      {#if folds > 0 && desked}
        <button type="button" class="more" data-free aria-expanded={moreOpen} onclick={() => (moreOpen = !moreOpen)}>
          <span>{moreOpen ? moreWords.shut : moreWords.open}</span>
          {#if !moreOpen}<span class="more-count num" style:visibility={briefHeard ? null : 'hidden'}>{folds}</span>{/if}
          <Icon name="chevronDown" size="s" />
        </button>
      {/if}
      <!-- THE USE CASE'S OWN PAGE, ONE LINK AWAY (U1): what only it draws is there, and the desk stays the desk. -->
      {#if useCasePage}<a class="desk-own tap" href={inApp(useCasePage.href)}>{words.useCasePage(useCasePage.name)}<Icon name="arrow" size="s" /></a>{/if}
    </div>
  {/if}
{/snippet}

<!-- THE FOOT OF NEEDS YOU: the late bills and what BrainDog did itself, or the whole tile with nothing to ask. -->
{#snippet needsFoot()}
  {#if shaped}
    <NeedsFoot alone={!needsDrawn} heading={voice.needsYou} late={late ? null : shaped.lateBills} handled={handledCount} told={toldNeeds} finished={finishedBy} shared={sharedNow} calm={words.nothingNeedsYou} />
  {/if}
{/snippet}

<!-- THE DESK'S OWN PARTS AND MORE'S LINE, each where the picture shows it (`desk-order.ts`): before a tile of the page, or
     after the page. -->
{#snippet placedParts(list: readonly Placed[])}
  {#each list as part (part)}
    {#if part === 'more'}{@render moreLine()}{:else if part === 'needs'}{@render needsFoot()}{:else}{@render deskPart(part)}{/if}
  {/each}
{/snippet}

{#snippet amid(i: number)}
  {@const here = anchors.at.get(i)}
  {#if here}{@render placedParts(here)}{/if}
{/snippet}

<svelte:window onkeydowncapture={walkOn} />

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
    {#if data.live}<ClearExamples />{/if}

    <!-- A FIRST TODAY OPENS ON THE CARD: one real thing, read into the entries it becomes, added on one press. -->
    {#if tell}<TellOne options={tellOptions} onadded={toldOne} />{/if}

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

    <!-- A PAGE THE PERSON KEPT: the desk over it, as before, and their page under it as they laid it out. -->
    {#if !board}{@render deskPart('all')}{/if}

    <!--
      TODAY SPEAKS FIRST (U2), AND ONLY TO GREET (23 October, his word: the sentence under it "summarizes everything that's
      already shown in the late"): the greeting is the screen's `h1`, and what is late, what needs him and who is working
      are the tiles under it, said once there and not twice.
    -->
    {#if headed}
      <header class="today-head">
        <h1 class="today-hi" tabindex="-1">{greeting}</h1>
      </header>
    {/if}

    <!--
      THE DESK (`board`): one twelve-column board that the desk's parts and the page's blocks are laid out on together,
      each where the 19 October desk puts it, and More under them. A kept page is its own board, with More under it.
    -->
    <div class="body" data-board={board ? '' : undefined} data-enter={entering ? '' : undefined}>
      <!-- WHAT IS LATE LEADS THE DESK, a line a thing with its button (U2, U-A13): beside who is working at a desk, and the
           first thing under the brief on a phone. -->
      {#if board && lateShown.length > 0}
        <div class="today-late">
          <LateNow
            lines={lateShown}
            heading={late?.heading || voice.overdue}
            more={late?.more ?? 0}
            most={phone.current ? 3 : 4}
            writes={(list) => may(data, 'write', list)}
            onfinished={() => void reread()}
          />
        </div>
      {/if}
      <!-- THE FIRST ROW'S RIGHT COLUMN UNDER WHO IS WORKING AND CASH, held so nothing laid out later lands in it. -->
      {#if board && shaped}<span class="row-one-rest" aria-hidden="true"></span>{/if}
      <!-- A CALM PAGE WITH A LINE IN ITS HEAD STILL DRAWS ITS READER, which holds the writes the line adds through. On the
           desk the parts that are the desk's own stand among its tiles, in the order they are seen (`amid`). -->
      {#if reader}<PageView bind:this={view} {slug} got={drawn} mode="home" {reread} between={board ? amid : undefined} />{/if}
      <!-- THE PARTS NO TILE OF THE PAGE COMES AFTER, and EVERYTHING ELSE BEHIND ONE MORE. -->
      {#if board}{@render placedParts(anchors.tail)}{:else}{@render moreLine()}{/if}
      {#if moreOpen && extras > 0}
        <div class="more-body">
          <!-- WHAT MATTERS TODAY, with who wrote it. The page is on the board, over More. -->
          {@render briefed()}
        </div>
      {/if}
    </div>

    <!-- AND UNDER TODAY, THE NEXT STEPS, until they are hidden. -->
    {#if steps.length > 0}<WantMore {steps} onhide={() => (prefs = readPref())} />{/if}
  {/if}
  {#if !shown && !data.refused}<span class="page-wait" hidden></span>{/if}
</div>

<style>
  /* THE DESK'S PLACE WHILE IT IS ON ITS WAY: about one row of cards, so the page under it stays where it is drawn. */
  .desk-held {
    min-block-size: 180px;
  }

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

  /* ── the head: the greeting and the brief (U2) ─────────────────────────── */

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

  .today-hi:focus:not(:focus-visible) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  @media (width < 640px) {
    .today-hi {
      line-height: 34px;
    }
  }

  /* WHAT IS LATE STANDS IN NEEDS YOU'S PLACE IN THE ORDER, before it, so on a phone it is the first tile under the brief,
     and nothing the board draws at no height (the page's ⋯ on a phone) stands between them and opens a gap. Its tile
     fills its cell, so beside a taller Working now it does not end short. */
  .body[data-board] > .today-late {
    display: flex;
    flex-direction: column;
    order: 1;
  }

  .today-late > :global(.tile) {
    flex: 1;
  }

  /* THE PAGE'S ⋯ ROW, which a phone draws in the flow and which holds only closed sheets there, goes to the board's foot
     rather than over the late tile, where its row and its gap pushed the tile down. */
  .body[data-board]:has(> .today-late) :global(.home-page > .home-tools) {
    order: 19;
  }

  /* ON A PHONE, NEEDS YOU'S FIRST QUESTION IS ANSWERED WHERE IT STANDS AND THE REST ARE ROWS (the Bento phone board): each
     after the first loses its buttons, its title keeps one line, and the whole row is the title's link to its page. */
  @media (width < 600px) {
    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa :is(.dc-actions, .dr-actions)) {
      display: none;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .queue-card) {
      position: relative;
    }

    .body[data-board] :global(.block-slot[data-key='needs-you'] .queue[data-compact] > .qa ~ .qa .queue-question) {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
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

  /* ── the desk ─────────────────────────────────────────────────────────────
     ONE BOARD OF TWELVE COLUMNS that the desk's own parts and the page's blocks share (the 19 October desk). The page's
     reader and its body give up their boxes (`display: contents`), so each block's tile is a tile of this board, and
     each is put in its row by `order`: what needs you, who is working and cash; the few key numbers where the record
     keeps any; the record's week where it keeps one;
     the projects; Arrivals, what is coming up and people; then More, and what More opens. Not while the page is being
     arranged, where the body's own layout is what is moved.

     THE ROW'S SHARES ARE THE BOARD'S, by what it holds: five, four and three, and a part that is not there gives its
     columns to the others, so a row never ends on a hole. Under 960px of board the first of each row takes the whole
     row and the other two halve the next; on a phone every tile is the whole width, in the same order. */
  .body[data-board] {
    --n: 7;
    --a: 6;
    --u: 3;
    --p: 3;
    container: desk / inline-size;
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--tile-gap);
  }

  .body[data-board]:has(:global(.home-page[data-arranging])) {
    display: block;
  }

  .body[data-board]:not(:has(:global(.home-page[data-arranging]))) :global(:is(.home-page, .home-page > .page)) {
    display: contents;
  }

  /* WHAT THE ROWS HOLD, read off the board: who is working is the desk's tile or, without the desk, the page's table.
     With neither it nor cash, Needs you is the whole first row. */
  .body[data-board]:not(:has(:global(:is([data-working], .block-slot[data-key='working'], .block-slot[data-key='cash'])))) {
    --n: 12;
  }

  .body[data-board]:not(:has(:global(.block-slot[data-key='faces']))) {
    --a: 8;
    --u: 4;
  }

  .body[data-board]:not(:has(:global([data-landed]))) {
    --u: 6;
    --p: 6;
  }

  .body[data-board]:not(:has(:global(.block-slot[data-key='coming-up']))) {
    --a: 8;
    --p: 4;
  }

  /* EVERYTHING ON THE BOARD IS A WHOLE ROW unless it is one of the desk's (below): bars while the page is read, the
     page's ⋯ where a pointer cannot hover, and what More opens. Before the desk, so a bar is never under it. */
  .body[data-board] > :global(*),
  .body[data-board] :global(.home-page > *),
  .body[data-board] :global(.home-page > .page > *) {
    grid-column: 1 / -1;
    order: 0;
    min-inline-size: 0;
  }

  /* THE PAGE'S BLOCKS THE DESK DOES NOT SHOW AT REST, drawn only once More is open, under it. */
  .body[data-board] :global(.home-page > .page > .block-slot) {
    grid-column: 1 / -1;
    order: 30;
  }

  .body[data-board] :global(.home-page > .page > :is(.block-slot[data-key='needs-you'], [data-needs-foot])) {
    order: 1;
  }

  /* NEEDS YOU AND ITS FOOT ARE ONE TILE (today F3, F6): the foot butts the queue's lower edge, the corners between them
     square, and the queue keeps only a step of air under its last line. With nothing to ask the foot is the tile. */
  .body[data-board]:has(:global([data-needs-foot]:not([data-alone]))) :global(.home-page > .page > .block-slot[data-key='needs-you']) {
    padding-block-end: var(--sp-3);
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }

  .body[data-board] :global(.home-page > .page > [data-needs-foot]:not([data-alone])) {
    margin-block-start: calc(var(--tile-gap) * -1);
  }

  /* NOTHING STRETCHES TO A NEIGHBOUR (Today polish 1): who is working and cash are each as tall as what they hold. Only
     Needs you fills its own span, so its foot butts it when the column beside it is the taller. */
  .body[data-board] :global(.home-page > .page > :is(.block-slot[data-key='needs-you'], [data-needs-foot][data-alone])) {
    align-self: stretch;
  }

  /* THE LAST ROW SHARES ONE HEIGHT (Today polish 3): Arrivals, what is coming up and people, each list at the top and its
     "N more" or "All people" pinned to the foot. */
  .body[data-board] :global(.home-page > .page > :is([data-landed], .block-slot:is([data-key='coming-up'], [data-key='faces']))),
  .body[data-board] > :global([data-landed]) {
    align-self: stretch;
  }

  .body[data-board] :global(.home-page > .page > .block-slot:is([data-key='coming-up'], [data-key='faces'])) {
    display: flex;
    flex-direction: column;
  }

  .body[data-board] :global(.block-slot:is([data-key='coming-up'], [data-key='faces']) > :is(.block-slice, .block-more)) {
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
  }

  /* COMING UP'S "16 MORE" IS A LINK TO WORK (VERIFY P1), said as a link is: 13/500 in the red, as wide as its words. */
  .body :global(.block-slot[data-key='coming-up'] > a.block-more) {
    align-self: flex-start;
    color: var(--red);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .body :global(.block-slot[data-key='coming-up'] > a.block-more:hover) {
    text-decoration: underline;
  }

  /* THE REST OF THE FIRST ROW'S RIGHT COLUMN, held empty so nothing laid out later is put in it. */
  .row-one-rest {
    display: none;
  }

  .body[data-board] > :global([data-working]),
  .body[data-board] :global(.home-page > .page > :is([data-working], .block-slot[data-key='working'])) {
    order: 2;
  }

  .body[data-board] :global(.home-page > .page > .block-slot[data-key='cash']) {
    order: 3;
  }

  /* THE FEW KEY NUMBERS THAT LEAD ARE A WHOLE ROW under the first, at every width (`numbersTile`). */
  .body[data-board] :global(.home-page > .page > .block-slot[data-key='numbers']) {
    order: 4;
  }

  .body[data-board] :global(.home-page > .page > .block-slot[data-key='week-due']) {
    order: 5;
  }

  .body[data-board] :global(.home-page > .page > .block-slot[data-key='week-money']) {
    order: 6;
  }

  .body[data-board] > :global(:is(.projects, .desk-held)),
  .body[data-board] :global(.home-page > .page > :is(.projects, .desk-held)) {
    order: 7;
  }

  .body[data-board] > :global([data-landed]),
  .body[data-board] :global(.home-page > .page > [data-landed]) {
    order: 8;
  }

  .body[data-board] :global(.home-page > .page > .block-slot[data-key='coming-up']) {
    order: 9;
  }

  .body[data-board] :global(.home-page > .page > .block-slot[data-key='faces']) {
    order: 10;
  }

  .body[data-board] .desk-foot {
    order: 20;
  }

  .body[data-board] > .more-body {
    order: 40;
  }

  /* A TILE LEAVING THE BOARD FADES WHERE IT STOOD: the reader lays its copy against the board, which is the box the page
     has on the desk (`recompose.ts` `frameOf`), so nothing here holds it anywhere. */

  @container desk (inline-size >= 960px) {
    /* THE FIRST ROW IS PLACED (Today polish 1) ON FOUR TRACKS, two stacks side by side: Needs you over its foot at seven
       of twelve, and at the right who is working over cash, each its own height. Needs you takes the first two tracks
       and its foot the third; who is working the first, and cash the second to the fourth. So the second track is what
       Needs you is taller than who is working by, the fourth is what cash runs on past the foot, and neither column
       stretches to the other. */
    .body[data-board] :global(.home-page > .page > .block-slot[data-key='needs-you']) {
      grid-row: 1 / span 2;
      grid-column: 1 / span var(--n);
    }

    .body[data-board]:not(:has(:global([data-needs-foot]:not([data-alone])))) :global(.home-page > .page > .block-slot[data-key='needs-you']),
    .body[data-board] :global(.home-page > .page > [data-needs-foot][data-alone]) {
      grid-row: 1 / span 3;
      grid-column: 1 / span var(--n);
    }

    .body[data-board] :global(.home-page > .page > [data-needs-foot]:not([data-alone])) {
      grid-row: 3;
      grid-column: 1 / span var(--n);
    }

    .body[data-board] > :global([data-working]),
    .body[data-board] :global(.home-page > .page > :is([data-working], .block-slot[data-key='working'])) {
      grid-row: 1;
      grid-column: calc(var(--n) + 1) / -1;
    }

    .body[data-board] :global(.home-page > .page > .block-slot[data-key='cash']) {
      grid-row: 2 / span 3;
      grid-column: calc(var(--n) + 1) / -1;
    }

    .body[data-board]:not(:has(:global(:is([data-working], .block-slot[data-key='working'])))) :global(.home-page > .page > .block-slot[data-key='cash']) {
      grid-row: 1 / span 4;
    }

    /* WITH WHAT IS LATE THE LEFT STACK IS FOUR TRACKS: the late tile beside who is working, then Needs you over two and
       its foot beside cash. The late tile and who is working fill their track together, so neither ends short of the
       other. AND THE TWO STACKS END ON ONE LINE (the boards' balance): the foot and cash each stretch to the last track,
       so whichever column is the shorter takes the air at its foot rather than leaving a hole beside the other. */
    .body[data-board]:has(> .today-late) > .today-late {
      grid-row: 1;
      grid-column: 1 / span var(--n);
      align-self: stretch;
    }

    .body[data-board]:has(> .today-late) > :global([data-working]),
    .body[data-board]:has(> .today-late) :global(.home-page > .page > :is([data-working], .block-slot[data-key='working'])) {
      align-self: stretch;
    }

    .body[data-board]:has(> .today-late) :global(.home-page > .page > .block-slot[data-key='needs-you']) {
      grid-row: 2 / span 2;
    }

    .body[data-board]:has(> .today-late):not(:has(:global([data-needs-foot]:not([data-alone])))) :global(.home-page > .page > .block-slot[data-key='needs-you']),
    .body[data-board]:has(> .today-late) :global(.home-page > .page > [data-needs-foot][data-alone]) {
      grid-row: 2 / span 3;
    }

    .body[data-board]:has(> .today-late) :global(.home-page > .page > [data-needs-foot]:not([data-alone])) {
      grid-row: 4;
      align-self: stretch;
    }

    .body[data-board]:has(> .today-late) :global(.home-page > .page > .block-slot[data-key='cash']) {
      grid-row: 2 / span 3;
      align-self: stretch;
    }

    .body[data-board]:has(> .today-late):not(:has(:global(:is([data-working], .block-slot[data-key='working'])))) :global(.home-page > .page > .block-slot[data-key='cash']) {
      grid-row: 1 / span 4;
    }

    /* EVERY CELL OF THE FIRST ROW'S TRACKS IS HELD, the fourth under the foot and the right column where there is no
       cash, so nothing laid out later lands in one. It is no height and lies under the tiles. */
    .body[data-board] > .row-one-rest {
      display: block;
      grid-row: 2 / span 3;
      grid-column: 1 / -1;
    }

    .body[data-board] :global(.home-page > .page > .block-slot[data-key='week-due']) {
      grid-column: span 8;
    }

    .body[data-board] :global(.home-page > .page > .block-slot[data-key='week-money']) {
      grid-column: span 4;
    }

    .body[data-board] > :global([data-landed]),
    .body[data-board] :global(.home-page > .page > [data-landed]) {
      grid-column: span var(--a);
    }

    .body[data-board] :global(.home-page > .page > .block-slot[data-key='coming-up']) {
      grid-column: span var(--u);
    }

    .body[data-board] :global(.home-page > .page > .block-slot[data-key='faces']) {
      grid-column: span var(--p);
    }
  }

  @container desk (640px <= inline-size < 960px) {
    .body[data-board] > :global([data-working]),
    .body[data-board] :global(.home-page > .page > [data-working]),
    .body[data-board] :global(.home-page > .page > .block-slot:is([data-key='working'], [data-key='cash'], [data-key='coming-up'], [data-key='faces'])) {
      grid-column: span 6;
    }

    /* ONE OF THE PAIR MISSING, the other takes the row. */
    .body[data-board]:not(:has(:global(.block-slot[data-key='cash']))) > :global([data-working]),
    .body[data-board]:not(:has(:global(.block-slot[data-key='cash']))) :global(.home-page > .page > [data-working]),
    .body[data-board]:not(:has(:global(.block-slot[data-key='cash']))) :global(.home-page > .page > .block-slot[data-key='working']),
    .body[data-board]:not(:has(:global(:is([data-working], .block-slot[data-key='working'])))) :global(.home-page > .page > .block-slot[data-key='cash']),
    .body[data-board]:not(:has(:global(.block-slot[data-key='faces']))) :global(.home-page > .page > .block-slot[data-key='coming-up']),
    .body[data-board]:not(:has(:global(.block-slot[data-key='coming-up']))) :global(.home-page > .page > .block-slot[data-key='faces']) {
      grid-column: 1 / -1;
    }
  }

  /* ── the tiles, as Today draws them (the Today polish of 20 October) ── */

  /* THE TILES COME IN ONCE, on the first load: a fade and a 4px rise, each as it lands. */
  .body[data-board][data-enter] :global(.home-page > .page > *),
  .body[data-board][data-enter] > :global(:not(.row-one-rest)) {
    animation: tile-in var(--d-page) var(--ease-out) both;
  }

  @keyframes -global-tile-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .body[data-board][data-enter] :global(.home-page > .page > *),
    .body[data-board][data-enter] > :global(:not(.row-one-rest)) {
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
     two figures are never read as the same kind of number. */
  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:nth-child(2) .cell-figure) {
    color: var(--good);
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:nth-child(2) .cell-figure::before) {
    content: '+';
  }

  .body[data-board] :global(.block-slot[data-key='cash'] .grid > .cell:nth-child(3) .cell-figure::before) {
    content: '\2212';
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

  .body[data-board] :global(.block-slot[data-key='cash'] .cell-note:empty) {
    display: none;
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

  .body[data-board] :global(.block-slot[data-key='faces'] .cards-head) {
    flex: none;
    max-inline-size: 60%;
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

  /* THE BOARD'S FOOT: More at the start, and the use case's own page at the end where the record holds one. */
  .desk-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    min-inline-size: 0;
  }

  /* ONE QUIET LINK, as a tile's own: 13/500 in the second ink, its arrow after it. */
  .desk-own {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    border-radius: var(--r-xs);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .desk-own:hover {
    color: var(--ink);
  }

  /* MORE: one plain line across the board, a full target, the count in the quiet ink, the chevron turned when open. */
  .more {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .more-count {
    color: var(--ink-3);
    font-weight: 400;
  }

  .more :global(.icon) {
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-out);
  }

  .more[aria-expanded='true'] :global(.icon) {
    transform: rotate(180deg);
  }

  .more:hover > span:first-child {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .more :global(.icon) {
      transition: none;
    }
  }

  .more-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
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
