/* A fixture. Two refusal codes are named here and only one of them has a fixture. */
export const locked = () => bad('ROW_LOCKED', 'It is locked.', 'fields.lesson');
export const person = () => bad('HUMAN_ONLY', 'A person set this.', 'fields.owner');
