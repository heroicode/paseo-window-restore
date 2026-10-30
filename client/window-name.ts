export const MAX_WINDOW_NAME_LENGTH = 60;

export interface WindowNameStore {
  getName(): string;
  /** Applies a name restored with a saved window. */
  replace(name: string): void;
  /** Applies a name entered by the user. */
  rename(name: string): void;
  subscribe(listener: () => void): () => void;
}

function normalizeName(input: string): string {
  return input.trim().slice(0, MAX_WINDOW_NAME_LENGTH);
}

/** Reactive name state. Persistence is owned by the window's restore record. */
export function createWindowNameStore(initialName = ""): WindowNameStore {
  const listeners = new Set<() => void>();
  let name = normalizeName(initialName);

  const update = (input: string) => {
    const next = normalizeName(input);
    if (next === name) return;
    name = next;
    for (const listener of listeners) listener();
  };

  return {
    getName: () => name,
    replace: update,
    rename: update,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
