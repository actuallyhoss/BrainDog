<!--
  Or let BrainDog fetch them: a poll of one address, set up on an organisation's page.

  IT FILES A PROPOSAL AND INSTALLS NOTHING. A poll calls out on a clock, so the pack this makes goes in front of the
  owner on Decide, with the host and how often printed, and runs only once it is approved (`lib/record/poll-form.ts`).
  One address is one request an interval however many numbers it names, and a key is sent only when one is named.

  Imported by the page route only, so nothing here reaches the entry chunk.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import { POLL_EVERY, POLL_ROWS_MOST, pollFault, pollProposal, type PollEvery, type PollRow } from '$lib/record/poll-form.ts';

  let { seq, title }: { seq: number; title: string } = $props();

  const blank = (): PollRow => ({ path: '', name: '', unit: '' });

  let url = $state('');
  let every = $state<PollEvery>('1h');
  let grant = $state('');
  let rows = $state<PollRow[]>([blank()]);
  let busy = $state(false);
  let fault = $state<{ at: string; fix: string } | null>(null);
  let filed = $state<string | null>(null);

  const id = $derived(`poll-${seq}`);

  async function file(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const draft = { url, every, grant, rows };
    fault = pollFault(draft);
    if (fault) return;
    busy = true;
    const out = await createClient({ base: apiBase() }).call<{ id?: unknown }>('propose', pollProposal(draft, { title, seq }));
    busy = false;
    if (!out.ok) {
      fault = { at: 'file', fix: 'refusal' in out ? out.refusal.fix : copy.reportUnread };
      return;
    }
    filed = typeof out.value?.id === 'string' ? out.value.id : '';
    url = '';
    grant = '';
    rows = [blank()];
  }
</script>

<section class="poll" aria-labelledby="{id}-head">
  <h3 class="poll-head" id="{id}-head">{copy.pollHeading}</h3>
  <p class="poll-why">{copy.pollWhy}</p>

  {#if filed !== null}
    <p class="poll-said" role="status">
      {copy.pollFiled}{#if filed}{' '}<a class="tap" href={at(`/decide/${filed}`)}>{copy.pollOpenDecide}</a>{/if}
    </p>
  {/if}

  <form class="poll-form" onsubmit={(e) => void file(e)} novalidate>
    <label class="poll-label" for="{id}-url">{copy.pollAddress}</label>
    <div class="field">
      <input
        class="field-input"
        id="{id}-url"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        placeholder={copy.pollAddressHint}
        bind:value={url}
        aria-invalid={fault?.at === 'url' ? 'true' : undefined}
        aria-describedby={fault?.at === 'url' ? `${id}-fault` : undefined}
      />
    </div>

    <label class="poll-label" for="{id}-every">{copy.pollEvery}</label>
    <select class="poll-select" id="{id}-every" bind:value={every}>
      {#each POLL_EVERY as e (e)}<option value={e}>{copy.pollEveryLabels[e] ?? e}</option>{/each}
    </select>

    <label class="poll-label" for="{id}-key">{copy.pollKey}</label>
    <div class="field">
      <input
        class="field-input"
        id="{id}-key"
        type="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="40"
        bind:value={grant}
        aria-invalid={fault?.at === 'grant' ? 'true' : undefined}
        aria-describedby="{id}-key-note"
      />
    </div>
    <p class="poll-note" id="{id}-key-note">{copy.pollKeyNote}</p>

    <fieldset class="poll-rows">
      <legend class="poll-label">{copy.pollNumbers}</legend>
      {#each rows as row, i (i)}
        <div class="poll-row">
          <div class="field poll-path">
            <input class="field-input" type="text" spellcheck="false" autocomplete="off" aria-label="{copy.pollPath} {i + 1}" placeholder={copy.pollPathHint} bind:value={row.path} />
          </div>
          <div class="field poll-name">
            <input class="field-input" type="text" autocomplete="off" aria-label="{copy.pollName} {i + 1}" placeholder={copy.pollNameHint} bind:value={row.name} />
          </div>
          <div class="field poll-unit">
            <input class="field-input" type="text" autocomplete="off" aria-label="{copy.pollUnit} {i + 1}" placeholder={copy.pollUnitHint} bind:value={row.unit} />
          </div>
          {#if rows.length > 1}
            <Button weight="bare" aria-label={copy.pollRemoveRow(i + 1)} onclick={() => (rows = rows.filter((_, j) => j !== i))}>{copy.pollRemoveRow(i + 1)}</Button>
          {/if}
        </div>
      {/each}
      {#if rows.length < POLL_ROWS_MOST}
        <div class="poll-do">
          <Button weight="bare" onclick={() => (rows = [...rows, blank()])}>{copy.pollAddRow}</Button>
        </div>
      {/if}
    </fieldset>

    {#if fault}<p class="poll-fault" id="{id}-fault" role="alert">{fault.fix}</p>{/if}
    <div class="poll-do">
      <Button weight="quiet" type="submit" disabled={busy}>{copy.pollFile}</Button>
    </div>
  </form>
</section>

<style>
  .poll {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
    margin-block-start: var(--sp-5);
  }

  .poll-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .poll-why,
  .poll-note,
  .poll-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  .poll-note {
    color: var(--dim);
  }

  .poll-form {
    display: grid;
    gap: var(--sp-2);
  }

  .poll-label {
    margin-block-start: var(--sp-2);
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .poll-select {
    justify-self: start;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .poll-rows {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .poll-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 0.5fr) auto;
    align-items: center;
    gap: var(--sp-2);
  }

  @media (max-width: 40rem) {
    .poll-row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .poll-name {
      grid-column: 1 / -1;
      grid-row: 1;
    }
  }

  .poll-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .poll-fault {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }
</style>
