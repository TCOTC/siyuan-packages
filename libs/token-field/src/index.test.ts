/**
 * 令牌遮蔽策略的单元测试
 *
 * 这里决定的是「令牌会不会以明文出现」与「移动端能不能粘贴」，两条都是看不见的回归
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { createTokenMask, TOKEN_FIELD_CLASS, TOKEN_REVEAL_CLASS, supportsTextSecurity } from "./index.ts";

/** `CSS` 替身：只回应指定结果，同时记录被问到的属性与取值；`result` 为 Error 时模拟抛错 */
function fakeCss(result: unknown) {
  const asked: [string, string][] = [];
  return {
    asked,
    supports(property: string, value: string): boolean {
      asked.push([property, value]);
      if (result instanceof Error) {
        throw result;
      }
      // 故意放宽：用例里也会传 undefined / "true" / 1 这类非 bool 值
      return result as boolean;
    },
  };
}

/** `input` 替身：只需要 `type` 与 `classList.toggle` */
function fakeInput() {
  const toggled: [string, boolean | undefined][] = [];
  return {
    toggled,
    type: "text",
    classList: {
      toggle(name: string, force?: boolean): boolean {
        toggled.push([name, force]);
        return true;
      },
    },
  };
}

test("缺少 CSS 对象或 supports 时按不支持处理", () => {
  assert.equal(supportsTextSecurity(undefined), false);
  assert.equal(supportsTextSecurity(null), false);
  assert.equal(supportsTextSecurity({}), false);
  // 运行时形态不合法（supports 不是函数）也要温柔处理
  assert.equal(supportsTextSecurity({ supports: "not a function" } as unknown as { supports: (property: string, value: string) => boolean }), false);
});

test("按 -webkit-text-security: disc 探测支持情况", () => {
  const supported = fakeCss(true);
  assert.equal(supportsTextSecurity(supported), true);
  assert.deepEqual(supported.asked, [["-webkit-text-security", "disc"]]);

  const unsupported = fakeCss(false);
  assert.equal(supportsTextSecurity(unsupported), false);
  assert.deepEqual(unsupported.asked, [["-webkit-text-security", "disc"]]);
});

test("supports 抛错时按不支持处理", () => {
  // 个别实现对不规范的属性名会直接抛错，不能让它冒泡到设置面板的构造过程
  assert.equal(supportsTextSecurity(fakeCss(new Error("Invalid property"))), false);
});

test("只认严格 true，其余返回值按不支持处理", () => {
  assert.equal(supportsTextSecurity(fakeCss(undefined)), false);
  assert.equal(supportsTextSecurity(fakeCss("true")), false);
  assert.equal(supportsTextSecurity(fakeCss(1)), false);
});

test("支持 CSS 遮蔽时：type 是 text，切换只加修饰类", () => {
  const mask = createTokenMask(fakeCss(true));
  assert.equal(mask.cssMask, true);
  assert.equal(mask.type, "text");
  assert.equal(mask.className("b3-text-field"), `b3-text-field ${TOKEN_FIELD_CLASS}`);

  const input = fakeInput();
  mask.toggle(input as unknown as HTMLInputElement);
  assert.deepEqual(input.toggled, [[TOKEN_REVEAL_CLASS, undefined]]);
  // 不碰 type：动过 password 的输入框会被 Chromium 记成「曾经是密码框」
  assert.equal(input.type, "text");
});

test("不支持 CSS 遮蔽时：退回密码框互切", () => {
  const mask = createTokenMask(fakeCss(false));
  assert.equal(mask.cssMask, false);
  assert.equal(mask.type, "password");
  assert.equal(mask.className("b3-text-field"), "b3-text-field");

  const input = fakeInput();
  input.type = "password";
  mask.toggle(input as unknown as HTMLInputElement);
  assert.equal(input.type, "text");
  assert.deepEqual(input.toggled, []);
  mask.toggle(input as unknown as HTMLInputElement);
  assert.equal(input.type, "password");
});
