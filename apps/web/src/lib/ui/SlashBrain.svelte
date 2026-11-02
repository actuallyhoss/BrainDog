<!--
  Slash's brain, in Settings › Agents: Quick, Deep and, while a runner there is live, Claude on the owner's Mac. The words
  and the rules are `slash-brain.ts`; this file draws what they answer and sends what `deepPatchOf` says.

  EVERYONE SEES THE THREE LINES, since `status` is read by every signed-in person; ONLY THE OWNER GETS DEEP'S FORM, since
  `configure` refuses anyone else. The key is picked from the Keychain's API tokens in a `Sheet`, never typed, and the
  save that points Deep at a key passes the Keychain's own gate at the door.

  AT 390px IT IS ONE COLUMN: every row stacks and the fields are the column's width.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type SlashStatus } from '@braindog/client';
  import { keyNamed, keysOf, type KeyChoice } from '$lib/ui/slash-model.ts';
  import { centsOf, deepPatchOf, deepSaid, deepStartOf, quickSaid, words, type DeepStart } from '$lib/ui/slash-brain.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  let { owner = false, mac = false }: { owner?: boolean; mac?: boolean } = $props();

  let client: ReturnType<typeof createClient> | null = null;
  let status = $state<SlashStatus | null>(null);
  let start = $state<DeepStart | null>(null);
  let draft = $state<DeepStart>({ grant_id: null, cap: '10' });
  let saving = $state(false);
  let refusal = $state('');
  let keys = $state<KeyChoice[] | null>(null);
  let keysRefused = $state('');
  let picking = $state(false);

  const patch = $derived(start ? deepPatchOf(start, draft) : null);
  const capBad = $derived(centsOf(draft.cap) === null);
  const picked = $derived(keys === null ? null : keyNamed(keys, draft.grant_id));

  const fixOf = (out: { refusal: { fix: string } } | { conflict: unknown }): string =>
    'refusal' in out ? out.refusal.fix : 'Something changed while this was open. Try again.';

  /* THE KEYS ARE ASKED FOR WHEN HE OPENS THE PICKER, not on every Settings visit: `listGrants` is the Keychain's gate. */
  function loadKeys() {
    if (!client || keys !== null || keysRefused) return;
    void client.listGrants().then((out) => {
      if (out.ok) keys = keysOf(out.value);
      else keysRefused = fixOf(out);
    });
  }

  onMount(() => {
    if (!page.data.live || page.data.slash !== true) return;
    client = createClient({ base: apiBase() });
    void client.slashStatus().then((out) => {
      if (out.ok) status = out.value;
    });
    if (!owner) return;
    void client.slashSettings({}).then((out) => {
      if (!out.ok) return;
      start = deepStartOf(out.value);
      draft = { ...start };
      if (start.grant_id !== null) loadKeys();
    });
  });

  function openPicker() {
    loadKeys();
    picking = true;
  }

  function pick(id: string | null) {
    draft.grant_id = id;
    picking = false;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!client || !start || !patch || saving) return;
    saving = true;
    refusal = '';
    try {
      const out = await client.slashSettings(patch);
      if (!out.ok) {
        refusal = fixOf(out);
        return;
      }
      start = deepStartOf(out.value);
      draft = { ...start };
      const again = await client.slashStatus();
      if (again.ok) status = again.value;
      toasts.push(words.saved);
    } finally {
      saving = false;
    }
  }
</script>

{#if page.data.live && page.data.slash === true && status}
  <Tile class="section" data-surface="tile" title={words.title} data-part="slash-brain">
    <div class="section-body">
      <p class="hint">{words.sub}</p>
      <dl class="brains">
        <div class="brain">
          <dt>{words.quick}</dt>
          <dd>{quickSaid(status)}</dd>
        </div>
        <div class="brain">
          <dt>{words.deep}</dt>
          <dd>{deepSaid(status)}</dd>
        </div>
        {#if mac}
          <div class="brain">
            <dt>{words.mac}</dt>
            <dd>{words.macLive}</dd>
          </div>
        {/if}
      </dl>

      {#if owner && start}
        <form class="deep-form" onsubmit={save} novalidate>
          <span class="label" id="deep-key-label">{words.keyLabel}</span>
          <div class="key-row">
            {#if draft.grant_id === null}
              <span class="hint">{words.keyOwnHint}</span>
            {:else if picked}
              <span class="key-picked" dir="auto">{picked.label}</span>
            {:else if keys !== null}
              <span class="hint">{words.keyGone}</span>
            {/if}
            <Button disabled={saving} onclick={openPicker}>{draft.grant_id === null ? words.keyPick : words.keyChange}</Button>
          </div>

          <label class="label" for="deep-cap">{words.capLabel}</label>
          <p class="hint" id="deep-cap-hint">{words.capHint}</p>
          <div class="field">
            <input
              class="field-input"
              id="deep-cap"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              bind:value={draft.cap}
              aria-describedby="deep-cap-hint deep-said"
              aria-invalid={capBad ? 'true' : undefined}
            />
          </div>

          <div class="actions">
            <Button type="submit" disabled={saving || patch === null}>{words.go}</Button>
          </div>
          <p class="said" id="deep-said" role="status" data-intent={refusal || capBad ? 'bad' : undefined}>{refusal || (capBad ? words.capBad : '')}</p>
        </form>
      {/if}
    </div>
  </Tile>

  <Sheet bind:open={picking} title={words.keySheet} subtitle={words.keySheetSub}>
    {#if keysRefused}
      <p class="hint" role="status">{keysRefused}</p>
    {:else if keys !== null && keys.length === 0}
      <p class="hint" role="status">{words.keyNone}</p>
    {/if}
    <ul class="keys" aria-labelledby="deep-key-label">
      <li>
        <button type="button" class="key" aria-pressed={draft.grant_id === null} onclick={() => pick(null)}>
          <span>{words.keyOwn}</span>
        </button>
      </li>
      {#each keys ?? [] as key (key.id)}
        <li>
          <button type="button" class="key" aria-pressed={draft.grant_id === key.id} onclick={() => pick(key.id)}>
            <span dir="auto">{key.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </Sheet>
{/if}

<style>
  .brains {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: var(--sp-3) 0 0;
  }

  .brain {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .brain dt {
    color: var(--ink);
  }

  .brain dd {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .deep-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    min-inline-size: 0;
  }

  .label {
    margin-block-start: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .key-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .key-picked {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .field {
    inline-size: 100%;
    max-inline-size: 16ch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  .keys {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .key {
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: var(--r-pop);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .key[aria-pressed='true'] {
    background: var(--chosen);
  }

  @media (hover: hover) and (pointer: fine) {
    .key:hover {
      background: var(--hover);
    }
  }
</style>
