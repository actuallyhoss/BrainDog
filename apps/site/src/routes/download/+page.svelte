<script lang="ts">
  /**
   * /download: every platform on one page, with the visitor's own marked once the page has loaded (`deviceOf`).
   *
   * A BUTTON WITH NO ADDRESS IS AN APP NOT OUT YET, and pressing it says "Coming soon" where the store's name was. It
   * is a button and not a link, so nothing here points at a listing that does not exist.
   */
  import { onMount } from 'svelte';
  import { site } from '$lib/copy.ts';
  import { APP } from '$lib/links.ts';
  import { INSTALL, PLATFORMS, WINDOWS_STORE, deviceOf, platformOf, type Device, type Platform, type PlatformId } from '$lib/download.ts';
  import Icon from '$lib/Icon.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Seo from '$lib/site/Seo.svelte';
  import { application, crumbsOf } from '$lib/site/seo.ts';

  const ld = [
    { ...application, downloadUrl: WINDOWS_STORE, installUrl: WINDOWS_STORE },
    crumbsOf([
      { name: 'BrainDog', path: '/' },
      { name: 'Download', path: '/download' },
    ]),
  ];

  let device = $state<Device | null>(null);
  let pressed = $state<Partial<Record<PlatformId, boolean>>>({});
  const mine = $derived(device && device.platform !== 'web' ? platformOf(device.platform) : null);

  onMount(() => {
    device = deviceOf(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  });

  const external = (p: Platform): boolean => p.href !== undefined && p.href.startsWith('http');
</script>

<Seo title={site.meta.download.title} description={site.meta.download.description} path="/download" {ld} />

{#snippet action(p: Platform, tone: string)}
  {#if p.href}
    <a class="btn {tone}" href={p.href} rel={external(p) ? 'external noopener' : undefined}>{p.action}</a>
  {:else}
    <button class="btn {tone}" type="button" aria-live="polite" onclick={() => (pressed[p.id] = true)}>
      {pressed[p.id] ? 'Coming soon' : p.action}
    </button>
  {/if}
{/snippet}

<PageHead title={site.downloadHead.title} lead={site.downloadHead.lead}>
  <div class="here">
    <p class="said">
      {#if device && mine?.href}
        You're on {device.said}.
      {:else if device && mine}
        You're on {device.said}. The app is coming soon, and BrainDog works in your browser until then.
      {:else if device}
        You're on {device.said}. BrainDog works in your browser.
      {:else}
        BrainDog works in any browser, with nothing to install.
      {/if}
    </p>
    <div class="acts">
      {#if mine?.href}
        <a class="btn red" href={mine.href} rel="external noopener">{mine.action}</a>
        <a class="btn ghost" href={APP} rel="external">Open in your browser</a>
      {:else if mine}
        <a class="btn red" href={APP} rel="external">Open in your browser</a>
        {@render action(mine, 'ghost')}
      {:else}
        <a class="btn red" href={APP} rel="external">Open in your browser</a>
      {/if}
    </div>
  </div>
</PageHead>

<section class="wrap all">
  <h2>Every platform</h2>
  <ul class="grid">
    {#each PLATFORMS as p (p.id)}
      <li class="tile plat" class:yours={device?.platform === p.id}>
        <div class="top">
          <span class="well">
            {#if p.mark}
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d={p.mark} /></svg>
            {:else if p.glyph}
              <Icon name={p.glyph} />
            {/if}
          </span>
          {#if device?.platform === p.id}<span class="meta">Your device</span>{/if}
        </div>
        <h3>{p.name}</h3>
        <p class="say">{p.say}</p>
        {#if p.id === 'terminal'}<code>{INSTALL}</code>{/if}
        <div class="go">{@render action(p, 'line')}</div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .here {
    margin-block-start: 28px;
    min-block-size: 116px;
  }
  .said {
    margin: 0 0 18px;
    max-inline-size: 36em;
    color: var(--on-night-2);
    font-size: var(--t-say);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .all {
    padding-block: clamp(48px, 3vw + 36px, 80px);
  }
  h2 {
    margin: 0 0 28px;
    font-size: var(--t-section);
    letter-spacing: -0.02em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .plat {
    gap: 8px;
    padding: 24px;
    min-inline-size: 0;
  }
  .plat.yours {
    box-shadow: inset 0 0 0 2px var(--ink);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: 44px;
    margin-block-end: 8px;
  }
  .well {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 44px;
    block-size: 44px;
    border-radius: var(--r-field);
    background: var(--soft-fill);
    color: var(--ink);
  }
  .meta {
    color: var(--muted);
    font-size: var(--t-meta);
    font-weight: 600;
  }
  h3 {
    margin: 0;
    font-size: var(--t-card);
    font-weight: 600;
    letter-spacing: -0.012em;
  }
  .say {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-text);
    line-height: 1.45;
  }
  code {
    display: block;
    margin-block-start: 8px;
    padding: 10px 12px;
    border-radius: var(--r-ctl);
    background: var(--soft-fill);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .go {
    margin-block-start: auto;
    padding-block-start: 16px;
  }
</style>
