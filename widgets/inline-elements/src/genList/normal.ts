import { copyThemeStyle } from "../theme/copyThemeStyle";
import { initControls } from "../ui/initControls";
import { bindEvents } from "../ui/bindEvents";
import type { WidgetContext } from "../context/types";
import { getMergedItems, renderIframeList } from "./renderList";

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
