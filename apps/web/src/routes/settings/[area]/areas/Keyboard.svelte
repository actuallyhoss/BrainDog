<!--
  Settings > Keyboard.

  `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import * as pref from '$lib/pref.ts';
  import { copy } from '$lib/copy.ts';
  import Section from '$lib/ui/Section.svelte';
  import Keymap from '$lib/ui/Keymap.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';

  /* EVERY AREA TAKES THE SAME PROPS. This one draws a preference of the device and reads none of them. */
  let props: AreaProps = $props();

  /* SEEDED FROM WHAT IS REMEMBERED, so the switch shows the state the keyboard is already in. */
  const held = pref.read();
  let chars = $state(held.chars ?? true);

  /* AND THE CHARACTER KEYS ARE REMEMBERED. It is the one preference that changes what the keyboard
     DOES, so forgetting it is the one somebody notices within a minute. */
  $effect(() => {
    pref.write({ chars });
  });
</script>

<Section title={copy.characterKeys}>
  <!-- THE SENTENCE THAT SAYS WHAT THE SWITCH DOES. It was written, and allow-listed in
       `dead-copy` as *"UNBUILT: `/settings/keyboard` is a heading and two unexplained
       buttons"*, the gate knowing, in those words, that a compound noun and two buttons were
       all a reader got. `19 §4` calls this the app's WCAG 2.1.4 conformance; a switch whose
       effect nobody states is a switch nobody turns on deliberately. -->
  <div class="setting-row">
    <p class="hint">{copy.characterKeysHint}</p>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={chars}
      aria-label={copy.characterKeys}
      onclick={() => (chars = !chars)}><span class="switch-track"></span></button
    >
  </div>
</Section>
<!--
  THE SHEET, ON THE ONE SCREEN THAT CAN STILL REACH IT.

  `keymapOpen` is set in exactly one place, `+layout.svelte`'s `?` branch, and `?` is a single
  character, so the moment the switch above is pressed Off the app's entire keyboard
  documentation becomes unreachable. Permanently, and for the reader who used the
  accessibility control. The palette's nearest row, `c-keys`, lands here on the switch, and
  there was no menu item and no button anywhere else.

  Silencing `?` is correct under 2.1.4. Having only one opener was not. So the document lives
  here as well, under the control that governs it, where the marks it now draws on the
  silenced rows answer the reader's actual question: what did I just turn off.

  `silenced={!chars}` and not the cookie, because `chars` is this area's own state and the
  cookie is written by the effect in the script: reading the cookie would show the previous
  answer until the page reloaded.
-->
<Section title={copy.keymap}>
  <Keymap silenced={!chars} />
</Section>

<style>
  /* THE SENTENCE AND ITS SWITCH (`.setting-row`) ARE LAID OUT BY `settings.css`, which every area shares. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }
</style>
