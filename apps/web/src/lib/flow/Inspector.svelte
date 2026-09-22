<!--
  The inspector: a form for the card the canvas has open, in a `Sheet` (a drawer above 900px, a sheet on a phone).

  A FORM, NEVER CODE (§6). Every argument is a field with a label, drawn from `ARGS` in `flow.ts`, so there is one list
  of what each verb takes and the menu, the card's sentence, the fault list and this form all read it. A template is
  filled from chips, the answers the steps before can certainly read and what the trigger hands a run, so nobody types
  braces; a condition is the `where` sentence every list and block already speaks, or, for a number, a field, a test
  and a value, because the sentence grammar has no word for "more than" (`flow.ts` `COMPARE`).

  EVERY KEYSTROKE GOES INTO THE DRAFT, AND NOTHING LEAVES IT. The sheet has no Save of its own: the draft is sent whole
  from the editor's footer, once, so closing this is never a question of whether something was lost.

  `check` IS THE PAGE'S, AND IT IS ONLY HANDED IN ON THE SAMPLE. It runs `where.ts` over the trigger's condition, and
  `where.ts` compiles against the sample record's own lists; on a real record it would refuse a field the sample does
  not have, which is a wrong sentence rather than no sentence. The record checks the condition again when it is filed.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import {
    ARGS,
    CHANNELS,
    COMPARE,
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
  import { often } from '$lib/record/actions.ts';
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

  /** Template chips: what the trigger hands a run, then the answers kept before this card. */
  const chips = $derived(found ? [...triggerChips(t, register ? fieldsOf(register) : []), ...varsBefore(flow.draft.steps, found.node.key)] : []);
  /** A condition reads an answer by its bare name, `rate is more than 70`, and a row's field the same way. */
  const names = $derived(found ? [...(register ? fieldsOf(register) : []), ...varsBefore(flow.draft.steps, found.node.key).map((v) => v.slice('vars.'.length))] : []);

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
        <div class="field">
          <input id="flow-register" class="field-input" value={t.written.register} placeholder="obligations" spellcheck="false" oninput={(e) => setWritten({ register: e.currentTarget.value.trim() })} />
        </div>
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
          <input id="flow-when" class="field-input" value={flow.draft.when ?? ''} placeholder="state is open, due before today" spellcheck="false" oninput={(e) => flow.setWhen(e.currentTarget.value)} />
        </div>
        {#each whenFaults as f (f)}<p class="fault">{f}</p>{/each}
      {:else if 'arrival' in t}
        <label class="label" for="flow-ingest">At the door</label>
        <div class="field">
          <input id="flow-ingest" class="field-input" value={t.arrival.ingest ?? ''} placeholder="Any door" spellcheck="false" oninput={(e) => setArrival({ ingest: e.currentTarget.value.trim() })} />
        </div>
        <label class="label" for="flow-channel">By</label>
        <select id="flow-channel" class="select" value={t.arrival.channel ?? ''} onchange={(e) => setArrival({ channel: e.currentTarget.value })}>
          <option value="">Any way</option>
          {#each CHANNELS as c (c)}<option value={c}>{c}</option>{/each}
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
              {#each DAYS as d (d)}<option value={d}>{d}</option>{/each}
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
              <div class="field">
                <input class="field-input" aria-label="Field or answer" value={l.field} spellcheck="false" oninput={(e) => setLeaf(e.currentTarget.value.trim(), l.op, l.value)} />
              </div>
              <select class="select" aria-label="Test" value={l.op} onchange={(e) => setLeaf(l.field, e.currentTarget.value as CompareOp, l.value)}>
                {#each COMPARE as c (c.op)}<option value={c.op}>{c.said}</option>{/each}
              </select>
              <div class="field">
                <input class="field-input" type="number" inputmode="decimal" aria-label="Value" value={l.value} oninput={(e) => setLeaf(l.field, l.op, Number(e.currentTarget.value) || 0)} />
              </div>
            </div>
          {/if}
          {#if names.length > 0}
            <p class="chips-head">{words.reads}</p>
            <div class="chips">{#each names as n (n)}<span class="chip-word">{n}</span>{/each}</div>
          {/if}
        {:else}
          <label class="label" for={idOf(a)}>{a.label}</label>
          {#if a.kind === 'long' || a.kind === 'list' || a.kind === 'pairs'}
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
            <div class="chips" role="group" aria-label={words.reads}>
              {#each chips as c (c)}
                <button type="button" class="chip" aria-label={words.chipInsert(c)} onclick={() => void chip(a, c)}>{c.split('.').pop()}</button>
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
      <Button tone="bad" onclick={() => found && flow.remove(found.node.key)}>{words.remove}</Button>
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
    font-weight: 600;
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

  .fault {
    margin: 0;
    padding: var(--sp-1) var(--sp-2);
    background: var(--warn-wash);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
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

  .chips-head {
    margin: var(--sp-1) 0 0;
    color: var(--dim);
    font-size: var(--t-xs);
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
    font-family: var(--font-id);
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
