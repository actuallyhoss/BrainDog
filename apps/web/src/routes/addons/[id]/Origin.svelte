<!--
  What an installed plugin may do here, its details (who made it, whether anybody reviewed it, where it came from, its
  licence) and how to share it: the cards a plugin's own page draws under its settings (`Installed.svelte`).

  THE RECORD'S WORD, NEVER THE FILE'S. All of it is read off `addon {id}` (`packages/record/src/methods/addons.ts`):
  the trust from the catalogue and the pack's source, "what it may do here" from the declarations it put in this
  BrainDog. Who made a made-here plugin is the run that asked to install it, read off its question on Decide.

  EACH FACT ONCE, AS STRUCTURE (3 Nov, the owner: a "Made by BrainDog" chip followed by "Made by BrainDog", and "Lists: Mail."
  as raw text). Who made it is a row of the Details card, with a chip only where the chip says more. What it may do is
  rows with glyphs (`$lib/market/may.ts`): its lists and pages are left to the "What it adds" card when the page draws
  one (`adds`), and the scripts that run inside BrainDog fold into one row.

  SHARE ONLY WHAT IS THE PERSON'S TO SHARE: a plugin made here, or one from a link. The file goes as its setup, never
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
  import { fileName, madeWords, makerOf, sourceOf, type AddonAnswer, type AskedRow } from '$lib/market/made-here.ts';
  import { insideWords, mayOf } from '$lib/market/may.ts';
  import { words } from '$lib/market/words.ts';

  let {
    id,
    onsummary,
    adds = false,
    licence = null,
    offered = null,
  }: {
    id: string;
    onsummary?: (summary: string) => void;
    /** The page draws a "What it adds" card, so this one leaves its lists and pages to it. */
    adds?: boolean;
    licence?: string | null;
    offered?: string | null;
  } = $props();

  let answer = $state.raw<AddonAnswer | null>(null);
  let maker = $state<string | null>(null);
  let githubOpen = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);

  const client = createClient({ base: apiBase() });

  onMount(() => {
    void client.call<AddonAnswer>('addon', { id }).then((out) => {
      if (!out.ok || out.value === null || typeof out.value !== 'object') return;
      answer = out.value;
      if (out.value.summary) onsummary?.(out.value.summary);
      if (answer.trust === 'made-here')
        void client.governance({ register: 'suggestion', status: 'resolved', limit: 100 }).then((rows) => {
          maker = rows.ok && Array.isArray(rows.value) ? makerOf(rows.value as AskedRow[], id) : null;
        });
    });
  });

  const source = $derived(answer ? sourceOf(answer, maker) : null);
  const may = $derived(answer?.here?.may ? mayOf(answer.here.may) : null);
  /* ITS LISTS AND PAGES ARE SAID HERE ONLY WHEN NO "WHAT IT ADDS" CARD SAYS THEM. */
  const owned = $derived(
    may && !adds
      ? [
          ...(may.lists.length > 0 ? [{ key: 'lists', glyph: 'rows' as const, title: madeWords.mayLists, chips: may.lists }] : []),
          ...(may.pages.length + may.rowPages > 0
            ? [{ key: 'pages', glyph: 'doc' as const, title: madeWords.mayPages, chips: [...may.pages, ...(may.rowPages > 0 ? [madeWords.mayRowPages(may.rowPages)] : [])] }]
            : []),
        ]
      : [],
  );
  const empty = $derived(may !== null && may.rows.length + may.inside.length + owned.length === 0);
  const mine = $derived(answer?.trust === 'made-here' || answer?.trust === 'from-a-link');

  async function fileText(): Promise<string | null> {
    const out = await client.call<{ file?: unknown }>('addon', { id, file: true });
    return out.ok && out.value?.file !== undefined ? `${JSON.stringify(out.value.file, null, 2)}\n` : null;
  }

  async function download(): Promise<void> {
    busy = true;
    try {
      const text = await fileText();
      if (text === null) return void toasts.push(madeWords.noFile, { intent: 'warn' });
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
      if (text === null) return void toasts.push(madeWords.noFile, { intent: 'warn' });
      const out = await submitToKennel(kennelFetch, text);
      if (out.ok) toasts.push(publishedSaid({ ...out.value, title: answer?.title ?? id }), { intent: 'good' });
      else said = out.fix;
    } finally {
      busy = false;
    }
  }

  const command = `braindog addon publish --github`;
</script>

{#if may !== null}
  <Tile icon="lock" class="section" data-surface="tile" title={madeWords.may}>
    <div class="section-body may-body">
      {#if empty}
        <p class="note">{madeWords.mayNothing}</p>
      {:else}
        <ul class="may">
          {#each owned as o (o.key)}
            <li class="may-row">
              <span class="may-glyph"><Icon name={o.glyph} size="s" /></span>
              <span class="may-text">
                <span class="may-title">{o.title}</span>
                <span class="chips">{#each o.chips as c (c)}<span class="chip">{c}</span>{/each}</span>
              </span>
            </li>
          {/each}
          {#each may.rows as r (r.key)}
            <li class="may-row" data-outside={r.outside ? '' : undefined}>
              <span class="may-glyph"><Icon name={r.glyph} size="s" /></span>
              <span class="may-text">
                <span class="may-title">{r.title}</span>
                {#if r.meta}<span class="may-meta">{r.meta}</span>{/if}
                {#if r.chips.length > 0}<span class="chips">{#each r.chips as c (c)}<span class="chip">{c}</span>{/each}</span>{/if}
              </span>
            </li>
          {/each}
          {#if may.inside.length > 0}
            <li class="may-row">
              <span class="may-glyph"><Icon name="code" size="s" /></span>
              <details class="may-text inside">
                <summary class="tap"><span class="may-title">{insideWords(may.inside.length)}</span><span class="may-meta">{words.callsNothing}</span></summary>
                <ul class="inside-list">
                  {#each may.inside as s, i (i)}<li><span>{s.title}</span><span class="may-meta">{s.when}</span></li>{/each}
                </ul>
              </details>
            </li>
          {/if}
        </ul>
      {/if}
      <p class="note">{madeWords.mayNote}</p>
    </div>
  </Tile>
{/if}

{#if answer && source}
  <Tile icon="info" title={madeWords.details}>
    <dl class="facts">
      {#each source.rows as r (r.label)}
        <dt>{r.label}</dt>
        <dd>
          {#if r.mark}<Icon name="check" size="s" />{/if}
          {#if r.href}<a class="repo" href={r.href} target="_blank" rel="noopener noreferrer">{r.value}<Icon name="external" size="s" /></a>{:else if r.value}<span>{r.value}</span>{/if}
          {#if r.chip}<span class="pill-badge" data-tone={r.chip.tone}>{r.chip.text}</span>{/if}
        </dd>
      {/each}
      {#if answer.here?.version}<dt>{words.version}</dt><dd class="num">{answer.here.version}</dd>{/if}
      {#if licence}<dt>{madeWords.licenceLabel}</dt><dd>{licence}</dd>{/if}
      {#if offered}<dt>{madeWords.offeredLabel}</dt><dd>{offered}</dd>{/if}
    </dl>
    {#if source.note}<p class="note">{source.note}</p>{/if}
  </Tile>
{/if}

{#if mine}
  <Tile icon="external" title={madeWords.share}>
    <div class="share">
      <p class="note">{madeWords.shareShort}</p>
      <div class="share-do">
        <Button size="sm" disabled={busy} onclick={() => void download()}><Icon name="download" size="s" />{madeWords.download}</Button>
        <!-- ONE ALREADY ON SOMEBODY'S GITHUB IS SHARED BY ITS OWN LINK, not pushed again. -->
        {#if answer?.trust === 'made-here'}
          <Button size="sm" aria-expanded={githubOpen} onclick={() => (githubOpen = !githubOpen)}><Icon name="code" size="s" />{madeWords.github}</Button>
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
      {#if said}<p class="fault" role="alert"><Icon name="alert" size="s" /><span>{said}</span></p>{/if}
    </div>
  </Tile>
{/if}

<style>
  .may-body,
  .share {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .note,
  .steps p {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .may,
  .inside-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE THING IT MAY DO A ROW: its glyph, its name, one line of when or how, and its hosts and keys as chips. */
  .may-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: start;
    column-gap: var(--sp-3);
    padding-block: var(--sp-1);
  }

  .may-glyph {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--soft-fill, var(--tile-2));
    color: var(--ink-3);
  }

  .may-row[data-outside] .may-glyph {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .may-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
  }

  .may-title {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  .may-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    margin-block-start: var(--sp-1);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-block-size: 22px;
    padding-inline: var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--soft-fill, var(--tile-2));
    color: var(--ink-2);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    line-height: var(--lead-cap);
    overflow-wrap: anywhere;
  }

  /* THE SCRIPTS THAT STAY INSIDE, FOLDED: one row says how many, and opens to their names and when each runs. */
  .inside summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
    list-style: none;
  }

  .inside summary::-webkit-details-marker {
    display: none;
  }

  .inside summary .may-title::after {
    content: ' ›';
    color: var(--ink-3);
  }

  .inside[open] summary .may-title::after {
    content: ' ⌄';
  }

  .inside-list {
    margin-block-start: var(--sp-2);
  }

  .inside-list li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE DETAILS, KEY AND VALUE: the label in the quiet ink on the left, the fact and its chip on the right. */
  .facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .facts dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .facts dd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .facts dd :global(.icon) {
    flex: none;
  }

  .facts dd > :global(.icon:first-child) {
    color: var(--good);
  }

  .repo {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--link, var(--ink));
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

  .fault {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--red-tint);
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .fault :global(.icon) {
    flex: none;
    color: var(--red);
  }
</style>
