import { Constants } from "siyuan";
import { i18n } from "./i18n";
import { message } from "./message";

declare global {
  interface Window {
    require?(moduleName: "electron"): typeof import("electron");
    require?(moduleName: string): any;
  }
}

export const electron: typeof import("electron") | undefined = (() => {
  try {
    return typeof window !== "undefined" ? window.require?.("electron") : undefined;
  } catch {
    return undefined;
  }
})();

export async function openDirectory(path: string): Promise<void> {
  if (!path || !path.trim()) {
    return;
  }
  try {
    if (!electron) {
      message(i18n.openDirectoryFailed + i18n.openDirectoryNoElectron);
      return;
    }
    const workspaceDir = (window.siyuan.config?.system.workspaceDir ?? "").trim();
    if (!workspaceDir) {
      message(i18n.openDirectoryFailed + i18n.openDirectoryNoWorkspace);
      return;
    }
    const fullPath = `${workspaceDir}/${path}`;
    if (electron.ipcRenderer) {
      electron.ipcRenderer.send(Constants.SIYUAN_CMD, {
        cmd: "openPath",
        filePath: fullPath,
      });
      return;
    }
    const openErr = await electron.shell.openPath(fullPath);
    if (openErr) {
      throw new Error(openErr);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    message(i18n.openDirectoryFailed + detail);
  }
}

export function toggleDevTools(): void {
  electron?.ipcRenderer?.send(Constants.SIYUAN_CMD, "toggleDevTools");
}

/**
 * 还原并激活当前窗口
 *
 * 宿主把 `siyuan://` 链接转给渲染进程时不会激活窗口（`app/electron/main.js` 的 `second-instance` 分支只在
 * 没有链接时才调 `showWindow`），因此以深链为入口的功能需要自己补一次。这与思源处理块链接时调用的是
 * 同一条命令。浏览器端与移动端没有 Electron，调用即空操作
 */
export function showWindow(): void {
  electron?.ipcRenderer?.send(Constants.SIYUAN_CMD, "show");
}
