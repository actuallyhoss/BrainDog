/**
 * WHETHER AN ID IS ONE A READER CAN SAY, so the decide screens print it or print nothing.
 *
 * The record hands a member invited to one list `q.<ULID>` and `d.<ULID>` in place of `SG<n>` and
 * `D<n>`, because the numbers counted the questions she was not shown
 * (`loop/research-hidden-questions.md`, brief A). The handle still opens the row and still works in a
 * link, so `/decide/{q.id}` is untouched; it is only the printed chip that goes, since 28 characters of
 * ULID read aloud identify nothing to a person.
 *
 * IT HOLDS BACK THE TWO HANDLE SHAPES AND NOTHING ELSE. Matching `SG<n>` and `D<n>` instead would also
 * drop the sample record's ids and any id an import brings, which a reader was shown until now and
 * which reveal nothing, so an id this module has never heard of is printed.
 */
export const spoken = (id: string): boolean => id !== '' && !/^[qd]\./u.test(id);
