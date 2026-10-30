export interface TitleDocument {
  title: string;
}

export interface TitlePin {
  /** Call after the name changes, or after anything else may have written the title. */
  sync(): void;
  /** Puts the app's own title back. */
  restore(): void;
}

/** Keeps the custom name in front of the title Paseo writes for the active tab. */
export function createTitlePin(document: TitleDocument, getName: () => string): TitlePin {
  let appTitle = document.title;
  let written = document.title;

  return {
    sync() {
      if (document.title !== written) appTitle = document.title;
      const name = getName();
      written = name ? `${name} - ${appTitle}` : appTitle;
      if (document.title !== written) document.title = written;
    },
    restore() {
      if (document.title === written) document.title = appTitle;
    },
  };
}
