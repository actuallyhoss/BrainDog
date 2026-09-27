<!--
  Settings > Identity: who you are signed in as, what you hold on this record, and the other
  records you can open.
-->
<script lang="ts">
  import { BASE, at, signinFor } from '$lib/at.ts';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { levelWord, openRecord } from '$lib/record/switcher.ts';
  import { signOut } from '$lib/auth.ts';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
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
</script>

<!--
  THE DOCUMENTS SPECIFY NO SCREEN HERE, and this says what the record knows rather than
  inventing controls. `identity` is named once in `19 §2`'s inventory and elaborated nowhere
  (the only area with no downstream section), and no route in the whole surface changes any
  `person` field, so a name or email editor would be a form with nothing behind it.

  `33 §10` is the fact that makes the area make sense at all: "Login is account-level (a
  person may hold several records), so identity lives OUTSIDE the record."
-->
<Section title={copy.you}>
  <ul class="facts">
    <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` (the schema's own id for the signed-in
         human) while `/settings/people` one click away renders the same person as "You" with
         an address and a join date. `19 §9` bans a word the schema uses about itself, and an
         address is what an invitation binds to and what identifies you across the records
         listed below. -->
    <!-- AND NOBODY ONCE THE SESSION IS OVER. The fallbacks below are the record's idea of who
         you are, so after Sign out this still read "Signed in as owner@example.test" beside
         "You are signed out." (`research-first-sign-in.md` friction 10). -->
    {#if !signedOut}
      <li><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{signedInEmail ?? mine?.email ?? mine?.name ?? me.person}</span></li>
    {/if}
    <!-- A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD was told "Can read, cannot change": the shell's
         `read` is a fallback for them, and the Expenses bookkeeper's whole job is changing rows
         (`research-invite-landing.md` finding 3). What they hold is the lists, so the lists are named. -->
    <li><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{me.lists && me.lists.length > 0 ? namesOf(me.lists) : (copy.levelMeans[me.level] ?? me.level)}</span></li>
  </ul>
  <p class="hint">{copy.identityOutside}</p>
  <!-- AND THE WAY TO REACH ANOTHER RECORD, from the area that is about who this one
       thinks you are. The palette carries the same row; this is the one a person finds
       without knowing the palette exists. -->
  <!-- SIGNING OUT LIVES HERE, beside who you are signed in as, and it takes the place of the way
       in only while there is a session to end. -->
  <div class="row-actions">
    {#if signedInEmail}
      <Button onclick={signOutHere} aria-busy={signingOutNow}>{signingOutNow ? copy.signingOut : copy.signOut}</Button>
    {:else}
      <!-- WITH A WAY BACK HERE. A bare `/signin` sent the person to the app's front door after
           signing in, which is the tab's kept sample (friction 1). -->
      <Button href={signinFor(page.url)}>{copy.signIn}</Button>
    {/if}
  </div>
  {#if outSaid}<p class="hint" role="status">{outSaid}</p>{/if}
</Section>

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
</style>
