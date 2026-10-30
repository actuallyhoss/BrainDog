/**
 * The suggested accents, by themselves (`record.ts` says why these five and why at these lightnesses).
 *
 * THEIR OWN FILE, so a screen that only needs to know a swatch's name for a colour (`apps/web` `theme/follow.ts`) reads
 * five names and five hexes, and not the solver that builds a theme from one of them.
 */
export const ACCENTS: readonly { name: string; hex: string }[] = [
  { name: 'Moss', hex: '#41815F' },
  { name: 'Ink blue', hex: '#3C72CE' },
  { name: 'Plum', hex: '#A75996' },
  { name: 'Ochre', hex: '#A86A16' },
  { name: 'Teal', hex: '#2B7F8A' },
];
