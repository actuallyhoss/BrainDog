<!--
  Your name, asked once (collab pass 3): somebody signed in whose record holds no name for them, the owner a self-host's
  `init` made above all, is asked "What should people here call you?" with one field, Save and Skip. Until a name is
  given, everybody they share with reads the role ("The owner mentioned you") and never "Someone you share with".

  ONCE, AND ON EVERY DEVICE: a skip is kept on the record as the person's own `name.asked`, so it is not asked again on
  the next laptop. A record too old for the key keeps the skip on this device. Settings > Account renames later.

  THE ONE BANNER, on its quiet note fill, as `RoleWelcome.svelte` draws it.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { nameAskDue, nameAskKey } from './name-ask.ts';

  let { shell }: { shell: Shell } = $props();

  const key = $derived(nameAskKey(apiBase()));
  let done = $state(false);
  let typed = $state('');
  let busy = $state(false);
  let fault = $state('');
  const shown = $derived(!done && nameAskDue(shell, apiBase()));

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy || typed.trim() === '') return;
    busy = true;
    fault = '';
    const out = wrote(await createClient({ base: apiBase() }).renamePerson(typed.trim()));
    busy = false;
    if (!out.ok) {
      fault = out.fix;
      return;
    }
    shell.me.name = out.value.name;
    done = true;
  }

  async function skip(): Promise<void> {
    done = true;
    const out = await createClient({ base: apiBase() })
      .setPref('name.asked', true)
      .catch(() => null);
    if (out?.ok === true) return;
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* blocked storage: asked again next open, the safe side */
    }
  }
</script>

{#if shown}
  <!-- THE WORDS ARE THE BANNER'S LINE AND THE FORM ITS ACTIONS, since the line is a paragraph and a form may not sit in one. -->
  <Banner tone="note" icon="user-check">
    <label for="name-ask-field">What should people here call you?</label>
    {#if fault}<span class="ask-fault" id="name-ask-fault" role="alert">{fault}</span>{/if}
    {#snippet actions()}
      <form class="ask" onsubmit={save}>
        <span class="field ask-field">
          <input class="field-input" id="name-ask-field" type="text" autocomplete="name" maxlength="80" bind:value={typed} disabled={busy} aria-describedby={fault ? 'name-ask-fault' : undefined} />
        </span>
        <span class="ask-presses">
          <Button weight="primary" type="submit" disabled={busy || typed.trim() === ''}>{busy ? 'Saving' : 'Save'}</Button>
          <Button weight="quiet" onclick={() => void skip()} disabled={busy}>Skip</Button>
        </span>
      </form>
    {/snippet}
  </Banner>
{/if}

<style>
  .ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    inline-size: 100%;
  }
  .ask-field {
    flex: 1 1 12rem;
  }
  .ask-presses {
    display: flex;
    flex: none;
    gap: var(--sp-2);
  }
  .ask-fault {
    display: block;
    color: var(--red);
  }
</style>
