<!--
  `inputs`: a few fields of one row to type into (`src/inputs.ts`), each a labelled control of its field's type, every
  change handed to the host's `oninput` with the row it came from.

  WITH NO `oninput` IT IS A SPEC OF THE VALUES, the spec's own classes and nothing to type into, which is the tree
  `inputs` in `src/html.ts` draws and `src/dynamic-forms.test.ts` holds this file to. A field that cannot write is
  absent rather than disabled, the rule `Capture` keeps (`19 §6`).

  THE VALUE IS AN ATTRIBUTE THE RECORD HANDED BACK, never a draft held here: the host writes a change, reads the page
  again, and the next value arrives as a prop. A draft held in the component would be a second copy of the row that
  the verdict under it does not read.

  EXCEPT THE TEXT OF A BOX BEING TYPED INTO, which is the person's and not a copy of the row. With the value as the
  attribute alone, the re-read after a write reformatted a box under somebody's cursor, and the re-read after a
  conflict put the other person's figure over what they typed (`shownIn` in `src/input-hold.ts` says when it is kept). The
  hold only decides what the box shows; the host has already been handed every keystroke.

  EVERY CONTROL IS INSIDE ITS LABEL, so its name is the words beside it with no id to keep unique across a page that
  may carry the same field twice, and the hit area is the whole line.
-->
<script lang="ts">
  import { MISSING, inline, type Block, type RenderOptions } from '../src/index.ts';
  import { inputsPlan, isTicked, type OnInput } from '../src/inputs.ts';
  import { leftHold, shownIn, typedHold, type InputHold } from '../src/input-hold.ts';
  import Text from './Text.svelte';

  let { block, opts = {}, oninput }: { block: Block; opts?: RenderOptions; oninput?: OnInput | undefined } = $props();

  const plan = $derived(inputsPlan(block.rows));
  /* WHAT WAS TYPED, by field, while it is still the person's rather than the record's. */
  let holds = $state<Record<string, InputHold>>({});
</script>

{#if plan.fields.length === 0}
  <p class="inputs-empty">{plan.empty}</p>
{:else if oninput}
  <div class="inputs">
    {#each plan.fields as f}
      <label class="inputs-field">
        <span class="inputs-label">{f.label}</span>
        {#if f.control.tag === 'select'}
          <select class="inputs-box" name={f.field} onchange={(e) => oninput?.(f.row, e.currentTarget.value)}>
            <!-- A VALUE THAT IS NOT ONE OF THE CHOICES IS SHOWN AS IT STANDS, first, selected and not pickable. With no
                 option selected a browser shows the first choice, a value the record does not hold, and picking that
                 choice then fires no change, so the one value on screen was the one the person could not write. -->
            {#if !f.control.choices.includes(f.value.trim())}
              <option value={f.value.trim()} selected disabled>{f.value.trim() || MISSING}</option>
            {/if}
            {#each f.control.choices as choice}
              <option value={choice} selected={choice === f.value.trim()}>{choice}</option>
            {/each}
          </select>
        {:else if f.control.type === 'checkbox'}
          <!-- A yes or no is written as the record spells it, so the host has nothing to translate. -->
          <input
            class="inputs-check"
            type="checkbox"
            name={f.field}
            checked={isTicked(f.value)}
            onchange={(e) => oninput?.(f.row, e.currentTarget.checked ? 'true' : 'false')}
          />
        {:else}
          <input
            class="inputs-box"
            type={f.control.type}
            name={f.field}
            inputmode={f.control.inputmode}
            autocomplete="off"
            value={shownIn(f.value, holds[f.field])}
            oninput={(e) => {
              holds[f.field] = typedHold(e.currentTarget.value, f.value);
              oninput?.(f.row, e.currentTarget.value);
            }}
            onblur={() => {
              const hold = holds[f.field];
              if (hold) holds[f.field] = leftHold(hold, f.value);
            }}
          />
        {/if}
      </label>
    {/each}
  </div>
{:else}
  <div class="rows" data-inputs="">
    {#each plan.fields as f}
      <div class="row">
        <span class="row-label">{f.label}</span>
        <span class="row-value num">{#if f.value}<Text nodes={inline(f.value, opts)} {opts} />{:else}{MISSING}{/if}</span>
        <span class="row-note"></span>
      </div>
    {/each}
  </div>
{/if}
