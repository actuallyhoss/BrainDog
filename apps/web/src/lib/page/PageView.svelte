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
<script module lang="ts">
  /* A PAGE'S OWN PARTS (`page-only.ts`), asked once by the first page drawn and kept for every one after it. */
  type PageOnly = typeof import('./page-only.ts');
  let pageOnlyIs: Promise<PageOnly> | null = null;
  let pageOnlyHad: PageOnly | null = null;
  const pageOnlyOf = (): Promise<PageOnly> =>
    (pageOnlyIs ??= import('./page-only.ts').then(
      (m) => (pageOnlyHad = m),
      (e: unknown) => {
        pageOnlyIs = null;
        throw e;
      },
    ));
</script>

<script lang="ts">
  import { PAGE_MENU } from '$lib/ui/context-menu.ts';
  /* `at` IS THE BLOCK INDEX WHERE THE PAGE BODY LAYS BLOCKS OUT, so the address helper goes by another name here too. */
  import type { ComponentProps, Snippet } from 'svelte';
  import { apiBase } from '../at.ts';
  import { closedNow } from '../record/answers-closed.svelte.ts';
  import { pageWithout } from '../record/answers-out.ts';
  import { copyMark } from '../data/copy-mark.svelte.ts';
  import { titleOf } from '$lib/title.ts';
  /* THE KINDS ONLY A DECLARED PAGE DRAWS, with the screen that draws them rather than in the sheet every screen waits
     on (`blocks-kinds.css`). Before the charts, in the order the rules had when they were one sheet. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  /* MONEY'S OWN LOOK, over the same kinds, on the pages its add-on brings (`$lib/money/look.css`). */
  import '$lib/money/look.css';
  import { setContext, untrack } from 'svelte';
  import { SHAPE_KEY, type ShapeBox } from './shape-key.ts';
  import { partLanded } from './part-landed.ts';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Filters } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { hueOf, iconFor } from '$lib/record/api.ts';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { askWalk, blockOf, forgetWalks, walkAsked, type LiveBlock, type Opened, type Walked } from '$lib/record/page-live.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ProjectWaiting from './ProjectWaiting.svelte';
  import { knownRow } from './known-project.ts';
  import type { Subject } from '$lib/sharing/share-state.ts';
  import { canShare } from '$lib/sharing/may-share.ts';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Arrange, { added } from './Arrange.svelte';
  import ChangePage from './ChangePage.svelte';
  import { hostButtons } from './page-buttons.svelte.ts';
  import PageBody from './PageBody.svelte';
  import { isProject, withoutRepeats, type Block } from '$lib/record/project.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { rowScreen } from '$lib/record/row-href.ts';
  import { hueOf as projectHue, slotStyle } from '$lib/home/project-cards.ts';
  import { onProject, moreSaid, modelLineOf, withShape } from './project-page.ts';
  import { columned } from './project-parts.ts';
  import HeadCapture from '$lib/home/HeadCapture.svelte';
  import { areaOf, headCaptureAt, layoutOf } from './layout.ts';
  import { arranged, emptyHidden } from './home.ts';
  import { leadIndex } from './lead.ts';
  import { stampOf } from './read-mark.ts';
  import { markAll } from '$lib/record/mark-read.ts';
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
  import { blockKeys } from './recompose.ts';
  import { heldOrder } from './hold-order.ts';
  import { wroteAt } from '@braindog/client';
  import { hush } from '$lib/motion/index.ts';
  import { pageBoards } from './page-boards.svelte.ts';
  import { HEAD_WORDS, headOf, searchQuery } from './declared-head.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { at } from '../at.ts';
  import { barTitled, frame, narrow as onPhone } from '../shell/frame.svelte.ts';
  import { listName } from '../record/names.ts';
  import QuickHost from '$lib/money/QuickHost.svelte';
  import { pageOfLedger } from '$lib/money/ledger.ts';
  import { quick } from '$lib/money/quick.svelte.ts';
  import { words as quickWords } from '$lib/money/quick.ts';
  import SetupGate from '$lib/money/SetupGate.svelte';
  import { looks as moneyLooks } from '$lib/money/looks.svelte.ts';
  import { masonry } from '$lib/money/masonry.ts';
  import { headsSection, SETUP_KEY, type SetupFacts } from '$lib/money/setup.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { pinHref, pinWords, togglePin } from '$lib/shell/pin-project.ts';
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
    unfolded = false,
    offer,
    opens,
    between,
    placed,
    inside,
    waiting,
    plain = false,
    more = [],
  }: {
    /**
     * A home's own entries for its "⋯", drawn first in the page's menu (`ChangePage`'s `extra`), so a home with a menu of
     * its own (Needs you's Ask a question and Select) draws one "⋯", not its head's and the page's stacked on each other.
     */
    more?: ComponentProps<typeof ChangePage>['extra'];
    /**
     * A page that opens on the plain head every hand-written screen has (Decide, Automations): the name at 28 with its
     * icon and its sentence once under it, never the lead tile. The route's choice, for a page it knows by what it draws.
     */
    plain?: boolean;
    /**
     * What a project's page draws while its shape's code is on its way (`shape-hold.svelte.ts`), the project in its own shape (`ProjectWaiting`,
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
    /** A home whose lists are drawn whole, never folded under "N more" (`PageBody`'s `unfolded`). */
    unfolded?: boolean;
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
    /** A board's cells, by declared index (`PageBody`'s `placed`). Read only by a `home`. */
    placed?: ((i: number) => { key: string; area: string; size: string } | null) | undefined;
    /** What a home draws inside a block's tile (`PageBody`'s `inside`). */
    inside?: Snippet<[number]> | undefined;
  } = $props();

  /* A PAGE'S OWN PARTS (`page-only.ts`): Share in the head and the row's panels, asked as soon as this is a page and
     drawn the moment they land. Today's body and a preview never ask. */
  let only = $state.raw<PageOnly | null>(pageOnlyHad);
  $effect.pre(() => {
    if (mode === 'page' && only === null) void pageOnlyOf().then((m) => (only = m), () => undefined);
  });

  /* A PAGE IS THE RECORD'S BLOCKS AND NOTHING ELSE; a record that does not answer is its refusal, drawn below. */
  /* WHAT THE READER DID STAYS WHERE THEY DID IT (`hold-order.ts`): once this tab has written during a visit to a page,
     the page keeps the order its blocks were drawn in until the reader opens it again (another page or another filter).
     `drawn` is not state: it is what the last answer was drawn as, read when the next one arrives. */
  let drawn: { visit: string; keys: string[]; since: number } | null = null;
  const visit = $derived(`${slug}?${route.url.search}`);
  const live = $derived.by(() => {
    if (got?.from !== 'live') return null;
    /* AN ANSWER THIS BROWSER GAVE IS NOT DRAWN BACK ON ANY PAGE WITH A QUEUE (`answers-out.ts`). */
    const clean = pageWithout(got, closedNow(apiBase(), copyMark.on));
    const before = drawn;
    if (mode !== 'page' || before === null || before.visit !== visit || wroteAt() < before.since) return clean;
    const blocks = heldOrder(clean.page.blocks, blockKeys(clean.page.blocks), before.keys);
    return blocks === clean.page.blocks ? clean : { ...clean, page: { ...clean.page, blocks: [...blocks] } };
  });
  $effect.pre(() => {
    if (!live) return;
    const since = drawn?.visit === visit ? drawn.since : performance.now();
    drawn = { visit, keys: blockKeys(live.page.blocks), since };
  });

  /* ── the page's declared head ────────────────────────────────────
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
    const a = declared?.action;
    if (!a) return;
    /* AN ADD OVER NO ONE ROW TYPES ITS NAME (AG9): into the page's own line where it has one, as Work's "What needs
       doing?" is, and otherwise on its list's line, `/r/<list>?add=1`. Pressed bare it read "Nothing was added". */
    if (a.verb === 'row.create') {
      const line = document.querySelector<HTMLInputElement>('main .capture-input');
      if (line) return void line.focus();
      /* AND ON AN EMPTY PAGE, FROM WHAT THE PAGE REQUIRES (audit 31 Oct h, AH3): a fresh People draws no block, so the
         press found no list and the record refused it as naming no row. The action's own list, then a drawn block's,
         then the first list the page says it needs. */
      const args = a.args && !Array.isArray(a.args) ? (a.args as Readonly<Record<string, unknown>>) : null;
      const named = typeof args?.register === 'string' && args.register !== '' ? args.register : undefined;
      const required = (live?.page.page.requires ?? []).flatMap((r) => (typeof r === 'string' && r.startsWith('register.') ? [r.slice('register.'.length)] : []));
      const register =
        named ??
        all.find((b) => typeof b.register === 'string' && b.register !== '' && writes.capturable(b))?.register ??
        all.find((b) => typeof b.register === 'string' && REGISTERS[b.register])?.register ??
        required[0];
      if (register) return void goto(at(`/r/${register}?add=1`));
      /* A HEAD'S ADD NEVER ASKS FOR A ROW: with no list to add to, the press does nothing rather than refuse. */
      return;
    }
    void writes.act(a);
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
  const about = $derived(mode === 'page' ? (live?.page.page.param ?? null) : null);
  const spoken = $derived(about ? `${about.register}#${about.seq}` : null);
  /* A PAGE ABOUT A ROW SITS WHERE ITS LIST SITS, in the bar's crumb (`crumbOf`'s `up`): an account's or a bill's own page
     said its name alone there (Q38 of the 29 Oct audit). */
  $effect(() => {
    if (!about) return;
    const up = { label: listName(about.register), href: `/r/${about.register}` };
    frame.up = up;
    return () => {
      if (frame.up === up) frame.up = null;
    };
  });
  /* ── the project's shape ───────────────────────────────────────────────────
     A PAGE ABOUT A ROW READS THE ROW'S PROJECT ONCE (`shape-hold.svelte.ts`), and every part of the shape the page
     declares (`{ kind: project, part }`) is drawn from that one read in its own slot (`BlockSlot.svelte`,
     through `shape-key.ts`). The hold's code is fetched only for a page about a row, so Today carries none of it. WHAT
     IT DRAWS IS IN THE PAGE'S OWN ANSWER (`shape`, scope 2026-10-24 A20), so it asks the record nothing, and each answer
     of the page, read again when the record moves, is handed to it. A page that carries none has no parts. */
  const shapeBox = $state<ShapeBox>({ hold: null });
  /* A PART'S CODE THAT DID NOT ARRIVE does not hold the page in its bars: it draws without the shape, as before. */
  let partsFailed = $state(false);
  setContext(SHAPE_KEY, shapeBox);
  const shapeSaid = $derived(mode === 'page' ? ((live?.page.page as { shape?: unknown } | undefined)?.shape ?? null) : null);
  /* ONLY THE LAST ASK SPEAKS. Each run below waits on the same two `import()`s, and the browser does not finish them in
     the order they were asked. A cold open runs it over the shell's copy (`owner` false, as a copy is, `drawnFrom`) and
     again a few ms later once the live shell lands, and when the first run's answer came second it set `owner` back to
     false for good: no box to tell agents, and with it Numbers and Dates 13 taller at a desk. */
  let shapeAsked = 0;
  $effect(() => {
    const of = about;
    const said = shapeSaid;
    const isOwner = shell?.me?.owner === true;
    const line = modelLine;
    const asked = ++shapeAsked;
    untrack(() => {
      if (!of) {
        shapeBox.hold = null;
        return;
      }
      /* AND THE CODE ITS PARTS ARE DRAWN BY, BEFORE THE HOLD IS SET: the blocks drew as bare headings while
         `ProjectPart` was on its way, and the hero then landed over them and pushed the page 304px down (0.6 of a
         project page's layout shift). Until both are in, the page waits in its bars (`partWaits`). */
      void Promise.all([import('./shape-hold.svelte.ts'), import('./ProjectPart.svelte')]).then(([{ ShapeHold }, part]) => {
        /* AND KEPT WHERE A SLOT DRAWS IT AT ONCE (`part-landed.ts`), not a frame after the hold. */
        partLanded.part = part.default;
        if (asked !== shapeAsked) return;
        if (about?.register !== of.register || about.seq !== of.seq || said !== shapeSaid) return;
        const hold = shapeBox.hold ?? new ShapeHold();
        hold.owner = isOwner;
        hold.modelLine = line;
        hold.follow(of.register, of.seq, said);
        if (shapeBox.hold !== hold) shapeBox.hold = hold;
      }, () => (partsFailed = true));
    });
  });
  $effect(() => () => shapeBox.hold?.stop());
  /* AND ITS FIRST READ, ON A COLD OPEN: the hero drew from the page's answer a frame before the shape's read landed, so
     the numbers and the work drew a frame later and pushed the board's foot (and Changed for you) off the screen, a
     0.1 to 0.2 shift on every project page at a desk. The bars wait for the read once, for 2s at most; after that a
     page moved to another project draws as before. */
  let shapeOnce = $state(false);
  $effect(() => {
    if (shapeOnce || shapeBox.hold === null) return;
    if (shapeBox.hold.known) {
      shapeOnce = true;
      return;
    }
    const t = setTimeout(() => (shapeOnce = true), 2000);
    return () => clearTimeout(t);
  });
  /* What the project's shape draws on this page, once its reads are back. */
  const shapeDrew = $derived<readonly Block[]>(shapeBox.hold?.blocks ?? []);
  const shapeRow = $derived<Readonly<Record<string, unknown>> | null>(shapeBox.hold?.shape && shapeBox.hold.read ? shapeBox.hold.read.fields : null);
  /* Whether the shape's reads are back. Until they are, what it runs on is taken as the shape's, so a declared Runs on
     does not stand empty and then go when the shape lands (on a project page). */
  const shapeKnown = $derived(shapeBox.hold?.known ?? false);
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
        .then((m) => m.finishFor(apiBase(), of.register, of.seq, (route.data as { lists?: { id: string; kernel?: true }[] }).lists ?? []))
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
    return `${slotStyle(hue)};--chart-1:var(--ph-fill, var(--ph));--chart-2:var(--ph-2);--chart-3:var(--ph-3)${more ? `;--more-said:${JSON.stringify(more)}` : ''}`;
  });
  /* WHAT THE PAGE IS ABOUT, SHARED WITH PEOPLE: a project's page shares the project, everything
     that names it; a page about any other row shares that row. */
  /* WHO MAY SHARE, as `ShareLazy` asks it: an owner or an Admin, and never while the record is seen as somebody. */
  const sharable = $derived(seeingAs() === null && canShare((route.data as { me?: Parameters<typeof canShare>[0] }).me));
  let sharingOpen = $state(false);
  /** How many times the page's Share asked for the account's sheet. */
  let accountAsk = $state(0);
  const sharing = $derived.by((): Subject | null => {
    if (!about) return null;
    const projects = (REGISTERS[about.register] as { scopes?: unknown } | undefined)?.scopes !== undefined;
    return projects
      ? { kind: 'project', register: about.register, seq: about.seq, id: null, name: about.title }
      : { kind: 'row', list: about.register, seq: about.seq, id: null, name: about.title };
  });
  /* AN UNBOXED ACTIONS SECTION IS COUNTED TOO, for the one case that asks: it is left out when the shape took what it heads. */
  const asking = (bs: readonly LiveBlock[]) => bs.map((b) => (b.kind === 'section' && (b as { panel?: unknown }).panel === 'actions' ? ({ ...b, box: true } as LiveBlock) : b));
  /* AND ONLY OF SOMEBODY WHO READS THE WHOLE RECORD, as `actions` asks (collab pass 4): a contractor held to one project
     was refused it on its page, and the section that waits on it is shut for him as for a page with none. */
  const asks = $derived(spoken !== null && (!(route.data as Partial<Shell>).me || may(route.data as unknown as Shell, 'read')) && asksActions(asking(live?.page.blocks ?? [])));
  let tally = $state.raw<{ of: string; rows: ActionRow[] | null } | null>(null);
  $effect(() => {
    const of = asks ? spoken : null;
    if (of === null) return;
    /* BY THE ROW AND WHETHER ANYTHING ASKS, and by nothing else: the page read again is a new answer naming the same row. */
    untrack(() => {
      if (!live || !about) return;
      /* THE ROWS THAT DRAW THEM COME WITH THE READ (`BlockSlot.svelte` asks them by `import()`), so they draw with it. */
      void import('./panels/ActionRows.svelte');
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

  /* A FILTER'S ANSWER IS DRAWN AT ONCE, AS ANSWERS. It came through the same "the page recomposes" as the record moving: the
     blocks faded up over 320ms from nothing, the rows lit up as just arrived for 1.5s, and every count ran down to its
     new figure, when nothing had arrived and nothing had changed but what the reader asked to see. So the look before
     a new choice is no baseline for what lands (`forFilter`), the figures say their number outright (`hush`), and
     `answerTurn` tells the body this draw plays no plan. Only a choice in the strip: a Swap on `?view=` still plays. */
  const FILTER_HUSH_MS = 400;
  let refiltered = false;
  let filterSeen: string | null = null;
  let answerTurn = $state(0);
  $effect.pre(() => {
    const now = JSON.stringify(chosen);
    if (filterSeen !== null && filterSeen !== now) refiltered = true;
    filterSeen = now;
  });
  $effect.pre(() => {
    void got;
    untrack(() => {
      if (!refiltered) return;
      refiltered = false;
      answerTurn += 1;
      writes.forFilter();
      hush(FILTER_HUSH_MS);
    });
  });
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
  /**
   * NOTHING TO NARROW IS NO STRIP (empty states, 2 Nov): a new Ledger drew "This month 0, Last month 0, Before that 0" and
   * four more noughts over a page with no lines, and Reports the same over nothing at all. While no choice is made and every
   * choice the record offers counts nought (or there are none), the strip waits for the first entry. A choice already in
   * the address keeps it, so a filter that matched nothing can still be let go.
   */
  const nothingToNarrow = $derived(
    Object.keys(chosen).length === 0 && filters.every((f) => f.values.every((v) => v.count === 0)),
  );
  /** Whether the filter strip is drawn: on a hosted page the record says may be narrowed, with something to narrow. */
  const strip = $derived(hosting && filters.length > 0 && !nothingToNarrow);
  /**
   * WHAT FOLLOWS A PROJECT'S SHAPE WAITS FOR IT, on a page about a project's row, until the shape's reads are back. Which
   * blocks are drawn hangs on what the shape says (`withoutRepeats`), and the shape's hold fills the screen under the
   * head, so the blocks under it stood below the fold and then jumped up into view when a shorter shape landed (CLS 0.15
   * on a project's first open). They are drawn with the shape, in one frame. Not while the page
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
   * Not on a project's page, whose hero already holds its name and its line (`ProjectPart`).
   */
  /* NOR ON A PAGE WITH NO PLACE OF ITS OWN (2 Nov): one no section of the rail declares (What changed, Health, a pack's
     side page) opened on a 40px sentence in a tile of its own, a hero for a page reached from a link. It opens on the
     plain head instead, as Agents does: the sentence once at 17 with Share beside it, then its content. */
  const placeless = $derived(!!live && !live.page.page.nav);
  const tiled = $derived(led && !projectPage && !plain && !placeless);

  /**
   * AND WHERE THE SENTENCE STAYS THE HEADER'S PLAIN LINE (`plain`, the Agents page) while the bar says the name, the
   * head's row would hold nothing but the buttons, a row of their own over the sentence. They go to the sentence's end
   * instead (`PageBody`'s `leadEnd`), and share its row whenever both fit. A desk's only: a phone's head already puts
   * them on the row its bar leaves. (Restored 1 Nov evening: the lists merge had dropped it, and Agents drew Share and
   * "⋯" on a row of their own again.)
   */
  const besideLead = $derived(led && !tiled && !projectPage && frame.crumbed && !onPhone.current);

  /**
   * WHETHER THE PAGE SAYS WHAT IT IS ITSELF: a drawn `note lead` anywhere among its blocks. Such a page does not get the
   * generic "One screen that gathers what you keep an eye on" under its title as well (`define`), which on Work stood
   * between the name and the page's own sentence and said less than it. Read whether or not the page opens on it, so the
   * line does not come back while arranging or reading the source.
   */
  /* A PAGE ABOUT A ROW is the row's own: the template's default line is not his words, so it is left off there too. NOR
     ON A PAGE AN ADD-ON BROUGHT: Money on a record whose version of it has no line of its own opened on the filler, a
     line about pages in general, above its cash. Its own blocks say what it is. */
  const fromPack = $derived(!!live && typeof (live.page.page as { pack?: unknown }).pack === 'string');
  /* A MONEY PAGE wears Money's look: the section's pages, and the pages about one account, bill or plan its add-on brings. */
  const moneyPage = $derived(
    !!live &&
      (live.page.page.nav?.section?.toLowerCase() === 'money' || /^money(-|$)/u.test(live.page.page.page ?? '') || moneyLooks.moneyPack(String((live.page.page as { pack?: unknown }).pack ?? ''))),
  );
  /* A PAGE A PACK OR THE RECORD DECLARES SAYS NOTHING ABOUT PAGES IN GENERAL EITHER (3 Nov): with its count line gone,
     Agents opened on "One screen that gathers what you keep an eye on" over its own tiles. The line is for a page somebody
     is making, which has no place in the rail yet. */
  const declaredPage = $derived(!!live && !!(live.page.page.nav || (live.page.page as { requires?: unknown }).requires));
  const headlined = $derived(!!live && (about !== null || fromPack || judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs)).some((b) => b.drawn && b.kind === 'note' && b.lead === true)));

  /**
   * A PLACE WITH NOTHING IN IT YET SAYS SO IN ONE SENTENCE, by its own first step: Money
   * on a new record drew its name and an Add an account box over an empty board. Only where every block the page
   * declares draws nothing but a box to add the first entry, and never on a row's own page. AND THEN IT IS THE ONLY
   * LINE: the generic "One screen that gathers what you keep an eye on" stood under it on a new Orders.
   */
  const blank = $derived.by(() => {
    if (!live || about !== null || arranging || showSource) return null;
    const judged = judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs));
    if (judged.length === 0 || judged.some((b) => b.drawn && b.kind !== 'capture')) return null;
    const step = judged.find((b) => b.drawn && b.kind === 'capture' && typeof b.heading === 'string')?.heading;
    return copy.emptyPlace(typeof step === 'string' && step.trim() !== '' ? step.trim() : null, live.page.page.title ?? null);
  });

  /* ── arranging a home ──────────────────────────────────────────────────────
     TODAY AND DECIDE ARRANGE THEIR BODY, NOT WHAT THEIR SCREEN DREW (`home-arrange.ts`): the mode reads the body again,
     one block for each it declares, and a body nobody installed yet is installed by the first Done. */
  const shell = $derived(route.data as unknown as Shell);

  /* THE HEAD IS KNOWN BEFORE THE RECORD ANSWERS: the rail already holds this page's name and glyph, so while
     its blocks read the head is drawn from that entry and bars stand only where the blocks go. A page the rail does not
     hold (one past its budget, or opened by its address alone) waits with the head's bar as before. */
  /**
   * A HELD PAGE BY ITS NAME, NEVER ITS ADDRESS (AJ9): "The closest pages here: People, Filing rules, reconcile-invoice"
   * of a page titled Reconcile invoice, which the record listed with no title. The rail's name for it, else its address
   * read as words.
   */
  const heldTitle = (h: { address: string; title?: string }): string => {
    /* A TITLE THAT IS ITS ADDRESS is no title: a skill is listed under its name, `reconcile-invoice`. */
    const own = h.title?.trim();
    if (own && own !== h.address) return own;
    const named = (shell?.nav ?? []).find((n) => n.id === h.address)?.title?.trim();
    if (named && named !== h.address) return named;
    const words = h.address.replace(/[-_]+/gu, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  const railed = $derived(mode === 'page' && got === null ? ((shell?.nav ?? []).find((n) => n.id === slug) ?? null) : null);
  /* THE TAB SAYS WHAT THE SCREEN SAYS (audit f, AF19): a page the record does not have is "No page called nope", as a
     mistyped address is, and one that did not load keeps its rail name, or says it did not load. Both said "BrainDog". */
  const tabTitle = $derived(
    live
      ? live.page.page.title
      : got === null
        ? railed?.title
        : got.from === 'refused'
          ? ((shell?.nav ?? []).find((n) => n.id === slug)?.title ?? copy.errorPage.broken.title)
          : shell?.me && !may(shell, 'read')
            ? copy.notShared.title
            : copy.noPageCalled(slug),
  );

  /* ── the reader's mark ─────────────────────────────────────────────────────
     A PAGE THAT DRAWS WHAT IS NEW SINCE THE MARK STAMPS THE MARK WHEN THE READER LEAVES IT, through the one
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

  /* ── Money's own: Import a statement, and the first open ──────────────────
     THE LEDGER IS FOUND FROM THE DECLARATIONS (`quick.ledger`), never named. A page that draws the ledger or its accounts
     offers Import a statement in its ⋯ menu, and an account's own page opens it on that account. */
  const ledgerHere = $derived(mode === 'page' && live && quick.base === apiBase() ? quick.ledger : null);
  /** The ledger's book list (`ledger.ts` `book`), which Money's home and each book's page draw Which book over. */
  const bookHere = $derived(ledgerHere?.book ?? null);
  /** Whether this page draws the ledger or its accounts, so a phone's head offers Add a movement (`QuickHost`). */
  const quickHere = $derived(mode === 'page' && moneyPage && !!live && pageOfLedger(live.page.page.requires, quick.ledger));
  /** Whether this page is one row of the ledger's accounts, which an owner may share as a household view. */
  const accountPage = $derived(ledgerHere !== null && about?.register === ledgerHere.account.list);
  const importHref = $derived.by(() => {
    if (!ledgerHere || !live || !shell?.me || !may(shell, 'append', ledgerHere.list)) return null;
    const about = live.page.page.identity;
    if (about && about.register === ledgerHere.account.list && typeof about.seq === 'number') return `/add/statement?account=${about.seq}`;
    return pageOfLedger(live.page.page.requires, ledgerHere) ? '/add/statement' : null;
  });
  const importItem = $derived(importHref ? [{ label: 'Import a statement', icon: 'upload' as const, href: importHref }] : []);
  /* ── People's own: Import contacts (2 Nov, a walk: a contacts file had no door) ──────────────────
     A PAGE THAT DRAWS PEOPLE offers it in its ⋯ menu, to whoever may add to People; People's home with nobody in it but
     the owner says it under the head too, as the one thing to do there first. */
  const peopleHere = $derived(
    mode === 'page' && !!live && !!shell?.me && may(shell, 'append', 'people') && (live.page.page.requires ?? []).some((r) => r.replace(/^register\./u, '') === 'people'),
  );
  const contactsItem = $derived(peopleHere ? [{ label: 'Import contacts', icon: 'upload' as const, href: '/add/contacts' }] : []);
  const peopleEmpty = $derived.by(() => {
    if (!peopleHere || !live || live.page.page.identity || showSource || !headsSection(shell?.nav ?? [], slug)) return false;
    const count = (id: string): number => (shell?.index?.registers ?? []).find((r) => r.id === id)?.count ?? 0;
    return count('people') <= 1 && count('organisations') === 0;
  });
  /* MONEY'S HOME OPENS ON ITS SETUP while there is no home currency or no account (`setup.ts`): the first page of its
     section, drawing the ledger, for the owner of a record that answered. */
  const setupFacts = $derived.by((): SetupFacts | null => {
    if (!ledgerHere || !live || showSource) return null;
    const home = headsSection(shell?.nav ?? [], slug) && pageOfLedger(live.page.page.requires, ledgerHere);
    return {
      owner: shell?.me?.owner === true,
      live: (route.data as { live?: boolean }).live === true,
      home,
      currency: shell?.index?.currency ?? null,
      accounts: (shell?.index?.registers ?? []).find((r) => r.id === ledgerHere.account.list)?.count ?? 0,
      dismissed: navPrefs.isDismissed(SETUP_KEY),
    };
  });
  /* THE SETUP'S CODE ASKED FOR AS SOON AS THE PAGE IS A LEDGER'S HOME, before the record says whether setup is due, so
     "Set up Money" is drawn the moment it is (coordinator's live check, 1 Nov: it came a second or two late). */
  $effect(() => {
    if (setupFacts?.home && setupFacts.accounts === 0) void import('$lib/money/MoneySetup.svelte');
  });
  /**
   * THE BODY A HOME IS BUILT FROM WHILE THE RECORD HOLDS NONE, as its first Done keeps it (`previewedBody`), for Change
   * this page to draft over: the record's week with it, as Edit layout reads it.
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
    /* AND WHAT A LINE SAID ABOUT THE PAGE IS READ AGAINST (`say-page.ts`): its kind, its list, its source and column. */
    return blocks.map((b, i) => ({
      key: keyed[i]!,
      heading: typeof (b as { heading?: unknown }).heading === 'string' ? (b as { heading: string }).heading : null,
      kind: b.kind,
      register: typeof b.register === 'string' ? b.register : null,
      source: typeof (b as { source?: unknown }).source === 'string' ? (b as { source: string }).source : undefined,
      drawn: b.drawn,
      area: (b as { area?: unknown }).area === 'rail' ? 'rail' : 'main',
    }));
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
    const reading = projectPage && !arrangement.editing && arrangement.slots === null && !toArrange;
    /* A PAGE OF AN OLDER USE CASE DECLARES NO PART OF THE SHAPE, and is drawn with the two its newer versions declare (`withShape`). */
    const parted = reading ? withShape(drawn, (raw) => blockOf({ ...raw, parts: [...raw.parts], rows: [], matched: 0, refusals: [] } as never, new Map(), live?.now ?? 0)) : drawn;
    /* AND READ AS LAID OUT, ITS NUMBERS AND DATES IN ONE COLUMN BESIDE ITS WORK AND WHAT IT RUNS ON (`columned`). */
    const shaped = reading ? columned(onProject(parted, about?.register ?? '')) : drawn;
    const repeats = about && !shapeKnown ? withoutRepeats(shaped, ['runs-on'], counted?.length ?? null, null) : about && shapeDrew.length > 0 ? withoutRepeats(shaped, shapeDrew, counted?.length ?? null, shapeRow) : shaped;
    /* EACH PART OF THE PROJECT'S SHAPE IS DRAWN WHERE IT HAS SOMETHING, at its width (`project-parts.ts`), and none on a
       page about no project. */
    const hold = shapeBox.hold;
    return hold && about ? hold.laid(repeats) : repeats.map((b) => (b.kind === 'project' && b.drawn ? ({ ...b, drawn: false, why: 'empty' } as LiveBlock) : b));
  });

  /** Declared, then added. One list, so ordering and spans do not care which is which. This is what Arrange moves. */
  const own = $derived<LiveBlock[]>(live ? [...laidFrom, ...extra.map((b) => added(b, laidFrom))] : []);

  /** What the reader added under the page it read. A home being arranged is its body read again, which has none. */
  const feet = $derived<LiveBlock[]>(toArrange ? [] : (live?.page.blocks ?? []).filter((b) => b.synthetic));

  /**
   * Every block drawn: the page's own, then the reader's note. NOT WHILE AN ARRANGEMENT IS IN FORCE, where a block added
   * in the mode takes the next place after the declared ones and the note is nothing a person can move or save.
   */
  /* THE MODEL'S LINE ON A PROJECT'S LEAD (the thinking scope of 24 October), which the hero says in place of its rules'
     line: the declared lead is not drawn under the hero (`project-page.ts`), so the hero is where a kept line is read. */
  const modelLine = $derived(modelLineOf(live?.page.blocks ?? []));
  const all = $derived<LiveBlock[]>(arrangement.editing || arrangement.slots !== null ? own : [...own, ...feet]);
  /** A page drawn as a board has no rail: the board's own grid places every widget. */
  const withoutLayout = <P extends { layout?: unknown }>(p: P): P => {
    const { layout: _rail, ...rest } = p;
    return rest as P;
  };
  /** The blocks a page's body is drawn from: all of them, the project's other blocks held back while its shape loads. */
  const bodyBlocks = $derived(shapeWaits ? all.map((b) => (b.kind === 'project' || !b.drawn ? b : ({ ...b, drawn: false } as LiveBlock))) : all);

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

  /* THE BUTTONS GO TO THE LEAD TILE where the head would hold nothing else (`page-buttons.svelte.ts`): a project's page
     from 900px, while the page is read and not arranged. Projects opens on its projects now and keeps them in the head (4 Nov). */
  const buttonsHost = hostButtons();
  /** How long the head waits for a lead tile to take the page's buttons before it draws them itself. */
  const LEND_WAIT_MS = 1_000;
  const buttonsLent = $derived(mode === 'page' && wide.current && !arranging && !showSource && projectPage);
  /* Attached beside the snippet, which is the template's and not this script's to name. */
  const lendButtons =
    (b: Snippet) =>
    (_el: HTMLElement): (() => void) => {
      buttonsHost.buttons = buttonsLent ? b : null;
      return () => {
        buttonsHost.buttons = null;
      };
    };
  /* THE HEAD GIVES ITS ROW BACK FROM THE FIRST FRAME, not once the tile has taken the buttons: the lead tile draws a
     frame or two after the head (its block's code lands after the page's), so the head stood 52px tall over the page
     and then folded, and every cold open of a project or Projects jumped the whole screen up (layout shift 0.78 on the
     seed's Kiln, 0.4 on Projects, 2 Nov). Only when no tile has taken them after `LEND_WAIT_MS` does the head draw
     them itself, as before. */
  let lentLate = $state(false);
  $effect(() => {
    if (!buttonsLent || buttonsHost.held > 0) {
      lentLate = false;
      return;
    }
    const wait = setTimeout(() => (lentLate = true), LEND_WAIT_MS);
    return () => clearTimeout(wait);
  });
  const buttonsTaken = $derived(buttonsLent && (buttonsHost.held > 0 || !lentLate));
  /* THE PROJECTS LIST THE PAGE'S BOARD IS OVER, where the page draws no box of its own to add one with. */
  const boardAdd = $derived(mode === 'page' && !all.some((b) => b.kind === 'capture' && b.drawn) ? (all.find((b) => b.key === 'board' && b.drawn)?.register ?? null) : null);
  const headLine = $derived.by((): { at: number; block: LiveBlock } | null => {
    if (!hosting || !live) return null;
    const layout = layoutOf(live.page.page);
    const main = judgedWith(all, counted, (bs) => emptyHidden(bs, true))
      .map((block, at) => ({ block, at }))
      .filter((x) => areaOf(x.block, layout) === 'main');
    const hit = main[headCaptureAt(main.map((x) => x.block))];
    return hit && writes.capturable(hit.block) ? hit : null;
  });

  /* ── the look ──────────────────────────────────────────────────────────────
     HOW THE ENGINE ARRANGED THE PAGE (`look.ts`), and the page it is the look of: the page the record answered, which on
     a home is the page Home read (`home`) and not the screen's own address. */
  const look = $derived(live?.page.page.look ?? null);
  /* HIS BOARD FOR THIS PAGE, where he laid it out as one (`page-boards.svelte.ts`); a plain page otherwise. */
  const boardKept = $derived(mode === 'page' ? pageBoards.of(slug) : null);
  /* THE PAGES A BOARD IS OFFERED ON: a project's page, Money's home, and any page already laid out as one. */
  const boardable = $derived(mode === 'page' && (projectPage || live?.page.page.page === 'money' || boardKept !== null));
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

  /* PULL TO REFRESH, on a phone: a drag down from the very top of a page rereads it, once past `PULL_AT` pixels. Only
     a touch that starts at scroll 0 outside a field or a scrolling box counts, so a normal scroll is never taken. */
  const PULL_AT = 72;
  let pullFrom: number | null = null;
  let pulled = $state(0);
  let pullBusy = $state(false);
  function pullStart(e: TouchEvent): void {
    const t = e.target as HTMLElement | null;
    const inner = t?.closest?.('input, textarea, select, [contenteditable], dialog, [role="dialog"]');
    /* IN THE APP THE PULL IS NATIVE'S, and asks for this same reread: a second one here drew a pill over the nav bar. */
    const native = document.documentElement.dataset.shell !== undefined;
    pullFrom = native || mode === 'preview' || pullBusy || inner || window.scrollY > 0 || e.touches.length !== 1 ? null : e.touches[0]!.clientY;
  }
  function pullMove(e: TouchEvent): void {
    if (pullFrom === null) return;
    const d = e.touches[0]!.clientY - pullFrom;
    if (d <= 0 || window.scrollY > 0) {
      pulled = 0;
      return;
    }
    pulled = Math.min(d / 2, PULL_AT + 24);
  }
  async function pullEnd(): Promise<void> {
    const go = pullFrom !== null && pulled >= PULL_AT / 2;
    pullFrom = null;
    pulled = 0;
    if (!go) return;
    pullBusy = true;
    try {
      await reread();
    } finally {
      pullBusy = false;
    }
  }
</script>

<svelte:head>
  {#if mode === 'page'}<title>{titleOf(tabTitle)}</title>{/if}
</svelte:head>

<svelte:window ontouchstart={pullStart} ontouchmove={pullMove} ontouchend={pullEnd} ontouchcancel={pullEnd} />

<!-- THE QUICK ADD (`lib/money`): the `+` key and the palette's money rows on every page drawn here, and the floating +
     on a page of Money's that draws the ledger or its accounts. NOT ON A PAGE THAT ONLY HOLDS A MONEY TILE (audit 31 Oct,
     B9): on Kiln at 390 the + sat on its Money tile's "£4,050" and "Tue 15 Sep" from the first screen, with no Money
     padding under the last card to keep it clear at the foot; there the `+` key and the palette are the way in. Not on a
     preview, which writes nothing. -->
{#if pulled > 0 || pullBusy}
  <div class="pull" role="status" style:transform={`translateY(${pullBusy ? 16 : pulled - 24}px)`}>{pullBusy ? 'Refreshing' : pulled >= PULL_AT / 2 ? 'Let go to refresh' : 'Pull to refresh'}</div>
{/if}

{#if got === null || (got.from === 'live' && projectPage && (shapeBox.hold === null || !shapeOnce) && !partsFailed && !arranging)}
  {#if railed}
    <!-- THE HEAD FROM THE RAIL'S OWN ENTRY, AND BARS ONLY FOR THE BLOCKS, until the record answers. -->
    <!-- A PAGE ONE ROW MADE (a project's) WAITS IN THE HEAD IT WILL HAVE: the way back and no name row, its hero holding
         the name, and no sentence held, since it says none. A held line and a name row that went when the page landed
         moved Kiln's whole board up (VERIFY H4). -->
    <div class="hosted">
      <PageHead icon={railed.icon} hue={railed.hue} title={railed.title} headless={railed.row === true} back={railed.row ? railedBack : undefined} sentence={railed.row ? '' : undefined} />
      <div class="waiting-body"><Waiting /></div>
    </div>
  {:else if got !== null && live && mode === 'page' && about}
    <!-- THE PAGE HAS ANSWERED AND ITS SHAPE IS BEING TURNED, FOR A BLINK: its own head and shape stand till the parts land.
         Bare bars come only after 300ms, so this drew a blank between the frame and the page, and the name went and came
         back, about 80 ms on every project opened (find1104 #10). The same picture the route drew while the page read. -->
    <div class="hosted">
      <PageHead title={live.page.page.title} kicker={headKicker} back={projectBack} headless sentence="" />
      <div class="waiting-body">
        {#if waiting}{@render waiting()}{:else}<ProjectWaiting project={knownRow(apiBase(), `${about.register}#${about.seq}`) ?? { name: live.page.page.title, mark: '', hue: null, lane: '' }} />{/if}
      </div>
    </div>
  {:else}
    <!-- Bars until the record answers. -->
    <Waiting head={mode === 'page'} />
  {/if}
{:else if got.from === 'refused'}
  <!-- A REFUSAL IN A PERSON'S WORDS: what happened and one Try again; the record's own sentence waits behind
       Read details. Offline says so, since the record's sentence about a read that never left is no help. -->
  {@const said = typeof navigator !== 'undefined' && navigator.onLine === false ? copy.errorPage.offline : copy.errorPage.broken}
  <div class="said">
    <Empty kind="error" heading title={said.title} body={said.body} detail={got.fix}>
      {#snippet actions()}<Button weight="primary" onclick={() => location.reload()}>{said.action}</Button>{/snippet}
    </Empty>
  </div>
{:else if !live}
  {@const pages = (got.from === 'missing' ? got.held : []).map((h) => ({ title: heldTitle(h), href: `/p/${h.address}`, address: h.address }))}
  {@const part = !!shell?.me && !may(shell, 'read')}
  <div class="said">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has the sentence for it.
         Nothing failed, so there is no request id to quote (`50 §13 D11`), and no filter ran, so "nothing matched" is
         about something that did not happen. It names the thing, says it is not here, and lists what is: `10 §7`'s
         fourth rule, the refusal is the teacher. WHAT IS HERE IS THE FIVE NEAREST PAGES, AS LINKS (`record/nearest.ts`):
         the whole index in one sentence was thirty-eight addresses, none of them a thing to press. -->
    <!-- AND ONE SCREEN FOR EVERY ADDRESS THAT LEADS NOWHERE (`NotFound`): the same head, words and two ways on as a
         mistyped address and a number that names nothing, so a page not here is not a second design. -->
    <!-- AND FOR SOMEBODY HELD TO PART OF THE RECORD, "This isn't shared with you" (collab pass 4): a contractor typing
         another project's address was told it did not exist, which is not his to know either way. -->
    {#if mode === 'page'}<PageHead title={part ? copy.notShared.title : copy.noPageCalled(slug)} headless />{/if}
    {#await Promise.all([import('$lib/ui/NotFound.svelte'), import('$lib/record/nearest.ts')]) then [{ default: NotFound }, { nearest }]}
      {#if part}<NotFound title={copy.notShared.title} body={copy.notShared.body} />
      {:else}<NotFound title={copy.noPageCalled(slug)} body={pages.length === 0 ? copy.theseExist('Pages', []) : undefined} near={nearest(slug, pages)} />{/if}
    {/await}
  </div>
{:else if mode === 'page'}
  <!-- THE PAGE GIVES UP WHAT THE DOCKED PANEL TAKES, past the gutter it already pads by (`ui/Panel.svelte`'s `--dock-w`,
       0px while no panel is docked), so a row open beside the page never sits over its head or its tiles. -->
  <!-- `data-arrive` (`$lib/motion/motion.css`): in the skeleton's place it fades up rather than switching on. -->
  <div class="hosted" data-arrive data-money={moneyPage ? '' : undefined} data-lent={buttonsTaken ? '' : undefined} {@attach moneyPage ? masonry : undefined}>
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
    define={headlined || declaredPage || blank !== null ? undefined : 'page'}
    below={headBelow && !tiled ? declaredBelow : undefined}
    {tiled}
  >
    {#snippet actions()}
      <!-- THE BAR DRAWS THIS OUTSIDE THE PAGE, so it runs on for a beat after a move has taken the page's answer away. -->
      {#if live}
        {#if !tiled && !buttonsTaken && !besideLead}{@render pageButtons()}{/if}
        <Arrange bind:this={arranger} {arrangement} {slug} page={live.page.page} declared={declaredOnly(live.page.blocks)} all={own} bind:extra {showSource} {reread} />
      {/if}
    {/snippet}
  </PageHead>
  {#if accountPage && about && sharable && !arranging}{#await import('$lib/money/AccountShare.svelte') then { default: AccountShare }}<AccountShare part="line" seq={about.seq} name={about.title} />{/await}{/if}

  <span hidden {@attach lendButtons(pageButtons)}></span>
  <!-- THE PAGE'S OWN BUTTONS, drawn once: at the end of the name's row, or on the lead tile's first row. -->
  {#snippet pageButtons()}
      {#if headLine && wide.current && !tiled}{@render lineInHead()}{/if}
      <!-- ADD A PROJECT IN THE HEAD, AS ADD A PERSON IS ON PEOPLE (4 Nov), wherever the board is drawn and the page's own
           Add a project box is not. A page's own action comes first. -->
      {#if boardAdd && !declared?.action && !arranging && !showSource}
        <Button weight="primary" href={at(`/r/${boardAdd}?new=1`)}><Icon name="plus" size="s" />{words.addProject}</Button>
      {/if}
      {#if declared?.action && !arranging && !showSource}
        <!-- AN ADD WEARS THE PLUS, so on a phone it is the 36px square the head draws for a glyph (`PageHead.svelte`). -->
        <Button weight="primary" onclick={pressHead}>{#if /^(add|new)\b/iu.test(declared.action.label)}<Icon name="plus" size="s" />{/if}{declared.action.label}</Button>
      {/if}
      <!-- ADD A MOVEMENT, IN THE HEAD ON A PHONE (1 Nov): floating at the end edge, the red + sat on the first line's
           amount at rest on the Ledger at 390, and on whichever amount it passed after. From 900 up the `+` key and the
           palette are the way in. -->
      {#if quickHere && !arranging && !showSource}
        <span class="quick-head"><Button weight="primary" onclick={() => quick.start('out')} aria-label={quickWords.fab} title={quickWords.fab} aria-keyshortcuts="+"><Icon name="plus" size="s" />{quickWords.fab}</Button></span>
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
        <!-- SHARE WITH PEOPLE IS SHARE'S FIRST CHOICE, for an owner or an Admin, so the head stays two. -->
        <!-- ONE SHARE ON AN ACCOUNT (audit of 30 October, 19): its first choice is sharing the account, the sheet
             `AccountShare.svelte` draws, where Share and "Share this account" stood side by side. -->
        {@const account = accountPage && sharable ? about : null}
        <!-- ONLY TO SOMEBODY WHO MAY SHARE (collab pass, 2 Nov): a contractor shared one project was offered Share, and every
             choice in it refused her at the press. -->
        {#if only && sharable}<only.ShareMenu {slug} project={projectPage} people={account ? () => (accountAsk += 1) : sharing && sharable ? () => (sharingOpen = true) : undefined} peopleLabel={account ? copy.accountShareOpen : copy.shareWithPeopleOpen} />{/if}
        {#if sharing && sharable && !account && only}<only.ShareLazy bind:open={sharingOpen} subject={sharing} />{/if}
        {#if account}{#await import('$lib/money/AccountShare.svelte') then { default: AccountShare }}<AccountShare part="sheet" ask={accountAsk} seq={account.seq} name={account.title} />{/await}{/if}
        <ChangePage
          {slug}
          title={live.page.page.title}
          {showSource}
          {reread}
          onarrange={arranger?.entry() ?? null}
          {look}
          keys={drawnKeys}
          heads={blockHeads}
          board={boardable ? { on: boardKept !== null, keys: drawnKeys } : null}
          here={moneyPage ? { currency: shell?.index?.currency ?? null } : null}
          extra={[
            ...(projectPage && dataHref
              ? [{ label: 'Edit details', icon: 'edit' as const, href: dataHref }]
              : dataHref && !showSource && !roomy.current
                ? [{ label: words.showData, icon: 'rows' as const, href: dataHref }]
                : []),
            ...(projectPage
              ? [{ label: navPrefs.isPinned(pinHref(slug)) ? pinWords.unpin : pinWords.pin, icon: 'pin' as const, onclick: () => void togglePin(pinHref(slug), live.page.page.title) }]
              : []),
            ...importItem,
            ...contactsItem,
          ]}
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
    <!-- WHERE A BAR SAYS THE NAME (`barTitled`), its glyph, name, count and parent are the bar's, and the `h1` is unseen. -->
    <div class="lead-head" data-barred={barTitled() ? '' : undefined}>
      <span class="lead-glyph" aria-hidden="true"><Icon name={iconFor(live.page.page.icon, 'doc')} size="m" /></span>
      <h1 class="lead-name" tabindex="-1" dir="auto" data-thing={route.url.pathname + route.url.search} data-menu-host={PAGE_MENU}>{live.page.page.title}</h1>
      {#if declared?.count?.value}<span class="lead-count num">{declared.count.value.toLocaleString('en')}</span>{/if}
      {#if crumb}
        {#if backTo}<a class="lead-crumb" href={at(backTo)}>{crumb}</a>{:else}<span class="lead-crumb">{crumb}</span>{/if}
      {/if}
      <span class="lead-actions">{@render pageButtons()}</span>
    </div>
    {#if headBelow}{@render declaredBelow()}{/if}
    {@render bookScope()}
  {/snippet}

  <!-- WHICH BOOK, under the name of Money's home and of each book's page: Everything, then Personal and each business,
       where the record keeps two or more. -->
  {#snippet bookScope()}
    {#if moneyPage && !showSource && bookHere && (live.page.page.page === 'money' || about?.register === bookHere.list)}
      {#await import('$lib/money/BookScope.svelte') then { default: BookScope }}
        <BookScope base={apiBase()} book={bookHere} on={about?.register === bookHere.list ? about.seq : null} />
      {/await}
    {/if}
  {/snippet}

  <!-- THE LINE THE PAGE OPENS ON, drawn once: in the header's row, or handed to the body to sit under its sentence. -->
  <!-- DRAWN WHEREVER IT IS CALLED (3 Nov): the lead tile and a phone call it under the name, and a desk page with no
       sentence over it at the start of the buttons' row, where it was asked for and drew nothing once Work's count line
       went. -->
  {#snippet lineInHead()}
    {#if headLine}<HeadCapture block={headLine.block} oncapture={(register, text, inherited) => void writes.captureLine(register, text, inherited)} />{/if}
    <!-- UNDER "JUST YOU SO FAR", the one way to bring everybody in at once. -->
    {#if peopleEmpty}<p class="people-import">Have a contacts file from your phone, Google or Outlook? <a href={at('/add/contacts')}>Import contacts</a></p>{/if}
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
  <!-- A PAGE WITH NO SENTENCE BUT A CAPTURE LINE ON A PHONE hands its strip to the body too (3 Nov), which draws the line
       first and the strip under it, as the lead tile does: drawn here, the strip stood over the line once Work's count
       sentence went. -->
  {#if strip && !led && !(headLine && !wide.current)}
    <div class="page-filters">{@render narrow()}</div>
  {/if}
  {#if !tiled && moneyPage && bookHere && about?.register === bookHere.list}<div class="page-filters">{@render bookScope()}</div>{/if}


  {#if showSource}
    <!-- The declaration as text. A page is a row, so this is the row (19 §2). -->
    {#await import('./SourceView.svelte') then { default: SourceView }}<SourceView {slug} title={live.page.page.title} />{/await}
  {:else}
    <!-- A PAGE ABOUT A PROJECT'S ROW OPENS ON THE PROJECT'S ONE SHAPE, the parts its page declares; its other
         blocks follow. THE SHAPE'S CODE ARRIVES WITH THE PAGE THAT NEEDS IT, by `import()`: Today draws a page and never a
         project's shape, so its first load does not carry one. While it is on its way the project waits in its own shape
         (`waiting`), and the page's other blocks wait on the shape's reads (`shapeWaits`). -->
    <!-- WHAT WAS TOLD BEFORE AN ACCOUNT STAYS, UNDER THE SETUP SINCE 1 NOV (audit 31 Oct m, AM3): bills and what repeats, kept and
         drawn, never "Nothing here yet" over them. Only while there is no account, when the page draws nothing else. -->
    <SetupGate facts={setupFacts} keep={blank === null && setupFacts?.accounts === 0}>
    {#snippet setup(close)}
      {#if ledgerHere}
        {#await import('$lib/money/MoneySetup.svelte') then { default: MoneySetup }}
          <MoneySetup
            base={apiBase()}
            ledger={ledgerHere}
            currency={shell?.index?.currency ?? null}
            accounts={(shell?.index?.registers ?? []).find((r) => r.id === ledgerHere.account.list)?.count ?? 0}
            locale={shell?.index?.locale ?? 'en'}
            onclose={() => {
              close();
              void reread();
            }}
          />
        {/await}
      {/if}
    {/snippet}
    <div class="body-wrap" data-project={projectPage ? '' : undefined} style={projectStyle}>
    {#snippet laidOut(blocks: LiveBlock[], placed: ((i: number) => { key: string; area: string; size: string } | null) | null, inside: import('svelte').Snippet<[number]> | null)}
      <PageBody
        mode="page"
        opens={about && !shapeBox.hold && !placed ? (waiting ?? null) : null}
        page={placed ? withoutLayout(bodyPage ?? live!.page.page) : (bodyPage ?? live!.page.page)}
        {blocks}
        {answerTurn}
        held={counted}
        now={live!.now}
        {writes}
        {arrangement}
        headed={led && !placed}
        leadHead={tiled && !placed ? leadRow : null}
        leadEnd={besideLead && !buttonsTaken && !placed ? pageButtons : null}
        captured={placed ? -1 : (headLine?.at ?? -1)}
        under={((headLine && (tiled || !wide.current)) || peopleEmpty) && !shapeWaits && !placed ? lineInHead : null}
        strip={strip && (led || (headLine && !wide.current)) && !shapeWaits && !placed ? narrow : null}
        host={hosting && !shapeWaits ? host : null}
        pick={hosting ? picked : null}
        {onwalk}
        {placed}
        {inside}
        bare={placed !== null}
        ids={placed ? 'board-' : ''}
      />
    {/snippet}
    <!-- A PAGE HE LAID OUT AS A BOARD (`PageBoard.svelte`, widgets plan W6): its head as ever, every other block a widget. -->
    {#if boardKept && !arranging}
      {#await import('./PageBoard.svelte') then { default: PageBoard }}
        <PageBoard {slug} title={live.page.page.title} blocks={bodyBlocks} kept={boardKept} mayEdit={shell?.me?.owner === true || Boolean(shell?.me?.person)} {reread}>
          {#snippet head(heads)}{@render laidOut(heads, null, null)}{/snippet}
          {#snippet body(placed, laid, inside)}{@render laidOut(laid, placed, inside)}{/snippet}
        </PageBoard>
      {/await}
    {:else}
      {@render laidOut(bodyBlocks, null, null)}
    {/if}
    </div>
    <!-- BUDGETS SETS ITS BUDGETS, a week's, a month's or a year's, at its foot (`BudgetSet.svelte`), placed as the offer is. -->
    {#if slug === 'money-budgets' && !shapeWaits && !arranging && writes && ledgerHere?.category}<div class="page-offer" data-after="blocks">{#await import('$lib/money/BudgetSet.svelte') then { default: BudgetSet }}<BudgetSet category={ledgerHere.category} onsaved={() => void reread()} />{/await}</div>{/if}
    <!-- THE OFFER COMES AFTER EVERY BLOCK OF THE PAGE, never before the first. -->
    {#if offer && !shapeWaits}<div class="page-offer" data-after="blocks">{@render offer()}</div>{/if}
    {#if hosting}<BatchBar {picked} />{/if}
    </SetupGate>
  {/if}
  </div>
  {#if hosting && only}
    <only.RowPanel {host} />
    <only.ChangesPanel {host} />
    <only.RowVerbMenu {host} {reread} />
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
            extra={more}
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
      {unfolded}
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
      placed={placed ?? null}
      inside={inside ?? null}
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

<!-- LAST IN THE PAGE, so the floating + is the last stop before the tab bar and not the second after the skip link
     (audit 31 Oct i, AI2): it floats, so where it stands in the page changes only the order Tab meets it. -->
{#if mode !== 'preview' && live}
  <QuickHost />
{/if}

<style>
  /* THE PAGE'S BODY, which on a project's page carries the project's colour down to every chart (`projectStyle`). */
  .body-wrap {
    display: contents;
  }

  /* PEOPLE WITH NOBODY BUT YOU: the one line that says where a contacts file goes, a plain link in ink. */
  .people-import {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .people-import a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 2px;
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
    line-height: calc(18px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width < 640px) {
    .body-wrap[data-project] :global(.block[data-kind='section'] .sec:has(.sec-fold)::after) {
      padding-inline-start: 0;
      white-space: normal;
    }
  }

  /* THE LINE IS MORE ABOUT'S ALONE (Q32 of 29 October): "Send numbers here", folded under it, wore the same "Keeping it
     alive 2 · Key numbers · Notes", so a folded section after the first box says only its heading. */
  .body-wrap[data-project] :global(.box:has(.sec-fold) ~ * .block[data-kind='section'] .sec:has(.sec-fold)::after) {
    display: none;
  }

  /* THE OFFER UNDER THE PAGE'S BLOCKS, one tile gap below the last, in the page's own gutter. */
  .page-offer {
    padding-inline: var(--gutter);
    margin-block: var(--tile-gap);
  }

  /* THE PAGE'S END SPACE MOVES UNDER THE OFFER, so the line sits one tile gap below the last block and not after a
     100px empty band; the space is kept under the last offer. NO `:has` INSIDE A `:has` (finish F5): written as
     `:has(+ .page-offer:not(:has(> [data-lessons])))` the selector was no selector, the browser dropped both rules, and
     Budgets stood 120px apart from its Set a budget. What every agent is told (`[data-lessons]`) takes the same space
     (`routes/p/[slug]`), so every offer moves it. */
  .body-wrap:has(+ .page-offer) :global(.page) {
    padding-block-end: 0;
  }

  .body-wrap ~ .page-offer:not(:has(~ .page-offer)) {
    padding-block-end: var(--page-bottom);
  }

  .hosted {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w, 0px) - var(--gutter)));
    /* AND ITS FADE UP IN THE SKELETON'S PLACE (`data-arrive`, `motion.css`), written here since this rule outweighs it. */
    transition:
      padding-inline-end var(--d-panel) var(--ease-sheet),
      opacity var(--d-swap) var(--ease-standard);
  }

  /* The blocks' bars stand in the board's gutter, where the first tile will be. */
  .waiting-body {
    padding: var(--tile-gap) var(--gutter) var(--page-bottom);
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

  /* THE HEAD GIVES ITS ROW BACK while the lead tile draws the page's buttons (`page-buttons.svelte.ts`): what is left in
     it (the unseen `h1` on Projects, the arranging controls at rest) stays for a screen reader and takes no room. */
  .hosted[data-lent] :global(.page-head:is([data-headless], [data-titled])) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* THE STRIP SITS IN THE PAGE'S OWN GUTTER, over the first tile, with the gap a row of tiles keeps. */
  .page-filters {
    padding: var(--tile-gap) var(--gutter) 0;
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

  .lead-head[data-barred] :is(.lead-glyph, .lead-count, .lead-crumb) {
    display: none;
  }

  .lead-head[data-barred] .lead-name {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    clip-path: inset(50%);
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

  /* ADD A MOVEMENT IS A PHONE'S, where there is no `+` key to press. */
  .quick-head {
    display: none;
  }

  /* ON A PHONE A BUTTON WITH A GLYPH IS THE GLYPH ALONE in a 44px square, as the head draws it; its words stay its name. */
  @media (width < 900px) {
    .quick-head {
      display: contents;
    }

    .lead-actions {
      gap: var(--sp-1);
    }

    .lead-actions :global(.btn:has(.icon):not(dialog *)) {
      inline-size: var(--tap);
      min-inline-size: var(--tap);
      min-block-size: var(--tap);
      padding: 0;
      gap: 0;
      font-size: 0em;
    }

    .lead-actions :global(:is(.btn[data-weight='quiet'], .share-trigger):not(dialog *)) {
      background: none;
    }

    .lead-actions :global(.change-more) {
      inline-size: var(--tap);
      min-block-size: var(--tap);
      color: var(--ink);
    }

    /* THE GLYPHS AT THE SIZES THE HEAD DRAWS THEM (`PageHead.svelte`): the page's "+" a 36 square with its 16px glyph,
       Share and the "⋯" bare 44s with 20px glyphs. Left at their words' sizes they were 12px specks in 44px boxes
       (People at 390, 1 Nov). */
    .lead-actions :global(.btn[data-weight='primary']:has(.icon):not(dialog *)) {
      inline-size: 36px;
      min-inline-size: 36px;
      min-block-size: 36px;
      margin: 4px;
    }

    .lead-actions :global(.btn[data-weight='primary']:has(.icon):not(dialog *) .icon[data-size]) {
      inline-size: var(--icon-m);
      block-size: var(--icon-m);
    }

    .lead-actions :global(:is(.btn[data-weight='quiet'], .change-more, .share-trigger):not(dialog *) .icon[data-size]) {
      inline-size: var(--icon-l);
      block-size: var(--icon-l);
    }
  }

  /* A DECLARED HEAD'S LINE: one row under the sentence that wraps on a phone. Flat, on the board: no tile,
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
    padding: var(--sp-5) var(--gutter) var(--page-bottom);
    max-inline-size: calc(var(--measure) + 2 * var(--gutter));
    /* CENTRED, as a mistyped address's card is (`routes/[id]`): the two whole-screen states stood in two places (AF19). */
    margin-inline: auto;
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
      padding: var(--sp-4) var(--gutter) var(--page-bottom);
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

  .pull {
    position: fixed;
    inset-block-start: 0;
    inset-inline: 0;
    margin-inline: auto;
    inline-size: max-content;
    z-index: var(--z-raise);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-pill, var(--r-ctl));
    background: var(--glass-regular, var(--tile));
    -webkit-backdrop-filter: var(--glass-filter, none);
    backdrop-filter: var(--glass-filter, none);
    border: 0;
    box-shadow: var(--glass-edge, 0 0 0 1px var(--rule)), var(--elev-popover, none);
    color: var(--ink-2);
    font-size: var(--fs-cap);
    pointer-events: none;
  }
</style>
