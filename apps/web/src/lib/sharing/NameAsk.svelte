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
  import { dismiss } from '$lib/motion/index.ts';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { nameAskDue, nameAskKey } from './name-ask.ts';

  let { shell }: { shell: Shell } = $props();

  const key = $derived(nameAskKey(apiBase()));
  let done = $state(false);
  let typed = $state('');
  let busy = $state(false);
  let fault = $state('');
  let field = $state<HTMLInputElement | null>(null);
  const shown = $derived(!done && nameAskDue(shell, apiBase()));

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    /* A PRIMARY IS NEVER GREYED FOR A MISSING FIELD (Look B): pressed empty, it says what is missing and goes to it. */
    if (typed.trim() === '') {
      fault = 'Type the name you go by first.';
      field?.focus();
      return;
    }
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
  <!-- ANSWERED OR SKIPPED, IT LETS GO AND THE PAGE UNDER IT RISES INTO ITS ROOM (motion pass 2 Nov), rather than the page
       jumping up by the banner's height. `global`, because the frame's own if takes it away in the same moment. -->
  <div out:dismiss|global>
  <!-- THE WORDS ARE THE BANNER'S LINE AND THE FORM ITS ACTIONS, since the line is a paragraph and a form may not sit in one. -->
  <Banner tone="note" icon="user-check">
    <label for="name-ask-field">What should people here call you?</label>
    {#if fault}<span class="ask-fault" id="name-ask-fault" role="alert">{fault}</span>{/if}
    {#snippet actions()}
      <form class="ask" onsubmit={save}>
        <span class="field ask-field">
          <input class="field-input" id="name-ask-field" type="text" autocomplete="name" maxlength="80" bind:value={typed} bind:this={field} oninput={() => (fault = '')} disabled={busy} aria-describedby={fault ? 'name-ask-fault' : undefined} />
        </span>
        <span class="ask-presses">
          <Button weight="primary" type="submit" disabled={busy}>{busy ? 'Saving' : 'Save'}</Button>
          <Button weight="quiet" onclick={() => void skip()} disabled={busy}>Skip</Button>
        </span>
      </form>
    {/snippet}
  </Banner>
  </div>
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
