/**
 * ONE ANSWER TO "IS THERE A BUILD TO READ", for every test here that reads the served bytes.
 *
 * Five files carried a copy of the same two lines, and each copy skipped when `apps/site/build` was absent. That
 * was right at a desk and wrong in CI: the leg that ran them built no site, and the job that built the site ran
 * none of them, so 37 skips rode a green run on every push and two site tests the history called red could never
 * be shown green.
 *
 * A MISSING BUILD IS A SKIP THAT SAYS SO, UNLESS THE STEP SAYS THERE IS ONE. `ci.yml`'s build job runs these
 * tests with `SITE_BUILT=1` right after `pnpm --filter @braindog/site build`. There a missing page is not a reason
 * to skip, it is the fault: the build wrote less than the tests expect, or wrote it somewhere else. So under the
 * flag `when` throws while the file loads, and the file is red with the reason, rather than green with a skip.
 *
 * `SITE_BUILD_DIR` POINTS THE SAME TESTS AT ANOTHER FOLDER. `negative.test.mjs` runs each built-page rule against
 * a seeded page under `negative/` that breaks it, and expects the rule to fail there. A rule that cannot be
 * pointed at a fault is one nobody has seen fail.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HELD, held } from '../src/lib/launch.ts';

const elsewhere = process.env['SITE_BUILD_DIR'];

/** True in the step that has just built the site, where a missing build fails instead of skipping. */
export const STRICT = process.env['SITE_BUILT'] === '1';

/** The folder the tests read: `apps/site/build`, or the one `SITE_BUILD_DIR` names. Ends in a slash. */
export const BUILD: URL = elsewhere ? pathToFileURL(`${resolve(elsewhere)}/`) : new URL('../build/', import.meta.url);

/** How the folder is named in a sentence a person reads. */
export const WHERE = elsewhere ? `the folder SITE_BUILD_DIR names (${elsewhere})` : 'apps/site/build';

/**
 * The reason these checks cannot run, naming every file the build should have written and did not, or `null`
 * when all of them are there.
 */
export function missing(files: readonly string[], why = 'these checks read the served bytes'): string | null {
  const absent = files.filter((file) => !existsSync(new URL(file, BUILD)));
  if (absent.length === 0) return null;
  return (
    `${WHERE} is missing ${absent.join(', ')}. Run "pnpm --filter @braindog/site build" first: ${why}, ` +
    'and a check with nothing to read is a pass that means nothing.'
  );
}

/**
 * `{ skip: reason }` or nothing, because `exactOptionalPropertyTypes` refuses `{ skip: undefined }`. Under
 * `SITE_BUILT=1` a reason is thrown instead, so the file fails by name.
 */
export function when(reason: string | null): { skip: string } | Record<string, never> {
  if (reason === null) return {};
  if (STRICT) throw new Error(`SITE_BUILT=1 says the site was just built, and ${reason}`);
  return { skip: reason };
}

/** The built files a held page would write (`pricing.html` for `/pricing`): the build writes none of them. */
export const shown = (files: readonly string[]): string[] =>
  files.filter((f) => !(held() && (HELD as readonly string[]).includes(`/${f.replace(/\.html$/, '')}`)));
