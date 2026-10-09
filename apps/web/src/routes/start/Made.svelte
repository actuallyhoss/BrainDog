<!--
  The end of the first run: the BrainDog is made, and Today opens.

  NO SECOND SCREEN OF OFFERS. The next steps (an agent, a source) used to wait here, once, before Home; they live on
  Today now, under "When you want more", hideable for good (`WantMore`, `wantMore` in `lib/home/first-today.ts`), so a
  new person's first screen after the build is their own Today (use case 6, step 5). The passkey is offered straight
  after the link, on sign-up (`PasskeyFirst`), and in Settings for anybody else.

  WHAT IS DRAWN WHILE TODAY OPENS is the one line that says it is made, with Today as a link, so a navigation that is
  slow or refused still leaves the way on screen. The move replaces `/start#made` in the history, so Back from Today
  does not land here again.

  `modules` (`made.modules`) is what was just made when this follows Make it mine on the same screen. Nothing here reads
  it any more; the prop stays so `/start`'s call is unchanged.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import { firstRun } from '$lib/first-run.ts';
  import Button from '$lib/ui/Button.svelte';

  let made: { modules?: readonly string[] | null | undefined } = $props();

  let heading = $state<HTMLHeadingElement | undefined>(undefined);

  onMount(() => {
    void tick().then(() => heading?.focus());
    void goto(at('/'), { replaceState: true });
  });
</script>

<section class="made" aria-labelledby="made-h">
  <h1 class="made-title" id="made-h" tabindex="-1" bind:this={heading}>{firstRun.madeTitle}</h1>
  <div class="home">
    <Button weight="primary" href="/">{firstRun.openHome}</Button>
  </div>
</section>

<style>
  .made {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .made-title {
    margin: 0;
    color: var(--ink);
    font-size: 28px;
    font-weight: 600;
    line-height: 1.2;
  }

  .made-title:focus {
    outline: none;
  }
</style>
