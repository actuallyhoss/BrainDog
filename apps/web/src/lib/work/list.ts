/**
 * The list the Work screen works on, by its id, in one place.
 *
 * THE HAND-BUILT WORK SCREEN'S ONE LIST ID. The Work screen, Today's tasks and
 * the shell's Work row all read the same list, and `boot` does not yet say which list plays that part, so its id is
 * written here and nowhere else (`tools/gates/web-lists.mjs` holds it). A module of its own, and not `work-live.ts`,
 * because that one is route-only and the shell and Today read this without it.
 */
export const TASKS = 'tasks';
