<!--
  The front door. `/signin`.

  WHY THIS ADDRESS AND NOT `/in`, WHICH IS WHAT WAS SUGGESTED. The `/in` prefix is not free: `12 §3`
  gives the inbound webhook the URL `/in/webhook/<rec_id>/<ingest-id>/<token>`,
  `apps/selfhost/src/main.ts` forwards inbound email to `/in/email/<token>`, and
  `apps/worker/src/route.ts` lists everything under `/in` among the paths that "belong to this
  Worker in the document" and are not built yet. `19 §5` settles what
  happens then: the hosts hold no path list, everything that is not the Worker's reaches the shell —
  so a screen at `/in` works in `vite dev` and stops existing the day the prefix it borrowed is
  claimed. A route that is correct until somebody builds a specified feature is the same defect as a
  button that does nothing, one release later.

  AND THE SPINE'S OWN HABIT DECIDES THE WORD. Every native screen in `19 §2` is addressed by one
  lower-case word that is the job: `/decide`, `/inbox`, `/search`, `/vault`, `/packs`, `/audit`,
  `/start`. A short prefix is reserved for a FAMILY addressed by an id — `/r/`, `/v/`, `/p/`, `/s/`,
  `/t/` — and this screen is not one of those. `/in` is a preposition, which `19 §9`'s rule refuses:
  the interface says the word a person would say, and `33 §4`'s own auth table heads its row
  **Sign in**.

  IT DRAWS ONE DOOR BECAUSE THERE IS ONE. `12 §3` makes a passkey primary with an email link behind
  it, and a grep for the four routes it names — `POST /auth/magic`, `GET /auth/magic/<token>`,
  `POST /auth/passkey/register`, `POST /auth/passkey/assert` — finds them in the documents and in no
  server. `23 §3.1` is the rule for that state: not there, not greyed out. So there is no passkey
  button on this screen, and `copy.waysIn` is what stands where one would be.

  AND IT STOOD FIRST, WHICH IS WHAT CHANGED. It was the sentence under the slogan, so a business
  opening this screen was told its way in "is not built yet" before it saw a field, and the token's
  hint beside the field named an environment variable, `BRAINDOG_TOKEN`: 92 words at 390, most of
  them to whoever runs the server. Both sentences are still here, word for word, behind "Running your
  own server?" at the foot of the screen, and it opens on the slogan, the two fields and the one
  button. Nothing about the mechanism moved: the same connection, the same two fields, no passkey.

  AND IT DOES NOT SWITCH THE APP OVER. Signing in and reading live data are two pieces of work; this
  one ends at "the record answered, and here is what it said". `copy.reachedNotSwitched` says so on
  screen, because a screen that navigated Home after a successful connection would be claiming the
  other half.
-->
<script lang="ts">
  import { tick } from 'svelte';

  import { day as fmtDay } from 'braindog-render';

  import { copy } from '$lib/copy.ts';
  import { attempt, type Attempt, type Connection } from '$lib/connect.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';

  /**
   * THE CONNECTION, HELD HERE AND NOWHERE ELSE.
   *
   * `lib/connect.ts` carries the argument in full: `50 §1` says the app never holds a bearer,
   * `12 §3`'s browser credential is an `HttpOnly` cookie that script cannot read, and `bd_pref` is
   * the one cookie this product deliberately made script-readable. So there is no store to write
   * to and none is written: the value is component state, it goes into one header, and it dies with
   * the tab. `copy.tokenKept` says that to the person typing it.
   *
   * AND NOT IN THE URL EITHER. `19 §5`'s last row puts unsaved text in component state, and
   * `/vault`'s rule beside it is the nearest precedent for a credential-adjacent screen: it carries
   * nothing in its query, ever, because an address is an entry in history and in URL autocomplete.
   */
  let held = $state<Connection>({ base: origin(), token: '' });

  /** The token's own control. Two full literals for its two states, per `copy.ts`'s own rule. */
  let shown = $state(false);

  /** What the last press answered, or `null` before the first one. */
  let said = $state<Attempt | null>(null);

  /** True while a call is out, so the button says what it is doing rather than looking dead. */
  let reaching = $state(false);

  /** The answer's own element, so a phone can be shown the thing it just asked for. */
  let answer = $state<HTMLDivElement | undefined>(undefined);

  /**
   * THE HOUSE SENTENCE IS ALREADY TWO PARTS, AND `Empty` IS ALREADY TWO SLOTS.
   *
   * `copy.ts`'s first rule is *what was wrong · where · what to do*, and every refusal in `30 §6`
   * is written as one sentence of the first and one of the second. `Empty`'s `title` is set in the
   * display face at `--t-lg`, which is a short phrase; handing it the whole paragraph put four
   * lines of large red type where the component expects a heading, and buried the repair inside
   * it. Split at the first full stop and the two halves land in the two slots they were written
   * for, with no second copy of either sentence anywhere.
   */
  function halves(fix: string): [string, string] {
    const cut = fix.indexOf('. ');
    return cut < 0 ? [fix, ''] : [fix.slice(0, cut + 1), fix.slice(cut + 2)];
  }

  /**
   * THE ADDRESS THIS PAGE CAME FROM, WHICH IS THE ONLY ONE THAT CAN WORK TODAY.
   *
   * Both hosts serve this app and answer `/api/*` from the same origin — `50 §2.1`, `51 §7`,
   * `22 §9` — and neither sends a header letting a browser read it from anywhere else. So the
   * record that served this page is the sensible default and any other guess is a guess about
   * somebody else's machine. `copy.addressLike` is the placeholder for when the field is cleared,
   * which is the shape rather than a value.
   */
  function origin(): string {
    const here = (globalThis as { location?: { origin?: string } }).location;
    return typeof here?.origin === 'string' ? here.origin : '';
  }

  async function open(event: SubmitEvent) {
    event.preventDefault();
    if (reaching) return;
    reaching = true;
    /* THE READINESS CONTRACT, AND THIS IS THE FIRST SCREEN IN THE APP THAT ACTUALLY FETCHES.
       `screen.svelte.ts`: a call still out takes `data-screen` away, so a browser gate never
       measures this page mid-flight. */
    opened();
    said = null;
    try {
      said = await attempt(held.base, held.token ?? '');
    } finally {
      /**
       * `true`, AND THE ARGUMENT IS THE ONE `screen.svelte.ts` MAKES ABOUT LATCHING.
       *
       * `closed(false)` sets a flag nothing but a navigation clears, which is right for a screen
       * that fetches once and wrong for the one screen in the product built to be retried: a wrong
       * token followed by a right one would leave `data-screen="refused"` over a success. The
       * refusal is carried by the `Empty` below instead, which increments on mount and decrements
       * on destroy — "a count retracts itself", in that file's own words. And it is not a lie about
       * the call: `attempt` never throws, so every press comes back with a value.
       */
      closed(true);
      reaching = false;
    }
    /* AND IT IS SHOWN THE ANSWER. At 390 the card lands below the fold, so the press produced a
       result the reader could not see: the same silence as a control that did nothing, arrived at
       from the other direction. `block: 'nearest'` scrolls the least that makes it visible and
       does nothing at all when it already is. */
    await tick();
    answer?.scrollIntoView({ block: 'nearest' });
  }

  /* This screen computes its shell synchronously and says so, exactly as `/start` does. While a
     call is out the line above takes the claim back, without this line being conditional. */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.signIn)}</title></svelte:head>

<div class="in">
  <div class="frame">
    <header class="head">
      <Mark height={34} />
      <span class="wordmark">{copy.product}</span>
    </header>

    <!-- The slogan, and it is the same five words the README and the marketing site lead with. -->
    <h1 class="lede">{copy.tagline}</h1>

    <h2 class="question">{copy.signIn}</h2>

    <form class="form" onsubmit={open}>
      <div class="pair">
        <label class="lbl" for="in-base">{copy.recordAddress}</label>
        <span class="field field-lg">
          <input
            id="in-base"
            class="field-input"
            type="url"
            inputmode="url"
            autocomplete="url"
            spellcheck="false"
            autocapitalize="none"
            autocorrect="off"
            placeholder={copy.addressLike}
            bind:value={held.base}
          />
        </span>
      </div>

      <div class="pair">
        <label class="lbl" for="in-token">{copy.accessToken}</label>
        <span class="field field-lg">
          <!-- `value` AND `oninput` RATHER THAN `bind:value`, because the type is what the show
               control changes and a two-way binding on an input with a dynamic type is not legal.
               `current-password` is what a password manager fills; the field is a password field
               whatever the toggle is showing. -->
          <input
            id="in-token"
            class="field-input"
            type={shown ? 'text' : 'password'}
            autocomplete="current-password"
            spellcheck="false"
            autocapitalize="none"
            autocorrect="off"
            aria-describedby="in-token-why in-token-kept"
            value={held.token ?? ''}
            oninput={(e) => (held.token = e.currentTarget.value)}
          />
          <!-- A REAL CONTROL WITH A WORD ON IT. An eye glyph alone is two states drawn as one
               picture, and `13 §2.3` rule 1 is that nothing carries meaning by appearance alone. -->
          <button
            type="button"
            class="peek tap"
            aria-pressed={shown}
            onclick={() => (shown = !shown)}
          >
            <Icon name="eye" size="s" />{shown ? copy.hideToken : copy.showToken}
          </button>
        </span>
      </div>

      <p class="hint" id="in-token-kept">{copy.tokenKept}</p>

      <div class="actions">
        <Button weight="primary" type="submit" disabled={reaching}>
          {reaching ? copy.reachingTheRecord : copy.openTheRecord}
        </Button>
      </div>
    </form>

    <!--
      THE ANSWER, UNDER THE BUTTON THAT ASKED FOR IT, AND IT IS ONE OF FIVE.

      A refusal takes the product's own refusal treatment — `Empty kind="error"`, the same component
      `/p/[slug]`, `/v/[view]`, `/r/[register]` and `+error.svelte` use — carrying the record's own
      sentence rather than one of this screen's. There is no request id to quote: `50 §13 D11`
      reserves that for a call the host logged, and four of these five never reached one.
    -->
    {#if said && said.kind !== 'reached'}
      {@const [what, todo] = halves(said.refusal.fix)}
      <div class="answer" bind:this={answer}>
        <Empty kind="error" title={what} body={[todo, said.also].filter(Boolean).join(' ') || undefined} />
      </div>
    {:else if said}
      <div class="answer kept" role="status" bind:this={answer}>
        <p class="kept-what">{said.credentialed ? copy.reachedWithToken : copy.reachedWithNone}</p>
        <p class="kept-why">{copy.reachedHolds(said.registers, said.rows)}</p>
        <p class="kept-why">{copy.reachedDay(fmtDay(said.now.slice(0, 10)))}</p>
        <p class="kept-why">{copy.reachedNotSwitched}</p>
        <div class="actions">
          <Button href="/">{copy.openTheDemo}</Button>
        </div>
      </div>
    {/if}

    <!-- THE WAY IN THAT NEEDS NOTHING, AND IT IS NOT A CONSOLATION PRIZE. The marketing site's own
         line is that there is no sign-up and no billing, so a door that implied an account would
         contradict the page somebody arrived from. It goes when there is an answer above it: by
         then the reader has one, and a footnote about not needing to sign in is noise under it. -->
    {#if said?.kind !== 'reached'}
      <p class="aside">
        {copy.demoNeedsNothing}
        <!-- `.tap` because 17px of underlined text is a 17px target, and `Empty`'s own inline
             control takes the same class for the same reason. -->
        <a class="aside-go tap" href="/">{copy.openTheDemo}</a>
      </p>
    {/if}

    <!-- THE OPERATOR'S HALF, and it is last because it is for the fewest readers. `in-token-why` is
         still the token field's description: a `<details>` that is closed keeps its content in the
         document, so a screen reader on the field hears it whether or not this is open. -->
    <details class="own">
      <summary class="own-q"><Icon name="chevronDown" size="s" />{copy.ownServer}</summary>
      <p class="hint">{copy.waysIn}</p>
      <p class="hint" id="in-token-why">{copy.tokenMayBeEmpty}</p>
    </details>
  </div>
</div>

<style>
  /* `minmax(0, …)` and not `place-items: center`, for the reason `/start` records: a centred grid
     item sizes its track to `max-content`, and one unbreakable string in the answer below is wider
     than a phone. This is the same container as the other full-bleed screen because it should not
     look like a different application. */
  .in {
    display: grid;
    grid-template-columns: minmax(0, min(520px, 100%));
    justify-content: center;
    /* `safe`, WHICH `/start` HAS NOT GOT AND WANTS. Centred content that outgrows its container is
       distributed negative free space, so the top of it goes above the scroll origin and cannot be
       reached: with an answer drawn at 390 the mark sat 12px from the edge inside 24px of padding,
       and the twelve missing pixels were unreachable rather than absent. `safe` falls back to
       start-alignment at exactly the point centring starts costing something. */
    align-content: safe center;
    min-block-size: 100dvh;
    padding: var(--sp-5);
  }

  .frame {
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-block-end: var(--sp-7);
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  .lede {
    max-inline-size: 22ch;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: var(--lh-tight);
  }

  /* The eyebrow over the form, at the same rank `/start` gives its question. */
  .question {
    margin-block: var(--sp-7) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .pair {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* `RowForm`'s own label, in the two weights it uses, because a field on this screen and a field
     in a register drawer are one control and must not be two. */
  .lbl {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* THE TOKEN IS NOT A PROPORTIONAL STRING. It is 43 characters of base64url and a reader checking
     it against a terminal is comparing glyph for glyph, which is what `--font-id` is for. */
  .field-lg .field-input#in-token {
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /* 44 on both axes on a coarse pointer, and `.tap` supplies the invisible half of it — a word and
     a 12px glyph inside a 36px control is a 36px target without it. */
  .peek {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .peek:hover {
    color: var(--ink);
  }

  .hint {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.5;
    max-inline-size: 54ch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .answer {
    margin-block-start: var(--sp-5);
  }

  /* The same treatment `/start` gives its outcome: a hairline above it and nothing else. A tinted
     panel would make a plain report read as an alarm, and reaching a record is not one. */
  .kept {
    display: grid;
    gap: var(--sp-2);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--edge);
  }

  .kept-what {
    color: var(--ink);
    font-weight: 600;
  }

  .kept-why {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
    max-inline-size: 52ch;
  }

  .aside {
    margin-block-start: var(--sp-6);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* A question in the control's own weight rather than a link, because it opens something here
     rather than going somewhere. `--ctl-h` is 44 under a coarse pointer, so the whole row is the
     target, and the chevron turns the way the inbox's does. */
  .own {
    margin-block-start: var(--sp-5);
  }

  .own-q {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
  }

  .own-q::-webkit-details-marker {
    display: none;
  }

  .own-q:hover {
    color: var(--ink);
  }

  .own-q :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .own[open] .own-q :global(svg) {
    transform: rotate(180deg);
  }

  .own .hint + .hint {
    margin-block-start: var(--sp-2);
  }

  /* The link moves to the next line whole. It broke across two — "Open the demo / record" — which
     reads as two links and is the one thing on this line somebody has to be able to see at once. */
  .aside-go {
    /* `.tap`'s invisible box needs a positioned element, and an inline one takes `relative` fine. */
    display: inline-block;
    color: var(--accent-text);
    white-space: nowrap;
  }
</style>
