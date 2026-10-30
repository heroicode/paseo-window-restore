import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useSyncExternalStore } from "react";
import { createRenameAction } from "./client/rename-action";
import { createRenamePopover } from "./client/rename-popover";
import {
  getWindowName,
  isDesktopWindow,
  renameWindow,
  restoreLastSession,
  startWindowRestore,
  subscribeWindowName,
} from "./client/web";

export default function contribute(client: PluginClientContext) {
  if (!isDesktopWindow()) return () => {};
  const stop = startWindowRestore();
  // Paseo can evaluate a client contribution more than once in the same window.
  // Only the instance that owns the window controller should register shared UI.
  if (!stop) return () => {};
  const RenamePopover = createRenamePopover({ getName: getWindowName, rename: renameWindow });
  const renameAction = createRenameAction();

  function WindowNameItem({ openPopover }: PluginSidebarItemProps) {
    const name = useSyncExternalStore(subscribeWindowName, getWindowName);
    useEffect(
      () => renameAction.bind(() => openPopover(RenamePopover)),
      [openPopover],
    );
    return (
      <SidebarRow
        icon="AppWindow"
        label={name || "Name this window"}
        onPress={() => openPopover(RenamePopover)}
      />
    );
  }

  const removeNameItem = client.addSidebarHeaderItem({
    id: "window-name",
    title: "Window name",
    Component: WindowNameItem,
  });
  const removeRenameCommand = client.addCommandCenterItem({
    id: "rename-window",
    title: "Rename this window",
    icon: "AppWindow",
    keywords: ["name", "rename", "window", "title", "label"],
    context: "global",
    onSelect() {
      // Let the Command Center close before opening the anchored popover.
      setTimeout(() => renameAction.run(), 0);
    },
  });
  const removeRestoreCommand = client.addCommandCenterItem({
    id: "restore-windows",
    title: "Restore windows from last session",
    icon: "AppWindow",
    keywords: ["window", "windows", "restore", "reopen", "layout"],
    context: "global",
    async onSelect() {
      if (!(await restoreLastSession())) console.info("[window-restore] no saved windows to restore");
    },
  });
  return () => {
    removeRestoreCommand();
    removeRenameCommand();
    removeNameItem();
    stop();
  };
}
