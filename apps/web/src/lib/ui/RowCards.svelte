<!--
  Rows as cards, which is what a list looks like below 640px.

  A PHONE IS NOT A NARROW DESKTOP, and which three fields a card shows comes from the register's own
  `mobile:` declaration rather than from a media query — the register knows what matters about its own
  rows better than a breakpoint does (13 §10, 50 §5.2 step 10).

  ONE BODY AT A TIME. Above 640px this does not exist and the table does; below it, the other way
  round. There is never a moment where both are half-visible, and the table is one `v` away.

  IT IS A COMPONENT BECAUSE TWO SURFACES SHOW ROWS. A register and a saved view are the same list
  with a different predicate — and only the register had cards, so a saved view on a phone kept the
  desktop table and its own horizontal scrollbar. Two surfaces, one device, two behaviours, from one
  of them having been written second.
-->
<script lang="ts">
  import { REGISTERS, dirOf, display } from '$lib/record/api.ts';
  import type { Entry } from '$lib/record/schema.ts';

  let { register, entries, href }: { register: string; entries: readonly Entry[]; href?: (e: Entry) => string } = $props();

  const decl = $derived(REGISTERS[register]);
  const to = $derived(href ?? ((e: Entry) => `/r/${register}/${e.seq}`));
</script>

{#if decl}
  <ul class="cards">
    {#each entries as e (e.seq)}
      <li>
        <a class="card" href={to(e)}>
          <span class="card-seq">#{e.seq}</span>
          <span class="card-title" dir={dirOf(register, decl.mobile[0])}>
            {display(register, decl.mobile[0], e.fields[decl.mobile[0]]) ?? '—'}
          </span>
          <span class="card-b" dir={dirOf(register, decl.mobile[1])}>
            {display(register, decl.mobile[1], e.fields[decl.mobile[1]]) ?? ''}
          </span>
          <span class="card-c" dir={dirOf(register, decl.mobile[2])}>
            {display(register, decl.mobile[2], e.fields[decl.mobile[2]]) ?? ''}
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .cards {
    display: none;
  }

  @media (width < 640px) {
    .cards {
      display: block;
      margin: 0;
      padding: 0;
      list-style: none;
      background: var(--s1);
      border: 1px solid var(--line);
      border-radius: var(--r-md);
      box-shadow: var(--raise);
      overflow: hidden;
    }

    .cards li + li .card {
      border-block-start: 1px solid var(--line);
    }

    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px var(--sp-3);
      /* 44px on both axes. A control grown only in height measures 38 x 44 and fails (13 §7). */
      min-block-size: 56px;
      padding: var(--sp-2) var(--sp-4);
      color: var(--ink);
      font-size: var(--t-ui);
      text-decoration: none;
    }

    .card-seq {
      grid-column: 2;
      grid-row: 1;
      color: var(--dim);
      font-family: var(--font-id);
      font-size: var(--t-xs);
      text-align: end;
    }

    .card-title {
      grid-column: 1;
      grid-row: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-b {
      grid-column: 1;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-xs);
      font-variant-numeric: tabular-nums;
    }

    .card-c {
      grid-column: 2;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-xs);
      font-variant-numeric: tabular-nums;
      text-align: end;
    }
  }
</style>
