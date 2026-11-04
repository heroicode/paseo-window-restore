import assert from "node:assert/strict";
import { test } from "node:test";
import { addNameRowStyle, nameRowCss } from "../client/name-row-style.ts";

test("the name row ends a long name with an ellipsis and keeps its icon", () => {
  const css = nameRowCss("plugin-sidebar-window-restore-window-name");
  const row = '[data-testid="plugin-sidebar-window-restore-window-name"]';
  assert.ok(css.includes(`${row} { min-width: 0; overflow: hidden; }`));
  assert.ok(css.includes(`${row} > * { flex-shrink: 0; }`));
  const label = css.slice(css.indexOf(`${row} > :last-child`));
  for (const rule of ["white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis", "min-width: 0"]) {
    assert.ok(label.includes(rule), rule);
  }
});

test("the name row style is added to the page and removed again", () => {
  const head = [];
  const document = {
    head: { appendChild: (node) => head.push(node) },
    createElement: () => ({
      textContent: null,
      setAttribute() {},
      remove() {
        head.splice(head.indexOf(this), 1);
      },
    }),
  };
  const remove = addNameRowStyle(document, "row");
  assert.equal(head.length, 1);
  assert.equal(head[0].textContent, nameRowCss("row"));
  remove();
  assert.equal(head.length, 0);
});
