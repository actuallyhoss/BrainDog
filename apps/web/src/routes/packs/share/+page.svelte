<!--
  Share this setup: `/packs/share` (`loop/research-spark.md` S14).

  WHAT GOES IN THE FILE IS SAID BEFORE THE BUTTON, and none of the record's rows go in unless one is ticked here. The
  record writes the file (`exportUseCase`), reading it back through the door a stranger's file comes in by, so a row
  holding a credential is refused on this screen rather than on somebody else's record.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { useCaseName } from '@braindog/seed/usecases/names';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { read } from '$lib/data/record.ts';
  import { saveDog } from '$lib/dog/source.ts';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import { exportShared, listWords, nextPatch, rowTitle, speakingOf } from '../sharing.ts';

  const AUDIENCES = ['individual', 'founder', 'team', 'starter', 'other'] as const;
  const EXAMPLES_MOST = 8;

  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  let live = $state(false);
  let refused = $state<string | null>(null);
  let states = $state<PackState[]>([]);
  let rows = $state<Record<string, { seq: number; title: string }[]>>({});
  let picked = $state<Record<string, number[]>>({});
  /** Each list by the word this record gives it, so a list renamed Modules is picked from under Modules. */
  let names = $state<Record<string, string>>({});
  let title = $state('');
  let version = $state('');
  let summary = $state('');
  let audience = $state<(typeof AUDIENCES)[number]>('other');
  let busy = $state(false);
  let wrong = $state<string | null>(null);

  const speaking = $derived(speakingOf(states));
  const own = $derived(states.find((s) => s.id === `usecase-${speaking}`) ?? null);
  const count = $derived(Object.values(picked).reduce((n, seqs) => n + seqs.length, 0));

  onMount(() => {
    void read(async () => {
      client = createClient({ base: location.origin });
      const chosen = await choose(client, !page.data.live);
      live = !chosen.source.sample;
      if (!chosen.first.ok) {
        refused = chosen.first.refusal.fix;
        return false;
      }
      states = chosen.first.value;
      const id = speakingOf(states);
      if (id !== null) {
        title = useCaseName(id);
        version = nextPatch(states.find((s) => s.id === `usecase-${id}`)?.version ?? null);
      } else version = '1.0.0';
      if (live && own) {
        const config = await client.packConfig({ id: own.id });
        const values = config.ok ? ((config.value as { values?: Record<string, unknown> }).values ?? {}) : {};
        names = Object.fromEntries(own.registers.flatMap((r) => (typeof values[`label_${r}`] === 'string' && values[`label_${r}`] !== '' ? [[r, values[`label_${r}`] as string]] : [])));
        const out: typeof rows = {};
        for (const register of own.registers) {
          const listed = await client.list({ register, limit: 50 });
          out[register] = listed.ok ? (listed.value.rows as { seq: number | null; fields: Record<string, unknown> }[]).flatMap((r) => (r.seq === null ? [] : [{ seq: r.seq, title: rowTitle(r.fields) }])) : [];
        }
        rows = out;
      }
      return true;
    });
  });
  $effect(() => drew('ready'));

  function toggle(register: string, seq: number, on: boolean) {
    const now = picked[register] ?? [];
    picked = { ...picked, [register]: on ? [...now, seq].slice(0, EXAMPLES_MOST) : now.filter((n) => n !== seq) };
  }

  async function download() {
    if (!client || busy || !live) return;
    busy = true;
    wrong = null;
    try {
      const examples = Object.fromEntries(Object.entries(picked).filter(([, seqs]) => seqs.length > 0));
      const out = await exportShared(client, {
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(version.trim() ? { version: version.trim() } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        audience,
        ...(Object.keys(examples).length > 0 ? { examples } : {}),
      });
      if (!out.ok) {
        wrong = out.fix;
        return;
      }
      saveDog(out.file, out.text);
      toasts.push(copy.shareDownloaded(out.file, count), { intent: 'good' });
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{titleOf(copy.shareSetup)}</title></svelte:head>

<PageHead icon="packs" title={copy.shareSetup} />

<div class="page">
  <p class="blurb">{copy.shareWhat}</p>
  {#if refused}
    <Empty kind="error" title={refused} />
  {:else}
    {#if !live}<p class="note" role="status">{copy.shareSampleNote}</p>{/if}
    {#if live && speaking === null}<p class="note">{copy.shareNoUseCase}</p>{/if}

    <form
      class="share-form"
      onsubmit={(e) => {
        e.preventDefault();
        void download();
      }}
    >
      <div class="pair">
        <label class="field-label" for="share-title">{copy.shareTitle}</label>
        <div class="field"><input class="field-input" id="share-title" type="text" autocomplete="off" bind:value={title} /></div>
      </div>
      <div class="pair narrow">
        <label class="field-label" for="share-version">{copy.shareVersion}</label>
        <div class="field"><input class="field-input" id="share-version" type="text" inputmode="decimal" autocomplete="off" bind:value={version} /></div>
      </div>
      <div class="pair wide">
        <label class="field-label" for="share-summary">{copy.shareSummary}</label>
        <div class="field"><input class="field-input" id="share-summary" type="text" autocomplete="off" bind:value={summary} /></div>
      </div>
      <div class="pair">
        <label class="field-label" for="share-audience">{copy.shareAudience}</label>
        <select class="share-select" id="share-audience" bind:value={audience}>
          {#each AUDIENCES as a (a)}<option value={a}>{copy.shareAudiences[a]}</option>{/each}
        </select>
      </div>

      {#if live && own && own.registers.length > 0}
        <Section title={copy.shareExamples}>
          <p class="note">{count === 0 ? copy.shareExamplesNone : copy.shareExamplesPicked(count)} {copy.shareExamplesMost}</p>
          {#each own.registers as register (register)}
            <fieldset class="rows">
              <legend class="rows-h">{names[register] ?? listWords(register)}</legend>
              {#each rows[register] ?? [] as row (row.seq)}
                {@const on = (picked[register] ?? []).includes(row.seq)}
                <label class="row-pick">
                  <input type="checkbox" checked={on} disabled={!on && (picked[register]?.length ?? 0) >= EXAMPLES_MOST} onchange={(e) => toggle(register, row.seq, e.currentTarget.checked)} />
                  <span>{row.title}</span>
                </label>
              {:else}
                <p class="note">{copy.shareNoRows}</p>
              {/each}
            </fieldset>
          {/each}
        </Section>
      {/if}

      {#if wrong}<p class="wrong" role="alert">{wrong}</p>{/if}
      <div class="actions">
        <Button weight="primary" type="submit" disabled={busy || !live}>{copy.shareDownload}</Button>
        <Button weight="bare" href="/packs">{copy.packs}</Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  .blurb {
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .share-form {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--sp-3) var(--sp-4);
  }

  .share-form > :global(section),
  .share-form > .wrong,
  .share-form > .actions,
  .pair.wide {
    grid-column: 1 / -1;
  }

  .pair {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .share-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 100%;
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: var(--sp-3) 0 0;
    padding: 0;
    border: 0;
  }

  .rows-h {
    margin-block-end: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .row-pick {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .wrong {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (width < 640px) {
    .share-form {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
