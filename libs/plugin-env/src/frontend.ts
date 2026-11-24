/**
 * 前端分类判定（纯函数，不依赖宿主）
 *
 * 与 `index.ts` 分开是为了让单测能直接跑：`index.ts` 从 `siyuan` 取 `getFrontend()`，
 * 而 `siyuan` 包只有类型声明，Node 里没有可执行的实现。
 */

/** 与宿主 `getFrontend()` 的取值一致 */
export type PluginFrontend = "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile";

/**
 * 是否移动端前端（原生移动端或浏览器移动版）
 *
 * 移动端缺少桌面的整套布局元素（`#toolbar`、`#barPlugins`、`#dockLeft`、`#dockRight`），
 * 自定义页签也完全没有实现（宿主的 `openTab` / `addTab` / `getAllTabs` 在移动端都是空实现）。
 * 与「有没有 Electron」是两件事：浏览器桌面版同样没有 Electron，但有完整的桌面布局。
 */
export function isMobileFrontendOf(frontend: string): boolean {
  return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * 是否桌面客户端（桌面应用与分离窗口）
 *
 * 只回答「宿主前端类型是桌面客户端」，**不代表一定有 Electron**：鸿蒙端同样返回
 * `desktop`，但它跑在 ArkWeb 里。需要 Electron 能力时用 `index.ts` 的
 * `isElectronFrontend()`。也不含浏览器桌面版。
 */
export function isDesktopClientFrontendOf(frontend: string): boolean {
  return frontend === "desktop" || frontend === "desktop-window";
}
