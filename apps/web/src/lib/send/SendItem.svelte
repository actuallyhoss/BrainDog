<!--
  "Send to…" as a menu's first item: the send sheet with the thing the menu is about attached, the same sheet a row's `s`
  and its Send button open. A selection's menu says how many ("Send 3 to…"). The menu closes on the press, and the sheet
  comes in from the right edge on a desk and up from the bottom on a phone (`SendSheet`).
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { openSheet } from './open.ts';
  import { sendWords, type Attached } from './send.ts';

  let {
    kind,
    attach,
    anchor = null,
  }: {
    /** The kind of thing it sends (a row's list, `decide`, `run`), which keeps its own last target. */
    kind: string;
    /** What goes with it, the thing itself first. */
    attach: readonly Attached[];
    anchor?: Element | null | undefined;
  } = $props();
</script>

<button role="menuitem" type="button" aria-haspopup="dialog" onclick={() => void openSheet({ kind, attach: [...attach], anchor })}>
  <Icon name="slash" size="s" /><span class="mi-name">{attach.length > 1 ? sendWords.sendMany(attach.length) : sendWords.sheet}</span>
</button>
<hr />
