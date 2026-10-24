<!-- New rows going into their list, by name, and how many more there are. -->
<script lang="ts">
  let { list, names, more }: { list: string; names: string[]; more: number } = $props();
  const said = $derived(`${names.join(', ')}${more > 0 ? ` and ${more} more` : ''} into ${list}`);
</script>

<span class="ov ov-adds" role="img" aria-label={said}>
  <span class="ov-names">{#each names as name (name)}<span class="ov-now" dir="auto">{name}</span>{/each}{#if more > 0}<span class="ov-dim">{more} more</span>{/if}</span>
  <span class="ov-arrow" aria-hidden="true">→</span><span class="ov-list" dir="auto">{list}</span>
</span>
