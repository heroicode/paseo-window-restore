export interface RenameAction {
  bind(open: () => void): () => void;
  run(): boolean;
}

/** Connects a global command to the rename popover owned by the mounted sidebar item. */
export function createRenameAction(): RenameAction {
  let current: (() => void) | null = null;

  return {
    bind(open) {
      current = open;
      return () => {
        if (current === open) current = null;
      };
    },
    run() {
      if (!current) return false;
      current();
      return true;
    },
  };
}
