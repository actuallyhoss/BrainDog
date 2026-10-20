<!--
  Today as it was drawn by hand, before it was a declared page: what needs you, who is working, what changed and money.

  Under the title, one sentence says what the morning holds, with the one phrase that needs him in red. On the left:
  what needs you, the next two weeks as a strip of days, and the days coming up. On the right, up to three tiles: the
  agents at work and their day as swimlanes, what changed since you were last here, and cash with the walk ahead.

  CALM BEFORE RICH (DIRECTION §35). Nothing is drawn to say it is empty: with nothing needing you the sentence says so
  and the list is not drawn, and a tile with nothing to show is not drawn either. A row's verbs and the keys appear on
  hover or focus, never standing; `?` lists every key.

  A SITUATION, NOT A BOARD. What needs you is unfiltered: open questions answered where they are shown, work past its
  day, work handed back to be checked, work due today and work marked urgent, and money late or due today. A section a
  record does not hold is absent, and a picture with no data under it is not drawn: every figure, dot and span here is
  the record's own answer (`lib/record/today-live.ts`), and every sentence is worked out from it (`today-tiles.ts`).

  THE READ MARK IS MOVED ON THE WAY OUT, NEVER ON ARRIVAL. Moving it on load would mark everything read the moment the
  screen drew, so "since you were here" would never show the news it exists for. It is stamped on `pagehide` and when
  the screen goes, up to the newest line this screen actually held.

  IT LISTENS. `read` asks again when the record's version moves (`lib/data/live.svelte.ts`), so an agent's write or a
  question answered in another tab appears without a reload and without blanking what is drawn.

  THE KEYS ARE THE WORK SCREEN'S, on the rows of this one: j and k walk the rows, x ticks the task under the cursor,
  Enter opens it, 1 to 9 answer the question under it, and n opens the line a task is typed into. None of them is `/`,
  `?` or `g`, which are the shell's, and a `g` pressed first leaves the key after it to the shell.

  KEPT AT `/?classic` (`routes/+page.svelte`) while Today is drawn as a declared page (`Home.svelte`), until that page
  does all this one does; `/` and `/?overview` both open the declared one.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { money as moneyText, since } from 'braindog-render';
  import { moneyInText } from '$lib/record/money.ts';
  import { QUIET_MS, type QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { step } from '$lib/funnel.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { EVERY, QUESTIONS, type Spot } from '$lib/data/local.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import RemindersTile from './RemindersTile.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { hueFor } from '$lib/ui/face.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import { Sparkline, Stacked, Swimlanes, WeekStrip } from '$lib/viz/index.ts';
  import { rampAt } from '$lib/viz/shared.ts';
  import Question from './Question.svelte';
  import Briefing from './Briefing.svelte';
  import type { BriefingRow } from './briefing.ts';
  import { waitsNow } from './waits.svelte.ts';
  import type { DayRow, DueRow, TaskRow, TodayRead } from '$lib/record/today-live.ts';
  import { markAll } from '$lib/record/news-live.ts';
  import { drew } from '../ui/screen.svelte.ts';
  import { run } from '$lib/data/optimistic.svelte.ts';
  import { may } from '$lib/record/may.ts';
  import type { Entry } from '$lib/record/schema.ts';
  import type { RowWriter } from '$lib/record/rows-write.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { dayOf, daySaid, dueSaid } from '$lib/work/board.ts';
  import { TASKS } from '$lib/work/list.ts';
  import { captureOf, contextOf, freshFields, isQuestion } from '$lib/work/capture.ts';
  import {
    cashReading,
    cashSummary,
    datedOf,
    dayGroups,
    elapsedSaid,
    lanesOf,
    lanesReading,
    lateSaid,
    sentenceOf,
    shareReading,
    sinceIcon,
    sinceReading,
    sinceWhen,
    weekDays,
    weekReading,
    whoSaid,
  } from './today-tiles.ts';

  let { data }: { data: Shell } = $props();

  /* A RETURN: Today opening is the app opening; the Worker keeps it only on a later day than the record was made. */
  $effect(() => step('came_back'));

  /* THE PLAIN WORDS THIS SCREEN SAYS, kept beside it. */
  const words = {
    needs: 'Needs you',
    today: 'due today',
    urgent: 'urgent',
    review: 'waits on your review',
    moreQuestions: (n: number) => `${n} more ${n === 1 ? 'question' : 'questions'} to decide`,
    showMore: (n: number) => `${n} more that need you`,
    showFewer: 'Show fewer',
    agentsTile: 'Agents working',
    doingNothing: 'has not said what it is doing',
    working: (n: number) => (n === 1 ? 'One is working now.' : `${n} are working now.`),
    since: 'Since you were here',
    sinceSubject: 'What changed since you were last here',
    activity: 'Activity',
    money: 'Money',
    cash: 'Cash',
    cashNow: 'Cash now',
    week: 'The next two weeks',
    moreOn: (n: number) => `${n} more on Work`,
    agent: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
    onIt: (name: string) => `${name.charAt(0).toUpperCase() + name.slice(1)} is on it`,
    handedBack: (name: string) => `${name.charAt(0).toUpperCase() + name.slice(1)} handed it back`,
    waiting: 'waiting on someone',
    toPay: 'to pay',
    toCome: 'coming in',
    addTask: 'Add a task',
    addTip: 'Add a task (n)',
    addIt: 'Add',
    askIt: 'Ask',
    capture: 'Add a task: “Call the bank tomorrow !urgent #Project”',
    added: (t: string) => `Added “${t}” to your tasks.`,
    done: 'Done',
    doneLabel: (t: string) => `Mark “${t}” done`,
    marked: (t: string) => `Marked “${t}” done.`,
    reviewIt: 'Review',
    priority: { urgent: 'urgent', high: 'high', low: 'low' } as Record<string, string>,
  } as const;

  /* A REFUSAL THE RECORD GAVE. A host nobody reached is not one when the local copy holds this reader's Today. */
  const shut = $derived(data.refused && !data.offline ? data.refused : null);

  /* ONE READ FOR THE SCREEN, keyed on the record. A refused shell asks nothing. THE LOCAL COPY DRAWS IT AT ONCE ON OPEN
     and the record is asked once behind it (`recheck`). When the version moves, the copy places the change on its tasks
     and questions (`todaySpots`) and Today is drawn from it (`follow`); a change it cannot place, or one on any other
     list, since Today reads money and reminders no spot names (`EVERY`), drops it and Today is asked again. Who is
     working and what changed since the mark are not kept at all: a run drawn as working from yesterday, or yesterday's
     news under today's mark, would be the wrong thing to see first, so a drawn copy keeps the ones on screen. */
  type TodayValue = Extract<TodayRead, { ok: true }>['value'];
  /** What Today draws of the tasks as a row writes it, and what its reads asked by (`Shown` in `local.ts`). */
  const todaySpots = (v: TodayValue): Spot[] => {
    const shown = {
      says: { what: 'what', agent: 'agent' },
      asks: ['state', 'by', 'priority', 'thing'],
      leaves: { field: 'state', values: ['done', 'dropped'] },
      full: v.full !== false,
    };
    return [
      ...(v.tasks ? [{ list: TASKS, at: ['tasks'], by: null, shown }] : []),
      ...(v.coming ? [{ list: TASKS, at: ['coming'], by: null, shown }] : []),
      { list: QUESTIONS, at: ['questions'], by: null, questions: { total: ['open'] } },
    ];
  };
  const today = read<TodayValue>(
    () => (shut ? null : apiBase()),
    () => import('$lib/record/today-live.ts').then((m) => m.readToday(apiBase())),
    {
      local: {
        name: 'Today',
        base: () => apiBase(),
        lists: () => [TASKS, QUESTIONS, EVERY],
        spots: todaySpots,
        recheck: true,
        follow: (shown, kept) => (shown ? { ...kept, runs: shown.runs, sessions: shown.sessions ?? null, host: shown.host ?? null, since: shown.since, upTo: shown.upTo } : kept),
        shrink: (v) => ({ ...v, runs: [], sessions: null, host: null, since: { rows: [], total: 0, capped: false }, upTo: null }),
      },
    },
  );
  const t = $derived(today.value);
  const day = $derived(t ? dayOf(t.now) : dayOf(data.now));

  /* THE BRIEFING, a read of its own beside the screen's: what matters today, as the record wrote it (`briefing.ts`).
     It never holds the screen back and never fails it, because it answers no cards for a record with no briefing, and
     no cards draws nothing. */
  const briefing = read<{ rows: BriefingRow[]; foot: string | null }>(
    () => (data.refused ? null : apiBase()),
    () =>
      import('./briefing.ts')
        .then(async (m) => {
          const out = await m.readBriefingSaid(apiBase());
          return { ok: true as const, value: { rows: out.value.rows, foot: m.footOf(out.value) } };
        })
        .catch(() => ({ ok: true as const, value: { rows: [], foot: null } })),
  );
  const brief = $derived(briefing.value?.rows ?? []);
  /** Who wrote it, where the rules did and the record said why (`footOf`); nothing from an older host. */
  const briefFoot = $derived(briefing.value?.foot ?? null);

  const takesTasks = $derived(data.lists.some((l) => l.id === TASKS) && may(data, 'append', TASKS));
  const mayWrite = $derived(data.lists.some((l) => l.id === TASKS) && may(data, 'write', TASKS));

  /* ── the capture line ──────────────────────────────────────────────────────── */

  /* THE PLUS OPENS ONE LINE AT THE TOP OF WHAT NEEDS YOU, and a line that is not a question is added as a task the way
     the Work screen adds one (`lib/work/Work.svelte`): the same light syntax, "tomorrow", "!urgent", "#project", and a
     six-second Undo. A question goes to the palette, which answers a sentence; the rail's ask field is the ask bar. */
  let capturing = $state(false);
  let asked = $state('');
  let captureBox = $state<HTMLInputElement | null>(null);
  const typed = $derived(asked.trim());
  const enterAdds = $derived(takesTasks && typed !== '' && !isQuestion(typed));

  async function openCapture() {
    capturing = true;
    warm();
    await tick();
    captureBox?.focus();
  }

  function closeCapture() {
    capturing = false;
    asked = '';
  }

  function ask(e: SubmitEvent) {
    e.preventDefault();
    if (typed === '') return;
    if (enterAdds) void addTask();
    else askIt();
  }

  function askIt() {
    const said = asked.trim();
    asked = '';
    capturing = false;
    openPaletteWith(said);
  }

  /* WHAT A TASK IS READ AGAINST, asked for as the line opens, so Enter does not wait on it. */
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
      /* A REFUSED LINE COMES BACK INTO THE BOX, so it is corrected rather than typed again. */
      revert: () => {
        if (asked.trim() === '') asked = said;
      },
      send: () => writer.create(live.TASKS, fields).then((out) => (out.ok ? { ok: true as const, value: out.entry } : { ok: false as const, fix: out.fix })),
      settle: () => void today.reread(),
      said: words.added(c.text),
      undo: (row) => () => void writer.archive(live.TASKS, row.seq, row.version).then(() => today.reread()),
    });
  }

  /* ── ticking a task where it is ────────────────────────────────────────────── */

  /* THE SAME WRITE THE WORK SCREEN MAKES: the state to done at the version read, drawn gone at once, and put back to the
     state it held for six seconds. A refusal brings the row back and the toast says the record's sentence. */
  let writer: RowWriter | null = null;
  async function writes(): Promise<RowWriter> {
    const m = await import('$lib/record/rows-write.ts');
    return (writer ??= m.rowWriter(apiBase()));
  }

  let gone = $state<ReadonlySet<number>>(new Set());
  const hide = (seq: number) => (gone = new Set(gone).add(seq));
  const show = (seq: number) => {
    const next = new Set(gone);
    next.delete(seq);
    gone = next;
  };

  type Tickable = { seq: number; what: string; state?: string | null | undefined; version?: number | undefined };

  function finish(task: Tickable) {
    if (!mayWrite || gone.has(task.seq)) return;
    const back = task.state && task.state !== 'done' ? task.state : 'open';
    void run<Entry>({
      apply: () => hide(task.seq),
      revert: () => show(task.seq),
      send: async () => {
        const out = await (await writes()).update(TASKS, task.seq, { state: 'done' }, task.version);
        return out.ok ? { ok: true as const, value: out.entry } : { ok: false as const, fix: out.fix };
      },
      settle: () => void today.reread(),
      said: words.marked(task.what),
      undo: (entry) => ({
        apply: () => show(task.seq),
        revert: () => hide(task.seq),
        send: async () => {
          const out = await (await writes()).update(TASKS, task.seq, { state: back }, entry.version);
          return out.ok ? { ok: true as const, value: out.entry } : { ok: false as const, fix: out.fix };
        },
        settle: () => void today.reread(),
      }),
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
    /* NEVER FROM THE COPY: what it drew was never read against this mark, and its newest line is not kept. */
    if (stamped || data.refused || held === null || today.stale) return;
    stamped = true;
    const upTo = held.upTo;
    /* Imported with the screen, never inside the leave: a closing tab does not wait for a module. */
    void markAll(apiBase(), upTo).catch(() => {});
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

  /* ── what needs you ────────────────────────────────────────────────────────── */

  /** A project's hue: the record's own, else the one its name is always drawn in (`face.ts`). */
  const hueOf = (project: string | null, hue: number | null | undefined): number | null => (typeof hue === 'number' ? hue : project ? hueFor(project) : null);

  type Need =
    | { kind: 'question'; key: string; href: string; q: QueueQuestion }
    | { kind: 'task'; key: string; href: string; task: TaskRow }
    | { kind: 'bill'; key: string; href: string; bill: DueRow };

  const tasks = $derived((t?.tasks ?? []).filter((x) => !gone.has(x.seq)));
  const bills = $derived(t?.money?.due ?? []);
  const taskNeed = (task: TaskRow): Need => ({ kind: 'task', key: `t${task.seq}`, href: `/r/${TASKS}/${task.seq}`, task });
  const billNeed = (bill: DueRow): Need => ({ kind: 'bill', key: `b${bill.seq}`, href: `/r/obligations/${bill.seq}`, bill });

  /* THE ORDER THE BOARD READS IN: the questions answered in place, then what is late, what was handed back, what is due
     today and what is urgent. Money late or due today sits with the work of the same day. */
  const needs = $derived.by((): Need[] => {
    if (!t) return [];
    const late = tasks.filter((x) => x.why === 'late');
    return [
      ...t.questions.map((q): Need => ({ kind: 'question', key: `q${q.id}`, href: `/decide/${encodeURIComponent(q.id)}`, q })),
      ...late.map(taskNeed),
      ...bills.filter((b) => b.late).map(billNeed),
      ...tasks.filter((x) => x.why === 'review').map(taskNeed),
      ...tasks.filter((x) => x.why === 'today').map(taskNeed),
      ...bills.filter((b) => !b.late && b.due === day).map(billNeed),
      ...tasks.filter((x) => x.why === 'urgent').map(taskNeed),
    ];
  });
  /* HOW MANY QUESTIONS WAIT AND HOW MANY AGENTS WORK ARE `boot`'S (`waits`, EXP-E07), the rail's badge and its working
     row; this screen's own read stands only for a host older than the field. */
  const waits = $derived(waitsNow());
  const moreQuestions = $derived(t ? Math.max(0, (waits?.questions ?? t.open) - t.questions.length) : 0);
  const needing = $derived(needs.length + moreQuestions);

  /* A LONG MORNING IS FOLDED, never cut: the first eight, and the rest one press away. */
  const FIRST = 8;
  let unfolded = $state(false);
  const shownNeeds = $derived(unfolded ? needs : needs.slice(0, FIRST));

  const lateDays = $derived(
    [...tasks.filter((x) => x.why === 'late' && x.due).map((x) => x.due!), ...bills.filter((b) => b.late && b.due).map((b) => b.due!)].sort(),
  );
  const said = $derived(t ? sentenceOf(needing, lateDays, waits?.working ?? t.runs.length, day, lateDays.length, waits?.inbox ?? 0) : null);

  /* ── the next two weeks ────────────────────────────────────────────────────── */

  const coming = $derived((t?.coming ?? []).filter((x) => !gone.has(x.seq)));
  const dated = $derived(
    t
      ? datedOf(
          tasks.map((x) => ({ ...x, hue: hueOf(x.project, x.hue) })),
          coming.map((x) => ({ ...x, hue: hueOf(x.project, x.hue) })),
          bills,
          day,
        )
      : [],
  );
  const strip = $derived(weekDays(dated, day));
  const stripSaid = $derived(weekReading(dated, day));

  type Later = { day: string; key: string; href: string } & ({ kind: 'task'; task: DayRow } | { kind: 'bill'; bill: DueRow });
  const later = $derived.by((): Later[] => [
    ...coming.map((task): Later => ({ kind: 'task', day: task.day, key: `c${task.seq}`, href: `/r/${TASKS}/${task.seq}`, task })),
    ...bills.filter((b) => b.due !== null && b.due > day).map((bill): Later => ({ kind: 'bill', day: bill.due!, key: `b${bill.seq}`, href: `/r/obligations/${bill.seq}`, bill })),
  ]);
  const groups = $derived(dayGroups(later, day));
  const PER_GROUP = 6;

  /* ── the agents ────────────────────────────────────────────────────────────── */

  const sessions = $derived(t?.sessions ?? []);
  const lanes = $derived(lanesOf(sessions, words.agent));
  const bySeq = $derived(new Map(sessions.flatMap((s) => (s.seq === null ? [] : [[s.seq, s] as const]))));
  const agentsSaid = $derived(t ? (sessions.length > 0 ? lanesReading(sessions, t.now, words.agent) : t.runs.length > 0 ? words.working(t.runs.length) : '') : '');
  const quiet = (seen: string | null, now: number): boolean => {
    const at = seen ? Date.parse(seen) : Number.NaN;
    return Number.isFinite(at) && now - at > QUIET_MS;
  };

  /* ── since you were here ───────────────────────────────────────────────────── */

  const listIcons = $derived(new Map(data.index.registers.map((r) => [r.id, r.icon as string])));
  const sinceTop = $derived((t?.since.rows ?? []).slice(0, 5));
  const sinceParts = $derived.by(() => {
    const rows = t?.since.rows ?? [];
    const rest = rows.slice(5).reduce((n, r) => n + r.count, 0);
    return [...sinceTop.map((r) => ({ label: '', value: r.count })), ...(rest > 0 ? [{ label: '', value: rest }] : [])];
  });
  const sinceMeta = $derived(t ? [sinceWhen(t.since.from, t.now) ?? '', whoSaid(t.since.byAgents ?? 0, t.since.byYou ?? 0)].filter(Boolean).join(' · ') : '');
  const sinceSummary = $derived(`${words.sinceSubject}: ${(t?.since.rows ?? []).map((r) => `${r.label} ${r.count}`).join(', ')}`);

  /* ── cash ──────────────────────────────────────────────────────────────────── */

  const money = $derived(t?.money ?? null);
  const lead = $derived(money?.cash[0] ?? null);
  const forecast = $derived(money?.forecast ?? null);
  const cashSaid = $derived(forecast ? cashReading(forecast) : null);
  const currencyName = (code: string | undefined): string => {
    if (!code) return words.cashNow;
    try {
      return new Intl.DisplayNames(['en-GB'], { type: 'currency' }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  /* THE SMALLER FIGURES UNDER THE LEAD: cash held in another currency, then each book's, three at most. */
  const minor = $derived(money ? [...money.cash.slice(1).map((c) => ({ amount: c.amount, label: currencyName(c.currency) })), ...money.books.map((b) => ({ amount: b.amount, label: b.label ?? words.cashNow }))].slice(0, 3) : []);
  /* WITH NO WALK TO DRAW, THE BOOKS ARE THE PICTURE: each book's share of the cash, where they share one currency. */
  const bookParts = $derived.by(() => {
    const books = money?.books ?? [];
    const currencies = new Set(books.map((b) => b.currency));
    if (books.length < 2 || currencies.size !== 1 || books.some((b) => typeof b.value !== 'number')) return [];
    return books.map((b) => ({ label: b.label ?? words.cashNow, value: Math.max(0, b.value ?? 0) }));
  });
  const bookSaid = (n: number): string => {
    const cur = money?.books[0]?.currency;
    return cur ? moneyInText(moneyText(Math.round(n), cur)) : n.toLocaleString('en-GB');
  };
  const cashTile = $derived(lead !== null && (forecast !== null || bookParts.length > 0));

  /* ── what is drawn at all ──────────────────────────────────────────────────── */

  /* A TILE WITH NOTHING TO SAY IS NOT DRAWN: no agent at work, nothing new since the mark, no cash counted. The sentence
     at the top already says the quiet half, and the main column takes the width when the side holds nothing. */
  const agentsShown = $derived(Boolean(t && (t.runs.length > 0 || sessions.length > 0)));
  const sinceShown = $derived(Boolean(t && t.since.total > 0));
  const cashShown = $derived(Boolean(money && ((lead && cashTile) || money.cash.length > 0)));
  const remindersShown = $derived(Boolean(t && (t.reminders?.length ?? 0) > 0));
  const sideShown = $derived(remindersShown || agentsShown || sinceShown || cashShown);

  /* ── the keyboard ──────────────────────────────────────────────────────────── */

  type Keyed = { key: string; href: string; tick: Tickable | null; question: boolean };
  const keyed = $derived.by((): Keyed[] => [
    ...shownNeeds.map((n): Keyed => ({ key: n.key, href: n.href, tick: n.kind === 'task' ? n.task : null, question: n.kind === 'question' })),
    ...groups.flatMap((g) => g.items.slice(0, PER_GROUP)).map((l): Keyed => ({ key: l.key, href: l.href, tick: l.kind === 'task' ? l.task : null, question: false })),
  ]);
  let cursor = $state<string | null>(null);
  const under = $derived(keyed.find((k) => k.key === cursor) ?? null);
  const answers: Record<string, { choose(i: number): boolean } | undefined> = $state({});

  function focusRow(key: string) {
    const row = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`);
    row?.querySelector<HTMLElement>('.line-title, .q-text')?.focus();
  }

  function move(by: number) {
    if (keyed.length === 0) return;
    const i = keyed.findIndex((k) => k.key === cursor);
    const next = i < 0 ? (by > 0 ? 0 : keyed.length - 1) : Math.min(keyed.length - 1, Math.max(0, i + by));
    cursor = keyed[next]!.key;
    focusRow(cursor);
  }

  /* A `g` PRESSED FIRST IS THE SHELL'S, and so is the key after it: `g 1` goes to the first place in the rail. */
  let goAt = 0;

  function keys(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || covered()) return;
    if (typing()) {
      if (e.key === 'Escape' && capturing && document.activeElement === captureBox) {
        e.preventDefault();
        e.stopPropagation();
        closeCapture();
      }
      return;
    }
    if (silenced(e)) return;
    if (e.key === 'g') {
      goAt = Date.now();
      return;
    }
    if (Date.now() - goAt < 1000) {
      goAt = 0;
      return;
    }
    const on = document.activeElement;
    const control = on instanceof HTMLElement && on.closest('button, a[href], select, summary') !== null;
    switch (e.key) {
      case 'j':
        move(1);
        break;
      case 'k':
        move(-1);
        break;
      case 'x': {
        const it = under?.tick;
        if (!it || !mayWrite) return;
        const i = keyed.findIndex((k) => k.key === cursor);
        finish(it);
        const next = keyed[i + 1] ?? keyed[i - 1];
        cursor = next?.key ?? null;
        if (next) void tick().then(() => focusRow(next.key));
        break;
      }
      case 'Enter':
        if (control || !under) return;
        void goto(at(under.href));
        break;
      case 'n':
        if (!takesTasks) return;
        void openCapture();
        break;
      case 'Escape':
        if (cursor === null) return;
        cursor = null;
        break;
      default: {
        const n = Number(e.key);
        if (!under?.question || !Number.isInteger(n) || n < 1 || n > 9) return;
        if (!answers[under.key]?.choose(n - 1)) return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
  }

  $effect(() => {
    const on = (e: KeyboardEvent) => keys(e);
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  });

  /* ── what a row says ───────────────────────────────────────────────────────── */

  function taskMeta(x: { agent: string | null; state?: string | null | undefined; priority?: string | null | undefined }): string[] {
    const parts: string[] = [];
    const tier = x.priority ? words.priority[x.priority] : undefined;
    if (tier) parts.push(tier);
    if (x.agent) parts.push(x.state === 'review' ? words.handedBack(x.agent) : words.onIt(x.agent));
    else if (x.state === 'blocked') parts.push(words.waiting);
    return parts;
  }

  /* THE CHECK SAYS WHO HOLDS IT: dashed amber while it waits on somebody, the live arc while an agent is on it. */
  const checkState = (x: { agent: string | null; state?: string | null | undefined }): string | undefined =>
    x.state === 'blocked' ? 'waiting' : x.agent && x.state !== 'review' ? 'held' : undefined;

  const signed = (bill: DueRow): string => (bill.amount ? `${bill.out ? '−' : '+'}${bill.amount}` : '');
</script>

<svelte:head><title>{titleOf(copy.today)}</title></svelte:head>

<PageHead icon="today" title={copy.today} sentence={said?.text} needs={said?.needs || undefined}>
  {#snippet actions()}
    {#if takesTasks && !data.refused}
      <button
        type="button"
        class="add tap"
        aria-label={words.addTask}
        title={words.addTip}
        aria-expanded={capturing}
        aria-controls={capturing ? 'today-capture' : undefined}
        onclick={() => (capturing ? closeCapture() : void openCapture())}
      >
        <Icon name="plus" size="l" />
      </button>
    {/if}
  {/snippet}
</PageHead>

<div class="page">
  {#if shut}
    <!-- A REFUSAL AS EVERY SCREEN DRAWS ONE, which is also what settles the screen: a bare sentence said nothing to the
         readiness count, so an address naming no record never finished drawing. -->
    <ReadState state="refused" refusal={shut.fix} />
  {:else if today.state !== 'ready' && today.state !== 'empty'}
    <ReadState state={today.state} refusal={today.refusal} onretry={() => void today.reread()} />
  {:else if t}
    <div class="today" data-alone={sideShown ? undefined : ''}>
      <div class="t-main">
        <!-- ══ THE LEAD TILE: the day, the sentence, and what needs you ══ -->
        <div class="t-needs tile" data-quiet={needing === 0 && !capturing && brief.length === 0 ? '' : undefined}>
          {#if capturing}
            <form class="capture" id="today-capture" onsubmit={ask}>
              <label class="sr-only" for="today-ask">{words.addTask}</label>
              <input
                id="today-ask"
                class="capture-input"
                type="text"
                autocomplete="off"
                enterkeyhint="done"
                placeholder={words.capture}
                bind:value={asked}
                bind:this={captureBox}
              />
              <button type="submit" class="capture-btn" disabled={typed === ''}>{enterAdds || typed === '' ? words.addIt : words.askIt}<span class="cap-key" aria-hidden="true"><Kbd keys="↵" /></span></button>
              {#if typed !== '' && takesTasks}
                {#if enterAdds}
                  <button type="button" class="capture-btn quiet" onclick={askIt}>{words.askIt}</button>
                {:else}
                  <button type="button" class="capture-btn quiet" onclick={() => void addTask()}>{words.addIt}</button>
                {/if}
              {/if}
            </form>
          {/if}

          <!-- WHAT MATTERS TODAY, first, and nothing where the record wrote no briefing. -->
          <Briefing cards={brief} foot={briefFoot} />

          <!-- WHAT NEEDS YOU, and nothing when nothing does: the sentence above has already said so. -->
          {#if needing > 0}
            <Section title={words.needs}>
              <ul class="ledger ledger-lead rows">
                {#each shownNeeds as n (n.key)}
                  <li data-row={n.key} data-cursor={cursor === n.key ? '' : undefined} onfocusin={() => (cursor = n.key)}>
                    {#if n.kind === 'question'}
                      <Question bind:this={answers[n.key]} question={n.q} now={t.now} onanswered={answered} />
                    {:else if n.kind === 'task'}
                      {@render taskRow(n.task, n.href, true)}
                    {:else}
                      {@render billRow(n.bill, n.href, true)}
                    {/if}
                  </li>
                {/each}
                {#if needs.length > FIRST}
                  <li>
                    <button type="button" class="line line-short more-row" aria-expanded={unfolded} onclick={() => (unfolded = !unfolded)}>
                      <span class="line-mark more-mark" data-open={unfolded ? '' : undefined}><Icon name="chevron" size="m" /></span>
                      <span class="line-main"><span class="line-title">{unfolded ? words.showFewer : words.showMore(needs.length - FIRST)}</span></span>
                    </button>
                  </li>
                {/if}
                {#if moreQuestions > 0}
                  <li>
                    <a class="line line-short more-row" href={at('/decide')}>
                      <span class="line-mark more-mark"><Icon name="chevron" size="m" /></span>
                      <span class="line-main"><span class="line-title">{words.moreQuestions(moreQuestions)}</span></span>
                    </a>
                  </li>
                {/if}
              </ul>
            </Section>
          {/if}
        </div>

        <!-- ══ THE NEXT TWO WEEKS, only when something falls in them ══ -->
        {#if dated.length > 0}
          <div class="t-week">
            <Tile icon="calendar" title={words.week}>
              <WeekStrip days={strip} today={day} subject={words.week} />
              <p class="reading">{stripSaid}</p>
            </Tile>
          </div>
        {/if}

        <!-- ══ THE DAYS COMING UP ══ -->
        {#if groups.length > 0}
          <div class="t-coming">
            {#each groups as g (g.key)}
              <Section title={g.title}>
                {#snippet aside()}<span class="span-said">{g.span}</span>{/snippet}
                <ul class="ledger ledger-lead rows">
                  {#each g.items.slice(0, PER_GROUP) as l (l.key)}
                    <li data-row={l.key} data-cursor={cursor === l.key ? '' : undefined} onfocusin={() => (cursor = l.key)}>
                      {#if l.kind === 'task'}
                        {@render taskRow(l.task, l.href, false)}
                      {:else}
                        {@render billRow(l.bill, l.href, false)}
                      {/if}
                    </li>
                  {/each}
                  {#if g.items.length > PER_GROUP}
                    <li>
                      <a class="line line-short more-row" href={at('/?work')}>
                        <span class="line-mark more-mark"><Icon name="chevron" size="m" /></span>
                        <span class="line-main"><span class="line-title">{words.moreOn(g.items.length - PER_GROUP)}</span></span>
                      </a>
                    </li>
                  {/if}
                </ul>
              </Section>
            {/each}
          </div>
        {/if}
      </div>

      <!-- ══ BESIDE IT: the tiles, each only when it has something to show ══ -->
      {#if sideShown}
        <div class="t-side">
          {#if t && remindersShown}<RemindersTile lines={t.reminders ?? []} />{/if}
          {#if agentsShown}
            <Tile class="t-agents" icon="session" title={words.agentsTile} count={t.runs.length}>
              {#if t.runs.length > 0}
                <ul class="runs">
                  {#each t.runs as r, i (r.seq ?? i)}
                    {@const s = r.seq === null ? undefined : bySeq.get(r.seq)}
                    <li class="run">
                      <AgentFace agent={r.agent} run={r.seq === null ? '' : `S${r.seq}`} live={quiet(r.seen, t.now) ? 'quiet' : 'working'} size="s" />
                      <span class="run-main">
                        <span class="run-name">{words.agent(r.agent)}</span>
                        {#if r.project}<span class="run-where">{r.project}</span>{/if}
                        <span class="run-doing" dir="auto">{r.doing || words.doingNothing}</span>
                      </span>
                      <span class="run-time num">{s ? elapsedSaid(t.now - s.opened) : r.seen ? since(r.seen, t.now) : ''}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if lanes.length > 0 && t.dayStart !== undefined}
                <div class="lanes">
                  <Swimlanes {lanes} start={t.dayStart} end={Math.max(t.now + 3_600_000, t.dayStart + 6 * 3_600_000)} now={t.now} subject="Agent runs" />
                </div>
              {/if}
              {#if agentsSaid}<p class="reading">{agentsSaid}</p>{/if}
            </Tile>
          {/if}

          {#if sinceShown}
            <Tile class="t-since" icon="activity" title={words.since} href="/audit" hrefLabel={words.activity}>
              <div class="figure-row">
                <span class="figure num">{t.since.total.toLocaleString('en-GB')}{t.since.capped ? '+' : ''}</span>
                {#if sinceMeta}<span class="figure-meta">{sinceMeta}</span>{/if}
              </div>
              <Stacked parts={sinceParts} height={10} summary={sinceSummary} />
              <ul class="legend">
                {#each sinceTop as row, i (row.key)}
                  <li>
                    <a class="legend-row" href={at(row.href)}>
                      <span class="swatch" data-tone={rampAt(i)}></span>
                      <Icon name={sinceIcon(row, (l) => listIcons.get(l)) as IconName} size="m" />
                      <span class="legend-n num">{row.count}</span>
                      <span class="legend-label">{row.label}</span>
                    </a>
                  </li>
                {/each}
              </ul>
              <p class="reading">{sinceReading(t.since.rows, t.since.total, t.since.byAgents ?? 0, t.since.byYou ?? 0)}</p>
            </Tile>
          {/if}

          {#if money && lead && cashTile}
            <Tile class="t-cash" icon="money" title={words.cash} href="/p/money" hrefLabel={words.money}>
              <div class="figure-row cash-row">
                <span class="figure num">{lead.amount}</span>
                {#if forecast}
                  <span class="trend"><Sparkline values={forecast.values} mark="low" tone={forecast.crossed ? 'danger' : 'ink'} summary={cashSummary(forecast)} /></span>
                {/if}
              </div>
              <p class="figure-sub">{money.cash.length > 1 ? currencyName(lead.currency) : words.cashNow}</p>
              {#if minor.length > 0}
                <div class="minor">
                  {#each minor as m, i (i)}
                    <div class="minor-one"><span class="minor-fig num">{m.amount}</span><span class="minor-label">{m.label}</span></div>
                  {/each}
                </div>
              {/if}
              {#if forecast && cashSaid}
                <p class="reading">
                  {#if cashSaid.needs && cashSaid.text.includes(cashSaid.needs)}
                    {cashSaid.text.slice(0, cashSaid.text.indexOf(cashSaid.needs))}<span class="needs-said">{cashSaid.needs}</span>{cashSaid.text.slice(cashSaid.text.indexOf(cashSaid.needs) + cashSaid.needs.length)}
                  {:else}
                    {cashSaid.text}
                  {/if}
                </p>
              {:else if bookParts.length > 0}
                {@const share = shareReading(bookParts)}
                <Stacked parts={bookParts} subject={words.cashNow} format={bookSaid} />
                {#if share}<p class="reading">{share}</p>{/if}
              {/if}
            </Tile>
          {:else if money && money.cash.length > 0}
            <!-- WITH NOTHING TO DRAW, THE CASH IS TWO LINES ON THE GROUND, never a figure alone in a tile. -->
            <div class="t-cash">
              <Section title={words.cash}>
                {#snippet aside()}<a class="aside-link tap" href={at('/p/money')}>{words.money}<Icon name="arrow" size="s" /></a>{/snippet}
                <ul class="ledger ledger-lead rows">
                  {#each [...money.cash.map((c) => ({ label: currencyName(c.currency), amount: c.amount })), ...money.books.map((b) => ({ label: b.label ?? words.cashNow, amount: b.amount }))] as c, i (i)}
                    <li>
                      <div class="line">
                        <span class="line-mark"><IconWell name="money" size="l" /></span>
                        <span class="line-main"><span class="line-title">{c.label}</span></span>
                        <span class="line-amount num">{c.amount}</span>
                        <span></span>
                      </div>
                    </li>
                  {/each}
                </ul>
              </Section>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet taskRow(task: Tickable & { agent: string | null; project: string | null; hue?: number | null | undefined; priority?: string | null | undefined; why?: TaskRow['why']; due?: string | null; day?: string }, href: string, need: boolean)}
  {@const hue = hueOf(task.project, task.hue)}
  <div class="line line-tall">
    <span class="line-mark">
      {#if mayWrite}
        <button type="button" class="line-check tap" role="checkbox" aria-checked="false" aria-label={words.doneLabel(task.what)} data-state={checkState(task)} onclick={() => finish(task)}>
          <Icon name="check" size="s" />
        </button>
      {:else}
        <span class="line-check" data-state={checkState(task)} aria-hidden="true"></span>
      {/if}
    </span>
    <span class="line-main">
      <a class="line-title tap" href={at(href)} dir="auto">{task.what}</a>
      <span class="line-detail">
        {#if task.project}<span class="proj" style:--hue={hue} aria-hidden="true"></span><span dir="auto">{task.project}</span>{#if taskMeta(task).length}{' · '}{/if}{/if}{taskMeta(task).join(' · ')}
      </span>
    </span>
    {#if need && task.why === 'late' && task.due}
      <span class="line-when line-late" data-why="late">{lateSaid(task.due, day)}</span>
    {:else if need && task.why === 'review'}
      <span class="line-when line-late" data-why="review">{words.review}</span>
    {:else if need && task.why === 'urgent'}
      <span class="line-when line-late" data-why="urgent">{words.urgent}</span>
    {:else if need && task.why === 'today'}
      <span class="line-when when-today" data-why="today">{words.today}</span>
    {:else if task.day}
      <span class="line-when">{dueSaid(task.day, day)}</span>
    {:else}
      <span></span>
    {/if}
    <span class="line-verbs">
      {#if task.why === 'review'}
        <Button weight="quiet" size="sm" {href} kbd="↵">{words.reviewIt}</Button>
      {/if}
      {#if mayWrite}
        <Button weight="quiet" size="sm" kbd="x" onclick={() => finish(task)}>{words.done}</Button>
      {/if}
    </span>
  </div>
{/snippet}

{#snippet billRow(bill: DueRow, href: string, need: boolean)}
  <div class="line line-tall">
    <span class="line-mark"><IconWell name={bill.out ? 'obligation' : 'money'} size="l" /></span>
    <span class="line-main">
      <a class="line-title tap" href={at(href)} dir="auto">{bill.what}</a>
      <span class="line-detail">{words.money} · {bill.out ? words.toPay : words.toCome}{#if !need && bill.due}{' · '}{daySaid(bill.due)}{/if}</span>
    </span>
    {#if need && bill.late && bill.due}
      <span class="line-when line-late" data-why="late">{lateSaid(bill.due, day)}</span>
    {:else if need}
      <span class="line-when when-today" data-why="today">{words.today}</span>
    {:else}
      <span></span>
    {/if}
    <span class="line-amount num" data-in={bill.out ? undefined : ''}>{signed(bill)}</span>
  </div>
{/snippet}

<style>
  .page {
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  /* ── the grid ────────────────────────────────────────────────────────────────
     Two columns and no fixed cells: on the left what needs you, the two weeks and the days coming up; on the right
     whichever tiles have something to say, stacked. A tile that is not drawn leaves no hole, and with no tile at all the
     left column takes the width. Every track may shrink to nothing, so nothing can push the page wider than the window. */
  .today {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    align-items: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .today[data-alone] {
    grid-template-columns: minmax(0, 1fr);
    max-inline-size: 56rem;
  }

  .t-main,
  .t-side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* THE LEAD TILE: white, the day and the sentence at its head with room round them, and what needs you under them. */
  .t-needs {
    min-inline-size: 0;
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
    background: var(--bg);
    border-radius: var(--r-lg);
  }

  .t-needs :global(.section-head) {
    padding-inline: var(--sp-2);
  }

  .t-needs > :global(.section) {
    margin-block-start: var(--sp-2);
  }

  .t-week,
  .t-coming {
    min-inline-size: 0;
  }

  .t-coming {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* BETWEEN A LAPTOP AND A PHONE: one column, what needs you first, then the tiles, then the days. */
  @media (width < 1180px) {
    .today {
      grid-template-columns: minmax(0, 1fr);
    }

    .t-main {
      display: contents;
    }

    .t-needs {
      order: 1;
    }

    .t-side {
      order: 2;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
      align-items: start;
    }

    .t-week {
      order: 3;
    }

    .t-coming {
      order: 4;
    }
  }

  /* ON A PHONE the lead tile's head is the title row's, so a tile with nothing under it is not drawn. */
  @media (width < 900px) {
    .page {
      padding: var(--sp-2) var(--gutter) var(--sp-8);
    }

    .today,
    .t-coming {
      gap: var(--sp-4);
    }

    .t-needs[data-quiet] {
      display: none;
    }

    /* STRETCHED, NOT `start`: the column is the tile's width. At `start` a tile took its own widest line, and one
       with a long heading stood past the phone's edge. */
    .t-side {
      display: flex;
      align-items: stretch;
      gap: var(--sp-4);
    }

    .lanes {
      display: none;
    }
  }

  /* ── the toolbar's one primary: the ink circle with a plus ─────────────────── */
  .add {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--ink);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--on-ink);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .add:hover {
      background: var(--primary-hover);
    }
  }

  .add[aria-expanded='true'] :global(.icon) {
    rotate: 45deg;
  }

  @media (prefers-reduced-motion: no-preference) {
    .add :global(.icon) {
      transition: rotate var(--d-state) var(--ease-out);
    }
  }


  .rows {
    margin-block-start: calc(-1 * var(--sp-1));
  }

  /* A row that is not itself a link takes the wash under the pointer too, as one that is does (`rows.css`). */
  @media (hover: hover) and (pointer: fine) {
    .rows > li > div.line:hover,
    .rows > li > :global(.q:hover) {
      background: var(--hover-wash);
    }
  }

  .rows > li[data-cursor] > :global(.q) {
    background: var(--hover-wash);
  }

  /* THE COLUMN FOR THE AMOUNT and the verbs: a bill's figure where a task's pills are. */
  .line-amount[data-in] {
    color: var(--earn);
    font-weight: 600;
  }

  .when-today {
    color: var(--ink2);
    font-weight: 500;
  }

  /* THE PROJECT'S SQUARE before its name, in the project's own hue, as its face is drawn everywhere. */
  .proj {
    display: inline-block;
    inline-size: 12px;
    block-size: 12px;
    margin-inline-end: 6px;
    border-radius: 3px;
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
    vertical-align: -1px;
  }

  .more-row {
    inline-size: 100%;
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    cursor: pointer;
  }

  .more-row .line-title {
    font-weight: 500;
  }

  .more-mark {
    color: var(--dim);
  }

  .more-mark[data-open] :global(.icon) {
    rotate: 90deg;
  }

  .aside-link,
  .span-said {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  .span-said {
    color: var(--dim);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) and (pointer: fine) {
    .aside-link:hover {
      color: var(--ink);
    }
  }

  /* ── the capture line, at the top of what needs you ────────────────────────── */
  .capture {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-block-end: var(--sp-2);
  }

  .capture-input {
    flex: 1;
    min-inline-size: 0;
    block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--bg);
    border: 0;
    border-radius: var(--r-md);
    box-shadow: var(--e1);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .capture-input::placeholder {
    color: var(--dim);
  }

  .capture-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2) 0 var(--sp-4);
    background: var(--ink);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--on-ink);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
    cursor: pointer;
  }

  .capture-btn :global(.kbd) {
    background: color-mix(in srgb, var(--on-ink) 18%, transparent);
    color: var(--on-ink);
  }

  .capture-btn.quiet {
    padding-inline: var(--sp-4);
    background: var(--hover-wash);
    color: var(--ink);
  }

  .capture-btn:disabled {
    background: var(--s2);
    color: var(--dim);
    cursor: not-allowed;
  }

  .cap-key {
    display: inline-flex;
  }

  @media (pointer: coarse) {
    .capture-input {
      block-size: var(--tap);
      font-size: var(--t-md);
    }

    .capture-btn {
      min-block-size: var(--tap);
      padding-inline: var(--sp-4);
    }

    .cap-key {
      display: none;
    }
  }

  /* ── inside the tiles ──────────────────────────────────────────────────────── */

  /* THE ONE WRITTEN LINE under every chart, saying what it means. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
    text-wrap: pretty;
  }

  .needs-said {
    color: var(--danger-text);
    font-weight: 500;
  }

  .figure-row {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .cash-row {
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  /* A LONG FIGURE WRAPS RATHER THAN PUSHING THE TILE PAST A PHONE'S EDGE. */
  .figure {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-figure);
    font-weight: 600;
    line-height: calc(34 / 30);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-meta {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trend {
    flex: 0 1 120px;
    min-inline-size: 64px;
  }

  .figure-sub {
    margin: calc(-1 * var(--sp-3)) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .minor {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-6);
  }

  .minor-one {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .minor-fig {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
    font-variant-numeric: tabular-nums;
  }

  .minor-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE AGENTS: a line a run, its face with the live ring, who and where and what, and how long it has been at it. */
  .runs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .run {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    min-inline-size: 0;
  }

  .run-main {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 6px;
    min-inline-size: 0;
    overflow: hidden;
    font-size: var(--t-base);
    white-space: nowrap;
  }

  .run-name {
    flex: none;
    color: var(--ink);
    font-weight: 600;
  }

  .run-where {
    flex: none;
    color: var(--ink);
  }

  .run-doing {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink2);
    text-overflow: ellipsis;
  }

  .run-time {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .lanes {
    min-inline-size: 0;
  }

  /* WHAT CHANGED: a swatch a kind, its glyph, its count and its words, two to a line, each a door to the activity. */
  .legend {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 28px;
    min-inline-size: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-base);
    text-decoration: none;
  }

  /* A ROW THAT OPENS ITS LIST IS A 44 TARGET UNDER A THUMB (13 §7); 28 is the legend's density under a mouse. */
  @media (pointer: coarse) {
    .legend-row {
      min-block-size: var(--tap);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .legend-row:hover .legend-label {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .legend-n {
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .legend-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE SWATCH IS THE STACKED BAR'S OWN STEP: the accent, then its tints, as the chart draws them (`viz.css`). */
  .swatch {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
    background: var(--chart-1);
  }

  .swatch[data-tone='g1'] {
    background: color-mix(in srgb, var(--chart-1) 76%, var(--tile));
  }

  .swatch[data-tone='g2'] {
    background: var(--chart-2);
  }

  .swatch[data-tone='g3'] {
    background: var(--chart-3);
  }

  .swatch[data-tone='g4'] {
    background: var(--chart-other);
  }

  @media (width < 640px) {
    .legend {
      grid-template-columns: minmax(0, 1fr);
    }

    /* A PHONE'S ROW: the mark, the words across, and the time and the verbs on a line under them. */
    .rows :global(.line.line-tall) {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      align-items: start;
      gap: var(--sp-1) var(--sp-3);
    }

    .rows :global(.line.line-tall > .line-mark) {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: center;
    }

    .rows :global(.line.line-tall > .line-main) {
      grid-column: 2 / -1;
      grid-row: 1;
    }

    .rows :global(.line.line-tall > .line-when) {
      grid-column: 2;
      grid-row: 2;
      justify-content: flex-start;
    }

    .rows :global(.line.line-tall > .line-verbs),
    .rows :global(.line.line-tall > .line-amount) {
      grid-column: 3;
      grid-row: 2;
    }
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (forced-colors: active) {
    .add {
      border: 1px solid ButtonText;
    }

    .proj,
    .swatch {
      forced-color-adjust: none;
    }
  }
</style>
