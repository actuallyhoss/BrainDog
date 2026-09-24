<!--
  The palette: a PANEL down one edge that reaches OBJECTS, not a box in the middle that reaches
  screens.

  IT WAS A 680px CENTRED DIALOG and that is the wrong shape for what is in it. This surface lists
  every command, every page, every saved list, every figure, every open question, the rows you
  changed last and every row the record answers with. In a centred box that is a column of
  thirty-two rows with two thirds of the screen dimmed and empty, and the page you are navigating
  FROM hidden underneath it. So it is now full height, hard against the inline end, at two thirds
  of the width: the room is what lets a question's whole sentence, a figure's reading and a row's
  reason sit on the line beside the name instead of being cut at an ellipsis, and the height is
  what lets the groups be read rather than scrolled. The remaining third still shows the page you
  came from, which is what makes it read as a panel on the app rather than a modal over it.
  `C:\Tools\legacy`'s Spark is the reference and its own comment makes the same argument in the
  same words.

  AND THE OBJECTS COME FIRST IN IT. The groups used to be ranked commands, destinations, pages,
  figures, decisions, with everything the record answered with underneath all of them, so typing
  four letters of the row on the screen behind the panel drew every command, page and figure that
  matched before it drew the row.
  `loop/REWORK.md` phase 3 item 5 asks for the other order and `rankOf` below is where it is
  written down.

  STILL A `<dialog>`. The element is not the shape: it is the focus trap, the inert background and
  the Escape that this surface would otherwise have to reimplement, and every one of those is
  wanted. What changed is where it is drawn.

  WHAT IS IN IT IS DECIDED BY A WRITTEN RULE. `admit.ts` holds it: three tests every command has to
  pass, plus the standing rule that a row which cannot run right now is absent rather than greyed
  out. The rule is enforced there, in `commands()`, so nothing in this file can add a row that
  fails it. This file applies the same standing rule to the objects it draws.

  EVERY ROW PRINTS ITS BINDING, AND THE LEGEND IS GONE. Grossman et al. (CHI 2007) measured the
  opposite of the obvious: the strongest visual hotkey feedback produced LESS hotkey use than a
  plain control, 50 per cent against 57.1. What a footer full of keys teaches is nothing, because
  nobody is looking at the footer. The moment a person is actually looking is the result row they
  are about to press, so the key is printed there, read from the keymap registry so it cannot drift
  from what is bound. The `?` sheet is still where the whole map lives.

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
  import { TONES, since } from 'braindog-render';
  import { copy } from '../copy.ts';
  import { terms, tokensOf } from '../record/find.ts';
  import { BINDINGS, overlays } from '../a11y/keys.svelte.ts';
  import { METRICS } from '../record/declared.ts';
  import { isTemplate, unreadable } from '../record/metrics.ts';
  import { AUDIT, NOW, QUESTIONS, REGISTERS, entry, iconFor, metric, search, type NavEntry } from '../record/api.ts';
  import { toasts } from '../ui/toast.svelte.ts';
  import Kbd from '../ui/Kbd.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/Icon.svelte';
  import { commands, type Act, type Creation } from './admit.ts';
  import { addable, addRow, creation, words as createWords } from './create.ts';
  import { savedViews } from '../record/views.ts';
  import { listsOf, type List, type Recent } from '../record/palette.ts';
  import type { Hits, Reader } from '../record/palette-live.ts';
  import type { Metric } from '../record/api.ts';
  import { latest } from './latest.ts';
  import { capLine, drawProposal, drawReading, offersSpark, pass2Refused, secondPass, sparkWords, type Drawn, type DrawnProposal } from './spark.ts';
  import type { SparkStatus } from '@braindog/client';

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
    spoken?: string | undefined;
    /** A binding id from the registry, printed on the trailing edge. Never a key spelled here. */
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
    /** The question Spark's row asks. Only that row carries it, and running it keeps the panel open. */
    ask?: string | undefined;
    /** The row the add row writes, read out of the query. Only that row carries it. */
    creation?: Creation | undefined;
  };

  let el = $state<HTMLDialogElement>();
  let input = $state<HTMLInputElement>();
  let q = $state('');
  let cursor = $state(0);

  /**
   * THE RECORD WHEN THERE IS ONE, AND THE SAMPLE WHEN THERE IS NOT.
   *
   * The lists, their counts and the questions waiting come from the shell, which read them from `boot`. What `boot`
   * does not carry, the record's search, the rows changed last and the figures, is asked of the record through
   * `record/palette-live.ts`, loaded the first time a live palette needs it. The sample's palette never loads it.
   */
  const shell = $derived(page.data as { live?: boolean; now?: number; index?: { registers?: List[] }; questions?: { id: string; title: string }[]; spark?: boolean });
  const isLive = $derived(shell.live === true);
  /** Whether a model is behind Spark on this host, which the shell asked `/api/version` once. The sample's is never `true`. */
  const sparkHere = $derived(isLive && shell.spark === true);

  /**
   * SPARK'S MODE: the question asked, for the text that was in the box when it was asked, and what came back.
   *
   * KEYED ON THE TEXT, SO NOTHING ACCUMULATES (`50 §5.5` step 5). Typing anything else puts the palette back to its list at
   * once, with no effect to clear it, and `latest` drops an answer to a question the box has moved on from, so a slow read
   * cannot land over the next one. `Esc` in the mode goes back to the list and keeps the text; a second `Esc` closes.
   */
  /** Pass 2 under the rows: `null` while it is being written, then the proposal or the refusal, never both. */
  type Second = { drawn: DrawnProposal | null; refused: { fix: string; without: string | null } | null };
  let spark = $state<{ q: string; question: string; drawn: Drawn | null; fix: string | null; second: Second | null } | null>(null);
  const sparkShown = $derived(spark !== null && spark.q === q ? spark : null);
  const unreached = (e: unknown) => ({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } });
  const client = () => import('@braindog/client').then(({ createClient }) => createClient({ base: page.url.origin }));
  const sparkAsk = latest((question: string) =>
    client()
      .then((c) => c.sparkRead(question))
      .catch(unreached),
  );
  /* PASS 2 THROUGH ITS OWN `latest`, so a proposal written for an older question is dropped exactly as pass 1's rows are.
     THE REQUEST ITSELF IS NEVER ABORTED, which is `46 §5.5` step 11: Escape during pass 2 goes back to the list, and the
     proposal the engine was already writing is still filed on Decide. `latest` only decides whether the answer is drawn. */
  const sparkPropose = latest((a: { question: string; askId: string }) =>
    client()
      .then((c) => c.sparkPropose(a.question, a.askId))
      .catch(unreached),
  );

  function askSpark(question: string) {
    const asked = q;
    spark = { q: asked, question, drawn: null, fix: null, second: null };
    cursor = 0;
    sparkAsk.ask(question, (out) => {
      if (spark?.q !== asked) return;
      if (!out.ok) {
        spark = { q: asked, question, drawn: null, fix: 'refusal' in out ? out.refusal.fix : copy.sparkNothing, second: null };
        return;
      }
      /* THE ASK ID GOES BACK WITH PASS 2, so the engine re-runs the predicate it already drafted instead of asking the model
         for a second one, which would be a second draft and a second ask for the same question. */
      const more = secondPass(out.value);
      spark = { q: asked, question, drawn: drawReading(out.value), fix: null, second: more ? { drawn: null, refused: null } : null };
      if (!more) return;
      sparkPropose.ask({ question, askId: out.value.ask_id }, (said) => {
        if (spark?.q !== asked || spark.second === null) return;
        spark.second = said.ok
          ? { drawn: drawProposal(said.value), refused: null }
          : { drawn: null, refused: pass2Refused('refusal' in said ? said.refusal : { code: 'VALUE_MALFORMED', fix: copy.sparkNothing }) };
      });
    });
  }

  /**
   * THE WARM-UP, AND THE ONE NUMBER IT BRINGS BACK (`46 §5.2`, `23 §8`). Opening the palette on a host with a model asks
   * `sparkStatus()` once, which builds the engine so the first question finds it built, and answers this month's asks, which
   * is all the 80 % line needs. A refused status is not drawn here: Settings shows it, and a palette opened to go somewhere
   * else is the wrong place for it.
   */
  let sparkStatus = $state<SparkStatus | null>(null);
  const CAP_LINE_KEY = 'braindog.palette.sparkCapLine';
  /* PER BROWSER, AND ALLOWED TO BE LOST. A private window forgets it and shows the line once more that month, which is the
     cheap way to be wrong; storage that throws is treated the same as storage that is empty. */
  let capDismissed = $state<string | null>(null);
  const capShown = $derived(sparkHere && sparkStatus !== null && capLine(sparkStatus, capDismissed));
  function warm() {
    try {
      capDismissed = localStorage.getItem(CAP_LINE_KEY);
    } catch {
      capDismissed = null;
    }
    void client()
      .then((c) => c.sparkStatus())
      .then(
        (out) => {
          if (out.ok) sparkStatus = out.value;
        },
        () => {},
      );
  }
  function dismissCapLine() {
    if (!sparkStatus) return;
    capDismissed = sparkStatus.asks.resets;
    try {
      localStorage.setItem(CAP_LINE_KEY, capDismissed);
    } catch {
      /* The line is hidden for this open either way; only next time's memory of it is lost. */
    }
    input?.focus();
  }
  const lists = $derived(listsOf(isLive, shell.index?.registers ?? []));
  const listNamed = $derived(new Map(lists.map((l) => [l.id, l])));

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

  /** The rows changed last and the figures, read once each time a live palette opens. */
  let extra = $state<{ recent: Recent[]; figures: Metric[] } | null>(null);

  /** Which register `@` narrows to. Named once, so the footer's promise and the filter cannot drift. */
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
   * `loop/REWORK.md` phase 3 item 5 asks for the other shape: a panel that reaches the OBJECTS the
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
    [copy.records]: 0,
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
   * HOW MANY ROWS THE PANEL DRAWS, and it is not the twenty a centred box could hold.
   *
   * Twenty was the cap while the surface was 680 by 620: past that the list was a scroller with no
   * end in sight, so the cut was kinder than the scroll. Full height at two thirds of the width
   * shows about thirty rows without moving, and the groups below the fold are ones a reader can
   * see the shape of. The cut is still there, because a palette that draws the whole record is a
   * register in a costume.
   */
  const CAP = 60;

  /**
   * AND HOW MANY OF THEM THE RECORD GETS, which used to be twelve.
   *
   * Twelve was `50 §5.5` step 3's number for a box that could show twenty rows in total. The panel
   * is not that box, and `search()`'s own default is twenty-four: the round-robin hands one hit per
   * source per round, so across nine sources a smaller budget is frequently one row per list, which
   * is the defect the rotation was added to fix showing up again at the cap.
   */
  const RECORD_CAP = 24;

  /**
   * WHAT IS WAITING ON YOU, capped.
   *
   * A decision with nothing typed is the one thing in the record that is about today, and the
   * panel has the height to say so. It is a cut and not the whole queue because a queue longer
   * than the panel is a screen: `/decide` is the door, and it is one row up in this same list.
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
    /* THE ROW THE QUERY WOULD ADD, in the modes that draw commands. Only a list this build can title a row in is
       offered, which is `addable`; any other name leaves the sentence as a query like any other. */
    creation: parsed.prefix === null || parsed.prefix === '>' ? creation(parsed.text, addable(lists)) : null,
  });

  /** Whether this query is one the record's search answers: `#`, `@` or no prefix, and two characters or more. */
  const searching = $derived((parsed.prefix === null || parsed.prefix === '#' || parsed.prefix === '@') && parsed.text.length > 1);

  /**
   * What the search answered for the text in the box, or `null` while the record has not answered it yet.
   *
   * THE SAMPLE ANSWERS AT ONCE, as it always has, so a demo never waits a frame for its own rows.
   */
  const hits = $derived.by((): Hits | null => {
    if (!searching) return null;
    if (!isLive) return { value: search(parsed.text, RECORD_CAP), fix: null };
    return found?.text === parsed.text ? found.hits : null;
  });

  /** A live query the record has not answered yet. The panel stays quiet rather than saying nothing matched. */
  const pending = $derived(searching && hits === null);

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
    /* IN SPARK'S MODE THE LIST IS WHAT SPARK FOUND, AND NOTHING ELSE. They are rows like any other here, so the arrow keys,
       `↵` and the pointer walk them with no second mechanism, and each one is an address on the record. */
    if (sparkShown)
      return (sparkShown.drawn?.rows ?? []).map((r) => ({
        id: `s-${r.id}`,
        title: r.title,
        detail: listNamed.get(r.register)?.name ?? REGISTERS[r.register]?.name ?? r.register,
        href: r.href,
        group: copy.sparkFound,
        spoken: r.spoken,
        icon: listNamed.get(r.register)?.icon ?? 'rows',
      }));
    const needle = text.toLowerCase();
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
    const out: Row[] = [];

    // Exact spoken id first, always. It is the string a person heard out loud.
    // AND THE LINE UNDER IT SAID SO. `spoken id` is what this repository calls the convention among
    // itself; the reader has just typed one, which is the whole proof they did not need the term.
    // The literal lived here rather than in `copy.ts`, which is why no rename had ever reached it.
    const spoken = SPOKEN.exec(text.toUpperCase());
    const qualified = QUALIFIED.exec(text);
    if (spoken) out.push({ id: 'spoken', title: text.toUpperCase(), detail: copy.openById, href: `/${text.toUpperCase()}`, group: copy.records, icon: 'arrow' });
    if (qualified) out.push({ id: 'qualified', title: text, detail: `${listNamed.get(qualified[1]!)?.name ?? REGISTERS[qualified[1]!]?.name ?? qualified[1]} row`, href: `/r/${qualified[1]}/${qualified[2]}`, group: copy.records, icon: 'arrow' });

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
      const admitted = every.filter((c) => c.act !== 'add');
      /* THE ADD ROW IS NOT FOUND BY ITS TITLE, it is made out of the query. `commands(live)` holds it only while
         `live.creation` does, so asking for it is asking the standing rule, and it is drawn as the sentence it will
         write rather than as its declaration's name. No `complete`: the box already says exactly what `⇥` would.
         IT IS A PLACE TO SPARK'S ROW, and so no question is offered under it, because a sentence that names a list
         and a title is a thing to write rather than a thing to ask about. */
      const adding = every.find((c) => c.act === 'add');
      if (adding && live.creation) {
        const made = live.creation;
        const list = listNamed.get(made.register)?.name ?? REGISTERS[made.register]?.name ?? made.register;
        out.push({ id: adding.id, title: createWords.row(list, made.title), href: null, group: createWords.group, icon: adding.icon, act: adding.act, creation: made });
      }
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
      /* THE SAVED VIEWS. `/v/<key>` is a real route with two real views on it and NOTHING in the
         app produced that address: 356 lines and eight copy keys behind a door with no handle. A
         view is a named list, which is what this section of the panel is for. */
      /* A LIVE RECORD'S VIEWS ARE PAGES, and the loop over `nav` above has already listed them; the sample's are its own. */
      for (const v of savedViews({ live: page.data.live === true, nav })) {
        const over = v.register === null ? undefined : REGISTERS[v.register];
        /* THE STANDING RULE, ON A SAVED VIEW. A view over a register this record does not hold is a
           door onto nothing: `/v/<key>` has no list to filter and no rows to draw. It was built
           anyway, wearing the register's raw id where its name should have been, which is a row
           that both cannot run and says so in the app's private vocabulary. */
        if (!over) continue;
        if (!starts(v.name) && !starts(over.name)) continue;
        out.push({
          id: `v-${v.key}`,
          title: v.name,
          detail: `${over.name} · saved view`,
          href: v.href,
          group: copy.pages,
          icon: 'filter',
          complete: v.name,
        });
      }
      for (const r of lists)
        if (starts(r.name))
          /* The count, not a definition of the word "register". A row that explains the app's own
             vocabulary is a row nobody needed, and it was doing it in every search. */
          out.push({ id: `r-${r.id}`, title: r.name, detail: `${r.count} rows`, href: `/r/${r.id}`, group: copy.pages, icon: r.icon, complete: r.name });
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
    } else if (prefix === null || prefix === '/') {
      for (const [id, decl] of Object.entries(METRICS)) {
        if (!starts(decl.name)) continue;
        if (isTemplate(decl) || unreadable(decl).length > 0) continue;
        const from = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
        if (from !== null && !REGISTERS[from]) continue;
        const read = metric(id);
        if (!read.href) continue;
        out.push({ id: `m-${id}`, title: read.label, value: read.value, detail: read.note, tone: read.tone, href: read.href, group: FIGURES, icon: 'observe', complete: read.label });
      }
    }

    /**
     * THE ROWS YOU CHANGED LAST, WHICH THIS PANEL COULD NOT REACH WITHOUT BEING TOLD THEIR NAMES.
     *
     * An open palette listed the commands, the pages, the saved views, the registers, the figures
     * and the questions, and not one row of the record. To get back to the obligation you edited ten
     * minutes ago you had to remember what it was called and type it, which is the whole failure
     * `loop/REWORK.md` phase 3 item 5 describes: a surface that reaches the screens objects live on
     * rather than the objects.
     *
     * NOTHING NEW IS STORED TO DO IT. The ledger already knows: `AUDIT` is newest first, and every
     * write against a row carries `register#seq` as its target, which is the same sentence the query
     * box takes. A visit is not a write and this build records none, so this is what was changed
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
        out.push({ id: `n-${r.target}`, title: r.title, detail: `${r.list} · ${since(r.at, shell.now ?? Date.now())}`, href: r.href, group: RECENT, spoken: r.spoken, icon: r.icon, complete: r.title });
    } else if (prefix === null && text === '') {
      const seen = new Set<string>();
      for (const event of AUDIT) {
        if (seen.size >= RECENT_CAP) break;
        /* THE REGEX THE QUERY BOX ALREADY USES. A ledger target and a typed `tasks#125` are the
           same sentence, so reading them two ways would be two grammars for one thing. */
        const [target, register, seq] = QUALIFIED.exec(event.target ?? '') ?? [];
        if (target === undefined || register === undefined || seq === undefined) continue;
        if (seen.has(target)) continue;
        const held = REGISTERS[register];
        const row = entry(register, Number(seq));
        if (!held || !row) continue;
        const title = String(row.fields[held.title] ?? '').trim();
        if (!title) continue;
        seen.add(target);
        out.push({
          id: `n-${target}`,
          title,
          /* WHEN, IN THE UNIT `/audit` SAYS IT IN. The ledger's own screen reads `since(e.at, NOW)`
             over the same events, and a row that said "3d ago" here and "2d ago" there would be two
             stories about one write. */
          detail: `${held.name} · ${since(event.at, NOW)}`,
          href: `/r/${register}/${seq}`,
          group: RECENT,
          spoken: `#${seq}`,
          icon: iconFor(held.icon, 'rows'),
          complete: title,
        });
      }
    }

    /**
     * AND WHAT IS WAITING ON YOU, WITH NOTHING TYPED.
     *
     * `search()` reaches the decisions the moment two characters are in the box, and before that
     * the panel listed nine destinations and said nothing about the four questions the record is
     * actually holding. That is the whole argument for the height: a command surface that opens on
     * an inventory of the record is a different object from one that opens on a menu of screens.
     *
     * Only with an empty query, because past that `search()` is already answering and a second
     * source for the same rows would draw each of them twice.
     */
    if (prefix === null && text === '')
      for (const question of (isLive ? (shell.questions ?? []) : QUESTIONS).slice(0, OPEN_CAP))
        out.push({ id: `q-${question.id}`, title: question.title, detail: OPEN_QUESTION, href: `/decide/${question.id}`, group: copy.decide, spoken: question.id, icon: 'decide', complete: question.title });

    /* `@` IS PEOPLE, AND IT MATCHED NOTHING. The footer of this palette prints `@ people` and this
       file's own header says the prefix works in every mode, and every branch that produces a row
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
         for a person had to read every obligation on the way. The width is what makes this pay:
         `search()` round-robins across the sources, so the groups are short and all of them fit. */
      for (const hit of kept)
        out.push({
          id: `h-${hit.href}`,
          title: hit.title,
          /* AND WHY IT IS IN THE LIST, when the title does not contain what was typed. `services`
             declares its provider searchable, so `nordhaven` now reaches three domains named after
             none of it: useful, and unreadable without the reason. */
          detail: hit.why ?? hit.detail,
          href: hit.href,
          group: hit.kind,
          spoken: hit.spoken,
          icon: hit.icon,
          complete: hit.title,
        });

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
     * AND SPARK'S ROW, LAST, WHEN NOTHING ELSE WAS A PLACE (`50 §5.5` step 5).
     *
     * A place is anything but an action: a page, a list, a figure, a row. With a model behind Spark and none of those
     * matched, the last row asks the record in words. Without a model `offersSpark` answers `null` and the row does not
     * exist, which is `23 §8`'s absent rather than disabled, and the only way the word Spark reaches this panel.
     */
    const kept = out.slice(0, CAP);
    const question = offersSpark({ spark: sparkHere, prefix, text, pending, places: kept.filter((r) => r.group !== copy.commands).length });
    if (question !== null) kept.push({ id: 'spark', title: copy.askSpark(question), href: null, group: '', icon: 'search', ask: question });
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
   * The overflow row is held out of the groups, so it can be drawn last and headingless, and so is Spark's row, for the
   * same reason: it is not one more result but the door out of the list. The two never meet, because the overflow needs
   * hits and Spark's row needs none.
   *
   * It stays in `flat`, which is what the arrow keys and Enter walk, so holding it out of the
   * headings costs it nothing a reader can feel.
   */
  const overflow = $derived(rows.find((r) => r.id === 'all' || r.id === 'spark'));

  const groups = $derived.by(() => {
    const out = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.id === 'all' || r.id === 'spark') continue;
      if (!out.has(r.group)) out.set(r.group, []);
      out.get(r.group)!.push(r);
    }
    /* Stable, so two groups of the same rank keep the order `search()` handed them over in. */
    return [...out].sort((a, b) => rankOf(a[0]) - rankOf(b[0]));
  });

  const flat = $derived([...groups.flatMap(([, r]) => r), ...(overflow ? [overflow] : [])]);

  /**
   * THE KEY A ROW PRINTS COMES OUT OF THE REGISTRY, never out of this file.
   *
   * `19 §4` makes the keymap "a registry the dispatcher consults" so that the `?` sheet documents
   * the bindings by reading them and cannot drift. A palette row printing a key it spelled itself
   * would be the second list that rule exists to prevent, and it is the list that goes stale first,
   * because a row is edited far more often than a binding.
   */
  const keyFor = (id: string | undefined): string | undefined => (id === undefined ? undefined : BINDINGS.find((b) => b.id === id)?.key);

  /* The two the panel itself owns, on the row rather than in a footer: see the header. */
  const RUN = keyFor('palette-run') ?? '↵';
  const COMPLETE = keyFor('palette-complete') ?? '⇥';

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
      q = '';
      cursor = 0;
      spark = null;
      if (sparkHere) warm();
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
    /* SPARK'S ROW ANSWERS IN THE PANEL, so it is the one row that leaves it open. */
    if (row.ask !== undefined) return askSpark(row.ask);
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
    if (row.href !== null) goto(at(row.href));
  }

  /**
   * THE ADD ROW, PRESSED: one row in the list the sentence named, and a receipt that can put it back.
   *
   * THE SAMPLE SAYS NOTHING WAS SAVED, as every other write on it does, in the same `notWritten` sentence. On a live
   * record `addRow` writes the list's own capture line with nothing pinned, so what it filled in for the reader is said
   * the way the list says it, and the receipt's Put back archives the row at the version the write answered. The shell
   * is read again after each, so the rail's count follows the row in and out.
   */
  async function add(c: Creation) {
    const list = listNamed.get(c.register)?.name ?? REGISTERS[c.register]?.name ?? c.register;
    if (!isLive) return void toasts.push(copy.notWritten(createWords.would(list, c.title)), { intent: 'warn' });
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

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, flat.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
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
   * this went unnoticed by whoever wrote it. It matters more now than it did: the panel leaves a
   * third of the page showing, which is a third of a page somebody will aim at.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the panel's own padding also targets
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

<dialog bind:this={el} class="palette" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), sparkShown ? (spark = null) : (open = false))} onclose={() => (open = false)}>
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

      The only dismiss affordances were `Esc` and a click outside, and below 640px the panel is
      `100vw x 100dvh`, so `onbackdrop`'s "is this click outside the rect" test can never be true.
      Measured: six taps at the edges and corners, all six left it open. The `<kbd>Esc</kbd>` beside
      the query is a label, not a control, and a phone has no Esc. So the app's only search, and the
      phone's only route to several places, was a screen you could enter and not leave except by
      choosing a result you did not want or using the OS back gesture.

      `19 §4` gives Esc the job of closing "the topmost layer, one per press"; this is the same verb
      for the pointer that has no Esc key. The `<kbd>` stays for the keyboard that does, and hides
      under a coarse pointer where it is advice nobody can take.
    -->
    <!-- THE COUNT, ANNOUNCED AND VISIBLE. `13 §7` asks for a debounced `role="status"`; a reader who
         can see the list still benefits from knowing twelve of forty-eight are on screen, and a
         reader who cannot has nothing else to tell them the list changed. -->
    <p class="p-count" role="status">{announced}</p>
    <kbd class="p-esc">Esc</kbd>
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
    <!-- WHAT SPARK LOOKED FOR, BEFORE WHAT IT FOUND (`50 §5.5` step 5), so the rows are read against the question the record
         was actually asked. A draft that did not fit is a keyword search, and the line says that instead. -->
    {#if sparkShown?.drawn}
      <p class="p-spark-where">
        {#if sparkShown.drawn.where !== null}<span class="p-spark-label">{copy.sparkWhere}</span> {sparkShown.drawn.where}{:else if sparkShown.drawn.q !== null}{copy.sparkSearched(sparkShown.drawn.q)}{/if}
      </p>
    {/if}
    <div id="palette-list" role="listbox" aria-label={copy.paletteLabel} aria-busy={pending || (sparkShown !== null && sparkShown.drawn === null && sparkShown.fix === null)}>
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
    {#if sparkShown}
      <!-- OUTSIDE THE LISTBOX, like the sentence below: the state of the ask and the fold are prose about the list. -->
      {#if sparkShown.fix !== null}
        <p class="p-none">{sparkShown.fix}</p>
      {:else if sparkShown.drawn === null}
        <p class="p-none" role="status">{copy.sparkAsking}</p>
      {:else}
        {#if sparkShown.drawn.rows.length === 0}<p class="p-none">{copy.sparkNothing}</p>{/if}
        <!-- PASS 2, UNDER THE ROWS AND NEVER INSTEAD OF THEM (`23 §7`): the rows were drawn by code before any of this was
             written, which is the only reason the budget sentence below can be true. -->
        {#if sparkShown.second}
          <section class="p-spark-second" aria-label={sparkWords.proposed}>
            {#if sparkShown.second.refused}
              <p class="p-spark-said">{sparkShown.second.refused.fix}</p>
              {#if sparkShown.second.refused.without}<p class="p-spark-said">{sparkShown.second.refused.without}</p>{/if}
            {:else if sparkShown.second.drawn}
              {#if sparkShown.second.drawn.text}<p class="p-spark-text">{sparkShown.second.drawn.text}</p>{/if}
              {#if sparkShown.second.drawn.decide}
                <a class="p-spark-decide" href={at(sparkShown.second.drawn.decide)} onclick={() => (open = false)}
                  >{sparkWords.decide(sparkShown.second.drawn.decide.slice('/decide/'.length))}</a
                >
              {/if}
              <!-- `23 §8`: EVERY SPARK OUTPUT CARRIES THE MODEL IN ITS FOOTER, ALWAYS. `drawProposal` never leaves it empty. -->
              <p class="p-spark-model">{sparkShown.second.drawn.footer}</p>
            {:else}
              <p class="p-spark-said" role="status">{sparkWords.proposing}</p>
            {/if}
          </section>
        {/if}
        <details class="p-spark-fold">
          <summary>{copy.sparkFold}</summary>
          <ul>
            {#each sparkShown.drawn.fold as line}<li>{line}</li>{/each}
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

  <!-- THE GRAMMAR, AND NOT THE KEYS. What is left down here is what the query box accepts, which is
       a thing you read once before typing; the keys moved onto the rows, where somebody is looking.
       `@ people` goes when the record has no people register, because a prefix that narrows to a
       list this record does not hold is an instruction that cannot be followed. -->
  <footer class="p-foot">
    <!-- `23 §8` AT 80 %: ONE LINE, HERE, ONCE A MONTH. Not a chip, not a modal, and gone for the month once hidden. -->
    {#if capShown && sparkStatus}
      <span class="p-cap">{sparkWords.capLine(sparkStatus.asks.used, sparkStatus.asks.cap, sparkStatus.asks.resets)}</span>
      <button type="button" class="p-cap-hide tap" onclick={dismissCapLine}>{sparkWords.capDismiss}</button>
    {/if}
    <span class="p-hint">&gt; commands · # rows{listNamed.has(PEOPLE) ? ' · @ people' : ''} · / pages</span>
  </footer>
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
    {#if row.icon}<Icon name={row.icon} size="m" />{/if}
    <span class="p-title">{row.title}</span>
    {#if row.spoken}<span class="p-spoken">{row.spoken}</span>{/if}
    <!-- THE GLYPH TRAVELS WITH THE TONE, always. `13 §5.1`: colour never carries meaning alone, and
         under simulated dichromacy the four intent hues collapse, which is not a tuning problem but
         an inescapable one (`13 §2.3`): five hues held to the same contrast target against the same
         ground necessarily have the same luminance. `Chip` has enforced this since it was written
         and this row drew a bare `data-intent` on a figure's reading, so a figure that is off target
         and one that is on it looked the same to somebody who does not see red and green apart. The
         `a11y` gate's own `intent-without-glyph` rule caught it, over 191 pages. -->
    {#if row.value}
      <span class="p-value" data-intent={row.tone}>
        {#if row.tone}<span class="p-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>{/if}
        {row.value}
      </span>
    {/if}
    {#if row.detail}<span class="p-detail">{row.detail}</span>{/if}
    <!-- THE BINDING, ON THE ROW. Grossman et al. found a legend teaches nothing because nobody is
         looking at it; this is the moment somebody is. The row's own binding is always printed, and
         the two the panel owns are printed on the row the cursor is on, which is the row about to
         be run. -->
    <span class="p-keys">
      {#if bound}<Kbd keys={bound} />{/if}
      {#if index === cursor}
        <Kbd keys={RUN} />
        {#if row.complete !== undefined}<Kbd keys={COMPLETE} />{/if}
      {/if}
    </span>
  </button>
{/snippet}

<style>
  /* THE KEY IS ADVICE FOR A KEYBOARD, AND THE BUTTON IS FOR A THUMB. Exactly one of them is on
     screen at a time, so the head never carries two ways to say the same thing. */
  .p-close {
    display: none;
  }

  /* THE COUNT IS THE SAME COUNT ON EVERY SCREEN, and this rule was written INSIDE the phone's media
     block. In the built CSS it came out as
     `@media (pointer:coarse),not (min-width:640px){.p-count{…}}`, so on a desktop the number
     rendered at `--t-ui` (15px) instead of `--t-xs` (12px), wrapped, and lost its tabular figures,
     which is the one property a count that changes on every keystroke actually needs, because
     proportional digits make it twitch. `css-rules` did not see it; a brace in the wrong place is
     valid CSS. */
  .p-count {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (pointer: coarse), (width < 640px) {
    .p-esc {
      display: none;
    }

    .p-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      inline-size: var(--ctl-h);
      block-size: var(--ctl-h);
      padding: 0;
      border: 0;
      background: none;
      color: var(--dim);
      cursor: pointer;
    }
  }

  /**
   * A PANEL DOWN THE EDGE, NOT A BOX IN THE MIDDLE.
   *
   * It was `min(680px, 100vw - 16px)` by `min(72dvh, 620px)`, floating over the centre, which is
   * what a command palette looks like everywhere and is wrong for this one. This surface lists the
   * commands, the pages, the saved lists, the figures, the open questions, the rows you changed
   * last and whatever the record answers with: in a 680px box that is a column with two thirds of
   * a 1440px screen dimmed and empty beside it, and the page you are navigating FROM completely
   * hidden.
   *
   * Two thirds of the width, full height, hard against the inline end. Floored so it is still a
   * panel on a small laptop and capped so it does not become the whole page on an ultrawide. The
   * width buys the row: a question's whole sentence, a figure's reading and target, a hit's reason
   * for being in the list, all on the line beside the name instead of behind an ellipsis. The
   * height buys the groups. And the third of the page still showing is what makes it read as a
   * panel on the app rather than a modal over it.
   *
   * COLUMNS ARE NOT TAKEN, and the reason is the keyboard. Spark flows its groups into CSS columns,
   * which the browser decides and the DOM does not record, so its arrow keys have to measure every
   * row's bounding box on every press to work out what is above what. That is a real mechanism and
   * it is not this change; a column layout without it would put `↓` on the row to the right.
   *
   * THE EXPLICIT SIZES ARE NOT REDUNDANT: see `Sheet.svelte`. The UA stylesheet gives `<dialog>` a
   * `height: fit-content` that beats the stretch two insets ask for, and a
   * `max-height: calc(100% - 6px - 2em)` and matching `max-width` that leave a dead strip of dimmed
   * page along two edges.
   */
  .palette {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    inset-inline-start: auto;
    z-index: var(--z-palette);
    display: flex;
    flex-direction: column;
    inline-size: clamp(560px, 66vw, 1100px);
    max-inline-size: 100%;
    block-size: 100dvh;
    max-block-size: 100dvh;
    margin: 0;
    padding: 0;
    background: var(--s1);
    border: 0;
    border-inline-start: 1px solid var(--line);
    color: var(--ink);
    box-shadow: var(--e3);
    overflow: hidden;
  }

  .palette:not([open]) {
    display: none;
  }

  .palette[open] {
    display: flex;
    animation: slide-in var(--d-enter) var(--ease-spring);
  }

  /* No `opacity: 0` in a start state: see Sheet.svelte. A CSS animation stays pending until its
     first rendered frame, and a dialog entering the top layer with sixty rows in it can wait a
     while for one. A stalled slide is a panel 24px out of place; a stalled fade is no panel, and
     this is the one surface somebody reaches for a hundred times a day. */
  @keyframes slide-in {
    from {
      transform: translateX(24px);
    }
  }

  /* `--scrim`, not a colour. This and `Sheet.svelte` each wrote their own `color-mix` over
     `black`, six per cent apart: two strengths of the same *behind*, and neither of them chosen.
     `colour-grep` was blind to both, because a colour with a name is not hex.

     IT DIMS A THIRD OF THE SCREEN NOW RATHER THAN ALL OF IT, because the panel covers the rest.
     That is the point of the shape and not a side effect: the page you came from stays legible
     beside the list you are searching it with. */
  .palette::backdrop {
    background: var(--scrim);
  }

  .p-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* The state change the input gave up. It is the row that looks like a field, so it is the row
     that should say it is live, and a border warming to the accent is a change a person reads
     without it reading as an error. */
  .p-head:focus-within {
    border-block-end-color: var(--accent);
    color: var(--ink2);
  }

  /* 262x28 ON A PHONE: the palette's only text field, sixteen pixels under the rule, on the surface
     `19 §4` makes the primary way to reach a row. `controls.css` carries a paragraph about 28px
     being exactly this mistake. Two gates missed it: it is outside `#main`, and while the `<dialog>`
     is closed it measures 0x0 and is filtered as not-on-screen. */
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
     dialog is a white box floating in the middle of the panel around nothing: it frames the text,
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

  .p-esc {
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    font-family: var(--font-id);
    font-size: var(--t-xs);
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
       and the panel grows instead of scrolling. */
    min-block-size: 0;
  }

  #palette-list {
    flex: 1;
    padding: var(--sp-2) var(--sp-3);
    overflow-y: auto;
  }

  .p-group {
    padding: var(--sp-3) var(--sp-2) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  /* `--ctl-h`, BECAUSE THESE ARE THE PHONE'S ROUTE TO SEVERAL PLACES. 38px, adjacent, with no gap
     between neighbours, in one scroller, on a surface whose whole job is to get somebody somewhere.
     `05 §6`: the pointer decides, and on a fine one this is still 32. */
  .p-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* The cursor row takes the rail's "here": `s2` and full ink, no accent wash. */
  .p-row[data-cursor] {
    background: var(--s2);
    color: var(--ink);
  }

  .p-row[data-cursor] :global(.icon) {
    color: var(--ink2);
  }

  /* A CAP, NOT A `flex: none`. A question's title is a whole sentence and the panel has the room for
     most of one; what it must not do is push the reading and the reason off the end of the row. */
  .p-title {
    flex: 0 1 auto;
    max-inline-size: 60ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-spoken {
    flex: none;
    padding: 0 5px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* A FIGURE'S READING, IN THE INTENT IT WAS MEASURED AGAINST. `data-intent` is `blocks.css`'s
     map and the only place an intent becomes a colour; with no tone declared the figure is ordinary
     text, which is right, because a number with no verdict on it is not news. */
  /* The glyph rides the value's own colour and sits tight against it: it is one reading, not a
     figure with a badge next to it. Sized in `em` for the same reason it inherits the colour — it
     is a slightly quieter mark on `.p-value`'s own size, not a fixed size of its own, and
     `.p-value` itself is not fixed to one `--t-*` step everywhere this row renders. */
  .p-glyph {
    margin-inline-end: 3px;
    font-size: 0.9em;
  }

  .p-value {
    flex: none;
    color: var(--tone, var(--ink));
    font-variant-numeric: tabular-nums;
  }

  .p-detail {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Pushed to the trailing edge, and it keeps its place when it is empty so the rows do not shuffle
     as the cursor moves down them. */
  .p-keys {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    flex: none;
  }

  .p-none {
    padding: var(--sp-5) var(--sp-3);
    color: var(--dim);
  }

  .p-spark-where {
    margin: 0;
    padding: var(--sp-3) var(--sp-4) 0;
    color: var(--ink2);
  }

  .p-spark-label {
    color: var(--dim);
  }

  /* THE FOLD IS FOLDED, AND IT IS THERE ON EVERY ASK. `23 §6`: its last line is the vault, refused, drawn every time. */
  .p-spark-fold {
    padding: var(--sp-2) var(--sp-4) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .p-spark-fold ul {
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .p-spark-second {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4) 0;
    border-block-start: 1px solid var(--line);
  }

  .p-spark-text,
  .p-spark-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    line-height: var(--lh-body);
  }

  .p-spark-decide {
    align-self: flex-start;
    color: var(--accent);
  }

  /* RECEDED, SMALL, MONO (`23 §8`), and still there on every proposal. */
  .p-spark-model {
    margin: 0;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
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

  .p-foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .p-hint {
    margin-inline-start: auto;
    font-family: var(--font-id);
  }

  /* THE PHONE HAS NO THIRD OF A PAGE TO SPARE. Below 640 the panel is the screen, which is what it
     already was, and the only thing the new shape changes is that it no longer has a corner. */
  @media (width < 640px) {
    .palette {
      inline-size: 100vw;
      border-inline-start: 0;
    }

    .p-title {
      max-inline-size: none;
    }

    /* The keys are advice for a keyboard that is not there, and they cost the row the width its
       detail needs. `05 §6`: the pointer decides. */
    .p-keys {
      display: none;
    }

    .p-hint {
      display: none;
    }
  }
</style>
