/**
 * THE KEYBOARD A FIELD ASKS A PHONE FOR (mobile pass, 2 Nov).
 *
 * Every plain field on a row's form and a row's page was `type="text"` with nothing more, so a phone gave a person's
 * email the sentence keyboard, with a capital first letter and autocorrect turning "jo@okafor.co" into "Jo@okafor.co",
 * and a website the same. A field says what it holds by its type, or, where a pack declared it as text, by its id; the
 * hint changes the keys only, and what is typed is still checked by the record as before.
 *
 * NO `autocomplete` NAMES. These are other people's emails and other companies' sites, and naming `email` would offer
 * the reader's own address in a contact's row; `off` is not set either, so the browser's own memory of the field stays.
 */

type Hints = { inputmode?: 'email' | 'url' | 'tel'; autocapitalize?: 'off' | 'words'; autocorrect?: 'off'; spellcheck?: false };

const EMAIL = /(^|_)e?mail$/u;
const URL_ID = /(^|_)(url|website|site|link|domain)$/u;
const PHONE = /(^|_)(phone|mobile|tel)$/u;
const NAME = /(^|_)(name|title)$/u;

/** The keyboard hints for one field, to spread on its `<input>`. */
export function typingHints(f: { id: string; type: string }): Hints {
  const plain = { autocapitalize: 'off', autocorrect: 'off', spellcheck: false } as const;
  if (f.type === 'email' || EMAIL.test(f.id)) return { inputmode: 'email', ...plain };
  if (f.type === 'url' || URL_ID.test(f.id)) return { inputmode: 'url', ...plain };
  if (PHONE.test(f.id)) return { inputmode: 'tel', autocorrect: 'off', spellcheck: false };
  if (f.id === 'name' || NAME.test(f.id)) return f.id.endsWith('title') ? {} : { autocapitalize: 'words' };
  return {};
}
