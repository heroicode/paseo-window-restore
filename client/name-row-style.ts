// SidebarRow lets its label wrap and takes no prop to clip it, so a long name with no break
// point widens the row past the sidebar. This stylesheet keeps the name row to one line and ends
// a name that does not fit with an ellipsis.
//
// Internal: the row's pressable carries `plugin-sidebar-<pluginId>-<itemId>` as its test ID
// (packages/app/src/plugins/sidebar-items/index.tsx), rendered as `data-testid` on web. Its
// children are the icon and then the label (packages/app/src/components/sidebar/
// sidebar-header-row.tsx).

interface StyleElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

export interface StyleDocument {
  head: { appendChild(node: StyleElement): unknown };
  createElement(tagName: "style"): StyleElement;
}

export function nameRowCss(testId: string): string {
  const row = `[data-testid="${testId}"]`;
  return [
    `${row} { min-width: 0; overflow: hidden; }`,
    `${row} > * { flex-shrink: 0; }`,
    `${row} > :last-child { flex-shrink: 1; min-width: 0; white-space: nowrap; overflow: hidden;` +
      ` text-overflow: ellipsis; }`,
  ].join("\n");
}

/** Adds the stylesheet for the row with `testId`, and returns a function that removes it. */
export function addNameRowStyle(document: StyleDocument, testId: string): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-paseo-window-restore", "name-row");
  style.textContent = nameRowCss(testId);
  document.head.appendChild(style);
  return () => style.remove();
}
