<!--
  A passkey, offered straight after the link (use case 6, step 4): sign-up draws this the moment the email link has
  signed the person in, before the build is made, so their next visit is one touch on this device.

  A PERSON WHO SIGNED UP HAS ONLY THEIR MAILBOX. Without a passkey every later sign-in is another email to wait for.
  So the ask comes while they are still holding the device that opened the link, in that device's own name ("Use this
  iPhone", `passkeyAsk`), and the passkey is named for it as it is made (`platformLabel`), so Settings lists
  it by the device and not as "Passkey". One press; "Not now" leaves it for Settings > Recovery.

  ASKED ONLY WHEN IT WOULD HELP (`passkeyOffered`): the host offers passkeys, this person has none yet, and this browser
  can make one. Everybody else never sees it, and `ondone` is told at once so the page moves on.

  `ondone` IS THE CALLER'S WAY ON, told once: `true` when a passkey was made, `false` for "Not now" or nothing to offer.
  The sheet closed on purpose is neither, and the ask stays.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { methods, passkeyRegister, platformLabel, support } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { passkeyAsk, passkeyOffered } from './building.ts';

  let { ondone }: { ondone?: ((kept: boolean) => void) | undefined } = $props();

  let shown = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);
  const label = platformLabel();
  const ask = passkeyAsk(label);

  let told = false;
  function done(kept: boolean) {
    if (told) return;
    told = true;
    ondone?.(kept);
  }

  onMount(() => {
    const can = support();
    if (!can.webauthn || !can.secure) return done(false);
    void methods().then((out) => {
      shown = passkeyOffered(can, out);
      if (!shown) done(false);
    });
  });

  async function add() {
    /* ONE CEREMONY AT A TIME: a second press while the device is asking does nothing. */
    if (busy) return;
    busy = true;
    said = null;
    const out = await passkeyRegister(undefined, label);
    busy = false;
    if (out.ok) {
      shown = false;
      said = ask.kept;
      done(true);
      return;
    }
    /* THE SHEET CLOSED ON PURPOSE IS NOT A FAILURE, and the ask stays where it was. */
    if (out.kind !== 'cancelled') said = copy.passkeyFirstFailed;
  }

  function later() {
    shown = false;
    done(false);
  }
</script>

{#if shown}
  <section class="first" aria-labelledby="first-h" data-passkey-first>
    <IconWell name="key" size="l" />
    <div class="first-main">
      <!-- A PARAGRAPH AND NOT A HEADING: it sits beside the page's one `h1`, which is the step's. -->
      <p class="first-h" id="first-h">{ask.title}</p>
      <p class="first-why">{ask.why}</p>
      {#if said}<p class="first-said" role="status">{said}</p>{/if}
      <div class="first-go">
        <!-- THE ONE PRESS, AND THE STEP'S PRIMARY: nothing else is asked of the person on this screen. -->
        <Button weight="primary" onclick={() => void add()} aria-busy={busy}>
          <Icon name="key" size="m" />{busy ? copy.addingPasskey : ask.press}
        </Button>
        <Button weight="bare" onclick={later}>{ask.later}</Button>
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
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  .first-why,
  .first-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
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
