<!--
  Save as a view: what is on screen, kept as a page under Views, and that page opened. And Share this view, beside it.

  SAVE AS A VIEW WAS `⌥V` AND NOTHING ELSE, which is the same hole Display had: a chord a phone
  cannot type, over a function that was written and reachable from no surface. This is the button
  that says it, drawn at the end of the bar on a laptop and in the filter sheet's footer on a phone.

  THE WRITE IS THE PAGE'S. `saveView` names the view from the address and writes it, and it stays in
  `+page.svelte` beside the other writes, so the chord, the bar and the sheet all press the one
  function. Whoever draws this decides when it is shown: `saveView` answers a press with no filter and
  no search by saying it needs one, and `19 §6` has a control that cannot act be absent rather than a
  button that says no.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { saveView, shareView }: { saveView: () => void; shareView?: (() => void) | undefined } = $props();
</script>

<Button weight="bare" onclick={() => saveView()}><Icon name="plus" size="s" />{copy.saveAsView}</Button>
<!-- "SHARE THIS VIEW": the rows the chips pick, shared as their condition. An owner's or an Admin's. -->
{#if shareView}<Button weight="bare" onclick={() => shareView?.()}><Icon name="external" size="s" />{copy.shareThisView}</Button>{/if}
