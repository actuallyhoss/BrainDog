<!--
  An add-on's actions in a row's menu (`row_actions` in its file), in the list's row menu and on the row's own page: each runs one of its scripts with this row, says the
  add-on's name, and tells what it did in a toast. Nothing is drawn when no add-on that is on acts on this list.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { addonActions, runAddon, type AddonRowAction } from './addon-actions.ts';

  let { register, row, onclose, ondone }: { register: string; row: string; onclose: () => void; ondone?: (() => void) | undefined } = $props();

  let actions = $state<AddonRowAction[]>([]);
  $effect(() => {
    const list = register;
    void addonActions().then((a) => {
      actions = a.row_actions.filter((x) => x.list === list);
    });
  });

  async function run(a: AddonRowAction): Promise<void> {
    onclose();
    const ran = await runAddon({ addon: a.addon, action: a.script, row });
    toasts.push(ran.say, ran.ok ? {} : { intent: 'warn' });
    if (ran.ok) ondone?.();
  }
</script>

{#if actions.length > 0}
  <hr class="mi-rule" />
  {#each actions as a (a.addon + a.script)}
    <button class="mi" role="menuitem" type="button" onclick={() => run(a)}>
      <Icon name="plug" size="s" />
      <span class="mi-name">{a.title}</span>
      <span class="mi-from">{a.addon_title}</span>
    </button>
  {/each}
{/if}

<style>
  /* ITS OWN RULE, since the menu's is scoped to the menu that draws it: the list's row menu and the row's own page. */
  .mi-rule {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--rule);
  }

  .mi-name {
    flex: 1;
  }

  /* THE ADD-ON IT COMES FROM, quiet at the end, so an action nobody at BrainDog wrote says whose it is. */
  .mi-from {
    font: var(--t-meta);
    color: var(--ink-3);
  }
</style>
