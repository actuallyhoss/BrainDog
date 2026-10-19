<!-- A field from what it holds to what it will. -->
<script lang="ts">
  let { what, before, after }: { what: string; before: string; after: string } = $props();
</script>

<span class="ov ov-change" role="img" aria-label="{what ? `${what}: ` : ''}{before} to {after}">
  <span class="ov-was" dir="auto">{before}</span><span class="ov-arrow" aria-hidden="true">→</span><span class="ov-now" dir="auto">{after}</span>
</span>
