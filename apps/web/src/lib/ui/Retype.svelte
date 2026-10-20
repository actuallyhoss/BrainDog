<!--
  Changing one field of a live list over the rows it holds: its type, whether every row must have one, and a choice
  list's values, words, order and which choice may follow which (`21 §5`).

  A BUTTON ON THE FIELD'S ROW AND A SHEET OF ITS OWN, opened over the Fields sheet (`ListEditor.svelte`), because the
  preview is a list of rows that needs the height. Nothing is written until the conversion has been shown: how many rows
  carry over, each that does not as a card with its answers (Clear or Keep as text for a type change, Fill or Change to
  when the field is narrowed), and a few rows as they would read. The button says how many rows it rewrites and enables
  only when every card has its answer.

  EVERY WRITE IS `retype-write.ts`'s, which reads the field fresh from the record and files the change; this file draws
  it and keeps the in-flight guards. An owner's lands at once and anybody else's waits in Needs you, and the line above the
  button says which before the press.

  AT 390 IT IS A BOTTOM SHEET: one card per failing row, the sample below them, and the button full width in the footer.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { DURATION_UNITS, SHEET_KINDS } from '$lib/record/field-write.ts';
  import { DURATION_WORDS, SHEET_KIND_WORDS, sheetWords } from '$lib/record/field-words.ts';
  import { offered } from '$lib/record/list-write.ts';
  import {
    asOf,
    draftOf,
    previewRetype,
    readField,
    retypeField,
    retypeWords,
    rewrites,
    shown,
    unansweredOf,
    withChoices,
    type Plan,
    type RawField,
    type RetypeDraft,
    type RowAnswer,
  } from '$lib/record/retype-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  let {
    register,
    field,
    label,
    owner,
    onchanged,
  }: {
    register: string;
    field: string;
    /** The name a person reads for the field, as the Fields sheet draws it. */
    label: string;
    owner: boolean;
    /** The field changed on the list, so the screens under the sheet should ask for it again. */
    onchanged?: (() => void) | undefined;
  } = $props();

  let open = $state(false);
  let raw = $state<RawField | null>(null);
  let draft = $state<RetypeDraft | null>(null);
  let typed = $state('');
  let fix = $state<string | null>(null);
  let reading = $state(false);

  let plan = $state<Plan | null>(null);
  /* THE ASK THE PLAN WAS DRAWN FOR, so a change above it marks the plan stale rather than filing what nobody saw. */
  let plannedFor = $state('');
  let answers = $state<Record<string, RowAnswer>>({});
  let previewing = $state(false);
  let converting = $state(false);

  const lists = $derived(offered(Object.values(REGISTERS).map((d) => ({ id: d.id, name: d.name }))).filter((l) => l.id !== register));
  const asked = $derived(raw && draft ? asOf(raw, draft, lists.map((l) => l.id)) : null);
  const askedKey = $derived(asked?.ok ? JSON.stringify(asked.as) : '');
  const fresh = $derived(plan !== null && plannedFor === askedKey);
  const left = $derived(plan && fresh ? unansweredOf(answers, plan) : 0);
  const choiceValues = $derived(draft?.kind === 'enum' ? draft.choices.map((c) => c.value) : []);

  async function start() {
    if (reading) return;
    open = true;
    reading = true;
    fix = null;
    plan = null;
    answers = {};
    typed = '';
    const out = await readField(apiBase(), register, field);
    reading = false;
    if (!out.ok) {
      fix = out.fix;
      return;
    }
    raw = out.field;
    draft = draftOf(out.field);
  }

  function move(i: number, by: -1 | 1) {
    if (!draft) return;
    const j = i + by;
    const next = [...draft.choices];
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) return;
    next[i] = b;
    next[j] = a;
    draft.choices = next;
  }

  function takeOut(i: number) {
    if (!draft) return;
    const gone = draft.choices[i]?.value;
    draft.choices = draft.choices.filter((_, k) => k !== i);
    if (draft.flow !== null && gone !== undefined) {
      const { [gone]: _dropped, ...rest } = draft.flow;
      draft.flow = rest;
    }
  }

  function addChoices() {
    if (!draft) return;
    draft.choices = withChoices(draft.choices, typed);
    typed = '';
  }

  function toggleFlow(on: boolean) {
    if (!draft) return;
    draft.flow = on ? Object.fromEntries(choiceValues.map((v) => [v, choiceValues.filter((x) => x !== v)])) : null;
  }

  function follows(from: string, to: string, on: boolean) {
    if (!draft || draft.flow === null) return;
    const now = draft.flow[from] ?? [];
    draft.flow = { ...draft.flow, [from]: on ? [...now.filter((x) => x !== to), to] : now.filter((x) => x !== to) };
  }

  async function show() {
    if (previewing || !asked) return;
    if (!asked.ok) {
      fix = asked.fix;
      return;
    }
    previewing = true;
    fix = null;
    const key = askedKey;
    const out = await previewRetype(apiBase(), register, field, asked.as);
    previewing = false;
    if (!out.ok) {
      fix = out.fix;
      plan = null;
      return;
    }
    plan = out.plan;
    plannedFor = key;
    /* ANSWERS ARE KEPT FOR THE ROWS THAT STILL FAIL, so looking again after a small change does not ask everything twice. */
    const still = new Set(out.plan.failing.map((r) => r.id));
    answers = Object.fromEntries(Object.entries(answers).filter(([id]) => still.has(id)));
  }

  function answer(id: string, a: RowAnswer) {
    answers = { ...answers, [id]: a };
  }

  async function convert() {
    if (converting || !plan || !fresh || left > 0 || !asked?.ok) return;
    converting = true;
    fix = null;
    const list = REGISTERS[register]?.name ?? register;
    const out = await retypeField(apiBase(), plan, asked.as, answers, retypeWords.question(label, list));
    converting = false;
    if (out.from === 'refused') {
      fix = out.fix;
      return;
    }
    open = false;
    if (out.from === 'landed') {
      toasts.push(retypeWords.landed(label, out.wrote));
      onchanged?.();
    } else toasts.push(retypeWords.filed(label));
  }

  const answerOf = (id: string): RowAnswer | undefined => answers[id];
  const toOf = (id: string): string => {
    const a = answers[id];
    return a !== undefined && typeof a !== 'string' ? a.to : '';
  };
</script>

<Button weight="quiet" aria-label={`${retypeWords.open}: ${label}`} onclick={start}>{retypeWords.open}</Button>

<Sheet bind:open title={retypeWords.title(label)} subtitle={retypeWords.subtitle}>
  <div class="rt" data-retype={field}>
    {#if reading}
      <p class="rt-help">{retypeWords.previewing}</p>
    {:else if draft}
      <div class="rt-part">
        <label class="rt-ask">
          <span class="rt-label">{retypeWords.kind}</span>
          <select class="rt-select" bind:value={draft.kind}>
            {#each SHEET_KINDS as k (k)}<option value={k}>{SHEET_KIND_WORDS[k]}</option>{/each}
          </select>
        </label>

        {#if draft.kind === 'ref'}
          <label class="rt-ask">
            <span class="rt-label">{sheetWords.linkTo}</span>
            <select class="rt-select" bind:value={draft.to}>
              <option value="" disabled>{sheetWords.pickList}</option>
              {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
            </select>
          </label>
        {:else if draft.kind === 'duration'}
          <label class="rt-ask">
            <span class="rt-label">{sheetWords.unit}</span>
            <select class="rt-select" bind:value={draft.unit}>
              {#each DURATION_UNITS as u (u)}<option value={u}>{DURATION_WORDS[u]}</option>{/each}
            </select>
          </label>
        {:else if draft.kind === 'quantity'}
          <label class="rt-ask">
            <span class="rt-label">{sheetWords.quantityUnit}</span>
            <span class="field"><input class="field-input" type="text" maxlength="16" autocomplete="off" bind:value={draft.unit} /></span>
          </label>
        {/if}

        <label class="rt-check">
          <input type="checkbox" bind:checked={draft.required} />
          <span>{retypeWords.required}</span>
        </label>
      </div>

      {#if draft.kind === 'enum'}
        <!-- A CHOICE LIST'S VALUES: the words shown for each (the stored value stays), their order, taking one out, and
             adding more. Taking one out is a narrowing, and the rows holding it are asked about below. -->
        <section class="rt-part" aria-label={retypeWords.choices}>
          <h3 class="rt-head">{retypeWords.choices}</h3>
          <ul class="rt-list">
            {#each draft.choices as c, i (c.value)}
              <li class="rt-choice">
                <span class="rt-value">{c.value}</span>
                <span class="field rt-grow"><input class="field-input" type="text" maxlength="60" autocomplete="off" aria-label={retypeWords.choiceLabel(c.value)} placeholder={c.value} bind:value={c.label} /></span>
                <span class="rt-acts">
                  <Button weight="bare" aria-label={retypeWords.up(c.value)} disabled={i === 0} onclick={() => move(i, -1)}>↑</Button>
                  <Button weight="bare" aria-label={retypeWords.down(c.value)} disabled={i === draft.choices.length - 1} onclick={() => move(i, 1)}>↓</Button>
                  <Button weight="quiet" aria-label={retypeWords.takeOut(c.value)} onclick={() => takeOut(i)}>{retypeWords.takeOutShort}</Button>
                </span>
              </li>
            {/each}
          </ul>
          <form class="rt-add" onsubmit={(e) => { e.preventDefault(); addChoices(); }}>
            <label class="rt-ask rt-grow">
              <span class="rt-label">{retypeWords.another}</span>
              <span class="field"><input class="field-input" type="text" maxlength="200" autocomplete="off" bind:value={typed} /></span>
              <span class="rt-help">{sheetWords.valuesHelp}</span>
            </label>
            <Button type="submit">{retypeWords.addChoice}</Button>
          </form>

          <label class="rt-check">
            <input type="checkbox" checked={draft.flow !== null} onchange={(e) => toggleFlow(e.currentTarget.checked)} />
            <span>{retypeWords.flow}</span>
          </label>
          {#if draft.flow !== null}
            {#each choiceValues as from (from)}
              <fieldset class="rt-flow">
                <legend class="rt-label rt-legend">{retypeWords.follows(from)}</legend>
                {#each choiceValues.filter((v) => v !== from) as to (to)}
                  <label class="rt-check">
                    <input type="checkbox" checked={draft.flow[from]?.includes(to) ?? false} onchange={(e) => follows(from, to, e.currentTarget.checked)} />
                    <span>{to}</span>
                  </label>
                {/each}
              </fieldset>
            {/each}
          {/if}
        </section>
      {/if}

      <div class="rt-part">
        <Button disabled={previewing || !asked?.ok} onclick={show}>{previewing ? retypeWords.previewing : retypeWords.preview}</Button>
        {#if asked && !asked.ok}<p class="rt-help">{asked.fix}</p>{/if}
        {#if plan && !fresh}<p class="rt-help" role="status">{retypeWords.stale}</p>{/if}
      </div>

      {#if plan && fresh}
        <section class="rt-part" aria-label={retypeWords.failing}>
          <p class="rt-summary" role="status">{plan.widens ? retypeWords.widens : retypeWords.summary(plan.converts, plan.failing.length, plan.rows)}</p>

          {#if plan.failing.length > 0}
            <h3 class="rt-head">{retypeWords.failing}</h3>
            <ul class="rt-list">
              {#each plan.failing as r (r.id)}
                {@const a = answerOf(r.id)}
                <li class="rt-card" data-row={r.at} data-answered={a !== undefined && (typeof a === 'string' || a.to.trim() !== '') ? 'yes' : 'no'}>
                  <span class="rt-card-title">{r.title}</span>
                  <span class="rt-card-line"><span class="rt-held">{shown(r.value) || retypeWords.empty}</span> · {r.why}</span>
                  <span class="rt-acts">
                    {#if r.takes.includes('clear')}
                      <label class="rt-check"><input type="radio" name={`rt-${r.id}`} checked={a === 'clear'} onchange={() => answer(r.id, 'clear')} /><span>{retypeWords.clear}</span></label>
                    {/if}
                    {#if r.takes.includes('keep')}
                      <label class="rt-check"><input type="radio" name={`rt-${r.id}`} checked={a === 'keep'} onchange={() => answer(r.id, 'keep')} /><span>{retypeWords.keep}</span></label>
                    {/if}
                    {#if r.takes.includes('to')}
                      <label class="rt-check"><input type="radio" name={`rt-${r.id}`} checked={a !== undefined && typeof a !== 'string'} onchange={() => answer(r.id, { to: toOf(r.id) })} /><span>{plan.op === 'narrow' && shown(r.value) === '' ? retypeWords.fill : retypeWords.changeTo}</span></label>
                    {/if}
                  </span>
                  {#if a !== undefined && typeof a !== 'string'}
                    {#if choiceValues.length > 0}
                      <select class="rt-select" aria-label={`${retypeWords.changeTo}: ${r.title}`} value={a.to} onchange={(e) => answer(r.id, { to: e.currentTarget.value })}>
                        <option value="" disabled>{retypeWords.pick}</option>
                        {#each choiceValues as v (v)}<option value={v}>{v}</option>{/each}
                      </select>
                    {:else}
                      <span class="field"><input class="field-input" type="text" autocomplete="off" aria-label={`${retypeWords.changeTo}: ${r.title}`} value={a.to} oninput={(e) => answer(r.id, { to: e.currentTarget.value })} /></span>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
            {#if plan.keep !== null || plan.failing.some((r) => answerOf(r.id) === 'keep')}
              <p class="rt-help">{retypeWords.keepNote(plan.keep ?? `${field}_text`)}</p>
            {/if}
          {/if}

          {#if plan.sample.length > 0}
            <h3 class="rt-head">{retypeWords.sample}</h3>
            <ul class="rt-list">
              {#each plan.sample as s (s.at)}
                <li class="rt-sample">
                  <span class="rt-card-title">{s.title}</span>
                  <span class="rt-card-line">{shown(s.from)} → {shown(s.to)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    {/if}
    {#if fix}<p class="rt-fix" role="alert">{fix}</p>{/if}
  </div>

  {#snippet footer()}
    <div class="rt-foot">
      <p class="rt-help">{plan && fresh && left > 0 ? retypeWords.left(left) : owner ? retypeWords.ownerNote : retypeWords.memberNote}</p>
      <Button weight="primary" disabled={converting || !plan || !fresh || left > 0} onclick={convert}>
        {converting ? retypeWords.converting : retypeWords.convert(plan && fresh ? rewrites(plan) : 0)}
      </Button>
    </div>
  {/snippet}
</Sheet>

<style>
  .rt {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .rt-part {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-3);
  }

  .rt-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .rt-ask {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .rt-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .rt-help,
  .rt-summary {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .rt-summary {
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .rt-fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .rt-select {
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .rt-check {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .rt-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rt-choice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    padding-block: var(--sp-1);
    border-block-end: 1px solid var(--rule);
  }

  .rt-value {
    min-inline-size: 8ch;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .rt-grow {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }

  .rt-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .rt-add {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-3);
  }

  .rt-flow {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    padding: 0;
    border: 0;
  }

  .rt-legend {
    padding: 0;
  }

  /* ONE CARD A FAILING ROW: its title, what it holds and why it will not carry over, then its answers. The card keeps a
     soft fill until it is answered, so a scan down the list finds the ones still waiting. */
  .rt-card,
  .rt-sample {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-block-size: var(--row-h-2);
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
  }

  /* AN ANSWERED CARD LETS ITS FILL GO, so a scan down the list finds the ones still waiting by their fill. */
  .rt-card[data-answered='yes'] {
    background: transparent;
    border-color: var(--rule);
  }

  .rt-sample {
    background: transparent;
    border-color: var(--rule);
  }

  .rt-card-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .rt-card-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .rt-held {
    color: var(--ink-2);
  }

  .rt-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-3);
  }

  .rt-foot .rt-help {
    flex: 1 1 12rem;
  }

  /* ON A PHONE THE BUTTON IS FULL WIDTH in the sheet's footer, as every sheet's primary is. */
  @media (width < 640px) {
    .rt-foot {
      flex-direction: column;
      align-items: stretch;
    }

    .rt-foot .rt-help {
      flex: 0 0 auto;
    }
  }
</style>
