<!--
  Work: one screen for the tasks, where most writing happens.

  THE OWNER'S OLD TOOL HAD ONE, AND 85% OF HIS WRITES LANDED ON IT. Here
  the same work was split over a Work page and a Board page, drawn by page blocks, and every gesture waited for the
  record. This screen is the old one's shape over the record's tasks list, drawn to the design system:

    1. THE TITLE ROW SAYS WHAT NEEDS HIM in one sentence ("3 of your 50 are late"), and its toolbar picks whose work is
       shown: yours, the agents', or all of it.
    2. A CAPTURE LINE FIRST. Typing and Enter adds a task at once, filed under the project the filter shows, with a
       light syntax that is never required (`capture.ts`): "Chase Halden tomorrow !urgent #kiln". It says back how it
       read the line before it is sent.
    3. THE PROJECT FILTER as faces and counts, and one tile: the open work by tier, yours against the agents'.
    4. BANDS ON THE GROUND, TOP TO BOTTOM: Just changed, Late, Today, the rest folded by tier (with what has not moved
       in months), With agents, Waiting, and Done recently. A task is in one band (`board.ts`, `work-tiles.ts`).
    5. NOTHING YOU TOUCH DISAPPEARS. A task ticked, moved, re-dated or deleted goes to Just changed wearing what happened
       to it, and stays there for ten minutes, so checking you hit the right one never means doing the opposite to look.
    6. A TASK OPENS IN THE DOCKED PANEL, in its edit state, beside the list and never on a page of its own: the words,
       the project, the day, the tier and who does it, saved in one write. The list narrows for it and keeps its keys.
    7. THE ROW CARRIES THE VERBS: tick, edit, set the day, move it, delete it, on hover and focus, and in a menu a tap
       opens on a phone. Every write is drawn at once and sent after (`lib/data/optimistic.ts`), with Undo.
    8. THE KEYBOARD: j k, x, e, d, m, Delete, Enter, n or c, /, Esc. The keys circle in the toolbar prints them.
    9. IT LISTENS. The read is asked again when the record's version moves, rows that arrive are tinted, and nothing is
       redrawn from under the caret, the cursor or the scroll.

  GENERIC OVER ANY TASKS LIST: every part asks `shapeOf` whether the list has its field and is absent when it does not.
-->
<script module lang="ts">
  import type { Whose } from './work-tiles.ts';

  /* JUST CHANGED OUTLIVES A VISIT, so leaving for Money and coming back still shows what was just done, and the project
     filter and the whose-work view are where they were left. Module scope is this tab's, and nothing here is kept past
     it. */
  const kept = new Map<number, { at: number; mark: string }>();
  let keptPick = '';
  let keptWhose: Whose = 'all';
</script>

<script lang="ts">
  import { tick as flush, untrack } from 'svelte';
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
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { Waffle } from '$lib/viz/index.ts';
  import {
    ALL,
    FOLDED,
    NONE,
    addDays,
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
  import {
    WHOSE,
    agentOf,
    agentSaid,
    drawnBand,
    holdOf,
    inWhose,
    lateBy,
    sentenceOf,
    staleOf,
    statsOf,
    tierColumns,
    tierCounts,
    tierReading,
  } from './work-tiles.ts';

  let { data }: { data: Shell } = $props();

  /* THE PLAIN WORDS THIS SCREEN SAYS, kept beside it. */
  const words = {
    title: 'Work',
    capture: 'Add a task',
    captureHint: 'Type a task and press Enter. "tomorrow", "!urgent" or "#project" at the end files it, if you like.',
    add: 'Add',
    readsAs: 'reads as',
    yours: 'yours',
    allProjects: 'All projects',
    noProject: 'No project',
    project: 'Project',
    projects: 'Filter by project',
    more: (n: number) => `${n} more`,
    fewer: 'Fewer',
    search: 'Search tasks',
    keys: 'Keyboard shortcuts',
    whose: 'Whose work',
    whoseSaid: { yours: 'Yours', agents: 'Agents', all: 'All' } as Record<Whose, string>,
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
    late: 'Late',
    withAgents: 'With agents',
    agentsMeta: 'what each agent is on now',
    changedMeta: 'stays here for ten minutes',
    laterMeta: 'your low ones, and anything you put down',
    byTier: 'The rest, by tier',
    dueToday: 'due today',
    doneOn: (d: string) => `done ${d}`,
    tier: {
      title: 'Open by tier',
      yours: 'Yours',
      people: 'People',
      agents: 'With agents',
      summary: (side: string, n: number, parts: string) => `${side}, ${n}${parts ? `: ${parts}` : ''}.`,
    },
    stale: {
      moved: (n: number, day: string) => `${n} not moved since ${day}`,
      added: (n: number, day: string) => `${n} open since before ${day}`,
      show: 'Show them',
      all: 'Show all',
    },
    strip: { move: 'move', done: 'done', edit: 'edit', due: 'due', lane: 'move', undo: 'undo' },
    panel: {
      editing: 'Editing a task',
      reading: 'A task',
      title: 'Title',
      tier: 'Tier',
      who: 'Who does it',
      you: 'You',
      cancel: 'Cancel',
      save: 'Save',
      reopen: 'Reopen',
      deleteAsk: 'Delete this task…',
      deleteSure: 'Delete it? It stays in Just changed, with Put back, for ten minutes.',
      deleteYes: 'Delete',
      keep: 'Keep it',
      moreActions: 'More actions',
      also: (p: string) => `Also in ${p}`,
      alsoOpen: (n: number) => `${n} open`,
      projectLink: 'Project',
      wasDue: (late: string, day: string) => `${late}, was due ${day}`,
      dueOn: (d: string) => `Due ${d}`,
      open: 'open',
    },
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

  /** The project chips drawn before the rest fold behind "N more". */
  const CHIPS_SHOWN = 8;

  /* ── the read ───────────────────────────────────────────────────────────── */

  const work = read<Work>(
    () => (data.refused ? null : apiBase()),
    () => readWork(apiBase()),
  );

  /* WHILE A ROW IS BEING RE-DATED IN PLACE THE ANSWER IS HELD, so a read that lands meanwhile cannot move the row the
     picker is in. It is let go the moment the box closes, and the newest answer is drawn then. The panel needs no
     hold: it edits a copy of the row, and a save is sent against the version the record last answered. */
  let picking = $state<number | null>(null);
  let frozen = $state.raw<Work | null>(null);
  $effect(() => {
    const busy = picking !== null;
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
  /** Every row still in the list: none deleted from here. */
  const present = $derived(rows.filter((r) => !gone.has(r.seq)));

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

  /* THE READER, BY THE NAME THE RECORD GIVES THEM, so a task whose owner is that person is theirs. `boot` names people by
     id, and the People list by row, so the name is what the two share. */
  const reader = $derived((data.names?.[data.me?.person ?? ''] ?? '').trim().toLowerCase());
  const mine = (owner: number): boolean => reader !== '' && (personName.get(owner) ?? '').trim().toLowerCase() === reader;

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
  const justNow = (seq: number): boolean => clock - (touched.get(seq)?.at ?? 0) < JUST_MS && touched.has(seq);

  /* ── the filters and the search ─────────────────────────────────────────── */

  let pick = $state(keptPick);
  $effect(() => {
    keptPick = pick;
  });
  let whose = $state<Whose>(keptWhose);
  $effect(() => {
    keptWhose = whose;
  });
  let query = $state('');
  /** Whether the list shows only what has not moved in months. */
  let staleOnly = $state(false);
  let allChips = $state(false);

  const inPick = (r: Entry): boolean => !!shape && inProject(r.fields, shape, pick);
  const inView = (r: Entry): boolean => !!shape && inPick(r) && inWhose(r.fields, shape, whose, mine);

  /** What has not moved in months, among the open work the filters show. */
  const stale = $derived.by(() => {
    if (!answer || !shape) return null;
    const moved = answer.moved;
    const s = staleOf(
      present.filter((r) => !justNow(r.seq) && inView(r)),
      shape,
      (seq) => moved[seq],
      today,
    );
    return { ...s, from: answer.movedFrom };
  });

  const visible = (r: Entry): boolean =>
    !!shape && inView(r) && matches(r, shape, query, named) && (!staleOnly || (stale?.seqs.has(r.seq) ?? false));

  /** The projects the filter offers: every one holding open work in this view, most first, and the one chosen whatever it holds. */
  const choices = $derived.by(() => {
    if (!shape?.project) return [];
    const n = new Map<string, number>();
    let all = 0;
    for (const r of present) {
      if (r.seq < 0 || isDone(r.fields, shape) || !inWhose(r.fields, shape, whose, mine)) continue;
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
  /* THE CHIPS DRAWN: All, the first eight, and the one chosen wherever it sits; the rest behind "N more". */
  const chips = $derived(allChips ? choices : choices.filter((c, i) => i <= CHIPS_SHOWN || c.key === pick));
  const chipsHidden = $derived(choices.length - choices.filter((c, i) => i <= CHIPS_SHOWN || c.key === pick).length);

  /** Open tasks in each view, under the project filter. */
  const whoseN = $derived.by(() => {
    const out: Record<Whose, number> = { yours: 0, agents: 0, all: 0 };
    if (!shape) return out;
    for (const r of present) {
      if (r.seq <= 0 || isDone(r.fields, shape) || !inPick(r)) continue;
      out.all++;
      const h = holdOf(r.fields, shape, mine);
      if (h === 'agent') out.agents++;
      else if (h === 'you') out.yours++;
    }
    return out;
  });

  /* ── the sentence and the tier chart ────────────────────────────────────── */

  const sentence = $derived(shape && answer ? sentenceOf(statsOf(present, shape, today, mine)) : null);

  const tiers = $derived.by(() => {
    if (!shape) return null;
    const t = tierCounts(present.filter(inPick), shape, mine);
    if (!t || t.yours + t.agents === 0) return null;
    const cols = tierColumns(t.yours, t.agents);
    const side = (key: 'yours' | 'agents') => ({
      n: t[key],
      columns: cols[key],
      parts: t.parts.map((p) => ({ label: p.label.toLowerCase(), value: p[key] * cols.scale, tone: p.tone })),
      said: words.tier.summary(
        key === 'agents' ? words.tier.agents : t.people ? words.tier.people : words.tier.yours,
        t[key],
        t.parts
          .filter((p) => p[key] > 0)
          .map((p) => `${p[key]} ${p.label.toLowerCase()}`)
          .join(', '),
      ),
    });
    return {
      total: t.yours + t.agents,
      people: t.people,
      yours: side('yours'),
      agents: side('agents'),
      key: t.parts.map((p) => ({ label: p.label.toLowerCase(), n: p.yours + p.agents, tone: p.tone })).filter((p) => p.n > 0),
      reading: tierReading(t),
    };
  });

  /* ── the bands ──────────────────────────────────────────────────────────── */

  /** The rest of the open work, folded by tier on one line: the list's priorities, and Later with the low ones. */
  const TIERS: readonly Band[] = ['top', 'second', 'open', 'later'];
  /** The groups drawn with a heading of their own, top to bottom, the tier line sitting after Today. */
  const HEADED: readonly Band[] = ['changed', 'overdue', 'today', 'agent', 'waiting', 'done'];
  /** Where a band's rows are drawn: the low tier sits with Later, as "your low ones, and anything you put down". */
  const groupOf = (b: Band): Band => (b === 'low' ? 'later' : b);

  /**
   * THE GROUPS THAT FOLD, AND WHICH ARE OPEN. The tier groups and Done recently fold; `unfolded` holds the ones the
   * reader flipped from where they start, and every group starts folded except the first tier holding anything when
   * the screen was first drawn, so a list is never all chips. A search, or the list of what has not moved, opens
   * every group: an answer hidden under a fold is no answer.
   */
  let unfolded = $state(new Set<Band>());
  let firstTier = $state<Band | null | undefined>(undefined);
  const folds = (b: Band): boolean => TIERS.includes(b) || FOLDED.has(b);
  const shown = (b: Band): boolean => !folds(b) || query.trim() !== '' || staleOnly || (b === firstTier) !== unfolded.has(b);
  function flip(b: Band) {
    const next = new Set(unfolded);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    unfolded = next;
  }

  const groups = $derived.by(() => {
    const s = shape;
    const out = new Map<Band, Entry[]>();
    if (!s) return out;
    for (const r of rows) {
      /* A ROW YOU JUST TOUCHED IS NEVER FILTERED OUT FROM UNDER YOUR HAND, whatever the filter or the search says. */
      const b = justNow(r.seq) ? 'changed' : gone.has(r.seq) || !visible(r) ? null : groupOf(drawnBand(r.fields, s, today));
      if (b === null) continue;
      const list = out.get(b);
      if (list) list.push(r);
      else out.set(b, [r]);
    }
    const due = byDue(s);
    for (const [b, list] of out) {
      if (b === 'changed') list.sort((x, y) => (touched.get(y.seq)?.at ?? 0) - (touched.get(x.seq)?.at ?? 0));
      else if (b === 'done') list.sort(byFinished(s));
      else if (b === 'agent') list.sort((x, y) => agentOf(x.fields, s).localeCompare(agentOf(y.fields, s)) || due(x, y));
      else list.sort(due);
    }
    return out;
  });

  $effect(() => {
    if (firstTier !== undefined || !answer) return;
    const g = groups;
    untrack(() => (firstTier = TIERS.slice(0, 3).find((b) => (g.get(b)?.length ?? 0) > 0) ?? null));
  });

  type Item =
    | { kind: 'head'; key: string; band: Band; n: number }
    | { kind: 'tiers'; key: string; tiers: { band: Band; n: number }[] }
    | { kind: 'sub'; key: string; band: Band; n: number }
    | { kind: 'row'; key: string; band: Band; row: Entry };

  const items = $derived.by((): Item[] => {
    const out: Item[] = [];
    const g = groups;
    const group = (b: Band, head: boolean) => {
      const list = g.get(b);
      if (!list || list.length === 0) return;
      out.push(head ? { kind: 'head', key: `h:${b}`, band: b, n: list.length } : { kind: 'sub', key: `h:${b}`, band: b, n: list.length });
      if (!shown(b)) return;
      for (const r of list) out.push({ kind: 'row', key: `r:${r.seq}`, band: b, row: r });
    };
    for (const b of HEADED.slice(0, 3)) group(b, true);
    const tiers = TIERS.map((b) => ({ band: b, n: g.get(b)?.length ?? 0 })).filter((t) => t.n > 0);
    /* THE LINE STAYS WHILE IT IS SHOWING WHAT HAS NOT MOVED, so the way back to everything is never taken away. */
    if (tiers.length > 0 || (stale?.seqs.size ?? 0) > 0 || staleOnly) {
      out.push({ kind: 'tiers', key: 'tiers', tiers });
      for (const t of tiers) if (shown(t.band)) group(t.band, false);
    }
    for (const b of HEADED.slice(3)) group(b, true);
    return out;
  });

  /** The rows in the order drawn, which is the order j and k walk. */
  const order = $derived(items.flatMap((i) => (i.kind === 'row' ? [i.row.seq] : [])));
  const openCount = $derived(shape ? rows.filter((r) => r.seq > 0 && !gone.has(r.seq) && !isDone(r.fields, shape!)).length : 0);
  /** The first heading drawn, which carries the key strip. */
  const firstHead = $derived(items.find((i) => i.kind === 'head' || i.kind === 'tiers')?.key ?? null);

  /** What a band is called here: Late for the overdue, With agents, and the list's own words for the rest. */
  const groupTitle = (b: Band): string => (b === 'overdue' ? words.late : b === 'agent' ? words.withAgents : shape ? bandTitle(b, shape) : '');
  const groupMeta = (b: Band): string => (b === 'agent' ? words.agentsMeta : b === 'changed' ? words.changedMeta : '');

  /* ROWS THAT ARRIVED WHILE YOU LOOKED, by whoever wrote them, tinted for a moment. The first answer is the baseline. */
  const arrivals = liveArrivals();
  const arrived = $derived(answer ? arrivals.see(TASKS, rows.filter((r) => r.seq > 0).map((r) => String(r.seq))) : new Set<string>());

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
    if (opened === seq) panelOpen = false;
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

  /* ── the docked panel: a task open in its edit state ────────────────────── */

  /** The row the panel is on, and whether the panel is open. */
  let opened = $state<number | null>(null);
  let panelOpen = $state(false);
  const openRow = $derived(opened === null ? undefined : rowOf(opened));

  type Form = { title: string; project: string; due: string; tier: string; who: string };
  const formOf = (r: Entry): Form => ({
    title: titleOfRow(r),
    project: shape ? String(projectOf(r.fields, shape) ?? '') : '',
    due: shape?.due ? dayIn(r.fields[shape.due]) : '',
    tier: shape?.priority ? text(r.fields[shape.priority.field]) : '',
    who: shape ? agentOf(r.fields, shape) : '',
  });
  let form = $state<Form>({ title: '', project: '', due: '', tier: '', who: '' });
  let formFrom: Form = { title: '', project: '', due: '', tier: '', who: '' };
  let confirming = $state(false);
  const dirty = (): boolean => (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== formFrom[k]);

  /** The panel on a row: its words and fields copied into the form, which nothing redraws until it is saved. */
  function load(seq: number) {
    const r = rowOf(seq);
    if (!r || seq < 0) return;
    opened = seq;
    formFrom = formOf(r);
    form = { ...formFrom };
    confirming = false;
    panelOpen = true;
  }

  async function openPanel(seq: number, focusTitle = false) {
    if (seq < 0 || !rowOf(seq)) return;
    picking = null;
    cursor = seq;
    load(seq);
    if (!focusTitle || !mayWrite) return;
    await flush();
    /* THE PANEL MAY STILL BE OPENING: a frame later it is, and the caret goes into the words. */
    requestAnimationFrame(() => {
      const box = document.querySelector<HTMLTextAreaElement>(`[data-edit="${seq}"]`);
      box?.focus();
      box?.select();
    });
  }

  /** `e` and the menu's Edit: the panel, with the caret in the words. */
  const startEdit = (seq: number) => openPanel(seq, true);

  /* THE PANEL FOLLOWS THE CURSOR as j and k walk the list, unless something in it is typed and not saved yet. */
  $effect(() => {
    const c = cursor;
    untrack(() => {
      if (panelOpen && c !== null && c > 0 && c !== opened && !dirty()) load(c);
    });
  });

  /* A ROW THAT LEAVES THE LIST (deleted here or elsewhere) takes the panel with it. */
  $effect(() => {
    if (panelOpen && opened !== null && (!openRow || gone.has(opened))) panelOpen = false;
  });

  function panelClosed() {
    const seq = opened;
    opened = null;
    confirming = false;
    if (seq !== null && rowEl(seq)) void focusRow(seq);
  }

  /** Save: every field that changed, in one write, with one Undo. */
  function save(e?: SubmitEvent) {
    e?.preventDefault();
    const seq = opened;
    const r = seq === null ? undefined : rowOf(seq);
    const s = shape;
    if (seq === null || !r || !s || !mayWrite) return;
    const patch: Fields = {};
    const title = form.title.trim();
    if (title !== '' && title !== titleOfRow(r)) patch[s.title] = title;
    if (s.project) {
      const want = form.project === '' ? null : Number(form.project);
      if (want !== projectOf(r.fields, s)) patch[s.project.field] = want;
    }
    if (s.due && form.due !== dayIn(r.fields[s.due])) patch[s.due] = form.due === '' ? null : form.due;
    if (s.priority && form.tier !== text(r.fields[s.priority.field])) patch[s.priority.field] = form.tier === '' ? null : form.tier;
    if (s.agent && form.who !== agentOf(r.fields, s)) patch[s.agent] = form.who === '' ? null : form.who;
    formFrom = { ...form };
    panelOpen = false;
    if (Object.keys(patch).length > 0) write(seq, patch, words.marks.edited, words.said.edited(title || titleOfRow(r)));
  }

  /** The agents the panel offers: those already holding work here, most first, and the one on this task. */
  const agents = $derived.by(() => {
    if (!shape?.agent) return [];
    const n = new Map<string, number>();
    for (const r of present) {
      const a = agentOf(r.fields, shape);
      if (a) n.set(a, (n.get(a) ?? 0) + 1);
    }
    const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a]) => a).slice(0, 3);
    return form.who && !top.includes(form.who) ? [...top, form.who] : top;
  });

  /** The project around the open task: how much else is open in it, and the next three by day. */
  const alsoIn = $derived.by(() => {
    const s = shape;
    if (!openRow || !s?.project) return null;
    const p = projectOf(openRow.fields, s);
    if (p === null) return null;
    const list = present.filter((r) => r.seq > 0 && r.seq !== openRow.seq && !isDone(r.fields, s) && projectOf(r.fields, s) === p).sort(byDue(s));
    return { project: p, to: s.project.to, name: projectName.get(p) ?? `#${p}`, n: list.length, rows: list.slice(0, 3) };
  });

  /* ── the capture line ───────────────────────────────────────────────────── */

  let draft = $state('');
  let captureBox = $state<HTMLInputElement>();
  let searchBox = $state<HTMLInputElement>();
  let typedSeq = 0;

  const context = $derived(shape && answer ? contextOf(shape, today, answer.projects) : null);
  /** The project a new task files under: the filter's, when it names one. */
  const filed = $derived(pick !== ALL && pick !== NONE ? Number(pick) : null);
  /** How the line reads: the project it files under, then the day, the tier and who holds it. */
  const readsAs = $derived.by(() => {
    if (!context || !shape || draft.trim() === '') return null;
    const c = captureOf(draft, context);
    const project = c.project ?? (shape.project ? filed : null);
    if (project === null && c.due === null && c.priority === null && c.agent === null) return null;
    const rest = captureSaid({ ...c, project: null }, context);
    if (shape.agent && !c.agent) rest.push(words.yours);
    return { project: project === null ? null : (projectName.get(project) ?? `#${project}`), rest };
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
    const next = justNow(seq) ? seq : after(seq);
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
    /* FROM A BUTTON IN THE PANEL the list's letters still walk the list, and the panel follows; Esc is the panel's own,
       and Delete never reaches past it to a row. */
    const inPanel = on instanceof HTMLElement && on.closest('dialog') !== null;
    if (inPanel && (e.key === 'Delete' || e.key === 'Backspace')) return;
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
        /* OPEN IT, in the panel beside the list; the menu and a modified click still go to its own page. */
        if (control || seq === null || seq < 0) return;
        void openPanel(seq);
        break;
      case 'Escape':
        /* THE PANEL FIRST, then the cursor and the legend. Esc inside the panel is the panel's own. */
        if (inPanel) return;
        if (panelOpen) {
          panelOpen = false;
          break;
        }
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

  /** A tap on a row's words on a phone opens its verbs; a click opens it in the panel; a modified click follows the link. */
  function rowTap(e: MouseEvent, seq: number) {
    if (matchMedia(THUMB).matches) {
      e.preventDefault();
      e.stopPropagation();
      openMenu(seq, 'row', e.currentTarget as HTMLElement);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    void openPanel(seq);
  }

  /** And a press anywhere else on the row but its controls does the same: the verbs on a phone, the panel otherwise. */
  function rowPress(e: MouseEvent, seq: number) {
    if (seq < 0 || picking === seq) return;
    if ((e.target as Element).closest('button, input, a, select')) return;
    if (matchMedia(THUMB).matches) openMenu(seq, 'row', e.currentTarget as HTMLElement);
    else void openPanel(seq);
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

  /** How much it matters, in the list's own word ("High"), or the state where the list ranks nothing. */
  const flagWord = (r: Entry): string => {
    const p = shape?.priority;
    const said = p ? (p.said[text(r.fields[p.field])] ?? '') : '';
    return (said || stateWord(r)).toLowerCase();
  };

  /** The row's check: open, done, dashed while it waits on somebody, and an arc while an agent holds it. */
  const checkOf = (r: Entry, band: Band): 'done' | 'waiting' | 'held' | 'open' => {
    if (!shape) return 'open';
    if (isDone(r.fields, shape)) return 'done';
    if (band === 'waiting' || (shape.waiting.includes(stateNow(r)) && !agentOf(r.fields, shape))) return 'waiting';
    return agentOf(r.fields, shape) ? 'held' : 'open';
  };

  /**
   * THE ROW'S END: what happened to it in Just changed, how late it is in red, "due today", an agent and what it is on,
   * or the day it is due and who holds it. `lead` is said before, quieter.
   */
  const whenOf = (r: Entry, band: Band): { lead: string; words: string; tone: '' | 'danger' | 'warn' | 'live' | 'earn' | 'ink' } => {
    const s = shape;
    if (!s) return { lead: '', words: '', tone: '' };
    if (band === 'changed') {
      const mark = touched.get(r.seq)?.mark ?? '';
      return { lead: '', words: mark, tone: mark === words.marks.done ? 'earn' : '' };
    }
    const done = isDone(r.fields, s);
    const agent = agentOf(r.fields, s);
    const holder = holderOf(r);
    if (done) {
      const fin = s.finished ? dayIn(r.fields[s.finished]) : '';
      return { lead: holder, words: fin ? words.doneOn(daySaid(fin)) : words.marks.done.toLowerCase(), tone: 'earn' };
    }
    const due = s.due ? dayIn(r.fields[s.due]) : '';
    if (due !== '' && due < today) return { lead: holder, words: lateBy(due, today), tone: 'danger' };
    if (due !== '' && due === today) return { lead: holder, words: words.dueToday, tone: 'ink' };
    if (agent) {
      const a = agentSaid(r.fields, s);
      return { lead: agent, words: a.words, tone: a.tone };
    }
    return { lead: due ? holder : '', words: due ? dueSaid(due, today) : holder, tone: '' };
  };

  /** The panel's line under its head: where the task sits, and how late it is. */
  const panelMeta = $derived.by(() => {
    const s = shape;
    const r = openRow;
    if (!s || !r) return null;
    const bits = [projectOfRow(r), holderOf(r) ? holderOf(r).toLowerCase() : s.agent ? words.yours : '', (s.said[stateNow(r)] ?? stateNow(r)).toLowerCase()].filter(Boolean);
    const due = s.due ? dayIn(r.fields[s.due]) : '';
    const late = due !== '' && due < today && !isDone(r.fields, s);
    return {
      project: projectOfRow(r),
      bits: bits.join(' · '),
      due: due === '' ? '' : late ? words.panel.wasDue(lateBy(due, today), daySaid(due)) : words.panel.dueOn(daySaid(due)),
      late,
    };
  });

  /** A short word for another task in the panel's project list: an agent and what it is on, or its tier and day. */
  const alsoSaid = (r: Entry): { words: string; live: boolean } => {
    if (!shape) return { words: '', live: false };
    const a = agentOf(r.fields, shape);
    if (a) {
      const said = agentSaid(r.fields, shape);
      return { words: `${a}, ${said.words}`, live: said.tone === 'live' };
    }
    const due = shape.due ? dayIn(r.fields[shape.due]) : '';
    return { words: [words.yours, flagWord(r), due ? dueSaid(due, today).toLowerCase() : ''].filter(Boolean).join(', '), live: false };
  };
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<!-- THE WHOLE SCREEN NARROWS BESIDE THE DOCKED PANEL, title row and all: the panel sets `--dock-w` while it is open, and
     this pads by what it takes past the page's own gutter, so the toolbar never sits under the panel. -->
<div class="work">
  <PageHead title={words.title} count={answer ? openCount : undefined} sentence={sentence?.text} needs={sentence?.needs || undefined}>
    {#snippet actions()}
      {#if answer && shape}
        <div class="seg" role="group" aria-label={words.whose}>
          {#each WHOSE as w (w)}
            <button type="button" class="seg-btn tap" aria-pressed={whose === w} onclick={() => (whose = w)}>
              {words.whoseSaid[w]}<span class="seg-n num">{whoseN[w]}</span>
            </button>
          {/each}
        </div>
      {/if}
      <button
        type="button"
        class="keys-btn circle tap"
        aria-expanded={legend}
        aria-controls="work-keys"
        aria-label={words.keys}
        title="{words.keys} (?)"
        onclick={() => (legend = !legend)}
      >
        <Icon name="keyboard" size="m" />
      </button>
      {#if answer && shape && mayAdd}
        <button type="button" class="circle tap" aria-label={words.capture} title="{words.capture} (n)" onclick={() => captureBox?.focus()}>
          <Icon name="plus" size="m" />
        </button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="page" bind:this={root}>
    {#if data.refused}
      <!-- A REFUSAL AS EVERY SCREEN DRAWS ONE, which is also what settles the screen: a bare sentence said nothing to the
           readiness count, so an address naming no record never finished drawing. -->
      <ReadState state="refused" refusal={data.refused.fix} />
    {:else if !answer}
      <ReadState state={work.state === 'ready' ? 'waiting' : work.state} refusal={work.refusal} onretry={() => void work.reread()} />
    {:else if shape}
      <!-- ══ THE CAPTURE LINE, and how the typed words read ══ -->
      {#if mayAdd}
        <form class="capture" onsubmit={add}>
          <label class="sr-only" for="work-capture">{words.capture}</label>
          <div class="capture-field">
            <span class="capture-mark"><Icon name="plus" size="m" /></span>
            <input
              id="work-capture"
              class="capture-box"
              type="text"
              autocomplete="off"
              enterkeyhint="done"
              placeholder={filed !== null ? `${words.capture} to ${projectName.get(filed) ?? ''}` : words.capture}
              title={words.captureHint}
              bind:value={draft}
              bind:this={captureBox}
            />
            {#if readsAs}
              <span class="reads" aria-live="polite">
                <span>{words.readsAs}</span>
                {#if readsAs.project}<Face name={readsAs.project} of="project" size="s" />{/if}
                <span class="reads-what">{[readsAs.project, ...readsAs.rest].filter(Boolean).join(' · ')}</span>
              </span>
            {/if}
            <span class="capture-go"><Button weight="bare" size="sm" type="submit" kbd="↵">{words.add}</Button></span>
          </div>
        </form>
      {:else}
        <p class="none">{words.readOnly}</p>
      {/if}

      <!-- ══ THE PROJECT FILTER, AND THE SEARCH ══ -->
      <div class="tools">
        {#if shape.project && choices.length > 1}
          <label class="sr-only" for="work-project">{words.project}</label>
          <select id="work-project" class="field pick" bind:value={pick}>
            {#each choices as c (c.key)}
              <option value={c.key}>{c.label} ({c.count})</option>
            {/each}
          </select>
          <div class="chips" role="group" aria-label={words.projects}>
            {#each chips as c (c.key)}
              {@const face = c.key !== ALL && c.key !== NONE}
              <button
                type="button"
                class="chip tap"
                aria-pressed={pick === c.key}
                aria-label={face ? `${c.label}, ${c.count}` : undefined}
                title={face ? c.label : undefined}
                onclick={() => (pick = c.key)}
              >
                {#if face}<Face name={c.label} of="project" size="s" />{:else}{c.label}{/if}<span class="chip-n num">{c.count}</span>
              </button>
            {/each}
            {#if chipsHidden > 0 || allChips}
              <button type="button" class="chip tap" aria-expanded={allChips} onclick={() => (allChips = !allChips)}>
                {allChips ? words.fewer : words.more(chipsHidden)}<span class="fold-mark" data-open={allChips ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
              </button>
            {/if}
          </div>
        {/if}
        <label class="sr-only" for="work-search">{words.search}</label>
        <div class="find">
          <Icon name="search" size="s" />
          <input id="work-search" type="search" placeholder={words.search} autocomplete="off" bind:value={query} bind:this={searchBox} />
        </div>
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

      <!-- ══ THE TIER CHART: one square a task, yours against the agents' ══ -->
      {#if tiers}
        <Tile icon="chart-column" title={words.tier.title} count={tiers.total}>
          <div class="tier">
            <div class="tier-chart">
              {#each [{ name: tiers.people ? words.tier.people : words.tier.yours, side: tiers.yours }, { name: words.tier.agents, side: tiers.agents }] as w (w.name)}
                <div class="tier-side">
                  <p class="tier-name"><span class="tier-who">{w.name}</span> <span class="num">{w.side.n}</span></p>
                  {#if w.side.n > 0}
                    <div class="tier-waffle" style:inline-size="{w.side.columns * 13 - 3}px">
                      <Waffle parts={w.side.parts} columns={w.side.columns} summary={w.side.said} />
                    </div>
                  {/if}
                </div>
              {/each}
              <ul class="viz tier-key">
                {#each tiers.key as k (k.label)}
                  <li><span class="key-dot" data-tone={k.tone}></span><span class="num">{k.n}</span> {k.label}</li>
                {/each}
              </ul>
            </div>
            <p class="tier-read">{tiers.reading}</p>
          </div>
        </Tile>
      {/if}

      <!-- ══ THE BANDS, on the ground ══ One keyed list, headings and rows together, so a row keeps its element as it
           changes band. -->
      <div class="board" data-all={pick === ALL ? '' : undefined}>
        {#each items as item (item.key)}
          {#if item.kind === 'head'}
            {@const folded = folds(item.band)}
            <div class="head-row" data-first={item.key === firstHead ? '' : undefined}>
              <h2 class="head" data-band={item.band}>
                {#if folded}
                  <button type="button" class="fold" aria-expanded={shown(item.band)} onclick={() => flip(item.band)}>
                    <span class="fold-mark" data-open={shown(item.band) ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
                    {groupTitle(item.band)}
                  </button>
                {:else}
                  {groupTitle(item.band)}
                {/if}
                <span class="n num">{item.n}</span>
              </h2>
              {#if item.key === firstHead}
                {@render strip()}
              {:else if groupMeta(item.band)}
                <span class="head-meta">{groupMeta(item.band)}</span>
              {/if}
            </div>
          {:else if item.kind === 'tiers'}
            <div class="tiers" data-first={item.key === firstHead ? '' : undefined}>
              <div class="tiers-chips" role="group" aria-label={words.byTier}>
                {#each item.tiers as t (t.band)}
                  <button
                    type="button"
                    class="fold chip tap"
                    data-band={t.band}
                    aria-expanded={shown(t.band)}
                    title={t.band === 'later' ? words.laterMeta : undefined}
                    onclick={() => flip(t.band)}
                  >
                    <span class="fold-mark" data-open={shown(t.band) ? '' : undefined}><Icon name="chevronDown" size="s" /></span>{groupTitle(
                      t.band,
                    )}<span class="chip-n num">{t.n}</span>
                  </button>
                {/each}
              </div>
              {#if stale && (stale.seqs.size > 0 || staleOnly)}
                <span class="stale">
                  <span class="stale-said"
                    >{stale.from === 'updated' ? words.stale.moved(stale.seqs.size, daySaid(stale.since)) : words.stale.added(stale.seqs.size, daySaid(stale.since))}</span
                  >
                  <Button size="sm" aria-pressed={staleOnly} onclick={() => (staleOnly = !staleOnly)}>{staleOnly ? words.stale.all : words.stale.show}</Button>
                </span>
              {/if}
              {#if item.key === firstHead}{@render strip()}{/if}
            </div>
          {:else if item.kind === 'sub'}
            <h3 class="head sub" data-band={item.band}>{groupTitle(item.band)}<span class="n num">{item.n}</span></h3>
          {:else}
            {@const r = item.row}
            {@const seq = r.seq}
            {@const done = isDone(r.fields, shape)}
            {@const lost = gone.has(seq)}
            {@const due = shape.due ? dayIn(r.fields[shape.due]) : ''}
            {@const when = whenOf(r, item.band)}
            {@const p = projectOfRow(r)}
            <!-- THE ROW TAKES FOCUS AS THE CURSOR, one row at a time (a roving tabindex), and its keys are the screen's
                 (`keys` above): every verb in it is a button of its own, and the press on a phone opens those same verbs. -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
            <div
              class="row"
              data-seq={seq}
              tabindex={cursor === seq ? 0 : -1}
              data-cursor={cursor === seq ? '' : undefined}
              data-selected={panelOpen && opened === seq ? '' : undefined}
              data-done={done || lost ? '' : undefined}
              data-arrived={arrived.has(String(seq)) ? '' : undefined}
              onfocusin={() => (cursor = seq)}
              onclick={(e) => rowPress(e, seq)}
              role="group"
              aria-label={titleOfRow(r)}
            >
              <span class="lead">
                {#if shape.state && shape.tickTo}
                  <button
                    type="button"
                    class="tick line-check tap"
                    role="checkbox"
                    aria-checked={done}
                    data-state={checkOf(r, item.band)}
                    aria-label={words.done(titleOfRow(r))}
                    disabled={seq < 0 || lost || !mayWrite}
                    onclick={() => toggle(seq)}
                  >
                    {#if done}<Icon name="check" size="s" />{/if}
                  </button>
                {/if}
              </span>

              <span class="main">
                {#if seq < 0}
                  <span class="what">{titleOfRow(r)}</span>
                {:else}
                  <a
                    class="what"
                    href={at(`/r/${TASKS}/${seq}`)}
                    tabindex="-1"
                    aria-current={panelOpen && opened === seq ? 'true' : undefined}
                    onclick={(e) => rowTap(e, seq)}>{titleOfRow(r)}</a
                  >
                {/if}
              </span>

              <span class="facts">
                {#if shape.project && pick === ALL}
                  <span class="proj">{#if p}<Face name={p} of="project" size="s" /><span class="proj-name">{p}</span>{/if}</span>
                {/if}
                <span class="flag">{flagWord(r)}</span>
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
                {:else}
                  <span class="when" data-tone={when.tone || undefined}>
                    {#if when.lead}<span class="when-lead">{when.lead} · </span>{/if}<span class="when-words" data-late={when.tone === 'danger' ? '' : undefined}
                      >{when.words}</span
                    >
                    {#if lost && mayWrite && item.band === 'changed'}
                      <button type="button" class="link" onclick={() => void run(restoral(seq))}>{words.putBack}</button>
                    {/if}
                    <span class="hint" aria-hidden="true"><Kbd keys="e" /></span>
                  </span>
                {/if}
              </span>

              {#if mayWrite && seq > 0 && !lost}
                <span class="verbs">
                  <button type="button" class="verb" onclick={() => void startEdit(seq)}>{words.edit}<Kbd keys="e" /></button>
                  {#if shape.due}<button type="button" class="verb" onclick={(e) => openMenu(seq, 'due', e.currentTarget)}>{words.due}<Kbd keys="d" /></button>{/if}
                  {#if shape.state || shape.project}<button type="button" class="verb" onclick={(e) => openMenu(seq, 'move', e.currentTarget)}>{words.move}<Kbd keys="m" /></button>{/if}
                  <button type="button" class="verb" onclick={() => remove(seq)}>{words.delete}<Kbd keys="Delete" /></button>
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
</div>

{#snippet strip()}
  <span class="strip" aria-hidden="true">
    <span><Kbd keys="j" /><Kbd keys="k" /> {words.strip.move}</span>
    <span><Kbd keys="x" /> {words.strip.done}</span>
    <span><Kbd keys="e" /> {words.strip.edit}</span>
    {#if shape?.due}<span><Kbd keys="d" /> {words.strip.due}</span>{/if}
    <span><Kbd keys="m" /> {words.strip.lane}</span>
    <span><Kbd keys="⌘Z" /> {words.strip.undo}</span>
  </span>
{/snippet}

<!-- ══ THE DOCKED PANEL: the task open in its edit state ══ -->
{#if shape}
  <Panel bind:open={panelOpen} title={mayWrite ? words.panel.editing : words.panel.reading} onclose={panelClosed}>
    {#snippet verbs()}
      {#if openRow && opened !== null}
        {@const seq = opened}
        {#if mayWrite && shape?.state && shape.tickTo}
          <Button size="sm" kbd="x" onclick={() => toggle(seq)}>{isDone(openRow.fields, shape) ? words.panel.reopen : words.marks.done}</Button>
        {/if}
        <button
          type="button"
          class="more tap"
          aria-label={words.panel.moreActions}
          title={words.panel.moreActions}
          onclick={(e) => openMenu(seq, 'row', e.currentTarget)}
        >
          <Icon name="more" size="m" />
        </button>
      {/if}
    {/snippet}

    {#if openRow && opened !== null}
      {@const seq = opened}
      <form class="sheet-form" onsubmit={save}>
        {#if panelMeta}
          <p class="p-meta">
            {#if panelMeta.project}<Face name={panelMeta.project} of="project" size="s" />{/if}
            <span class="p-bits">{panelMeta.bits}</span>
            {#if panelMeta.due}<span class="p-due" data-late={panelMeta.late ? '' : undefined}>{panelMeta.due}</span>{/if}
          </p>
        {/if}

        <div class="p-field">
          <label class="p-label" for="work-edit-{seq}">{words.panel.title}</label>
          <textarea
            id="work-edit-{seq}"
            class="edit p-input"
            data-edit={seq}
            rows="2"
            readonly={!mayWrite}
            bind:value={form.title}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
          ></textarea>
        </div>

        {#if shape.project || shape.due}
          <div class="p-pair">
            {#if shape.project}
              <div class="p-field">
                <label class="p-label" for="work-edit-project">{words.project}</label>
                <select id="work-edit-project" class="p-input" disabled={!mayWrite} bind:value={form.project}>
                  <option value="">{words.noProject}</option>
                  {#each answer?.projects ?? [] as pr (pr.seq)}
                    <option value={String(pr.seq)}>{pr.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
            {#if shape.due}
              <div class="p-field">
                <label class="p-label" for="work-edit-due">{words.due}</label>
                <input id="work-edit-due" class="p-input" type="date" disabled={!mayWrite} bind:value={form.due} />
              </div>
            {/if}
          </div>
        {/if}

        {#if shape.priority}
          {@const pr = shape.priority}
          <div class="p-field" role="group" aria-labelledby="work-edit-tier">
            <span class="p-label" id="work-edit-tier">{words.panel.tier}</span>
            <div class="p-seg">
              {#each pr.values as v (v)}
                <button
                  type="button"
                  class="p-seg-btn tap"
                  aria-pressed={form.tier === v}
                  disabled={!mayWrite}
                  onclick={() => (form.tier = form.tier === v ? '' : v)}>{pr.said[v] ?? v}</button
                >
              {/each}
            </div>
          </div>
        {/if}

        {#if shape.agent}
          <div class="p-field" role="group" aria-labelledby="work-edit-who">
            <span class="p-label" id="work-edit-who">{words.panel.who}</span>
            <div class="p-seg">
              <button type="button" class="p-seg-btn tap" aria-pressed={form.who === ''} disabled={!mayWrite} onclick={() => (form.who = '')}>{words.panel.you}</button>
              {#each agents as a (a)}
                <button type="button" class="p-seg-btn tap" aria-pressed={form.who === a} disabled={!mayWrite} onclick={() => (form.who = a)}>{a}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if alsoIn}
          <section class="also" aria-labelledby="work-also">
            <div class="also-head">
              <h3 class="also-title" id="work-also">{words.panel.also(alsoIn.name)}</h3>
              <span class="also-n num">{words.panel.alsoOpen(alsoIn.n)}</span>
              <a class="also-link" href={at(`/r/${alsoIn.to}/${alsoIn.project}`)}>{words.panel.projectLink}<Icon name="arrow" size="s" /></a>
            </div>
            {#each alsoIn.rows as o (o.seq)}
              {@const said = alsoSaid(o)}
              <button type="button" class="also-row" onclick={() => void openPanel(o.seq)}>
                <span class="also-check line-check" data-state={checkOf(o, drawnBand(o.fields, shape, today))} aria-hidden="true"></span>
                <span class="also-what">{titleOfRow(o)}</span>
                <span class="also-said" data-live={said.live ? '' : undefined}>{said.words}</span>
              </button>
            {/each}
          </section>
        {/if}

        {#if mayWrite}
          <div class="p-foot">
            {#if confirming}
              <p class="p-sure" role="status">{words.panel.deleteSure}</p>
              <Button size="sm" onclick={() => (confirming = false)}>{words.panel.keep}</Button>
              <Button size="sm" weight="primary" onclick={() => remove(seq)}>{words.panel.deleteYes}</Button>
            {:else}
              <button type="button" class="p-delete" onclick={() => (confirming = true)}>{words.panel.deleteAsk}</button>
              <span class="p-gap"></span>
              <Button size="sm" kbd="Esc" onclick={() => (panelOpen = false)}>{words.panel.cancel}</Button>
              <Button size="sm" weight="primary" type="submit" kbd="↵">{words.panel.save}</Button>
            {/if}
          </div>
        {/if}
      </form>
    {/if}
  </Panel>
{/if}

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
  /* THE SCREEN GIVES UP WHAT THE DOCKED PANEL TAKES, past the gutter the title row and the page already pad by. */
  .work {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w) - var(--gutter)));
    transition: padding-inline-end var(--d-enter) var(--ease-out);
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  /* ── the toolbar: glass, 36 high, 6 apart ── */

  /* A SEGMENTED CONTROL: a glass pill holding three, the chosen one a tile-white pill. */
  .seg {
    display: flex;
    align-items: center;
    gap: 2px;
    box-sizing: border-box;
    block-size: var(--ctl-h);
    padding: 3px;
    background: var(--glass);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
  }

  .seg-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: 100%;
    padding: 0 var(--sp-3);
    background: transparent;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .seg-btn[aria-pressed='true'] {
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .seg-n {
    color: var(--dim);
    font-weight: 400;
  }

  /* A 36PX GLASS CIRCLE, with its tooltip and its name. */
  .circle {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--glass);
    backdrop-filter: var(--glass-blur);
    border: 0;
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
    color: var(--ink);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .keys-btn[aria-expanded='true'] {
    background: var(--glass-strong);
  }

  /* IN THE COMPACT BAR THE CONTROLS DROP THEIR OWN GLASS: the bar is glass already, and glass never holds glass. */
  :global(.head[data-under]) .seg,
  :global(.head[data-under]) .circle {
    background: transparent;
    backdrop-filter: none;
    box-shadow: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .circle:hover {
      background: var(--glass-strong);
    }

    .seg-btn:hover:not([aria-pressed='true']) {
      color: var(--ink);
    }
  }

  /* ── the capture line ── */

  .capture-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
    min-block-size: 40px;
    padding: 0 var(--sp-1) 0 var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .capture-field:focus-within {
    box-shadow: 0 0 0 2px var(--ink);
  }

  .capture-mark {
    display: inline-grid;
    color: var(--dim);
  }

  .capture-box {
    flex: 1 1 12rem;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    /* focus-ok: the whole field draws the ring (`.capture-field:focus-within`), and the caret is in it. */
    outline: none;
  }

  .capture-box::placeholder {
    color: var(--dim);
  }

  /* HOW THE LINE READS, at the field's end: "reads as", the project's face and name, the day, the tier, who holds it. */
  .reads {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .reads-what {
    overflow: hidden;
    color: var(--ink);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capture-go {
    display: inline-flex;
    flex: none;
  }

  /* ── the project filter and the search ── */

  .tools {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .field {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  /* THE SELECT IS THE PHONE'S FILTER; from 900px up the chips are, and the select is not drawn twice for a screen reader. */
  .pick {
    display: none;
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .chips {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-inline-size: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3) 0 var(--sp-2);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .chip[aria-pressed='true'] {
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .chip-n {
    color: var(--dim);
    font-weight: 400;
  }

  @media (hover: hover) and (pointer: fine) {
    .chip:hover:not([aria-pressed='true']) {
      background: var(--hold-wash);
      color: var(--ink);
    }
  }

  .find {
    display: flex;
    flex: 0 1 14rem;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 8rem;
    block-size: var(--ctl-h-sm);
    margin-inline-start: auto;
    padding: 0 var(--sp-3);
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--dim);
  }

  .find:focus-within {
    box-shadow: 0 0 0 2px var(--ink);
  }

  .find input {
    flex: 1;
    min-inline-size: 0;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    /* focus-ok: the pill draws the ring (`.find:focus-within`), and the caret is in it. */
    outline: none;
  }

  .find input::placeholder {
    color: var(--dim);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .legend span,
  .strip span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  /* ── the tier chart ── */

  /* THE CHART AT THE END AND ITS READING BESIDE IT, bottom-aligned; on a phone the reading goes under the chart. */
  .tier {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-3) var(--sp-5);
  }

  .tier-read {
    flex: 1 1 16rem;
    order: -1;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .tier-chart {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--sp-3) var(--sp-6);
    min-inline-size: 0;
  }

  .tier-side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .tier-name {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 16px;
  }

  .tier-who {
    color: var(--ink);
    font-weight: 600;
  }

  .tier-waffle {
    max-inline-size: 100%;
  }

  .tier-key {
    display: flex;
    flex-basis: 100%;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .tier-key li {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .key-dot {
    inline-size: 8px;
    block-size: 8px;
    background: var(--c);
    border-radius: 2px;
  }

  /* ── the bands ── */

  .board {
    display: flex;
    flex-direction: column;
    margin-block-start: var(--sp-2);
    min-inline-size: 0;
  }

  /* A GROUP ON THE GROUND: the title at `--t-group`, its count quiet, a note or the keys at the right, and one hairline
     under it. The rows follow with no box round them. */
  .head-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 32px;
    margin-block: var(--sp-4) var(--sp-1);
    padding-block-end: var(--sp-1);
    border-block-end: 1px solid var(--line);
  }

  .head-row[data-first] {
    margin-block-start: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .n {
    color: var(--dim);
    font-weight: 500;
  }

  .head-meta {
    margin-inline-start: auto;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-1) var(--sp-3);
    margin-inline-start: auto;
    color: var(--dim);
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
    transform: rotate(-90deg);
    transition: transform var(--d-state) var(--ease-out);
  }

  .fold-mark[data-open] {
    transform: none;
  }

  :global([dir='rtl']) .fold-mark:not([data-open]) {
    transform: rotate(90deg);
  }

  /* THE REST, FOLDED BY TIER ON ONE LINE, with what has not moved riding at its end. */
  .tiers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-block-size: var(--row-h);
    margin-block: var(--sp-4) var(--sp-1);
    padding-block: var(--sp-2);
    border-block-start: 1px solid var(--line);
  }

  .tiers[data-first] {
    margin-block-start: 0;
    border-block-start: 0;
  }

  .tiers-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tiers .chip {
    padding-inline: var(--sp-1) var(--sp-3);
    color: var(--ink);
  }

  .stale {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  /* A SUGGESTION IS SAID IN `--live`, the hue Slash's suggestion lines wear. */
  .stale-said {
    color: var(--live);
    font-size: var(--t-sm);
  }

  .sub {
    margin-block: var(--sp-2) 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
    line-height: 18px;
  }

  /* A ROW ON THE GROUND, 44 TALL: the check, the words, the project, the tier and the end, in columns that line up
     down the list, and the verbs over the end on hover. The wash is rounded and never cut by a line. */
  .row {
    position: relative;
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    margin-inline: calc(-1 * var(--sp-3));
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    font-size: var(--t-base);
    transition: background var(--d-state) var(--ease-out);
  }

  /* THE CURSOR ROW IS THE WASH, and the row focused from the keyboard wears the a11y layer's ring as well. */
  .row[data-cursor] {
    background: var(--hover-wash);
  }

  .row[data-selected] {
    background: var(--selected);
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--hover-wash);
    }

    .row[data-selected]:hover {
      background: var(--selected);
    }
  }

  .row[data-arrived] {
    animation: arrived 1.5s var(--ease-out);
  }

  @keyframes arrived {
    from {
      background-color: var(--arrived-wash);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row[data-arrived] {
      animation: arrived 1.5s step-end;
    }
  }

  .lead {
    display: grid;
    place-items: center;
  }

  .tick:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .main {
    display: flex;
    min-inline-size: 0;
  }

  .what {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row[data-done] .what {
    color: var(--ink2);
    text-decoration: line-through;
  }

  /* THE COLUMNS AT THE END: the project (only under All projects), the tier word, and the end. */
  .facts {
    display: grid;
    grid-template-columns: 64px 196px;
    align-items: center;
    gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .board[data-all] .facts {
    grid-template-columns: 120px 64px 196px;
  }

  .proj {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
  }

  .proj-name,
  .flag {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-inline-size: 0;
    white-space: nowrap;
  }

  .when-lead {
    flex: none;
  }

  .when-words {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .when[data-tone] .when-words {
    font-weight: 500;
  }

  .when[data-tone='ink'] .when-words {
    color: var(--ink);
  }

  /* "2 DAYS LATE", THE ROW'S ONE RED, and "waits on your review": what needs him. */
  .when[data-tone='danger'] .when-words {
    color: var(--danger);
  }

  .when[data-tone='warn'] .when-words {
    color: var(--warn);
  }

  .when[data-tone='live'] .when-words {
    color: var(--live);
  }

  .when[data-tone='earn'] .when-words {
    color: var(--earn);
  }

  /* THE CURSOR ROW'S HINT: its key cap for the panel, beside the end. */
  .hint {
    display: none;
  }

  .row[data-cursor] .hint {
    display: inline-flex;
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

  .pick-day {
    justify-self: end;
    padding: 0 var(--sp-1);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
  }

  /**
   * THE VERBS: pills with their key caps, over the row's end while it is pointed at or a verb has focus. They hold no
   * room of their own, so the words keep the width. Present (and so reachable by Tab) on the cursor row, where they
   * appear the moment one of them takes focus; hidden everywhere else until pointed at.
   */
  .verbs {
    position: absolute;
    inset-block: 0;
    inset-inline-end: var(--sp-3);
    display: flex;
    align-items: center;
    gap: 6px;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .row[data-cursor] .verbs {
    visibility: visible;
  }

  .verbs:focus-within {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
  }

  .row:has(.verbs:focus-within) .facts {
    opacity: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover .verbs {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
    }

    .row:hover .facts {
      opacity: 0;
    }
  }

  .verb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: var(--ctl-h-sm);
    padding: 0 5px 0 var(--sp-3);
    background: var(--bg);
    border: 0;
    border-radius: var(--r-pill);
    box-shadow: var(--e1);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .verb:hover {
      background: var(--s1);
    }
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

  /* ── the panel's body ── */

  .sheet-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-block-size: 100%;
  }

  .p-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .p-due {
    margin-inline-start: auto;
    font-weight: 500;
  }

  .p-due[data-late] {
    color: var(--danger);
  }

  .p-field {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 6px;
    min-inline-size: 0;
  }

  .p-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .p-pair {
    display: flex;
    gap: var(--sp-3);
  }

  .p-input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  textarea.p-input {
    padding-block: 10px;
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    resize: none;
  }

  .p-seg {
    display: flex;
    gap: 2px;
    box-sizing: border-box;
    block-size: var(--ctl-h);
    padding: 3px;
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .p-seg-btn {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    padding: 0 var(--sp-2);
    background: transparent;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .p-seg-btn[aria-pressed='true'] {
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .p-seg-btn:disabled {
    cursor: default;
  }

  /* THE PROJECT AROUND IT: a small group, three rows, and the way to the project. */
  .also-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    padding-block-end: 6px;
    border-block-end: 1px solid var(--line);
  }

  .also-title {
    margin: 0;
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .also-n {
    color: var(--dim);
    font-size: var(--t-row);
  }

  .also-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
  }

  .also-row {
    display: flex;
    align-items: center;
    gap: 10px;
    inline-size: 100%;
    min-block-size: var(--row-h);
    padding: 0;
    background: none;
    border: 0;
    border-block-end: 1px solid var(--line);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .also-row:last-child {
    border-block-end: 0;
  }

  .also-check {
    cursor: inherit;
  }

  .also-what {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    font-size: var(--t-base);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .also-said {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .also-said[data-live] {
    color: var(--live);
  }

  @media (hover: hover) and (pointer: fine) {
    .also-link:hover,
    .also-row:hover .also-what {
      color: var(--ink);
      text-decoration: underline;
    }
  }

  /* THE FOOT, AT THE BOTTOM OF THE PANEL WHEREVER THE BODY SCROLLS: delete in words, then Cancel and the one Save. */
  .p-foot {
    position: sticky;
    inset-block-end: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: auto calc(-1 * (var(--sp-4) + var(--sp-1))) calc(-1 * (var(--sp-4) + var(--sp-1)));
    padding: 14px calc(var(--sp-4) + var(--sp-1));
    background: var(--bg);
    border-block-start: 1px solid var(--line);
  }

  .p-gap {
    flex: 1;
  }

  /* A DESTRUCTIVE VERB IS WORDS IN INK asking for a confirm, never a red fill. */
  .p-delete {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .p-sure {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .more {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .more:hover {
      background: var(--hold-wash);
    }
  }

  /* The menu's rows, as the list screen's row menu draws them (`ListRowMenu.svelte`). */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
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

  /* BELOW 900PX, A PHONE'S SCREEN: the select is the filter, and the key strip goes with the keyboard it teaches. */
  @media (width < 900px) {
    .pick {
      display: block;
    }

    .chips,
    .strip {
      display: none;
    }

    .find {
      flex: 1 1 8rem;
    }

    .tier-read {
      order: 0;
    }

    .page {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }
  }

  /* ON A PHONE, OR UNDER A THUMB: the row is two lines 60 tall, the verbs are in the menu a tap on the row opens, and
     every target is a finger's. */
  @media (width < 900px), (pointer: coarse) {
    .row {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
      row-gap: 2px;
      min-block-size: 60px;
      padding-block: var(--sp-2);
    }

    .what {
      font-size: var(--t-md);
      white-space: normal;
    }

    .facts,
    .board[data-all] .facts {
      display: flex;
      flex-wrap: wrap;
      grid-column: 2;
      gap: var(--sp-1) var(--sp-3);
    }

    .when {
      justify-content: flex-start;
    }

    .flag:empty {
      display: none;
    }

    .verbs,
    .keys-btn,
    .legend,
    .strip,
    .hint {
      display: none;
    }

    .capture-field,
    .capture-box,
    .field,
    .p-input {
      min-block-size: var(--tap);
    }

    .mi {
      min-block-size: var(--tap);
    }

    .mi :global(kbd) {
      display: none;
    }
  }

  /* UNDER FORCED COLOURS the fills are gone, so a chosen segment or chip keeps an edge to be told by. */
  @media (forced-colors: active) {
    .seg-btn[aria-pressed='true'],
    .chip[aria-pressed='true'],
    .p-seg-btn[aria-pressed='true'] {
      outline: 1px solid CanvasText;
    }
  }
</style>
