/**
 * The seeded violation: `52 §6`'s own example, `console.log(plaintext)`.
 *
 * IT IS THE ONE THAT ACTUALLY HAPPENS. Nobody writes a credential into a register; somebody unwraps
 * one to use it, and then logs the call that used it while working out why it failed.
 */
export async function post(url: string, plaintext: string): Promise<void> {
  const headers = { authorization: `Bearer ${plaintext}` };
  console.error('post failed', { url, headers: { authorization: plaintext } });
  void headers;
}
