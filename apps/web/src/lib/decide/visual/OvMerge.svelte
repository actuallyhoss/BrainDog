<!-- The names joining into the one kept. -->
<script lang="ts">
  let { names, into }: { names: string[]; into: string } = $props();
  const others = $derived(names.filter((n) => n !== into));
</script>

<span class="ov ov-merge" role="img" aria-label="{names.join(' and ')} become {into}">
  <span class="ov-names">{#each others as n, i (i)}<span class="ov-was" dir="auto">{n}</span>{/each}</span>
  <span class="ov-arrow" aria-hidden="true">→</span><span class="ov-now" dir="auto">{into}</span>
</span>
