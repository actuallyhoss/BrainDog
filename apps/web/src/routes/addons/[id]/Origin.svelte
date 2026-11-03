<!--
  Where an installed add-on came from, what it may do here, and how to share it: the three tiles an add-on's own page
  draws beside its settings (`Installed.svelte`).

  THE RECORD'S WORD, NEVER THE FILE'S. All of it is read off `addon {id}` (`packages/record/src/methods/addons.ts`):
  the trust from the catalogue and the pack's source, "what it may do here" from the declarations it put in this
  BrainDog. Who made a made-here add-on is the run that asked to install it, read off its question on Decide.

  SHARE ONLY WHAT IS THE PERSON'S TO SHARE: an add-on made here, or one from a link. The file goes as its setup, never
  their entries: `addon {id, file: true}` hands back the manifest and the live declarations, and no rows.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { kennelFetch, publishedSaid, submitToKennel } from '$lib/market/publish.ts';
  import { fileName, madeWords, makerOf, originOf, plainTrust, type AddonAnswer, type AskedRow } from '$lib/market/made-here.ts';

  let { id, ours = new Set<string>(), onsummary }: { id: string; ours?: ReadonlySet<string>; onsummary?: (summary: string) => void } = $props();

  let answer = $state.raw<AddonAnswer | null>(null);
  let maker = $state<string | null>(null);
  let githubOpen = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);

  const client = createClient({ base: apiBase() });

  onMount(() => {
    void client.call<AddonAnswer>('addon', { id }).then((out) => {
      if (!out.ok || out.value === null || typeof out.value !== 'object') return;
      answer = plainTrust(out.value, ours);
      if (out.value.summary) onsummary?.(out.value.summary);
      if (answer.trust === 'made-here')
        void client.governance({ register: 'suggestion', status: 'resolved', limit: 100 }).then((rows) => {
          maker = rows.ok && Array.isArray(rows.value) ? makerOf(rows.value as AskedRow[], id) : null;
        });
    });
  });

  const origin = $derived(answer ? originOf(answer, maker) : null);
  const may = $derived(answer?.here?.may ?? null);
  const mine = $derived(answer?.trust === 'made-here' || answer?.trust === 'from-a-link');

  async function fileText(): Promise<string | null> {
    const out = await client.call<{ file?: unknown }>('addon', { id, file: true });
    return out.ok && out.value?.file !== undefined ? `${JSON.stringify(out.value.file, null, 2)}\n` : null;
  }

  async function download(): Promise<void> {
    busy = true;
    try {
      const text = await fileText();
      if (text === null) return void (said = madeWords.noFile);
      const name = fileName(id, answer?.here?.version);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      toasts.push(madeWords.downloaded(name), { intent: 'good' });
    } finally {
      busy = false;
    }
  }

  async function submit(): Promise<void> {
    busy = true;
    said = null;
    try {
      const text = await fileText();
      if (text === null) return void (said = madeWords.noFile);
      const out = await submitToKennel(kennelFetch, text);
      said = out.ok ? publishedSaid({ ...out.value, title: answer?.title ?? id }) : out.fix;
    } finally {
      busy = false;
    }
  }

  const command = $derived(`braindog addon publish --github`);
</script>

{#if answer && origin}
  <Tile icon="info" title={madeWords.origin}>
    <div class="origin">
      <p class="origin-line"><span class="pill-badge" data-tone={origin.tone ?? undefined}>{origin.badge}</span><span>{origin.line}</span></p>
      {#if origin.note}<p class="origin-note">{origin.note}</p>{/if}
    </div>
  </Tile>
{/if}

{#if may !== null}
  <Tile icon="key" class="section" data-surface="tile" title={madeWords.may}>
    <div class="section-body">
      {#if may.length > 0}
        <ul class="may">
          {#each may as line, i (i)}<li><Icon name="check" size="s" /><span>{line}</span></li>{/each}
        </ul>
      {:else}
        <p class="origin-note">{madeWords.mayNothing}</p>
      {/if}
      <p class="origin-note foot">{madeWords.mayNote}</p>
    </div>
  </Tile>
{/if}

{#if mine}
  <Tile icon="external" title={madeWords.share}>
    <div class="share">
      <p class="origin-note">{madeWords.shareNote}</p>
      <div class="share-do">
        <Button size="sm" disabled={busy} onclick={() => void download()}><Icon name="download" size="s" />{madeWords.download}</Button>
        <Button size="sm" aria-expanded={githubOpen} onclick={() => (githubOpen = !githubOpen)}><Icon name="code" size="s" />{madeWords.github}</Button>
        {#if answer?.trust === 'made-here'}
          <Button size="sm" disabled={busy} onclick={() => void submit()}><Icon name="packs" size="s" />{madeWords.submit}</Button>
        {/if}
      </div>
      {#if githubOpen}
        <div class="steps">
          <p>{madeWords.githubSteps}</p>
          <pre class="cmd">{command}</pre>
          <p>{madeWords.githubThen}</p>
        </div>
      {/if}
      {#if answer?.trust === 'made-here'}<p class="origin-note">{madeWords.submitNote}</p>{/if}
      <p class="said" role="status">{said ?? ''}</p>
    </div>
  </Tile>
{/if}

<style>
  .origin,
  .share {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .origin-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .origin-note,
  .steps p {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .may {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE LINE A ROW, on the 12px text edge, no rule between them. */
  .may li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    padding: 8px 12px;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .may li :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ink-3);
  }

  .foot {
    padding: var(--sp-2) 12px 0;
  }

  .share-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .cmd {
    margin: 0;
    overflow-x: auto;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  .said:empty {
    display: none;
  }

  .said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }
</style>
