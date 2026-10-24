/**
 * The list the Work screen works on, by its id, in one place.
 *
 * WORK'S ONE LIST ID. The Work page, Today's tasks and
 * the shell's Work row all read the same list, and `boot` does not yet say which list plays that part, so its id is
 * written here and nowhere else (`tools/gates/web-lists.mjs` holds it). A module of its own, so the shell and Today read
 * it without anything of a screen's.
 */
export const TASKS = 'tasks';
