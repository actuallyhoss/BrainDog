/**
 * A shipped module that reads the sample, which is the one thing `no-fixtures` exists to refuse.
 *
 * The comment names `./record/fixtures/sample.ts` and is not a read of it, and the test beside this file and the fixture
 * itself import what they like: the seeded import below is the only finding this tree holds.
 */

import { ROWS } from './record/fixtures/sample.ts';

export const owed = (): number => ROWS.obligations?.length ?? 0;
