/**
 * i18n 类型断言
 *
 * 用法（只在校验位置引用，产物里不会留下任何东西）：
 *
 * ```ts
 * import type { SameKeys, AssertTrue } from "siyuan-i18n-types";
 *
 * export type LocaleKeyCheck = [AssertTrue<SameKeys<keyof typeof en, keyof typeof zhCN>>];
 * ```
 *
 * 键集合不一致时 tsc 会在那一行报错，而不是让漏译的键在运行期静默变成 undefined。
 */

/** 两边键集合完全相同才算通过（多一个键也算不一致） */
export type SameKeys<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

/** 结构相等判定（用于连值的类型一起比较，而不只是键名） */
export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** 断言位置：`T` 必须是字面量 `true`，否则这一行报错 */
export type AssertTrue<Value extends true> = Value;
