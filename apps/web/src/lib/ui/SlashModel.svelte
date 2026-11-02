<!--
  How Slash is run, the owner's choice in Settings: "Included" or "Your own key", the same two on every host. On a
  self-host "Included" is the host's own endpoint, so it names that endpoint and takes the model it serves. The rules and
  the words are `slash-model.ts`, which the tests hold; this file only draws what they answer and sends what `patchOf` says.

  THE OWNER'S AND NOBODY ELSE'S. `configure` answers anyone else 403 `FORBIDDEN`, so for a member this row would be
  controls that always fail; it is not drawn for them. `SlashAsks` beside it already shows everyone the model in use.

  THE FORM STARTS AS IT WAS SAVED, read with a save of nothing, which the settings door answers with the stored choice and
  writes nothing. `status` is read by every signed-in person, so it does not carry the address or the key he picked.

  HIS KEY IS PICKED, NEVER TYPED. The picker lists the live API tokens `listGrants` answers, in a `Sheet`, which below 640px
  is a bottom sheet. `listGrants` is the Keychain's own gate, an owner proved in the last fifteen minutes, so where it refuses
  its sentence is drawn in place of the list, and a save that points his key somewhere asks the same gate at the door.

  AT 390px IT IS ONE COLUMN. Every row stacks, the fields are the column's width, and the line that says what answers now
  wraps, because a model id is one long word.

  A REFUSAL IS SHOWN AS IT CAME (`13 §6`), under the form: the host's for an address it will not send a key to, the
  engine's `VALUE_MALFORMED` or `FORBIDDEN`, and the door's 501 on a host that cannot open a key.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import {
    PROVIDERS,
    chosen,
    endpointSaid,
    keyNamed,
    keysOf,
    kindsOn,
    modelOn,
    modelSaid,
    nowSaid,
    patchOf,
    providerName,
    startOf,
    words,
    type Draft,
    type KeyChoice,
    type Start,
  } from '$lib/ui/slash-model.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  /* THE PAGE'S OWN `anOwner`, handed in, as `SlashAsks` takes it: one predicate for who owns the record, not a second one. */
  let { owner = false }: { owner?: boolean } = $props();

  let client: ReturnType<typeof createClient> | null = null;
  let start = $state<Start | null>(null);
  let draft = $state<Draft>({ kind: 'included', provider: 'anthropic', base_url: '', model: '', grant_id: null });
  let saving = $state(false);
  let refusal = $state('');
  let keys = $state<KeyChoice[] | null>(null);
  let keysRefused = $state('');
  let picking = $state(false);

  const named = $derived(modelOn(page.data.host));
  const patch = $derived(start ? patchOf(start, draft, named) : null);
  const kinds = $derived(kindsOn(page.data.host));
  /* THE ENDPOINT BY THE NAME `boot` GIVES IT, where a host sends one; none sends it yet, so the plain words stand. */
  const endpoint = $derived(endpointSaid((page.data as { slash_endpoint?: unknown }).slash_endpoint));
  const picked = $derived(keys === null ? null : keyNamed(keys, draft.grant_id));

  /* Neither door reads or writes a record row, so no conflict comes back; the sentence is here so the type is whole. */
  const fixOf = (out: { refusal: { fix: string } } | { conflict: unknown }): string =>
    'refusal' in out ? out.refusal.fix : 'Something changed while this was open. Try again.';

  /* THE KEYS ARE ASKED FOR ONCE, WHEN HIS OWN KEY IS ON THE FORM, and not on every Settings visit: `listGrants` is the
     Keychain's gate, and an owner who never looks at his own key has no reason to be told his Keychain is closed. */
  function loadKeys() {
    if (!client || keys !== null || keysRefused) return;
    void client.listGrants().then((out) => {
      if (out.ok) keys = keysOf(out.value);
      else keysRefused = fixOf(out);
    });
  }

  onMount(() => {
    if (!page.data.live || page.data.slash !== true || !owner) return;
    client = createClient({ base: apiBase() });
    /* A REFUSAL HERE IS `SlashAsks`'s TO SHOW, under its heading, since a host with no model refuses both doors alike.
       Drawing it here too would put one refusal on the screen twice; this row just stays away. */
    void client.slashSettings({}).then((out) => {
      if (!out.ok) return;
      start = startOf(out.value);
      draft = { ...start };
      if (start.kind === 'key') loadKeys();
    });
  });

  function choose(kind: Draft['kind']) {
    if (start) draft = chosen(start, draft, kind);
    if (kind === 'key') loadKeys();
  }

  function pick(id: string) {
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
      /* THE NEW START IS WHAT THE ENGINE STORED, not what was typed, so the button goes quiet on exactly the saved state. */
      start = startOf(out.value);
      draft = { ...start };
      toasts.push(modelSaid(out.value));
    } finally {
      saving = false;
    }
  }
</script>

{#if page.data.live && owner && start}
  <Tile class="section" data-surface="tile" title={words.legend}>
    <div class="section-body">
      <p class="now" role="status">{nowSaid(start)}</p>
      <form class="model-form" onsubmit={save} novalidate>
        <fieldset class="kinds">
          <legend class="visually-hidden">{words.legend}</legend>
          {#each kinds as value (value)}
            <label class="kind">
              <input
                type="radio"
                name="slash-kind"
                {value}
                checked={draft.kind === value}
                onchange={() => choose(value)}
                disabled={saving}
                aria-describedby="slash-kind-{value}"
              />
              <span class="kind-words">
                <span>{words.kinds[value].label}</span>
                <span class="hint" id="slash-kind-{value}">{words.kinds[value].hint}</span>
              </span>
            </label>
          {/each}
        </fieldset>

        {#if draft.kind === 'key'}
          <fieldset class="kinds">
            <legend class="model-label">{words.providerLabel}</legend>
            {#each PROVIDERS as value (value)}
              <label class="kind">
                <input type="radio" name="slash-provider" {value} checked={draft.provider === value} onchange={() => (draft.provider = value)} disabled={saving} />
                <span>{providerName(value)}</span>
              </label>
            {/each}
          </fieldset>

          <label class="model-label" for="slash-base">{words.baseLabel}</label>
          <p class="hint" id="slash-base-hint">{words.baseHint}</p>
          <div class="field">
            <input
              class="field-input"
              id="slash-base"
              type="url"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              placeholder="https://"
              bind:value={draft.base_url}
              aria-describedby="slash-base-hint slash-model-said"
            />
          </div>
        {/if}

        <!-- THE NAME ONLY WHERE IT IS READ. On the Cloud's included model the engine clears it on save, so a field there would
             take a name thrown away the moment it is saved; on a self-host the included model is its own endpoint's. -->
        {#if draft.kind === 'included' && named}
          <p class="hint">{endpoint}</p>
        {/if}
        {#if draft.kind === 'key' || named}
          <label class="model-label" for="slash-model">{words.modelLabel}</label>
          <p class="hint" id="slash-model-hint">{draft.kind === 'key' ? words.keyModelHint : words.modelHint}</p>
          <div class="field">
            <input
              class="field-input"
              id="slash-model"
              type="text"
              autocomplete="off"
              spellcheck="false"
              bind:value={draft.model}
              aria-describedby="slash-model-hint slash-model-said"
              aria-invalid={refusal ? 'true' : undefined}
            />
          </div>
        {/if}

        {#if draft.kind === 'key'}
          <span class="model-label" id="slash-key-label">{words.keyLabel}</span>
          {#if keysRefused}
            <p class="hint" role="status">{keysRefused}</p>
          {:else if keys !== null && keys.length === 0}
            <p class="hint" role="status">{words.keyNone}</p>
          {:else}
            <div class="key-row">
              {#if picked}
                <span class="key-picked" dir="auto">{picked.label}</span>
              {:else if keys !== null && draft.grant_id !== null}
                <span class="hint">{words.keyGone}</span>
              {/if}
              <Button disabled={saving || keys === null} onclick={() => (picking = true)}>{picked ? words.keyChange : words.keyPick}</Button>
            </div>
          {/if}
        {/if}

        <div class="model-actions">
          <Button type="submit" disabled={saving || patch === null}>{words.go}</Button>
        </div>
        <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
        <p class="model-said" id="slash-model-said" role="status" data-intent={refusal ? 'bad' : undefined}>{refusal}</p>
      </form>
    </div>
  </Tile>

  <!-- THE PICKER IS A SHEET: a drawer from 640px up and a bottom sheet below it, so at 390px the keys sit under the thumb.
       It names each key by the label he gave it and never shows a value, which this page never has. -->
  <Sheet bind:open={picking} title={words.keySheet} subtitle={words.keySheetSub}>
    <ul class="keys" aria-labelledby="slash-key-label">
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
  /* `SlashAsks`'s measures, redrawn here because that component's rules are scoped to it, so the two rows line up. ONE
     COLUMN AT EVERY WIDTH: each row stacks, so at 390px nothing sits beside anything it could push off the screen. */
  .model-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .now {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
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

  /* THE PICKED KEY IS THE "ON" SURFACE, AND HOVER ONLY WHERE THERE IS ONE: a phone keeps `:hover` on the last row tapped. */
  .key[aria-pressed='true'] {
    background: var(--chosen);
  }

  @media (hover: hover) and (pointer: fine) {
    .key:hover {
      background: var(--hover);
    }
  }

  .kinds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    border: 0;
  }

  /* NO GLOBAL RULE BACKS THIS CLASS. `+layout.svelte` has an `.sr-only`, scoped to itself, and nothing else in the app
     hides text visually, so without this the legend drew a second `How Slash is run` directly under the Section's own. */
  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .kind {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink);
    cursor: pointer;
  }

  /* A RADIO IS PRESSED THROUGH THE LABEL ROUND IT, so under a thumb the label is the 44px target: a provider's one line of
     words is shorter than that on its own. */
  @media (pointer: coarse) {
    .kind {
      min-block-size: var(--tap);
    }
  }

  .kind-words {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .model-label {
    margin-block-start: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE COLUMN'S WIDTH UP TO A LINE'S, so an address fits on a desk and never runs past the gutter on a phone. */
  .field {
    inline-size: 100%;
    max-inline-size: 48ch;
  }

  .model-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .model-said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }
</style>
