/**
 * 内核运行容器判定的单元测试
 *
 * 鸿蒙端是「桌面布局 + 没有 Electron」的例外：只按前端分类判定会让调用方在它上面
 * 调用不存在的 `window.require` / `openPath`，所以把取值逐个钉住
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { isHarmonyBackendOf } from "./backend.ts";

test("鸿蒙端", () => {
  assert.equal(isHarmonyBackendOf("harmony"), true);
});

test("其他容器都不是鸿蒙端", () => {
  assert.equal(isHarmonyBackendOf("std"), false);
  assert.equal(isHarmonyBackendOf("docker"), false);
  assert.equal(isHarmonyBackendOf("android"), false);
  assert.equal(isHarmonyBackendOf("ios"), false);
});

test("内核尚未写入 container 时按非鸿蒙端处理", () => {
  assert.equal(isHarmonyBackendOf(""), false);
  assert.equal(isHarmonyBackendOf(undefined), false);
  assert.equal(isHarmonyBackendOf("Harmony"), false);
});
