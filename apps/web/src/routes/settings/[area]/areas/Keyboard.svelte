<!--
  Settings > Keyboard.

  `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import * as pref from '$lib/pref.ts';
  import { copy } from '$lib/copy.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Keymap from '$lib/ui/Keymap.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  /* EVERY AREA TAKES THE SAME PROPS. This one draws a preference of the device and reads none of them. */
  let props: AreaProps = $props();

  /* THE GROUP'S NAME, so the row inside it can be called what the switch is called without the heading saying it too. */
  const words = {
    shortcuts: 'Shortcuts',
    every: 'The keys used most',
    find: 'Find a key',
    findHint: 'Type what it does, or the key',
    found: 'Keys that match',
  };

  /* THE TWENTY USED MOST, BY ID: getting about, opening, undoing and closing, then answering and ticking where
     he works. Every other key is one search away, so the sheet is a page and not a manual. */
  const MOST = [
    'palette',
    'palette-slash-key',
    /* ⌘J, AS THE `?` SHEET LISTS IT (AG33): the most-used keys left out the one that asks. */
    'palette-ask',
    'goto',
    'sidebar',
    'undo',
    'commit',
    'close',
    'help',
    'today-move',
    'today-tick',
    'today-new',
    'today-answer',
    'decide-select',
    'decide-move',
    'decide-open',
    'decide-decline',
    'decide-approve',
    'decide-defer',
    'inbox-file',
    'inbox-archive',
  ];
  let query = $state('');

  /* SEEDED FROM WHAT IS REMEMBERED, so the switch shows the state the keyboard is already in. */
  const held = pref.read();
  let chars = $state(held.chars ?? true);

  /* AND THE CHARACTER KEYS ARE REMEMBERED. It is the one preference that changes what the keyboard
     DOES, so forgetting it is the one somebody notices within a minute. */
  $effect(() => {
    pref.write({ chars });
  });
</script>

{#snippet charsSwitch()}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={chars}
    aria-label={copy.characterKeys}
    onclick={() => (chars = !chars)}><span class="switch-track"></span></button
  >
{/snippet}

<Tile icon="keyboard" title={words.shortcuts}>
  <!-- THE SENTENCE THAT SAYS WHAT THE SWITCH DOES, in the row that holds the switch. It was written, and allow-listed
       in `dead-copy` as *"UNBUILT: `/settings/keyboard` is a heading and two unexplained buttons"*, the gate knowing,
       in those words, that a compound noun and two buttons were all a reader got. `19 §4` calls this the app's WCAG
       2.1.4 conformance; a switch whose effect nobody states is a switch nobody turns on deliberately. -->
  <StateRow icon="keyboard" title={copy.characterKeys} line={copy.characterKeysHint} action={charsSwitch} />
</Tile>
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
<Tile icon="rows" title={query.trim() === '' ? words.every : words.found}>
  <div class="find field">
    <Icon name="search" size="s" />
    <input class="field-input" type="search" aria-label={words.find} placeholder={words.findHint} autocomplete="off" spellcheck="false" bind:value={query} />
  </div>
  <Keymap silenced={!chars} only={MOST} {query} columns />
</Tile>

<style>
  .find {
    margin-block-end: var(--sp-4);
  }

  .find input {
    inline-size: 100%;
  }

  /* THE LAST SCOPE ENDS THE TILE: the gap `Keymap` keeps under each scope for the next one hung 24px of air under the
     tile's last row (bottom 46 against a top of 21). */
  .find ~ :global(.key-cols > .keys:last-child) {
    margin-block-end: 0;
  }
</style>
