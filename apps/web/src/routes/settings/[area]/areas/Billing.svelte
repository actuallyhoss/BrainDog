<!--
  Settings > Billing: what this deployment bills, in one line, and where usage and the export are.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { billingLine } from '../../billing.ts';
  import { untrack } from 'svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* WHETHER THIS HOST HAS THE MAIL DOOR IS SHARED with Ingest, and the owner question with every area
     that has an owner's control (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const mintsHere = $derived(s.mintsHere);

  /**
   * AND BILLING ASKS THE MAIL DOOR, because it is the one answer only a self-host gives.
   *
   * `billing.ts` says why: a host older than `boot`'s `host` names none, and a live Cloud record was
   * told it ran on the reader's own machine. Only a live record is asked, because a shell with no
   * record has no door to ask. `untrack` for the reason the Ingest area's effect gives, and asked
   * here as well as there, because a self-host whose owner opened Billing first would otherwise
   * keep `null` and be given the Cloud's sentence for as long as the screen was open.
   */
  $effect(() => {
    if (!shell.live) return;
    untrack(() => {
      if (s.mintsHere === null) void s.askMailDoor();
    });
  });
</script>

<!--
  THERE IS NOTHING TO BILL ON A SELF-HOST, and `23 §8`'s precedent for exactly this shape is
  "one line in Settings". `53 §5.10` puts the whole ladder "in the Worker and nothing in the
  record, so the record package stays billing-agnostic"; `33 §10` holds the state in the Cloud
  Directory. The area cannot simply be removed (`50 §2.2` admits the twelve of `19 §2` with
  no per-deployment conditional and `50 §13 D2` builds one artefact for both hosts), so it
  says which deployment this is and what that means.

  `ADR-059`'s line is here because it is the promise the whole product rests on and it is TRUE
  on a self-host in the strongest possible way: "At no point is export withheld."
-->
<Section title={copy.billing}>
  <!-- THE HOST'S ANSWER AND NOT THE BUILD'S. The sample's `DEPLOYMENT.kind` read `self-host` in
       every shipped bundle, so a live Cloud record was told "This record runs on your own
       machine." (`research-first-sign-in.md` friction 5). `billing.ts` says what is asked instead. -->
  <p class="hint">{billingLine({ host: shell.host, mintsMail: mintsHere })}</p>
  <div class="row-actions">
    <Button weight="quiet" href="/usage"><Icon name="history" size="s" />{actionWords.seeUsage}</Button>
    <!-- AND THE SECOND LINK IS THE OWNER'S, because the screen it leads to is. `export` needs
         `owner`, so offering a colleague *Export the record* here is an invitation to a screen
         where all four buttons refuse. Usage is the account's rather than the record's and
         stays.

         NOTHING IS SAID IN ITS PLACE HERE, AND THAT IS THE ONE EXCEPTION ON THIS SCREEN. The
         act lives on `/settings/export`, which is still in the rail and now says in its own
         words who may do it: a second copy of that sentence under a row holding an unrelated
         link would be a sentence with no clear subject. -->
    {#if anOwner}
      <Button weight="quiet" href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
    {/if}
  </div>
</Section>

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
