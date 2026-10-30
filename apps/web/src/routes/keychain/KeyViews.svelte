<!--
  The Keychain's two views, Keys and Table: one place for keys (audit 31 Oct g, AG16, his call taken 31 Oct).

  THERE WERE TWO KEYS PAGES. The rail's Keys opened the Keychain ("6 keys. 3 have no value yet."), and the Agents page's
  Keys opened the list of the same rows ("6 open, none late", with Stale, Invalid and Live). The Keychain is the place
  now, and the list is its Table view: both carry this switch, both are titled Keychain, and the rail lights the
  Keychain on either.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { KEYS_REGISTER } from '$lib/record/keychain.ts';
  import Segmented from '$lib/ui/Segmented.svelte';

  let { on }: { on: 'keys' | 'table' } = $props();
  const views = [
    { key: 'keys', label: 'Keys', href: '/keychain' },
    { key: 'table', label: 'Table', href: `/r/${KEYS_REGISTER}` },
  ] as const;
</script>

<div class="key-views">
  <Segmented tag="nav" aria-label="How the Keychain is shown">
    {#each views as v (v.key)}
      <a class="segment" href={at(v.href)} data-on={on === v.key ? '' : undefined} aria-current={on === v.key ? 'page' : undefined}>{v.label}</a>
    {/each}
  </Segmented>
</div>

<style>
  .key-views {
    display: flex;
  }

  /* A LINK DRAWN AS A SEGMENT CENTRES ITS WORD as a button does, as Money's book switch draws it. */
  .key-views :global(a.segment) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    text-decoration: none;
  }
</style>
