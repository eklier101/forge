type Listener = () => void;

let pairedFlag = false;
const listeners = new Set<Listener>();

export function getPairedFlag() {
  return pairedFlag;
}

export function setPairedFlag(value: boolean) {
  if (pairedFlag === value) return;
  pairedFlag = value;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function subscribePairedFlag(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
