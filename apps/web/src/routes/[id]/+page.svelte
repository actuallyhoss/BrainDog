<!--
  The spoken-id resolver: `/D41`, `/SG31`, `/tasks#7`.

  Resolved by the SHELL, not by a server 302 — no server renders a request here (50 §13 D17). It
  calls `get({ spoken })` and replaces the address with the canonical one, so Back does not bounce.

  `brain.dog/D41` is a sentence one person can say to another and a string an agent can emit with no
  lookup. It is the cheapest legibility win available (19 §5).

  The one exception is the display default `#`: `#125` NEVER resolves bare, because every register
  has a `#1`. Type `tasks#125`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { DECIDED, QUESTIONS, REGISTERS, entry } from '$lib/record/api.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';

  const raw = $derived(decodeURIComponent(page.params.id ?? ''));

  const target = $derived.by(() => {
    // A prefixed spoken id: D41, SG31, LN7.
    if (/^[A-Za-z]{1,3}\d+$/.test(raw)) {
      const id = raw.toUpperCase();
      if ([...QUESTIONS, ...DECIDED].some((q) => q.id === id)) return `/decide/${id}`;
      return null;
    }
    // A qualified row: tasks#125.
    const q = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(raw);
    if (q && REGISTERS[q[1]!] && entry(q[1]!, Number(q[2]))) return `/r/${q[1]}/${q[2]}`;
    return null;
  });

  const bare = $derived(/^#?\d+$/.test(raw));

  onMount(() => {
    if (target) goto(target, { replaceState: true });
  });
</script>

{#if !target}
  <div class="page">
    <Empty
      kind="error"
      title={bare ? `“${raw}” could be a row in any register.` : `Nothing answers to “${raw}”.`}
      body={bare
        ? 'Every register has a #1, so a bare number never resolves on its own. Qualify it — obligations#4, tasks#7.'
        : 'A spoken id is a letter prefix and a number, or a register and a sequence.'}
      rid="r7k2m9qd4x"
    >
      {#snippet actions()}
        <Button weight="primary" href="/search?q={encodeURIComponent(raw)}">{copy.search}</Button>
        <Button href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  </div>
{/if}

<style>
  .page {
    padding: var(--sp-6) var(--sp-5);
    max-inline-size: 900px;
  }
</style>
