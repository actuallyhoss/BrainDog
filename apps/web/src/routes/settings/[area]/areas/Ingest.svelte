<!--
  Settings > Ingest: where rows come in from, the forwarding address for mail, and every other
  sender's door.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { words as levelWords } from '../../levels.ts';
  /* THE APPROVAL `/vault` SENDS TOO, from one module, so a fresh sign-in means one thing on every screen. */
  import { reprove } from '$lib/record/vault.ts';
  /* THE FORWARDING ADDRESS, which the Worker minted and nothing in this app asked for. See the section below. */
  import { mailUrl, mintInbound, revokeInbound, words as mailWords, type Said as MailSaid } from '$lib/record/inbound-write.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import WebhookDoors from '$lib/ui/WebhookDoors.svelte';
  import Actions from '$lib/page/panels/Actions.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* WHETHER THIS HOST HAS THE MAIL DOOR IS SHARED with Billing, and the owner question with every area
     that has an owner's control (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const mintsHere = $derived(s.mintsHere);

  /**
   * THE MINT WAS BUILT AND NO OWNER COULD REACH IT.
   *
   * `apps/worker/src/inbound.ts` mints a forwarding address, writes only its SHA-256 into the
   * Directory's `dir_inbound` and answers the token once. Measured on 2026-09-21 by grepping
   * `apps/web` for `api/inbound`: nothing in this app called either door. So the Cloud would take a
   * bank's forwarded statement at an address no person had any way to obtain, with both halves of the
   * surface finished and green. `loop/research-batch-three-audit.md` finding 1.
   *
   * THE TOKEN LIVES IN `mailSaid` AND NOWHERE ELSE, the way the agents area holds a bearer: leaving
   * the area unmounts this component and empties it, and nothing writes it to a store, a query string
   * or a toast. The address is built from it for the screen and is never kept separately, because two
   * spellings of one secret are two things to keep out of a log.
   */
  let mailSaid = $state<Exclude<MailSaid, { kind: 'unrouted' }> | null>(null);
  let mailBusy = $state(false);
  /**
   * WHICH PRESS THE SIGN-IN IS FOR, so proving it again sends the same one.
   *
   * The door wants an owner whose last sign-in is under fifteen minutes old and refuses BOTH presses
   * without it, revoking included, because revoking is the worse of the two losses: a bank's mail
   * silently not arriving. Forgetting which press was refused would send the person back to the
   * buttons to guess, and mint is the one they would guess.
   */
  let mailPending = $state<'mint' | 'revoke' | null>(null);
  let mailReproving = $state(false);
  let origin = $state('');

  $effect(() => {
    /* THE ADDRESS NAMES THE BARE ORIGIN, read on arriving at this area, because a mail door is
       `/in/email/<token>` at the root, under no slug, which a mail provider posts to. */
    origin = bareOrigin();
    /**
     * AND THE HOST IS ASKED WHAT IT SERVES BEFORE ANYTHING IS OFFERED, once.
     *
     * THE CALL IS MADE INSIDE `untrack` AND NOT ONLY THE READ, and without that this effect asked
     * for ever. Driven on a real self-host: `/settings/ingest` sent `GET /api/inbound/mint` five
     * times in five seconds and threw `effect_update_depth_exceeded` on every pass, so the section
     * drew 36 words, neither control, and none of the sentence that explains why there is no
     * control. `askMailDoor` calls `opened()` on its first line, synchronously, and `opened()` does
     * `s.pending++` on `screen.svelte.ts`'s `$state`: an increment READS what it writes, so the
     * effect depended on the thing it changed and Svelte re-ran it until it gave up. `Empty.svelte`
     * records the same failure in the same words, and every other area's first read is called
     * this way for exactly this reason.
     */
    untrack(() => {
      if (s.mintsHere === null) void s.askMailDoor();
    });
  });

  const mailAddress = $derived(mailSaid?.kind === 'minted' ? mailUrl(origin, mailSaid.token) : '');

  /**
   * The line under the two buttons, and the tone it carries.
   *
   * EVERY ARM IS A SENTENCE, and the rest is the door's own `fix` rendered verbatim (`13 §6`). The
   * `sample` arm said the demo had no account to mint on; a host with no record behind it is
   * `refused` now, with `recordNotReached`, and draws that like any other refusal.
   *
   * `unrouted` IS NOT AN ARM HERE ANY MORE, AND THAT IS THE POINT OF FINDING 16. A host whose
   * forwarding address is a file rather than a door has not refused a press; it has answered the
   * question this screen now asks on arrival. So `askMail` turns that answer into `mintsHere` and
   * the section states it above, where a person reads it instead of earning it, and `mailSaid` is
   * typed without the kind so this expression cannot quietly grow the arm back.
   */
  const mailLine = $derived(
    mailSaid === null
      ? ''
      : mailSaid.kind === 'minted'
        ? mailWords.lost
        : mailSaid.kind === 'revoked'
          ? mailWords.revoked
          : mailSaid.fix,
  );
  const mailTone = $derived(mailSaid === null || mailSaid.kind === 'minted' || mailSaid.kind === 'revoked' ? undefined : 'bad');

  /**
   * One press at one of the two doors.
   *
   * NOTHING IS READ BACK AFTERWARDS, because there is nothing to read: `servesInbound` answers `mint`
   * or `revoke` and has no third branch, on purpose, since a route that said "what is my address"
   * would have to keep the token to answer with. The screen says that out loud instead of drawing a
   * list that would always be empty.
   */
  async function askMail(which: 'mint' | 'revoke') {
    if (mailBusy) return;
    mailBusy = true;
    mailPending = which;
    const at = opened();
    const said = which === 'mint' ? await mintInbound(apiBase()) : await revokeInbound(apiBase());
    closed(true, at);
    mailBusy = false;
    if (said.kind === 'unrouted') {
      /* THE HOST HAS ANSWERED THE QUESTION THE SCREEN ASKS ON ARRIVAL, so it is kept as what the
         host is and not as what this press did. Before this the sentence was shown once and a
         reload put both buttons back, which is the half of finding 16 that let somebody press the
         same unservable button all afternoon. */
      s.mintsHere = false;
      mailSaid = null;
      mailPending = null;
      return;
    }
    mailSaid = said;
    /* The pending press is kept only while a sign-in would send it again. */
    if (said.kind !== 'signin') mailPending = null;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it: `reprove` is the agents area's, from
     one module, so the two screens cannot come to disagree about what a fresh sign-in is. */
  async function mailSignInAgain() {
    const which = mailPending;
    if (mailReproving || which === null) return;
    mailReproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    mailReproving = false;
    if (back) await askMail(which);
  }
</script>

<!--
  `25 §9` DRAWS THIS SCREEN, which makes it the one settings area where inventing a control is
  least excusable. Three status words, a last-run line, a next-run line, a failure line naming
  the credential by its VAULT LABEL rather than its value, and two buttons on the paused row
  only. `47 §12` gives the composition: one row per connector, from `PullResult` via the
  receipts and the schedule row.
-->
<Section title={copy.sources}>
  <p class="hint">{copy.sourcesHow}</p>
  <!-- A RECORD LISTS ITS OWN SCHEDULED ACTIONS, with Resume and Reconnect that write.

       AND A SHELL WITH NO RECORD LISTS NOTHING. This arm drew the sample's `SOURCES`, three
       connectors nobody set up, one of them paused on a credential nobody holds, with
       Reconnect and Retry now buttons that only said what would have happened. The shell's
       own refusal is already on the screen, so nothing here repeats it. -->
  {#if shell.live}
    <Actions project={null} />
  {/if}
  <!-- `25 §9`'s own blockquote, and it outranks the screen: "every chart fed by a stale series
       shows a gap and a stale badge. A dashboard that keeps yesterday's number on screen as if
       it were today's is the failure that actually costs somebody money." -->
  <p class="hint">{copy.staleShows}</p>
<!-- THERE WAS NO WAY TO ADD ONE, and inventing a button would be worse: `25 §9` draws this
     screen without one, because a source is a declaration and arrives the way every
     declaration does (`04 §1`: `ingest` is one of the kinds an add-on carries). So the screen
     says where a new one comes from and links there. -->
  <p class="hint sources-add">{copy.sourcesAdd} <a class="tap" href={at('/packs')}>{copy.sourcesAddGo}</a></p>
</Section>

<!--
  WHERE FORWARDED MAIL ARRIVES, AND UNTIL NOW NO OWNER COULD ASK FOR AN ADDRESS.
  `apps/worker/src/inbound.ts` mints one, keeps only its digest and answers the token once; grepped on
  2026-09-21, nothing in `apps/web` called `/api/inbound/mint` or `/api/inbound/revoke`, so a forwarded
  bank statement could only reach a record whose address nobody had a way to obtain.

  SECOND ON THE SCREEN AND NOT FIRST. `25 §9` draws this area as the connector list, and it stays the
  subject a person came to Ingest for. Mail is the other way in and it is a different act: a source is a
  declaration that arrives with an add-on, and this is a credential minted on a press.

  AND IT IS AN OWNER'S SCREEN WHEREVER IT IS DRAWN. Whoever can change where a record takes its mail can
  redirect its statements, so the door wants an owner and a sign-in from the last fifteen minutes; the
  screen states that before either button rather than after a refusal.

  AND SO IS WHETHER THIS HOST HAS THE DOOR, WHICH IS FINDING 16 OF `research-usability-2026-09-21.md`.
  Both buttons were drawn on every host, both presses answered 404 `ROUTE_UNKNOWN` on a self-host, and
  the sentence about `inbound.token`, a good sentence, was earned by pressing rather than read. A
  reload put the pair back. `mintsHere` is the host's own answer to one GET, and neither control exists
  until it lands.
-->
<!--
  AND WHETHER THE PERSON READING IT MAY, WHICH IS THE OTHER HALF OF THE SAME QUESTION.

  The section above states that this is an owner's screen, and until now it stated it to
  everybody and then drew the two controls anyway. The host is asked first and the person
  second, in that order and not the other, because a host with no door has none for an owner
  either: `mintsHere === false` is true of every reader, and only after that does it matter
  who is asking.
-->
<Section title={mailWords.title}>
  <p class="hint">{mailWords.how}</p>
  {#if mintsHere === false}
    <!-- THE HOST'S ANSWER, AS THE SECTION'S OWN SENTENCE. It says where a self-host keeps the
         address and what writing and deleting that file do, so the person leaves with the thing
         they came for instead of a control that cannot work. Nothing is said about a fresh
         sign-in, because there is no door here for a sign-in to open. -->
    <p class="hint">{mailWords.unrouted}</p>
  {:else if mintsHere === true && !anOwner}
    <!-- AND THE PERSON ONLY ONCE THE HOST HAS ANSWERED, which `mintsHere === true` is what
         says. Written as a bare `{:else if !anOwner}` this arm also caught the moment before
         the probe lands, where `mintsHere` is still `null`: a colleague on a host with no door
         read "Only an owner of this record can do this", and then watched it be replaced by
         the sentence about `inbound.token` when the GET came back. The section says one thing
         or says nothing, and an owner has always been drawn nothing until the door answers. -->
    <p class="hint">{levelWords.ownersOnly}</p>
  {:else if mintsHere === true}
    <!-- THE FACT THE SCREEN CANNOT HIDE: there is no route that reads an address back, so this says so
         rather than leaving a blank where a value would go and letting it read as "you have none". -->
    <p class="hint">{mailWords.unknown}</p>
    {#if mailSaid?.kind === 'minted'}
      <!-- SHOWN ONCE, from `mailSaid` alone, which leaving the area empties. -->
      <div class="code-form" role="status">
        <p class="code-label">{mailWords.once}</p>
        <p class="mono wrap">{mailAddress}</p>
        <div class="row-actions">
          <!-- THE LABEL IS PASSED, because `clipboard.put(text)` quotes the text in its own toast, and
               the text here is a live credential. -->
          <Button weight="primary" onclick={() => void clipboard.put(mailAddress, mailWords.addressCopied)}>{mailWords.copyAddress}</Button>
        </div>
        <p class="hint">{mailWords.forwardHow}</p>
      </div>
    {/if}
    <div class="row-actions">
      <Button weight="primary" disabled={mailBusy} onclick={() => void askMail('mint')}>
        {mailBusy && mailPending === 'mint' ? mailWords.minting : mailWords.mint}
      </Button>
      <!-- THE QUIETER ACTION, AND THE MORE DAMAGING ONE. It writes `null` and answers no value; a bank
           posting to the old address is refused from that moment, with nothing to show for it. -->
      <Button weight="bare" tone="bad" disabled={mailBusy} onclick={() => void askMail('revoke')}>
        {mailBusy && mailPending === 'revoke' ? mailWords.revoking : mailWords.revoke}
      </Button>
    </div>
    <!-- Always in the document, for the reason the agents field gives: a live region inserted with its
         first sentence is not reliably announced. -->
    <p class="code-said" role="status" data-intent={mailTone}>{mailLine}</p>
    {#if mailSaid?.kind === 'signin'}
      <!-- A STALE SIGN-IN IS A STATE WITH A WAY FORWARD, not an error. The same passkey re-proof the
           agents area offers, and then the same press again rather than a press the person has to find. -->
      <div class="row-actions">
        <Button weight="quiet" disabled={mailReproving} onclick={() => void mailSignInAgain()}>{copy.signInAgain}</Button>
      </div>
    {/if}
    <p class="hint">{mailWords.freshWhy}</p>
  {/if}
</Section>
<!-- EVERY OTHER SENDER, AND RECORD METHODS RATHER THAN A HOST DOOR. `doors` lists what this record declares and
     `ingestMint` mints for one of them, so unlike the mail section there is no probe: the section is drawn, and
     a record that declares no door says so in its own empty state. -->
<WebhookDoors owner={anOwner} />

<style>
  /* THE ADDRESS, SHOWN ONCE, in the block the agents area shows a bearer in. Nothing here sets a
     colour: the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A FORWARDING ADDRESS HAS NO SPACES IN IT, and one long word must not push the page sideways:
     `13 §10` and the layout gate's first rule. */
  .wrap {
    overflow-wrap: anywhere;
  }

  /* A monospace face, because an address is a string somebody compares character by character. */
  .mono {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: var(--t-sm);
    letter-spacing: 0;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

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
