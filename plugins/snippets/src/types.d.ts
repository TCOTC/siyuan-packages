import type { ISiyuan } from "siyuan";

// `window.siyuan` 与 `window.Lute` 本身由 siyuan 包声明（`declare global { interface Window extends Global {} }`），
// 这里只把运行期必然存在的三个字段从可选收窄成必选，省掉全包的空值断言。
// 只有需要这种收窄的包才写这段；其余包直接用上游类型即可。
declare global {
  interface Window {
    siyuan: ISiyuan & {
      config: NonNullable<ISiyuan["config"]>;
      menus: NonNullable<ISiyuan["menus"]>;
      languages: NonNullable<ISiyuan["languages"]>;
    };
  }
}

/**
 * 设置项类型
 */
interface SettingItem {
  title?: string;
  description?: string;
  direction?: "row" | "column";
  actionElement?: HTMLElement;
  createActionElement?: () => HTMLElement;
}

/**
 * 文件状态类型
 */
interface FileState {
  path: string;
  lastModified: number;
  content: string;
}

/**
 * 代码片段类型（css 或 js）
 */
type SnippetType = "css" | "js";

/**
 * 代码片段类型
 * 参考 siyuan 仓库 `app/src/types/index.d.ts` 的 ISnippet
 */
interface Snippet {
  id: string;
  name: string;
  content: string;
  type: SnippetType;
  enabled: boolean;
  disabledInPublish?: boolean | undefined;
}

// 扩展 Setting 类
declare module "siyuan" {
  interface Setting {
    items: SettingItem[];

    // 上游 siyuan 类型 addItem 的 title 为必选，本插件设置项标题来自 i18n 键（类型上可能缺失），
    // 此处覆盖为可选以匹配 createSettingItem 的返回类型
    addItem(options: { title?: string; direction?: "column" | "row"; description?: string; actionElement?: HTMLElement; createActionElement?(): HTMLElement }): void;
  }
}

// 拓展 Dialog 类（上游 siyuan 类型未含这三个成员）：
// - `id` / `destroyCallback` 是内核实例字段（siyuan 仓库 `app/src/dialog/index.ts` 的 `this.id = genUUID()`
//   与 `this.destroyCallback = options.destroyCallback`），只是类型声明漏了；
// - `destroyNative` 是本包的约定（备份原生 destroy 后覆盖 destroy 做清理）。
declare module "siyuan" {
  interface Dialog {
    id: string;
    destroyNative: () => void;
    destroyCallback?: (options?: any) => void;
  }
}

export { Snippet, SnippetType, SettingItem, FileState };
