Add a fullscreen button to the document breadcrumb. Editor fullscreen and window fullscreen can be configured separately.

Works on desktop, desktop detached windows, and the desktop browser.

## Features

- Breadcrumb button: click to toggle fullscreen according to the current settings
- Editor fullscreen: the current document fills the window, same as SiYuan's native editor fullscreen
- Window fullscreen: on desktop, fullscreen the app window; in the browser, use page fullscreen
- Icons follow live state: after you change fullscreen with a native shortcut or the OS, the button still shows the correct enter / exit icon
- The breadcrumb button is hidden when both editor fullscreen and window fullscreen are disabled

## Settings

Each option can be turned on or off in the plugin settings:

- **Editor fullscreen**: make the current document editor fill the window
- **Window fullscreen**: on desktop, fullscreen the app window via the Electron API; in the browser, use the Page Fullscreen API

Both are on by default.

## Toggle rules

Only enabled options are handled. Disabled options are left unchanged.

- If any enabled option is not fullscreen, clicking enters fullscreen for all enabled options
- If every enabled option is already fullscreen, clicking exits all of them

For example, with both options on: if the editor is already fullscreen and the window is not, clicking again will enter window fullscreen and will not exit editor fullscreen.

## Keyboard shortcut

The plugin provides the command "Toggle fullscreen for the current editor". It has no default shortcut. Bind one in **Settings - Keymap**. Pressing it runs the same toggle as the button on the active editor; if focus is not in an editor, the most recently focused document is used.
