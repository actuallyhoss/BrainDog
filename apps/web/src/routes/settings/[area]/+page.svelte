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
  import { AUTH_METHODS, NOW, PACKS, PAGES, PASSKEYS, PEOPLE_ACCESS, REGISTERS, boot, pages } from '$lib/record/api.ts';
  import { LEVELS, type Level, type Person } from '$lib/record/schema.ts';
  import { relative } from 'braindog-render';

  /* THE RECORD'S OWN NAME. The Danger section named it two ways in three lines — `this record` and
     `the studio` — and one of the two was a literal. */
  const RECORD = boot().index.name;
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

  function promote(decl: PageDecl) {
    toasts.push(copy.notWritten(`${decl.title} would be placed at the end of its section in your nav`), { intent: 'warn' });
  }
</script>

<svelte:head><title>{titleOf(area.replace(/^./, (c) => c.toUpperCase()), copy.settings)}</title></svelte:head>

<PageHead icon="settings" kicker={copy.settings} title={area.replace(/^./, (c) => c.toUpperCase())} />

<div class="shell">
  <nav class="areas" aria-label={copy.settings}>
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
                <Button
                  weight="bare"
                  tone="bad"
                  disabled={lastOwner(p)}
                  aria-describedby={lastOwner(p) ? 'last-owner' : undefined}
                  onclick={() =>
                    toasts.push(
                      copy.notWritten(`Every one of ${p.name}'s access rows would be removed, with one access.revoke per list`),
                      { intent: 'bad' },
                    )}
                >{copy.removeAccess}</Button>
              </div>
              <div class="who-level">
                <div class="segment segment-sm" role="group" aria-label={copy.levelFor(p.name)}>
                  {#each LEVELS as level}
                    <button
                      type="button"
                      class="seg"
                      data-on={p.level === level ? '' : undefined}
                      aria-pressed={p.level === level ? 'true' : 'false'}
                      disabled={lastOwner(p) && level !== 'owner'}
                      aria-describedby={lastOwner(p) && level !== 'owner' ? 'last-owner' : undefined}
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
          <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy} />
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
    {:else if area === 'export'}
      <Section title="Your data">
        <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
             product's central promise: take your record and go. They say what they would do. -->
        <div class="row-actions">
          <Button
            onclick={() =>
              toasts.push(copy.notWritten('The whole record would be written to a .dog file, line per row'))}
          >Export the record</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('A .dog file would be checked against its own manifest and signature'))}
          >{copy.verifyFile}</Button>
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
    {:else}
      <Section title={area.replace(/^./, (c) => c.toUpperCase())}>
        <Empty
          kind="no-data-yet"
          title="Nothing configured yet."
          body="This area is part of the shell and is not wired in the mock-up."
        />
      </Section>
    {/if}

    <p class="mock">{copy.mockNotice} {PACKS.length} packs, {Object.keys(REGISTERS).length} lists.</p>
  </div>
</div>

<style>
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
  .area {
    min-block-size: 32px;
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

  .seg {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 28px;
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



  .row-actions {
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
