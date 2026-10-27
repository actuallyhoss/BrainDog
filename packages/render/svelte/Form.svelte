<!--
  `form`: a few labelled fields and one button that adds a row to a list (`src/form.ts`), drawn from the form
  the record answered and carried on the block as `form_spec`.

  EVERY CONTROL HAS ITS OWN LABEL, and a required field says so with a mark AND the word, never the mark alone. The
  line under a field is the refusal about it, the form's own before the press (a field left empty, a figure that does
  not read) or the record's after it; the control is `aria-invalid` and described by that line, and the line is a
  live region, so the sentence is announced where it lands. A refusal that names no field drawn is said once, above
  the button.

  THE BUTTON IS THE BLOCK'S ONE PRIMARY, a rectangle in the working accent. The press goes through the host's `act`,
  the same one every declared action takes, so the write is one step with one Undo (`apps/web` `page-writes.ts`).

  WITH NO `act` IT IS A PREVIEW: the fields drawn and disabled, and no button, because a control that cannot act is
  absent rather than pressable and refused (`19 §6`).

  WHAT IS TYPED IS THE PERSON'S until the press, held here and never written anywhere else; a landed `stay` clears it
  and says what was added, and a landed page goes there.
-->
<script lang="ts">
  import type { Block, RenderOptions } from '../src/index.ts';
  import type { OnAct } from '../src/actions.ts';
  import {
    formLanded,
    formOf,
    formOutcome,
    formPlan,
    formPress,
    refusalPlaced,
    refusedField,
    type FormRefused,
    type FormValue,
    type MoneyTyped,
  } from '../src/form.ts';

  let { block, opts = {}, act }: { block: Block; opts?: RenderOptions; act?: OnAct | undefined } = $props();

  /* THE HOST'S `act` TAKES ANY VALUE (`page-writes.ts` `act`, `value: unknown`), and a form's is the row's typed fields,
     so it is called with that object. Its answer, where the host gives one, says whether the row landed
     (`formOutcome`). */

  const uid = $props.id();
  const form = $derived(formOf(block));
  const home = $derived(opts.home ?? null);

  let values = $state<Record<string, FormValue>>({});
  let refused = $state<FormRefused | null>(null);
  let added = $state<string | null>(null);
  let sending = $state(false);
  let root = $state<HTMLFormElement | undefined>();

  const plan = $derived(form ? formPlan(form, values) : null);
  const placed = $derived(plan ? refusalPlaced(refused, plan) : { under: {} as Record<string, string>, above: null });

  const idOf = (field: string): string => `${uid}-${field}`;
  const lineOf = (field: string): string => `${uid}-${field}-line`;

  const text = (field: string): string => {
    const v = values[field];
    return typeof v === 'string' ? v : '';
  };
  const money = (field: string): MoneyTyped => {
    const v = values[field];
    return v !== null && typeof v === 'object' ? v : { amount: typeof v === 'string' ? v : '', currency: home ?? '' };
  };

  /* A CHANGE TAKES BACK THE REFUSAL ABOUT ITS FIELD, since the sentence was about what stood there before. */
  function put(field: string, value: FormValue) {
    values = { ...values, [field]: value };
    added = null;
    if (refused && refusedField(refused.at) === field) refused = null;
  }

  const focusOn = (field: string | undefined) => {
    const named = refusedField(field);
    if (named) root?.querySelector<HTMLElement>(`#${CSS.escape(idOf(named))}`)?.focus();
  };

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!form || !plan || !act || sending) return;
    added = null;
    const press = formPress(form, values, home);
    if ('refused' in press) {
      refused = press.refused;
      focusOn(press.refused.at);
      return;
    }
    refused = null;
    sending = true;
    let out: unknown;
    try {
      out = await act(press.action, null, press.values);
    } finally {
      sending = false;
    }
    const said = formOutcome(out);
    if (said && !said.ok) {
      refused = said.refusal;
      focusOn(said.refusal?.at);
      return;
    }
    if (!said) return;
    const landed = formLanded(form, values);
    if (landed.stay) {
      values = {};
      added = landed.said;
    } else location.assign(opts.href ? opts.href(landed.href) : landed.href);
  }
</script>

{#if form && plan}
  <form class="form" bind:this={root} onsubmit={submit} novalidate aria-busy={sending ? 'true' : undefined}>
    {#each plan.fields as f (f.id)}
      {@const wrong = placed.under[f.id]}
      {@const described = wrong ? lineOf(f.id) : undefined}
      {@const required = f.required ? 'true' : undefined}
      <div class="form-field" data-control={f.control}>
        {#snippet named()}
          <span class="form-name">{f.label}</span>
          {#if f.required}<span class="form-req"><span aria-hidden="true">*</span> required</span>{/if}
        {/snippet}
        {#if f.control === 'checkbox'}
          <label class="form-check">
            <input
              id={idOf(f.id)}
              class="form-tick"
              type="checkbox"
              name={f.id}
              checked={values[f.id] === true}
              disabled={!act}
              aria-invalid={wrong ? 'true' : undefined}
              aria-describedby={described}
              onchange={(e) => put(f.id, e.currentTarget.checked)}
            />
            {@render named()}
          </label>
        {:else}
          <label class="form-label" for={idOf(f.id)}>{@render named()}</label>
          {#if f.control === 'textarea'}
            <textarea
              id={idOf(f.id)}
              class="form-box form-long"
              name={f.id}
              rows="4"
              value={text(f.id)}
              disabled={!act}
              aria-required={required}
              aria-invalid={wrong ? 'true' : undefined}
              aria-describedby={described}
              oninput={(e) => put(f.id, e.currentTarget.value)}
            ></textarea>
          {:else if f.control === 'select'}
            <select
              id={idOf(f.id)}
              class="form-box"
              name={f.id}
              disabled={!act}
              aria-required={required}
              aria-invalid={wrong ? 'true' : undefined}
              aria-describedby={described}
              onchange={(e) => put(f.id, e.currentTarget.value)}
            >
              <option value="" selected={text(f.id) === ''}>Pick one</option>
              {#each f.options as option}
                <option value={option} selected={text(f.id) === option}>{option}</option>
              {/each}
            </select>
          {:else if f.control === 'money'}
            {@const m = money(f.id)}
            <div class="form-money">
              <input
                id={idOf(f.id)}
                class="form-box num"
                type="text"
                name={f.id}
                inputmode="decimal"
                autocomplete="off"
                value={m.amount}
                disabled={!act}
                aria-required={required}
                aria-invalid={wrong ? 'true' : undefined}
                aria-describedby={described}
                oninput={(e) => put(f.id, { ...money(f.id), amount: e.currentTarget.value })}
              />
              <input
                class="form-box form-code"
                type="text"
                name={`${f.id}_currency`}
                autocomplete="off"
                maxlength="3"
                aria-label={`${f.label}, currency`}
                value={m.currency}
                disabled={!act}
                oninput={(e) => put(f.id, { ...money(f.id), currency: e.currentTarget.value })}
              />
            </div>
          {:else}
            <input
              id={idOf(f.id)}
              class="form-box"
              class:num={f.control === 'number'}
              type={f.control === 'date' ? 'date' : 'text'}
              name={f.id}
              inputmode={f.control === 'number' ? 'decimal' : undefined}
              autocomplete="off"
              value={text(f.id)}
              disabled={!act}
              aria-required={required}
              aria-invalid={wrong ? 'true' : undefined}
              aria-describedby={described}
              oninput={(e) => put(f.id, e.currentTarget.value)}
            />
          {/if}
        {/if}
        {#if wrong}<p class="form-wrong" id={lineOf(f.id)} role="alert"><span class="form-mark" aria-hidden="true">!</span> {wrong}</p>{/if}
      </div>
    {/each}
    {#if act}
      {#if placed.above}<p class="form-wrong" role="alert"><span class="form-mark" aria-hidden="true">!</span> {placed.above}</p>{/if}
      <!-- WHAT WAS ADDED IS SAID BESIDE THE BUTTON, in a live region that is there before it speaks, so it is announced. -->
      <div class="form-foot">
        <button type="submit" class="form-submit" disabled={sending}>{form.submit}</button>
        <p class="form-added" role="status">{added ?? ''}</p>
      </div>
    {/if}
  </form>
{:else}
  <p class="form-empty">Nothing to fill in here.</p>
{/if}

<style>
  /* ONE COLUMN OF FIELDS INSIDE THE TILE, each its label over its control, and the button last at its own width. */
  .form {
    display: grid;
    gap: var(--sp-4);
  }

  .form-field {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .form-label,
  .form-check {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
  }

  .form-check {
    align-items: center;
    cursor: pointer;
  }

  .form-tick {
    inline-size: 20px;
    block-size: 20px;
    margin: 0;
    accent-color: var(--red-fill);
  }

  /* REQUIRED IS A MARK AND A WORD, quiet beside the label, never the colour alone. */
  .form-req {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: normal;
  }

  /* THE BOX IS THE FIELD'S FILL, with no border: a rectangle at the control height, radius 8. */
  .form-box {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .form-box.num {
    font-variant-numeric: tabular-nums;
  }

  .form-long {
    min-block-size: calc(var(--btn-h) * 2.5);
    padding-block: var(--sp-2);
    resize: vertical;
  }

  .form-box:disabled,
  .form-tick:disabled {
    cursor: default;
    opacity: 0.7;
  }

  /* A FIELD THE REFUSAL IS ABOUT takes the deeper red's ring, with the sentence and its mark under it. */
  .form-box[aria-invalid='true'],
  .form-tick[aria-invalid='true'] {
    outline: 2px solid var(--red);
    outline-offset: -2px;
  }

  .form-money {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8ch;
    gap: var(--sp-2);
  }

  .form-code {
    text-transform: uppercase;
  }

  .form-wrong {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
  }

  .form-mark {
    font-weight: 700;
  }

  .form-added {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .form-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* THE BLOCK'S ONE PRIMARY: the working accent's fill, a rectangle, radius 8. */
  .form-submit {
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-4);
    background: var(--red-fill);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--on-red);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .form-submit:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .form-empty {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
</style>
