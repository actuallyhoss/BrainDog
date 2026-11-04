<!--
  ADD OR CHANGE ONE KEY NUMBER ON A PROJECT (the KPI plan of 21 October, 2.8): the shared sheet, a side panel from 900px
  up and a bottom sheet on a phone (`Sheet.svelte`).

  THREE THINGS AT REST: its name, where the number comes from, and what good looks like (a target, its unit, and by
  when). Everything else is behind "More", with a default that follows the source until somebody sets it by hand
  (`sheet.ts`), so most people type a name, pick a source and press Add. A number whose hidden fields say something
  other than the defaults opens with "More" already open.

  WHERE IT COMES FROM is four plain choices on one track, each with one line of what it means; the track is the
  segmented control's idiom stood on end (`--tile-2`, the chosen one raised in `--segment-on`), with the house radio
  beside each word so the choice is said by more than its fill. A number that already reads Numbers under its name
  keeps that as a fifth choice.

  THE WRITES ARE THE APP'S ONE ROW WRITER (`rowWriter`) on the `kpis` list: an add, or a change of only what changed.
  What will not do is said under its field before anything is sent, and the caret goes to the first; what the record
  refuses is said in the foot, since a toast waits for the sheet to close. A done write closes the sheet and leaves a
  toast naming the number with Undo.

  ITS PAST VALUES, under the fields of a number already kept (`past.ts`): its readings in Numbers, newest first, each
  with its day and who set it. The newest is taken back with Undo, and any one is changed in place or taken out, each
  through the same row writer on the readings list. The sheet stays open, so each write is put back from its own row
  ("Put back") rather than from a toast. A number worked out from the lists has no readings, and lists none.

  44 UNDER A THUMB: every field, segment, choice and the switch take `--tap` where the pointer is coarse or the screen
  is a phone's.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import { withUnit } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { display, homeCurrency } from '$lib/record/api.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { RecordRow } from '$lib/record/remote.ts';
  import { rowWriter, type RowWriter, type Wrote } from '$lib/record/rows-write.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import '$lib/ui/forms.css';
  import { findReadingList, projectsOf, type Reads } from './kpi-rows.ts';
  import { PAST_READ, pastAfter, pastBackOf, pastOf, pastPatchOf, pastWhere, setByOf, whoSaid, type Past, type PastEvent } from './past.ts';
  import { daySaid, projectFieldOf } from './stale-fix.ts';
  import {
    draftOf,
    everyFor,
    faultsOf,
    FIGURES,
    firstFault,
    newDraft,
    patchOf,
    rowOf,
    saysMore,
    sourcesFor,
    TODAY,
    undoOf,
    withFigure,
    withSource,
    type Context,
    type Faults,
    type KpiDraft,
    type KpiEvery,
    type KpiGood,
    type KpiSource,
    type KpiToday,
  } from './sheet.ts';

  let {
    open = $bindable(false),
    list,
    project,
    kpi = null,
    you,
    writer,
    onsaved,
  }: {
    open?: boolean | undefined;
    /** The list key numbers are kept in, as the page or the record names it (Portfolio's `KPI_LIST.list`). */
    list: string;
    /** The project the number is on: its number and its name. */
    project: { seq: number; name: string };
    /** The number to change; none to add one. */
    kpi?: Entry | null | undefined;
    /** Who keeps a number they type; the signed-in person's name when not given. */
    you?: string | undefined;
    /** The writer to use; the app's own row writer when not given. */
    writer?: RowWriter | undefined;
    /** The number as the record now holds it, after an add, a change, a stop or an undo. */
    onsaved?: ((entry: Entry) => void) | undefined;
  } = $props();

  const uid = $props.id();
  const id = (field: string): string => `${uid}-${field}`;

  const shell = $derived(page.data as unknown as Partial<Shell>);
  const at = $derived<Context>({
    you: you ?? (shell.me?.person ? shell.names?.[shell.me.person] : undefined) ?? null,
    home: homeCurrency(),
  });

  let draft = $state<KpiDraft>(newDraft());
  let touched = $state(new Set<'unit' | 'good' | 'every' | 'owner'>());
  let more = $state(false);
  let tried = $state(false);
  let busy = $state(false);
  let refused = $state<string | null>(null);

  /* EACH OPENING STARTS FROM WHAT THE NUMBER HOLDS, or from the defaults, never from what the last opening left. */
  let was = false;
  $effect(() => {
    if (open && !was) start();
    was = open;
  });

  function start() {
    const ctx = at;
    draft = kpi ? draftOf(kpi.fields) : newDraft(ctx);
    /* A field that differs from the default its source would give was set by somebody, so a change of source keeps it. */
    const plain = withSource(draft, draft.source, new Set(), ctx);
    touched = new Set((['unit', 'good', 'every', 'owner'] as const).filter((k) => draft[k] !== plain[k]));
    more = kpi ? saysMore(draft, ctx) : false;
    tried = false;
    busy = false;
    refused = null;
    past = null;
    pastFault = false;
    who = new Map();
    done = new Map();
    editing = null;
    editFault = null;
    if (kpi && kpi.fields.source !== 'figure') void readPast(kpi);
  }

  const faults = $derived<Faults>(tried ? faultsOf(draft) : {});
  const figure = $derived(draft.source === 'figure');
  const kept = $derived(kpi !== null && kpi !== undefined);
  const suggested = $derived(kpi?.fields.draft === true);

  const touch = (k: 'unit' | 'good' | 'every' | 'owner') => (touched = new Set([...touched, k]));
  const pickSource = (s: KpiSource) => (draft = withSource(draft, s, touched, at));
  const pickFigure = (f: string) => (draft = withFigure(draft, f, touched, at));

  const SOURCE_SAID: Record<KpiSource, { title: string; line: () => string }> = {
    typed: { title: copy.kpiSourceTyped, line: () => copy.kpiSourceTypedLine },
    agent: { title: copy.kpiSourceAgent, line: () => copy.kpiSourceAgentLine(project.name) },
    feed: { title: copy.kpiSourceFeed, line: () => copy.kpiSourceFeedLine },
    figure: { title: copy.kpiSourceFigure, line: () => copy.kpiSourceFigureLine },
    numbers: { title: copy.kpiSourceNumbers, line: () => copy.kpiSourceNumbersLine },
  };
  const EVERY_SAID: Record<KpiEvery, string> = { '1h': copy.kpiEveryHour, '1d': copy.kpiEveryDay, '1w': copy.kpiEveryWeek, '1m': copy.kpiEveryMonth };
  const TODAY_SAID: Record<KpiToday, { label: string; line: string }> = {
    auto: { label: copy.kpiTodayAuto, line: copy.kpiTodayAutoLine },
    pinned: { label: copy.kpiTodayPinned, line: copy.kpiTodayPinnedLine },
    hidden: { label: copy.kpiTodayHidden, line: copy.kpiTodayHiddenLine },
  };
  const GOOD: readonly { value: KpiGood; label: string }[] = [
    { value: 'up', label: copy.kpiGoodUp },
    { value: 'down', label: copy.kpiGoodDown },
  ];

  let own: RowWriter | undefined;
  const writes = (): RowWriter => writer ?? (own ??= rowWriter(apiBase()));

  /**
   * THE LIST IS LEARNT BEFORE THE FIRST WRITE, as `retype-write.ts` learns its own: the row writer turns the project's
   * number into its id by the list's declaration, and a tab that has drawn no key number yet has not been told it, so the
   * number went as typed and the record refused it ("thing takes a row id"). Once a tab, and only for the app's writer.
   */
  async function ready(): Promise<void> {
    if (writer || REGISTERS[list]) return;
    const [{ createClient }, { learn }] = await Promise.all([import('@braindog/client'), import('$lib/record/remote.ts')]);
    await learn((of) => createClient({ base: apiBase() }).schema(of), list, new Map());
  }

  async function save(e?: SubmitEvent) {
    e?.preventDefault();
    if (busy) return;
    tried = true;
    const first = firstFault(faultsOf(draft));
    if (first !== null) {
      await tick();
      document.getElementById(id(first))?.focus();
      return;
    }
    busy = true;
    refused = null;
    await ready();
    const w = writes();
    const name = draft.name.trim();
    if (!kpi) {
      const out = await w.create(list, rowOf(draft, project.seq));
      busy = false;
      if (!out.ok) return void (refused = out.fix);
      open = false;
      const made = out.entry;
      toasts.push(copy.kpiAdded(name, project.name), { undo: () => void back(w.archive(list, made.seq, made.version)) });
      onsaved?.(made);
      return;
    }
    const before = kpi;
    const patch = patchOf(before.fields, draft);
    if (Object.keys(patch).length === 0) {
      busy = false;
      open = false;
      return;
    }
    const out = await w.update(list, before.seq, patch, before.version);
    busy = false;
    if (!out.ok) return void (refused = out.fix);
    open = false;
    const after = out.entry;
    toasts.push(copy.kpiSaved(name), { undo: () => void back(w.update(list, before.seq, undoOf(before.fields, patch), after.version)) });
    onsaved?.(after);
  }

  /** Stop tracking: the number is retired, its values kept, and Undo makes it live again. */
  async function stop() {
    if (!kpi || busy) return;
    busy = true;
    refused = null;
    const w = writes();
    const before = kpi;
    const out = await w.update(list, before.seq, { state: 'retired' } satisfies Fields, before.version);
    busy = false;
    if (!out.ok) return void (refused = out.fix);
    open = false;
    const after = out.entry;
    toasts.push(copy.kpiStopped(String(before.fields.name ?? '')), { undo: () => void back(w.update(list, before.seq, { state: before.fields.state ?? 'live' }, after.version)) });
    onsaved?.(after);
  }

  /** An undo's write: said when it lands, and the record's sentence when it does not. */
  async function back(write: Promise<Awaited<ReturnType<RowWriter['update']>>>) {
    const out = await write;
    if (!out.ok) return void toasts.push(out.fix, { intent: 'bad' });
    toasts.push(copy.kpiUndone);
    onsaved?.(out.entry);
  }

  /* ── its past values (`past.ts`) ── */

  /** A write made from a row of the list, and what puts it back: the value it held, and the write that restores it. */
  type Done = { kind: 'removed' | 'changed'; before: Past; back: () => Promise<Wrote> };

  let past = $state.raw<Past[] | null>(null);
  let pastFault = $state(false);
  let who = $state.raw<ReadonlyMap<number, string>>(new Map());
  let done = $state.raw<ReadonlyMap<number, Done>>(new Map());
  let editing = $state<number | null>(null);
  let editTyped = $state('');
  let editFault = $state<string | null>(null);
  /** The readings list, found by its shape once a tab (`kpi-rows.ts`), never named. */
  let readings: string | null = null;
  /* THE LAST READ WINS: a sheet opened on another number before the first read lands draws only the second's. */
  let asked = 0;

  const listsPast = $derived(kept && kpi?.fields.source !== 'figure');
  const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

  /**
   * THE NUMBER'S READINGS, newest first, and who set each: one read of the readings list held to this number's measure on
   * its project, then each listed row's history, read together. Nothing here stops the sheet: a refusal says one line.
   */
  async function readPast(k: Entry): Promise<void> {
    const n = ++asked;
    const thing = typeof k.fields.thing === 'string' ? k.fields.thing : null;
    if (thing === null) return void (past = []);
    try {
      const [{ createClient }, { entryOf }] = await Promise.all([import('@braindog/client'), import('$lib/record/remote.ts')]);
      const client = createClient({ base: apiBase() });
      const projects = projectsOf(list);
      readings ??= await findReadingList(client as unknown as Reads, (shell.index?.registers ?? []).map((r) => r.id), projects);
      const decl = readings ? REGISTERS[readings] : undefined;
      const field = decl ? projectFieldOf(decl.fields as never, projects) : null;
      if (n !== asked) return;
      if (!readings || !field) return void (past = []);
      const at = readings;
      const on = { id: thing, name: project.name };
      const of = { name: textOf(k.fields.name), measure: textOf(k.fields.measure) };
      const got = await client.list({ register: at, where: pastWhere(of, on, field), order: [{ field: 'at', dir: 'desc' }], limit: PAST_READ });
      if (n !== asked) return;
      if (!got.ok) return void (pastFault = true);
      const listed = pastOf((got.value.rows as RecordRow[]).map((r) => entryOf(at, r, new Map())), of, on, field);
      past = listed;
      const by = await Promise.all(
        listed.map((p) =>
          client
            .history(at, p.seq)
            .then((h) => (h.ok && Array.isArray(h.value) ? setByOf(h.value as PastEvent[]) : null))
            .catch(() => null),
        ),
      );
      if (n !== asked) return;
      const names = new Map(Object.entries(shell.names ?? {}));
      const me = shell.me?.person ?? null;
      who = new Map(
        listed.flatMap((p, i): [number, string][] => {
          const actor = by[i];
          return actor ? [[p.seq, whoSaid(actor, me, names)]] : [];
        }),
      );
    } catch {
      if (n === asked) pastFault = true;
    }
  }

  /** A past value as a person reads it: money in its currency, a plain number with its unit. */
  function said(p: Past): string {
    const shown = readings ? (p.money ? display(readings, 'amount', p.money) : display(readings, 'value', p.value)) : null;
    const figure = shown ?? p.typed;
    return p.money || p.unit === '' ? figure : withUnit(figure, p.unit);
  }

  const swap = (p: Past) => (past = (past ?? []).map((x) => (x.seq === p.seq ? p : x)));
  function marked(seq: number, d: Done | null) {
    const next = new Map(done);
    if (d) next.set(seq, d);
    else next.delete(seq);
    done = next;
  }

  async function editPast(p: Past) {
    editing = p.seq;
    editTyped = p.typed;
    editFault = null;
    await tick();
    document.getElementById(id(`past-${String(p.seq)}`))?.focus();
  }

  /** One past value changed in place: its value alone, at the version it was read at. */
  async function changePast(p: Past) {
    if (busy || !readings) return;
    const out = pastPatchOf(p, editTyped);
    if (!out.ok) {
      editFault = out.fault;
      await tick();
      document.getElementById(id(`past-${String(p.seq)}`))?.focus();
      return;
    }
    if (out.same) return void (editing = null);
    busy = true;
    refused = null;
    const w = writes();
    const at = readings;
    const wrote = await w.update(at, p.seq, out.patch, p.version);
    busy = false;
    if (!wrote.ok) return void (refused = wrote.fix);
    editing = null;
    editFault = null;
    const version = wrote.entry.version;
    swap(pastAfter(p, out.patch, version));
    marked(p.seq, { kind: 'changed', before: p, back: () => w.update(at, p.seq, pastBackOf(p), version) });
    if (kpi) onsaved?.(kpi);
  }

  /** The newest taken back with Undo, or any other taken out: archived, so `restore` puts it back. */
  async function removePast(p: Past) {
    if (busy || !readings) return;
    busy = true;
    refused = null;
    const w = writes();
    const at = readings;
    const wrote = await w.archive(at, p.seq, p.version);
    busy = false;
    if (!wrote.ok) return void (refused = wrote.fix);
    const version = wrote.entry.version;
    swap({ ...p, version });
    marked(p.seq, { kind: 'removed', before: p, back: () => w.restore(at, p.seq, version) });
    if (kpi) onsaved?.(kpi);
  }

  /** A row's write put back: the value it held, or the reading back in Numbers. */
  async function putBack(p: Past) {
    const d = done.get(p.seq);
    if (busy || !d) return;
    busy = true;
    refused = null;
    const out = await d.back();
    busy = false;
    if (!out.ok) return void (refused = out.fix);
    swap({ ...d.before, version: out.entry.version });
    marked(p.seq, null);
    if (kpi) onsaved?.(kpi);
  }

  /** Enter saves the value in the box and Escape leaves it, without the sheet's own form or its close hearing either. */
  function pastKeys(e: KeyboardEvent, p: Past) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void changePast(p);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editing = null;
    }
  }

  /** Arrows move a radiogroup's choice, and wrap, as `RowForm`'s segments do. */
  function arrows<T extends string>(e: KeyboardEvent, i: number, values: readonly T[], set: (v: T) => void) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const n = (i + step + values.length) % values.length;
    const next = values[n];
    if (next === undefined) return;
    set(next);
    ((e.currentTarget as HTMLElement).parentElement?.children[n] as HTMLElement | undefined)?.focus();
  }
</script>

{#snippet choose(key: string, label: string, options: readonly { value: string; label: string }[], current: string, set: (v: string) => void, line?: string)}
  <div class="kpi-pick">
    <span class="field-label" id={id(`${key}-label`)}>{label}</span>
    <Segmented role="radiogroup" aria-labelledby={id(`${key}-label`)} aria-describedby={line ? id(`${key}-line`) : undefined} full>
      {#each options as o, i (o.value)}
        <button
          type="button"
          class="segment"
          role="radio"
          tabindex={current === o.value || (current === '' && i === 0) ? 0 : -1}
          data-on={current === o.value ? '' : undefined}
          aria-checked={current === o.value ? 'true' : 'false'}
          onclick={() => set(o.value)}
          onkeydown={(e) => arrows(e, i, options.map((x) => x.value), set)}>{o.label}</button
        >
      {/each}
    </Segmented>
    {#if line}<p class="kpi-say" id={id(`${key}-line`)}>{line}</p>{/if}
  </div>
{/snippet}

<Sheet bind:open title={kept ? copy.kpiEditTitle(String(kpi?.fields.name ?? '')) : copy.kpiNewTitle} subtitle={suggested ? copy.kpiOnDraft(project.name) : copy.kpiOn(project.name)}>
  <form class="kpi-form" id={id('form')} novalidate onsubmit={save}>
    <Field id={id('name')} label={copy.kpiName} error={faults.name}>
      {#snippet children(c)}
        <div class="field">
          <input
            id={id('name')}
            class="field-input"
            type="text"
            autocomplete="off"
            enterkeyhint="done"
            maxlength="120"
            placeholder={copy.kpiNamePlaceholder}
            aria-describedby={c.describedBy}
            aria-invalid={c.invalid ? 'true' : undefined}
            bind:value={draft.name}
          />
        </div>
      {/snippet}
    </Field>

    <fieldset class="kpi-sources">
      <legend class="field-label">{copy.kpiSource}</legend>
      <div class="kpi-choices">
        {#each sourcesFor(draft) as s (s)}
          <label class="kpi-source" data-on={draft.source === s ? '' : undefined}>
            <input type="radio" name={id('source')} value={s} checked={draft.source === s} onchange={() => pickSource(s)} />
            <span class="kpi-source-words">
              <span class="kpi-source-title">{SOURCE_SAID[s].title}</span>
              <span class="kpi-source-line">{SOURCE_SAID[s].line()}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    {#if figure}
      <Field id={id('figure')} label={copy.kpiFigure} error={faults.figure}>
        {#snippet children(c)}
          <select
            id={id('figure')}
            class="kpi-select"
            aria-describedby={c.describedBy}
            aria-invalid={c.invalid ? 'true' : undefined}
            value={draft.figure}
            onchange={(e) => pickFigure(e.currentTarget.value)}
          >
            <option value="" disabled>{copy.kpiFigurePick}</option>
            {#each FIGURES as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
          </select>
        {/snippet}
      </Field>
    {/if}

    <!-- WHAT GOOD LOOKS LIKE: the figure and what it counts in side by side, the day beside them where there is room. -->
    <div class="kpi-goal">
      <Field id={id('target')} label={copy.kpiTarget} error={faults.target}>
        {#snippet children(c)}
          <div class="field">
            <input
              id={id('target')}
              class="field-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder={copy.kpiTargetPlaceholder}
              aria-describedby={c.describedBy}
              aria-invalid={c.invalid ? 'true' : undefined}
              bind:value={draft.target}
            />
          </div>
        {/snippet}
      </Field>
      <Field id={id('unit')} label={copy.kpiUnit} error={faults.unit}>
        {#snippet children(c)}
          <div class="field">
            <input
              id={id('unit')}
              class="field-input"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder={copy.kpiUnitPlaceholder}
              aria-describedby={c.describedBy}
              aria-invalid={c.invalid ? 'true' : undefined}
              value={draft.unit}
              oninput={(e) => {
                draft.unit = e.currentTarget.value;
                touch('unit');
              }}
            />
          </div>
        {/snippet}
      </Field>
      <div class="kpi-day">
        <Field id={id('target_by')} label={copy.kpiBy} error={faults.target_by}>
          {#snippet children(c)}
            <div class="field">
              <input
                id={id('target_by')}
                class="field-input"
                type="date"
                aria-describedby={c.describedBy}
                aria-invalid={c.invalid ? 'true' : undefined}
                bind:value={draft.target_by}
              />
            </div>
          {/snippet}
        </Field>
      </div>
    </div>

    <button type="button" class="kpi-more" aria-expanded={more} aria-controls={id('more')} onclick={() => (more = !more)}>
      <Icon name="chevronDown" size="s" />
      <span>{more ? copy.kpiFewer : copy.kpiMore}</span>
    </button>

    {#if more}
      <div class="kpi-rest" id={id('more')}>
        <Field id={id('measures')} label={copy.kpiMeasures}>
          {#snippet children(c)}
            <div class="field">
              <input id={id('measures')} class="field-input" type="text" autocomplete="off" maxlength="200" placeholder={copy.kpiMeasuresPlaceholder} aria-describedby={c.describedBy} bind:value={draft.measures} />
            </div>
          {/snippet}
        </Field>

        {#if !figure}
          <Field id={id('measure')} label={copy.kpiMeasure} help={copy.kpiMeasureHelp}>
            {#snippet children(c)}
              <div class="field">
                <input id={id('measure')} class="field-input" type="text" autocomplete="off" maxlength="120" placeholder={draft.name.trim() || copy.kpiNamePlaceholder} aria-describedby={c.describedBy} bind:value={draft.measure} />
              </div>
            {/snippet}
          </Field>
        {/if}

        {@render choose('good', copy.kpiGood, GOOD, draft.good, (v) => {
          draft.good = v as KpiGood;
          touch('good');
        })}

        {#if !figure}
          {@render choose(
            'every',
            copy.kpiEvery,
            everyFor(draft).map((v) => ({ value: v, label: EVERY_SAID[v] })),
            draft.every,
            (v) => {
              draft.every = v as KpiEvery;
              touch('every');
            },
            copy.kpiEveryHelp,
          )}

          <Field id={id('owner')} label={copy.kpiOwner}>
            {#snippet children(c)}
              <div class="field">
                <input
                  id={id('owner')}
                  class="field-input"
                  type="text"
                  autocomplete="off"
                  maxlength="80"
                  placeholder={copy.kpiOwnerPlaceholder}
                  aria-describedby={c.describedBy}
                  value={draft.owner}
                  oninput={(e) => {
                    draft.owner = e.currentTarget.value;
                    touch('owner');
                  }}
                />
              </div>
            {/snippet}
          </Field>
        {/if}

        {@render choose(
          'today',
          copy.kpiToday,
          TODAY.map((v) => ({ value: v, label: TODAY_SAID[v].label })),
          draft.today,
          (v) => (draft.today = v as KpiToday),
          TODAY_SAID[draft.today].line,
        )}

        <div class="kpi-switch">
          <span class="kpi-switch-words">
            <span class="kpi-switch-title" id={id('headline-label')}>{copy.kpiHeadline}</span>
            <span class="kpi-say" id={id('headline-line')}>{copy.kpiHeadlineLine(project.name)}</span>
          </span>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={draft.headline}
            aria-labelledby={id('headline-label')}
            aria-describedby={id('headline-line')}
            onclick={() => (draft.headline = !draft.headline)}><span class="switch-track"></span></button
          >
        </div>
      </div>
    {/if}

    {#if listsPast}
      <section class="kpi-past" aria-labelledby={id('past-head')}>
        <h3 class="field-label kpi-past-head" id={id('past-head')}>{copy.kpiPast}</h3>
        {#if pastFault}
          <p class="kpi-say">{copy.kpiPastNotRead}</p>
        {:else if past !== null && past.length === 0}
          <p class="kpi-say">{copy.kpiPastNone}</p>
        {:else if past !== null}
          <ul class="kpi-past-list">
            {#each past as p, i (p.seq)}
              {@const day = daySaid(p.at, recordNow())}
              {@const d = done.get(p.seq)}
              {@const by = who.get(p.seq)}
              <li class="kpi-past-row" data-out={d?.kind === 'removed' ? '' : undefined}>
                {#if editing === p.seq}
                  <div class="kpi-past-edit">
                    <Field id={id(`past-${String(p.seq)}`)} label={copy.kpiPastValueOn(day)} error={editFault}>
                      {#snippet children(c)}
                        <div class="field">
                          <input
                            id={id(`past-${String(p.seq)}`)}
                            class="field-input"
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            enterkeyhint="done"
                            aria-describedby={c.describedBy}
                            aria-invalid={c.invalid ? 'true' : undefined}
                            bind:value={editTyped}
                            onkeydown={(e) => pastKeys(e, p)}
                          />
                        </div>
                      {/snippet}
                    </Field>
                    <span class="kpi-past-acts">
                      <Button size="sm" disabled={busy} onclick={() => void changePast(p)}>{copy.kpiSave}</Button>
                      <Button size="sm" weight="bare" disabled={busy} onclick={() => (editing = null)}>{copy.kpiCancel}</Button>
                    </span>
                  </div>
                {:else}
                  <span class="kpi-past-words">
                    <span class="kpi-past-value">{said(p)}</span>
                    <span class="kpi-past-meta"
                      >{day}{#if by}{' · '}{copy.kpiPastBy(by)}{/if}{#if d?.kind === 'removed'}{' · '}{copy.kpiPastRemoved}{:else if d}{' · '}{copy.kpiPastChanged(said(d.before))}{/if}</span
                    >
                  </span>
                  <span class="kpi-past-acts">
                    {#if d}
                      <Button size="sm" weight="bare" disabled={busy} aria-label={copy.kpiPastPutBackOn(day)} onclick={() => void putBack(p)}>{copy.kpiPastPutBack}</Button>
                    {:else}
                      <Button size="sm" weight="bare" disabled={busy} aria-label={copy.kpiPastChangeOn(day)} onclick={() => void editPast(p)}>{copy.kpiPastChange}</Button>
                      <Button size="sm" weight="bare" disabled={busy} aria-label={i === 0 ? copy.kpiPastUndoOn(day) : copy.kpiPastRemoveOn(day)} onclick={() => void removePast(p)}
                        >{i === 0 ? copy.kpiPastUndo : copy.kpiPastRemove}</Button
                      >
                    {/if}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if kept && kpi?.fields.state !== 'retired'}
      <div class="kpi-stop">
        <Button weight="quiet" disabled={busy} onclick={() => void stop()}>{copy.kpiStop}</Button>
        <p class="kpi-say">{copy.kpiStopLine}</p>
      </div>
    {/if}
  </form>

  {#snippet footer()}
    {#if refused}<p class="kpi-refused" role="alert"><Icon name="alert" size="s" /><span>{refused}</span></p>{/if}
    <Button weight="quiet" disabled={busy} onclick={() => (open = false)}>{copy.kpiCancel}</Button>
    <Button weight="primary" type="submit" form={id('form')} disabled={busy}>{suggested ? copy.kpiKeep : kept ? copy.kpiSave : copy.kpiAdd}</Button>
  {/snippet}
</Sheet>

<style>
  /* NO CLASS HERE SHARES A NAME WITH THE BLOCK'S (`packages/skin/kinds/kpis.css`), which every page of blocks loads: the
     block's `.kpi-track` is its progress bar, 8 high, and the sheet's track of four choices took its height. */

  /* ONE COLUMN, 20 BETWEEN FIELDS, the sheet's own 16 round it. */
  .kpi-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    margin: 0;
  }

  .kpi-select {
    inline-size: 100%;
    font: inherit;
    font-size: var(--fs-body);
  }

  /* WHERE IT COMES FROM: a fieldset with no frame of its own, its choices one track. */
  .kpi-sources {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .kpi-sources legend {
    padding: 0 0 var(--sp-2);
  }

  /* THE SEGMENTED IDIOM STOOD ON END: the `--tile-2` track at the control's corner, 2 of padding, the chosen choice
     raised in `--segment-on` at the inner corner. */
  .kpi-choices {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
    background: var(--tile-2);
    border-radius: var(--r-field, 12px);
  }

  .kpi-source {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    border-radius: calc(var(--r-field, 12px) - 2px);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .kpi-source input {
    flex: none;
    margin: 2px 0 0;
  }

  .kpi-source[data-on] {
    background: var(--segment-on);
  }

  @media (hover: hover) and (pointer: fine) {
    .kpi-source:not([data-on]):hover {
      background: var(--row-wash, var(--hover));
    }
  }

  /* THE RING ONLY FOR THE KEYBOARD: a choice pressed with a pointer is said by its radio and its fill. */
  .kpi-source:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .kpi-source input:focus-visible {
    /* focus-ok: the choice's own row draws the ring above, inside the track. */
    outline: none;
  }

  .kpi-source-words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .kpi-source-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: calc(20px * var(--type, 1));
  }

  .kpi-source[data-on] .kpi-source-title {
    font-weight: var(--fw-semi);
  }

  .kpi-source-line {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* THE TARGET, ITS UNIT AND ITS DAY: three columns where the sheet is wide, the day on its own row on a phone. */
  .kpi-goal {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr);
    gap: var(--sp-3);
    align-items: start;
  }

  @media (width < 640px) {
    .kpi-goal {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .kpi-day {
      grid-column: 1 / -1;
    }
  }

  /* "MORE": a text button on the start edge, its chevron turning as it opens. 44 tall under a thumb. */
  .kpi-more {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    margin-block: calc(-1 * var(--sp-2));
    padding: 0 var(--sp-2);
    margin-inline-start: calc(-1 * var(--sp-2));
    background: none;
    border: 0;
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .kpi-more :global(svg) {
    transition: rotate var(--d-state) var(--ease-out);
  }

  .kpi-more[aria-expanded='true'] :global(svg) {
    rotate: 180deg;
  }

  @media (hover: hover) and (pointer: fine) {
    .kpi-more:hover {
      background: var(--row-wash, var(--hover));
      color: var(--ink);
    }
  }

  @media (pointer: coarse), (width < 640px) {
    .kpi-more {
      min-block-size: var(--tap);
    }
  }

  .kpi-rest {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* A CHOICE ON A TRACK IS LAID OUT AS A FIELD IS (`Field.svelte`): its label, 8, the track, 8, its line. */
  .kpi-pick {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .kpi-pick .field-label,
  .kpi-sources legend {
    margin-block-end: 0;
  }

  .kpi-pick :global(.segmented) {
    align-self: flex-start;
  }

  .kpi-say {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  /* THE LINE UNDER A TRACK IS A FIELD'S HELP LINE, in its size and ink. */
  .kpi-pick .kpi-say {
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  /* ONE SWITCH ROW: its title and line, the switch at the end. */
  .kpi-switch {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .kpi-switch-words {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .kpi-switch-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
  }

  .kpi-stop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* ITS PAST VALUES: a heading as a field's label, then a row a value, its figure over its day and who set it at the
     start and its presses at the end. One taken out is drawn faint and struck through until it is put back. */
  .kpi-past {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .kpi-past-head {
    margin: 0;
  }

  .kpi-past-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kpi-past-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h);
    padding-block: var(--sp-2);
  }

  .kpi-past-row + .kpi-past-row {
    border-block-start: 1px solid var(--rule);
  }

  .kpi-past-words {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .kpi-past-value {
    color: var(--ink);
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
    font-weight: var(--fw-medium);
  }

  .kpi-past-meta {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kpi-past-row[data-out] .kpi-past-value {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  .kpi-past-acts {
    display: flex;
    flex: none;
    gap: var(--sp-1);
  }

  /* CHANGING ONE: the box takes the row, its two presses beside it where there is room and under it on a phone. */
  .kpi-past-edit {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
  }

  .kpi-past-edit > :global(:first-child) {
    flex: 1 1 160px;
    min-inline-size: 0;
  }

  @media (pointer: coarse), (width < 640px) {
    .kpi-past-row {
      min-block-size: var(--tap);
    }
  }

  .kpi-refused {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
  }

  .kpi-refused :global(svg) {
    flex: none;
    margin-block-start: 0.2em;
  }

  @media (prefers-reduced-motion: reduce) {
    .kpi-more :global(svg) {
      transition: none;
    }
  }
</style>
