import assert from "node:assert/strict";
import { test } from "node:test";
import { createRenameAction } from "../client/rename-action.ts";
import { WindowRecordSchema, toSlot } from "../client/session.ts";
import { createTitlePin } from "../client/title.ts";
import { MAX_WINDOW_NAME_LENGTH, createWindowNameStore } from "../client/window-name.ts";

test("the searchable rename action opens the mounted rename control", () => {
  const action = createRenameAction();
  let opens = 0;
  assert.equal(action.run(), false);

  const unbind = action.bind(() => {
    opens += 1;
  });
  assert.equal(action.run(), true);
  assert.equal(opens, 1);

  unbind();
  assert.equal(action.run(), false);
});

test("window names are trimmed, limited, and observable", () => {
  const store = createWindowNameStore();
  let changes = 0;
  const unsubscribe = store.subscribe(() => {
    changes += 1;
  });

  store.rename(`  ${"a".repeat(MAX_WINDOW_NAME_LENGTH + 10)}  `);
  assert.equal(store.getName(), "a".repeat(MAX_WINDOW_NAME_LENGTH));
  assert.equal(changes, 1);

  store.rename(store.getName());
  assert.equal(changes, 1);
  unsubscribe();
});

test("old saved records migrate to an empty name", () => {
  const record = WindowRecordSchema.parse({
    id: "one",
    route: null,
    sidebarView: null,
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    seenAt: 1,
  });
  assert.equal(record.name, "");
});

test("a custom name follows its window into a restore slot", () => {
  const record = WindowRecordSchema.parse({
    id: "one",
    name: "Backend",
    route: "/h/local/workspace/api",
    sidebarView: null,
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    seenAt: 1,
  });
  assert.equal(toSlot(record).name, "Backend");
});

test("the custom name stays in front of titles Paseo writes", () => {
  const document = { title: "Paseo" };
  let name = "Backend";
  const pin = createTitlePin(document, () => name);

  pin.sync();
  assert.equal(document.title, "Backend - Paseo");

  document.title = "API workspace";
  pin.sync();
  assert.equal(document.title, "Backend - API workspace");

  name = "";
  pin.sync();
  assert.equal(document.title, "API workspace");
});

test("restoring the title removes the custom name", () => {
  const document = { title: "Paseo" };
  const pin = createTitlePin(document, () => "Backend");
  pin.sync();
  pin.restore();
  assert.equal(document.title, "Paseo");
});
