<!--
  The palette: a centred dialog that reaches OBJECTS, not only the screens they live on.

  A 640px DIALOG 12vh FROM THE TOP, AND THE WHOLE SCREEN BELOW 640PX. It was a panel
  two thirds of the width, pinned to the inline end, and at 1440 it cut the page title in half and
  read as a second app beside the first. Centred and narrow, it sits over the page as one question
  being asked of it; on a phone the field is in the top bar and the results fill what is left. Each
  result is a glyph, a title and one line saying where it sits (`Result.svelte`), so the width a
  result needs is the width of its title and not of a row of columns.

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

  GLASS, THE STRONG ONE: 640 wide, level 2, radius `--r-lg`, a 52px field, and the
  results grouped under meta headings. Slash's answers are drawn in the same surface, under the same
  headings, rather than in a second panel.

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
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { since } from 'braindog-render';
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
  import { commands, type Act, type Creation } from './admit.ts';
  import { addRow, creation, offered, words as createWords } from './create.ts';
  import { customise, type Change, type Look, type Place } from './customise.ts';
  import { FILL, asked as pageAsked, maker as pageMaker, paging, pressed as pagePressed, rowTitle as pageRow, whoOf, type Paging } from './new-page.ts';
  import { apply as applyChange, keptNow, lookNow, pageMenu } from './customise-apply.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import { said as voiced } from '../voice.svelte.ts';
  import { spineOf, type SpineCounts } from '../spine.ts';
  import type { List, Recent } from '../record/palette.ts';
  import type { Hits, Reader } from '../record/palette-live.ts';
  import type { Metric } from '../record/api.ts';
  import { latest } from './latest.ts';
  import { palette as opener } from './open.svelte.ts';
  import { untrack } from 'svelte';
  import { ABOUT_WAIT, aboutRows, aboutWords, asksAbout } from './about.ts';
  import { capLine, drawProposal, drawReading, offersSlash, pass2Refused, secondPass, slashWords, type Drawn, type DrawnProposal } from './slash.ts';
  import Cited from '../ui/Cited.svelte';
  import SlashOut from '$lib/ui/SlashOut.svelte';
  import DecisionCard from '$lib/decide/DecisionCard.svelte';
  import type { About, SlashStatus } from '@braindog/client';

  let { open = $bindable(false), nav }: { open?: boolean; nav: NavEntry[] } = $props();

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
      me?: { level: string; lists: string[] | null; owner?: boolean };
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
   * SLASH'S MODE: the question asked, for the text that was in the box when it was asked, and what came back.
   *
   * KEYED ON THE TEXT, SO NOTHING ACCUMULATES (`50 §5.5` step 5). Typing anything else puts the palette back to its list at
   * once, with no effect to clear it, and `latest` drops an answer to a question the box has moved on from, so a slow read
   * cannot land over the next one. `Esc` in the mode goes back to the list and keeps the text; a second `Esc` closes.
   */
  /** Pass 2 under the rows: `null` while it is being written, then the proposal or the refusal, never both. */
  type Second = { drawn: DrawnProposal | null; refused: { fix: string; without: string | null; spent?: boolean } | null };
  let slash = $state<{ q: string; question: string; drawn: Drawn | null; fix: string | null; second: Second | null } | null>(null);
  const slashShown = $derived(slash !== null && slash.q === q ? slash : null);
  const unreached = (e: unknown) => ({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } });
  /* THE RECORD ON SCREEN, AT ITS OWN BASE. `page.url.origin` asked `/api/slash/*` at the bare host, which on the Cloud is
     no record at all: every ask from `/app/<slug>/…` went to the root and never reached the record it was typed on. */
  const client = () => import('@braindog/client').then(({ createClient }) => createClient({ base: apiBase() }));
  const slashAsk = latest((question: string) =>
    client()
      .then((c) => c.slashRead(question))
      .catch(unreached),
  );
  /* PASS 2 THROUGH ITS OWN `latest`, so a proposal written for an older question is dropped exactly as pass 1's rows are.
     THE REQUEST ITSELF IS NEVER ABORTED, which is `46 §5.5` step 11: Escape during pass 2 goes back to the list, and the
     proposal the engine was already writing is still filed on Decide. `latest` only decides whether the answer is drawn. */
  const slashPropose = latest((a: { question: string; askId: string }) =>
    client()
      .then((c) => c.slashAnswer(a.question, a.askId))
      .catch(unreached),
  );

  function askSlash(question: string) {
    const asked = q;
    slash = { q: asked, question, drawn: null, fix: null, second: null };
    cursor = 0;
    slashAsk.ask(question, (out) => {
      if (slash?.q !== asked) return;
      if (!out.ok) {
        slash = { q: asked, question, drawn: null, fix: 'refusal' in out ? out.refusal.fix : copy.slashNothing, second: null };
        return;
      }
      /* THE ASK ID GOES BACK WITH PASS 2, so the engine re-runs the predicate it already drafted instead of asking the model
         for a second one, which would be a second draft and a second ask for the same question. */
      const more = secondPass(out.value);
      slash = { q: asked, question, drawn: drawReading(out.value), fix: null, second: more ? { drawn: null, refused: null } : null };
      if (!more) return;
      slashPropose.ask({ question, askId: out.value.ask_id }, (said) => {
        if (slash?.q !== asked || slash.second === null) return;
        slash.second = said.ok
          ? { drawn: drawProposal(said.value, question), refused: null }
          : { drawn: null, refused: pass2Refused('refusal' in said ? said.refusal : { code: 'VALUE_MALFORMED', fix: copy.slashNothing }) };
      });
    });
  }

  /**
   * SLASH'S FILED PROPOSAL, DRAWN WHERE IT WAS ASKED, as the one decision card (DIRECTION §37): when it arrives the
   * keyboard is on it (`cursor` is -1, above the rows), Enter accepts it, a six-second Undo follows on its line, and the
   * line reads "Slash suggested · Mara accepted". `↓` goes down to the rows as ever, and `↑` from the first row comes
   * back to it. A proposal that moves money is not accepted by a key: Enter opens it on Decide, where Accept names the
   * amount.
   */
  const filed = $derived(slashShown?.second?.drawn?.card ?? null);
  let filedCard = $state<ReturnType<typeof DecisionCard> | null>(null);
  const armed = $derived(filed !== null && cursor === -1);
  $effect(() => {
    if (filed) untrack(() => (cursor = -1));
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
      ...lists.map((l) => screen(`/r/${l.id}`, l.name, l.icon)),
    ];
  });
  /** How it looks on this device and whether the screen behind has a page menu, read each time the palette opens. */
  let look = $state<Look>({});
  let pageHere = $state(false);
  /* WHERE A LOOK ROW'S CHANGE WOULD BE KEPT, read with the look each time the palette opens. */
  let lookKept = $state<'record' | 'pending' | 'device'>('device');

  let reading: Promise<Reader> | null = null;
  const reader = (): Promise<Reader> =>
    (reading ??= import('../record/palette-live.ts').then((m) => m.paletteReader(page.url.origin)));

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
   * WHAT THE NAME IN THE BOX IS, FOR THE NAME IT ANSWERS (`about.ts`, ENG-B02): the record's `about` read, asked once the
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
  const FIGURES = 'Figures';
  const OPEN_QUESTION = 'Open question';
  const RECENT = 'Recently changed';

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
        ? customise(parsed.text, { look, places, hidden: navPrefs.hidden, home: navPrefs.home, pageMenu: pageHere, kept: lookKept })
        : [],
    /* THE PAGE THE QUERY WOULD MAKE, in the same modes: found by its words with no name yet, a sentence once it has one. */
    page: parsed.prefix === null || parsed.prefix === '>' ? paging(parsed.text, pageWho) : null,
  });

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
  const aboutShown = $derived(known !== null && known.name === aboutName ? aboutRows(known.answer, known.name, shell.now ?? Date.now()) : []);

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
      .then((r) => Promise.all([r.recent(known, RECENT_CAP), r.figures(known)]))
      .then(
        ([recent, figures]) => {
          if (!gone) extra = { recent, figures };
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
    /* IN SLASH'S MODE THE LIST IS WHAT SLASH FOUND, AND NOTHING ELSE. They are rows like any other here, so the arrow keys,
       `↵` and the pointer walk them with no second mechanism, and each one is an address on the record. */
    if (slashShown)
      return (slashShown.drawn?.rows ?? []).map((r) => ({
        id: `s-${r.id}`,
        title: r.title,
        detail: listNamed.get(r.register)?.name ?? listName(r.register),
        href: r.href,
        group: copy.slashFound,
        icon: listNamed.get(r.register)?.icon ?? 'rows',
      }));
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
    if (prefix === null || prefix === '>') {
      /* THE FIFTH RULE IN A SURFACE SAID TO HAVE ONE. `19 §7`'s strict-prefix aliases outrank fuzzy
         matching, and that is about ORDER rather than about membership, so the exact set is the
         subset of what `starts()` already admits whose title begins with what was typed, rather than
         a separate `.toLowerCase().startsWith()` answering a different question.

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
      /* THE NEW PAGE ROW (PGS-C30), drawn as `new-page.ts` reads the query. THE SENTENCE GOES ABOVE EVERYTHING, with the
         add row and for its reason; found only by its words it sits among the commands, after them (below). With no
         name yet a press writes the sentence into the box, so `⇥` does the same. */
      const paged = every.find((c) => c.act === 'page');
      const pageRowOf = (group: string): Row | null =>
        paged && live.page ? { id: paged.id, title: pageRow(live.page), href: null, group, icon: paged.icon, act: paged.act, paging: live.page, ...(live.page.title === '' ? { complete: FILL } : {}) } : null;
      const pageSaid = pageAsked(text);
      const pageFirst = pageSaid ? pageRowOf(createWords.group) : null;
      if (pageFirst) out.push(pageFirst);
      const exact = admitted.filter((c) => starts(c.title) && c.title.toLowerCase().startsWith(needle));
      const rest = admitted.filter((c) => !exact.includes(c) && starts(c.title));
      out.push(
        ...[...exact, ...rest].map((c) => ({
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

    if (prefix === null || prefix === '/') {
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
    if ((prefix === null || prefix === '/') && isLive) {
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
    if (prefix === null && text === '')
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
    const question = offersSlash({ slash: slashHere, prefix, text, pending, places: kept.filter((r) => r.group !== copy.commands).length });
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
  const overflow = $derived(rows.find((r) => r.id === 'all' || r.id === 'slash'));

  const groups = $derived.by(() => {
    const out = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.id === 'all' || r.id === 'slash') continue;
      if (!out.has(r.group)) out.set(r.group, []);
      out.get(r.group)!.push(r);
    }
    /* Stable, so two groups of the same rank keep the order `search()` handed them over in. */
    return [...out].sort((a, b) => rankOf(a[0]) - rankOf(b[0]));
  });

  const flat = $derived([...groups.flatMap(([, r]) => r), ...(overflow ? [overflow] : [])]);

  /**
   * THE KEY A ROW'S TOOLTIP SHOWS COMES OUT OF THE REGISTRY, never out of this file.
   *
   * `19 §4` makes the keymap "a registry the dispatcher consults" so that the `?` sheet documents
   * the bindings by reading them and cannot drift. A palette row showing a key it spelled itself
   * would be the second list that rule exists to prevent, and it is the list that goes stale first,
   * because a row is edited far more often than a binding.
   */
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
      el.showModal();
      overlays.open();
      /* WHAT TODAY'S ASK BAR HANDED OVER, taken once and cleared, so the next open starts empty as it always has. */
      q = untrack(() => opener.seed);
      untrack(() => (opener.seed = ''));
      cursor = 0;
      slash = null;
      look = lookNow();
      lookKept = keptNow();
      pageHere = pageMenu() !== null;
      if (slashHere) warm();
      queueMicrotask(() => input?.focus());
    } else if (!open && el.open) {
      el.close();
      overlays.close();
    }
  });

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
    /* SLASH'S ROW ANSWERS IN THE PANEL, so it is the one row that leaves it open. */
    if (row.ask !== undefined) return askSlash(row.ask);
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
    if (row.act === 'page') {
      if (row.paging) void newPage(row.paging);
      return;
    }
    if (row.act === 'customise' && row.change) return customiseRun(row.change);
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
  async function add(c: Creation) {
    const list = addNamed.get(c.register) ?? listName(c.register);
    if (!isLive) return;
    let out: Awaited<ReturnType<typeof addRow>>;
    try {
      out = await addRow(c, Date.now(), apiBase(page.url));
    } catch {
      /* THE WRITE MODULE IS LOADED ON THE PRESS, so a dropped connection can fail the import before any request. */
      return void toasts.push(copy.writeNotReached, { intent: 'warn' });
    }
    if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
    const said = createWords.added(list, c.title);
    const back = out.back;
    toasts.push(out.filled.length > 0 ? `${said} ${copy.captureFilled(out.filled)}` : said, {
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
   * THE NEW PAGE ROW, PRESSED (PGS-C30): `new-page.ts` makes the page or files the suggestion, opens what it made and
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
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, flat.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, filed ? -1 : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      /* ON SLASH'S FILED PROPOSAL, Enter accepts it; where a key may not (money moves), it opens on Decide instead. */
      if (armed) {
        if (filedCard?.accept()) return;
        const decide = slashShown?.second?.drawn?.decide;
        if (decide && !filedCard?.answered()) {
          open = false;
          void goto(at(decide));
        }
        return;
      }
      run(flat[cursor]);
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
   * Click outside to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly inert, so the first thing anybody tries is clicking it, and
   * nothing happening is the only feedback they get. Esc has always worked, which is exactly why
   * this went unnoticed by whoever wrote it. A 640px dialog leaves most of a desktop screen dimmed
   * around it, and all of that is somewhere a pointer will aim.
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
    if (outside) open = false;
  }
</script>

<dialog bind:this={el} class="palette" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), slashShown ? (slash = null) : (open = false))} onclose={() => (open = false)}>
  <div class="p-head">
    <Icon name="search" size="m" />
    <input
      bind:this={input}
      bind:value={q}
      {onkeydown}
      class="p-input"
      type="text"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-activedescendant={activeId}
      aria-label={copy.paletteLabel}
      placeholder={copy.palettePlaceholder}
      spellcheck="false"
      autocomplete="off"
    />
    <!--
      A WAY OUT A THUMB CAN REACH.

      The only dismiss affordances were `Esc` and a click outside, and below 640px the palette is
      the whole screen, so `onbackdrop`'s "is this click outside the rect" test can never be true,
      and a phone has no Esc. So the app's only search, and the phone's only route to several
      places, was a screen you could enter and not leave except by choosing a result you did not
      want or using the OS back gesture.

      `19 §4` gives Esc the job of closing "the topmost layer, one per press"; this is the same verb
      for the pointer that has no Esc key. With a fine pointer on a wide screen it is not drawn:
      Esc and the dimmed page around the dialog are both there, and no key is printed to say so.
    -->
    <!-- THE COUNT, ANNOUNCED AND VISIBLE. `13 §7` asks for a debounced `role="status"`; a reader who
         can see the list still benefits from knowing twelve of forty-eight are on screen, and a
         reader who cannot has nothing else to tell them the list changed. -->
    <p class="p-count" role="status">{announced}</p>
    <button type="button" class="p-close tap" onclick={() => (open = false)} aria-label={copy.close}>
      <Icon name="close" size="m" />
    </button>
  </div>

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
  <div class="p-body">
    <!-- WHAT SLASH LOOKED FOR, BEFORE WHAT IT FOUND (`50 §5.5` step 5), so the rows are read against the question the record
         was actually asked. A draft that did not fit is a keyword search, and the line says that instead. -->
    {#if slashShown?.drawn}
      <p class="p-slash-where">
        {#if slashShown.drawn.where !== null}<span class="p-slash-label">{copy.slashWhere}</span> {slashShown.drawn.where}{:else if slashShown.drawn.q !== null}{copy.slashSearched(slashShown.drawn.q)}{/if}
      </p>
    {/if}
    <div id="palette-list" role="listbox" aria-label={copy.paletteLabel} aria-busy={pending || (slashShown !== null && slashShown.drawn === null && slashShown.fix === null)}>
      {#each groups as [group, items]}
        <div role="group" aria-label={group}>
          <p class="p-group" aria-hidden="true">{group}</p>
          {#each items as row (row.id)}
            {@render result(row)}
          {/each}
        </div>
      {/each}
      {#if overflow}{@render result(overflow)}{/if}
    </div>
    {#if slashShown}
      <!-- OUTSIDE THE LISTBOX, like the sentence below: the state of the ask and the fold are prose about the list. -->
      {#if slashShown.fix !== null}
        <p class="p-none">{slashShown.fix}</p>
      {:else if slashShown.drawn === null}
        <p class="p-none" role="status">{copy.slashAsking}</p>
      {:else}
        <!-- NO ROW IS NOT NOTHING WHEN A FIGURE WAS READ: pass 2 is asked on that figure (`secondPass`), and a line saying
             nothing answers would sit above the answer it gives. -->
        {#if slashShown.drawn.rows.length === 0 && slashShown.second === null}<p class="p-none">{copy.slashNothing}</p>{/if}
        <!-- PASS 2, UNDER THE ROWS AND NEVER INSTEAD OF THEM (`23 §7`): the rows were drawn by code before any of this was
             written, which is the only reason the budget sentence below can be true. -->
        {#if slashShown.second}
          <section class="p-slash-second" aria-label={slashWords.proposed}>
            {#if slashShown.second.refused}
              <p class="p-slash-said">{slashShown.second.refused.fix}</p>
              {#if slashShown.second.refused.without}<p class="p-slash-said">{slashShown.second.refused.without}</p>{/if}
              {#if slashShown.second.refused.spent}<SlashOut />{/if}
            {:else if slashShown.second.drawn}
              <!-- SLASH'S SENTENCE WITH ITS BRACES DRAWN, never printed (`Cited`): a row is a link to the row, a figure is
                   the figure. Following a link leaves the palette, as following any of its rows does; the listener is on
                   the paragraph because the links are `Cited`'s, and a link's click and its Enter both arrive here. -->
              {#if slashShown.second.drawn.text}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                <p
                  class="p-slash-text"
                  onclick={(e) => {
                    if (e.target instanceof Element && e.target.closest('a')) open = false;
                  }}
                >
                  <Cited text={slashShown.second.drawn.text} figures={slashShown.second.drawn.figures} />
                </p>
              {/if}
              {#if slashShown.second.drawn.card}
                <!-- THE ONE DECISION CARD, where it was asked. Outside the listbox, as everything about the ask is. -->
                <div class="p-slash-card" data-armed={armed ? '' : undefined}>
                  <DecisionCard bind:this={filedCard} question={slashShown.second.drawn.card} whole={false} />
                </div>
              {/if}
              {#if slashShown.second.drawn.decide}
                <a class="p-slash-decide tap" href={at(slashShown.second.drawn.decide)} onclick={() => (open = false)}>{slashWords.decide}</a>
              {/if}
              <!-- `23 §8`: EVERY ANSWER Slash GIVES CARRIES THE MODEL IN ITS FOOTER, ALWAYS. `drawProposal` never leaves it empty. -->
              <p class="p-slash-model">{slashShown.second.drawn.footer}</p>
            {:else}
              <p class="p-slash-said" role="status">{slashWords.proposing}</p>
            {/if}
          </section>
        {/if}
        <details class="p-slash-fold">
          <summary class="p-slash-summary tap">{copy.slashFold}</summary>
          <ul>
            {#each slashShown.drawn.fold as line}<li>{line}</li>{/each}
          </ul>
        </details>
      {/if}
    {:else if flat.length === 0 && !pending}
      <!-- A query matching nothing falls through to a fallback row when a model is configured.
           Without one the row, the status call and every "Ask BrainDog" button do not exist: ABSENT,
           not disabled (23 §8). This record has no model, so this is what you get.

           OUTSIDE THE LISTBOX, because it is a sentence about the list rather than a row in it. -->
      <p class="p-none">{hits?.fix ?? `${copy.noMatches} “${q}”`}</p>
    {/if}
  </div>

  <!-- A FOOTER ONLY WHEN THERE IS SOMETHING TO SAY IN IT. It held the query grammar in the identifier face,
       `> commands · # rows · @ people · / pages`, on every open, which read as a tool for the people who built it.
       The prefixes still work for whoever knows them; nothing on this surface teaches them now. -->
  <!-- `23 §8` AT 80 %: ONE LINE, HERE, ONCE A MONTH. Not a chip, not a modal, and gone for the month once hidden. -->
  {#if capShown && slashStatus}
    <footer class="p-foot">
      <span class="p-cap">{slashWords.capLine(slashStatus.asks.used, slashStatus.asks.cap, slashStatus.asks.resets)}</span>
      <button type="button" class="p-cap-hide tap" onclick={dismissCapLine}>{slashWords.capDismiss}</button>
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
    aria-selected={index === cursor}
    tabindex={-1}
    data-cursor={index === cursor ? '' : undefined}
    onmouseenter={() => (cursor = index)}
    onclick={() => run(row)}
  >
    <Result icon={row.icon} title={row.title} line={row.detail} value={row.value} tone={row.tone} />
    <!-- THE KEY CAP HINT, ON THE CURSOR ROW ONLY (the design system: "the cursor row is wash plus a key cap hint"): the row's own
         binding when it has one, so the slow path teaches the fast one, and `↵`, which is what runs it now. Drawn only at
         desktop width with a fine pointer (the style block says when), and `aria-hidden` so no key is read out as part of
         the option's name: the `?` sheet is where a screen reader hears the keymap. -->
    <span class="p-keys" aria-hidden="true">{#if bound}<Kbd keys={bound} />{/if}<Kbd keys="↵" /></span>
  </button>
{/snippet}

<style>
  /* THE BUTTON IS FOR A THUMB, and a fine pointer on a wide screen has Esc and the dimmed page
     around the dialog, so it is drawn only where neither is to hand. */
  .p-close {
    display: none;
  }

  /* THE COUNT IS THE SAME COUNT ON EVERY SCREEN, and this rule was once written INSIDE the phone's
     media block, so on a desktop the number lost its size and its tabular figures, which is the one
     property a count that changes on every keystroke needs: proportional digits make it twitch. */
  .p-count {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (pointer: coarse), (width < 640px) {
    .p-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      inline-size: var(--ctl-h);
      block-size: var(--ctl-h);
      padding: 0;
      border: 0;
      border-radius: var(--r-pill);
      background: var(--hover-wash);
      color: var(--ink2);
      cursor: pointer;
    }
  }

  /**
   * A 640px DIALOG, CENTRED, 12vh FROM THE TOP, and the whole screen below 640px.
   *
   * GLASS, THE STRONG ONE, AT LEVEL 2: the palette opens over whatever the page holds, and legibility over
   * busy content is what the strong glass is for. Radius `--r-lg`, the hairline pair and the floating shadow; no border.
   * Its height is its content's, up to what leaves the same 12vh free below it, and past that the list scrolls inside.
   *
   * THE EXPLICIT SIZES ARE NOT REDUNDANT: see `Sheet.svelte`. The UA stylesheet gives `<dialog>` a
   * `max-height: calc(100% - 6px - 2em)`, a matching `max-width` and an automatic margin on both
   * axes, and each of those would move or cut the dialog this places.
   */
  .palette {
    position: fixed;
    inset-block-start: 12vh;
    inset-block-end: auto;
    inset-inline: 0;
    z-index: var(--z-palette);
    display: flex;
    flex-direction: column;
    inline-size: 640px;
    max-inline-size: calc(100% - 2 * var(--gutter));
    block-size: auto;
    max-block-size: 76dvh;
    margin-block: 0;
    margin-inline: auto;
    padding: 0;
    background: var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    border: 0;
    border-radius: var(--r-lg);
    color: var(--ink);
    box-shadow: var(--glass-edge), var(--e2);
    overflow: hidden;
  }

  /* SAFARI'S GLASS, in a block of its own and reading the skin's one value, for the reason `Panel.svelte` gives: the
     build folds a prefixed line beside the one above into it. The token reaches Safari too (`tokens.css`), so a reader
     who asked for less transparency gets `none` here as everywhere (`a11y.css`). The phone's sheet below takes it away
     again. */
  @supports (-webkit-backdrop-filter: none) {
    .palette {
      -webkit-backdrop-filter: var(--glass-blur);
    }
  }

  /* NO ENTRANCE. It is opened from the keyboard far more often than from anything else, and nothing
     moves on a keyboard action. It is there on the frame the key is pressed. */
  .palette:not([open]) {
    display: none;
  }

  .palette[open] {
    display: flex;
  }

  /* `--scrim`, THE ONE *BEHIND*, and no blur on it: the blur is the palette's own glass, over the dimmed page. */
  .palette::backdrop {
    background: var(--scrim);
  }

  /* THE 52PX FIELD: the glyph, the query, the count. The hairline under it is the one rule in the panel. */
  .p-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: calc(var(--sp-7) + var(--sp-1));
    padding-block: 0;
    padding-inline: calc(var(--sp-4) + var(--sp-1)) var(--sp-4);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* The state change the input gave up. It is the row that looks like a field, so it is the row
     that says it is live, and it says it the way every focused field in the product does: its edge
     darkens toward the ink. Never the accent, which under the query read as a validation error
     before anything had been typed. */
  .p-head:focus-within {
    border-block-end-color: var(--ink2);
    color: var(--ink2);
  }

  /* A FULL-HEIGHT TARGET, and it was 262x28 on a phone: the palette's only text field, on the surface `19 §4` makes the
     primary way to reach a row. */
  .p-input {
    flex: 1;
    min-block-size: var(--ctl-h);
    min-inline-size: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink);
    font-size: var(--t-md);
  }

  /* A 2px ring plus a 4px halo drawn around a transparent, borderless input inside an already-modal
     dialog is a box floating in the middle of the panel around nothing: it frames the text,
     not a control, because there is no control there to frame. The blinking caret is the platform's
     own focus indicator for a text field and is what every command palette relies on; this panel
     opens with focus here and traps it, so there is nowhere else for focus to have gone.

     The ring is not simply deleted, though. It moves to `.p-head`, which is the thing that actually
     looks like a field, as a border tint rather than an outline, so there is still a visible change
     of state, it just belongs to the right box. */
  .p-input:focus-visible {
    /* focus-ok: the caret indicates focus here, and `.p-head:focus-within` above carries the state
       change for the field the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  .p-input::placeholder {
    color: var(--dim);
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
  .p-group {
    margin: 0;
    padding: var(--sp-3) var(--sp-2) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* A ROW'S HEIGHT, 44, WITH A FINE POINTER OR A COARSE ONE, AND 56px ON A PHONE, where a result is two lines
     (`Result.svelte`) and is the phone's route to several places. What the row draws is `Result`'s; this is the box the
     arrow keys and the pointer walk. The wash is rounded `--r-md`, a row's wash. */
  .p-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: max(var(--row-h), var(--tap));
    padding: var(--sp-1) var(--sp-2);
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (width < 640px) {
    .p-row {
      min-block-size: var(--row-h-2);
    }
  }

  /* THE CURSOR ROW IS THE WASH, and the pointer moves the cursor, so hover and the cursor are one state. */
  .p-row[data-cursor] {
    background: var(--hover-wash);
  }

  /* AND THE QUIET LINE STEPS UP ONE INK ON IT: `--dim` is measured against the ground, and over the wash in the dark
     scheme it falls under 4.5:1. */
  .p-row[data-cursor] :global(.result-line) {
    color: var(--ink2);
  }

  /* THE KEY CAP HINT, on the cursor row at desktop width with a fine pointer, where the keyboard is. */
  .p-keys {
    display: none;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) and (width >= 900px) {
    .p-row[data-cursor] .p-keys {
      display: inline-flex;
    }
  }

  .p-none {
    margin: 0;
    padding: var(--sp-5) var(--sp-3);
    color: var(--dim);
  }

  /* SLASH ANSWERS IN THE SAME SURFACE. What it looked for sits where a group heading sits, in the meta step,
     and the rows it found are grouped under their own heading like any others. EVERY LINE SLASH'S ANSWER DRAWS BREAKS
     WHERE IT MUST (`overflow-wrap: anywhere`): a predicate over a long value, a row's title or a model's name can be one
     unbroken word, and at 390px one of those would push the panel sideways. */
  .p-slash-where {
    margin: 0;
    padding: var(--sp-3) var(--sp-4) 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .p-slash-label {
    color: var(--dim);
    font-weight: 500;
  }

  /* THE FOLD IS FOLDED, AND IT IS THERE ON EVERY ASK. `23 §6`: its last line is the vault, refused, drawn every time. */
  .p-slash-fold {
    padding: var(--sp-2) var(--sp-4) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A 44px TARGET ON A COARSE POINTER through `.tap`, whose hit box grows past the line it sits on. */
  .p-slash-summary {
    cursor: pointer;
  }

  /* WORDS IN THE UI FACE, not the identifier face: a fold line is a sentence about a list, and nobody wrote it as code. */
  .p-slash-fold ul {
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  /* PASS 2, under the rows, set off by the one hairline, in the body step. */
  .p-slash-second {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4) 0;
    border-block-start: 1px solid var(--line);
  }

  .p-slash-text,
  .p-slash-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  /* THE FILED PROPOSAL'S CARD, its own container, ringed while the keyboard is on it, as a row is tinted. */
  .p-slash-card {
    container-type: inline-size;
    padding: var(--sp-3);
    border-radius: var(--r-md);
  }

  .p-slash-card[data-armed] {
    background: var(--hover-wash);
  }

  .p-slash-card > :global(.queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }

  /* A LINK IS INK WITH ITS UNDERLINE, never the brand's red, and a 44px target through `.tap`. */
  .p-slash-decide {
    align-self: flex-start;
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  /* RECEDED AND SMALL (`23 §8`), and still there on every proposal. */
  .p-slash-model {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .p-cap {
    min-inline-size: 0;
  }

  .p-cap-hide {
    flex: none;
    padding: 0 var(--sp-1);
    border: 0;
    background: none;
    color: var(--ink2);
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
    padding: var(--sp-2) var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /**
   * ON A PHONE THE PALETTE IS THE SCREEN, with the field in a top bar `--sticky` tall, because a
   * dialog floating over 390px would be a narrower screen inside the screen. It is a sheet there and
   * not glass: the whole screen, on the tile's surface.
   *
   * EACH INSET IS PAID HERE, ONCE. The top one is under the bar, because the palette sits in the top
   * layer and nothing of the shell's padding reaches it; the bottom one and the keyboard (`--kb`,
   * which `a11y/keyboard.ts` writes while one is up) are at the end of the list, so its last row can
   * still be scrolled clear of both.
   */
  @media (width < 640px) {
    .palette {
      inset-block: 0;
      inline-size: 100%;
      max-inline-size: 100%;
      block-size: 100dvh;
      max-block-size: 100dvh;
      padding-block-start: env(safe-area-inset-top, 0px);
      background: var(--bg);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      border-radius: 0;
      box-shadow: none;
    }

    .p-head {
      min-block-size: var(--sticky);
      padding-inline: var(--sp-4) var(--sp-3);
    }

    /* ONE EDGE DOWN THE SCREEN: the list's inset plus a row's own puts every glyph on the 16px gutter
       the field's glyph sits on in the bar above. */
    #palette-list {
      padding-inline: var(--sp-2);
      padding-block-end: calc(var(--kb) + env(safe-area-inset-bottom, 0px) + var(--sp-2));
    }
  }

  /* UNDER FORCED COLOURS the glass and the shadow are gone, so the palette's edge is a border. */
  @media (forced-colors: active) {
    .palette {
      border: 1px solid CanvasText;
    }
  }
</style>
