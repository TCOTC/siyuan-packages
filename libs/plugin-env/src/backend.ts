/**
 * 内核运行容器判定（纯函数，不依赖宿主）
 *
 * 取值来自 `window.siyuan.config.system.container`，由内核在启动时写入
 * （siyuan 仓库 `kernel/model/conf_runtime.go` 的 `system.Container = util.Container`，
 * 常量定义在 siyuan 仓库 `kernel/util/working.go`）。未赋值的早期形状是空字符串。
 *
 * 与 `frontend.ts` 是两条轴：**鸿蒙端的前端仍是桌面布局**（宿主 `getFrontend()` 返回
 * `desktop`），但内核跑在 ArkTS 沙箱里、页面上没有 Electron。只按前端分类判定
 * 「能不能用 Electron」会在鸿蒙端判错。
 */

/** 内核运行容器：`std` 为普通桌面端（Windows / macOS / Linux） */
export type PluginBackend = "std" | "docker" | "android" | "ios" | "harmony";

/** 是否鸿蒙端（HarmonyOS 原生客户端） */
export function isHarmonyBackendOf(container: string | undefined): boolean {
  return container === "harmony";
}
