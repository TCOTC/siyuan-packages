/**
 * 顶栏菜单定位的单元测试
 *
 * 这些数字决定菜单弹在哪里：方向按锚点中心判断、贴边要让出停靠栏标签栏。判错的后果是菜单盖住按钮
 * 或跑到窗口外，而且只在特定拖拽位置 / 停靠栏状态下出现，很难靠肉眼回归，因此逐个钉住。
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { buttonAlignedPosition, dockFlushedPosition, fallbackPosition, isLeftHalf } from "./position.ts";

/** 顶栏按钮：默认 24×24、底边 26（顶栏高度 28 + 1px 间隙前的位置） */
const anchorAt = (left: number, width = 24, bottom = 26, height = 24) => ({ left, right: left + width, top: bottom - height, bottom, width, height }) as DOMRect;

const VIEWPORT = 1046;

test("锚点中心在窗口左半边才向右展开", () => {
  assert.equal(isLeftHalf(anchorAt(120), VIEWPORT), true);
  assert.equal(isLeftHalf(anchorAt(900), VIEWPORT), false);
  // 中心正好落在中点时算右半边，与宿主 setPosition 的取整方向一致
  assert.equal(isLeftHalf(anchorAt(VIEWPORT / 2 - 12), VIEWPORT), false);
});

test("贴按钮：右半边的按钮对齐右边缘", () => {
  assert.deepEqual(buttonAlignedPosition(anchorAt(900), VIEWPORT), {
    x: 924,
    y: 26,
    isLeft: true,
    h: 24,
  });
});

test("贴按钮：左半边的按钮对齐左边缘", () => {
  assert.deepEqual(buttonAlignedPosition(anchorAt(120), VIEWPORT), {
    x: 120,
    y: 26,
    isLeft: false,
    h: 24,
  });
});

test("贴停靠栏：右侧栏展开时让出它的标签栏宽度", () => {
  assert.deepEqual(dockFlushedPosition(anchorAt(900), VIEWPORT, { left: 0, right: 60 }), {
    x: VIEWPORT - 61,
    y: 27,
    isLeft: true,
  });
});

test("贴停靠栏：左侧栏展开时让出它的标签栏宽度", () => {
  assert.deepEqual(dockFlushedPosition(anchorAt(120), VIEWPORT, { left: 40, right: 0 }), {
    x: 41,
    y: 27,
    isLeft: false,
  });
});

test("贴停靠栏：同侧停靠栏收起时贴窗口边缘", () => {
  assert.deepEqual(dockFlushedPosition(anchorAt(900), VIEWPORT, { left: 0, right: 0 }), {
    x: VIEWPORT - 1,
    y: 27,
    isLeft: true,
  });
  assert.deepEqual(dockFlushedPosition(anchorAt(120), VIEWPORT, { left: 0, right: 0 }), {
    x: 1,
    y: 27,
    isLeft: false,
  });
});

test("没有锚点时兜底到窗口右上角", () => {
  assert.deepEqual(fallbackPosition(VIEWPORT), { x: VIEWPORT, y: 0, isLeft: true });
});
