<!--
  Settings > Identity: who you are (your face, your name and how you sign in), what you hold on
  this record, and the other records you can open. Your name and your sign-in email change here
  (GAP-7).
-->
<script lang="ts">
  import { BASE, apiBase, at, signinFor } from '$lib/at.ts';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { levelWord, openRecord } from '$lib/record/switcher.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { signOut } from '$lib/auth.ts';
  import { PEOPLE } from '$lib/who.ts';
  import { createClient } from '@braindog/client';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE MEMBERS AND THE SIGN-IN ARE SHARED: People reads the same list and Recovery the same host
     answer (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const SLUG = $derived(shell.index.slug);
  const me = $derived(shell.me);
  const signedOut = $derived(s.signedOut);
  const signedInEmail = $derived(s.hostAuth?.me?.email ?? null);
  const namesOf = s.namesOf;

  /**
   * The signed-in person's own row, which is where their name and address live.
   *
   * FROM THE RECORD'S MEMBERS, AND NEVER A FIXTURE'S. It read `PEOPLE_ACCESS` directly, so a live
   * record printed a sample address beside your name if the two happened to share an id, and nothing
   * at all if they did not. The answer is the record's members or it is nothing yet.
   */
  const mine = $derived(s.peopleFrom === 'live' ? s.people.find((p) => p.id === me.person) : undefined);

  /* BOTH ARE READ ON ARRIVING AT THE AREA. `untrack` for the reason the Ingest area gives: `opened()`
     reads and writes the same state, so an effect that called it tracked would loop. */
  $effect(() => {
    untrack(() => void s.readPeopleNow());
  });
  $effect(() => {
    untrack(() => void s.readSignIn());
  });

  let signingOutNow = $state(false);
  let outSaid = $state<string | null>(null);

  /**
   * ANOTHER RECORD IN "RECORDS YOU CAN OPEN" OPENS IT, AS THE RAIL'S SWITCHER DOES. The row toasted the sample's "Kiln
   * would open, with its own lists and pages, but nothing was saved yet." after the rail had learnt to move the session
   * (`Sidebar.svelte` `openOther`), so one act was answered two ways and this one opened nothing. A whole navigation,
   * for the rail's reason: everything this tab kept was read from the record being left.
   */
  let openingOther = false;
  async function openOther(r: { slug: string }) {
    if (openingOther) return;
    openingOther = true;
    const out = await openRecord((url, init) => fetch(url, init), r.slug, bareOrigin());
    openingOther = false;
    if (out.from === 'opened') return location.assign(out.to);
    toasts.push(out.from === 'absent' ? copy.recordNotOpened : out.fix, { intent: 'warn' });
  }

  async function signOutHere() {
    if (signingOutNow) return;
    signingOutNow = true;
    const at = opened();
    const out = await signOut();
    closed(true, at);
    signingOutNow = false;
    /* THE SHARED ANSWER IS WHAT CHANGES, so Recovery, one row away, stops listing the keys of a session that ended. */
    if (out.ok && s.hostAuth) {
      s.hostAuth = { ...s.hostAuth, me: null };
      s.liveKeys = null;
    }
    if (out.ok) s.signedOut = true;
    outSaid = out.ok ? copy.signedOut : copy.signOutFailed;
  }

  /* ── your name and sign-in email (GAP-7) ── */

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /* WHAT A WRITE ANSWERED, OVER WHAT WAS READ, so the name and the address on screen move the moment the record or the
     account says they moved, without waiting for the members to be read again. */
  let named = $state<string | null>(null);
  let movedTo = $state<string | null>(null);
  const myName = $derived(named ?? mine?.name ?? null);
  const myEmail = $derived(movedTo ?? signedInEmail ?? mine?.email ?? null);
  /* THE FACE IS A LETTER OF THE NAME, or of the address before there is a name, and never of an id. */
  const faceName = $derived(myName ?? myEmail ?? copy.you);
  const passkeysHere = $derived(s.hostAuth?.passkey === true && s.liveKeys !== null);
  /* A LINK CAN BE MAILED ONLY WHERE THIS HOST SENDS SIGN-IN MAIL; elsewhere Change email would be a 404 behind a button. */
  const mailsHere = $derived(s.hostAuth?.magic === true && !!s.hostAuth.me && !signedOut);
  const peopleOn = $derived(shell.index.registers.some((r) => r.id === PEOPLE));

  let renaming = $state(false);
  let typedName = $state('');
  let savingName = $state(false);
  let nameRefusal = $state('');
  let nameSaid = $state('');

  function startRename(): void {
    typedName = myName ?? '';
    nameRefusal = '';
    nameSaid = '';
    renaming = true;
  }

  async function saveName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (savingName) return;
    savingName = true;
    nameRefusal = '';
    const at = opened();
    const out = wrote(await clientOf().renamePerson(typedName));
    closed(true, at);
    savingName = false;
    if (!out.ok) {
      nameRefusal = out.fix;
      return;
    }
    named = out.value.name;
    renaming = false;
    nameSaid = copy.identityNameSaved(out.value.name);
    peopleRow = await peopleRowOf(out.value.name);
  }

  /**
   * THE PERSON'S OWN PEOPLE ROW, found by the address they sign in with, when People is on and exactly one row holds it
   * under another name: the one press the brief offers. Two rows with one address are not guessed between, and a list
   * that could not be read offers nothing rather than a button that fails.
   */
  let peopleRow = $state<{ seq: number } | null>(null);
  let rowBusy = $state(false);
  let rowSaid = $state('');

  async function peopleRowOf(name: string): Promise<{ seq: number } | null> {
    if (!peopleOn || !myEmail) return null;
    const out = await clientOf().list({ register: PEOPLE, where: { field: 'email', is: myEmail }, limit: 2 });
    if (!out.ok || out.value.rows.length !== 1) return null;
    const row = out.value.rows[0] as { seq?: unknown; fields?: { name?: unknown } } | undefined;
    if (typeof row?.seq !== 'number' || row.fields?.name === name) return null;
    return { seq: row.seq };
  }

  async function renameRow(): Promise<void> {
    if (rowBusy || !peopleRow || !named) return;
    rowBusy = true;
    const at = opened();
    const out = wrote(await clientOf().update({ register: PEOPLE, seq: peopleRow.seq, patch: { name: named } }));
    closed(true, at);
    rowBusy = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    peopleRow = null;
    rowSaid = copy.identityPeopleRowDone;
  }

  /* CHANGE EMAIL IS A SHEET: the address, then the one sentence that says where the link went. */
  let emailOpen = $state(false);
  let typedEmail = $state('');
  let sending = $state(false);
  let emailRefusal = $state('');
  let sentTo = $state<string | null>(null);

  function startEmail(): void {
    typedEmail = '';
    emailRefusal = '';
    sentTo = null;
    emailOpen = true;
  }

  async function sendLink(e?: SubmitEvent): Promise<void> {
    e?.preventDefault();
    if (sending) return;
    sending = true;
    emailRefusal = '';
    const to = typedEmail.trim();
    const at = opened();
    const out = wrote(await clientOf().changeEmail(to));
    closed(true, at);
    sending = false;
    if (!out.ok) {
      emailRefusal = out.fix;
      return;
    }
    sentTo = to;
  }

  /**
   * THE MAILED LINK LANDS HERE, `#email=<token>`, and is spent at once. The fragment is cleared first, with the router's
   * state kept, so a reload or a copied address never carries the token again. A session older than fifteen minutes is
   * refused before the link is spent, and the sentence says to sign in and open the link once more.
   */
  let moving = $state(false);
  let movedSaid = $state('');
  let moveRefusal = $state('');
  let moveStale = $state(false);

  async function landed(): Promise<void> {
    const token = /^#email=([A-Za-z0-9_-]{1,100})$/.exec(location.hash)?.[1];
    if (!token) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    moving = true;
    const at = opened();
    const out = wrote(await clientOf().confirmEmail(token));
    closed(true, at);
    moving = false;
    if (!out.ok) {
      moveRefusal = out.fix;
      moveStale = out.code === 'NEEDS_BROWSER_SESSION';
      return;
    }
    movedTo = out.value.email;
    movedSaid = out.value.unreached > 0 ? `${copy.identityEmailMoved(out.value.email)} ${copy.identityEmailBehind(out.value.unreached)}` : copy.identityEmailMoved(out.value.email);
  }

  $effect(() => {
    untrack(() => void landed());
  });
</script>

<!--
  THE AREA OPENS WITH THE PERSON (GAP-7): their face, their name and how they sign in, never an id.
  The name is the record's `renamePerson`, which the host carries into every other record they
  belong to; the address is the account's, a link mailed to the new one that moves nothing until
  it is opened (`POST /account/email`), and this area is where that link lands.

  `33 §10` is the fact that makes the area make sense at all: "Login is account-level (a
  person may hold several records), so identity lives OUTSIDE the record."
-->
<Section title={copy.you}>
  <div class="person">
    <Face name={faceName} you size="l" />
    <div class="person-words">
      <p class="person-name">{myName ?? copy.identityNoName}</p>
      {#if myEmail && !signedOut}<p class="person-email">{myEmail}</p>{/if}
    </div>
  </div>

  <!-- A PERSON IN A BROWSER, signed in or on a host that lets its one person in without a
       session; the record refuses a token, so nothing here is offered to one. -->
  {#if !signedOut && (s.hostAuth?.me || s.hostAuth?.open)}
    {#if renaming}
      <form class="rename" onsubmit={saveName}>
        <label class="identity-label" for="identity-name">{copy.identityNameLabel}</label>
        <span class="field rename-field" class:rename-bad={!!nameRefusal}>
          <input
            class="field-input"
            id="identity-name"
            type="text"
            autocomplete="name"
            maxlength="200"
            bind:value={typedName}
            aria-describedby="identity-name-help"
            disabled={savingName}
          />
        </span>
        <p class="identity-help" class:identity-bad={!!nameRefusal} id="identity-name-help" role={nameRefusal ? 'alert' : undefined}>
          {nameRefusal || copy.identityNameHint}
        </p>
        <div class="rename-actions">
          <Button weight="primary" type="submit" disabled={savingName}>{savingName ? copy.identitySaving : copy.identitySaveName}</Button>
          <Button weight="bare" disabled={savingName} onclick={() => (renaming = false)}>{copy.identityCancel}</Button>
        </div>
      </form>
    {:else}
      <div class="row-actions">
        <Button onclick={startRename}>{copy.identityChangeName}</Button>
      </div>
    {/if}
    {#if nameSaid}<p class="hint" role="status">{nameSaid}</p>{/if}
    {#if peopleRow}
      <div class="row-actions">
        <Button onclick={renameRow} disabled={rowBusy}>{copy.identityPeopleRow}</Button>
      </div>
    {/if}
    {#if rowSaid}<p class="hint" role="status">{rowSaid}</p>{/if}
  {/if}

  <h3 class="ways-title">{copy.identitySignInWays}</h3>
  <ul class="facts">
    <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` (the schema's own id for the signed-in
         human) while `/settings/people` one click away renders the same person as "You" with
         an address and a join date. `19 §9` bans a word the schema uses about itself, and an
         address is what an invitation binds to and what identifies you across the records
         listed below. -->
    <!-- AND NOBODY ONCE THE SESSION IS OVER. The fallbacks below are the record's idea of who
         you are, so after Sign out this still read "Signed in as owner@example.test" beside
         "You are signed out." (`research-first-sign-in.md` friction 10). -->
    <!-- AND NEVER AN ID (design.md:270, SYS-3): with no address and no name the row says
         nothing rather than the person's id. -->
    {#if !signedOut}
      <li><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{myEmail ?? myName ?? copy.you}</span></li>
      {#if passkeysHere}
        <li><span class="fact-key">{copy.identityPasskeysWay}</span><span class="fact-value">{copy.identityPasskeys(s.liveKeys?.length ?? 0)}</span></li>
      {/if}
    {/if}
    <!-- A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD was told "Can read, cannot change": the shell's
         `read` is a fallback for them, and the Expenses bookkeeper's whole job is changing rows
         (`research-invite-landing.md` finding 3). What they hold is the lists, so the lists are named. -->
    <li><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{me.lists && me.lists.length > 0 ? namesOf(me.lists) : (copy.levelMeans[me.level] ?? me.level)}</span></li>
  </ul>
  <p class="hint">{copy.identityOutside}</p>
  {#if moving}<p class="hint" role="status">{copy.identityEmailMoving}</p>{/if}
  {#if movedSaid}<p class="hint" role="status">{movedSaid}</p>{/if}
  {#if moveRefusal}
    <p class="identity-help identity-bad" role="alert">{moveRefusal}</p>
    <!-- A SESSION OLDER THAN FIFTEEN MINUTES, and the link was left unspent for it: sign in again
         here, then open the link in the mail once more. -->
    {#if moveStale}<div class="row-actions"><Button href={signinFor(page.url)}>{copy.signIn}</Button></div>{/if}
  {/if}
  <!-- AND THE WAY TO REACH ANOTHER RECORD, from the area that is about who this one
       thinks you are. The palette carries the same row; this is the one a person finds
       without knowing the palette exists. -->
  <!-- SIGNING OUT LIVES HERE, beside who you are signed in as, and it takes the place of the way
       in only while there is a session to end. -->
  <div class="row-actions">
    {#if signedInEmail}
      {#if mailsHere}<Button onclick={startEmail}>{copy.identityChangeEmail}</Button>{/if}
      <Button onclick={signOutHere} aria-busy={signingOutNow}>{signingOutNow ? copy.signingOut : copy.signOut}</Button>
    {:else}
      <!-- WITH A WAY BACK HERE. A bare `/signin` sent the person to the app's front door after
           signing in, which is the tab's kept sample (friction 1). -->
      <Button href={signinFor(page.url)}>{copy.signIn}</Button>
    {/if}
  </div>
  {#if outSaid}<p class="hint" role="status">{outSaid}</p>{/if}
</Section>

<!-- CHANGE EMAIL, AS A SHEET: a bottom sheet under 640px with the field at 16px, and the sent
     state as one sentence that says where the link went and for how long. -->
<Sheet bind:open={emailOpen} title={copy.identityChangeEmail}>
  {#if sentTo}
    <p class="sheet-said" role="status">{copy.identityLinkSent(sentTo)}</p>
  {:else}
    <form id="identity-email-form" class="rename" onsubmit={sendLink}>
      <label class="identity-label" for="identity-email">{copy.identityEmailLabel}</label>
      <span class="field rename-field" class:rename-bad={!!emailRefusal}>
        <input
          class="field-input"
          id="identity-email"
          type="email"
          inputmode="email"
          autocomplete="email"
          bind:value={typedEmail}
          aria-describedby="identity-email-help"
          disabled={sending}
        />
      </span>
      <p class="identity-help" class:identity-bad={!!emailRefusal} id="identity-email-help" role={emailRefusal ? 'alert' : undefined}>
        {emailRefusal || copy.identityEmailHint}
      </p>
    </form>
  {/if}
  {#snippet footer()}
    {#if sentTo}
      <Button onclick={() => (emailOpen = false)}>{copy.identityClose}</Button>
    {:else}
      <Button weight="primary" type="submit" form="identity-email-form" disabled={sending || typedEmail.trim() === ''}>{sending ? copy.identitySending : copy.identitySendLink}</Button>
    {/if}
  {/snippet}
</Sheet>

<!-- "RECORDS YOU CAN OPEN" OVER TWO ROWS YOU COULD NOT OPEN. A heading that names an action
     above a list that does not offer it is the plainest kind of lie a screen can tell, and
     this one told it about the one thing the section exists for.

     THE ROW IS THE CONTROL, AND IT DOES WHAT THE RAIL'S SWITCHER DOES: the session moves to that
     record and the app starts again at its Home (`openOther`). The address is the one the move
     lands on, so the keyboard and the middle button have a real place to go. Two surfaces
     offering one act must not answer it two ways. The record you are already in is not a link
     at all: you are in it. -->
<Section title={copy.yourRecords} count={me.records.length}>
  <ul class="ledger ledger-glyph">
    {#each me.records as r}
      {@const here = r.slug === SLUG}
      <li>
        <svelte:element
          this={here ? 'div' : 'a'}
          class="line"
          href={here ? undefined : at('/', `${BASE}/${r.slug}/`)}
          role={here ? undefined : 'link'}
          onclick={here
            ? undefined
            : (e: MouseEvent) => {
                e.preventDefault();
                void openOther(r);
              }}
        >
          <span class="seq"><Icon name="rows" size="s" /></span>
          <span class="line-main"><span class="line-title">{r.name}</span></span>
          <span class="line-amount"><span class="means">{r.level === null ? levelWord(r) : (copy.levelMeans[r.level] ?? r.level)}</span></span>
          <span class="line-when">{#if here}{copy.thisOne}{/if}</span>
        </svelte:element>
      </li>
    {/each}
  </ul>
  <!-- AND THE HEADING SAYS WHAT IT COULD NOT COUNT. The rows are the account's answer, so when
       that read is refused this section holds the record you are inside and nothing else. A
       section called "Records you can open" that quietly holds one row reads as a product with
       one record in it, which is a different claim from the true one. The rail's switcher
       reports the same sentence, because two surfaces offering one fact must not answer it
       two ways. -->
  {#if shell.recordsRefused}<p class="hint">{shell.recordsRefused}</p>{/if}
</Section>

<style>
  /* A short list of stated facts, for the areas that REPORT rather than offer. Two columns so
     the label and the value line up down the page; it wraps to one below 520px. */
  .facts {
    display: grid;
    grid-template-columns: minmax(12ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: contents;
  }

  .fact-key {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact-value {
    color: var(--ink2);
  }

  @media (width < 520px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
      gap: 0 0;
    }

    /* The label over its value. As a block the two spans ran together into one line, "Signed in
       asada@studio.example". */
    .facts li {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      margin-block-end: var(--sp-2);
    }
  }

  .means {
    margin: 0;
    color: var(--ink2);
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

  /* THE PERSON FIRST (GAP-7): a face at the person's-page size, the name as the line a reader
     looks for, and the address under it in the secondary tone. Long addresses wrap rather than
     push the page sideways at 320. */
  .person {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  .person-words {
    min-inline-size: 0;
  }

  .person-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .person-email {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .ways-title {
    margin: var(--sp-4) 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  /* A FORM, AS THE BRIEF DRAWS ONE: the label above the field, the help under it, and a refusal in
     the help's place in `--danger` with the field's edge in `--danger` too. */
  .rename {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
    margin-block: var(--sp-2) var(--sp-3);
  }

  .identity-label {
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* 16px TEXT IN EVERY INPUT, at every width, so a phone never zooms into the field. */
  .rename-field .field-input {
    font-size: var(--t-md);
  }

  .rename-bad {
    border-color: var(--danger);
  }

  .identity-help {
    margin: var(--sp-1) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .identity-bad {
    color: var(--danger);
  }

  .rename-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .sheet-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  /* AT 390, ONE COLUMN: Save full width under the field and 44px tall, and every action in the
     area stacked rather than squeezed beside another. */
  @media (width < 640px) {
    .rename-actions,
    .row-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .rename-actions :global(.btn),
    .row-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }
</style>
