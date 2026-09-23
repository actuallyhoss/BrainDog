/**
 * The words an add-on's settings page says an enum setting's values in, on its segments and in its menu.
 *
 * THERE IS NO LABEL TO READ. A pack's setting declares `type`, `values`, `default`, `label` and `note`, and the
 * kernel's `readConfig` refuses any other key with FIELD_UNKNOWN, so nothing can say what `two_yearly` reads as. The
 * page spelt each value with its underscores out, in lower case, where every unlabelled value elsewhere reads through
 * `copy.valueWord` with a capital and its acronyms kept (`loop/research-batch-forty-nine-audit.md` §6). Out of the
 * component so `node --test` can run it, since a Svelte page does not mount there (`ui/enum-label-sites.test.ts`).
 */

import { copy } from '../../../lib/copy.ts';
import type { ConfigDecl } from '../../../lib/record/packs.ts';

/** Each value an enum setting offers, in its declared order, beside the words a person reads for it. */
export const settingChoices = (decl: ConfigDecl): (readonly [value: string, said: string])[] =>
  (decl.values ?? []).map((v) => [v, copy.valueWord(v)] as const);
