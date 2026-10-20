<!--
  The whole screen for somebody whose access to the record ended (sharing plan §3.4): "Your access to Ada's record
  ended. Ask Ada if you need it back."

  THE DOOR'S OWN SENTENCE, WITH THE OWNER'S NAME IN IT. The record or the Directory refuses the next call `at: 'access'`
  and says it; the tab has already wiped its copy and the service worker its cache (`live.svelte.ts`, `end`). Where no
  sentence came, the house words say the same without a name.

  NOTHING ELSE IS DRAWN: no rail, no tab bar and no screen under it, since every one of them would draw what this
  person can no longer read. No way on is offered either: the app's own address may still lead back to this record
  until the person picks another, and a button that lands here again is a loop.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Empty from '$lib/ui/Empty.svelte';

  let { said }: { said: string | null } = $props();
</script>

<div class="ended">
  <Empty kind="no-permission" heading title={copy.sharingEndedTitle} body={said ?? copy.sharingEndedBody} />
</div>

<style>
  /* ONE COLUMN IN THE MIDDLE OF THE WINDOW, a sentence wide, with the page's own gutter on a phone. */
  .ended {
    display: grid;
    place-items: center;
    min-block-size: 100dvh;
    padding-inline: var(--gutter);
  }
</style>
