/**
 * 文案的真相在 `src/i18n/*.json`，与插件包的组织方式一致；但**挂件没有插件那条 i18n 注入路径**
 * （思源仓库 `kernel/model/plugin.go` 的 loadPlugin 只读插件的 i18n 目录），所以这三份 JSON
 * 由本文件导入、被打包器内联进 index.html，产物里不会出现 i18n/ 目录。
 * 单文件的 index.html 里既有译文也有查表逻辑，挂件在运行时自己挑语言。
 */
import en from "./i18n/en.json";
import zhCN from "./i18n/zh-CN.json";
import zhTW from "./i18n/zh-TW.json";
import type { AssertTrue, SameKeys } from "siyuan-i18n-types";

/** 键集合以 zh-CN 为参照，三份必须完全一致。 */
export type I18nKey = keyof typeof zhCN;

/** 另两份译文与 zh-CN 的键集合必须逐一相同；不一致时 tsc 会在这一行报错。 */
export type LocaleKeyCheck = [AssertTrue<SameKeys<keyof typeof zhCN, keyof typeof zhTW>>, AssertTrue<SameKeys<keyof typeof zhCN, keyof typeof en>>];

const MESSAGES = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en,
} satisfies Record<string, Record<I18nKey, string>>;

type Locale = keyof typeof MESSAGES;

/** 当前语言的文案（类型以 zhCN 为参照，便于 IDE 悬浮与跳转） */
export const i18n: Record<I18nKey, string> = {} as Record<I18nKey, string>;

/** 从宿主页面读取语言并初始化 */
export function initI18n(): void {
  const declared = window.frameElement?.closest("html")?.getAttribute("lang");
  const locale = declared !== null && declared !== undefined && declared in MESSAGES ? (declared as Locale) : "en";
  const source = MESSAGES[locale];
  for (const key of Object.keys(source) as I18nKey[]) {
    i18n[key] = source[key];
  }
  document.documentElement.lang = locale;
}
