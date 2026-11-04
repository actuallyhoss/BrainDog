<!--
  The inspector: a form for the card the canvas has open, in the docked `Panel`: beside the canvas from
  900px up, so the card being edited stays in view and its sentence changes as the fields do, and a bottom sheet on a
  phone. The canvas narrows beside it and never goes under it (`--dock-w`), the way Work's list does.

  THE PANEL IS NOT MODAL, SO THE FOCUS IS PUT IN IT. A sheet put the caret in its first field by opening over the page;
  the docked panel leaves focus where it was, which is right for a list read beside it and wrong for a form somebody
  opened to fill. So opening a card puts the caret in its first field, as the sheet did (Rename lands in the name), and
  closing it hands focus back to the card it was about, so a keyboard is never left at the top of the document.

  A FORM, NEVER CODE (§6). Every argument is a field with a label, drawn from `ARGS` in `flow.ts`, so there is one list
  of what each verb takes and the menu, the card's sentence, the fault list and this form all read it. A template is
  filled from chips, the answers the steps before can certainly read and what the trigger hands a run, and each one sits
  in the text as a pill (`Tokens.svelte`), so nobody types or reads braces; a condition is the query builder over the
  record's `where` tree, rows joined by all, any or none, or the sentence every list and block already speaks
  (`Condition.svelte`).

  EVERY KEYSTROKE GOES INTO THE DRAFT, AND NOTHING LEAVES IT. The sheet has no Save of its own: the draft is sent whole
  from the editor's footer, once, so closing this is never a question of whether something was lost.

  PICKED, NEVER TYPED, WHERE THE RECORD ALREADY HOLDS THE ANSWER. "In the
  list" was a box with `obligations` as its placeholder, "The declared call" a box hinting `gold_rate`, and a channel or
  a day was printed as its stored value; a stranger does not know any of those names, and a guess faulted on Send.
  Each is now a choice read from the record, and this sheet does the reading itself so the page's file stays the
  page's: the lists from the shell's `lists` (every list, empty ones too, which is the list `boot-live.ts` keeps for
  anything that puts something INTO a list; the rail's `index.registers` leaves out a list with no rows yet, and a
  new list is the likeliest one to automate), a list's fields through the tab's record source, the declared calls through
  `openActions` as the page does for its call lines, and the doors through `listDoors` as Settings does. A read that
  does not answer leaves the box as it was, so a record that cannot say is no worse off than before.

  THE FIELDS ARE THE LIST'S OWN DECLARATION. Once the page handed in the fields and they reached no real record, so the
  chips offered nothing from the row and "the invoice's amount" could only be typed as braces. The sheet asks the
  record for the list's declaration itself, and a record that cannot say offers no fields rather than wrong ones. The
  record checks a condition when the automation is sent.

  EVERY TRIGGER AND STEP THE RECORD RUNS HAS ITS FIELDS HERE. A figure crossing a line and a decision taken on
  Needs you are offered beside the four that were (`flow.ts` `TRIGGER_KINDS`, read from the kernel's capability table); a
  clock says how late a turn may still be taken; a script is picked from the installed ones, a person asked from the
  record's members, and a call from the declared ones with the way to declare another. A template's references are
  pills (`Tokens.svelte`) and a condition is the query builder over the record's `where` tree (`Condition.svelte`).
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { Predicate } from '@braindog/where';
  import { tick } from 'svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { open as openRecord } from '$lib/data/record.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  import { readNames } from '$lib/record/history-live.ts';
  import { callerAt, listDoors, type Door } from '$lib/ui/webhook-doors.ts';
  import {
    argsFor,
    CHANNELS,
    CONDITION_HINT,
    DAYS,
    LATE_SPANS,
    SLASH_SHAPES,
    SLASH_SHAPE_WORDS,
    TRIGGER_KINDS,
    VERB_LABELS,
    answerFields,
    blankTrigger,
    unbrace,
    conditionOf,
    find,
    getAt,
    learnScripts,
    listFrom,
    listText,
    pairsFrom,
    pairsText,
    sayTrigger,
    setAt,
    slashAbout,
    slashSendable,
    slashShape,
    spanWords,
    toggleSlashAbout,
    triggerChips,
    triggerKind,
    varsBefore,
    verbOf,
    withSlashShape,
    words,
    type Arg,
    type CondField,
    type SlashShape,
    type Trigger,
    type TriggerKind,
  } from './flow.ts';
  import { openActions, whatOf, type ActionRow } from '$lib/record/actions.ts';
  import { CLOCKS, MONTHS, MONTH_DAYS, MONTH_WORDS, andWords, clockTo, clockWords, dayWords, fallsIn, monthsOf, type ClockWas } from './calendar.ts';
  import { CHANNEL_WORDS, DAY_WORDS, doorsPickable, groupChips, idWords, pickerOf, withCurrent, type Picker } from './chips.ts';
  import { grammarNow, grammarState } from './grammar.ts';
  import Condition from './Condition.svelte';
  import Tokens from './Tokens.svelte';
  import type { FlowDraft } from './flow.svelte.ts';

  let { flow }: { flow: FlowDraft } = $props();

  const open = $derived(flow.selected !== null);
  const isTrigger = $derived(flow.selected === 'trigger');
  const found = $derived(flow.selected && !isTrigger ? find(flow.draft.steps, flow.selected) : null);
  const verb = $derived(found ? verbOf(found.node.step) : null);
  const t = $derived(flow.draft.trigger);
  const kind = $derived(triggerKind(t));
  const register = $derived('written' in t ? t.written.register : '');

  const title = $derived(isTrigger ? words.trigger : verb ? VERB_LABELS[verb] : words.edit);
  /* A LIST BY THE NAME THE RAIL GIVES IT, never its id, as the picker under this line already offers it. */
  const listSaid = (id: string): string => lists.find((l) => l.id === id)?.name ?? id;
  const subtitle = $derived(isTrigger ? sayTrigger(t, listSaid) : undefined);

  /* ── the focus, which a docked panel does not move by itself ──────────── */

  let body = $state<HTMLElement>();

  /* THE CARET IN THE FIRST FIELD each time a card is opened, once the panel has shown and handed focus back to what
     opened it (`Panel.svelte` does that for a list beside it). A frame later, so it lands after that. */
  $effect(() => {
    const key = flow.selected;
    if (key === null) return;
    void tick().then(() =>
      requestAnimationFrame(() => {
        if (flow.selected !== key) return;
        body?.querySelector<HTMLElement>('input, select, textarea, [contenteditable]:not([contenteditable="false"])')?.focus();
      }),
    );
  });

  /** Close the panel and give focus back to the card it was about, when the close left it nowhere. */
  function shut() {
    const key = flow.selected;
    flow.select(null);
    if (key === null) return;
    void tick().then(() => {
      const at = document.activeElement;
      if (at && at !== document.body) return;
      const card = key === 'trigger' ? '.trigger' : `[data-flow-card][data-key="${CSS.escape(key)}"] .say`;
      document.querySelector<HTMLElement>(card)?.focus();
    });
  }

  /* ── what the record holds, read when the sheet needs it ────────────────── */

  const live = $derived(Boolean(page.data.live));
  const lists = $derived<readonly { id: string; name: string }[]>(page.data.lists ?? page.data.index?.registers ?? []);

  /* A LIST'S FIELDS, BY LIST, ASKED ONCE A LIST IS PICKED, WITH THEIR TYPES. The query builder offers each field the
     tests its type can hold, so the ids alone (`schemaOf`, which this read before) are not enough; the tab's one source
     (`lib/data/record.ts`) keeps its answer for the tab and forgets a refusal, so a list that would not say is asked
     again next time. */
  let declaredFields = $state<Record<string, readonly FieldDecl[]>>({});
  $effect(() => {
    const r = register;
    if (!open || !live || r === '' || Object.hasOwn(declaredFields, r)) return;
    void openRecord()
      .then((s) => s.schema(r))
      .then((d) => {
        if (d.ok) declaredFields = { ...declaredFields, [r]: d.value.fields };
      })
      .catch(() => undefined);
  });
  const typedFields = $derived<readonly FieldDecl[]>(register === '' ? [] : (declaredFields[register] ?? []));
  const rowFields = $derived(typedFields.map((f) => f.id));
  const condFields = $derived<readonly CondField[]>(typedFields);

  /* ── the pickers each trigger and step reads, each asked once per sheet, each keeping its box when refused ── */

  const client = () => createClient({ base: apiBase() });

  /* THE INSTALLED SCRIPTS A RUN MAY START: `startScript` in `packages/kernel/src/flow.ts` fails a run on a script that
     does not say `runs: { rule: true }`, so only those are offered. */
  let scripts = $state<{ id: string; name: string }[] | null>(null);
  $effect(() => {
    if (!open || !live || scripts !== null || verb !== 'script') return;
    scripts = [];
    void client()
      .scripts()
      .then((out) => {
        if (out.ok) learnScripts(out.value);
        scripts = out.ok ? out.value.filter((s) => s.runs.rule).map((s) => ({ id: s.script, name: s.title || idWords(s.script) })) : [];
      })
      .catch(() => undefined);
  });

  /* THE MEMBERS, BY THE ID THE RECORD HOLDS FOR EACH, which is what `to:` takes; their names from the shell's answer
     (`readNames`), so a member who may not read People gets an empty list and keeps the box. */
  let members = $state<{ id: string; name: string }[] | null>(null);
  $effect(() => {
    if (!open || !live || members !== null || verb !== 'ask_person') return;
    members = [];
    void readNames(apiBase())
      .then((names) => {
        members = [...names].map(([id, name]) => ({ id, name }));
      })
      .catch(() => undefined);
  });

  /* THE FIGURES A RULE MAY WATCH: every one the caller reads, whichever pack declared it. A figure read about one thing
     (`param`) is asked as `<id>:<value>` and the sweep reads a bare id, so those are not offered. */
  let figures = $state<{ id: string; name: string }[] | null>(null);
  $effect(() => {
    if (!open || !live || figures !== null || !('metric' in t)) return;
    figures = [];
    void client()
      .figures()
      .then((out) => {
        figures = out.ok ? out.value.filter((f) => !f.param).map((f) => ({ id: f.id, name: f.name })) : [];
      })
      .catch(() => undefined);
  });

  /* THE AUTOMATIONS THAT CAN PUT A QUESTION ON DECIDE, for a decision trigger's `about:`, named as the list names them. */
  let rules = $state<{ id: string; name: string }[] | null>(null);
  $effect(() => {
    if (!open || !live || rules !== null || !('decided' in t)) return;
    rules = [];
    void client()
      .automations()
      .then((out) => {
        rules = out.ok ? out.value.filter((r) => r.rule !== flow.draft.id).map((r) => ({ id: `rule.${r.rule}`, name: r.name || idWords(r.rule) })) : [];
      })
      .catch(() => undefined);
  });

  /* THE DECLARED CALLS A RULE MAY START: `callFault` in `packages/kernel/src/flow-lint.ts` refuses anything that is not
     channel `call`, so a fetch or a watch is not offered only to be refused in Needs you. Read once per sheet. */
  let calls = $state<ActionRow[] | null>(null);
  $effect(() => {
    if (!open || calls !== null || (verb !== 'call' && verb !== 'run')) return;
    calls = [];
    void openActions((url, init) => fetch(url, init), apiBase()).then((out) => {
      calls = out.first.ok ? out.first.value.filter((a) => a.channel === 'call') : [];
    });
  });
  const callOptions = $derived((calls ?? []).map((a) => ({ id: a.ingest, name: idWords(a.ingest) })));

  /* THE DOORS, WHICH ARE AN OWNER'S READ. Anybody else is refused, and keeps the box.
     They are webhooks only, so the picker waits for the arrival to say it comes by webhook (`chips.ts` `doorsPickable`). */
  let doors = $state<Door[] | null>(null);
  $effect(() => {
    if (!open || !live || doors !== null || !('arrival' in t)) return;
    doors = [];
    void listDoors(callerAt(apiBase())).then((l) => {
      doors = l.kind === 'doors' ? l.doors : [];
    });
  });

  const PICK: Record<Picker, string> = {
    list: 'Pick where it goes',
    call: 'Pick a call',
    field: 'Pick a field',
    script: words.inspect.pickScript,
    member: words.inspect.pickMember,
  };
  function optionsFor(p: Picker): readonly { id: string; name: string }[] {
    if (p === 'list') return lists;
    if (p === 'call') return callOptions;
    if (p === 'script') return scripts ?? [];
    if (p === 'member') return members ?? [];
    return rowFields.map((f) => ({ id: f, name: f }));
  }

  /** Template chips: what the trigger hands a run, then the answers kept before this card, under where each comes from. */
  const earlier = $derived(found ? varsBefore(flow.draft.steps, found.node.key) : []);
  const chips = $derived(found ? groupChips([...triggerChips(t, rowFields), ...earlier]) : []);

  /* A BRANCH'S CONDITION READS THE ROW'S FIELDS AND THE ANSWERS KEPT BEFORE IT BY THEIR BARE NAMES, `rate is more than
     70`, over one schema in which a field of the row wins over an answer of the same name (`test` in
     `packages/kernel/src/flow.ts`), so the builder is handed them in that order, the row's first and each name once. */
  const branchFields = $derived.by((): readonly CondField[] => {
    if (!found) return [];
    const own = 'written' in t ? condFields : [];
    const taken = new Set(own.map((f) => f.id));
    return [...own, ...answerFields(flow.draft.steps, found.node.key).filter((f) => !taken.has(f.id))];
  });

  /* ── one argument ─────────────────────────────────────────────────────── */

  const pathKey = (a: Arg) => a.path.join('.');
  const idOf = (a: Arg) => `flow-arg-${pathKey(a)}`;

  function valueOf(a: Arg): unknown {
    return found ? getAt(found.node.step, a.path) : undefined;
  }

  function textOf(a: Arg): string {
    const v = valueOf(a);
    if (a.kind === 'list') return listText(v);
    if (a.kind === 'pairs') return pairsText(v);
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  }

  function write(a: Arg, text: string) {
    if (!found) return;
    const v =
      a.kind === 'list' ? listFrom(text) : a.kind === 'pairs' ? pairsFrom(text) : a.kind === 'number' ? Math.max(0, Math.floor(Number(text) || 0)) : text;
    /* AN OPTIONAL ARGUMENT LEFT EMPTY IS LEFT OUT, not written as ''. `call.as: ''` is refused by the lint as a bad name,
       where no `as` at all is a call whose answer is not kept, which is what an empty box meant. */
    const drop = !a.required && typeof v === 'string' && v.trim() === '';
    const step = drop ? dropAt(found.node.step, a.path) : setAt(found.node.step, a.path, v);
    flow.setStep(found.node.key, step);
  }

  function dropAt(step: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
    const head = path.slice(0, -1);
    const last = path[path.length - 1]!;
    const parent = getAt(step, head);
    if (parent === null || typeof parent !== 'object') return step;
    const { [last]: _gone, ...rest } = parent as Record<string, unknown>;
    return head.length === 0 ? rest : setAt(step, head, rest);
  }

  /** `create`'s fields as rows, in the order written. A value that is not text is shown as the JSON it is. */
  function pairsOf(a: Arg): [string, string][] {
    const v = valueOf(a);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return [];
    return Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)]);
  }

  /* THE ROWS WRITTEN BACK WHOLE, in their order. A second row with a name already used takes its place, as
     `pairsFrom` read one; a row with no name yet is kept as '' so its box stays on the screen while it is typed. */
  function setPairs(a: Arg, rows: readonly (readonly string[])[]) {
    if (!found) return;
    const out: Record<string, string> = {};
    for (const [k = '', v = ''] of rows) out[k] = v;
    flow.setStep(found.node.key, setAt(found.node.step, a.path, out));
  }

  /* ── what Slash answers, and what goes with the question ──────────────── */

  /* THE ARGUMENTS THAT MEAN SOMETHING NOW. `choices` is drawn only while the answer is a choice (`Arg.when`), so a
     person switching to "A number" is not left holding a list the lint would refuse. */
  /* The form is drawn again when the record's answer arrives. */
  /* THE TAB'S GRAMMAR, FOLLOWED BY ITS OWN SUBSCRIPTION and not `$grammarState`: Svelte's store helpers would go into
     the runtime every screen loads (the entry budget). */
  let read = $state.raw(grammarNow());
  $effect(() => grammarState.subscribe((s) => (read = s)));
  const grammar = $derived(read.state === 'ready' ? read.grammar : null);
  const args = $derived(found && verb ? argsFor(verb, grammar).filter((a) => !a.when || a.when(found.node.step)) : []);

  const shape = $derived<SlashShape>(found ? slashShape(found.node.step) : 'text');
  function setShape(s: SlashShape) {
    if (found && s !== shape) flow.setStep(found.node.key, withSlashShape(found.node.step, s));
  }

  /* THE FIELDS OFFERED ARE THE LIST'S OWN, less what never leaves the record. A field already sent that the list no
     longer offers stays, so it can be taken out rather than kept unseen. */
  const about = $derived(found ? slashAbout(found.node.step) : []);
  const aboutOptions = $derived.by(() => {
    const offered = slashSendable(typedFields);
    return [...offered, ...about.filter((f) => !offered.includes(f))];
  });
  const fieldWord = (id: string) => typedFields.find((f) => f.id === id)?.label ?? idWords(id);
  function toggleAbout(field: string) {
    if (found) flow.setStep(found.node.key, toggleSlashAbout(found.node.step, field));
  }

  /* ── a condition ──────────────────────────────────────────────────────── */

  /** A branch's condition, in whichever form `Condition.svelte` hands back. An emptied one is `''`, which the card faults. */
  function setIf(next: string | Predicate | null) {
    if (found) flow.setStep(found.node.key, { if: next ?? '' });
  }

  /*
   * THE TRIGGER'S CONDITION, EITHER FORM: `flow.setCondition` marks the undo and files whichever one the
   * editor is holding, sentence, tree or nothing, through `withCondition`, which keeps one form at a time.
   */
  function setWhenOf(next: string | Predicate | null) {
    flow.setCondition(next);
  }

  /* ── the trigger ──────────────────────────────────────────────────────── */

  /* THE CONDITION GOES WITH A CHANGE OF KIND, both forms of it, through `setTrigger` and `withTrigger` in `flow.ts`. */
  function pick(k: TriggerKind) {
    if (k === kind) return;
    flow.setTrigger(blankTrigger(k, t));
  }

  function setMetric(patch: { id?: string; crosses?: 'target' | { lte: number } | { gte: number } }) {
    if (!('metric' in t)) return;
    flow.setTrigger({ metric: { ...t.metric, ...patch } });
  }

  const CROSSINGS = [
    ['target', words.inspect.crossTarget],
    ['gte', words.inspect.crossUp],
    ['lte', words.inspect.crossDown],
  ] as const;

  /** Which way the figure crosses, and the line: its target, or a number it reaches or falls to. */
  const crossing = $derived<'target' | 'gte' | 'lte'>(!('metric' in t) || t.metric.crosses === 'target' ? 'target' : 'gte' in t.metric.crosses ? 'gte' : 'lte');
  const lineOf = $derived(!('metric' in t) || t.metric.crosses === 'target' ? 0 : 'gte' in t.metric.crosses ? t.metric.crosses.gte : t.metric.crosses.lte);
  function setCrossing(way: 'target' | 'gte' | 'lte', line: number) {
    setMetric({ crosses: way === 'target' ? 'target' : way === 'gte' ? { gte: line } : { lte: line } });
  }
  /** A typed line, read as decimal digits only: "0x10" is not 16, and a half-typed "-" keeps the old line. */
  function lineFrom(text: string): number | null {
    return /^-?\d+(?:\.\d+)?$/u.test(text.trim()) ? Number(text.trim()) : null;
  }

  function setDecided(patch: Record<string, string>) {
    if (!('decided' in t)) return;
    const next: Record<string, string> = { ...t.decided };
    for (const [k, v] of Object.entries(patch)) {
      if (v.trim() === '') delete next[k];
      else next[k] = v;
    }
    flow.setTrigger({ decided: next });
  }

  function setWritten(patch: Partial<{ register: string; op: ('create' | 'update' | 'delete')[] | undefined }>) {
    if (!('written' in t)) return;
    const next = { ...t.written, ...patch };
    if (next.op === undefined || next.op.length === 0) delete next.op;
    flow.setTrigger({ written: next } as Trigger);
  }

  function toggleOp(op: 'create' | 'update' | 'delete') {
    if (!('written' in t)) return;
    const had = t.written.op ?? [];
    setWritten({ op: had.includes(op) ? had.filter((o) => o !== op) : [...had, op] });
  }

  function setArrival(patch: Record<string, string>) {
    if (!('arrival' in t)) return;
    const next: Record<string, unknown> = { ...t.arrival };
    for (const [k, v] of Object.entries(patch)) {
      if (v === '') delete next[k];
      else next[k] = v;
    }
    flow.setTrigger({ arrival: next } as Trigger);
  }

  /* A CLOCK IS WRITTEN WHOLE FROM THE CLOCK IT WAS, through `calendar.ts`. This went through `clockOf`, which keeps a
     day for a week alone, so a monthly rule opened here lost its day and its month the moment any clock was picked,
     and had no field for either to put them back. `month` is read loosely because `Trigger` does not spell it yet. */
  const clock = $derived<ClockWas>('every' in t ? t : {});
  const months = $derived(clock.every === undefined ? null : monthsOf(clock.every));

  function setClock(patch: ClockWas) {
    if ('every' in t) flow.setTrigger(clockTo(patch.every ?? t.every, { ...clock, ...patch }));
  }

  const OPS = [
    ['create', 'Added'],
    ['update', 'Changed'],
    ['delete', 'Deleted'],
  ] as const;
</script>

<Panel {open} {title} shows={flow.selected} onclose={shut}>
  {#snippet verbs()}
    {#if found}
      <!-- WORDS IN INK, NOT RED: a destructive verb is its words, and Undo in the footer takes it back. -->
      <Button weight="bare" size="sm" tone="bad" onclick={() => found && flow.remove(found.node.key)}>{words.remove}</Button>
    {/if}
  {/snippet}
  <div class="inspect" bind:this={body}>
    {#if subtitle}<p class="lede">{subtitle}</p>{/if}
    {#if isTrigger}
      <div class="form">
        <label class="label" for="flow-name">{words.name}</label>
        <div class="field">
          <input id="flow-name" class="field-input" value={flow.draft.name} placeholder={words.untitled} oninput={(e) => flow.setName(e.currentTarget.value)} />
        </div>

        <p class="label" id="flow-kind">{words.trigger}</p>
        <Segmented class="kinds" role="group" aria-labelledby="flow-kind">
          {#each TRIGGER_KINDS as k (k)}
            <button type="button" class="segment" aria-pressed={kind === k} data-on={kind === k ? '' : undefined} onclick={() => pick(k)}>{words.kinds[k]}</button>
          {/each}
        </Segmented>
        <p class="help">{words.triggerHelp[kind] ?? sayTrigger(t, listSaid)}</p>

        {#if 'written' in t}
          <label class="label" for="flow-register">In the list</label>
          {#if lists.length > 0}
            <select id="flow-register" class="select" value={t.written.register} onchange={(e) => setWritten({ register: e.currentTarget.value })}>
              {#if t.written.register === ''}<option value="" disabled>{PICK.list}</option>{/if}
              {#each withCurrent(lists, t.written.register) as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
            </select>
          {:else}
            <div class="field">
              <input id="flow-register" class="field-input" value={t.written.register} spellcheck="false" oninput={(e) => setWritten({ register: e.currentTarget.value.trim() })} />
            </div>
          {/if}
          <p class="label" id="flow-ops">When an item is</p>
          <Segmented many role="group" aria-labelledby="flow-ops">
            {#each OPS as [op, label] (op)}
              {@const on = (t.written.op ?? []).includes(op)}
              <button type="button" class="segment" aria-pressed={on} data-on={on ? '' : undefined} onclick={() => toggleOp(op)}>{label}</button>
            {/each}
          </Segmented>
          <p class="help">{(t.written.op ?? []).length === 0 ? 'None picked is added or changed.' : ''}</p>
          <p class="label" id="flow-when-label">{words.condition}</p>
          <Condition
            id="flow-when"
            labelledby="flow-when-label"
            value={conditionOf(flow.draft)}
            fields={condFields}
            register={t.written.register}
            hint={CONDITION_HINT}
            onchange={setWhenOf}
          />
        {:else if 'arrival' in t}
          <label class="label" for="flow-ingest">At the door</label>
          {#if doors && doors.length > 0 && doorsPickable(t.arrival.channel)}
            <select id="flow-ingest" class="select" value={t.arrival.ingest ?? ''} onchange={(e) => setArrival({ ingest: e.currentTarget.value })}>
              <option value="">Any door</option>
              {#each withCurrent(doors, t.arrival.ingest ?? '') as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
            </select>
          {:else}
            <div class="field">
              <input id="flow-ingest" class="field-input" value={t.arrival.ingest ?? ''} placeholder="Any door" spellcheck="false" oninput={(e) => setArrival({ ingest: e.currentTarget.value.trim() })} />
            </div>
          {/if}
          <label class="label" for="flow-channel">By</label>
          <select id="flow-channel" class="select" value={t.arrival.channel ?? ''} onchange={(e) => setArrival({ channel: e.currentTarget.value })}>
            <option value="">Any way</option>
            {#each CHANNELS as c (c)}<option value={c}>{CHANNEL_WORDS[c] ?? c}</option>{/each}
          </select>
          <!-- AN ARRIVAL'S CONDITION IS READ OVER THE FIRST ROW IT WROTE, or the top-level keys of its body where it wrote
               none (contracts, arrival `when:`). Neither has fields the sheet can list before anything arrives, so it is
               written in words and the record checks it. -->
          <p class="label" id="flow-when-label">{words.condition}</p>
          <Condition id="flow-when" labelledby="flow-when-label" value={conditionOf(flow.draft)} fields={[]} register="" hint={CONDITION_HINT} onchange={setWhenOf} />
        {:else if 'metric' in t}
          <label class="label" for="flow-figure">{words.inspect.figure}</label>
          {#if figures && figures.length > 0}
            <select id="flow-figure" class="select" value={t.metric.id} onchange={(e) => setMetric({ id: e.currentTarget.value })}>
              {#if t.metric.id === ''}<option value="" disabled>{words.inspect.pickFigure}</option>{/if}
              {#each withCurrent(figures, t.metric.id) as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
            </select>
          {:else}
            <div class="field">
              <input id="flow-figure" class="field-input" value={t.metric.id} spellcheck="false" oninput={(e) => setMetric({ id: e.currentTarget.value.trim() })} />
            </div>
          {/if}
          <p class="label" id="flow-crosses">{words.inspect.crosses}</p>
          <Segmented role="group" aria-labelledby="flow-crosses">
            {#each CROSSINGS as [way, label] (way)}
              <button type="button" class="segment" aria-pressed={crossing === way} data-on={crossing === way ? '' : undefined} onclick={() => setCrossing(way, lineOf)}>{label}</button>
            {/each}
          </Segmented>
          {#if crossing !== 'target'}
            <label class="label" for="flow-line">{words.inspect.line}</label>
            <div class="field">
              <input
                id="flow-line"
                class="field-input"
                inputmode="decimal"
                value={String(lineOf)}
                oninput={(e) => {
                  const n = lineFrom(e.currentTarget.value);
                  if (n !== null) setCrossing(crossing, n);
                }}
              />
            </div>
            <p class="help">{words.inspect.lineHelp}</p>
          {/if}
        {:else if 'decided' in t}
          <label class="label" for="flow-about">{words.inspect.about}</label>
          {#if rules && rules.length > 0}
            <select id="flow-about" class="select" value={t.decided.about ?? ''} onchange={(e) => setDecided({ about: e.currentTarget.value })}>
              <option value="">{words.inspect.anyQuestion}</option>
              {#each withCurrent(rules, t.decided.about ?? '') as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            </select>
          {:else}
            <div class="field">
              <input
                id="flow-about"
                class="field-input"
                value={t.decided.about ?? ''}
                placeholder={words.inspect.anyQuestion}
                spellcheck="false"
                oninput={(e) => setDecided({ about: e.currentTarget.value.trim() })}
              />
            </div>
          {/if}
          <label class="label" for="flow-option">{words.inspect.option}</label>
          <div class="field">
            <input id="flow-option" class="field-input" value={t.decided.option ?? ''} placeholder={words.inspect.anyAnswer} oninput={(e) => setDecided({ option: e.currentTarget.value })} />
          </div>
          <p class="help">{words.inspect.optionHelp}</p>
        {:else if 'every' in t}
          <label class="label" for="flow-every">How often</label>
          <select id="flow-every" class="select" value={t.every} onchange={(e) => setClock({ every: e.currentTarget.value })}>
            {#each CLOCKS as e (e)}<option value={e}>{clockWords(e)}</option>{/each}
            {#if !CLOCKS.includes(t.every)}<option value={t.every}>{clockWords(t.every)}</option>{/if}
          </select>
          {#if months !== null}
            <!-- THE MONTH, THEN THE DAY, THEN THE TIME, so the fields read down as the rule is said: every 3 months from
                 January, on the 1st, at 09:00. Each is required by the lint and none is left blank (`calendar.ts`). -->
            {#if months > 1}
              {@const month = typeof clock.month === 'string' ? clock.month : 'jan'}
              <label class="label" for="flow-month">{months === 12 ? 'In' : 'Starting in'}</label>
              <select id="flow-month" class="select" value={month} onchange={(e) => setClock({ month: e.currentTarget.value })}>
                {#each MONTHS as m (m)}<option value={m}>{MONTH_WORDS[m]}</option>{/each}
              </select>
              {#if months < 12}<p class="help">Runs in {andWords(fallsIn(t.every, month))}.</p>{/if}
            {/if}
            <label class="label" for="flow-date">On the</label>
            <select id="flow-date" class="select" value={String(clock.day ?? 1)} onchange={(e) => setClock({ day: e.currentTarget.value === 'last' ? 'last' : Number(e.currentTarget.value) })}>
              {#each MONTH_DAYS as d (d)}<option value={String(d)}>{dayWords(d)}</option>{/each}
            </select>
            {#if typeof clock.day === 'number' && clock.day > 28}<p class="help">A month with fewer days runs on its last day.</p>{/if}
            <label class="label" for="flow-at">At</label>
            <div class="field">
              <!-- A CLEARED TIME IS NOT WRITTEN: the record refuses a monthly clock with no `at:`, and the time it had is kept. -->
              <input id="flow-at" class="field-input" type="time" required value={t.at ?? ''} oninput={(e) => e.currentTarget.value !== '' && setClock({ at: e.currentTarget.value })} />
            </div>
          {:else if t.every === '1d' || t.every === '1w'}
            <label class="label" for="flow-at">At</label>
            <div class="field">
              <input id="flow-at" class="field-input" type="time" value={t.at ?? ''} oninput={(e) => setClock({ at: e.currentTarget.value })} />
            </div>
            {#if t.every === '1w' && t.at}
              <label class="label" for="flow-day">On</label>
              <select id="flow-day" class="select" value={t.day ?? 'mon'} onchange={(e) => setClock({ day: e.currentTarget.value })}>
                {#each DAYS as d (d)}<option value={d}>{DAY_WORDS[d] ?? d}</option>{/each}
              </select>
            {/if}
          {/if}
          <!-- HOW LATE A TURN MAY STILL BE TAKEN, kept across every pick of how often (`calendar.ts` `clockTo`). A host that
               was asleep past it records the turn as skipped with its sentence, rather than running a morning report at
               night. -->
          <label class="label" for="flow-late">{words.inspect.late}</label>
          <select id="flow-late" class="select" value={t.late ?? ''} onchange={(e) => setClock({ late: e.currentTarget.value })}>
            <option value="">{words.inspect.neverLate}</option>
            {#each LATE_SPANS as s (s)}<option value={s}>{words.inspect.lateBy(spanWords(s))}</option>{/each}
            {#if t.late && !(LATE_SPANS as readonly string[]).includes(t.late)}<option value={t.late}>{words.inspect.lateBy(spanWords(t.late))}</option>{/if}
          </select>
          {#if t.late}<p class="help">{words.inspect.lateHelp}</p>{/if}
        {/if}

        <p class="path">{flow.path === 'inline' ? words.inline : words.asRun}</p>
      </div>
    {:else if found && verb}
      <div class="form">
        {#each args as a (pathKey(a))}
          {#if a.kind === 'shape'}
            <p class="label" id="{idOf(a)}-label">{a.label}</p>
            <Segmented class="fill" id={idOf(a)} role="group" aria-labelledby="{idOf(a)}-label">
              {#each SLASH_SHAPES as s (s)}
                <button type="button" class="segment" aria-pressed={shape === s} data-on={shape === s ? '' : undefined} onclick={() => setShape(s)}>{SLASH_SHAPE_WORDS[s]}</button>
              {/each}
            </Segmented>
          {:else if a.kind === 'fields'}
            <!-- PICKED, AS THE LIST'S FIELDS ARE PICKED EVERYWHERE ELSE ON THIS SHEET: `about:` holds field ids, which
                 nobody should have to type, and each is pressed in or out as a list's changes are. -->
            <p class="label" id="{idOf(a)}-label">{a.label}</p>
            {#if aboutOptions.length > 0}
              <Segmented many id={idOf(a)} role="group" aria-labelledby="{idOf(a)}-label">
                {#each aboutOptions as f (f)}
                  {@const on = about.includes(f)}
                  <button type="button" class="segment" aria-pressed={on} data-on={on ? '' : undefined} onclick={() => toggleAbout(f)}>{fieldWord(f)}</button>
                {/each}
              </Segmented>
              <p class="help">{words.inspect.aboutHelp}</p>
            {:else}
              <p class="help">{words.inspect.aboutNone}</p>
            {/if}
          {:else if a.kind === 'condition'}
            <p class="label" id="{idOf(a)}-label">{a.label}</p>
            <Condition
              id={idOf(a)}
              labelledby="{idOf(a)}-label"
              value={valueOf(a)}
              fields={branchFields}
              register={register === '' ? 'vars' : register}
              hint={a.hint}
              onchange={setIf}
            />
          {:else}
            {@const picks = pickerOf(verb, a.path, a.from)}
            {@const options = picks ? optionsFor(picks) : []}
            {#if a.template && (a.kind === 'text' || a.kind === 'long' || a.kind === 'pairs')}
              <p class="label" id="{idOf(a)}-label">{a.label}</p>
            {:else}
              <label class="label" for={idOf(a)}>{a.label}</label>
            {/if}
            {#if picks === 'member'}
              <!-- THE OWNER IS THE EMPTY CHOICE, which leaves `to:` out: the question is then the owner's, as it was before
                   a question could be put to one person. A reference a run fills (the row's owner, say) is kept as it was
                   written, and named by its word. -->
              <select id={idOf(a)} class="select" value={textOf(a)} onchange={(e) => write(a, e.currentTarget.value)}>
                <option value="">{words.inspect.owner}</option>
                {#each withCurrent(options, textOf(a)) as o (o.id)}<option value={o.id}>{unbrace(o.name)}</option>{/each}
              </select>
            {:else if picks && options.length > 0}
              <select id={idOf(a)} class="select" value={textOf(a)} onchange={(e) => write(a, e.currentTarget.value)}>
                {#if textOf(a) === ''}<option value="" disabled={a.required}>{PICK[picks]}</option>{/if}
                {#each withCurrent(options, textOf(a)) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
              </select>
              {#if picks === 'call'}
                {@const chosen = (calls ?? []).find((c) => c.ingest === textOf(a))}
                {#if chosen}<p class="help">{whatOf(chosen)}</p>{/if}
              {/if}
            {:else if a.template && (a.kind === 'text' || a.kind === 'long')}
              <Tokens
                id={idOf(a)}
                labelledby="{idOf(a)}-label"
                value={textOf(a)}
                multiline={a.kind === 'long'}
                placeholder={a.hint}
                groups={chips}
                onchange={(text) => write(a, text)}
              />
            {:else if a.kind === 'pairs'}
              {@const rows = pairsOf(a)}
              <!-- ONE ROW A FIELD, the field's name and then its value, so each value is a template field of its own with
                   its references as pills. `field: value` a line in one text box was the only way to write these, and it
                   could only hold a reference as its braces. -->
              <div class="pairs" id={idOf(a)} role="group" aria-labelledby="{idOf(a)}-label">
                {#each rows as [field, text], i (i)}
                  <div class="pair">
                    <div class="field">
                      <input
                        class="field-input"
                        aria-label={words.inspect.fieldName}
                        value={field}
                        placeholder={words.inspect.fieldName}
                        spellcheck="false"
                        oninput={(e) => setPairs(a, rows.map((r, j) => (j === i ? [e.currentTarget.value.trim(), r[1]] : r)))}
                      />
                    </div>
                    <div>
                      <Tokens
                        id="{idOf(a)}-{i}"
                        labelledby="{idOf(a)}-label"
                        value={text}
                        groups={chips}
                        onchange={(next) => setPairs(a, rows.map((r, j) => (j === i ? [r[0], next] : r)))}
                      />
                    </div>
                    <Button weight="bare" onclick={() => setPairs(a, rows.filter((_, j) => j !== i))}>{words.inspect.fieldRemove}</Button>
                  </div>
                {/each}
                {#if !rows.some(([f]) => f === '')}
                  <div><Button weight="quiet" onclick={() => setPairs(a, [...rows, ['', '']])}>{words.inspect.fieldAdd}</Button></div>
                {/if}
              </div>
            {:else if a.kind === 'long' || a.kind === 'list'}
              <textarea id={idOf(a)} class="area" rows={a.kind === 'long' ? 3 : 4} value={textOf(a)} placeholder={a.hint} oninput={(e) => write(a, e.currentTarget.value)}></textarea>
            {:else}
              <div class="field">
                <input
                  id={idOf(a)}
                  class="field-input"
                  type={a.kind === 'number' ? 'number' : 'text'}
                  inputmode={a.kind === 'number' ? 'numeric' : undefined}
                  value={textOf(a)}
                  placeholder={a.hint}
                  spellcheck="false"
                  oninput={(e) => write(a, e.currentTarget.value)}
                />
              </div>
            {/if}
            {#if picks === 'call' && live}
              <!-- A CALL NOT DECLARED YET IS DECLARED IN THE NEW-ACTION SHEET, which the automations hub opens from its address
                   (`?new=action`), so a person who needs one is sent to where it is made rather than told it is missing. -->
              <p class="help">{words.inspect.newCallHelp} <a class="link" href={at('/automations?new=action')}>{words.inspect.newCall}</a></p>
            {/if}
          {/if}
        {/each}
        {#if argsFor(verb, grammar).length === 0}<p class="help">Nothing to fill in. The run ends here.</p>{/if}
      </div>
    {/if}
  </div>
</Panel>

<style>
  /* THE PANEL'S BODY IS A TILE'S SURFACE (`Panel.svelte`), so every field here is the `--tile-2` well and every segmented
     control the `--tile-2` track, from `controls.css`, with nothing drawn a second time here. */
  .inspect {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* WHAT THE TRIGGER SAYS NOW, over its fields: the sentence a card would read, in the second ink. */
  .lede {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE LABEL SITS ABOVE ITS FIELD in the meta size and the second ink, a step clear of the field
     before it. */
  .label {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
  }

  .help,
  .path {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .path {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  /* A SELECT AND A BOX OF LINES ARE FIELDS: 40 tall and 44 under a thumb, the `--tile-2` fill with no border,
     radius `--r-pop`. `controls.css` draws the select's chevron. */
  .select,
  .area {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-3);
    background-color: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .area {
    resize: vertical;
    line-height: var(--lh-body);
  }

  /* ONE FOCUS, THE HOUSE'S: the 2px ink ring offset 2, as `.field` takes it in `controls.css`. */
  .area:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    .select,
    .area {
      min-block-size: var(--tap);
      font-size: var(--fs-body);
    }
  }

  /* SIX TRIGGERS DO NOT FIT ONE ROW AT 390, so the choice wraps onto a second line rather than scrolling sideways.
     The track is `Segmented`'s own element, so its rules reach it by the name this sheet gave it. */
  .inspect :global(.kinds) {
    flex-wrap: wrap;
  }

  /* ONE ROW A FIELD: the name, then its value, then the way to take it out; stacked in a narrow panel, where three
     across would leave the value too narrow to read. */
  .pairs {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-2);
  }

  .link {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  @media (hover: hover) and (pointer: fine) {
    .link:hover {
      text-decoration-color: currentColor;
    }
  }

  @media (width < 640px) {
    /* EACH CONTROL THE SHEET'S WIDTH ON A PHONE: the answer's shapes share the row equally, so a thumb has an
       even part of it each rather than pills huddled at the start. */
    :global(.fill) .segment {
      flex: 1 1 0;
    }
  }
</style>
