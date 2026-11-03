<!--
  One condition: a field, what is asked of it, and the value, read left to right as one sentence row.

  THE THREE CONTROLS ARE THE HOUSE'S OWN SELECTS AND FIELDS (`controls.css`), never a menu of this file's making, so a
  phone gets its own picker and a keyboard gets the browser's. At 640 and wider they sit on one line; below it the field
  and the operator share a line and the value takes the full width under them at 16px, which is the only size a phone
  does not zoom into.

  THE OPERATORS ARE THE FIELD'S, SAID IN ENGLISH (`opsFor` in `tree.ts`), so a date is never offered "contains" and a
  status is never offered "more than". An enum's values are pills, because "is open or doing" is two presses and a
  select of one value at a time would make it a second row.

  A PROPOSED ROW (Slash's draft) IS DRAWN BUT IS NOT PART OF THE FILTER until it is kept, and it is kept top to bottom:
  only the first proposal from the top has Keep.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { fieldSaid, offered, opsFor, OPS, type Cond, type Edits, type OpId } from './tree.ts';

  let { cond, n, edits }: { cond: Cond; n: number; edits: Edits } = $props();

  const field = $derived(edits.fields.find((f) => f.id === cond.field));
  const ops = $derived(opsFor(field, edits.ops));
  const takes = $derived(OPS[cond.op].takes);
  /** A choice rather than a box: an enum's values, a yes or no, a link whose rows the surface handed in. */
  const picks = $derived(
    field?.type === 'enum'
      ? (field.values ?? []).map((v) => ({ value: v, label: field.labels?.[v] ?? v }))
      : field?.type === 'bool'
        ? [
            { value: 'true', label: copy.queryYes },
            { value: 'false', label: copy.queryNo },
          ]
        : (field?.choices ?? []),
  );
  const dated = $derived(field?.type === 'day' || field?.type === 'instant');
  const numeric = $derived(field?.type === 'int' || field?.type === 'decimal' || field?.type === 'duration');

  /** A pill pressed: in or out of the values an enum condition asks for. */
  function toggle(value: string) {
    const on = cond.values.includes(value);
    edits.set(cond.key, { values: on ? cond.values.filter((v) => v !== value) : [...cond.values, value] });
  }

  /**
   * WORDS TYPED INTO A BOX. "is" and "is not" take several values, said with "or" as the sentence says them, so
   * `Rent or Rates` is two; every other operator takes the box as one value.
   */
  const typed = (e: Event) => {
    const text = (e.currentTarget as HTMLInputElement).value;
    edits.set(cond.key, { values: takes === 'many' ? text.split(/\s+or\s+/i) : [text] });
  };
</script>

<div class="q-row" data-proposed={cond.proposed ? '' : undefined}>
  <div class="q-ask">
    <select
      class="q-field"
      aria-label={copy.queryFieldOf(n)}
      value={cond.field}
      onchange={(e) => edits.set(cond.key, { field: e.currentTarget.value })}
    >
      {#each offered(edits.fields) as f (f.id)}
        <option value={f.id}>{fieldSaid(f)}</option>
      {/each}
    </select>
    <select
      class="q-op"
      aria-label={copy.queryOpOf(n)}
      value={cond.op}
      onchange={(e) => edits.set(cond.key, { op: e.currentTarget.value as OpId })}
    >
      {#each ops as op (op)}
        <option value={op}>{OPS[op].said}</option>
      {/each}
    </select>
  </div>

  {#if takes !== 0}
    <div class="q-value">
      {#if field?.type === 'enum' && takes === 'many'}
        <div class="q-picks" role="group" aria-label={copy.queryValueOf(n)}>
          {#each picks as p (p.value)}
            {@const on = cond.values.includes(p.value)}
            <button type="button" class="q-pick" data-on={on ? '' : undefined} aria-pressed={on ? 'true' : 'false'} onclick={() => toggle(p.value)}>
              {p.label}
            </button>
          {/each}
        </div>
      {:else if picks.length}
        <select class="q-box" aria-label={copy.queryValueOf(n)} value={cond.values[0] ?? ''} onchange={(e) => edits.set(cond.key, { values: [e.currentTarget.value] })}>
          <option value="" disabled>{copy.queryChoose}</option>
          {#each picks as p (p.value)}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      {:else if cond.op === 'within'}
        <span class="q-days">
          <input class="q-box q-n num" type="text" inputmode="numeric" aria-label={copy.queryValueOf(n)} value={cond.values[0] ?? ''} oninput={typed} />
          <span class="q-unit">{copy.queryDays}</span>
        </span>
      {:else}
        <input
          class="q-box"
          type="text"
          inputmode={numeric ? 'decimal' : undefined}
          aria-label={copy.queryValueOf(n)}
          value={cond.values.join(' or ')}
          oninput={typed}
        />
        {#if dated}<span class="q-help">{copy.queryDayHelp}</span>{/if}
        {#if field?.type === 'money'}<span class="q-help">{copy.queryMoneyHelp}</span>{/if}
      {/if}
    </div>
  {/if}

  <div class="q-acts">
    {#if cond.proposed}
      <span class="q-proposed">{copy.queryProposed}</span>
      {#if edits.next === cond.key}
        <button type="button" class="q-act tap" onclick={() => edits.keep(cond.key)}>{copy.queryKeep}</button>
      {/if}
      <button type="button" class="q-act tap" onclick={() => edits.remove(cond.key)}>{copy.queryDrop}</button>
    {:else}
      <button type="button" class="q-remove tap" aria-label={copy.queryRemoveCondition(n)} onclick={() => edits.remove(cond.key)}>
        <Icon name="close" size="s" />
      </button>
    {/if}
  </div>
</div>

<style>
  /* ONE SENTENCE ROW: the ask, the value and the remove control, wrapping only when the value is long. */
  .q-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A PROPOSAL IS QUIETER THAN WHAT IS KEPT, and says so in words beside it, never by the shade alone. A flat quiet
     fill and no edge: a broken line is kept for a chart and for a place to drop while dragging. */
  .q-row[data-proposed] {
    padding: var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  .q-ask {
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .q-field,
  .q-op {
    min-inline-size: 0;
    font-size: var(--fs-body);
  }

  .q-value {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    flex: 1 1 12rem;
    min-inline-size: 0;
  }

  /* EVERY BOX IS 16px AT EVERY WIDTH, so a phone never zooms into it. */
  .q-box {
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile);
    border: 1px solid var(--switch-off);
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .q-days {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .q-n {
    inline-size: 8ch;
  }

  .q-unit,
  .q-help {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .q-picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
  }

  /* THE PILLS ARE THE LIST BAR'S: a pill on a raised track, the chosen one on the selected ground. */
  .q-pick {
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .q-pick[data-on] {
    background: var(--chosen);
    color: var(--ink);
  }

  .q-pick::first-letter {
    text-transform: uppercase;
  }

  .q-acts {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
  }

  .q-proposed {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .q-act,
  .q-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: var(--ink-2);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .q-act:hover,
    .q-remove:hover,
    .q-pick:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* BELOW 640 THE ASK TAKES THE WHOLE LINE, two selects side by side, and the value goes under it at full width. */
  @media (width < 640px) {
    .q-ask {
      flex: 1 1 100%;
    }

    .q-field,
    .q-op {
      flex: 1 1 0;
    }

    .q-value {
      flex-basis: 100%;
    }
  }
</style>
