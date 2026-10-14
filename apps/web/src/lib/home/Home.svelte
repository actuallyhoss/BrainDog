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

  THREE READS OF THEIR OWN STAND AROUND THE PAGE: the briefing over it, what matters today as the record wrote it;
  what went stale under it; and who the record matched as the board's last line. Each is asked for beside the page and
  never by its read, each is fetched with its own part when it is asked for, and each draws nothing for a record that
  answers none (`homeReads`). Under them all, the board's last tile: what the record found wrong in its own pages and
  notes (`TextFaults.svelte`), fetched the same way and drawn only when it found something. After it, last of all,
  what the answers taught (`Learned.svelte`), the same way.
-->
<script module lang="ts">
  /** What Today draws, top to bottom. */
  export type HomePart = 'briefing' | 'page' | 'stale' | 'matched';

  /**
   * What Today draws and in what order, from how many briefing cards, how many matches and how many kinds of stale
   * thing the record answered: the briefing first, the page, what went stale under it, and who was matched last. A
   * read still out, a refusal and an empty answer are all none, and a record with none of them draws its page as it
   * did before there was any.
   *
   * `stale` IS LAST AND MAY BE LEFT OUT, so a caller written before there was one answers as it did.
   *
   * IT IMPORTS NOTHING, so `home-reads.test.ts` runs it as it is written.
   */
  export function homeReads(briefing: number, matched: number, stale = 0): HomePart[] {
    const parts: HomePart[] = ['page'];
    if (briefing > 0) parts.unshift('briefing');
    if (stale > 0) parts.push('stale');
    if (matched > 0) parts.push('matched');
    return parts;
  }
</script>

<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { heard, homePage, said } from '$lib/voice.svelte.ts';
  import { VOICE_LINES, homeSlugOf } from '$lib/voice.ts';
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
    TELL_LINE,
    drawsAny,
    homeDrawn,
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
  import { addedByHand, showTell, tellLists, wantMore } from '$lib/home/first-today.ts';
  import TellOne from '$lib/home/TellOne.svelte';
  import WantMore from '$lib/home/WantMore.svelte';
  import { read as readPref } from '$lib/pref.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import { learn } from '$lib/record/remote.ts';
  import { madeSteps } from '$lib/start/made.ts';
  import { playedBy } from '$lib/start/parts.ts';
  import type { TellOptions } from '$lib/tell/read.ts';
  import { createClient, type Cursor } from '@braindog/client';
  import { sentenceOf } from '$lib/home/today-tiles.ts';
  import { waitsNow, workingNow } from '$lib/home/waits.svelte.ts';
  import { words } from '$lib/home/words.ts';
  import { cutLine, homeLineOf } from '$lib/home/home-line.ts';
  import type { BriefingRow } from '$lib/home/briefing.ts';
  import type { MatchedRow } from '$lib/home/matched.ts';
  import type { StaleRow } from '$lib/home/stale.ts';
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { typing } from '$lib/a11y/keys.svelte.ts';

  import { closed, drew, opened } from '../ui/screen.svelte.ts';

  let { data }: { data: Shell } = $props();

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

  /* THE TITLE IS THE VOICE'S WORD FOR HOME WHEN A USE CASE SAYS ONE, else Today. */
  const title = $derived.by(() => {
    const voiced = said('home');
    return voiced !== VOICE_LINES.home ? voiced : copy.today;
  });

  /* THE CALM LINE IS THE VOICE'S when a use case words it, and otherwise Home's own. */
  const nothing = $derived(said('nothing_needs_you') !== VOICE_LINES.nothing_needs_you ? said('nothing_needs_you') : words.nothingNow);

  /* TODAY'S HEADINGS IN THE VOICE THAT SPEAKS, read before the page is asked for so a voice that lands after the first
     read asks it again in its own words. Built by the same helper the arrange mode rebuilds Today's body with, so the
     body arranged is the body drawn. */
  const voice = $derived<HomeVoice>(voiceOf(said));

  /**
   * ONLY A PAGE THE RECORD HOLDS IS ASKED FOR. A use case may declare no Home page (a reading club shared as a file), and
   * asking for `home-<use case>` anyway logged a refusal on every Home load. `boot` names every page, so the use case's
   * page is asked for when it is there, then the record's `home` when that is, and otherwise Today's body is drawn.
   */
  const declares = $derived(homeSlugOf(homePage(), data.pages));

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

  /* THE NEXT STEPS, under Today's blocks, on a first Today only: a record kept for months is not offered them, and its
     Today reads as it did. Gone for good once hidden (`nextStepsHidden`). */
  const steps = $derived.by(() => {
    if (!first || prefs.nextStepsHidden === true || added > FIRST_TODAY_MOST) return [];
    return told ? madeSteps(kept.registers, prefs.arrivesBy) : wantMore(kept, prefs);
  });

  /**
   * WHAT THE RECORD DECLARES ITS LISTS TO BE, which the card reads a sentence against and Today's week is found in. A
   * tab learns a list's declaration when a reader first asks (`learn`); Home asks for the lists it has not learnt only
   * where it needs them: while the card shows, and where Today's own body is drawn. `learnt` moves when they land.
   */
  let learnt = $state(0);
  const asked = new Map<string, Promise<void>>();
  $effect(() => {
    if (data.refused || (declares !== null && !tell)) return;
    const missing = data.lists.map((l) => l.id).filter((id) => REGISTERS[id] === undefined);
    /* ALL OF THEM LEARNT ALREADY: said once, so a later read of the shell does not draw Today's body again for nothing. */
    if (missing.length === 0) {
      if (untrack(() => learnt) === 0) learnt = 1;
      return;
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

  /* WHAT TODAY'S BODY IS BUILT AROUND, read off the shell, by that same mode's helper: a block over a list the record
     does not keep is not asked for. It carries one of the tasks list as the record words it (`one`), which names the
     line a task is typed into, read again when the voice is heard so a list renamed in Settings › Words renames the
     line too. And the record's week, where Today's own body is drawn over one. */
  const holds = $derived<Holds>(week ? { ...holdsOf(data, heard()), week } : holdsOf(data, heard()));
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
  type News = { upTo: Cursor | null; unseen: number; held: number };
  let news: News | null = null;
  /** Which read of the page is the latest: an older one's answer, landing late, is not the page on screen. */
  let pageRead = 0;
  async function newsNow(): Promise<News | null> {
    try {
      const out = await createClient({ base: apiBase() }).whatsNew();
      if (!out.ok) return null;
      const held = out.value.events.reduce((top, e) => Math.max(top, e.rowid ?? 0), 0);
      return { upTo: out.value.upTo, unseen: out.value.events.length, held };
    } catch {
      return null;
    }
  }
  /** Keep what was new beside the page just drawn, unless a later read of the page has gone out since. */
  function keepNews(before: Promise<News | null>, mine: number): void {
    void before.then((now) => {
      if (now !== null && mine === pageRead) news = now;
    });
  }

  /** Home's page, from whichever of the three sources the record holds. */
  async function readBody(slug: string | null, spoken: HomeVoice, held: Holds): Promise<Opened | null> {
    if (slug !== null) {
      const m = await import('$lib/record/page-live.ts');
      return m.pageReader(apiBase()).read(slug);
    }
    /* TODAY'S BODY IS DRAWN BY THE RECORD, never installed: `previewPage` answers the body as `page` answers an installed
       one, each block held to the reader, and writes nothing. `drawnOf` is the one reader of that answer. A host built
       before it reads what went quiet answers that one tile as a refusal, which is not drawn (`quietHeld`). */
    const body = todayHome(held, spoken);
    const m = await import('../../routes/decide/[id]/proposed.ts');
    const drawn = await m.drawnOf(body, apiBase());
    if (drawn.from === 'live')
      return { from: 'live', page: { page: { page: body.page, title: body.title, layout: body.layout }, blocks: quietHeld(drawn.blocks) }, now: drawn.now };
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
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    reading = true;
    const mine = ++pageRead;
    const before = newsNow();
    void readBody(slug, spoken, held)
      .then((out) => {
        if (slug !== declares) return;
        got = out;
        ok = out?.from === 'live';
        if (ok) keepNews(before, mine);
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
    const mine = ++pageRead;
    /* A home that draws no feed of the log has shown nothing new, and asks nothing. */
    const before = untrack(() => feeds) ? newsNow() : null;
    try {
      const out = await readBody(
        slug,
        untrack(() => voice),
        untrack(() => holds),
      );
      if (slug === declares && out?.from === 'live') {
        got = out;
        if (before) keepNews(before, mine);
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
    return w === null ? null : { questions: w.questions, inbox: w.inbox, working: w.working, seqs: workingNow().map((r) => r.seq) };
  });

  /* THE PAGE AS HOME DRAWS IT: its line lifted into the head, each row once, and nothing drawn that holds nothing. */
  const shaped = $derived(live ? homeDrawn(live.page.blocks, live.now, voice, one, waits, declares === null ? holds.week : undefined) : null);

  /* THE LINE `boot`'S COUNTS SAY BY THEMSELVES, for a page that draws nothing it can be counted from; `null` while nothing
     waits, which is the only time the calm line may be said. */
  const waitsLine = $derived(
    waits && (waits.questions > 0 || (waits.inbox ?? 0) > 0) ? sentenceOf(waits.questions, [], waits.working, '', 0, waits.inbox ?? 0) : null,
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

  /* THE PAGE AS HOME DRAWS IT, handed to the reader whole, so the reader's writes index the blocks it draws. A rail with
     nothing beside it, or nothing in it, is one column. */
  const drawn = $derived.by((): Opened | null => {
    if (!got || got.from !== 'live' || !shaped) return got;
    if (railed(shaped.blocks)) return { ...got, page: { page: got.page.page, blocks: shaped.blocks } };
    const { layout: _rail, ...flat } = got.page.page;
    return { ...got, page: { page: flat, blocks: shaped.blocks } };
  });
  const slug = $derived(live?.page.page.page ?? declares ?? 'today');

  /* THE READER THE BODY IS DRAWN BY, whose writes the line in the head adds through (`PageView`'s `capture`). */
  let view = $state<{ capturable: (block: LiveBlock) => boolean; capture: (register: string, text: string, inherited: Record<string, string>) => void }>();

  /* THE LINE A TASK IS TYPED INTO, in the head beside the name, where the page has one and its list can take a line. */
  const capture = $derived(shaped?.capture && view?.capturable(shaped.capture) ? shaped.capture : null);

  /* BESIDE THE NAME FROM 900px, AND UNDER THE SENTENCE ON A PHONE (`PageHead`'s `below`): wrapped out of the name's
     row there, it stood between "Today" and the line that says what today holds. Drawn once, in one place or the other. */
  const wide = new MediaQuery('(width >= 900px)', true);

  /**
   * THE THREE READS AROUND THE PAGE, each with the part that draws it: the briefing (`briefing.ts`), what went stale
   * (`stale.ts`) and who the record matched (`matched.ts`). `null` until one has answered, and an answer of none
   * draws nothing.
   *
   * BESIDE THE PAGE READ AND NEVER IN IT. The page is asked for in its own effect and waits on none of them, so Today
   * paints as fast as it did; what lands later is put in its place by `homeReads`, keyed, and moves nothing drawn.
   *
   * FETCHED WHEN ASKED FOR, the reader and its part alike, as `Today.svelte` fetches the briefing's: this screen is the
   * front door, and nothing here is added to what it loads first. No read of them can fail the screen, since each
   * answers none for a host without the call, a reader it refuses and a line that dropped.
   *
   * ASKED AGAIN WHEN THE RECORD MOVES, and what is drawn stays until the new answer lands.
   */
  type BriefingPart = typeof import('./Briefing.svelte').default;
  type MatchedPart = typeof import('./Matched.svelte').default;
  type StalePart = typeof import('./Stale.svelte').default;
  type FaultsPart = typeof import('./TextFaults.svelte').default;
  type FaultsFound = import('./text-faults.ts').TextFaults;
  type LearnedPart = typeof import('./Learned.svelte').default;
  type LearnedFound = import('./learned.ts').Learned;
  let brief = $state.raw<{ cards: readonly BriefingRow[]; foot: string | null; Part: BriefingPart } | null>(null);
  let matched = $state.raw<{ rows: readonly MatchedRow[]; Part: MatchedPart } | null>(null);
  let stale = $state.raw<{ rows: readonly StaleRow[]; Part: StalePart } | null>(null);
  /* WHAT THE RECORD FOUND WRONG IN ITS OWN PAGES AND NOTES, kept only when there is something: nought draws nothing. */
  let faults = $state.raw<{ found: FaultsFound; Part: FaultsPart } | null>(null);
  /* WHAT THE ANSWERS TAUGHT, kept only when there is something: nought draws nothing. */
  let learned = $state.raw<{ found: LearnedFound; Part: LearnedPart } | null>(null);
  $effect(() => {
    if (data.refused) return;
    void moving.version;
    const base = apiBase();
    let here = true;
    /* BRACKETED AS A READ OF THIS SCREEN, so the screen is not measured with a tile still on its way, and closed as
       fine whatever came back: none of the reads refuses the screen. */
    const at = untrack(opened);
    const briefing = Promise.all([import('./briefing.ts'), import('./Briefing.svelte')]).then(async ([m, part]) => {
      const out = await m.readBriefingSaid(base);
      if (here) brief = { cards: out.value.rows, foot: m.footOf(out.value), Part: part.default };
    });
    const matches = Promise.all([import('./matched.ts'), import('./Matched.svelte')]).then(async ([m, part]) => {
      const out = await m.readMatched(base);
      if (here) matched = { rows: out.value, Part: part.default };
    });
    const stales = Promise.all([import('./stale.ts'), import('./Stale.svelte')]).then(async ([m, part]) => {
      const out = await m.readStale(base);
      if (here) stale = { rows: out.value, Part: part.default };
    });
    /* THE BOARD'S LAST TILE, so it is out of the screen's bracket: landing late, it moves nothing drawn over it. */
    void Promise.all([import('./text-faults.ts'), import('./TextFaults.svelte')]).then(async ([m, part]) => {
      const found = await m.loadTextFaults(base);
      if (here) faults = found && found.count > 0 ? { found, Part: part.default } : null;
    }, () => undefined);
    /* AND AFTER IT, WHAT THE ANSWERS TAUGHT, out of the bracket the same way. */
    void Promise.all([import('./learned.ts'), import('./Learned.svelte')]).then(async ([m, part]) => {
      const found = await m.loadLearned(base);
      if (here) learned = found && found.rows.length > 0 ? { found, Part: part.default } : null;
    }, () => undefined);
    void Promise.allSettled([briefing, matches, stales]).then(() => closed(true, at));
    return () => {
      here = false;
    };
  });

  /* NOTHING TO DRAW AT ALL: the line says so, and nothing under it. A host that cannot draw Today's body is calm too. */
  const calm = $derived((shaped !== null && !drawsAny(shaped.blocks)) || (settled && got === null));

  /* WHETHER THE PAGE'S READER IS DRAWN, and whether it is drawing the page's blocks (`paged`) and not its bars.
     THE BRIEFING IS DRAWN BY THE READER WHEN IT IS: a page that opens on a sentence of its own (a `note lead` that fills
     figures, the cash line) keeps that sentence straight under the head's line, and the briefing follows it as the first
     tile. Drawn over the page it stood between the head and the page's sentence, which then read as a line lost between
     two tiles. Where no reader draws the blocks, the briefing is drawn here, first, as it was. */
  const reader = $derived((drawn !== null && (!calm || Boolean(shaped?.capture))) || !settled);
  const paged = $derived(reader && drawn?.from === 'live');

  /* A RECORD WITH NO LISTS AT ALL goes to the prompt (`+layout.ts`); this is what is left if it is reached anyway. */
  const empty = $derived(data.index.registers.length === 0 && data.lists.length === 0 && data.open === 0);

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

<!-- THE PAGE'S NAME WITH ITS ICON, as every place's header draws it (DIRECTION §39), the day over it and the one line
     under it. -->
<PageHead
  {title}
  icon="today"
  kicker={today}
  sentence={tell ? TELL_LINE : slashed ? slashSaid : lead?.text}
  needs={tell || slashed ? undefined : lead?.needs || undefined}
  actions={capture && wide.current ? headCapture : undefined}
  below={capture && !wide.current ? headCapture : undefined}
/>

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

<!-- WHAT MATTERS TODAY, with who wrote it, drawn once: by the page's reader, or here where none draws the blocks. -->
{#snippet briefed()}
  {#if brief}<brief.Part cards={brief.cards} foot={brief.foot} />{/if}
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
    <!--
      TOP TO BOTTOM AS `homeReads` SAYS: the briefing, the page, what went stale, who was matched. Keyed by the part, so a read that
      lands after the page is put over or under it and the page drawn is the page that stays. The briefing is the first
      tile either way: handed to the page's reader where one draws the blocks (`paged`), under the page's own sentence.
    -->
    {#each homeReads(brief?.cards.length ?? 0, matched?.rows.length ?? 0, stale?.rows.length ?? 0) as part (part)}
      {#if part === 'briefing'}
        <!-- WHAT MATTERS TODAY, first, and nothing where the record wrote no briefing. -->
        {#if !paged}{@render briefed()}{/if}
      {:else if part === 'stale'}
        <!-- WHAT WENT STALE AND WHERE EACH IS CLEARED, under the page, and nothing where nothing is stale. -->
        {#if stale}<stale.Part rows={stale.rows} />{/if}
      {:else if part === 'matched'}
        <!-- WHO THE RECORD MATCHED ON ITS OWN, the board's last line, and nothing where it matched nobody. -->
        {#if matched}<matched.Part rows={matched.rows} />{/if}
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

        <!-- A CALM PAGE WITH A LINE IN ITS HEAD STILL DRAWS ITS READER, which holds the writes the line adds through. -->
        {#if reader}
          <div class="body">
            <PageView bind:this={view} {slug} got={drawn} mode="home" {reread} opens={paged && brief && brief.cards.length > 0 ? briefed : undefined} />
          </div>
        {/if}

        <!-- AND UNDER TODAY'S BLOCKS, THE NEXT STEPS, until they are hidden. -->
        {#if steps.length > 0}<WantMore {steps} onhide={() => (prefs = readPref())} />{/if}
      {/if}
    {/each}
    <!--
      WHAT THE RECORD FOUND WRONG IN ITS OWN PAGES AND NOTES, after what went stale and who was matched: the board's last
      tile, so the six a page shows before its fold are never pushed down by it. A tile and never a question, and
      nothing at nought.
    -->
    {#if faults}<faults.Part found={faults.found} lists={data.lists} />{/if}
    <!-- WHAT THE ANSWERS TAUGHT, the board's very last tile: what the record will not ask again. Nothing at nought. -->
    {#if learned}<learned.Part found={learned.found} />{/if}
  {/if}
</div>

<style>
  /* ── the head ─────────────────────────────────────────────────────────── */

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
