/**
 * Tiny pub/sub bridge so UI outside the reaction window (the ADD ATOM button)
 * can ask it to spawn an atom. Deliberately not part of the game state store —
 * spawning is a transient visual event, not persisted progress, and the
 * reaction window owns the atom array.
 */

/** `pos` is in reaction-window world coords; omit it for a random position. */
export type SpawnListener = (pos?: { x: number; y: number }) => void;

const listeners = new Set<SpawnListener>();

/** Subscribe to spawn requests. Returns an unsubscribe function. */
export function onSpawnAtom(fn: SpawnListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Ask the reaction window to spawn one atom. No-op if it isn't mounted. */
export function requestSpawnAtom(pos?: { x: number; y: number }): void {
  for (const fn of listeners) fn(pos);
}
