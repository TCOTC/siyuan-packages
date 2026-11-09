import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import { alignToWeekStart, formatDateKey, formatDisplayDate, getWeekOffset, isSparseWeekday, orderWeekdays, pad2 } from "./date";

describe("pad2", () => {
  it("个位数左侧补零，两位数保持原样", () => {
    assert.equal(pad2(0), "00");
    assert.equal(pad2(9), "09");
    assert.equal(pad2(10), "10");
    assert.equal(pad2(31), "31");
  });
});

describe("formatDateKey", () => {
  it("输出本地日历的 YYYYMMDD，与时区无关的日历字段一致", () => {
    assert.equal(formatDateKey(new Date(2024, 0, 1)), "20240101");
    assert.equal(formatDateKey(new Date(2024, 11, 31)), "20241231");
    assert.equal(formatDateKey(new Date(2023, 8, 5)), "20230905");
  });
});

describe("formatDisplayDate", () => {
  it("合法 8 位日期键格式化为 YYYY-MM-DD", () => {
    assert.equal(formatDisplayDate("20240315"), "2024-03-15");
    assert.equal(formatDisplayDate("19991231"), "1999-12-31");
  });

  it("非法或空输入原样返回，避免误导展示", () => {
    assert.equal(formatDisplayDate(""), "");
    assert.equal(formatDisplayDate("2024-03-15"), "2024-03-15");
    assert.equal(formatDisplayDate("2024031"), "2024031");
    assert.equal(formatDisplayDate("202403151"), "202403151");
  });
});

describe("getWeekOffset / alignToWeekStart", () => {
  it("周日制：周日偏移为 0，周六为 6", () => {
    // 2024-03-10 周日，2024-03-16 周六
    assert.equal(getWeekOffset(new Date(2024, 2, 10), "sunday"), 0);
    assert.equal(getWeekOffset(new Date(2024, 2, 11), "sunday"), 1);
    assert.equal(getWeekOffset(new Date(2024, 2, 16), "sunday"), 6);
  });

  it("周一制：周一偏移为 0，周日为 6", () => {
    // 2024-03-11 周一，2024-03-10 周日
    assert.equal(getWeekOffset(new Date(2024, 2, 11), "monday"), 0);
    assert.equal(getWeekOffset(new Date(2024, 2, 10), "monday"), 6);
    assert.equal(getWeekOffset(new Date(2024, 2, 12), "monday"), 1);
  });

  it("对齐到周起始会回退到该周第一天", () => {
    const mondayStart = new Date(2024, 2, 13); // 周三
    alignToWeekStart(mondayStart, "monday");
    assert.equal(formatDateKey(mondayStart), "20240311");

    const sundayStart = new Date(2024, 2, 13); // 周三
    alignToWeekStart(sundayStart, "sunday");
    assert.equal(formatDateKey(sundayStart), "20240310");
  });
});

describe("orderWeekdays", () => {
  const sunFirst = ["日", "一", "二", "三", "四", "五", "六"];

  it("周日制保持原顺序", () => {
    assert.deepEqual(orderWeekdays(sunFirst, "sunday"), sunFirst);
  });

  it("周一制把周日挪到末尾", () => {
    assert.deepEqual(orderWeekdays(sunFirst, "monday"), ["一", "二", "三", "四", "五", "六", "日"]);
  });

  it("不修改入参数组", () => {
    const input = [...sunFirst];
    orderWeekdays(input, "monday");
    assert.deepEqual(input, sunFirst);
  });
});

describe("isSparseWeekday", () => {
  it("稀疏标签只覆盖周一、周三、周五", () => {
    // 周日制列下标：0 日 1 一 2 二 3 三 4 四 5 五 6 六
    const sundaySparse = [0, 1, 2, 3, 4, 5, 6].map((i) => isSparseWeekday(i, "sunday"));
    assert.deepEqual(sundaySparse, [false, true, false, true, false, true, false]);

    // 周一制列下标：0 一 1 二 2 三 3 四 4 五 5 六 6 日
    const mondaySparse = [0, 1, 2, 3, 4, 5, 6].map((i) => isSparseWeekday(i, "monday"));
    assert.deepEqual(mondaySparse, [true, false, true, false, true, false, false]);
  });
});
