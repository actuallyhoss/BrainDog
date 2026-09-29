<!--
  Work: one screen for the tasks, where most writing happens.

  THE OWNER'S OLD TOOL HAD ONE, AND 85% OF HIS WRITES LANDED ON IT (`C:\Tools\legacy\app\src\routes\Work.svelte`). Here
  the same work was split over a Work page and a Board page, drawn by page blocks, and every gesture waited for the
  record. This screen is the old one's shape over the record's tasks list:

    1. A CAPTURE LINE FIRST. Typing and Enter adds a task at once, filed under the project the filter shows, with a
       light syntax that is never required (`capture.ts`): "Chase Halden tomorrow !urgent #kiln".
    2. BANDS, TOP TO BOTTOM: Just changed, Overdue, Today, the list's priorities, Waiting, With an agent, Later, and Done
       recently, the last two folded. A task is in one band (`board.ts`).
    3. NOTHING YOU TOUCH DISAPPEARS. A task ticked, moved, re-dated or deleted goes to Just changed wearing what happened
       to it, and stays there for ten minutes, so checking you hit the right one never means doing the opposite to look.
    4. THE ROW CARRIES THE VERBS: tick, change the words, set the day, move it, delete it, on hover and focus, and in a
       menu a tap opens on a phone. Every write is drawn at once and sent after (`lib/data/optimistic.ts`), with Undo.
    5. THE KEYBOARD: j k, x, e, d, m, Delete, n or c, /, Esc. The `?` beside the title prints them.
    6. IT LISTENS. The read is asked again when the record's version moves, rows that arrive are tinted, and nothing is
       redrawn from under a row being edited, the caret, the cursor or the scroll.

  GENERIC OVER ANY TASKS LIST: every part asks `shapeOf` whether the list has its field and is absent when it does not.
-->
<script module lang="ts">
  /* JUST CHANGED OUTLIVES A VISIT, so leaving for Money and coming back still shows what was just done, and the project
     filter is where it was left. Module scope is this tab's, and nothing here is kept past it. */
  const kept = new Map<number, { at: number; mark: string }>();
  let keptPick = '';
</script>

<script lang="ts">
  import { tick as flush, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { liveArrivals, liveOverlay, run, type Change, type Pending, type Sent } from '$lib/data/optimistic.svelte.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { may } from '$lib/record/may.ts';
  import { capturedFields, inverseOf, rowWriter, type RowWriter, type Wrote } from '$lib/record/rows-write.ts';
  import { readWork, TASKS, type Work } from '$lib/record/work-live.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import {
    ALL,
    BANDS,
    FOLDED,
    NONE,
    addDays,
    bandOf,
    bandTitle,
    byDue,
    byFinished,
    dayIn,
    dayOf,
    daySaid,
    dueSaid,
    inProject,
    isDone,
    matches,
    nextMonday,
    projectOf,
    type Band,
  } from './board.ts';
  import { captureOf, captureSaid, contextOf, freshFields } from './capture.ts';

  let { data }: { data: Shell } = $props();

  /* THE PLAIN WORDS THIS SCREEN SAYS, kept beside it. */
  const words = {
    title: 'Work',
    capture: 'Add a task',
    captureHint: 'Type a task and press Enter. "tomorrow", "!urgent" or "#project" at the end files it, if you like.',
    filedUnder: (name: string) => `Adds to ${name}`,
    allProjects: 'All projects',
    noProject: 'No project',
    project: 'Project',
    search: 'Search tasks',
    keys: 'Keys',
    nothing: 'Nothing open. Type above to add a task.',
    nothingHere: 'Nothing here matches.',
    readOnly: 'You can read these tasks but not change them.',
    done: (t: string) => `Done: ${t}`,
    edit: 'Edit',
    due: 'Due',
    move: 'Move',
    delete: 'Delete',
    open: 'Open',
    putBack: 'Put back',
    today: 'Today',
    tomorrow: 'Tomorrow',
    nextWeek: (d: string) => `Next week, ${d}`,
    pickDay: 'Pick a day…',
    noDue: 'No due day',
    moveTo: (s: string) => `Move to ${s}`,
    fileUnder: 'File under a project…',
    fileTo: (p: string) => `File under ${p}`,
    unfile: 'Take it off its project',
    menu: (t: string) => `What to do with ${t}`,
    marks: {
      adding: 'Adding…',
      added: 'Added',
      done: 'Done',
      reopened: 'Reopened',
      edited: 'Edited',
      deleted: 'Deleted',
      putBack: 'Put back',
      due: (d: string) => `Due ${d}`,
      undated: 'No due day',
      moved: (s: string) => `Moved to ${s}`,
      filed: (p: string) => `Now under ${p}`,
      handed: 'Handed on',
    },
    said: {
      added: (t: string) => `Added “${t}”.`,
      done: (t: string) => `Marked “${t}” done.`,
      reopened: (t: string) => `Reopened “${t}”.`,
      edited: (t: string) => `Saved “${t}”.`,
      due: (t: string, d: string) => `“${t}” is due ${d}.`,
      undated: (t: string) => `“${t}” has no due day now.`,
      moved: (t: string, s: string) => `Moved “${t}” to ${s}.`,
      filed: (t: string, p: string) => `Filed “${t}” under ${p}.`,
      deleted: (t: string) => `Deleted “${t}”.`,
    },
  } as const;

  /** How long a row you touched stays in Just changed. */
  const JUST_MS = 10 * 60_000;

  /* ── the read ───────────────────────────────────────────────────────────── */

  const work = read<Work>(
    () => (data.refused ? null : apiBase()),
    () => readWork(apiBase()),
  );

  /* WHILE A ROW IS BEING EDITED OR RE-DATED THE ANSWER IS HELD, so a read that lands meanwhile cannot move the row the
     caret is in. It is let go the moment the box closes, and the newest answer is drawn then. */
  let editing = $state<number | null>(null);
  let picking = $state<number | null>(null);
  let frozen = $state.raw<Work | null>(null);
  $effect(() => {
    const busy = editing !== null || picking !== null;
    untrack(() => {
      frozen = busy ? (frozen ?? work.value) : null;
    });
  });
  const answer = $derived(frozen ?? work.value);
  const shape = $derived(answer?.shape ?? null);

  $effect(() => {
    if (work.state === 'ready') drew('ready');
  });

  /* THE READER'S OWN DAY, kept current past midnight, and the clock that lets Just changed empty itself. */
  let clock = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (clock = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  /* "TODAY" IS THE RECORD'S, as it is on Today (`data.now`), so a record whose clock is not this browser's (a pinned
     demo, a laptop set wrong) calls the same tasks late on both screens. `data.now` is when the shell was read, so a gap
     under a day is only how long ago that was, and this browser's clock is the better one. */
  const skew = untrack(() => (Math.abs(data.now - Date.now()) > 86_400_000 ? data.now - Date.now() : 0));
  const today = $derived(dayOf(clock + skew));

  const mayAdd = $derived(may(data, 'append', TASKS));
  const mayWrite = $derived(may(data, 'write', TASKS));

  /* ── what is drawn: the answer, the writes that have landed since, and the writes still out ───────────── */

  /** Rows the record answered a write of this screen's with, until a read has caught up with them. */
  let landed = $state.raw(new Map<number, Entry>());
  /** Rows deleted from here: drawn only in Just changed, with Put back, until they leave it. */
  let gone = $state.raw(new Set<number>());
  const layer = liveOverlay<Entry>((e) => String(e.seq));

  function land(e: Entry) {
    landed = new Map(landed).set(e.seq, e);
  }

  /* A READ THAT HAS CAUGHT UP lets go of what it now holds. */
  $effect(() => {
    const rows = work.value?.rows;
    if (!rows) return;
    untrack(() => {
      const held = new Map(rows.map((r) => [r.seq, r.version]));
      const next = new Map(landed);
      for (const [seq, e] of landed) if ((held.get(seq) ?? -1) >= e.version) next.delete(seq);
      if (next.size !== landed.size) landed = next;
    });
  });

  /** The row as the record last answered it, before any write still out. */
  function baseRow(seq: number): Entry | undefined {
    const read = answer?.rows.find((r) => r.seq === seq);
    const l = landed.get(seq);
    return l && (!read || l.version > read.version) ? l : read;
  }

  const rows = $derived.by(() => {
    if (!answer) return [];
    const base = answer.rows.map((r) => {
      const l = landed.get(r.seq);
      return l && l.version > r.version ? l : r;
    });
    const have = new Set(base.map((r) => r.seq));
    for (const l of landed.values()) if (!have.has(l.seq)) base.push(l);
    return layer.draw(base);
  });
  const rowOf = (seq: number): Entry | undefined => rows.find((r) => r.seq === seq);

  /* ── names ──────────────────────────────────────────────────────────────── */

  const projectName = $derived(new Map((answer?.projects ?? []).map((p) => [p.seq, p.name])));
  const personName = $derived(new Map((answer?.people ?? []).map((p) => [p.seq, p.name])));
  const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  const titleOfRow = (r: { seq: number; fields: Fields }): string => (shape ? text(r.fields[shape.title]) : '') || `#${r.seq}`;
  const projectOfRow = (r: { fields: Fields }): string => {
    const p = shape ? projectOf(r.fields, shape) : null;
    return p === null ? '' : (projectName.get(p) ?? `#${p}`);
  };
  /** Who holds it: the agent that took it, or the person it is given to. Nobody named is you, and says nothing. */
  const holderOf = (r: { fields: Fields }): string => {
    if (!shape) return '';
    const agent = shape.agent ? text(r.fields[shape.agent]).trim() : '';
    if (agent) return cap(agent);
    const owner = shape.owner ? r.fields[shape.owner.field] : null;
    return typeof owner === 'number' ? (personName.get(owner) ?? '') : '';
  };
  const named = (r: { seq: number; fields: Fields }) => `${projectOfRow(r)} ${holderOf(r)}`;

  /* ── just changed ───────────────────────────────────────────────────────── */

  let touched = $state.raw(new Map([...kept].filter(([, t]) => Date.now() - t.at < JUST_MS)));
  function touch(seq: number, mark: string) {
    const t = { at: Date.now(), mark };
    kept.set(seq, t);
    touched = new Map(touched).set(seq, t);
  }
  /** Puts back what a row wore before a write the record refused. */
  function retouch(seq: number, was: { at: number; mark: string } | undefined) {
    const next = new Map(touched);
    if (was) {
      next.set(seq, was);
      kept.set(seq, was);
    } else {
      next.delete(seq);
      kept.delete(seq);
    }
    touched = next;
  }

  /* ── the filter and the search ──────────────────────────────────────────── */

  let pick = $state(keptPick);
  $effect(() => {
    keptPick = pick;
  });
  let query = $state('');

  const visible = (r: Entry): boolean => !!shape && inProject(r.fields, shape, pick) && matches(r, shape, query, named);

  /** The projects the filter offers: every one holding open work, most first, and the one chosen whatever it holds. */
  const choices = $derived.by(() => {
    if (!shape?.project) return [];
    const n = new Map<string, number>();
    let all = 0;
    for (const r of rows) {
      if (r.seq < 0 || gone.has(r.seq) || isDone(r.fields, shape)) continue;
      all++;
      const p = projectOf(r.fields, shape);
      const key = p === null ? NONE : String(p);
      n.set(key, (n.get(key) ?? 0) + 1);
    }
    const out = [...n]
      .filter(([key]) => key !== NONE)
      .map(([key, count]) => ({ key, label: projectName.get(Number(key)) ?? `#${key}`, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (pick !== ALL && pick !== NONE && !n.has(pick)) out.push({ key: pick, label: projectName.get(Number(pick)) ?? `#${pick}`, count: 0 });
    return [
      { key: ALL, label: words.allProjects, count: all },
      ...out,
      ...(n.has(NONE) || pick === NONE ? [{ key: NONE, label: words.noProject, count: n.get(NONE) ?? 0 }] : []),
    ];
  });

  /* ── the bands ──────────────────────────────────────────────────────────── */

  let unfolded = $state(new Set<Band>());

  type Item = { kind: 'head'; key: string; band: Band; n: number } | { kind: 'row'; key: string; band: Band; row: Entry };

  const items = $derived.by((): Item[] => {
    const s = shape;
    if (!s) return [];
    const now = clock;
    const groups = new Map<Band, Entry[]>();
    const put = (b: Band, r: Entry) => {
      const list = groups.get(b);
      if (list) list.push(r);
      else groups.set(b, [r]);
    };
    for (const r of rows) {
      const t = touched.get(r.seq);
      /* A ROW YOU JUST TOUCHED IS NEVER FILTERED OUT FROM UNDER YOUR HAND, whatever the filter or the search says. */
      if (t && now - t.at < JUST_MS) {
        put('changed', r);
        continue;
      }
      if (gone.has(r.seq) || !visible(r)) continue;
      put(bandOf(r.fields, s, today), r);
    }
    const out: Item[] = [];
    for (const b of BANDS) {
      const list = groups.get(b);
      if (!list || list.length === 0) continue;
      if (b === 'changed') list.sort((x, y) => (touched.get(y.seq)?.at ?? 0) - (touched.get(x.seq)?.at ?? 0));
      else list.sort(b === 'done' ? byFinished(s) : byDue(s));
      out.push({ kind: 'head', key: `h:${b}`, band: b, n: list.length });
      if (FOLDED.has(b) && !unfolded.has(b)) continue;
      for (const r of list) out.push({ kind: 'row', key: `r:${r.seq}`, band: b, row: r });
    }
    return out;
  });

  /** The rows in the order drawn, which is the order j and k walk. */
  const order = $derived(items.flatMap((i) => (i.kind === 'row' ? [i.row.seq] : [])));
  const openCount = $derived(shape ? rows.filter((r) => r.seq > 0 && !gone.has(r.seq) && !isDone(r.fields, shape!)).length : 0);

  /* ROWS THAT ARRIVED WHILE YOU LOOKED, by whoever wrote them, tinted for a moment. The first answer is the baseline. */
  const arrivals = liveArrivals();
  const arrived = $derived(answer ? arrivals.see('work', rows.filter((r) => r.seq > 0).map((r) => String(r.seq))) : new Set<string>());

  /* ── writing ────────────────────────────────────────────────────────────── */

  let writer: RowWriter | null = null;
  const writes = (): RowWriter => (writer ??= rowWriter(apiBase()));

  /* ONE WRITE AT A TIME PER ROW, each sent at the version the last one landed with, so a tick and its undo pressed in
     one breath are two writes the record accepts rather than one it calls a conflict. */
  const queues = new Map<number, Promise<unknown>>();
  function inTurn<T>(seq: number, fn: () => Promise<T>): Promise<T> {
    const next = (queues.get(seq) ?? Promise.resolve()).then(fn, fn);
    queues.set(
      seq,
      next.catch(() => undefined),
    );
    return next;
  }

  /* A WRITE'S ANSWER AS THE OPTIMISTIC LAYER READS IT. A conflict draws the row as it now stands, so the next try is
     against the latest version; the layer says the record's sentence. */
  function sent(out: Wrote): Sent<Entry> {
    if (out.ok) return { ok: true, value: out.entry };
    if (out.why === 'conflict' && out.entry) land(out.entry);
    return { ok: false, fix: out.fix };
  }

  /** One change to one row: drawn now, sent in turn, and offered back for six seconds. */
  function change(seq: number, patch: Fields, mark: string, said?: string, back = true): Change<Entry> {
    let p: Pending | null = null;
    const was = touched.get(seq);
    const before = baseRow(seq);
    return {
      apply: () => {
        p = layer.patch(String(seq), (e) => ({ ...e, fields: { ...e.fields, ...patch } }));
        touch(seq, mark);
      },
      revert: () => {
        layer.drop(p);
        retouch(seq, was);
      },
      send: () => inTurn(seq, () => writes().update(TASKS, seq, patch, baseRow(seq)?.version).then(sent)),
      settle: (e) => {
        layer.drop(p);
        land(e);
      },
      ...(said === undefined ? {} : { said }),
      ...(back && before ? { undo: () => () => void run(change(seq, inverseOf(before, patch, answer?.decl), words.marks.putBack, undefined, false)) } : {}),
    };
  }

  function write(seq: number, patch: Fields, mark: string, said: string) {
    if (seq < 0 || !mayWrite) return;
    void run(change(seq, patch, mark, said));
  }

  /** Deleting is archiving: the record keeps the row, every list leaves it out, and Put back brings it back. */
  function removal(seq: number, said?: string, back = true): Change<Entry> {
    const was = touched.get(seq);
    return {
      apply: () => {
        gone = new Set(gone).add(seq);
        touch(seq, words.marks.deleted);
      },
      revert: () => {
        const next = new Set(gone);
        next.delete(seq);
        gone = next;
        retouch(seq, was);
      },
      send: () => inTurn(seq, () => writes().archive(TASKS, seq, baseRow(seq)?.version).then(sent)),
      settle: land,
      ...(said === undefined ? {} : { said }),
      ...(back ? { undo: () => () => void run(restoral(seq)) } : {}),
    };
  }

  function restoral(seq: number): Change<Entry> {
    const was = touched.get(seq);
    return {
      apply: () => {
        const next = new Set(gone);
        next.delete(seq);
        gone = next;
        touch(seq, words.marks.putBack);
      },
      revert: () => {
        gone = new Set(gone).add(seq);
        retouch(seq, was);
      },
      send: () => inTurn(seq, () => writes().restore(TASKS, seq, baseRow(seq)?.version).then(sent)),
      settle: land,
    };
  }

  function remove(seq: number) {
    const r = rowOf(seq);
    if (!r || seq < 0 || !mayWrite) return;
    void run(removal(seq, words.said.deleted(titleOfRow(r))));
  }

  function toggle(seq: number) {
    const r = rowOf(seq);
    const s = shape;
    if (!r || !s?.state || !s.tickTo) return;
    const done = isDone(r.fields, s);
    const to = done ? s.reopenTo : s.tickTo;
    if (!to) return;
    const t = titleOfRow(r);
    write(seq, { [s.state]: to }, done ? words.marks.reopened : words.marks.done, done ? words.said.reopened(t) : words.said.done(t));
  }

  function setDue(seq: number, day: string | null) {
    const r = rowOf(seq);
    if (!r || !shape?.due) return;
    const t = titleOfRow(r);
    if (day === null) write(seq, { [shape.due]: null }, words.marks.undated, words.said.undated(t));
    else write(seq, { [shape.due]: day }, words.marks.due(dueSaid(day, today)), words.said.due(t, daySaid(day)));
  }

  function setState(seq: number, state: string) {
    const r = rowOf(seq);
    if (!r || !shape?.state) return;
    const said = shape.said[state] ?? state;
    write(seq, { [shape.state]: state }, words.marks.moved(said), words.said.moved(titleOfRow(r), said));
  }

  function setProject(seq: number, project: number | null) {
    const r = rowOf(seq);
    if (!r || !shape?.project) return;
    const name = project === null ? words.noProject : (projectName.get(project) ?? `#${project}`);
    write(seq, { [shape.project.field]: project }, words.marks.filed(name), words.said.filed(titleOfRow(r), name));
  }

  /* ── editing the words in place ─────────────────────────────────────────── */

  let editText = $state('');
  async function startEdit(seq: number) {
    const r = rowOf(seq);
    if (!r || seq < 0 || !mayWrite) return;
    picking = null;
    editText = titleOfRow(r);
    editing = seq;
    cursor = seq;
    await flush();
    const box = document.querySelector<HTMLInputElement>(`[data-edit="${seq}"]`);
    box?.focus();
    box?.select();
  }
  function endEdit(save: boolean) {
    const seq = editing;
    if (seq === null) return;
    editing = null;
    const r = rowOf(seq);
    const next = editText.trim();
    if (save && r && shape && next !== '' && next !== titleOfRow(r)) write(seq, { [shape.title]: next }, words.marks.edited, words.said.edited(next));
    void focusRow(seq);
  }

  /* ── the capture line ───────────────────────────────────────────────────── */

  let draft = $state('');
  let captureBox = $state<HTMLInputElement>();
  let searchBox = $state<HTMLInputElement>();
  let typedSeq = 0;

  const context = $derived(shape && answer ? contextOf(shape, today, answer.projects) : null);
  /** The project a new task files under: the filter's, when it names one. */
  const filed = $derived(pick !== ALL && pick !== NONE ? Number(pick) : null);
  const reading = $derived.by(() => {
    if (!context || draft.trim() === '') return [];
    const c = captureOf(draft, context);
    const bits = captureSaid(c, context);
    if (c.project === null && filed !== null && shape?.project) bits.unshift(words.filedUnder(projectName.get(filed) ?? `#${filed}`));
    return bits;
  });

  function add(e: SubmitEvent) {
    e.preventDefault();
    const typed = draft.trim();
    const s = shape;
    if (typed === '' || !s || !context || !mayAdd) return;
    const c = captureOf(typed, context);
    /* WHAT THE LIST REQUIRES AND NOBODY SAID takes its emptiest honest value (`capturedFields`), and the line goes over it. */
    const fields: Fields = { ...capturedFields(TASKS, c.text, [], Date.now()).fields, ...freshFields(c, s, filed) };
    const seq = -++typedSeq;
    let p: Pending | null = null;
    draft = '';
    /* THE CARET STAYS IN THE BOX: adding is done in bursts, and on a phone this keeps the keyboard up. */
    captureBox?.focus();
    void run<Entry>({
      apply: () => {
        p = layer.add({ seq, fields, version: 0, created: new Date().toISOString(), by: '' }, 'end');
        touch(seq, words.marks.adding);
      },
      revert: () => {
        layer.drop(p);
        retouch(seq, undefined);
        /* THE TYPING COMES BACK, so a refused line is corrected rather than typed again. */
        if (draft.trim() === '') draft = typed;
      },
      send: () => writes().create(TASKS, fields).then(sent),
      settle: (row) => {
        layer.drop(p);
        land(row);
        retouch(seq, undefined);
        touch(row.seq, words.marks.added);
        if (cursor === seq) cursor = row.seq;
      },
      said: words.said.added(c.text),
      undo: (row) => () => void run(removal(row.seq, undefined, false)),
    });
  }

  /* ── the cursor and the keyboard ────────────────────────────────────────── */

  let cursor = $state<number | null>(null);
  let root = $state<HTMLElement>();
  let legend = $state(false);

  const rowEl = (seq: number): HTMLElement | null => root?.querySelector<HTMLElement>(`[data-seq="${seq}"]`) ?? null;

  async function focusRow(seq: number) {
    await flush();
    const el = rowEl(seq);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }

  function moveCursor(by: number) {
    if (order.length === 0) return;
    const i = cursor === null ? -1 : order.indexOf(cursor);
    const next = i < 0 ? (by > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, i + by));
    cursor = order[next]!;
    void focusRow(cursor);
  }

  /** The row after this one in the order drawn now, which the cursor goes to when this one leaves its place. */
  const after = (seq: number): number | null => {
    const i = order.indexOf(seq);
    return order[i + 1] ?? order[i - 1] ?? null;
  };

  /** A verb from the keyboard: the cursor goes on down the list rather than following the row to Just changed. */
  function onward(seq: number, verb: () => void) {
    const next = touched.has(seq) && Date.now() - (touched.get(seq)?.at ?? 0) < JUST_MS ? seq : after(seq);
    verb();
    if (next !== null) {
      cursor = next;
      void focusRow(next);
    }
  }

  function keys(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || covered() || menuOpen) return;
    if (typing()) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (el === captureBox) {
        if (draft !== '') draft = '';
        else captureBox?.blur();
      } else if (el === searchBox) {
        if (query !== '') query = '';
        else searchBox?.blur();
      } else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (silenced(e)) return;
    const on = document.activeElement;
    const control = on instanceof HTMLElement && on.closest('button, a[href], select, summary') !== null;
    const seq = cursor;
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        moveCursor(1);
        break;
      case 'k':
      case 'ArrowUp':
        moveCursor(-1);
        break;
      case 'x':
        if (seq === null) return;
        onward(seq, () => toggle(seq));
        break;
      case 'e':
        if (seq === null) return;
        void startEdit(seq);
        break;
      case 'd':
        if (seq === null || !shape?.due) return;
        openMenu(seq, 'due');
        break;
      case 'm':
        if (seq === null || (!shape?.state && !shape?.project)) return;
        openMenu(seq, 'move');
        break;
      case 'Delete':
      case 'Backspace':
        if (seq === null) return;
        onward(seq, () => remove(seq));
        break;
      case 'n':
      case 'c':
        if (!captureBox) return;
        captureBox.focus();
        break;
      case '/':
        /* THIS SCREEN'S SEARCH, NOT THE PALETTE: taken before the shell hears it. */
        searchBox?.focus();
        break;
      case 'Enter':
        if (control || seq === null || seq < 0) return;
        void goto(at(`/r/${TASKS}/${seq}`));
        break;
      case 'Escape':
        if (cursor === null && !legend) return;
        cursor = null;
        legend = false;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  /* ON THE DOCUMENT AND BEFORE ANYTHING ELSE HEARS IT, so `/` here is this screen's search and never also the palette. */
  $effect(() => {
    const on = (e: KeyboardEvent) => keys(e);
    document.addEventListener('keydown', on, true);
    return () => document.removeEventListener('keydown', on, true);
  });

  /* ── the one menu ───────────────────────────────────────────────────────── */

  type Mode = 'row' | 'due' | 'move' | 'project';
  let menu = $state<{ seq: number; mode: Mode; at: { x: number; y: number; height: number } } | null>(null);
  let menuOpen = $state(false);
  let reopening = false;
  const menuRow = $derived(menu ? rowOf(menu.seq) : undefined);

  function openMenu(seq: number, mode: Mode, from?: HTMLElement | null) {
    const el = from ?? rowEl(seq);
    if (!el || seq < 0) return;
    const r = el.getBoundingClientRect();
    cursor = seq;
    menu = { seq, mode, at: { x: r.left, y: r.top, height: r.height } };
    menuOpen = true;
  }

  /** From one menu to the next: the first closes on the press, and the second opens once it has. */
  function then(mode: Mode) {
    const m = menu;
    if (!m) return;
    reopening = true;
    setTimeout(() => {
      reopening = false;
      openMenu(m.seq, mode, rowEl(m.seq));
    });
  }

  function menuClosed() {
    if (reopening || !menu) return;
    void focusRow(menu.seq);
  }

  async function pickDay(seq: number) {
    picking = seq;
    await flush();
    const box = document.querySelector<HTMLInputElement>(`[data-pick="${seq}"]`);
    box?.focus();
    try {
      box?.showPicker?.();
    } catch {
      /* A browser that will not open its picker from here still has the box. */
    }
  }

  const THUMB = '(width < 640px), (pointer: coarse)';

  /** A tap on a row's words on a phone opens its verbs; a mouse follows the link. */
  function rowTap(e: MouseEvent, seq: number) {
    if (!matchMedia(THUMB).matches) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(seq, 'row', e.currentTarget as HTMLElement);
  }

  /** And a tap anywhere else on the row but its tick, on a phone, does the same. */
  function rowPress(e: MouseEvent, seq: number) {
    if (seq < 0 || editing === seq || picking === seq || !matchMedia(THUMB).matches) return;
    if ((e.target as Element).closest('button, input, a, select')) return;
    openMenu(seq, 'row', e.currentTarget as HTMLElement);
  }

  const stateNow = (r: Entry | undefined): string => (r && shape?.state ? text(r.fields[shape.state]) : '');

  /**
   * THE STATE, WHERE IT SAYS SOMETHING THE BAND DOES NOT: Doing, To check, Blocked. Not the state new work is in, and
   * not a finished one, whose tick already says it.
   */
  const stateWord = (r: Entry): string => {
    const v = stateNow(r);
    if (!shape || v === '' || v === shape.fresh || shape.done.includes(v)) return '';
    return shape.said[v] ?? v;
  };

  /** How much it matters, on a row whose band does not already say: the list's first two priorities only. */
  const flagOf = (r: Entry, band: Band): 'top' | 'second' | null => {
    const p = shape?.priority;
    if (!p || band === 'top' || band === 'second' || band === 'done') return null;
    const i = p.values.indexOf(text(r.fields[p.field]));
    return i === 0 ? 'top' : i === 1 && p.values.length >= 3 ? 'second' : null;
  };
  const flagWord = (r: Entry): string => {
    const p = shape?.priority;
    return p ? (p.said[text(r.fields[p.field])] ?? '') : '';
  };
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead title={words.title} count={answer ? openCount : undefined}>
  {#snippet actions()}
    <button type="button" class="keys-btn" aria-expanded={legend} aria-controls="work-keys" title={words.keys} onclick={() => (legend = !legend)}>?</button>
  {/snippet}
</PageHead>

<div class="page" bind:this={root}>
  {#if data.refused}
    <p class="none">{data.refused.fix}</p>
  {:else if !answer}
    <ReadState state={work.state === 'ready' ? 'waiting' : work.state} refusal={work.refusal} onretry={() => void work.reread()} />
  {:else if shape}
    <!-- ══ ROW 1: THE CAPTURE LINE ══ -->
    {#if mayAdd}
      <form class="capture" onsubmit={add}>
        <label class="sr-only" for="work-capture">{words.capture}</label>
        <input
          id="work-capture"
          class="field capture-box"
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          placeholder={filed !== null ? `${words.capture} to ${projectName.get(filed) ?? ''}` : words.capture}
          title={words.captureHint}
          bind:value={draft}
          bind:this={captureBox}
        />
        {#if reading.length > 0}<p class="reading">{reading.join(' · ')}</p>{/if}
      </form>
    {:else}
      <p class="none">{words.readOnly}</p>
    {/if}

    <!-- ══ THE ONE FILTER, AND THE SEARCH ══ -->
    <div class="tools">
      {#if shape.project && choices.length > 1}
        <label class="sr-only" for="work-project">{words.project}</label>
        <select id="work-project" class="field pick" bind:value={pick}>
          {#each choices as c (c.key)}
            <option value={c.key}>{c.label} ({c.count})</option>
          {/each}
        </select>
      {/if}
      <label class="sr-only" for="work-search">{words.search}</label>
      <input id="work-search" class="field find" type="search" placeholder={words.search} autocomplete="off" bind:value={query} bind:this={searchBox} />
    </div>

    {#if legend}
      <p class="legend" id="work-keys">
        <span><Kbd keys="j" /><Kbd keys="k" /> move</span>
        <span><Kbd keys="x" /> tick</span>
        <span><Kbd keys="e" /> edit</span>
        {#if shape.due}<span><Kbd keys="d" /> due</span>{/if}
        <span><Kbd keys="m" /> move to</span>
        <span><Kbd keys="Delete" /> delete</span>
        <span><Kbd keys="n" /> new</span>
        <span><Kbd keys="/" /> search</span>
        <span><Kbd keys="↵" /> open</span>
        <span><Kbd keys="Esc" /> cancel</span>
      </p>
    {/if}

    <!-- ══ THE BANDS ══ One keyed list, headings and rows together, so a row keeps its element as it changes band. -->
    <div class="board" data-all={pick === ALL ? '' : undefined}>
      {#each items as item (item.key)}
        {#if item.kind === 'head'}
          {@const folded = FOLDED.has(item.band)}
          <h2 class="head" data-band={item.band}>
            {#if folded}
              <button
                type="button"
                class="fold"
                aria-expanded={unfolded.has(item.band)}
                onclick={() => {
                  const next = new Set(unfolded);
                  if (next.has(item.band)) next.delete(item.band);
                  else next.add(item.band);
                  unfolded = next;
                }}
              >
                <span class="fold-mark" data-shut={unfolded.has(item.band) ? undefined : ''}><Icon name="chevronDown" size="s" /></span>
                {bandTitle(item.band, shape)}
              </button>
            {:else}
              {bandTitle(item.band, shape)}
            {/if}
            <span class="n num">{item.n}</span>
          </h2>
        {:else}
          {@const r = item.row}
          {@const seq = r.seq}
          {@const done = isDone(r.fields, shape)}
          {@const lost = gone.has(seq)}
          {@const due = shape.due ? dayIn(r.fields[shape.due]) : ''}
          {@const mark = item.band === 'changed' ? touched.get(seq)?.mark : undefined}
          <!-- THE ROW TAKES FOCUS AS THE CURSOR, one row at a time (a roving tabindex), and its keys are the screen's
               (`keys` above): every verb in it is a button of its own, and the press on a phone opens those same verbs. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
          <div
            class="row"
            data-seq={seq}
            tabindex={cursor === seq ? 0 : -1}
            data-cursor={cursor === seq ? '' : undefined}
            data-done={done || lost ? '' : undefined}
            data-arrived={arrived.has(String(seq)) ? '' : undefined}
            onfocusin={() => (cursor = seq)}
            onclick={(e) => rowPress(e, seq)}
            role="group"
            aria-label={titleOfRow(r)}
          >
            {#if shape.state && shape.tickTo}
              <button
                type="button"
                class="tick"
                role="checkbox"
                aria-checked={done}
                aria-label={words.done(titleOfRow(r))}
                disabled={seq < 0 || lost || !mayWrite}
                onclick={() => toggle(seq)}
              >
                {#if done}<Icon name="check" size="s" />{/if}
              </button>
            {/if}

            <div class="main">
              {#if editing === seq}
                <input
                  class="edit"
                  data-edit={seq}
                  bind:value={editText}
                  aria-label={words.edit}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      endEdit(true);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      endEdit(false);
                    }
                  }}
                  onblur={() => endEdit(true)}
                />
              {:else if seq < 0}
                <span class="what">{titleOfRow(r)}</span>
              {:else}
                <a class="what" href={at(`/r/${TASKS}/${seq}`)} tabindex="-1" onclick={(e) => rowTap(e, seq)}>{titleOfRow(r)}</a>
              {/if}
              {#if mark}
                <span class="mark">{mark}</span>
                {#if lost && mayWrite}
                  <button type="button" class="link" onclick={() => void run(restoral(seq))}>{words.putBack}</button>
                {/if}
              {/if}
            </div>

            <span class="meta">
              {#if flagOf(r, item.band)}<span class="flag" data-top={flagOf(r, item.band) === 'top' ? '' : undefined}>{flagWord(r)}</span>{/if}
              {#if stateWord(r)}<span class="state">{stateWord(r)}</span>{/if}
              {#if shape.project && pick === ALL}{@const p = projectOfRow(r)}{#if p}<span class="proj">{p}</span>{/if}{/if}
              {#if picking === seq}
                <input
                  class="pick-day"
                  type="date"
                  data-pick={seq}
                  value={due}
                  aria-label={words.due}
                  onchange={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    picking = null;
                    if (v) setDue(seq, v);
                    void focusRow(seq);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      picking = null;
                      void focusRow(seq);
                    }
                  }}
                  onblur={() => (picking = null)}
                />
              {:else if due}
                <span class="due" data-late={!done && due < today ? '' : undefined}>{dueSaid(due, today)}</span>
              {/if}
              {#if holderOf(r)}<span class="who">{holderOf(r)}</span>{/if}
            </span>

            {#if mayWrite && seq > 0 && !lost}
              <span class="verbs">
                <button type="button" class="verb" onclick={() => void startEdit(seq)}>{words.edit}</button>
                {#if shape.due}<button type="button" class="verb" onclick={(e) => openMenu(seq, 'due', e.currentTarget)}>{words.due}</button>{/if}
                {#if shape.state || shape.project}<button type="button" class="verb" onclick={(e) => openMenu(seq, 'move', e.currentTarget)}>{words.move}</button>{/if}
                <button type="button" class="verb" onclick={() => remove(seq)}>{words.delete}</button>
              </span>
            {/if}
          </div>
        {/if}
      {/each}

      {#if items.length === 0}
        <p class="none">{rows.length === 0 ? words.nothing : words.nothingHere}</p>
      {/if}
    </div>
  {/if}
</div>

<RowMenu
  bind:open={menuOpen}
  at={menu?.at ?? null}
  label={menuRow ? words.menu(titleOfRow(menuRow)) : words.title}
  onclose={menuClosed}
  hand={menu?.mode === 'row' && menuRow && answer ? { register: TASKS, row: menuRow, decl: answer.decl, onhanded: (e) => (land(e), touch(e.seq, words.marks.handed)) } : null}
>
  {#if menu && menuRow && shape}
    {@const seq = menu.seq}
    {#if menu.mode === 'row'}
      <a class="mi" role="menuitem" href={at(`/r/${TASKS}/${seq}`)}><Icon name="external" size="s" /><span class="mi-name">{words.open}</span><Kbd keys="↵" /></a>
      {#if mayWrite}
        {#if shape.state && shape.tickTo}
          <button class="mi" role="menuitem" type="button" onclick={() => toggle(seq)}>
            <Icon name="check" size="s" /><span class="mi-name">{isDone(menuRow.fields, shape) ? words.marks.reopened : words.marks.done}</span><Kbd keys="x" />
          </button>
        {/if}
        <button class="mi" role="menuitem" type="button" onclick={() => void startEdit(seq)}><Icon name="edit" size="s" /><span class="mi-name">{words.edit}</span><Kbd keys="e" /></button>
        {#if shape.due}
          <button class="mi" role="menuitem" type="button" onclick={() => then('due')}><Icon name="calendar" size="s" /><span class="mi-name">{words.due}…</span><Kbd keys="d" /></button>
        {/if}
        {#if shape.state || shape.project}
          <button class="mi" role="menuitem" type="button" onclick={() => then('move')}><Icon name="arrow" size="s" /><span class="mi-name">{words.move}…</span><Kbd keys="m" /></button>
        {/if}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => remove(seq)}><Icon name="trash" size="s" /><span class="mi-name">{words.delete}</span><Kbd keys="Delete" /></button>
      {/if}
    {:else if menu.mode === 'due'}
      <button class="mi" role="menuitem" type="button" onclick={() => setDue(seq, today)}><span class="mi-name">{words.today}</span></button>
      <button class="mi" role="menuitem" type="button" onclick={() => setDue(seq, addDays(today, 1))}><span class="mi-name">{words.tomorrow}</span></button>
      <button class="mi" role="menuitem" type="button" onclick={() => setDue(seq, nextMonday(today))}><span class="mi-name">{words.nextWeek(daySaid(nextMonday(today)))}</span></button>
      <button class="mi" role="menuitem" type="button" onclick={() => setTimeout(() => void pickDay(seq))}><span class="mi-name">{words.pickDay}</span></button>
      {#if shape.due && dayIn(menuRow.fields[shape.due])}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => setDue(seq, null)}><span class="mi-name">{words.noDue}</span></button>
      {/if}
    {:else if menu.mode === 'move'}
      {#each shape.states.filter((v) => v !== stateNow(menuRow)) as v (v)}
        <button class="mi" role="menuitem" type="button" onclick={() => setState(seq, v)}><span class="mi-name">{words.moveTo(shape.said[v] ?? v)}</span></button>
      {/each}
      {#if shape.project}
        {#if shape.states.length > 0}<hr class="mi-rule" />{/if}
        <button class="mi" role="menuitem" type="button" onclick={() => then('project')}><span class="mi-name">{words.fileUnder}</span></button>
      {/if}
    {:else if menu.mode === 'project'}
      {@const now = projectOf(menuRow.fields, shape)}
      {#each (answer?.projects ?? []).filter((p) => p.seq !== now) as p (p.seq)}
        <button class="mi" role="menuitem" type="button" onclick={() => setProject(seq, p.seq)}><span class="mi-name">{words.fileTo(p.name)}</span></button>
      {/each}
      {#if now !== null}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => setProject(seq, null)}><span class="mi-name">{words.unfile}</span></button>
      {/if}
    {/if}
  {/if}
</RowMenu>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  .field {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .field::placeholder {
    color: var(--dim);
  }

  .field:focus-visible {
    border-color: var(--ink2);
    outline: none;
  }

  /* ROW 1: one field the width of the page, and under it only what the line was read as. */
  .capture {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .capture-box {
    font-size: var(--t-base);
  }

  .reading {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .pick {
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 50%;
  }

  .find {
    flex: 1 1 8rem;
    min-inline-size: 0;
    max-inline-size: 22rem;
  }

  .keys-btn {
    min-inline-size: var(--ctl-h-sm);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .keys-btn:hover,
  .keys-btn[aria-expanded='true'] {
    color: var(--ink);
    border-color: var(--ink2);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* ── the bands ── */
  .board {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: var(--sp-5) 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .head:first-child {
    margin-block-start: 0;
  }

  .head[data-band='overdue'] {
    color: var(--warn);
  }

  .n {
    color: var(--dim);
    font-weight: 400;
    font-size: var(--t-sm);
  }

  .fold {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .fold-mark {
    display: inline-flex;
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-shut] {
    transform: rotate(-90deg);
  }

  /* A ROW IS ONE LINE WITH A HAIRLINE UNDER IT: the tick, the words, where and when and who, and the verbs. */
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h, 36px);
    padding: var(--sp-1) var(--sp-2);
    border-block-end: 1px solid var(--line-soft);
    font-size: var(--t-ui);
    outline: none;
  }

  .row:hover {
    background: var(--hover-wash);
  }

  .row[data-cursor] {
    background: var(--hover-wash);
    box-shadow: inset 2px 0 0 var(--ink2);
  }

  .row:focus-visible {
    box-shadow: inset 2px 0 0 var(--ink);
  }

  .row[data-arrived] {
    animation: arrived 1.5s var(--ease-out);
  }

  @keyframes arrived {
    from {
      background-color: var(--arrived-wash);
    }
  }

  .tick {
    display: inline-grid;
    place-items: center;
    inline-size: 18px;
    block-size: 18px;
    padding: 0;
    background: var(--s1);
    border: 1px solid var(--dim);
    border-radius: var(--r-sm);
    color: var(--bg);
    cursor: pointer;
  }

  .tick[aria-checked='true'] {
    background: var(--ink2);
    border-color: var(--ink2);
  }

  .tick:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .main {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .what {
    overflow: hidden;
    color: var(--ink);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.what:hover {
    text-decoration: underline;
  }

  .row[data-done] .what {
    color: var(--dim);
    text-decoration: line-through;
  }

  .mark {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .link {
    flex: none;
    padding: 0;
    background: none;
    border: 0;
    color: var(--link, var(--ink2));
    font: inherit;
    font-size: var(--t-sm);
    text-decoration: underline;
    cursor: pointer;
  }

  .edit {
    flex: 1;
    min-inline-size: 0;
    min-block-size: calc(var(--ctl-h-sm) + 4px);
    padding: 0 var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .proj,
  .who {
    max-inline-size: 16ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .due[data-late],
  .flag[data-top] {
    color: var(--warn);
  }

  .flag,
  .state {
    color: var(--ink2);
  }

  .pick-day {
    padding: 0 var(--sp-1);
    background: var(--s1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
  }

  /* THE VERBS HOLD THEIR ROOM AND SHOW ON HOVER AND FOCUS, so a row never reflows under the pointer. */
  .verbs {
    display: flex;
    gap: var(--sp-1);
    visibility: hidden;
  }

  .row:hover .verbs,
  .row:focus-within .verbs,
  .row[data-cursor] .verbs {
    visibility: visible;
  }

  .verb {
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .verb:hover,
  .verb:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .none {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The menu's rows, as the list screen's row menu draws them (`ListRowMenu.svelte`). */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
  }

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* ON A PHONE, OR UNDER A THUMB: the row is two lines, the verbs are in the menu a tap on the words opens, and every
     target is a finger's. */
  @media (width < 640px), (pointer: coarse) {
    .row {
      grid-template-columns: auto minmax(0, 1fr);
      row-gap: 2px;
      min-block-size: var(--tap);
    }

    .meta {
      grid-column: 2;
      flex-wrap: wrap;
    }

    .meta:empty {
      display: none;
    }

    .verbs,
    .keys-btn,
    .legend {
      display: none;
    }

    .tick {
      position: relative;
      inline-size: 22px;
      block-size: 22px;
    }

    /* A FINGER'S TARGET AROUND A SMALL BOX: the box stays 22px and the press lands anywhere in 44. */
    .tick::before {
      content: '';
      position: absolute;
      inset: calc((var(--tap) - 22px) / -2);
    }

    .field,
    .mi {
      min-block-size: var(--tap);
    }

    .mi :global(kbd) {
      display: none;
    }

    .page {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }
  }
</style>
