/**
 * `html-safety` 的单元测试
 *
 * 外部来源的文案与地址都会经过这两个函数进入页面，
 * 因此把「哪些字符被转义」「哪些地址被放行」固定下来
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { escapeHtml, safeExternalUrl } from "./index.ts";

test("escapeHtml 转义会破坏 HTML 结构的字符", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  // 单引号也转义：同一个结果要能放进单引号与双引号的属性值
  assert.equal(escapeHtml("it's"), "it&#39;s");
});

test("escapeHtml 五个字符逐一转义", () => {
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml(">"), "&gt;");
  assert.equal(escapeHtml('"'), "&quot;");
  assert.equal(escapeHtml("'"), "&#39;");
});

test("escapeHtml 无特殊字符时原样返回", () => {
  // 提前返回分支：本仓 i18n 语料 96.9% 走这条路，行为必须与「转义后相同」完全一致
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml("普通文案 body {} 与 100% 的 1/2"), "普通文案 body {} 与 100% 的 1/2");
  assert.equal(escapeHtml("assets/image-20230101120000-abc1234.webp"), "assets/image-20230101120000-abc1234.webp");
});

test("escapeHtml 重复调用结果稳定（模块级正则可安全复用）", () => {
  // ESCAPE_PATTERN 带 g 标志且在模块级复用；replace 会自行重置 lastIndex。
  // 若哪天改成直接调 re.exec 或 re.test 复用同一对象，这条会立刻红。
  const dirty = "a & b < c > d \" e ' f";
  const first = escapeHtml(dirty);
  for (let i = 0; i < 5; i++) {
    assert.equal(escapeHtml(dirty), first);
    // 干净串插在中间，确认它不会污染后续调用的 lastIndex
    assert.equal(escapeHtml("none"), "none");
    assert.equal(escapeHtml(dirty), first);
  }
});

test("escapeHtml 长文本（超过提案的 512 阈值）同样逐字符转义", () => {
  // 本仓真实语料最长 401 字，这里取更长的串守住「不按长度分流」这条实现约束
  const long = "x".repeat(2000) + "&<>\"'";
  const out = escapeHtml(long);
  assert.equal(out, "x".repeat(2000) + "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(out.length, 2000 + "&amp;".length + "&lt;".length + "&gt;".length + "&quot;".length + "&#39;".length);
});

test("safeExternalUrl 只放行 http / https", () => {
  assert.equal(safeExternalUrl("https://github.com/TCOTC/install-package"), "https://github.com/TCOTC/install-package");
  assert.equal(safeExternalUrl("http://example.com/"), "http://example.com/");
  // 大小写与默认端口由 URL 归一化
  assert.equal(safeExternalUrl("HTTPS://GitHub.com:443/a"), "https://github.com/a");
});

test("safeExternalUrl 拒绝其它协议与不完整地址", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), "");
  assert.equal(safeExternalUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeExternalUrl("file:///C:/Windows"), "");
  // 无协议的短写不补全，避免把用户输入当成可信地址
  assert.equal(safeExternalUrl("github.com/a/b"), "");
  assert.equal(safeExternalUrl("  "), "");
});
