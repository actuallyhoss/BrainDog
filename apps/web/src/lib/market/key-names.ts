/**
 * A key's label as a person reads it, and which key to make, for the keys a first-party add-on asks for by default.
 *
 * THE STORED LABEL STAYS (his call, 2 Nov): Stripe's key has always been kept as `stripe`, and every install points at
 * that label, so renaming it would leave existing installs asking for a key nobody has. It is shown as "Stripe (read
 * only)", as Mercury's is, with one line on which key to make. Commands and fields that store a key keep the label.
 *
 * PURE AND NODE-LOADABLE: no imports.
 */

type KeyName = { name: string; make: string };

const NAMES: Readonly<Record<string, KeyName>> = {
  stripe: {
    name: 'Stripe (read only)',
    make: 'In Stripe, make a restricted key that can read Balance and Payouts and nothing else.',
  },
  'Mercury (read only)': {
    name: 'Mercury (read only)',
    make: 'In Mercury, make an API token with Read Only access.',
  },
};

/** The name a key is shown by: "Stripe (read only)" for the label `stripe`, any other label as it is. */
export const keyName = (label: string): string => NAMES[label]?.name ?? label;

/** One line on which key to make, or null for a label this does not know. */
export const keyHint = (label: string): string | null => NAMES[label]?.make ?? null;
