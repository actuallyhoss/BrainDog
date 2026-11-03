/**
 * The kernel's extensions: every method written under `api/`, gathered into what `makeKernel` returns.
 *
 * ONE FILE PER UNIT, AND THIS FILE IS ONLY A LIST. A new kernel method is `api/<unit>.ts`, exporting
 * `extension(parts: KernelParts)` that returns the methods it adds; it is registered here with one import line and one
 * spread line, both inside the `EXTENSIONS` block, so two changes adding methods at once touch two lines of this file
 * and no line of `index.ts`.
 *
 * `Kernel` STAYS `ReturnType<typeof makeKernel>`, and `makeKernel` returns `{ ...kernel, ...extensions(parts) }`, so a
 * method added here is typed on every caller with no line written anywhere else. A name the kernel already has is
 * refused when the record opens, because the spread would otherwise hide the kernel's method without a word.
 */

import type { KernelParts } from '../parts.ts';

/* EXTENSIONS: the imports, one line per file under this folder, named for the file. */
import { extension as rehearse } from './rehearse.ts';
import { extension as moneyFigures } from './money-figures.ts';
import { extension as keys } from './keys.ts';
import { extension as comments } from './comments.ts';
import { extension as keychainPassphrase } from './keychain-passphrase.ts';
import { extension as jobs } from './jobs.ts';
import { extension as quiet } from './quiet.ts';
import { extension as retype } from './retype.ts';
import { extension as personName } from './person-name.ts';
import { extension as visuals } from './visuals.ts';
import { extension as zone } from './zone.ts';
import { extension as attachments } from './attachments.ts';
/* END EXTENSIONS */

export function extensions(parts: KernelParts) {
  return {
    /* EXTENSIONS: the spreads, one line per file, in the order of the imports above. */
    ...rehearse(parts),
    ...moneyFigures(parts),
    ...keys(parts),
    ...comments(parts),
    ...keychainPassphrase(parts),
    ...jobs(parts),
    ...quiet(parts),
    ...retype(parts),
    ...personName(parts),
    ...visuals(parts),
    ...zone(parts),
    ...attachments(parts),
    /* END EXTENSIONS */
  };
}
