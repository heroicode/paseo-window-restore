# Window restore

A [Paseo](https://paseo.sh) plugin that reopens every desktop window you had open when Paseo last quit, each on its own workspace with its own sidebar filters, theme, and position.

Paseo normally reopens a single window, and every window shares one saved sidebar filter and theme. With this plugin, a window showing one project with a light theme and another showing a different project with a dark theme both come back that way.

## Install

```bash
paseo plugin add heroicode/window-restore
```

This installs the reviewed release from the [Paseo plugin registry](https://paseo.sh/plugins/heroicode/window-restore). To follow this repository's `main` branch instead, use `paseo plugin add git:heroicode/paseo-window-restore`.

Plugins must be enabled on the daemon under **Settings → Plugins → Enable plugins**. Requires the Paseo desktop app (macOS, Windows, or Linux), version 0.14 or later.

## Usage

Restoring needs no setup. When the first window of a new launch loads, the other windows open one at a time, and each settles into its saved state. Windows you closed before quitting are not reopened.

**Restore windows from last session** in the Command Center (⌘K) runs the same restore on demand, for example after closing windows by accident.

## Settings

Find this under **Settings → Plugins → Window restore**:

- **Hide window names:** on by default. Turn it off to give windows custom names. Turning it back on hides names without deleting them.

While names are shown, select **Name this window** at the top of the sidebar, or search for **Rename this window** in the Command Center, to name a window. The name appears in the operating system's window title and returns with that window after a restart.

## How it works

While a window is open, the plugin records its route, sidebar Host and Project filters, theme, position, size, and name. On the next launch, it writes one window's filters, workspace, and theme where Paseo reads them at startup, opens a new window, waits for it to load, and moves on to the next. A window that opens somewhere else reloads into its saved state. The window that started the restore takes its own saved state last.

## Data

Everything is stored in the desktop app's local storage. The plugin makes no network requests and has no server code.

## Limitations

- **It relies on desktop internals.** Paseo gives plugins no API for windows, routes, sidebar filters, or the theme, so the plugin uses the `sidebar-view` and `@paseo:app-settings` local storage keys, the app's route format, and the desktop New Window bridge. A Paseo update can change any of these.
- **Windows reopen on the current desktop or Space.** Positions are restored only where the operating system allows a window to move itself.
- **Restored windows briefly show the wrong state.** A window may load on another workspace and then reload into its own.
- **A theme that no longer exists falls back to Paseo's default,** as it does in Paseo without the plugin. A plugin theme returns once its plugin loads.
- **Desktop app only.** The plugin does nothing in the web or mobile apps.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"        # first time
paseo plugin reload window-restore # after edits
paseo plugin logs window-restore
```

## License

[MIT](LICENSE)
