<!-- An amount as a share of the balance or the month's spend: one bar, the amount over it. -->
<script lang="ts">
  let { said, against, basis, share, over }: { said: string; against: string; basis: 'balance' | 'spend'; share: number; over: boolean } = $props();
  const text = $derived(`${said} of ${against} ${basis === 'balance' ? 'balance' : 'spent this month'}${over ? ', more than it' : ''}`);
</script>

<span class="ov ov-money" role="img" aria-label={text}>
  <span class="ov-bar"><span class="ov-fill" data-grow data-over={over ? '' : undefined} style:inline-size="{Math.max(2, share * 100)}%"></span></span>
  <span class="ov-cap num"><span>{said}</span><span class="ov-dim">of {against}</span></span>
</span>
