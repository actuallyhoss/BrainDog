/**
 * The five example records the drawn app switches between, in the order its tabs name them.
 *
 * `DRAWN_ON` IS THE CLOCK THE EXAMPLES ARE WRITTEN AGAINST, Monday 28 September 2026, and the page
 * hands it to the renderer as `now`. A heat grid ends on the week that holds today and a date is
 * said relative to it, so without a fixed clock the runs on the Personal Home would slide out of
 * their grid a week after the site was built.
 */
import { founder } from './founder.ts';
import { personal } from './personal.ts';
import { project } from './project.ts';
import { student } from './student.ts';
import { team } from './team.ts';
import type { Example } from './types.ts';

export const DRAWN_ON = Date.UTC(2026, 8, 28, 9);

export const EXAMPLES: readonly Example[] = [personal, student, founder, team, project];
