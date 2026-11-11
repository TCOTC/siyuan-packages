import { getModelByDockType } from "siyuan";

import { logging } from "../logger";
import { waitForElement } from "../utils";

/**
 * 文档树模型里持有选中态的原生控制器
 *
 * 选中态存在控制器里，`.b3-list-item--focus` 只是它渲染时写上的类名。文档树自
 * siyuan 仓库 `app/src/layout/dock/docTree/DocTreeController.ts` 起是扁平虚拟列表，
 * `Files.element` 只含可视区，直接改 DOM 类名会在行被回收重挂后失效。
 * 上游类型包里没有导出这个控制器，只按这里用到的成员收窄。
 */
interface IDocTreeModel {
  docTree?: {
    clearSelection: () => void;
    /** 用户交互版本号：选中与展开/收起都会递增 */
    readonly interactionVersion?: number;
  };
}

/**
 * 点击文档树空白处，取消选中文档或笔记本
 *
 * // TODO跟进 可能需要修改原生机制 https://github.com/siyuan-note/siyuan/issues/14858
 */
export class FileTreeClickHandler {
  private syFileElement: HTMLElement | null = null;
  /** 清选中任务的序号，只有最后一次点击排出的任务会真正执行 */
  private clearToken = 0;
  /** 被内联背景色压住的行 → 原内联背景色，清选中结束后恢复 */
  private pinnedBackgrounds = new Map<HTMLElement, string>();
  /** 当前拥有上述压制的点击序号 */
  private backgroundToken = -1;

  public async init(): Promise<void> {
    if (document.body.classList.contains("body--window")) {
      // 新窗口没有文档树
      return;
    }

    const syFileElement = await waitForElement(".sy__file");
    if (!syFileElement) {
      logging.warn("Max retries reached. Could not find .sy__file element.");
      return;
    }

    this.syFileElement = syFileElement;
    this.syFileElement.addEventListener("click", this.handleClick, true);
  }

  public destroy(): void {
    this.syFileElement?.removeEventListener("click", this.handleClick, true);
    this.syFileElement = null;
    this.clearToken++;
    this.releaseBackground();
  }

  /**
   * 处理 .sy__file 元素的点击事件
   */
  private handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // 按下修饰键时忽略处理。比如多选笔记本可以拖拽排序，所以不能完全禁止选中笔记本
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    // 行内操作与面板工具栏交给思源。删除等菜单项会在点击时查询 .b3-list-item--focus，
    // 若这里清掉选中态，菜单只会关闭而不会弹出确认框。
    if (target.closest(".b3-list-item__icon, .b3-list-item__toggle, .b3-list-item__action, .b3-list-item__switch, .block__icon")) {
      return;
    }

    const notebook = target.closest('.b3-list-item[data-type="navigation-root"]') as HTMLElement | null;
    if (!notebook && target.closest(".b3-list")) {
      // 点击文档区域时跳过
      return;
    }

    // 在原生监听器处理之前记下交互版本：点击笔记本标题会先选中、再展开/收起，两者都会推高它
    const tree = (getModelByDockType("file") as IDocTreeModel | undefined)?.docTree;
    const before = tree?.interactionVersion;
    const token = ++this.clearToken;

    // 解决点击笔记本时 b3-list-item--focus 类名闪现造成的背景色闪烁。
    // 清选中要等展开动画结束（见 clearSelection 的说明），所以这层内联背景色要一直压到那时才撤，
    // 否则高亮会在整段动画期间都亮着。
    if (notebook) {
      this.holdBackground(notebook, token);
    } else {
      // 点击空白处：压住的高亮转交给本次清选中，避免提前撤下来闪一帧
      this.takeOverBackground(token);
    }

    // 等思源原生的监听器处理完点击事件之后再操作
    setTimeout(() => {
      // 交给原生控制器清空选中：它同时重置选区锚点，并按新的选中态重渲染（含离屏行）
      void this.clearSelection(tree, token, before).finally(() => {
        this.releaseBackground(token);
      });
    });
  };

  /**
   * 用内联背景色压住选中态
   *
   * 内联样式优先级高于 `--b3-list-hover` 那类普通规则，所以 `decorate()` 写上的
   * `.b3-list-item--focus` 背景不会显示出来；取值是点击前（未选中时）的计算值，
   * 正常情况下没有内联背景色。连续点击同一行时沿用最初记下的内联值，
   * 不要拿已被压住的颜色覆盖回去，只把归属转给新一次点击。
   */
  private holdBackground(element: HTMLElement, token: number): void {
    this.backgroundToken = token;
    if (this.pinnedBackgrounds.has(element)) {
      return;
    }
    this.pinnedBackgrounds.set(element, element.style.backgroundColor);
    element.style.backgroundColor = window.getComputedStyle(element).backgroundColor;
  }

  /** 把压住的高亮转交给新一次点击，由它清选中完成后再恢复 */
  private takeOverBackground(token: number): void {
    if (this.pinnedBackgrounds.size) {
      this.backgroundToken = token;
    }
  }

  /**
   * 恢复被压住行的内联背景色
   *
   * 不带 `token` 时无条件恢复（插件卸载）；带 `token` 时只有归属者才能恢复，
   * 否则一次已被取代的点击会把后一次点击的压制提前撤掉。
   */
  private releaseBackground(token?: number): void {
    if (token !== undefined && this.backgroundToken !== token) {
      return;
    }
    this.pinnedBackgrounds.forEach((style, element) => {
      element.style.backgroundColor = style;
    });
    this.pinnedBackgrounds.clear();
  }

  /**
   * 清空文档树选中（只在展开/收起结束后执行）
   *
   * `clearSelection()` 会推高控制器的交互版本号，并通过 `selectionChanged()` 重渲染；
   * 而 `toggle()` 只在交互版本号未变化时才调用 `animateRows()` 播放展开/收起动画，
   * `render()` 开头又会先结束正在进行的动画（siyuan 仓库
   * `app/src/layout/dock/docTree/DocTreeController.ts`）。
   * 点击笔记本标题会先选中（版本号 +1）再展开（再 +1），若随后立即清选中，
   * 这次展开的动画就会被整段跳过 —— 表现为只有笔记本这一层没有动画。
   *
   * 因此本次点击已推高交互版本时，等加载占位与 200ms 过渡结束后再清。
   */
  private async clearSelection(tree: IDocTreeModel["docTree"], token: number, before: number | undefined): Promise<void> {
    if (!tree) {
      return;
    }
    if (before !== undefined && tree.interactionVersion !== before) {
      // 串行轮询是为了每轮都读到最新的 DOM：控制器用 RAF 渲染，加载占位与动画容器不同步出现。
      // 上限约 3 秒，超过说明子目录始终加载不完，此时退回旧行为直接清选中。
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 32));
        if (token !== this.clearToken) {
          return; // 已被后续点击取代，由那次点击负责清理
        }
        // 页面不可见时浏览器会暂停动画、把定时器节流到秒级，动画可能永远跑不完；此时没有动画要保
        if (document.hidden || !this.isTreeAnimating()) {
          break;
        }
      }
    }
    if (token !== this.clearToken) {
      return;
    }
    tree.clearSelection();
  }

  /** 文档树正在加载子目录，或正在播放展开/收起动画 */
  private isTreeAnimating(): boolean {
    const root = this.syFileElement;
    return Boolean(root?.querySelector("[data-tree-animation], [data-tree-key][aria-busy='true']"));
  }
}
