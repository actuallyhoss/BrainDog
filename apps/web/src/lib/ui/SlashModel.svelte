<!--
  How Slash is run, the owner's choice in Settings (`loop/research-spark-routes.md` §4): a monthly limit (tier `a`), or no
  limit on the host's own endpoint with a model the owner names (tier `byo`). The rules and the words are `slash-model.ts`,
  which the tests hold; this file only draws what they answer and sends what `patchOf` says to send.

  THE OWNER'S AND NOBODY ELSE'S. `configure` answers anyone else 403 `FORBIDDEN`, so for a member this row would be two
  controls that always fail; it is not drawn for them. `SlashAsks` beside it already shows everyone the model in use.

  ON A HOST WITH NO MODEL, ON THE SAMPLE, OR ON TIER `b`, NOTHING. `SlashAsks` says the no-model sentence once, and a second
  one here would be the same sentence twice in one area. Tier `b` is not offered (F6), and `startOf` is `null` there.

  AND NOTHING ON THE CLOUD, where the included model is the only choice (`kindsOn`): one radio button chooses nothing, and
  `SlashAsks` already names that model and its monthly limit. The status is not even asked for there.

  A REFUSAL IS SHOWN AS IT CAME (`13 §6`), under the field. The settings door's 501 is for tier `b` only (`unsettled` in
  `packages/host/src/slash-ask.ts`), which this row never sends, so what can come back here is the engine's own
  `VALUE_MALFORMED` or `FORBIDDEN`, and those are drawn word for word.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { kindsOn, modelSaid, patchOf, startOf, words, type Kind, type Start } from '$lib/ui/slash-model.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';

  /* THE PAGE'S OWN `anOwner`, handed in, as `SlashAsks` takes it: one predicate for who owns the record, not a second one. */
  let { owner = false }: { owner?: boolean } = $props();

  let client: ReturnType<typeof createClient> | null = null;
  let start = $state<Start | null>(null);
  let kind = $state<Kind>('a');
  let typed = $state('');
  let saving = $state(false);
  let refusal = $state('');

  const patch = $derived(start ? patchOf(start, kind, typed) : null);
  const kinds = $derived(kindsOn(page.data.host));

  /* Neither door reads or writes a record row, so no conflict comes back; the sentence is here so the type is whole. */
  const fixOf = (out: { refusal: { fix: string } } | { conflict: unknown }): string =>
    'refusal' in out ? out.refusal.fix : 'Something changed while this was open. Try again.';

  onMount(() => {
    if (!page.data.live || page.data.slash !== true || !owner || kindsOn(page.data.host).length < 2) return;
    client = createClient({ base: apiBase() });
    /* A STATUS REFUSAL IS `SlashAsks`'s TO SHOW, under its heading, and it asks the same door. Drawing it here too would put
       one refusal on the screen twice; this row just stays away. */
    void client.slashStatus().then((out) => {
      if (!out.ok) return;
      const s = startOf(out.value);
      if (!s) return;
      start = s;
      kind = s.kind;
      typed = s.typed;
    });
  });

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
      start = out.value.tier === 'byo' ? { kind: 'byo', typed: out.value.model ?? '' } : { kind: 'a', typed: '' };
      kind = start.kind;
      typed = start.typed;
      toasts.push(modelSaid(out.value));
    } finally {
      saving = false;
    }
  }
</script>

{#if page.data.live && owner && start && kinds.length > 1}
  <Section title={words.legend}>
    <form class="model-form" onsubmit={save} novalidate>
      <fieldset class="kinds">
        <legend class="visually-hidden">{words.legend}</legend>
        {#each kinds as value (value)}
          <label class="kind">
            <input type="radio" name="slash-kind" {value} bind:group={kind} disabled={saving} aria-describedby="slash-kind-{value}" />
            <span class="kind-words">
              <span>{words.kinds[value].label}</span>
              <span class="hint" id="slash-kind-{value}">{words.kinds[value].hint}</span>
            </span>
          </label>
        {/each}
      </fieldset>
      <!-- THE NAME ONLY WHERE IT IS READ. On tier `a` the engine clears it on save, so a field there would take a name
           that is thrown away the moment it is saved. -->
      {#if kind === 'byo'}
        <label class="model-label" for="slash-model">{words.modelLabel}</label>
        <p class="hint" id="slash-model-hint">{words.modelHint}</p>
        <div class="field">
          <input
            class="field-input"
            id="slash-model"
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={typed}
            aria-describedby="slash-model-hint slash-model-said"
            aria-invalid={refusal ? 'true' : undefined}
          />
        </div>
      {/if}
      <div class="model-actions">
        <Button type="submit" disabled={saving || patch === null}>{words.go}</Button>
      </div>
      <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
      <p class="model-said" id="slash-model-said" role="status" data-intent={refusal ? 'bad' : undefined}>{refusal}</p>
    </form>
  </Section>
{/if}

<style>
  /* `SlashAsks`'s measures, redrawn here because that component's rules are scoped to it, so the two rows line up. */
  .model-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
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

  .kind-words {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .model-label {
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .field {
    max-inline-size: 32ch;
  }

  .model-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .model-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }
</style>
