<!--
  Packs, and the Kennel.

  A pack declares CONTENT AND IDENTITY — never position or visibility. That is Chrome's line, stated
  most plainly of anyone: extension actions are unpinned by default, and `isOnToolbar` is exposed to
  the extension READ-ONLY. There is no `default_area` and no auto-pin (19 §3).

  Selecting a pack means reading an install diff written in the language of metrics and nav order,
  which is why pack selection is the SECOND screen and never the first: asking a brand-new user to
  approve four schema reviews before they have seen one of their own rows is worse than a tour.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { PACKS } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const installed = PACKS.filter((p) => p.installed);
  const available = PACKS.filter((p) => !p.installed);

  let diff = $state<string | null>(null);
</script>

<PageHead title={copy.packs} />

<div class="page">
  <Section title={copy.installed} count={installed.length}>
    <div class="grid-packs">
      {#each installed as pack}
        <article class="pack">
          <header class="pack-head">
            <h3 class="pack-name">{pack.name}</h3>
            <span class="pack-version">{pack.version}</span>
          </header>
          <p class="pack-blurb">{pack.blurb}</p>
          <ul class="pack-gives">
            {#each pack.registers as r}<li><Icon name="packs" size="s" />{r}</li>{/each}
            {#each pack.pages as p}<li><Icon name="home" size="s" />{p}</li>{/each}
          </ul>
          <footer class="pack-foot">
            <Button weight="bare" onclick={() => (diff = diff === pack.id ? null : pack.id)}>
              {copy.installDiff}
            </Button>
            <Button weight="bare" tone="bad">{copy.uninstall}</Button>
          </footer>
          {#if diff === pack.id}
            <pre class="diff"><code>{`+ register.${pack.registers[0]}     ${pack.registers.length} field(s) added
+ page.${pack.pages[0] ?? '—'}         placed in nav, section "${pack.name}"
+ 1 example row, marked example, deletable in one click

nav order is read ONCE, at install, and never re-read.
an update that would move something is shown here and then ignored.`}</code></pre>
          {/if}
        </article>
      {/each}
    </div>
  </Section>

  <Section title={copy.browse} count={available.length}>
    <ul class="ledger">
      {#each available as pack}
        <li>
          <div class="line">
            <span class="seq">{pack.author}</span>
            <span class="line-main">
              <span class="line-title">{pack.name}</span>
              <span class="line-detail">{pack.blurb}</span>
            </span>
            <span class="line-amount">
              {#if pack.stars}<span class="stars">{pack.stars}★</span>{/if}
            </span>
            <span class="line-when"><Button weight="quiet">{copy.install}</Button></span>
          </div>
        </li>
      {/each}
    </ul>
  </Section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .grid-packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .pack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
  }

  .pack-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .pack-name {
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }

  .pack-version {
    margin-inline-start: auto;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .pack-blurb {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .pack-gives {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pack-gives li {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .pack-foot {
    display: flex;
    gap: var(--sp-1);
    margin-block-start: var(--sp-1);
    margin-inline-start: calc(var(--sp-3) * -1);
  }

  .diff {
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 1.7;
    overflow-x: auto;
  }

  .stars {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 1200px) {
    .grid-packs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .grid-packs {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
