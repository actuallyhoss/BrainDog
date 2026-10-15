<!--
  Slash's row in Settings (`docs/23-ASSISTANT-UI.md` §8).

  "ONE ROW IN SETTINGS. NOTHING ANYWHERE ELSE." Every signed-in person sees this month's asks against the cap, the model the
  host names, and the day the count resets; the owner also sets the monthly limit. No gauge, no bar, no percentage: a
  number with a label beside it, and at the cap a `warn` chip on the row. On his own key the count is listed with no cap
  and no limit field, since nothing stops at it; on `byo` the ask row and the reset are gone rather than zeroed. The rules
  are `slash-asks.ts`, which the tests hold.

  EVERY LINE WRAPS. A model id is one long word with no space in it, so at 390px the value column breaks it anywhere
  rather than pushing the page sideways.

  ON A HOST WITH NO MODEL, `23 §8`'s one line and no controls. On the sample, nothing: the sample has no Slash to read, and a
  sentence saying this host has no model would be a claim about a host nobody is on.

  A REFUSAL IS SHOWN AS IT CAME (`13 §6`): the status door's under the heading, the settings door's under the field.

  WHETHER THE MODEL ANSWERS, UNDER ITS NAME (ENG-A02). The record's `engineHealth` says it in one sentence from the
  engine's own ledger: "Slash's model answered 3 hours ago", or "has not answered since 6 October. That is ours to fix."
  A model named here and silent for days read as fine. A record whose build has no such read says nothing, never that
  it answers; a model that does not answer is said in the deeper red with its words, never the colour alone.

  AND THE OWNER CAN ASK NOW (ENG-A08): "Test the model now" under those lines, `ModelProbe.svelte` by `import()`.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type EngineHealth, type SlashStatus } from '@braindog/client';
  import { asksShown, atCap, capOf, capSaid, metered, resetsWords, words } from '$lib/ui/slash-asks.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { engineLines } from '../../routes/settings/[area]/health.ts';

  /* THE PAGE'S OWN `anOwner`, handed in, so there is one predicate for who owns the record and not a second one here. The
     engine decides again on every save and answers anyone else 403 `FORBIDDEN`, so this only decides what is offered. */
  let { owner = false }: { owner?: boolean } = $props();

  let client: ReturnType<typeof createClient> | null = null;
  let status = $state<SlashStatus | null>(null);
  let refused = $state('');
  let typed = $state('');
  let saving = $state(false);
  let capRefusal = $state('');
  let engine = $state<EngineHealth | null>(null);
  const lines = $derived(engineLines(engine, Date.now()));

  /* NOT ANSWERING, OR HIS OWN KEY WILL NOT OPEN: the sentence's first sentence is what is wrong, and is marked. `off` is
     `words.noModel` above, so it is not said twice. */
  const down = $derived(engine !== null && (engine.health.state === 'not_answering' || engine.health.state === 'key_closed'));
  const engineSaid = $derived.by(() => {
    if (engine === null || engine.health.state === 'off' || engine.said.text.trim() === '') return null;
    const text = engine.said.text.trim();
    const cut = down ? text.indexOf('. ') : -1;
    return cut < 0 ? { lead: down ? text : '', rest: down ? '' : text } : { lead: text.slice(0, cut + 1), rest: text.slice(cut + 1) };
  });

  const modelHere = $derived(page.data.slash === true);
  const asks = $derived(status ? asksShown(status) : null);
  const capped = $derived(status !== null && metered(status));
  const cap = $derived(capOf(typed));

  /* A conflict cannot come back from either door, which read and write no row; the sentence is here so the type is whole. */
  const fixOf = (out: { refusal: { fix: string } } | { conflict: unknown }): string =>
    'refusal' in out ? out.refusal.fix : 'Something changed while this was open. Try again.';

  onMount(() => {
    if (!page.data.live || !modelHere) return;
    client = createClient({ base: apiBase() });
    void client.slashStatus().then((out) => {
      if (!out.ok) {
        refused = fixOf(out);
        return;
      }
      status = out.value;
      typed = String(out.value.asks.cap);
    });
    /* A BUILD WITHOUT THE READ, OR A REFUSAL, IS NOTHING SAID. */
    void client
      .engineHealth()
      .then((out) => {
        const v = out.ok ? (out.value as EngineHealth | null) : null;
        engine = v !== null && typeof v === 'object' && 'health' in v ? v : null;
      })
      .catch(() => {});
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!client || !status || cap === null || saving) return;
    saving = true;
    capRefusal = '';
    try {
      const out = await client.slashSettings({ ask_cap: cap });
      if (!out.ok) {
        capRefusal = fixOf(out);
        return;
      }
      status = { ...status, asks: { ...status.asks, cap: out.value.ask_cap } };
      typed = String(out.value.ask_cap);
      toasts.push(capSaid(out.value.ask_cap));
    } finally {
      saving = false;
    }
  }
</script>

{#if page.data.live && (!modelHere || status || refused)}
  <Section title={words.title}>
    {#if !modelHere}
      <p class="hint">{words.noModel}</p>
    {:else if refused}
      <p class="hint" role="status">{refused}</p>
    {:else if status}
      <ul class="facts">
        {#if asks}
          <li>
            <span class="fact-key">{capped ? words.asks : words.keyAsks}</span>
            <span class="fact-value"
              ><span class="num">{asks}</span>{#if atCap(status)}
                <Chip label={words.spent} tone="warn" />{/if}</span
            >
          </li>
        {/if}
        <li><span class="fact-key">{words.model}</span><span class="fact-value">{status.model}</span></li>
        {#if engineSaid}
          <li><p class="engine-said" data-intent={down ? 'bad' : undefined}>{#if engineSaid.lead}<span data-needs>{engineSaid.lead}</span>{/if}{engineSaid.rest}</p></li>
        {/if}
        {#each lines as line}<li><p class="engine-line">{line}</p></li>{/each}
        <!-- THE OWNER MAY ASK NOW, under what the ledger last saw (ENG-A08). Its own chunk, so a member loads none of it. -->
        {#if owner}
          <li>
            {#await import('./ModelProbe.svelte') then loaded}<loaded.default />{/await}
          </li>
        {/if}
        {#if asks}
          <li><span class="fact-key">{words.resets}</span><span class="fact-value num">{resetsWords(status.asks.resets)}</span></li>
        {/if}
      </ul>
      {#if asks && !capped}
        <p class="hint">{words.keyHint}</p>
      {/if}
      <!-- THE LIMIT ONLY WHERE THERE IS A METER. On his own key and on `byo` nothing counts against it, so a field for it
           there would be a control with nothing behind it. -->
      {#if owner && capped}
        <form class="cap-form" onsubmit={save} novalidate>
          <label class="cap-label" for="slash-cap">{words.capLabel}</label>
          <p class="hint" id="slash-cap-hint">{words.capHint}</p>
          <div class="cap-row">
            <div class="field">
              <input
                class="field-input num"
                id="slash-cap"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                bind:value={typed}
                aria-describedby="slash-cap-hint slash-cap-said"
                aria-invalid={capRefusal ? 'true' : undefined}
              />
            </div>
            <Button type="submit" disabled={saving || cap === null || cap === status.asks.cap}>{words.capGo}</Button>
          </div>
          <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
          <p class="cap-said" id="slash-cap-said" role="status" data-intent={capRefusal ? 'bad' : undefined}>{capRefusal}</p>
        </form>
      {/if}
    {/if}
  </Section>
{/if}

<style>
  /* THE SETTINGS PAGE'S FACTS AND FIELD, REDRAWN HERE, because that page's rules are scoped to it and do not reach a
     component. Same tokens, same measures, so this row lines up with `You` and `Signed in as` in the next area over. */
  .facts {
    display: grid;
    grid-template-columns: minmax(12ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: contents;
  }

  .fact-key {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact-value {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  /* THE ENGINE'S SENTENCE, the whole width under the model's name. Its fault, when it has one, in the deeper red. */
  .engine-said {
    grid-column: 1 / -1;
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .engine-line {
    grid-column: 1 / -1;
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .engine-said [data-needs] {
    color: var(--danger-text);
    font-weight: var(--fw-medium);
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .cap-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .cap-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .cap-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .cap-row .field {
    inline-size: 10ch;
  }

  .cap-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }
</style>
