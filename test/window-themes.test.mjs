import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WindowRecordSchema,
  sameTheme,
  themeFromSettings,
  toSlot,
  withTheme,
} from "../client/session.ts";

test("a window's theme is read from the app settings it wrote", () => {
  const raw = JSON.stringify({ theme: "plugin", pluginThemeId: "nord", uiBaseFontSize: 14 });
  assert.deepEqual(themeFromSettings(raw), { theme: "plugin", pluginThemeId: "nord" });
  assert.deepEqual(themeFromSettings(JSON.stringify({ theme: "dark" })), {
    theme: "dark",
    pluginThemeId: null,
  });
  assert.equal(themeFromSettings(null), null);
  assert.equal(themeFromSettings("not json"), null);
  assert.equal(themeFromSettings(JSON.stringify({ uiBaseFontSize: 14 })), null);
});

test("seeding a theme keeps every other app setting", () => {
  const raw = JSON.stringify({ theme: "light", pluginThemeId: null, uiBaseFontSize: 16 });
  const seeded = JSON.parse(withTheme(raw, { theme: "plugin", pluginThemeId: "nord" }));
  assert.deepEqual(seeded, { theme: "plugin", pluginThemeId: "nord", uiBaseFontSize: 16 });
  assert.deepEqual(JSON.parse(withTheme(null, { theme: "dark", pluginThemeId: null })), {
    theme: "dark",
    pluginThemeId: null,
  });
});

test("themes compare by preference and plugin theme", () => {
  assert.ok(sameTheme({ theme: "dark", pluginThemeId: null }, { theme: "dark", pluginThemeId: null }));
  assert.ok(!sameTheme({ theme: "plugin", pluginThemeId: "a" }, { theme: "plugin", pluginThemeId: "b" }));
  assert.ok(!sameTheme({ theme: "dark", pluginThemeId: null }, null));
});

test("old saved records migrate to no theme, and slots carry the theme", () => {
  const base = {
    id: "w",
    route: null,
    sidebarView: null,
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    seenAt: 1,
  };
  assert.equal(WindowRecordSchema.parse(base).theme, null);
  const theme = { theme: "plugin", pluginThemeId: "nord" };
  assert.deepEqual(toSlot(WindowRecordSchema.parse({ ...base, theme })).theme, theme);
});
