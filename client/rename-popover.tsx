import type { PluginPopoverProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type TextInput as NativeTextInput } from "react-native";
import { MAX_WINDOW_NAME_LENGTH, type WindowNameStore } from "./window-name";

// Paseo dismisses the keyboard while a menu opens: at once, on the next frame, and again 150ms
// later (Internal: packages/app/src/components/ui/keyboard-dismiss.ts). Each dismissal blurs this
// input, so focus goes back to it until they are over.
const DISMISS_WINDOW_MS = 400;

// On desktop the input is a DOM element. It keeps its caret through a blur, so refocusing does not
// move it.
interface DomInput {
  value?: string;
  setSelectionRange?(start: number, end: number): void;
}

export function createRenamePopover(store: Pick<WindowNameStore, "getName" | "rename">) {
  return function RenamePopover({ theme, close }: PluginPopoverProps) {
    const [draft, setDraft] = useState(store.getName);
    const inputRef = useRef<NativeTextInput>(null);
    const openedAt = useRef(Date.now());
    const refocusFrame = useRef(0);

    // Selects the whole name, so typing replaces it.
    const focusInput = () => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const node = input as unknown as DomInput;
      node.setSelectionRange?.(0, node.value?.length ?? 0);
    };

    useEffect(() => {
      // Paseo measures an anchored popover off-screen, then remounts it in its final position.
      // Focus after that remount so the measuring surface cannot take focus back from the input.
      let focusFrame = 0;
      const placementFrame = requestAnimationFrame(() => {
        focusFrame = requestAnimationFrame(focusInput);
      });
      return () => {
        cancelAnimationFrame(placementFrame);
        cancelAnimationFrame(focusFrame);
        cancelAnimationFrame(refocusFrame.current);
      };
    }, []);

    const save = () => {
      store.rename(draft);
      close();
    };

    return (
      <View style={{ padding: 12, gap: 8, minWidth: 240 }}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            if (Date.now() - openedAt.current > DISMISS_WINDOW_MS) return;
            cancelAnimationFrame(refocusFrame.current);
            refocusFrame.current = requestAnimationFrame(() => inputRef.current?.focus());
          }}
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
