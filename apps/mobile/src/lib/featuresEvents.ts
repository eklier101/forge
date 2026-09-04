/** Notify screens when Account → Features toggles change. */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onFeaturesChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emitFeaturesChanged(): void {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
}
