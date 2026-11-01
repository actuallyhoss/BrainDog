<!--
  Settings > Identity: who you are (your face, your name and how you sign in), what you hold on
  this record, and the other records you can open. Your name and your sign-in email change here.
-->
<script lang="ts">
  import { BASE, apiBase, at, signinFor } from '$lib/at.ts';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { levelWord, openRecord } from '$lib/record/switcher.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { forgetOwn, renamePasskey, signOut, type PasskeyInfo } from '$lib/auth.ts';
  import { forgetSignedOut } from '$lib/record/signed-out.ts';
  import { passkeysSaid } from '$lib/ui/signing-in.ts';
  import { PEOPLE } from '$lib/who.ts';
  import { createClient } from '@braindog/client';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import { hostedHere } from '../../billing.ts';

  /* `part` DRAWS HALF OF IT inside Signing in (agents F14): `you` is who you are and how you sign in, `records` the
     records you can open and closing your account, so the passkeys and the places you are signed in sit between them.
     With no part it is all of it, in its old order. */
  let { shell, part }: AreaProps & { part?: 'you' | 'records' | undefined } = $props();

  /* THE MEMBERS AND THE SIGN-IN ARE SHARED: People reads the same list and Recovery the same host
     answer (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const SLUG = $derived(shell.index.slug);
  const me = $derived(shell.me);
  const signedOut = $derived(s.signedOut);
  /* THE TWO SIGN-IN STATES THAT ARE NOT A SESSION, said in the row where "Signed in as" stands when there is one. */
  const identityWords = {
    here: 'This browser',
    openHost: 'Let in without signing in, as this BrainDog’s one person',
    notSignedIn: 'Not signed in',
    seeBelow: 'See below',
  };
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

  /* ── a passkey's name ────────── */

  /**
   * ONE PASSKEY RENAMED AT A TIME, in place on its own line. A passkey is named for the device that made it
   * (`platformLabel`), which is right until somebody has two iPhones; this is where it becomes theirs. The answer is
   * written into the shared list, so Recovery, one area away, shows the new name too.
   */
  let keyRenaming = $state<string | null>(null);
  let typedKey = $state('');
  let savingKey = $state(false);
  let keyRefusal = $state('');
  let keySaid = $state('');

  function startKeyRename(k: PasskeyInfo): void {
    keyRenaming = k.id;
    typedKey = k.label ?? '';
    keyRefusal = '';
    keySaid = '';
  }

  async function saveKeyName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const id = keyRenaming;
    if (savingKey || id === null) return;
    savingKey = true;
    keyRefusal = '';
    const at = opened();
    const out = await renamePasskey(id, typedKey);
    closed(true, at);
    savingKey = false;
    if (!out.ok) {
      keyRefusal = out.kind === 'refused' && out.fix ? out.fix : copy.identityPasskeyNotRenamed;
      return;
    }
    s.liveKeys = s.liveKeys?.map((k) => (k.id === out.value.id ? out.value : k)) ?? null;
    keyRenaming = null;
    keySaid = copy.identityPasskeyRenamed(out.value.label ?? copy.passkeyUnnamed);
  }

  /* ── your name and sign-in email ────────── */

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /* WHAT A WRITE ANSWERED, OVER WHAT WAS READ, so the name and the address on screen move the moment the record or the
     account says they moved, without waiting for the members to be read again. */
  let named = $state<string | null>(null);
  let movedTo = $state<string | null>(null);
  /* A NAME THAT IS THE ID IS NO NAME: `personOf` falls back to the person's id so a list line is called something, and
     this area printed "p_self" under the face. The area says it holds no name instead, and offers to add one. */
  const myName = $derived(named ?? (mine && mine.name !== mine.id ? mine.name : null));
  const myEmail = $derived(movedTo ?? signedInEmail ?? mine?.email ?? null);
  /* THE FACE IS A LETTER OF THE NAME, or of the address before there is a name, and never of an id. */
  const faceName = $derived(myName ?? myEmail ?? copy.you);
  const passkeysHere = $derived(s.hostAuth?.passkey === true && s.liveKeys !== null);
  /* WHETHER LOSING ONE DEVICE WOULD LOCK YOU OUT, said over the passkeys already listed; nothing new is read. */
  const keysSaid = $derived(passkeysSaid(s.liveKeys ?? []));
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
   * under another name: the one press offered. Two rows with one address are not guessed between, and a list
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

  /**
   * CLOSING THE ACCOUNT IS THE CLOUD'S ALONE: a self-host belongs to its operator, and its `/account/close` is a
   * 404. The address is typed to confirm, in a sheet, and the host checks it, the fifteen minutes and every record's
   * owners; this prints what the host answered and decides none of it.
   */
  const closable = $derived(hostedHere(shell) && !!signedInEmail && !signedOut);
  let closeOpen = $state(false);
  let typedClose = $state('');
  let closing = $state(false);
  let closeRefusal = $state('');
  let closeStale = $state(false);
  let closedNow = $state(false);

  function startClose(): void {
    typedClose = '';
    closeRefusal = '';
    closeStale = false;
    closeOpen = true;
  }

  async function closeAccount(e?: SubmitEvent): Promise<void> {
    e?.preventDefault();
    if (closing) return;
    closing = true;
    closeRefusal = '';
    closeStale = false;
    const mark = opened();
    /* Who is leaving, read before the close ends the session, so their own pictures go with it. */
    const leaving = s.hostAuth?.me?.person ?? null;
    let answer: { ok?: unknown; refusal?: { code?: unknown; fix?: unknown } } | undefined;
    try {
      const res = await fetch('/account/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ email: typedClose.trim() }),
      });
      answer = await res.json().catch(() => undefined);
    } catch {
      answer = undefined;
    }
    closed(true, mark);
    closing = false;
    if (answer?.ok === true) {
      /* AN ACCOUNT CLOSED ENDS ITS SESSIONS: what this browser kept of what they read goes now, as on a sign-out. */
      forgetSignedOut();
      await forgetOwn(leaving);
      closedNow = true;
      return;
    }
    const fix = answer?.refusal?.fix;
    closeRefusal = typeof fix === 'string' && fix !== '' ? fix : copy.closeUnreached;
    closeStale = answer?.refusal?.code === 'NEEDS_BROWSER_SESSION';
  }
</script>

{#if part !== 'records'}

<!--
  THE AREA OPENS WITH THE PERSON: their face, their name and how they sign in, never an id.
  The name is the record's `renamePerson`, which the host carries into every other record they
  belong to; the address is the account's, a link mailed to the new one that moves nothing until
  it is opened (`POST /account/email`), and this area is where that link lands.

  `33 §10` is the fact that makes the area make sense at all: "Login is account-level (a
  person may hold several records), so identity lives OUTSIDE the record."
-->
<Tile icon="user-check" class="section" data-surface="tile" title={copy.you}>
  <div class="section-body">
    <div class="person">
      <span class="person-face"><Face name={faceName} you size="l" /></span>
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

  <!-- HOW YOU SIGN IN, AS ROWS, IN THE SAME TILE AS WHO YOU ARE (agents F14): each fact with its glyph, what it is in the
       meta line and what is true in the title's. Two tiles of one and two lines each were one thing said twice. -->
    <ul class="facts">
      <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` (the schema's own id for the signed-in
           human) while `/settings/people` one click away renders the same person as "You" with
           an address and a join date. `19 §9` bans a word the schema uses about itself, and an
           address is what an invitation binds to and what identifies you across the records
           listed below. -->
      <!-- AND NOBODY ONCE THE SESSION IS OVER. The fallbacks below are the record's idea of who
           you are, so after Sign out this still read "Signed in as owner@example.test" beside
           "You are signed out." -->
      <!-- AND NEVER AN ID: with no address and no name the row says
           nothing rather than the person's id. -->
      <!-- AND A REAL SIGN-IN STATE. "Signed in as" stood beside a "Sign in" button whenever the
           host answered no session, because the row's only condition was that nobody had pressed Sign
           out here. It is drawn only while a session names somebody, and otherwise the row says which
           of the two other states this is: a host that lets its one person in without signing in, or
           nobody signed in at all. -->
      {#if !signedOut && s.hostAuth?.me}
        <li><IconWell name="lock" /><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{myEmail ?? myName ?? copy.you}</span></li>
      {:else}
        <li><IconWell name="monitor" /><span class="fact-key">{identityWords.here}</span><span class="fact-value">{s.hostAuth?.open && !signedOut ? identityWords.openHost : identityWords.notSignedIn}</span></li>
      {/if}
      {#if !signedOut}
        {#if passkeysHere}
          <!-- THE PASSKEYS AS ONE LINE FIRST: how many, on which kinds of device, and whether you could still sign in
               with one lost. Below two it carries the way to add one, which is Recovery's. With none, nothing can be
               lost, so it says only that there are none yet. -->
          <li class="fact-act">
            <IconWell name="key" /><span class="fact-key">{copy.identityPasskeysWay}</span>
            <span class="fact-value">{(s.liveKeys?.length ?? 0) === 0 ? copy.identityPasskeys(0) : keysSaid.line}</span>
            <!-- ONE ADD A PASSKEY ON THE SCREEN: it is the Passkeys tile's, under this one, so
                 this row says the count and links down to it. -->
            {#if keysSaid.short}<span class="fact-do"><Button weight="bare" href="#passkeys">{identityWords.seeBelow}</Button></span>{/if}
          </li>
        {/if}
        {#if passkeysHere && (s.liveKeys?.length ?? 0) > 0}
          <!-- EACH PASSKEY BY ITS NAME, with Rename on its own line; the form takes the line's place while open. -->
          {#each s.liveKeys ?? [] as k (k.id)}
            {@const name = k.label ?? copy.passkeyUnnamed}
            <li class="fact-act">
              <IconWell name="key" /><span class="fact-key">{copy.identityPasskeyWay}</span>
              {#if keyRenaming === k.id}
                <form class="rename key-form" onsubmit={saveKeyName}>
                  <label class="identity-label" for="identity-key-name">{copy.identityPasskeyNameLabel}</label>
                  <span class="field rename-field" class:rename-bad={!!keyRefusal}>
                    <input
                      class="field-input"
                      id="identity-key-name"
                      type="text"
                      autocomplete="off"
                      maxlength="64"
                      bind:value={typedKey}
                      aria-describedby="identity-key-help"
                      disabled={savingKey}
                    />
                  </span>
                  <p class="identity-help" class:identity-bad={!!keyRefusal} id="identity-key-help" role={keyRefusal ? 'alert' : undefined}>
                    {keyRefusal || copy.identityPasskeyNameHint}
                  </p>
                  <div class="rename-actions">
                    <Button weight="primary" type="submit" disabled={savingKey}>{savingKey ? copy.identitySaving : copy.identityPasskeySaveName}</Button>
                    <Button weight="bare" disabled={savingKey} onclick={() => (keyRenaming = null)}>{copy.identityCancel}</Button>
                  </div>
                </form>
              {:else}
                <span class="fact-value">{name}</span>
                <span class="fact-do">
                  <Button weight="bare" onclick={() => startKeyRename(k)} aria-label={copy.identityRenamePasskeyOf(name)}>{copy.identityRenamePasskey}</Button>
                </span>
              {/if}
            </li>
          {/each}
        {/if}
      {/if}
      <!-- A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD was told "Can read, cannot change": the shell's
           `read` is a fallback for them, and the Expenses bookkeeper's whole job is changing rows.
           What they hold is the lists, so the lists are named. -->
      <li><IconWell name="rows" /><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{me.lists && me.lists.length > 0 ? namesOf(me.lists) : (copy.levelMeans[me.level] ?? me.level)}</span></li>
    </ul>
    {#if keySaid}<p class="hint" role="status">{keySaid}</p>{/if}
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
             signing in, which is the tab's kept sample. -->
        <!-- "ADD A PASSKEY", NOT "SIGN IN" (agents F14): nothing here is a second sign-in, and inside Signing in the
             Passkeys tile right under this offers it, so it is drawn only on its own. -->
        {#if part === undefined}<Button href={signinFor(page.url)}>{copy.addPasskey}</Button>{/if}
      {/if}
    </div>
    {#if outSaid}<p class="hint" role="status">{outSaid}</p>{/if}
  </div>
</Tile>

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

{/if}

{#if part !== 'you'}
<!-- "RECORDS YOU CAN OPEN" OVER TWO ROWS YOU COULD NOT OPEN. A heading that names an action
     above a list that does not offer it is the plainest kind of lie a screen can tell, and
     this one told it about the one thing the section exists for.

     THE ROW IS THE CONTROL, AND IT DOES WHAT THE RAIL'S SWITCHER DOES: the session moves to that
     record and the app starts again at its Home (`openOther`). The address is the one the move
     lands on, so the keyboard and the middle button have a real place to go. Two surfaces
     offering one act must not answer it two ways. The record you are already in is not a link
     at all: you are in it. -->
<Tile icon="grid" class="section" data-surface="tile" title={copy.yourRecords} count={me.records.length || undefined}>
  <div class="section-body">
    <ul class="ledger ledger-lead">
      {#each me.records as r}
        {@const here = r.slug === SLUG}
        <li>
          <svelte:element
            this={here ? 'div' : 'a'}
            class="line line-tall"
            href={here ? undefined : at('/', `${BASE}/${r.slug}/`)}
            role={here ? undefined : 'link'}
            onclick={here
              ? undefined
              : (e: MouseEvent) => {
                  e.preventDefault();
                  void openOther(r);
                }}
          >
            <span class="line-mark"><Face name={r.name} of="record" size="l" /></span>
            <span class="line-main">
              <!-- "YOU ARE HERE" BESIDE THE NAME, not at the row's end, where on a phone it squeezed the line under the
                   name to two lines and left "people" alone on the second. -->
              <span class="line-title">{r.name}{#if here}<span class="here">{copy.thisOne}</span>{/if}</span>
              <span class="line-detail">{r.level === null ? levelWord(r) : (copy.levelMeans[r.level] ?? r.level)}</span>
            </span>
            <span class="line-amount"></span>
            <span class="line-when">{#if !here}<span class="go" aria-hidden="true"><Icon name="chevron" size="s" /></span>{/if}</span>
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
  </div>
</Tile>

<!-- CLOSE YOUR ACCOUNT, LAST: what goes and what stays said before anybody presses, the
     red text button here and the one filled red button inside the sheet that does it. At 390px
     `row-actions` stacks, so the button is full width. -->
{#if closable || closedNow}
  <Tile icon="trash" class="section" data-surface="tile" title={copy.closeTitle}>
    <div class="section-body">
      <p class="hint">{copy.closeSays}</p>
      <div class="row-actions">
        <Button tone="bad" onclick={startClose}>{copy.closeStart}</Button>
      </div>
    </div>
  </Tile>

  <Sheet bind:open={closeOpen} title={copy.closeTitle}>
    {#if closedNow}
      <p class="sheet-said" role="status">{copy.closeDone}</p>
    {:else}
      <form id="identity-close-form" class="rename" onsubmit={closeAccount}>
        <label class="identity-label" for="identity-close">{copy.closeLabel}</label>
        <span class="field rename-field" class:rename-bad={!!closeRefusal}>
          <input
            class="field-input"
            id="identity-close"
            type="email"
            inputmode="email"
            autocomplete="off"
            bind:value={typedClose}
            aria-describedby="identity-close-help"
            disabled={closing}
          />
        </span>
        <p class="identity-help" class:identity-bad={!!closeRefusal} id="identity-close-help" role={closeRefusal ? 'alert' : undefined}>
          {closeRefusal || copy.closeHint(signedInEmail ?? '')}
        </p>
        {#if closeStale}<div class="row-actions"><Button href={signinFor(page.url)}>{copy.signIn}</Button></div>{/if}
      </form>
    {/if}
    {#snippet footer()}
      {#if closedNow}
        <Button href="/">{copy.closeLeave}</Button>
      {:else}
        <Button weight="primary" tone="bad" type="submit" form="identity-close-form" disabled={closing || typedClose.trim() === ''}>
          {closing ? copy.closeGoing : copy.closeGo}
        </Button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

{/if}

<style>
  /* HOW YOU SIGN IN, AS ROWS ON THE GROUND: a 28px well, what the fact is in the meta size, and what is true
     at the row's size under it, with a hairline between rows from the words' edge. */
  .facts {
    display: grid;
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    position: relative;
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr);
    align-content: center;
    column-gap: var(--sp-3);
    row-gap: 2px;
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .facts li :global(.well) {
    grid-row: 1 / span 2;
    align-self: center;
  }

  .facts li + li::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--well) + var(--sp-3)) 0;
    block-size: 1px;
    background: var(--rule);
  }

  .fact-key {
    grid-column: 2;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* A LINE WITH ITS OWN ACTION: Rename at the end, across both of the line's rows; the form spans the words and it. */
  .facts li.fact-act {
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
  }

  .fact-do {
    grid-column: 3;
    grid-row: 1 / span 2;
    align-self: center;
  }

  .key-form {
    grid-column: 2 / -1;
    margin-block-end: 0;
  }

  .fact-value {
    grid-column: 2;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  /* "THIS ONE" IS WHERE YOU ARE, said in the meta ink; every other record's row goes somewhere, and says so. */
  .here {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    white-space: nowrap;
  }

  .go {
    display: inline-flex;
    color: var(--ink-3);
  }

  .go:dir(rtl) {
    scale: -1 1;
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* THE PERSON FIRST: their face, the name at the group size as the line a reader looks for, and the address
     under it in the meta ink. Long addresses wrap rather than push the page sideways at 320. */
  .person {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    margin-block-end: var(--sp-2);
  }

  .person-face {
    display: inline-flex;
    flex: none;
  }

  .person-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .person-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .person-email {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  /* A FORM, AS THE DESIGN SYSTEM DRAWS ONE: the label above the field, the help under it, and a refusal in
     the help's place in `--red` with the field's edge in `--red` too. */
  .rename {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
    margin-block: var(--sp-2) var(--sp-3);
  }

  .identity-label {
    margin-block-end: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* 16px TEXT IN EVERY INPUT, at every width, so a phone never zooms into the field. */
  .rename-field .field-input {
    font-size: var(--fs-body);
  }

  /* THE FIELD'S EDGE IN `--red`: a field has no border, so the edge is drawn inside it. */
  .rename-bad {
    box-shadow: inset 0 0 0 1.5px var(--red);
  }

  .identity-help {
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .identity-bad {
    color: var(--red);
  }

  .rename-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .sheet-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
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
