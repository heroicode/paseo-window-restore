// Window names are optional. Every window shares this key, so the choice applies to all of them.
export const HIDE_NAMES_KEY = "window-restore:hide-names";

interface SettingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface NamesSetting {
  /** Whether window names are hidden. They are until the user turns them on. */
  hidden(): boolean;
  setHidden(hidden: boolean): void;
  subscribe(listener: () => void): () => void;
  /** Rereads the stored value, for when another window may have changed it. */
  refresh(): void;
}

export function createNamesSetting(storage: SettingStorage): NamesSetting {
  const listeners = new Set<() => void>();
  const read = () => storage.getItem(HIDE_NAMES_KEY) !== "false";
  let hidden = read();

  const update = (next: boolean) => {
    if (next === hidden) return;
    hidden = next;
    for (const listener of listeners) listener();
  };

  return {
    hidden: () => hidden,
    setHidden(next) {
      storage.setItem(HIDE_NAMES_KEY, String(next));
      update(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: () => update(read()),
  };
}
