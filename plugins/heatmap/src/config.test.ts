import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildDisplayRangeOptions, buildYearOptions, displayRangeOptionToPatch, expandYearRange, getDisplayRangeIndex, getDisplayRangeLabel, isDisplayMode, isLevelMode, isStatMode, isViewMode, isWeekStart, isYearOrder, normalizeFromYear, normalizeHeatColor, normalizeIncludedBoxIds, normalizeLevelCuts } from "./config";

describe("expandYearRange", () => {
  it("展开闭区间年份，含端点", () => {
    assert.deepEqual(expandYearRange(2022, 2024), [2022, 2023, 2024]);
    assert.deepEqual(expandYearRange(2024, 2024), [2024]);
  });

  it("起止颠倒时仍按升序展开", () => {
    assert.deepEqual(expandYearRange(2024, 2022), [2022, 2023, 2024]);
  });
});

describe("buildYearOptions", () => {
  const now = new Date(2026, 6, 31);

  it("至少包含今年，且按从新到旧排列", () => {
    assert.deepEqual(buildYearOptions(null, null, now), [2026]);
  });

  it("从库内最早年延伸到今年", () => {
    assert.deepEqual(buildYearOptions(2024, null, now), [2026, 2025, 2024]);
  });

  it("已选 fromYear 早于库内最早年时仍纳入选项", () => {
    assert.deepEqual(buildYearOptions(2025, 2023, now), [2026, 2025, 2024, 2023]);
  });

  it("未来已选年不会抬高上界，上界仍是今年", () => {
    assert.deepEqual(buildYearOptions(null, 2030, now), [2026]);
  });
});

describe("display range 标题切换", () => {
  const now = new Date(2026, 6, 31);
  const options = buildDisplayRangeOptions([2026, 2025, 2024]);

  it("序列以最近一年开头，后接从新到旧的起始年", () => {
    assert.deepEqual(options, [{ kind: "recent" }, { kind: "years", fromYear: 2026 }, { kind: "years", fromYear: 2025 }, { kind: "years", fromYear: 2024 }]);
  });

  it("定位当前项下标", () => {
    assert.equal(getDisplayRangeIndex({ displayMode: "recent", fromYear: null }, options), 0);
    assert.equal(getDisplayRangeIndex({ displayMode: "years", fromYear: 2026 }, options), 1);
    assert.equal(getDisplayRangeIndex({ displayMode: "years", fromYear: 2025 }, options), 2);
    assert.equal(getDisplayRangeIndex({ displayMode: "years", fromYear: 1999 }, options), 0);
  });

  it("标题文案：最近一年 / 单年 / 跨年区间", () => {
    assert.equal(getDisplayRangeLabel({ displayMode: "recent", fromYear: null }, "最近一年", now), "最近一年");
    assert.equal(getDisplayRangeLabel({ displayMode: "years", fromYear: 2026 }, "最近一年", now), "2026");
    assert.equal(getDisplayRangeLabel({ displayMode: "years", fromYear: 2025 }, "最近一年", now), "2025-2026");
    assert.equal(getDisplayRangeLabel({ displayMode: "years", fromYear: 2024 }, "最近一年", now), "2024-2026");
  });

  it("切换项转为配置补丁", () => {
    assert.deepEqual(displayRangeOptionToPatch({ kind: "recent" }), {
      displayMode: "recent",
      fromYear: null,
    });
    assert.deepEqual(displayRangeOptionToPatch({ kind: "years", fromYear: 2025 }), {
      displayMode: "years",
      fromYear: 2025,
    });
  });
});

describe("配置值校验", () => {
  it("识别合法统计方式", () => {
    assert.equal(isStatMode("created"), true);
    assert.equal(isStatMode("updated"), true);
    assert.equal(isStatMode("mixed"), true);
    assert.equal(isStatMode("create"), false);
    assert.equal(isStatMode(""), false);
    assert.equal(isStatMode(null), false);
  });

  it("识别合法周起始", () => {
    assert.equal(isWeekStart("monday"), true);
    assert.equal(isWeekStart("sunday"), true);
    assert.equal(isWeekStart("Saturday"), false);
  });

  it("识别合法年份排序与显示范围、展示形式", () => {
    assert.equal(isYearOrder("newestFirst"), true);
    assert.equal(isYearOrder("oldestFirst"), true);
    assert.equal(isYearOrder("asc"), false);

    assert.equal(isDisplayMode("recent"), true);
    assert.equal(isDisplayMode("years"), true);
    assert.equal(isDisplayMode("all"), false);

    assert.equal(isViewMode("heatmap"), true);
    assert.equal(isViewMode("calendar"), true);
    assert.equal(isViewMode("list"), false);

    assert.equal(isLevelMode("percentile"), true);
    assert.equal(isLevelMode("count"), true);
    assert.equal(isLevelMode("absolute"), false);
  });
});

describe("normalizeFromYear", () => {
  it("接受合理整数年份", () => {
    assert.equal(normalizeFromYear(2020), 2020);
    assert.equal(normalizeFromYear("1999"), 1999);
    assert.equal(normalizeFromYear(1970), 1970);
    assert.equal(normalizeFromYear(2100), 2100);
  });

  it("拒绝非整、越界与空值", () => {
    assert.equal(normalizeFromYear(2020.5), null);
    assert.equal(normalizeFromYear(1969), null);
    assert.equal(normalizeFromYear(2101), null);
    assert.equal(normalizeFromYear("abc"), null);
    assert.equal(normalizeFromYear(null), null);
    assert.equal(normalizeFromYear(undefined), null);
    assert.equal(normalizeFromYear(""), null);
  });
});

describe("normalizeIncludedBoxIds", () => {
  it("null / 缺省 / 非数组回退为不限制", () => {
    assert.equal(normalizeIncludedBoxIds(null), null);
    assert.equal(normalizeIncludedBoxIds(undefined), null);
    assert.equal(normalizeIncludedBoxIds("box"), null);
    assert.equal(normalizeIncludedBoxIds(1), null);
  });

  it("保留空数组（表示不统计任何笔记本）", () => {
    assert.deepEqual(normalizeIncludedBoxIds([]), []);
  });

  it("去重并丢弃非法项", () => {
    assert.deepEqual(normalizeIncludedBoxIds(["a", "  ", "b", "a", 1, null, " c "]), ["a", "b", "c"]);
  });
});

describe("normalizeHeatColor", () => {
  it("空值与非法回退为跟随主题", () => {
    assert.equal(normalizeHeatColor(null), null);
    assert.equal(normalizeHeatColor(undefined), null);
    assert.equal(normalizeHeatColor(""), null);
    assert.equal(normalizeHeatColor("   "), null);
    assert.equal(normalizeHeatColor(123), null);
    assert.equal(normalizeHeatColor("#gg0000"), null);
    assert.equal(normalizeHeatColor("#12345"), null);
    assert.equal(normalizeHeatColor("#1234567"), null);
  });

  it("接受 #RGB / #RRGGBB，可省略 #，统一小写六位", () => {
    assert.equal(normalizeHeatColor("#40C463"), "#40c463");
    assert.equal(normalizeHeatColor("40c463"), "#40c463");
    assert.equal(normalizeHeatColor("#abc"), "#aabbcc");
    assert.equal(normalizeHeatColor(" AbC "), "#aabbcc");
  });
});

describe("normalizeLevelCuts", () => {
  it("非法输入回退到对应模式默认值", () => {
    assert.deepEqual(normalizeLevelCuts("percentile", null), [25, 50, 75]);
    assert.deepEqual(normalizeLevelCuts("percentile", [1, 2]), [25, 50, 75]);
    assert.deepEqual(normalizeLevelCuts("count", "x"), [1, 10, 40]);
    assert.deepEqual(normalizeLevelCuts("count", [0, 5, 10]), [1, 10, 40]);
  });

  it("百分位钳到 1–100 并升序", () => {
    assert.deepEqual(normalizeLevelCuts("percentile", [75, 25, 50]), [25, 50, 75]);
    assert.deepEqual(normalizeLevelCuts("percentile", [0, 150, 40]), [1, 40, 100]);
    assert.deepEqual(normalizeLevelCuts("percentile", ["10", "20.4", "30"]), [10, 20, 30]);
  });

  it("块数取整并升序", () => {
    assert.deepEqual(normalizeLevelCuts("count", [10, 2, 5]), [2, 5, 10]);
    assert.deepEqual(normalizeLevelCuts("count", [2.6, 5.2, 10.9]), [3, 5, 11]);
  });
});
