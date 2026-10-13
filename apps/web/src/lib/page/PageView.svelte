<!--
  A declared page, drawn: the one reader every declared page goes through, wherever it is drawn.

  ONE READER, THREE MODES. `page` is `/p/<slug>`: the head, the source,
  Edit layout, the writes and the keys. `home` is Home's and Decide's body: no head and no source, the writes stay on,
  and the page menu waits at the body's top end until the pointer or focus is on the page (`home-arrange.ts`). `preview` is a page not yet installed, drawn as it would be: inert, with no writes, no arranging and no source,
  and with `was` it is drawn beside the page as it is now, one at a time on a phone. Home and Decide each drew a
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
  import Waiting from '$lib/ui/Waiting.svelte';
  import ShareMenu from '$lib/ui/ShareMenu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Arrange, { added } from './Arrange.svelte';
  import ChangePage from './ChangePage.svelte';
  import PageBody from './PageBody.svelte';
  import HeadCapture from '$lib/home/HeadCapture.svelte';
  import { areaOf, headCaptureAt, layoutOf } from './layout.ts';
  import { arranged, emptyHidden } from './home.ts';
  import { leadIndex } from './lead.ts';
  import { asksActions, judgedWith, readHeld } from './panels.ts';
  import type { ActionRow } from '$lib/record/actions.ts';
  import SourceView from './SourceView.svelte';
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
  }: {
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
     * board's last line, one quiet row that opens on tap, as DIRECTION 39 puts "Changed for you" at the bottom of the
     * board. Not drawn over the page's source, which is the declaration and nothing else.
     */
    offer?: Snippet | undefined;
  } = $props();

  /* A PAGE IS THE RECORD'S BLOCKS AND NOTHING ELSE; a record that does not answer is its refusal, drawn below. */
  const live = $derived(got?.from === 'live' ? got : null);

  /* ── what the actions panel holds ──────────────────────────────────────────
     A PART WITH SOMETHING IN IT MUST NOT VANISH (DIRECTION §35, §37). A boxed section whose panel is the project's
     scheduled actions is judged with its blocks, and the panel reads its actions only once it is drawn, so the page
     counts them first (`panels.ts`): ONE READ A PAGE, for the row it is drawn for, and only where a section waits on
     it. `null` until the read is back, and for good where nothing asks or the record refused. Read again for another
     row, never for the same page read again after a write. */
  const about = $derived(mode === 'page' ? (live?.page.page.param ?? null) : null);
  const spoken = $derived(about ? `${about.register}#${about.seq}` : null);
  const asks = $derived(spoken !== null && asksActions(live?.page.blocks ?? []));
  let tally = $state.raw<{ of: string; rows: ActionRow[] | null } | null>(null);
  $effect(() => {
    const of = asks ? spoken : null;
    if (of === null) return;
    /* BY THE ROW AND WHETHER ANYTHING ASKS, and by nothing else: the page read again is a new answer naming the same row. */
    untrack(() => {
      if (!live || !about) return;
      void readHeld((url, init) => fetch(url, init), apiBase(), live.page.blocks, { spoken: of, title: about.title }).then((rows) => {
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

  /** Blocks added in this session. They live beside the declared ones and index past them. */
  let extra = $state<PageBlock[]>([]);

  /** The arranging controls, whose way in the head's page menu offers. */
  let arranger = $state<ReturnType<typeof Arrange>>();

  /**
   * WHETHER THE PAGE OPENS ON ITS SENTENCE (`lead.ts`), which is then the header's line and not a tile (DIRECTION §39,
   * "page header, not a hero"): the name at 28 with its icon, the sentence once under it at 17 in the body ink, and the
   * board after. The sentence was a 40px headline in a white card of its own, with the name riding over its top, and it
   * ate the top fifth of every page. Not while arranging, where every block is a list item with a bar of its own. The
   * blocks are read as the body draws them, so a block it hides for holding nothing does not stand first.
   */
  const led = $derived(!!live && !arranging && !showSource && leadIndex(judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs))) >= 0);

  /**
   * WHETHER THE PAGE SAYS WHAT IT IS ITSELF: a drawn `note lead` anywhere among its blocks. Such a page does not get the
   * generic "One screen that gathers what you keep an eye on" under its title as well (`define`), which on Work stood
   * between the name and the page's own sentence and said less than it. Read whether or not the page opens on it, so the
   * line does not come back while arranging or reading the source.
   */
  const headlined = $derived(!!live && judgedWith(live.page.blocks, counted, (bs) => emptyHidden(bs)).some((b) => b.drawn && b.kind === 'note' && b.lead === true));

  /* ── arranging a home ──────────────────────────────────────────────────────
     TODAY AND DECIDE ARRANGE THEIR BODY, NOT WHAT THEIR SCREEN DREW (`home-arrange.ts`): the mode reads the body again,
     one block for each it declares, and a body nobody installed yet is installed by the first Done. */
  const shell = $derived(route.data as unknown as Shell);
  /** The page this home arranges and whether the record holds it, or `null` off a home or for one with nothing to arrange. */
  const kept = $derived(mode === 'home' && live ? keptAs(slug, shell.pages ?? []) : null);
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
   * The blocks the page is laid out from: the home's body while it is arranged, else what the record answered.
   *
   * AS THIS READER IS DRAWN THEM, wherever the page is read rather than previewed (`home-arrange.ts`): a house heading
   * in the voice that speaks, so a home kept from Today still says Settings › Words' lines, and no line to add a row to a
   * list this reader may not add to. Each block stays at its place, so every write still finds it.
   */
  const laidFrom = $derived.by<LiveBlock[]>(() => {
    const blocks = toArrange ? toArrange.blocks : (live?.page.blocks ?? []);
    if (mode === 'preview') return blocks;
    /* A SCREEN WHOSE SHELL NAMES NO READER keeps every line, as it drew them before, and the record answers a press. */
    return heldTo(inVoice(blocks, said), (list) => !shell?.me || may(shell, 'append', list));
  });

  /** Declared, then added. One list, so ordering and spans do not care which is which. */
  const all = $derived<LiveBlock[]>(live ? [...laidFrom, ...extra.map((b) => added(b, laidFrom))] : []);

  /* ── the line a page opens on ──────────────────────────────────────────────
     A PAGE WHOSE MAIN COLUMN OPENS ON A LONE LINE TO TYPE INTO KEEPS IT IN ITS HEADER, as Today does (`layout.ts`
     `headCaptureAt`, `home/HeadCapture.svelte`): beside the name from 900px, and under the page's sentence on a phone,
     where the name's row has no room for it. Work spent a whole tile on "What needs doing?". By the declared order, so
     the header does not change when the look moves a tile. Not while arranging or reading the source, where the line is
     a block like any other, and only a line this reader's list can take. */
  const wide = new MediaQuery('(width >= 900px)', true);
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
    const blocks = arranged(live?.page.blocks ?? []);
    const keyed = blockKeys(blocks);
    return lookOrder(
      blocks.map((b, i) => placedOf(b, keyed[i]!)),
      look,
    )
      .filter((i) => blocks[i]?.drawn)
      .map((i) => keyed[i]!);
  }

  /**
   * WHAT SLASH ARRANGES WHILE THE PERSON IS LOOKING IS OFFERED BACK FOR SIX SECONDS, and kept once they pass (DIRECTION
   * §37's Undo, `look.ts` `offerUndo`): when the page is read again under a new arrangement of Slash's, once an
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
  {#if mode === 'page'}<title>{titleOf(live?.page.page.title)}</title>{/if}
</svelte:head>

<svelte:window {onkeydown} />

{#if got === null}
  <!-- Bars until the record answers. -->
  <Waiting head={mode === 'page'} />
{:else if got.from === 'refused'}
  <div class="said">
    <Empty kind="error" heading title={got.fix}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !live}
  <div class="said">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has the sentence for it.
         Nothing failed, so there is no request id to quote (`50 §13 D11`), and no filter ran, so "nothing matched" is
         about something that did not happen. It names the thing, says it is not here, and lists what is: `10 §7`'s
         fourth rule, the refusal is the teacher. -->
    <Empty kind="error" heading title={copy.noSuch('page', slug)} body={copy.theseExist('Pages', got.from === 'missing' ? got.held : [])}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
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
    kicker={live.page.page.nav?.section}
    title={live.page.page.title}
    define={headlined ? undefined : 'page'}
  >
    {#snippet actions()}
      {#if headLine && wide.current}{@render lineInHead()}{/if}
      {#if !arranging}
        <!-- SHARE, AND ONE "⋯" FOR THE REST (DIRECTION §35): How this is built, Change this page and Edit layout were
             four controls in a row over every page, and a reader uses Share far more often than the other three. The
             menu is `ChangePage.svelte`; Edit layout's way in is `Arrange.svelte`'s, handed over as `entry()`. -->
        <ShareMenu {slug} />
        <ChangePage {slug} title={live.page.page.title} {showSource} {reread} onarrange={arranger?.entry() ?? null} {look} keys={drawnKeys} />
      {/if}
      <Arrange bind:this={arranger} {arrangement} {slug} page={live.page.page} declared={live.page.blocks} {all} bind:extra {showSource} {reread} />
    {/snippet}
  </PageHead>

  <!-- THE LINE THE PAGE OPENS ON, drawn once: in the header's row, or handed to the body to sit under its sentence. -->
  {#snippet lineInHead()}
    {#if headLine}<HeadCapture block={headLine.block} oncapture={(register, text, inherited) => void writes.captureLine(register, text, inherited)} />{/if}
  {/snippet}

  <!-- THE RENDERER'S STRIP, one group a field, "All" first, the rest behind one select (`braindog-render` `Filters`).
       Under the headline on a page that opens on one, and between the head and the first tile otherwise. -->
  {#snippet narrow()}<Filters {filters} {chosen} {onfilter} />{/snippet}
  {#if strip && !led}
    <div class="page-filters">{@render narrow()}</div>
  {/if}

  {#if showSource}
    <!-- The declaration as text. A page is a row, so this is the row (19 §2). -->
    <SourceView {slug} title={live.page.page.title} />
  {:else}
    <PageBody
      mode="page"
      page={live.page.page}
      blocks={all}
      held={counted}
      now={live.now}
      {writes}
      {arrangement}
      headed={led}
      captured={headLine?.at ?? -1}
      under={headLine && !wide.current ? lineInHead : null}
      strip={strip && led ? narrow : null}
      host={hosting ? host : null}
      pick={hosting ? picked : null}
      {onwalk}
    />
    <!-- THE OFFER COMES AFTER EVERY BLOCK OF THE PAGE, never before the first. -->
    {#if offer}<div class="page-offer" data-after="blocks">{@render offer()}</div>{/if}
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
           focus is on the page (DIRECTION §35: secondary controls appear on hover or focus); while arranging, the
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
            {look}
            keys={drawnKeys}
            onarrange={arranger?.entry() ? () => void arrangeHome() : null}
          />
        {/if}
        <Arrange
          bind:this={arranger}
          {arrangement}
          slug={kept.id}
          page={toArrange?.page ?? live.page.page}
          declared={laidFrom}
          {all}
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
        <div class="segmented compare-switch" role="group" aria-label={words.compare}>
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
        </div>
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

  /* ── a home's page menu ───────────────────────────────────────────────────
     AT THE BODY'S TOP END, raised into the space over it, where a page at its own address has its ⋯ in the head. Not
     drawn at rest: it comes in while the pointer is anywhere on the page or focus is in it, and stays while its menu is
     open. ONE STEP UNDER THE CHROME (`--z-sheet`, the sticky head's and the tab bar's), over the content: scrolled up
     under the head it goes under the head's glass with the blocks, and never sits over the head's own buttons (Decide's
     Ask a question) where a press meant for them would land on it.

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
    font-size: var(--t-md);
    font-weight: 600;
  }

  .compare {
    display: grid;
    gap: var(--sp-5) var(--sp-6);
    align-items: start;
    min-inline-size: 0;
  }

  .compare-switch {
    justify-self: start;
  }

  .compare-side {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .compare-name {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
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

    .compare-switch {
      display: none;
    }
  }
</style>
