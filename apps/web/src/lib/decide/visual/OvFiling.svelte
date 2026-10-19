<!-- A row's figure going into its list. -->
<script lang="ts">
  let { list, figure }: { list: string; figure: string } = $props();
</script>

<span class="ov ov-filing" role="img" aria-label="{figure} goes into {list}">
  <span class="ov-now num">{figure}</span><span class="ov-arrow" aria-hidden="true">→</span><span class="ov-list" dir="auto">{list}</span>
</span>
