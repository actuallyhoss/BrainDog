<!--
  Settings.

  The theme control is a THREE-WAY SEGMENT, not a toggle offering the opposite. The predecessor's
  had three states and a one-way UI: once a person chose light or dark, only clearing local storage
  restored "match the system". "Match the system" must stay reachable (19 §4).

  Density switches on POINTER, never on width — a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).

  And `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    AUTH_METHODS, DEPLOYMENT, DEVICES, NOW, PACKS, PAGES, PASSKEYS, PEOPLE_ACCESS,
    REGISTERS, SNAPSHOTS, SNAPSHOTS_KEPT, SOURCES, boot, pages,
  } from '$lib/record/api.ts';
  import { LEVELS, type Level, type Person } from '$lib/record/schema.ts';
  import { TONES, relative } from 'braindog-render';

  /* THE RECORD'S OWN NAME. The Danger section named it two ways in three lines — `this record` and
     `the studio` — and one of the two was a literal. */
  const RECORD = boot().index.name;
  const me = boot().me;

  /* Bytes as a person reads them. One decimal, because 2.1 MB and 2.14 MB say the same thing and
     the second one asks to be read twice. */
  const size = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  /* Twelve rows with a glyph each, because this rail's own CSS says it "IS the same thing" as the
     app's rail, and the app's rail has never had a row without one. A list of twelve bare words is
     the hardest kind of nav to scan: nothing tells you where you are except reading all of them. */
  const AREAS = [
    { id: 'appearance', label: 'Appearance', icon: 'sun' },
    { id: 'identity', label: 'Identity', icon: 'people' },
    { id: 'recovery', label: 'Recovery', icon: 'key' },
    { id: 'people', label: 'People & sharing', icon: 'people' },
    { id: 'agents', label: 'Agents', icon: 'session' },
    { id: 'ingest', label: 'Ingest', icon: 'inbox' },
    { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
    { id: 'navigation', label: 'Navigation', icon: 'rows' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'backups', label: 'Backups', icon: 'archive' },
    { id: 'billing', label: 'Billing', icon: 'money' },
    { id: 'export', label: 'Export', icon: 'download' },
  ] as const;

  const area = $derived(page.params.area ?? 'appearance');

  /**
   * WHETHER THIS IS AN AREA AT ALL, which nothing asked.
   *
   * `area` came straight off the param with no membership test, and every screen downstream believed
   * it: `/settings/banana` gave `<title>Banana · Settings</title>`, an `<h1>Banana</h1>`, and a
   * `no-data-yet` state reading "This area is part of the shell and is not wired in the mock-up" —
   * a page answering a nonexistent address by asserting the feature exists and is merely
   * unconfigured.
   *
   * `/r/nope`, `/v/nope` and `/p/nope` all refuse this correctly and helpfully, naming the thing,
   * saying it is not here, and listing what is. Three route families got it right and the fourth
   * invented an area. `10 §7`'s fourth rule holds on a URL as much as on a write: the refusal is
   * the teacher.
   */
  const known = $derived(AREAS.find((a) => a.id === area));

  /**
   * NINE OF TWELVE AREAS WERE UNREACHABLE ON A PHONE.
   *
   * Below 900px the rail becomes a horizontal scroller — `scrollWidth 1294` inside `clientWidth
   * 358` — and nothing ever scrolled it. `scrollLeft` was 0 on every area, so the strip always read
   * "Appearance · Identity · Recovery" and a sliver of the fourth. On `/settings/billing` the
   * heading said Billing, the strip highlighted nothing, and no partial item peeked to suggest there
   * were nine more.
   *
   * `nearest` rather than `center`: on the first three areas the current one is already in view and
   * centring would scroll the list for no reason, which reads as the page moving under you.
   * `block: 'nearest'` keeps it from scrolling the PAGE to reach a strip that is already on screen.
   */
  let rail = $state<HTMLElement | undefined>(undefined);

  $effect(() => {
    rail
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => pref.apply(key, value);

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  let chars = $state(held.chars ?? true);

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string | null>(null);

  function pickAccent(hex: string | null) {
    const out = accentApply(hex);
    if (!out.ok) {
      /* THE FLOOR IT MISSED, NOT "THAT DID NOT WORK" — AND IN THE TERMS OF THIS SCREEN. `out.refusals`
         are the theme AUTHOR's sentences: "the pair (faint on s3) is 3.61:1 in dark, it needs 4.5:1,
         move faint further from the ground". There is no control here that moves a hue, lowers a
         chroma or knows what `s3` is, so every one of them instructed an action this person cannot
         take — which is the failure `checks.ts` names in its own comment two lines above the string.
         The code is what survives the trip; the sentence is built here, where the swatch is. */
      accentWrong = copy.accentRefused(ACCENTS.find((a) => a.hex === hex)?.name ?? String(hex), out.codes);
      return;
    }
    accentWrong = null;
    accent = hex;
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
  }

  const pen = $derived(Object.values(pages()).filter((p) => p.placed === false));

  /**
   * Put a suggested page in the rail.
   *
   * 29 §2's three tiers are derived → proposed → placed, and *"Movement is forward-only and needs a
   * user action."* This is the user action, and two rules from §4 govern what it would write: the
   * page appends AT THE END OF ITS SECTION rather than being inserted mid-list — Microsoft's
   * Personalized Menus put items at different distances down the menu each time, and Jensen Harris
   * announced the reversal in 2006 with that as the first reason — and nothing is ever placed
   * without it, because the system never writes nav order after first install (06 §3).
   *
   * IT SAID SO IN THE COMPLETED PAST TENSE AND WROTE NOTHING. The row vanished from the pen because
   * this filtered a local array; the rail reads `boot()`, which filters on the declaration's own
   * `placed` and `nav`, neither of which this could touch. So the page was back in the pen on
   * reload and had never once been in the nav. A sentence in the past tense about a thing that did
   * not happen is the worst kind of mock, because it is the kind somebody believes — and the undo
   * on the toast made it worse, by offering to reverse it.
   */
  /* AND THE CHARACTER KEYS TOO. It is the one preference that changes what the keyboard DOES, so
     forgetting it is the one somebody notices within a minute. */
  $effect(() => {
    pref.write({ chars });
  });

  /**
   * Put a suggested page in the rail.
   *
   * IT SAID `${title} is in your nav` IN THE COMPLETED PAST TENSE and nothing of the kind happened.
   * The row vanished from this list because `promote` filtered a local array; the rail reads
   * `boot()`, which filters on the declaration's own `placed` and `nav` — neither of which this
   * could touch — so the page was back in the pen on reload and never once in the nav. A sentence
   * in the past tense about a thing that did not happen is the worst kind of mock, because it is the
   * kind somebody believes.
   */
  /**
   * WHAT `invite({ person, levels, why })` WOULD WRITE, said in the words it would write it in.
   *
   * `45 §5.6`: one method does all three. It reads the old rows, deletes every `member` row for the
   * person, re-inserts from `levels`, and appends an `access.grant` per register raised or added and
   * an `access.revoke` per register lowered or removed — each carrying `why` as its note. So
   * invitation, level change and removal are not three operations with three confirmations; they are
   * one call, and `levels: []` is the removal.
   *
   * THE MOCK SAYS THE SENTENCE THAT WOULD BE WRITTEN rather than "saved". A toast reading "Saved"
   * over a call that also revokes eleven registers is the shape of thing somebody trusts once.
   */
  const levelChange = (who: Person, to: Level) =>
    toasts.push(
      copy.notWritten(
        to === who.level
          ? `${who.name} already reaches ${to}`
          : `${who.name} would move from ${who.level} to ${to} across this record, with one access.${LEVELS.indexOf(to) > LEVELS.indexOf(who.level) ? 'grant' : 'revoke'} per list and your reason on each`,
      ),
      { intent: 'warn' },
    );

  /* A RECORD KEEPS AT LEAST ONE OWNER — `LEVEL_REQUIRED`, and its fix sentence verbatim (45 §5.6).
     The check is here rather than in the control because it is a fact about the whole list. */
  const owners = $derived(PEOPLE_ACCESS.filter((p) => p.level === 'owner' && p.since).length);
  const lastOwner = (who: Person) => who.level === 'owner' && owners <= 1;

  /**
   * AND YOU CANNOT TAKE YOUR OWN OWNERSHIP AWAY FROM THIS SCREEN.
   *
   * `lastOwner` is a fact about the RECORD — how many owners exist — and never about *you*, so with
   * a second owner present every control on your own row went live, `read` included, with no
   * confirmation. The toast would have read "You would move from owner to read across this record",
   * after which you cannot reach this screen to undo it: the one action on the surface that removes
   * your own way back.
   *
   * It is a REFUSAL WITH A ROUTE, not a wall. `45 §5.6` has one method for every level change, and
   * another owner can still do this to you — which is the point of there being more than one. What
   * is refused is doing it to yourself, alone, by pressing a segment.
   */
  const self = (who: Person) => who.id === me.person;
  /** The signed-in person's own row, which is where their name and address live. */
  const mine = $derived(PEOPLE_ACCESS.find((p) => p.id === me.person));

  function promote(decl: PageDecl) {
    toasts.push(copy.notWritten(`${decl.title} would be placed at the end of its section in your nav`), { intent: 'warn' });
  }
</script>

<svelte:head><title>{titleOf(known?.label, copy.settings)}</title></svelte:head>

{#if !known}
  <div class="gone">
    <Empty
      kind="error"
      heading
      title={copy.noSuch('settings area', area)}
      body={copy.theseExist('Settings areas', AREAS.map((a) => a.label))}
    >
      {#snippet actions()}<Button href="/settings/appearance">{copy.settings}</Button>{/snippet}
    </Empty>
  </div>
{:else}
<PageHead icon="settings" kicker={copy.settings} title={known.label} />

<div class="shell">
  <nav class="areas" bind:this={rail} aria-label={copy.settings}>
    {#each AREAS as a}
      <a class="area" href="/settings/{a.id}" aria-current={a.id === area ? 'page' : undefined}>
        <Icon name={a.icon} size="s" />
        {a.label}
      </a>
    {/each}
  </nav>

  <div class="body">
    {#if area === 'appearance'}
      <!--
        THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
        against every floor it defines, and until now nothing called it with anything but the house
        red — so a bakery and a type foundry looked identical. The swatches are suggestions, not the
        set: any colour that passes goes in, and one that does not says which floor it missed rather
        than being quietly approximated.
      -->
      <Section title={copy.accentTitle}>
        <p class="hint">{copy.accentHint}</p>
        <div class="swatches" role="group" aria-label={copy.accentTitle}>
          {#each ACCENTS as a}
            <button
              type="button"
              class="swatch"
              data-on={accent === a.hex ? '' : undefined}
              style="--swatch:{a.hex}"
              aria-label={a.name}
              onclick={() => pickAccent(a.hex)}
            >
              {#if accent === a.hex}<Icon name="check" size="s" />{/if}
            </button>
          {/each}
          <button type="button" class="swatch swatch-off" data-on={accent === null ? '' : undefined} onclick={() => pickAccent(null)}>
            {copy.accentHouse}
          </button>
        </div>
        {#if accentWrong}<p class="wrong">{accentWrong}</p>{/if}
      </Section>

      <Section title={copy.scheme}>
        <div class="segment" role="group" aria-label={copy.scheme}>
          {#each [['light', copy.schemeLight, 'sun'], ['system', copy.schemeSystem, 'monitor'], ['dark', copy.schemeDark, 'moon']] as const as [v, label, icon]}
            <button type="button" class="seg" data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
              <Icon name={icon} size="s" />
              {label}
            </button>
          {/each}
        </div>
      </Section>

      <Section title={copy.textSize}>
        <div class="segment" role="group" aria-label={copy.textSize}>
          {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              data-on={text === v ? '' : undefined}
              onclick={() => ((text = v), set('text', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>

      <Section title={copy.density}>
        <div class="segment" role="group" aria-label={copy.density}>
          {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              data-on={density === v ? '' : undefined}
              onclick={() => ((density = v), set('density', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>
    {:else if area === 'keyboard'}
      <Section title={copy.characterKeys}>
        <!-- THE SENTENCE THAT SAYS WHAT THE SWITCH DOES. It was written, and allow-listed in
             `dead-copy` as *"UNBUILT — `/settings/keyboard` is a heading and two unexplained
             buttons"* — the gate knowing, in those words, that a compound noun and two buttons were
             all a reader got. `19 §4` calls this the app's WCAG 2.1.4 conformance; a switch whose
             effect nobody states is a switch nobody turns on deliberately. -->
        <p class="hint">{copy.characterKeysHint}</p>
        <div class="segment" role="group" aria-label={copy.characterKeys}>
          <button type="button" class="seg" data-on={chars ? '' : undefined} onclick={() => (chars = true)}>{copy.on}</button>
          <button type="button" class="seg" data-on={!chars ? '' : undefined} onclick={() => (chars = false)}>{copy.off}</button>
        </div>
      </Section>
    {:else if area === 'navigation'}
      <Section title="Suggested pages" count={pen.length}>
        {#if pen.length === 0}
          <Empty kind="cleared" title="Nothing waiting." />
        {:else}
          <ul class="ledger">
            {#each pen as p}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="doc" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{p.title}</span>
                    <!-- `register.people` is the requirement's own qualified id. What a reader
                         wants is which of their lists it was built from. -->
                    <span class="line-detail">
                      {copy.holdingPen} Built from your {REGISTERS[String(p.requires[0] ?? '').replace('register.', '')]?.name ?? 'rows'}.
                    </span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <Button weight="quiet" onclick={() => promote(p)}>Place in nav</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>
    {:else if area === 'people'}
      <!--
        IT WAS A LIST WITH NO CONTROLS, on the screen called People & sharing.

        You could see who had access and could not change it, could not invite anybody, and could
        not take it away — one of the five areas that were "real", and the one whose whole subject
        is a thing you do. `19 §2` names it beside `recovery` as an area an earlier draft dropped.

        `45 §5.6` HAS ONE METHOD FOR ALL THREE, which is why this is one control and not three:
        `invite({ person, levels, why })` deletes the person's `member` rows and re-inserts from
        `levels`, so a level change and a removal are the same call with a different argument.
      -->
      <Section title={copy.whoCanSee} count={PEOPLE_ACCESS.length}>
        <p class="hint">{copy.accessScope}</p>
        <!-- TWO LINES PER PERSON, and not the five-column `.line` every other ledger uses.

             The control is five buttons wide and the sentence beside it is a full clause, so in one
             row of that grid the email clipped mid-address and the sentence saying what the person
             can DO was squeezed out of existence — leaving five bare ladder words as the only
             answer to the question this screen exists for. Who they are on the first line, what they
             can do on the second, and the sentence directly under the control that sets it. -->
        <ul class="whos">
          {#each PEOPLE_ACCESS as p}
            <li class="who">
              <div class="who-head">
                <!-- NO AVATAR. `13 §2.1b` gives a frozen accent to a REGISTER ROW's identity, and
                     `20 §6` puts avatar stacks on a business record in the refused column. A glyph
                     says "person" without inventing a face for one. -->
                <Icon name="people" size="s" />
                <span class="who-name">{p.name}</span>
                <!-- THE EMAIL, because that is what the invitation is bound to (12 §3) and what
                     tells two people with one name apart. And WHEN, because access with no date is
                     a list you cannot audit. -->
                <span class="who-detail">
                  {p.email} · {p.since ? copy.sinceWhen(relative(p.since, NOW)) : copy.inviteOut}
                </span>
                <span class="who-do">
                <Button
                  weight="bare"
                  tone="bad"
                  disabled={lastOwner(p) || self(p)}
                  aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                  onclick={() =>
                    toasts.push(
                      copy.notWritten(`Every one of ${p.name}'s access rows would be removed, with one access.revoke per list`),
                      { intent: 'bad' },
                    )}
                >{copy.removeAccess}</Button>
                </span>
              </div>
              <div class="who-level">
                <div class="segment segment-sm" role="group" aria-label={copy.levelFor(p.name)}>
                  {#each LEVELS as level}
                    <button
                      type="button"
                      class="seg"
                      data-on={p.level === level ? '' : undefined}
                      aria-pressed={p.level === level ? 'true' : 'false'}
                      disabled={(lastOwner(p) && level !== 'owner') || (self(p) && level !== p.level)}
                      aria-describedby={lastOwner(p) && level !== 'owner'
                        ? 'last-owner'
                        : self(p) && level !== p.level
                          ? 'own-level'
                          : undefined}
                      onclick={() => levelChange(p, level)}
                    >{level}</button>
                  {/each}
                </div>
                <!-- WHAT THE SELECTED ONE MEANS, said once, in a sentence, under the control that
                     sets it. Five ladder words with nothing explaining them is the schema's
                     vocabulary on the screen that decides who can change somebody's business. -->
                <p class="means">{copy.levelMeans[p.level] ?? p.level}</p>
              </div>
            </li>
          {/each}
        </ul>
        <!-- `LEVEL_REQUIRED`'s own fix sentence, and it is always on screen rather than inside the
             refusal — a disabled control whose reason arrives only after you press it is a control
             that has already wasted the press. -->
        <p class="hint" id="last-owner">{copy.lastOwner}</p>
        <!-- BESIDE THE CONTROL, NOT AFTER THE PRESS, for the reason the line above it gives. -->
        <p class="hint" id="own-level">{copy.ownLevel}</p>
      </Section>

      <Section title={copy.inviteTitle}>
        <p class="hint">{copy.inviteHow}</p>
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() =>
              toasts.push(copy.notWritten('A single-use link would be sent, bound to that one address and good for 24 hours'), { intent: 'warn' })}
          ><Icon name="plus" size="s" />{copy.invitePerson}</Button>
        </div>
      </Section>

      <!-- `53 §5.8`: the owner erases a person from here, and it is the one control on this screen
           that is not about access at all — it is `02 §10`'s cascade over sixteen stores, in one
           transaction. It says which, because "erase" without a subject is a word nobody can act on. -->
      <Section title={copy.erasePerson}>
        <div class="danger">
          <p class="danger-title">{copy.eraseWhat}</p>
          <Button
            tone="bad"
            onclick={() => toasts.push(copy.notWritten('Erasing asks which person, and on what basis, before anything is removed'), { intent: 'bad' })}
          >{copy.erasePerson}</Button>
        </div>
      </Section>
    {:else if area === 'recovery'}
      <!--
        THE WAY BACK IN, and until now a dead end that said nothing about recovery.

        `19 §2`, verbatim: "`recovery` and `people & sharing` were missing from an earlier draft —
        the first left a passkey-primary product with NO DESIGNED WAY BACK IN." This build shipped
        the area and then left it saying "This area is part of the shell and is not wired in the
        mock-up", which is the same hole with a sentence in it.

        THERE IS NO ACCOUNT-RECOVERY FLOW AND THIS SCREEN DOES NOT INVENT ONE. `grep -rn "recovery
        code"` over all fifty-four documents returns nothing: the mechanism is a second passkey, and
        the fallback is the email link. Anything else here would be a control with nothing behind it
        on the one screen where that costs somebody their record.
      -->
      <Section title={copy.passkeys} count={PASSKEYS.length}>
        <p class="hint">{copy.passkeyHow}</p>
        {#if PASSKEYS.length === 0}
          <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(AUTH_METHODS.magic)} />
        {:else}
          <ul class="ledger">
            {#each PASSKEYS as k}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="key" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{k.label}</span>
                    <span class="line-detail">{copy.addedWhen(relative(k.added, NOW))}</span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <!-- LAST USED IS THE COLUMN THAT MATTERS. A key you have not used in a year is
                         the one on the laptop you sold. -->
                    {k.lastUsed ? copy.usedWhen(relative(k.lastUsed, NOW)) : copy.neverUsed}
                    <Button
                      weight="bare"
                      tone="bad"
                      disabled={PASSKEYS.length <= 1}
                      aria-describedby={PASSKEYS.length <= 1 ? 'last-key' : undefined}
                      onclick={() => toasts.push(copy.notWritten(`${k.label} would stop being a way into this record`), { intent: 'bad' })}
                    >{copy.remove}</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
          {#if PASSKEYS.length <= 1}<p class="hint" id="last-key">{copy.lastPasskey}</p>{/if}
        {/if}
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() => toasts.push(copy.notWritten('Your browser would be asked for a new passkey, and this session is what proves it is you'), { intent: 'warn' })}
          ><Icon name="plus" size="s" />{copy.addPasskey}</Button>
        </div>
      </Section>

      <!-- AND THE ONE THAT IS OFFERED ONLY WHERE IT EXISTS. `49 §5.6`: on a self-host with no SMTP
           `GET /auth/methods` answers `magic: false` "so the screen never offers it". A recovery
           screen offering a link that cannot be sent is worse than one offering nothing. -->
      {#if AUTH_METHODS.magic}
        <Section title={copy.magicLink}>
          <p class="hint">{copy.magicHow}</p>
        </Section>
      {/if}

      <Section title={copy.lockout}>
        <p class="hint">{copy.lockoutHow}</p>
      </Section>
    {:else if area === 'identity'}
      <!--
        THE DOCUMENTS SPECIFY NO SCREEN HERE, and this says what the record knows rather than
        inventing controls. `identity` is named once in `19 §2`'s inventory and elaborated nowhere —
        the only one of the twelve with no downstream section — and no route in the whole surface
        changes any `person` field, so a name or email editor would be a form with nothing behind it.

        `33 §10` is the fact that makes the area make sense at all: "Login is account-level — a
        person may hold several records — so identity lives OUTSIDE the record."
      -->
      <Section title={copy.you}>
        <ul class="facts">
          <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` — the schema's own id for the signed-in
               human — while `/settings/people` one click away renders the same person as "You" with
               an address and a join date. `19 §9` bans a word the schema uses about itself, and an
               address is what an invitation binds to and what identifies you across the records
               listed below. -->
          <li><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{mine?.email ?? mine?.name ?? me.person}</span></li>
          <li><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{copy.levelMeans[me.level] ?? me.level}</span></li>
        </ul>
        <p class="hint">{copy.identityOutside}</p>
      </Section>

      <Section title={copy.yourRecords} count={me.records.length}>
        <ul class="ledger">
          {#each me.records as r}
            <li>
              <div class="line">
                <span class="seq"><Icon name="rows" size="s" /></span>
                <span class="line-main"><span class="line-title">{r.name}</span></span>
                <span class="line-amount"><span class="means">{copy.levelMeans[r.level] ?? r.level}</span></span>
                <span class="line-when">
                  {#if r.slug === boot().index.slug}{copy.thisOne}{/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'agents'}
      <!--
        `12 §6.1`, and the sentence that decides the shape of this list: "ONE ROW, TWO LIVES:
        pending → approved → active." A machine asks, you approve on a device you are already
        holding, and the same row becomes the grant. "The code is not the security. What the code
        proves is that the approver is looking at the device that asked."

        AND A DENIED ROW IS KEPT. `12 §6.1` calls *"I said no to a request I did not make"* the
        single most important line this table can produce — a denial that leaves no trace is a
        break-in attempt nobody can see afterwards.
      -->
      <!-- THE COUNT IS THE ROWS BENEATH IT. This counted only the ACTIVE machines and then drew all
           four — 2 over a list of four — which is the one `Section` in the product whose number and
           list disagreed, on the screen where "how many machines can act as me" is the whole
           question. A pending request and a denial are rows you are meant to see; if the heading is
           to say `active`, it has to say so in the heading. -->
      <Section title={copy.connected} count={DEVICES.length}>
        <p class="hint">{copy.connectedHow}</p>
        <!-- A DESIGNED EMPTY, NOT AN EMPTY `<ul>`. Four of the twelve areas rendered a heading, a
             `0`, one sentence and nothing at all — and this is one of the two where `13 §5.2`'s
             copyable agent prompt is most obviously the right thing, because the way a machine gets
             here is a command somebody runs on it. -->
        {#if DEVICES.length === 0}
          <Empty kind="no-data-yet" title={copy.noDevices} body={copy.noDevicesWhy} agentPrompt={copy.enrollPrompt} />
        {/if}
<ul class="whos">
          {#each DEVICES as d}
            <li class="who" data-intent={d.state === 'denied' ? 'bad' : d.state === 'pending' ? 'warn' : undefined}>
              <div class="who-head">
                {#if d.state === 'denied' || d.state === 'pending'}
                  <span class="glyph" role="img" aria-label={d.state === 'denied' ? TONES.bad.label : TONES.warn.label}
                    >{d.state === 'denied' ? TONES.bad.glyph : TONES.warn.glyph}</span>
                {:else}<Icon name="session" size="s" />{/if}
                <span class="who-name">{d.name}</span>
                <span class="who-detail">
                  {copy.deviceState[d.state]} · {copy.overSurface(d.surface)} ·
                  {d.lastSeen ? copy.usedWhen(relative(d.lastSeen, NOW)) : copy.askedWhen(relative(d.at, NOW))}
                </span>
                <span class="who-do">
                  {#if d.state === 'pending'}
                    <Button
                      weight="primary"
                      onclick={() => toasts.push(copy.notWritten(`Approving asks for the six-digit code ${d.name} is showing, so you are looking at the device that asked`), { intent: 'warn' })}
                    >{copy.approve}</Button>
                    <Button
                      weight="bare"
                      tone="bad"
                      onclick={() => toasts.push(copy.notWritten('The request would be denied, and the denial kept'), { intent: 'bad' })}
                    >{copy.deny}</Button>
                  {:else if d.state === 'active'}
                    <Button
                      weight="bare"
                      tone="bad"
                      onclick={() => toasts.push(copy.notWritten(`${d.name} would stop being able to act as you`), { intent: 'bad' })}
                    >{copy.revoke}</Button>
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'ingest'}
      <!--
        `25 §9` DRAWS THIS SCREEN, which makes it the one settings area where inventing a control is
        least excusable. Three status words, a last-run line, a next-run line, a failure line naming
        the credential by its VAULT LABEL rather than its value, and two buttons on the paused row
        only. `47 §12` gives the composition: one row per connector, from `PullResult` via the
        receipts and the schedule row.
      -->
      <Section title={copy.sources} count={SOURCES.length}>
        <p class="hint">{copy.sourcesHow}</p>
        <!-- AND THE HINT ABOVE IS ABOUT MEMBERS OF THIS SET. "A figure fed by one of these shows a
             gap…" is a sentence about connectors, on a screen with none — so the state has to say
             there are none before that line makes sense. -->
        {#if SOURCES.length === 0}
          <Empty kind="no-data-yet" title={copy.noSources} body={copy.noSourcesWhy} agentPrompt={copy.ingestPrompt} />
        {/if}
<ul class="whos">
          {#each SOURCES as src}
            <li class="who" data-intent={src.state === 'ok' ? undefined : src.state === 'paused' ? 'bad' : 'warn'}>
              <div class="who-head">
                {#if src.state === 'ok'}<Icon name="inbox" size="s" />
                {:else}
                  {@const t = src.state === 'paused' ? 'bad' : 'warn'}
                  <span class="glyph" role="img" aria-label={TONES[t].label}>{TONES[t].glyph}</span>
                {/if}
                <span class="who-name">{src.name}</span>
                <span class="who-detail">
                  {copy.sourceState[src.state]} · {copy.lastRan(relative(src.lastAt, NOW))} ·
                  {src.nextAt ? copy.nextRun(relative(src.nextAt, NOW)) : copy.noNextRun} ·
                  {copy.pointsIn(src.points)}
                </span>
                <span class="who-do">
                  {#if src.state === 'paused'}
                    <Button
                      weight="primary"
                      onclick={() => toasts.push(copy.notWritten(`${src.error?.credential ?? src.name} would be reconnected, and the schedule started again`), { intent: 'warn' })}
                    >{copy.reconnect}</Button>
                    <Button
                      weight="bare"
                      onclick={() => toasts.push(copy.notWritten(`${src.name} would run once, now`), { intent: 'warn' })}
                    >{copy.retryNow}</Button>
                  {/if}
                </span>
              </div>
              <!-- THE SERVER'S `fix` SENTENCE, VERBATIM (13 §6), ON ITS OWN LINE SO IT WRAPS.
                   In the five-column ledger it was a `.line-detail` — one line, `overflow: hidden`,
                   ellipsis — so the sentence that says what to DO about a broken connector read
                   "Reconnect the credential — the provider rejected it; the connector is…". A `fix`
                   rendered verbatim and then cut is not rendered verbatim.

                   And the credential by the LABEL the vault indexes it under. A pull failure names
                   what to reconnect; naming the value would put a secret on a settings screen. -->
              <!-- THE CREDENTIAL NAMES WHAT TO RECONNECT, WHICH ONLY AN AUTH FAILURE HAS. The
                   suffix was unconditional, so a 429 read "The provider answered 429 three times.
                   It retries on its own. — Kestrel ingest" and pointed the reader at a credential
                   that is fine. `25 §9`'s own drawn mock names one on exactly one row — the 401 —
                   and gives the failing row its try count instead. It is right for
                   `PULL_AUTH_REJECTED` and wrong for the other six codes in the family. -->
              {#if src.error}
                <p class="who-why">
                  {src.error.fix}{#if src.error.code === 'PULL_AUTH_REJECTED'}{' — '}{src.error.credential}{/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
        <!-- `25 §9`'s own blockquote, and it outranks the screen: "every chart fed by a stale series
             shows a gap and a stale badge. A dashboard that keeps yesterday's number on screen as if
             it were today's is the failure that actually costs somebody money." -->
        <p class="hint">{copy.staleShows}</p>
      </Section>
    {:else if area === 'notifications'}
      <!--
        `09` SPECIFIES A COMPLETE MECHANISM WITH ZERO USER-CONFIGURABLE SETTINGS. Every constant is
        hard-coded, digests are pack declarations, no kernel table holds a preference and none of the
        sixty-four methods writes one. So this screen REPORTS rather than offers — and a row of
        toggles here would be four controls that write nothing, which is the failure this whole
        session has been removing.

        Muting is turned off at the source: edit or retire the rule that raises it.
      -->
      <Section title={copy.whenWeInterrupt}>
        <p class="hint">{copy.batchByDefault}</p>
        <ul class="facts">
          <li><span class="fact-key">{copy.quietHours}</span><span class="fact-value">{copy.quietHoursAre}</span></li>
          <li><span class="fact-key">{copy.urgentKinds}</span><span class="fact-value">{copy.urgentKindsAre}</span></li>
          <li><span class="fact-key">{copy.interruptCap}</span><span class="fact-value">{copy.interruptCapIs}</span></li>
          <li><span class="fact-key">{copy.unreadCount}</span><span class="fact-value">{copy.unreadCountIs}</span></li>
        </ul>
        <p class="hint">{copy.muteAtSource}</p>
      </Section>
    {:else if area === 'backups'}
      <!--
        `53 §5.4`: "Three mechanisms, one contract: nightly, sealed, thirty kept, restorable." And
        `03 §6` on why this is not the Export area: "A snapshot is not an export: it is a full copy
        … disaster recovery, not portability."
      -->
      <Section title={copy.kept} count={SNAPSHOTS.length}>
        <!-- "The 30 newest are kept" IS A SENTENCE ABOUT A LIST THAT HAS SOME. On a record whose
             first backup has not run it describes a policy over nothing, above nothing. -->
        {#if SNAPSHOTS.length === 0}
          <Empty kind="no-data-yet" title={copy.noSnapshots} body={copy.noSnapshotsWhy} />
        {:else}
        <p class="hint">{copy.keptHow(SNAPSHOTS_KEPT)}</p>
        {/if}
        <ul class="ledger">
          {#each SNAPSHOTS as snap}
            <li>
              <div class="line">
                <span class="seq"><Icon name="archive" size="s" /></span>
                <span class="line-main">
                  <span class="line-title">{snap.id}</span>
                  <span class="line-detail">{relative(snap.at, NOW)}</span>
                </span>
                <span class="line-amount"><span class="means">{copy.rowsAndSize(snap.rows, size(snap.bytes))}</span></span>
                <span class="line-when"></span>
              </div>
            </li>
          {/each}
        </ul>
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() => toasts.push(copy.notWritten('A sealed copy of the whole record would be written now, and counted against the thirty'), { intent: 'warn' })}
          >{copy.snapshotNow}</Button>
        </div>
      </Section>

      <!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
           SEPARATELY — Settings → backups says so in one line." A snapshot sealed with a key that
           is only inside the snapshot is a snapshot nobody can open. -->
      <Section title={copy.theKey}>
        <p class="hint">{copy.theKeyIs}</p>
      </Section>

      <!-- `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host
           "has no PITR and does not serve `restore`". So the fact is stated where somebody would go
           looking for the control, rather than the control being drawn and then refusing. -->
      <Section title={copy.restore}>
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.restoreSelfHost : copy.restoreCloud}</p>
      </Section>
    {:else if area === 'billing'}
      <!--
        THERE IS NOTHING TO BILL ON A SELF-HOST, and `23 §8`'s precedent for exactly this shape is
        "one line in Settings". `53 §5.10` puts the whole ladder "in the Worker and nothing in the
        record, so the record package stays billing-agnostic"; `33 §10` holds the state in the Cloud
        Directory. The area cannot simply be removed — `50 §2.2` admits the twelve of `19 §2` with
        no per-deployment conditional and `50 §13 D2` builds one artefact for both hosts — so it
        says which deployment this is and what that means.

        `ADR-059`'s line is here because it is the promise the whole product rests on and it is TRUE
        on a self-host in the strongest possible way: "At no point is export withheld."
      -->
      <Section title={copy.billing}>
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.billingSelfHost : copy.billingCloud}</p>
        <div class="row-actions">
          <Button weight="quiet" href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
        </div>
      </Section>
    {:else if area === 'export'}
      <Section title={copy.yourData}>
        <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
             product's central promise: take your record and go. They say what they would do.

             AND ONE OF THEM DESCRIBED THE WRONG FILE. It read "written to a .dog file, LINE PER
             ROW", which welds together the two containers `03 §2.1` keeps in separate columns: a
             `.dog` is a SQLite database you open with `sqlite3` and no SDK, and a `.dogl` is the
             canonical logical dump — one JSON row per line — that the record streams out of a
             Durable Object in pages. Both are signed over the same manifest, which is why `verify`
             and `import` take either; they are not the same artefact and the sentence made `.dog`
             sound like a text format. -->
        <p class="hint">{copy.exportWhat}</p>
        <div class="row-actions">
          <Button
            onclick={() =>
              toasts.push(copy.notWritten('The whole record would be written to one .dog file — a SQLite database you can open with sqlite3'))}
          >{copy.export}</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('A .dog or .dogl file would be checked against its own manifest and signature'))}
          >{copy.verifyFile}</Button>
        </div>
      </Section>

      <!-- AND THE SLICE, WHICH IS A DIFFERENT FILE FOR A DIFFERENT JOB.

           `03 §1`: the three layers are addressable independently, and that is what makes the useful
           operations cheap — "export data without origin (a clean handover), export origin without
           data (an audit), export governance alone (share a way of working — THAT IS A PACK)."

           The screen offered one button for the whole record and nothing for the other three, so the
           only exit this product appeared to have was all-or-nothing. A pack is the readable-text
           half: your lists, pages, metrics and rules without a single row of your business in it. -->
      <Section title={copy.takeAway}>
        <p class="hint">{copy.takeAwayWhat}</p>
        <div class="row-actions">
          <Button
            weight="quiet"
            onclick={() =>
              toasts.push(copy.notWritten('Your lists, pages, metrics and rules would be written as one readable pack, with none of your rows in it'))}
          >{copy.exportPack}</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('The rows would be written without where each one came from — a clean handover'))}
          >{copy.exportRows}</Button>
        </div>
      </Section>
      <!-- `Danger` IS A ONE-WORD HEADING THAT STATES NO FACT, over a line saying `Delete this
           record` over a button saying `Delete the studio` — three lines, two of them the same
           sentence, and the two disagreeing about what the record is called. One sentence saying
           what happens, and the button that does it. -->
      <Section title={copy.deleteRecord(RECORD)}>
        <div class="danger">
          <p class="danger-title">{copy.deleteWhat(RECORD)}</p>
          <Button
            tone="bad"
            onclick={() => toasts.push(copy.notWritten('Deleting a record asks you to type its name first'), { intent: 'bad' })}
            >{copy.deleteRecord(RECORD)}</Button
          >
        </div>
      </Section>
    {/if}

    <!-- AND WITHOUT THE TALLY. "8 packs, 8 lists" welded a count nobody can act on to a sentence
         about the build, on all twelve areas. Both numbers are on the screens that own them. -->
    <p class="mock">{copy.mockNotice}</p>
  </div>
</div>
{/if}

<style>
  /* The refusal stands alone, with the area rail gone: there is no area to be in. */
  .gone {
    padding: var(--sp-6) var(--sp-5);
  }

  /* A short list of stated facts, for the three areas that REPORT rather than offer. Two columns so
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

    .facts li {
      display: block;
      margin-block-end: var(--sp-2);
    }
  }

  .whos {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .who-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .who-name {
    color: var(--ink);
    font-weight: 600;
  }

  /* IT TAKES THE SLACK AND GIVES IT BACK. `1 1 24ch` rather than a fixed width: on a wide screen the
     address and the date sit on the name's line, and below about 520px the whole clause wraps
     instead of truncating an email address in the middle, which is where they stop being
     recognisable. */
  .who-detail {
    flex: 1 1 24ch;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The controls sit at the end of the head line and never shrink: a button that wraps its own
     label is a button somebody reads twice. */
  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The same bar a toned row wears in a grid, on the block that replaced it. */
  .who[data-intent] {
    border-inline-start: 2px solid var(--tone);
  }

  .who-level {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .means {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The ladder is five words, so its buttons are the narrowest segment in the product. */
  .segment-sm .seg {
    padding-inline: var(--sp-2);
    font-size: var(--t-sm);
  }

  .shell {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .areas {
    display: flex;
    flex-direction: column;
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The same row as the rail's, because it IS the same thing: a vertical list of places, one of
     which you are in. It read as a different control entirely — a grey box where the rail uses the
     accent — which teaches that "here" looks like two things. */
  /* AND THE ROWS ARE TARGETS. `min-block-size: 32px` with no pointer query — they measured 67px
     only because "People & sharing" wraps to two lines and stretches its siblings. */
  .area {
    min-block-size: var(--ctl-h);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .area:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .area[aria-current='page'] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-width: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A SWATCH IS THE COLOUR, and the tick is drawn ON it rather than beside it: a selected state
     that lives outside the thing selected is a state people read as belonging to the next one. */
  .swatch {
    display: grid;
    place-items: center;
    min-width: var(--tap);
    height: var(--tap);
    padding: 0 var(--sp-2);
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch-off {
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    padding-inline-start: var(--sp-4);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .segment {
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  /* `--ctl-h`, LIKE EVERY OTHER CONTROL. Nine of these on `/settings/appearance` were 28px tall on
     a phone — the screen whose own Text and Density controls are about making things easier to
     use. `05 §6`: density follows the pointer, never the width. */
  .seg {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--dim);
    font-size: var(--t-ui);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .seg:hover {
    color: var(--ink2);
  }

  .seg[data-on] {
    background: var(--s2);
    box-shadow: var(--raise);
    color: var(--ink);
  }



  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. At 320 "Export the rows only" ended at x=406 in a 320px screen. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .danger {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line));
    border-radius: var(--r-md);
  }

  .danger-title {
    color: var(--danger);
    font-weight: 500;
  }

  .danger :global(.btn) {
    margin-block-start: var(--sp-3);
  }

  .mock {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .areas {
      position: static;
      flex-direction: row;
      overflow-x: auto;
    }
  }
</style>
