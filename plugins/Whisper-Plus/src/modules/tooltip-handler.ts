import type { IEventBusMap, Plugin } from "siyuan";
import { logging } from "../logger";
import { isLocalPath } from "../utils";

/**
 * 悬浮提示处理器：通过事件总线 before-show-tooltip / before-hide-tooltip
 * 给 tooltip 添加 data-whisper-tooltip，供主题样式区分
 */
export class TooltipHandler {
  private tooltipElement: HTMLElement | null = null;

  constructor(private readonly plugin: Plugin) {}

  private getTooltipElement(): void {
    if (!this.tooltipElement) {
      this.tooltipElement = document.getElementById("tooltip");
    }
  }

  public init(): void {
    this.getTooltipElement();
    if (!this.tooltipElement) {
      logging.error("tooltip element does not exist.");
    }

    this.plugin.eventBus.on("before-show-tooltip", this.onBeforeShowTooltip);
    this.plugin.eventBus.on("before-hide-tooltip", this.onBeforeHideTooltip);
  }

  public destroy(): void {
    this.plugin.eventBus.off("before-show-tooltip", this.onBeforeShowTooltip);
    this.plugin.eventBus.off("before-hide-tooltip", this.onBeforeHideTooltip);

    this.getTooltipElement();
    this.tooltipElement?.removeAttribute("data-whisper-tooltip");
    this.tooltipElement = null;
  }

  private onBeforeShowTooltip = (event: CustomEvent<IEventBusMap["before-show-tooltip"]>): void => {
    const { target, tooltipElement } = event.detail ?? {};
    if (tooltipElement instanceof HTMLElement) {
      this.tooltipElement = tooltipElement;
    } else {
      this.getTooltipElement();
    }

    if (!(target instanceof HTMLElement) || !this.tooltipElement) {
      return;
    }

    this.setTooltipData(this.classifyTooltip(target));
  };

  /** 隐藏时不清空属性：href / tab_header 的淡出动画依赖它仍在。 */
  private onBeforeHideTooltip = (event: CustomEvent<IEventBusMap["before-hide-tooltip"]>): void => {
    const { tooltipElement } = event.detail ?? {};
    if (tooltipElement instanceof HTMLElement) {
      this.tooltipElement = tooltipElement;
    }
    // 不在此处清空属性：href / tab_header 的淡出依赖属性仍在
  };

  private classifyTooltip(e: HTMLElement): string {
    // 按触发频率从高到低判断
    const href = e.getAttribute("data-href");
    if (href) {
      if (isLocalPath(href)) {
        return "href_asset";
      }
      return "href";
    }

    if (e.closest('[data-type="tab-header"]')) {
      return "tab_header";
    }

    if (
      e.closest("[data-av-id]") // 数据库块、属性面板数据库选项卡
      || e.closest(".av__panel") // 数据库菜单：选项描述、资源字段条目
    ) {
      return "av";
    }

    if (e.classList.contains("emojis__item") || e.classList.contains("emojis__type")) {
      return "emoji";
    }

    // 块备注角标 https://github.com/siyuan-note/siyuan/pull/16025
    if (e.closest(".protyle-attr--memo")) {
      return "block_memo";
    }

    return "";
  }

  private setTooltipData(data: string): void {
    if (!this.tooltipElement) return;

    if (this.tooltipElement.dataset?.whisperTooltip !== data) {
      this.tooltipElement.dataset.whisperTooltip = data;
    }
  }
}
