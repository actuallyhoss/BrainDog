/**
 * A report key's answer logged whole. `createReportKey` answers the bearer once, inside `value`, under a name nothing
 * in the key hierarchy uses. The decoy beside it logs the key's id, which is not a secret, so one finding proves the
 * gate follows the answer and still lets its id be said.
 */
type Client = { createReportKey(args: { register: string }): Promise<{ ok: true; value: { id: string; bearer: string } }> };

export async function make(client: Client): Promise<void> {
  const minted = await client.createReportKey({ register: 'datapoints' });
  console.log('made a report key', minted.value.id);
  console.log('made a report key', minted);
}
