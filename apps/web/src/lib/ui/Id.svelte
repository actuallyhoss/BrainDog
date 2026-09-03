<!--
  A spoken id: #125, D41, SG23, tasks#7.

  The most-repeated element in the product, and the one worth designing. These are strings a person
  SAYS OUT LOUD to another person, and strings an agent emits with no lookup — `brain.dog/D41` is a
  sentence and an address at the same time. So they are monospaced, never wrapped, never truncated
  at the end, and cut into the surface rather than raised off it.

  The face is the system monospace stack and costs zero bytes. It is the ROLE that makes an
  identifier read as an identifier, not a chosen face; 0/O and 1/l/I ambiguity is the accepted price
  (13 §3.1). And mono is for IDENTITY only — a quantity gets tabular figures on the proportional
  face, because a monospace comma floats in the middle of a number (13 §3.2).
-->
<script lang="ts">
  let {
    id,
    href,
    tone,
    size = 'sm',
  }: { id: string; href?: string; tone?: 'good' | 'warn' | 'bad' | 'info'; size?: 'sm' | 'md' } = $props();
</script>

<svelte:element
  this={href ? 'a' : 'span'}
  {href}
  class="id"
  data-size={size}
  data-intent={tone}
  data-link={href ? '' : undefined}>{id}</svelte:element
>

<style>
  .id {
    display: inline-block;
    padding: 1px 6px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--tone, var(--dim));
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.55;
    white-space: nowrap;
    text-decoration: none;
  }

  .id[data-size='md'] {
    padding: 2px 8px;
    font-size: var(--t-sm);
  }

  .id[data-link]:hover {
    border-color: var(--edge);
    color: var(--ink);
  }
</style>
