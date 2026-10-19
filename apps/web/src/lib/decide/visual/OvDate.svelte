<!-- A mini timeline with today and the due day; the old day is a hollow mark when the date moves. -->
<script lang="ts">
  let { today, due, days, was, late }: { today: number; due: number; days: number; was: number | null; late: boolean } = $props();
  /* Positions across the span the marks cover, padded so none sits on the edge. */
  const lo = $derived(Math.min(today, due, was ?? due));
  const span = $derived(Math.max(1, Math.max(today, due, was ?? due) - lo));
  const at = (d: number) => 6 + ((d - lo) / span) * 88;
  const said = $derived(days === 0 ? 'today' : days > 0 ? `in ${days} ${days === 1 ? 'day' : 'days'}` : `${-days} ${days === -1 ? 'day' : 'days'} ago`);
</script>

<span class="ov ov-date" role="img" aria-label="Due {said}">
  <span class="ov-line">
    {#if was !== null && was !== due}<span class="ov-dot" data-was style:inset-inline-start="{at(was)}%"></span>{/if}
    <span class="ov-dot" data-today style:inset-inline-start="{at(today)}%"></span>
    <span class="ov-dot" data-due data-late={late ? '' : undefined} style:inset-inline-start="{at(due)}%"></span>
  </span>
  <span class="ov-cap"><span>Today</span><span class="ov-dim">due {said}</span></span>
</span>
