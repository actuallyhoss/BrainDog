<!--
  Today: the screen every record opens on. Top to bottom, the ask bar, then what needs you, who is working now, what
  changed since you were last here, and money at a glance.

  A SITUATION, NOT A BOARD. What needs you is unfiltered: work past its day or due today, work marked urgent, and at
  most three open questions answered where they are shown. A section a record does not hold is absent, and one with
  nothing in it is one plain line.

  THE READ MARK IS MOVED ON THE WAY OUT, NEVER ON ARRIVAL. Moving it on load would mark everything read the moment the
  screen drew, so "since you were last here" would never show the news it exists for. It is stamped on `pagehide` and
  when the screen goes, up to the newest line this screen actually held.

  IT LISTENS. `read` asks again when the record's version moves (`lib/data/live.svelte.ts`), so an agent's write or a
  question answered in another tab appears without a reload and without blanking what is drawn.

  The page the record used to open on is kept at `/?overview`, under More (`routes/+page.svelte`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { relative, since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Question from './Question.svelte';
  import type { TodayRead } from '$lib/record/today-live.ts';
  import { drew } from '../ui/screen.svelte.ts';
  import { run } from '$lib/data/optimistic.svelte.ts';
  import { may } from '$lib/record/may.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { dayOf } from '$lib/work/board.ts';
  import { captureOf, contextOf, freshFields, isQuestion } from '$lib/work/capture.ts';

  let { data }: { data: Shell } = $props();

  /* THE PLAIN WORDS THIS SCREEN SAYS, kept beside it. */
  const words = {
    ask: 'Ask or add anything',
    askHint: 'Press Enter to search your record, add a row or ask a question.',
    needs: 'Needs you',
    needsNone: 'Nothing needs you right now.',
    late: 'late',
    today: 'due today',
    urgent: 'urgent',
    moreQuestions: (n: number) => `${n} more ${n === 1 ? 'question' : 'questions'} to decide`,
    working: 'Working now',
    workingNone: 'No agent is working right now.',
    since: 'Since you were last here',
    sinceNone: 'Nothing new since you were last here.',
    sinceTotal: (n: number, capped: boolean) => `${n.toLocaleString('en')}${capped ? '+' : ''} ${n === 1 ? 'change' : 'changes'}`,
    allActivity: 'All activity',
    money: 'Money',
    cash: 'Cash now',
    cashNone: 'No account counts as cash yet.',
    dueNext: 'Due',
    dueNone: 'Nothing is due.',
    owed: 'in',
    owing: 'out',
    agent: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
    addTask: 'Add as a task',
    askIt: 'Ask',
    added: (t: string) => `Added “${t}” to your tasks.`,
  } as const;

  /* The day as the reader's wall says it, over the title. */
  const day = $derived(new Date(data.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));

  /* ONE READ FOR THE SCREEN, keyed on the record, asked again when its version moves. A refused shell asks nothing. */
  const today = read<Extract<TodayRead, { ok: true }>['value']>(
    () => (data.refused ? null : apiBase()),
    () => import('$lib/record/today-live.ts').then((m) => m.readToday(apiBase())),
  );
  const t = $derived(today.value);

  /* THE ASK BAR HANDS WHAT WAS TYPED TO THE PALETTE, which searches, adds a row and asks, so there is one place that
     answers a sentence rather than two that answer it differently.

     AND A LINE THAT IS NOT A QUESTION IS OFFERED AS A TASK, which Enter adds, on a record that holds tasks and for
     somebody who may add one. It is added the way the Work screen adds one (`lib/work/Work.svelte`): the same light
     syntax, "tomorrow", "!urgent", "#project", and a six-second Undo. A question still goes to the palette on Enter. */
  let asked = $state('');
  const typed = $derived(asked.trim());
  const takesTasks = $derived(data.lists.some((l) => l.id === 'tasks') && may(data, 'append', 'tasks'));
  const offerTask = $derived(takesTasks && typed !== '');
  const enterAdds = $derived(offerTask && !isQuestion(typed));

  function ask(e: SubmitEvent) {
    e.preventDefault();
    if (enterAdds) void addTask();
    else askIt();
  }

  function askIt() {
    const said = asked.trim();
    asked = '';
    openPaletteWith(said);
  }

  /* WHAT A TASK IS READ AGAINST, asked for as the bar is first used, so Enter does not wait on it. */
  function warm() {
    if (takesTasks) void import('$lib/record/work-live.ts').then((m) => m.captureContext(apiBase())).catch(() => {});
  }

  async function addTask() {
    const said = asked.trim();
    if (said === '') return;
    asked = '';
    const base = apiBase();
    const [live, rows] = await Promise.all([import('$lib/record/work-live.ts'), import('$lib/record/rows-write.ts')]);
    const held = await live.captureContext(base).catch(() => null);
    if (held === null) {
      if (asked.trim() === '') asked = said;
      return;
    }
    const now = Date.now();
    const c = captureOf(said, contextOf(held.shape, dayOf(today.value?.now ?? now), held.projects));
    const fields = { ...rows.capturedFields(live.TASKS, c.text, [], now).fields, ...freshFields(c, held.shape, null) };
    const writer = rows.rowWriter(base);
    void run<Entry>({
      apply: () => undefined,
      /* A REFUSED LINE COMES BACK INTO THE BAR, so it is corrected rather than typed again. */
      revert: () => {
        if (asked.trim() === '') asked = said;
      },
      send: () => writer.create(live.TASKS, fields).then((out) => (out.ok ? { ok: true as const, value: out.entry } : { ok: false as const, fix: out.fix })),
      settle: () => void today.reread(),
      said: words.added(c.text),
      undo: (row) => () => void writer.archive(live.TASKS, row.seq, row.version).then(() => today.reread()),
    });
  }

  /* An answered question lowers the count at once and the screen reads again, so the next one moves up. */
  function answered() {
    void today.reread();
  }

  /* THE MARK, STAMPED ON THE WAY OUT with the newest line this screen held, and only once it has held any answer. */
  let stamped = false;
  function stamp() {
    const held = untrack(() => today.value);
    if (stamped || data.refused || held === null) return;
    stamped = true;
    const upTo = held.upTo;
    void import('$lib/record/news-live.ts').then((m) => m.markAll(apiBase(), upTo)).catch(() => {});
  }
  $effect(() => {
    const leave = () => stamp();
    addEventListener('pagehide', leave);
    return () => {
      removeEventListener('pagehide', leave);
      untrack(stamp);
    };
  });

  $effect(() => {
    if (today.state === 'ready') drew('ready');
  });

  const needing = $derived(t ? (t.tasks?.length ?? 0) + t.questions.length : 0);
  const moreQuestions = $derived(t ? Math.max(0, t.open - t.questions.length) : 0);
</script>

<svelte:head><title>{titleOf(copy.today)}</title></svelte:head>

<PageHead title={copy.today} kicker={day} />

<div class="page">
  <form class="ask" onsubmit={ask} role="search">
    <label class="sr-only" for="today-ask">{words.ask}</label>
    <input
      id="today-ask"
      class="ask-input"
      type="text"
      autocomplete="off"
      enterkeyhint="go"
      placeholder={words.ask}
      title={words.askHint}
      bind:value={asked}
      onfocus={warm}
    />
    {#if offerTask}
      <!-- THE TWO THINGS A LINE CAN BE, the one Enter does first and marked with the key. -->
      <div class="offer">
        {#if enterAdds}
          <button type="submit" class="offer-btn">{words.addTask}<Kbd keys="↵" /></button>
          <button type="button" class="offer-btn" onclick={askIt}>{words.askIt}</button>
        {:else}
          <button type="submit" class="offer-btn">{words.askIt}<Kbd keys="↵" /></button>
          <button type="button" class="offer-btn" onclick={() => void addTask()}>{words.addTask}</button>
        {/if}
      </div>
    {/if}
  </form>

  {#if data.refused}
    <p class="none">{data.refused.fix}</p>
  {:else if today.state !== 'ready' && today.state !== 'empty'}
    <ReadState state={today.state} refusal={today.refusal} onretry={() => void today.reread()} />
  {:else if t}
    <div class="grid">
      <div class="col">
        <!-- ══ NEEDS YOU ══ -->
        <section class="block" aria-labelledby="h-needs">
          <h2 class="head" id="h-needs">{words.needs}{#if needing}<span class="n num">{needing}</span>{/if}</h2>
          {#if needing === 0}
            <p class="none">{words.needsNone}</p>
          {:else}
            <ul class="rows">
              {#each t.tasks ?? [] as task (task.seq)}
                <li>
                  <a class="row" href={at(`/r/tasks/${task.seq}`)}>
                    <span class="when" data-why={task.why}>
                      {task.why === 'late' && task.due ? relative(task.due, t.now) : task.why === 'today' ? words.today : words.urgent}
                    </span>
                    <span class="what">{task.what}</span>
                    <span class="where">{[task.project, task.agent ? words.agent(task.agent) : null].filter(Boolean).join(' · ')}</span>
                  </a>
                </li>
              {/each}
              {#each t.questions as q (q.id)}
                <li class="ask-row">
                  <span class="when" data-why="decide">{copy.decide.toLowerCase()}</span>
                  <Question question={q} now={t.now} onanswered={answered} />
                </li>
              {/each}
            </ul>
            {#if moreQuestions > 0}
              <p class="more"><a href={at('/decide')}>{words.moreQuestions(moreQuestions)}</a></p>
            {/if}
          {/if}
        </section>

        <!-- ══ WHO IS WORKING ══ -->
        <section class="block" aria-labelledby="h-working">
          <h2 class="head" id="h-working">{words.working}{#if t.runs.length}<span class="n num">{t.runs.length}</span>{/if}</h2>
          {#if t.runs.length === 0}
            <p class="none">{words.workingNone}</p>
          {:else}
            <ul class="rows">
              {#each t.runs as run, i (run.seq ?? i)}
                <li>
                  <svelte:element this={run.seq === null ? 'div' : 'a'} class="row" href={run.seq === null ? undefined : at(`/r/session/${run.seq}`)}>
                    <span class="when">{words.agent(run.agent)}</span>
                    <span class="what">{run.doing || '…'}</span>
                    <span class="where">{[run.project, run.seen ? since(run.seen, t.now) : null].filter(Boolean).join(' · ')}</span>
                  </svelte:element>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>

      <div class="col side">
        <!-- ══ SINCE YOU WERE LAST HERE ══ -->
        <section class="block" aria-labelledby="h-since">
          <h2 class="head" id="h-since">
            {words.since}{#if t.since.total}<span class="n num">{words.sinceTotal(t.since.total, t.since.capped)}</span>{/if}
          </h2>
          {#if t.since.rows.length === 0}
            <p class="none">{words.sinceNone}</p>
          {:else}
            <ul class="rows">
              {#each t.since.rows as row (row.key)}
                <li>
                  <a class="row count" href={at(row.href)}>
                    <span class="num big">{row.count}</span>
                    <span class="what">{row.label}</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
          <p class="more"><a href={at('/audit')}>{words.allActivity}</a></p>
        </section>

        <!-- ══ MONEY ══ Only on a record that holds money. -->
        {#if t.money}
          <section class="block" aria-labelledby="h-money">
            <h2 class="head" id="h-money"><a href={at('/p/money')}>{words.money}</a></h2>
            {#if t.money.cash.length === 0}
              <p class="none">{words.cashNone}</p>
            {:else}
              <dl class="cash">
                {#each t.money.cash as line, i (i)}
                  <div class="cash-line lead">
                    <dt>{words.cash}</dt>
                    <dd class="num">{line.amount}</dd>
                  </div>
                {/each}
                {#each t.money.books as line, i (i)}
                  <div class="cash-line">
                    <dt>{line.label}</dt>
                    <dd class="num">{line.amount}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
            <h3 class="sub">{words.dueNext}</h3>
            {#if t.money.due.length === 0}
              <p class="none">{words.dueNone}</p>
            {:else}
              <ul class="rows">
                {#each t.money.due as bill (bill.seq)}
                  <li>
                    <a class="row bill" href={at(`/r/obligations/${bill.seq}`)}>
                      <span class="when" data-why={bill.late ? 'late' : undefined}>{bill.due ? relative(bill.due, t.now) : ''}</span>
                      <span class="what">{bill.what}</span>
                      <span class="amount num" data-out={bill.out ? '' : undefined}>
                        {bill.amount ?? ''}<span class="dir">{bill.out ? words.owing : words.owed}</span>
                      </span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  /* THE ASK BAR: one field the width of the page, a hairline box, no ornament. */
  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .offer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .offer-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .offer-btn:first-child {
    border-color: var(--ink2);
    color: var(--ink);
  }

  .offer-btn:hover,
  .offer-btn:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .offer-btn {
      min-block-size: var(--tap);
    }

    .offer-btn :global(kbd) {
      display: none;
    }
  }

  .ask-input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .ask-input::placeholder {
    color: var(--dim);
  }

  .ask-input:focus-visible {
    border-color: var(--ink2);
  }

  /* TWO COLUMNS WHERE THERE IS ROOM: what needs you and who is working on the left, what changed and money on the right. */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
  }

  @media (width >= 1100px) {
    .grid {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  .block {
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .head a {
    color: inherit;
    text-decoration: none;
  }

  .head a:hover {
    text-decoration: underline;
  }

  .n {
    color: var(--dim);
    font-weight: 400;
  }

  .sub {
    margin: var(--sp-4) 0 var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .none {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .more {
    margin: var(--sp-2) 0 0;
    font-size: var(--t-sm);
  }

  .more a {
    color: var(--ink2);
  }

  /* A LIST IS LINES ON THE PAGE WITH A HAIRLINE BETWEEN THEM AND NOTHING AROUND THEM, dense: one line each where it fits. */
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows > li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  .row {
    display: grid;
    grid-template-columns: 11ch minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: baseline;
    padding: var(--sp-2) 0;
    color: var(--ink);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  a.row:hover .what {
    text-decoration: underline;
  }

  .ask-row {
    display: grid;
    grid-template-columns: 11ch minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: baseline;
    padding: var(--sp-2) 0;
  }

  .when {
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .when[data-why='late'],
  .when[data-why='urgent'] {
    color: var(--warn);
  }

  .what {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .where {
    max-inline-size: 24ch;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row.count {
    grid-template-columns: 5ch minmax(0, 1fr);
  }

  .big {
    color: var(--ink);
    font-weight: 600;
    text-align: end;
  }

  .row.bill {
    grid-template-columns: 11ch minmax(0, 1fr) auto;
  }

  .amount {
    white-space: nowrap;
  }

  .dir {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .cash {
    margin: 0;
  }

  .cash-line {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-1) 0;
    font-size: var(--t-ui);
  }

  .cash-line dt {
    color: var(--ink2);
  }

  .cash-line dd {
    margin: 0;
    color: var(--ink);
  }

  .cash-line.lead dd {
    font-size: var(--t-lg);
    font-weight: 600;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ON A PHONE A ROW IS TWO LINES: the day over the words, and where under them. */
  @media (width < 640px) {
    .row,
    .row.bill {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .row .when {
      grid-column: 1 / -1;
    }

    .ask-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .page {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }
  }

  @media (pointer: coarse) {
    .ask-input {
      min-block-size: var(--tap);
    }
  }
</style>
