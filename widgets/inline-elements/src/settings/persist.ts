import { setBlockAttrs } from "../api/siyuan";
import type { WidgetContext } from "../context/types";
import { SETTING_ATTR_DEFS, SETTING_KEYS, settingToAttrValue } from "./setting-attrs";

function buildSettingBlockAttrs(ctx: WidgetContext): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    attrs[SETTING_ATTR_DEFS[key].attrName] = settingToAttrValue(ctx.settings[key]);
  }
  return attrs;
}

export async function persistSettings(ctx: WidgetContext): Promise<void> {
  await setBlockAttrs(ctx.widgetBlockId, buildSettingBlockAttrs(ctx));
}
