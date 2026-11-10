import type { WidgetContext } from "../context/types";
import { persistSettings } from "../settings/persist";
import { attrValueToSetting } from "../settings/setting-attrs";

export function bindEvents(ctx: WidgetContext, onRefresh: () => void): void {
  const { elements, settings } = ctx;
  const { filterType, embedBlocks, refreshList, contentList } = elements;

  filterType.addEventListener("change", function (): void {
    settings.filterType = filterType.value;
    void persistSettings(ctx);
    onRefresh();
  });

  embedBlocks.addEventListener("change", function (): void {
    settings.isEmbedBlocks = attrValueToSetting("isEmbedBlocks", embedBlocks.value);
    void persistSettings(ctx);
    onRefresh();
  });

  refreshList.addEventListener("click", function (): void {
    onRefresh();
  });

  // 列表项：走父窗口 open，以便思源拦截 siyuan:// 协议
  contentList.addEventListener("click", function (event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const item = target.closest("[data-href]");
    if (!item) {
      return;
    }
    const href = item.getAttribute("data-href");
    if (!href) {
      return;
    }
    parent.window.open(href);
  });
}
