import type { IEventBusMap } from "siyuan";

/**
 * npm 上的 siyuan 类型包（catalog 里的 1.2.9）落后于 petal 仓库 main：
 * 旧仓库用的是 `github:siyuan-note/petal#67d2f50`，本插件用到的三处声明只在那份里有。
 * 仓库统一使用已发布版本（见仓库 README §7），所以把缺口收在这里，只补实际用到的成员。
 * catalog 升级到包含这些声明的版本后，删掉本文件并重新 typecheck 即可确认。
 */

/** open-menu-doctree 的 items 在 3.8.10-beta.5+ 额外带排序信息 */
export type DoctreeMenuItem = IEventBusMap["open-menu-doctree"]["items"][number] & {
  /** 文档（或笔记本根列表）当前生效的排序方式；6 为自定义排序，15 已由内核解析成实际值 */
  effectiveSortMode?: number;
  /** 文档为其子文档列表声明的排序方式，null 表示继承 */
  childrenSortMode?: number | null;
};

/** 1.2.9 把 i18n 声明为 Record<string, JSONValue>，运行时是纯字符串 */
export function texts(i18n: Record<string, unknown>): Record<string, string> {
  return i18n as Record<string, string>;
}

/** 1.2.9 的 Title 类型没有 getText()，运行时（3.8.10-beta.5+）提供纯文本摘要 */
export function getDocTitle(title: unknown): string {
  return (title as { getText(): string } | undefined)?.getText() ?? "";
}
