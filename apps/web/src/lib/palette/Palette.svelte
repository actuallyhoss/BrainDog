<!--
  The palette: ONE surface, one grammar, and a `<dialog>` combobox.

  Prefixes work in EVERY mode — `>` commands, `#` rows, `@` people, `/` pages and registers, none =
  everything ranked. GitHub's palette has one grammar per mode and a second opener that fast-paths
  you into it; both are refused here, so there is no command mode and no second opener (19 §4).

  A bare spoken id resolves directly — D41, SG23 — because ids in this product are said out loud and
  must be typeable exactly as heard. The one exception is `#125`: every register has a `#1`, so it
  never resolves bare. Type `tasks#125`.

  `⇥` COMPLETES THE QUERY AND NOTHING ELSE. Raycast rebinds it to "abandon the query and submit to
  AI", unconditionally, even with no text typed — and in a search input `⇥` universally means
  complete. Losing a half-typed query to a chat is a real cost.

  EVERY ROW PRINTS ITS BINDING on the trailing edge. This is the highest-leverage single component
  in the spec: the palette becomes the shortcut teacher, the slow path and the fast path are the same
  list, and there is no cheat sheet to keep in sync.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { copy } from '../copy.ts';
  import { terms, tokensOf } from '../record/find.ts';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { REGISTERS, ROWS, VIEWS, iconFor, search, type NavEntry, type SearchHit } from '../record/api.ts';
  import Kbd from '../ui/Kbd.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/Icon.svelte';

  let { open = $bindable(false), nav }: { open?: boolean; nav: NavEntry[] } = $props();

  type Row = {
    id: string;
    title: string;
    href: string;
    group: string;
    detail?: string | undefined;
    keys?: string | undefined;
    icon?: IconName | undefined;
    spoken?: string | undefined;
    /**
     * WHAT `⇥` TURNS THE QUERY INTO, when this row is one a query can become.
     *
     * Absent means completion skips the row. It has to be a field rather than a rule about titles,
     * because the row that broke this HAS a title — the overflow row reads *All 484 matches for
     * “ren”*, and pressing `⇥` on it wrote that sentence into the box and dropped the list to
     * *Nothing matches*. The comment above it asserted that could not happen, on the grounds that
     * *"completion reads `flat[cursor]` only when the row carries a `title` a query can become"* —
     * which was a description of a guard that was never written. This is the guard.
     *
     * `19 §7`'s Raycast rule is the whole reason `⇥` exists here, and this file's own header names
     * losing a half-typed query as the failure it is copied to avoid.
     */
    complete?: string | undefined;
  };

  let el = $state<HTMLDialogElement>();
  let input = $state<HTMLInputElement>();
  let q = $state('');
  let cursor = $state(0);

  const COMMANDS: Row[] = [
    { id: 'c-home', title: copy.home, href: '/', group: copy.destinations, keys: 'g h', icon: 'home' },
    { id: 'c-decide', title: copy.decide, href: '/decide', group: copy.destinations, keys: 'g d', icon: 'decide' },
    { id: 'c-inbox', title: copy.inbox, href: '/inbox', group: copy.destinations, keys: 'g i', icon: 'inbox' },
    { id: 'c-vault', title: copy.vault, href: '/vault', group: copy.destinations, keys: 'g v', icon: 'vault' },
    { id: 'c-packs', title: copy.packs, href: '/packs', group: copy.destinations, keys: 'g p', icon: 'packs' },
    { id: 'c-settings', title: copy.settings, href: '/settings/appearance', group: copy.destinations, keys: 'g ,', icon: 'settings' },
    /* THE ONE `g`-CHORD THE SHORTCUT TEACHER DID NOT TEACH. `g s` was bound, the `?` sheet
       advertised it, and `/search` appeared in no nav, no tab bar, no More sheet and not here — so
       typing `sear` found nothing, and on a phone the route was reachable only from the palette's
       overflow row, which is to say only from inside the cap it exists to relieve. */
    { id: 'c-search', title: copy.search, href: '/search', group: copy.destinations, keys: 'g s', icon: 'search' },
    { id: 'c-audit', title: copy.audit, href: '/audit', group: copy.destinations, icon: 'clock' },
      { id: 'c-keys', title: copy.keymap, href: '/settings/keyboard', group: copy.commands, keys: '?', icon: 'keyboard' },
  ];

/** Which register `@` narrows to. Named once, so the footer's promise and the filter cannot drift. */
  const PEOPLE = 'people';

  /** 34 §4's two regexes: a prefixed spoken id, and `register#seq`. `#125` is plain text. */
  const SPOKEN = /^([A-Z]{1,3})(\d+)$/;
  const QUALIFIED = /^([a-z][a-z0-9_]*)#(\d+)$/;

  const parsed = $derived.by(() => {
    const raw = q.trim();
    const prefix = ['>', '#', '@', '/'].includes(raw[0] ?? '') ? raw[0]! : null;
    return { prefix, text: prefix ? raw.slice(1).trim() : raw };
  });

  /**
   * How many rows the record matched, beside how many of them are drawn.
   *
   * BOTH NUMBERS USED TO BE THE WRONG ONES. The numerator was `flat.length` — every row in the
   * list, command rows and register destinations and the overflow row itself — so `ren` announced
   * *14 of 484* over twelve record hits. The denominator ignored the prefix, so `@ha` announced
   * *2 of 5*: the `@` filter had narrowed the list to people and the total still counted the rows
   * it had just excluded. The honest answer there is *2 of 2*.
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
    /**
     * ONE QUERY MEANS ONE THING IN THIS DIALOG, and four groups still disagreed.
     *
     * The records group is prefix-on-token; commands, pages, saved views and registers were
     * `.toLowerCase().includes(needle)`. So in one list: `ate` found *Updates*, `enew` found
     * *Renewals*, `ing` found *Settings* and *Lapsing*, and none of those would have found a row.
     * `api.ts`'s own comment argues the questions group had to converge because *"a query that means
     * one thing in eight groups and another in the ninth is a query nobody can reason about"* — which
     * is exactly as true of four groups in one dialog.
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
       * no filter, and a cleared box shows the list. Here it meant that typing `?` or `-` or `.` —
       * one character, no letters, no digits — matched every command, every page, every saved view
       * and every register, and the dialog filled with twenty rows announcing "20".
       *
       * The difference is whether anything was TYPED. Nothing typed is the default list, which is
       * what a freshly opened palette should show. Something typed that cannot be a query matched
       * nothing, and saying so is the honest answer — the same answer the record would give.
       */
      if (!want) return text.trim() === '';
      const has = tokensOf(title);
      return want.every((w) => has.some((tok) => tok.startsWith(w)));
    };
    const out: Row[] = [];

    // Exact spoken id first, always. It is the string a person heard out loud.
    const spoken = SPOKEN.exec(text.toUpperCase());
    const qualified = QUALIFIED.exec(text);
    if (spoken) out.push({ id: 'spoken', title: text.toUpperCase(), detail: 'Open by spoken id', href: `/${text.toUpperCase()}`, group: copy.records, icon: 'arrow' });
    if (qualified) out.push({ id: 'qualified', title: text, detail: `${REGISTERS[qualified[1]!]?.name ?? qualified[1]} row`, href: `/r/${qualified[1]}/${qualified[2]}`, group: copy.records, icon: 'arrow' });

    // Strict-prefix aliases outrank fuzzy matching. It is the only verified mechanism found that
    // keeps a growing action index from rotting (19 §7).
    if (prefix === null || prefix === '>') {
      /* THE FIFTH RULE IN A DIALOG SAID TO HAVE ONE. `19 §7`'s strict-prefix aliases outrank fuzzy
         matching, and that is about ORDER rather than about membership — so the exact set is the
         subset of what `starts()` already admits whose title begins with what was typed, rather than
         a separate `.toLowerCase().startsWith()` answering a different question. */
      const exact = COMMANDS.filter((c) => starts(c.title) && c.title.toLowerCase().startsWith(needle));
      const rest = COMMANDS.filter((c) => !exact.includes(c) && starts(c.title));
      out.push(...[...exact, ...rest].map((c) => ({ ...c, complete: c.title })));
    }

    if (prefix === null || prefix === '/') {
      /* EVERY ROW WEARS ITS OWN GLYPH. The ten commands each carried a real one and then every
         other row in the palette fell back to the same arrow, which is the one surface where a
         person is scanning a mixed list at speed and the glyph is the only thing separating a page
         from a list from a row. Both declarations already name an icon; the rail has been drawing
         them all along and this was throwing them away. */
      for (const entry of nav)
        if (starts(entry.title))
          out.push({ id: `p-${entry.id}`, title: entry.title, detail: `${entry.section} page`, href: entry.href, group: copy.pages, icon: entry.icon, complete: entry.title });
      /* THE SAVED VIEWS. `/v/<key>` is a real route with two real views on it and NOTHING in the
         app produced that address — 356 lines and eight copy keys behind a door with no handle. A
         view is a named list, which is what this section of the palette is for. */
      for (const [key, v] of Object.entries(VIEWS))
        if (starts(v.name) || starts(REGISTERS[v.register]?.name ?? ''))
          out.push({
            id: `v-${key}`,
            title: v.name,
            detail: `${REGISTERS[v.register]?.name ?? v.register} · saved view`,
            href: `/v/${key}`,
            group: copy.pages,
            icon: 'filter',
            complete: v.name,
          });
      for (const r of Object.values(REGISTERS))
        if (starts(r.name))
          /* The count, not a definition of the word "register". A row that explains the app's own
             vocabulary is a row nobody needed, and it was doing it in every search. */
          out.push({ id: `r-${r.id}`, title: r.name, detail: `${(ROWS[r.id] ?? []).length} rows`, href: `/r/${r.id}`, group: copy.pages, icon: iconFor(r.icon, 'rows'), complete: r.name });
    }

    /* `@` IS PEOPLE, AND IT MATCHED NOTHING. The footer of this palette prints `@ people` and this
       file's own header says the prefix works in every mode — and every branch that produces a row
       was guarded on a prefix that is not `@`, so typing a colleague's name behind it fell straight
       through to "Nothing matches". The record has a people register; the search already reaches it;
       the only thing missing was the register this prefix narrows to. */
    /**
     * TWELVE, AND THE NUMBER IS `50 §5.5` STEP 3'S. It asked for eight and printed eight and said
     * nothing about the rest — and because the round-robin hands one hit per source per round, a
     * budget of eight across nine sources is frequently one row per list. `search()` reports what
     * it did not return now, and the row below says so.
     */
    if ((prefix === null || prefix === '#' || prefix === '@') && text.length > 1) {
      const found = search(text, 12);
      const kept = found.hits.filter((hit) => prefix !== '@' || hit.href.startsWith(`/r/${PEOPLE}/`));
      /* THE TOTAL IS THE SCOPE'S, NOT THE RECORD'S. `@` narrows to one register, so the number the
         status line compares against has to be that register's count — read off the group `search()`
         already returns rather than recounted, so the two can never disagree. */
      total = prefix === '@' ? (found.groups.find((g) => g.href?.startsWith(`/r/${PEOPLE}?`))?.total ?? kept.length) : found.total;
      drawn = kept.length;
      for (const hit of kept)
        out.push({
          id: `h-${hit.href}`,
          title: hit.title,
          /* AND WHY IT IS IN THE LIST, when the title does not contain what was typed. `services`
             declares its provider searchable, so `nordhaven` now reaches three domains named after
             none of it — useful, and unreadable without the reason. */
          detail: hit.why ?? hit.detail,
          href: hit.href,
          group: copy.records,
          spoken: hit.spoken,
          icon: hit.icon,
          complete: hit.title,
        });

      /**
       * AND THE OVERFLOW IS A ROW, NOT A CAPTION.
       *
       * `19 §2` names `/search?q=` a spine screen — *"the structured fallback when the palette's
       * ranked list was not enough"* — so what is missing has somewhere to go, and a row is how you
       * get there: it takes the arrow keys and Enter like every other result, which a caption
       * cannot. The shape already ships in this product at `r/[register]/[seq]`, where a capped
       * backlink list ends in `All 400 →`.
       *
       * `⇥` NEVER LANDS ON IT, and it used to. The row carries no `complete`, which is the guard the
       * sentence that used to be here only described — pressing `⇥` on it wrote *All 484 matches for
       * “ren”* into the box.
       *
       * AND `@` GETS ONE TOO. It was suppressed for that prefix, so a capped list of people was
       * silent — exactly the defect being fixed for the unprefixed case, on the branch where the cap
       * bites soonest because the filter throws most of the budget away. Its door is the people
       * register rather than `/search`, because `@` is already a question about one list.
       */
      if (total > drawn)
        out.push({
          id: 'all',
          title: copy.allMatches(total, text),
          detail: '',
          href: prefix === '@' ? `/r/${PEOPLE}?q=${encodeURIComponent(text)}` : `/search?q=${encodeURIComponent(text)}`,
          group: copy.records,
          icon: 'search',
        });
    }

    return out.slice(0, 20);
  });

  /**
   * THE RESULT COUNT, DEBOUNCED, which `13 §7` and `50 §5.5` step 1 both ask for and neither got.
   *
   * `13 §7`'s last row: *"a **debounced** `role="status"` for the result count — an undebounced live
   * region announces on every keystroke and is unusable."* 250 ms is `50 §5.5`'s number. Without it
   * a screen reader hears a number for every letter typed; without the region at all, which is what
   * shipped, it hears nothing and the list simply changes underneath.
   */
  let announced = $state('');

  $effect(() => {
    /* `drawn` AND NOT `flat.length`. The status line is about the record's ANSWER, and `flat` is
       every row in the dialog — the commands, the destinations, and the overflow row whose entire
       job is to say the answer was cut. Announcing *14 of 484* over twelve hits counted the
       sentence about the cap as one of the things it was counting.

       `flat` is still READ, because `drawn` is a plain variable assigned inside the `rows` derived
       and reading it does not subscribe to anything. Reading `flat` subscribes to `rows`, which is
       what recomputes it. Delete this line and the announcement freezes on the first query. */
    void flat;
    /**
     * AND A LIST WITH ROWS IN IT SAYS SOMETHING — once something has been typed.
     *
     * `drawn` counts record hits, so `>` and `/`, which never produce any, announced nothing at all
     * on a dialog full of results. And the other edge is the freshly opened palette: no query, every
     * destination listed, and a confident **"20"** about a list nobody asked for. A status line is
     * the answer to a question; with no question there is no answer, and the silence is correct.
     */
    const said = !parsed.text ? '' : drawn > 0 ? copy.showingOf(drawn, total) : flat.length > 0 ? copy.showingOf(flat.length, flat.length) : '';
    const t = setTimeout(() => (announced = said), 250);
    return () => clearTimeout(t);
  });

  const groups = $derived.by(() => {
    const out = new Map<string, Row[]>();
    for (const r of rows) {
      if (!out.has(r.group)) out.set(r.group, []);
      out.get(r.group)!.push(r);
    }
    return [...out];
  });

  const flat = $derived(groups.flatMap(([, r]) => r));

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
      q = '';
      cursor = 0;
      queueMicrotask(() => input?.focus());
    } else if (!open && el.open) {
      el.close();
      overlays.close();
    }
  });

  function run(row: Row | undefined) {
    if (!row) return;
    open = false;
    goto(row.href);
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
    } else if (e.key === 'Tab') {
      /* Complete the query. Nothing else — and only into a row that says what it completes to. A
         row without `complete` swallows the key rather than passing focus out of the dialog, which
         is what `⇥` means inside a combobox. */
      e.preventDefault();
      const top = flat[cursor];
      if (top?.complete !== undefined) q = (parsed.prefix ?? '') + top.complete;
    }
  }

  /**
   * Click the backdrop to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly dimmed and visibly inert, so the first thing anybody tries is
   * clicking it, and nothing happening is the only feedback they get. Esc has always worked, which
   * is exactly why this went unnoticed by whoever wrote it.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the dialog's own padding also targets
   * the dialog, so identity would close the panel when somebody clicks the gap beside its title.
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

<dialog bind:this={el} class="palette" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), (open = false))} onclose={() => (open = false)}>
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
      aria-label={copy.paletteLabel}
      placeholder={copy.palettePlaceholder}
      spellcheck="false"
      autocomplete="off"
    />
    <!--
      A WAY OUT A THUMB CAN REACH.

      The only dismiss affordances were `Esc` and a backdrop click — and below 640px the dialog is
      `100vw x 100dvh`, so `onbackdrop`'s "is this click outside the rect" test can never be true.
      Measured: six taps at the edges and corners, all six left it open. The `<kbd>Esc</kbd>` beside
      the query is a label, not a control, and a phone has no Esc. So the app's only search — and the
      phone's only route to several places — was a screen you could enter and not leave except by
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

  <div class="p-body" id="palette-list" role="listbox" aria-label={copy.paletteLabel}>
    {#each groups as [group, items]}
      <p class="p-group">{group}</p>
      {#each items as row (row.id)}
        {@const index = flat.indexOf(row)}
        <button
          type="button"
          class="p-row"
          role="option"
          aria-selected={index === cursor}
          data-cursor={index === cursor ? '' : undefined}
          onmouseenter={() => (cursor = index)}
          onclick={() => run(row)}
        >
          {#if row.icon}<Icon name={row.icon} size="m" />{/if}
          <span class="p-title">{row.title}</span>
          {#if row.spoken}<span class="p-spoken">{row.spoken}</span>{/if}
          {#if row.detail}<span class="p-detail">{row.detail}</span>{/if}
          {#if row.keys}<Kbd keys={row.keys} />{/if}
        </button>
      {/each}
    {:else}
      <!-- A query matching nothing falls through to a fallback row when a model is configured.
           Without one the row, the status call and every "Ask BrainDog" button do not exist — ABSENT,
           not disabled (23 §8). This record has no model, so this is what you get. -->
      <p class="p-none">{copy.noMatches} “{q}”</p>
    {/each}
  </div>

  <footer class="p-foot">
    <Kbd keys="↑  ↓" /><span>move</span>
    <Kbd keys="↵" /><span>run</span>
    <Kbd keys="⇥" /><span>complete</span>
    <span class="p-hint">&gt; commands · # rows · @ people · / pages</span>
  </footer>
</dialog>

<style>
  /* THE KEY IS ADVICE FOR A KEYBOARD, AND THE BUTTON IS FOR A THUMB. Exactly one of them is on
     screen at a time, so the head never carries two ways to say the same thing. */
  .p-close {
    display: none;
  }

  /* THE COUNT IS THE SAME COUNT ON EVERY SCREEN, and this rule was written INSIDE the phone's media
     block. In the built CSS it came out as
     `@media (pointer:coarse),not (min-width:640px){.p-count{…}}`, so on a desktop the number
     rendered at `--t-ui` (15px) instead of `--t-xs` (12px), wrapped, and lost its tabular figures —
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

  .palette {
    inline-size: min(680px, calc(100vw - var(--sp-4)));
    max-block-size: min(72dvh, 620px);
    margin: 10dvh auto auto;
    padding: 0;
    background: var(--s2);
    border: 1px solid var(--edge);
    border-radius: var(--r-lg);
    color: var(--ink);
    box-shadow: var(--e3);
    overflow: hidden;
  }

  .palette:not([open]) {
    display: none;
  }

  .palette[open] {
    display: flex;
    flex-direction: column;
    animation: pop var(--d-enter) var(--ease-spring);
  }

  /* No `opacity: 0` in a start state — see Sheet.svelte. The palette is the one surface somebody
     reaches for a hundred times a day, and it is the one that can least afford to be invisible while
     an animation waits for its first frame. */
  @keyframes pop {
    from {
      transform: translateY(-8px) scale(0.985);
    }
  }

  .palette::backdrop {
    background: color-mix(in srgb, black 52%, transparent);
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
     that should say it is live — and a border warming to the accent is a change a person reads
     without it reading as an error. */
  .p-head:focus-within {
    border-block-end-color: var(--accent);
    color: var(--ink2);
  }

  .p-input {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink);
    font-size: var(--t-md);
  }

  /* A 2px ring plus a 4px halo drawn around a transparent, borderless input inside an already-modal
     dialog is a white box floating in the middle of the panel around nothing — it frames the text,
     not a control, because there is no control there to frame. The blinking caret is the platform's
     own focus indicator for a text field and is what every command palette relies on; this dialog
     opens with focus here and traps it, so there is nowhere else for focus to have gone.

     The ring is not simply deleted, though. It moves to `.p-head`, which is the thing that actually
     looks like a field, as a border tint rather than an outline — so there is still a visible
     change of state, it just belongs to the right box. */
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

  .p-body {
    flex: 1;
    padding: var(--sp-2);
    overflow-y: auto;
  }

  .p-group {
    padding: var(--sp-2) var(--sp-2) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  /* `--ctl-h`, BECAUSE THESE ARE THE PHONE'S ROUTE TO SEVERAL PLACES. 38px, adjacent, with no gap
     between neighbours — twenty-four of them in one scroller, on a surface whose whole job is to get
     somebody somewhere. `05 §6`: the pointer decides, and on a fine one this is still 32. */
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

  /* The same tint the rail uses for "here", because it is the same idea: one row out of a list is
     the one you are on. It was `--s3` plus a 2px bar, which on a light palette is one rung of the
     surface ladder away from the ground it sits on — a highlight you have to hunt for in the one
     control that exists to be driven from the keyboard. */
  .p-row[data-cursor] {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--ink);
  }

  .p-row[data-cursor] :global(.icon) {
    color: var(--accent-text);
  }

  .p-title {
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-spoken {
    padding: 0 5px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .p-detail {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-none {
    padding: var(--sp-5) var(--sp-3);
    color: var(--dim);
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

  @media (width < 640px) {
    .palette {
      inline-size: 100vw;
      max-inline-size: none;
      block-size: 100dvh;
      max-block-size: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .p-hint {
      display: none;
    }
  }
</style>
