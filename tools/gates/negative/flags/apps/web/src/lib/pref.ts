/* The fixture's preferences, so the gate's flag-versus-preference check has a list to read. */
export type Pref = {
  scheme?: 'light' | 'dark' | undefined;
  density?: 'compact' | 'comfortable' | 'roomy' | undefined;
};
