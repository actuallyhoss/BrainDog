/* A fixture. The write path has both shapes in it: a race is answered with an envelope that
   carries no code, and a locked row is refused by constructing one. `row-locked.yaml` claims the
   second is the first, which is the one thing `derived:` must never be able to say. */
export const raced = () => clash(7, { id: 'learnings#1' }, 'p_ada');
export const locked = () => bad('ROW_LOCKED', 'It is locked.', 'lesson');
