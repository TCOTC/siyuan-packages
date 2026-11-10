/**
 * 令牌遮蔽的类名必须与 `index.scss` 里的选择器一致
 *
 * CSS 不能 import TS，类名写错会让令牌以明文显示，属于看不见的泄漏；行为本身
 * （探测与切换）由共享库 `siyuan-token-field` 的单测覆盖，这里只钉住本包的样式
 */

import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { TOKEN_FIELD_CLASS, TOKEN_REVEAL_CLASS } from "siyuan-token-field";

test("类名与 index.scss 里的选择器保持同步", async () => {
  const scss = await readFile(new URL("../index.scss", import.meta.url), "utf8");
  // 基础类要写成独立选择器：只查子串的话，会被「修饰类含同名前缀」蒙混过去
  assert.ok(new RegExp(`\\.${TOKEN_FIELD_CLASS}\\s*\\{`).test(scss), `index.scss 缺少 .${TOKEN_FIELD_CLASS} 基础选择器`);
  assert.ok(scss.includes(`.${TOKEN_REVEAL_CLASS}`), `index.scss 缺少 .${TOKEN_REVEAL_CLASS} 选择器`);
});
