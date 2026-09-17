<!--
  The use cases, as cards: `/packs/browse`, the seed of the marketplace (`loop/research-spark.md` S14,
  `loop/research-marketplace.md` §1).

  A CARD IS READ FROM THE USE CASE'S OWN DECLARATIONS (`share.ts` `previewOf`): what it is for, the rail its pages make,
  the headings of its Home and the lists it adds. Nothing on a card is drawn by hand, so a card cannot promise what the
  install does not do.

  INSTALL IS THE SAME PLAN A SHARED FILE GETS. A built-in use case is handed to the record as the file it would be
  (`builtInFile`), planned by `planUseCase` and installed pack by pack through `installPack`. A use case this record
  already holds is switched to, by turning its pack on and the one speaking now off.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { builtInFile, previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { VOICE_LINES } from '$lib/voice.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, packDocument, type PackState, type Source } from '$lib/record/packs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import SharedPlan from '../SharedPlan.svelte';
  import { installShared, offerFor, planShared, switchTo, type SharedPlan as Plan } from '../sharing.ts';

  const cards = USE_CASES.map((u) => ({ u, preview: previewOf(u) }));

  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  let source: Source | null = null;
  let live = $state(false);
  let states = $state<PackState[]>([]);
  let refused = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let plan = $state<{ id: string; plan: Plan } | null>(null);

  async function reread() {
    const again = await source?.packs();
    if (again?.ok) states = again.value;
  }

  onMount(() => {
    void read(async () => {
      client = createClient({ base: location.origin });
      const chosen = await choose(client, !page.data.live);
      source = chosen.source;
      live = !chosen.source.sample;
      if (!chosen.first.ok) {
        refused = chosen.first.refusal.fix;
        return false;
      }
      states = chosen.first.value;
      return true;
    });
  });
  $effect(() => drew('ready'));

  async function offerInstall(id: string, title: string) {
    if (busy !== null) return;
    if (!live || !client) {
      toasts.push(copy.notWritten(copy.shareInstall(title)), { intent: 'warn' });
      return;
    }
    busy = id;
    try {
      const file = builtInFile(id);
      if (!file) return;
      const out = await planShared(client, { text: JSON.stringify(file), source: 'local' }, states, (m, held) => packDocument(m, held));
      if (out.ok) plan = { id, plan: out.plan };
      else toasts.push(out.fix, { intent: 'warn' });
    } finally {
      busy = null;
    }
  }

  async function install() {
    if (!client || !plan || busy !== null) return;
    const { id, plan: p } = plan;
    busy = id;
    try {
      const out = await installShared(client, p);
      if (out.ok) {
        toasts.push(copy.shareInstalled(p.usecase.title), { intent: 'good' });
        plan = null;
      } else toasts.push(out.done.length > 0 ? copy.shareKept(out.fix ?? copy.writeRaced, out.done) : (out.fix ?? copy.writeRaced), { intent: 'warn' });
      await reread();
    } finally {
      busy = null;
    }
  }

  async function switchOver(id: string, title: string, carries: boolean) {
    if (busy !== null) return;
    if (!live || !client) {
      toasts.push(copy.notWritten(copy.switchTo(title)), { intent: 'warn' });
      return;
    }
    busy = id;
    try {
      const out = await switchTo(client, id, states, carries);
      toasts.push(out.ok ? copy.switchedTo(title) : out.fix, { intent: out.ok ? 'good' : 'warn' });
      await reread();
    } finally {
      busy = null;
    }
  }
</script>

<svelte:head><title>{titleOf(copy.useCases)}</title></svelte:head>

<PageHead icon="packs" title={copy.useCases} />

<div class="page">
  <p class="blurb">{copy.useCasesBlurb}</p>
  {#if refused}
    <Empty kind="error" title={refused} />
  {/if}
  <ul class="cards">
    {#each cards as { u, preview } (u.usecase)}
      {@const carries = u.pack !== null}
      {@const offer = offerFor(u.usecase, states, carries)}
      <li class="card">
        <header class="card-head">
          <h2 class="card-title">{u.title}</h2>
          <span class="card-for">{copy.shareAudiences[u.audience]}</span>
        </header>
        <p class="card-summary">{u.summary}</p>
        {#if u.modules.length > 0}<p class="card-note">{copy.browseBuildsOn(u.modules)}</p>{/if}

        <div class="preview" aria-hidden="true">
          <div class="mini-rail">
            <span class="mini-h">{copy.browseRail}</span>
            <span class="mini-item"><Icon name="home" size="s" />{preview.spine.home ?? copy.home}</span>
            <span class="mini-item"><Icon name="decide" size="s" />{preview.spine.decide ?? copy.decide}</span>
            {#each preview.rail as section (section.section)}
              <span class="mini-section">{section.section}</span>
              {#each section.pages as title (title)}<span class="mini-item"><Icon name="doc" size="s" />{title}</span>{/each}
            {/each}
            {#if preview.rail.length === 0}<span class="mini-empty">{copy.browseNoRail}</span>{/if}
          </div>
          <div class="mini-home">
            <span class="mini-h">{copy.browseHome}</span>
            <span class="mini-title">{preview.spine.home ?? copy.home}</span>
            {#each preview.home as heading, i (i)}
              <span class="mini-block">{'voice' in heading ? (heading.text ?? VOICE_LINES[heading.voice]) : heading.text}</span>
            {/each}
            {#if preview.home.length === 0}<span class="mini-empty">{copy.browseHouseHome}</span>{/if}
            {#if preview.lists.length > 0}
              <span class="mini-h lists-h">{copy.browseLists}</span>
              <span class="mini-lists">{preview.lists.join(', ')}</span>
            {/if}
          </div>
        </div>

        <footer class="card-foot">
          {#if offer === 'in-use'}
            <span class="card-in-use"><Icon name="check" size="s" />{copy.inUse}</span>
          {:else if offer === 'switch'}
            <Button weight="quiet" disabled={busy !== null} onclick={() => void switchOver(u.usecase, u.title, carries)}>{copy.switchTo(u.title)}</Button>
          {:else}
            <Button weight="quiet" disabled={busy !== null || plan?.id === u.usecase} onclick={() => void offerInstall(u.usecase, u.title)}>
              {busy === u.usecase && plan?.id !== u.usecase ? copy.packPlanning : copy.shareInstall(u.title)}
            </Button>
          {/if}
        </footer>
        {#if plan?.id === u.usecase}
          <SharedPlan plan={plan.plan} busy={busy !== null} oninstall={() => void install()} oncancel={() => (plan = null)} />
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1100px;
  }

  .blurb {
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .card-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .card-for,
  .card-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .card-summary {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .card-note {
    margin: 0;
  }

  .preview {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: var(--sp-3);
    margin-block: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--r-lg);
    background: var(--s1);
    font-size: var(--t-xs);
  }

  .mini-rail,
  .mini-home {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .mini-h {
    color: var(--dim);
    font-weight: 600;
  }

  .lists-h {
    margin-block-start: var(--sp-2);
  }

  .mini-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink2);
  }

  .mini-section {
    margin-block-start: var(--sp-1);
    color: var(--dim);
  }

  .mini-title {
    color: var(--ink);
    font-weight: 600;
  }

  .mini-block {
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--ink2);
  }

  .mini-empty,
  .mini-lists {
    color: var(--dim);
  }

  .card-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: auto;
  }

  .card-in-use {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
