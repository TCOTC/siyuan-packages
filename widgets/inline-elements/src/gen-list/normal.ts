import { copyThemeStyle } from "../theme/copy-theme-style";
import { initControls } from "../ui/init-controls";
import { bindEvents } from "../ui/bind-events";
import type { WidgetContext } from "../context/types";
import { getMergedItems, renderIframeList } from "./render-list";

export async function runNormalMode(ctx: WidgetContext, handleError: (error: unknown) => void): Promise<void> {
  initControls(ctx);
  bindEvents(ctx, () => {
    void genListNormal(ctx).catch(handleError);
  });
  await genListNormal(ctx);
}

export async function genListNormal(ctx: WidgetContext): Promise<void> {
  await Promise.all([copyThemeStyle(ctx.htmlElement, ctx.mode), getMergedItems(ctx).then((items) => renderIframeList(ctx, items, true))]);
}
