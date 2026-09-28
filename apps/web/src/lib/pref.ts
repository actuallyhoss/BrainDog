/**
 * What this person prefers, kept where the shell can read it before it paints.
 *
 * A COOKIE AND NOT `localStorage`, and that is the whole reason this file exists. The app is a
 * STATIC shell — there is no server to write `data-scheme` onto the `<html>` element — so the
 * fourteen bytes of script in `app.html` read this cookie and set the attributes before first
 * paint. `localStorage` is not readable from a synchronous inline script early enough to beat the
 * first frame, so a dark-mode user would see a white flash on every navigation.
 *
 * NOTHING WROTE IT. The parser in `app.html` has been correct since it was written and every
 * preference in this product was lost on refresh: scheme, text size, density, the rail's state,
 * whether bare character keys act. A setting that does not survive a reload is a setting somebody
 * changes once and then stops trusting.
 *
 * IT IS PER DEVICE, NOT PER RECORD. Text size and density are facts about the screen somebody is
 * looking at — a phone and a desk want different answers — so they belong beside the browser rather
 * than in the record, which is also why losing them costs nothing but is annoying every day.
 */

export type Pref = {
  scheme?: 'light' | 'dark' | undefined;
  text?: 'sm' | 'base' | 'md' | undefined;
  density?: 'compact' | 'comfortable' | 'roomy' | undefined;
  /**
   * A record's own accent, once a record has one.
   *
   * IT IS NOT AN ATTRIBUTE. `accent.ts` builds a whole palette from it and adopts a stylesheet, so
   * the value is read by JavaScript and by nothing else. `app.html` used to stamp it onto
   * `data-theme` before first paint, which bought nothing (there is no CSS rule anywhere that reads
   * a `data-theme` other than `hc`) and cost the high-contrast palette its own attribute.
   */
  theme?: string | undefined;
  /**
   * The high-contrast palette, which shipped and was unreachable.
   *
   * `packages/theme` solves it against a higher floor, `theme.mjs` writes it into `house.css` behind
   * `html[data-theme='hc']`, and `--check` byte-compares it on every build. Nothing in
   * `apps/web/src` ever set that attribute to `hc`. So a whole generated palette, validated by
   * sixteen checks, could not be turned on by the person it is for.
   *
   * WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings, and the one that was
   * written was the one nothing read.
   */
  contrast?: boolean | undefined;
  /**
   * `false` collapses the rail to its glyphs. `undefined` is open, which is what a first visit
   * should be.
   *
   * IT USED TO TAKE THE WHOLE RAIL AWAY, and that is not what anybody means by collapsed. `⌘\`
   * removed every row of navigation and left one button in an empty gutter: a sweep of `/vault` in
   * that state returned six visible controls and all six were *Reveal once*. The record switcher,
   * the spine and the lists were then reachable only from a chord or the palette, and this
   * preference persists, so a chord pressed by accident survived the reload.
   *
   * SO IT IS ONE RAIL AT TWO WIDTHS NOW. Collapsed keeps every row, every glyph, the spine and the
   * switcher, and hands the names back on hover and on focus. Nothing becomes unreachable, which is
   * what makes this a width rather than a disappearance.
   */
  sidebar?: boolean | undefined;
  /**
   * WHERE THE NAVIGATION LIVES: the rail, a top bar, or nothing but a button.
   *
   * `undefined` IS THE RAIL, which `19 §3` makes the default in bold and keeps there. The three
   * shapes are that section's own table: the rail, sectioned and arrangeable; a top bar, one
   * horizontal strip of spine then declared entries, overflowing into More and SAYING HOW MANY it
   * has put there; and the menu, no persistent nav at all, one button opening the whole sectioned
   * list as a sheet. Below 900px the tab bar stays whatever this says, because a shape choice that
   * lets somebody put an eighteen-entry top bar on a phone is a choice to break their phone.
   *
   * IT IS NOT `sidebar`, AND THE TWO ARE NOT ONE SETTING. `sidebar` is whether the rail is narrow,
   * which is a fact about the screen in front of you: a wide monitor and a laptop honestly want
   * different answers, so it stays per device where it has always been. The shape is a fact about
   * how somebody reads, and it should follow them.
   *
   * THE RECORD KEEPS IT NOW, AND THIS IS ITS FIRST-PAINT COPY. `19 §3`: *"The shape follows the person, so it is the
   * record's, not the cookie's."* The record holds it as `nav.shape` (`setPref`, answered on `boot`'s `me.prefs`), and
   * `nav-prefs.svelte.ts` writes this copy from the record's word so the shell draws the right shape before `boot`
   * answers. It is never read as the truth once the record has spoken.
   */
  navShape?: 'rail' | 'bar' | 'menu' | undefined;
  /** Whether bare letters act inside a focused grid. */
  chars?: boolean | undefined;
  /**
   * Whether the record proposes pages at all — `29 §4`'s one global switch.
   *
   * `19 §2` names it as the reason the `navigation` area exists: *"`navigation` was missing too: it
   * holds the *Suggest new pages* switch that `29 §4` places there."* `50 §4.7` has had
   * `suggestPages: boolean` in this type's specification the whole time and the type did not have it
   * — which the `prefs` gate noticed from the other side, listing it among the fields it excused
   * itself from covering while `Pref` had never held it.
   *
   * `undefined` IS ON, and no document states a default. `29 §3`'s trigger table describes them
   * firing, so on is the only reading consistent with the rest of that section — and it is a reading
   * rather than a citation, which is why it is said here rather than assumed.
   *
   * THE RECORD KEEPS IT NOW, AND THIS IS ITS FIRST-PAINT COPY. `19 §3`: *"nav order, hidden pages, pins, dismissals
   * and the *Suggest new pages* switch must survive a change of device, so none of them is a cookie."* The record holds
   * it as `pen.suggest`, and `nav-prefs.svelte.ts` writes this copy from the record's word, so a record's settings
   * screen draws the switch as it stands before `boot` answers, and the sample, which has no record, keeps it here.
   */
  suggestPages?: boolean | undefined;
  /**
   * The instant you last marked the activity feed read.
   *
   * "SINCE YOU WERE AWAY" NEVER ADVANCED. Home's feed reads a module constant and nothing anywhere
   * stored a mark, so the fifth session showed the same six items as the first — a heading making a
   * claim about the reader's own history that is the same claim for ever. `19 §6` calls this half of
   * Home the answer to *"what happened while you were not looking"*, and `copy.markAllRead` had been
   * sitting in `copy.ts` with no call site waiting for it.
   *
   * PER DEVICE, like everything else here, and that is the honest place for it: what you have looked
   * at on this screen is not a fact about the record. The real record has `member.seen_at` for the
   * account-wide version (`33 §2`'s `whatsNew` cursor), and this is the browser's half of it.
   */
  seen?: string | undefined;
  /**
   * Which columns you have hidden, per register.
   *
   * 50 §5.2 names it `prefs.columns[register]`, and the store did not exist — so untick a column,
   * press Done, reload, and it is back. The search, the filters and the sort on that same screen are
   * URL state, which is exactly why a reader expects this to hold too, and the doc comment beside
   * the control named the store it was not writing to.
   *
   * PER DEVICE, LIKE EVERYTHING ELSE HERE. Two people looking at one register may want different
   * columns and neither is editing the record.
   */
  columns?: Record<string, string[]> | undefined;
  /**
   * Your nav order, as a list of addresses.
   *
   * The rail's own header claims *"position lives in a per-user store and wins"*, and there was no
   * store: Move up reordered the list on screen and a reload put it back, silently — while `Hide`,
   * one item below it in the same menu, was honest about writing nothing.
   */
  nav?: string[] | undefined;
  /**
   * Which load-bearing nouns have already been explained to this person.
   *
   * `19 §6` requires a definition "the first time they appear on a screen … and never again", and
   * "never again" is a fact about a person rather than about a screen — so it has to outlive a
   * reload. `50 §4.7` states the preference set and has no slot for it; the URL would put "have you
   * read this" into a shareable address and component state forgets on navigation, so this is the
   * store that is left. One key, named here rather than added quietly.
   */
  defined?: string[] | undefined;
  /**
   * Which rail sections this person has folded away.
   *
   * THIRTY-FOUR ITEMS OF NAVIGATION ON EVERY SCREEN, in a nested scroller that cut one of them in
   * half at the default window size. The rail was already the reader's to reorder and to hide from
   * one row at a time, and nobody hides twenty rows one at a time.
   *
   * SECTION NAMES AND NOT IDS, because a section IS its heading: `arrange()` groups by the `section`
   * string a page declares, and there is no other handle on one. A section that is renamed comes
   * back open, which is the right answer: it is not the section that was put away.
   */
  railShut?: string[] | undefined;
};

const NAME = 'bd_pref';
/** A year. Long enough that it is never the reason something was forgotten. */
const YEAR = 60 * 60 * 24 * 365;

/**
 * THE SHAPE OF EACH SETTING, so a value of the wrong TYPE is dropped and not cast over.
 *
 * The guard below checked that the cookie parsed and that it was an object, and then cast. Every
 * reader after that believed the type: `{"defined":"row"}` threw at MODULE LOAD out of
 * `define.svelte.ts`, and `{"nav":"/x"}` threw inside the shell's own `$derived`. With `ssr = false`
 * a throw in either is a blank screen, on every route, until somebody clears a cookie they cannot
 * see, which is the one failure a preference must never be able to cause.
 *
 * A STORED VALUE IS UNTRUSTED INPUT FROM THE PAST. It was written by a build that no longer exists,
 * by a person with developer tools open, or by a version of this file with a different idea of what
 * `nav` holds. The comment two paragraphs down has said "a cookie this build cannot read is not a
 * crash" since it was written, and it was true only of the ones that fail to parse.
 *
 * ONE BAD KEY DOES NOT LOSE THE OTHERS. Somebody who has chosen a dark scheme and a compact density
 * keeps both when an older build's `nav` is dropped: this reads key by key, because the alternative
 * throws away eleven correct settings to punish one.
 */
const SHAPE: Record<string, (v: unknown) => boolean> = {
  scheme: (v) => v === 'light' || v === 'dark',
  text: (v) => v === 'sm' || v === 'base' || v === 'md',
  density: (v) => v === 'compact' || v === 'comfortable' || v === 'roomy',
  theme: (v) => typeof v === 'string',
  contrast: (v) => typeof v === 'boolean',
  sidebar: (v) => typeof v === 'boolean',
  navShape: (v) => v === 'rail' || v === 'bar' || v === 'menu',
  chars: (v) => typeof v === 'boolean',
  suggestPages: (v) => typeof v === 'boolean',
  seen: (v) => typeof v === 'string',
  nav: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  defined: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  railShut: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  columns: (v) =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((c) => Array.isArray(c) && c.every((x) => typeof x === 'string')),
};

/** What the cookie holds now, or `{}` — including when there is no document at all. */
export function read(): Pref {
  if (typeof document === 'undefined') return {};
  const raw = new RegExp(`(?:^|; )${NAME}=([^;]*)`).exec(document.cookie)?.[1];
  if (!raw) return {};
  try {
    const out: unknown = JSON.parse(decodeURIComponent(raw));
    if (!out || typeof out !== 'object' || Array.isArray(out)) return {};
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out as Record<string, unknown>))
      /* A KEY THIS BUILD DOES NOT KNOW IS KEPT, and a key it knows with the wrong type is not.
         An unknown key is a setting from a newer build sharing a browser with this one, and
         dropping it would make the two fight over the cookie every time either is opened. */
      if (!Object.hasOwn(SHAPE, key) || SHAPE[key]!(value)) kept[key] = value;
    return kept as Pref;
  } catch {
    /* A COOKIE THIS BUILD CANNOT READ IS NOT A CRASH. It is a preference from an older version, or
       one somebody edited; the default is the right answer and the next write replaces it. */
    return {};
  }
}

/**
 * Merge one change in and write it back.
 *
 * MERGED, NEVER REPLACED. Each setting is changed by its own control, and a write that carried only
 * the field it knew about would silently reset every other one — which is the shape of bug that
 * makes people think a product forgets things at random.
 */
export function write(change: Pref): Pref {
  const next = { ...read(), ...change };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete (next as Record<string, unknown>)[key];

  if (typeof document !== 'undefined')
    /* `SameSite=Lax` AND NO `Secure`, deliberately: this is read by the page's own shell and never
       sent anywhere that matters, and a `Secure` cookie is silently dropped on `http://localhost`,
       which is where a self-host is first opened. */
    document.cookie = `${NAME}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${YEAR}; samesite=lax`;

  /* NO EVENT ANY MORE. The shell once listened for every write to redraw its shape; it reads the shape from
     `nav-prefs.svelte.ts` now, whose field changes when the shape is set, so there is nobody left to tell. */

  return next;
}

/**
 * Put a preference on the document, and remember it.
 *
 * ONE FUNCTION FOR BOTH HALVES, because they were two and the second one was never written. An
 * attribute set without a cookie is a preference that lasts until the next navigation.
 */
export function apply(key: 'scheme' | 'text' | 'density', value: string | null): void {
  if (typeof document === 'undefined') return;
  if (value === null) document.documentElement.removeAttribute(`data-${key}`);
  else document.documentElement.setAttribute(`data-${key}`, value);
  write({ [key]: value ?? undefined } as Pref);
}

/**
 * The high-contrast palette, on or off.
 *
 * ITS OWN FUNCTION AND NOT A FOURTH KEY IN `apply`, because the attribute and the preference do not
 * share a name or a shape: the preference is a boolean and the attribute is the literal `hc`. Every
 * other pair above is `data-<key>` carrying the value, and pretending this one is too would mean
 * `apply('contrast', 'hc')` with the caller holding a string that means true.
 *
 * `theme` LEFT `apply` AT THE SAME TIME, and for the mirror reason: it never had an attribute worth
 * setting. `accent.ts` adopts a stylesheet, and `data-theme` is the high-contrast palette's switch.
 */
export function contrast(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.setAttribute('data-theme', 'hc');
  else document.documentElement.removeAttribute('data-theme');
  write({ contrast: on || undefined });
}
