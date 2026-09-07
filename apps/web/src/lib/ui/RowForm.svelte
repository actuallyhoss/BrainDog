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
  import { NOW, REGISTERS, ROWS, currencyFor, labelOf, readableFields } from '../record/api.ts';
  import type { FieldDecl } from '../record/schema.ts';
  import { exponentOf } from 'braindog-render';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';

  /**
   * `problems` IS BOUND OUT rather than pulled in.
   *
   * IT WAS A METHOD, `problems()`, READ ON CLICK — which is a snapshot, so the button that calls it
   * cannot be disabled by what it finds. Both callers therefore left the button live and answered a
   * refused value with a toast AFTER the press, while `/decide` answers the same question ("why can
   * I not submit?") with a disabled control and a sentence beside it. One product, two answers.
   */
  let {
    register,
    first = false,
    label,
    autofocus = false,
    problems = $bindable<string[]>([]),
  }: {
    register: string;
    first?: boolean;
    /** What to call the title field. `19 §6`: the first screen asks for a fact, not for a column. */
    label?: string | undefined;
    autofocus?: boolean;
    problems?: string[];
  } = $props();

  /**
   * THE CARET GOES IN THE FIRST FIELD, WHICH IT NEVER DID.
   *
   * `/start` held `let field = $state<HTMLInputElement>()` and called `field?.focus()` in a
   * microtask after every pick — and no `bind:this={field}` existed anywhere in that file, so the
   * call was a no-op for the life of the screen. `document.activeElement` was `BODY` at 0, 50, 150,
   * 400 and 900 ms after choosing a tile. `19 §6` budgets thirty seconds from landing to typing one
   * true fact; the budget could not start until somebody noticed the box and clicked it.
   *
   * THE BINDING IS ON THE FIELD'S WRAPPER, not on an input. This form draws nine different controls
   * depending on the declared type, so one `bind:this` per branch is nine places to forget; the
   * wrapper is always there and always holds exactly one control.
   */
  let firstField = $state<HTMLElement | undefined>(undefined);
  let placed = false;

  $effect(() => {
    if (!autofocus || placed || !firstField) return;
    placed = true;
    firstField.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
  });

  const decl = $derived(REGISTERS[register]);

  /** Four weeks out, from the record's clock. */
  const soon = new Date(NOW + 28 * 86_400_000).toISOString().slice(0, 10);

  /**
   * `secret` never appears. Not disabled, not greyed — absent, with the reason said once.
   *
   * AND ON THE FIRST RUN, THE FEWEST FIELDS THAT MAKE A TRUE ROW. `19 §6`: "their first act is
   * typing one true fact about their own business, and it takes under thirty seconds", which eight
   * fields is not. The title and the required ones are what the register itself says cannot be left
   * out — so a money register asks for an amount because it DECLARES one, and a people register does
   * not ask for a due date because it declares none.
   *
   * THE ALTERNATIVE WAS ONE HARD-CODED FORM FOR FIVE QUESTIONS, and it was there: a text box and a
   * `Due` date, whatever was chosen. "What is it, and how much?" over a form with no amount, on the
   * first screen of a product about money; and a person, asked when they are due.
   */
  const fields = $derived(
    first ? readableFields(register).filter((f) => f.required || f.id === decl?.title) : readableFields(register),
  );

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
  /* The label needs an id of its own now that the segmented control points at it rather than at an
     input it does not render. */
  const labelId = (f: FieldDecl) => `${id(f)}-label`;

  /**
   * Which value each enum segment shows as chosen.
   *
   * IT WAS PINNED TO INDEX 0 AND NOTHING SET IT. Every enum with four values or fewer — Direction,
   * State, Kind, Role — rendered as a picker that always showed the first value selected and could
   * not be changed: no `onclick`, and `data-on={i === 0}`. The `>4` branch beside it uses a real
   * `<select>` and has always worked, so a register's form was half live and half a drawing of one,
   * with no way to tell which from looking.
   *
   * THE FIRST VALUE IS STILL THE DEFAULT, because a declaration's first enum value is what a row
   * starts as and a picker opened on nothing makes somebody choose before they have read the form.
   * What changed is that it is now a starting point rather than the only point.
   */
  let chosen = $state<Record<string, string>>({});
  const pick = (f: FieldDecl): string => chosen[f.id] ?? f.values?.[0] ?? '';

  /**
   * WHAT A PERSON HAS TYPED INTO A MONEY FIELD, and whether the record would take it.
   *
   * THIS IS THE ONE PLACE MONEY IS TYPED INTO THIS PRODUCT, and the input took anything:
   * `1234.56abc-12` was accepted and displayed as typed, and so was `4800.499` — a fraction of a
   * penny, which is the exact bug minor units exist to stop. `coerce.ts` refuses both, correctly and
   * later; a person who finds out at submit has typed a whole row first.
   *
   * THE EXPONENT IS THE CURRENCY'S. Two decimals is most currencies and not all of them: `JPY 1250`
   * is 1,250 yen and `KWD 1.250` is one and a quarter dinars, and a field that assumed two would
   * refuse the second and silently mangle the first.
   */
  /**
   * AND EVERY OTHER FIELD IS HELD TOO, which it was not.
   *
   * ONLY `money` WAS BOUND. Every text box, date, number and document on this form was uncontrolled
   * — the DOM held what you typed and nothing else did — so the form could not answer "is the
   * required Description empty?" at all. That is why the button could not be disabled: not a
   * decision, an absence.
   *
   * THE DEADLINE DEFAULT IS SEEDED HERE rather than as a `value` attribute, because a value the
   * component does not hold is a value it cannot count as filled: the date arrived pre-filled on
   * screen and read as missing to everything else.
   */
  const seed = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of readableFields(register)) {
      if (first && f.deadline && f.type === 'day') out[f.id] = soon;
      /* AND A LONG ENUM OPENS ON ITS FIRST VALUE, the same as the segmented control beside it — a
         `<select>` bound to `undefined` shows nothing chosen, which is not what a register with a
         nine-value enum means by "the default". */
      if (f.type === 'enum' && (f.values?.length ?? 0) > 4 && f.values?.[0]) out[f.id] = f.values[0];
    }
    return out;
  };
  let typed = $state<Record<string, string>>(seed());

  /** `bool` is never missing: unchecked is an answer, and it is the one the record stores. */
  let ticked = $state<Record<string, boolean>>({});

  const wrong = (f: FieldDecl): string | null => {
    const raw = (typed[f.id] ?? '').trim();
    if (raw === '') return null;
    const exp = exponentOf(currencyFor(register, f.id) ?? 'GBP');
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return copy.moneyShape;
    const places = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
    return places > exp ? copy.moneyPlaces(exp) : null;
  };

  /**
   * WHAT THE REGISTER ITSELF SAYS CANNOT BE LEFT OUT, and is.
   *
   * `f.required` was already rendered beside the label and enforced nowhere — a form that marks a
   * field required and takes it empty has told somebody a rule and then not kept it, which is worse
   * than never marking it. `enum` and `bool` are never in here: a segmented control opens on its
   * first value and an unchecked box is `false`, so both always carry an answer.
   */
  const missing = $derived(
    fields
      .filter((f) => f.required && f.type !== 'bool' && !(f.type === 'enum' && (f.values?.length ?? 0) <= 4))
      .filter((f) => (typed[f.id] ?? '').trim() === '')
      .map((f) => labelOf(f)),
  );

  /** Which fields hold something the record would refuse. The sentence itself is already under them. */
  const bad = $derived(fields.filter((f) => f.type === 'money' && wrong(f) !== null).map((f) => labelOf(f)));

  /** Every problem this form can see, for whoever owns the button that submits it. */
  const found = $derived([
    ...(missing.length > 0 ? [copy.rowRequired(missing)] : []),
    ...(bad.length > 0 ? [copy.rowFieldProblem(bad)] : []),
  ]);

  /* BOUND OUT ON EVERY CHANGE, so the button is disabled while the reason is on screen rather than
     after a press. `$effect` and not `$derived` because it crosses the component boundary. */
  $effect(() => {
    problems = found;
  });
</script>

<form class="row-form" onsubmit={(e) => e.preventDefault()}>
  {#each fields as f, i}
    <div class="row-field" data-type={f.type} {@attach (el) => void (i === 0 && (firstField = el))}>
      <!-- `for` ONLY WHERE THERE IS SOMETHING TO POINT AT. The segmented branch renders no element
           carrying `id(f)`, so both the label's `for` and the group's `aria-labelledby` pointed at
           an id that does not exist — which is a label announced as attached to nothing. -->
      <label class="row-label" id={labelId(f)} for={f.type === 'enum' && (f.values?.length ?? 0) <= 4 ? undefined : id(f)}>
        <!-- ON THE FIRST RUN THE TITLE FIELD IS ASKED FOR AS A FACT. `copy.firstField` had a
             sentence per register — "Your first invoice", "The first person" — and was referenced
             nowhere, so the one screen `19 §6` writes a budget for asked for `Description`. -->
        {label && f.id === decl?.title ? label : labelOf(f)}
        <!-- Required is marked on the LABEL and spelled out, never as a bare asterisk: an asterisk
             is a convention you have to already know, and it is announced as "star". -->
        {#if f.required}<span class="row-required">{copy.required}</span>{/if}
      </label>

      {#if f.type === 'enum' && (f.values?.length ?? 0) <= 4}
        <div class="segmented" role="group" aria-labelledby={labelId(f)}>
          {#each f.values ?? [] as value}
            <button
              type="button"
              class="segment"
              data-on={pick(f) === value ? '' : undefined}
              aria-pressed={pick(f) === value ? 'true' : 'false'}
              onclick={() => (chosen = { ...chosen, [f.id]: value })}
            >
              {value.replace(/_/g, ' ')}
            </button>
          {/each}
        </div>
      {:else if f.type === 'enum'}
        <select class="row-input" id={id(f)} bind:value={typed[f.id]}>
          {#each f.values ?? [] as value}<option value={value}>{value.replace(/_/g, ' ')}</option>{/each}
        </select>
      {:else if f.type === 'ref'}
        <select class="row-input" id={id(f)} bind:value={typed[f.id]}>
          <option value="">{copy.noneChosen}</option>
          {#each options(f) as o}<option value={String(o.value)}>{o.label}</option>{/each}
        </select>
      {:else if f.type === 'money'}
        <div class="field money">
          <!-- The currency is printed rather than typed, and it is READ FROM THE FIELD'S OWN ROWS
               rather than from a constant. A free-text currency box is how two of them end up added
               together; a constant is how one of them ends up wearing the other's code. A field
               whose rows disagree shows no code at all, which is the honest state of that field. -->
          {#if currencyFor(register, f.id)}<span class="money-unit">{currencyFor(register, f.id)}</span>{/if}
          <input
            class="field-input num"
            id={id(f)}
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            bind:value={typed[f.id]}
            aria-invalid={wrong(f) ? 'true' : undefined}
            aria-describedby={wrong(f) ? `${id(f)}-why` : undefined}
          />
        </div>
        <!-- SAID WHERE IT WAS TYPED, not at submit. A value the record will refuse is worth knowing
             about while the caret is still in the field. -->
        {#if wrong(f)}<p class="row-why" id="{id(f)}-why">{wrong(f)}</p>{/if}
      {:else if f.type === 'day'}
        <!-- PRE-FILLED FROM THE RECORD'S OWN CLOCK ON THE FIRST RUN, and not from a literal: a
             hardcoded date is a past date within weeks, on the one screen where a wrong default is
             the first thing anybody sees. Four weeks is a plausible term somebody overwrites, and
             `deadline:` is the register saying which field is the one a date belongs on. -->
        <div class="field">
          <input class="field-input" id={id(f)} type="date" bind:value={typed[f.id]} />
        </div>
      {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
        <div class="field">
          <input class="field-input num" id={id(f)} type="text" inputmode="decimal" bind:value={typed[f.id]} />
          {#if f.unit}<span class="money-unit">{f.unit}</span>{/if}
        </div>
      {:else if f.type === 'bool'}
        <label class="row-check"><input id={id(f)} type="checkbox" bind:checked={ticked[f.id]} /> {copy.yes}</label>
      {:else if f.type === 'document'}
        <textarea class="row-input row-area" id={id(f)} rows="4" bind:value={typed[f.id]}></textarea>
      {:else}
        <div class="field"><input class="field-input" id={id(f)} type="text" bind:value={typed[f.id]} /></div>
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

  /* THE COLOUR IS NOT THE MESSAGE. Somebody who cannot tell the two reds apart still reads the
     sentence, which is why there is one. */
  .row-why {
    margin-block: var(--sp-1) 0;
    color: var(--danger);
    font-size: var(--t-sm);
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
