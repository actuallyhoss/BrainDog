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
  /** A record's own accent, once a record has one. Read by `app.html` before anything renders. */
  theme?: string | undefined;
  /** `false` folds the rail. `undefined` is open, which is what a first visit should be. */
  sidebar?: boolean | undefined;
  /** Whether bare letters act inside a focused grid. */
  chars?: boolean | undefined;
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
};

const NAME = 'bd_pref';
/** A year. Long enough that it is never the reason something was forgotten. */
const YEAR = 60 * 60 * 24 * 365;

/** What the cookie holds now, or `{}` — including when there is no document at all. */
export function read(): Pref {
  if (typeof document === 'undefined') return {};
  const raw = new RegExp(`(?:^|; )${NAME}=([^;]*)`).exec(document.cookie)?.[1];
  if (!raw) return {};
  try {
    const out: unknown = JSON.parse(decodeURIComponent(raw));
    return out && typeof out === 'object' && !Array.isArray(out) ? (out as Pref) : {};
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

  return next;
}

/**
 * Put a preference on the document, and remember it.
 *
 * ONE FUNCTION FOR BOTH HALVES, because they were two and the second one was never written. An
 * attribute set without a cookie is a preference that lasts until the next navigation.
 */
export function apply(key: 'scheme' | 'text' | 'density' | 'theme', value: string | null): void {
  if (typeof document === 'undefined') return;
  if (value === null) document.documentElement.removeAttribute(`data-${key}`);
  else document.documentElement.setAttribute(`data-${key}`, value);
  write({ [key]: value ?? undefined } as Pref);
}
