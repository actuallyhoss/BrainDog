<!--
  The app, drawn, sitting across the bottom edge of the hero. No photograph and no image file: every
  pixel of it is HTML and CSS over the strings in `copy.ts`.

  WHY IT IS A DRAWING AND WHY IT CAN BE PRESSED. On 22 September the owner looked at the page and
  said of its screenshots *i hate those screenshots. they look terrible*, and asked for this
  section to move up over the hero and for the records inside it to open different pages. A
  photograph of an app is soft at every width but one, goes stale with every palette change, and
  cannot be pressed. This is the app's own frame, drawn once: a tab per use case along the top, the
  rail with the glyph the app draws beside every page and list, and a page that answers the rail.

  WHAT OPENS. Home, with the tiles the setup's first day shows and the table the setup's Home draws
  under them, whose rows open like any other. Decide, with a question an agent
  has put and two real buttons that answer it. Every list `copy.ts` gives rows for, and each row's
  own page. Automations, and each rule's own page, drawn the way the app draws an automation: what
  starts it, the condition, and what it does. A name on the rail with no rows written for it is
  drawn as the app draws it and is not a button, because a control that does nothing when pressed
  is a broken control, whatever it looks like.

  EVERY WORD A READER SEES IS A PROP. `copy.ts` holds them where the content test scans them, and
  every row is read off the seed the use case installs; the one liberty, a question on Decide, is
  named beside the data. `rail.ts` gives each name its glyph and `arrange.test.ts` holds both to
  the application.

  NO LAYOUT JUMP. The body of the window is one fixed height at each width, every case's panel is
  stacked in the same grid cell, and a page longer than the body scrolls inside it. Choosing a
  case, a list or a row changes what is inside the box and never the box.

  IT IS A REAL TAB CONTROL for the cases: `role="tablist"`, arrow keys, a roving `tabindex`, one
  panel per case wired to its own tab. The tab ids are the use-case ids (`uc-personal`, ...), which
  `test/content.test.ts` looks each use case up by. Inside a panel the rail entries are buttons that
  carry `aria-current` for the page they show, and opening a row or going back moves focus to the
  new page's title, so a keyboard is never left on a control that has just been taken away.
  Answering a question on Decide takes its two buttons away too, and focus goes to the page's title
  the same way, while the answer is spoken by a status region that was there, empty, before it.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { isIconName } from './icons.ts';
  import { RAIL } from './rail.ts';

  type Row = { cells: readonly string[]; fields?: readonly (readonly [string, string])[] };
  type List = { name: string; columns: readonly string[]; rows: readonly Row[] };
  type Question = { from: string; question: string; change: string };
  type Rule = { name: string; starts: string; only: string; then: string };

  /**
   * One use case, as `copy.ts` writes it. `holds[0]` is its Home page. `lists` are the lists that
   * open, each named as one of `holds`; `questions` are what Decide shows; `rules` are what
   * Automations shows. All required, so a case that forgot one is a type error rather than an
   * empty page.
   */
  type Case = {
    id: string;
    label: string;
    glyph: string;
    holds: readonly string[];
    tiles: readonly { title: string; value: string; note?: string }[];
    /** The table Home draws under its tiles: a heading, the list it reads, and which of its rows. */
    soon: { heading: string; list: string; rows: readonly number[] };
    lists: readonly List[];
    questions: readonly Question[];
    rules: readonly Rule[];
  };

  /** The drawn app's own words, `site.arrange.app`. */
  type Words = {
    decide: string;
    automations: string;
    toDecide: (n: number) => string;
    noQuestions: string;
    noRules: string;
    notRun: string;
    inline: string;
    starts: string;
    only: string;
    then: string;
    from: string;
    opened: string;
    accept: string;
    reject: string;
    accepted: string;
    rejected: string;
    window: string;
    rail: string;
    back: string;
  };

  /* NO DEFAULTS ON ANYTHING A READER SEES, for the reason `copy.ts` gives at its top: a default here
     would be a second, invisible copy deck. */
  let {
    cases,
    head,
    label,
    app,
  }: {
    /** `site.arrange.cases`. The first is selected. */
    cases: readonly Case[];
    /** The row at the top of the rail, where the real sidebar names the record you are in. */
    head: string;
    /** The accessible name of the case tabs. */
    label: string;
    app: Words;
  } = $props();

  type View =
    | { kind: 'home' }
    | { kind: 'decide' }
    | { kind: 'rules' }
    | { kind: 'rule'; at: number }
    | { kind: 'list'; list: number }
    | { kind: 'row'; list: number; row: number };

  const HOME: View = { kind: 'home' };

  let selected = $state(0);
  let view = $state<View>(HOME);
  /* A QUESTION ANSWERED STAYS ANSWERED while the page is open, keyed by case and question, so
     leaving Decide and coming back does not ask again. Nothing is sent anywhere. */
  let answers = $state<Record<string, 'accepted' | 'rejected'>>({});

  let tabs: (HTMLButtonElement | null)[] = $state([]);
  let titles: (HTMLElement | null)[] = $state([]);

  const listAt = (c: Case, name: string): number => c.lists.findIndex((l) => l.name === name);
  const waiting = (c: Case): number => c.questions.filter((_, q) => !answers[`${c.id}:${q}`]).length;
  const initial = (name: string): string => name.trim().slice(0, 1);

  /** Which rail entry the view belongs to, so a row's page keeps its list marked. */
  function at(v: View): string {
    if (v.kind === 'list' || v.kind === 'row') return `list:${v.list}`;
    if (v.kind === 'rule') return 'rules';
    return v.kind;
  }

  /**
   * THE ONE WAY INTO A CASE. Pointer and keyboard both come through here, because the roving
   * `tabindex` moves with the selection and focus has to follow it; Safari on macOS does not focus a
   * clicked button by default, and there the difference is visible. A new case opens on its Home.
   */
  function choose(i: number) {
    selected = i;
    view = HOME;
    tabs[i]?.focus();
  }

  /** Left and right, Home and End: the WAI-ARIA tabs pattern for a horizontal tablist. */
  function onkeydown(event: KeyboardEvent) {
    const n = cases.length;
    if (n === 0) return;
    const steps: Record<string, number> = {
      ArrowRight: (selected + 1) % n,
      ArrowLeft: (selected - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const to = steps[event.key];
    if (to === undefined) return;
    event.preventDefault();
    choose(to);
  }

  /**
   * OPEN A PAGE. From the rail, focus stays on the rail entry that was pressed, which is still
   * there; from inside the page, the control pressed is about to be replaced, so focus goes to the
   * new page's title.
   */
  async function open(next: View, from: 'rail' | 'page') {
    view = next;
    if (from === 'page') {
      await tick();
      titles[selected]?.focus();
    }
  }

  /**
   * ANSWER A QUESTION, AND PUT THE KEYBOARD SOMEWHERE THAT IS STILL THERE.
   *
   * The two buttons are replaced by the stamp the moment the answer is recorded, so the one that was
   * pressed is gone. This used to record the answer and nothing else, and `loop/research-batch-forty-audit.md`
   * §9 measured the result in headless Chromium: after Enter on Accept, `document.activeElement` was
   * `body`, and the next Tab left the drawn app for the page's own links. So focus goes to the page's
   * title, which is where `open` puts it for the same reason and which now reads "Decide" with the
   * count gone from beside it. Every case in `copy.ts` asks one question, so there is never a second
   * Accept to go to instead; a case that asks two should send focus to the next one still waiting.
   *
   * THE OUTCOME IS SPOKEN BY THE STAMP, which is a `role="status"` region drawn empty from the start
   * and filled here. It used to arrive already holding its words, and a live region that is born full
   * is not reliably announced. Focus goes to the title rather than to the stamp so a screen reader
   * does not read "Accepted by you" twice, once as the region changes and again as it takes focus.
   */
  async function answer(c: Case, q: number, said: 'accepted' | 'rejected') {
    answers = { ...answers, [`${c.id}:${q}`]: said };
    await tick();
    titles[selected]?.focus();
  }
</script>

<!-- ONE TABLE, DRAWN IN TWO PLACES: a list's own page, and the table Home draws under its tiles.
     Every row's name is the button that opens that row's page, wherever the table is. -->
{#snippet rowsTable(l: List, li: number, only: readonly number[] | null)}
  <table class="table">
    <thead>
      <tr>
        {#each l.columns as col (col)}<th scope="col">{col}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each only ?? l.rows.map((_, ri) => ri) as ri (ri)}
        {@const row = l.rows[ri]}
        {#if row}
          <tr>
            {#each row.cells as cell, ci (ci)}
              <td>
                {#if ci === 0}
                  <button class="open" type="button" onclick={() => open({ kind: 'row', list: li, row: ri }, 'page')}>{cell}</button>
                {:else}
                  <span class="num">{cell}</span>
                {/if}
              </td>
            {/each}
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/snippet}

<div class="window" role="group" aria-label={app.window}>
  <div class="bar">
    <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="tabs" role="tablist" aria-label={label}>
      {#each cases as c, i (c.id)}
        <button
          bind:this={tabs[i]}
          class="tab"
          type="button"
          role="tab"
          id="uc-{c.id}"
          aria-controls="uc-{c.id}-rail"
          aria-selected={i === selected}
          tabindex={i === selected ? 0 : -1}
          onclick={() => choose(i)}
          {onkeydown}
        >
          {#if isIconName(c.glyph)}<Icon name={c.glyph} size="m" />{/if}
          <span>{c.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="stack">
    {#each cases as c, i (c.id)}
      {@const v = i === selected ? view : HOME}
      {@const count = waiting(c)}
      <div class="panel" class:on={i === selected} role="tabpanel" id="uc-{c.id}-rail" aria-labelledby="uc-{c.id}">
        <div class="rail" role="group" aria-label={app.rail}>
          <p class="record">
            <span class="chip" aria-hidden="true">
              {#if isIconName(c.glyph)}<Icon name={c.glyph} size="s" />{/if}
            </span>
            <span class="name">{head}</span>
          </p>

          <ul class="holds">
            <li>
              <button class="hold" type="button" aria-current={at(v) === 'home' ? 'page' : undefined} onclick={() => open(HOME, 'rail')}>
                <Icon name={RAIL[c.holds[0] ?? ''] ?? 'home'} size="m" />
                <span class="name">{c.holds[0]}</span>
              </button>
            </li>
            <li>
              <button class="hold" type="button" aria-current={at(v) === 'decide' ? 'page' : undefined} onclick={() => open({ kind: 'decide' }, 'rail')}>
                <Icon name="decide" size="m" />
                <span class="name">{app.decide}</span>
                {#if count > 0}<span class="count num">{count}</span>{/if}
              </button>
            </li>
          </ul>

          <ul class="holds grouped">
            {#each c.holds.slice(1) as hold (hold)}
              {@const glyph = RAIL[hold]}
              {@const l = listAt(c, hold)}
              <li>
                {#if l >= 0}
                  <button
                    class="hold"
                    type="button"
                    aria-current={at(v) === `list:${l}` ? 'page' : undefined}
                    onclick={() => open({ kind: 'list', list: l }, 'rail')}
                  >
                    {#if glyph}<Icon name={glyph} size="m" />{:else}<span class="mark" aria-hidden="true"></span>{/if}
                    <span class="name">{hold}</span>
                  </button>
                {:else}
                  <span class="hold still">
                    {#if glyph}<Icon name={glyph} size="m" />{:else}<span class="mark" aria-hidden="true"></span>{/if}
                    <span class="name">{hold}</span>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>

          <ul class="holds foot">
            <li>
              <button class="hold" type="button" aria-current={at(v) === 'rules' ? 'page' : undefined} onclick={() => open({ kind: 'rules' }, 'rail')}>
                <Icon name="refresh" size="m" />
                <span class="name">{app.automations}</span>
              </button>
            </li>
          </ul>
        </div>

        <div class="page">
          {#key `${i}:${JSON.stringify(v)}`}
            <div class="view">
              {#if v.kind === 'home'}
                <div class="head">
                  <p class="title" tabindex="-1" bind:this={titles[i]}>
                    {#if isIconName(c.glyph)}<span class="glyph"><Icon name={c.glyph} size="l" /></span>{/if}
                    <span>{c.holds[0]}</span>
                  </p>
                  {#if count > 0}
                    <button class="pill" type="button" onclick={() => open({ kind: 'decide' }, 'page')}>{app.toDecide(count)}</button>
                  {/if}
                </div>
                <ul class="tiles">
                  {#each c.tiles as tile (tile.title)}
                    <li class="tile">
                      <span class="tile-title">{tile.title}</span>
                      <span class="tile-value num">{tile.value}</span>
                      {#if tile.note}<span class="tile-note">{tile.note}</span>{/if}
                    </li>
                  {/each}
                </ul>
                {@const sl = listAt(c, c.soon.list)}
                {@const soon = c.lists[sl]}
                {#if soon}
                  <div class="soon">
                    <p class="soon-head">{c.soon.heading}</p>
                    {@render rowsTable(soon, sl, c.soon.rows)}
                  </div>
                {/if}
              {:else if v.kind === 'decide'}
                <div class="head">
                  <p class="title" tabindex="-1" bind:this={titles[i]}>
                    <span>{app.decide}</span>
                    {#if count > 0}<span class="n num">{count}</span>{/if}
                  </p>
                </div>
                {#if c.questions.length === 0}
                  <p class="empty">{app.noQuestions}</p>
                {:else}
                  {#each c.questions as q, qi (q.question)}
                    {@const said = answers[`${c.id}:${qi}`]}
                    <div class="ask">
                      <p class="meta">
                        <span class="face" aria-hidden="true">{initial(q.from)}</span>
                        <span>{app.from} {q.from} · {app.opened}</span>
                      </p>
                      <p class="ask-title">{q.question}</p>
                      <p class="change"><span class="plus" aria-hidden="true"></span><span>{q.change}</span></p>
                      <!-- THE STAMP IS ALWAYS HERE, EMPTY UNTIL THE ANSWER, so the words arrive in a live
                           region that already exists. `answer` says why. -->
                      <div class="answer">
                        {#if !said}
                          <button class="do do-primary" type="button" onclick={() => answer(c, qi, 'accepted')}>{app.accept}</button>
                          <button class="do" type="button" onclick={() => answer(c, qi, 'rejected')}>{app.reject}</button>
                        {/if}
                        <p class="stamp" role="status">
                          {#if said}
                            <Icon name={said === 'accepted' ? 'check' : 'close'} size="s" />
                            <span>{said === 'accepted' ? app.accepted : app.rejected}</span>
                          {/if}
                        </p>
                      </div>
                    </div>
                  {/each}
                {/if}
              {:else if v.kind === 'rules'}
                <div class="head">
                  <p class="title" tabindex="-1" bind:this={titles[i]}>
                    <span>{app.automations}</span>
                    {#if c.rules.length > 0}<span class="n num">{c.rules.length}</span>{/if}
                  </p>
                </div>
                {#if c.rules.length === 0}
                  <p class="empty">{app.noRules}</p>
                {:else}
                  <ul class="rules">
                    {#each c.rules as r, ri (r.name)}
                      <li>
                        <button class="rule" type="button" onclick={() => open({ kind: 'rule', at: ri }, 'page')}>
                          <span class="rule-name">{r.name}</span>
                          <span class="rule-starts">{r.starts}</span>
                          <span class="rule-state">{app.notRun}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {:else if v.kind === 'rule'}
                {@const r = c.rules[v.at]}
                {#if r}
                  <button class="back" type="button" onclick={() => open({ kind: 'rules' }, 'page')}>
                    <Icon name="back" size="s" /><span>{app.back} {app.automations}</span>
                  </button>
                  <p class="title" tabindex="-1" bind:this={titles[i]}><span>{r.name}</span></p>
                  <ol class="flow">
                    <li class="step"><span class="step-label">{app.starts}</span><span>{r.starts}</span></li>
                    <li class="step"><span class="step-label">{app.only}</span><span>{r.only}</span></li>
                    <li class="step"><span class="step-label">{app.then}</span><span>{r.then}</span></li>
                  </ol>
                  <p class="rule-foot">{app.notRun} {app.inline}</p>
                {/if}
              {:else if v.kind === 'list'}
                {@const l = c.lists[v.list]}
                {#if l}
                  <div class="head">
                    <p class="title" tabindex="-1" bind:this={titles[i]}>
                      <span>{l.name}</span>
                      <span class="n num">{l.rows.length}</span>
                    </p>
                  </div>
                  {@render rowsTable(l, v.list, null)}
                {/if}
              {:else if v.kind === 'row'}
                {@const l = c.lists[v.list]}
                {@const row = l?.rows[v.row]}
                {#if l && row}
                  <button class="back" type="button" onclick={() => open({ kind: 'list', list: v.list }, 'page')}>
                    <Icon name="back" size="s" /><span>{app.back} {l.name}</span>
                  </button>
                  <p class="title" tabindex="-1" bind:this={titles[i]}><span>{row.cells[0]}</span></p>
                  <dl class="fields">
                    {#each row.cells.slice(1) as cell, ci (ci)}
                      <div class="field"><dt>{l.columns[ci + 1]}</dt><dd class="num">{cell}</dd></div>
                    {/each}
                    {#each row.fields ?? [] as [name, value] (name)}
                      <div class="field"><dt>{name}</dt><dd>{value}</dd></div>
                    {/each}
                  </dl>
                {/if}
              {/if}
            </div>
          {/key}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /**
   * THE WINDOW, AND IT IS THE ONE RAISED THING ON THE SITE.
   *
   * Everything else here is separated by a hairline or a change of ground. This is the product
   * sitting on the page, across the seam between the hero and the band under it, and a thing that
   * sits ON something is the one place a shadow says something true. It is `--e3`, the top of the
   * theme's own elevation ladder, which `packages/theme` solves per scheme with its own alphas, so
   * the shadow is a considered one in light and in dark without a colour being written here.
   *
   * THE GROUNDS ARE THE APP'S, ONE STEP LIFTED. The app puts its rail on `--sunk` and its page on
   * `--bg`. The hero under this window is `--sunk`, so the window takes the next two steps up,
   * `--bg` for its frame and rail and `--s1` for the page, and keeps the app's order.
   */
  .window {
    position: relative;
    inline-size: 100%;
    overflow: hidden;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: calc(var(--r-lg) + var(--sp-1));
    box-shadow: var(--e3);
  }

  /* A HAIR OF LIGHT ALONG THE TOP EDGE IN THE DARK, where a shadow on a near-black ground is nearly
     nothing and the edge is what reads. In light the border does that job alone. */
  @media (prefers-color-scheme: dark) {
    .window {
      box-shadow:
        var(--e3),
        inset 0 1px 0 color-mix(in srgb, var(--ink) 7%, transparent);
    }
  }

  /* ── The bar: three quiet dots and the cases ─────────────────────────── */

  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--line);
  }

  .dots {
    display: inline-flex;
    flex: none;
    gap: 6px;
  }

  .dots i {
    inline-size: 10px;
    block-size: 10px;
    background: var(--line);
    border-radius: var(--r-pill);
  }

  .tabs {
    display: flex;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .tab:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* CHOSEN, SAID WITHOUT A HUE: a lifted ground inside an edge, heavier, in full ink. */
  .tab[aria-selected='true'] {
    background: var(--s1);
    border-color: var(--line);
    box-shadow: var(--e1);
    color: var(--ink);
    font-weight: 600;
  }

  /* ── The body ─────────────────────────────────────────────────────── */

  /* ONE CELL FOR EVERY CASE, so the window is one size whichever is chosen. */
  .stack {
    display: grid;
  }

  .panel {
    --body-h: 456px;

    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: 212px minmax(0, 1fr);
    gap: var(--sp-2);
    block-size: var(--body-h);
    padding: var(--sp-2);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--d-enter) var(--ease-out),
      visibility var(--d-enter) var(--ease-out);
  }

  .on {
    opacity: 1;
    visibility: visible;
  }

  /* ── The rail ─────────────────────────────────────────────────────── */

  /* IT SCROLLS RATHER THAN CLIPS if a case ever lists more than the body holds, so Automations at
     its foot can never be cut off. */
  .rail {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }

  /* WHERE THE REAL SIDEBAR NAMES THE RECORD YOU ARE IN, with its chip. */
  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-2);
    padding: var(--sp-1) var(--sp-2);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .chip {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    background: var(--ink);
    border-radius: var(--r-sm);
    color: var(--bg);
  }

  .holds {
    display: grid;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .grouped {
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--line-soft);
  }

  /* AUTOMATIONS AT THE FOOT, where the app keeps it among the record's tools. */
  .foot {
    margin-block-start: auto;
    padding-block-start: var(--sp-2);
  }

  .hold {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--rail-item-h);
    padding-inline: var(--sp-2);
    background: transparent;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    text-align: start;
  }

  button.hold {
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  button.hold:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* WHERE YOU ARE, the way the app marks it: the lifted ground, full ink, heavier. */
  .hold[aria-current='page'] {
    background: var(--s1);
    box-shadow: var(--e1);
    color: var(--ink);
    font-weight: 600;
  }

  /* A NAME WITH NOTHING WRITTEN BEHIND IT is drawn in the quieter ink, so the ones that open are the
     ones that look like they do. */
  .still {
    color: var(--dim);
  }

  .mark {
    flex: none;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    background: var(--edge);
    border-radius: var(--r-sm);
  }

  .name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* ── The page ─────────────────────────────────────────────────────── */

  .page {
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .view {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--sp-6);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .title {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .title:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: 4px;
    border-radius: var(--r-sm);
  }

  .n {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .glyph {
    display: inline-grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .pill {
    flex: none;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .pill:hover {
    border-color: var(--edge);
  }

  .empty {
    margin: var(--sp-6) 0 0;
    color: var(--dim);
    font-size: var(--t-base);
    text-align: center;
  }

  /* Home's tiles: three fixed columns on a desk, so a two-tile case leaves a cell empty rather than
     stretching two tiles to half the page each. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-4);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .tile-title {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .tile-value {
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .tile-note {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* HOME'S TABLE, headed the way the app heads a block: a smaller line of ink over the rows. */
  .soon {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .soon-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  /* ── A list ───────────────────────────────────────────────────────── */

  .table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-sm);
  }

  .table th {
    padding: 0 var(--sp-2) var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-weight: 500;
    text-align: start;
  }

  .table td {
    padding-inline: var(--sp-2);
    border-block-end: 1px solid var(--line-soft);
    color: var(--ink2);
    white-space: nowrap;
  }

  /* THE WHOLE ROW IS THE TARGET and the name is the button: its box is stretched over the row, so
     a pointer anywhere on it opens the row and a keyboard lands on one control a row. */
  .table tbody tr {
    position: relative;
  }

  .table tbody tr:hover {
    background: var(--hover-wash);
  }

  .table tbody tr:has(.open:focus-visible) {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }

  /* THE NAME TAKES THE SLACK AND WRAPS; the figures after it keep to one line each. Said by
     position rather than by a class per column, because the columns are data and a class written
     as `c{i}` is one no stylesheet check can see the markup emit. */
  .table :is(th, td):first-child {
    inline-size: 100%;
  }

  .table td:first-child {
    white-space: normal;
  }

  .open {
    display: block;
    inline-size: 100%;
    min-block-size: 36px;
    padding: var(--sp-2) 0;
    background: none;
    border: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

  .open::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .open:focus-visible {
    /* focus-ok: the button's box is stretched over the whole row, and `tr:has(.open:focus-visible)`
       above draws the ring round the row the reader sees rather than round the name alone. */
    outline: none;
  }

  /* ── A row's page, and a rule's ───────────────────────────────────── */

  .back {
    display: inline-flex;
    align-items: center;
    align-self: start;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    margin-block-end: calc(-1 * var(--sp-2));
    padding: 0 var(--sp-2) 0 0;
    background: none;
    border: 0;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .back:hover {
    color: var(--ink);
  }

  .fields {
    display: grid;
    margin: 0;
  }

  .field {
    display: grid;
    grid-template-columns: 9rem minmax(0, 1fr);
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
    font-size: var(--t-sm);
  }

  .field dt {
    color: var(--dim);
  }

  .field dd {
    margin: 0;
    color: var(--ink);
    font-weight: 500;
  }

  /* ── Decide ───────────────────────────────────────────────────────── */

  .ask {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .face {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    background: var(--s1);
    border: 1.5px solid var(--info);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .ask-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  /* The change, drawn the way a diff draws an added line, as the scene further down the page does. */
  .change {
    display: flex;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .plus {
    flex: none;
    inline-size: 3px;
    background: var(--info);
    border-radius: var(--r-pill);
  }

  .answer {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    margin-block-start: var(--sp-2);
  }

  .do {
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .do:hover {
    border-color: var(--edge);
  }

  /* IN INK, as the product draws its primary actions. The accent is not spent on a button. */
  .do-primary {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .do-primary:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .stamp {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* ── Automations ──────────────────────────────────────────────────── */

  .rules {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-block-start: 1px solid var(--line-soft);
  }

  .rule {
    display: grid;
    gap: 2px;
    inline-size: 100%;
    padding: var(--sp-3) var(--sp-2);
    background: none;
    border: 0;
    border-block-end: 1px solid var(--line-soft);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    text-align: start;
    cursor: pointer;
  }

  .rule:hover {
    background: var(--hover-wash);
  }

  .rule-name {
    color: var(--ink);
    font-weight: 600;
  }

  .rule-state {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* THE AUTOMATION, drawn as the app draws one: cards down a line, what starts it first. */
  .flow {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    position: relative;
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-3) var(--sp-4);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .step + .step::before {
    content: '';
    position: absolute;
    inset-block-start: calc(-1 * var(--sp-4) - 1px);
    inset-inline-start: var(--sp-6);
    inline-size: 1px;
    block-size: var(--sp-4);
    background: var(--edge);
  }

  .step-label {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .rule-foot {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* ── Narrower ─────────────────────────────────────────────────────── */

  @media (width < 1000px) {
    .panel {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dots {
      display: none;
    }
  }

  /**
   * THE PHONE. The cases slide along one line, the rail folds to its glyphs the way the app's own
   * rail does when it is narrow, and the names leave the eye but not the page: they are clipped
   * rather than `display: none`, so a screen reader still reads the rail in full. A list keeps its
   * name and its first figure, and the page scrolls inside the window rather than growing it.
   */
  @media (width < 640px) {
    .bar {
      padding-inline: var(--sp-2);
    }

    /* THE LAST TAB FADES AT THE EDGE, which is what says there are more. At 390 the row shows three
       of the five cases and cut Solo founder at the window's edge as if the row simply ended there,
       so Team and New project were cases a reader had no reason to think existed. The mask reads
       only alpha, so the colour in it is any opaque one and never shows, and the row's end padding
       is as wide as the fade so the last case can be scrolled clear of it. */
    .tabs {
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      mask-image: linear-gradient(to right, var(--ink) calc(100% - var(--sp-7)), transparent);
      padding-inline-end: var(--sp-7);
    }

    .tab {
      min-block-size: var(--tap);
      scroll-snap-align: start;
    }

    .panel {
      --body-h: 480px;

      grid-template-columns: 44px minmax(0, 1fr);
      gap: var(--sp-1);
      padding: var(--sp-1);
    }

    .record {
      justify-content: center;
      padding-inline: 0;
    }

    .record .name,
    .hold .name,
    .count {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .hold {
      justify-content: center;
      min-block-size: 32px;
      padding-inline: 0;
    }

    .view {
      padding: var(--sp-4);
    }

    .tiles {
      grid-template-columns: minmax(0, 1fr);
    }

    .tile-value {
      font-size: var(--t-lg);
    }

    .table :is(th, td):nth-child(3) {
      display: none;
    }

    .field {
      grid-template-columns: 6.5rem minmax(0, 1fr);
    }
  }

  /**
   * THE CROSS-FADE BETWEEN CASES, AND A SMALL RISE ON A NEW PAGE, only for a reader who has not asked
   * for less motion. The rise is written inside `no-preference` rather than written everywhere and
   * switched off, because `a11y.css` collapses durations to 1ms and a transform left outside would
   * still jump a few pixels in one frame for the reader who asked for stillness.
   */
  @media (prefers-reduced-motion: no-preference) {
    .view {
      animation: view-in var(--d-enter) var(--ease-out);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }

  @keyframes view-in {
    from {
      opacity: 0;
      transform: translateY(var(--sp-1));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
