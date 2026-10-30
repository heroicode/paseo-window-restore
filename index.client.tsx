import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useSyncExternalStore } from "react";
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
  const RenamePopover = createRenamePopover({ getName: getWindowName, rename: renameWindow });

  function WindowNameItem({ openPopover }: PluginSidebarItemProps) {
    const name = useSyncExternalStore(subscribeWindowName, getWindowName);
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
    removeNameItem();
    stop();
  };
}
