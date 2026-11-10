import type { WeekStart } from "./types";
import en from "./i18n/en.json";
import ja from "./i18n/ja.json";
import zhCN from "./i18n/zh-CN.json";
import zhTW from "./i18n/zh-TW.json";

/**
 * 界面文案的形状。
 *
 * 数据在 `src/i18n/*.json`：构建时整份复制进产物的 `i18n/`，**由内核挑一份注入**
 * `Plugin.i18n`（siyuan 仓库 `kernel/model/plugin.go` 的 loadPlugin，回退顺序
 * Conf.Lang → en → zh-CN）。所以插件里直接读 `this.i18n` 就够了，不要再自己判断语言——
 * 那既与内核重复，又可能在两边选出不同的文件。
 *
 * 类型以 `en.json` 为参照：少一个键、值不是字符串都会在 tsc 阶段报出来。
 */
export type I18n = typeof en;

/** 键集合完全相同才算通过（多一个键也算不一致）。 */
type SameKeys<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type AssertTrue<Value extends true> = Value;

/** 另三份译文与 en.json 的键集合必须逐一相同；不一致时 tsc 会在这一行报错。 */
export type LocaleKeyCheck = [AssertTrue<SameKeys<keyof I18n, keyof typeof zhCN>>, AssertTrue<SameKeys<keyof I18n, keyof typeof zhTW>>, AssertTrue<SameKeys<keyof I18n, keyof typeof ja>>];

/** 思源界面语言代码；只用于与文案无关的默认值（见下），取文案请用 `this.i18n`。 */
function getSiYuanLang(): string {
  const lang = window.siyuan?.config?.lang;
  return typeof lang === "string" && "" !== lang ? lang : "en";
}

/** 每周第一天默认值：仅简体中文为周一，其余为周日 */
export function getDefaultWeekStart(): WeekStart {
  return "zh-CN" === getSiYuanLang() ? "monday" : "sunday";
}
