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
  currency is one somebody chose and not something you type. `secret` is refused outright: a
  credential never goes in a row, and the vault is a different surface with different rules.

  Nothing here writes. What was typed goes out through `taken`, in the shapes the record stores, to
  the screen that owns the submit.
-->
<script lang="ts">
  import { currencyFor, labelOf, readableFields } from '../record/api.ts';
  import { REGISTERS, refOptions } from '../record/held.ts';
  import type { FieldDecl, Fields } from '../record/schema.ts';
  import { exponentOf } from 'braindog-render';
  import { amountWrong, currencyTypedIn, moneyTyped } from './money-typed.ts';
  import { copy } from '../copy.ts';
  import { valueSaid } from '../voice.ts';
  import { firstAsks } from '../first-run.ts';
  import DayBox from './DayBox.svelte';
  import FileField from './FileField.svelte';
  import Icon from './Icon.svelte';
  import { fileOf, isFile } from '../record/field-draft.ts';

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
    taken = $bindable<Fields>({}),
    given = {},
    values = {},
  }: {
    register: string;
    first?: boolean;
    /** What to call the title field. `19 §6`: the first screen asks for a fact, not for a column. */
    label?: string | undefined;
    autofocus?: boolean;
    problems?: string[];
    /**
     * WHAT SOMEBODY ACTUALLY TYPED, so the screen that owns the submit can do something with it.
     *
     * IT WENT NOWHERE. This form held every value and handed out only `problems`, so the two
     * screens that submit it could say whether the row was valid and not what the row was. On the
     * first run that is the worst friction of all: four clicks,
     * twenty-five keystrokes and zero rows, because the one control that matters had nothing to
     * pass on.
     */
    taken?: Fields;
    /**
     * WHAT THE CHOICE HAS ALREADY ANSWERED, in the first-row mode (`first`): the caller's row for this
     * register. Each value goes into `typed`, the map a press and a keystroke write, so the row
     * carries it exactly as if it had been chosen and the form does not ask for it.
     */
    given?: Readonly<Record<string, string>> | undefined;
    /**
     * WHAT AN EXISTING ROW ALREADY HOLDS, outside the first-row mode, so a panel can draw every declared field of a row
     * that is there rather than only the five it knew by name. Each value is the text a person would have typed (an
     * amount as `48.00`, a day as `2026-10-02`), and a yes-or-no field reads `true` as ticked. The first run ignores it:
     * there is no row yet, only what the choice answered (`given`).
     */
    values?: Readonly<Record<string, string>> | undefined;
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
   * THE BINDING IS ON THE FORM, not on an input. This draws nine different controls depending on the
   * declared type, so one `bind:this` per branch is nine places to forget — and the form is always
   * there, in document order, so its first focusable descendant IS the first field.
   */
  let form = $state<HTMLElement | undefined>(undefined);
  let placed = false;

  $effect(() => {
    if (!autofocus || placed || !form) return;
    placed = true;
    form.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
  });

  const decl = $derived(REGISTERS[register]);

  /** Four weeks out, from today. It was four weeks from the sample's 3 September 2026, which is 1 October whatever the
      day: six days out on the 25th, and a due date in the past from October on. */
  const soon = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);

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
   *
   * AND NOT A REQUIRED FIELD THE CHOICE HAS ALREADY ANSWERED. Every required field made Money five
   * fields for one row, as measured: `Which way` opened on `owed by me`
   * under "Your first invoice", so the default most people accept recorded the invoice backwards,
   * and `Status` offered `part` and `written off` to somebody who had not made a row yet. Both are
   * still required. `given` carries the answers the choice implies, `seed` below puts them where a
   * press would, and `firstAsks` leaves them off the form, so Money asks for the title, the amount
   * its question names, and the due date it pre-fills.
   */
  const fields = $derived(first ? firstAsks(readableFields(register), decl?.title, given) : readableFields(register));

  /**
   * The rows a `ref` can point at, titled the way a person says them: the record's rows, as this tab last walked them.
   *
   * THEY WERE THE SAMPLE'S, on every record. `held.ts` says what was offered and what the number then pointed at.
   */
  const options = (f: FieldDecl): { value: number; label: string }[] => (f.to ? refOptions(f.to) : []);

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
   *
   * AND THEN IT HELD THE CHOICE IN A MAP NOTHING ELSE READ, WHICH IS THE SAME BUG ONE STEP ALONG.
   *
   * That fix made the segments pressable and put the value in `chosen`, and `chosen` was read
   * by exactly one thing: the segments' own `tabindex`, `data-on` and `aria-checked`. The effect
   * that builds `taken` reads `typed` and `ticked`, so the control moved, announced
   * `aria-checked="true"` on the value somebody pressed, and contributed nothing to the row. Twelve
   * of the thirteen enums this record declares are four values or fewer, so on nearly every form in
   * the product pressing a segment was a drawing of a press. A row added from `/r/obligations`
   * arrived with `Which way` and `State` both showing an em dash, and the submit button was live
   * with two required fields absent because `missing` excused enums on the same test.
   *
   * ONE MAP. `typed` is where a `<select>`, a text box and a date already put their answers, and it
   * is what `taken` reads, so a segment writing anywhere else can only ever be a second source of
   * truth with one reader.
   */
  /* AN ENUM OPENS ON ITS DECLARED DEFAULT, which the record fills when nobody says, and on its first value otherwise: Work's
     tasks list Backlog first and a new task is To do. */
  const firstOf = (f: FieldDecl): string =>
    typeof f.default === 'string' && f.values?.includes(f.default) ? f.default : (f.values?.[0] ?? '');
  const pick = (f: FieldDecl): string => typed[f.id] ?? firstOf(f);

  /**
   * WHAT A PERSON TYPES INTO A MONEY FIELD IS HELD AS TEXT AND CHECKED AS THEY TYPE IT. The input
   * once took anything: `1234.56abc-12` was accepted and displayed as typed, and so was `4800.499`, a
   * fraction of a penny, which is the exact bug minor units exist to stop. `money-typed.ts` says what
   * the record would refuse, and in which currency the amount goes.
   *
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
    /* ONLY WHAT THE FORM DRAWS, AND IT WALKED EVERY READABLE FIELD. On the first run that filled
       fields the form did not show: a task added from the Work tile arrived with "Due 1 Oct 2026, in
       4w" on its own page, as measured, a date nobody was shown, on a
       field Tasks does not require. The row now carries what is on the screen and what the choice
       answered, and nothing else. */
    for (const f of fields) {
      if (first && f.deadline && f.type === 'day') out[f.id] = soon;
      /* AND AN ENUM OPENS ON ITS FIRST VALUE, whichever control it draws as. This seeded only the
         `<select>` arm, on the argument that a select bound to `undefined` shows nothing chosen;
         the segmented control beside it looked selected and was not, so the two arms of one field
         type disagreed about what "the default" means and only the long one carried its answer into
         the row. */
      if (f.type === 'enum' && f.values?.[0]) out[f.id] = firstOf(f);
    }
    if (first) return { ...out, ...given };
    for (const f of fields) if (f.type !== 'bool' && values?.[f.id] !== undefined) out[f.id] = values[f.id]!;
    return out;
  };
  let typed = $state<Record<string, string>>(seed());

  /** `bool` is never missing: unchecked is an answer, and it is the one the record stores. */
  const seedTicked = (): Record<string, boolean> =>
    first ? {} : Object.fromEntries(fields.filter((f) => f.type === 'bool' && values?.[f.id] !== undefined).map((f) => [f.id, values?.[f.id] === 'true']));
  let ticked = $state<Record<string, boolean>>(seedTicked());

  /**
   * THE CURRENCY THIS LIST'S ROWS ARE IN, one of the currencies a new amount can go in. The field's
   * declared currency comes before it and the record's own after it (`money-typed.ts`); it was the
   * only one read, and `'GBP'` stood in for the rest.
   */
  const listed = (f: FieldDecl): string | null => currencyFor(register, f.id);

  /**
   * The typed values, in the shapes the record stores, handed back to whoever owns the submit.
   *
   * A `money` IS AN AMOUNT AND A CURRENCY and the box holds only the amount, so it is put back
   * together here rather than at the two call sites: a screen that reconstructed it would be a
   * second place that knows the minor-unit exponent, and the first thing to drift.
   *
   * AN EMPTY BOX IS AN ABSENT KEY AND NOT AN EMPTY STRING. A write stores neither, and a row
   * carrying `note: ''` reads as a note somebody wrote and left blank.
   */
  $effect(() => {
    const out: Fields = {};
    for (const f of readableFields(register)) {
      if (f.type === 'bool') {
        if (ticked[f.id] !== undefined) out[f.id] = ticked[f.id]!;
        continue;
      }
      const raw = (typed[f.id] ?? '').trim();
      if (raw === '') continue;
      /* A FILE IS HELD AS ITS VALUE WRITTEN OUT (`FileField`), and goes as the object the record stores; a draft that
         names no file writes nothing. `Fields` does not list the file's shape, so it is cast as `patchOf`'s is. */
      if (isFile(f)) {
        const file = fileOf(raw);
        if (file !== null) out[f.id] = file as unknown as Fields[string];
        continue;
      }
      if (f.type === 'money') {
        /* NOTHING IS WRITTEN FOR AN AMOUNT THE RECORD WOULD REFUSE, a missing currency among them: the
           sentence under the box says why, and the button is disabled while it is there. */
        const money = moneyTyped(f, raw, listed(f));
        if (money !== null) out[f.id] = money;
        continue;
      }
      out[f.id] = f.type === 'int' || f.type === 'decimal' ? Number(raw) : raw;
    }
    taken = out;
  });

  const wrong = (f: FieldDecl): string | null => amountWrong(f, typed[f.id] ?? '', listed(f));

  /**
   * WHAT THE REGISTER ITSELF SAYS CANNOT BE LEFT OUT, and is.
   *
   * `f.required` was already rendered beside the label and enforced nowhere — a form that marks a
   * field required and takes it empty has told somebody a rule and then not kept it, which is worse
   * than never marking it. `bool` is never in here: an unchecked box is `false`, which is an answer.
   *
   * AN ENUM USED TO BE EXCUSED HERE TOO, on the argument that a segmented control always carries an
   * answer, and that argument was true of the drawing and false of the row: the value went into a
   * map `taken` never read, so the excuse kept the button live over two required fields that
   * arrived empty. Now that every enum is seeded into `typed` the excuse is not needed, and an enum
   * that somehow declares no values is caught rather than waved through.
   */
  const missing = $derived(
    fields
      .filter((f) => f.required && f.type !== 'bool')
      .filter((f) => (typed[f.id] ?? '').trim() === '')
      /* THE LABEL ON THE SCREEN, not the declaration's. On the first run the title field is asked
         for as a fact — "Your first invoice" — and this sentence went on naming it `Description`,
         which is a field nobody on that screen can see. */
      .map((f) => (label && f.id === decl?.title ? label : labelOf(f))),
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

<!--
  A `div` AND NOT A `form`, WHICH IS THE FIX FOR TWO THINGS AT ONCE.

  IT WAS A `<form>` WITH `onsubmit={(e) => e.preventDefault()}`, and on the first-run screen it sat
  INSIDE another `<form>`. Nested forms are invalid HTML: the parser closes the outer one at the
  inner tag, and this survives only because `ssr = false` builds the DOM by script rather than by
  the parser. It would have broken the moment anything server-rendered it.

  AND IT SWALLOWED ENTER. `preventDefault` on submit means pressing Enter in any field of a new-row
  sheet did nothing at all, with no feedback: the true silent no-op, and the one thing a person
  types Enter for. A `div` has no submit to swallow, so the key reaches whichever screen owns the
  control that acts on it, which is where the decision about what a row IS already lives.

  The element is still the caret's anchor, which is the only thing the ref was ever for.
-->
<div class="row-form" bind:this={form}>
  {#each fields as f, i}
    <div class="row-field" data-type={f.type}>
      <!-- `for` ONLY WHERE THERE IS SOMETHING TO POINT AT. The segmented branch renders no element
           carrying `id(f)`, so both the label's `for` and the group's `aria-labelledby` pointed at
           an id that does not exist — which is a label announced as attached to nothing. -->
      <label class="row-label" id={labelId(f)} for={f.type === 'enum' && (f.values?.length ?? 0) <= 4 ? undefined : id(f)}>
        <!-- ON THE FIRST RUN THE TITLE FIELD IS ASKED FOR AS A FACT. `firstRun.firstField` had a
             sentence per register — "Your first invoice", "The first person" — and was referenced
             nowhere, so the one screen `19 §6` writes a budget for asked for `Description`. -->
        {label && f.id === decl?.title ? label : labelOf(f)}
        <!-- Required is marked on the LABEL and spelled out, never as a bare asterisk: an asterisk
             is a convention you have to already know, and it is announced as "star". -->
        <!-- AND THE ATTRIBUTE, NOT ONLY THE WORD. The first-run form said the word `required` five
             times over zero fields carrying it: the form said the rule and
             the browser did not know it, so a screen reader announced nothing, autofill treated
             every field alike, and the only thing enforcing it was this component's own count. The
             submit is still what refuses, with a sentence naming the fields; this is the browser
             being told the same fact. -->
        <!-- AND ON THE FIRST RUN THE WORD GOES AND THE ATTRIBUTE STAYS. Everything that form draws
             is a field the register requires (`firstAsks` is the title and the required fields the
             choice has not answered), so the word marked every field and told a reader nothing
             about any one of them: five on five fields when it was measured. The attribute still
             tells the browser, and the sentence beside the dead button still names what is empty. -->
        {#if f.required && !first}<span class="row-required">{copy.required}</span>{/if}
      </label>

      {#if f.type === 'enum' && (f.values?.length ?? 0) <= 4}
        <!--
          A RADIOGROUP AND NOT FOUR TOGGLE BUTTONS, WHICH IS FOUR TAB STOPS.

          It was `role="group"` over buttons carrying `aria-pressed`, which is a legitimate pattern
          for four independent toggles and is the wrong one for four values of one field: every
          segment took its own tab stop, so there were twelve tab stops serving five
          fields on the first-run form, and a screen reader announced four separate pressed states
          rather than one choice with four options.

          A RADIOGROUP IS ONE TAB STOP AND THE ARROWS MOVE INSIDE IT, which is the same composite
          pattern the grid and the board already use, and it announces "Direction, owed to me, radio
          button, 2 of 2". Roving `tabindex`, so tabbing lands on the chosen value rather than on
          the first one: what is selected is where the caret belongs.

          THE ARROWS SELECT AS THEY MOVE, which is what a radiogroup does and what makes it one tab
          stop rather than one tab stop and a confirm. Nothing here is destructive and every value
          is one press from every other, so there is nothing to protect a reader from.
        -->
        <div class="segmented" role="radiogroup" aria-labelledby={labelId(f)}>
          {#each f.values ?? [] as value, i}
            <button
              type="button"
              class="segment"
              role="radio"
              tabindex={pick(f) === value ? 0 : -1}
              data-on={pick(f) === value ? '' : undefined}
              aria-checked={pick(f) === value ? 'true' : 'false'}
              onclick={() => (typed = { ...typed, [f.id]: value })}
              onkeydown={(e) => {
                const values = f.values ?? [];
                const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (step === 0) return;
                e.preventDefault();
                /* WRAPPING, because a radiogroup wraps: it is a ring of values rather than a list
                   with ends, and stopping at one would make the last value the expensive one. */
                const next = values[(i + step + values.length) % values.length];
                if (next === undefined) return;
                typed = { ...typed, [f.id]: next };
                (e.currentTarget.parentElement?.children[(i + step + values.length) % values.length] as HTMLElement | undefined)?.focus();
              }}
            >
              {valueSaid(f, value)}
            </button>
          {/each}
        </div>
      {:else if f.type === 'enum'}
        <select class="row-input" id={id(f)} required={f.required} bind:value={typed[f.id]}>
          {#each f.values ?? [] as value}<option value={value}>{valueSaid(f, value)}</option>{/each}
        </select>
      {:else if f.type === 'ref'}
        <select class="row-input" id={id(f)} required={f.required} bind:value={typed[f.id]}>
          <option value="">{copy.noneChosen}</option>
          {#each options(f) as o}<option value={String(o.value)}>{o.label}</option>{/each}
        </select>
      {:else if f.type === 'money'}
        <!-- The currency is printed rather than typed, and it is THE ONE THE AMOUNT WILL BE WRITTEN
             IN: the field's declared currency, else its rows', else the record's own. A free-text
             currency box is how two of them end up added together; a constant is how one of them
             ends up wearing the other's code. With none known no code is drawn, and an amount
             typed here is not written: the sentence under the box says so. The placeholder shows
             that currency's own places, so a yen box does not invite the decimals it refuses. -->
        {@const unit = currencyTypedIn(f, listed(f))}
        <div class="field money">
          {#if unit}<span class="money-unit">{unit}</span>{/if}
          <input
            class="field-input num"
            id={id(f)}
            type="text"
            inputmode="decimal"
            placeholder={unit ? (0).toFixed(exponentOf(unit)) : '0'}
            required={f.required}
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
        <DayBox id={id(f)} label={labelOf(f)} bind:value={typed[f.id]} />
      {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
        <div class="field">
          <input class="field-input num" id={id(f)} type="text" inputmode="decimal" required={f.required} bind:value={typed[f.id]} />
          {#if f.unit}<span class="money-unit">{f.unit}</span>{/if}
        </div>
      {:else if f.type === 'bool'}
        <label class="row-check"><input id={id(f)} type="checkbox" bind:checked={ticked[f.id]} /> {copy.yes}</label>
      {:else if f.type === 'document'}
        <textarea class="row-input row-area" id={id(f)} rows="4" required={f.required} bind:value={typed[f.id]}></textarea>
      {:else if isFile(f)}
        <!-- A FILE IS CHOSEN, NEVER TYPED: the picker sends the bytes and the draft holds what came back. -->
        <FileField id={id(f)} label={labelOf(f)} bind:value={typed[f.id]} />
      {:else}
        <div class="field"><input class="field-input" id={id(f)} type="text" required={f.required} bind:value={typed[f.id]} /></div>
      {/if}
    </div>
  {/each}

  {#if (decl?.fields ?? []).some((f) => f.type === 'secret')}
    <p class="row-note">
      <Icon name="vault" size="s" />
      {copy.secretsLiveInTheVault}
    </p>
  {/if}
</div>

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
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* THE COLOUR IS NOT THE MESSAGE. Somebody who cannot tell the two reds apart still reads the
     sentence, which is why there is one. */
  .row-why {
    margin-block: var(--sp-1) 0;
    color: var(--danger-text);
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
    min-block-size: max(40px, var(--ctl-h));
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 0;
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
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
