import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useSyncExternalStore } from "react";
import type { NamesSetting } from "./names-setting";

export function createSettingsScreen(setting: Pick<NamesSetting, "hidden" | "setHidden" | "subscribe">) {
  return function SettingsScreen() {
    const hidden = useSyncExternalStore(setting.subscribe, setting.hidden);
    return (
      <SettingsSection title="Window restore">
        <SettingsCard>
          <SettingsSwitch
            label="Hide window names"
            hint="Removes Name this window and its Command Center action, and leaves window titles as Paseo sets them. Names you already gave windows are kept for when you turn this off."
            value={hidden}
            onValueChange={setting.setHidden}
          />
        </SettingsCard>
      </SettingsSection>
    );
  };
}
