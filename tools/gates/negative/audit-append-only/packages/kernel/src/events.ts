/* Other tables and a read, none of them a rewrite of the log. */
export const reads = ['SELECT id FROM event', 'UPDATE event_kind SET label = ?', 'DELETE FROM events_seen'];
