import type { WidgetContext } from "../context/types";
import { getMergedItems, replaceWidgetWithList } from "./render-list";

export async function genListExportImg(ctx: WidgetContext): Promise<void> {
  const items = await getMergedItems(ctx);
  replaceWidgetWithList(ctx, items, false);
}
