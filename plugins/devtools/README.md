Provides common development helpers in the top bar and the command panel: reload the window, open plugin-related directories, and toggle developer tools. Desktop uses the system developer tools; mobile uses [vConsole](https://github.com/Tencent/vConsole).

Works on all backends and frontends. Disabled in the publish service.

## Features

- **Reload the window**: calls the SiYuan API to refresh the UI without restarting the whole app
- **Open plugin directory**: opens the workspace `data/plugins` folder in the system file manager
- **Open plugin storage directory**: opens the workspace `data/storage/petal` folder (persistent data for each plugin)
- **Toggle developer tools**
  - Desktop / desktop detached window: toggle Electron developer tools
  - Mobile / browser mobile: show or hide the vConsole green switch. The first use creates an instance; the theme follows SiYuan's light / dark mode

## How to use

**Desktop, desktop detached window, and browser desktop**: click the DevTools button on the top bar and choose an action from the menu.

**Mobile and browser mobile**: the right sidebar provides two separate items — reload the window, and toggle developer tools (vConsole).

These actions are also registered as commands. Bind shortcuts in **Settings → Keymap**. There is no default shortcut.

## Platform differences

| Capability                    | Desktop / detached window | Browser desktop | Mobile / browser mobile |
| ----------------------------- | ------------------------- | --------------- | ----------------------- |
| Reload the window             | ✓                         | ✓               | ✓                       |
| Open plugin directory         | ✓                         | —               | —                       |
| Open plugin storage directory | ✓                         | —               | —                       |
| Developer tools               | Client built-in DevTools  | —               | vConsole                |
