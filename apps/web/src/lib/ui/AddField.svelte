<!--
  Add a field to a list, from one of its rows (DIRECTION §22): a name, a kind, and one press.

  UNDER THE DECLARED FIELDS, because that is where a person notices a field is missing: reading a project and finding
  nowhere to put its domain. The field goes on every row of the list, and every screen that draws the list draws it
  without further code, because they all read the declaration the record answers (`remote.ts` `learn`).

  AN OWNER'S PRESS LANDS AT ONCE; ANYBODY ELSE'S WAITS ON DECIDE. The line under the form says which before the press,
  so a member is not surprised by a field that has not appeared. The record decides again either way. The rules, the
  kinds offered and the calls are `field-write.ts`, which the tests hold; this file draws them.

  ON THE SAMPLE IT SAYS WHAT WOULD HAPPEN, as every write on the row page does, and sends nothing.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { ADDABLE, addField, fieldOf, type Addable } from '$lib/record/field-write.ts';
  import { fieldWords, KIND_WORDS } from '$lib/record/field-words.ts';
  import Button from '$lib/ui/Button.svelte';

  let { register, live, owner, onadded }: { register: string; live: boolean; owner: boolean; onadded?: () => void } = $props();

  let open = $state(false);
  let label = $state('');
  let kind = $state<Addable>('text');
  let busy = $state(false);
  /* THE SENTENCE UNDER THE FORM: this file's own for a name it can refuse without asking, the record's otherwise. */
  let problem = $state<string | null>(null);

  function start() {
    if (!live) {
      toasts.push(copy.notWritten(fieldWords.sample), { intent: 'warn' });
      return;
    }
    open = true;
    problem = null;
  }

  function stop() {
    open = false;
    label = '';
    kind = 'text';
    problem = null;
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const asked = fieldOf(register, label, kind);
    if (!asked.ok) {
      problem = asked.fix;
      return;
    }
    busy = true;
    problem = null;
    const out = await addField(location.origin, register, asked.field, owner);
    busy = false;
    /* A REFUSAL KEEPS WHAT WAS TYPED, under the record's own sentence. An owner's accept that did not land is still on
       Decide, which is said in the record's words too, so the form closes: pressing again would file it twice. */
    if (out.from === 'refused' || out.from === 'gone') {
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
      <div class="add-actions">
        <Button type="submit" weight="primary" disabled={busy}>{busy ? fieldWords.saving : fieldWords.save}</Button>
        <Button weight="bare" onclick={stop}>{fieldWords.cancel}</Button>
      </div>
    </div>
    <p class="add-note">{problem ?? (owner ? fieldWords.ownerNote : fieldWords.memberNote)}</p>
  </form>
{:else}
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
    min-block-size: max(var(--ctl-h), var(--tap));
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
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
