/**
 * A v4-shaped id for a workout that has not been created yet.
 *
 * Chosen on the device when the record screen opens: the local DB stores the workout under
 * it and the sync engine sends it with every upsert, so a send retried after a lost reply
 * updates the record it already made instead of adding a second one for the same day. It
 * only has to be unique, not unguessable — the server checks ownership — so Math.random is
 * enough, and it avoids a native module for something this small.
 */
export function newWorkoutId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
