<!--
  Add-ons' two places, Installed and Browse, as the one segmented control under the page's name (the UI pass of 20
  October, agents F8 and F9). They were two pages with two names, "Add-ons" and "Use cases and add-ons", and a Browse
  button beside three tabs; now both are Add-ons, and this says which half is open. Links, so each half has its address
  and Back works between them. Full width on a phone (`Segmented`'s `full`).
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { words } from './words.ts';

  let { current }: { current: 'installed' | 'browse' } = $props();

  const PLACES = [
    { id: 'installed', href: '/packs', label: words.tabs.installed },
    { id: 'browse', href: '/packs/browse', label: words.tabs.browse },
  ] as const;
</script>

<Segmented tag="nav" full class="addons-tabs" aria-label={words.tabsLabel}>
  {#each PLACES as p (p.id)}
    <a class="segment" href={at(p.href)} aria-current={current === p.id ? 'page' : undefined} data-on={current === p.id ? '' : undefined}>{p.label}</a>
  {/each}
</Segmented>

<style>
  /* LINKS DRAWN AS SEGMENTS: no underline, and from 640px the track hugs its two words rather than running across the
     page. On a phone it is the page's width (`full`). */
  :global(.segmented.addons-tabs) a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }

  @media (width >= 640px) {
    :global(.segmented.addons-tabs) {
      inline-size: fit-content;
    }
  }
</style>
