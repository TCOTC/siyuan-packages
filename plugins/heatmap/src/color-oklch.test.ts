import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import { HEAT_L_DELTA, clampHeatOklch, heatHexFromHue, hexToOklch, oklchToHex, projectHeatHex } from "./color-oklch";

describe("oklch hex roundtrip", () => {
  it("常见色往返后仍接近原色相与明度", () => {
    for (const hex of ["#40c463", "#3575f0", "#ff6600", "#808080"]) {
      const oklch = hexToOklch(hex);
      assert.ok(oklch);
      const back = hexToOklch(oklchToHex(oklch));
      assert.ok(back);
      assert.ok(Math.abs(back.l - oklch.l) < 0.02);
      if (oklch.c > 0.02) {
        const dh = Math.min(Math.abs(back.h - oklch.h), 360 - Math.abs(back.h - oklch.h));
        assert.ok(dh < 3);
      }
    }
  });

  it("非法 hex 返回 null", () => {
    assert.equal(hexToOklch("nope"), null);
    assert.equal(projectHeatHex("nope", 0.2, 0.95), null);
  });
});

describe("clampHeatOklch", () => {
  it("贴近深色字时抬高 L", () => {
    const textL = 0.2;
    const clamped = clampHeatOklch({ l: 0.05, c: 0.15, h: 140 }, textL, 0.95);
    assert.ok(Math.abs(clamped.l - textL) >= HEAT_L_DELTA - 1e-9);
    assert.ok(clamped.l > textL);
    assert.ok(clamped.c <= 0.2);
  });

  it("贴近浅色字时压低 L", () => {
    const textL = 0.92;
    const clamped = clampHeatOklch({ l: 0.98, c: 0.12, h: 250 }, textL, 0.2);
    assert.ok(Math.abs(clamped.l - textL) >= HEAT_L_DELTA - 1e-9);
    assert.ok(clamped.l < textL);
  });

  it("已足够远离字色时保留 L", () => {
    const clamped = clampHeatOklch({ l: 0.62, c: 0.1, h: 30 }, 0.2, 0.95);
    assert.ok(Math.abs(clamped.l - 0.62) < 1e-9);
  });
});

describe("heatHexFromHue / projectHeatHex", () => {
  it("黑色投影后不再贴近深色字", () => {
    const textL = 0.2;
    const projected = projectHeatHex("#000000", textL, 0.98);
    assert.ok(projected);
    const oklch = hexToOklch(projected);
    assert.ok(oklch);
    assert.ok(Math.abs(oklch.l - textL) >= HEAT_L_DELTA - 0.02);
  });

  it("同主题下换色相仍输出合法 hex，且 L 稳定在安全区", () => {
    const theme = hexToOklch("#3575f0");
    assert.ok(theme);
    const a = heatHexFromHue(0, theme, 0.2, 0.95);
    const b = heatHexFromHue(180, theme, 0.2, 0.95);
    assert.match(a, /^#[0-9a-f]{6}$/);
    assert.match(b, /^#[0-9a-f]{6}$/);
    const oa = hexToOklch(a);
    const ob = hexToOklch(b);
    assert.ok(oa && ob);
    assert.ok(Math.abs(oa.l - ob.l) < 0.03);
    assert.ok(Math.abs(oa.l - 0.2) >= HEAT_L_DELTA - 0.02);
  });

  it("主题主色过深/过浅时会按当前字色重算明度", () => {
    const deepTheme = { l: 0.1, c: 0.12, h: 140 };
    const paleTheme = { l: 0.95, c: 0.12, h: 140 };
    const lifted = hexToOklch(heatHexFromHue(140, deepTheme, 0.2, 0.95));
    const lowered = hexToOklch(heatHexFromHue(140, paleTheme, 0.92, 0.2));
    assert.ok(lifted && lowered);
    assert.ok(lifted.l >= 0.2 + HEAT_L_DELTA - 0.02);
    assert.ok(lowered.l <= 0.92 - HEAT_L_DELTA + 0.02);
  });
});
