/**
 * `install/packageSort.ts` 的单元测试
 *
 * 排序配置来自 `window.siyuan.storage`，改错只会让列表顺序看起来「有点怪」，很难被发现，
 * 因此把各取值、并列名次与缺失时间的兜底顺序都固定下来
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { sortPackagesByBazaarOrder } from "./package-sort.ts";
import type { SortablePackage } from "./package-sort.ts";

/** 排序只看这三个字段，名字仅用于断言 */
interface TestPackage extends SortablePackage {
  name: string;
}

/** 造一个可排序的包；只用到排序字段与名字（便于断言） */
function pkg(name: string, { installTime = 0, updateTime = 0, enabled = false }: Partial<TestPackage> = {}): TestPackage {
  return { name, installTime, updateTime, enabled };
}

const names = (list: readonly TestPackage[]): string[] => list.map((item) => item.name);
const order = (sortValue: string, list: TestPackage[], supportsEnabledSort = false): string[] => names(sortPackagesByBazaarOrder(sortValue, list, { supportsEnabledSort }));

test("0 与未知取值保持内核顺序（且返回原数组）", () => {
  const list = [pkg("a", { installTime: 300 }), pkg("b", { installTime: 100 })];
  assert.equal(sortPackagesByBazaarOrder("0", list, { supportsEnabledSort: false }), list);
  assert.equal(sortPackagesByBazaarOrder("9", list, { supportsEnabledSort: false }), list);
  assert.deepEqual(order("0", list), ["a", "b"]);
});

test("1/2 按安装时间降/升序", () => {
  const list = [pkg("a", { installTime: 200 }), pkg("b", { installTime: 300 }), pkg("c", { installTime: 100 })];
  assert.deepEqual(order("1", list), ["b", "a", "c"]);
  assert.deepEqual(order("2", list), ["c", "a", "b"]);
});

test("3/4 按更新时间降/升序", () => {
  const list = [pkg("a", { updateTime: 20 }), pkg("b", { updateTime: 30 }), pkg("c", { updateTime: 10 })];
  assert.deepEqual(order("3", list), ["b", "a", "c"]);
  assert.deepEqual(order("4", list), ["c", "a", "b"]);
});

test("时间相同的包保持原相对顺序", () => {
  const list = [pkg("a", { installTime: 100 }), pkg("b", { installTime: 100 }), pkg("c", { installTime: 100 })];
  assert.deepEqual(order("1", list), ["a", "b", "c"]);
  assert.deepEqual(order("2", list), ["a", "b", "c"]);
});

test("取不到时间的排在后面，且相互间保持原顺序", () => {
  const list = [pkg("a"), pkg("b", { installTime: 100 }), pkg("c"), pkg("d", { installTime: 50 })];
  assert.deepEqual(order("1", list), ["b", "d", "a", "c"]);
  assert.deepEqual(order("2", list), ["d", "b", "a", "c"]);
});

test("5/6 按启用状态优先，并列时保持原顺序", () => {
  const list = [pkg("a", { enabled: false }), pkg("b", { enabled: true }), pkg("c", { enabled: false }), pkg("d", { enabled: true })];
  assert.deepEqual(order("5", list, true), ["b", "d", "a", "c"]);
  assert.deepEqual(order("6", list, true), ["a", "c", "b", "d"]);
});

test("不支持启用排序的类型，5/6 按默认处理", () => {
  const list = [pkg("a", { enabled: false }), pkg("b", { enabled: true })];
  assert.deepEqual(order("5", list, false), ["a", "b"]);
  assert.deepEqual(order("6", list, false), ["a", "b"]);
});
