import type { WidgetContext } from "../context/types";
import { getMergedItems, replaceWidgetWithList } from "./renderList";

export async function genListExportPdf(ctx: WidgetContext): Promise<void> {
  const items = await getMergedItems(ctx);
  replaceWidgetWithList(ctx, items, true);
}
