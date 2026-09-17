<!--
  One use case, before it is installed: `/packs/browse/<id>` (`loop/research-marketplace.md` §1, the detail page).

  EVERYTHING HERE IS READ FROM THE USE CASE ITSELF, never written for the page: what it is for and who for, the rail and
  Home it draws (`previewOf`), the lists and pages and example rows it adds (`installsOf`), the lines of the house voice
  it replaces, the skills it suggests, and its version. So the page cannot promise what installing does not do.

  INSTALL IS THE CARD'S (`Offer.svelte`): the file planned by the record, the plan read here, and each pack installed
  through `installPack`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { useCase } from '@braindog/seed/usecases';
  import { installsOf, previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { VOICE_LINES, type VoiceKey } from '$lib/voice.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, type PackState, type Source } from '$lib/record/packs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '../../../../lib/ui/screen.svelte.ts';
  import Offer from '../Offer.svelte';
  import { moduleTitle } from '../../sharing.ts';
  import Preview from '../Preview.svelte';
  import CatalogueDetail from './CatalogueDetail.svelte';
  import { readHostCatalogue } from '../catalogue.ts';
  import type { CatalogueEntry } from '@braindog/declare/catalogue';

  /* A CATALOGUE'S USE CASE IS ASKED FOR BY NAME (`?from=catalogue`), so one published under a built-in's id is still reachable. An add-on
     says its kind (`&kind=pack`), so one sharing an id with a use case is found as itself. */
  const fromCatalogue = $derived(page.url.searchParams.get('from') === 'catalogue');
  const kindAsked = $derived(page.url.searchParams.get('kind') === 'pack' ? 'pack' : 'usecase');
  const u = $derived(fromCatalogue ? null : (useCase(page.params.id ?? '') ?? null));
  let entry = $state.raw<CatalogueEntry | null>(null);
  let looked = $state(false);
  const preview = $derived(u ? previewOf(u) : null);
  const installs = $derived(u ? installsOf(u) : null);
  const voice = $derived(u ? (Object.entries(u.voice) as [VoiceKey, string][]) : []);

  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  let source: Source | null = null;
  let live = $state(false);
  let states = $state<PackState[]>([]);
  let refused = $state<string | null>(null);

  async function reread() {
    const again = await source?.packs();
    if (again?.ok) states = again.value;
  }

  onMount(() => {
    void readHostCatalogue(fetch).then((got) => {
      entry = got.ok ? (got.index?.entries.find((e) => e.id === page.params.id && e.kind === kindAsked) ?? null) : null;
      looked = true;
    });
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
  /* ONLY A USE CASE THAT EXISTS SAYS READY. The missing one is `Empty`'s to report, and it does. This effect called
     `drew('empty')` itself, whose `s.empties++` reads what it writes, so the effect depended on itself and threw
     `effect_update_depth_exceeded`: an unknown id drew its sentence and never settled. */
  $effect(() => {
    if (u || entry) drew('ready');
  });
</script>

<svelte:head><title>{titleOf(u?.title ?? entry?.title ?? copy.useCases)}</title></svelte:head>

<PageHead icon="packs" title={u?.title ?? entry?.title ?? copy.useCases} />

<div class="page">
  <Button weight="bare" href="/packs/browse"><Icon name="back" size="s" />{copy.useCaseAll}</Button>

  {#if !u && entry}
    {#if refused}<Empty kind="error" title={refused} />{/if}
    <CatalogueDetail {entry} {client} {live} {states} onchanged={reread} />
  {:else if !u || !preview || !installs}
    {#if looked || u}<Empty kind="no-results" title={copy.useCaseMissing} />{/if}
  {:else}
    {#if refused}<Empty kind="error" title={refused} />{/if}

    <section class="lead" aria-label={copy.useCaseFor}>
      <p class="for">{copy.shareAudiences[u.audience]}</p>
      <p class="summary">{u.summary}</p>
      <p class="meta">{copy.useCaseTone(u.tone)} {copy.useCaseVersion(u.version, u.author, u.license)}</p>
      <div class="offer"><Offer {u} {client} {live} {states} onchanged={reread} /></div>
    </section>

    <div class="grid">
      <section class="panel wide" aria-labelledby="uc-preview">
        <h2 class="panel-h" id="uc-preview">{copy.browseRail} · {copy.browseHome}</h2>
        <Preview {preview} large />
      </section>

      <section class="panel" aria-labelledby="uc-installs">
        <h2 class="panel-h" id="uc-installs">{copy.useCaseInstalls}</h2>
        <dl class="facts">
          {#if installs.modules.length > 0}
            <dt>{copy.useCaseModulesFirst}</dt>
            <dd>{installs.modules.map(moduleTitle).join(', ')}</dd>
          {/if}
          {#if installs.lists.length > 0}
            <dt>{copy.browseLists}</dt>
            <dd>
              <ul class="names">
                {#each installs.lists as name (name)}<li><Icon name="rows" size="s" />{name}</li>{/each}
              </ul>
            </dd>
          {/if}
          {#if installs.pages.length > 0}
            <dt>{copy.useCasePages}</dt>
            <dd>
              <ul class="names">
                {#each installs.pages as p (p.title)}<li><Icon name="doc" size="s" />{p.title}{#if p.section && p.section.toLowerCase() !== p.title.toLowerCase()}<span class="section">{p.section}</span>{/if}</li>{/each}
              </ul>
            </dd>
          {/if}
          {#if installs.lists.length === 0 && installs.pages.length === 0}
            <dd class="span">{copy.useCaseNothingOwn}</dd>
          {:else}
            <dt>{copy.diffSeeds}</dt>
            <dd>{copy.useCaseExamples(installs.examples)}</dd>
          {/if}
        </dl>
      </section>

      <section class="panel" aria-labelledby="uc-voice">
        <h2 class="panel-h" id="uc-voice">{copy.useCaseVoice}</h2>
        {#if voice.length === 0}
          <p class="quiet">{copy.useCaseVoiceHouse}</p>
        {:else}
          <ul class="voice">
            {#each voice as [key, line] (key)}
              <li><span class="house">{VOICE_LINES[key]}</span><Icon name="arrow" size="s" /><span class="theirs">{line}</span></li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if installs.skills.length > 0}
        <section class="panel wide" aria-labelledby="uc-skills">
          <h2 class="panel-h" id="uc-skills">{copy.useCaseSkills}</h2>
          <ul class="skills">
            {#each installs.skills as skill (skill.name)}
              <li><span class="skill-name">{skill.name}</span><span class="quiet">{skill.trigger}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1100px;
  }

  .page > :global(*) {
    max-inline-size: 100%;
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    inline-size: 100%;
    max-inline-size: 70ch;
  }

  .for,
  .meta,
  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.6;
  }

  .offer {
    margin-block-start: var(--sp-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    inline-size: 100%;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .wide {
    grid-column: 1 / -1;
  }

  .panel-h {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--ink2);
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .facts dt {
    color: var(--dim);
    font-weight: 600;
  }

  .facts dd {
    margin: 0;
    min-inline-size: 0;
  }

  .facts .span {
    grid-column: 1 / -1;
  }

  .names,
  .voice,
  .skills {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .names li,
  .voice li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .section {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .house {
    color: var(--dim);
  }

  .theirs {
    color: var(--ink);
    font-weight: 600;
  }

  .skills li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .skill-name {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  @media (width < 720px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
