/**
 * 思源插件的前端环境判定
 *
 * 思源有五个前端：桌面、分离窗口、移动端，以及浏览器里的桌面版与移动版。判定必须走宿主的
 * `getFrontend()`，不要自己嗅探 UA：分离窗口、设置窗口与主窗口的 `navigator.userAgent` 相同，
 * 只有宿主知道当前是哪个前端。
 *
 * 取值来源：`siyuan` 包的 `siyuan.d.ts` 里声明的 `getFrontend()`。
 */

import { getFrontend } from "siyuan";
import { isDesktopClientFrontendOf, isMobileFrontendOf } from "./frontend.ts";

export { isDesktopClientFrontendOf, isMobileFrontendOf, type PluginFrontend } from "./frontend.ts";

/** 当前前端是否为移动端 */
export function isMobileFrontend(): boolean {
  return isMobileFrontendOf(getFrontend());
}

/** 当前前端是否为桌面客户端（不含浏览器桌面版） */
export function isDesktopClientFrontend(): boolean {
  return isDesktopClientFrontendOf(getFrontend());
}
