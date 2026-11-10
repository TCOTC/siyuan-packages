/**
 * 版本比较的单元测试
 *
 * 严格口径（`compareSemver`）决定「已安装版本是否为最新」与「能否自我安装」两个结论，
 * 写错会把有新版本说成已是最新（或反之），因此把语义化版本 2.0.0 的解析与比较边界固定下来。
 *
 * 区间口径（`isVersionInRange`）决定主题能不能启用。这里要把两件事钉住：
 *   1. 预发布按**核心数字**归类（`3.0.0-beta.1` 属于 3.0.0 这一代）；
 *   2. 因此 `3.1.0-beta.1` 在 `max = 3.1.0` 时属于区间外——与严格语义化版本的结论相反，
 *      但那是刻意的：`max` 意味着「这一代没验证过」，未验证的预发布不应放行。
 */

import * as assert from "node:assert/strict";
import { test } from "vitest";
import { compareCoreVersions, compareSemver, isVersionAtLeast, isVersionInRange, type VersionRange } from "./index.ts";

test("归一化 v 前缀", () => {
  assert.equal(compareSemver("v0.4.6", "0.4.6"), 0);
  assert.equal(compareSemver("V1.2.3", "1.2.3"), 0);
});

test("核心三段缺一不可", () => {
  // 语义化版本要求 主.次.修订 齐全，`1` 与 `1.2` 都不合法
  assert.equal(compareSemver("1", "1.0.0"), null);
  assert.equal(compareSemver("1.2", "1.2.0"), null);
  assert.equal(compareSemver("v1.2", "1.2.0"), null);
});

test("数字标识符不允许前导零", () => {
  assert.equal(compareSemver("01.0.0", "1.0.0"), null);
  assert.equal(compareSemver("1.00.0", "1.0.0"), null);
  assert.equal(compareSemver("1.0.0-01", "1.0.0-1"), null);
});

test("比较三段数字版本", () => {
  assert.equal(compareSemver("0.5.0", "0.4.6"), 1);
  assert.equal(compareSemver("0.4.6", "0.5.0"), -1);
  assert.equal(compareSemver("1.0.0", "0.99.99"), 1);
});

test("预发布版本低于同号正式版", () => {
  assert.equal(compareSemver("1.0.0-beta", "1.0.0"), -1);
  assert.equal(compareSemver("1.0.0", "1.0.0-beta"), 1);
  assert.equal(compareSemver("1.0.0-beta.1", "1.0.0-beta"), 1);
  // 数字标识符低于字母标识符
  assert.equal(compareSemver("1.0.0-1", "1.0.0-alpha"), -1);
});

test("构建元数据不参与比较", () => {
  assert.equal(compareSemver("1.0.0+build.1", "1.0.0+build.2"), 0);
});

test("无法解析的版本返回 null", () => {
  assert.equal(compareSemver("latest", "1.0.0"), null);
  assert.equal(compareSemver("1.0.0", ""), null);
  assert.equal(compareSemver("1.0.0.1", "1.0.0"), null);
});

test("按语义化版本规范接受与拒绝的形态", () => {
  // 规范里的合法示例：预发布标识符可含点分数字、连字符，构建元数据不参与比较
  assert.equal(compareSemver("1.0.0-0.3.7", "1.0.0-0.3.7"), 0);
  assert.equal(compareSemver("1.0.0-x.7.z.92", "1.0.0-x.7.z.92"), 0);
  assert.equal(compareSemver("1.0.0-x-y-z.--", "1.0.0-x-y-z.--"), 0);
  assert.equal(compareSemver("1.0.0-alpha+001", "1.0.0-alpha"), 0);
  for (const invalid of ["1", "1.2", "alpha", "1.2.3.DEV", "1.2-SNAPSHOT", "1.0.0-", "1.1.2+.123", "+justmeta"]) {
    assert.equal(compareSemver(invalid, "1.0.0"), null, `${invalid} 应按非法版本处理`);
  }
});

test("isVersionAtLeast：达到最低版本才算通过", () => {
  assert.equal(isVersionAtLeast("1.0.0", "1.0.0"), true);
  assert.equal(isVersionAtLeast("v1.0.1", "1.0.0"), true);
  assert.equal(isVersionAtLeast("0.9.9", "1.0.0"), false);
  // 预发布版本低于同号正式版
  assert.equal(isVersionAtLeast("1.0.0-beta", "1.0.0"), false);
  // 不合语义化版本、或解析不出来的版本一律不通过
  assert.equal(isVersionAtLeast("1.0", "1.0.0"), false);
  assert.equal(isVersionAtLeast("nightly", "1.0.0"), false);
});

test("核心数字比较：缺段当 0", () => {
  assert.equal(compareCoreVersions("1.2", "1.2.0"), 0);
  assert.equal(compareCoreVersions("1.2.3", "1.2"), 1);
  assert.equal(compareCoreVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareCoreVersions("10.0.0", "2.0.0"), 1);
  // 集市里真实存在两段版本（noctalia-siyuan@1.2、zhang-light@0.90），必须给出结论而不是 null
  assert.equal(compareCoreVersions("0.90", "0.89"), 1);
});

test("核心数字比较：预发布与构建后缀整体丢弃", () => {
  // 含点与不含点必须同口径；此前 `3.0.0-beta.1` 会被切成 4 段判成「大于 3.0.0」
  assert.equal(compareCoreVersions("3.0.0-beta", "3.0.0"), 0);
  assert.equal(compareCoreVersions("3.0.0-beta.1", "3.0.0"), 0);
  assert.equal(compareCoreVersions("3.0.0-rc.2", "3.0.0"), 0);
  assert.equal(compareCoreVersions("3.0.0+build.5", "3.0.0"), 0);
  assert.equal(compareCoreVersions("3.0.1-beta.1", "3.0.1"), 0);
  // 核心段不同时后缀不影响结论
  assert.equal(compareCoreVersions("3.0.1-beta.1", "3.0.0"), 1);
  assert.equal(compareCoreVersions("3.0.0-beta.1", "3.0.1"), -1);
});

test("区间：左闭右开", () => {
  const theme: VersionRange = { min: "3.0.0", max: "3.1.0" };
  assert.equal(isVersionInRange("3.0.0", theme), true);
  assert.equal(isVersionInRange("3.0.7", theme), true);
  assert.equal(isVersionInRange("3.0.9", theme), true);
  assert.equal(isVersionInRange("3.1.0", theme), false);
  assert.equal(isVersionInRange("2.9.9", theme), false);
  assert.equal(isVersionInRange("3.2.0", theme), false);
});

test("区间：预发布按核心数字归类（刻意，与严格 semver 相反）", () => {
  const theme: VersionRange = { min: "3.0.0", max: "3.1.0" };

  // 下界这一代：预发布同属 3.0.x，放行（作者声明支持 3.0.x）
  assert.equal(isVersionInRange("3.0.0-beta.1", theme), true);
  assert.equal(isVersionInRange("3.0.5-rc.1", theme), true);

  // 上界这一代：预发布归入 3.1.0，仍属区间外 —— `max` 意味着「3.1 这一代没验证过」
  assert.equal(isVersionInRange("3.1.0-beta.1", theme), false);
  assert.equal(isVersionInRange("3.1.0-rc.1", theme), false);

  // 对照组：严格语义化版本恰好会把 3.1.0-beta.1 判成兼容（低于 3.1.0），这正是本函数不用它的理由
  assert.equal(compareSemver("3.1.0-beta.1", "3.1.0"), -1);
  assert.equal(compareSemver("3.1.0-beta.1", "3.0.0")! >= 0, true);
});

test("区间：边界常量自己带预发布时不会翻车", () => {
  // MIN 带预发布时，同号正式版不得被判成低于最小值
  assert.equal(isVersionInRange("3.1.0", { min: "3.1.0-beta.1", max: "3.2.0" }), true);
  assert.equal(isVersionInRange("3.1.0-rc.2", { min: "3.1.0-beta.1", max: "3.2.0" }), true);
  // 上界带预发布时，同号正式版仍属区间外
  assert.equal(isVersionInRange("3.1.0", { min: "3.0.0", max: "3.1.0-beta.1" }), false);
});
