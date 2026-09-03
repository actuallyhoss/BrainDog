<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
</script>

<div class="page">
  <!-- One sentence in the house voice, never a stack trace, and a copyable request id always: the
       client mints an X-Request-Id on every call and the host echoes and logs it (19 §6). -->
  <Empty
    kind="error"
    title={page.status === 404 ? `There is nothing at ${page.url.pathname}.` : "Couldn't load this screen."}
    body={page.error?.message}
    rid="r7k2m9qd4x"
  >
    {#snippet actions()}
      <Button weight="primary" href="/">{copy.home}</Button>
      <Button onclick={() => location.reload()}>{copy.tryAgain}</Button>
    {/snippet}
  </Empty>
</div>

<style>
  .page {
    padding: var(--sp-6) var(--sp-5);
    max-inline-size: 900px;
  }
</style>
