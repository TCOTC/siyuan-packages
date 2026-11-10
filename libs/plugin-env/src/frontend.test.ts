/**
 * 前端分类判定的单元测试
 *
 * 面板宿主的选择完全依赖这个判定：移动端没有自定义页签，必须走对话框。
 * 判错会让插件在移动端点了没反应（或反之，在桌面端弹出一个多余的对话框），
 * 因此把宿主声明的五个前端取值逐个钉住
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { isDesktopClientFrontendOf, isMobileFrontendOf } from "./frontend.ts";

test("移动端前端", () => {
  assert.equal(isMobileFrontendOf("mobile"), true);
  assert.equal(isMobileFrontendOf("browser-mobile"), true);
});

test("桌面端前端不是移动端", () => {
  assert.equal(isMobileFrontendOf("desktop"), false);
  assert.equal(isMobileFrontendOf("desktop-window"), false);
  assert.equal(isMobileFrontendOf("browser-desktop"), false);
});

test("未知取值按非移动端处理", () => {
  assert.equal(isMobileFrontendOf(""), false);
  assert.equal(isMobileFrontendOf("tablet"), false);
});

test("桌面客户端不含浏览器桌面版", () => {
  assert.equal(isDesktopClientFrontendOf("desktop"), true);
  assert.equal(isDesktopClientFrontendOf("desktop-window"), true);
  assert.equal(isDesktopClientFrontendOf("browser-desktop"), false);
  assert.equal(isDesktopClientFrontendOf("mobile"), false);
  assert.equal(isDesktopClientFrontendOf("browser-mobile"), false);
});
