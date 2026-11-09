import { i18n } from "../i18n";
import { WIDGET_BLOCK_ID_PATTERN } from "../util";
import { showError } from "../ui/message";
import { copyThemeStyle } from "../theme/copyThemeStyle";
import type { RuntimeMode, WidgetContext, WidgetSettings } from "./types";

/** 解析挂件块与 DOM；失败时渲染错误并返回 null。 */
export async function createContext(): Promise<WidgetContext | null> {
  const { widgetBlock, widgetBlockId, hasValidBlockId } = resolveWidgetBlock();

  const htmlElement = window.frameElement?.ownerDocument?.documentElement;
  const mode = widgetBlock ? detectMode(widgetBlock) : "normal";
  const filterTypeElement = document.getElementById("filterType") as HTMLSelectElement | null;
  const embedBlocksElement = document.getElementById("embedBlocks") as HTMLSelectElement | null;
  const refreshListElement = document.getElementById("refreshList") as HTMLButtonElement | null;
  const contentListElement = document.getElementById("contentList") as HTMLElement | null;

  if (!hasValidBlockId || !htmlElement || !filterTypeElement || !embedBlocksElement || !refreshListElement || !contentListElement) {
    if (htmlElement) {
      await copyThemeStyle(htmlElement, mode);
    }
    showError(document.body, i18n.errorMessage);
    return null;
  }

  const ctx: WidgetContext = {
    widgetBlock: widgetBlock!,
    widgetBlockId: widgetBlockId!,
    htmlElement,
    elements: {
      filterType: filterTypeElement,
      embedBlocks: embedBlocksElement,
      refreshList: refreshListElement,
      contentList: contentListElement,
    },
    mode,
    settings: {} as WidgetSettings,
  };

  return ctx;
}

function resolveWidgetBlock(): {
  widgetBlock: HTMLElement | null;
  widgetBlockId: string | null;
  hasValidBlockId: boolean;
} {
  const widgetBlock = window.frameElement?.closest("[data-node-id], [id]") as HTMLElement | null;
  if (!widgetBlock) {
    return { widgetBlock: null, widgetBlockId: null, hasValidBlockId: false };
  }

  // 优先 data-node-id（编辑区），其次 id（导出预览）
  const widgetBlockId = widgetBlock.getAttribute("data-node-id") ?? widgetBlock.getAttribute("id");
  const hasValidBlockId = widgetBlockId !== null && WIDGET_BLOCK_ID_PATTERN.test(widgetBlockId);

  return { widgetBlock, widgetBlockId, hasValidBlockId };
}

function detectMode(widgetBlock: Element): RuntimeMode {
  if (widgetBlock.closest(".export-img")) {
    return "export-img";
  }
  if (widgetBlock.closest("#preview")) {
    return "export-pdf";
  }
  // 导出预览：无 data-node-id，仅有 id（导出图片/PDF 时两者并存，已在上方优先判定）
  if (!widgetBlock.hasAttribute("data-node-id") && widgetBlock.hasAttribute("id")) {
    return "preview";
  }
  return "normal";
}
