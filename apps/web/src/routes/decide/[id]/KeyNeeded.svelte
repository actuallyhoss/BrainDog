<!--
  One key an arrangement needs, on its sitting page (REC-A07): its label, what it opens, that a scheduled run uses it,
  whether the record holds it, and a field to put it in without leaving the question.

  SEALED AS THE KEYS SCREEN SEALS ONE. The value goes once to `putKey` with `sealed_under: 'connector'`, as the Keys
  screen sends it with its switch on (`vault/+page.svelte`, `saveKey`), so a scheduled run can open it and the approval
  is not refused for a key only a person may open. The host seals it; the record is handed sealed bytes.

  THE VALUE NEVER REACHES A LOG LINE OR THE PAGE'S TEXT. It lives in the field, is emptied whatever comes back, and the
  toast and the tick say only the label. While the vault is behind a passphrase the record says so on the first try,
  and the passphrase field appears for the second, sent with that one request and emptied too.

  HELD IS A TICK AND A WORD; NEEDED IS THE DEEPER RED AND A WORD, never the colour alone. With no client (the queue, a
  reader who may not answer) the key is only said, with no field.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { wantsPassphrase, words as vaultWords } from '$lib/record/vault.ts';
  import type { createClient } from '@braindog/client';
  import PassField from '../../vault/PassField.svelte';
  import type { Need } from './arranged.ts';

  type KeyClient = Pick<ReturnType<typeof createClient>, 'putKey'>;

  let { need, at, client, onheld }: { need: Need; at: number; client?: KeyClient | undefined; onheld?: (() => unknown) | undefined } = $props();

  let value = $state('');
  let opens = $state('');
  let passphrase = $state('');
  let locked = $state(false);
  let saving = $state(false);
  let said = $state('');

  const held = $derived(need.held === 'connector');
  /* A NEW KEY SAYS WHAT IT OPENS or the record refuses it, so when the arrangement could not say (a script calling
     several hosts, a call with none declared) the person is asked. A key held only for a person keeps its own. */
  const asksOpens = $derived(need.opens === '' && need.held !== 'person');

  async function keep(e: SubmitEvent) {
    e.preventDefault();
    if (!client || saving || value === '' || (asksOpens && opens.trim() === '')) return;
    saving = true;
    said = '';
    const args = {
      label: need.label,
      value,
      /* WHAT IT OPENS is the arrangement's when it said one (`needsOf` gives one host or nothing), else the person's. */
      ...(need.opens !== '' ? { opens: need.opens } : asksOpens ? { opens: opens.trim() } : {}),
      sealed_under: 'connector' as const,
      ...(locked && passphrase !== '' ? { passphrase } : {}),
    };
    /* EMPTIED BEFORE THE ANSWER, so nothing on the page holds the value while the request is out. */
    value = '';
    passphrase = '';
    const out = await client.putKey(args);
    saving = false;
    if (!out.ok) {
      if (wantsPassphrase(out)) locked = true;
      said = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      return;
    }
    toasts.push(copy.arrangeNeedKept(need.label), { intent: 'good' });
    await onheld?.();
  }
</script>

<li class="need" data-held={held ? '' : undefined}>
  <div class="need-head">
    <span class="need-label"><Icon name="key" size="s" />{need.label}</span>
    {#if need.held === 'connector'}
      <span class="need-state need-held"><Icon name="check" size="s" />{copy.arrangeNeedHeld}</span>
    {:else if need.held !== null}
      <span class="need-state need-missing"><Icon name="alert" size="s" />{copy.arrangeNeedMissing}</span>
    {/if}
  </div>
  {#if need.opens}<p class="need-line">{copy.arrangeNeedOpens(need.opens)}</p>{/if}
  {#if need.scheduled}<p class="need-line">{copy.arrangeNeedScheduled}</p>{/if}
  {#if need.held === 'person'}<p class="need-line">{copy.arrangeNeedPerson(need.label)}</p>{/if}
  {#if client && !held}
    <form class="need-form" onsubmit={keep}>
      {#if asksOpens}
        <label class="field-label" for={`need-${at}-opens`}>{vaultWords.opensAsk}</label>
        <div class="field"><input class="field-input" id={`need-${at}-opens`} type="text" autocomplete="off" bind:value={opens} /></div>
        <p class="field-hint">{vaultWords.opensHint}</p>
      {/if}
      <PassField id={`need-${at}`} label={copy.arrangeNeedField} hint={copy.arrangeNeedHint} autocomplete="new-password" bind:value invalid={said !== ''} />
      {#if locked}
        <PassField id={`need-${at}-pass`} label={vaultWords.passField} hint={vaultWords.keyPassHint} autocomplete="current-password" bind:value={passphrase} />
      {/if}
      {#if said}<p class="need-said" role="status"><Icon name="alert" size="s" />{said}</p>{/if}
      <div class="need-act">
        <Button weight="primary" type="submit" disabled={saving || value === '' || (asksOpens && opens.trim() === '') || (locked && passphrase === '')}>
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
    border-block-start: 1px solid var(--field);
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
    font-size: var(--t-ui);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .need-state {
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .need-held {
    color: var(--ink2);
  }

  .need-held :global(.icon) {
    color: var(--action);
  }

  /* NEEDS YOU: the deeper red, with its mark and its word. */
  .need-missing,
  .need-said {
    color: var(--danger);
  }

  .need-line {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
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
    font-size: var(--t-sm);
  }

  .need-act {
    display: flex;
  }
</style>
