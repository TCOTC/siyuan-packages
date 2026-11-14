/**
 * 顶栏按钮菜单的定位
 *
 * 顶栏项可以被拖动到工具栏任意位置（siyuan 仓库 `app/src/layout/topBarDrag.ts`），也可能因空间不足被
 * 收进「更多」（同仓库 `app/src/layout/util.ts` 的 `resizeTopBar`）。因此「按插件声明的 `position` 判断方向」
 * 会在拖过之后把菜单弹到对面，「直接量按钮矩形」则会在按钮被收起时拿到全 0 的矩形。
 *
 * 两种弹出风格：
 * - 贴按钮（`openAlignedToButton`）：菜单边缘与按钮对齐，思源自己的顶栏菜单就是这样
 *   （siyuan 仓库 `app/src/plugin/openTopBarMenu.ts`）；
 * - 贴停靠栏（`openFlushToDock`）：菜单贴同侧停靠栏的内边缘，避让出停靠栏的标签栏，不被它压住。
 *
 * 两者都只算坐标交给 `Menu.open`，**不要在 `open` 之后改写元素的内联 `left` / `right`**：菜单内容变化后
 * 宿主会 `resetPosition()` 重算位置且只写 `left`，留下的内联 `right` 会让这个没有 `width` 的 fixed 盒子
 * 被两侧同时撑开，越重算越宽（siyuan-note/siyuan#21447）。
 *
 * 这里也不提供「开合」：`Menu.toggle` 只在贴按钮时够用，它的 `build` / `show` 是同步的，而贴边的消费方
 * 常常要先异步读到数据才建菜单。需要 `toggle` 时自己调它，在 `show` 里用这里的定位函数。
 *
 * 移动端不需要单独分支：`#dockLeft` / `#dockRight` 不存在，算出的坐标宿主也不会用
 * （`Menu.popup` 在移动端直接走 `fullscreen("bottom")`）。
 */

import type { Menu } from "siyuan";

/** 贴边时菜单与停靠栏标签栏之间的间隙 */
export const DOCK_GAP = 1;

/** 贴边时菜单与锚点底边的间隙 */
const FLUSH_VERTICAL_GAP = 1;

/** 交给 `Menu.open` 的位置 */
export interface TopBarMenuPosition {
  x: number;
  y: number;
  /** 为真时 `x` 表示菜单的右边缘，宿主会扣掉菜单自身宽度 */
  isLeft: boolean;
  /** 锚点高度：传了它宿主才会按锚点一侧的可用空间限高 */
  h?: number;
}

/**
 * 顶栏菜单的锚点
 *
 * 按钮被收进「更多」时会被打上 `fn__none`，自身矩形全为 0，此时改用「更多」或插件槽位定位。
 * 三处都取不到（独立窗口、无顶栏）时返回 null，由调用方决定兜底位置。
 */
export function topBarMenuAnchor(button: HTMLElement | null): DOMRect | null {
  const own = button?.getBoundingClientRect();
  if (own !== undefined && own.width > 0) {
    return own;
  }
  for (const id of ["barMore", "barPlugins"]) {
    const rect = document.getElementById(id)?.getBoundingClientRect();
    if (rect !== undefined && rect.width > 0) {
      return rect;
    }
  }
  return null;
}

/** 该侧停靠栏标签栏的宽度；停靠栏不存在或已收起时为 0 */
export function dockWidth(side: "left" | "right"): number {
  const dock = document.getElementById(side === "left" ? "dockLeft" : "dockRight");
  return dock?.getBoundingClientRect().width ?? 0;
}

/** 锚点中心是否落在窗口左半边 */
export function isLeftHalf(anchor: DOMRect, viewportWidth: number): boolean {
  return anchor.left + anchor.width / 2 < viewportWidth / 2;
}

/** 贴按钮边缘：右半边时让菜单右边缘对齐按钮右边缘，否则左边缘对齐按钮左边缘 */
export function buttonAlignedPosition(anchor: DOMRect, viewportWidth: number): TopBarMenuPosition {
  const toLeft = !isLeftHalf(anchor, viewportWidth);
  return {
    x: toLeft ? anchor.right : anchor.left,
    y: anchor.bottom,
    isLeft: toLeft,
    h: anchor.height,
  };
}

/** 贴同侧停靠栏的内边缘；该侧停靠栏收起时即为窗口边缘 */
export function dockFlushedPosition(anchor: DOMRect, viewportWidth: number, dockWidths: { left: number; right: number }): TopBarMenuPosition {
  const toLeft = isLeftHalf(anchor, viewportWidth);
  const edge = (toLeft ? dockWidths.left : dockWidths.right) + DOCK_GAP;
  return {
    x: toLeft ? edge : viewportWidth - edge,
    y: anchor.bottom + FLUSH_VERTICAL_GAP,
    isLeft: !toLeft,
  };
}

/** 没有可用锚点时的兜底位置：贴窗口右上角 */
export function fallbackPosition(viewportWidth: number): TopBarMenuPosition {
  return { x: viewportWidth, y: 0, isLeft: true };
}

/** 贴按钮弹出菜单 */
export function openAlignedToButton(menu: Menu, button: HTMLElement | null): void {
  const anchor = topBarMenuAnchor(button);
  menu.open(anchor === null ? fallbackPosition(window.innerWidth) : buttonAlignedPosition(anchor, window.innerWidth));
}

/** 贴同侧停靠栏弹出菜单 */
export function openFlushToDock(menu: Menu, button: HTMLElement | null): void {
  const anchor = topBarMenuAnchor(button);
  if (anchor === null) {
    menu.open(fallbackPosition(window.innerWidth));
    return;
  }
  menu.open(dockFlushedPosition(anchor, window.innerWidth, { left: dockWidth("left"), right: dockWidth("right") }));
}
