<!-- The seeded violation: an icon component whose $props() destructure accepts color. -->
<script lang="ts">
  let { name, color }: { name: string; color?: string } = $props();
</script>

<svg><path d={name} /></svg>
