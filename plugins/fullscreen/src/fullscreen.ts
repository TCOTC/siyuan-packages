import { type IProtyle } from "siyuan";

export interface FullscreenConfig {
  editorFullscreen: boolean;
  windowFullscreen: boolean;
}

interface ElectronBrowserWindow {
  isFullScreen: () => boolean;
  setFullScreen: (flag: boolean) => void;
}

const getNodeRequire = () => {
  const requireFn = window.require;
  if (typeof requireFn !== "function") {
    return undefined;
  }
  return requireFn;
};

/** 通过 @electron/remote 取得当前 BrowserWindow */
const getElectronWindow = (): ElectronBrowserWindow | undefined => {
  const requireFn = getNodeRequire();
  if (!requireFn) {
    return undefined;
  }
  try {
    const remote = requireFn("@electron/remote") as { getCurrentWindow?: () => ElectronBrowserWindow };
    const currentWindow = remote?.getCurrentWindow?.();
    if (currentWindow && typeof currentWindow.isFullScreen === "function" && typeof currentWindow.setFullScreen === "function") {
      return currentWindow;
    }
  } catch {
    // 浏览器前端或不具备 remote 时忽略
  }
  return undefined;
};

const isWindowFullscreen = (): boolean => {
  const electronWindow = getElectronWindow();
  if (electronWindow) {
    return electronWindow.isFullScreen();
  }
  // 页面全屏 API：当前处于全屏的元素，没有则为空。不是操作系统窗口全屏。
  if (document.fullscreenElement) {
    return true;
  }
  return document.body.classList.contains("body--fullscreen");
};

const setWindowFullscreen = (enter: boolean) => {
  const electronWindow = getElectronWindow();
  if (electronWindow) {
    if (electronWindow.isFullScreen() !== enter) {
      electronWindow.setFullScreen(enter);
    }
    return;
  }
  // 无 Electron 窗口时用页面全屏 API 回退
  if (enter) {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    }
    return;
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  }
};

/** 已启用的项是否都处于全屏。未启用的项不参与判断。 */
const isConfiguredFullscreen = (editorIsFS: boolean, config: FullscreenConfig): boolean => {
  return (!config.editorFullscreen || editorIsFS) && (!config.windowFullscreen || isWindowFullscreen());
};

/**
 * 按当前真实状态进入或退出。不缓存开关：用户可能已用原生快捷键、系统全屏等改过状态。
 * 已启用项只要有一个未全屏则全部进入全屏，都已全屏则全部退出。
 */
export const toggleConfiguredFullscreen = (protyle: IProtyle, config: FullscreenConfig) => {
  if (!config.editorFullscreen && !config.windowFullscreen) {
    return;
  }
  const editor = protyle.getInstance();
  const enter = !isConfiguredFullscreen(editor.isFullscreen(), config);
  if (config.editorFullscreen) {
    editor.setFullscreen(enter);
  }
  if (config.windowFullscreen) {
    setWindowFullscreen(enter);
  }
};
