<!--
  Settings > What comes in (`/settings/ingest`): where things come in from, the forwarding address for mail, and
  every other sender's door.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { words as levelWords } from '../../levels.ts';
  /* THE APPROVAL `/keychain` SENDS TOO, from one module, so a fresh sign-in means one thing on every screen. */
  import { reprove } from '$lib/record/keychain.ts';
  /* THE FORWARDING ADDRESS, which the Worker minted and nothing in this app asked for. See the section below. */
  import { addressCommand, dockerAddressCommand, mailUrl, reachableForMail, mintInbound, revokeInbound, words as mailWords, type Said as MailSaid } from '$lib/record/inbound-write.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { untrack } from 'svelte';
  import { closed, closedAfter, opened } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import WebhookDoors from '$lib/ui/WebhookDoors.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import { callerAt, feedsOf, listDoors, type Door } from '$lib/ui/webhook-doors.ts';
  import { sinceWords } from 'braindog-render';
  import { recordNow } from '$lib/record/boot-live.ts';
  import type { Source as WaySource } from '../../../inbox/sources.ts';
  /* A CONSTANT, NOT THE MODULE: `sources.ts` is read lazily below, and this one string is all the markup needs of it. */
  const UNSIGNED_HELP = 'https://brain.dog/docs/use/inbox-and-doors#when-mail-arrives-unsigned';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import GoogleConnect from '$lib/google/GoogleConnect.svelte';
  import PasteBank from '$lib/tell/PasteBank.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { doorState, doorsLine, doorWords } from '../../billing.ts';
  import Actions from '$lib/page/panels/Actions.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* WHETHER THIS HOST HAS THE MAIL DOOR IS SHARED with Billing, and the owner question with every area
     that has an owner's control (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const mintsHere = $derived(s.mintsHere);

  /**
   * NOT DRAWN OVER THE LAST COPY OF THE SHELL, which knows nobody as an owner (`drawnFrom` in `boot-copy.ts`): this area
   * is an owner's, and its doors are read only once the live `boot` says who reads. Opened again from a kept shell, it said
   * `ready` over the reader's half, took it back as the owner's reads went out, then said it again (finish W1, as F46
   * was on the areas drawn from a chunk). So the copy is held as a call out until the live shell replaces it, closed a
   * task later (`closedAfter`), by when the owner's reads are out. Offline the copy is all there is, and it is not held.
   */
  const fromCopy = $derived(shell.stale === true && shell.offline !== true);
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => {
      const at = opened();
      return () => closedAfter(true, at);
    });
  });

  /**
   * THE MINT WAS BUILT AND NO OWNER COULD REACH IT.
   *
   * `apps/worker/src/inbound.ts` mints a forwarding address, writes only its SHA-256 into the
   * Directory's `dir_inbound` and answers the token once. Measured by grepping
   * `apps/web` for `api/inbound`: nothing in this app called either door. So the Cloud would take a
   * bank's forwarded statement at an address no person had any way to obtain, with both halves of the
   * surface finished and green.
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
   * `unrouted` IS NOT AN ARM HERE ANY MORE, AND THAT IS THE POINT. A host whose
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
         reload put both buttons back, which is what let somebody press the
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

  /**
   * THE DOORS TILE: each web address the record takes things in at, on while an address is in use and
   * off with none, and one line saying what an unused door means.
   *
   * THE SAME READ AS THE SECTION BELOW, asked once more, and only of an owner: `doors` is ADMIN, and a colleague asking
   * would be told no for a tile they are not shown. The mint below writes an event, so the record's version moves and
   * `read()` asks again, and the tile follows the section rather than contradicting it. A refusal is no tile: the
   * section under it says what the record said.
   */
  async function doorsNow(): Promise<Result<Door[]>> {
    const out = await listDoors(callerAt(apiBase()));
    return out.kind === 'doors' ? { ok: true, value: out.doors } : { ok: false, refusal: { code: out.kind === 'signin' ? 'NEEDS_BROWSER_SESSION' : 'FORBIDDEN', fix: out.fix } };
  }
  const doors = read(() => (anOwner ? `doors ${apiBase()}` : null), doorsNow);
  const doorList = $derived(doors.value ?? []);
  /* WHAT HAS FED THE RECORD THROUGH THOSE DOORS, newest first, on the reader's clock. */
  /* ON THE RECORD'S ONE CLOCK (`recordNow`), as the Inbox says the same arrivals (AF13): this said "8 weeks ago" of the
     mail the Inbox called "10h ago". */
  const feeds = $derived(feedsOf(doorList, recordNow()));

  /**
   * AND EVERY WAY IN, read from the Inbox's own arrivals of the fortnight (`readArrivals`, `sourcesOf`): mail, texts and
   * apps posting in, and agents, each with its last arrival. The doors above need an owner's read, so a reader who
   * cannot read them still sees what fed the record. Where the doors are listed, their own rows say the texts, so the
   * channel line for them is not said twice.
   */
  let ways = $state.raw<WaySource[] | null>(null);
  /* WHETHER THE ARRIVALS HAVE BEEN READ YET, landed or refused (polish-f L6). Until then nobody can say nothing feeds
     the record, so the scheduled actions' "Nothing feeds your BrainDog yet" card is held: it was drawn as the doors
     landed and taken back when the arrivals did, which is the flicker on opening this area. */
  let waysRead = $state(false);
  /* A CALL OUT FROM THE MOMENT IT IS ASKED, closed a task after it lands (`closedAfter`): the arrivals came after the doors,
     and between the two the scheduled actions' "nothing set up" card was drawn over a record that has ways in, so the
     screen said `empty` and then `ready`. */
  $effect(() => {
    untrack(() => {
      const at = opened();
      void Promise.all([import('../../../inbox/series.ts'), import('../../../inbox/sources.ts')])
        .then(async ([series, sources]) => {
          const read = await series.readArrivals(apiBase(), recordNow(), sources.SOURCE_DAYS);
          ways = read === null ? null : sources.sourcesOf(read.lines, recordNow(), 'elsewhere');
        })
        .catch(() => (ways = null))
        .finally(() => {
          waysRead = true;
          closedAfter(true, at);
        });
    });
  });
  /** The sentence naming the senders whose newest mail arrived unsigned, or `null` (`sourcesOf`). */
  const unsignedMail = $derived(ways?.find((w) => w.channel === 'email')?.unsigned ?? null);
  const wayRows = $derived(
    (ways ?? [])
      .filter((w) => !(w.channel === 'webhook' && feeds.length > 0))
      .map((w) => ({ id: w.channel, name: w.name, quiet: w.last === null, said: w.last === null ? 'Nothing has come in this way yet' : `Last arrival ${sinceWords(w.last, recordNow())}` })),
  );
  /* ALL QUIET, SAID ONCE (G16): three rows each said "Nothing has come in this way yet"; the names are the rows' only words. */
  const allQuiet = $derived(feeds.length === 0 && wayRows.length > 0 && wayRows.every((w) => w.quiet));

  /**
   * THE TITLES OF THE MAIL SECTION'S THREE STEPS, and the one sentence the third adds. The
   * sentences the first two carry are `inbound-write.ts`'s and are read from there.
   */
  const words = {
    stepMake: 'An address for your BrainDog',
    stepForward: 'Point your mail at it',
    stepTest: 'Send one to test it',
    testLine: 'It lands in your Inbox.',
    openInbox: 'Open the Inbox',
    /* WHERE THE HOST HAS NO DOOR (agents F27): one plain sentence, and on the hosted service no file a person cannot
       reach. */
    /* THE SELF-HOST CARD IS ONE SENTENCE AND THE COMMAND TO COPY: it named a file and what
       writing and deleting it do, and never the address. */
    unrouted: 'Show the command that prints it',
    unroutedHosted: 'Not offered here yet.',
    unsignedFix: 'How to keep forwarded mail signed',
    /* A BANK'S TEXTS HAVE THEIR OWN STEPS AND A PASTE BOX (first-hour audit AH10): Today's "Forward your bank's texts"
       opened this screen on a mail address and nothing said how a text gets here. */
    textsTitle: "Your bank's texts",
    textsLead: 'Money fills itself from the texts your bank sends when your card is used. Two ways in:',
    textsForward: 'Forward them as mail to the address above. On an iPhone, a Shortcuts automation can do it for each text from your bank; on Android, an app that forwards texts to mail can.',
    textsPaste: 'Or paste one below, and see what it becomes before anything is kept.',
  };
</script>

<!--
  `25 §9` DRAWS THIS SCREEN, which makes it the one settings area where inventing a control is
  least excusable. Three status words, a last-run line, a next-run line, a failure line naming
  the credential by its KEYCHAIN LABEL rather than its value, and two buttons on the paused row
  only. `47 §12` gives the composition: one row per connector, from `PullResult` via the
  receipts and the schedule row.
-->
<!-- A LIST TILE, WITH NO CHART (a pure list is the one tile that holds no figure). Drawn only where the record
     declares a door and an owner is reading; the section below says the rest. -->
<!-- UNTIL THE DOORS AND THE ARRIVALS ARE READ the tiles wait out of sight (`settings.css`): the doors' tile landed over
     Sources and pushed every tile down 164px, and the arrivals' rows grew Sources after it. -->
{#if (anOwner && doors.state === 'waiting') || !waysRead}<span data-hold hidden></span>{/if}
{#if anOwner && doorList.length > 0}
  <Tile icon="plug" title={doorWords.title} count={doorList.length}>
    <ul class="doors">
      {#each doorList as door (door.id)}
        {@const lit = doorState(door)}
        <li class="door" in:lineIn out:dismiss animate:flip={settle()}>
          <IconWell name="plug" size="l" />
          <span class="door-words">
            <span class="door-name" dir="auto">{door.name}</span>
            {#if door.register}<span class="door-detail">{copy.doorsWrites(door.register)}</span>{/if}
          </span>
          <span class="door-state" data-state={lit}>{lit === 'on' ? doorWords.on : lit === 'off' ? doorWords.off : doorWords.otherCheck}</span>
        </li>
      {/each}
    </ul>
    <p class="reading">{doorsLine(doorList)}</p>
  </Tile>
{/if}

<Tile icon="globe" class="section" data-surface="tile" title={copy.sources}>
  <div class="section-body">
    <!-- A RECORD LISTS ITS OWN SCHEDULED ACTIONS, with Resume and Reconnect that write.

         AND A SHELL WITH NO RECORD LISTS NOTHING. This arm drew the sample's `SOURCES`, three
         connectors nobody set up, one of them paused on a credential nobody holds, with
         Reconnect and Retry now buttons that only said what would have happened. The shell's
         own refusal is already on the screen, so nothing here repeats it. -->
    <!-- AND EVERY WEB ADDRESS THAT FED IT, with its last arrival (`feedsOf`): card texts posted every hour are a source,
         and the tile said nothing fed the record. A reader who cannot read the doors is not told nothing does. -->
    {#if allQuiet}<p class="hint all-quiet">Nothing has come in yet.</p>{/if}
    {#if feeds.length > 0 || wayRows.length > 0}
      <ul class="feeds">
        {#each feeds as feed (feed.id)}
          <li class="feed"><span class="feed-name" dir="auto">{feed.name}</span><span class="feed-said">{feed.said}</span></li>
        {/each}
        {#each wayRows as way (way.id)}
          <li class="feed"><span class="feed-name">{way.name}</span>{#if !allQuiet}<span class="feed-said">{way.said}</span>{/if}</li>
        {/each}
      </ul>
    {/if}
    {#if shell.live}
      <Actions project={null} others={!waysRead || feeds.length > 0 || wayRows.length > 0 || !anOwner || doors.value === null} />
    {/if}
    <!-- `25 §9`'s own blockquote, and it outranks the screen: "every chart fed by a stale series
         shows a gap and a stale badge. A dashboard that keeps yesterday's number on screen as if
         it were today's is the failure that actually costs somebody money." -->
    <p class="hint">{copy.staleShows}</p>
  <!-- THERE WAS NO WAY TO ADD ONE, and inventing a button would be worse: `25 §9` draws this
       screen without one, because a source is a declaration and arrives the way every
       declaration does (`04 §1`: `ingest` is one of the kinds an add-on carries). So the screen
       says where a new one comes from and links there. -->
    <p class="hint sources-add">{copy.sourcesAdd} <a class="tap" href={at('/addons')}>{copy.sourcesAddGo}</a></p>
  </div>
</Tile>

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

  AND SO IS WHETHER THIS HOST HAS THE DOOR.
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
<!-- CONNECT GOOGLE: one Google account, read only, filling Gmail, Calendar and People (`$lib/google`). -->
<GoogleConnect place="settings" />
<Tile icon="mail" class="section" data-surface="tile" title={mailWords.title}>
  <div class="section-body">
    <p class="hint">{mailWords.how}</p>
    <!-- WHOSE MAIL ARRIVES UNSIGNED, said once where the person running the mail door looks (sec-follow M2): a forwarder
         that rewrites a message breaks its signature, and it waits in the Inbox with nothing else saying why. -->
    {#if unsignedMail}
      <p class="hint">{unsignedMail} <a class="tap" href={UNSIGNED_HELP} target="_blank" rel="noopener noreferrer">{words.unsignedFix}</a></p>
    {/if}
    {#if mintsHere === false}
      <!-- THE HOST'S ANSWER, AS THE SECTION'S OWN SENTENCE. It says where a self-host keeps the
           address and what writing and deleting that file do, so the person leaves with the thing
           they came for instead of a control that cannot work. Nothing is said about a fresh
           sign-in, because there is no door here for a sign-in to open. -->
      {#if shell.host === 'cloud'}
        <p class="hint">{words.unroutedHosted}</p>
      {:else}
        <!-- THE COMMAND BEHIND A FOLD: the person who runs the machine opens it, and nobody else reads a shell line. -->
        <details class="command">
          <summary>{words.unrouted}</summary>
          {#if origin && !reachableForMail(origin)}<p class="hint">{mailWords.notReachable(origin)}</p>{/if}
          <!-- ONE COMMAND WHERE THE HOST SAYS WHICH (PK5): the Docker one in the image, the plain one outside it, and both
               only from a host older than the flag. -->
          {#if shell.image}
            <CodeLine text={dockerAddressCommand(origin, shell.index.slug)} />
          {:else if shell.host === 'self-host'}
            <CodeLine text={addressCommand(origin, shell.index.slug)} />
          {:else}
            <p class="hint">{mailWords.onDocker}</p>
            <CodeLine text={dockerAddressCommand(origin, shell.index.slug)} />
            <p class="hint">{mailWords.noDocker}</p>
            <CodeLine text={addressCommand(origin, shell.index.slug)} />
          {/if}
        </details>
      {/if}
    {:else if mintsHere === true && !anOwner}
      <!-- AND THE PERSON ONLY ONCE THE HOST HAS ANSWERED, which `mintsHere === true` is what
           says. Written as a bare `{:else if !anOwner}` this arm also caught the moment before
           the probe lands, where `mintsHere` is still `null`: a colleague on a host with no door
           read "Only an owner of this record can do this", and then watched it be replaced by
           the sentence about `inbound.token` when the GET came back. The section says one thing
           or says nothing, and an owner has always been drawn nothing until the door answers. -->
      <p class="hint">{levelWords.ownersOnly}</p>
    {:else if mintsHere === true}
      <!--
        THREE STEPS, IN THE ORDER A PERSON TAKES THEM: make the address, point the mail at it,
        and send one to see it land. It was a wall of five paragraphs around two buttons, and the step
        that tells somebody it worked was not on the screen at all. Each step is its number, its title,
        its one sentence and its control, and nothing is boxed.
      -->
      <ol class="steps">
        <li class="step">
          <span class="step-n num" aria-hidden="true">1</span>
          <div class="step-body">
            <h3 class="step-title">{words.stepMake}</h3>
            <p class="hint">{mailWords.freshWhy}</p>
            <div class="row-actions">
              <!-- ONE PRIMARY ON THE SCREEN: once an address is on it, copying that address is the one
                   thing to do next, so making another steps down to a secondary. -->
              <Button weight={mailSaid?.kind === 'minted' ? 'quiet' : 'primary'} disabled={mailBusy} onclick={() => void askMail('mint')}>
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
          </div>
        </li>
        <li class="step">
          <span class="step-n num" aria-hidden="true">2</span>
          <div class="step-body">
            <h3 class="step-title">{words.stepForward}</h3>
            <p class="hint">{mailWords.forwardHow}</p>
            {#if mailSaid?.kind === 'minted'}
              <!-- SHOWN ONCE, from `mailSaid` alone, which leaving the area empties. -->
              <div class="code-form" role="status">
                <p class="code-label">{mailWords.once}</p>
                <p class="address wrap">{mailAddress}</p>
                <div class="row-actions">
                  <!-- THE LABEL IS PASSED, because `clipboard.put(text)` quotes the text in its own toast, and
                       the text here is a live credential. -->
                  <Button weight="primary" onclick={() => void clipboard.put(mailAddress, mailWords.addressCopied)}>{mailWords.copyAddress}</Button>
                </div>
              </div>
            {:else}
              <!-- THE FACT THE SCREEN CANNOT HIDE: there is no route that reads an address back, so this says so
                   rather than leaving a blank where a value would go and letting it read as "you have none". -->
              <p class="hint">{mailWords.unknown}</p>
            {/if}
          </div>
        </li>
        <li class="step">
          <span class="step-n num" aria-hidden="true">3</span>
          <div class="step-body">
            <h3 class="step-title">{words.stepTest}</h3>
            <p class="hint">{words.testLine}</p>
            <div class="row-actions">
              <Button href="/inbox">{words.openInbox}</Button>
            </div>
          </div>
        </li>
      </ol>
    {/if}
  </div>
</Tile>
<!-- A BANK'S TEXTS: how they get here, and a box to paste one into (AH10). Today's next step opens here, at `#texts`. -->
<Tile icon="money" class="section" data-surface="tile" title={words.textsTitle} id="texts">
  <div class="section-body texts-body">
    <p class="hint">{words.textsLead}</p>
    <ol class="texts-ways">
      <li class="hint">{words.textsForward}</li>
      <li class="hint">{words.textsPaste}</li>
    </ol>
    <PasteBank {shell} />
  </div>
</Tile>
<!-- EVERY OTHER SENDER, AND RECORD METHODS RATHER THAN A HOST DOOR. `doors` lists what this record declares and
     `ingestMint` mints for one of them, so unlike the mail section there is no probe: the section is drawn, and
     a record that declares no door says so in its own empty state. -->
<WebhookDoors owner={anOwner} />

<style>
  .command > summary {
    cursor: pointer;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
    padding-block: var(--sp-2);
  }

  @media (pointer: coarse) {
    .command > summary {
      box-sizing: border-box;
      min-block-size: var(--tap);
      padding-block: max(var(--sp-2), calc((var(--tap) - 1lh) / 2));
    }
  }

  /* THE ADDRESS, SHOWN ONCE, in the block the agents area shows a bearer in. Nothing here sets a
     colour: the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* A FORWARDING ADDRESS HAS NO SPACES IN IT, and one long word must not push the page sideways:
     `13 §10` and the layout gate's first rule. */
  .wrap {
    overflow-wrap: anywhere;
  }

  /* THE IDENTIFIER FACE, because an address is a string somebody compares character by character, and
     the house's token for it rather than a font stack written here. It sits on
     the sunk ground as code does, so the one credential on the screen reads as a thing to copy. */
  .address {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-pop);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  /* THE STEPS: a number in a fixed track, then the step. No box around a step or the list;
     a hairline between steps, as between rows. */
  .steps {
    display: grid;
    margin: var(--sp-4) 0 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: grid;
    grid-template-columns: var(--sp-6) minmax(0, 1fr);
    column-gap: var(--sp-3);
    padding-block: var(--sp-4);
  }

  .step + .step {
    border-block-start: 1px solid var(--rule);
  }

  .step-n {
    color: var(--ink-3);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .step-body {
    min-inline-size: 0;
  }

  .step-title {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .step-body .hint:last-of-type {
    margin-block-end: 0;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE DOORS TILE'S ROWS: a 32px well, the door and the list it writes to, and its state as a 6px dot and a word,
     with a hairline between each. */
  /* WHAT FED THE RECORD: its name, and under it when it last did, a hairline between. */
  .feeds {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE LINE A SOURCE ON A DESK: its name, and when it last brought something at the row's end in the meta ink, as every
     list reads. Two lines of 15px in two inks stood each "Nothing has come in this way yet" as loud as its name. */
  .feed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 2px var(--sp-4);
    min-inline-size: 0;
    align-content: center;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
  }

  @media (width < 640px) {
    .feed {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .feed + .feed {
    border-block-start: 1px solid var(--rule);
  }

  .feed-name {
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .feed-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .doors {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .door {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .door + .door {
    border-block-start: 1px solid var(--rule);
  }

  .door-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .door-name {
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  .door-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .door-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    white-space: nowrap;
  }

  .door-state::before {
    content: '';
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-ctl);
    background: var(--ink-3);
  }

  .door-state[data-state='on'] {
    color: var(--ink);
  }

  .door-state[data-state='on']::before {
    background: var(--good);
  }

  /* OFF IS AN EMPTY RING, so the two states differ by shape as well as colour. */
  .door-state[data-state='off']::before {
    background: none;
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
  }

  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  @media (width < 900px) {
    .door {
      min-block-size: 60px;
    }
  }

  @media (forced-colors: active) {
    .door-state::before {
      background: CanvasText;
    }

    .door-state[data-state='off']::before {
      background: none;
      box-shadow: inset 0 0 0 1.5px CanvasText;
    }
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* THE PASTE BOX'S OWN TILE IS ITS HEADING AND ITS FIELD here, never a tile inside this one. */
  .texts-body :global(.tile) {
    margin-block-start: var(--sp-3);
    padding: 0;
    background: none;
    border-radius: 0;
  }

  /* THE TWO WAYS ONE STEP APART, whatever margin a hint brings. */
  .texts-ways > li {
    margin: 0;
  }

  .texts-ways {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding-inline-start: var(--sp-5);
  }
</style>
