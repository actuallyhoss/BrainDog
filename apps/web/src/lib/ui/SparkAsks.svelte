<!--
  Spark's row in Settings (`docs/23-ASSISTANT-UI.md` §8, `loop/research-spark-routes.md` Brief W1).

  "ONE ROW IN SETTINGS. NOTHING ANYWHERE ELSE." Every signed-in person sees this month's asks against the cap, the model the
  host names, and the day the count resets; the owner also sets the monthly limit. No gauge, no bar, no percentage: a
  number with a label beside it, and at the cap a `warn` chip on the row. On a tier that is not metered the ask row and the
  reset are gone rather than zeroed. The rules are `spark-asks.ts`, which the tests hold.

  ON A HOST WITH NO MODEL, `23 §8`'s one line and no controls. On the sample, nothing: the sample has no Spark to read, and a
  sentence saying this host has no model would be a claim about a host nobody is on.

  A REFUSAL IS SHOWN AS IT CAME (`13 §6`): the status door's under the heading, the settings door's under the field.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type SparkStatus } from '@braindog/client';
  import { asksShown, atCap, capOf, capSaid, resetsWords, words } from '$lib/ui/spark-asks.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';

  /* THE PAGE'S OWN `anOwner`, handed in, so there is one predicate for who owns the record and not a second one here. The
     engine decides again on every save and answers anyone else 403 `FORBIDDEN`, so this only decides what is offered. */
  let { owner = false }: { owner?: boolean } = $props();

  let client: ReturnType<typeof createClient> | null = null;
  let status = $state<SparkStatus | null>(null);
  let refused = $state('');
  let typed = $state('');
  let saving = $state(false);
  let capRefusal = $state('');

  const modelHere = $derived(page.data.spark === true);
  const asks = $derived(status ? asksShown(status) : null);
  const cap = $derived(capOf(typed));

  /* A conflict cannot come back from either door, which read and write no row; the sentence is here so the type is whole. */
  const fixOf = (out: { refusal: { fix: string } } | { conflict: unknown }): string =>
    'refusal' in out ? out.refusal.fix : 'Something changed while this was open. Try again.';

  onMount(() => {
    if (!page.data.live || !modelHere) return;
    client = createClient({ base: location.origin });
    void client.sparkStatus().then((out) => {
      if (!out.ok) {
        refused = fixOf(out);
        return;
      }
      status = out.value;
      typed = String(out.value.asks.cap);
    });
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!client || !status || cap === null || saving) return;
    saving = true;
    capRefusal = '';
    try {
      const out = await client.sparkSettings({ ask_cap: cap });
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
            <span class="fact-key">{words.asks}</span>
            <span class="fact-value"
              ><span class="num">{asks}</span>{#if atCap(status)}
                <Chip label={words.spent} tone="warn" />{/if}</span
            >
          </li>
        {/if}
        <li><span class="fact-key">{words.model}</span><span class="fact-value">{status.model}</span></li>
        {#if asks}
          <li><span class="fact-key">{words.resets}</span><span class="fact-value num">{resetsWords(status.asks.resets)}</span></li>
        {/if}
      </ul>
      <!-- THE LIMIT ONLY WHERE THERE IS A METER. On `b` and `byo` the engine counts nothing against it, so a field for it
           there would be a control with nothing behind it. -->
      {#if owner && asks}
        <form class="cap-form" onsubmit={save} novalidate>
          <label class="cap-label" for="spark-cap">{words.capLabel}</label>
          <p class="hint" id="spark-cap-hint">{words.capHint}</p>
          <div class="cap-row">
            <div class="field">
              <input
                class="field-input num"
                id="spark-cap"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                bind:value={typed}
                aria-describedby="spark-cap-hint spark-cap-said"
                aria-invalid={capRefusal ? 'true' : undefined}
              />
            </div>
            <Button type="submit" disabled={saving || cap === null || cap === status.asks.cap}>{words.capGo}</Button>
          </div>
          <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
          <p class="cap-said" id="spark-cap-said" role="status" data-intent={capRefusal ? 'bad' : undefined}>{capRefusal}</p>
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
    color: var(--ink2);
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
