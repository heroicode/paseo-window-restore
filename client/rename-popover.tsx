import type { PluginPopoverProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MAX_WINDOW_NAME_LENGTH, type WindowNameStore } from "./window-name";

export function createRenamePopover(store: Pick<WindowNameStore, "getName" | "rename">) {
  return function RenamePopover({ theme, close }: PluginPopoverProps) {
    const [draft, setDraft] = useState(store.getName);

    const save = () => {
      store.rename(draft);
      close();
    };

    return (
      <View style={{ padding: 12, gap: 8, minWidth: 240 }}>
        <TextInput
          autoFocus
          selectTextOnFocus
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={save}
          maxLength={MAX_WINDOW_NAME_LENGTH}
          placeholder="Window name"
          placeholderTextColor={theme.colors.foregroundMuted}
          accessibilityLabel="Window name"
          style={{
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface1,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 6,
          }}
        />
        <Pressable
          onPress={save}
          accessibilityRole="button"
          style={{ alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Text style={{ color: theme.colors.foreground }}>Save</Text>
        </Pressable>
      </View>
    );
  };
}
