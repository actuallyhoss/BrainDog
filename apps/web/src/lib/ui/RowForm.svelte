<!--
  The new-row form, GENERATED FROM THE DECLARATION.

  There is no hand-written form for `obligations` anywhere in this app, and there must never be one.
  A register is a `register` row: its fields, their types, their enum values and which of them are
  required are all data. A form typed out by hand is a second copy of that data which drifts the
  first time somebody adds a field — and adding a field is the ordinary case here, because a pack
  can do it after this file shipped.

  So the field TYPE picks the control, once, in one table. `enum` is a segmented control up to four
  values and a select beyond, because four buttons is a glance and nine is a wall. `ref` is a select
  over the target register's rows, titled by the target's own `title` field, because a person picks
  "Halden Type Co" and never `people#1`. `money` puts the currency outside the input, since the
  currency is a property of the record and not something you type. `secret` is refused outright: a
  credential never goes in a row, and the vault is a different surface with different rules.

  Nothing here writes. It is a mock-up, and the submit reports that in the toast rather than
  pretending — a form that looks live and silently discards what you typed is worse than one that
  says so.
-->
<script lang="ts">
  import { REGISTERS, ROWS, currencyFor, labelOf, readableFields } from '../record/api.ts';
  import type { FieldDecl } from '../record/schema.ts';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';

  let { register }: { register: string } = $props();

  const decl = $derived(REGISTERS[register]);

  /** `secret` never appears. Not disabled, not greyed — absent, with the reason said once. */
  const fields = $derived(readableFields(register));

  /** The rows a `ref` can point at, titled the way a person says them. */
  function options(f: FieldDecl): { value: number; label: string }[] {
    const target = f.to ? REGISTERS[f.to] : undefined;
    if (!target) return [];
    return (ROWS[target.id] ?? []).map((e) => ({
      value: e.seq,
      label: String(e.fields[target.title] ?? `${target.id}#${e.seq}`),
    }));
  }

  const id = (f: FieldDecl) => `new-${register}-${f.id}`;
</script>

<form class="row-form" onsubmit={(e) => e.preventDefault()}>
  {#each fields as f}
    <div class="row-field" data-type={f.type}>
      <label class="row-label" for={id(f)}>
        {labelOf(f)}
        <!-- Required is marked on the LABEL and spelled out, never as a bare asterisk: an asterisk
             is a convention you have to already know, and it is announced as "star". -->
        {#if f.required}<span class="row-required">{copy.required}</span>{/if}
      </label>

      {#if f.type === 'enum' && (f.values?.length ?? 0) <= 4}
        <div class="segmented" role="group" aria-labelledby={id(f)}>
          {#each f.values ?? [] as value, i}
            <button type="button" class="segment" data-on={i === 0 ? '' : undefined}>
              {value.replace(/_/g, ' ')}
            </button>
          {/each}
        </div>
      {:else if f.type === 'enum'}
        <select class="row-input" id={id(f)}>
          {#each f.values ?? [] as value}<option>{value.replace(/_/g, ' ')}</option>{/each}
        </select>
      {:else if f.type === 'ref'}
        <select class="row-input" id={id(f)}>
          <option value="">{copy.noneChosen}</option>
          {#each options(f) as o}<option value={o.value}>{o.label}</option>{/each}
        </select>
      {:else if f.type === 'money'}
        <div class="field money">
          <!-- The currency is printed rather than typed, and it is READ FROM THE FIELD'S OWN ROWS
               rather than from a constant. A free-text currency box is how two of them end up added
               together; a constant is how one of them ends up wearing the other's code. A field
               whose rows disagree shows no code at all, which is the honest state of that field. -->
          {#if currencyFor(register, f.id)}<span class="money-unit">{currencyFor(register, f.id)}</span>{/if}
          <input class="field-input num" id={id(f)} type="text" inputmode="decimal" placeholder="0.00" />
        </div>
      {:else if f.type === 'day'}
        <div class="field"><input class="field-input" id={id(f)} type="date" /></div>
      {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
        <div class="field">
          <input class="field-input num" id={id(f)} type="text" inputmode="decimal" />
          {#if f.unit}<span class="money-unit">{f.unit}</span>{/if}
        </div>
      {:else if f.type === 'bool'}
        <label class="row-check"><input id={id(f)} type="checkbox" /> {copy.yes}</label>
      {:else if f.type === 'document'}
        <textarea class="row-input row-area" id={id(f)} rows="4"></textarea>
      {:else}
        <div class="field"><input class="field-input" id={id(f)} type="text" /></div>
      {/if}
    </div>
  {/each}

  {#if (decl?.fields ?? []).some((f) => f.type === 'secret')}
    <p class="row-note">
      <Icon name="vault" size="s" />
      {copy.secretsLiveInTheVault}
    </p>
  {/if}
</form>

<style>
  .row-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .row-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .row-label {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .row-required {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 400;
  }

  /* `select` and `textarea` get the field's own shape rather than the platform's, because a native
     select on the raised surface next to three bordered inputs is the one control that looks like it
     came from a different application. */
  .row-input {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .row-area {
    padding: var(--sp-2) var(--sp-3);
    font-family: inherit;
    line-height: 1.55;
    resize: vertical;
  }

  .money-unit {
    flex: none;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .money .field-input {
    text-align: end;
  }

  .row-check {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .row-note {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
