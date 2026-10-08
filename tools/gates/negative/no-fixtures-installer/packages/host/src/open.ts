/**
 * A host that fills a new record with the sample, reaching the seed's root by a path rather than by its name and calling
 * its installer. Three findings on this file: the import of the root's file, the export from the package's folder (a
 * bundler opens a folder at its root), and the call.
 *
 * The record package beside it names `installSeed` in a comment and as a word in a string, and neither is a call.
 */

import * as seed from '../../seed/src/index.ts';

export { NOW } from '../../seed';

export async function open(kernel: unknown): Promise<unknown> {
  return seed.installSeed(kernel as never);
}
