<!--
  The palette: the ask field, opened, reaching OBJECTS and not only the screens they live on.

  OUT OF THE FIELD IT WAS OPENED FROM, AT EVERY WIDTH (`placeOn`). Pressing `/` or the bar's "Ask or change anything"
  widens that field in place, and the answer drops down attached under it at the same width, never a centred box: from
  900px over the bar's field, from 640px across the head bar's row, and on a phone a sheet from the top edge, the full
  width. Only with no field on screen at all is it the centred box. It is a tile with one strong hairline over the scrim,
  solid: no glass, no shadow. It widens over `--d-panel` and fades out over `--d-panel-out`; under reduced motion it only
  fades. Focus goes to the field and back to the trigger. Each result is a glyph in a 28px well, a title and one line
  saying where it sits (`Result.svelte`).

  TWO MODES IN ONE FIELD. Find (`/`, ⌘K) is everything below; Ask (⌘J, or a question typed into Find) is the
  conversation with Slash (`SlashThread.svelte`), the field its follow-up field.

  WITH NOTHING TYPED IT IS TWO SHORT GROUPS, "Go to" (the five places and Settings) and "Recent" (the last five rows
  changed): it opened on a wall of fifteen figures. A group shows six rows and then "Show all 13". A figure is drawn
  only when the query matches it, and its reading is written whole, the way a tile writes it.

  AND THE OBJECTS COME FIRST IN IT. The groups used to be ranked commands, destinations, pages,
  figures, decisions, with everything the record answered with underneath all of them, so typing
  four letters of the row on the screen behind the panel drew every command, page and figure that
  matched before it drew the row.
  The other order is the one wanted, and `rankOf` below is where it is
  written down.

  STILL A `<dialog>`. The element is not the shape: it is the focus trap, the inert background and
  the Escape that this surface would otherwise have to reimplement, and every one of those is
  wanted. What changed is where it is drawn.

  WHAT IS IN IT IS DECIDED BY A WRITTEN RULE. `admit.ts` holds it: three tests every command has to
  pass, plus the standing rule that a row which cannot run right now is absent rather than greyed
  out. The rule is enforced there, in `commands()`, so nothing in this file can add a row that
  fails it. This file applies the same standing rule to the objects it draws.

  NO LEGEND OF KEYS, AND A KEY ONLY ON THE CURSOR ROW. A key on every row and a grammar
  in a mono footer read as a tool for the people who wrote it. The cursor row carries a key cap hint
  at desktop width: its binding, read from the keymap registry so it cannot drift from what is bound,
  and `↵`. The `?` sheet is where the whole map lives.

  The results are grouped under meta headings. Slash's answers are drawn in the same surface, under the same headings,
  rather than in a second panel.

  Prefixes work in EVERY mode: `>` commands, `#` rows, `@` people, `/` pages and registers, none is
  everything ranked. GitHub's palette has one grammar per mode and a second opener that fast-paths
  you into it; both are refused here, so there is no command mode and no second opener (19 §4).

  A bare spoken id resolves directly, D41, SG23, because ids in this product are said out loud and
  must be typeable exactly as heard. The one exception is `#125`: every register has a `#1`, so it
  never resolves bare. Type `tasks#125`.

  `⇥` COMPLETES THE QUERY AND NOTHING ELSE. Raycast rebinds it to "abandon the query and submit to
  AI", unconditionally, even with no text typed, and in a search input `⇥` universally means
  complete. Losing a half-typed query to a chat is a real cost.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { keptRead } from '../shell/side-read.ts';
  import { isGlyph } from '../ui/icons.ts';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { moneyWhole, readable, readFigure, since } from 'braindog-render';
  import { homeCurrency } from '../record/api.ts';
  import { copy } from '../copy.ts';
  import { terms, tokensOf } from '../record/find.ts';
  import { BINDINGS, overlays } from '../a11y/keys.svelte.ts';
  /* `REGISTERS` IS THE DECLARATION CACHE, not the sample: it names a list the rail has not, and `learn` fills it from the
     record (it still starts with the seed's declarations, which `held.ts` takes away). */
  import { type NavEntry } from '../record/api.ts';
  import { REGISTERS } from '../record/held.ts';
  import { toasts } from '../ui/toast.svelte.ts';
  import Kbd from '../ui/Kbd.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/Icon.svelte';
  import Result from './Result.svelte';
  import { listName } from '../record/names.ts';
  import { commands, ranked, type Act, type Creation } from './admit.ts';
  import { addRow, creation, homeCapture, moneyWay, offered, plainAdd, words as createWords, type Into, type Plain } from './create.ts';
  import { addTold, offersFor, warm as warmTell, type TellOffer, type TellShell } from './tell-row.ts';
  import { letGo, photoFields, shared } from '$lib/phone/shared.svelte.ts';
  import { quick } from '$lib/money/quick.svelte.ts';
  import { tokensOf as lineTokens, untoken, type Chip } from './tokens.ts';
  import { homeSlugOf, labels as heardLabels, relabel, singularOf } from '../voice.ts';
  import type { Shell } from '../record/boot-live.ts';
  import type { Fields } from '../record/schema.ts';
  import { entryHref, sayLine, slashEntryWords, slashLine } from '../page/slash-entry.ts';
  import { customise, type Change, type Look, type Place } from './customise.ts';
  import { widgetRows } from '../board/palette-rows.ts';
  import { todayOffer } from '../board/offer.svelte.ts';
  import { FILL, asked as pageAsked, maker as pageMaker, paging, pressed as pagePressed, rowTitle as pageRow, whoOf, type Paging } from './new-page.ts';
  import { apply as applyChange, keptNow, lookNow, pageMenu } from './customise-apply.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import { said as voiced } from '../voice.svelte.ts';
  import { spineOf, type SpineCounts } from '../spine.ts';
  import type { List, Recent } from '../record/palette.ts';
  import { opened as openedHere, questionsOf, type Opened } from './opened.ts';
  import type { Hits, Reader } from '../record/palette-live.ts';
  import type { Metric } from '../record/api.ts';
  import { latest } from './latest.ts';
  import { palette as opener } from './open.svelte.ts';
  import { untrack } from 'svelte';
  import { ABOUT_WAIT, aboutRows, aboutWords, asksAbout } from './about.ts';
  import { asksFirst, capLine, inOrder, offersSlash, slashWords } from './slash.ts';
  import SlashThread from './SlashThread.svelte';
  import { ask as askThread, askingAs, clear as clearThread, convo, open as threadOn, rethink, rethinkable } from './thread.svelte.ts';
  import { threadsKey } from './slash-chat.ts';
  import AttachPicker from '../send/AttachPicker.svelte';
  import { sendWords, targets as readTargets, type Attached, type Target } from '../send/send.ts';
  import Menu from '../ui/Menu.svelte';
  import { backCloses } from '../ui/back.svelte.ts';
  import { pageOf, threadWords, type PageContext } from './slash-chat.ts';
  import type { About, SlashStatus } from '@braindog/client';

  let {
    open = $bindable(false),
    nav,
    places: goPlaces = [],
  }: {
    open?: boolean;
    nav: NavEntry[];
    /** Where "Go to" leads with nothing typed: the five places the bar draws, and Settings. */
    places?: readonly { key: string; href: string; label: string; icon: string }[];
  } = $props();

  type Row = {
    id: string;
    title: string;
    /** `null` on a row that acts in place. Only a command can be one; every object is an address. */
    href: string | null;
    group: string;
    detail?: string | undefined;
    /** A figure's reading, printed beside its name so the row answers without being opened. */
    value?: string | undefined;
    tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
    icon?: IconName | undefined;
    /** A binding id from the registry, shown in the row's hover tooltip at desktop width. Never a key spelled here. */
    binding?: string | undefined;
    act?: Act | undefined;
    /**
     * WHAT `⇥` TURNS THE QUERY INTO, when this row is one a query can become.
     *
     * Absent means completion skips the row. It has to be a field rather than a rule about titles,
     * because the row that broke this HAS a title: the overflow row reads *All 484 matches for
     * “ren”*, and pressing `⇥` on it wrote that sentence into the box and dropped the list to
     * *Nothing matches*. The comment above it asserted that could not happen, on the grounds that
     * *"completion reads `flat[cursor]` only when the row carries a `title` a query can become"*,
     * which was a description of a guard that was never written. This is the guard.
     *
     * `19 §7`'s Raycast rule is the whole reason `⇥` exists here, and this file's own header names
     * losing a half-typed query as the failure it is copied to avoid.
     */
    complete?: string | undefined;
    /** The question Slash's row asks. Only that row carries it, and running it keeps the panel open. */
    ask?: string | undefined;
    /** The row the add row writes, read out of the query. Only that row carries it. */
    creation?: Creation | undefined;
    /** What a customise row changes (`customise.ts`). Only those rows carry it. */
    change?: Change | undefined;
    /** The page the new page row makes or suggests (`new-page.ts`). Only that row carries it. */
    paging?: Paging | undefined;
    /** Set on the row a plain line makes, which is ranked after every match. */
    plain?: true | undefined;
    /** What Tell's rules read the line as (`tell-row.ts`): only that row carries it, and it is drawn first. */
    told?: TellOffer | undefined;
    /** How many rows of one title this line stands for, past the first. */
    folded?: number | undefined;
    /** The group a row was found in before it was drawn as the best match, so its count still says what it counts. */
    from?: string | undefined;
    /** The group a "Show all" row opens. */
    more?: string | undefined;
    /** Set on a "what it is" row wearing its project's own mark, which a page's glyph never covers. */
    marked?: true | undefined;
    /** Set on the row that goes back to the conversation with Slash where it was left. */
    resume?: true | undefined;
  };

  let el = $state<HTMLDialogElement>();
  let input = $state<HTMLInputElement>();
  let q = $state('');
  let cursor = $state(0);

  /**
   * THE RECORD, OR NOTHING OF ONE.
   *
   * The lists, their counts and the questions waiting come from the shell, which read them from `boot`. What `boot`
   * does not carry, the record's search, the rows changed last and the figures, is asked of the record through
   * `record/palette-live.ts`, loaded the first time a live palette needs it.
   *
   * WITH NO RECORD THE PALETTE IS ITS COMMANDS AND PAGES. It searched the studio's rows, listed its figures, its last
   * changes and its questions, and offered to add a row it then said was not saved; that went with the sample.
   * A refused shell has `live: true` (`layoutOf` sets it), so every branch below that was the sample's
   * had long been unreachable: a search there is the record's refusal, said under the box.
   */
  const shell = $derived(
    page.data as {
      live?: boolean;
      now?: number;
      index?: { registers?: (List & { views?: { href: string }[] })[] };
      /* `null` FOR A CALLER WHO MAY NOT BE TOLD WHAT ARRIVED, who has no Inbox to open on or hide. */
      inbox?: number | null;
      /* WHAT THE SPINE IS DRAWN FROM, so Inbox is offered to hide only while the nav draws it (`+layout.svelte`). */
      counts?: SpineCounts;
      open?: number;
      /* EVERY LIST, THE EMPTY ONES TOO, and who is asking: what the add row is offered on, and to whom (`create.ts`). */
      lists?: { id: string; name: string }[];
      me?: { level: string; lists: string[] | null; owner?: boolean; person?: string | null };
      /* THE SLUG OF EVERY PAGE `boot` LISTS, so a second page of one name lands beside the first (`new-page.ts`). */
      pages?: string[];
      questions?: { id: string; title: string }[];
      slash?: boolean;
    },
  );
  const isLive = $derived(shell.live === true);
  /** Whether a model is behind Slash on this host, which the shell asked `/api/version` once. A refused shell's never is. */
  const slashHere = $derived(isLive && shell.slash === true);

  /**
   * ASK: THE CONVERSATION WITH SLASH, in the same surface under the same field (`thread.svelte.ts`, `SlashThread.svelte`).
   *
   * THE FIELD IS THE FOLLOW-UP FIELD THERE, and keeps the caret: Enter sends what is typed, and with nothing typed Enter
   * does what the waiting card asks and Esc leaves it. A question reached from Find (its row, or Today's three) starts a
   * new conversation and Esc goes back to Find with the words as they were; ⌘J opens straight into the conversation where
   * it was left, and Esc there closes. ⌘K moves back to Find. The thread outlives the palette, so it can be reopened.
   * On a host with no model behind Slash there is no Ask, absent rather than refused, and ⌘J opens Find.
   */
  const inAsk = $derived(opener.mode === 'ask' && slashHere);
  /* WHAT FIND'S FIELD SAID WHEN A QUESTION LEFT IT FOR ASK, or `null` when Ask was opened straight. */
  let backTo = $state<string | null>(null);
  /* THE MODE THE PALETTE LAST DREW, so a move made from outside it (⌘K, ⌘J) is told from one made here. */
  let modeWas: 'find' | 'ask' = 'find';
  /**
   * WHERE FOCUS GOES BACK TO WHEN THE PALETTE IS PUT AWAY, rather than the page's body (audit 31 Oct A34): what held it as
   * the palette opened, or, opened by its key from nothing, the field it opens out of. Only when it is put away (Esc, the
   * scrim, Cancel): a row chosen goes somewhere, and the screen it lands on places focus itself.
   */
  let returnTo: HTMLElement | null = null;
  let dismissed = false;
  /**
   * WHETHER THE LAST THING DONE WAS A KEY (skills pass, 2 Nov). Opened or put away from the keyboard (⌘K, ⌘J, Esc, Enter
   * in Today's ask bar), the palette is there and gone at once, as a launcher is: it is the most used thing in the app and
   * a 240ms widening on every ⌘K read as the app being slow. Opened with the pointer or a thumb, it still widens out of the
   * field it was pressed in, which shows where it came from.
   */
  let byKey = false;
  const heardKey = (e: KeyboardEvent): void => {
    if (!e.repeat) byKey = true;
  };
  const heardPointer = (): void => {
    byKey = false;
  };
  const instantIf = (d: HTMLDialogElement): void => {
    if (byKey) d.dataset.instant = '';
    else delete d.dataset.instant;
  };
  function dismiss(): void {
    dismissed = true;
    open = false;
  }
  /* A BACK GESTURE PUTS THE SEARCH AWAY, as Escape does, rather than leaving the page under it (`ui/back.svelte.ts`). */
  backCloses(() => open, dismiss);
  function focusBack(): void {
    const to = returnTo;
    returnTo = null;
    if (!to || !to.isConnected || !to.checkVisibility()) return;
    const now = document.activeElement;
    if (now === null || now === document.body || el?.contains(now)) to.focus({ preventScroll: true });
  }
  let threadView = $state<ReturnType<typeof SlashThread> | null>(null);
  /** The page behind the palette, read each time it opens: what an ask is sent with and what the starters fit. */
  let behind = $state<PageContext>({ path: '/' });
  const unreached = (e: unknown) => ({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } });
  /* THE RECORD ON SCREEN, AT ITS OWN BASE. `page.url.origin` asked `/api/slash/*` at the bare host, which on the Cloud is
     no record at all: every ask from `/<slug>/…` went to the root and never reached the record it was typed on. */
  const client = () => import('@braindog/client').then(({ createClient }) => createClient({ base: apiBase() }));

  /**
   * WHO ASK TALKS TO (`$lib/send`): Slash, Quick or Deep, or a machine or a session running now, picked in the footer.
   * What is typed to a machine or a session is sent to it as an instruction with the page's row attached, and its answer
   * comes back on that row's strip and under Sent in the bell. The targets are read once Ask first opens; a host without
   * the door offers Slash alone.
   */
  let askTo = $state<{ to: 'slash'; mode: 'quick' | 'deep' } | { to: 'target'; t: Target }>({ to: 'slash', mode: 'quick' });
  let sendTargets = $state<Target[] | null>(null);
  let targetsAsked = false;
  /** THE ROWS ATTACHED WITH @, sent with every ask until they are taken off or the conversation starts again. */
  let attached = $state<Attached[]>([]);
  let attaching = $state(false);
  const switchable = $derived(sendTargets?.filter((t) => t.kind === 'mac' || t.kind === 'session') ?? []);
  const firstMac = $derived(sendTargets?.find((t) => t.kind === 'mac') ?? null);
  const askLabel = $derived(askTo.to === 'slash' ? `${sendWords.slash} · ${askTo.mode === 'deep' ? sendWords.deep : sendWords.quick}` : askTo.t.label);
  /** What every ask is about: the row behind the palette, then what was attached with @. */
  const attachNow = (): string[] => [...new Set([...(behind.row ? [behind.row] : []), ...attached.map((a) => a.ref)])];
  const lastTurn = $derived(convo.turns.at(-1));
  const routedMac = $derived(lastTurn?.role === 'slash' && !lastTurn.streaming && lastTurn.route === 'mac' && firstMac !== null);
  const harder = $derived(askTo.to === 'slash' && rethinkable());

  $effect(() => {
    if (!inAsk || targetsAsked) return;
    targetsAsked = true;
    /* WHERE TO SEND IS AN OWNER'S READ (`sendTargets`): a colleague asks Slash and is offered no machine (collab pass 3). */
    if (shell.me?.owner !== true) return void (sendTargets = []);
    void readTargets(apiBase()).then((got) => (sendTargets = got));
  });

  /* WHOSE SLASH THREADS THESE ARE: the person the shell names on this BrainDog, kept and listed under them alone. */
  $effect(() => {
    askingAs(threadsKey(apiBase(), shell.me?.person));
  });

  function asked(question: string) {
    if (askTo.to === 'target') return void toTarget(askTo.t, question);
    void askThread(question, behind, apiBase(), { mode: askTo.mode, attach: attachNow() });
  }

  /** A message to a machine or a session: sent, and said in the thread as one line with the way to its row. */
  async function toTarget(t: Target, said: string) {
    if (convo.busy) return;
    const { deliver } = await import('../send/convos.svelte.ts');
    const rows = attachNow();
    convo.turns.push({ role: 'you', text: said });
    const out = await deliver({ kind: behind.row?.split('#')[0] ?? 'page', target: t.id, label: t.label, targetKind: t.kind, mode: 'auto', note: said, fallback: said, attach: rows, mayChange: false });
    const row = rows.find((r) => /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u.test(r));
    convo.turns.push({
      role: 'slash',
      steps: [],
      text: out.ok ? sendWords.sentInPalette(out.label) : '',
      figures: {},
      actions: [],
      go: out.ok && row ? [{ href: `/r/${row.replace('#', '/')}`, label: sendWords.open }] : [],
      error: out.ok ? null : out.text,
      spent: false,
      streaming: false,
    });
  }

  /** Slash could not answer Deep here and named a machine: the same question, sent to it. */
  function toMac() {
    const t = firstMac;
    const question = [...convo.turns].reverse().find((x) => x.role === 'you')?.text;
    if (!t || !question) return;
    askTo = { to: 'target', t };
    void toTarget(t, question);
  }

  /** @ IN THE FIELD, typed as a word of its own, opens the row search to attach one; the @ itself is not kept. */
  function onaskinput() {
    if (/(^|\s)@$/u.test(q)) {
      q = q.slice(0, -1);
      attaching = true;
    }
  }

  function attachOne(a: Attached) {
    if (!attached.some((x) => x.ref === a.ref)) attached = [...attached, a];
    attaching = false;
    input?.focus();
  }

  /** A question from Find: a new conversation, asked at once, with the field cleared for the next one. */
  function askSlash(question: string) {
    backTo = q;
    modeWas = 'ask';
    opener.mode = 'ask';
    clearThread();
    q = '';
    asked(question);
    queueMicrotask(() => input?.focus());
  }

  /** The follow-up field, sent. */
  function send() {
    const said = q.trim();
    if (said === '' || convo.busy) return;
    q = '';
    asked(said);
  }

  /** Back to Find, with what its field said before the question. */
  function toFind() {
    modeWas = 'find';
    opener.mode = 'find';
    q = backTo ?? '';
    backTo = null;
    cursor = 0;
    input?.focus();
  }

  /** The conversation where it was left, from Find's "Continue" row. */
  function toAsk() {
    backTo = q;
    modeWas = 'ask';
    opener.mode = 'ask';
    q = '';
    input?.focus();
  }

  function fresh() {
    clearThread();
    attached = [];
    attaching = false;
    q = '';
    input?.focus();
  }

  /* A MOVE MADE FROM OUTSIDE (⌘K to Find, ⌘J to Ask) while the palette is open: the field starts empty in the new mode. */
  $effect(() => {
    const mode = opener.mode;
    if (!open) return;
    untrack(() => {
      if (mode === modeWas) return;
      modeWas = mode;
      backTo = null;
      q = '';
      cursor = 0;
      queueMicrotask(() => input?.focus());
    });
  });

  /* A THREAD NAMED FROM OUTSIDE (the Slash page's list), read back to go on with it. */
  $effect(() => {
    const id = opener.thread;
    if (!open || id === null) return;
    untrack(() => {
      opener.thread = null;
      void threadOn(id, apiBase()).then((ok) => {
        if (!ok) toasts.push(threadWords.gone, { intent: 'warn' });
      });
    });
  });

  /**
   * THE WARM-UP, AND THE ONE NUMBER IT BRINGS BACK (`46 §5.2`, `23 §8`). Opening the palette on a host with a model asks
   * `slashStatus()` once, which builds the engine so the first question finds it built, and answers this month's asks, which
   * is all the 80 % line needs. A refused status is not drawn here: Settings shows it, and a palette opened to go somewhere
   * else is the wrong place for it.
   */
  let slashStatus = $state<SlashStatus | null>(null);
  const CAP_LINE_KEY = 'braindog.palette.slashCapLine';
  /* PER BROWSER, AND ALLOWED TO BE LOST. A private window forgets it and shows the line once more that month, which is the
     cheap way to be wrong; storage that throws is treated the same as storage that is empty. */
  let capDismissed = $state<string | null>(null);
  const capShown = $derived(slashHere && slashStatus !== null && capLine(slashStatus, capDismissed));
  /* THE ASKS LEFT, said quietly under the conversation: what the last answer said, else this month's count where it is
     capped. A key of one's own is not counted, so nothing is said there. */
  const asksLeft = $derived.by((): number | null => {
    if (convo.left !== null) return convo.left;
    const a = slashStatus?.asks;
    return a && a.capped !== false && a.cap > 0 ? Math.max(0, a.cap - a.used) : null;
  });
  /* WHETHER A CARD IN THE THREAD WAITS ON ENTER, read off the thread as it changes. */
  const waitingCard = $derived(inAsk && threadView !== null && threadView.waiting());
  function warm() {
    try {
      capDismissed = localStorage.getItem(CAP_LINE_KEY);
    } catch {
      capDismissed = null;
    }
    void client()
      .then((c) => c.slashStatus())
      .then(
        (out) => {
          if (out.ok) slashStatus = out.value;
        },
        () => {},
      );
  }
  function dismissCapLine() {
    if (!slashStatus) return;
    capDismissed = slashStatus.asks.resets;
    try {
      localStorage.setItem(CAP_LINE_KEY, capDismissed);
    } catch {
      /* The line is hidden for this open either way; only next time's memory of it is lost. */
    }
    input?.focus();
  }
  const lists = $derived<List[]>(isLive ? [...(shell.index?.registers ?? [])] : []);
  const listNamed = $derived(new Map(lists.map((l) => [l.id, l])));
  /** One of a list, in its own noun: `Invoices` gives "Invoice", the detail under an address typed as `invoices/12`.
      Its letters as the list spells them, so `HSBC accounts` is "HSBC account" and not "Hsbc account". */
  const oneOf = (name: string) => name.replace(/ies$/u, 'y').replace(/([^sS])s$/u, '$1').replace(/^./u, (c) => c.toUpperCase());
  /* NOT THE RAIL'S LISTS, which leave out an empty one, and none at all for a caller the record would refuse the press,
     or where no record answered. */
  const addLists = $derived(isLive ? offered(shell) : []);
  const addNamed = $derived(new Map(addLists.map((l) => [l.id, l.name])));

  /**
   * THE LIST A PLAIN LINE GOES INTO: the one the record's Home page captures into, its first `capture` block.
   * The Home page is the one `Home.svelte` draws: the speaking use case's or the record's own `home` page, read from the
   * record, else Today's body built from what the shell says the record holds. Never a list named here, so a record
   * whose Home captures into Orders is offered "Add as an order", and one whose Home has no capture is offered nothing.
   * Read once for each record and Home the palette opens on, and only where somebody may add to it (`offered`).
   */
  let intoId = $state<string | null>(null);
  let intoFor = '';
  const into = $derived.by<Into | null>(() => {
    const name = intoId === null ? undefined : addNamed.get(intoId);
    if (intoId === null || name === undefined) return null;
    const decl = REGISTERS[intoId];
    return { register: intoId, name, one: decl ? relabel(decl, heardLabels()).one : singularOf(name) };
  });
  async function captureList(slug: string | null): Promise<string | null> {
    if (slug === null) {
      if (!shell.lists || !shell.pages || !shell.me) return null;
      const [{ todayHome }, { holdsOf }] = await Promise.all([import('../home/default-home.ts'), import('../page/home-arrange.ts')]);
      return homeCapture(todayHome(holdsOf(shell as unknown as Pick<Shell, 'lists' | 'pages' | 'me'>)).blocks);
    }
    const { pagesReader } = await import('../record/pages-live.ts');
    const one = await pagesReader(apiBase(page.url)).readOne(slug);
    return one.from === 'live' ? homeCapture(one.page.body.blocks) : null;
  }
  $effect(() => {
    if (!open || !isLive) return;
    /* THE PAGE HOME DRAWS: a page kept by hand, else the desk, and never a use case's own Home page. */
    const slug = homeSlugOf(null, shell.pages ?? []);
    const key = `${apiBase(page.url)} ${slug ?? ''} ${addLists.map((l) => l.id).join(',')}`;
    if (key === intoFor) return;
    intoFor = key;
    void captureList(slug).then(
      (id) => intoFor === key && (intoId = id),
      () => {
        if (intoFor === key) (intoFor = ''), (intoId = null);
      },
    );
  });
  /** Who may ask for a page: the owner makes one, anybody else on the record suggests one, and with no record nobody. */
  const pageWho = $derived(whoOf(shell));

  /**
   * WHAT A CUSTOMISE ROW CAN NAME (`customise.ts`): the app's own screens, the nav's pages under the names this person
   * gave them, and the lists. Only a page the nav draws can be hidden or renamed in it, as Settings › Navigation holds,
   * so not a tabbed page past the rail's budget (`cut`); Inbox can be hidden too, but only once the spine draws it
   * (`spineOf`), since before anything arrives there is nothing to take away. A page made for each row of a list is left
   * to its list, as the nav leaves it.
   */
  const places = $derived.by((): Place[] => {
    const views = new Set((shell.index?.registers ?? []).flatMap((r) => (r.views ?? []).map((v) => v.href)));
    const screen = (href: string, name: string, icon: IconName, hide = false): Place => ({ href, name, own: name, icon, hide, rename: false });
    return [
      screen('/', copy.today, 'today'),
      screen('/decide', voiced('decide'), 'decide'),
      ...(typeof shell.inbox === 'number'
        ? [screen('/inbox', voiced('inbox'), 'inbox', spineOf(shell.counts ?? { decide: shell.open ?? 0, inbox: shell.inbox }).includes('inbox'))]
        : []),
      screen('/audit', copy.audit, 'activity'),
      ...nav
        .filter((e) => !e.row)
        .map((e): Place => {
          const mine = !views.has(e.href) && !(e as { cut?: true }).cut;
          return { href: e.href, name: mine ? navPrefs.labelOf(e.href, e.title) : e.title, own: e.title, icon: e.icon, hide: mine, rename: mine };
        }),
      ...lists.map((l) => ({ ...screen(`/r/${l.id}`, l.name, l.icon), list: l.id })),
    ];
  });
  /** How it looks on this device and whether the screen behind has a page menu, read each time the palette opens. */
  let look = $state<Look>({});
  let pageHere = $state(false);
  /* WHERE A LOOK ROW'S CHANGE WOULD BE KEPT, read with the look each time the palette opens. */
  let lookKept = $state<'record' | 'pending' | 'device'>('device');

  /* AT THE RECORD'S OWN BASE, as Slash's asks are: at the bare origin its lists' declarations and figures were a second
     set of asks beside the screen's own (`/api/schema` and `/<slug>/api/schema` both, 23 Oct). One reader a base. */
  let reading: { base: string; reader: Promise<Reader> } | null = null;
  const reader = (): Promise<Reader> => {
    const base = apiBase();
    if (reading?.base !== base) reading = { base, reader: import('../record/palette-live.ts').then((m) => m.paletteReader(base)) };
    return reading.reader;
  };

  /**
   * THE RECORD'S HITS, FOR THE TEXT THEY ANSWER, and never for any other.
   *
   * A live search is a request, so the list is drawn from `found` only while `found.text` is what the box says. Typing
   * on past it hides the old hits at once, and `latest` drops the answer to any question the box has moved on from, so
   * a slow reply to `fen` can never land over `fenwick`.
   */
  let found = $state<{ text: string; hits: Hits } | null>(null);
  const asking = latest((text: string) => reader().then((r) => r.find(text, RECORD_CAP)), 120);

  /**
   * WHAT THE NAME IN THE BOX IS, FOR THE NAME IT ANSWERS (`about.ts`): the record's `about` read, asked once the
   * typing rests and kept only while the box still says that name. A refusal and an answer of nothing draw the same
   * thing, which is nothing: the search below is what says when nothing matched.
   */
  let known = $state<{ name: string; answer: About } | null>(null);
  const aboutAsk = latest(
    (name: string) =>
      client()
        .then((c) => c.about({ name }))
        .catch(unreached),
    ABOUT_WAIT,
  );

  /** The rows changed last and the figures, read once each time a live palette opens. */
  let extra = $state<{ recent: Recent[]; figures: Metric[] } | null>(null);
  /** The places opened last on this device (`opened.ts`), read each time the palette opens. */
  let openedList = $state<Opened[]>([]);
  $effect(() => {
    if (open) openedList = openedHere();
  });

  /** Which register `@` narrows to. Named once, so the filter and the overflow row's door cannot drift. */
  const PEOPLE = 'people';

  /**
   * The three headings this file needs that `copy.ts` does not hold.
   *
   * A figure is not a page and not a row, and the record's own word for one is the word the money
   * page prints over them. `OPEN_QUESTION` is the same sentence `search()` puts on a decision, so
   * a question found by typing and a question listed with nothing typed read identically.
   *
   * `RECENT` says CHANGED rather than visited, because the ledger it is read from is a record of
   * writes and this build stores nothing at all about where a person has been. A heading promising
   * the second and delivering the first is one somebody would notice within a day.
   */
  /** The phone's way out of the whole-screen palette, said as a word. */
  const words = { cancel: 'Cancel' } as const;
  /** What a photo shared from another app says, under the field. */
  const shareWords = {
    photo: (name: string) => (name === '' ? 'Shared photo' : `Shared photo, ${name}`),
    line: (n: number) => (n === 1 ? 'The photo goes with what you add, into a list that keeps a file.' : `The first of ${n} photos goes with what you add, into a list that keeps a file.`),
    remove: 'Take the photo off',
    notKept: (list: string) => `Added, without the photo: ${list} keeps no file, or the photo could not be sent.`,
  } as const;
  const FIGURES = 'Figures';
  const OPEN_QUESTION = 'Open question';
  const RECENT = 'Recent';
  /* THE EMPTY PALETTE'S THREE ASKS, over everything else. */
  const ASK_TODAY = 'Ask';
  /* THE PLACES WITH NOTHING TYPED, under the destinations' own heading, so one heading never means two groups. */
  const GO_TO = copy.destinations;
  const BEST = 'Best match';
  /** The most rows a group shows before its "Show all" row. */
  const GROUP_CAP = 6;
  const showAll = (n: number): string => `Show all ${n.toLocaleString('en')}`;

  /**
   * WHAT ORDER THE GROUPS COME IN, and the commands used to be second in it.
   *
   * It was records, commands, destinations, pages, figures, decisions, and everything the record
   * answers with underneath all of them. The argument was `19 §7`'s rule that strict-prefix aliases
   * outrank fuzzy matching, and that rule is about two commands standing beside each other: it was
   * being used to rank a command above a row. Typing four letters of the obligation on the screen
   * behind the panel drew every command, page and figure that matched first, and the row itself
   * under all of them. That is a menu of screens with the answer at the bottom of it.
   *
   * The palette wants the other shape: a panel that reaches the OBJECTS the
   * record holds, with the commands as the section underneath. So an exact spoken id comes first,
   * because it is the one thing somebody heard said out loud; then the record's own lists; then
   * what is waiting on you; then the figures; then the screens; and the commands last. The
   * strict-prefix rule is untouched and still decides the order INSIDE the commands group, which is
   * the pair of rows it was written about.
   *
   * A HEADING THIS FILE DID NOT WRITE IS A REGISTER'S NAME. `search()` heads each group with the
   * list it came out of, and those names are data rather than copy, so they are recognised rather
   * than listed here. Anything else falls in with the pages, which is where a reader would look for
   * a heading nobody has ranked.
   *
   * `search()` USED TO HEAD ITS PAGE GROUP `Pages` while the rail, the sheet and this table all say
   * `Pages and lists`, so one thing had two names across two files and the rank below was reached by
   * a fallback rather than by the key that is sitting right there. It says `copy.pages` now.
   */
  const RANK: Record<string, number> = {
    /* THE ADD ROW ABOVE EVERYTHING, because it is drawn only for a whole sentence of intent, `Add to Tasks: buy milk`,
       and a sentence that names its list and its title is not a query about anything else in the record. Under the
       rows it would be the row a reader typed out in full and then had to arrow down to. */
    [createWords.group]: -1,
    /* AND THE CUSTOMISE ROWS WITH IT, for the same reason: "dark" or "hide inbox" is a thing to do, typed out. */
    [copy.customise.group]: -1,
    [BEST]: -0.5,
    [ASK_TODAY]: -3,
    [copy.records]: 0,
    /* WHAT THE NAME IS, OVER THE LISTS THAT HOLD THE WORD: the one thing meant comes before every row that mentions it. */
    [aboutWords.group]: 0.5,
    [RECENT]: 2,
    [copy.decide]: 3,
    [FIGURES]: 4,
    [copy.pages]: 5,
    [copy.destinations]: 6,
    [copy.commands]: 7,
  };
  const REGISTER_NAMES = $derived(new Set([...Object.values(REGISTERS).map((r) => r.name), ...lists.map((l) => l.name)]));
  const rankOf = (group: string): number => RANK[group] ?? (REGISTER_NAMES.has(group) ? 1 : 5);

  /**
   * HOW MANY ROWS THE PALETTE DRAWS, and the cut is there because a palette that draws the whole
   * record is a register in a costume. Past it, the overflow row is the door to `/search`, which
   * keeps each list whole with its own count.
   */
  const CAP = 60;

  /**
   * AND HOW MANY OF THEM THE RECORD GETS, which used to be twelve.
   *
   * `search()`'s own default is twenty-four: the round-robin hands one hit per source per round, so
   * across nine sources a smaller budget is frequently one row per list, which is the defect the
   * rotation was added to fix showing up again at the cap.
   */
  const RECORD_CAP = 24;

  /**
   * WHAT IS WAITING ON YOU, capped.
   *
   * A decision with nothing typed is the one thing in the record that is about today, so the
   * palette opens on it. It is a cut and not the whole queue because a queue longer than the
   * palette is a screen: `/decide` is the door, and it is one row up in this same list.
   */
  const OPEN_CAP = 6;

  /**
   * AND HOW MANY OF THE LEDGER'S ROWS, which is the shortest list in the panel on purpose.
   *
   * Five, because this is the one source whose value falls off a cliff: the row you changed last is
   * worth a press and the eleventh one back is a row you would type the name of. `/audit` holds the
   * rest of the ledger and is one row up in this same list.
   */
  const RECENT_CAP = 5;

  /** 34 §4's two regexes: a prefixed spoken id, and `register#seq`. `#125` is plain text. */
  const SPOKEN = /^([A-Z]{1,3})(\d+)$/;
  const QUALIFIED = /^([a-z][a-z0-9_]*)#(\d+)$/;

  const parsed = $derived.by(() => {
    const raw = q.trim();
    const prefix = ['>', '#', '@', '/'].includes(raw[0] ?? '') ? raw[0]! : null;
    return { prefix, text: prefix ? raw.slice(1).trim() : raw };
  });

  /**
   * What the standing rule is asked about, read live.
   *
   * `toasts.items` is state, so this recomputes the moment an offer to undo arrives or expires and
   * the row appears and goes with it. That is the whole mechanism: nothing is disabled, the list is
   * simply built again.
   */
  const live = $derived({
    undoable: toasts.items.some((t) => t.undo !== undefined),
    /* THE ROW THE QUERY WOULD ADD, in the modes that draw commands. Only a list this build can title a row in, and this
       caller may add to, is offered, which is `offered`; any other name leaves the sentence as a query like any other. */
    creation: parsed.prefix === null || parsed.prefix === '>' ? creation(parsed.text, addLists) : null,
    /* THE CHANGES THE QUERY NAMES, in the same modes, and none with nothing typed: an empty palette is as it was. */
    customise:
      parsed.prefix === null || parsed.prefix === '>'
        ? customise(parsed.text, { look, places, hidden: navPrefs.hidden, home: navPrefs.home, pageMenu: pageHere, kept: lookKept, here: places.find((p) => p.list !== undefined && page.url.pathname.endsWith(p.href)) })
        : [],
    /* THE PAGE THE QUERY WOULD MAKE, in the same modes: found by its words with no name yet, a sentence once it has one. */
    page: parsed.prefix === null || parsed.prefix === '>' ? paging(parsed.text, pageWho) : null,
    /* THE MONEY ROWS, while the record keeps a ledger and a page that can open the sheet is drawn (`create.ts`). */
    ledger: quick.ready,
  });

  /**
   * THE PLAIN LINE'S ROW, read with its chips: "call the bank tomorrow" is "call the bank", due tomorrow.
   *
   * `held` ARE THE CHIPS TAKEN OUT OF THE FIELD: a `#project`, a `!priority`, an `@name` or an amount leaves the box as a
   * chip when a space follows it. A day stays in the box until the press, because a day is read only at the end and
   * "Write the Monday newsletter" keeps its Monday. `given` are the words Backspace gave back, which stay words.
   */
  let held = $state<Chip[]>([]);
  let given = $state<string[]>([]);
  const plainLine = $derived(
    parsed.prefix === null && live.creation === null ? plainAdd(held.reduce((line, chip) => untoken(line, chip), parsed.text), into) : null,
  );
  const plainRead = $derived.by(() => {
    const decl = plainLine ? REGISTERS[plainLine.register] : undefined;
    return decl ? lineTokens(parsed.text, { decl, now: Date.now() }, given) : null;
  });
  const plainMade = $derived<Plain | null>(plainLine && plainRead ? { ...plainLine, title: plainRead.text, chips: [...held, ...plainRead.chips] } : null);

  /* TELL'S READING OF THE LINE (T27): its rules and the lists' declarations come with the first line typed, and the line
     is read again once they are in (`tellReady`). Offered first where it places the line beyond the plain add. */
  let tellReady = $state(0);
  let tellWarm = false;
  $effect(() => {
    if (tellWarm || !isLive || parsed.prefix !== null || parsed.text.trim() === '') return;
    tellWarm = true;
    warmTell(shell as unknown as TellShell, () => (tellReady += 1));
  });
  const tellOffers = $derived.by<TellOffer[]>(() => {
    void tellReady;
    if (!isLive || parsed.prefix !== null || live.creation !== null || held.length > 0) return [];
    return offersFor(parsed.text, shell as unknown as TellShell, plainLine?.register ?? into?.register ?? null);
  });

  /** A space after a tag takes it out of the field as a chip; the words left are the field. */
  function oninput() {
    moved = false;
    const read = plainRead;
    if (!read || !/\s$/u.test(q)) return;
    const out = read.chips.filter((c) => c.kind !== 'day');
    if (out.length === 0) return;
    held = [...held, ...out];
    q = `${lineTokens(parsed.text, { decl: REGISTERS[plainLine!.register]!, now: Date.now() }, [...given, ...read.chips.filter((c) => c.kind === 'day').map((c) => c.words)]).text} `;
  }

  /**
   * A SENTENCE TYPED WITH NO MODEL BEHIND THE ASK (audit 31 Oct g, AG5): three words or a question mark, no prefix. It is
   * told that asking needs a model, with the way to connect one, and Enter does not take the first loose hit for it.
   */
  const askless = $derived(!slashHere && parsed.prefix === null && asksFirst(parsed.text));
  /** Whether the arrows or the pointer picked a row since the last keystroke, so Enter runs what was chosen. */
  let moved = $state(false);
  /** A row Enter does not run for a sentence with no model until it is picked: any but a command or the add line. */
  const looseFor = (r: Row): boolean => askless && !moved && r.plain !== true && r.told === undefined && r.group !== copy.commands;

  /** Whether this query is one the record's search answers: `#`, `@` or no prefix, and two characters or more. */
  const searching = $derived((parsed.prefix === null || parsed.prefix === '#' || parsed.prefix === '@') && parsed.text.length > 1);

  /**
   * What the search answered for the text in the box, or `null` while the record has not answered it yet, and always
   * with no record to ask.
   */
  const hits = $derived.by((): Hits | null => {
    if (!searching || !isLive) return null;
    return found?.text === parsed.text ? found.hits : null;
  });

  /** The name the record is asked about, or `null`: never with no record, and never a sentence the palette acts on. */
  const aboutName = $derived(isLive ? asksAbout({ prefix: parsed.prefix, text: parsed.text, acting: live.creation !== null || live.page !== null }) : null);
  /** What it is, as rows, only while the answer is for the name in the box. */
  /**
   * A PROJECT WEARS ITS OWN MARK, the glyph the rail draws beside it (recheck of 30 October, 37): the kind's glyph stood
   * for every project and was Marlow & Co's own. Read from the rail's kept read, so nothing more is asked of the record.
   */
  const markOf = (href: string | null): IconName | null => {
    const m = href === null ? null : /^\/r\/([^/]+)\/(\d+)$/u.exec(href);
    if (m === null) return null;
    const side = keptRead(apiBase());
    if (side === null || side.list !== decodeURIComponent(m[1]!)) return null;
    const mark = side.rows.find((r) => r.seq === Number(m[2]))?.mark ?? '';
    return mark.length > 1 && isGlyph(mark) ? (mark as IconName) : null;
  };
  const aboutShown = $derived(
    (known !== null && known.name === aboutName ? aboutRows(known.answer, known.name, shell.now ?? Date.now()) : []).map((r) => {
      const mark = markOf(r.href);
      return mark === null ? r : { ...r, icon: mark, marked: true as const };
    }),
  );

  $effect(() => {
    const name = aboutName;
    if (!open || name === null) {
      aboutAsk.cancel();
      return;
    }
    /* ALREADY ANSWERED: typing on and back to the same name asks nothing twice. */
    if (untrack(() => known?.name) === name) return;
    aboutAsk.ask(name, (out) => {
      if (out.ok) known = { name, answer: out.value };
    });
    return () => aboutAsk.cancel();
  });

  /** A live query the record has not answered yet. The panel stays quiet rather than saying nothing matched. */
  const pending = $derived(searching && isLive && hits === null);

  $effect(() => {
    if (!open || !isLive || !searching) {
      asking.cancel();
      return;
    }
    const text = parsed.text;
    asking.ask(text, (answer) => (found = { text, hits: answer }));
    return () => asking.cancel();
  });

  $effect(() => {
    if (!open || !isLive) return;
    let gone = false;
    const known = lists;
    reader()
      /* NOT THE ROWS ANYONE CHANGED LAST: on his record that was an import's rows. Recent is what he opened. */
      .then((r) => r.figures(known))
      .then(
        (figures) => {
          if (!gone) extra = { recent: [], figures };
        },
        () => {},
      );
    return () => {
      gone = true;
    };
  });

  /**
   * How many rows the record matched, beside how many of them are drawn.
   *
   * BOTH NUMBERS USED TO BE THE WRONG ONES. The numerator was `flat.length`, every row in the list,
   * command rows and register destinations and the overflow row itself, so `ren` announced *14 of
   * 484* over twelve record hits. The denominator ignored the prefix, so `@ha` announced *2 of 5*:
   * the `@` filter had narrowed the list to people and the total still counted the rows it had just
   * excluded. The honest answer there is *2 of 2*.
   *
   * Set inside `rows` so one search runs per keystroke rather than two.
   */
  let total = 0;
  let drawn = 0;

  const rows = $derived.by((): Row[] => {
    const { prefix, text } = parsed;
    total = 0;
    drawn = 0;
    const needle = text.toLowerCase();
    /* WHAT THE NAME IS, FIRST INTO THE LIST so the cap below never cuts it, and its place on screen is its group's rank. */
    const about = aboutShown;
    const aboutAt = new Set(about.flatMap((r) => r.href ?? []));
    /**
     * ONE QUERY MEANS ONE THING IN THIS PANEL, and four groups still disagreed.
     *
     * The records group is prefix-on-token; commands, pages, saved views and registers were
     * `.toLowerCase().includes(needle)`. So in one list: `ate` found *Updates*, `enew` found
     * *Renewals*, `ing` found *Settings* and *Lapsing*, and none of those would have found a row.
     * `api.ts`'s own comment argues the questions group had to converge because *"a query that means
     * one thing in eight groups and another in the ninth is a query nobody can reason about"*, which
     * is exactly as true of four groups in one list.
     *
     * `19 §7`'s rule is STRICT PREFIX for commands and destinations, so this is also what that
     * section asks for: Raycast's rule, and the only mechanism found that keeps a growing action
     * index from rotting.
     */
    const starts = (title: string) => {
      const want = terms(text);
      /**
       * A FILTER BOX AND A SEARCH BOX MEAN OPPOSITE THINGS BY A QUERY THAT TOKENISES TO NOTHING.
       *
       * `answers()` returns `true` for it, and that is right for the box on a register: no query is
       * no filter, and a cleared box shows the list. Here it meant that typing `?` or `-` or `.`,
       * one character, no letters, no digits, matched every command, every page, every saved view
       * and every register, and the panel filled with rows announcing a number.
       *
       * The difference is whether anything was TYPED. Nothing typed is the default list, which is
       * what a freshly opened palette should show. Something typed that cannot be a query matched
       * nothing, and saying so is the honest answer, the same answer the record would give.
       */
      if (!want) return text.trim() === '';
      const has = tokensOf(title);
      return want.every((w) => has.some((tok) => tok.startsWith(w)));
    };
    const out: Row[] = [...about];
    /* NOTHING TYPED IS THREE ASKS AND WHERE HE WAS: asked of the record when a model is behind the ask, else
       the place that answers each; then the places opened last on this device. "Go to" repeats the bar, so it is drawn
       only on a device that has opened nothing yet. Commands, pages, lists, figures and questions wait for a word. */
    const blank = prefix === null && text.trim() === '';
    /* THE CONVERSATION GOES ON FROM HERE: its first question, one press back into it. */
    const opening = convo.turns.find((t) => t.role === 'you')?.text;
    if (blank && opening !== undefined)
      out.push({ id: 'resume', title: threadWords.resume(opening), href: null, group: ASK_TODAY, icon: 'ask', resume: true });
    /* ONLY WITH A MODEL BEHIND THE ASK (audit 31 Oct g, AG5): without one the three were questions nobody answers, and as
       places they were Go to's own rows a second time ("Needs you" twice). */
    if (blank && slashHere)
      for (const [i, asked] of questionsOf(slashHere, (page.data as { pages?: readonly string[] } | undefined)?.pages).entries())
        out.push({ id: `a-${i}`, title: asked.title, href: asked.href, group: ASK_TODAY, icon: 'search', ...(asked.ask === null ? {} : { ask: asked.ask }) });
    /* OPENED ON THIS DEVICE, SO TOLD BY THIS DEVICE'S CLOCK: the record's could be behind it, and said "in 8w". */
    if (blank)
      for (const place of openedList)
        out.push({ id: `o-${place.href}`, title: place.title, detail: since(new Date(place.at).toISOString(), Date.now()), href: place.href, group: RECENT, icon: 'arrow', complete: place.title });
    if (blank && openedList.length === 0)
      for (const place of goPlaces)
        out.push({ id: `g-${place.key}`, title: place.label, href: place.href, group: GO_TO, icon: place.icon as IconName, complete: place.label });

    // Exact spoken id first, always. It is the string a person heard out loud.
    // AND THE LINE UNDER IT SAID SO. `spoken id` is what this repository calls the convention among
    // itself; the reader has just typed one, which is the whole proof they did not need the term.
    // The literal lived here rather than in `copy.ts`, which is why no rename had ever reached it.
    const spoken = SPOKEN.exec(text.toUpperCase());
    const qualified = QUALIFIED.exec(text);
    if (spoken) out.push({ id: 'spoken', title: text.toUpperCase(), detail: copy.openById, href: `/${text.toUpperCase()}`, group: copy.records, icon: 'arrow' });
    if (qualified) out.push({ id: 'qualified', title: text, detail: oneOf(listNamed.get(qualified[1]!)?.name ?? listName(qualified[1]!)), href: `/r/${qualified[1]}/${qualified[2]}`, group: copy.records, icon: 'arrow' });

    // Strict-prefix aliases outrank fuzzy matching. It is the only verified mechanism found that
    // keeps a growing action index from rotting (19 §7).
    if ((prefix === null && !blank) || prefix === '>') {
      /* THE FIFTH RULE IN A SURFACE SAID TO HAVE ONE. `19 §7`'s strict-prefix aliases outrank fuzzy
         matching, and that is about ORDER rather than about membership: `ranked()` in `admit.ts` scores each
         command against what was typed (the whole title, its start, every word's start, then an alias) and
         orders them best first within each group.

         `commands(live)` and never `COMMANDS`: the admission rule and the standing rule are both
         applied in there, so no row this file draws can have skipped them. */
      const every = commands(live);
      const admitted = every.filter((c) => c.act !== 'add' && c.act !== 'customise' && c.act !== 'page');
      /* THE ADD ROW IS NOT FOUND BY ITS TITLE, it is made out of the query. `commands(live)` holds it only while
         `live.creation` does, so asking for it is asking the standing rule, and it is drawn as the sentence it will
         write rather than as its declaration's name. No `complete`: the box already says exactly what `⇥` would.
         IT IS A PLACE TO SLASH'S ROW, and so no question is offered under it, because a sentence that names a list
         and a title is a thing to write rather than a thing to ask about. */
      const adding = every.find((c) => c.act === 'add');
      if (adding && live.creation) {
        const made = live.creation;
        const list = addNamed.get(made.register) ?? listName(made.register);
        out.push({ id: adding.id, title: createWords.row(list, made.title), href: null, group: createWords.group, icon: adding.icon, act: adding.act, creation: made });
      }
      /* THE CUSTOMISE ROWS, drawn as the sentences the query makes and only while it makes one, for the add row's
         reason: `commands(live)` holds their declaration only while `live.customise` has a row in it. */
      const changing = every.find((c) => c.act === 'customise');
      if (changing && !live.creation)
        for (const o of live.customise ?? [])
          out.push({ id: o.id, title: o.title, detail: o.detail, href: null, group: changing.group, icon: o.icon, act: changing.act, change: o.change, complete: o.complete });
      /* THE NEW PAGE ROW, drawn as `new-page.ts` reads the query. THE SENTENCE GOES ABOVE EVERYTHING, with the
         add row and for its reason; found only by its words it sits among the commands, after them (below). With no
         name yet a press writes the sentence into the box, so `⇥` does the same. */
      const paged = every.find((c) => c.act === 'page');
      const pageRowOf = (group: string): Row | null =>
        paged && live.page ? { id: paged.id, title: pageRow(live.page), href: null, group, icon: paged.icon, act: paged.act, paging: live.page, ...(live.page.title === '' ? { complete: FILL } : {}) } : null;
      const pageSaid = pageAsked(text);
      const pageFirst = pageSaid ? pageRowOf(createWords.group) : null;
      if (pageFirst) out.push(pageFirst);
      const scored = ranked(admitted, needle);
      out.push(
        ...scored.map((c) => ({
          id: c.id,
          title: c.title,
          href: c.href,
          group: c.group,
          icon: c.icon,
          act: c.act,
          binding: c.binding,
          complete: c.title,
        })),
      );
      const pageFound = pageSaid ? null : pageRowOf(paged?.group ?? copy.commands);
      if (pageFound) out.push(pageFound);
    }
    /* ADD A WIDGET, and the one Slash would add with its reason, for "add", "widget" or "/w" (`board/palette-rows.ts`). */
    if (isLive) for (const w of widgetRows(q, todayOffer.offer, at('/'))) out.push({ ...w, group: copy.commands });

    if ((prefix === null && !blank) || prefix === '/') {
      /* EVERY ROW WEARS ITS OWN GLYPH. The commands each carried a real one and then every other row
         in the palette fell back to the same arrow, which is the one surface where a person is
         scanning a mixed list at speed and the glyph is the only thing separating a page from a list
         from a row. Both declarations already name an icon; the rail has been drawing them all
         along and this was throwing them away. */
      for (const entry of nav)
        if (starts(entry.title))
          out.push({ id: `p-${entry.id}`, title: entry.title, detail: `${entry.section} page`, href: entry.href, group: copy.pages, icon: entry.icon, complete: entry.title });
      /* THE SAVED VIEWS ARE PAGES ON A RECORD, and the loop over `nav` above has already listed them. A loop here built
         rows from `savedViews`, whose record half names no list, so every one was skipped: only the sample's views were
         ever drawn by it, and it went with the sample. */
      for (const r of lists)
        if (starts(r.name))
          /* The count, not a definition of the word "register". A row that explains the app's own
             vocabulary is a row nobody needed, and it was doing it in every search. */
          out.push({ id: `r-${r.id}`, title: r.name, detail: r.count === 1 ? '1 item' : `${r.count.toLocaleString('en')} items`, href: `/r/${r.id}`, group: copy.pages, icon: r.icon, complete: r.name });
    }

    /**
     * THE FIGURES, WHICH ARE OBJECTS AND WERE REACHABLE FROM NO SEARCH AT ALL.
     *
     * Six of them are declared, each with a target and a window, and the only way to any of them
     * was to know which page it was a tile on. They are the shortest answer in the record: the row
     * carries the name, the reading and the target, so *Overdue to pay · GBP 10,540.00 · should be
     * nothing* is a question answered without opening anything.
     *
     * AND THE STANDING RULE DECIDES WHICH ONES. `isTemplate` is admission test 1 applied to a
     * declaration: `thing is {{it}}` needs a project chosen before the figure means anything, so
     * the three project tiles are not rows here. `unreadable` is the same rule one step on, a
     * declaration this build cannot evaluate. Neither is greyed out, and neither prints the record's
     * missing-value dash on a surface somebody is scanning at speed.
     */
    if (((prefix === null && !blank) || prefix === '/') && isLive && text.trim() !== '') {
      for (const read of extra?.figures ?? [])
        if (starts(read.label) && read.href)
          out.push({ id: `m-${read.id}`, title: read.label, value: read.value, detail: read.note, tone: read.tone, href: read.href, group: FIGURES, icon: 'observe', complete: read.label });
    }

    /**
     * THE ROWS YOU CHANGED LAST, WHICH THIS PANEL COULD NOT REACH WITHOUT BEING TOLD THEIR NAMES.
     *
     * An open palette listed the commands, the pages, the saved views, the registers, the figures
     * and the questions, and not one row of the record. To get back to the obligation you edited ten
     * minutes ago you had to remember what it was called and type it, which is the whole failure
     * of a surface that reaches the screens objects live on
     * rather than the objects.
     *
     * NOTHING NEW IS STORED TO DO IT. The record's log already knows (`recentHistory`, read through
     * `palette-live.ts`): it is newest first, and every write against a row names its list and number,
     * which is the same sentence the query box takes. A visit is not a write and this build records none, so this is what was changed
     * rather than what was looked at, and the heading says so.
     *
     * AND THE STANDING RULE DECIDES WHICH ONES. A target is a row id, a declaration id
     * (`page.money`) or a governance id (`suggestion:SG31`), and only the first of those is a thing
     * with a page to open. One naming a register this record does not hold, a seq that is no longer
     * there, or a row whose title field is empty, is not built rather than drawn as a line that
     * cannot be pressed.
     *
     * Only with an empty query, for the same reason the questions below it are: past that `search()`
     * is already answering, and a second source for the same rows would draw each of them twice.
     */
    if (prefix === null && text === '' && isLive) {
      for (const r of extra?.recent ?? [])
        out.push({ id: `n-${r.target}`, title: r.title, detail: `${r.list} · ${since(r.at, shell.now ?? Date.now())}`, href: r.href, group: RECENT, icon: r.icon, complete: r.title });
    }

    /**
     * AND WHAT IS WAITING ON YOU, WITH NOTHING TYPED.
     *
     * `search()` reaches the decisions the moment two characters are in the box, and before that
     * the panel listed nine destinations and said nothing about the four questions the record is
     * actually holding. A command surface that opens on what the record is waiting for is a
     * different object from one that opens on a menu of screens.
     *
     * Only with an empty query, because past that `search()` is already answering and a second
     * source for the same rows would draw each of them twice.
     */
    if (prefix === null && text === '' && !blank)
      for (const question of (isLive ? (shell.questions ?? []) : []).slice(0, OPEN_CAP))
        out.push({ id: `q-${question.id}`, title: question.title, detail: OPEN_QUESTION, href: `/decide/${question.id}`, group: copy.decide, icon: 'decide', complete: question.title });

    /* `@` IS PEOPLE, AND IT MATCHED NOTHING. This file's own header says the prefix works in every
       mode, and every branch that produces a row
       was guarded on a prefix that is not `@`, so typing a colleague's name behind it fell straight
       through to "Nothing matches". The record has a people register; the search already reaches it;
       the only thing missing was the register this prefix narrows to. */
    if (hits !== null) {
      const found = hits.value;
      /* PAGES ARE DRAWN ONCE. `search()` reaches the nav pages too, and the branch above has already
         listed every one of them under their own heading, so an unprefixed query drew each matching
         page twice: once as a page and once as a record hit. The hits are what gets dropped rather
         than the pages, because `/` is the prefix somebody types to see pages and `#` is not, and
         the total has to lose them with the rows or the count is about a list nobody is shown.

         ONCE IS NOT NONE, AND IT USED TO BE, FOR ANY PAGE THE RAIL DID NOT CARRY. This dropped
         every hit of the kind, on the assumption that the branch above had listed all of them. The
         rail is capped per register, so at a real size it carries some of a register's pages and
         not the rest, and the ones it left out were then dropped here too: a page the record holds,
         the search finds, and the palette shows nowhere. The palette is the one door that is
         supposed to reach everything, so the test is now what was actually drawn rather than what
         kind the hit is. `nav` is the same list the loop above iterates, so the two cannot drift. */
      const twice = prefix === null;
      const listed = new Set(nav.map((entry) => entry.href));
      const dropped = (hit: { kind: string; href: string }): boolean => twice && hit.kind === copy.pages && listed.has(hit.href);
      const asPages = found.hits.filter(dropped).length;
      const kept = found.hits.filter((hit) => (prefix !== '@' || hit.href.startsWith(`/r/${PEOPLE}/`)) && !dropped(hit));
      /* THE TOTAL IS THE SCOPE'S, NOT THE RECORD'S. `@` narrows to one register, so the number the
         status line compares against has to be that register's count, read off the group `search()`
         already returns rather than recounted, so the two can never disagree. */
      total = prefix === '@' ? (found.groups.find((g) => g.href?.startsWith(`/r/${PEOPLE}?`))?.total ?? kept.length) : found.total - (twice ? asPages : 0);
      drawn = kept.length;
      /* GROUPED BY THE LIST THEY CAME OUT OF, not under one heading reading "Rows". Eight registers,
         the decisions and the pages all arrived as one undifferentiated block, so a person scanning
         for a person had to read every obligation on the way. `search()` round-robins across the
         sources, so the groups are short. */
      for (const hit of kept) {
        /* DRAWN ONCE, as a page is: the thing the name means is already a row, with what it is, at this address. */
        if (aboutAt.has(hit.href)) continue;
        out.push({
          id: `h-${hit.href}`,
          title: hit.title,
          /* AND WHY IT IS IN THE LIST, when the title does not contain what was typed. `services`
             declares its provider searchable, so `nordhaven` now reaches three domains named after
             none of it: useful, and unreadable without the reason. A row the record sends with
             nothing beside its title says the list it is in, where its number used to stand, because
             a list's name is something a person reads and a number is not. */
          detail: hit.why ?? (hit.detail || hit.kind),
          /* NEVER WHY IT RANKED: a row found by meaning carries a mark, not a caption, so it says its list. */
          href: hit.href,
          group: hit.kind,
          icon: hit.icon,
          complete: hit.title,
        });
      }

      /**
       * AND THE OVERFLOW IS A ROW, NOT A CAPTION.
       *
       * `19 §2` names `/search?q=` a spine screen, *"the structured fallback when the palette's
       * ranked list was not enough"*, so what is missing has somewhere to go, and a row is how you
       * get there: it takes the arrow keys and Enter like every other result, which a caption
       * cannot. The shape already ships in this product at `r/[register]/[seq]`, where a capped
       * backlink list ends in `All 400 →`.
       *
       * IT CARRIES NO GROUP OF ITS OWN and is drawn after every heading, because it is not one more
       * result: it is the door out of the whole list. A heading over it would be a group of one
       * whose name is a lie about what is in it.
       *
       * `⇥` NEVER LANDS ON IT, and it used to. The row carries no `complete`, which is the guard the
       * sentence that used to be here only described: pressing `⇥` on it wrote *All 484 matches for
       * “ren”* into the box.
       *
       * AND `@` GETS ONE TOO. It was suppressed for that prefix, so a capped list of people was
       * silent, exactly the defect being fixed for the unprefixed case, on the branch where the cap
       * bites soonest because the filter throws most of the budget away. Its door is the people
       * register rather than `/search`, because `@` is already a question about one list.
       */
      if (total > drawn)
        out.push({
          id: 'all',
          title: copy.allMatches(total, text),
          detail: '',
          href: prefix === '@' ? `/r/${PEOPLE}?q=${encodeURIComponent(text)}` : `/search?q=${encodeURIComponent(text)}`,
          group: '',
          icon: 'search',
        });
    }

    /**
     * AND SLASH'S ROW, LAST, WHEN NOTHING ELSE WAS A PLACE (`50 §5.5` step 5).
     *
     * A place is anything but an action: a page, a list, a figure, a row. With a model behind Slash and none of those
     * matched, the last row asks the record in words. Without a model `offersSlash` answers `null` and the row does not
     * exist, which is `23 §8`'s absent rather than disabled, and the only way the word Slash reaches this panel.
     */
    const kept = out.slice(0, CAP);
    /* WHAT TELL HEARD LEADS (T27): "Paid Ada 300 for the logo" is money out to Ada before it is anything else. */
    kept.unshift(...tellOffers.map((o, i) => ({ id: `c-tell-${i}`, title: o.title, detail: o.detail, href: null, group: '', icon: 'plus' as IconName, told: o })));
    /* THE PLAIN LINE'S ROW, LAST, AFTER EVERY MATCH. It is made out of the query like the sentence's add row,
       so `commands` is asked for it, which is asking the standing rule. Last, so it is never the row Enter runs while
       any place or command matched: "Add as a task" on every line would make Enter a way to file stray tasks. With
       nothing else drawn it is the first row, and Enter adds. It is not a place, so Slash's row may still follow it. */
    const plainAt = plainMade ? commands({ ...live, creation: plainMade }).find((c) => c.act === 'add') : undefined;
    if (plainMade && plainAt && into)
      kept.push({ id: 'c-add-plain', title: createWords.plain(into.one ?? into.name), detail: plainMade.title, href: null, group: createWords.plainGroup, icon: plainAt.icon, act: plainAt.act, creation: plainMade, plain: true });
    /* "MAKE ..." AND "CHANGE ..." GO TO THE PAGE: the first row, since a person who typed the verb means it. */
    /* AND THE PAGE'S OWN CHANGES SAID WITHOUT "CHANGE" ("move Bills up", "show only open ones"), where no other row took
       the line: "hide Inbox" is the nav's, and stays its. */
    const entry = parsed.prefix === null ? (slashLine(parsed.text) ?? (pageHere && (live.customise ?? []).length === 0 ? sayLine(parsed.text) : null)) : null;
    const toPage = entry ? entryHref(entry, pageHere ? page.url.pathname : null) : null;
    if (entry && toPage)
      kept.unshift({ id: `c-${entry.verb}`, title: slashEntryWords[entry.verb](entry.line), href: toPage, group: '', icon: entry.verb === 'make' ? 'plus' : 'edit' });
    const question = offersSlash({ slash: slashHere, prefix, text, pending, places: kept.filter((r) => r.group !== copy.commands && r.plain !== true).length });
    if (question !== null) kept.push({ id: 'slash', title: copy.askSlash(question), href: null, group: '', icon: 'search', ask: question });
    return kept;
  });

  /**
   * THE RESULT COUNT, DEBOUNCED, which `13 §7` and `50 §5.5` step 1 both ask for and neither got.
   *
   * `13 §7`'s last row: *"a **debounced** `role="status"` for the result count. An undebounced live
   * region announces on every keystroke and is unusable."* 250 ms is `50 §5.5`'s number. Without it
   * a screen reader hears a number for every letter typed; without the region at all, which is what
   * shipped, it hears nothing and the list simply changes underneath.
   */
  let announced = $state('');

  $effect(() => {
    /* `drawn` AND NOT `flat.length`. The status line is about the record's ANSWER, and `flat` is
       every row in the panel: the commands, the destinations, the figures and the overflow row whose
       entire job is to say the answer was cut. Announcing *14 of 484* over twelve hits counted the
       sentence about the cap as one of the things it was counting.

       `flat` is still READ, because `drawn` is a plain variable assigned inside the `rows` derived
       and reading it does not subscribe to anything. Reading `flat` subscribes to `rows`, which is
       what recomputes it. Delete this line and the announcement freezes on the first query. */
    void flat;
    /**
     * AND A LIST WITH ROWS IN IT SAYS SOMETHING, once something has been typed.
     *
     * `drawn` counts record hits, so `>` and `/`, which never produce any, announced nothing at all
     * on a panel full of results. And the other edge is the freshly opened palette: no query, every
     * destination listed, and a confident number about a list nobody asked for. A status line is
     * the answer to a question; with no question there is no answer, and the silence is correct.
     */
    const said = !parsed.text || pending ? '' : drawn > 0 ? copy.showingOf(drawn, total) : flat.length > 0 ? copy.showingOf(flat.length, flat.length) : '';
    const t = setTimeout(() => (announced = said), 250);
    return () => clearTimeout(t);
  });

  /**
   * The overflow row is held out of the groups, so it can be drawn last and headingless, and so is Slash's row, for the
   * same reason: it is not one more result but the door out of the list. The two never meet, because the overflow needs
   * hits and Slash's row needs none.
   *
   * It stays in `flat`, which is what the arrow keys and Enter walk, so holding it out of the
   * headings costs it nothing a reader can feel.
   */
  const overflow = $derived(rows.find((r) => r.id === 'all'));
  /* THE ASK'S ROW, FIRST FOR A SENTENCE: three words or a question mark is somebody asking, so it leads. */
  const askRow = $derived(rows.find((r) => r.id === 'slash'));
  const askLeads = $derived(askRow !== undefined && asksFirst(askRow.ask ?? ''));

  /* THE GROUPS OPENED PAST THEIR SIX, for this query only. */
  let opened = $state<ReadonlySet<string>>(new Set());
  $effect(() => {
    void q;
    opened = new Set();
  });

  /** A row that is a person or an organisation, by the list its address opens. */
  const isWho = (r: Row): boolean => r.href !== null && /^\/r\/(?:people|organisations)\/\d+(?:$|[?#])/u.test(r.href);

  /**
   * WHAT A FOLDED COUNT COUNTS, by the list the rows came from: "2 tools", never "2 times" (AG32). A heading that is no
   * list's says the rows share a name.
   */
  const foldedSaid = (r: Row): string | undefined => {
    if (!r.folded || r.folded < 2) return undefined;
    const g = r.from ?? r.group;
    const n = r.folded.toLocaleString('en-GB');
    /* A LIST CALLED BY ITS PLURAL COUNTS IN IT ("2 tools"); one called otherwise is where they are ("3 in Ledger"). */
    if (!REGISTER_NAMES.has(g)) return `${n} with this name`;
    return /s$/u.test(g) ? `${n} ${g.toLowerCase()}` : `${n} in ${g}`;
  };

  /** Rows that are a thing a person would name (a page, a list, a row, a person), never a command or a reading. */
  const named = (r: Row): boolean =>
    r.href !== null && r.group !== GO_TO && r.group !== RECENT && r.group !== FIGURES && r.group !== copy.commands && r.group !== copy.destinations && r.group !== '';

  const groups = $derived.by(() => {
    const out = new Map<string, Row[]>();
    /* THE THING MEANT FIRST (motion F13): a page, a list, a project or a person whose name is exactly what was typed
       comes before every row that only mentions it. "kiln" drew three ledger lines before the project. */
    const needle = parsed.text.trim().toLowerCase();
    /* AND A PERSON OR AN ORGANISATION WHOSE NAME STARTS WITH THE WORDS LEADS IT (audit 31 Oct g, AG32): "fenwick" put a
       tool called Fenwick over the organisation Fenwick Cloud. Who leads, then what is named exactly, three at most. */
    const titled = (r: Row): string => r.title.trim().toLowerCase();
    const leads = (r: Row): boolean => isWho(r) && (titled(r) === needle || titled(r).startsWith(`${needle} `));
    const best =
      needle === ''
        ? new Set<string>()
        : new Set([...rows.filter((r) => named(r) && leads(r)), ...rows.filter((r) => named(r) && !leads(r) && titled(r) === needle)].slice(0, 3).map((r) => r.id));
    for (const r of [...rows].sort((a, b) => Number(best.has(b.id) && leads(b)) - Number(best.has(a.id) && leads(a)))) {
      if (r.id === 'all' || r.id === 'slash') continue;
      const group = best.has(r.id) ? BEST : r.group;
      if (!out.has(group)) out.set(group, []);
      out.get(group)!.push(group === r.group ? r : { ...r, group, from: r.group });
    }
    /* IDENTICAL TITLES IN ONE GROUP ARE ONE LINE WITH A COUNT, which opens the search for that title: three
       "KILN STOREFRONT PAYOUT" lines said nothing the one does not. Then each group shows six, and a row to show all. */
    for (const [group, items] of out) {
      const seen = new Map<string, Row>();
      const folded: Row[] = [];
      for (const r of items) {
        const key = r.title.trim().toLowerCase();
        const had = seen.get(key);
        /* WHAT THE NAME IS AND ITS OWN PAGE ARE ONE THING, never "Kiln 2": the row keeps what it is and where it was
           seen, and takes the page's address and the page's own glyph, the one the rail draws beside it. */
        if (had && group === BEST && (had.id.startsWith('about-') || r.id.startsWith('about-'))) {
          const page = had.id.startsWith('about-') ? r : had;
          const about = had.id.startsWith('about-') ? had : r;
          Object.assign(had, { ...about, href: page.href ?? about.href, icon: about.marked === true ? about.icon : (page.icon ?? about.icon) });
          continue;
        }
        if (had && r.href !== null && had.href !== null && group !== GO_TO) {
          had.folded = (had.folded ?? 1) + 1;
          had.href = `/search?q=${encodeURIComponent(r.title)}`;
          continue;
        }
        const own = { ...r };
        seen.set(key, own);
        folded.push(own);
      }
      if (folded.length > GROUP_CAP && !opened.has(group))
        out.set(group, [...folded.slice(0, GROUP_CAP), { id: `more-${group}`, title: showAll(folded.length), href: null, group, more: group }]);
      else out.set(group, folded);
    }
    /* Stable, so two groups of the same rank keep the order `search()` handed them over in. THE PLAIN LINE'S ROW
       GOES LAST whatever its heading's rank, since it is offered for any line and outranks nothing typed. */
    const blank = parsed.prefix === null && parsed.text.trim() === '';
    const at = ([group, items]: [string, Row[]]): number =>
      items.every((r) => r.plain === true) ? Number.MAX_SAFE_INTEGER : blank && group === GO_TO ? -2 : rankOf(group);
    return [...out].sort((a, b) => at(a) - at(b));
  });

  const flat = $derived(inOrder(groups.flatMap(([, r]) => r), overflow, askRow ? { row: askRow, first: askLeads } : undefined));

  /**
   * THE KEY A ROW'S TOOLTIP SHOWS COMES OUT OF THE REGISTRY, never out of this file.
   *
   * `19 §4` makes the keymap "a registry the dispatcher consults" so that the `?` sheet documents
   * the bindings by reading them and cannot drift. A palette row showing a key it spelled itself
   * would be the second list that rule exists to prevent, and it is the list that goes stale first,
   * because a row is edited far more often than a binding.
   */
  /* A FIGURE'S READING AS A TILE WRITES IT, whole and in the record's currency without its code: "£8,160", never
     "GBP 8,160.00". Anything that is not one stored amount is left as it came. */
  const figureOf = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const f = readFigure(value.trim());
    return (f && moneyWhole(f.minor, f.currency, homeCurrency())?.text) ?? value;
  };

  /* THE SECOND LINE TELLS ROWS APART, AND NEVER SAYS THE GROUP AGAIN: "Ledger" under the heading Ledger, or "Work
     page" on every page, is a kind label the heading already gave. A status is said as a word instead (`Result`). */
  const lineOf = (row: Row): string | undefined =>
    row.detail && row.detail !== row.group && !/ page$/u.test(row.detail) && row.tone !== 'bad' && row.tone !== 'warn' ? row.detail : undefined;

  const keyFor = (id: string | undefined): string | undefined => (id === undefined ? undefined : BINDINGS.find((b) => b.id === id)?.key);

  /**
   * THE ID A ROW ANSWERS TO, so that `aria-activedescendant` has something to point at.
   *
   * The options carried no ids and the query box carried no `aria-activedescendant`, so a screen
   * reader following the input heard the list change and never heard which row `↓` had moved to.
   * The highlight was a background tint and nothing else: readable by eye, and invisible to the one
   * reader who has no other way to know what `↵` is about to run.
   *
   * THE PUNCTUATION IS FOLDED RATHER THAN TRUSTED. A record hit's id is built out of its address, so
   * it carries slashes and query strings, and an IDREF is a token: a space or a quote in one breaks
   * the reference with no error anywhere. The prefix letters (`c-`, `p-`, `h-`) keep the families
   * apart, so folding cannot collapse two rows onto one id.
   */
  const optionId = (id: string): string => `palette-opt-${id.replace(/[^\w-]+/gu, '-')}`;

  /**
   * Which one of them the query box is pointing at, or nothing when the list is empty.
   *
   * `flat[cursor]` and not `cursor`, because the attribute has to name a row that is on screen: a
   * cursor past the end of a list that just got shorter would point at an id no element holds, and a
   * dangling `aria-activedescendant` is read as no active option at all.
   */
  const activeId = $derived.by(() => {
    const row = flat[cursor];
    return row ? optionId(row.id) : undefined;
  });

  /**
   * AND THE ACTIVE ROW IS BROUGHT ONTO THE SCREEN, which nothing did while it was only a tint.
   *
   * The panel draws up to sixty rows in a scroller, and `↓` moved a highlight without moving the
   * list, so holding the key ran the cursor off the bottom and left `↵` pointing at a row nobody
   * could see. The comment on the cursor reset above already names this as the reason a stale
   * cursor was survivable at twenty rows and is not at sixty; it is the same defect one press
   * later.
   *
   * `block: 'nearest'` is what makes it safe under the pointer: a row already on screen is not
   * scrolled at all, so `onmouseenter` moving the cursor cannot yank the list out from under the
   * hand that is moving over it.
   */
  $effect(() => {
    const id = activeId;
    if (id === undefined) return;
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      const had = document.activeElement;
      returnTo =
        had instanceof HTMLElement && had !== document.body
          ? had
          : ([...document.querySelectorAll<HTMLElement>('[data-palette-from], .launcher')].find((f) => f.checkVisibility()) ?? null);
      dismissed = false;
      placeOn(el);
      instantIf(el);
      el.showModal();
      overlays.open();
      /* WHAT TODAY'S ASK BAR HANDED OVER, taken once and cleared, so the next open starts empty as it always has. */
      q = untrack(() => opener.seed);
      untrack(() => (opener.seed = ''));
      cursor = 0;
      modeWas = opener.mode;
      backTo = null;
      if (opener.mode === 'ask') q = '';
      behind = pageOf(page.url.pathname, document.title);
      held = [];
      given = [];
      look = lookNow();
      lookKept = keptNow();
      pageHere = pageMenu() !== null;
      if (slashHere) warm();
      /* A QUESTION THE SLASH PAGE'S FIELD ASKED (`askNow`), taken once: asked at once, in a new conversation. */
      const question = untrack(() => opener.question);
      if (question !== '') {
        untrack(() => (opener.question = ''));
        askSlash(question);
      }
      queueMicrotask(() => input?.focus());
    } else if (!open && el.open) {
      instantIf(el);
      el.close();
      overlays.close();
      /* A SHARED PHOTO NOBODY ADDED ANYTHING WITH goes when the palette does, with the phone's copy of it. */
      if (untrack(() => shared.urls.length) > 0) letGo();
      if (dismissed) queueMicrotask(focusBack);
      else returnTo = null;
    }
  });

  /**
   * OUT OF THE FIELD IT WAS OPENED FROM, AT EVERY WIDTH (`data-palette-from`): the first one drawn on screen.
   *
   * From 900px it is the bar's "Ask or change anything": the palette opens over it, its top on the field's and its edge
   * on the field's nearer edge, and widens from the field's own width as the answer drops down under it. From 640px the
   * head bar's search button: the palette takes the bar's row, the width of the screen less its gutters, and drops down
   * from there. Under 640px it is a sheet from the top edge, the full width. Only with no field on screen at all (the
   * menu shape's corner button) is it the centred box.
   */
  function placeOn(d: HTMLDialogElement) {
    let field: HTMLElement | null = null;
    for (const f of document.querySelectorAll<HTMLElement>('[data-palette-from]')) {
      const r = f.getBoundingClientRect();
      if (f.getClientRects().length > 0 && r.width > 0 && r.bottom > 0 && r.top < innerHeight) {
        field = f;
        break;
      }
    }
    delete d.dataset.side;
    if (innerWidth < 640) {
      d.dataset.from = 'phone';
      d.removeAttribute('style');
      return;
    }
    if (!field) {
      delete d.dataset.from;
      d.removeAttribute('style');
      return;
    }
    const r = field.getBoundingClientRect();
    const rtl = getComputedStyle(field).direction === 'rtl';
    const bar = field.dataset.paletteFrom === 'bar' && innerWidth >= 900;
    d.dataset.from = bar ? 'bar' : 'head';
    /* A FIELD ON THE START HALF OF THE WINDOW (the sidebar's) is kept to by its start edge, so the palette grows into the
       window and never off it; the bar's, on the end half, by its end edge. */
    const startward = (rtl ? innerWidth - r.right : r.left) + r.width / 2 < innerWidth / 2;
    if (bar && startward) d.dataset.side = 'start';
    const start = Math.round(rtl ? innerWidth - r.right : r.left);
    const end = Math.round(rtl ? r.left : innerWidth - r.right);
    const top = bar ? r.top : Math.max(8, r.top - 6);
    d.setAttribute('style', `--from-top: ${Math.round(top)}px; --from-start: ${start}px; --from-end: ${end}px; --from-w: ${Math.round(r.width)}px; --from-h: ${Math.round(r.height)}px`);
  }

  /**
   * A NEW QUESTION STARTS AT THE TOP OF ITS OWN ANSWER.
   *
   * The cursor was set on open and then left alone, so arrowing five rows down and pressing
   * backspace left the highlight on row five of a completely different list. It was survivable in a
   * box that held twenty rows and is not in a panel that holds sixty: the row Enter would run is
   * frequently off screen.
   */
  $effect(() => {
    void q;
    cursor = 0;
  });

  function run(row: Row | undefined) {
    if (!row) return;
    /* "SHOW ALL" OPENS ITS GROUP IN PLACE, and the cursor stays on the first row it brought. */
    if (row.more !== undefined) {
      const index = flat.indexOf(row);
      opened = new Set([...opened, row.more]);
      cursor = Math.max(0, index);
      return void input?.focus();
    }
    /* SLASH'S ROW ANSWERS IN THE PANEL, so it is the one row that leaves it open. */
    if (row.ask !== undefined) return askSlash(row.ask);
    if (row.resume) return toAsk();
    /* A RENAME WITH NO NEW NAME YET WRITES THE SENTENCE INTO THE BOX, and the palette stays open for its last word. */
    if (row.change?.kind === 'fill') {
      q = row.change.text;
      return void input?.focus();
    }
    /* AND SO DOES NEW PAGE WITH NO NAME YET: the box takes the sentence, and the next word typed is the page's name. */
    if (row.act === 'page' && row.paging?.title === '') {
      q = FILL;
      return void input?.focus();
    }
    open = false;
    /* THE ONE ROW THAT DOES SOMETHING RATHER THAN GO SOMEWHERE. It is checked on the act rather
       than on a flag, so no row's behaviour is described in two places. The standing rule means it
       is only ever offered while there is something to reverse, and the fallback is there for the
       one frame in which the offer expires between the press and the handler. */
    if (row.act === 'undo') {
      if (!toasts.undoLast()) toasts.push(copy.nothingToUndo);
      return;
    }
    if (row.act === 'add') {
      if (row.creation) void add(row.creation);
      return;
    }
    if (row.told) {
      void addTold(row.told, shell as unknown as TellShell, (text) => toasts.push(text, { intent: 'warn' })).then((ok) => void (ok && invalidateAll()));
      return;
    }
    if (row.act === 'page') {
      if (row.paging) void newPage(row.paging);
      return;
    }
    if (row.act === 'customise' && row.change) return customiseRun(row.change);
    /* A MONEY ROW OPENS THE QUICK-ADD SHEET on its way, once the palette has gone, so the sheet takes the caret. */
    if (row.act === 'money') {
      const way = moneyWay(row.id);
      if (way) setTimeout(() => quick.start(way), 0);
      return;
    }
    if (row.href !== null) goto(at(row.href));
  }

  /**
   * THE ADD ROW, PRESSED: one row in the list the sentence named, and a receipt that can put it back.
   *
   * `addRow` writes the list's own capture line with nothing pinned and no amount, so what it filled in is said the way
   * the list says it, and the receipt's Put back archives the row at the version the write answered. The shell is read
   * again after each, so the rail's count follows the row in and out.
   *
   * WITH NO RECORD THE ROW IS NOT OFFERED (`addLists` is empty), where it used to toast that the row "would be added"
   * and nothing was saved. The guard stays for a press that raced a refusal.
   */
  async function add(c: Creation | Plain) {
    const list = addNamed.get(c.register) ?? listName(c.register);
    if (!isLive) return;
    let out: Awaited<ReturnType<typeof addRow>>;
    /* A SHARED PHOTO GOES WITH THE LINE, into the list's file field; a list that keeps no file adds the line alone. */
    const photo = shared.photos.length > 0 ? await photoFields(c.register, apiBase(page.url)) : 'none';
    try {
      out = await addRow(c, Date.now(), apiBase(page.url), undefined, photo !== null && photo !== 'none' ? (photo as unknown as Fields) : {});
    } catch {
      /* THE WRITE MODULE IS LOADED ON THE PRESS, so a dropped connection can fail the import before any request. */
      return void toasts.push(copy.writeNotReached, { intent: 'warn' });
    }
    if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
    if (photo !== 'none') {
      if (photo === null) toasts.push(shareWords.notKept(list), { intent: 'warn' });
      letGo();
    }
    /* WHAT THE LINE SAID IS SAID BACK, "due Thu 15 Oct", so the chip under the field is in the receipt too. */
    const read = 'chips' in c ? c.chips.map((chip) => chip.said) : [];
    const said = read.length > 0 ? createWords.addedWith(list, c.title, read) : createWords.added(list, c.title);
    const back = out.back;
    /* WHAT IT FILLED IN IS NOT READ OUT (VERIFY H23): the toast names what was added and where, and no more. */
    toasts.push(said, {
      intent: 'good',
      undo: () =>
        void back().then((undone) => {
          toasts.push(undone.ok ? copy.writeArchived(`“${c.title}”`) : undone.fix, undone.ok ? {} : { intent: 'warn' });
          if (undone.ok) void invalidateAll();
        }),
    });
    void invalidateAll();
  }

  /**
   * THE NEW PAGE ROW, PRESSED: `new-page.ts` makes the page or files the suggestion, opens what it made and
   * shows the one receipt. This hands it the screen: the record, the pages `boot` lists, the address bar and the toasts.
   * Undo leaves the page only when the reader is still on it.
   */
  function newPage(p: Paging) {
    if (!isLive) return;
    return pagePressed(p, {
      make: pageMaker(apiBase(page.url), shell.pages ?? [], !p.suggest),
      go: (href) => goto(at(href)),
      toast: (text, opts) => toasts.push(text, opts),
      /* THE SHELL IS KEPT FOR THE TAB (`boot-live.ts`), so the kept answer is dropped first: the rail and the next
         page's address are read from a list that holds the page just made or taken away. */
      refresh: async () => {
        (await import('$lib/record/boot-live.ts')).forget();
        await invalidateAll();
      },
      leave: (href) => (page.url.pathname === new URL(at(href), page.url).pathname ? goto(at('/')) : undefined),
      notReached: copy.writeNotReached,
    });
  }

  /**
   * A CUSTOMISE ROW, PRESSED. The writes are `customise-apply.ts`'s, through the writers Settings uses. Quiet hours go to
   * their one area; "Customise this page" opens the page's own menu, once the dialog has closed and handed focus back,
   * so the menu opens over the page with focus in it.
   */
  function customiseRun(change: Change) {
    if (change.kind === 'go') return void goto(at(change.href));
    if (change.kind === 'page') return void setTimeout(() => pageMenu()?.click(), 0);
    applyChange(change);
  }

  function onkeydown(e: KeyboardEvent) {
    /* IN ASK, ENTER SENDS WHAT IS TYPED, and with nothing typed does what the waiting card asks. Nothing else is taken. */
    if (inAsk) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (q.trim() !== '') send();
        else threadView?.enter();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moved = true;
      cursor = Math.min(cursor + 1, flat.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moved = true;
      cursor = Math.max(cursor - 1, 0);
    } else if (e.key === 'Backspace' && held.length > 0 && input?.selectionStart === 0 && input.selectionEnd === 0) {
      /* BACKSPACE AT THE START OF THE FIELD GIVES THE LAST CHIP BACK AS WORDS, which then stay words. */
      e.preventDefault();
      const last = held[held.length - 1]!;
      held = held.slice(0, -1);
      given = [...given, last.words];
      q = untoken(q, last);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      /* A SENTENCE WITH NO MODEL BEHIND IT NEVER JUMPS TO A LOOSE HIT (AG5): "add a task to call Ada on Friday" opened Ada
         Vine's page and added nothing. A row picked with the arrows, a command, or the line that adds what was typed still runs. */
      const top = flat[cursor];
      if (top !== undefined && looseFor(top)) return;
      run(top);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      /**
       * `⇥` COMPLETES THE QUERY, AND IT USED TO SWALLOW `⇧⇥` AS WELL.
       *
       * The branch tested the key and never the modifier, and called `preventDefault()` before it
       * had worked out whether there was anything to complete. So shift-tab ran a FORWARD completion
       * and then ate the press, and backwards focus movement was dead everywhere inside the panel.
       * Below 640px that was the whole keyboard route to the close button, which is the only dismiss
       * control a phone has: `Esc` is not on the keyboard and the click-outside test cannot be true
       * at `100vw`.
       *
       * So the key is taken only when it is doing the one job this file's header claims for it, a
       * plain `⇥` on a row that says what it completes to. Every other press is handed back to the
       * browser, which moves focus within the `<dialog>` and cannot move it out, because a modal
       * dialog is a focus trap and that is one of the three reasons this surface is one. The options
       * are `tabindex="-1"`, so what focus reaches is the panel's own controls rather than sixty
       * rows that would take the arrow keys away from the box that handles them.
       */
      const top = flat[cursor];
      if (top?.complete !== undefined) {
        e.preventDefault();
        q = (parsed.prefix ?? '') + top.complete;
      }
    }
  }

  /**
   * ESC, ONE LAYER A PRESS. In Ask: the waiting card first, then the words typed, then back to Find when a question
   * came from there, and only then closed. In Find it closes, as it always has.
   */
  function oncancel(e: Event) {
    e.preventDefault();
    if (!inAsk) return dismiss();
    if (q === '' && threadView?.escape()) return;
    if (q !== '') return void (q = '');
    if (backTo !== null) return toFind();
    dismiss();
  }

  /**
   * Click outside to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly inert, so the first thing anybody tries is clicking it, and
   * nothing happening is the only feedback they get. Esc has always worked, which is exactly why
   * this went unnoticed by whoever wrote it. A 640px field and its results leave most of a desktop
   * screen around them, and all of that is somewhere a pointer will aim.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the dialog's own padding also targets
   * the dialog, so identity would close it when somebody clicks the gap beside the query.
   * `e.detail > 0` keeps real pointer clicks only: activating a button with the keyboard dispatches
   * a click whose coordinates are (0, 0), which is outside every rect on screen.
   */
  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0) return;
    const r = el.getBoundingClientRect();
    const outside =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) dismiss();
  }
</script>

<svelte:window onkeydowncapture={heardKey} onpointerdowncapture={heardPointer} />

<dialog bind:this={el} class="palette" aria-label={inAsk ? 'Ask Slash' : 'Search'} data-mode={inAsk ? 'ask' : undefined} onclick={onbackdrop} {oncancel} onclose={() => (open = false)}>
  <div class="p-head">
    <span class="p-field">
    {#if inAsk}<span class="p-ask-mark" aria-hidden="true"><Icon name="slash" size="m" /></span>{:else}<Icon name="search" size="m" />{/if}
    {#if inAsk}
      <!-- THE FOLLOW-UP FIELD: a plain field, since in Ask there is no list for it to point into. -->
      <input
        bind:this={input}
        bind:value={q}
        {onkeydown}
        oninput={onaskinput}
        class="p-input"
        type="text"
        aria-label={threadWords.placeholder}
        aria-describedby={waitingCard || asksLeft !== null ? "palette-ask-foot" : undefined}
        placeholder={convo.turns.length > 0 ? threadWords.followUp : threadWords.placeholder}
        autocomplete="off"
      />
    {:else}
      <input
        bind:this={input}
        bind:value={q}
        {onkeydown}
        {oninput}
        class="p-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={activeId}
        aria-label={copy.paletteLabel}
        placeholder={slashHere ? copy.palettePlaceholder : copy.paletteFind}
        spellcheck="false"
        autocomplete="off"
      />
    {/if}
    </span>
    {#if inAsk}
      <!-- FIND, ONE PRESS BACK (or ⌘K), and NEW once there is a conversation to start again from. -->
      {#if convo.turns.length > 0}<button type="button" class="p-mode tap" aria-label={threadWords.freshLabel} onclick={fresh}><Icon name="plus" size="s" /><span>{threadWords.fresh}</span></button>{/if}
      <button type="button" class="p-mode tap" aria-label={threadWords.findLabel} onclick={toFind}><Icon name="search" size="s" /><span>{threadWords.find}</span></button>
    {/if}
    <!--
      A WAY OUT A THUMB CAN REACH.

      The only dismiss affordances were `Esc` and a click outside, and below 640px the palette is
      the whole screen, so `onbackdrop`'s "is this click outside the rect" test can never be true,
      and a phone has no Esc. So the app's only search, and the phone's only route to several
      places, was a screen you could enter and not leave except by choosing a result you did not
      want or using the OS back gesture.

      `19 §4` gives Esc the job of closing "the topmost layer, one per press"; this is the same verb
      for the pointer that has no Esc key. With a fine pointer on a wide screen it is not drawn:
      Esc and the page around the field are both there, and no key is printed to say so.
    -->
    <!-- THE COUNT, ANNOUNCED AND VISIBLE. `13 §7` asks for a debounced `role="status"`; a reader who
         can see the list still benefits from knowing twelve of forty-eight are on screen, and a
         reader who cannot has nothing else to tell them the list changed. -->
    <p class="p-count" role="status">{announced}</p>
    <button type="button" class="p-close tap" onclick={dismiss}>{words.cancel}</button>
  </div>
  <!-- A PHOTO SHARED FROM ANOTHER APP (`lib/phone/share.ts`), beside the words it came with, until something is added
       with it or it is taken off. It goes into the list's file field, so the line under it says where it can go. -->
  {#if shared.urls.length > 0 && !inAsk}
    <div class="p-shared">
      {#each shared.urls as src, i (src)}<img class="p-shared-img" {src} alt={shareWords.photo(shared.photos[i]?.name ?? '')} />{/each}
      <span class="p-shared-line">{shareWords.line(shared.urls.length)}</span>
      <button type="button" class="p-shared-x tap" aria-label={shareWords.remove} onclick={() => letGo()}><Icon name="close" size="s" /></button>
    </div>
  {/if}
  <!-- WHAT THE PLAIN LINE WAS READ AS: a chip for each, under the field, drawn only while the line makes a row. -->
  {#if plainMade && plainMade.chips.length > 0}
    <ul class="p-chips" aria-label={createWords.chips}>
      {#each plainMade.chips as chip, i (i)}
        <li class="p-chip" title={chip.said}>{chip.label}</li>
      {/each}
    </ul>
  {/if}

  <!--
    THE SCROLLER AND THE LISTBOX ARE TWO ELEMENTS NOW, AND THEY USED TO BE ONE.

    `role="listbox"` sat on the scrolling body, and a listbox owns options and groups and nothing
    else. Inside it were two paragraphs: the heading over each group, and the sentence a query that
    matches nothing leaves behind. Both are prose, and prose in a listbox is a child the role does
    not admit, which is the kind of defect that reads as the list being broken rather than as a
    caption being in the wrong box.

    So the box that scrolls is the box that scrolls, the listbox is inside it and holds only rows,
    and each heading is now a `role="group"` around the rows it heads, named by the same words it
    prints. The printed heading is `aria-hidden`, because the group's own name already says it and a
    reader who heard both would hear every heading twice.
  -->
  {#if inAsk}
    <SlashThread bind:this={threadView} here={behind} base={apiBase()} onask={(question) => asked(question)} onleave={() => (open = false)} />
  {:else}
  <div class="p-body">
    <!-- LOOKING, AT ONCE: the same frame as the keystroke, where the first answer will land, and gone when it does. -->
    {#if pending}<p class="p-looking" role="status">{copy.looking}</p>{/if}
    {#if askless && flat.length > 0}<p class="p-needs">{copy.askNeedsModel} <a class="tap" href={at('/settings/agents')} onclick={() => (open = false)}>{copy.askConnect}</a>.</p>{/if}
    <div id="palette-list" role="listbox" aria-label={copy.paletteLabel} aria-busy={pending}>
      {#if askRow && askLeads}{@render result(askRow)}{/if}
      {#each groups as [group, items]}
        <div role="group" aria-label={group}>
          <p class="p-group" aria-hidden="true">{group}</p>
          {#each items as row (row.id)}
            {@render result(row)}
          {/each}
        </div>
      {/each}
      {#if overflow}{@render result(overflow)}{/if}
      {#if askRow && !askLeads}{@render result(askRow)}{/if}
    </div>
    {#if flat.length === 0 && !pending}
      <!-- A query matching nothing falls through to a fallback row when a model is configured.
           Without one the row, the status call and every "Ask BrainDog" button do not exist: ABSENT,
           not disabled (23 §8). This record has no model, so this is what you get.

           OUTSIDE THE LISTBOX, because it is a sentence about the list rather than a row in it. -->
      {#if askless && !hits?.fix}
        <p class="p-none">{copy.askNeedsModel} <a class="tap" href={at('/settings/agents')} onclick={() => (open = false)}>{copy.askConnect}</a>.</p>
      {:else}
        <p class="p-none">{hits?.fix ?? `${copy.noMatches} “${q}”`}</p>
      {/if}
    {/if}
  </div>
  {/if}

  <!-- A FOOTER ONLY WHEN THERE IS SOMETHING TO SAY IN IT. It held the query grammar in the identifier face,
       `> commands · # rows · @ people · / pages`, on every open, which read as a tool for the people who built it.
       The prefixes still work for whoever knows them; nothing on this surface teaches them now. -->
  <!-- `23 §8` AT 80 %: ONE LINE, HERE, ONCE A MONTH. Not a chip, not a modal, and gone for the month once hidden. -->
  {#if capShown && slashStatus}
    <footer class="p-foot">
      <span class="p-cap">{slashWords.capLine(slashStatus.asks.used, slashStatus.asks.cap, slashStatus.asks.resets)}</span>
      <button type="button" class="p-cap-hide tap" onclick={dismissCapLine}>{slashWords.capDismiss}</button>
    </footer>
  {:else if inAsk}
    <!-- WHO IT GOES TO, WHAT IS ATTACHED, AND ONCE AN ANSWER IS WHOLE, THINK HARDER; then, quiet, what Enter does while a
         card waits and the asks left this month once there is a number to say. -->
    <footer class="p-foot p-ask-foot" id="palette-ask-foot">
      {#if attaching}
        <div class="p-attach"><AttachPicker onpick={attachOne} onclose={() => ((attaching = false), input?.focus())} taken={attachNow()} /></div>
      {/if}
      <Menu label={sendWords.sheet}>
        {#snippet trigger()}<span class="p-to">{#if askTo.to === 'target' && askTo.t.live}<span class="p-live" aria-hidden="true"></span>{/if}{askLabel}<Icon name="chevronDown" size="s" /></span>{/snippet}
        <button type="button" role="menuitemradio" aria-checked={askTo.to === 'slash' && askTo.mode === 'quick'} onclick={() => (askTo = { to: 'slash', mode: 'quick' })}>{sendWords.slash} · {sendWords.quick}</button>
        <button type="button" role="menuitemradio" aria-checked={askTo.to === 'slash' && askTo.mode === 'deep'} onclick={() => (askTo = { to: 'slash', mode: 'deep' })}>{sendWords.slash} · {sendWords.deep}</button>
        {#each switchable as t (t.id)}
          <button type="button" role="menuitemradio" aria-checked={askTo.to === 'target' && askTo.t.id === t.id} onclick={() => (askTo = { to: 'target', t })}><span class="mi-name">{t.label}</span></button>
        {/each}
      </Menu>
      {#each attached as a (a.ref)}
        <span class="p-attached"><span class="p-attached-name" dir="auto">{a.label}</span><button type="button" class="p-attached-x tap" aria-label={sendWords.remove(a.label)} onclick={() => (attached = attached.filter((x) => x.ref !== a.ref))}><Icon name="close" size="s" /></button></span>
      {/each}
      <button type="button" class="p-at tap" aria-label={sendWords.attach} title={sendWords.attach} aria-expanded={attaching} onclick={() => (attaching = !attaching)}>@</button>
      {#if harder}<button type="button" class="p-harder tap" onclick={() => void rethink(apiBase())}>{sendWords.thinkHarder}</button>{/if}
      {#if routedMac && firstMac}<button type="button" class="p-harder tap" onclick={toMac}>{sendWords.toMac(firstMac.label)}</button>{/if}
      {#if waitingCard}<span class="p-keys-hint">{threadWords.enterDoes}</span>{/if}
      {#if asksLeft !== null}<span class="p-left">{threadWords.left(asksLeft)}</span>{/if}
    </footer>
  {/if}
</dialog>

{#snippet result(row: Row)}
  {@const index = flat.indexOf(row)}
  {@const bound = keyFor(row.binding)}
  <button
    type="button"
    class="p-row"
    role="option"
    id={optionId(row.id)}
    aria-selected={index === cursor && !looseFor(row)}
    tabindex={-1}
    data-cursor={index === cursor && !looseFor(row) ? '' : undefined}
    onmouseenter={() => ((cursor = index), (moved = true))}
    onclick={() => run(row)}
  >
    <Result icon={row.more !== undefined ? undefined : row.icon} title={row.more !== undefined ? row.title : readable(row.title)} line={lineOf(row)} value={figureOf(row.value)} tone={row.tone} status={row.tone === 'bad' || row.tone === 'warn' ? row.detail : undefined} folded={row.folded} foldedSaid={foldedSaid(row)} more={row.more !== undefined} />
    <!-- THE KEY CAP HINT, ON THE CURSOR ROW ONLY (the design system: "the cursor row is wash plus a key cap hint"): the row's own
         binding when it has one, so the slow path teaches the fast one, and `↵`, which is what runs it now. Drawn only at
         desktop width with a fine pointer (the style block says when), and `aria-hidden` so no key is read out as part of
         the option's name: the `?` sheet is where a screen reader hears the keymap. -->
    <span class="p-keys" aria-hidden="true">{#if bound}<Kbd keys={bound} />{/if}<Kbd keys="↵" /></span>
  </button>
{/snippet}

<style>
  /* THE WAY OUT ON A PHONE, a word at the end of the field (the rule below 640px draws it): with a fine pointer on a wide
     screen there is Esc and the scrim around the palette. */
  .p-close {
    display: none;
  }

  /* THE COUNT IS SAID AND NOT SHOWN (2.A.15, "no count in the field"): a screen reader hears how many matched, and the
     eye has the list itself. */
  .p-count {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /**
   * A CENTRED MODAL, OVER THE SCRIM (the ops palette, 3 Nov): 640 wide or the screen less 16 a side, 12% of the window
   * from the top, at most 78% of it tall and the list scrolls inside past that. Reading glass at the sheet radius (22),
   * its specular edge and the modal shadow: the one floating thing over the page. Its height is its content's.
   *
   * IN OVER `--d-panel` FROM .98 OF ITS SIZE, OUT OVER `--d-panel-out` AS A FADE, never laid out on the way. Under
   * `prefers-reduced-motion` it fades only.
   *
   * THE EXPLICIT SIZES ARE NOT REDUNDANT: see `Sheet.svelte`. The UA stylesheet gives `<dialog>` a
   * `max-height: calc(100% - 6px - 2em)`, a matching `max-width` and an automatic margin on both
   * axes, and each of those would move or cut the dialog this places.
   */
  .palette {
    position: fixed;
    inset-block-start: 12vh;
    /* AS TALL AS WHAT IT HOLDS: the UA puts a modal's end edge on the window's, which stretched it to its cap. */
    inset-block-end: auto;
    inset-inline: 0;
    z-index: var(--z-palette);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: min(640px, calc(100vw - 2 * var(--sp-4)));
    max-inline-size: none;
    block-size: auto;
    max-block-size: min(78vh, calc(100dvh - 12vh - var(--sp-6)));
    margin: 0 auto;
    padding: 0;
    background: var(--glass-regular, var(--tile));
    -webkit-backdrop-filter: var(--glass-filter, none);
    backdrop-filter: var(--glass-filter, none);
    border: 0;
    border-radius: var(--r-sheet, 22px);
    box-shadow: var(--glass-edge, inset 0 0 0 1px var(--rule-strong)), var(--elev-modal, none);
    color: var(--ink);
    overflow: hidden;
    opacity: 1;
    scale: 1;
    transition:
      opacity var(--d-panel) var(--ease-out),
      scale var(--d-panel) var(--ease-out),
      translate var(--d-panel) var(--ease-out),
      display var(--d-panel) allow-discrete,
      overlay var(--d-panel) allow-discrete;
  }

  .palette[open] {
    display: flex;
  }

  /* OPENED FROM THE BAR'S FIELD: over it, its end edge on the field's (its start edge, for a field on the start half),
     at least 560 wide, WIDENING FROM THE FIELD'S OWN WIDTH AND DROPPING DOWN from its height, over `--d-panel`. */
  .palette:global([data-from='bar']) {
    inset-block-start: var(--from-top);
    inset-inline: auto var(--from-end);
    inline-size: min(640px, max(var(--from-w), 560px), calc(100vw - 2 * var(--sp-4)));
    max-block-size: min(640px, calc(100dvh - var(--from-top) - var(--sp-6)));
    margin: 0;
    border-radius: var(--r-sheet, 22px);
    transform-origin: top;
    transition:
      opacity var(--d-panel) var(--ease-out),
      inline-size var(--d-panel) var(--ease-out),
      max-block-size var(--d-panel) var(--ease-out),
      display var(--d-panel) allow-discrete,
      overlay var(--d-panel) allow-discrete;
  }

  .palette:global([data-from='bar'][data-side='start']) {
    inset-inline: var(--from-start) auto;
  }

  @starting-style {
    .palette:global([data-from='bar'][open]) {
      opacity: 0.4;
      scale: 1;
      inline-size: var(--from-w);
      max-block-size: var(--from-h);
    }
  }

  /* OPENED FROM A HEAD BAR'S SEARCH BUTTON (640 to 900): the bar's row, the screen less its gutters, dropping down. */
  .palette:global([data-from='head']) {
    inset-block-start: var(--from-top);
    inset-inline: var(--sp-4);
    inline-size: auto;
    max-block-size: min(640px, calc(100dvh - var(--from-top) - var(--sp-6)));
    margin: 0;
    border-radius: var(--r-sheet, 22px);
    transform-origin: top right;
  }

  .palette:global([data-from='head']):dir(rtl) {
    transform-origin: top left;
  }

  .palette:not([open]) {
    display: none;
    opacity: 0;
    transition:
      opacity var(--d-panel-out) var(--ease-in),
      display var(--d-panel-out) allow-discrete,
      overlay var(--d-panel-out) allow-discrete;
  }

  @starting-style {
    .palette[open] {
      opacity: 0;
      scale: 0.98;
    }
  }

  /* FROM THE KEYBOARD, AT ONCE (`byKey`): no widening, no fade, the scrim with it, both ways. */
  .palette:global([data-instant]),
  .palette:global([data-instant])::backdrop {
    transition: none !important;
  }

  /* THE SCRIM, fading with it, so the page behind steps back and the palette is the one thing to read. */
  .palette::backdrop {
    background: var(--scrim);
    opacity: 1;
    transition:
      opacity var(--d-panel) var(--ease-out),
      display var(--d-panel) allow-discrete,
      overlay var(--d-panel) allow-discrete;
  }

  .palette:not([open])::backdrop {
    opacity: 0;
    transition-duration: var(--d-panel-out);
  }

  @starting-style {
    .palette[open]::backdrop {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .palette,
    .palette:not([open]) {
      scale: none;
      translate: none;
    }

    /* NOTHING WIDENS OR DROPS under reduced motion: the palette is at its size from the first frame and only fades. */
    .palette:global([data-from='bar']) {
      transition:
        opacity var(--d-panel) var(--ease-out),
        display var(--d-panel) allow-discrete,
        overlay var(--d-panel) allow-discrete;
    }

    @starting-style {
      .palette[open] {
        scale: none;
        translate: none;
      }

      .palette:global([data-from='bar'][open]) {
        inline-size: min(640px, max(var(--from-w), 560px), calc(100vw - 2 * var(--sp-4)));
        max-block-size: min(640px, calc(100dvh - var(--from-top) - var(--sp-6)));
      }
    }
  }

  /* THE FIELD: 56 tall, the glyph, the query. The hairline under it is the one rule in the panel. Its glyph stands on the
     rows' glyph edge, 20 in (the list's 8, a row's 8 and 4 into the 24px slot), and the query on their titles' edge. */
  .p-head {
    --p-glyph-edge: calc(var(--sp-4) + var(--sp-1));
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 56px;
    padding-block: 0;
    padding-inline: var(--p-glyph-edge) var(--sp-3);
    border-block-end: 1px solid var(--sep, var(--rule));
    color: var(--ink-3);
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* The state change the input gave up. It is the row that looks like a field, so it is the row
     that says it is live: its edge darkens toward the ink. Never the accent, which under the query
     read as a validation error before anything had been typed. */
  .p-head:focus-within {
    color: var(--ink-2);
  }

  /* THE GLYPH AND THE QUERY, one piece: on a phone it is the well the query is typed into. */
  .p-field {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* A FULL-HEIGHT TARGET: the palette's only text field, on the surface `19 §4` makes the primary way to reach a row. */
  .p-input {
    flex: 1;
    min-block-size: var(--ctl-h);
    min-inline-size: 0;
    padding-inline: 0;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--ink);
    font-size: var(--fs-row, 15px);
    line-height: var(--lead-row, 20px);
    letter-spacing: -0.005em;
  }

  /* The caret is the platform's own focus indicator for a text field, and the panel opens with focus
     here and traps it; the state change belongs to `.p-head`, the thing that looks like a field. */
  .p-input:focus-visible {
    /* focus-ok: the caret indicates focus here, and `.p-head:focus-within` above carries the state
       change for the field the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  .p-input::placeholder {
    color: var(--ink-3);
  }

  /* A SHARED PHOTO: a 48px picture at the control radius, the line beside it, and a 44px way to take it off. */
  .p-shared {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) calc(var(--sp-4) + var(--sp-1));
  }

  .p-shared-img {
    flex: none;
    inline-size: 48px;
    block-size: 48px;
    border-radius: var(--r-ctl);
    object-fit: cover;
    background: var(--board);
  }

  .p-shared-line {
    flex: 1;
    min-inline-size: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
  }

  .p-shared-x {
    display: grid;
    flex: none;
    place-items: center;
    min-inline-size: var(--tap);
    min-block-size: var(--tap);
    border: 0;
    background: none;
    color: var(--ink-3);
  }

  /* THE CHIPS A PLAIN LINE WAS READ INTO: rectangles at the control radius, flat on the board's sunk colour. */
  .p-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) calc(var(--sp-4) + var(--sp-1));
    list-style: none;
  }

  .p-chip {
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-pill, 999px);
    background: var(--row-wash-press, var(--board));
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui, 20px);
  }

  /**
   * THE BOX THAT SCROLLS IS THE LISTBOX, AND FOR A MOMENT IT WAS THE WRAPPER AROUND IT.
   *
   * Splitting the scroller from the listbox fixed prose sitting inside a role that does not admit
   * it, and it broke `scrollable-region-focusable`: the options are `tabindex="-1"` because a
   * combobox that moves focus with `aria-activedescendant` must not put its rows in the tab order,
   * so the wrapper became a scrolling region with nothing focusable in it and axe was right to say
   * so. The exemption axe grants is for a combobox's own popup, and the popup is the element the
   * input names in `aria-controls`. So the scroll belongs on that element rather than on a plain
   * `div` wrapped around it, which is also the truer description: what a person scrolls is the list.
   */
  .p-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    /* A flex child's floor is its content, so without this the list cannot be shorter than its rows
       and the dialog grows past its cap instead of scrolling. */
    min-block-size: 0;
  }

  #palette-list {
    flex: 1;
    padding: var(--sp-1) var(--sp-2) var(--sp-2);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* A META HEADING OVER EACH GROUP: the meta step, at 500, in the lowest text ink. */
  /* A CAPS LABEL OVER EACH GROUP (ops 2.3): 11px at 500, a little tracked, in the lowest text ink, on the rows' text edge. */
  .p-group {
    margin: 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-1);
    color: var(--ink-3);
    font: var(--t-caps, 500 11px / 16px var(--font-ui));
    letter-spacing: var(--track-caps, 0.025em);
    text-transform: uppercase;
  }

  /* A ROW'S HEIGHT, 44, WITH A FINE POINTER OR A COARSE ONE, AND 56px ON A PHONE, where a result is two lines
     (`Result.svelte`) and is the phone's route to several places. What the row draws is `Result`'s; this is the box the
     arrow keys and the pointer walk. The wash is rounded `--r-pop`, a row's wash. */
  .p-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 40px;
    margin-block: 1px;
    padding: var(--sp-1) var(--sp-3) var(--sp-1) var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (pointer: coarse) {
    .p-row {
      min-block-size: var(--tap);
    }
  }

  /* ON A PHONE A ONE-LINE ROW IS A LIST ROW (44) AND A TWO-LINE ONE COMES TO 56 BY ITS OWN PADDING: 8 + 20 + 2 + 18 + 8.
     Every row was 56, so "Go to"'s single words floated in the middle of a two-line box. */
  @media (width < 640px) {
    .p-row {
      min-block-size: var(--row-h, 44px);
      padding-block: var(--row-pad-y, 8px);
    }
  }

  /* THE CURSOR ROW IS THE WASH, and the pointer moves the cursor, so hover and the cursor are one state. */
  .p-row[data-cursor] {
    background: var(--menu-row-fill, var(--hover));
    transition-duration: 0ms;
  }

  /* AND THE QUIET LINE STEPS UP ONE INK ON IT: `--ink-3` is measured against the ground, and over the wash in the dark
     scheme it falls under 4.5:1. */
  .p-row[data-cursor] :global(.result-line) {
    color: var(--ink-2);
  }

  /* THE KEY CAP HINT, on the cursor row at desktop width with a fine pointer, where the keyboard is. */
  .p-keys {
    display: none;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) and (width >= 900px) {
    .p-row[data-cursor] .p-keys {
      display: inline-flex;
    }
  }

  .p-looking {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--ink-3);
    line-height: var(--lead-ui, 20px);
  }

  .p-none {
    margin: 0;
    padding: var(--sp-5) var(--sp-3);
    color: var(--ink-3);
    line-height: var(--lh-body);
  }

  /* ASKING NEEDS A MODEL, over the hits a sentence also matched: one quiet line, its link the way on. */
  .p-needs {
    margin: 0;
    padding: var(--sp-3) var(--sp-3) 0;
    color: var(--ink-3);
    line-height: var(--lh-body);
  }

  /* ASK'S MARK IN THE FIELD, where Find has its magnifier: Slash's own glyph, so the mode is seen before anything is read. */
  .p-ask-mark {
    display: inline-grid;
    flex: none;
    color: var(--ink-2);
  }

  /* NEW AND FIND, quiet words at the field's end. */
  .p-mode {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    flex: none;
    min-block-size: var(--ctl-panel, 28px);
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: var(--r-pill, 999px);
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .p-mode:hover {
      background: var(--row-wash, var(--hover));
      color: var(--ink);
    }
  }

  /* IN ASK THE THREAD IS THE BODY: it fills what the palette has and scrolls inside it. */
  .palette[data-mode='ask'] {
    min-block-size: min(280px, 60dvh);
  }

  .p-left {
    margin-inline-start: auto;
  }

  /* THE FOOTER'S CONTROLS (`$lib/send`): who Ask talks to as a quiet menu, the rows attached as small rectangles, and @. */
  .p-attach {
    flex: 1 1 100%;
  }

  .p-to {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-3);
    background: var(--row-wash-press, var(--tile-2));
    border-radius: var(--r-pill, 999px);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .p-live {
    inline-size: 7px;
    block-size: 7px;
    background: var(--live);
    border-radius: var(--r-round);
  }

  .p-attached {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--btn-h-sm);
    padding-inline-start: var(--sp-3);
    background: var(--row-wash-press, var(--tile-2));
    border-radius: var(--r-pill, 999px);
    color: var(--ink);
  }

  .p-attached-name {
    overflow: hidden;
    max-inline-size: 160px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-attached-x,
  .p-at,
  .p-harder {
    display: inline-grid;
    place-items: center;
    min-inline-size: var(--btn-h-sm);
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-1);
    background: none;
    border: 0;
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    font: inherit;
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .p-harder {
    padding-inline: var(--sp-3);
    background: var(--row-wash-press, var(--tile-2));
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .p-attached-x:hover,
    .p-at:hover,
    .p-harder:hover {
      background: var(--row-wash, var(--hover));
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .p-to,
    .p-attached,
    .p-attached-x,
    .p-at,
    .p-harder {
      min-block-size: var(--tap);
    }
  }

  /* WHAT ENTER AND ESC DO is said where there are keys to press, and not under a thumb. */
  @media (hover: none) and (pointer: coarse) {
    .p-keys-hint {
      display: none;
    }
  }

  /* ON A PHONE, NEW AND FIND ARE THEIR GLYPHS, 44px each, so the field keeps its width; each says its name to a reader. */
  @media (width < 640px) {
    .p-mode {
      justify-content: center;
      min-inline-size: var(--tap);
      min-block-size: var(--tap);
      padding: 0;
    }

    .p-mode span {
      display: none;
    }

    .p-mode :global(svg) {
      inline-size: var(--icon-m);
      block-size: var(--icon-m);
    }
  }

  .p-cap {
    min-inline-size: 0;
  }

  .p-cap-hide {
    flex: none;
    padding: 0 var(--sp-1);
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  /* THE FOOTER WRAPS: the button drops under the sentence when the two do not fit side by side. */
  .p-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-2) calc(var(--sp-4) + var(--sp-1));
    border-block-start: 1px solid var(--sep, var(--rule));
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: var(--lead-cap, 16px);
  }

  /**
   * ON A PHONE THE PALETTE IS A SHEET FROM THE TOP EDGE, the full width: a 56px bar holding the field as a 44px well,
   * radius 12, and "Cancel" as a word at its end; the results drop down under it, as tall as they are and at most the
   * screen, and the scrim shows below. It comes down from the edge rather than growing from the middle.
   *
   * EACH INSET IS PAID HERE, ONCE. The top one is under the bar, because the palette sits in the top
   * layer and nothing of the shell's padding reaches it; the bottom one and the keyboard (`--kb`,
   * which `a11y/keyboard.ts` writes while one is up) are at the end of the list, so its last row can
   * still be scrolled clear of both.
   */
  @media (width < 640px) {
    .palette {
      inset-block: 0 auto;
      inline-size: 100%;
      block-size: auto;
      /* LESS THE KEYBOARD WHILE ONE IS UP (`--kb`), so Ask's foot and the last answer stay above the keys. */
      max-block-size: calc(100dvh - var(--kb, 0px));
      padding-block-start: env(safe-area-inset-top, 0px);
      border: 0;
      border-radius: 0 0 var(--r-sheet, 22px) var(--r-sheet, 22px);
      translate: 0;
    }

    @starting-style {
      .palette[open] {
        scale: 1;
        translate: 0 -12px;
      }
    }

    .palette:not([open]) {
      translate: 0 -12px;
      transition:
        opacity var(--d-panel-out) var(--ease-in),
        translate var(--d-panel-out) var(--ease-in),
        display var(--d-panel-out) allow-discrete,
        overlay var(--d-panel-out) allow-discrete;
    }

    .p-head {
      gap: var(--sp-2);
      min-block-size: 56px;
      padding-inline: var(--sp-3) var(--sp-2);
      border-block-end: 0;
    }

    /* THE FIELD IS A WELL: the glyph and the query inside a 44px fill, radius 12. */
    /* THE QUERY ON THE ROWS' TITLE EDGE (52): the well at 12, its glyph 12 into it, and 12 to the words. */
    .p-field {
      gap: var(--sp-3);
      min-block-size: var(--tap);
      padding-inline: var(--sp-3);
      background: var(--row-wash, var(--tile-2));
      box-shadow: inset 0 0 0 0.5px var(--g-line, transparent);
      border-radius: var(--r-pill, 999px);
    }

    .p-input {
      min-block-size: var(--tap);
      font-size: max(16px, var(--fs-body));
    }

    .p-close {
      display: inline-flex;
      align-items: center;
      flex: none;
      min-block-size: var(--tap);
      padding: 0 var(--sp-2);
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: var(--fs-body);
      font-weight: var(--fw-medium);
      cursor: pointer;
    }

    /* ONE EDGE DOWN THE SCREEN: the list's inset plus a row's own puts every glyph on the 16px gutter. */
    #palette-list {
      padding-inline: var(--sp-2);
      padding-block-end: calc(var(--kb) + env(safe-area-inset-bottom, 0px) + var(--sp-2));
    }
  }

  /* UNDER FORCED COLOURS the palette's edge is the system's text colour. */
  @media (forced-colors: active) {
    .palette {
      border: 1px solid CanvasText;
    }
  }

  /* NO GLASS WHERE IT CANNOT BLUR, OR WHERE LESS TRANSPARENCY IS ASKED FOR: the tile, solid. */
  @supports not (backdrop-filter: blur(1px)) {
    .palette {
      background: var(--tile);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .palette {
      background: var(--tile);
      backdrop-filter: none;
    }
  }
</style>
