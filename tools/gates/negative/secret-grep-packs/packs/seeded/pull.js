/**
 * The seeded violation, in the file nearest a key: a pack's script, which is handed the grant the
 * host opened and sends it as a bearer token. It logs what it pulled with while working out why a
 * pull failed, which is the leak `secret-grep` exists for.
 *
 * AND ONE LINE BESIDE IT THAT IS RIGHT: the label, which says which key was used and opens nothing.
 * One finding, not two, is what proves the gate read the value and not the verb.
 */
export async function pull(plaintext, label) {
  console.log('pulled with the key labelled', label);
  console.log('pulled with', plaintext);
}
