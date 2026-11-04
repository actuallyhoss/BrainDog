<!--
  A value a closed list does not hold yet, typed where a row's value is being picked, and added to the list in one press.

  THE MENU COULD ONLY OFFER WHAT WAS DECLARED. A project that was paused could be set to any of Building, Earning,
  Parked or Retired and to nothing else, and the only way to a fifth was a whole list written out by hand. The record
  already took `to: { add: { values } }` (`kernel/src/govern.ts` `addTo`, proved in `record/test/schema-add.test.ts`),
  and nothing in the app filed one.

  BESIDE THE EDITOR AND NOT INSIDE IT, because the editor is a form and a form cannot hold another. An owner's press
  lands at once and the new value is chosen in the editor above, so the save that follows is the ordinary one, with its
  own Put back. Anybody else's waits in Needs you, as a field does (`AddField.svelte`). Retiring a value is not offered:
  an addition only adds, and the record says to propose the whole list for anything else. The rules and the calls are
  `field-write.ts`, which the tests hold; this file draws them.

  ONLY EVER DRAWN ON A LIVE ROW: the editor it sits under does not open on the sample.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { addValue, valueOf, valueWords } from '$lib/record/field-write.ts';
  import { labelOf } from '$lib/record/api.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';

  let { register, field, owner, onadded }: { register: string; field: FieldDecl; owner: boolean; onadded?: (value: string) => void } = $props();

  let open = $state(false);
  let typed = $state('');
  let busy = $state(false);
  let problem = $state<string | null>(null);

  function stop() {
    open = false;
    typed = '';
    problem = null;
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const asked = valueOf(register, field.id, typed);
    if (!asked.ok) {
      problem = asked.fix;
      return;
    }
    busy = true;
    problem = null;
    const out = await addValue(apiBase(), register, field.id, asked.value, owner);
    busy = false;
    /* A REFUSAL KEEPS WHAT WAS TYPED, under the record's sentence. Anything else closes the form, because pressing again
       would file the same value twice. */
    if (out.from === 'refused') {
      problem = out.fix;
      return;
    }
    stop();
    if (out.from === 'added') {
      toasts.push(valueWords.added(asked.value, labelOf(field)));
      onadded?.(asked.value);
    } else toasts.push(out.fix ?? valueWords.filed(asked.value), out.fix ? { intent: 'warn' } : undefined);
  }
</script>

{#if open}
  <form class="add-value" onsubmit={add} aria-label={valueWords.add}>
    <div class="add-line">
      <label class="add-part">
        <span class="add-label">{valueWords.label}</span>
        <span class="field"><input class="field-input" type="text" maxlength="60" autocomplete="off" bind:value={typed} /></span>
      </label>
      <div class="add-actions">
        <Button type="submit" weight="primary" disabled={busy}>{busy ? valueWords.saving : valueWords.save}</Button>
        <Button weight="bare" onclick={stop}>{valueWords.cancel}</Button>
      </div>
    </div>
    <p class="add-note">{problem ?? (owner ? valueWords.ownerNote : valueWords.memberNote)}</p>
  </form>
{:else}
  <p class="add-open"><Button weight="bare" onclick={() => (open = true)}>{valueWords.add}</Button></p>
{/if}

<style>
  .add-open {
    margin: var(--sp-2) 0 0;
  }

  .add-value {
    margin-block-start: var(--sp-2);
  }

  /* THE BOX AND ITS TWO BUTTONS ON ONE LINE WHERE THERE IS ROOM, as `AddField` lays out its own. */
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

  /* A FIELD'S LABEL SITS ABOVE IT in the meta size and the second ink. */
  .add-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
  }

  .add-actions {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
  }

  /* WHETHER IT LANDS AT ONCE OR WAITS ON DECIDE, in the meta size: 12 is for a chart's axis and nothing else. */
  .add-note {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }
</style>
