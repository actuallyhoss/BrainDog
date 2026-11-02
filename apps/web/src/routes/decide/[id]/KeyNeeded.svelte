<!--
  One key an arrangement needs, on its sitting page: its label, what it opens, that a scheduled run uses it,
  whether the record holds it, and a field to put it in without leaving the question.

  SEALED AS THE KEYS SCREEN SEALS ONE. The value goes once to `putKey` with `sealed_under: 'connector'`, as the Keys
  screen sends it with its switch on (`keychain/+page.svelte`, `saveKey`), so a scheduled run can open it and the approval
  is not refused for a key only a person may open. The host seals it; the record is handed sealed bytes.

  THE VALUE NEVER REACHES A LOG LINE OR THE PAGE'S TEXT. It lives in the field until the record has kept it, and the
  toast and the tick say only the label. While the Keychain is behind a passphrase the record says so on the first try,
  and the passphrase field appears for the second with the key still typed; the passphrase is sent with that one
  request and emptied before it leaves (`key-needed.ts`).

  HELD IS A TICK AND A WORD; NEEDED IS THE DEEPER RED AND A WORD, never the colour alone. With no client (the queue, a
  reader who may not answer) the key is only said, with no field.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { words as keychainWords } from '$lib/record/keychain.ts';
  import PassField from '../../keychain/PassField.svelte';
  import type { Need } from './arranged.ts';
  import { keyHint, keyName } from '$lib/market/key-names.ts';
  import { asksOpens as asks, blankForm, keep as keepKey, ready, type KeyClient } from './key-needed.ts';

  let { need, at, client, onheld }: { need: Need; at: number; client?: KeyClient | undefined; onheld?: (() => unknown) | undefined } = $props();

  const form = $state(blankForm());
  let saving = $state(false);
  let said = $state('');

  const held = $derived(need.held === 'connector');
  const asksOpens = $derived(asks(need));
  /* SHOWN BY ITS NAME ("Stripe (read only)"), kept under its label. */
  const name = $derived(keyName(need.label));
  const hint = $derived(keyHint(need.label));

  async function keep(e: SubmitEvent) {
    e.preventDefault();
    if (!client || saving || !ready(need, form)) return;
    saving = true;
    said = '';
    const out = await keepKey(need, form, client);
    saving = false;
    if (!out.ok) {
      said = out.said;
      return;
    }
    toasts.push(copy.arrangeNeedKept(name), { intent: 'good' });
    await onheld?.();
  }
</script>

<li class="need" data-held={held ? '' : undefined}>
  <div class="need-head">
    <span class="need-label"><Icon name="key" size="s" />{name}</span>
    {#if need.held === 'connector'}
      <span class="need-state need-held"><Icon name="check" size="s" />{copy.arrangeNeedHeld}</span>
    {:else if need.held !== null}
      <span class="need-state need-missing"><Icon name="alert" size="s" />{copy.arrangeNeedMissing}</span>
    {/if}
  </div>
  {#if need.opens}<p class="need-line">{copy.arrangeNeedOpens(need.opens)}</p>{/if}
  {#if need.scheduled}<p class="need-line">{copy.arrangeNeedScheduled}</p>{/if}
  {#if need.held === 'person'}<p class="need-line">{copy.arrangeNeedPerson(name)}</p>{/if}
  {#if hint && !held}<p class="need-line">{hint}</p>{/if}
  {#if client && !held}
    <form class="need-form" onsubmit={keep}>
      {#if asksOpens}
        <label class="field-label" for={`need-${at}-opens`}>{keychainWords.opensAsk}</label>
        <div class="field"><input class="field-input" id={`need-${at}-opens`} type="text" autocomplete="off" bind:value={form.opens} /></div>
        <p class="field-hint">{keychainWords.opensHint}</p>
      {/if}
      <PassField id={`need-${at}`} label={copy.arrangeNeedField} hint={copy.arrangeNeedHint} autocomplete="new-password" bind:value={form.value} invalid={said !== ''} />
      {#if form.locked}
        <PassField id={`need-${at}-pass`} label={keychainWords.passField} hint={keychainWords.keyPassHint} autocomplete="current-password" bind:value={form.passphrase} />
      {/if}
      {#if said}<p class="need-said" role="status"><Icon name="alert" size="s" />{said}</p>{/if}
      <div class="need-act">
        <Button weight="primary" type="submit" disabled={saving || !ready(need, form)}>
          {saving ? copy.arrangeNeedSaving : copy.arrangeNeedSave}
        </Button>
      </div>
    </form>
  {/if}
</li>

<style>
  .need {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--tile-2);
  }

  .need:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .need-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
  }

  .need-label,
  .need-state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .need-label {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .need-state {
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .need-held {
    color: var(--ink-2);
  }

  .need-held :global(.icon) {
    color: var(--red-fill);
  }

  /* NEEDS YOU: the deeper red, with its mark and its word. */
  .need-missing,
  .need-said {
    color: var(--red);
  }

  .need-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .need-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
    max-inline-size: 36rem;
  }

  .need-said {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-meta);
  }

  .need-act {
    display: flex;
  }
</style>
