<!--
  A declared page, drawn: the one reader every declared page goes through, wherever it is drawn.

  ONE READER, THREE MODES. `page` is `/p/<slug>`: the head, the source,
  Edit layout, the writes and the keys. `home` is the body of Home and of Needs you: no head and no source, the writes stay on,
  and the page menu waits at the body's top end until the pointer or focus is on the page (`home-arrange.ts`). `preview` is a page not yet installed, drawn as it would be: inert, with no writes, no arranging and no source,
  and with `was` it is drawn beside the page as it is now, one at a time on a phone. Home and Needs you each drew a
  declared page a second and a third way, as a flat stack of blocks with no layout; they draw it through this now.

  THIS FILE IS THE FRAME. It was 1,752 lines holding six jobs, and every change to a page needed the one file, so it
  is split one job to a file: `PageBody.svelte` lays the blocks out, `BlockSlot.svelte` draws one, `Arrange.svelte` is
  Edit layout, `page-writes.ts` is every write a page makes, `SourceView.svelte` is how the page is built, and the host's
  panels are `panels/`. What stays here is what a page is before any of those: waiting, refused, missing, its head, and
  which of them to draw.

  THE CALLER READS AND THIS DRAWS. `/p/[slug]` owns the address, the record read and its `opened()` and `closed()`
  bracket, and hands this the answer as `got`, `null` while the read is out. `reread` is the caller's too, because only
  the caller knows whether the reader is still on the page the answer is for, and a write that lands here asks it for
  the page again without blanking it.
-->
<script lang="ts">
  /* `at` IS THE BLOCK INDEX WHERE THE PAGE BODY LAYS BLOCKS OUT, so the address helper goes by another name here too. */
  import type { Snippet } from 'svelte';
  import { apiBase } from '../at.ts';
  import { titleOf } from '$lib/title.ts';
  /* THE KINDS ONLY A DECLARED PAGE DRAWS, with the screen that draws them rather than in the sheet every screen waits
     on (`blocks-kinds.css`). Before the charts, in the order the rules had when they were one sheet. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  /* EVERY REGISTERED KIND'S STYLESHEET, with the screen that draws its blocks (`kinds/styles.ts`). */
  import './kinds/styles.ts';
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Filters } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { covered, typing } from '$lib/a11y/keys.svelte.ts';
  import { hueOf, iconFor } from '$lib/record/api.ts';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { askWalk, forgetWalks, walkAsked, type LiveBlock, type Opened, type Walked } from '$lib/record/page-live.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ShareMenu from '$lib/ui/ShareMenu.svelte';
  import ShareLazy from '$lib/sharing/ShareLazy.svelte';
  import type { Subject } from '$lib/sharing/share-state.ts';
  import { canShare } from '$lib/sharing/may-share.ts';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Arrange, { added } from './Arrange.svelte';
  import ChangePage from './ChangePage.svelte';
  import PageBody from './PageBody.svelte';
  import { isProject, withoutRepeats, type Block } from '$lib/record/project.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { rowScreen } from '$lib/record/row-href.ts';
  import { hueOf as projectHue, slotStyle } from '$lib/home/project-cards.ts';
  import { onProject, moreSaid } from './project-page.ts';
  import HeadCapture from '$lib/home/HeadCapture.svelte';
  import { areaOf, headCaptureAt, layoutOf } from './layout.ts';
  import { arranged, emptyHidden } from './home.ts';
  import { leadIndex } from './lead.ts';
  import { stampOf } from './read-mark.ts';
  import { markAll } from '$lib/record/news-live.ts';
  import type { Cursor } from '@braindog/client';
  import { asksActions, judgedWith, readHeld } from './panels.ts';
  import type { ActionRow } from '$lib/record/actions.ts';
  import { heldNone, pageWrites, type Held } from './page-writes.ts';
  import { liveArrivals } from '$lib/data/optimistic.svelte.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { may } from '$lib/record/may.ts';
  import { words } from './words.ts';
  import { heldTo, holdsOf, inVoice, keptAs, previewedBody, readToArrange, weekHeld, type ToArrange } from './home-arrange.ts';
  import { said } from '$lib/voice.svelte.ts';
  import BatchBar from './BatchBar.svelte';
  import { filterOf, filterQuery, filtersOf } from './filters.ts';
  import { Picked } from './picked.svelte.ts';
  import { RowHost } from './row-host.svelte.ts';
  import RowPanel from './RowPanel.svelte';
  import ChangesPanel from './ChangesPanel.svelte';
  import RowVerbMenu from './RowVerbMenu.svelte';
  import { blockKeys } from './recompose.ts';
  import { HEAD_WORDS, headOf, searchQuery } from './declared-head.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { at } from '../at.ts';
  import { arrivedNow, keepLook, keptHere, lookOrder, lookPage, offerKey, offered, offerUndo, placedOf, undoLook } from './look.ts';

  let {
    slug,
    got,
    mode = 'page',
    showSource = false,
    reread = async () => {},
    was = null,
    select = false,
    whole = false,
    offer,
    opens,
    between,
    waiting,
  }: {
    /**
     * What a project's page draws while its shape's code is on its way, the project in its own shape (`ProjectWaiting`,
     * handed in by the route so this file's chunk does not carry it). Left out, nothing is drawn there, as before.
     */
    waiting?: Snippet | undefined;
    /** The page's address, which arranging writes against and a missing page names. */
    slug: string;
    /** The record's answer, a page it lacks or its refusal; `null` until it answers. */
    got: Opened | null;
    /** Where the page is drawn: its own address, Home's body, or a preview of a page not yet installed. */
    mode?: 'page' | 'home' | 'preview';
    /** Whether the declaration is drawn in place of the blocks (`?src=1`). Only a `page` has a source. */
    showSource?: boolean;
    /** Reads the page again after a write, without blanking it. The caller's, because the caller knows the address. */
    reread?: () => Promise<void>;
    /** A preview's page as it is now, drawn beside the page as the change would make it. */
    was?: LiveBlock[] | null;
    /** Whether a home's queues may be chosen several at a time and answered from one bar, as Decide's are. */
    select?: boolean;
    /** Whether a home's questions are drawn whole (Decide) rather than compact (everywhere else). */
    whole?: boolean;
    /**
     * The pen's offer for this page (uc6-places-47), drawn UNDER THE PAGE'S OWN BLOCKS and inside `.hosted`. It was
     * drawn between the header and the first tile, where on Money it took a phone's whole first screen and stood over
     * the accounts on a laptop (look fault G): an offer never outranks what the page was opened for. So it is the
     * board's last line, one quiet row that opens on tap, as "Changed for you" sits at the bottom of the
     * board. Not drawn over the page's source, which is the declaration and nothing else.
     */
    offer?: Snippet | undefined;
    /**
     * What a home draws where its board opens (Today's briefing), handed to the body, which puts it under the page's
     * own sentence where the page opens on one (`PageBody`'s `opens`). Read only by a `home`.
     */
    opens?: Snippet | undefined;
    /** What a home draws between its blocks, before the one at an index (`PageBody`'s `between`). Read only by a `home`. */
    between?: Snippet<[number]> | undefined;
  } = $props();

  /* A PAGE IS THE RECORD'S BLOCKS AND NOTHING ELSE; a record that does not answer is its refusal, drawn below. */
  const live = $derived(got?.from === 'live' ? got : null);

  /* ── the page's declared head (PGS-A14) ────────────────────────────────────
     A PAGE THAT SAYS `header:` IS ANSWERED A HEAD, drawn round its title and sentence as they are: the kicker over the
     name, the count beside it, the state with its mark and words, the one primary button, a search the address holds
     and a way back. A page with none, or one this build cannot read (`headOf`), draws exactly as it did. */
  const declared = $derived(mode === 'page' && live ? headOf(live.page.page) : null);
  /* THE WAY BACK RIDES IN THE KICKER'S PLACE, as on every hand-written screen (`PageHead`'s `back`), unless the page
     says a kicker of its own; then it is a plain link under the name. */
  const backInKicker = $derived(!!declared?.back && !declared.kicker);
  const headKicker = $derived(declared?.kicker ?? declared?.back?.label ?? live?.page.page.nav?.section);
  const headBelow = $derived(!!declared && (!!declared.state || !!declared.search || (!!declared.back && !backInKicker)));
  function pressHead() {
    if (declared?.action) void writes.act(declared.action);
  }
  /* WHAT IS TYPED IN THE SEARCH IS THE ADDRESS'S, so a narrowed page is a link and Back undoes it. The field keeps what
     is being typed while the address catches up, and takes the address's word when Back or a link changes it. */
  let searched = $state('');
  let sent: string | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const param = declared?.search?.param;
    const there = param ? (route.url.searchParams.get(param) ?? '') : '';
    untrack(() => {
      if (there !== sent) {
        searched = there;
        sent = null;
      }
    });
  });
  function onsearch(param: string, typed: string) {
    searched = typed;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      sent = typed.trim();
      void goto(`?${searchQuery(route.url.searchParams, param, typed)}`, { keepFocus: true, noScroll: true, replaceState: true });
    }, 250);
  }
  $effect(() => () => clearTimeout(searchTimer));

  /* ── what the actions panel holds ──────────────────────────────────────────
     A PART WITH SOMETHING IN IT MUST NOT VANISH. A boxed section whose panel is the project's
     scheduled actions is judged with its blocks, and the panel reads its actions only once it is drawn, so the page
     counts them first (`panels.ts`): ONE READ A PAGE, for the row it is drawn for, and only where a section waits on
     it. `null` until the read is back, and for good where nothing asks or the record refused. Read again for another
     row, never for the same page read again after a write. */
  /* What the project's shape draws on this page, said by `ProjectShape` once its reads are back. */
  let shapeDrew = $state.raw<readonly Block[]>([]);
  let shapeRow = $state.raw<Readonly<Record<string, unknown>> | null>(null);
  /* Whether the shape's reads are back. Until they are, what it runs on is taken as the shape's, so a declared Runs on
     does not stand empty and then go when the shape lands (the audit of 20 October, on a project page). */
  let shapeKnown = $state(false);
  const about = $derived(mode === 'page' ? (live?.page.page.param ?? null) : null);
  const spoken = $derived(about ? `${about.register}#${about.seq}` : null);
  /* A PAGE ABOUT A PROJECT'S ROW (proj section 4): its hero holds the name, so the head is the way back and the actions. */
  const projectPage = $derived(about !== null && isProject(REGISTERS[about.register]));
  /* THE ROW'S OWN FIELDS UNDER A PAGE ABOUT IT (things, not rows): the page speaks first, and "Show the data" opens the
     row's screen, which stays where it is because the address asks for its fields. A project's shape has its own. */
  const dataHref = $derived(about !== null ? rowScreen(about.register, about.seq) : null);
  /* AND ITS ONE PRESS, the list's own finishing word ("Mark paid" on a bill), read for the row once (`row-finish.ts`). */
  let finish = $state.raw<{ key: string; said: string } | null>(null);
  $effect(() => {
    const of = about && !projectPage ? about : null;
    const key = of ? `${of.register}#${of.seq}` : '';
    untrack(() => {
      if (finish?.key !== key) finish = null;
      if (!of) return;
      void import('./row-finish.ts')
        .then((m) => m.finishFor(apiBase(), of.register, of.seq))
        .then((f) => {
          if (f && spoken === key) finish = { key, said: f.said };
        })
        .catch(() => undefined);
    });
  });
  async function pressFinish(): Promise<void> {
    const key = finish?.key;
    if (!key) return;
    const { finishLate } = await import('$lib/home/late-finish.ts');
    const out = await finishLate(apiBase(), key, () => void reread());
    if (out.ok) finish = null;
    else if ('fix' in out) toasts.push(out.fix, { intent: 'warn' });
  }
  /* THE WAY BACK TO THE PROJECTS, the page the rail files this one under, else the list itself. */
  const projectBack = $derived.by(() => {
    if (!projectPage || !about) return undefined;
    const under = live?.page.page.nav?.section;
    const entry = (shell?.nav ?? []).find((n) => n.title === under);
    return entry ? `/p/${entry.id}` : `/r/${about.register}`;
  });
  /* THE SAME WAY BACK WHILE THE PAGE IS READ, from the rail's entry: the page its section names. */
  const railedBack = $derived.by(() => {
    const entry = railed?.row ? (shell?.nav ?? []).find((n) => n.title === railed.section) : undefined;
    return entry ? `/p/${entry.id}` : undefined;
  });
  /* THE NEXT STEP IS THE HERO'S LAST LINE (proj F7), so the look's next action is not drawn under the head as well. */
  const bodyPage = $derived(projectPage && live?.page.page.look ? { ...live.page.page, look: { ...live.page.page.look, next: null } } : null);
  /* THE PROJECT'S COLOUR OVER EVERYTHING ON ITS PAGE (proj F6): charts draw in it, the red stays for what is late. */
  const projectStyle = $derived.by(() => {
    if (!projectPage || !about || !shapeRow) return undefined;
    const d = REGISTERS[about.register];
    const hue = d ? projectHue(d as Parameters<typeof projectHue>[0], shapeRow) : null;
    const more = moreSaid(laidFrom);
    return `${slotStyle(hue)};--chart-1:var(--ph);--chart-2:color-mix(in oklab, var(--ph) 55%, var(--tile));--chart-3:color-mix(in oklab, var(--ph) 28%, var(--tile))${more ? `;--more-said:${JSON.stringify(more)}` : ''}`;
  });
  /* WHAT THE PAGE IS ABOUT, SHARED WITH PEOPLE (sharing plan §3.1): a project's page shares the project, everything
     that names it; a page about any other row shares that row. */
  /* WHO MAY SHARE, as `ShareLazy` asks it: an owner or an Admin, and never while the record is seen as somebody. */
  const sharable = $derived(seeingAs() === null && canShare((route.data as { me?: Parameters<typeof canShare>[0] }).me));
  let sharingOpen = $state(false);
  const sharing = $derived.by((): Subject | null => {
    if (!about) return null;
    const projects = (REGISTERS[about.register] as { scopes?: unknown } | undefined)?.scopes !== undefined;
    return projects
      ? { kind: 'project', register: about.register, seq: about.seq, id: null, name: about.title }
      : { kind: 'row', list: about.register, seq: about.seq, id: null, name: about.title };
  });
  /* AN UNBOXED ACTIONS SECTION IS COUNTED TOO, for the one case that asks: it is left out when the shape took what it heads. */
  const asking = (bs: readonly LiveBlock[]) => bs.map((b) => (b.kind === 'section' && (b as { panel?: unknown }).panel === 'actions' ? ({ ...b, box: true } as LiveBlock) : b));
  const asks = $derived(spoken !== null && asksActions(asking(live?.page.blocks ?? [])));
  let tally = $state.raw<{ of: string; rows: ActionRow[] | null } | null>(null);
  $effect(() => {
    const of = asks ? spoken : null;
    if (of === null) return;
    /* BY THE ROW AND WHETHER ANYTHING ASKS, and by nothing else: the page read again is a new answer naming the same row. */
    untrack(() => {
      if (!live || !about) return;
      void readHeld((url, init) => fetch(url, init), apiBase(), asking(live.page.blocks), { spoken: of, title: about.title }).then((rows) => {
        tally = { of, rows };
      });
    });
  });
  /** The count for the row this page is drawn for, and not the one a page left behind while its own is read. */
  const counted = $derived(tally !== null && tally.of === spoken ? tally.rows : null);

  /* ── the writes ────────────────────────────────────────────────────────────
     ONE OBJECT FOR THE WHOLE PAGE, handed to every block, and none at all on a preview, which is what makes a preview
     inert: a block handed no write draws no control. What the writes hold between gestures is kept here, in a rune, so a
     held row redraws where it was. */
  let held = $state.raw<Held>(heldNone());
  const writes = pageWrites({
    slug: () => slug,
    now: () => live?.now ?? null,
    blocks: () => all,
    base: () => apiBase(),
    reread: () => reread(),
    toasts,
    state: { get: () => held, set: (next) => (held = next) },
    arrivals: liveArrivals(),
    /* A QUESTION TYPED INTO A CAPTURE IS ASKED in the palette, where search and Slash answer it. */
    ask: openPaletteWith,
    /* WHAT THE BLOCKS' OWN WRITES DID IS KEPT IN JUST CHANGED, on a page at its own address. */
    touched: (ref, mark, title) => {
      if (mode === 'page') host.note(ref, mark, title);
    },
  });

  /**
   * THE PAGE'S CAPTURE, FOR A LINE DRAWN OUTSIDE ITS BODY: Home lifts the line a task is typed into into its head
   * (`home/HeadCapture.svelte`), and the line still writes through this page's writes, so its receipt, its Undo and the
   * line drawn at the head of the list before the record has it are the page's, as they were in the tile.
   */
  export function capturable(block: LiveBlock): boolean {
    return mode !== 'preview' && writes.capturable(block);
  }
  export function capture(register: string, text: string, inherited: Record<string, string>): void {
    if (mode !== 'preview') void writes.captureLine(register, text, inherited);
  }

  /* ── the rows a page hosts ─────────────────────────────────────────────────
     A PAGE AT ITS OWN ADDRESS HOSTS ITS ROWS AS WORK DID (`row-host.svelte.ts`): one open in the docked panel, one
     menu, and Just changed; and its questions, chosen several at a time and answered from one bar (`picked.svelte.ts`).
     Home and a preview draw neither: Home's keys are its own and a preview writes nothing. */
  const host = new RowHost({
    slug: () => slug,
    base: () => apiBase(),
    blocks: () => all,
    now: () => live?.now ?? Date.now(),
    reread: () => reread(),
    toasts,
    may: (register) => may(route.data as unknown as Shell, 'write', register),
    /* WHO A BYLINE NAMES: the reader by their id, and the people `boot` named. */
    who: () => {
      const shell = route.data as unknown as Partial<Shell>;
      return { me: shell.me?.person ?? null, names: new Map(Object.entries(shell.names ?? {})) };
    },
  });
  /* LEAVING THE PAGE IS SEEING WHAT CHANGED ON IT (`byline.ts`): kept for the next visit, as the tab closes too. */
  $effect(() => {
    const away = () => host.leave();
    addEventListener('pagehide', away);
    return () => {
      removeEventListener('pagehide', away);
      host.leave();
    };
  });
  const picked = new Picked({ base: () => apiBase(), reread: () => reread(), toasts });
  $effect.pre(() => {
    const on = slug;
    untrack(() => {
      host.forPage(on);
      picked.clear();
    });
  });

  /* ── the page's filters ────────────────────────────────────────────────────
     THE RECORD SAYS WHAT A PAGE MAY BE NARROWED BY (`filters`, beside its blocks), and the address holds the choice
     (`?f.thing=12`), so a filtered page is a link and Back undoes a choice. The route reads the page again with what
     the address says; this only draws the strip and moves the address. */
  const filters = $derived(live ? filtersOf(live.page.page) : []);
  const chosen = $derived(filterOf(route.url.searchParams));
  function onfilter(field: string, value: string | null) {
    void goto(`?${filterQuery(route.url.searchParams, field, value)}`, { keepFocus: true, noScroll: true });
  }


  /* THE WRITE MODULE IS FETCHED ONCE A WRITABLE PAGE HAS DRAWN, so its first tick is drawn the moment it is pressed. */
  $effect(() => {
    if (mode !== 'preview' && live) untrack(() => writes.warm());
  });

  /* THE HOLDS GO WHEN THE PAGE DOES: `/p/[slug]` keeps this component across slugs (`page-writes.ts` `forPage`). */
  $effect.pre(() => {
    const on = slug;
    untrack(() => writes.forPage(on));
  });

  /* ── arranging ─────────────────────────────────────────────────────────────
     Only a page at its own address is arranged. The arrangement is held here because two parts read it: the head's
     controls (`Arrange.svelte`) and the blocks being moved (`PageBody.svelte`). */
  const arrangement = new Arrangement();
  const arranging = $derived(arrangement.editing);
  /** Whether the page hosts its rows and questions now: at its own address, read, and not being arranged. */
  const hosting = $derived(mode === 'page' && !arranging && !showSource);
  /** Whether the filter strip is drawn: on a hosted page the record says may be narrowed. */
  const strip = $derived(hosting && filters.length > 0);
  /**
   * WHAT FOLLOWS A PROJECT'S SHAPE WAITS FOR IT, on a page about a project's row, until the shape's reads are back. Which
   * blocks are drawn hangs on what the shape says (`withoutRepeats`), and the shape's hold fills the screen under the
   * head, so the blocks under it stood below the fold and then jumped up into view when a shorter shape landed (CLS 0.15
   * on a project's first open, `loop/perf/r3-diag.mjs`). They are drawn with the shape, in one frame. Not while the page
   * is arranged, which moves the blocks as they are declared.
   */
  const shapeWaits = $derived(projectPage && about !== null && !shapeKnown && !arranging && arrangement.slots === null);

  /** Blocks added in this session. They live beside the declared ones and index past them. */
  let extra = $state<PageBlock[]>([]);

  /** The arranging controls, whose way in the head's page menu offers. */
  let arranger = $state<ReturnType<typeof Arrange>>();

  /**
   * WHETHER THE PAGE OPENS ON ITS SENTENCE (`lead.ts`), which is then the header's line and not a tile (a page header,
   * not a hero): the name at 28 with its icon, the sentence once under it at 17 in the body ink, and the
   * board after. The sentence was a 40px headline in a white card of its own, with the name riding over its top, and it
   * ate the top fifth of every page. Not while arranging, where every block is a list item with a bar of its own. The
   * blocks are read as the body draws them, so a block it hides for holding nothing does not stand first.
   */
  const led = $derived(!!live && !arranging && !showSource && leadIndex(judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs))) >= 0);

  /**
   * AND THEN THE SENTENCE IS THE LEAD TILE (the Bento boards, 22 October): the page's name, count and buttons on the
   * tile's first row and the sentence under them at 40, in place of a 28px name over a 17px line floating on the board.
   * Not on a project's page, whose hero already holds its name and its line (`ProjectShape`).
   */
  const tiled = $derived(led && !projectPage);

  /**
   * WHETHER THE PAGE SAYS WHAT IT IS ITSELF: a drawn `note lead` anywhere among its blocks. Such a page does not get the
   * generic "One screen that gathers what you keep an eye on" under its title as well (`define`), which on Work stood
   * between the name and the page's own sentence and said less than it. Read whether or not the page opens on it, so the
   * line does not come back while arranging or reading the source.
   */
  /* A PAGE ABOUT A ROW is the row's own: the template's default line is not his words, so it is left off there too. NOR
     ON A PAGE AN ADD-ON BROUGHT: Money on a record whose version of it has no line of its own opened on the filler, a
     line about pages in general, above its cash (the audit of 20 October). Its own blocks say what it is. */
  const fromPack = $derived(!!live && typeof (live.page.page as { pack?: unknown }).pack === 'string');
  const headlined = $derived(!!live && (about !== null || fromPack || judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs)).some((b) => b.drawn && b.kind === 'note' && b.lead === true)));

  /**
   * A PLACE WITH NOTHING IN IT YET SAYS SO IN ONE SENTENCE, by its own first step (the audit of 22 October, U-C2): Money
   * on a new record drew its name and an Add an account box over an empty board. Only where every block the page
   * declares draws nothing but a box to add the first entry, and never on a row's own page.
   */
  const blank = $derived.by(() => {
    if (!live || about !== null || arranging || showSource) return null;
    const judged = judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs));
    if (judged.length === 0 || judged.some((b) => b.drawn && b.kind !== 'capture')) return null;
    const step = judged.find((b) => b.drawn && b.kind === 'capture' && typeof b.heading === 'string')?.heading;
    return copy.emptyPlace(typeof step === 'string' && step.trim() !== '' ? step.trim() : null);
  });

  /* ── arranging a home ──────────────────────────────────────────────────────
     TODAY AND DECIDE ARRANGE THEIR BODY, NOT WHAT THEIR SCREEN DREW (`home-arrange.ts`): the mode reads the body again,
     one block for each it declares, and a body nobody installed yet is installed by the first Done. */
  const shell = $derived(route.data as unknown as Shell);

  /* THE HEAD IS KNOWN BEFORE THE RECORD ANSWERS (EXP-D04): the rail already holds this page's name and glyph, so while
     its blocks read the head is drawn from that entry and bars stand only where the blocks go. A page the rail does not
     hold (one past its budget, or opened by its address alone) waits with the head's bar as before. */
  const railed = $derived(mode === 'page' && got === null ? ((shell?.nav ?? []).find((n) => n.id === slug) ?? null) : null);

  /* ── the reader's mark ─────────────────────────────────────────────────────
     A PAGE THAT DRAWS WHAT IS NEW SINCE THE MARK STAMPS THE MARK WHEN THE READER LEAVES IT (PGS-C02), through the one
     stamp Home and Activity use (`read-mark.ts`): one mark a visit, and a mark that did not land is tried at the next
     leave. A declared page with a `feed` `since: seen` never moved it, so the lines it called new were new again at
     every visit until Home or Activity was opened.

     ONLY A PAGE AT ITS OWN ADDRESS. Home stamps for the body it draws, and a preview writes nothing. Not over the
     declaration as text, and not for a feed this build could not draw: neither showed a line to mark read. */
  const marksNew = $derived(mode === 'page' && !showSource && !!live && live.page.blocks.some((b) => b.kind === 'feed' && b.since === 'seen' && !b.cannot));
  /* EACH PAGE VISITED HAS A STAMP OF ITS OWN, since `/p/[slug]` keeps this part across pages. The record and the cursor
     are the ones the page opened on: by the time the visit ends the address is the next screen's, and that may be
     another record's. A shell that held nothing new has no cursor, and no cursor is no mark (`stampOf`). `pagehide`
     covers a closed tab, and the effect's end covers leaving for another screen. */
  $effect(() => {
    void slug;
    const base = untrack(() => apiBase());
    /* `markAll` IS HERE BEFORE THE READER LEAVES, imported with the screen as Home's is: fetched inside the leave, a
       closing tab was gone before the module came and the mark was never sent. */
    const stamp = stampOf((upTo) => markAll(base, upTo));
    let drew: { upTo: Cursor | null } | null = null;
    /* Its own effect, so the feed arriving does not end the visit and send the mark early. */
    $effect(() => {
      if (marksNew) drew = { upTo: shell.upTo ?? null };
    });
    const leave = () => {
      if (drew) void stamp.leave(drew.upTo);
    };
    addEventListener('pagehide', leave);
    return () => {
      removeEventListener('pagehide', leave);
      leave();
    };
  });
  /** The page this home arranges and whether the record holds it, or `null` off a home or for one with nothing to arrange. */
  const kept = $derived(mode === 'home' && live ? keptAs(slug, shell.pages ?? []) : null);
  /**
   * THE BODY A HOME IS BUILT FROM WHILE THE RECORD HOLDS NONE, as its first Done keeps it (`previewedBody`), for Change
   * this page to draft over (C25, C26): the record's week with it, as Edit layout reads it.
   */
  const builtBody = async (): Promise<unknown> => previewedBody(slug, holdsOf(shell, undefined, await weekHeld(shell)));
  /** The home's body as the mode moves it, from the moment Edit layout is chosen until the arrangement is let go. */
  let toArrange = $state.raw<ToArrange | null>(null);
  let opening = false;

  async function arrangeHome() {
    const on = kept;
    if (!on || opening) return;
    opening = true;
    try {
      /* WITH THE RECORD'S WEEK, as Home draws Today's own body: a Today kept by the first Done keeps what is due and
         what came in (`weekHeld`). */
      const got = await readToArrange(apiBase(), on, async () => previewedBody(slug, holdsOf(shell, undefined, await weekHeld(shell))));
      if ('fix' in got) {
        toasts.push(got.fix, { intent: 'warn' });
        return;
      }
      /* AND THE MODE OPENS IN THE SAME TURN, over the body just read: the arrangement's props read it as they are asked,
         and the let-go below never sees a body held with no mode open. */
      extra = [];
      toArrange = got;
      const begin = arranger?.entry();
      if (begin) begin();
      else toArrange = null;
    } finally {
      opening = false;
    }
  }

  /* LET GO ONCE THE MODE IS SHUT AND NOTHING IS IN FORCE: after Cancel, and after Done once the page is read again, so
     the arranged order is drawn until the page as written replaces it. */
  $effect(() => {
    if (toArrange && !arrangement.editing && arrangement.slots === null) {
      toArrange = null;
      extra = [];
    }
  });

  /**
   * THE BLOCKS THE PAGE DECLARES, without what the reader added under them (the note about rates out of date,
   * `page-live.ts` `footed`). Arrange and Pin this were handed every block drawn, so Done counted one more than the page
   * stores and the record refused it as a page somebody had changed. The note is always last, so each block keeps its place.
   */
  const declaredOnly = (blocks: readonly LiveBlock[]): LiveBlock[] => blocks.filter((b) => !b.synthetic);
  /* EACH DECLARED BLOCK'S KEY AND HEADING, so the menu's Hidden names a block by its heading (`ChangePage` `heads`). */
  function blockHeads() {
    const blocks = arranged(declaredOnly(live?.page.blocks ?? []));
    const keyed = blockKeys(blocks);
    return blocks.map((b, i) => ({ key: keyed[i]!, heading: typeof (b as { heading?: unknown }).heading === 'string' ? (b as { heading: string }).heading : null }));
  }

  /**
   * The blocks the page is laid out from: the home's body while it is arranged, else what the record answered.
   *
   * AS THIS READER IS DRAWN THEM, wherever the page is read rather than previewed (`home-arrange.ts`): a house heading
   * in the voice that speaks, so a home kept from Today still says Settings › Words' lines, and no line to add a row to a
   * list this reader may not add to. Each block stays at its place, so every write still finds it.
   */
  const laidFrom = $derived.by<LiveBlock[]>(() => {
    const blocks = declaredOnly(toArrange ? toArrange.blocks : (live?.page.blocks ?? []));
    if (mode === 'preview') return blocks;
    /* A SCREEN WHOSE SHELL NAMES NO READER keeps every line, as it drew them before, and the record answers a press. */
    const drawn = heldTo(inVoice(blocks, said), (list) => !shell?.me || may(shell, 'append', list));
    /* A BLOCK THE PROJECT'S SHAPE SAYS ALREADY IS LEFT OUT, by the source it declares (`repeatOf`), once the shape has it. */
    /* ON A PROJECT'S PAGE, WHAT THE HERO AND ITS TILES SAY IS NOT SAID AGAIN, and More about is folded (`project-page.ts`).
       Not while the page is arranged, which moves the blocks as they are declared. */
    const shaped = projectPage && !arrangement.editing && arrangement.slots === null && !toArrange ? onProject(drawn, about?.register ?? '') : drawn;
    if (about && !shapeKnown) return withoutRepeats(shaped, ['runs-on'], counted?.length ?? null, null);
    return about && shapeDrew.length > 0 ? withoutRepeats(shaped, shapeDrew, counted?.length ?? null, shapeRow) : shaped;
  });

  /** Declared, then added. One list, so ordering and spans do not care which is which. This is what Arrange moves. */
  const own = $derived<LiveBlock[]>(live ? [...laidFrom, ...extra.map((b) => added(b, laidFrom))] : []);

  /** What the reader added under the page it read. A home being arranged is its body read again, which has none. */
  const feet = $derived<LiveBlock[]>(toArrange ? [] : (live?.page.blocks ?? []).filter((b) => b.synthetic));

  /**
   * Every block drawn: the page's own, then the reader's note. NOT WHILE AN ARRANGEMENT IS IN FORCE, where a block added
   * in the mode takes the next place after the declared ones and the note is nothing a person can move or save.
   */
  /* THE MODEL'S LINE ON A PROJECT'S LEAD (the thinking scope of 24 October, C4), which the hero says in place of its rules'
     line: the declared lead is not drawn under the hero (`project-page.ts`), so the hero is where a kept line is read. */
  const modelLine = $derived.by(() => {
    const lead = (live?.page.blocks ?? []).find((b) => b.kind === 'note' && b.lead === true && b.drawn !== false);
    return lead?.modelLine === true && typeof lead.body === 'string' && lead.body.trim() !== '' ? lead.body : null;
  });
  const all = $derived<LiveBlock[]>(arrangement.editing || arrangement.slots !== null ? own : [...own, ...feet]);

  /* ── the line a page opens on ──────────────────────────────────────────────
     A PAGE WHOSE MAIN COLUMN OPENS ON A LONE LINE TO TYPE INTO KEEPS IT IN ITS HEADER, as Today does (`layout.ts`
     `headCaptureAt`, `home/HeadCapture.svelte`): beside the name from 900px, and under the page's sentence on a phone,
     where the name's row has no room for it. Work spent a whole tile on "What needs doing?". By the declared order, so
     the header does not change when the look moves a tile. Not while arranging or reading the source, where the line is
     a block like any other, and only a line this reader's list can take. */
  const wide = new MediaQuery('(width >= 900px)', true);
  /* A PHONE'S HEAD HOLDS TWO CONTROLS BESIDE THE NAME, Share and the "⋯" menu, so Show the data is the menu's first row
     there, as Edit details is on a project: a button of its own pushed the row past a 390px screen. */
  const roomy = new MediaQuery('(width >= 640px)', true);
  const headLine = $derived.by((): { at: number; block: LiveBlock } | null => {
    if (!hosting || !live) return null;
    const layout = layoutOf(live.page.page);
    const main = judgedWith(all, counted, (bs) => emptyHidden(bs, true))
      .map((block, at) => ({ block, at }))
      .filter((x) => areaOf(x.block, layout) === 'main');
    const hit = main[headCaptureAt(main.map((x) => x.block))];
    return hit && writes.capturable(hit.block) ? hit : null;
  });

  /**
   * ⇧E toggles the declaration, on a page at its own address. Shift, not a bare `e`, because bare `e` means
   * edit-in-place inside a grid and a key's meaning must be a function of the object in focus rather than of the page
   * you happen to be on. The block keys are the body's (`PageBody.svelte`).
   */
  function onkeydown(e: KeyboardEvent) {
    if (mode !== 'page') return;
    if (typing()) return;
    if (e.metaKey || e.ctrlKey) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`. */
    if (covered()) return;
    if (e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      /* THE FILTERS IN THE ADDRESS STAY: the source of a narrowed page is the same page, narrowed. */
      const q = new URLSearchParams(route.url.searchParams);
      q.set('src', showSource ? '0' : '1');
      void goto(`?${q}`, { replaceState: true, noScroll: true });
    }
  }

  /* ── the look ──────────────────────────────────────────────────────────────
     HOW THE ENGINE ARRANGED THE PAGE (`look.ts`), and the page it is the look of: the page the record answered, which on
     a home is the page Home read (`home`) and not the screen's own address. */
  const look = $derived(live?.page.page.look ?? null);
  const answered = $derived(lookPage(live?.page.page.page ?? slug, look));

  /**
   * The page's blocks by key, in the order they are drawn now: what Pin this keeps. A block the record left out for
   * holding nothing is still placed (`arranged`), so a list empty today keeps its place for the day it holds something.
   */
  function drawnKeys(): string[] {
    const blocks = arranged(declaredOnly(live?.page.blocks ?? []));
    const keyed = blockKeys(blocks);
    return lookOrder(
      blocks.map((b, i) => placedOf(b, keyed[i]!)),
      look,
    )
      .filter((i) => blocks[i]?.drawn)
      .map((i) => keyed[i]!);
  }

  /**
   * WHAT SLASH ARRANGES WHILE THE PERSON IS LOOKING IS OFFERED BACK FOR SIX SECONDS, and kept once they pass (`look.ts`
   * `offerUndo`): when the page is read again under a new arrangement of Slash's, once an
   * arrangement in this tab, to the owner, who alone may write a look. The look a page opens on was arranged while
   * nobody was there, and is not offered: the menu says who arranged it, and Pin answers it. Undo puts back the look
   * Slash's replaced and reads the page again; keeping says who kept it, which the look's history reads.
   */
  let lookWas: { page: string; look: typeof look } | null = null;
  $effect(() => {
    /* ONLY A PAGE THE RECORD ANSWERED: the blank while a new page is read is no look, and no arrangement before one. */
    if (!live) return;
    const l = look;
    const on = answered;
    /* BY THE PAGE READ, so moving between two pages drawn from one template is two pages opened, not one rearranged. */
    const read = live.page.page.page;
    const before = lookWas?.page === read ? lookWas.look : undefined;
    lookWas = { page: read, look: l };
    if (mode === 'preview' || !arrivedNow(on, before, l) || shell?.me?.owner !== true) return;
    untrack(() => {
      const k = offerKey(on, l!);
      if (offered.has(k)) return;
      offered.add(k);
      const title = live?.page.page.title ?? '';
      const who = shell.names?.[shell.me.person] ?? words.owner;
      offerUndo({
        push: (undo, life) => toasts.push(words.arranged(title), { undo, life }),
        alive: (id) => toasts.items.some((t) => t.id === id),
        undo: () =>
          void undoLook(apiBase(), on).then(async (back) => {
            if (!back.ok) toasts.push(back.fix, { intent: 'warn' });
            await reread();
          }),
        /* KEPT QUIETLY: keeping changes nothing on the page, and a keep that did not land is offered no second time. */
        keep: () => {
          keptHere.set(k, who);
          void keepLook(apiBase(), on);
        },
      });
    });
  });

  /* ── a forecast walked further ─────────────────────────────────────────────
     A LENGTH PICKED PAST HOW FAR A WALK REACHES IS ASKED OF THE RECORD (`page-live.ts` `askWalk`), and the page read
     again walking it, with the chart as it is until the longer walk lands. Asked once: a second press on the same length
     reads nothing again. */
  function onwalk(length: Walked) {
    /* THE PAGE AS IT IS READ, which the reader asks for by this name: a page drawn from a template is read at its own. */
    const on = live?.page.page.page ?? slug;
    if (walkAsked(on) === length) return;
    askWalk(on, length);
    void reread();
  }

  /* A PAGE LEFT LETS GO OF WHAT WAS ASKED ON THE ONE BEFORE, so the next visit opens on what that page opens on. */
  $effect.pre(() => {
    const on = mode === 'preview' ? null : (live?.page.page.page ?? null);
    if (on) untrack(() => forgetWalks(on));
  });

  /* ── a preview beside the page as it is ─────────────────────────────────────
     Both are drawn from 900px up, side by side; below it one at a time, chosen with the switch, and the change first,
     because the change is what is being decided. */
  let showing = $state<'was' | 'after'>('after');

  /* EVERY ID A PREVIEW WRITES CARRIES ITS PAGE, because a change can touch several pages and a screen that previews
     them draws one reader for each: a bare `preview-` would give the second page the first one's ids. */
  const pre = $derived(`preview-${slug}-`);
</script>

<svelte:head>
  {#if mode === 'page'}<title>{titleOf(live?.page.page.title ?? railed?.title)}</title>{/if}
</svelte:head>

<svelte:window {onkeydown} />

{#if got === null}
  {#if railed}
    <!-- THE HEAD FROM THE RAIL'S OWN ENTRY, AND BARS ONLY FOR THE BLOCKS, until the record answers. -->
    <!-- A PAGE ONE ROW MADE (a project's) WAITS IN THE HEAD IT WILL HAVE: the way back and no name row, its hero holding
         the name, and no sentence held, since it says none. A held line and a name row that went when the page landed
         moved Kiln's whole board up (VERIFY H4). -->
    <div class="hosted">
      <PageHead icon={railed.icon} hue={railed.hue} title={railed.title} headless={railed.row === true} back={railed.row ? railedBack : undefined} sentence={railed.row ? '' : undefined} />
      <div class="waiting-body"><Waiting /></div>
    </div>
  {:else}
    <!-- Bars until the record answers. -->
    <Waiting head={mode === 'page'} />
  {/if}
{:else if got.from === 'refused'}
  <!-- A REFUSAL IN A PERSON'S WORDS (U-A14): what happened and one Try again; the record's own sentence waits behind
       Read details. Offline says so, since the record's sentence about a read that never left is no help. -->
  {@const said = typeof navigator !== 'undefined' && navigator.onLine === false ? copy.errorPage.offline : copy.errorPage.broken}
  <div class="said">
    <Empty kind="error" heading title={said.title} body={said.body} detail={got.fix}>
      {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{said.action}</Button>{/snippet}
    </Empty>
  </div>
{:else if !live}
  {@const pages = (got.from === 'missing' ? got.held : []).map((h) => ({ title: h.title ?? h.address, href: `/p/${h.address}`, address: h.address }))}
  <div class="said">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has the sentence for it.
         Nothing failed, so there is no request id to quote (`50 §13 D11`), and no filter ran, so "nothing matched" is
         about something that did not happen. It names the thing, says it is not here, and lists what is: `10 §7`'s
         fourth rule, the refusal is the teacher. WHAT IS HERE IS THE FIVE NEAREST PAGES, AS LINKS (`record/nearest.ts`):
         the whole index in one sentence was thirty-eight addresses, none of them a thing to press. -->
    <Empty kind="error" heading title={copy.noPageCalled(slug)} body={pages.length === 0 ? copy.theseExist('Pages', []) : undefined}>
      {#snippet actions()}{#await Promise.all([import('$lib/ui/NearLinks.svelte'), import('$lib/record/nearest.ts')]) then [{ default: NearLinks }, { nearest }]}<NearLinks places={nearest(slug, pages)} said={copy.nearPages} />{/await}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if mode === 'page'}
  <!-- THE PAGE GIVES UP WHAT THE DOCKED PANEL TAKES, past the gutter it already pads by (`ui/Panel.svelte`'s `--dock-w`,
       0px while no panel is docked), so a row open beside the page never sits over its head or its tiles. -->
  <div class="hosted">
  <!-- `define="page"`: the rail says "1 suggested page" on every screen and this is the first place somebody is looking
       at one. Not on a page that has its own headline sentence, which says what this page is better than the noun. -->
  <PageHead
    icon={iconFor(live.page.page.icon, 'doc')}
    hue={hueOf(live.page.page.identity)}
    kicker={headKicker}
    back={backInKicker ? declared?.back?.href : projectBack}
    count={declared?.count?.value}
    title={live.page.page.title}
    headless={projectPage && !arranging && !showSource}
    sentence={projectPage ? '' : (blank ?? undefined)}
    define={headlined ? undefined : 'page'}
    below={headBelow && !tiled ? declaredBelow : undefined}
    {tiled}
  >
    {#snippet actions()}
      {#if !tiled}{@render pageButtons()}{/if}
      <Arrange bind:this={arranger} {arrangement} {slug} page={live.page.page} declared={declaredOnly(live.page.blocks)} all={own} bind:extra {showSource} {reread} />
    {/snippet}
  </PageHead>

  <!-- THE PAGE'S OWN BUTTONS, drawn once: at the end of the name's row, or on the lead tile's first row. -->
  {#snippet pageButtons()}
      {#if headLine && wide.current && !tiled}{@render lineInHead()}{/if}
      {#if declared?.action && !arranging && !showSource}
        <!-- AN ADD WEARS THE PLUS, so on a phone it is the 36px square the head draws for a glyph (`PageHead.svelte`). -->
        <Button weight="primary" onclick={pressHead}>{#if /^(add|new)\b/iu.test(declared.action.label)}<Icon name="plus" size="s" />{/if}{declared.action.label}</Button>
      {/if}
      {#if finish && finish.key === spoken && !arranging && !showSource}
        <Button weight="primary" onclick={() => void pressFinish()}>{finish.said}</Button>
      {/if}
      {#if dataHref && !projectPage && !arranging && !showSource && roomy.current}
        <Button href={at(dataHref)}>{words.showData}</Button>
      {/if}
      {#if !arranging}
        <!-- SHARE, AND ONE "⋯" FOR THE REST: How this is built, Change this page and Edit layout were
             four controls in a row over every page, and a reader uses Share far more often than the other three. The
             menu is `ChangePage.svelte`; Edit layout's way in is `Arrange.svelte`'s, handed over as `entry()`. -->
        <!-- EDIT DETAILS IS THE ⋯ MENU'S FIRST ROW ON A PROJECT (proj F7, VERIFY H13): a button of its own made the phone
             head three controls wide, beside Share and the menu. -->
        <!-- SHARE WITH PEOPLE IS SHARE'S FIRST CHOICE, for an owner or an Admin (sharing plan §3.1), so the head stays two. -->
        <ShareMenu {slug} people={sharing && sharable ? () => (sharingOpen = true) : undefined} peopleLabel={copy.shareWithPeopleOpen} />
        {#if sharing && sharable}<ShareLazy bind:open={sharingOpen} subject={sharing} />{/if}
        <ChangePage
          {slug}
          title={live.page.page.title}
          {showSource}
          {reread}
          onarrange={arranger?.entry() ?? null}
          {look}
          keys={drawnKeys}
          heads={blockHeads}
          extra={projectPage && dataHref
            ? [{ label: 'Edit details', icon: 'edit', href: dataHref }]
            : dataHref && !showSource && !roomy.current
              ? [{ label: words.showData, icon: 'rows', href: dataHref }]
              : []}
        />
      {/if}
  {/snippet}

  <!--
    THE LEAD TILE'S FIRST ROW (`tiled`): the page's glyph and name at 17/600, its count, the parent it sits under where
    that is not the page itself, and its buttons at the end; the declared head's state and search under it. The name is
    the page's `h1`, focusable by script, as `PageHead`'s is, so a move lands on it.
  -->
  {#snippet leadRow()}
    {@const crumb = headKicker && headKicker.trim().toLowerCase() !== live.page.page.title.trim().toLowerCase() ? headKicker : undefined}
    {@const backTo = backInKicker ? declared?.back?.href : projectBack}
    <div class="lead-head">
      <span class="lead-glyph" aria-hidden="true"><Icon name={iconFor(live.page.page.icon, 'doc')} size="m" /></span>
      <h1 class="lead-name" tabindex="-1" dir="auto">{live.page.page.title}</h1>
      {#if declared?.count?.value}<span class="lead-count num">{declared.count.value.toLocaleString('en')}</span>{/if}
      {#if crumb}
        {#if backTo}<a class="lead-crumb" href={at(backTo)}>{crumb}</a>{:else}<span class="lead-crumb">{crumb}</span>{/if}
      {/if}
      <span class="lead-actions">{@render pageButtons()}</span>
    </div>
    {#if headBelow}{@render declaredBelow()}{/if}
  {/snippet}

  <!-- THE LINE THE PAGE OPENS ON, drawn once: in the header's row, or handed to the body to sit under its sentence. -->
  {#snippet lineInHead()}
    {#if headLine}<HeadCapture block={headLine.block} oncapture={(register, text, inherited) => void writes.captureLine(register, text, inherited)} />{/if}
  {/snippet}

  <!-- THE DECLARED HEAD'S LINE UNDER THE NAME: the state with its mark and its words (never colour alone), a way back
       where the kicker is the page's own, and the search the address holds. -->
  {#snippet declaredBelow()}
    <div class="declared-head">
      {#if declared?.state}
        {@const tone = declared.state.tone}
        <p class="head-state" data-tone={tone}>
          <span class="head-mark"><Icon name={tone === 'good' ? 'check' : 'alert'} title={HEAD_WORDS.tone[tone]} /></span>
          <span>{declared.state.words}</span>
        </p>
      {/if}
      {#if declared?.back && !backInKicker}
        <a class="head-back" href={at(declared.back.href)}>{declared.back.label}</a>
      {/if}
      {#if declared?.search}
        {@const param = declared.search.param}
        <input
          class="field-input head-search"
          type="search"
          aria-label={HEAD_WORDS.search}
          placeholder={HEAD_WORDS.search}
          autocomplete="off"
          spellcheck="false"
          value={searched}
          oninput={(e) => onsearch(param, e.currentTarget.value)}
        />
        <!-- HOW MANY THE WORD FOUND across the page's lists, beside the field, said when it changes. -->
        {#if declared.searched}
          <span class="head-found" aria-live="polite">{HEAD_WORDS.found(declared.searched.found)}</span>
        {/if}
      {/if}
    </div>
  {/snippet}

  <!-- THE RENDERER'S STRIP, one group a field, "All" first, the rest behind one select (`braindog-render` `Filters`).
       Under the headline on a page that opens on one, and between the head and the first tile otherwise. -->
  {#snippet narrow()}<Filters {filters} {chosen} {onfilter} />{/snippet}
  {#if strip && !led}
    <div class="page-filters">{@render narrow()}</div>
  {/if}

  {#if showSource}
    <!-- The declaration as text. A page is a row, so this is the row (19 §2). -->
    {#await import('./SourceView.svelte') then { default: SourceView }}<SourceView {slug} title={live.page.page.title} />{/await}
  {:else}
    <!-- A PAGE ABOUT A PROJECT'S ROW OPENS ON THE PROJECT'S ONE SHAPE, as the row's own page does; its blocks follow. -->
    <!-- THE SHAPE ARRIVES WITH THE PAGE THAT NEEDS IT, by `import()`: Today draws a page and never a project's shape, so its
         first load does not carry one. The page waits on the shape's reads either way (`shapeWaits`). -->
    {#snippet shapeAt()}{#await import('./ProjectShape.svelte')}{@render waiting?.()}{:then { default: ProjectShape }}<ProjectShape register={about?.register ?? ''} seq={about?.seq ?? 0} {modelLine} onshape={(b, r, known) => ((shapeDrew = b), (shapeRow = r), (shapeKnown = known))} />{/await}{/snippet}
    <div class="body-wrap" data-project={projectPage ? '' : undefined} style={projectStyle}>
    <PageBody
      mode="page"
      opens={about ? shapeAt : null}
      page={bodyPage ?? live.page.page}
      blocks={shapeWaits ? [] : all}
      held={counted}
      now={live.now}
      {writes}
      {arrangement}
      headed={led}
      leadHead={tiled ? leadRow : null}
      captured={headLine?.at ?? -1}
      under={headLine && (tiled || !wide.current) && !shapeWaits ? lineInHead : null}
      strip={strip && led && !shapeWaits ? narrow : null}
      host={hosting && !shapeWaits ? host : null}
      pick={hosting ? picked : null}
      {onwalk}
    />
    </div>
    <!-- THE OFFER COMES AFTER EVERY BLOCK OF THE PAGE, never before the first. -->
    {#if offer && !shapeWaits}<div class="page-offer" data-after="blocks">{@render offer()}</div>{/if}
    {#if hosting}<BatchBar {picked} />{/if}
  {/if}
  </div>
  {#if hosting}
    <RowPanel {host} />
    <ChangesPanel {host} />
    <RowVerbMenu {host} {reread} />
  {/if}
{:else if mode === 'home'}
  <!-- HOME'S BODY: the use case's page with its layout, spans and boxes, under Home's own head. Writes stay on, so a
       task is ticked on Home as it is on its page. -->
  <div class="home-page" data-arranging={arranging ? '' : undefined}>
    {#if kept}
      <!-- THE PAGE'S ⋯, AS EVERY DECLARED PAGE HAS, waiting at the body's top end and drawn only while the pointer or
           focus is on the page (secondary controls appear on hover or focus); while arranging, the
           mode's own Add a block, Cancel and Done in its place, in view. -->
      <div class="home-tools">
        {#if !arranging}
          <ChangePage
            slug={kept.id}
            title={live.page.page.title}
            showSource={false}
            {reread}
            source={kept.installed ? `/p/${kept.id}?src=1` : null}
            change={kept.installed}
            built={kept.installed ? null : builtBody}
            {look}
            keys={drawnKeys}
            heads={blockHeads}
            onarrange={arranger?.entry() ? () => void arrangeHome() : null}
          />
        {/if}
        <Arrange
          bind:this={arranger}
          {arrangement}
          slug={kept.id}
          page={toArrange?.page ?? live.page.page}
          declared={laidFrom}
          all={own}
          bind:extra
          showSource={false}
          {reread}
          install={toArrange?.install ?? null}
          reopen={() => void arrangeHome()}
        />
      </div>
    {/if}
    <PageBody
      mode="home"
      {whole}
      page={toArrange?.page ?? live.page.page}
      blocks={all}
      now={toArrange?.now ?? live.now}
      {writes}
      ids="home-"
      pick={select && !arranging ? picked : null}
      arrangement={kept ? arrangement : null}
      {onwalk}
      opens={opens ?? null}
      between={between ?? null}
    />
  </div>
  {#if select && !arranging}<BatchBar {picked} />{/if}
{:else}
  <!-- A PREVIEW, INERT: the page as it will be drawn, with nothing on it that writes. Its title is a heading under the
       screen's own, and each block's name one step under that. -->
  <section class="preview" aria-labelledby="{pre}title">
    <h2 class="preview-title" id="{pre}title">{live.page.page.title}</h2>
    {#if was}
      <div class="compare" data-showing={showing}>
        <Segmented class="compare-switch" role="group" aria-label={words.compare}>
          <button
            type="button"
            class="segment"
            data-on={showing === 'was' ? '' : undefined}
            aria-pressed={showing === 'was'}
            onclick={() => (showing = 'was')}>{words.now}</button
          >
          <button
            type="button"
            class="segment"
            data-on={showing === 'after' ? '' : undefined}
            aria-pressed={showing === 'after'}
            onclick={() => (showing = 'after')}>{words.after}</button
          >
        </Segmented>
        <div class="compare-side" data-side="was" role="group" aria-label={words.now}>
          <p class="compare-name" aria-hidden="true">{words.now}</p>
          <PageBody mode="preview" page={live.page.page} blocks={was} now={live.now} writes={null} ids="{pre}was-" level={3} />
        </div>
        <div class="compare-side" data-side="after" role="group" aria-label={words.after}>
          <p class="compare-name" aria-hidden="true">{words.after}</p>
          <PageBody mode="preview" page={live.page.page} blocks={all} now={live.now} writes={null} ids="{pre}after-" level={3} />
        </div>
      </div>
    {:else}
      <PageBody mode="preview" page={live.page.page} blocks={all} now={live.now} writes={null} ids={pre} level={3} />
    {/if}
  </section>
{/if}

<style>
  /* THE PAGE'S BODY, which on a project's page carries the project's colour down to every chart (`projectStyle`). */
  .body-wrap {
    display: contents;
  }

  /* MORE ABOUT, FOLDED (proj F1): one tile, its heading, a 13px line naming what is inside, and Show at the right. */
  .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold)) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
  }

  .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold) > .sec-title) {
    grid-row: 1;
    grid-column: 1;
  }

  .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold) > .sec-fold) {
    grid-row: 1 / span 2;
    grid-column: 2;
  }

  .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold)::after) {
    content: var(--more-said, '');
    grid-row: 2;
    grid-column: 1;
    overflow: hidden;
    margin-block-start: 2px;
    padding-inline-start: calc(var(--well, 28px) + var(--sp-3));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width < 640px) {
    .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold)::after) {
      padding-inline-start: 0;
      white-space: normal;
    }
  }
  /* THE OFFER UNDER THE PAGE'S BLOCKS, one tile gap below the last, in the page's own gutter. */
  .page-offer {
    padding-inline: var(--gutter);
    margin-block: var(--tile-gap);
  }

  .hosted {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w, 0px) - var(--gutter)));
    transition: padding-inline-end var(--d-panel) var(--ease-sheet);
  }

  /* The blocks' bars stand in the board's gutter, where the first tile will be. */
  .waiting-body {
    padding: var(--sp-4) var(--gutter) var(--sp-8);
  }

  /* ── a home's page menu ───────────────────────────────────────────────────
     AT THE BODY'S TOP END, raised into the space over it, where a page at its own address has its ⋯ in the head. Not
     drawn at rest: it comes in while the pointer is anywhere on the page or focus is in it, and stays while its menu is
     open. ONE STEP UNDER THE CHROME (`--z-sheet`, the sticky head's and the tab bar's), over the content: scrolled up
     under the head it goes under the head's glass with the blocks, and never sits over the head's own buttons (Ask a question in Needs you) where a press meant for them would land on it.

     A FINGER CANNOT HOVER, so on a touch screen the ⋯ is not waiting to be found: it is a quiet row of its own at the
     body's top end, in the flow and always there, which a tap reaches on a phone and on a tablet alike (the arrange
     mode itself is offered from 900px, `Arrange.svelte`). It was drawn at nought opacity and could not be pressed, so
     nobody on a tablet could arrange Today or Decide. */
  .home-page {
    position: relative;
    min-inline-size: 0;
  }

  .home-tools {
    position: absolute;
    inset-block-end: 100%;
    inset-inline-end: 0;
    z-index: calc(var(--z-sheet) - 1);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block-end: var(--sp-1);
    opacity: 0;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .home-page:hover > .home-tools,
  .home-tools:focus-within,
  .home-tools:has(:global([aria-expanded='true'])) {
    opacity: 1;
  }

  @media (hover: none) {
    .home-page > .home-tools {
      position: static;
      justify-content: flex-end;
      margin-block-end: var(--sp-2);
      padding: 0;
      opacity: 1;
    }

    /* A READER THE MENU OFFERS NOTHING keeps no empty row over the page. */
    .home-page > .home-tools:not(:has(button, a)) {
      display: none;
    }
  }

  /* ON A PHONE THE ⋯ IS ON THE SENTENCE'S ROW (look fault N). A row of its own at 390 was about 60px of nothing over
     the first tile, with one dot-mark at its end. Where the body stands right under its screen's sentence (`PageHead`'s
     `.page-said`, then Home's page and body with nothing before them), the ⋯ is raised to the end of that sentence, as
     it is raised over the body at a pointer, and the sentence keeps it a tap's room so no word runs under it.

     ONLY THERE. Under a line to type into, a first-run card or a screen that wraps its head, what is over the body is
     not a sentence with room at its end, and the ⋯ keeps the row it had. (Decide draws its head bare since batch 78,
     so the rule reaches it when its questions stand first under the sentence.) From 601px a touch screen keeps the
     row too: the head has the width for it. */
  @media (hover: none) and (width <= 600px) {
    :global(.page-said + .page > .body:first-child) > .home-page:not([data-arranging]) > .home-tools {
      position: absolute;
      margin: 0;
      inset-block-end: 100%;
    }

    :global(.page-said:has(+ .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools :is(button, a))) {
      padding-inline-end: calc(var(--gutter) + var(--tap) + var(--sp-2));
    }
  }

  /* WHILE ARRANGING THE MODE'S CONTROLS ARE A ROW OF THEIR OWN over the blocks, in view, as they sit in a page's head. */
  .home-page[data-arranging] > .home-tools {
    position: static;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-block-end: var(--sp-3);
    padding: 0;
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .home-tools {
      transition: none;
    }
  }

  /* THE STRIP SITS IN THE PAGE'S OWN GUTTER, over the first tile, with the gap a row of tiles keeps. */
  .page-filters {
    padding: var(--sp-3) var(--gutter) 0;
  }

  /* THE LEAD TILE'S FIRST ROW: the glyph and the name at 17/600 on one line, the count quiet beside it, the parent in
     meta, and the page's buttons at the end, quiet on the tile's second fill. */
  .lead-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
  }

  .lead-glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    color: var(--ink-2);
  }

  .lead-name {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: calc(24 / 17);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lead-name:focus:not(:focus-visible) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  .lead-count {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-head);
    font-weight: var(--fw-medium);
  }

  .lead-crumb {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lead-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .lead-actions :global(:is(.btn[data-weight='quiet'], .share-trigger)) {
    background: var(--tile-2);
  }

  @media (hover: hover) and (pointer: fine) {
    a.lead-crumb:hover {
      color: var(--red);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .lead-actions :global(:is(.btn[data-weight='quiet']:hover:not(:disabled), .menu-trigger:hover > .share-trigger)) {
      background: var(--hover);
    }
  }

  /* ON A PHONE A BUTTON WITH A GLYPH IS THE GLYPH ALONE in a 44px square, as the head draws it; its words stay its name. */
  @media (width < 900px) {
    .lead-actions {
      gap: var(--sp-1);
    }

    .lead-actions :global(.btn:has(.icon)) {
      inline-size: var(--tap);
      min-inline-size: var(--tap);
      min-block-size: var(--tap);
      padding: 0;
      gap: 0;
      font-size: 0em;
    }

    .lead-actions :global(:is(.btn[data-weight='quiet'], .share-trigger)) {
      background: none;
    }

    .lead-actions :global(.change-more) {
      inline-size: var(--tap);
      min-block-size: var(--tap);
      color: var(--ink);
    }
  }

  /* A DECLARED HEAD'S LINE (PGS-A14): one row under the sentence that wraps on a phone. Flat, on the board: no tile,
     no edge. A state is its mark and its words; late and needs-you take the deeper red, and the mark says it too. */
  .declared-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-4);
    font-size: var(--fs-body);
  }
  .head-state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
  }
  .head-state[data-tone='warn'] .head-mark {
    color: var(--warn);
  }
  .head-state[data-tone='bad'] {
    color: var(--red);
  }
  .head-mark {
    display: inline-flex;
  }
  .head-back {
    color: var(--red);
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .head-back:hover {
      text-decoration: underline;
    }
  }
  .head-search {
    flex: 1 1 14rem;
    max-inline-size: 24rem;
    min-inline-size: 0;
  }

  .head-found {
    color: var(--ink-2);
  }

  /* A PAGE THAT CANNOT BE DRAWN IS ONE SENTENCE, NOT A GRID, inside the page's own gutter, so it sits where the page
     would have, and at the measure a sentence is read at. */
  .said {
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: calc(var(--measure) + 2 * var(--gutter));
  }

  .preview {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .preview-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .compare {
    display: grid;
    gap: var(--sp-5) var(--sp-6);
    align-items: start;
    min-inline-size: 0;
  }

  /* The switch's track is `Segmented`'s own element, so its rules reach it by the name this screen gave it. */
  .compare :global(.compare-switch) {
    justify-self: start;
  }

  .compare-side {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .compare-name {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  @media (width < 900px) {
    .said {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* ONE AT A TIME ON A PHONE: the side the switch has not chosen is not drawn. */
    .compare[data-showing='was'] .compare-side[data-side='after'],
    .compare[data-showing='after'] .compare-side[data-side='was'] {
      display: none;
    }
  }

  /* SIDE BY SIDE FROM 900px, each half a twelve-column page of its own, and no switch, since both are in view. */
  @media (width >= 900px) {
    .compare {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .compare :global(.compare-switch) {
      display: none;
    }
  }
</style>
