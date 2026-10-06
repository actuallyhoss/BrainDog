<!--
  A passkey, offered at the end of a new record's first run (`Made.svelte`), once the BrainDog is made.

  A PERSON WHO SIGNED UP HAS ONLY THEIR MAILBOX. They proved it with a link and landed here; without a passkey every
  later sign-in is another email to wait for. So the end of the first run offers a way back in on this device, after
  the build rather than before the question (research-firstrun-17), and "Not now" leaves it for Settings > Recovery.

  ASKED ONLY WHEN IT WOULD HELP: the host offers passkeys, this person has none yet (`firstRun` is about THIS person
  once they are signed in, `packages/ports/src/auth.ts`), and this browser can make one. Everybody else never sees it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { methods, passkeyRegister, support } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  let shown = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);

  onMount(() => {
    const can = support();
    if (!can.webauthn || !can.secure) return;
    void methods().then((out) => {
      shown = out.ok && out.value.passkey && out.value.me !== null && out.value.firstRun === true;
    });
  });

  async function add() {
    /* ONE CEREMONY AT A TIME: a second press while the device is asking does nothing. */
    if (busy) return;
    busy = true;
    said = null;
    const out = await passkeyRegister();
    busy = false;
    if (out.ok) {
      shown = false;
      said = copy.passkeyAdded;
      return;
    }
    /* THE SHEET CLOSED ON PURPOSE IS NOT A FAILURE, and the ask stays where it was. */
    if (out.kind !== 'cancelled') said = copy.passkeyFirstFailed;
  }
</script>

{#if shown}
  <section class="first" aria-labelledby="first-h">
    <IconWell name="key" size="l" />
    <div class="first-main">
      <!-- A PARAGRAPH AND NOT A HEADING, as `/start`'s own "again" note is: it sits above the page's one `h1`. -->
      <p class="first-h" id="first-h">{copy.passkeyFirstTitle}</p>
      <p class="first-why">{copy.passkeyFirstWhy}</p>
      {#if said}<p class="first-said" role="status">{said}</p>{/if}
      <div class="first-go">
        <!-- QUIET, NOT INK: the screen's one primary is the answer below it, and this is asked beside it. -->
        <Button weight="quiet" onclick={() => void add()} aria-busy={busy}>
          <Icon name="key" size="m" />{busy ? copy.addingPasskey : copy.addPasskeyHere}
        </Button>
        <Button weight="bare" onclick={() => (shown = false)}>{copy.passkeyFirstLater}</Button>
      </div>
    </div>
  </section>
{:else if said}
  <p class="first-said" role="status">{said}</p>
{/if}

<style>
  /* A ROW ON THE GROUND, not a boxed panel: the key in its well, the ask and why, and the two answers under them. */
  .first {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
    max-inline-size: var(--measure);
  }

  .first-main {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .first-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .first-why,
  .first-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* SIDE BY SIDE WHERE THEY FIT, and each the full width of the column on a phone, at the 44px floor. */
  .first-go {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  @media (width < 640px) {
    .first-go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
