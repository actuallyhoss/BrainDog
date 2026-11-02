<!--
  The Keychain's two views, Keys and List: one place for keys (audit 31 Oct g, AG16, his call taken 31 Oct).

  THERE WERE TWO KEYS PAGES. The rail's Keys opened the Keychain ("6 keys. 3 have no value yet."), and the Agents page's
  Keys opened the list of the same rows ("6 open, none late", with Stale, Invalid and Live). The Keychain is the place
  now, and the list is its table view, called List here because the list draws its own Table, Board and Cards under
  it: both carry this switch, both are titled Keychain, and the rail lights the Keychain on either.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { at } from '$lib/at.ts';
  import { KEYS_REGISTER } from '$lib/record/keychain.ts';
  import Segmented from '$lib/ui/Segmented.svelte';

  let { on }: { on: 'keys' | 'table' } = $props();
  const views = [
    { key: 'keys', label: 'Keys', href: '/keychain' },
    { key: 'table', label: 'List', href: `/r/${KEYS_REGISTER}` },
  ] as const;

  /* THE LIST VIEW ONLY WHERE THE RECORD HOLDS THE LIST (empty states, 2 Nov): the Keys list comes with the Agents add-on,
     and a new BrainDog's List opened "No list called". With no list there is one view, so no switch is drawn. */
  const listed = $derived(((page.data as { lists?: readonly { id: string }[] }).lists ?? []).some((l) => l.id === KEYS_REGISTER));
</script>

{#if listed}<div class="key-views">
  <Segmented tag="nav" aria-label="How the Keychain is shown">
    {#each views as v (v.key)}
      <a class="segment" href={at(v.href)} data-on={on === v.key ? '' : undefined} aria-current={on === v.key ? 'page' : undefined}>{v.label}</a>
    {/each}
  </Segmented>
</div>{/if}

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
