/* A migration reshapes the log once, behind migration-lock: not read by this gate. */
export const up = "DELETE FROM event WHERE kind = 'noise'";
