/**
 * The kernel schema, migration 36: a run carried in from somewhere else is history, and holds no next step.
 *
 * AN IMPORTED RUN KEPT THE STEP ITS ADAPTER GAVE IT, so a run nobody here ever heard from, written off in the old
 * system months ago, could be offered as the next thing to pick up. On the owner's record 295 runs came in by the
 * import, 291 of them abandoned. A step is only a step when a run left it here, or when it ended in `handoff`, which is
 * the one state that means "pick this up".
 *
 * NEVER HEARD FROM HERE is `presenceOf`'s `before` (`presence.ts`): no `last_seen`, or one that is not a time. Not "no
 * `started`", which the brief said: every run has `started`, stamped as it is made and given to every older run by
 * migration 26, so that marker finds nothing.
 *
 * IN PLACE, as migration 26 gives a run its `started` and migration 28 puts a run's own books right: no version, no
 * `updated_at` and no event, because the record setting its own rule over runs it already held is not an edit anybody
 * made, and 291 runs moved to the top of every list by `updated_at` would bury the ones working. The step's words are
 * not lost: the line that wrote them is in the run's history, and stays there.
 *
 * ONE STATEMENT, and keyed on the step still being there, so a second run finds nothing and changes nothing. No table,
 * no column and no index.
 */

export default `
UPDATE entry SET fields = json_remove(fields, '$.next')
  WHERE register = 'session'
    AND json_type(fields, '$.next') IS NOT NULL
    AND (json_type(fields, '$.last_seen') IS NOT 'text' OR json_extract(fields, '$.last_seen') = '')
    AND coalesce(state, json_extract(fields, '$.state'), '') IS NOT 'handoff';
`;
