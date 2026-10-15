<!--
  Add a field to a list, from one of its rows: a name, a kind, the one more thing some kinds need, and one press.

  THE ONE MORE THING IS ASKED UNDER THE KIND, and only for the kind that needs it: a link picks what it points at from
  the record's own lists, by name; a choice takes its choices one a line; money says it is kept in the record's own
  currency, the only one a new field takes for now (`currencySaid`). Each missing piece is refused in one sentence
  (`fieldOf`), drawn under the form like any other.

  UNDER THE DECLARED FIELDS, because that is where a person notices a field is missing: reading a project and finding
  nowhere to put its domain. The field goes on every row of the list, and every screen that draws the list draws it
  without further code, because they all read the declaration the record answers (`remote.ts` `learn`).

  AN OWNER'S PRESS LANDS AT ONCE; ANYBODY ELSE'S WAITS ON DECIDE. The line under the form says which before the press,
  so a member is not surprised by a field that has not appeared. The record decides again either way. The rules, the
  kinds offered and the calls are `field-write.ts`, which the tests hold; this file draws them.

  NOT DRAWN UNTIL THE ROW IS THE RECORD'S. `live` is the row page's own answer, and until the record has answered, or
  after it refused, there is no list to add a field to. It drew a button whose only answer was "A field would be added to
  every row, but nothing was saved yet." on the sample, which is gone.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { ADDABLE, addField, fieldOf, linkable, type Addable } from '$lib/record/field-write.ts';
  import { fieldWords, KIND_WORDS, sheetWords } from '$lib/record/field-words.ts';
  import Button from '$lib/ui/Button.svelte';

  let { register, live, owner, onadded }: { register: string; live: boolean; owner: boolean; onadded?: () => void } = $props();

  let open = $state(false);
  let label = $state('');
  let kind = $state<Addable>('text');
  let to = $state('');
  let values = $state('');
  let busy = $state(false);
  /* READ WHEN THE KIND ASKS FOR THEM, never on a row page that only shows the button. */
  const lists = $derived(open && kind === 'ref' ? linkable() : []);
  const home = $derived(open && kind === 'money' ? homeCurrency() : null);
  /* THE SENTENCE UNDER THE FORM: this file's own for a name it can refuse without asking, the record's otherwise. */
  let problem = $state<string | null>(null);

  function start() {
    open = true;
    problem = null;
  }

  function stop() {
    open = false;
    label = '';
    kind = 'text';
    to = '';
    values = '';
    problem = null;
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const asked = fieldOf(register, label, kind, { to, values, currency: 'record' });
    if (!asked.ok) {
      problem = asked.fix;
      return;
    }
    busy = true;
    problem = null;
    const out = await addField(apiBase(), register, asked.field, owner);
    busy = false;
    /* A REFUSAL KEEPS WHAT WAS TYPED, under the record's own sentence. An owner's accept that did not land is still on
       Decide, which is said in the record's words too, so the form closes: pressing again would file it twice. */
    if (out.from === 'refused') {
      problem = out.fix;
      return;
    }
    stop();
    if (out.from === 'added') {
      toasts.push(fieldWords.added(asked.field.label));
      onadded?.();
    } else toasts.push(out.fix ?? fieldWords.filed(asked.field.label), out.fix ? { intent: 'warn' } : undefined);
  }
</script>

{#if open}
  <form class="add-field" onsubmit={add} aria-label={fieldWords.add}>
    <div class="add-line">
      <label class="add-part">
        <span class="add-label">{fieldWords.label}</span>
        <span class="field"><input class="field-input" type="text" maxlength="60" autocomplete="off" placeholder={fieldWords.placeholder} bind:value={label} /></span>
      </label>
      <label class="add-part">
        <span class="add-label">{fieldWords.kind}</span>
        <select class="add-kind" bind:value={kind}>
          {#each ADDABLE as k (k)}<option value={k}>{KIND_WORDS[k]}</option>{/each}
        </select>
      </label>
      {#if kind === 'ref'}
        <label class="add-part">
          <span class="add-label">{fieldWords.linkTo}</span>
          <select class="add-kind" bind:value={to}>
            <option value="" disabled>{lists.length === 0 ? sheetWords.noLists : fieldWords.pickLink}</option>
            {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </label>
      {:else if kind === 'enum'}
        <label class="add-part add-wide">
          <span class="add-label">{fieldWords.choices}</span>
          <textarea class="add-kind add-text" rows="3" bind:value={values}></textarea>
          <span class="add-help">{fieldWords.choicesHelp}</span>
        </label>
      {:else if kind === 'money'}
        <p class="add-help add-wide">{home === null ? fieldWords.noHome : fieldWords.inRecordCurrency(home)}</p>
      {/if}
      <div class="add-actions">
        <Button type="submit" weight="primary" disabled={busy}>{busy ? fieldWords.saving : fieldWords.save}</Button>
        <Button weight="bare" onclick={stop}>{fieldWords.cancel}</Button>
      </div>
    </div>
    <p class="add-note">{problem ?? (owner ? fieldWords.ownerNote : fieldWords.memberNote)}</p>
  </form>
{:else if live}
  <p class="add-open"><Button weight="quiet" onclick={start}>{fieldWords.add}</Button></p>
{/if}

<style>
  .add-open {
    margin: var(--sp-3) 0 0;
  }

  .add-field {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  /* NAME, KIND AND THE TWO BUTTONS ON ONE LINE WHERE THERE IS ROOM, each wrapping under the last where there is not. */
  .add-line {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--sp-3);
  }

  .add-part {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
    flex: 1 1 12rem;
  }

  .add-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .add-kind {
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /* THE CHOICES BOX TAKES THE WHOLE LINE, since a choice is typed one a line and a narrow box hides them. */
  .add-wide {
    flex-basis: 100%;
  }

  .add-text {
    padding-block: var(--sp-2);
    resize: vertical;
  }

  .add-help {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A FINGER'S TARGET ON A PHONE: every picker and box is at least 44px tall on a coarse pointer. */
  @media (pointer: coarse) {
    .add-kind {
      min-block-size: 44px;
    }
  }

  .add-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .add-note {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
