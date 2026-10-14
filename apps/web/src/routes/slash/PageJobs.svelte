<!--
  A page composed on the owner's own machine, from Slash: `page-jobs.ts`.

  ONE QUIET TILE A KIND, AND NOTHING WITHOUT ONE. Every approved kind whose one argument is the page gets its own title,
  a picker of the record's own pages by their titles, and one button that names the page. A record with no such kind
  draws nothing at all, not even a heading, so a record without the add-on never learns this part is here.

  WHILE ONE RUNS, ITS LINE: "Working on <machine>: composing <page>", or "Waiting for your machine" before one takes it,
  linked to the run's own view at `/jobs/<id>`. The runs are asked again every `LIST_POLL_MS` only while one is live, so
  a run that ends is seen to end and an idle screen asks nothing.

  THE OWNER'S PRESS AND NOTHING ELSE. Nothing here starts a run on its own: the button is the only caller of
  `startPageJob`, and a refusal is said under it in the record's own sentence. Drawn on a live record for its owner
  only; the sample and a member see nothing.

  LOADED BY `import()` FROM THE PAGE, so no other screen and no visit without the add-on pays for it, and its CSS is
  its own.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { LIST_POLL_MS, isLive, readJobs, type JobKind, type JobRow } from '$lib/record/jobs.ts';
  import { pageJobLine, pageWords, readPageKinds, startPageJob, type PageJobsClient } from '$lib/record/page-jobs.ts';

  let kinds = $state<JobKind[]>([]);
  let runs = $state<JobRow[]>([]);
  let pages = $state<{ slug: string; title: string }[]>([]);
  let picked = $state<Record<string, string>>({});
  let refused = $state<Record<string, string>>({});
  let busy = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gone = false;

  const names = $derived(new Map(pages.map((p) => [p.slug, p.title])));
  const titleOf = (slug: string): string => names.get(slug) ?? slug;

  async function readRuns(): Promise<void> {
    const got = await readJobs(apiBase());
    if (got.ok) runs = got.value.jobs;
    if (timer) clearTimeout(timer);
    timer = !gone && runs.some((r) => kinds.some((k) => k.id === r.kind) && isLive(r.status)) ? setTimeout(() => void readRuns(), LIST_POLL_MS) : null;
  }

  onMount(async () => {
    if (!page.data.live || page.data.me?.owner !== true) return;
    try {
      const base = apiBase();
      const first = await readJobs(base);
      const seen = first.ok ? first.value.jobs : [];
      const offered = await readPageKinds(base, seen);
      if (!offered.ok || offered.value.length === 0 || gone) return;
      const listed = await createClient({ base }).pages();
      const rows = listed.ok && Array.isArray(listed.value) ? listed.value : [];
      pages = rows.flatMap((r) => {
        const p = r as { slug?: unknown; title?: unknown };
        return typeof p.slug === 'string' && p.slug !== '' ? [{ slug: p.slug, title: typeof p.title === 'string' && p.title !== '' ? p.title : p.slug }] : [];
      });
      runs = seen;
      kinds = offered.value;
      picked = Object.fromEntries(kinds.map((k) => [k.id, pages[0]?.slug ?? '']));
      await readRuns();
    } catch {
      /* NOTHING REACHED, NOTHING DRAWN: the rest of Slash stands without this part. */
    }
  });

  onDestroy(() => {
    gone = true;
    if (timer) clearTimeout(timer);
  });

  async function start(kind: JobKind): Promise<void> {
    const slug = picked[kind.id] ?? '';
    if (busy !== null || slug === '') return;
    busy = kind.id;
    refused = { ...refused, [kind.id]: '' };
    try {
      const out = await startPageJob(createClient({ base: apiBase() }) as unknown as PageJobsClient, kind.id, slug);
      if (!out.ok) {
        refused = { ...refused, [kind.id]: out.fix };
        return;
      }
      toasts.push(pageWords.started);
      await readRuns();
    } finally {
      busy = null;
    }
  }
</script>

{#each kinds as kind (kind.id)}
  {@const line = pageJobLine(runs, kind.id, names)}
  <!-- A RECORD WITH NO PAGE TO PICK AND NO RUN gets no tile: a title with nothing under it is only noise. -->
  {#if line || pages.length > 0}
    <Tile icon="monitor" title={kind.title} data-part="page-jobs">
      {#if line}
        <p class="pj-line" role="status"><a href={at(`/jobs/${line.id}`)}>{line.text}</a></p>
      {:else if pages.length > 0}
        <div class="pj-press">
          <label class="pj-ask">
            <span class="pj-label">{pageWords.pick}</span>
            <select class="pj-select" bind:value={picked[kind.id]}>
              {#each pages as p (p.slug)}<option value={p.slug}>{p.title}</option>{/each}
            </select>
          </label>
          <Button disabled={busy !== null} onclick={() => void start(kind)}>{pageWords.press(titleOf(picked[kind.id] ?? ''))}</Button>
        </div>
        {#if refused[kind.id]}<p class="pj-fix" role="alert">{refused[kind.id]}</p>{/if}
      {/if}
    </Tile>
  {/if}
{/each}

<style>
  .pj-line,
  .pj-fix {
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .pj-line a {
    color: var(--link);
  }

  .pj-fix {
    color: var(--ink);
  }

  .pj-press {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--sp-3);
  }

  .pj-ask {
    display: flex;
    flex: 1 1 14rem;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .pj-label {
    color: var(--ink2);
    font-size: var(--fs-body);
  }

  .pj-select {
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  @media (pointer: coarse) {
    .pj-line a {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }

    .pj-select {
      min-block-size: 44px;
    }
  }
</style>
