<script lang="ts">
  /* The house look is what this comment says, and it is not read. */
  let { name }: { name: string } = $props();
  const id = 'house look';
  const words = {
    title: 'Appearance',
    back: (n: string) => `${{ a: n }.a} is back in the house look`,
    keep: 'Keep it as it is',
  };
</script>

<h2>{words.title}</h2>
<p data-id={id}>The house look, drawn in the markup and not read.</p>
<p>{words.back(name)}</p>
