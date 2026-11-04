<!--
  SIGN-UP'S FIRST PAINT, AND NOTHING ELSE (first hour audit, E14).

  The page itself is `Signup.svelte`, and it reads a sentence with the whole starter catalogue (every use case and the
  parts each makes), the rules that place the words, the build and the record's client: a few hundred kilobytes a
  stranger waited for before the screen said anything. So this draws the step sign-up opens on, the page's name and
  "Getting sign-in ready", in the frame every entry screen stands in, and asks for the page once that has painted. Who
  may sign up is asked here as it draws (`early.ts`), beside the page's load, and the page opens on the same step with
  the answer in hand, so the swap moves nothing on screen and the field shows as the page arrives.

  A MAILED LINK OPENS ON ITS OWN STEP, "Making your BrainDog", which is what the page says while it spends the link.
-->
<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Entry from '../signin/Entry.svelte';
  import { askEarly, asksFirst } from './early.ts';
  import { words } from './words.ts';

  /* THE ADDRESS'S OWN LINK (`arrivalOf` in `lib/signup.ts` reads it, and wipes it, once the page is here). */
  const verifying = typeof location !== 'undefined' && /^#verify=/u.test(location.hash);

  /* WHO MAY SIGN UP IS ASKED NOW, while the page loads, and the page takes the answer when it comes (`early.ts`). */
  if (typeof location !== 'undefined' && asksFirst(location.hash)) askEarly();

  let Page = $state<Component | null>(null);
  /* THE PAGE DID NOT ARRIVE (the connection dropped, or a release replaced its files): said, with the way to ask again. */
  let lost = $state(false);

  /* AFTER THE FIRST PAINT: one frame drawn, then the page is asked for. */
  onMount(() => {
    let gone = false;
    const frame = requestAnimationFrame(() =>
      setTimeout(() => {
        if (gone) return;
        import('./Signup.svelte').then(
          (m) => void (gone || (Page = m.default)),
          () => void (lost = true),
        );
      }, 0),
    );
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
    };
  });
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

{#if Page}
  <Page />
{:else if lost}
  <Entry>
    <div class="talk">
      <h1 class="entry-title">{copy.unreachableTitle}</h1>
      <p class="quiet" role="alert">{copy.unreachableWhy}</p>
      <div><Button weight="primary" onclick={() => location.reload()}>{copy.askAgain}</Button></div>
    </div>
  </Entry>
{:else}
  <Entry>
    <div class="talk">
      <h1 class="entry-title">{verifying ? words.making : words.title}</h1>
      <p class="quiet" role="status">{verifying ? copy.signupVerifying : copy.checkingWays}</p>
    </div>
  </Entry>
{/if}

<style>
  /* `Signup.svelte`'s own, so the first step does not move when the page takes its place. */
  .talk {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }
</style>
