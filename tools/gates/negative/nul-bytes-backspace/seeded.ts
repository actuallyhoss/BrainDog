/* The seeded violation: a BACKSPACE, 0x08, left behind by a word-boundary escape that lost its
   backslash. Planted with Node rather than typed, because an editing tool will not carry it.

   THIS IS THE CLASS THAT ACTUALLY SHIPPED, three times, where NUL shipped twice: a set of working
   instructions, a research note, and a comment in clean-room.mjs explaining what a word boundary
   does. All three read correctly to a human eye, which is why a gate has to be the one to look. */
export const boundary = /word/u;
