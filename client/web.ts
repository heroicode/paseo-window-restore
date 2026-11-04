import { Platform } from "react-native";
import type { z } from "zod";
import { createNamesSetting } from "./names-setting";
import { addNameRowStyle, type StyleDocument } from "./name-row-style";
import { createTitlePin, type TitleDocument } from "./title";
import { createWindowNameStore } from "./window-name";
import {
  closestIndex,
  hasArea,
  LastSessionSchema,
  MessageSchema,
  PendingSlotSchema,
  PlanSchema,
  previousSession,
  sameTheme,
  themeFromSettings,
  toSlot,
  withTheme,
  WindowRecordSchema,
  workspaceSelectionFromRoute,
  type AssignMessage,
  type Bounds,
  type Message,
  type PendingSlot,
  type Plan,
  type Slot,
  type WindowRecord,
  type WindowTheme,
} from "./session";

// Paseo 0.13.2 gives plugins no API for desktop windows, the current route, the sidebar's Host
// and Project filters, or the theme. This module reaches each through desktop app internals, named
// where used.

interface WebStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Channel {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: Message): void;
  close(): void;
}

type WindowEvent = "pagehide" | "focus" | "storage";

declare const window: {
  localStorage: WebStorage;
  sessionStorage: WebStorage;
  location: { pathname: string; search: string; replace(url: string): void };
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  moveTo(x: number, y: number): void;
  resizeTo(width: number, height: number): void;
  addEventListener(type: WindowEvent, listener: () => void): void;
  removeEventListener(type: WindowEvent, listener: () => void): void;
  // Internal: the Electron preload bridge (packages/desktop/src/preload.ts). `openNew` is
  // File → New Window. It takes no route and resolves once the new window has loaded.
  paseoDesktop?: { window?: { openNew?: () => Promise<unknown> } };
};
declare const document: TitleDocument &
  StyleDocument & {
    documentElement: {
      hasAttribute(name: string): boolean;
      getAttribute(name: string): string | null;
      setAttribute(name: string, value: string): void;
      removeAttribute(name: string): void;
    };
  };
declare const MutationObserver: new (callback: () => void) => {
  observe(
    target: unknown,
    options: { childList: boolean; subtree: boolean; characterData: boolean },
  ): void;
  disconnect(): void;
};
declare const Storage: {
  prototype: { setItem(this: WebStorage, key: string, value: string): void };
};
declare const BroadcastChannel: new (name: string) => Channel;

// Internal: the persisted zustand store behind the sidebar's Display preferences menu
// (packages/app/src/stores/sidebar-view-store.ts). Every window shares this one key and reads it
// only while loading, so a window's Host and Project filters are whatever it last wrote here.
const SIDEBAR_VIEW_KEY = "sidebar-view";
// Internal: the workspace a window opens on at "/" (packages/app/src/stores/
// last-workspace-selection.ts). Also shared, and also read only while loading.
const LAST_WORKSPACE_KEY = "paseo:last-workspace-route-selection";
// Internal: the app settings AsyncStorage blob (packages/app/src/hooks/use-settings/keys.ts). Each
// window loads it once and rewrites all of it from memory on any change, so its `theme` and
// `pluginThemeId` are those of the last window to change any setting.
const APP_SETTINGS_KEY = "@paseo:app-settings";

const RECORD_PREFIX = "window-restore:window:";
const PLAN_KEY = "window-restore:plan";
const LAST_SESSION_KEY = "window-restore:last-session";
// sessionStorage belongs to one window and survives its reloads but not a relaunch.
const WINDOW_ID_KEY = "window-restore:id";
const PENDING_SLOT_KEY = "window-restore:pending-slot";
const CHANNEL_NAME = "window-restore";
// `contribute` runs once per connected host in each window. Paseo evaluates those contributions in
// isolated JavaScript worlds, so the DOM marker is the cross-world singleton and the globals handle
// repeated evaluation inside one world.
const RUNNING_MARKER = "data-paseo-window-restore-running";
const RUNNING_FLAG = "__paseoWindowRestoreRunning";
const LOADED_FLAG = "__paseoWindowRestoreLoaded";

const TICK_MS = 1_000;
const HEARTBEAT_MS = 5_000;
const PING_WAIT_MS = 800;
const POLL_MS = 250;
// The app is one bundle whose stores start hydrating as it runs, so their reads finish moments
// after `openNew` resolves. Until then the seeded keys must stay put.
const SEED_SETTLE_MS = 500;
const ROUTE_SETTLE_MS = 3_000;
const ASSIGN_TIMEOUT_MS = 60_000;
const SLOT_TIMEOUT_MS = 30_000;
const RESTORE_TIMEOUT_MS = 2 * 60_000;
const PLAN_TTL_MS = 2 * 60_000;
const RECORD_TTL_MS = 30 * 24 * 60 * 60_000;

/** State this window holds while it restores the others. */
interface Restoring {
  planId: string;
  slots: Slot[];
  claimed: Set<number>;
  applied: Set<number>;
  // Windows whose start did not match a slot; each reloads into one, after seeding is done.
  fallbacks: { to: string; index: number }[];
}

interface Controller {
  restoreLastSession(): Promise<boolean>;
  getWindowName(): string;
  renameWindow(name: string): void;
  subscribeWindowName(listener: () => void): () => void;
  namesHidden(): boolean;
  setNamesHidden(hidden: boolean): void;
  subscribeNamesHidden(listener: () => void): () => void;
}

let controller: Controller | null = null;

export function isDesktopWindow(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.paseoDesktop?.window?.openNew === "function"
  );
}

/** Restores the previous session's windows if this is the first window, then tracks this one. */
export function startWindowRestore(): (() => void) | null {
  if (!isDesktopWindow()) return null;
  const scope = globalThis as unknown as Record<string, unknown>;
  const root = document.documentElement;
  if (scope[RUNNING_FLAG] === true || root.hasAttribute(RUNNING_MARKER)) return null;
  const owner = createId();
  root.setAttribute(RUNNING_MARKER, owner);
  scope[RUNNING_FLAG] = true;
  const pluginReload = scope[LOADED_FLAG] === true;
  scope[LOADED_FLAG] = true;

  const existingId = window.sessionStorage.getItem(WINDOW_ID_KEY);
  const id = existingId ?? createId();
  window.sessionStorage.setItem(WINDOW_ID_KEY, id);

  // A page that just loaded read `sidebar-view` at startup. A plugin reload inside a running page
  // may come after other windows rewrote it, so keep what this window last wrote.
  const saved = existingId === null ? null : readRecord(existingId);
  const windowName = createWindowNameStore(saved?.name ?? "");
  // Hiding names leaves the saved name alone, so it returns when names are turned back on.
  const namesSetting = createNamesSetting(window.localStorage);
  const titlePin = createTitlePin(document, () => (namesSetting.hidden() ? "" : windowName.getName()));
  let sidebarView =
    pluginReload && saved ? saved.sidebarView : window.localStorage.getItem(SIDEBAR_VIEW_KEY);
  let theme: WindowTheme | null =
    (pluginReload ? saved?.theme : null) ??
    themeFromSettings(window.localStorage.getItem(APP_SETTINGS_KEY));
  let route = currentRoute() ?? saved?.route ?? null;
  let bounds = saved?.bounds ?? null;
  let lastSave = 0;
  let restoring: Restoring | null = null;
  let onAssign: ((message: AssignMessage) => void) | null = null;

  function save(): void {
    const now = currentBounds();
    if (hasArea(now) || bounds === null) bounds = now;
    writeJson(RECORD_PREFIX + id, {
      id,
      name: windowName.getName(),
      route,
      sidebarView,
      theme,
      bounds,
      seenAt: Date.now(),
    } satisfies WindowRecord);
    lastSave = Date.now();
  }

  // The app writes `sidebar-view` through localStorage.setItem whenever this window's filters
  // change, and `@paseo:app-settings` whenever any of its settings, such as the theme, change.
  // Other windows' writes land in their own renderers and never reach this patch.
  const originalSetItem = Storage.prototype.setItem;
  function patchedSetItem(this: WebStorage, key: string, value: string): void {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && key === SIDEBAR_VIEW_KEY) {
      sidebarView = value;
      save();
    } else if (this === window.localStorage && key === APP_SETTINGS_KEY) {
      const next = themeFromSettings(value);
      if (next !== null && !sameTheme(next, theme)) {
        theme = next;
        save();
      }
    }
  }
  Storage.prototype.setItem = patchedSetItem;

  const unsubscribeName = windowName.subscribe(() => {
    save();
    titlePin.sync();
  });
  const unsubscribeNamesSetting = namesSetting.subscribe(titlePin.sync);
  const titleObserver = new MutationObserver(titlePin.sync);
  titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  titlePin.sync();

  const timer = setInterval(() => {
    const next = currentRoute();
    if (next !== null && next !== route) {
      route = next;
      save();
    } else if (Date.now() - lastSave >= HEARTBEAT_MS) {
      save();
    }
  }, TICK_MS);

  // Fires when the window closes or reloads; a reload rewrites the record without it. Quitting
  // does not unload pages, so windows open at quit never get it.
  function onPageHide(): void {
    const record = readRecord(id);
    if (record) writeJson(RECORD_PREFIX + id, { ...record, closedAt: Date.now() });
  }
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("focus", save);
  // Fires only in the other windows when one of them changes the shared setting.
  window.addEventListener("storage", namesSetting.refresh);

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const pongs = new Set<string>();
  channel.onmessage = ({ data }) => {
    const parsed = MessageSchema.safeParse(data);
    if (!parsed.success) return;
    const message = parsed.data;
    switch (message.type) {
      case "ping":
        channel.postMessage({ type: "pong", id });
        break;
      case "pong":
        pongs.add(message.id);
        break;
      case "claim":
        if (restoring?.planId === message.planId) assignSlot(restoring, message.id, message.route);
        break;
      case "assign":
        if (message.to === id) onAssign?.(message);
        break;
      case "applied":
        if (restoring?.planId === message.planId) restoring.applied.add(message.index);
        break;
    }
  };

  async function aliveWindowIds(): Promise<Set<string>> {
    pongs.clear();
    channel.postMessage({ type: "ping", id });
    await delay(PING_WAIT_MS);
    return new Set(pongs);
  }

  /** Writes a slot's state where the next window to load will read it. */
  function seed(slot: Slot, write: (key: string, value: string) => void): void {
    if (slot.sidebarView !== null) write(SIDEBAR_VIEW_KEY, slot.sidebarView);
    const selection = workspaceSelectionFromRoute(slot.route);
    if (selection) write(LAST_WORKSPACE_KEY, JSON.stringify(selection));
    if (slot.theme !== null) {
      write(APP_SETTINGS_KEY, withTheme(window.localStorage.getItem(APP_SETTINGS_KEY), slot.theme));
    }
  }

  /** Puts this window into a slot, reloading unless it already shows that slot. */
  function applySlot(slot: Slot, pending: PendingSlot | null): void {
    moveTo(slot.bounds);
    windowName.replace(slot.name);
    const sameView =
      (slot.sidebarView === null || slot.sidebarView === sidebarView) &&
      (slot.theme === null || sameTheme(slot.theme, theme));
    if (sameView && samePath(slot.route, currentRoute())) return;
    if (pending) window.sessionStorage.setItem(PENDING_SLOT_KEY, JSON.stringify(pending));
    seed(slot, (key, value) => window.localStorage.setItem(key, value));
    route = slot.route;
    save();
    window.location.replace(slot.route ?? "/");
  }

  function assignSlot(state: Restoring, to: string, startRoute: string | null): void {
    const isFree = (index: number) => !state.claimed.has(index);
    // Windows load at different speeds, so match each to the slot whose workspace it opened on.
    let index = state.slots.findIndex(
      (slot, slotIndex) => isFree(slotIndex) && startRoute !== null && samePath(slot.route, startRoute),
    );
    if (index !== -1) {
      state.claimed.add(index);
      channel.postMessage({ type: "assign", to, planId: state.planId, index, reload: false });
      return;
    }
    index = state.slots.findIndex((_, slotIndex) => isFree(slotIndex));
    if (index === -1) return;
    state.claimed.add(index);
    state.fallbacks.push({ to, index });
  }

  /** Run by a window the restoring window opened: find out which slot it is and settle into it. */
  async function joinRestore(): Promise<boolean> {
    const plan = readPlan();
    if (!plan || Date.now() - plan.createdAt > PLAN_TTL_MS) return false;
    // The window loads at "/" and redirects to its seeded workspace once its host connects.
    await waitFor(
      () => plan.slots.some((slot) => samePath(slot.route, currentRoute())),
      ROUTE_SETTLE_MS,
    );
    const assigned = await new Promise<AssignMessage | null>((resolve) => {
      const timeout = setTimeout(() => {
        onAssign = null;
        resolve(null);
      }, ASSIGN_TIMEOUT_MS);
      onAssign = (message) => {
        clearTimeout(timeout);
        onAssign = null;
        resolve(message);
      };
      channel.postMessage({ type: "claim", id, planId: plan.id, route: currentRoute() });
    });
    const slot = assigned ? plan.slots[assigned.index] : undefined;
    if (!assigned || !slot) return true;
    if (assigned.reload) {
      applySlot(slot, { planId: plan.id, index: assigned.index, bounds: slot.bounds });
      return true;
    }
    // Seeded just before this window loaded, so this is what its sidebar hydrated.
    sidebarView = slot.sidebarView ?? sidebarView;
    theme = slot.theme ?? theme;
    route = currentRoute() ?? slot.route;
    windowName.replace(slot.name);
    save();
    moveTo(slot.bounds);
    channel.postMessage({ type: "applied", planId: plan.id, index: assigned.index });
    return true;
  }

  /** After reloading into a slot: settle the geometry and tell the restoring window. */
  function finishPendingSlot(): boolean {
    const raw = window.sessionStorage.getItem(PENDING_SLOT_KEY);
    if (raw === null) return false;
    window.sessionStorage.removeItem(PENDING_SLOT_KEY);
    const pending = parseJson(raw, PendingSlotSchema);
    if (pending) {
      moveTo(pending.bounds);
      channel.postMessage({ type: "applied", planId: pending.planId, index: pending.index });
    }
    return true;
  }

  async function restore(previous: WindowRecord[]): Promise<void> {
    writeJson(LAST_SESSION_KEY, previous);
    const ownIndex = closestIndex(previous, currentBounds());
    const slots = previous.filter((_, index) => index !== ownIndex).map(toSlot);
    const plan: Plan = { id: createId(), createdAt: Date.now(), slots };
    const state: Restoring = {
      planId: plan.id,
      slots,
      claimed: new Set(),
      applied: new Set(),
      fallbacks: [],
    };
    restoring = state;
    writeJson(PLAN_KEY, plan);
    // Each window reads the shared keys while it loads, so seed one slot, open its window, and let
    // it finish reading before seeding the next. Written past the capture patch: the values belong
    // to the window being opened, not this one.
    for (const slot of slots) {
      seed(slot, (key, value) => originalSetItem.call(window.localStorage, key, value));
      await window.paseoDesktop?.window?.openNew?.();
      await delay(SEED_SETTLE_MS);
    }
    // Windows that missed their slot reload into one, one at a time, since each rewrites the keys.
    const deadline = Date.now() + RESTORE_TIMEOUT_MS;
    while (state.applied.size < slots.length && Date.now() < deadline) {
      const fallback = state.fallbacks.shift();
      if (!fallback) {
        await delay(POLL_MS);
        continue;
      }
      channel.postMessage({
        type: "assign",
        to: fallback.to,
        planId: plan.id,
        index: fallback.index,
        reload: true,
      });
      await waitFor(() => state.applied.has(fallback.index), SLOT_TIMEOUT_MS);
    }
    if (state.applied.size < slots.length) {
      console.warn(`[window-restore] restored ${state.applied.size} of ${slots.length} windows`);
    }
    restoring = null;
    window.localStorage.removeItem(PLAN_KEY);
    for (const record of previous) window.localStorage.removeItem(RECORD_PREFIX + record.id);
    applySlot(toSlot(previous[ownIndex]), null);
  }

  controller = {
    async restoreLastSession() {
      const alive = await aliveWindowIds();
      const records = readRecords().filter((record) => record.id !== id && !alive.has(record.id));
      const previous = previousSession(records);
      const snapshot = previous.length > 0 ? previous : readLastSession();
      if (snapshot.length === 0) return false;
      await restore(snapshot);
      return true;
    },
    getWindowName: windowName.getName,
    renameWindow: windowName.rename,
    subscribeWindowName: windowName.subscribe,
    namesHidden: namesSetting.hidden,
    setNamesHidden: namesSetting.setHidden,
    subscribeNamesHidden: namesSetting.subscribe,
  };

  const startedAt = Date.now();
  save();
  pruneRecords();
  void (async () => {
    if (finishPendingSlot()) return;
    if (existingId !== null) return;
    if (await joinRestore()) return;
    if ((await aliveWindowIds()).size > 0) return;
    // A window whose plugin loads during the ping has not answered it, but its first record is
    // newer than this window's start. Only older records belong to a previous session.
    const records = readRecords().filter((record) => record.id !== id && record.seenAt < startedAt);
    const previous = previousSession(records);
    if (previous.length > 0) await restore(previous);
  })().catch((error: unknown) => console.warn("[window-restore] restore failed", error));

  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("focus", save);
    window.removeEventListener("storage", namesSetting.refresh);
    channel.close();
    if (Storage.prototype.setItem === patchedSetItem) Storage.prototype.setItem = originalSetItem;
    titleObserver.disconnect();
    unsubscribeName();
    unsubscribeNamesSetting();
    titlePin.restore();
    controller = null;
    scope[RUNNING_FLAG] = false;
    if (root.getAttribute(RUNNING_MARKER) === owner) root.removeAttribute(RUNNING_MARKER);
  };
}

/** Keeps the sidebar row with `testId` to one line, ending a long name with an ellipsis. */
export function styleNameRow(testId: string): () => void {
  return addNameRowStyle(document, testId);
}

/** Reopens the windows from the last session that are not open now. */
export async function restoreLastSession(): Promise<boolean> {
  return (await controller?.restoreLastSession()) ?? false;
}

export function getWindowName(): string {
  return controller?.getWindowName() ?? "";
}

export function renameWindow(name: string): void {
  controller?.renameWindow(name);
}

export function subscribeWindowName(listener: () => void): () => void {
  return controller?.subscribeWindowName(listener) ?? (() => {});
}

export function namesHidden(): boolean {
  return controller?.namesHidden() ?? true;
}

export function setNamesHidden(hidden: boolean): void {
  controller?.setNamesHidden(hidden);
}

export function subscribeNamesHidden(listener: () => void): () => void {
  return controller?.subscribeNamesHidden(listener) ?? (() => {});
}

// Internal: app routes are /h/<serverId>/workspace/<id> and similar (packages/app/src/utils/
// host-routes.ts). Other pages, such as settings, keep the last host route.
function currentRoute(): string | null {
  const { pathname, search } = window.location;
  return pathname.startsWith("/h/") ? pathname + search : null;
}

// A window that redirects to its workspace drops query params such as ?open=, so compare paths.
function samePath(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.split("?")[0] === b.split("?")[0];
}

function currentBounds(): Bounds {
  return {
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight,
  };
}

function moveTo(bounds: Bounds): void {
  // Records saved before empty geometry was ignored can still hold it.
  if (!hasArea(bounds)) return;
  try {
    window.moveTo(bounds.x, bounds.y);
    window.resizeTo(bounds.width, bounds.height);
  } catch {
    // Electron may refuse to move a window the page did not open; the window keeps its place.
  }
}

function readRecord(id: string): WindowRecord | null {
  return readJson(RECORD_PREFIX + id, WindowRecordSchema);
}

function readRecords(): WindowRecord[] {
  const records: WindowRecord[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(RECORD_PREFIX)) {
      const record = readJson(key, WindowRecordSchema);
      if (record) records.push(record);
    }
  }
  return records;
}

function pruneRecords(): void {
  const cutoff = Date.now() - RECORD_TTL_MS;
  for (const record of readRecords()) {
    if (record.seenAt < cutoff) window.localStorage.removeItem(RECORD_PREFIX + record.id);
  }
}

function readPlan(): Plan | null {
  return readJson(PLAN_KEY, PlanSchema);
}

function readLastSession(): WindowRecord[] {
  return readJson(LAST_SESSION_KEY, LastSessionSchema) ?? [];
}

function readJson<T>(key: string, schema: z.ZodType<T>): T | null {
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : parseJson(raw, schema);
}

function parseJson<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await delay(POLL_MS);
  }
  return check();
}
