<!--
  The inspector: a form for the card the canvas has open, in a `Sheet` (a drawer above 900px, a sheet on a phone).

  A FORM, NEVER CODE (§6). Every argument is a field with a label, drawn from `ARGS` in `flow.ts`, so there is one list
  of what each verb takes and the menu, the card's sentence, the fault list and this form all read it. A template is
  filled from chips, the answers the steps before can certainly read and what the trigger hands a run, so nobody types
  braces; a condition is the `where` sentence every list and block already speaks, "amount is more than 500" among it
  since `3187be5a`, or, for a number, a field picked from what the step can read, a test and a value, which files the
  tree those same words read as (`flow.ts` `COMPARE`, held to the record by `flow-words.test.ts`).

  EVERY KEYSTROKE GOES INTO THE DRAFT, AND NOTHING LEAVES IT. The sheet has no Save of its own: the draft is sent whole
  from the editor's footer, once, so closing this is never a question of whether something was lost.

  `check` IS THE PAGE'S, AND IT IS ONLY HANDED IN ON THE SAMPLE. It runs `where.ts` over the trigger's condition, and
  `where.ts` compiles against the sample record's own lists; on a real record it would refuse a field the sample does
  not have, which is a wrong sentence rather than no sentence. The record checks the condition again when it is filed.

  PICKED, NEVER TYPED, WHERE THE RECORD ALREADY HOLDS THE ANSWER (`loop/research-canvas-ux.md` 1.4 and 1.5). "In the
  list" was a box with `obligations` as its placeholder, "The declared call" a box hinting `gold_rate`, and a channel or
  a day was printed as its stored value; a stranger does not know any of those names, and a guess faulted on Send.
  Each is now a choice read from the record, and this sheet does the reading itself so the page's file stays the
  page's: the lists from the shell's `lists` (every list, empty ones too, which is the list `boot-live.ts` keeps for
  anything that puts something INTO a list; the rail's `index.registers` leaves out a list with no rows yet, and a
  new list is the likeliest one to automate), a list's fields through `schemaOf`, the declared calls through
  `openActions` as the page does for its call lines, and the doors through `listDoors` as Settings does. A read that
  does not answer leaves the box as it was, so a record that cannot say is no worse off than before.

  THE FIELDS WERE THE SAMPLE'S ONLY. The page hands in `fieldsOf`, which answers for the sample and `[]` on a real
  record, so on anybody's own record the chips offered nothing from the row and "the invoice's amount" could only be
  typed as braces. The record's own declaration is asked first now, and `fieldsOf` is the sample's path.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { schemaOf } from '$lib/record/page-write.ts';
  import { callerAt, listDoors, type Door } from '$lib/ui/webhook-doors.ts';
  import {
    ARGS,
    CHANNELS,
    COMPARE,
    CONDITION_HINT,
    DAYS,
    EVERY,
    TRIGGER_KINDS,
    VERB_LABELS,
    blankTrigger,
    clockOf,
    find,
    getAt,
    leafOf,
    leafTo,
    listFrom,
    listText,
    pairsFrom,
    pairsText,
    sayTrigger,
    setAt,
    triggerChips,
    triggerKind,
    varsBefore,
    verbOf,
    withChip,
    words,
    type Arg,
    type CompareOp,
    type Trigger,
  } from './flow.ts';
  import { often, openActions, whatOf, type ActionRow } from '$lib/record/actions.ts';
  import { CHANNEL_WORDS, DAY_WORDS, doorsPickable, groupChips, idWords, pickerOf, withCurrent } from './chips.ts';
  import type { FlowDraft } from './flow.svelte.ts';

  let {
    flow,
    fieldsOf = () => [],
    check,
  }: {
    flow: FlowDraft;
    /** The fields of a list, for `trigger.row.<field>` chips, where the page knows them. */
    fieldsOf?: (register: string) => string[];
    /** What is wrong with a condition over a list, where the page can say. */
    check?: ((register: string, when: string) => string[]) | undefined;
  } = $props();

  const open = $derived(flow.selected !== null);
  const isTrigger = $derived(flow.selected === 'trigger');
  const found = $derived(flow.selected && !isTrigger ? find(flow.draft.steps, flow.selected) : null);
  const verb = $derived(found ? verbOf(found.node.step) : null);
  const t = $derived(flow.draft.trigger);
  const kind = $derived(triggerKind(t));
  const register = $derived('written' in t ? t.written.register : '');

  const title = $derived(isTrigger ? words.trigger : verb ? VERB_LABELS[verb] : words.edit);
  const subtitle = $derived(isTrigger ? sayTrigger(t) : undefined);

  /* ── what the record holds, read when the sheet needs it ────────────────── */

  const live = $derived(Boolean(page.data.live));
  const lists = $derived<readonly { id: string; name: string }[]>(page.data.lists ?? page.data.index?.registers ?? []);

  /* A LIST'S FIELDS, BY LIST, ASKED ONCE A LIST IS PICKED. `schemaOf` keeps its own answer for the tab and forgets a
     refusal, so a list opened twice is read once, and a record that would not say is asked again next time. */
  let declaredFields = $state<Record<string, string[]>>({});
  $effect(() => {
    const r = register;
    if (!open || !live || r === '' || r in declaredFields) return;
    void schemaOf(apiBase(), r).then((d) => {
      if (d) declaredFields = { ...declaredFields, [r]: d.fields.map((f) => f.id) };
    });
  });
  const rowFields = $derived(register === '' ? [] : (declaredFields[register] ?? fieldsOf(register)));

  /* THE DECLARED CALLS A RULE MAY START: `callFault` in `packages/kernel/src/flow-lint.ts` refuses anything that is not
     channel `call`, so a fetch or a watch is not offered only to be refused on Decide. Read once per sheet. */
  let calls = $state<ActionRow[] | null>(null);
  $effect(() => {
    if (!open || calls !== null || (verb !== 'call' && verb !== 'run')) return;
    calls = [];
    void openActions((url, init) => fetch(url, init), apiBase()).then((out) => {
      calls = out.first.ok ? out.first.value.filter((a) => a.channel === 'call') : [];
    });
  });
  const callOptions = $derived((calls ?? []).map((a) => ({ id: a.ingest, name: idWords(a.ingest) })));

  /* THE DOORS, WHICH ARE AN OWNER'S READ. Anybody else is refused, and keeps the box. The sample has no doors to list.
     They are webhooks only, so the picker waits for the arrival to say it comes by webhook (`chips.ts` `doorsPickable`). */
  let doors = $state<Door[] | null>(null);
  $effect(() => {
    if (!open || !live || doors !== null || !('arrival' in t)) return;
    doors = [];
    void listDoors(callerAt(apiBase())).then((l) => {
      doors = l.kind === 'doors' ? l.doors : [];
    });
  });

  const PICK = { list: 'Pick a list', call: 'Pick a call', field: 'Pick a field' } as const;
  function optionsFor(p: 'list' | 'call' | 'field'): readonly { id: string; name: string }[] {
    if (p === 'list') return lists;
    if (p === 'call') return callOptions;
    return rowFields.map((f) => ({ id: f, name: f }));
  }

  /** Template chips: what the trigger hands a run, then the answers kept before this card, under where each comes from. */
  const earlier = $derived(found ? varsBefore(flow.draft.steps, found.node.key) : []);
  const chips = $derived(found ? groupChips([...triggerChips(t, rowFields), ...earlier]) : []);
  /** A condition reads an answer by its bare name, `rate is more than 70`, and a row's field the same way. */
  const reads = $derived(found ? groupChips([...rowFields.map((f) => `trigger.row.${f}`), ...earlier]) : []);
  const names = $derived(reads.flatMap((g) => g.chips.map((c) => c.word)));

  const whenFaults = $derived(check && register && flow.draft.when ? check(register, flow.draft.when) : []);

  /* ── one argument ─────────────────────────────────────────────────────── */

  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
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

  async function chip(a: Arg, name: string) {
    const el = inputs[pathKey(a)];
    const text = textOf(a);
    const out = withChip(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length, name);
    write(a, out.value);
    await tick();
    el?.focus();
    el?.setSelectionRange(out.caret, out.caret);
  }

  /* ── a condition ──────────────────────────────────────────────────────── */

  const leaf = $derived(found && verb === 'if' ? leafOf(found.node.step.if) : null);
  let mode = $state<'words' | 'number'>('words');
  $effect(() => {
    mode = leaf ? 'number' : 'words';
  });

  function setLeaf(field: string, op: CompareOp, value: number) {
    if (found) flow.setStep(found.node.key, { if: leafTo(field, op, value) });
  }

  /* ── the trigger ──────────────────────────────────────────────────────── */

  /* THE CONDITION GOES WITH THE CHANGE. Only a change draws the "Only when" field, so a condition kept across a switch
     to a clock, a button or an arrival was a fault the person could read and had no field left to clear. */
  function pick(k: (typeof TRIGGER_KINDS)[number]) {
    if (k === kind) return;
    flow.setTrigger(blankTrigger(k, t));
    if (k !== 'written' && flow.draft.when !== null) flow.setWhen('');
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

  const OPS = [
    ['create', 'Added'],
    ['update', 'Changed'],
    ['delete', 'Deleted'],
  ] as const;
</script>

<Sheet open={open} {title} {subtitle} onclose={() => flow.select(null)}>
  {#if isTrigger}
    <div class="form">
      <label class="label" for="flow-name">{words.name}</label>
      <div class="field">
        <input id="flow-name" class="field-input" value={flow.draft.name} placeholder={words.untitled} oninput={(e) => flow.setName(e.currentTarget.value)} />
      </div>

      <p class="label" id="flow-kind">{words.trigger}</p>
      <div class="segmented" role="group" aria-labelledby="flow-kind">
        {#each TRIGGER_KINDS as k (k)}
          <button type="button" class="segment" aria-pressed={kind === k} data-on={kind === k ? '' : undefined} onclick={() => pick(k)}>{words.kinds[k]}</button>
        {/each}
      </div>
      <p class="help">{words.triggerHelp[kind] ?? sayTrigger(t)}</p>

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
        <p class="label" id="flow-ops">When a row is</p>
        <div class="segmented" role="group" aria-labelledby="flow-ops">
          {#each OPS as [op, label] (op)}
            {@const on = (t.written.op ?? []).includes(op)}
            <button type="button" class="segment" aria-pressed={on} data-on={on ? '' : undefined} onclick={() => toggleOp(op)}>{label}</button>
          {/each}
        </div>
        <p class="help">{(t.written.op ?? []).length === 0 ? 'None picked is added or changed.' : ''}</p>
        <label class="label" for="flow-when">{words.condition}</label>
        <div class="field">
          <input id="flow-when" class="field-input" value={flow.draft.when ?? ''} placeholder={CONDITION_HINT} spellcheck="false" oninput={(e) => flow.setWhen(e.currentTarget.value)} />
        </div>
        {#each whenFaults as f (f)}<p class="fault"><span class="fault-glyph"><Icon name="alert" /></span>{f}</p>{/each}
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
      {:else if 'every' in t}
        <label class="label" for="flow-every">How often</label>
        <select id="flow-every" class="select" value={t.every} onchange={(e) => flow.setTrigger(clockOf(e.currentTarget.value, t.at, t.day))}>
          {#each EVERY as e (e)}<option value={e}>{often(e)}</option>{/each}
          {#if !(EVERY as readonly string[]).includes(t.every)}<option value={t.every}>{often(t.every)}</option>{/if}
        </select>
        {#if t.every === '1d' || t.every === '1w'}
          <label class="label" for="flow-at">At</label>
          <div class="field">
            <input id="flow-at" class="field-input" type="time" value={t.at ?? ''} oninput={(e) => flow.setTrigger(clockOf(t.every, e.currentTarget.value, t.day))} />
          </div>
          {#if t.every === '1w' && t.at}
            <label class="label" for="flow-day">On</label>
            <select id="flow-day" class="select" value={t.day ?? 'mon'} onchange={(e) => flow.setTrigger(clockOf(t.every, t.at, e.currentTarget.value))}>
              {#each DAYS as d (d)}<option value={d}>{DAY_WORDS[d] ?? d}</option>{/each}
            </select>
          {/if}
        {/if}
      {/if}

      <p class="path">{flow.path === 'inline' ? words.inline : words.asRun}</p>
    </div>
  {:else if found && verb}
    <div class="form">
      {#each ARGS[verb] as a (pathKey(a))}
        {#if a.kind === 'condition'}
          <p class="label" id="flow-cond">{a.label}</p>
          <div class="segmented" role="group" aria-labelledby="flow-cond">
            <button type="button" class="segment" aria-pressed={mode === 'words'} data-on={mode === 'words' ? '' : undefined} onclick={() => (mode = 'words')}>In words</button>
            <button type="button" class="segment" aria-pressed={mode === 'number'} data-on={mode === 'number' ? '' : undefined} onclick={() => (mode = 'number')}>A number</button>
          </div>
          {#if mode === 'words'}
            <div class="field">
              <input
                id={idOf(a)}
                class="field-input"
                aria-labelledby="flow-cond"
                value={typeof valueOf(a) === 'string' ? String(valueOf(a)) : ''}
                placeholder={a.hint}
                spellcheck="false"
                oninput={(e) => write(a, e.currentTarget.value)}
              />
            </div>
          {:else}
            {@const l = leaf ?? { field: names[0] ?? '', op: 'gt' as CompareOp, value: 0 }}
            <div class="leaf">
              {#if reads.length > 0}
                <select class="select" aria-label="Field or answer" value={l.field} onchange={(e) => setLeaf(e.currentTarget.value, l.op, l.value)}>
                  {#if l.field !== '' && !names.includes(l.field)}<option value={l.field}>{l.field}</option>{/if}
                  {#each reads as g (g.label)}
                    <optgroup label={g.label}>
                      {#each g.chips as c (c.path)}<option value={c.word}>{c.word}</option>{/each}
                    </optgroup>
                  {/each}
                </select>
              {:else}
                <div class="field">
                  <input class="field-input" aria-label="Field or answer" value={l.field} spellcheck="false" oninput={(e) => setLeaf(e.currentTarget.value.trim(), l.op, l.value)} />
                </div>
              {/if}
              <select class="select" aria-label="Test" value={l.op} onchange={(e) => setLeaf(l.field, e.currentTarget.value as CompareOp, l.value)}>
                {#each COMPARE as c (c.op)}<option value={c.op}>{c.said}</option>{/each}
              </select>
              <div class="field">
                <input class="field-input" type="number" inputmode="decimal" aria-label="Value" value={l.value} oninput={(e) => setLeaf(l.field, l.op, Number(e.currentTarget.value) || 0)} />
              </div>
            </div>
          {/if}
          {#if mode === 'words' && reads.length > 0}
            <div class="groups">
              {#each reads as g (g.label)}
                <p class="chips-head">{g.label}</p>
                <div class="chips">{#each g.chips as c (c.path)}<span class="chip-word">{c.word}</span>{/each}</div>
              {/each}
            </div>
          {/if}
        {:else}
          {@const picks = pickerOf(verb, a.path)}
          {@const options = picks ? optionsFor(picks) : []}
          <label class="label" for={idOf(a)}>{a.label}</label>
          {#if picks && options.length > 0}
            <select id={idOf(a)} class="select" value={textOf(a)} onchange={(e) => write(a, e.currentTarget.value)}>
              {#if textOf(a) === ''}<option value="" disabled={a.required}>{PICK[picks]}</option>{/if}
              {#each withCurrent(options, textOf(a)) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            </select>
            {#if picks === 'call'}
              {@const chosen = (calls ?? []).find((c) => c.ingest === textOf(a))}
              {#if chosen}<p class="help">{whatOf(chosen)}</p>{/if}
            {/if}
          {:else if a.kind === 'long' || a.kind === 'list' || a.kind === 'pairs'}
            <textarea
              id={idOf(a)}
              class="area"
              rows={a.kind === 'long' ? 3 : 4}
              value={textOf(a)}
              placeholder={a.hint}
              bind:this={inputs[pathKey(a)]}
              oninput={(e) => write(a, e.currentTarget.value)}
            ></textarea>
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
                bind:this={inputs[pathKey(a)]}
                oninput={(e) => write(a, e.currentTarget.value)}
              />
            </div>
          {/if}
          {#if a.template && chips.length > 0}
            <!-- EACH HEADING NAMES ITS GROUP, because two chips can share a word ("amount" from the row and from a call),
                 and a screen reader hearing "Put amount in" twice needs the heading to tell them apart. -->
            <div class="groups">
              {#each chips as g, i (g.label)}
                <p class="chips-head" id="{idOf(a)}-from-{i}">{g.label}</p>
                <div class="chips" role="group" aria-labelledby="{idOf(a)}-from-{i}">
                  {#each g.chips as c (c.path)}
                    <button type="button" class="chip" aria-label={words.chipInsert(c.word)} onclick={() => void chip(a, c.path)}>{c.word}</button>
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
      {#if ARGS[verb].length === 0}<p class="help">Nothing to fill in. The run ends here.</p>{/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if found}
      <!-- A GHOST, SO IT IS NOT RED AT REST (DESIGN-SYSTEM 4.3): a secondary with the bad tone drew "Remove" in danger
           beside Done every time a card was opened. The bare weight keeps it ink2 until it is pointed at or focused. -->
      <Button weight="bare" tone="bad" onclick={() => found && flow.remove(found.node.key)}>{words.remove}</Button>
    {/if}
    <Button weight="primary" onclick={() => flow.select(null)}>Done</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .label {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .help,
  .path {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .path {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  /* AN ERROR IS INK WITH A GLYPH, NEVER A WASH (DESIGN-SYSTEM 1.2 and 4.8). This was `--warn-wash` behind the sentence,
     the tinted strip the rulebook names as the thing not to draw. */
  .fault {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .fault-glyph {
    display: inline-flex;
    flex: none;
    color: var(--warn);
  }

  .select,
  .area {
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .area {
    resize: vertical;
    line-height: var(--lh-body);
  }

  .leaf {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 7rem);
    gap: var(--sp-2);
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .chips-head {
    margin: var(--sp-1) 0 0;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
  }

  .chip,
  .chip-word {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    /* THE UI FACE: `rate` and `due` are names a person gave, not identifiers to copy (DESIGN-SYSTEM 2.1). */
    font-family: var(--font-ui);
    font-size: var(--t-xs);
  }

  .chip {
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--edge);
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .chip {
      min-block-size: var(--tap);
    }
  }

  @media (width < 640px) {
    .leaf {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
