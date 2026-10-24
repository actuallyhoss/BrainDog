<!-- Many rows of one list moved at once: what each field goes to, with how many rows. -->
<script lang="ts">
  let { list, rows, moves }: { list: string; rows: number; moves: { what: string; to: string; n: number }[] } = $props();
  const said = $derived(`${rows} in ${list}: ${moves.map((m) => `${m.n} to ${m.what ? `${m.what} ` : ''}${m.to}`).join(', ')}`);
</script>

<span class="ov ov-moves" role="img" aria-label={said}>
  <span class="ov-dim num">{rows} in <span dir="auto">{list}</span></span>
  {#each moves as m (`${m.what}:${m.to}`)}<span class="ov-move"><span class="ov-dim" dir="auto">{m.what}</span> <span class="ov-arrow" aria-hidden="true">→</span> <span class="ov-now" dir="auto">{m.to}</span> <span class="num">{m.n}</span></span>{/each}
</span>
