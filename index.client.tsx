import type { PluginClientContext } from "@getpaseo/plugin/client";
import { isDesktopWindow, restoreLastSession, startWindowRestore } from "./client/web";

export default function contribute(client: PluginClientContext) {
  if (!isDesktopWindow()) return () => {};
  const stop = startWindowRestore();
  client.addCommandCenterItem({
    id: "restore-windows",
    title: "Restore windows from last session",
    icon: "AppWindow",
    keywords: ["window", "windows", "restore", "reopen", "layout"],
    context: "global",
    async onSelect() {
      if (!(await restoreLastSession())) console.info("[window-restore] no saved windows to restore");
    },
  });
  return stop;
}
